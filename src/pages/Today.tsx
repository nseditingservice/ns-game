import { useState } from "react";
import { useList, useStore } from "../store";
import type { Go } from "../App";
import { fmtDay, fmtHours, nowMins, todayStr } from "../dates";
import { autoProgress, dayXp, entryMins, extraXpForDay, habitStatus, habitStreak, isScheduled, titleFor, useIndex, useXp } from "../game";
import { useHabitToggle } from "../habitActions";
import { timerDisplay, useNow } from "../focus";
import { celebrate, Empty, Modal, useTimerActions } from "../ui";
import { AREA_INFO } from "../types";
import { useDailyQuote } from "../useQuote";
import { ProjectInput } from "../components/EntryEditor";
import { QuickAdd, TaskRow } from "../components/TaskBits";
import { isFrog, isOverdue, sortTasks } from "../tasks";
import { fmtVal, questState } from "../quest";
import { useSync } from "../sync";
import { downloadBackup } from "../backup";
import { WasteCard } from "../components/WasteCard";

export default function Today({ go }: { go: Go }) {
  const { prefs, timer, put, data, local, setLocal } = useStore();
  const sync = useSync();
  const goalLogs = useList("goalLogs");
  const quests = useList("goals").filter((g) => !g.done);
  const ix = useIndex();
  const xp = useXp();
  const tags = useList("tags").filter((t) => !t.archived);
  const tasks = useList("tasks");
  const toggle = useHabitToggle(ix);
  const timerAct = useTimerActions();
  const now = useNow(1000);
  const today = todayStr();
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
  const tasksDoneToday = tasks.filter((t) => t.done && t.doneAt?.slice(0, 10) === today).length;
  const focusToday = entries.filter((e) => e.source === "focus").reduce((n, e) => n + entryMins(e), 0);
  const journal = ix.journal.get(today);

  const tagUse = new Map<string, number>();
  for (const e of Object.values(data.entries)) if (!e.del) tagUse.set(e.tagId, (tagUse.get(e.tagId) ?? 0) + 1);
  const quickTags = [...tags].sort((a, b) => (tagUse.get(b.id) ?? 0) - (tagUse.get(a.id) ?? 0)).slice(0, 10);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Burning the midnight oil" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

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
          <p className="quote-line" title={author}>
            “{quote}” <span className="muted">— {author}</span>
            {credit && (
              <a className="quote-credit" href={credit.href} target="_blank" rel="noreferrer">
                {" "}· via {credit.text}
              </a>
            )}
          </p>
        </div>
      </header>
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
            <b>{tasksDoneToday}</b>
            <span>tasks done</span>
          </div>
          <div>
            <b>{fmtHours(focusToday)}</b>
            <span>focus</span>
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

      <div className="grid-2">
        <TodayTasks go={go} />
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
      </div>

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

      <WasteCard go={go} />

      <section className="card">
        <div className="card-head">
          <h2>🖋️ What did I learn today?</h2>
          <button className="btn ghost small" onClick={() => go("journal")}>
            Journal →
          </button>
        </div>
        <textarea rows={3} placeholder="One idea, lesson or insight from today… (+10 XP)" value={journal?.learned ?? ""} onChange={(e) => setJournal(e.target.value)} />
      </section>
    </div>
  );
}

function TodayTasks({ go }: { go: Go }) {
  const all = useList("tasks");
  const today = todayStr();
  const list = sortTasks(all.filter((t) => !t.done && (t.due === today || isOverdue(t, today) || isFrog(t, today))), today);
  const doneToday = all.filter((t) => t.done && t.doneAt?.slice(0, 10) === today).length;
  const frog = list.find((t) => isFrog(t, today));
  return (
    <section className="card">
      <div className="card-head">
        <h2>📋 Today's tasks</h2>
        <button className="btn ghost small" onClick={() => go("tasks")}>
          {doneToday ? `${doneToday} done · ` : ""}All tasks →
        </button>
      </div>
      {!frog && list.length > 0 && <p className="muted tiny">🐸 Tap the frog on the one task that would make today a win.</p>}
      {!list.length && <p className="muted small">Nothing due today.</p>}
      <ul className="list">
        {list.slice(0, 6).map((t) => (
          <TaskRow key={t.id} t={t} go={go} />
        ))}
      </ul>
      {list.length > 6 && (
        <button className="btn ghost small" onClick={() => go("tasks")}>
          +{list.length - 6} more
        </button>
      )}
      <QuickAdd defaults={{ due: today }} placeholder="Add for today… e.g. Call client !1 ~15m" />
    </section>
  );
}
