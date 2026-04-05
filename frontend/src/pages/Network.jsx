import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { getNetwork, getAuthorDetail } from "../api";
import { SectionHeader, EmptyState, InfoTooltip, LoadingSkeleton, ErrorBanner } from "../components/ui";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from "recharts";

const COMMUNITY_COLORS = [
  "#4F6EF7", "#34D399", "#FBBF24", "#EF4444",
  "#8B5CF6", "#06B6D4", "#F87171", "#84CC16"
];

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64 w-full">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-primary)] animate-spin"></div>
    </div>
  );
}

export default function Network() {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [removedNodes, setRemovedNodes] = useState(new Set());

  // Controls
  const [minEdgeWeight, setMinEdgeWeight] = useState(2);
  const [topN, setTopN] = useState(100);

  // Tooltip
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, node: null });

  // Drilling
  const [selectedAuthor, setSelectedAuthor] = useState(null);
  const [authorProfile, setAuthorProfile] = useState(null);
  const [authorLoading, setAuthorLoading] = useState(false);

  // Fetch graph data
  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNetwork({
        min_shared_domains: minEdgeWeight,
        limit_nodes: topN,
      });
      setGraphData(res.data);
    } catch (e) {
      console.error("Network fetch error:", e);
      setGraphData({ nodes: [], edges: [], stats: {} });
    } finally {
      setLoading(false);
    }
  }, [minEdgeWeight, topN]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  useEffect(() => {
    if (!selectedAuthor) { setAuthorProfile(null); return; }
    setAuthorLoading(true);
    getAuthorDetail({ author: selectedAuthor })
      .then(res => setAuthorProfile(res.data))
      .catch(() => setAuthorProfile(null))
      .finally(() => setAuthorLoading(false));
  }, [selectedAuthor]);

  // D3 render
  useEffect(() => {
    if (!graphData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 900;
    const height = 600;

    // Filter removed nodes/edges
    const activeNodes = (graphData.nodes || []).filter(n => !removedNodes.has(n.id));
    const activeNodeIds = new Set(activeNodes.map(n => n.id));
    const activeEdges = (graphData.edges || []).filter(
      e => activeNodeIds.has(e.source?.id ?? e.source) && activeNodeIds.has(e.target?.id ?? e.target)
    );

    if (activeNodes.length === 0) return;

    // Clone to avoid mutation
    const nodes = activeNodes.map(d => ({ ...d }));
    const links = activeEdges.map(d => ({ ...d }));

    // Zoom
    const zoomGroup = svg.append("g").attr("class", "zoom-group");
    svg.call(
      d3.zoom()
        .scaleExtent([0.2, 4])
        .on("zoom", (event) => zoomGroup.attr("transform", event.transform))
    );

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(60))
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(10));

    // Links
    const link = zoomGroup.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("stroke", "var(--border-active)")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", d => Math.sqrt(d.weight || 1));

    // Node groups
    const nodeG = zoomGroup.append("g")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .attr("class", "node-group")
      .style("cursor", "pointer");

    // Bot-score pulsing ring (behind node)
    nodeG.filter(d => d.bot_score > 0.6)
      .append("circle")
      .attr("r", d => Math.min(24, 4 + (d.pagerank || 0) * 800) + 5)
      .attr("fill", "none")
      .attr("stroke", "var(--accent-danger)")
      .attr("stroke-width", 2)
      .attr("opacity", 0.6)
      .each(function (d) {
        const baseR = Math.min(24, 4 + (d.pagerank || 0) * 800) + 5;
        const el = d3.select(this);
        let running = true;
        function pulse() {
          if (!running) return;
          el.transition().duration(900)
            .attr("opacity", 0.1)
            .attr("r", baseR + 4)
            .transition().duration(900)
            .attr("opacity", 0.6)
            .attr("r", baseR)
            .on("end", pulse);
        }
        pulse();
        this.__stopPulse = () => { running = false; el.interrupt(); };
      });

    // Main node circle
    nodeG.append("circle")
      .attr("r", d => Math.min(24, 4 + (d.pagerank || 0) * 800))
      .attr("fill", d => COMMUNITY_COLORS[(d.community || 0) % COMMUNITY_COLORS.length])
      .attr("stroke", "var(--bg-base)")
      .attr("stroke-width", 1.5);

    // Events
    nodeG
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelectedAuthor(d.id);
      })
      .on("contextmenu", (event, d) => {
        event.preventDefault();
        setRemovedNodes(prev => new Set([...prev, d.id]));
        console.log(`Removed node: ${d.id}, recomputing...`);
      })
      .on("mouseover", (event, d) => {
        setTooltip({ visible: true, x: event.clientX + 12, y: event.clientY + 12, node: d });
      })
      .on("mousemove", (event) => {
        setTooltip(prev => ({ ...prev, x: event.clientX + 12, y: event.clientY + 12 }));
      })
      .on("mouseout", () => {
        setTooltip(prev => ({ ...prev, visible: false }));
      });

    // Drag
    nodeG.call(
      d3.drag()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
    );

    // Tick
    sim.on("tick", () => {
      link
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeG.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    return () => {
      sim.stop();
      svg.selectAll("circle").each(function () {
        if (this.__stopPulse) this.__stopPulse();
      });
    };
  }, [graphData, removedNodes]);

  const stats = graphData?.stats || {};
  const hasNodes = graphData && (graphData.nodes || []).length > 0;

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <SectionHeader title="Co-Sharing Network" subtitle="Information dissemination topology" />
        <InfoTooltip content="Nodes are Reddit authors. Edge weight = number of shared external domains. Node size = PageRank influence score. Node color = Louvain community. Red pulse = bot-signal author (score > 60). Left-click a node to inspect. Right-click to remove from graph." />
      </div>

      {/* Controls */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-wrap items-center gap-6">
        {/* Min edge weight */}
        <div className="flex items-center gap-3">
          <label className="text-[var(--text-secondary)] text-[12px] whitespace-nowrap">
            Min edge weight: <span className="text-[var(--text-primary)] font-medium font-mono ml-1">{minEdgeWeight}</span>
          </label>
          <input
            type="range" min={1} max={10} value={minEdgeWeight}
            onChange={e => setMinEdgeWeight(Number(e.target.value))}
            className="w-28"
          />
        </div>

        {/* Top N */}
        <div className="flex items-center gap-2">
          <label className="text-[var(--text-secondary)] text-[12px]">Top nodes:</label>
          <select
            value={topN}
            onChange={e => setTopN(Number(e.target.value))}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>

        {/* Reset */}
        <button
          onClick={() => setRemovedNodes(new Set())}
          className="bg-[var(--bg-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[12px] px-3.5 py-1.5 rounded-md transition-colors ml-auto font-medium"
        >
          Reset View
        </button>
      </div>

      {/* Stats */}
      {!loading && graphData && (
        <div className="flex justify-between items-center px-1">
          <p className="text-[var(--text-mono)] font-mono text-[11px] tracking-wide">
            {stats.node_count ?? "—"} NODES <span className="mx-2 text-[var(--border-active)]">|</span> {stats.edge_count ?? "—"} EDGES <span className="mx-2 text-[var(--border-active)]">|</span> {stats.communities_found ?? "—"} COMMUNITIES
            {removedNodes.size > 0 && (
              <span className="text-[var(--accent-warn)] ml-4 bg-[var(--accent-warn)]/10 px-2 py-0.5 rounded">
                {removedNodes.size} NODE{removedNodes.size !== 1 ? "S" : ""} REMOVED
              </span>
            )}
          </p>
        </div>
      )}

      {/* Graph area */}
      <div style={{ display: "flex", gap: 16 }}>
        <div
          ref={containerRef}
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm flex-1"
          style={{ height: 600 }}
        >
          {loading ? (
            <Spinner />
          ) : !hasNodes ? (
            <EmptyState icon="🕸️" message="No co-sharing relationships found at this edge weight threshold. Try lowering the minimum edge weight." />
          ) : (
            <svg
              ref={svgRef}
              width="100%"
              height={600}
              style={{ display: "block", background: "var(--bg-base)" }}
            />
          )}
        </div>

        {/* Author drilldown panel */}
        {selectedAuthor && (
          <div style={{
            width: 300, flexShrink: 0, background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)", borderRadius: 16,
            padding: 20, overflowY: "auto", maxHeight: 600
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
                fontFamily: "JetBrains Mono", overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", maxWidth: 220 }}>{selectedAuthor}</span>
              <button onClick={() => setSelectedAuthor(null)}
                style={{ color: "var(--text-muted)", background: "none", border: "none",
                  cursor: "pointer", fontSize: 13, flexShrink: 0 }}>✕</button>
            </div>

            {authorLoading && [80, 60, 90, 70].map(w => (
              <LoadingSkeleton key={w} height={24} className={`rounded mb-3`} />
            ))}

            {!authorLoading && authorProfile?.profile && (() => {
              const p = authorProfile.profile;
              const botColor = p.bot_score > 60 ? "var(--accent-danger)" :
                               p.bot_score > 30 ? "var(--accent-warn)" : "#34D399";
              return (
                <>
                  {/* Bot score */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: "JetBrains Mono", fontSize: 10,
                      color: "var(--text-muted)", textTransform: "uppercase",
                      marginBottom: 6 }}>Bot Score</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 6, background: "var(--bg-elevated)",
                        borderRadius: 3 }}>
                        <div style={{ width: p.bot_score + "%", height: "100%",
                          background: botColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontFamily: "JetBrains Mono", fontSize: 12,
                        color: botColor, fontWeight: 600 }}>{p.bot_score}</span>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
                    gap: 8, marginBottom: 16 }}>
                    {[
                      ["Posts", p.post_count],
                      ["Avg Score", p.avg_score],
                      ["Night Posts", (p.night_post_ratio * 100).toFixed(0) + "%"],
                      ["Ext Links", (p.external_link_ratio * 100).toFixed(0) + "%"],
                    ].map(([label, val]) => (
                      <div key={label} style={{ background: "var(--bg-elevated)",
                        borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontFamily: "JetBrains Mono", fontSize: 9,
                          color: "var(--text-muted)", textTransform: "uppercase",
                          marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600,
                          color: "var(--text-primary)" }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Posting timeline sparkline */}
                  {authorProfile.timeline?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 10,
                        color: "var(--text-muted)", textTransform: "uppercase",
                        marginBottom: 6 }}>Activity Timeline</div>
                      <ResponsiveContainer width="100%" height={60}>
                        <LineChart data={authorProfile.timeline}>
                          <Line type="monotone" dataKey="count" stroke="var(--accent-primary)"
                            strokeWidth={1.5} dot={false} />
                          <XAxis dataKey="week" hide />
                          <YAxis hide />
                          <RechartsTooltip contentStyle={{ background: "var(--bg-elevated)",
                            border: "1px solid var(--border-subtle)", fontSize: 10,
                            borderRadius: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Top domains */}
                  {authorProfile.top_domains?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 10,
                        color: "var(--text-muted)", textTransform: "uppercase",
                        marginBottom: 6 }}>Top Shared Domains</div>
                      {authorProfile.top_domains.slice(0, 5).map(d => (
                        <div key={d.domain} style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)",
                            fontFamily: "JetBrains Mono", overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                            maxWidth: 180 }}>{d.domain}</span>
                          <span style={{ fontFamily: "JetBrains Mono", fontSize: 11,
                            color: "var(--text-muted)", flexShrink: 0 }}>{d.count}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Top posts */}
                  {authorProfile.top_posts?.length > 0 && (
                    <div>
                      <div style={{ fontFamily: "JetBrains Mono", fontSize: 10,
                        color: "var(--text-muted)", textTransform: "uppercase",
                        marginBottom: 6 }}>Top Posts</div>
                      {authorProfile.top_posts.map(post => (
                        <a key={post.id} href={post.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "block", textDecoration: "none", marginBottom: 6,
                            background: "var(--bg-elevated)", borderRadius: 8, padding: "8px 10px",
                            border: "1px solid var(--border-subtle)", transition: "border-color 150ms" }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-active)"}
                          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-subtle)"}>
                          <div style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 500,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            marginBottom: 3 }}>{post.title}</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <span style={{ fontFamily: "JetBrains Mono", fontSize: 10,
                              color: "var(--text-muted)" }}>{post.subreddit}</span>
                            <span style={{ fontFamily: "JetBrains Mono", fontSize: 10,
                              color: "var(--text-muted)" }}>↑{post.score}</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Legend & Help text */}
      {!loading && hasNodes && (
        <div className="flex items-center justify-between px-1 flex-wrap gap-4">
          <p className="text-[var(--text-muted)] text-[11px]">
            Click a node to isolate · Drag to reposition · Scroll to zoom
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[var(--text-muted)] text-[11px] font-mono">COMMUNITY:</span>
            {COMMUNITY_COLORS.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded border border-black/20" style={{ backgroundColor: c }} />
                <span className="text-[var(--text-secondary)] text-[10px] font-mono font-medium">{i}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 pl-3 border-l border-[var(--border-subtle)]">
              <div className="w-3 h-3 rounded-full border-2 border-[var(--accent-danger)] bg-[var(--accent-danger)]/10" />
              <span className="text-[var(--text-secondary)] text-[11px]">Bot Risk &gt;60%</span>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip.visible && tooltip.node && (
        <div
          className="fixed bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-xl rounded-xl p-3 text-[12px] pointer-events-none z-50 min-w-[160px]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="text-[var(--text-primary)] font-semibold mb-2 line-clamp-1">{tooltip.node.id}</p>
          <div className="space-y-1 mt-1 font-mono text-[10px]">
            <p className="flex justify-between text-[var(--text-muted)]">
              <span>PAGERANK:</span>
              <span className="text-[var(--accent-primary)] font-medium">{(tooltip.node.pagerank || 0).toFixed(4)}</span>
            </p>
            <p className="flex justify-between text-[var(--text-muted)]">
              <span>COMMUNITY:</span>
              <span className="text-[var(--text-primary)]">{tooltip.node.community ?? "—"}</span>
            </p>
            <p className="flex justify-between text-[var(--text-muted)]">
              <span>POSTS:</span>
              <span className="text-[var(--text-primary)]">{tooltip.node.post_count ?? "—"}</span>
            </p>
            <p className="flex justify-between text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-1 mt-1">
              <span>BOT SCORE:</span>
              <span className={tooltip.node.bot_score > 0.6 ? "text-[var(--accent-danger)] font-bold" : "text-[var(--text-primary)]"}>
                {((tooltip.node.bot_score || 0) * 100).toFixed(0)}%
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
