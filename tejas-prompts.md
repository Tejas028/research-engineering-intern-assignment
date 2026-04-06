# AI Prompts Log — SimPPL Research Engineering Intern Assignment

This file documents all AI-assisted prompts used during development of the SimPPL dashboard. 

The goal is to demonstrate iterative engineering thinking while using AI tools by showing:
1. The **component** being built.
2. The **prompt** given to the AI.
3. The **issue** observed in the output.
4. The **fix** or refinement applied.

---

### Prompt 1
**Component:** Project architecture and initial scaffolding

**Prompt:**
> You are an expert full-stack engineer. I am building a production-grade research dashboard for SimPPL (a nonprofit focused on misinformation analysis). 
> 
> Help me design the full project architecture using:
> - FastAPI (backend)
> - React + TailwindCSS (frontend)
> - DuckDB (analytics DB)
> - FAISS + sentence-transformers (semantic search)
> - HDBSCAN + KMeans fallback (clustering)
> - NetworkX (graph analysis)
> - Gemini API for summaries
> 
> Output:
> 1. Folder structure
> 2. Key modules and responsibilities
> 3. Data flow from ingestion → analysis → frontend
> 
> Do not generate full code yet. Focus only on architecture and design clarity.

**Issue & Fix:**
- **Issue:** Initial output tried to generate too much code and lacked clear separation of responsibilities.
- **Fix:** Refined prompt to explicitly restrict to architecture only and emphasize modular design.

---

### Prompt 2
**Component:** Data ingestion pipeline (JSONL → DuckDB)

