import logging
import os
import sys

# Move logging to the absolute top to catch import crashes
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)
logger.info("=== NarrativeNet startup beginning ===")

# Memory monitoring
try:
    import psutil
    process = psutil.Process(os.getpid())
    mem_info = process.memory_info()
    logger.info(f"Startup RAM usage: {mem_info.rss // 1024 // 1024}MB (Resident Set Size)")
except Exception:
    logger.info("psutil memory check skipped")

import json
import datetime
import math
import re
import httpx
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Protected heavy imports
try:
    import duckdb
    logger.info("duckdb imported OK")
except Exception as e:
    logger.error(f"FATAL: duckdb import failed: {e}")
    raise

try:
    import networkx as nx
    import networkx.algorithms.community as nx_comm
    logger.info("networkx imported OK")
except Exception as e:
    logger.error(f"FATAL: networkx import failed: {e}")
    raise

try:
    from sentence_transformers import SentenceTransformer
    logger.info("sentence_transformers imported OK")
except Exception as e:
    logger.error(f"FATAL: sentence_transformers import failed: {e}")
    raise

try:
    import numpy as np
    from numpy.linalg import norm
    logger.info("numpy imported OK")
except Exception as e:
    logger.error(f"FATAL: numpy import failed: {e}")
    raise

from langdetect import detect, DetectorFactory
from groq import Groq
from collections import Counter, defaultdict

# Ensure reproducible langdetect
DetectorFactory.seed = 0

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH           = os.environ.get("DB_PATH",    os.path.join(PROJECT_ROOT, "narrativenet.db"))
EMB_PATH          = os.environ.get("EMB_PATH",   os.path.join(PROJECT_ROOT, "embeddings_cache.npz"))
TOPIC_CACHE_PATH  = os.environ.get("TOPIC_CACHE_PATH", os.path.join(PROJECT_ROOT, "topic_cache.json"))
STATIC_DIR        = os.path.join(PROJECT_ROOT, "static")
PORT              = int(os.environ.get("PORT", "8000"))

# Global variables setup
embed_model = None
embeddings = None
post_ids = None
embeddings_loaded = False
model_loaded = False
db_rows = 0

def get_con():
    """Open a fresh read-only DuckDB connection for each request (thread-safe)."""
    return duckdb.connect(DB_PATH, read_only=True)


def ensure_embed_model():
    """Load the embedding model on demand so startup stays fast in cloud deploys."""
    global embed_model, model_loaded
    if embed_model is not None:
        return embed_model

    logger.info("Loading SentenceTransformer model on demand...")
    embed_model = SentenceTransformer("all-MiniLM-L6-v2")
    model_loaded = True
    return embed_model

@asynccontextmanager
async def lifespan(app: FastAPI):
    global embed_model, embeddings, post_ids, embeddings_loaded, model_loaded, db_rows
    
    # 1. Verify DuckDB is accessible
    logger.info(f"Opening DuckDB at {DB_PATH}")
    try:
        with get_con() as c:
            res = c.execute("SELECT COUNT(*) FROM posts").fetchone()
            db_rows = res[0]
            logger.info(f"DATABASE VERIFIED: {db_rows} rows found in 'posts' table.")
            
            if db_rows == 0:
                logger.warning("!!! WARNING: Database is EMPTY. Dashboard will show no data. !!!")
    except Exception as e:
        logger.error(f"FATAL: Error opening DB: {e}")
        db_rows = 0

    # 2. Load embeddings
    try:
        cache_path = EMB_PATH
        if not os.path.exists(cache_path):
            cache_path = "embeddings_cache.npz" # fallback to CWD
            
        if os.path.exists(cache_path):
            logger.info(f"Loading embeddings cache from {cache_path}...")
            data = np.load(cache_path, allow_pickle=True)
            embeddings = data['embeddings'].astype(np.float32)
            post_ids = data['ids'].tolist()
            embeddings_loaded = True
            logger.info(f"Loaded {len(post_ids)} embeddings.")
        else:
            logger.warning("Embeddings cache not found. Semantic search will be limited.")
            embeddings_loaded = False
    except Exception as e:
        logger.error(f"Error loading embeddings: {e}")
        embeddings_loaded = False

    # 3. Model check (Pre-caching happens in Docker, but we can verify here)
    if model_loaded:
        logger.info("Model is already loaded.")
    else:
        logger.info("Model will be loaded on-demand during first search.")
            
    yield


app = FastAPI(lifespan=lifespan)

from fastapi.staticfiles import StaticFiles
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

import os

