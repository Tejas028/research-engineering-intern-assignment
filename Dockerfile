FROM python:3.11-slim

WORKDIR /app

# System dependencies
# libgomp1: required by HDBSCAN compiled C extension
# build-essential + gcc + g++: required to compile UMAP/HDBSCAN wheels
# curl: required for Railway healthcheck probe
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    python3-dev \
    libgomp1 \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Install CPU-only torch first and separately
# This pins the index URL so pip doesn't pull CUDA torch (~2GB) later
RUN pip install --no-cache-dir \
    torch==2.2.0 \
    torchvision==0.17.0 \
    --index-url https://download.pytorch.org/whl/cpu

# Install build helpers before the main requirements
# numpy<2.0.0 is required by HDBSCAN and older BERTopic versions
RUN pip install --no-cache-dir \
    "numpy<2.0.0" \
    Cython \
    setuptools \
    wheel

# Copy and install all other requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files including:
# - narrativenet.db
# - embeddings_cache.npz
# - topic_cache.json
# - static/topic_map.html
# - backend/main.py
# - ml/
COPY . .

# Pre-download sentence transformer model into the image layer
# This runs at BUILD time so Railway never downloads 90MB at healthcheck time
# If this fails the build fails loudly — which is correct behavior
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
print('Downloading all-MiniLM-L6-v2...'); \
SentenceTransformer('all-MiniLM-L6-v2'); \
print('Model cached successfully.')"

# Verify the DB and embeddings are present and readable
# If these files are missing the build fails loudly here rather than
# silently at healthcheck time
RUN python -c "\
import duckdb, numpy as np, os; \
db = os.environ.get('DB_PATH', 'narrativenet.db'); \
emb = os.environ.get('EMB_PATH', 'embeddings_cache.npz'); \
conn = duckdb.connect(db, read_only=True); \
rows = conn.execute('SELECT COUNT(*) FROM posts').fetchone()[0]; \
conn.close(); \
print(f'DB OK: {rows} rows'); \
d = np.load(emb, allow_pickle=True); \
print(f'Embeddings OK: {d[\"embeddings\"].shape}')"

# Railway injects PORT at runtime — default to 8000 for local dev
EXPOSE 8000

# Single worker because RAM allocation:
# - embeddings matrix (~13MB float32)
# - sentence transformer model (~90MB)
# - multiple workers would each allocate this, exhausting Railway free tier RAM
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 75"]
