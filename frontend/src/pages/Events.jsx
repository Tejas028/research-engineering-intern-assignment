import { useState, useEffect } from "react";
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
  Bar, Cell
} from "recharts";
import { EventRow, AIInsightBox, SectionHeader, Card, StatCard, LoadingSkeleton } from "../components/ui";
import { getTimeseries, getEvents, postAISummary } from "../api";
import { Info, TrendingUp, AlertTriangle } from "lucide-react";

const CATEGORY_COLORS = {
  election:      "#E24B4A",
  policy:        "#378ADD",
  protest:       "#f59e0b",
  international: "#8b5cf6",
};

const IDEOLOGY_COLORS = {
  left:   "#60A5FA",
  right:  "#E24B4A",
  center: "#1D9E75",
};

export default function Events() {
  const [tsData, setTsData]             = useState([]);
  const [events, setEvents]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [granularity, setGranularity]   = useState("week");
  const [activeGroups, setActiveGroups] = useState(["left", "right", "center"]);
  const [aiSummary, setAiSummary]       = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [tsRes, evRes] = await Promise.all([
          getTimeseries({ group_by: granularity }),
          getEvents()
        ]);

        const rawTs = tsRes.data?.series || [];
        const evs   = evRes.data?.events || [];

        const dateMap = {};
        rawTs.forEach(s => {
          const group = s.ideological_group || "center";
          (s.data || []).forEach(pt => {
            if (!dateMap[pt.date]) dateMap[pt.date] = { date: pt.date, left: 0, right: 0, center: 0, total: 0 };
            dateMap[pt.date][group] += (pt.value || 0);
            dateMap[pt.date].total  += (pt.value || 0);
          });
        });

        const ts = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
        setTsData(ts);
        setEvents(evs);

        if (ts.length > 0 && evs.length > 0) {
          setSummaryLoading(true);
          postAISummary({
            context: "events_overview",
            data: { event_count: evs.length, granularity }
          }).then(res => setAiSummary(res.data?.summary)).catch(console.error).finally(() => setSummaryLoading(false));
        }
      } catch (e) {
        console.error(e);
        setTsData([]);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [granularity]);

  const topEvents = [...events].sort((a, b) => b.spike_factor - a.spike_factor).slice(0, 20);

  return (
    <div className="flex flex-col xl:flex-row gap-10">
      
      {/* ── CENTRAL COLUMN (Analytics & Chart) ── */}
      <div className="flex-1 space-y-10">
        
        <header className="relative overflow-hidden group">
          <SectionHeader 
            badge="Historical Archive"
            title="Intelligence Timeline" 
            subtitle="Cross-referencing Wiki events against Reddit discourse volatility"
          />
        </header>

        {/* Filters & Stats Row */}
        <div className="flex flex-wrap items-center justify-between gap-6 pb-6 border-b border-white/5">
          <div className="flex items-center gap-3 bg-white/5 p-1.5 rounded-2xl border border-white/5">
            {["left", "right", "center"].map(g => (
              <button
                key={g}
                onClick={() => setActiveGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}
                className={`
                  px-4 py-1.5 rounded-xl font-mono text-[10px] uppercase transition-all duration-300
                  ${activeGroups.includes(g) 
                    ? "bg-white/10 text-white shadow-sm border border-white/10" 
                    : "text-white/30 hover:text-white/50"}
                `}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
            {["day", "week"].map(g => (
              <button 
                key={g} 
                onClick={() => setGranularity(g)}
                className={`
                  px-4 py-2 rounded-lg font-mono text-[10px] uppercase transition-all
                  ${granularity === g ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-white/20 hover:text-white/40"}
                `}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Main Timeline Chart */}
        <Card className="p-8">
          <div className="flex items-center justify-between mb-8 font-mono text-[11px] text-white/30">
            <div className="flex items-center gap-4">
               <span className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-blue-500" /> LEFT
               </span>
               <span className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-red-500" /> RIGHT
               </span>
               <span className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-green-500" /> CENTER
               </span>
            </div>
            <div className="flex items-center gap-2 italic">
               Dashed markers indicating real-world political shift-events
            </div>
          </div>
          
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={tsData}>
                <defs>
                   {Object.entries(IDEOLOGY_COLORS).map(([id, color]) => (
                     <linearGradient key={id} id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.15}/>
                        <stop offset="95%" stopColor={color} stopOpacity={0}/>
                     </linearGradient>
                   ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.2)", fontFamily: "DM Mono" }} 
                  axisLine={false} 
                  tickLine={false} 
                  dy={10}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.2)", fontFamily: "DM Mono" }} 
                  axisLine={false} 
                  tickLine={false} 
                  width={40}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "#0d0d0d", 
                    border: "1px solid rgba(255,255,255,0.1)", 
                    borderRadius: "12px",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    fontSize: "12px",
                    fontFamily: "DM Mono"
                  }} 
                  itemStyle={{ color: "#fff" }}
                />
                
                {["left", "right", "center"].filter(g => activeGroups.includes(g)).map(group => (
                  <Area 
                    key={group} 
                    name={group.toUpperCase()} 
                    type="monotone" 
                    dataKey={group} 
                    stroke={IDEOLOGY_COLORS[group]} 
                    fill={`url(#grad-${group})`}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: IDEOLOGY_COLORS[group] }}
                  />
                ))}

                {topEvents.map((ev, i) => (
                  <ReferenceLine 
                    key={i} 
                    x={ev.date} 
                    stroke={CATEGORY_COLORS[ev.category] || "#E24B4A"} 
                    strokeWidth={1} 
                    strokeDasharray="4 4" 
                    opacity={0.3} 
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* AI Insight Section */}
        <AIInsightBox 
          summary={aiSummary} 
          loading={summaryLoading} 
          label="Narrative Synthesis Alert" 
        />
      </div>

      {/* ── RIGHT COLUMN (Event Log) ── */}
      <aside className="w-full xl:w-[380px] flex-shrink-0 space-y-6">
        <div className="h-screen sticky top-12 overflow-y-auto pb-12 pr-2 scrollbar-hide">
          <Card className="p-6 bg-blue-600/5 border-blue-500/10 mb-8">
            <div className="flex items-start gap-4">
              <TrendingUp className="text-blue-400 mt-1" size={20} />
              <div>
                <h4 className="font-serif text-white font-bold mb-1">Volatile Anchors</h4>
                <p className="text-[12px] text-white/50 leading-relaxed">
                  Detected <span className="text-white/80">{topEvents.length} distinct triggers</span> for discourse anomalies in this period. Select an log entry to sync the chart view.
                </p>
              </div>
            </div>
          </Card>

          <div className="flex items-center gap-2 mb-6 font-mono text-[10px] text-white/30 uppercase tracking-[0.2em] px-2">
            Historical Records Archive
          </div>

          <div className="space-y-4">
            {loading ? (
              [1,2,3,4,5,6].map(i => <LoadingSkeleton key={i} height={100} className="rounded-2xl" />)
            ) : (
              events.map((e, i) => (
                <article key={i} className="animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <EventRow 
                    {...e} 
                    selected={selectedEvent?.title === e.title} 
                    onClick={() => setSelectedEvent(e)} 
                  />
                </article>
              ))
            )}
          </div>
        </div>
      </aside>

    </div>
  );
}