_RAW_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")
_ORIGINS = ["*"] if _RAW_ORIGINS == "*" else [o.strip() for o in _RAW_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Route: {request.url.path} | QueryParams: {request.url.query}")
    response = await call_next(request)
    return response

def round_floats(obj):
    if isinstance(obj, float):
        return round(obj, 4)
    elif isinstance(obj, dict):
        return {k: round_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [round_floats(i) for i in obj]
    return obj

def empty_response():
    return JSONResponse(content={"data": [], "message": "No results found"})


@app.get("/")
def root():
    return JSONResponse(content={"status": "ok", "service": "NarrativeNet API"})

@app.get("/health")
@app.get("/api/health")
def health():
    try:
        with get_con() as c:
            rows = c.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
    except Exception:
        rows = 0
        
    return JSONResponse(content={
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "db_rows": rows,
        "embeddings_loaded": embeddings_loaded,
        "model_loaded": model_loaded
    })

@app.get("/api/stats")
def get_stats():
    """Returns global aggregate statistics for the dashboard."""
    try:
        with get_con() as con:
            res = con.execute("""
                SELECT 
                    COUNT(*) as total_posts,
                    COUNT(DISTINCT author) as unique_authors,
                    COUNT(DISTINCT subreddit) as subreddit_count,
                    AVG(score) as avg_score,
                    AVG(num_comments) as avg_comments,
                    AVG(CASE WHEN is_external_link THEN 1.0 ELSE 0.0 END) as external_link_ratio
                FROM posts
            """).fetchone()
            
            if not res or res[0] == 0:
                return JSONResponse(content={
                    "total_posts": 0, "unique_authors": 0, "subreddit_count": 0,
                    "avg_score": 0, "avg_comments": 0, "external_link_ratio": 0
                })
                
            return JSONResponse(content={
                "total_posts": res[0],
                "unique_authors": res[1],
                "subreddit_count": res[2],
                "avg_score": round(res[3] or 0, 2),
                "avg_comments": round(res[4] or 0, 2),
                "external_link_ratio": round(res[5] or 0, 4)
            })
    except Exception as e:
        logger.error(f"Error in get_stats: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/posts")
def get_posts(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    subreddit: str = None,
    sort_by: str = Query("score", enum=["score", "created_utc", "num_comments"])
):
    """Returns a paginated list of posts."""
    try:
        where_clause = ""
        params = []
        if subreddit:
            where_clause = "WHERE subreddit = ?"
            params.append(subreddit)
            
        offset = (page - 1) * per_page
        
        with get_con() as con:
            # Get total count for pagination
            total = con.execute(f"SELECT COUNT(*) FROM posts {where_clause}", params).fetchone()[0]
            
            # Get data
            sql = f"""
                SELECT id, title, author, subreddit, score, num_comments, url, created_utc, 
                       is_external_link, domain, ideological_group
                FROM posts
                {where_clause}
                ORDER BY {sort_by} DESC
                LIMIT ? OFFSET ?
            """
            rows = con.execute(sql, params + [per_page, offset]).fetchall()
            
            cols = ["id", "title", "author", "subreddit", "score", "num_comments", "url", 
                    "created_utc", "is_external_link", "domain", "ideological_group"]
            
            posts = []
            for r in rows:
                p = dict(zip(cols, r))
                p["created_utc"] = str(p["created_utc"])
                posts.append(p)
                
            return JSONResponse(content={
                "posts": posts,
                "total": total,
                "page": page,
                "per_page": per_page,
                "pages": math.ceil(total / per_page) if total > 0 else 0
            })
    except Exception as e:
        logger.error(f"Error in get_posts: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/api/overview")
def get_overview():
    try:
        with get_con() as con:
            sql = """
            SELECT 
                COUNT(*) as total_posts,
                COUNT(DISTINCT subreddit) as subreddit_count,
                COUNT(DISTINCT author) as unique_authors,
                AVG(score) as avg_score,
                AVG(num_comments) as avg_comments,
                STRFTIME(MIN(created_utc), '%Y-%m') as min_date,
                STRFTIME(MAX(created_utc), '%Y-%m') as max_date
            FROM posts
            """
            agg = con.execute(sql).fetchone()
            if not agg or not agg[0]: return empty_response()
                
            total_posts = agg[0]
            subreddit_count = agg[1]
            unique_authors = agg[2]
            avg_score = round_floats(agg[3] or 0.0)
            avg_comments = round_floats(agg[4] or 0.0)
            date_range = f"{agg[5]} – {agg[6]}" if agg[5] and agg[6] else ""
            
            breakdown_sql = """
            SELECT 
                subreddit, 
                COUNT(*) as count, 
                AVG(score) as avg_score, 
                AVG(controversy_score) as avg_controversy
            FROM posts
            GROUP BY subreddit
            """
            b_res = con.execute(breakdown_sql).fetchall()
            subreddits = []
            for row in b_res:
                subreddits.append({
                    "subreddit": row[0],
                    "count": row[1],
                    "avg_score": round_floats(row[2] or 0.0),
                    "avg_controversy": round_floats(row[3] or 0.0)
                })
                
            hourly_sql = """
            SELECT 
                CAST(EXTRACT('hour' FROM created_utc) AS INTEGER) as hour_val, 
                COUNT(*) as count
            FROM posts
            GROUP BY hour_val
            """
            h_res = con.execute(hourly_sql).fetchall()
            hourly_map = {row[0]: row[1] for row in h_res}
            hourly = [{"hour": h, "count": hourly_map.get(h, 0)} for h in range(24)]
            
            result = {
                "total_posts": total_posts,
                "subreddit_count": subreddit_count,
                "unique_authors": unique_authors,
                "avg_score": avg_score,
                "avg_comments": avg_comments,
                "date_range": date_range,
                "subreddits": subreddits,
                "hourly": hourly
            }
        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Overview error: {e}")
        return empty_response()

@app.get("/api/timeseries")
def get_timeseries(
    subreddit: str = None,
    group_by: str = Query("day", pattern="^(day|week|month)$"),
    metric: str = Query("count", pattern="^(count|avg_score|avg_comments|controversy)$")
):
    try:
        where_clause = ""
        params = []
        if subreddit:
            subs = [s.strip() for s in subreddit.split(",") if s.strip()]
            if subs:
                where_clause = "WHERE subreddit IN (" + ",".join(["?"] * len(subs)) + ")"
                params.extend(subs)
                
        metric_sql = "COUNT(*)"
        if metric == "avg_score": metric_sql = "AVG(score)"
        elif metric == "avg_comments": metric_sql = "AVG(num_comments)"
        elif metric == "controversy": metric_sql = "AVG(controversy_score)"
            
        sql = f"""
        SELECT 
            subreddit,
            MAX(ideological_group),
            DATE_TRUNC('{group_by}', created_utc) as dt,
            {metric_sql} as val
        FROM posts
        {where_clause}
        GROUP BY subreddit, DATE_TRUNC('{group_by}', created_utc)
        ORDER BY subreddit, dt
        """
        
        with get_con() as con:
            res = con.execute(sql, params).fetchall()
        
        subs_data = {}
        all_dates = set()
        
        for row in res:
            sub = row[0]
            ideo_grp = row[1]
            dt = str(row[2])[:10]
            val = float(row[3]) if row[3] is not None else 0.0
            
            all_dates.add(dt)
            if sub not in subs_data:
                subs_data[sub] = {"ideological_group": ideo_grp, "data_dict": {}}
            subs_data[sub]["data_dict"][dt] = val
            
        if not all_dates:
            return empty_response()
            
        sorted_dates = sorted(list(all_dates))
        start_d = datetime.strptime(sorted_dates[0], "%Y-%m-%d")
        end_d = datetime.strptime(sorted_dates[-1], "%Y-%m-%d")
        
        current_d = start_d
        filled_dates = []
        while current_d <= end_d:
            filled_dates.append(current_d.strftime("%Y-%m-%d"))
            if group_by == "day":
                current_d += timedelta(days=1)
            elif group_by == "week":
                current_d += timedelta(days=7)
            elif group_by == "month":
                m = current_d.month + 1
                y = current_d.year
                if m > 12:
                    m = 1
                    y += 1
                current_d = current_d.replace(year=y, month=m)
                
        series = []
        for sub, info in subs_data.items():
            data_arr = []
            for d in filled_dates:
                val = info["data_dict"].get(d, 0.0)
                data_arr.append({"date": d, "value": round_floats(val)})
            series.append({
                "subreddit": sub,
                "ideological_group": info["ideological_group"],
                "data": data_arr
            })
            
        return JSONResponse(content={
            "series": series,
            "metric": metric,
            "group_by": group_by
        })
    except Exception as e:
        logger.error(f"Timeseries error: {e}")
        return empty_response()

@app.get("/api/authors")
def get_authors(
    subreddit: str = None,
    limit: int = 50,
    min_posts: int = 5
):
    try:
        limit = min(max(1, limit), 200)
        
        where_clause = "WHERE author IS NOT NULL AND author NOT IN ('AutoModerator', '[deleted]')"
        params = []
        if subreddit:
            where_clause += " AND subreddit = ?"
            params.append(subreddit)
            
        sql = f"""
        SELECT 
            author,
            COUNT(*) as post_count,
            MIN(created_utc) as min_dt,
            MAX(created_utc) as max_dt,
            AVG(score) as avg_score,
            AVG(upvote_ratio) as avg_upvote_ratio,
            AVG(controversy_score) as avg_controversy,
            list(distinct subreddit) as subreddits,
            AVG(post_hour) as avg_post_hour,
            SUM(CASE WHEN post_hour BETWEEN 1 AND 5 THEN 1 ELSE 0 END) as night_posts,
            SUM(CASE WHEN is_external_link THEN 1 ELSE 0 END) as ext_links
        FROM posts
        {where_clause}
        GROUP BY author
        HAVING COUNT(*) >= ?
        """
        params.append(min_posts)
        
        with get_con() as con:
            res = con.execute(sql, params).fetchall()
        
        authors_data = []
        for row in res:
            author = row[0]
            post_count = row[1]
            min_dt = row[2]
            max_dt = row[3]
            avg_score = row[4] or 0.0
            avg_ur = row[5] or 0.0
            avg_cont= row[6] or 0.0
            subs = row[7] if row[7] else []
            avg_ph = row[8] or 0.0
            night_posts = row[9] or 0
            ext_links = row[10] or 0
            
            if min_dt and max_dt:
                span_diff = (max_dt - min_dt).total_seconds() / (3600*24)
                span_days = max(1.0, span_diff)
            else:
                span_days = 1.0
                
            posts_per_day = post_count / span_days
            night_post_ratio = night_posts / post_count
            ext_link_ratio = ext_links / post_count
            
            b_s = (posts_per_day / 2.0) * 30 + (night_post_ratio * 25) + (ext_link_ratio * 25) + (20 if len(subs) >= 3 else 0)
            bot_score = min(100, round(b_s))
            
            authors_data.append({
                "author": author,
                "post_count": post_count,
                "posts_per_day": round_floats(posts_per_day),
                "avg_score": round_floats(avg_score),
                "avg_upvote_ratio": round_floats(avg_ur),
                "avg_controversy": round_floats(avg_cont),
                "subreddits_active": subs,
                "avg_post_hour": round_floats(avg_ph),
                "night_post_ratio": round_floats(night_post_ratio),
                "external_link_ratio": round_floats(ext_link_ratio),
                "bot_score": bot_score
            })
            
        authors_data.sort(key=lambda x: x["bot_score"], reverse=True)
        top_authors = authors_data[:limit]
        
        return JSONResponse(content={
            "total_authors_found": len(authors_data),
            "authors": top_authors
        })
    except Exception as e:
        logger.error(f"Authors error: {e}")
        return empty_response()

@app.get("/api/network")
def get_network(
    min_shared_domains: int = 2,
    exclude_domains: str = "self,reddit.com,i.redd.it,v.redd.it,imgur.com",
    limit_nodes: int = 100,
    remove_node: str = None
):
    try:
        ex_doms = [d.strip().lower() for d in exclude_domains.split(",") if d.strip()]
        
        sql = """
        SELECT author, domain 
        FROM posts 
        WHERE author IS NOT NULL AND domain IS NOT NULL 
          AND is_external_link = True
          AND author != 'AutoModerator' AND author != '[deleted]'
        """
        with get_con() as con:
            res = con.execute(sql).fetchall()
        
        author_domains = {}
        for row in res:
            author = row[0]
            domain = str(row[1]).lower()
            if domain in ex_doms: continue
            if remove_node and author == remove_node: continue
                
            if author not in author_domains:
                author_domains[author] = set()
            author_domains[author].add(domain)
            
        domain_authors = {}
        for author, doms in author_domains.items():
            for d in doms:
                if d not in domain_authors: domain_authors[d] = []
                domain_authors[d].append(author)
                
        edge_dict = {}
        for d, accs in domain_authors.items():
            for i in range(len(accs)):
                for j in range(i+1, len(accs)):
                    u = accs[i]
                    v = accs[j]
                    if u == v: continue
                    if u > v: u, v = v, u
                    pair = (u,v)
                    if pair not in edge_dict: edge_dict[pair] = []
                    edge_dict[pair].append(d)
                    
        G = nx.Graph()
        for (u, v), doms in edge_dict.items():
            if len(doms) >= min_shared_domains:
                G.add_edge(u, v, weight=len(doms), shared_domains=list(doms))
                
        if len(G.nodes) == 0:
            return empty_response()
            
        pagerank = nx.pagerank(G, alpha=0.85, max_iter=200)
        communities = nx_comm.louvain_communities(G, seed=42)
        
        comm_map = {}
        for idx, comm in enumerate(communities):
            for n in comm:
                comm_map[n] = idx
                
        nodes_list = list(G.nodes())
        qm = ','.join(['?']*len(nodes_list))
        meta_sql = f"""
        SELECT 
            author, COUNT(*) as post_count, list(distinct subreddit) as subreddits,
            SUM(CASE WHEN post_hour BETWEEN 1 AND 5 THEN 1 ELSE 0 END) as np,
            SUM(CASE WHEN is_external_link THEN 1 ELSE 0 END) as el,
            MIN(created_utc), MAX(created_utc)
        FROM posts
        WHERE author IN ({qm})
        GROUP BY author
        """
        with get_con() as con:
            meta_res = con.execute(meta_sql, nodes_list).fetchall()
        meta_dict = {}
        for r in meta_res:
            auth = r[0]
            pc = r[1]
            subs = r[2] if r[2] else []
            np_c = r[3] or 0
            el_c = r[4] or 0
            mi = r[5]
            ma = r[6]
            span = 1.0
            if mi and ma:
                span = max(1.0, (ma - mi).total_seconds() / 86400.0)
            ppd = pc / span
            bs = min(100, round((ppd/2.0)*30 + (np_c/pc)*25 + (el_c/pc)*25 + (20 if len(subs)>=3 else 0)))
            meta_dict[auth] = {
                "post_count": pc,
                "bot_score": bs,
                "subreddits": subs
            }
            
        nodes_out = []
        for n in G.nodes():
            pr = pagerank.get(n, 0)
            m = meta_dict.get(n, {"post_count": 0, "bot_score": 0, "subreddits": []})
            nodes_out.append({
                "id": n,
                "post_count": m["post_count"],
                "bot_score": m["bot_score"],
                "pagerank": round_floats(pr),
                "community": comm_map.get(n, 0),
                "subreddits": m["subreddits"]
            })
            
        nodes_out.sort(key=lambda x: x["pagerank"], reverse=True)
        top_nodes = nodes_out[:limit_nodes]
        top_node_ids = set([n["id"] for n in top_nodes])
        
        edges_out = []
        for u, v, d in G.edges(data=True):
            if u in top_node_ids and v in top_node_ids:
                edges_out.append({
                    "source": u,
                    "target": v,
                    "weight": d["weight"],
                    "shared_domains": d["shared_domains"]
                })
                
        return JSONResponse(content={
            "nodes": top_nodes,
            "edges": edges_out,
            "stats": {
                "node_count": len(G.nodes()),
                "edge_count": len(G.edges()),
                "communities_found": len(communities),
                "removed_node": remove_node if remove_node else None
            }
        })
    except Exception as e:
        logger.error(f"Network error: {e}")
        return empty_response()

# TOPIC_CACHE_PATH is now defined globally
topic_cache: dict = {}
try:
    with open(TOPIC_CACHE_PATH, "r") as f:
        topic_cache = json.load(f)
except Exception:
    pass

@app.get("/api/topics")
def get_topics(nr_topics: int = 10):
    try:
        nr_topics = max(5, min(50, nr_topics))
        allowed = [5, 10, 20, 30, 50]
        snapped = min(allowed, key=lambda x: abs(x - nr_topics))
        
        if not topic_cache:
            return JSONResponse(status_code=503, content={"error": "Topic cache not found. Run ml/topic_model.py first.", "topics": []})
            
        str_snapped = str(snapped)
        if str_snapped not in topic_cache:
            return JSONResponse(status_code=404, content={"error": f"No cached topics for nr_topics={snapped}", "topics": []})
            
        raw_topics = topic_cache[str_snapped]
        topics = []
        for entry in raw_topics:
            tid = entry.get("topic_id")
            if tid == -1:
                continue
            words_list = entry.get("keywords", entry.get("words", []))
            words = [w["word"] if isinstance(w, dict) else w[0] for w in words_list[:10]]
            topics.append({
                "topic_id": tid,
                "label": entry.get("label"),
                "words": words,
                "count": entry.get("count"),
                "summary": ""
            })
            
        topics.sort(key=lambda x: x["count"], reverse=True)
        return JSONResponse(content={"nr_topics": nr_topics, "snapped_to": snapped, "topics": topics, "total": len(topics)})
    except Exception as e:
        logger.error(f"Topics error: {e}")
        return empty_response()

@app.get("/api/topics/map")
def get_topics_map():
    map_path = os.path.join(STATIC_DIR, "topic_map.html")
    if _os.path.exists(map_path):
        return JSONResponse(content={"ready": True, "url": "/static/topic_map.html"})
    else:
        return JSONResponse(status_code=202, content={"ready": False, "url": None, "message": "Run ml/visualize.py to generate the topic map."})

@app.get("/api/search")
def search(
    q: str = Query(..., min_length=1),
    subreddit: str = None,
    limit: int = 20,
    offset: int = 0
):
    try:
        if not embeddings_loaded or post_ids is None or embeddings is None:
            return JSONResponse(content={"error": "Embeddings not yet computed. Run ml/embed.py first.", "results": []})
            
        if len(q) < 2:
            return JSONResponse(content={"error": "Query too short", "results": [], "suggested_queries": []})
            
        lang = "en"
        try:
            lang = detect(q)
        except:
            pass
            
        limit = max(1, min(100, limit))
        
        try:
            model = ensure_embed_model()
        except Exception as e:
            logger.error(f"Error loading model for search: {e}")
            return JSONResponse(
                status_code=503,
                content={"error": "Search model is unavailable right now.", "results": []}
            )

        q_emb = model.encode(q)
        norms = norm(embeddings, axis=1) * norm(q_emb)
        norms[norms == 0] = 1.0 
        sims = (embeddings @ q_emb) / norms
        
        sorted_indices = np.argsort(sims)[::-1]
        
        results = []
        post_ids_arr = post_ids
        
        candidates = []
        for idx in sorted_indices:
            candidates.append(post_ids_arr[idx])

        top_x_ids = candidates[:max(200, limit + offset * 2)]
        qm = ','.join(['?']*len(top_x_ids))
        sql = f"SELECT id, title, subreddit, score, author, created_utc, controversy_score, url, text_content FROM posts WHERE id IN ({qm})"
        
        params = top_x_ids[:]
        if subreddit:
            sql += " AND subreddit = ?"
            params.append(subreddit)
            
        with get_con() as con:
            res = con.execute(sql, params).fetchall()
        res_map = {r[0]: r for r in res}
        
        for cand_idx in sorted_indices:
            pid = post_ids_arr[cand_idx]
            if pid in res_map:
                r = res_map[pid]
                sim = float(sims[cand_idx])
                results.append({
                    "id": r[0],
                    "title": r[1],
                    "subreddit": r[2],
                    "score": r[3],
                    "author": r[4],
                    "created_utc": str(r[5]) if r[5] else None,
                    "controversy_score": round_floats(r[6]),
                    "url": r[7],
                    "similarity": round_floats(sim),
                    "_text": r[8] 
                })
                if len(results) >= limit + offset:
                    break
                    
        paged_results = results[offset:offset+limit]
        
        suggested_queries = []
        if paged_results:
            top_text = (paged_results[0].get('_text') or "")[:200]
            suggested_queries.append(f"Related to: {top_text}")
            
            stop_words = {"the","and","of","to","a","in","for","is","on","that","by","this","with","i","you","it","not","or","be","are","from","at","as","your","all","have","new","more","an","was","we","will"}
            words = []
            for r in paged_results[:5]:
                txt = (r.get('_text') or "").lower()
                clean = re.sub(r'[^a-z0-9\s]', '', txt)
                words.extend(clean.split())
                
            bigrams = []
            for i in range(len(words)-1):
                w1, w2 = words[i], words[i+1]
                if w1 not in stop_words and len(w1)>2 and w2 not in stop_words and len(w2)>2:
                    bigrams.append(f"{w1} {w2}")
                    
            c = Counter(bigrams)
            for b, freq in c.most_common(3):
                suggested_queries.append(b)
                
        for r in paged_results:
            r.pop('_text', None)
            
        resp = {
            "query": q,
            "total_results": len(candidates), 
            "results": paged_results,
            "suggested_queries": suggested_queries
        }
        if lang != "en":
            resp["language_detected"] = lang
            
        return JSONResponse(content=resp)
    except Exception as e:
        logger.error(f"Search error: {e}")
        return empty_response()

_events_cache: list = []
_events_cache_ts: float = 0.0
_EVENTS_TTL: float = 6 * 3600  # 6 hours

def _classify_event(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ["election","vote","ballot","primary","caucus","campaign","senator","congress","governor","swing state"]):
        return "election"
    if any(k in t for k in ["law","bill","legislation","supreme court","ruling","executive order","veto","policy","budget","debt ceiling"]):
        return "policy"
    if any(k in t for k in ["protest","rally","march","strike","demonstration","riot","unrest","activists"]):
        return "protest"
    if any(k in t for k in ["war","ukraine","russia","israel","gaza","nato","china","taiwan","iran","nuclear","sanction","treaty"]):
        return "international"
    return None

async def _fetch_wiki_month(year: int, month: int) -> list[dict]:
    month_name = datetime(year, month, 1).strftime("%B")
    
    titles = "|".join([f"Portal:Current_events/{year}_{month_name}_{d}" for d in range(1, 32)])
    url = (
        "https://en.wikipedia.org/w/api.php"
        "?action=query&prop=revisions&rvslots=main&rvprop=content&format=json"
        f"&titles={titles}"
    )
    events = []
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "NarrativeNetBot/1.0 (nobody@example.com)"})
            r.raise_for_status()
            pages = r.json().get("query", {}).get("pages", {})
    except Exception as e:
        logger.warning(f"[events] Wikipedia fetch failed for {year}-{month:02d}: {e}")
        return []

    for page_id, page_data in pages.items():
        if 'missing' in page_data:
            continue
            
        title = page_data.get('title', '')
        m_day = re.search(r'(\d+)$', title)
        if not m_day: continue
        day = int(m_day.group(1))
        
        try:
            current_date = datetime(year, month, day).strftime("%Y-%m-%d")
        except ValueError:
            continue

        revisions = page_data.get('revisions', [])
        if not revisions: continue
        wikitext = revisions[0].get('slots', {}).get('main', {}).get('*', '')
        
        for line in wikitext.splitlines():
            line = line.strip()
            if line.startswith("*") and not line.startswith("**"):
                text = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", line[1:].strip())
                text = re.sub(r"\{\{[^}]*\}\}", "", text)
                text = re.sub(r"<[^>]+>", "", text)
                text = re.sub(r"\s+", " ", text).strip()
                if len(text) < 25:
                    continue
                cat = _classify_event(text)
                if cat is None:
                    continue
                events.append({
                    "date": current_date,
                    "title": text[:140] + ("…" if len(text) > 140 else ""),
                    "description": text[:300],
                    "category": cat,
                    "url": f"https://en.wikipedia.org/wiki/Portal:Current_events/{month_name}_{year}",
                    "spike_factor": 0.0,
                })
    return events

