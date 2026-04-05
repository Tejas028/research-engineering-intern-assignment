import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TopicCard, LoadingSkeleton, SectionHeader, InfoTooltip } from "../components/ui";
import { getTopicPosts, getTopicInfluence } from "../api";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const COLORS = [
  "#4F6EF7","#34D399","#FBBF24","#EF4444","#8B5CF6",
  "#06B6D4","#F87171","#84CC16","#EC4899","#14B8A6",
  "#A855F7","#F43F5E"
];

export default function Topics() {
  const [nrTopics, setNrTopics] = useState(10);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [sortBy, setSortBy] = useState("count");
  const [topicPosts, setTopicPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [influenceData, setInfluenceData] = useState({});
  const debounceRef = useRef(null);

  const fetchTopics = useCallback(async (n) => {
    setLoading(true);
    setError(null);
    setSelectedId(null);
    try {
      const res = await axios.get(`${API}/api/topics`, { params: { nr_topics: n }, timeout: 20000 });
      setTopics(res.data?.topics || []);
    } catch (e) {
      if (e.code === "ECONNABORTED") {
        setError("Request timed out — clustering can take a moment. Try again.");
      } else {
        setError(e.response?.data?.error || "Failed to load topics.");
      }
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics(nrTopics);
  }, []);

  useEffect(() => {
    getTopicInfluence()
      .then(res => setInfluenceData(res.data?.influence || {}))
      .catch(() => setInfluenceData({}));
  }, []);

  useEffect(() => {
    if (selectedId === null) { setTopicPosts([]); return; }
    setPostsLoading(true);
    getTopicPosts({ topic_id: selectedId, nr_topics: nrTopics, limit: 5 })
      .then(res => setTopicPosts(res.data?.posts || []))
      .catch(() => setTopicPosts([]))
      .finally(() => setPostsLoading(false));
  }, [selectedId, nrTopics]);

  const totalPosts = topics.reduce((s, t) => s + t.count, 0);
  
  const sortedTopics = [...topics].sort((a, b) => {
    if (sortBy === "count") return b.count - a.count;
    return a.topic_id - b.topic_id;
  });

  const selectedTopic = topics.find(t => t.topic_id === selectedId);
  const selectedIndex = topics.findIndex(t => t.topic_id === selectedId);

  return (
    <div className="space-y-6">
      
      {/* Controls */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 rounded-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SectionHeader title="Topic Clusters" subtitle="BERTopic · all-MiniLM-L6-v2 · 8,799 posts"/>
            <InfoTooltip content="BERTopic groups posts by semantic meaning using sentence embeddings, not keyword matching. Each cluster is a distinct narrative thread. Cluster size = number of posts. Influence score = PageRank-weighted author activity in that cluster." />
          </div>
          <button onClick={() => setShowMap(true)} className="bg-[var(--bg-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-[12px] px-4 py-2.5 rounded-lg border border-[var(--border-subtle)] transition-colors font-medium">
            View Embedding Map (UMAP)
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={nrTopics}
            onChange={(e) => {
              const val = Number(e.target.value);
              setNrTopics(val);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => fetchTopics(val), 400);
            }}
            className="w-full"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {[5, 10, 20, 30, 50].map((n) => (
            <button
              key={n}
              onClick={() => {
                setNrTopics(n);
                clearTimeout(debounceRef.current);
                fetchTopics(n);
              }}
              className={`text-[11px] px-3 py-1 rounded-full border transition-colors ${nrTopics === n ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white" : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)]"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-[var(--text-secondary)] text-[12px]">
          Showing {topics.length} clusters <span className="mx-1">•</span> {totalPosts.toLocaleString()} posts indexed
        </p>
        <div className="flex items-center gap-2 bg-[var(--bg-elevated)] p-1 rounded-md border border-[var(--border-subtle)]">
          <button onClick={() => setSortBy("count")} className={`text-[11px] px-2.5 py-1 rounded transition-colors ${sortBy === "count" ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>By post count</button>
          <button onClick={() => setSortBy("id")} className={`text-[11px] px-2.5 py-1 rounded transition-colors ${sortBy === "id" ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>By cluster ID</button>
        </div>
      </div>

      {error && (
        <div className="border border-[var(--accent-danger)]/50 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Main Grid / Detail Layout */}
      <div className="flex flex-col lg:flex-row gap-6 relative">
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 flex-1 items-start content-start`}>
          {loading ? (
            Array.from({ length: Math.min(nrTopics, 12) }).map((_, i) => (
              <LoadingSkeleton key={i} height={160} className="rounded-xl" />
            ))
          ) : (
            sortedTopics.map((t, i) => {
              const origIndex = topics.findIndex(orig => orig.topic_id === t.topic_id);
              const color = COLORS[origIndex % COLORS.length];
              const isSelected = selectedId === t.topic_id;
              
              const influenceList = influenceData[String(nrTopics)] || [];
              const inf = influenceList.find(x => x.topic_id === t.topic_id);
              const infScore = inf ? inf.influence_score : 0;

              return (
                <div key={t.topic_id}>
                  <TopicCard 
                    label={t.label}
                    words={t.words}
                    count={t.count}
                    color={color}
                    selected={isSelected}
                    onClick={() => setSelectedId(isSelected ? null : t.topic_id)}
                  />
                  {infScore > 0 && (
                    <div style={{
                      marginTop: 4, padding: "2px 8px", fontFamily: "JetBrains Mono",
                      fontSize: 10, color: "var(--accent-warn)",
                      display: "flex", alignItems: "center", gap: 4
                    }}>
                      <span>▲</span>
                      <span>Influence: {(infScore * 1000).toFixed(1)}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        {selectedTopic && (
          <div className="lg:w-80 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 self-start sticky top-6 shadow-xl z-10 animate-slide-up">
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-[var(--text-primary)] font-semibold text-[14px] pr-4 leading-snug">{selectedTopic.label}</h3>
              <button onClick={() => setSelectedId(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs whitespace-nowrap bg-[var(--bg-elevated)] px-2 py-1 rounded">✕</button>
            </div>
            
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={selectedTopic.words.slice(0, 10).map((w, i) => ({ word: w, rank: 10 - i }))} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="word" width={90} tick={{ fontSize: 11, fill: "var(--text-secondary)", fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "var(--bg-elevated)" }} formatter={(value, name, props) => [`Rank ${11 - value}`, "Importance"]} contentStyle={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-active)", borderRadius: "8px", fontSize: "12px", color: "var(--text-primary)", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ marginTop: 16, borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
              <div style={{
                fontFamily: "JetBrains Mono", fontSize: 10, color: "var(--text-muted)",
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10
              }}>Representative Posts</div>
              {postsLoading && [1,2,3].map(i => (
                <LoadingSkeleton key={i} height={56} className="rounded-lg mb-2" />
              ))}
              {!postsLoading && topicPosts.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No posts cached for this cluster.</div>
              )}
              {!postsLoading && topicPosts.map(p => (
                <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", textDecoration: "none", marginBottom: 8,
                    background: "var(--bg-elevated)", borderRadius: 8, padding: "8px 10px",
                    border: "1px solid var(--border-subtle)", transition: "all 150ms" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-active)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-subtle)"}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                    {p.title}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 10,
                      background: "var(--bg-surface)", color: "var(--text-muted)",
                      padding: "1px 6px", borderRadius: 4 }}>{p.subreddit}</span>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 10,
                      color: "var(--text-muted)" }}>↑{p.score}</span>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 10,
                      color: "var(--text-muted)", marginLeft: "auto" }}>{p.created_utc}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-[10px] font-mono text-[var(--text-muted)] space-y-1.5 pt-12 opacity-80">
        <p>MODEL · BERTopic with all-MiniLM-L6-v2 (384-dim) sentence embeddings</p>
        <p>DIM REDUCTION · UMAP (n_neighbors=15, min_dist=0.0, n_components=5, random_state=42)</p>
        <p>CLUSTERING · HDBSCAN (min_cluster_size=10, metric=euclidean)</p>
        <p>REPR · c-TF-IDF with CountVectorizer (stop_words=english, max_features=10000)</p>
        <p>VIZ · Datamapplot UMAP 2D projection served from /static/topic_map.html</p>
      </div>

      {showMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-slide-up" onClick={() => setShowMap(false)}>
          <div className="w-full max-w-5xl h-[80vh] rounded-2xl overflow-hidden border border-[var(--border-subtle)] m-4 relative shadow-2xl" onClick={e => e.stopPropagation()}>
            <iframe src={`${API}/api/topics/map`} className="w-full h-full bg-white" title="Topic Embedding Map" />
            <button onClick={() => setShowMap(false)} className="absolute top-4 right-4 bg-black/60 text-white hover:bg-black w-8 h-8 rounded-full flex items-center justify-center text-xl transition-colors">
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
