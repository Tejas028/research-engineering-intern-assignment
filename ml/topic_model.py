import duckdb
import numpy as np
import json
import os
import logging
import time

from bertopic import BERTopic
from umap import UMAP
from sklearn.cluster import HDBSCAN
from sklearn.feature_extraction.text import CountVectorizer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "narrativenet.db")
EMB_PATH = os.path.join(os.path.dirname(__file__), "..", "embeddings_cache.npz")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "topic_cache.json")

if __name__ == "__main__":
    start_time = time.time()
    
    data = np.load(EMB_PATH, allow_pickle=True)
    embeddings = data["embeddings"].astype(np.float32)
    ids = data["ids"].tolist()
    
    if embeddings.shape[0] != 8799:
        logging.warning(f"Embeddings shape [0] is {embeddings.shape[0]}, expected 8799.")
    logging.info(f"Embeddings loaded with shape: {embeddings.shape}")
    
    con = duckdb.connect(DB_PATH, read_only=True)
    res = con.execute("SELECT id, title, selftext FROM posts ORDER BY id").fetchall()
    
    texts = []
    for row in res:
        title = str(row[1]) if row[1] else ""
        selftext = str(row[2]) if row[2] else ""
        body = selftext if selftext and selftext not in ("", "[removed]", "[deleted]") else ""
        text = f"{title} {body}".strip()
        texts.append(text)
        
    umap_model = UMAP(
        n_neighbors=15,
        n_components=5,
        min_dist=0.0,
        metric="cosine",
        random_state=42,
    )
    
    vectorizer = CountVectorizer(
        stop_words="english",
        min_df=2,
        ngram_range=(1, 2),
    )
    
    NR_TOPICS_LIST = [5, 10, 20, 30, 50]
    cache = {}
    
    for nr_topics in NR_TOPICS_LIST:
        try:
            topic_model = BERTopic(
                umap_model=umap_model,
                hdbscan_model=HDBSCAN(min_cluster_size=15, metric="euclidean"),
                vectorizer_model=vectorizer,
                nr_topics=nr_topics,
                calculate_probabilities=False,
                verbose=False,
            )
            topics, _ = topic_model.fit_transform(texts, embeddings)
            topic_info = topic_model.get_topic_info()
            
            # Build a map of topic_id → list of post IDs (preserving fit_transform order)
            from collections import defaultdict
            topic_to_ids = defaultdict(list)
            for post_id, topic_id in zip(ids, topics):
                if topic_id == -1:
                    continue
                topic_to_ids[int(topic_id)].append(post_id)
            
            result = []
            for _, row in topic_info.iterrows():
                if row["Topic"] == -1:
                    continue
                keywords = topic_model.get_topic(row["Topic"])
                result.append({
                    "topic_id": int(row["Topic"]),
                    "label": row["Name"],
                    "count": int(row["Count"]),
                    "keywords": [
                        {"word": w, "score": round(float(s), 4)}
                        for w, s in keywords[:10]
                    ],
                    "post_ids": topic_to_ids[int(row["Topic"])][:50],  # store top 50 max
                })
                
            cache[str(nr_topics)] = result
            noise_count = sum(1 for t in topics if t == -1)
            logging.info(f"nr_topics={nr_topics}: {len(result)} topics generated, {noise_count} posts unassigned (noise)")
        except Exception as e:
            logging.error(f"Error for nr_topics={nr_topics}: {e}")
            
    with open(OUT_PATH, "w") as f:
        json.dump(cache, f, indent=2)
        
    logging.info(f"Wrote topic_cache.json with keys: {list(cache.keys())}")
    
    elapsed = time.time() - start_time
    logging.info(f"Total time: {elapsed:.1f}s")
