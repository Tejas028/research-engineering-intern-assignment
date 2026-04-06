import { useState, useEffect } from "react";
import { getOverview, getTimeseries, getAISummary, getCoordination } from "../api";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { StatCard, SectionHeader, AIInsightBox, InfoTooltip, LoadingSkeleton, ErrorBanner } from "../components/ui";

const SUBREDDITS = [
  "neoliberal", "politics", "worldpolitics", "socialism", "Liberal", 
  "Conservative", "Anarchism", "democrats", "Republican", "PoliticalDiscussion"
];

const METRICS = [
  { value: "count", label: "Post Count" },
  { value: "avg_score", label: "Avg Score" },
  { value: "controversy", label: "Controversy" }
];

const GRANULARITIES = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" }
];

export default function Overview() {
  const [overview, setOverview] = useState(null);
  const [tsData, setTsData] = useState([]);
  const [aiSummary, setAiSummary] = useState(null);
  const [tsLoading, setTsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [coordinationData, setCoordinationData] = useState(null);
  const [coordLoading, setCoordLoading] = useState(true);

  // Controls state
  const [subreddit, setSubreddit] = useState("");
  const [metric, setMetric] = useState("count");
  const [granularity, setGranularity] = useState("week");

  useEffect(() => {
    getOverview().then(res => setOverview(res.data)).catch(console.error);
    setCoordLoading(true);
    getCoordination()
      .then(res => setCoordinationData(res.data))
      .catch(console.error)
      .finally(() => setCoordLoading(false));
  }, []);

  useEffect(() => {
    setTsLoading(true);
    getTimeseries({
      subreddit: subreddit || undefined,
      group_by: granularity,
      metric: metric
    })
    .then(res => {
      const seriesArr = res.data?.series || [];
      if (seriesArr.length === 0) {
        setTsData([]);
        return;
      }
      const dateMap = {};
      seriesArr.forEach(s => {
        (s.data || []).forEach(pt => {
          dateMap[pt.date] = (dateMap[pt.date] || 0) + (pt.value || 0);
        });
      });
      const flat = Object.keys(dateMap).sort().map(d => ({ date: d, value: Math.round(dateMap[d] * 100) / 100 }));
      setTsData(flat);
    })
    .catch(err => { console.error(err); setTsData([]); })
    .finally(() => setTsLoading(false));

    setLoading(true);
    setAiSummary(null);
    getAISummary({
      subreddit: subreddit || undefined,
      metric: metric
    })
    .then(res => {
      setAiSummary(res.data.summary);
      setLoading(false);
    })
    .catch(() => {
      setAiSummary("Summary unavailable.");
      setLoading(false);
    });
  }, [subreddit, metric, granularity]);

  const IDEOLOGY_COLOR = {
    left: "var(--accent-left)",
    right: "var(--accent-right)",
    center: "var(--accent-center)"
  };

  const getColor = (sub) => {
    const left = ["Anarchism", "socialism", "democrats", "Liberal"];
    const right = ["Conservative", "Republican"];
    if (left.includes(sub)) return IDEOLOGY_COLOR.left;
    if (right.includes(sub)) return IDEOLOGY_COLOR.right;
    return IDEOLOGY_COLOR.center;
  };

  return (
    <div className="space-y-6">
      {/* Row 1: StatCards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Posts" value={overview?.total_posts || 0} sublabel={`across ${overview?.subreddit_count || 0} subreddits`} loading={!overview} />
        <StatCard label="Unique Authors" value={overview?.unique_authors || 0} sublabel="flagged accounts" loading={!overview} />
        <StatCard label="Avg Score" value={overview?.avg_score || 0} sublabel="points per post" loading={!overview} />
        <StatCard label="Avg Comments" value={overview?.avg_comments || 0} sublabel="comments per post" loading={!overview} />
        <StatCard label="External Links" value={overview?.external_link_ratio ? `${(overview.external_link_ratio * 100).toFixed(1)}%` : "0.0%"} trend="down" sublabel="link frequency" loading={!overview} />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Column (2 cols) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border-subtle)]">
            <SectionHeader title="Post Volume Over Time" subtitle={`${granularity} aggregation`} />
            
            <div className="flex flex-wrap gap-4 mb-6 mt-4">
              <select value={subreddit} onChange={(e) => setSubreddit(e.target.value)}>
                <option value="">All Subreddits</option>
                {SUBREDDITS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
                {GRANULARITIES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            
            {tsLoading ? (
              <div className="h-[280px] flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">Loading chart...</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={tsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-mono)", fontSize: 11 }} tickMargin={12} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-mono)", fontSize: 11 }} tickMargin={12} axisLine={false} tickLine={false} width={40} />
                  <Tooltip 
                    contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-active)", borderRadius: "8px", color: "var(--text-primary)" }} 
                    itemStyle={{ color: "var(--accent-primary)" }}
                  />
                  <Line type="monotone" dataKey="value" stroke="var(--accent-primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 6, fill: "var(--accent-primary)", stroke: "var(--bg-base)", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          
          <AIInsightBox summary={aiSummary} loading={loading} />
        </div>

        {/* Right Column (1 col) */}
        <div className="flex flex-col gap-6">
          
          <div className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border-subtle)] flex-1 flex flex-col">
            <SectionHeader title="Subreddit Breakdown" subtitle="By Ideology" />
            {!overview ? (
              <div className="flex-1 min-h-[220px] rounded-xl shimmer mt-4"></div>
            ) : (
              <div className="flex-1 flex flex-col justify-between mt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={overview.subreddits || []}>
                    <XAxis 
                      dataKey="subreddit" 
                      tick={{ fill: "var(--text-mono)", fontSize: 10 }} 
                      interval={0} 
                      angle={-35} 
                      textAnchor="end" 
                      height={60}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-active)", borderRadius: "6px", color: "var(--text-primary)" }} 
                      itemStyle={{ color: "var(--text-primary)" }}
                      cursor={{ fill: "var(--border-subtle)" }} 
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {(overview.subreddits || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getColor(entry.subreddit)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-4 text-xs font-mono text-[var(--text-muted)]">
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: IDEOLOGY_COLOR.left }}></div>Left</div>
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: IDEOLOGY_COLOR.center }}></div>Center</div>
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: IDEOLOGY_COLOR.right }}></div>Right</div>
                </div>
              </div>
            )}
          </div>

          {/* Hourly Heatmap */}
          <div className="bg-[var(--bg-surface)] rounded-2xl p-6 border border-[var(--border-subtle)] flex-shrink-0">
            <SectionHeader title="Posting Activity" subtitle="UTC Hour Distribution" />
            {!overview ? (
               <div className="flex-1 min-h-[100px] rounded-xl shimmer mt-4"></div>
            ) : (
              <div className="w-full mt-6">
                <svg width="100%" height="80" xmlns="http://www.w3.org/2000/svg">
                  {(overview.hourly || []).map((h, i) => {
                    const maxCount = Math.max(...(overview.hourly || []).map(o => o.count));
                    const normalized = maxCount > 0 ? h.count / maxCount : 0;
                    
                    // Dark theme hex mapping for gradient from bg-elevated to accent-primary
                    // elevated: #161D2E -> primary: #4F6EF7
                    const r = Math.round(22 + (79 - 22) * normalized);
                    const g = Math.round(29 + (110 - 29) * normalized);
                    const b = Math.round(46 + (247 - 46) * normalized); 
                    
                    const widthPct = 100 / 24;
                    const xPct = i * widthPct;
                    
                    const isBotHour = h.hour >= 1 && h.hour <= 5;
                    
                    return (
                      <g key={i}>
                        <rect
                          x={`${xPct}%`}
                          y="0"
                          width={`${widthPct}%`}
                          height="48"
                          fill={`rgb(${r},${g},${b})`}
                          stroke={isBotHour ? "var(--accent-danger)" : "transparent"}
                          strokeWidth={isBotHour ? 1.5 : 0}
                          rx="2"
                        >
                          <title>Hour {h.hour}: {h.count} posts</title>
                        </rect>
                        {[0, 6, 12, 18, 23].includes(h.hour) && (
                          <text x={`${xPct + widthPct/2}%`} y="65" fill="var(--text-mono)" fontSize="10" fontFamily="JetBrains Mono" textAnchor="middle">
                            {h.hour}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Row 3: Coordinated Behavior Signals */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <SectionHeader title="Coordinated Behavior Signals" subtitle="Detected manipulation patterns" />
          <InfoTooltip content="Identifies authors sharing the same links within 24 hours (Domain Coordination) or posting multiple times in very short bursts (Temporal Bursts)." />
        </div>

        {coordLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => <LoadingSkeleton key={i} height={160} className="rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Domain Coordination */}
            <div className="space-y-4">
              <div className="text-[10px] font-mono text-[var(--accent-primary)] uppercase tracking-wider">Domain Coordination</div>
              {(coordinationData?.domain_coordination || []).slice(0, 4).map((c, i) => (
                <div key={i} className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-subtle)]">
                  <div className="flex justify-between text-[11px] mb-2">
                    <span className="text-[var(--text-primary)] font-medium font-mono">{c.author_a}</span>
                    <span className="text-[var(--text-muted)]">↔️</span>
                    <span className="text-[var(--text-primary)] font-medium font-mono">{c.author_b}</span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] flex justify-between">
                    <span>{c.domain}</span>
                    <span className="text-[var(--accent-warn)] font-bold">{c.shared_count} shared</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Cross-Ideological Amplification */}
            <div className="space-y-4">
              <div className="text-[10px] font-mono text-[var(--accent-left)] uppercase tracking-wider">Cross-Ideological Amp</div>
              {(coordinationData?.cross_ideological || []).slice(0, 4).map((c, i) => (
                <div key={i} className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 text-[11px] mb-2">
                    <span className="text-[var(--text-primary)] font-mono">{c.seeder}</span>
                    <span className="text-[var(--text-muted)]">➔</span>
                    <span className="text-[var(--text-primary)] font-mono">{c.amplifier}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className={c.seed_group === 'left' ? 'text-[var(--accent-left)]' : 'text-[var(--accent-right)]'}>{c.seed_group}</span>
                    <span className="text-[var(--text-muted)]">⚡</span>
                    <span className={c.amp_group === 'left' ? 'text-[var(--accent-left)]' : 'text-[var(--accent-right)]'}>{c.amp_group}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Temporal Bursts */}
            <div className="space-y-4">
              <div className="text-[10px] font-mono text-[var(--accent-danger)] uppercase tracking-wider">Temporal Bursts (10m)</div>
              {(coordinationData?.temporal_bursts || []).slice(0, 4).map((c, i) => (
                <div key={i} className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-subtle)]">
                  <div className="text-[11px] font-mono text-[var(--text-primary)] mb-1">{c.author}</div>
                  <div className="flex justify-between items-center mt-2">
                    <div className="text-[10px] text-[var(--text-muted)]">{c.burst_start}</div>
                    <div className="bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] text-[10px] px-2 py-0.5 rounded font-bold">
                      {c.burst_count} posts
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
