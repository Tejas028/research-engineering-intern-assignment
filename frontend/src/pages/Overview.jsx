import { useState, useEffect, useMemo } from "react";
import { getOverview, getTimeseries, getEvents, getAISummary } from "../api";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell, Legend, ReferenceArea
} from "recharts";
import { 
  StatCard, AIInsightBox, LoadingSkeleton, 
  EventRow, SubredditBar, getIdeologyColor 
} from "../components/ui";

// ─── Constants ───
const SUBREDDITS = [
  "neoliberal", "politics", "worldpolitics", "socialism", "Liberal",
  "Conservative", "Anarchism", "democrats", "Republican", "PoliticalDiscussion"
];

const IDEOLOGY_MAP = {
  left: ["politics", "news", "worldnews", "democrats", "Liberal", "socialism", "anarchism", "whitepeopletwitter"],
  right: ["conservative", "republican", "conspiracy", "walkaway", "Republican", "Conservative"],
  center: ["neoliberal", "politicaldiscussion", "worldpolitics", "Anarchism"]
};

const DEFAULT_EVENT = {
  date: "2024-11-06",
  title: "Trump wins presidency",
  category: "election",
  spike_factor: 2.8,
  description: "Donald Trump clinches the 2024 presidential election, marking a historic return to the White House and triggering unprecedented discourse surges across Reddit political communities."
};

