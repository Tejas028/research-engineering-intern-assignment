import os
import json
import datetime
import math
import re
import logging
import httpx
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

import duckdb
import networkx as nx
import networkx.algorithms.community as nx_comm
from sentence_transformers import SentenceTransformer
from langdetect import detect, DetectorFactory
from groq import Groq
import numpy as np
from numpy.linalg import norm
from collections import Counter

# Ensure reproducible langdetect
DetectorFactory.seed = 0

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH           = os.environ.get("DB_PATH",    os.path.join(PROJECT_ROOT, "narrativenet.db"))
EMB_PATH          = os.environ.get("EMB_PATH",   os.path.join(PROJECT_ROOT, "embeddings_cache.npz"))
TOPIC_CACHE_PATH  = os.environ.get("TOPIC_CACHE_PATH", os.path.join(PROJECT_ROOT, "topic_cache.json"))
STATIC_DIR        = os.path.join(PROJECT_ROOT, "static")

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    global embed_model, embeddings, post_ids, embeddings_loaded, model_loaded, db_rows
    
    # 1. Verify DuckDB is accessible
    logger.info(f"Opening DuckDB at {DB_PATH}")
    try:
        with get_con() as c:
            res = c.execute("SELECT COUNT(*) FROM posts").fetchone()
            db_rows = res[0]
    except Exception as e:
        logger.error(f"Error opening DB: {e}")
        db_rows = 0

    # 2. Load model
    try:
        logger.info("Loading SentenceTransformer model...")
        embed_model = SentenceTransformer("all-MiniLM-L6-v2")
        model_loaded = True
    except Exception as e:
        logger.error(f"Error loading model: {e}")

    # 3. Load embeddings
    cache_path = EMB_PATH
    if not os.path.exists(cache_path):
        cache_path = "embeddings_cache.npz" # fallback to CWD
        
    if os.path.exists(cache_path):
        try:
            logger.info(f"Loading embeddings cache from {cache_path}...")
            data = np.load(cache_path, allow_pickle=True)
            loaded_embeddings = data['embeddings']
            loaded_post_ids = data['ids']
            
            if loaded_embeddings.shape[0] == db_rows:
                embeddings = loaded_embeddings
                post_ids = loaded_post_ids
                embeddings_loaded = True
            else:
                logger.warning(f"Embeddings shape ({loaded_embeddings.shape[0]}) doesn't match DB row count ({db_rows}). Embeddings will NOT be used.")
                embeddings_loaded = False
        except Exception as e:
            logger.error(f"Error loading embeddings cache: {e}")
            embeddings_loaded = False
    else:
        logger.info(f"Embeddings cache not found.")
            
    yield


app = FastAPI(lifespan=lifespan)

from fastapi.staticfiles import StaticFiles
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

import os

_RAW_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")
if _RAW_ORIGINS == "*":
    _ORIGINS = ["*"]
else:
    _ORIGINS = [o.strip() for o in _RAW_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_credentials=False,          # must be False when allow_origins includes "*"
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
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


@app.get("/health")
def health():
    return JSONResponse(content={
        "status": "ok",
        "db_rows": db_rows,
        "embeddings_loaded": embeddings_loaded,
        "model_loaded": model_loaded
    })

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
        start_d = datetime.datetime.strptime(sorted_dates[0], "%Y-%m-%d")
        end_d = datetime.datetime.strptime(sorted_dates[-1], "%Y-%m-%d")
        
        current_d = start_d
        filled_dates = []
        while current_d <= end_d:
            filled_dates.append(current_d.strftime("%Y-%m-%d"))
            if group_by == "day":
                current_d += datetime.timedelta(days=1)
            elif group_by == "week":
                current_d += datetime.timedelta(days=7)
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
        
        q_emb = embed_model.encode(q)
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
                return JSONResponse(content={"summary": "Set GROQ_API_KEY in your environment to enable AI-generated narrative summaries."})
            
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
            peak_str = f" Peak posting occurred around {max_date}." if max_date else ""
            summary_text = (
                f"Analysing {len(ts_data)} data points across {subreddit or 'all subreddits'}.{peak_str} "
                f"Set GROQ_API_KEY in your environment to enable AI-generated narrative summaries."
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
