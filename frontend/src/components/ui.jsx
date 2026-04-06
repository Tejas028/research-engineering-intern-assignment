import React, { useEffect, useState, useRef } from 'react';

// ─── Typewriter hook ────────────────────────────────────────────────────────
function useTypewriter(text, speed = 12) {
  const [displayed, setDisplayed] = useState('');
  const intervalRef = useRef(null);

  useEffect(() => {
    setDisplayed('');
    if (!text) return;
    let i = 0;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(intervalRef.current);
    }, speed);
    return () => clearInterval(intervalRef.current);
  }, [text, speed]);

  return displayed;
}

// ─── Counter animation ───────────────────────────────────────────────────────
function useCounter(value) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let target = parseFloat(value);
    if (isNaN(target)) { setDisplayValue(value); return; }
    let start = 0;
    const duration = 600;
    const startTime = performance.now();

    const update = (time) => {
      let progress = (time - startTime) / duration;
      if (progress > 1) progress = 1;
      let ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const strVal = value.toString();
      if (strVal.includes('.') || strVal.includes('%')) {
        let isPercent = strVal.includes('%');
        let raw = target * ease;
        if (strVal.includes('.') && !isPercent) setDisplayValue(raw.toFixed(1));
        else if (isPercent) setDisplayValue(raw.toFixed(1) + '%');
        else setDisplayValue(Math.floor(raw));
      } else {
        setDisplayValue(Math.floor(target * ease));
      }
      if (progress < 1) requestAnimationFrame(update);
      else setDisplayValue(value);
    };
    requestAnimationFrame(update);
  }, [value]);

  return displayValue;
}

// ─── LoadingSkeleton ─────────────────────────────────────────────────────────
export const LoadingSkeleton = ({ height, className = "" }) => (
  <div
    className={`shimmer w-full rounded ${className}`}
    style={{ height: typeof height === 'number' ? `${height}px` : height }}
  />
);

// ─── StatCard ────────────────────────────────────────────────────────────────
export const StatCard = ({ label, value, sublabel, delta, deltaLabel, trend, loading }) => {
  const displayValue = useCounter(value);

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8,
      padding: 12,
      transition: "background 0.12s ease",
    }}>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <LoadingSkeleton height={10} className="w-1/3" />
          <LoadingSkeleton height={24} className="w-1/2" />
          <LoadingSkeleton height={10} className="w-2/3" />
        </div>
      ) : (
        <>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}>
            {label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 28,
              fontWeight: 500,
              color: "#ffffff",
              lineHeight: 1,
            }}>
              {typeof value === 'number' || !isNaN(parseFloat(value)) ? displayValue : value}
            </span>
            {delta !== undefined && (
              <span style={{ 
                fontFamily: "'DM Mono', monospace", 
                fontSize: 10, 
                color: delta >= 0 ? "#4ade80" : "#f87171",
                marginLeft: 4
              }}>
                {delta >= 0 ? '+' : ''}{delta}%
              </span>
            )}
          </div>
          {(sublabel || deltaLabel) && (
            <div style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
            }}>
              {deltaLabel || sublabel}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── SectionHeader ───────────────────────────────────────────────────────────
export const SectionHeader = ({ title, subtitle }) => (
  <div style={{ marginBottom: 16 }}>
    <h3 style={{
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 14,
      fontWeight: 600,
      color: "#ffffff",
      margin: 0,
      lineHeight: 1.3,
    }}>
      {title}
    </h3>
    {subtitle && (
      <p style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 11,
        color: "rgba(255,255,255,0.4)",
        marginTop: 4,
        marginBottom: 0,
      }}>
        {subtitle}
      </p>
    )}
  </div>
);

// ─── AIInsightBox ─────────────────────────────────────────────────────────────
export const AIInsightBox = ({ summary, loading, label = "AI Narrative Summary" }) => {
  const typed = useTypewriter(summary || '', 10);

  return (
    <div style={{
      border: "1px solid rgba(255,255,255,0.12)",
      borderLeft: "3px solid #E24B4A",
      borderRadius: "0 8px 8px 0",
      background: "rgba(255,255,255,0.03)",
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          background: "rgba(226,75,74,0.2)",
          color: "#f87171",
          borderRadius: 4,
          padding: "2px 8px",
          flexShrink: 0,
        }}>
          AI ANALYSIS
        </span>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
        }}>
          {label}
        </span>
      </div>

      <div style={{ minHeight: 60 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <LoadingSkeleton height={12} className="w-[90%]" />
            <LoadingSkeleton height={12} className="w-[75%]" />
          </div>
        ) : (
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            color: "rgba(255,255,255,0.85)",
            lineHeight: 1.7,
            margin: 0,
          }}>
            {typed}
          </p>
        )}
      </div>
    </div>
  );
};

