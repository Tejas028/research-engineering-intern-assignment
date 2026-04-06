FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    python3-dev \
    libgomp1 \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Step 1: pin numpy FIRST before anything else installs it
# numpy 1.26.4 is the last 1.x release — fully compatible with
# scipy, sklearn, sentence-transformers, and torch 2.2
RUN pip install --no-cache-dir "numpy==1.26.4"

# Step 2: install torch CPU — must come before transformers/sentence-transformers
# so torch doesn't drag in a different numpy
RUN pip install --no-cache-dir \
    "torch==2.2.0" \
    "torchvision==0.17.0" \
    --index-url https://download.pytorch.org/whl/cpu

# Step 3: install scipy and sklearn explicitly at compatible versions
# BEFORE requirements.txt so pip doesn't pick incompatible versions
RUN pip install --no-cache-dir \
    "scipy==1.11.4" \
    "scikit-learn==1.5.1"

# Step 4: install everything else
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Step 5: verify numpy ABI is intact — if this fails the build fails loudly
RUN python -c "\
import numpy as np; \
import scipy.sparse; \
import sklearn; \
from sentence_transformers import SentenceTransformer; \
print(f'numpy {np.__version__} OK'); \
print(f'scipy OK'); \
print(f'sklearn OK'); \
print(f'sentence_transformers OK')"

# Step 6: copy project files
COPY . .

# Step 7: pre-download model at build time so healthcheck never waits for it
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
SentenceTransformer('all-MiniLM-L6-v2'); \
print('Model cached.')"

# Step 8: verify DB and embeddings are present
RUN python -c "\
import duckdb, numpy as np; \
conn = duckdb.connect('narrativenet.db', read_only=True); \
rows = conn.execute('SELECT COUNT(*) FROM posts').fetchone()[0]; \
conn.close(); \
print(f'DB OK: {rows} rows'); \
d = np.load('embeddings_cache.npz', allow_pickle=True); \
print(f'Embeddings OK: {d[\"embeddings\"].shape}')"

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 75"]
