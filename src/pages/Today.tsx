import { useState } from "react";
import { uid, useList, useMap, useStore } from "../store";
import type { Go } from "../App";
import { fmtDay, fmtHours, fmtTime, nowMins, todayStr, weekStart } from "../dates";
import { autoProgress, dayXp, entryMins, extraXpForDay, habitStatus, habitStreak, isScheduled, titleFor, useIndex, useXp } from "../game";
import { useHabitToggle } from "../habitActions";
import { timerDisplay, useNow } from "../focus";
import { celebrate, Empty, Modal, useTimerActions } from "../ui";
import { AREA_INFO, type HealthDay, type Task } from "../types";
import { useDailyQuote } from "../useQuote";
import { fmtL, waterMl } from "../water";
import { ProjectInput } from "../components/EntryEditor";
import { useTrophies } from "../achievements";
import { fmtVal, questState } from "../quest";
import { useSync } from "../sync";
import { downloadBackup } from "../backup";

export default function Today({ go }: { go: Go }) {
  const { prefs, timer, put, data, local, setLocal } = useStore();
  const sync = useSync();
  const goalLogs = useList("goalLogs");
  const quests = useList("goals").filter((g) => !g.done);
  const ix = useIndex();
  const xp = useXp();
  const tags = useList("tags").filter((t) => !t.archived);
  const goals = useMap("goals");
  const tasks = useList("tasks");
  const plans = useList("plans");
  const toggle = useHabitToggle(ix);
  const timerAct = useTimerActions();
  const trophies = useTrophies();
  const now = useNow(1000);
  const today = todayStr();
  const week = weekStart(today);
  const [newTask, setNewTask] = useState("");
  const [showXp, setShowXp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { text: quote, author, credit } = useDailyQuote(today);

  const xpToday = dayXp(today, ix);
  const xpItems = [...xpToday.items, ...extraXpForDay(today, data)];
  const xpTodayTotal = xpItems.reduce((n, i) => n + i.xp, 0);
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
  const journal = ix.journal.get(today);
  const nextTrophies = trophies.filter((t) => t.value < t.target).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 3);

  const tagUse = new Map<string, number>();
  for (const e of Object.values(data.entries)) if (!e.del) tagUse.set(e.tagId, (tagUse.get(e.tagId) ?? 0) + 1);
  const quickTags = [...tags].sort((a, b) => (tagUse.get(b.id) ?? 0) - (tagUse.get(a.id) ?? 0)).slice(0, 10);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Burning the midnight oil" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const toggleTask = (t: Task) => {
    put("tasks", { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : undefined });
    if (!t.done) celebrate("Task done +10 XP", "✅");
  };
  const blank: HealthDay = { id: today, u: 0, date: today, sleepHours: null, sleepQuality: null, weight: null, water: 0, steps: null, energy: null, mood: null, notes: "" };
  const addWater = (ml: number) => {
    const base = hd ?? blank;
    put("healthDays", { ...base, waterMl: Math.max(0, waterMl(base) + ml) });
    if (ml > 0) celebrate(`+${ml} ml water`, "💧");
  };
  const setJournal = (learned: string) => put("journal", { id: today, date: today, learned, grateful: journal?.grateful ?? "", thoughts: journal?.thoughts ?? "" });

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

      <section className="card quote-card">
        <p className="quote">“{quote}”</p>
        <p className="quote-author">— {author}</p>
        {credit && (
          <a className="quote-credit" href={credit.href} target="_blank" rel="noreferrer">
            Quote via {credit.text}
          </a>
        )}
      </section>

      <section className="card hero">
        <div className="hero-level">
          <div className="level-ring">{xp.lvl.level}</div>
          <div className="grow">
            <div className="row between">
              <strong className="hero-title">
                Level {xp.lvl.level} · {titleFor(xp.lvl.level)}
              </strong>
              <button className="xp-today" onClick={() => setShowXp(!showXp)}>
                +{xpTodayTotal} XP today {showXp ? "▴" : "▾"}
              </button>
            </div>
            <div className="bar xp">
              <div style={{ width: `${(xp.lvl.into / xp.lvl.need) * 100}%` }} />
            </div>
            <div className="muted tiny">
              {xp.lvl.need - xp.lvl.into} XP to level {xp.lvl.level + 1} ·{" "}
              <button className="link-inline" onClick={() => setShowHistory(true)}>
                {xp.total.toLocaleString("en-US")} XP total ▸ where from?
              </button>
            </div>
          </div>
        </div>
        {showXp && (
          <div className="xp-log">
            {!xpItems.length && <Empty>No XP yet today. Complete a habit, log time, a meal or a workout to earn some.</Empty>}
            {xpItems.map((i, k) => (
              <div key={k} className="xp-line">
                <span>
                  {AREA_INFO[i.area].emoji} {i.label}
                </span>
                <b>+{i.xp}</b>
              </div>
            ))}
          </div>
        )}
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
            <b>{fmtL(waterMl(hd))}</b>
            <span>water</span>
          </div>
        </div>
      </section>

      {showHistory && (
        <Modal title={`XP history · ${xp.total.toLocaleString("en-US")} XP`} onClose={() => setShowHistory(false)}>
          <p className="muted small">Every point you've earned, newest first. XP is calculated from your log, so if you delete or change something, its XP changes too.</p>
          {!xp.log.length && <Empty>No XP yet. Complete a habit or log something to start.</Empty>}
          {xp.log.slice(0, 120).map((d) => (
            <div key={d.date} className="xp-day">
              <div className="row between">
                <b>{d.date === today ? "Today" : fmtDay(d.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b>
                <b className="accent-text">+{d.total}</b>
              </div>
              {d.items.map((i, k) => (
                <div key={k} className="xp-line">
                  <span>
                    {AREA_INFO[i.area].emoji} {i.label}
                  </span>
                  <span>+{i.xp}</span>
                </div>
              ))}
            </div>
          ))}
        </Modal>
      )}

      {!sync.email && (!local.lastBackup || Date.now() - local.lastBackup > 30 * 864e5) && Object.keys(data.entries).length + Object.keys(data.goalLogs ?? {}).length > 5 && (
        <section className="card backup-nudge">
          <span>
            💾 <b>Protect your progress.</b> <span className="muted small">Cloud sync is off and you haven't saved a backup in 30 days.</span>
          </span>
          <span className="row">
            <button className="btn small primary" onClick={() => { downloadBackup(data); setLocal({ lastBackup: Date.now() }); }}>
              Download backup
            </button>
            <button className="btn small ghost" onClick={() => go("settings")}>
              Turn on sync
            </button>
          </span>
        </section>
      )}

      {quests.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>⚔️ Active quests</h2>
            <button className="btn ghost small" onClick={() => go("goals")}>
              Quest map →
            </button>
          </div>
          {quests.slice(0, 5).map((g) => {
            const st = questState(g, goalLogs, tasks);
            const v = (n: number) => (st.kind === "tasks" ? `${Math.round(n)}` : fmtVal(n, st.unit));
            return (
              <div key={g.id} className="quest-mini" onClick={() => go("goals")}>
                <span className="quest-mini-hero">{g.hero ?? "🧙"}</span>
                <div className="grow">
                  <div className="row between small">
                    <b>{g.title}</b>
                    <span>
                      {v(st.current)} <span className="muted">/ {v(st.target)}</span>
                    </span>
                  </div>
                  <div className="bar thin">
                    <div style={{ width: `${Math.min(100, st.frac * 100)}%`, background: g.color }} />
                  </div>
                  <div className="muted tiny">
                    {st.done ? `🏆 Boss defeated${st.periodLabel ? ` · ${st.periodLabel}` : ""}` : st.perDayNeeded ? `Daily quest: ${v(st.perDayNeeded)} · ${st.next ? `next: ${st.next.name}` : "next: the boss"}` : st.next ? `Next checkpoint: ${st.next.name}` : "Next: the boss"}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>What are you doing now?</h2>
          <button className="btn ghost small" onClick={() => go("calendar")}>
            Log past time →
          </button>
        </div>
        {timer ? (
          <div className="now-tracking">
            <div className="grow">
              <div className="big-clock">{timerDisplay(timer, now)}</div>
              <div className="muted">
                {timer.tagId && ix.tags.get(timer.tagId)?.emoji} {timer.label}
              </div>
              <label className="small muted project-field">
                Project / client
                <ProjectInput value={timer.project ?? ""} onChange={(project) => put("meta", { ...timer, project })} tagId={timer.tagId ?? undefined} />
              </label>
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
                      {p && s !== "done" ? `${Math.round(p.value * 100) / 100}/${p.target} ${p.unit} · auto` : h.tiny ? `Tiny: ${h.tiny}` : ""}
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
            <span>💧 Water · {fmtL(waterMl(hd))}</span>
            <span className="row">
              <button className="btn small" onClick={() => addWater(-250)}>
                −
              </button>
              <button className="btn small primary" onClick={() => addWater(250)}>
                +250 ml
              </button>
              <button className="btn small primary" onClick={() => addWater(500)}>
                +500 ml
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
            {[
              ...todayPlans.map((p) => ({ k: "plan" as const, id: p.id, start: p.start, end: p.end, title: p.title, color: (p.goalId && goals.get(p.goalId)?.color) || (p.tagId && ix.tags.get(p.tagId)?.color) || "#94a3b8" })),
              ...entries.map((e) => ({ k: "did" as const, id: e.id, start: e.start, end: e.end, title: `${ix.tags.get(e.tagId)?.emoji ?? ""} ${ix.tags.get(e.tagId)?.name ?? "?"}${e.project ? ` · ${e.project}` : ""}${e.note ? ` · ${e.note}` : ""}`, color: ix.tags.get(e.tagId)?.color ?? "#94a3b8" })),
            ]
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
                  <input className="inline grow" value={t.title} onChange={(e) => put("tasks", { ...t, title: e.target.value })} />
                  {g && (
                    <span className="tag" style={{ color: g.color }}>
                      {g.title}
                    </span>
                  )}
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

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>🖋️ What did I learn today?</h2>
            <button className="btn ghost small" onClick={() => go("journal")}>
              Journal →
            </button>
          </div>
          <textarea rows={3} placeholder="One idea, lesson or insight from today… (+10 XP)" value={journal?.learned ?? ""} onChange={(e) => setJournal(e.target.value)} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>🏆 Next trophies</h2>
            <button className="btn ghost small" onClick={() => go("trophies")}>
              All →
            </button>
          </div>
          {nextTrophies.map((t) => (
            <div key={t.id} className="trophy-mini">
              <span className="trophy-emoji">{t.emoji}</span>
              <div className="grow">
                <div className="row between small">
                  <b>{t.name}</b>
                  <span className="muted tiny">
                    {Math.floor(t.value)}/{t.target}
                  </span>
                </div>
                <div className="bar thin">
                  <div className={`fill-${t.tier}`} style={{ width: `${(t.value / t.target) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