**Prompt:**
> Now implement the data ingestion layer. 
> 
> Requirements:
> 1. Read JSONL file line-by-line
> 2. Dynamically detect schema (print first 3 records' keys)
> 3. Handle missing fields gracefully
> 4. Normalize timestamps
> 5. Deduplicate by post ID
> 6. Store data in DuckDB table `posts`
> 
> Focus only on:
> - `loader.py`
> - Clean, robust error handling
> 
> Do not proceed to embeddings yet.

**Issue & Fix:**
- **Issue:** Model assumed fixed schema instead of dynamic detection.
- **Fix:** Explicitly instructed schema detection and fallback defaults.

---

### Prompt 3
**Component:** Embedding generation + FAISS index

**Prompt:**
> Extend the pipeline to generate semantic embeddings.
> 
> Requirements:
> 1. Use `sentence-transformers` (`all-MiniLM-L6-v2`)
> 2. Generate embeddings for post text
> 3. Store embeddings efficiently
> 4. Build FAISS index and save to disk
> 5. Reload index if already exists
> 
> Ensure:
> - No recomputation on restart
> - Logging for index creation

**Issue & Fix:**
- **Issue:** FAISS index was being rebuilt every run.
- **Fix:** Added explicit condition to check for saved index file.

---

### Prompt 4
**Component:** Semantic search + chatbot

**Prompt:**
> Implement semantic search with FAISS and integrate Gemini API.
> 
> Flow:
> 1. User query → embedding
> 2. FAISS → top K results
> 3. Gemini → summary of results
> 4. Gemini → 2–3 follow-up queries
> 
> Edge cases:
> - Empty query
> - Short query
> - Non-English query
> 
> Return structured JSON response.

**Issue & Fix:**
- **Issue:** Search behaved like keyword matching instead of semantic.
- **Fix:** Ensured embedding-based similarity search only (no keyword filtering).

---

### Prompt 5
**Component:** Time-series analytics

**Prompt:**
> Create a time-series analysis module.
> 
> Requirements:
> 1. Aggregate posts by day/week
> 2. Return counts for visualization
> 3. Handle sparse and empty datasets
> 4. Integrate Gemini to generate dynamic summaries based on actual data

**Issue & Fix:**
- **Issue:** Summary text was static and not data-driven.
- **Fix:** Passed actual data points into Gemini prompt.

---

### Prompt 6
**Component:** Network graph construction

**Prompt:**
> Build a user interaction graph using NetworkX. 
> 
> Requirements:
> 1. Nodes = users
> 2. Edges = replies/mentions/retweets
> 3. Compute PageRank
> 4. Apply Louvain community detection
> 
> Ensure:
> - Handles disconnected graphs
> - Works even with sparse interaction data

**Issue & Fix:**
- **Issue:** Graph had 0 edges due to incorrect relation extraction.
- **Fix:** Improved edge creation logic using mentions + reply relationships.

---

### Prompt 7
**Component:** Network graph performance optimization

**Prompt:**
> Fix performance issues in the network graph.
> 
> Problems:
> 1. Too many nodes rendered
> 2. UI lagging
> 3. Influence filter not working properly
> 
> Tasks:
> 1. Limit nodes (top N by PageRank)
> 2. Fix filtering logic
> 3. Reduce rendering load
> 4. Ensure smooth interaction

**Issue & Fix:**
- **Issue:** Rendering full graph caused lag.
- **Fix:** Introduced node thresholding and filtering before rendering.

---

### Prompt 8
**Component:** Topic clustering

**Prompt:**
> Implement topic clustering using embeddings.
> 
> Requirements:
> 1. Primary: HDBSCAN
> 2. Fallback: KMeans
> 3. Configurable `n_clusters`
> 4. Handle edge cases (2 clusters, 50 clusters)
> 5. Label clusters using Gemini

**Issue & Fix:**
- **Issue:** Backend hung on large clustering requests.
- **Fix:** Added input validation for cluster size, introduced fallback logic, and limited dataset size.

---

### Prompt 9
**Component:** Clustering visualization bug fix

**Prompt:**
> Fix clustering visualization issues.
> 
> Problems:
> 1. Backend freezes on "Apply"
> 2. No projection map generated
> 
> Tasks:
> 1. Optimize clustering execution
> 2. Ensure UMAP projection runs correctly
> 3. Return visualization-ready data

**Issue & Fix:**
- **Issue:** UMAP + clustering pipeline too heavy synchronously.
- **Fix:** Reduced dataset size, optimized pipeline, and added graceful failure handling.

---

### Prompt 10
**Component:** Frontend UI redesign (phase 1)

**Prompt:**
> Redesign the frontend UI of the dashboard.
> 
> Constraints:
> - Do NOT modify backend logic
> - Keep all API calls intact
> 
> Focus:
> - Layout
> - Typography
> - Color system
> - Sidebar navigation
> 
> Style:
> Clean, modern, professional.

**Issue & Fix:**
- **Issue:** Output looked like generic SaaS dashboard.
- **Fix:** Provided strict design language in subsequent iteration.

---

### Prompt 11
**Component:** Frontend UI redesign (editorial style)

**Prompt:**
> Redesign UI to match investigative journalism style.
> 
> Inspiration:
> - The Guardian
> - NYT Upshot
> - Bellingcat
> 
> Requirements:
> 1. Serif headings
> 2. Minimalist layout
> 3. No dark theme
> 4. No generic cards

**Issue & Fix:**
- **Issue:** Dark theme still persisted globally.
- **Fix:** Forced global CSS overrides in next prompt.

---

### Prompt 12
**Component:** Global theme fix

**Prompt:**
> Fix the entire app theme.
> 
> Problems:
> 1. Dark background overriding everything
> 
> Tasks:
> 1. Replace with light warm background
> 2. Remove all dark classes
> 3. Fix root styles (`html`, `body`, `App.jsx`)

**Issue & Fix:**
- **Issue:** Some components still had hardcoded dark styles.
- **Fix:** Enforced inline styles for critical layout elements.

---

### Prompt 13
**Component:** Final UI rebuild

**Prompt:**
> Rebuild the frontend UI visually from scratch.
> 
> Constraints:
> - Do NOT change logic or API calls
> - Only modify styling and layout
> 
> Design:
> - Light main content
> - Dark sidebar
> - Strong typography
> - Clean spacing
> - Smooth UX

**Issue & Fix:**
- **Issue:** Inconsistent styling across components.
- **Fix:** Standardized design system and reused patterns.

---

### Prompt 14
**Component:** Final bug fixing and stabilization

**Prompt:**
> Fix remaining issues:
> 
> Network graph:
> 1. 0 edges issue
> 2. Too many nodes
> 3. Laggy performance
> 4. Influence filter not working
> 
> Topic clusters:
> 1. Backend hanging
> 2. No visualization output
> 
> Focus:
> - Performance optimization
> - Correct logic
> - Graceful error handling

**Issue & Fix:**
- **Issue:** Combined computational + rendering inefficiencies.
- **Fix:** Reduced dataset size, added pre-filtering, and improved pipeline stability.

---

## Summary
Throughout development, AI was used as a collaborative tool to iterate on complex system designs and debugging tasks. Key practices followed:
- Broke large features into modular prompts.
- Iteratively refined outputs after identifying gaps.
- Manually fixed logic/performance issues where AI output was insufficient.
- This approach ensured a robust, production-ready system.
