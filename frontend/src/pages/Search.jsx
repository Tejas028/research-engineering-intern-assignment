import { useState, useRef } from "react";
import { getSearch } from "../api";
import { SearchResultCard, LoadingSkeleton, EmptyState, ErrorBanner } from "../components/ui";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState("en");
  
  const inputRef = useRef(null);

  const runSearch = async (q) => {
    const trimmed = (q || "").trim();

    // Edge case: empty
    if (!trimmed) {
      setError("empty");
      setResults([]);
      return;
    }
    // Edge case: too short
    if (trimmed.length < 3) {
      setError("short");
      setResults([]);
      return;
    }

    setError(null);
    const hasNonAscii = /[^\x00-\x7F]/.test(trimmed);
    setLanguage(hasNonAscii ? "other" : "en"); // pre-set; backend may override

    setLoading(true);
    setResults([]);
    setSuggestions([]);

    try {
      const res = await getSearch({ q: trimmed, limit: 20 });
      const data = res.data;
      setResults(data.results || []);
      setSuggestions(data.suggested_queries || []);
      
      // backend language detection takes precedence
      if (data.language && data.language !== "en") setLanguage(data.language);
      else if (!hasNonAscii) setLanguage("en");
      else setLanguage("other");
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") runSearch(query);
  };

  const handleChip = (chip) => {
    setQuery(chip);
    runSearch(chip);
    inputRef.current?.focus();
  };

  // Determine what to show beneath the search bar
  let body;
  if (loading) {
    body = (
      <div className="space-y-3 mt-6">
        {Array.from({ length: 5 }).map((_, i) => <LoadingSkeleton key={i} height={88} className="rounded-xl mb-3" />)}
      </div>
    );
  } else if (error === "empty") {
    body = (
      <div className="mt-8 space-y-4">
        <p className="text-[12px] text-[var(--text-muted)] font-mono uppercase tracking-wider">Quick Searches</p>
        <div className="flex flex-wrap gap-2">
          {["Anger about immigration policy", "Support for union strikes", "Critique of healthcare costs", "Discussion on climate action"].map((s, i) => (
            <button
              key={i}
              onClick={() => handleChip(s)}
              className="bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)] border border-[var(--accent-primary)]/30 hover:border-transparent text-[var(--accent-primary)] hover:text-white text-[13px] px-4 py-2 rounded-xl cursor-pointer transition-all duration-150"
            >
              🔍 {s}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (error === "short") {
    body = <ErrorBanner message="Query too short — enter at least 3 characters." />
  } else if (results.length === 0 && !error && query.trim().length > 0) {
    body = <EmptyState icon="∅" message="No results found. Try broader or different phrasing." />
  } else if (results.length === 0 && !error && query.trim().length === 0) {
    body = (
      <div className="mt-8 space-y-4">
        <p className="text-[12px] text-[var(--text-muted)] font-mono uppercase tracking-wider">Quick Searches</p>
        <div className="flex flex-wrap gap-2">
          {["Anger about immigration policy", "Support for union strikes", "Critique of healthcare costs", "Discussion on climate action"].map((s, i) => (
            <button
              key={i}
              onClick={() => handleChip(s)}
              className="bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)] border border-[var(--accent-primary)]/30 hover:border-transparent text-[var(--accent-primary)] hover:text-white text-[13px] px-4 py-2 rounded-xl cursor-pointer transition-all duration-150"
            >
              🔍 {s}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (results.length > 0) {
    body = (
      <div className="mt-4 space-y-3">
        {results.map((r) => (
          <SearchResultCard 
            key={r.id} 
            title={r.title}
            subreddit={r.subreddit}
            author={r.author}
            date={r.created_utc}
            score={r.score}
            relevance={r.similarity ?? 0}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto pl-2 pr-2">
      {/* Search bar */}
      <div className="flex gap-4 relative items-center group">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            id="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by meaning, not keywords — e.g. 'anger about immigration policy'"
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl pl-5 pr-10 py-3.5 text-[14px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:shadow-[0_0_0_1px_rgba(79,110,247,0.4)] transition-all duration-200"
          />
          {query.length > 0 && (
            <button 
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              ×
            </button>
          )}
        </div>
        
        <button
          id="search-btn"
          onClick={() => runSearch(query)}
          className="bg-[var(--accent-primary)] hover:bg-[#3451D1] text-white px-6 py-3.5 rounded-xl text-[14px] font-medium whitespace-nowrap transition-all duration-200 hover:translate-x-1"
        >
          Search
        </button>
      </div>

      {/* Non-English / non-ASCII warning badge */}
      {language !== "en" && results.length > 0 && !loading && (
        <div className="inline-flex items-center gap-2 bg-[var(--accent-warn)]/10 border border-[var(--accent-warn)]/30 text-[var(--accent-warn)] text-[12px] px-3.5 py-1.5 rounded-full slide-up">
          <span className="font-bold">⚠</span> Non-English detected — results may vary
        </div>
      )}

      {/* Main body */}
      {body}

      {/* Suggested queries */}
      {suggestions.length > 0 && !loading && (
        <div className="mt-8">
          <p className="text-[12px] text-[var(--text-muted)] font-mono mb-3 uppercase tracking-wider">Suggested refinements</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleChip(s)}
                className="bg-[var(--accent-primary)]/20 hover:bg-[var(--accent-primary)] border border-[var(--accent-primary)]/40 hover:border-transparent text-[var(--accent-primary)] hover:text-white text-[12px] px-3 py-1.5 rounded-full cursor-pointer transition-all duration-150"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
