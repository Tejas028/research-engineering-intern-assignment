import duckdb
import numpy as np
from sentence_transformers import SentenceTransformer
import os
import time
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "narrativenet.db")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "embeddings_cache.npz")

if __name__ == "__main__":
    start_time = time.time()
    
    # DB connection
    con = duckdb.connect(DB_PATH, read_only=True)
    res = con.execute("SELECT id, title, selftext FROM posts ORDER BY id").fetchall()
    
    texts = []
    ids = []
    for row in res:
        pid = str(row[0])
        title = str(row[1]) if row[1] else ""
        selftext = str(row[2]) if row[2] else ""
        
        body = selftext if selftext and selftext not in ("", "[removed]", "[deleted]") else ""
        text = f"{title} {body}".strip()
        
        texts.append(text)
        ids.append(pid)
        
    logging.info(f"Loaded {len(texts)} posts from DB")
    
    # Model loading
    logging.info("Loading SentenceTransformer model...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    logging.info("Model loaded.")
    
    # Encoding
    embeddings = model.encode(
        texts,
        batch_size=64,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    logging.info(f"Embeddings shape: {embeddings.shape}")
    
    # Validation
    if embeddings.shape != (len(texts), 384):
        logging.error(f"Shape assertion failed. Expected shape {(len(texts), 384)}, got {embeddings.shape}")
        import sys
        sys.exit(1)
        
    # Save Output
    np.savez_compressed(
        OUT_PATH, 
        embeddings=embeddings.astype(np.float32), 
        ids=np.array(ids, dtype=str)
    )
    
    elapsed = time.time() - start_time
    logging.info(f"Saved embeddings_cache.npz to {OUT_PATH}")
    logging.info(f"Total time: {elapsed:.1f}s")
