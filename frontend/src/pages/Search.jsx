import { useState, useRef } from "react";
import { getSearch } from "../api";
import { SearchResultCard, LoadingSkeleton, SectionHeader } from "../components/ui";
import { Search as SearchIcon, Compass, Zap, Languages } from "lucide-react";

function SuggestChip({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-5 py-4 font-mono text-[11px] text-white/60 hover:text-white hover:bg-white/[0.06] hover:border-white/20 transition-all flex justify-between items-center group"
    >
      <span>{label}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-blue-400 font-bold uppercase tracking-widest">Scan Narrative ↗</span>
    </button>
  );
}

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
    if (!trimmed) { setError("empty"); setResults([]); return; }
    if (trimmed.length < 3) { setError("short"); setResults([]); return; }

    setError(null);
    setLoading(true);
    setResults([]);
    setSuggestions([]);

    try {
      const res = await getSearch({ q: trimmed, limit: 15 });
      setResults(res.data.results || []);
      setSuggestions(res.data.suggested_queries || []);
      setLanguage(res.data.language_detected || "en");
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      
      <header>
        <SectionHeader 
          badge="Vector Intelligence"
          title="Search by Meaning" 
          subtitle="Semantic cross-referencing via deep sentence embeddings"
        />
      </header>

      {/* Search Bar Group */}
      <div className="flex gap-4 p-2 bg-white/5 rounded-2xl border border-white/10 focus-within:border-blue-500/50 focus-within:bg-white/[0.08] transition-all">
        <div className="flex-1 flex items-center px-4 gap-4">
           <SearchIcon size={20} className="text-white/20" />
           <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch(query)}
            placeholder="e.g. 'skepticism about election integrity'"
            className="w-full bg-transparent text-white placeholder-white/20 outline-none font-sans text-lg"
          />
        </div>
        <button
          onClick={() => runSearch(query)}
          className="bg-blue-600 hover:bg-blue-500 text-white font-mono text-[12px] font-bold px-8 py-3 rounded-xl shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
        >
          EXECUTE SCAN
        </button>
      </div>

      {language !== "en" && results.length > 0 && (
         <div className="flex items-center gap-3 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-500 font-mono text-[10px] uppercase tracking-widest animate-pulse">
          <Languages size={14} /> Non-English input detected: {language.toUpperCase()}
        </div>
      )}

      <div className="space-y-6">
        {loading ? (
          <div className="space-y-4">
             {[1,2,3,4].map(i => <LoadingSkeleton key={i} height={120} className="rounded-2xl" />)}
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-4 animate-slide-up">
            <div className="flex items-center gap-2 px-2 font-mono text-[10px] text-white/30 uppercase tracking-[0.2em] mb-4">
               <Zap size={12} className="text-yellow-500" /> Matched Narrative Segments
            </div>
            {results.map((r) => (
              <SearchResultCard 
                key={r.id} 
                {...r}
                date={r.created_utc}
                relevance={r.similarity ?? 0}
              />
            ))}
          </div>
        ) : (
          <div className="animate-slide-up">
            <div className="flex items-center gap-2 px-2 font-mono text-[10px] text-white/30 uppercase tracking-[0.2em] mb-6">
               <Compass size={14} className="text-blue-400" /> Intelligence Starting Points
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(suggestions.length > 0 ? suggestions : [
                "Claims of voter fraud in swing states",
                "Narratives about immigration policy",
                "Economic anxiety vs statistical growth",
                "International reactions to the US election"
              ]).map((s, i) => (
                <SuggestChip key={i} label={s} onClick={() => { setQuery(s); runSearch(s); }} />
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
