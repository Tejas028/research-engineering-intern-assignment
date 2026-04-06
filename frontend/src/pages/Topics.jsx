import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TopicCard, LoadingSkeleton, SectionHeader, Card } from "../components/ui";
import { getTopics, getTopicPosts, getTopicInfluence } from "../api";
import { Layers, Target, TrendingUp, ExternalLink } from "lucide-react";

const COLORS = [
  "#4F6EF7","#34D399","#FBBF24","#E24B4A","#8B5CF6",
  "#06B6D4","#F87171","#84CC16","#EC4899","#14B8A6"
];

export default function Topics() {
  const [nrTopics, setNrTopics] = useState(12);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [topicPosts, setTopicPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [influenceData, setInfluenceData] = useState({});

  const fetchTopics = useCallback(async (n) => {
    setLoading(true);
    try {
      const res = await getTopics({ nr_topics: n });
      setTopics(res.data?.topics || []);
    } catch (e) {
      console.error(e);
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTopics(nrTopics); }, [nrTopics, fetchTopics]);

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

  const selectedTopic = topics.find(t => t.topic_id === selectedId);

  return (
    <div className="flex flex-col xl:flex-row gap-10">
      
      {/* LEFT: TOPIC EXPLORER */}
      <div className="flex-1 space-y-8">
        <header>
          <SectionHeader 
            badge="Semantic Clustering"
            title="Narrative Clusters" 
            subtitle="Thematic grouping via LDA & BERTopic embeddings"
          />
        </header>

        {/* Controls */}
        <div className="flex items-center gap-4 pb-6 border-b border-white/5">
           <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest mr-2">Resolution:</span>
           <div className="flex gap-2">
            {[8, 12, 20, 32].map(n => (
              <button
                key={n}
                onClick={() => setNrTopics(n)}
                className={`
                  px-4 py-1.5 rounded-xl font-mono text-[10px] transition-all
                  ${nrTopics === n 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                    : "bg-white/5 text-white/30 hover:text-white/60 hover:bg-white/10"}
                `}
              >
                {n} CLUSTERS
              </button>
            ))}
           </div>
        </div>

        {/* Topic Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 9 }).map((_, i) => <LoadingSkeleton key={i} height={180} className="rounded-2xl" />)
          ) : (
            topics.map((t, i) => {
              const color = COLORS[i % COLORS.length];
              const isSelected = selectedId === t.topic_id;
              const influenceList = influenceData[String(nrTopics)] || [];
              const inf = influenceList.find(x => x.topic_id === t.topic_id);
              const infScore = inf ? inf.influence_score : 0;

              return (
                <div key={t.topic_id} className="group relative">
                   <TopicCard 
                    label={t.label}
                    words={t.words}
                    count={t.count}
                    color={color}
                    selected={isSelected}
                    onClick={() => setSelectedId(isSelected ? null : t.topic_id)}
                  />
                  {infScore > 0 && (
                    <div className="absolute bottom-4 right-4 flex items-center gap-1.5 font-mono text-[9px] text-yellow-500/80">
                      <TrendingUp size={10} />
                      <span>{(infScore * 1000).toFixed(1)}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT: DRILLDOWN PANEL */}
      <aside className="w-full xl:w-[400px] flex-shrink-0 space-y-6">
        <div className="h-screen sticky top-12 overflow-y-auto pb-20 scrollbar-hide">
          {!selectedTopic ? (
             <Card className="p-10 text-center border-dashed border-white/10 bg-transparent flex flex-col items-center justify-center min-h-[400px]">
                <Layers className="text-white/10 mb-6" size={48} strokeWidth={1} />
                <p className="font-mono text-[12px] text-white/30 leading-relaxed max-w-[200px]">
                  Select a narrative cluster to analyze word distributions and discourse metadata.
                </p>
             </Card>
          ) : (
            <div className="space-y-6 animate-slide-up">
              {/* Significance Bar Chart */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-serif text-xl font-bold text-white">{selectedTopic.label}</h3>
                  <button onClick={() => setSelectedId(null)} className="text-white/20 hover:text-white/50 transition-colors">✕</button>
                </div>

                <div className="h-[280px] mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedTopic.words.slice(0, 10).map((w, i) => ({ word: w, val: 10 - i }))} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis 
                        type="category" 
                        dataKey="word" 
                        width={80} 
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "DM Mono" }} 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} contentStyle={{ backgroundColor: "#080808", border: "1px solid #222", borderRadius: "8px" }} />
                      <Bar dataKey="val" fill="rgba(59,130,246,0.3)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="font-mono text-[9px] text-white/20 uppercase tracking-widest text-center">
                  Keyword Significance (c-TF-IDF Weighting)
                </div>
              </Card>

              {/* Representative Content Feed */}
              <div className="space-y-4">
                 <div className="flex items-center gap-2 px-2 font-mono text-[10px] text-white/30 uppercase tracking-[0.2em]">
                    <Target size={12} className="text-blue-500" /> Representative Content
                 </div>
                 
                 {postsLoading ? (
                   [1,2,3].map(i => <LoadingSkeleton key={i} height={80} className="rounded-xl" />)
                 ) : (
                   <div className="space-y-3">
                     {topicPosts.map(p => (
                       <Card key={p.id} className="p-4 group">
                         <a href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                            <div className="font-sans text-[14px] font-medium text-white/80 group-hover:text-white leading-snug mb-3 transition-colors">
                              {p.title}
                            </div>
                            <div className="flex items-center justify-between">
                               <div className="flex items-center gap-3">
                                  <span className="font-mono text-[9px] text-orange-400/80 px-2 py-0.5 bg-orange-500/10 rounded">r/{p.subreddit}</span>
                                  <span className="font-mono text-[9px] text-white/20">↑{p.score}</span>
                               </div>
                               <ExternalLink size={10} className="text-white/10 group-hover:text-white/40 mb-1" />
                            </div>
                         </a>
                       </Card>
                     ))}
                   </div>
                 )}
              </div>
            </div>
          )}
        </div>
      </aside>

    </div>
  );
}