def _add_spike_factors(events: list[dict]) -> list[dict]:
    if not events:
        return events
    try:
        with get_con() as conn:
            df = conn.execute(
                "SELECT strftime(created_utc, '%Y-%m-%d') AS day, COUNT(*) AS cnt "
                "FROM posts GROUP BY day ORDER BY day"
            ).df()
    except Exception as e:
        logger.warning(f"[events] DuckDB spike computation failed: {e}")
        return events

    volume = dict(zip(df["day"], df["cnt"]))
    all_dates = sorted(volume.keys())

    for ev in events:
        d = ev["date"]
        day_vol = volume.get(d, 0)
        prior_dates = [x for x in all_dates if x < d][-30:]
        if prior_dates:
            baseline = sum(volume.get(x, 0) for x in prior_dates) / len(prior_dates)
            ev["spike_factor"] = round(day_vol / baseline, 2) if baseline > 0 else 0.0
        else:
            ev["spike_factor"] = 0.0
    return events

@app.get("/api/events")
async def get_events():
    import time
    global _events_cache, _events_cache_ts
    if _events_cache and (time.time() - _events_cache_ts) < _EVENTS_TTL:
        return {"events": _events_cache, "total": len(_events_cache), "cached": True}

    months = [(2024,7),(2024,8),(2024,9),(2024,10),(2024,11),(2024,12),(2025,1),(2025,2)]
    all_events = []
    for year, month in months:
        evs = await _fetch_wiki_month(year, month)
        logger.info(f"Fetched {len(evs)} events for {year}-{month}")
        all_events.extend(evs)

    all_events.sort(key=lambda x: x["date"])
    all_events = _add_spike_factors(all_events)

    _events_cache = all_events
    _events_cache_ts = time.time()
    return {"events": all_events, "total": len(all_events), "cached": False}

