import { useState, useEffect } from "react";
import axios from "axios";
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { EventRow, AIInsightBox, SectionHeader } from "../components/ui";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const CATEGORY_COLORS = {
  election: "var(--accent-primary)",
  policy: "var(--accent-center)",
  protest: "var(--accent-danger)",
  international: "var(--accent-warn)",
};

const IDEOLOGY_COLORS = {
  left: "var(--accent-left)",
  right: "var(--accent-right)",
  center: "var(--accent-center)",
};

export default function Events() {
  const [tsData, setTsData] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [granularity, setGranularity] = useState("week");
  const [activeGroups, setActiveGroups] = useState(["left", "right", "center"]);
  const [aiSummary, setAiSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    let active = true;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const [tsRes, evRes] = await Promise.all([
          axios.get(`${API}/api/timeseries`, { params: { granularity }, timeout: 10000 }),
          axios.get(`${API}/api/events`, { timeout: 30000 })
        ]);
        
        if (!active) return;
        
        const rawTs = tsRes.data?.series || [];
        const evs = evRes.data?.events || [];
        
        // Transform series into grouped dates: { date: '...', left: 0, right: 0, center: 0 }
        const dateMap = {};
        rawTs.forEach(s => {
          const group = s.ideological_group || "center";
          (s.data || []).forEach(pt => {
            if (!dateMap[pt.date]) dateMap[pt.date] = { date: pt.date, left: 0, right: 0, center: 0, total: 0 };
            dateMap[pt.date][group] += (pt.value || 0);
            dateMap[pt.date].total += (pt.value || 0);
          });
        });
        
        const ts = Object.values(dateMap).sort((a,b) => a.date.localeCompare(b.date));
        
        setTsData(ts);
        setEvents(evs);
        
        if (ts.length > 0 && evs.length > 0) {
          setSummaryLoading(true);
          try {
            const summaryRes = await axios.post(`${API}/api/ai_summary`, {
              context: "events_overview",
              data: {
                total_posts: ts.reduce((s, d) => s + (d.total || 0), 0),
                date_range: [ts[0]?.date, ts[ts.length - 1]?.date],
                event_count: evs.length,
                top_spikes: evs
                  .filter(e => e.spike_factor > 1.5)
                  .sort((a, b) => b.spike_factor - a.spike_factor)
                  .slice(0, 3)
                  .map(e => ({ title: e.title, spike: e.spike_factor, date: e.date })),
                granularity
              }
            }, { timeout: 20000 });
            
            if (active) setAiSummary(summaryRes.data?.summary || null);
          } catch (e) {
            console.error("AI Summary error:", e);
          } finally {
            if (active) setSummaryLoading(false);
          }
        }
      } catch (e) {
        if (!active) return;
        console.error("Fetch error:", e);
        setError(e.message || "Failed to load events data.");
        setTsData([]);
        setEvents([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    
    fetchData();
    return () => { active = false; };
  }, [granularity]);

  const toggleGroup = (group) => {
    if (activeGroups.includes(group)) {
      if (activeGroups.length > 1) {
        setActiveGroups(activeGroups.filter(g => g !== group));
      }
    } else {
      setActiveGroups([...activeGroups, group]);
    }
  };

  const topEvents = [...events].sort((a, b) => b.spike_factor - a.spike_factor).slice(0, 30);
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dailyEvents = events.filter(e => e.date === label);
      return (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-active)] rounded-xl p-3 text-[12px] w-64 shadow-xl">
          <p className="font-mono text-[var(--text-muted)] mb-2">{label}</p>
          <div className="space-y-1.5 mb-3">
            {payload.map((entry, index) => (
              <div key={index} className="flex items-center gap-2 text-[var(--text-primary)]">
                <div className="w-2 h-2 rounded flex-shrink-0 border border-black/20" style={{ backgroundColor: entry.color }} />
                <span className="capitalize">{entry.name}:</span>
                <span className="font-mono ml-auto font-medium">{entry.value}</span>
              </div>
            ))}
          </div>
          {dailyEvents.length > 0 && (
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2 mt-2">
              {dailyEvents.map((e, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-2.5 h-2.5 mt-0.5 rounded-full shrink-0 border-2 border-black/20" style={{ backgroundColor: CATEGORY_COLORS[e.category] }} />
                  <p className="text-[var(--text-secondary)] leading-snug line-clamp-2">{e.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2">
          {["left", "right", "center"].map(g => (
            <button
              key={g}
              onClick={() => toggleGroup(g)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border capitalize ${
                activeGroups.includes(g)
                  ? `text-[var(--text-primary)]`
                  : "opacity-40 border-transparent bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:opacity-100"
              }`}
              style={activeGroups.includes(g) ? { backgroundColor: `color-mix(in srgb, ${IDEOLOGY_COLORS[g]} 15%, transparent)`, borderColor: `color-mix(in srgb, ${IDEOLOGY_COLORS[g]} 40%, transparent)` } : {}}
            >
              <div className="flex items-center gap-1.5">
                {activeGroups.includes(g) && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: IDEOLOGY_COLORS[g] }}></div>}
                {g}
              </div>
            </button>
          ))}
        </div>
        <div className="flex bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-1.5 rounded-lg shadow-sm gap-1">
          {["day", "week"].map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-4 py-1 text-[11px] font-medium rounded transition-colors capitalize ${granularity === g ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="border border-[var(--accent-danger)]/50 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Chart */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm">
        <SectionHeader title="Narrative Volume Timeline" subtitle="Grouped by inferred ideology mapping" />
        <div className="mt-6">
          {loading ? (
            <div className="shimmer rounded-xl h-[320px] w-full" />
          ) : tsData.length > 0 ? (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-mono)", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: "var(--border-subtle)" }} interval="preserveStartEnd" minTickGap={30} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-mono)", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--border-active)", strokeWidth: 1.5, strokeDasharray: "4 4" }} />
                  
                  {["left", "right", "center"].filter(g => activeGroups.includes(g)).map(group => (
                    <Area
                      key={group}
                      type="monotone"
                      dataKey={group}
                      stroke={IDEOLOGY_COLORS[group]}
                      fill={IDEOLOGY_COLORS[group]}
                      fillOpacity={0.15}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                  
                  {topEvents.map((event, i) => (
                    <ReferenceLine
                      key={`${event.date}-${i}`}
                      x={event.date}
                      stroke={CATEGORY_COLORS[event.category] || "var(--text-muted)"}
                      strokeWidth={1.5}
                      strokeDasharray="3 4"
                      strokeOpacity={0.7}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      </div>

      {/* AI Summary */}
      {(aiSummary || summaryLoading) && !error && (
        <AIInsightBox summary={aiSummary} loading={summaryLoading} label="AI Timeline Analysis" />
      )}

      {/* Events List / Detail */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 relative">
        <div className="xl:col-span-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm">
          <SectionHeader title="Real-World Events" subtitle={!loading ? `${events.length} political events logged` : "Loading events..."} />
          <div className="mt-4 max-h-[560px] overflow-y-auto pr-3 mr-[-12px]">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="shimmer h-16 rounded-xl mb-2" />
              ))
            ) : (
              events.map((e, i) => {
                const isSelected = selectedEvent?.date === e.date && selectedEvent?.title === e.title;
                return (
                  <EventRow 
                    key={i}
                    date={e.date}
                    title={e.title}
                    category={e.category}
                    spikeFactory={e.spike_factor}
                    selected={isSelected}
                    onClick={() => setSelectedEvent(e)}
                  />
                );
              })
            )}
          </div>
        </div>

        <div className="relative">
          {!selectedEvent ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-[var(--bg-surface)] border border-[var(--border-active)] border-dashed rounded-2xl h-64 sticky top-6 opacity-70">
              <span className="text-3xl mb-3">📍</span>
              <p className="text-[var(--text-muted)] text-[13px] leading-relaxed">Select an event from the timeline to view Wikipedia cross-referencing and activity context.</p>
            </div>
          ) : (
            <div className="sticky top-6 space-y-6 animate-slide-up">
              <div
                className="bg-[var(--bg-surface)] border rounded-2xl p-6 relative overflow-hidden shadow-xl"
                style={{ borderColor: CATEGORY_COLORS[selectedEvent.category], boxShadow: `0 4px 24px -10px color-mix(in srgb, ${CATEGORY_COLORS[selectedEvent.category]} 20%, transparent)` }}
              >
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs font-medium bg-[var(--bg-elevated)] px-2.5 py-1 rounded transition-colors"
                >
                  ✕ close
                </button>
                <div className="inline-block px-2.5 py-1 rounded text-[10px] uppercase tracking-wider font-bold mb-4 border" style={{ backgroundColor: `color-mix(in srgb, ${CATEGORY_COLORS[selectedEvent.category]} 15%, transparent)`, color: CATEGORY_COLORS[selectedEvent.category], borderColor: `color-mix(in srgb, ${CATEGORY_COLORS[selectedEvent.category]} 40%, transparent)` }}>
                  {selectedEvent.category} event
                </div>
                <p className="font-mono text-[var(--text-mono)] text-[11px] mb-2 font-medium">{selectedEvent.date}</p>
                <h3 className="text-[var(--text-primary)] font-semibold mb-4 leading-snug">{selectedEvent.title}</h3>
                <p className="text-[var(--text-secondary)] text-[13px] leading-[1.7] mb-6">{selectedEvent.description}</p>
                
                {selectedEvent.spike_factor > 0 && (
                  <div className="bg-[var(--bg-elevated)] rounded-xl p-4 mb-6 flex items-center justify-between border border-[var(--border-subtle)]">
                    <span className="text-[12px] text-[var(--text-muted)] font-medium">Platform Post Volume:</span>
                    <span className="text-[13px] font-mono text-[var(--accent-danger)] font-bold">{selectedEvent.spike_factor}× baseline</span>
                  </div>
                )}
                
                <a
                  href={selectedEvent.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-[13px] font-medium hover:underline transition-all"
                  style={{ color: CATEGORY_COLORS[selectedEvent.category] }}
                >
                  View on Wikipedia ↗
                </a>
              </div>
              
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-sm">
                <SectionHeader title="Top Volume Surges" subtitle="Events with highest relative spike factors" />
                <div className="space-y-4 mt-5">
                  {[...events].filter(e => e.spike_factor > 1.5).sort((a,b) => b.spike_factor - a.spike_factor).slice(0,5).map((e, i) => (
                    <div key={i} className="flex items-center gap-3 group cursor-pointer" onClick={() => setSelectedEvent(e)}>
                      <div className="w-2 h-2 rounded-full border border-black/20" style={{ backgroundColor: CATEGORY_COLORS[e.category] }} />
                      <span className="text-[12px] text-[var(--text-muted)] truncate flex-1 group-hover:text-[var(--text-primary)] transition-colors">{e.title}</span>
                      <span className="text-[11px] font-mono text-[var(--accent-danger)] font-medium">{e.spike_factor}×</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px] font-mono text-[var(--text-muted)] space-y-1.5 pt-12 opacity-80">
        <p>SOURCE · Wikipedia "Portal:Current_events" API (Jul 2024 – Feb 2025)</p>
        <p>CATEGORIES · election, policy, protest, international (keyword-matched)</p>
        <p>SPIKE FACTOR · event-day volume ÷ 30-day prior rolling mean via DuckDB</p>
        <p>TIMESERIES · DuckDB DATE_TRUNC aggregation by week/day, joined with ideology_group labels</p>
      </div>
      
    </div>
  );
}