// ─── SubredditBar ─────────────────────────────────────────────────────────────
export const getIdeologyColor = (subreddit) => {
  const sub = (subreddit || "").toLowerCase();
  const left = ["politics", "whitepeopletwitter", "democrats", "worldnews", "news", "liberal", "socialism", "anarchism"];
  const right = ["conservative", "republican", "conspiracy", "walkaway"];
  if (left.includes(sub)) return "#60A5FA";
  if (right.includes(sub)) return "#E24B4A";
  return "#1D9E75";
};

export const SubredditBar = ({ name, count, maxCount, pctIncrease }) => {
  const color = getIdeologyColor(name);
  const pct = Math.max(4, (count / maxCount) * 100);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#ffffff" }}>
            r/{name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {pctIncrease !== undefined && (
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: pctIncrease >= 0 ? "#4ade80" : "#f87171" }}>
              {pctIncrease >= 0 ? '↑' : '↓'} {Math.abs(pctIncrease)}%
            </span>
          )}
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            {count.toLocaleString()}
          </span>
        </div>
      </div>
      <div style={{ background: "rgba(255,255,255,0.08)", height: 6, borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          backgroundColor: color, borderRadius: 3,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
};

// ─── Tag pill helper ──────────────────────────────────────────────────────────
const TAG_STYLES = {
  election:      { bg: "rgba(226,75,74,0.15)",  color: "#f87171",  border: "0.5px solid rgba(226,75,74,0.3)" },
  political:     { bg: "rgba(226,75,74,0.15)",  color: "#f87171",  border: "0.5px solid rgba(226,75,74,0.3)" },
  protest:       { bg: "rgba(226,75,74,0.15)",  color: "#f87171",  border: "0.5px solid rgba(226,75,74,0.3)" },
  policy:        { bg: "rgba(55,138,221,0.15)", color: "#60a5fa",  border: "0.5px solid rgba(55,138,221,0.3)" },
  international: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24",  border: "0.5px solid rgba(251,191,36,0.3)" },
  economic:      { bg: "rgba(251,191,36,0.15)", color: "#fbbf24",  border: "0.5px solid rgba(251,191,36,0.3)" },
};

const TagPill = ({ category }) => {
  const s = TAG_STYLES[category] || TAG_STYLES.policy;
  return (
    <span style={{
      fontFamily: "'DM Mono', monospace",
      fontSize: 10,
      borderRadius: 4,
      padding: "2px 7px",
      background: s.bg,
      color: s.color,
      border: s.border,
      display: "inline-block",
      textTransform: "capitalize",
    }}>
      {category}
    </span>
  );
};

// ─── EventRow ─────────────────────────────────────────────────────────────────
export const EventRow = ({ date, title, category, spike_factor, selected, onClick }) => {
  const [hovered, setHovered] = useState(false);

  const bg = selected
    ? "rgba(255,255,255,0.06)"
    : hovered
    ? "rgba(255,255,255,0.04)"
    : "transparent";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        padding: "10px 12px",
        borderRadius: 8,
        cursor: "pointer",
        background: bg,
        transition: "background 0.12s ease",
        marginBottom: 2,
      }}
    >
      {/* Right-edge red accent bar for active */}
      {selected && (
        <div style={{
          position: "absolute",
          right: 0, top: "15%", bottom: "15%",
          width: 3,
          backgroundColor: "#E24B4A",
          borderRadius: "2px 0 0 2px",
        }} />
      )}

      {/* Date */}
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        color: "rgba(255,255,255,0.4)",
        marginBottom: 4,
      }}>
        {date}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 14,
        fontWeight: 500,
        color: "#ffffff",
        lineHeight: 1.4,
        marginBottom: 6,
      }}>
        {title}
      </div>

      {/* Tag row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <TagPill category={category} />
        {spike_factor > 1.5 && (
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: "#f87171",
            background: "rgba(226,75,74,0.1)",
            border: "0.5px solid rgba(226,75,74,0.25)",
            borderRadius: 4,
            padding: "2px 6px",
          }}>
            ↑ {spike_factor}×
          </span>
        )}
      </div>
    </div>
  );
};


// ─── SearchResultCard ─────────────────────────────────────────────────────────

export const SearchResultCard = ({ title, subreddit, author, date, score, relevance, url }) => {
  const [hovered, setHovered] = useState(false);
  const color = getIdeologyColor(subreddit);
  const relColor = relevance < 0.3 ? "#f87171" : relevance < 0.7 ? "#fbbf24" : "#4ade80";

  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          padding: "12px 14px",
          transition: "background 0.12s ease",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <h4 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            color: "#ffffff",
            margin: 0,
            lineHeight: 1.4,
          }}>
            {relevance < 0.3 && <span style={{ color: "#fbbf24", marginRight: 6 }}>⚠</span>}
            {title}
          </h4>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            flexShrink: 0,
          }}>
            ↑ {score}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 4,
              padding: "2px 8px",
              border: "0.5px solid rgba(255,255,255,0.1)",
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color }} />
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                color: "rgba(255,255,255,0.7)",
              }}>
                r/{subreddit}
              </span>
            </div>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
            }}>
              u/{author}
            </span>
          </div>
          {date && (
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
            }}>
              {date.split(' ')[0]}
            </span>
          )}
        </div>

        {/* Relevance bar at bottom */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.06)" }}>
          <div style={{
            height: "100%",
            width: `${Math.max(0, Math.min(100, relevance * 100))}%`,
            backgroundColor: relColor,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>
    </a>
  );
};