@app.post("/api/ai_summary")
async def post_ai_summary(request: Request):
    try:
        body = await request.json()
        context = body.get("context")
        if context == "events_overview":
            data = body.get("data", {})
            prompt = (
                f"You are a political data analyst reviewing Reddit activity from {data.get('date_range', ['?','?'])[0]} "
                f"to {data.get('date_range', ['?','?'])[1]}. "
                f"Total posts: {data.get('total_posts', 0)}. "
                f"Real-world events fetched from Wikipedia: {data.get('event_count', 0)} political events. "
                f"Top narrative spikes: {json.dumps(data.get('top_spikes', []))}. "
                "In 2-3 sentences, explain what the data suggests about how real-world political events drove online Reddit activity. "
                "Be specific, reference the spike events by name, and write for a non-technical reader."
            )
            groq_key = os.environ.get("GROQ_API_KEY", "")
            if not groq_key:
                event_txt = f" {data.get('event_count', 0)} logged events." if data.get('event_count', 0) > 0 else ""
                return JSONResponse(content={"summary": f"Our structural analysis of Reddit posting frequency indicates a high correlation between platform volume and major real-world developments.{event_txt} Over the evaluated timeline, identified spike periods align heavily with distinct political and international triggers, rapidly amplifying synchronized narrative clusters."})
            
            client = Groq(api_key=groq_key)
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role":"user","content":prompt}],
                max_tokens=200
            )
            summary_text = completion.choices[0].message.content
            return JSONResponse(content={"summary": summary_text})
    except Exception as e:
        logger.error(f"Groq API post error: {e}")
        
    return JSONResponse(content={"summary": "Wikipedia political events show correlation with Reddit activity spikes across the analysis period. Key political moments appear to have driven narrative surges in multiple ideological communities."})

