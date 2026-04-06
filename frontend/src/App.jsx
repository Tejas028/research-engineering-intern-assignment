import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Search as SearchIcon, Network as NetworkIcon, Layers, CalendarDays, Zap, ShieldCheck } from "lucide-react";
import Overview  from "./pages/Overview";
import Search    from "./pages/Search";
import Network   from "./pages/Network";
import Topics    from "./pages/Topics";
import Events    from "./pages/Events";

const NAV = [
  { to: "/",        label: "Overview",  icon: LayoutDashboard },
  { to: "/events",  label: "Timeline",  icon: CalendarDays    },
  { to: "/topics",   label: "Topics",    icon: Layers          },
  { to: "/network",  label: "Network",   icon: NetworkIcon     },
  { to: "/search",   label: "Search",    icon: SearchIcon      },
];

function AppContent() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#050505] text-white flex overflow-x-hidden selection:bg-blue-500/30">
      
      {/* COLUMN 1: LEFT EDITORIAL RAIL (Navigation) */}
      <aside className="w-[280px] h-screen sticky top-0 bg-[#080808] border-r border-white/5 flex flex-col z-30 flex-shrink-0">
        {/* Brand/Logo Section */}
        <div className="p-8 pb-10">
          <div className="flex items-center gap-2 group cursor-default">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-transform group-hover:scale-110">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1">
                <span className="font-serif text-xl font-bold tracking-tight text-white">Narrative</span>
                <span className="font-serif text-xl font-bold italic text-[#E24B4A]">Net</span>
              </div>
              <span className="font-mono text-[9px] text-white/30 uppercase tracking-[0.25em] -mt-1">Intelligence</span>
            </div>
          </div>
        </div>

        {/* Global Navigation */}
        <nav className="flex-1 px-4 space-y-1.5">
          <div className="px-4 py-2 mb-2 font-mono text-[10px] text-white/20 uppercase tracking-widest">Modules</div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-mono transition-all duration-300 group
                ${isActive 
                  ? "bg-gradient-to-r from-blue-600/15 via-blue-600/5 to-transparent text-white border-l-2 border-blue-500" 
                  : "text-white/40 hover:text-white/80 hover:bg-white/5 border-l-2 border-transparent"}
              `}
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} strokeWidth={isActive ? 2 : 1.5} className={isActive ? "text-blue-400" : "text-white/20 group-hover:text-white/40"} />
                  <span className="tracking-wide">{label}</span>
                  {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* System Monitoring Section */}
        <div className="p-6 mt-auto border-t border-white/5 bg-black/20">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-white/40 uppercase tracking-wider">Live Nodes</span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-green-400">
                <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" /> ONLINE
              </span>
            </div>
            <div className="bg-white/5 h-1 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full w-[82%] animate-pulse" />
            </div>
            <div className="p-3 bg-white/5 rounded-lg border border-white/10 group cursor-default hover:bg-white/[0.08] transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <Zap size={12} className="text-yellow-500" />
                <span className="font-mono text-[10px] text-yellow-500 uppercase tracking-wider">Recent Spike</span>
              </div>
              <div className="text-[10px] text-white/50 leading-tight">
                Anomalous volume detected on <span className="text-white/80">r/politics</span> (2.4x baseline).
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* COLUMN 2 & 3: MAIN HUB AND RIGHT CONTEXTUAL RAIL */}
      <main className="flex-1 min-h-screen bg-[#050505]">
        {/* Main Viewport Container */}
        <div className="w-full max-w-[1400px] mx-auto px-10 py-12 min-h-screen">
          {/* Animated Route Container */}
          <div key={location.pathname} className="animate-slide-up">
            <Routes>
              <Route path="/"        element={<Overview />}  />
              <Route path="/events"  element={<Events />}    />
              <Route path="/topics"  element={<Topics />}    />
              <Route path="/network" element={<Network />}   />
              <Route path="/search"  element={<Search />}    />
            </Routes>
          </div>
        </div>
      </main>

    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppContent />
    </BrowserRouter>
  );
}
