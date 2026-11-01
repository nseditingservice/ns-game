import { useMemo } from "react";
import { uid, useList, useStore } from "../store";
import { DEFAULT_WASTE_LIMIT, SAID_NO_TAG_ID } from "../types";
import { addDays, fmtHours, monthStart, nowMins, todayStr, weekStart, yearStart } from "../dates";
import { entryMins, isWasted, useIndex } from "../game";
import { celebrate, useTimerActions } from "../ui";
import type { Go } from "../App";

/** "Time I could have said NO to" dashboard: makes wasted time impossible to ignore. */
export function WasteCard({ go }: { go: Go }) {
  const { prefs, put, timer } = useStore();
  const ix = useIndex();
  const entries = useList("entries");
  const timerAct = useTimerActions();
  const limit = prefs.wasteLimitMins ?? DEFAULT_WASTE_LIMIT;
  const today = todayStr();

  const s = useMemo(() => {
    const wasted = entries.filter((e) => isWasted(e, ix.tags));
    const sum = (from: string, to: string) => wasted.filter((e) => e.date >= from && e.date <= to).reduce((n, e) => n + entryMins(e), 0);
    const dayIdx = (new Date().getDay() + 6) % 7; // days into the week
    const week = sum(weekStart(today), today);
    const lastWeekSameSpan = sum(addDays(weekStart(today), -7), addDays(weekStart(today), dayIdx - 7));
    const month = sum(monthStart(today), today);
    // Biggest sinks this month: by project, else note, else tag.
    const sinks = new Map<string, number>();
    for (const e of wasted.filter((x) => x.date >= monthStart(today))) {
      const t = ix.tags.get(e.tagId);
      const key = e.project?.trim() || e.note.trim() || `${t?.emoji ?? ""} ${t?.name ?? "?"}`;
      sinks.set(key, (sinks.get(key) ?? 0) + entryMins(e));
    }
    return {
      today: sum(today, today),
      yesterday: sum(addDays(today, -1), addDays(today, -1)),
      week,
      lastWeekSameSpan,
      month,
      year: sum(yearStart(today), today),
      sinks: [...sinks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    };
  }, [entries, ix.tags, today]);

  const saidNo = ix.tags.get(SAID_NO_TAG_ID) ?? [...ix.tags.values()].find((t) => t.wasted && !t.archived);
  const quickAdd = (mins: number) => {
    if (!saidNo) return;
    // Place it just before anything already logged, so time is never counted twice.
    const todays = entries.filter((e) => e.date === today);
    let end = nowMins();
    for (let i = 0; i < 50; i++) {
      const clash = todays.filter((e) => e.start < end && e.end > end - mins);
      if (!clash.length) break;
      end = Math.min(...clash.map((e) => e.start));
    }
    if (end - mins < 0) {
      celebrate("No free time left today to log that", "🤔");
      return;
    }
    put("entries", { id: uid(), tagId: saidNo.id, date: today, start: end - mins, end, note: "", taskId: null, source: "manual", wasted: true });
    celebrate(`Logged ${fmtHours(mins)}. Honesty is the first step`, "🚫");
  };
  const pct = limit ? Math.min(100, (s.today / limit) * 100) : 0;
  const over = s.today > limit;
  const delta = s.lastWeekSameSpan ? Math.round(((s.week - s.lastWeekSameSpan) / s.lastWeekSameSpan) * 100) : null;
  const m = s.month;

  return (
    <section className="card waste-card">
      <div className="card-head">
        <h2>⏳ Time I could have said NO to</h2>
        <button className="btn ghost small" onClick={() => go("did")}>
          Details →
        </button>
      </div>
      <div className="waste-today">
        <div>
          <div className={`waste-big ${over ? "over" : ""}`}>{fmtHours(s.today)}</div>
          <div className="muted tiny">today · limit {fmtHours(limit)}</div>
        </div>
        <div className="grow">
          <div className="bar waste-bar">
            <div style={{ width: `${pct}%`, background: over ? "#f43f5e" : s.today > limit * 0.7 ? "#fbbf24" : "#34d399" }} />
          </div>
          <div className="tiny" style={{ color: over ? "#fda4af" : "#b4b1cc" }}>
            {over ? `${fmtHours(s.today - limit)} over your limit` : s.today ? `${fmtHours(limit - s.today)} left before your limit` : "Nothing wasted yet today. Keep it that way."}
          </div>
        </div>
      </div>
      <div className="waste-stats">
        {(
          [
            ["Yesterday", s.yesterday],
            ["This week", s.week],
            ["This month", s.month],
            ["This year", s.year],
          ] as [string, number][]
        ).map(([l, v]) => (
          <div key={l}>
            <b>{fmtHours(v)}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
      {delta != null && (
        <p className="small" style={{ color: delta <= 0 ? "#6ee7b7" : "#fda4af" }}>
          {delta <= 0 ? `▼ ${Math.abs(delta)}% less than this point last week. 🎉` : `▲ ${delta}% more than this point last week.`}
        </p>
      )}
      {m >= 60 && (
        <p className="small reality">
          This month = <b>{(m / 60 / 8).toFixed(1)} workdays</b>, or <b>{Math.floor(m / 60)} workouts</b>, or <b>{Math.floor(m / 360)} books</b> you could have had.
        </p>
      )}
      {s.sinks.length > 0 && (
        <div className="tiny muted">
          Biggest sinks this month: {s.sinks.map(([k, v]) => `${k} (${fmtHours(v)})`).join(" · ")}
        </div>
      )}
      <div className="row wrap waste-actions">
        <span className="muted tiny">Just wasted some time? Log it honestly:</span>
        {[15, 30, 60].map((mm) => (
          <button key={mm} className="btn small" disabled={!saidNo} onClick={() => quickAdd(mm)}>
            +{fmtHours(mm)}
          </button>
        ))}
        {!timer && saidNo && (
          <button className="btn small ghost" onClick={() => timerAct.start({ label: saidNo.name, tagId: saidNo.id, plannedMins: null })}>
            ⏱ Start timer
          </button>
        )}
      </div>
    </section>
  );
}
