import { useState } from "react";
import { uid, useList, useMap, useStore } from "../store";
import type { Go } from "../App";
import { fmtDay, fmtHours, fmtTime, nowMins, todayStr, weekStart } from "../dates";
import { autoProgress, dayXp, entryMins, habitStatus, habitStreak, isScheduled, titleFor, useIndex, useXp } from "../game";
import { useHabitToggle } from "../habitActions";
import { timerDisplay, useNow } from "../focus";
import { celebrate, Empty, useTimerActions } from "../ui";
import { AREA_INFO, type Task } from "../types";

export default function Today({ go }: { go: Go }) {
  const { prefs, timer, put, data } = useStore();
  const ix = useIndex();
  const xp = useXp();
  const tags = useList("tags").filter((t) => !t.archived);
  const goals = useMap("goals");
  const tasks = useList("tasks");
  const plans = useList("plans");
  const toggle = useHabitToggle(ix);
  const timerAct = useTimerActions();
  const now = useNow(1000);
  const today = todayStr();
  const week = weekStart(today);
  const [newTask, setNewTask] = useState("");

  const xpToday = dayXp(today, ix);
  const habitsToday = ix.habits.filter((h) => isScheduled(h, today));
  const doneCount = habitsToday.filter((h) => habitStatus(h, today, ix) === "done").length;
  const entries = (ix.entriesByDate.get(today) ?? []).sort((a, b) => a.start - b.start);
  const tracked = entries.reduce((n, e) => n + entryMins(e), 0);
  const awake = Math.max(0, Math.min(nowMins(), prefs.dayEnd * 60) - prefs.dayStart * 60);
  const todayPlans = plans.filter((p) => p.date === today).sort((a, b) => a.start - b.start);
  const weekTasks = tasks.filter((t) => t.week === week).sort((a, b) => Number(a.done) - Number(b.done));
  const hd = ix.health.get(today);
  const meals = ix.mealsByDate.get(today) ?? [];
  const workouts = ix.workoutsByDate.get(today) ?? [];

  // Most-used tags first so one tap starts tracking.
  const tagUse = new Map<string, number>();
  for (const e of Object.values(data.entries)) if (!e.del) tagUse.set(e.tagId, (tagUse.get(e.tagId) ?? 0) + 1);
  const quickTags = [...tags].sort((a, b) => (tagUse.get(b.id) ?? 0) - (tagUse.get(a.id) ?? 0)).slice(0, 10);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const toggleTask = (t: Task) => {
    put("tasks", { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : undefined });
    if (!t.done) celebrate("Task done +10 XP", "✅");
  };

  const addWater = (n: number) => {
    const base = hd ?? { id: today, date: today, sleepHours: null, sleepQuality: null, weight: null, water: 0, steps: null, energy: null, mood: null, notes: "" };
    put("healthDays", { ...base, water: Math.max(0, base.water + n) });
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>
            {greeting}
            {prefs.name ? `, ${prefs.name}` : ""}
          </h1>
          <p className="muted">{fmtDay(today, { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
      </header>

      <section className="card hero">
        <div className="hero-level">
          <div className="level-ring">{xp.lvl.level}</div>
          <div className="grow">
            <div className="row between">
              <strong>
                Level {xp.lvl.level} · {titleFor(xp.lvl.level)}
              </strong>
              <span className="xp-today">+{xpToday.total} XP today</span>
            </div>
            <div className="bar xp">
              <div style={{ width: `${(xp.lvl.into / xp.lvl.need) * 100}%` }} />
            </div>
            <div className="muted tiny">
              {xp.lvl.need - xp.lvl.into} XP to level {xp.lvl.level + 1} · {xp.total.toLocaleString()} XP total
            </div>
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <b>
              {doneCount}/{habitsToday.length}
            </b>
            <span>habits</span>
          </div>
          <div>
            <b>{fmtHours(tracked)}</b>
            <span>logged</span>
          </div>
          <div>
            <b>{meals.length}</b>
            <span>meals</span>
          </div>
          <div>
            <b>{hd?.water ?? 0}</b>
            <span>water</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>What are you doing now?</h2>
          <button className="btn ghost small" onClick={() => go("calendar")}>
            Log past time →
          </button>
        </div>
        {timer ? (
          <div className="now-tracking">
            <div>
              <div className="big-clock">{timerDisplay(timer, now)}</div>
              <div className="muted">{timer.label}</div>
            </div>
            <div className="row">
              <button className="btn" onClick={timerAct.pause}>
                {timer.pausedAt ? "Resume" : "Pause"}
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  const m = timerAct.stop();
                  if (m >= 1) celebrate(`Logged ${fmtHours(m)}`, "⏱️");
                }}
              >
                ■ Stop & log
              </button>
            </div>
          </div>
        ) : (
          <div className="tag-grid">
            {quickTags.map((t) => (
              <button key={t.id} className="tag-btn" style={{ borderColor: t.color }} onClick={() => timerAct.start({ label: t.name, tagId: t.id, plannedMins: null })}>
                <span>{t.emoji}</span>
                {t.name}
              </button>
            ))}
          </div>
        )}
        {awake > 0 && (
          <p className="muted small">
            Logged {fmtHours(tracked)} of {fmtHours(awake)} so far today{tracked < awake * 0.5 ? ". Fill in the gaps on the calendar." : "."}
          </p>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Today's habits</h2>
            <button className="btn ghost small" onClick={() => go("habits")}>
              All →
            </button>
          </div>
          {!habitsToday.length && <Empty>No habits yet. Add some on the Habits page; start tiny.</Empty>}
          <ul className="list">
            {habitsToday.map((h) => {
              const s = habitStatus(h, today, ix);
              const { streak, warn } = habitStreak(h, ix);
              const p = autoProgress(h, today, ix);
              return (
                <li key={h.id} className={`habit-row ${s}`}>
                  <button className={`check ${s === "done" ? "on" : ""}`} onClick={() => toggle(h, today)} aria-label="Toggle habit">
                    {s === "done" ? "✓" : h.emoji}
                  </button>
                  <div className="grow">
                    <div>{h.name}</div>
                    <div className="muted tiny">
                      {p && s !== "done" ? `${Math.round(p.value * 10) / 10}/${p.target} ${p.unit} · auto` : h.tiny ? `Tiny: ${h.tiny}` : ""}
                      {warn && s !== "done" && <span className="warn-text"> · Don't miss twice!</span>}
                    </div>
                  </div>
                  {streak > 0 && <span className="streak">🔥{streak}</span>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Body today</h2>
            <button className="btn ghost small" onClick={() => go("health")}>
              Log →
            </button>
          </div>
          <div className="row between body-row">
            <span>💧 Water</span>
            <span className="row">
              <button className="btn small" onClick={() => addWater(-1)}>
                −
              </button>
              <b className="count">{hd?.water ?? 0}</b>
              <button className="btn small primary" onClick={() => addWater(1)}>
                +
              </button>
            </span>
          </div>
          <div className="row between body-row">
            <span>🍽️ Meals</span>
            <span className="muted">{meals.length ? meals.map((m) => (m.quality === "great" ? "🟢" : m.quality === "ok" ? "🟡" : "🔴")).join(" ") : "none yet"}</span>
          </div>
          <div className="row between body-row">
            <span>🏋️ Workout</span>
            <span className="muted">{workouts.length ? workouts.map((w) => `${w.type} ${w.durationMins}m`).join(", ") : "not yet"}</span>
          </div>
          <div className="row between body-row">
            <span>😴 Sleep</span>
            <span className="muted">{hd?.sleepHours != null ? `${hd.sleepHours}h` : "not logged"}</span>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Plan vs did</h2>
            <button className="btn ghost small" onClick={() => go("calendar")}>
              Calendar →
            </button>
          </div>
          {!todayPlans.length && !entries.length && <Empty>Nothing planned or logged yet today.</Empty>}
          <ul className="list">
            {[...todayPlans.map((p) => ({ k: "plan" as const, id: p.id, start: p.start, end: p.end, title: p.title, color: (p.goalId && goals.get(p.goalId)?.color) || (p.tagId && ix.tags.get(p.tagId)?.color) || "#94a3b8" })), ...entries.map((e) => ({ k: "did" as const, id: e.id, start: e.start, end: e.end, title: `${ix.tags.get(e.tagId)?.emoji ?? ""} ${ix.tags.get(e.tagId)?.name ?? "?"}${e.note ? ` · ${e.note}` : ""}`, color: ix.tags.get(e.tagId)?.color ?? "#94a3b8" }))]
              .sort((a, b) => a.start - b.start)
              .map((r) => (
                <li key={r.id} className="block-row">
                  <span className={`kind ${r.k}`} style={{ borderColor: r.color, background: r.k === "did" ? r.color : "transparent" }} />
                  <span className="time">
                    {fmtTime(r.start)}–{fmtTime(r.end)}
                  </span>
                  <span className="grow">{r.title}</span>
                  <span className="muted tiny">{r.k === "plan" ? "plan" : "did"}</span>
                </li>
              ))}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>This week's tasks</h2>
            <span className="muted">
              {weekTasks.filter((t) => t.done).length}/{weekTasks.length}
            </span>
          </div>
          <ul className="list">
            {weekTasks.map((t) => {
              const g = t.goalId ? goals.get(t.goalId) : undefined;
              return (
                <li key={t.id} className={`task-row ${t.done ? "done" : ""}`}>
                  <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} />
                  <span className="grow">
                    {t.title}
                    {g && (
                      <span className="tag" style={{ color: g.color }}>
                        {g.title}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="row">
            <input
              className="grow"
              placeholder="Quick add a task…"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTask.trim()) {
                  put("tasks", { id: uid(), goalId: null, title: newTask.trim(), week, estimateMins: 50, done: false });
                  setNewTask("");
                }
              }}
            />
          </div>
        </section>
      </div>

      {xpToday.total > 0 && (
        <section className="card">
          <h2>Today's XP by life area</h2>
          <div className="area-chips">
            {Object.entries(xpToday.byArea)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([a, v]) => (
                <span key={a} className="area-chip" style={{ background: `${AREA_INFO[a as keyof typeof AREA_INFO].color}22` }}>
                  {AREA_INFO[a as keyof typeof AREA_INFO].emoji} +{v}
                </span>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
