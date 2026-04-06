import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Search as SearchIcon, Network as NetworkIcon, Layers, CalendarDays } from "lucide-react";
import Overview  from "./pages/Overview";
import Search    from "./pages/Search";
import Network   from "./pages/Network";
import Topics    from "./pages/Topics";
import Events    from "./pages/Events";

const NAV = [
  { to: "/",        label: "Overview", icon: LayoutDashboard },
  { to: "/search",  label: "Search",   icon: SearchIcon      },
  { to: "/network", label: "Network",  icon: NetworkIcon     },
  { to: "/topics",  label: "Topics",   icon: Layers          },
  { to: "/events",  label: "Events",   icon: CalendarDays    },
];

function AppContent() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-[var(--bg-base)]">
      {/* Left Sidebar */}
      <aside className="w-[220px] fixed top-0 left-0 h-full bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex flex-col z-20">
        <div className="p-6 pb-8">
          <div className="text-[16px] tracking-tight">
            <span className="font-semibold text-[var(--text-primary)]">Narrative</span>
            <span className="text-[var(--accent-primary)] font-medium">Net</span>
          </div>
          <div className="font-mono text-[10px] text-[var(--text-muted)] mt-1.5">
            Reddit · Jul 2024 – Feb 2025
          </div>
        </div>

        <nav className="flex-1 flex flex-col px-3 gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors relative ${
                  isActive
                    ? "bg-[#4F6EF71A] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent-primary)] rounded-r-full"></div>}
                  <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-6 mt-auto">
          <div className="font-mono text-[10px] text-[var(--text-muted)] leading-relaxed">
            Live Content Feed<br/>
            Multi-subreddit Scan<br/>
            Automated Flagging
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-[220px] p-6 text-[var(--text-primary)]">
        <div key={location.pathname} className="animate-slide-up">
          <Routes>
            <Route path="/"        element={<Overview />}  />
            <Route path="/search"  element={<Search />}    />
            <Route path="/network" element={<Network />}   />
            <Route path="/topics"  element={<Topics />}    />
            <Route path="/events"  element={<Events />}    />
          </Routes>
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