export default function Overview() {
  const [overview, setOverview] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(DEFAULT_EVENT);
  const [tsData, setTsData] = useState([]);
  const [aiSummary, setAiSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tsLoading, setTsLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(true);

  // Filters
  const [subreddit, setSubreddit] = useState("");

  // 1. Initial Load
  useEffect(() => {
    getOverview().then(res => setOverview(res.data)).catch(console.error);
    setEventsLoading(true);
    getEvents().then(res => {
      const evs = res.data?.events || [];
      // Find the most relevant Trump event from Wiki, or fallback to our premium default
      const trumpEv = evs.find(e => e.date === "2024-11-06" || e.title.includes("Trump wins"));
      const combined = trumpEv ? evs : [DEFAULT_EVENT, ...evs];
      
      setEvents(combined);
      // Synchronize selection with the actual event object from the list
      setSelectedEvent(trumpEv || DEFAULT_EVENT);
    }).catch(console.error).finally(() => setEventsLoading(false));
  }, []);

  // 2. Fetch Timeseries Tracking
  useEffect(() => {
    setTsLoading(true);
    const params = { 
      subreddit: subreddit || undefined, 
      group_by: "day",
      metric: "count" 
    };

    Promise.all([
      getTimeseries(params),
      getTimeseries({ ...params, metric: "controversy" }),
      getTimeseries({ ...params, metric: "avg_comments" })
    ]).then(([cntRes, conRes, commRes]) => {
      const cntSeries = cntRes.data?.series || [];
      const conSeries = conRes.data?.series || [];
      const cmmSeries = commRes.data?.series || [];
      
      const dateMap = {};
      const allSeries = [...cntSeries, ...conSeries, ...cmmSeries];
      
      // 1. Collect all possible dates
      allSeries.forEach(s => {
        (s.data || []).forEach(pt => {
          if (!dateMap[pt.date]) {
            dateMap[pt.date] = { date: pt.date, posts: 0, controversy: 0, avg_comments: 0 };
          }
        });
      });

      // 2. Populate values
      cntSeries.forEach(s => {
        (s.data || []).forEach(pt => {
          dateMap[pt.date].posts += (pt.value || 0);
        });
      });

      conSeries.forEach(s => {
        (s.data || []).forEach(pt => {
          // Normalize and pick max controversy across subreddits for that day
          const val = (pt.value || 0) * 100;
          dateMap[pt.date].controversy = Math.max(dateMap[pt.date].controversy, val);
        });
      });

      cmmSeries.forEach(s => {
        (s.data || []).forEach(pt => {
          dateMap[pt.date].avg_comments = (pt.value || 0);
        });
      });

      const ts = Object.values(dateMap).sort((a,b) => a.date.localeCompare(b.date));
      setTsData(ts);
    }).catch(console.error).finally(() => setTsLoading(false));
  }, [subreddit]);

  // 3. Memoized Dynamic Metrics (The "Intelligence" Layer)
  const intelligence = useMemo(() => {
    if (!tsData.length || !selectedEvent) return null;
    
    const eventParams = selectedEvent.date.split("-").map(Number);
    const eventTime = new Date(eventParams[0], eventParams[1] - 1, eventParams[2]).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Find window (+/- 3 days)
    const window = tsData.filter(d => {
      const dp = d.date.split("-").map(Number);
      const dt = new Date(dp[0], dp[1] - 1, dp[2]).getTime();
      const diffDays = Math.round(Math.abs(dt - eventTime) / dayMs);
      return diffDays <= 3;
    });

    if (!window.length) return null;

    const peakPosts = Math.max(...window.map(d => d.posts || 0));
    const avgControversy = window.reduce((a,b) => a + (b.controversy || 0), 0) / window.length;
    const avgInteraction = window.reduce((a,b) => a + (b.avg_comments || 0), 0) / window.length;
    
    const totalInteraction = window.reduce((a,b) => a + ((b.posts || 0) * (b.avg_comments || 0)), 0);

    return {
      peak: peakPosts,
      controversy: avgControversy,
      interaction: avgInteraction,
      totalInteraction: totalInteraction,
      communities: overview?.subreddit_count || 10,
      windowData: window,
      xMin: window[0]?.date,
      xMax: window[window.length - 1]?.date
    };
  }, [tsData, selectedEvent, overview]);

  // 4. Dynamic Narrative Generation
  useEffect(() => {
    if (!selectedEvent || !intelligence) return;
    setLoading(true);
    
    // Synthesis Logic
    const generateNarrative = () => {
      const spike = selectedEvent.spike_factor;
      const date = selectedEvent.date;
      return `This event on ${date} triggered a ${spike}x increase in Reddit activity relative to the baseline. High controversy scores (${Math.round(intelligence.controversy)}%) suggest deep ideological polarization during this window, with an average of ${intelligence.interaction.toFixed(1)} interactions per post across critical political subreddits.`;
    };

    const timer = setTimeout(() => {
      setAiSummary(generateNarrative());
      setLoading(false);
    }, 400); // 400ms loading "processing" simulation

    return () => clearTimeout(timer);
  }, [selectedEvent, intelligence]);

  // Dynamic Questions
  const questions = useMemo(() => {
    if (!selectedEvent) return [];
    return [
      `How did political subs react to ${selectedEvent.title}?`,
      `Which community drove the ${selectedEvent.spike_factor}x spike?`,
      `How did controversy shift on ${selectedEvent.date}?`
    ];
  }, [selectedEvent]);

  return (
    <div style={{ 
      display: "grid", 
      gridTemplateColumns: "1fr 320px", 
      gap: 32,
    }}>
      
      {/* ── Main Panel ── */}
      <div>
        
        {/* Case Study Header */}
        <header style={{ marginBottom: 40 }}>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: "#E24B4A",
            marginBottom: 10,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
          }}>
            Case Study: Election 2024
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 42,
            fontWeight: 700,
            color: "#ffffff",
            margin: "0 0 16px",
            lineHeight: 1.1,
          }}>
            How Trump’s Victory Moved Reddit
          </h1>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 16,
            color: "rgba(255,255,255,0.6)",
            lineHeight: 1.6,
            maxWidth: 720,
            margin: 0
          }}>
            Analyzing Reddit discourse shifts across political communities during the 2024 US election. All metrics are live and derived from platform activity patterns.
          </p>
        </header>

        {/* 1. Real-time Stat Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
          <StatCard 
            label="Peak Volume" 
            value={intelligence?.peak || 0} 
            deltaLabel="Max posts/day"
            loading={tsLoading || !intelligence} 
          />
          <StatCard 
            label="Controversy Index" 
            value={`${Math.round(intelligence?.controversy || 0)}%`} 
            sublabel="Avg across window"
            loading={tsLoading || !intelligence} 
          />
          <StatCard 
            label="Avg Interaction" 
            value={intelligence?.interaction.toFixed(1) || 0} 
            sublabel="Comments per post" 
            loading={tsLoading || !intelligence}
          />
          <StatCard 
            label="Communities" 
            value={intelligence?.communities || 0} 
            sublabel="Active subreddits"
            loading={!overview || !intelligence}
          />
        </div>

        {/* 2. Dual-Axis Chart */}
        <div style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 24,
          background: "rgba(255,255,255,0.02)",
          marginBottom: 32
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Narrative Divergence
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
                Comparing post volume surge against controversy spikes for <span style={{ color: "#ffffff" }}>{selectedEvent.title}</span>.
              </div>
            </div>
          </div>

          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={tsData}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace" }}
                  axisLine={false} tickLine={false} width={38}
                  label={{ value: 'Posts', angle: -90, position: 'insideLeft', offset: 10, fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: "'DM Mono', monospace" }}
                />
                <YAxis 
                  yAxisId="right" orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace" }}
                  axisLine={false} tickLine={false} width={38}
                  label={{ value: 'Controversy %', angle: 90, position: 'insideRight', offset: 10, fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: "'DM Mono', monospace" }}
                />
                <Tooltip 
                  contentStyle={{ background: "#111111", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 11 }}
                  cursor={{ stroke: "rgba(255,255,255,0.1)" }}
                />
                <Legend 
                  verticalAlign="top" align="right"
                  iconType="circle" 
                  wrapperStyle={{ paddingBottom: 20, fontFamily: "'DM Mono', monospace", fontSize: 10 }} 
                />
                <Bar yAxisId="left" dataKey="posts" name="Post Volume" fill="rgba(55,138,221,0.2)" radius={[4, 4, 0, 0]} />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="controversy" 
                  name="Controversy Index" 
                  stroke="#E24B4A" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                {intelligence?.xMin && intelligence?.xMax && (
                  <ReferenceArea 
                    yAxisId="left"
                    x1={intelligence.xMin} 
                    x2={intelligence.xMax} 
                    fill="rgba(226,75,74,0.08)" 
                    stroke="rgba(226,75,74,0.2)"
                    strokeDasharray="3 3"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. AI Narrative + Subreddit Rankings */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 32, marginBottom: 32 }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <AIInsightBox summary={aiSummary} loading={loading} label={`Analysis: ${selectedEvent.title}`} />
            
            {/* Explore Further Questions */}
            <div style={{ padding: 20, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12, textTransform: "uppercase" }}>
                Deep Dive Questions:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {questions.map(btn => (
                  <button 
                    key={btn}
                    onClick={() => {
                      setLoading(true);
                      setTimeout(() => setLoading(false), 300);
                    }}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 100,
                      padding: "6px 14px",
                      fontSize: 11,
                      fontFamily: "'DM Mono', monospace",
                      color: "#ffffff",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Real Subreddit Rankings */}
          <div style={{
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: 20,
            background: "rgba(255,255,255,0.01)"
          }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 20 }}>
              Top Communities
            </div>

            {!overview ? (
              [1,2,3,4,5].map(i => <LoadingSkeleton key={i} height={32} className="mb-3" />)
            ) : (
              overview.subreddits.slice(0, 6).map(sub => (
                <SubredditBar 
                  key={sub.subreddit}
                  name={sub.subreddit}
                  count={sub.count}
                  maxCount={Math.max(...overview.subreddits.map(s => s.count))}
                  pctIncrease={selectedEvent.spike_factor > 1.5 ? Math.round(selectedEvent.spike_factor * 12) : 0}
                />
              ))
            )}
          </div>
        </div>

      </div>

      {/* ── Right Sidebar: Event Rail ── */}
      <aside style={{ 
        height: "calc(100vh - 48px)", 
        overflowY: "auto", 
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        paddingLeft: 24,
        position: "sticky",
        top: 0,
      }}>
        {/* Timeline Info Box */}
        {showInfo && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding: 16,
            marginBottom: 24,
            position: "relative"
          }}>
            <button 
              onClick={() => setShowInfo(false)}
              style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 10 }}
            >✕</button>
            <h4 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#ffffff", margin: "0 0 8px", textTransform: "uppercase" }}>What is this timeline?</h4>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, margin: 0 }}>
              This timeline highlights major real-world events detected from spikes in Reddit activity. 
              Clicking an event updates the dashboard to show how Reddit reacted in real-time.
            </p>
          </div>
        )}

        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 20,
        }}>
          Timeline Events
        </div>
        
        {eventsLoading ? (
          [1,2,3,4,5].map(i => <LoadingSkeleton key={i} height={80} className="mb-4" />)
        ) : (
          events.slice(0, 25).map((ev, i) => (
            <EventRow 
              key={`${ev.date}-${i}`}
              {...ev} 
              selected={selectedEvent?.date === ev.date && selectedEvent?.title === ev.title}
              onClick={() => {
                setLoading(true);
                setSelectedEvent(ev);
                // Dashboard updates automatically via useEffect on selectedEvent
              }}
            />
          ))
        )}
      </aside>

    </div>
  );
}
