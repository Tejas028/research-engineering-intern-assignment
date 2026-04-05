import React, { useEffect, useState } from 'react';

// Animation for numbers
function useCounter(value) {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    let target = parseFloat(value);
    if (isNaN(target)) {
      setDisplayValue(value);
      return;
    }
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
        if (strVal.includes('.') && !isPercent) {
          setDisplayValue(raw.toFixed(1));
        } else if (isPercent) {
          setDisplayValue(raw.toFixed(1) + '%');
        } else {
          setDisplayValue(Math.floor(raw));
        }
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

// Loading Skeleton
export const LoadingSkeleton = ({ height, className = "" }) => (
  <div className={`shimmer w-full ${className}`} style={{ height: typeof height === 'number' ? `${height}px` : height }}></div>
);

// StatCard
export const StatCard = ({ label, value, sublabel, trend, loading }) => {
  const displayValue = useCounter(value);
  
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 hover:border-[var(--border-active)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(79,110,247,0.2)] transition-all duration-150 relative overflow-hidden group">
      {loading ? (
        <div className="flex flex-col space-y-3">
          <LoadingSkeleton height={12} className="rounded w-1/3" />
          <LoadingSkeleton height={28} className="rounded w-1/2" />
          <LoadingSkeleton height={12} className="rounded w-2/3" />
        </div>
      ) : (
        <>
          <div className="uppercase font-mono text-[10px] text-[var(--text-mono)] mb-2 font-medium tracking-wider">{label}</div>
          <div className="text-2xl font-bold text-[var(--text-primary)] mb-1 flex items-baseline gap-2 font-sans">
            <span className="animate-[slide-up_200ms_ease-out]">{typeof value === 'number' || !isNaN(parseFloat(value)) ? displayValue : value}</span>
            {trend === 'up' && <span className="text-[14px] text-[var(--accent-center)]">↑</span>}
            {trend === 'down' && <span className="text-[14px] text-[var(--accent-danger)]">↓</span>}
          </div>
          {sublabel && <div className="text-[11px] text-[var(--text-muted)] truncate">{sublabel}</div>}
        </>
      )}
    </div>
  );
};

// SectionHeader
export const SectionHeader = ({ title, subtitle }) => (
  <div className="flex flex-col mb-4 pl-3 relative">
    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[var(--accent-primary)] rounded-full"></div>
    <h3 className="text-[14px] font-semibold text-[var(--text-primary)] leading-tight">{title}</h3>
    {subtitle && <p className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">{subtitle}</p>}
  </div>
);

// AIInsightBox
export const AIInsightBox = ({ summary, loading, label = "AI Narrative Summary" }) => (
  <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden relative" style={{ background: "linear-gradient(180deg, var(--bg-surface) 0%, #0F1420 100%)" }}>
    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent-primary)]"></div>
    <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] pulse-dot"></div>
      <div className="uppercase font-mono text-[10px] tracking-wider text-[var(--text-primary)] font-medium">{label}</div>
      <div className="text-[10px] font-mono text-[var(--text-muted)] ml-auto">· Groq llama-3.3-70b</div>
    </div>
    <div className="p-4 relative min-h-[140px]">
      {loading ? (
        <div className="space-y-3 mt-1">
          <LoadingSkeleton height={12} className="rounded-md w-[85%]" />
          <LoadingSkeleton height={12} className="rounded-md w-[70%]" />
          <LoadingSkeleton height={12} className="rounded-md w-[90%]" />
        </div>
      ) : (
        <p className="text-[13px] text-[var(--text-secondary)] leading-[1.7] animate-[slide-up_300ms_ease-out]">{summary}</p>
      )}
    </div>
  </div>
);

// SearchResultCard
const getIdeologyColor = (subreddit) => {
  const sub = (subreddit || "").toLowerCase();
  const left = ["politics", "whitepeopletwitter", "democrats", "worldnews", "news"];
  const right = ["conservative", "republican", "conspiracy", "walkaway"];
  if (left.includes(sub)) return "var(--accent-left)";
  if (right.includes(sub)) return "var(--accent-right)";
  return "var(--accent-center)";
};

