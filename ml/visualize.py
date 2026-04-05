import numpy as np
import json
import os
import logging

from umap import UMAP
import datamapplot
from bertopic import BERTopic
from hdbscan import HDBSCAN
from sklearn.feature_extraction.text import CountVectorizer
import duckdb

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

DB_PATH    = os.path.join(os.path.dirname(__file__), "..", "narrativenet.db")
EMB_PATH   = os.path.join(os.path.dirname(__file__), "..", "embeddings_cache.npz")
CACHE_PATH = os.path.join(os.path.dirname(__file__), "..", "topic_cache.json")
OUT_DIR    = os.path.join(os.path.dirname(__file__), "..", "static")
OUT_PATH   = os.path.join(OUT_DIR, "topic_map.html")

os.makedirs(OUT_DIR, exist_ok=True)

if __name__ == "__main__":
    import time
    start_time = time.time()
    
    con = duckdb.connect(DB_PATH, read_only=True)
    res = con.execute("SELECT id, title, selftext FROM posts ORDER BY id").fetchall()
    
    texts = []
    for row in res:
        title = str(row[1]) if row[1] else ""
        selftext = str(row[2]) if row[2] else ""
        body = selftext if selftext and selftext not in ("", "[removed]", "[deleted]") else ""
        text = f"{title} {body}".strip()
        texts.append(text)
        
    data = np.load(EMB_PATH, allow_pickle=True)
    embeddings = data["embeddings"].astype(np.float32)
    ids = data["ids"].tolist()
    
    umap_2d = UMAP(
        n_neighbors=15,
        n_components=2,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
    )
    logging.info("Starting 2D UMAP projection...")
    embedding_2d = umap_2d.fit_transform(embeddings)
    logging.info(f"2D projection complete, shape: {embedding_2d.shape}")
    
    topic_model = BERTopic(
        umap_model=UMAP(n_neighbors=15, n_components=5, min_dist=0.0, metric="cosine", random_state=42),
        hdbscan_model=HDBSCAN(min_cluster_size=15, metric="euclidean", prediction_data=True),
        vectorizer_model=CountVectorizer(stop_words="english", min_df=2, ngram_range=(1, 2)),
        nr_topics=20,
        calculate_probabilities=False,
        verbose=False,
    )
    logging.info("Fitting BERTopic with nr_topics=20 for labels...")
    topics, _ = topic_model.fit_transform(texts, embeddings)
    
    topic_labels_map = {
        row["Topic"]: row["Name"]
        for _, row in topic_model.get_topic_info().iterrows()
    }
    labels = [
        topic_labels_map.get(t, "Uncategorized") if t != -1 else "Uncategorized"
        for t in topics
    ]
    
    unique_labels = len(set(labels))
    logging.info(f"Assigned 8799 posts to {unique_labels} unique labels.")
    
    logging.info("Rendering Datamapplot...")
    try:
        plot = datamapplot.create_interactive_plot(
            embedding_2d,
            labels,
            title="NarrativeNet — Reddit Political Topic Map",
            sub_title="8,799 posts · July 2024–Feb 2025 · 10 subreddits",
            noise_label="Uncategorized",
            darkmode=False,
        )
        plot.save(OUT_PATH)
        logging.info(f"Saved interactive HTML to {OUT_PATH}")
    except AttributeError:
        # Fall back to saving static PNG and wrapping it
        import matplotlib.pyplot as plt
        fig, ax = datamapplot.create_plot(
            embedding_2d,
            labels,
            title="NarrativeNet — Reddit Political Topic Map",
            sub_title="8,799 posts · July 2024–Feb 2025 · 10 subreddits",
            label_over_points=True,
            dynamic_label_size=True,
            noise_label="Uncategorized",
            darkmode=False,
        )
        png_path = OUT_PATH.replace(".html", ".png")
        fig.savefig(png_path, dpi=150, bbox_inches="tight")
        html = f'<html><body style="margin:0"><img src="{os.path.basename(png_path)}" style="width:100%;height:auto"></body></html>'
        with open(OUT_PATH, "w") as f:
            f.write(html)
        logging.info(f"Saved static PNG fallback to {png_path}")
        
    elapsed = time.time() - start_time
    logging.info(f"Total time: {elapsed:.1f}s")