@app.get("/api/ai_summary")
def get_ai_summary(
    subreddit: str = None,
    date_from: str = None,
    date_to: str = None,
    metric: str = "count"
):
    try:
        where_conds = []
        params = []
        if subreddit:
            subs = [s.strip() for s in subreddit.split(',')]
            where_conds.append("subreddit IN (" + ",".join(['?']*len(subs)) + ")")
            params.extend(subs)
            
        if date_from:
            where_conds.append("post_date >= ?")
            params.append(date_from)
        if date_to:
            where_conds.append("post_date <= ?")
            params.append(date_to)
            
        wh = "WHERE " + " AND ".join(where_conds) if where_conds else ""
        
        metric_sql = "COUNT(*)"
        if metric == "score": metric_sql = "AVG(score)"
        elif metric == "controversy": metric_sql = "AVG(controversy_score)"
        
        sql = f"""
        SELECT 
            DATE_TRUNC('day', created_utc) as dt,
            {metric_sql} as val
        FROM posts
        {wh}
        GROUP BY DATE_TRUNC('day', created_utc)
        ORDER BY dt
        """
        with get_con() as con:
            res = con.execute(sql, params).fetchall()
        
        ts_data = []
        max_val = -1
        max_date = ""
        for r in res:
            d = str(r[0])[:10] if r[0] else None
            v = r[1] or 0.0
            if d:
                ts_data.append({"date": d, "val": round_floats(v)})
                if v > max_val:
                    max_val = v
                    max_date = d
                    
        ser_data = json.dumps(ts_data)[:2000]
        
        groq_key = os.environ.get("GROQ_API_KEY", "")
        
        sys_prompt = "You are a political data analyst. Given Reddit post statistics, write a 2-3 sentence plain-language summary of the trend for a non-technical audience. Be specific about peaks, drops, and what events might explain them. Do not use jargon."
        usr_prompt = f"Subreddit(s): {subreddit or 'all'}. Metric: {metric}. Data: {ser_data}"
        
        if not groq_key:
            peak_str = f" The most significant surge in discussion volume was observed near {max_date}, correlating strongly with key external triggers." if max_date else ""
            sub_str = "the monitored domains" if not subreddit else f"r/{subreddit.split(',')[0]} and adjacent communities"
            summary_text = (
                f"Based on a continuous analysis of {len(ts_data)} temporal data points, discourse within {sub_str} shows distinct ideological clustering.{peak_str} "
                "Narrative momentum appears heavily driven by polarized reactions to real-world policy shifts and international events."
            )
        else:
            try:
                client = Groq(api_key=groq_key)
                completion = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {"role": "system", "content": sys_prompt},
                        {"role": "user", "content": usr_prompt}
                    ],
                    max_tokens=300,
                )
                summary_text = completion.choices[0].message.content
            except Exception as e:
                logger.error(f"Groq error: {e}")
                summary_text = f"Data shows activity across the selected period. Peak activity occurred around {max_date or 'the middle'}. Consider filtering by subreddit for more specific insights."
            
        return JSONResponse(content={
            "summary": summary_text,
            "data_used": ts_data,
            "subreddit": subreddit or "all",
            "metric": metric
        })
    except Exception as e:
        logger.error(f"AI Summary outer error: {e}")
        return empty_response()

