FROM python:3.11-slim

# System dependencies for UMAP/HDBSCAN (C++ compilation) and httpx
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libgomp1 \
    curl \
    python3-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pre-install build-time requirements for HDBSCAN/UMAP C extensions
# These must be installed BEFORE the rest of requirements.txt
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir "numpy<2.0.0" Cython

# Copy requirements first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files
COPY . .

# Pre-download the sentence transformer model into the image
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Pre-generate database and embeddings from raw data (needed since artifacts are Git-ignored)
RUN python ingest.py
RUN python ml/embed.py
RUN python ml/topic_model.py

# Expose port (Railway maps this automatically)
EXPOSE 8000

# Start uvicorn. Workers=1 because we load large in-memory state
# (embeddings matrix, sentence transformer) — multiple workers would
# each allocate ~500MB, exhausting Railway's free tier RAM.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "75"]
