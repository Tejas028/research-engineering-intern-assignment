import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { getNetwork, getAuthorDetail } from "../api";
import { LoadingSkeleton, Card, SectionHeader } from "../components/ui";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from "recharts";
import { Network as NetIcon, User, Share2, Info, Filter, TrendingUp } from "lucide-react";

const COMMUNITY_COLORS = [
  "#4F6EF7", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#06B6D4", "#F43F5E", "#84CC16"
];

export default function Network() {
  const svgRef = useRef(null);
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minEdgeWeight, setMinEdgeWeight] = useState(3);
  const [selectedAuthor, setSelectedAuthor] = useState(null);
  const [authorProfile, setAuthorProfile] = useState(null);
  const [authorLoading, setAuthorLoading] = useState(false);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNetwork({ min_shared_domains: minEdgeWeight, limit_nodes: 100 });
      setGraphData(res.data);
    } catch (e) {
      console.error(e);
      setGraphData({ nodes: [], edges: [] });
    } finally {
      setLoading(false);
    }
  }, [minEdgeWeight]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  useEffect(() => {
    if (!selectedAuthor) return;
    setAuthorLoading(true);
    getAuthorDetail({ author: selectedAuthor })
      .then(res => setAuthorProfile(res.data))
      .catch(() => setAuthorProfile(null))
      .finally(() => setAuthorLoading(false));
  }, [selectedAuthor]);

  useEffect(() => {
    if (!graphData || !svgRef.current || loading) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = 550;

    const nodes = graphData.nodes.map(d => ({ ...d }));
    const links = graphData.edges.map(d => ({ ...d }));

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const g = svg.append("g");
    
    svg.call(d3.zoom()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => g.attr("transform", event.transform)));

    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("stroke", "rgba(255,255,255,0.05)")
      .attr("stroke-width", d => Math.max(1, Math.sqrt(d.weight || 1)));

    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .style("cursor", "pointer")
      .on("click", (e, d) => setSelectedAuthor(d.id));

    node.append("circle")
      .attr("r", d => 6 + (d.pagerank || 0) * 1000)
      .attr("fill", d => COMMUNITY_COLORS[(d.community || 0) % COMMUNITY_COLORS.length])
      .attr("stroke", "#0a0a0a")
      .attr("stroke-width", 2)
      .attr("class", "hover:stroke-white transition-all duration-300");

    // Shadow for nodes
    const filter = svg.append("defs").append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    filter.append("feGaussianBlur").attr("stdDeviation", "2.5").attr("result", "blur");
    filter.append("feComposite").attr("in", "SourceGraphic").attr("in2", "blur").attr("operator", "over");

    simulation.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [graphData, loading]);

  return (
    <div className="flex flex-col xl:flex-row gap-10">
      
      {/* CENTRAL: GRAPH VIEWPORT */}
      <div className="flex-1 space-y-8">
        <header>
          <SectionHeader 
            badge="Network Topology"
            title="Information Coordination Graph" 
            subtitle="Author-domain co-sharing clusters determining propaganda hubs"
          />
        </header>

        <div className="flex items-center gap-6 pb-6 border-b border-white/5">
           <div className="flex items-center gap-4 bg-white/5 px-5 py-2.5 rounded-2xl border border-white/10 group">
              <Filter size={14} className="text-blue-400" />
              <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest mr-2">Min Co-Sharing:</span>
              <input 
                type="range" min="1" max="10" value={minEdgeWeight} 
                onChange={e => setMinEdgeWeight(e.target.value)}
                className="w-24 accent-blue-500 cursor-pointer"
              />
              <span className="font-mono text-[10px] text-white font-bold">{minEdgeWeight}</span>
           </div>

           <div className="flex items-center gap-6 font-mono text-[9px] text-white/20 uppercase tracking-widest">
              <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" /> Propagative</div>
              <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> Informational</div>
           </div>
        </div>

        <Card className="relative h-[600px] overflow-hidden bg-black/40 border-white/5">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10 transition-opacity">
                <div className="flex flex-col items-center gap-4 animate-pulse">
                   <NetIcon size={32} className="text-white/20 animate-spin-slow" />
                   <span className="font-mono text-[11px] text-white/30 uppercase tracking-[0.3em]">Computing Topology...</span>
                </div>
              </div>
            )}
            <svg ref={svgRef} width="100%" height="600" className="cursor-move" />
            
            <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-none">
               <div className="font-mono text-[9px] text-white/20 text-right uppercase tracking-[0.15em]">Algorithm: Modularity Optimization v2</div>
               <div className="font-mono text-[9px] text-white/20 text-right uppercase tracking-[0.15em]">Centrality: Eigenvector Ranking</div>
            </div>
        </Card>
      </div>

      {/* RIGHT: AUTHOR INTELLIGENCE PROFILE */}
      <aside className="w-full xl:w-[400px] flex-shrink-0 space-y-6">
        <div className="h-screen sticky top-12 overflow-y-auto pb-20 scrollbar-hide">
          {!selectedAuthor ? (
             <Card className="p-10 text-center border-dashed border-white/10 bg-transparent flex flex-col items-center justify-center min-h-[450px]">
                <User className="text-white/10 mb-8" size={64} strokeWidth={0.5} />
                <p className="font-mono text-[12px] text-white/30 leading-relaxed max-w-[220px]">
                  Select an author node in the graph to decode their narrative footprint and risk profile.
                </p>
             </Card>
          ) : (
            <div className="space-y-6 animate-slide-up">
              
              <Card className="p-8 border-l-4 border-l-blue-500">
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="font-mono text-[10px] text-blue-400 uppercase tracking-widest">Target Subject</div>
                      <h3 className="font-serif text-2xl font-bold text-white tracking-tight">u/{selectedAuthor}</h3>
                    </div>
                    <button onClick={() => setSelectedAuthor(null)} className="text-white/20 hover:text-white/40 transition-colors">✕</button>
                  </div>

                  {authorLoading ? (
                    <div className="space-y-4">
                      <LoadingSkeleton height={40} className="w-full" />
                      <LoadingSkeleton height={120} className="w-full" />
                    </div>
                  ) : authorProfile ? (
                    <div className="space-y-8">
                       <div className="grid grid-cols-2 gap-4">
                          {[
                            { l: "RISK LEVEL", v: `${authorProfile.profile.bot_score}%`, color: "text-red-400" },
                            { l: "EIGENVECTOR", v: (authorProfile.profile.pagerank * 100).toFixed(2), color: "text-blue-400" },
                            { l: "LINK DENSITY", v: (authorProfile.profile.external_link_ratio * 100).toFixed(0) + "%", color: "text-white/80" },
                            { l: "AVG ENGAGEMENT", v: authorProfile.profile.avg_score, color: "text-white/80" }
                          ].map(s => (
                             <div key={s.l} className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                <span className="font-mono text-[8px] text-white/20 uppercase tracking-widest block mb-1.5">{s.l}</span>
                                <span className={`font-mono text-lg font-bold ${s.color}`}>{s.v}</span>
                             </div>
                          ))}
                       </div>

                       <div className="space-y-4">
                          <div className="flex items-center gap-2 font-mono text-[10px] text-white/30 uppercase tracking-[0.2em] px-1">
                             <TrendingUp size={12} className="text-blue-400" /> Propagation Activity
                          </div>
                          <div className="h-[100px] w-full pt-4">
                             <ResponsiveContainer width="100%" height="100%">
                               <LineChart data={authorProfile.timeline}>
                                 <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
                               </LineChart>
                             </ResponsiveContainer>
                          </div>
                       </div>

                       <div className="space-y-4 pt-6 border-t border-white/5">
                          <div className="flex items-center gap-2 font-mono text-[10px] text-white/30 uppercase tracking-[0.2em] px-1">
                             <Share2 size={12} className="text-orange-400" /> Primary Dissemination Links
                          </div>
                          <div className="space-y-2.5">
                            {authorProfile.top_domains.slice(0, 4).map(d => (
                              <div key={d.domain} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-xl border border-white/5 group hover:bg-white/[0.06] transition-colors">
                                <span className="text-[13px] text-white/60 group-hover:text-white truncate max-w-[200px]">{d.domain}</span>
                                <span className="font-mono text-[11px] text-white/30">{d.count}x</span>
                              </div>
                            ))}
                          </div>
                       </div>
                    </div>
                  ) : (
                    <div className="text-center py-10 font-mono text-[12px] text-white/30 uppercase tracking-widest">Intelligence Gap: Profile Unreachable</div>
                  )}
                </div>
              </Card>

              <div className="px-4">
                <p className="text-[11px] text-white/20 font-mono leading-relaxed italic">
                  Note: High Eigenvector scores correlate with structural influence within cross-ideological communication clusters.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

    </div>
  );
}