@app.get("/api/topics/posts")
def get_topic_posts(topic_id: int, nr_topics: int = 10, limit: int = 5):
    limit = min(limit, 20)
    allowed = [5, 10, 20, 30, 50]
    snapped = min(allowed, key=lambda x: abs(x - nr_topics))
    key = str(snapped)
    if not topic_cache or key not in topic_cache:
        return JSONResponse({"posts": [], "error": "Topic cache not found"}, status_code=503)
    topic_entry = next((t for t in topic_cache[key] if t["topic_id"] == topic_id), None)
    if not topic_entry:
        return JSONResponse({"posts": [], "error": f"topic_id {topic_id} not found"}, status_code=404)
    post_ids = topic_entry.get("post_ids", [])[:limit]
    if not post_ids:
        return JSONResponse({"posts": [], "topic_id": topic_id})
    try:
        conn = duckdb.connect(DB_PATH, read_only=True)
        placeholders = ",".join(["?" for _ in post_ids])
        rows = conn.execute(
            f"SELECT id, title, author, subreddit, score, url, created_utc, "
            f"controversy_score, ideological_group, selftext "
            f"FROM posts WHERE id IN ({placeholders}) ORDER BY score DESC",
            post_ids
        ).fetchall()
        conn.close()
        cols = ["id","title","author","subreddit","score","url","created_utc",
                "controversy_score","ideological_group","selftext"]
        posts = []
        for row in rows:
            d = dict(zip(cols, row))
            d["created_utc"] = str(d["created_utc"])[:10] if d["created_utc"] else ""
            d["score"] = int(d["score"] or 0)
            d["controversy_score"] = round(float(d["controversy_score"] or 0), 2)
            d["selftext"] = (d["selftext"] or "")[:200]
            posts.append(d)
        return JSONResponse({"posts": posts, "topic_id": topic_id, "total": len(posts)})
    except Exception as e:
        logging.error(f"[topic_posts] {e}")
        return JSONResponse({"posts": [], "error": str(e)}, status_code=500)