// ─── TopicCard ────────────────────────────────────────────────────────────────
export const TopicCard = ({ label, words, count, color, selected, onClick }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: selected
          ? "rgba(255,255,255,0.06)"
          : hovered
          ? "rgba(255,255,255,0.04)"
          : "rgba(255,255,255,0.02)",
        border: selected
          ? `1px solid rgba(255,255,255,0.2)`
          : "1px solid rgba(255,255,255,0.1)",
        borderTop: `3px solid ${color}`,
        borderRadius: 10,
        padding: 14,
        cursor: "pointer",
        transition: "background 0.12s ease, border-color 0.12s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
        <h4 style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          fontWeight: 500,
          color: "#ffffff",
          margin: 0,
          lineHeight: 1.4,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {label}
        </h4>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: "rgba(255,255,255,0.4)",
          background: "rgba(255,255,255,0.06)",
          borderRadius: 4,
          padding: "2px 6px",
          flexShrink: 0,
        }}>
          {count}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {words.slice(0, 8).map((word, i) => (
          <span
            key={word}
            style={i < 3
              ? { backgroundColor: `${color}26`, color: color, fontSize: 10, padding: "2px 6px", borderRadius: 3, fontFamily: "'DM Mono', monospace" }
              : { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", fontSize: 10, padding: "2px 6px", borderRadius: 3, fontFamily: "'DM Mono', monospace" }
            }
          >
            {word}
          </span>
        ))}
      </div>

      {/* Count bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.06)" }}>
        <div style={{ height: "100%", width: `${Math.min(100, (count / 250) * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

// ─── Card ────────────────────────────────────────────────────────────────────
export const Card = ({ children, className = "", style = {} }) => (
  <div 
    className={`bg-white/[0.02] border border-white/10 rounded-2xl ${className}`}
    style={style}
  >
    {children}
  </div>
);

// ─── EmptyState ───────────────────────────────────────────────────────────────
export const EmptyState = ({ icon, message }) => (
  <div style={{
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: 48, opacity: 0.6,
  }}>
    <div style={{ fontSize: 32, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>{icon}</div>
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 13,
      color: "rgba(255,255,255,0.4)",
      textAlign: "center",
      maxWidth: 320,
      lineHeight: 1.6,
    }}>
      {message}
    </div>
  </div>
);

// ─── ErrorBanner ──────────────────────────────────────────────────────────────
export const ErrorBanner = ({ message }) => (
  <div style={{
    border: "1px solid rgba(226,75,74,0.3)",
    background: "rgba(226,75,74,0.08)",
    color: "#f87171",
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    padding: "12px 16px",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    gap: 10,
  }}>
    <span style={{ fontSize: 15 }}>⚠️</span>
    <p style={{ margin: 0 }}>{message}</p>
  </div>
);

// ─── InfoTooltip ──────────────────────────────────────────────────────────────
export function InfoTooltip({ content }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{
          width: 16, height: 16, borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "rgba(255,255,255,0.4)",
          fontSize: 10, cursor: "help",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'DM Mono', monospace", lineHeight: 1, flexShrink: 0,
          transition: "background 0.12s ease",
        }}
      >?</button>
      {visible && (
        <div style={{
          position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)",
          background: "#111111",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, padding: "8px 12px", zIndex: 100,
          width: 260,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12, color: "rgba(255,255,255,0.7)",
          lineHeight: 1.6, pointerEvents: "none",
        }}>
          {content}
        </div>
      )}
    </div>
  );
}