export const SearchResultCard = ({ title, subreddit, author, date, score, relevance }) => {
  const color = getIdeologyColor(subreddit);
  const relColor = relevance < 0.3 ? "var(--accent-danger)" : relevance < 0.7 ? "var(--accent-warn)" : "var(--accent-center)";
  
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl hover:-translate-y-0.5 hover:border-[var(--border-active)] transition-all duration-150 overflow-hidden relative group">
      <div className="p-4 pb-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h4 className="text-[14px] font-medium text-[var(--text-primary)] leading-snug">
            {relevance < 0.3 && <span className="text-[var(--accent-warn)] mr-1.5 font-sans font-normal" title="Low Relevance">⚠</span>}
            {title}
          </h4>
          <div className="font-mono text-[11px] text-[var(--text-muted)] flex-shrink-0 text-right">
            ⭐ {score}
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-[var(--bg-elevated)] px-2.5 py-1 rounded-full border border-[var(--border-subtle)]">
              <span className="w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: color }}></span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)] tracking-wide">r/{subreddit}</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] hidden sm:block font-mono">u/{author}</div>
          </div>
          {date && <div className="text-[11px] text-[var(--text-muted)] font-mono">{date.split(' ')[0]}</div>}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-[3px] bg-black/20 w-full overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${Math.max(0, Math.min(100, relevance * 100))}%`, backgroundColor: relColor }}></div>
      </div>
    </div>
  );
};

// TopicCard
export const TopicCard = ({ label, words, count, color, selected, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`bg-[var(--bg-surface)] border rounded-xl overflow-hidden cursor-pointer transition-all duration-150 relative hover:-translate-y-0.5 group
      ${selected ? 'border-transparent shadow-lg' : 'border-[var(--border-subtle)] hover:border-[var(--border-active)]'}`}
      style={{
        boxShadow: selected ? `0 0 0 1px ${color}, 0 4px 12px rgba(0,0,0,0.2)` : undefined
      }}
    >
      <div className="h-[3px] w-full transition-all" style={{ backgroundColor: color }}></div>
      <div className="p-4 flex flex-col h-full relative">
        
        <div className="flex justify-between items-start mb-3 gap-2">
          <h4 className="text-[13px] font-medium text-[var(--text-primary)] line-clamp-2 leading-snug">{label}</h4>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded font-mono text-[10px] px-1.5 py-0.5 text-[var(--text-muted)] flex-shrink-0">
            {count}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3 mt-auto">
          {words.slice(0, 8).map((word, i) => {
            const isTop = i < 3;
            // The prompt says: "First 3 chips: color at 15% opacity background, colored text."
            // "Remaining 5: var(--bg-elevated) background, var(--text-muted) text"
            return (
              <span 
                key={word} 
                className={`text-[10px] px-1.5 py-0.5 rounded ${isTop ? 'font-medium' : 'font-mono'}`}
                style={isTop ? { backgroundColor: `${color}26`, color: color } : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
      
      {/* Mini bar at bottom */}
      <div className="absolute bottom-0 left-0 h-[2px] bg-[var(--bg-elevated)] w-full">
        {/* We assume max top-end is around 1000 for visual scaling, could be adjusted */}
        <div className="h-full transition-all" style={{ width: `${Math.min(100, (count / 250) * 100)}%`, backgroundColor: color }}></div>
      </div>
    </div>
  );
};

// EventRow
const CATEGORY_COLORS = {
  election: "var(--accent-primary)",
  policy: "var(--accent-center)",
  protest: "var(--accent-danger)",
  international: "var(--accent-warn)"
};

export const EventRow = ({ date, title, category, spikeFactory, selected, onClick }) => {
  const color = CATEGORY_COLORS[category] || "var(--text-muted)";
  
  return (
    <div 
      onClick={onClick}
      className={`relative pl-8 pr-4 py-3 cursor-pointer border-l-2 transition-all duration-150 group
      ${selected ? 'bg-[var(--bg-elevated)]' : 'border-transparent hover:bg-[var(--bg-elevated)]/50'}`}
      style={{ borderLeftColor: selected ? color : 'transparent' }}
    >
      <div className="absolute left-[13px] top-[18px] w-2 h-2 rounded-full z-10" style={{ backgroundColor: color }}></div>
      <div className="absolute left-[16px] top-[18px] bottom-[-18px] w-[1px] bg-[var(--border-subtle)] z-0 group-last:hidden"></div>

      <div className="flex items-center justify-between mb-1.5">
        <div className="font-mono text-[11px] text-[var(--text-muted)]">{date}</div>
        <div className="flex items-center gap-2">
          {spikeFactory > 1.5 && (
            <span className="font-mono text-[10px] text-[var(--accent-danger)] bg-[var(--accent-danger)]/10 px-1.5 rounded border border-[var(--accent-danger)]/20">
              ↑{spikeFactory}×
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize" style={{ color: color, backgroundColor: `${color}26` }}>
            {category}
          </span>
        </div>
      </div>
      <h4 className="text-[13px] text-[var(--text-primary)] leading-snug">{title}</h4>
    </div>
  );
};

// EmptyState
export const EmptyState = ({ icon, message }) => (
  <div className="flex flex-col items-center justify-center p-12 h-full w-full opacity-70">
    <div className="text-[32px] text-[var(--text-muted)] mb-4">{icon}</div>
    <div className="text-[13px] text-[var(--text-muted)] text-center max-w-sm leading-relaxed">{message}</div>
  </div>
);

// ErrorBanner
export const ErrorBanner = ({ message }) => (
  <div className="border border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] text-[13px] p-4 rounded-xl flex items-center gap-3">
    <span className="text-base leading-none">⚠️</span>
    <p>{message}</p>
  </div>
);

export function InfoTooltip({ content }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{
          width: 16, height: 16, borderRadius: "50%",
          background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)", fontSize: 10, cursor: "help",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: "JetBrains Mono", lineHeight: 1, flexShrink: 0
        }}>?</button>
      {visible && (
        <div style={{
          position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)",
          background: "var(--bg-elevated)", border: "1px solid var(--border-active)",
          borderRadius: 8, padding: "8px 12px", zIndex: 100,
          width: 260, fontSize: 12, color: "var(--text-secondary)",
          lineHeight: 1.5, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          pointerEvents: "none"
        }}>
          {content}
        </div>
      )}
    </div>
  );
}