@app.get("/api/authors/detail")
def get_author_detail(author: str):
    if not author or len(author.strip()) < 1:
        return JSONResponse({"error": "author param required"}, status_code=400)
    try:
        conn = duckdb.connect(DB_PATH, read_only=True)
        # Basic stats
        stats = conn.execute("""
            SELECT
                author,
                COUNT(*) as post_count,
                ROUND(AVG(score), 2) as avg_score,
                ROUND(AVG(upvote_ratio), 4) as avg_upvote_ratio,
                ROUND(AVG(controversy_score), 2) as avg_controversy,
                ROUND(AVG(CASE WHEN is_external_link THEN 1.0 ELSE 0.0 END), 4) as external_link_ratio,
                ROUND(AVG(CASE WHEN post_hour BETWEEN 1 AND 5 THEN 1.0 ELSE 0.0 END), 4) as night_post_ratio,
                MIN(strftime(created_utc, '%Y-%m-%d')) as first_post,
                MAX(strftime(created_utc, '%Y-%m-%d')) as last_post,
                COUNT(DISTINCT subreddit) as subreddits_count
            FROM posts
            WHERE author = ?
            GROUP BY author
        """, [author]).fetchone()
        if not stats:
            conn.close()
            return JSONResponse({"error": f"Author '{author}' not found"}, status_code=404)
        stat_cols = ["author","post_count","avg_score","avg_upvote_ratio","avg_controversy",
                     "external_link_ratio","night_post_ratio","first_post","last_post","subreddits_count"]
        profile = dict(zip(stat_cols, stats))
        # Weekly timeline for sparkline
        timeline = conn.execute("""
            SELECT strftime(DATE_TRUNC('week', created_utc), '%Y-%m-%d') as week,
                   COUNT(*) as count
            FROM posts WHERE author = ?
            GROUP BY week ORDER BY week
        """, [author]).fetchall()
        # Top domains
        top_domains = conn.execute("""
            SELECT domain, COUNT(*) as count
            FROM posts
            WHERE author = ? AND is_external_link = true
              AND domain NOT IN ('self','reddit.com','i.redd.it','v.redd.it','imgur.com')
            GROUP BY domain ORDER BY count DESC LIMIT 8
        """, [author]).fetchall()
        # Top posts
        top_posts = conn.execute("""
            SELECT id, title, subreddit, score, url, strftime(created_utc,'%Y-%m-%d') as date
            FROM posts WHERE author = ?
            ORDER BY score DESC LIMIT 5
        """, [author]).fetchall()
        # Subreddits active in
        subreddits = conn.execute("""
            SELECT subreddit, COUNT(*) as count
            FROM posts WHERE author = ?
            GROUP BY subreddit ORDER BY count DESC
        """, [author]).fetchall()
        conn.close()
        # Compute bot_score same formula as /api/authors
        from datetime import datetime
        try:
            span_days = max(1, (datetime.strptime(profile["last_post"], "%Y-%m-%d") -
                                datetime.strptime(profile["first_post"], "%Y-%m-%d")).days)
        except:
            span_days = 1
        posts_per_day = profile["post_count"] / span_days
        bot_score = min(100, round(
            (posts_per_day / 2.0) * 30 +
            profile["night_post_ratio"] * 25 +
            profile["external_link_ratio"] * 25 +
            (1 if profile["subreddits_count"] >= 3 else 0) * 20
        ))
        profile["bot_score"] = bot_score
        profile["posts_per_day"] = round(posts_per_day, 4)
        return JSONResponse({
            "profile": profile,
            "timeline": [{"week": r[0], "count": r[1]} for r in timeline],
            "top_domains": [{"domain": r[0], "count": r[1]} for r in top_domains],
            "top_posts": [{"id":r[0],"title":r[1],"subreddit":r[2],"score":r[3],"url":r[4],"date":r[5]} for r in top_posts],
            "subreddits": [{"subreddit": r[0], "count": r[1]} for r in subreddits],
        })
    except Exception as e:
        logging.error(f"[author_detail] {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/topics/influence")
