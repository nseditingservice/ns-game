import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import type { Page } from "./types";
import { chime, remainingMs, timerDisplay, useNow } from "./focus";
import { titleFor, useXp } from "./game";
import { Toasts } from "./ui";
import { useSync } from "./sync";
import Today from "./pages/Today";
import Calendar from "./pages/Calendar";
import Did from "./pages/Did";
import Habits from "./pages/Habits";
import Health from "./pages/Health";
import Goals from "./pages/Goals";
import Focus from "./pages/Focus";
import ReviewPage from "./pages/Review";
import SettingsPage from "./pages/Settings";

export const NAV: { id: Page; label: string; icon: string; mobile?: boolean }[] = [
  { id: "today", label: "Today", icon: "☀️", mobile: true },
  { id: "calendar", label: "Calendar", icon: "📅", mobile: true },
  { id: "did", label: "Things I Did", icon: "📊", mobile: true },
  { id: "habits", label: "Habits", icon: "✅", mobile: true },
  { id: "health", label: "Health", icon: "💪", mobile: true },
  { id: "goals", label: "Goals", icon: "🎯" },
  { id: "focus", label: "Focus", icon: "⏱️" },
  { id: "review", label: "Review", icon: "📝" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export type Go = (p: Page) => void;

export default function App() {
  const [page, setPage] = useState<Page>(() => (location.hash.slice(1) as Page) || "today");
  const { timer } = useStore();
  const sync = useSync();
  const xp = useXp();
  const now = useNow();
  const chimed = useRef<number | null>(null);

  useEffect(() => {
    const onHash = () => setPage((location.hash.slice(1) as Page) || "today");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go: Go = (p) => {
    location.hash = p;
    setPage(p);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (!timer) {
      document.title = "NS Game";
      return;
    }
    document.title = `${timer.pausedAt ? "⏸" : "●"} ${timerDisplay(timer, now)} · ${timer.label}`;
    if (timer.plannedMins && remainingMs(timer, now) <= 0 && chimed.current !== timer.startedAt) {
      chimed.current = timer.startedAt;
      chime();
      if ("Notification" in window && Notification.permission === "granted") new Notification("Focus session complete 🎉", { body: timer.label });
    }
  }, [timer, now]);

  const syncIcon = sync.status === "synced" ? "☁️" : sync.status === "uploading" || sync.status === "connecting" ? "🔄" : sync.status === "error" ? "⚠️" : "";

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">
          <span className="logo">NS</span> Game
        </div>
        <button className="level-card" onClick={() => go("today")}>
          <div className="row between">
            <strong>Lv {xp.lvl.level}</strong>
            <span className="muted small">{titleFor(xp.lvl.level)}</span>
          </div>
          <div className="bar xp">
            <div style={{ width: `${(xp.lvl.into / xp.lvl.need) * 100}%` }} />
          </div>
          <div className="muted tiny">
            {xp.lvl.into}/{xp.lvl.need} XP
          </div>
        </button>
        {NAV.map((n) => (
          <button key={n.id} className={`nav ${page === n.id ? "active" : ""}`} onClick={() => go(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
        {timer && (
          <button className={`mini-timer ${timer.plannedMins && remainingMs(timer, now) <= 0 ? "over" : ""}`} onClick={() => go("focus")}>
            <div className="mini-time">{timerDisplay(timer, now)}</div>
            <div className="mini-label">
              {timer.pausedAt ? "Paused · " : ""}
              {timer.label}
            </div>
          </button>
        )}
        {syncIcon && (
          <div className="sync-note muted tiny" title={sync.error}>
            {syncIcon} {sync.status === "error" ? "Sync error" : "Synced"}
          </div>
        )}
      </nav>

      <header className="mobile-top">
        <span className="brand">
          <span className="logo">NS</span> Game
        </span>
        <span className="row">
          {timer && (
            <button className="timer-pill" onClick={() => go("focus")}>
              ● {timerDisplay(timer, now)}
            </button>
          )}
          <span className="lv-pill">Lv {xp.lvl.level}</span>
          {syncIcon && <span>{syncIcon}</span>}
        </span>
      </header>

      <main className="content">
        {page === "today" && <Today go={go} />}
        {page === "calendar" && <Calendar go={go} />}
        {page === "did" && <Did />}
        {page === "habits" && <Habits />}
        {page === "health" && <Health />}
        {page === "goals" && <Goals />}
        {page === "focus" && <Focus />}
        {page === "review" && <ReviewPage />}
        {page === "settings" && <SettingsPage />}
        {page === "more" && <More go={go} />}
      </main>

      <nav className="tabbar">
        {NAV.filter((n) => n.mobile).map((n) => (
          <button key={n.id} className={page === n.id ? "active" : ""} onClick={() => go(n.id)}>
            <span>{n.icon}</span>
            <small>{n.id === "did" ? "I Did" : n.label}</small>
          </button>
        ))}
        <button className={["goals", "focus", "review", "settings", "more"].includes(page) ? "active" : ""} onClick={() => go("more")}>
          <span>☰</span>
          <small>More</small>
        </button>
      </nav>
      <Toasts />
    </div>
  );
}

function More({ go }: { go: Go }) {
  return (
    <div className="page">
      <h1>More</h1>
      <div className="more-grid">
        {NAV.filter((n) => !n.mobile).map((n) => (
          <button key={n.id} className="card more-item" onClick={() => go(n.id)}>
            <span className="more-icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </div>
    </div>
  );
}