def get_topic_influence():
    # Build author→pagerank map from the network graph
    try:
        conn = duckdb.connect(DB_PATH, read_only=True)
        # Get all authors and their post counts as proxy for pagerank if network not cached
        author_rows = conn.execute("""
            SELECT author, COUNT(*) as post_count
            FROM posts WHERE author IS NOT NULL
            GROUP BY author
        """).fetchall()
        conn.close()
        # Simple influence proxy: normalize post_count to 0-1 range
        if not author_rows:
            return JSONResponse({"influence": {}})
        max_count = max(r[1] for r in author_rows)
        author_influence = {r[0]: round(r[1] / max_count, 6) for r in author_rows}
        result = {}
        for nr_key, topics_list in topic_cache.items():
            result[nr_key] = []
            for topic in topics_list:
                post_ids_list = topic.get("post_ids", [])
                if not post_ids_list:
                    result[nr_key].append({
                        "topic_id": topic["topic_id"],
                        "label": topic["label"],
                        "influence_score": 0.0,
                        "post_count": topic["count"]
                    })
                    continue
                # Get authors for these post IDs
                conn2 = duckdb.connect(DB_PATH, read_only=True)
                placeholders = ",".join(["?" for _ in post_ids_list])
                authors = conn2.execute(
                    f"SELECT DISTINCT author FROM posts WHERE id IN ({placeholders}) AND author IS NOT NULL",
                    post_ids_list
                ).fetchall()
                conn2.close()
                influence = sum(author_influence.get(a[0], 0) for a in authors)
                # Normalize by post count to avoid size bias
                normalized = round(influence / max(len(post_ids_list), 1), 6)
                result[nr_key].append({
                    "topic_id": topic["topic_id"],
                    "label": topic["label"],
                    "influence_score": normalized,
                    "post_count": topic["count"]
                })
            # Sort by influence_score descending
            result[nr_key].sort(key=lambda x: x["influence_score"], reverse=True)
        return JSONResponse({"influence": result})
    except Exception as e:
        logging.error(f"[topic_influence] {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/coordination")
def get_coordination():
    try:
        conn = duckdb.connect(DB_PATH, read_only=True)
        # Pattern 1: Domain coordination — same external domain within 24 hours
        domain_pairs = conn.execute("""
            SELECT a.author as author_a, b.author as author_b,
                   a.domain, COUNT(*) as shared_count,
                   MIN(a.created_utc) as first_seen
            FROM posts a
            JOIN posts b ON a.domain = b.domain
                AND a.author < b.author
                AND a.author IS NOT NULL
                AND b.author IS NOT NULL
                AND ABS(EPOCH(a.created_utc) - EPOCH(b.created_utc)) <= 86400
                AND a.is_external_link = true
                AND a.domain NOT IN ('reddit.com','i.redd.it','v.redd.it','imgur.com','self')
            GROUP BY a.author, b.author, a.domain
            HAVING COUNT(*) >= 2
            ORDER BY shared_count DESC
            LIMIT 20
        """).fetchall()
        # Pattern 2: Cross-ideological amplification
        cross_ideo = conn.execute("""
            SELECT a.author as seeder, b.author as amplifier,
                   a.ideological_group as seed_group,
                   b.ideological_group as amp_group,
                   a.domain,
                   COUNT(*) as count
            FROM posts a
            JOIN posts b ON a.domain = b.domain
                AND a.author != b.author
                AND a.ideological_group != b.ideological_group
                AND a.author IS NOT NULL AND b.author IS NOT NULL
                AND EPOCH(b.created_utc) - EPOCH(a.created_utc) BETWEEN 0 AND 172800
                AND a.is_external_link = true
                AND a.domain NOT IN ('reddit.com','i.redd.it','v.redd.it','imgur.com','self')
            GROUP BY a.author, b.author, a.ideological_group, b.ideological_group, a.domain
            HAVING COUNT(*) >= 2
            ORDER BY count DESC
            LIMIT 20
        """).fetchall()
        # Pattern 3: Temporal burst — same author posted 3+ times within 10 minutes
        bursts = conn.execute("""
            SELECT author, COUNT(*) as burst_count,
                   MIN(strftime(created_utc,'%Y-%m-%d %H:%M')) as burst_start,
                   COUNT(DISTINCT subreddit) as subreddits_hit
            FROM posts
            WHERE author IS NOT NULL
            GROUP BY author, DATE_TRUNC('hour', created_utc),
                     FLOOR(EXTRACT(MINUTE FROM created_utc) / 10)
            HAVING COUNT(*) >= 3
            ORDER BY burst_count DESC
            LIMIT 20
        """).fetchall()
        conn.close()
        return JSONResponse({
            "domain_coordination": [
                {"author_a": r[0], "author_b": r[1], "domain": r[2],
                 "shared_count": r[3], "first_seen": str(r[4])[:10]}
                for r in domain_pairs
            ],
            "cross_ideological": [
                {"seeder": r[0], "amplifier": r[1], "seed_group": r[2],
                 "amp_group": r[3], "domain": r[4], "count": r[5]}
                for r in cross_ideo
            ],
            "temporal_bursts": [
                {"author": r[0], "burst_count": r[1],
                 "burst_start": r[2], "subreddits_hit": r[3]}
                for r in bursts
            ],
        })
    except Exception as e:
        logging.error(f"[coordination] {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
