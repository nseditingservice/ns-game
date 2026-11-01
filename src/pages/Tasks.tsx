import { useState } from "react";
import { useList, useStore } from "../store";
import type { Go } from "../App";
import type { Task } from "../types";
import { addDays, fmtDay, fmtHours, nowMins, todayStr, weekStart } from "../dates";
import { isFrog, isOverdue, sortTasks } from "../tasks";
import { QuickAdd, TaskRow } from "../components/TaskBits";
import { Empty } from "../ui";

type View = "today" | "inbox" | "upcoming" | "matrix" | "done";

export default function Tasks({ go }: { go: Go }) {
  const { putMany, prefs } = useStore();
  const all = useList("tasks");
  const [view, setView] = useState<View>("today");
  const today = todayStr();
  const open = all.filter((t) => !t.done);
  const overdue = sortTasks(open.filter((t) => isOverdue(t, today)), today);
  const dueToday = sortTasks(open.filter((t) => t.due === today || isFrog(t, today)), today);
  const inbox = sortTasks(open.filter((t) => !t.due), today);
  const doneToday = all.filter((t) => t.done && t.doneAt?.slice(0, 10) === today);
  const frog = dueToday.find((t) => isFrog(t, today)) ?? all.find((t) => t.frog === today && t.done);
  const plannedMins = [...overdue, ...dueToday].reduce((n, t) => n + (t.estimateMins || 0), 0);
  const freeMins = Math.max(0, prefs.dayEnd * 60 - Math.max(nowMins(), prefs.dayStart * 60));
  const moveOverdue = () => putMany("tasks", overdue.map((t) => ({ ...t, due: today, week: weekStart(today) })));

  const counts: Record<View, number> = { today: overdue.length + dueToday.length, inbox: inbox.length, upcoming: open.filter((t) => t.due && t.due > today).length, matrix: open.length, done: doneToday.length };
  const tabs: [View, string][] = [
    ["today", "☀️ Today"],
    ["inbox", "📥 Inbox"],
    ["upcoming", "📆 Upcoming"],
    ["matrix", "🧭 Matrix"],
    ["done", "✅ Done"],
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Tasks</h1>
          <p className="muted">
            {doneToday.length} done today · {open.length} open
          </p>
        </div>
      </header>
      <div className="seg task-tabs">
        {tabs.map(([v, l]) => (
          <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
            {l}
            {counts[v] > 0 && v !== "matrix" && <span className="tab-count">{counts[v]}</span>}
          </button>
        ))}
      </div>

      {view === "today" && (
        <>
          <section className="card">
            <QuickAdd defaults={{ due: today }} placeholder="Add a task for today… e.g. Send invoice !1 ~15m #Zen Media House" />
          </section>
          {overdue.length > 0 && (
            <section className="card overdue-card">
              <div className="card-head">
                <h2>⚠️ Overdue · {overdue.length}</h2>
                <button className="btn small" onClick={moveOverdue}>
                  Move all to today
                </button>
              </div>
              <ul className="list">{overdue.map((t) => <TaskRow key={t.id} t={t} go={go} />)}</ul>
            </section>
          )}
          <section className="card">
            <div className="card-head">
              <h2>☀️ Today</h2>
              <span className={`small ${plannedMins > freeMins && freeMins > 0 ? "warn" : "muted"}`}>
                {fmtHours(plannedMins)} planned · {fmtHours(freeMins)} left in your day
              </span>
            </div>
            {!frog && dueToday.length > 0 && <p className="frog-hint">🐸 Pick your <b>frog</b>: the one task that would make today a win. Tap 🐸 on it and do it first.</p>}
            {frog?.done && <p className="frog-hint done">🐸 Frog eaten. Everything else today is a bonus.</p>}
            {dueToday.length > 6 && <p className="warn small">{dueToday.length} tasks today. The Ivy Lee method says pick your 6 most important and move the rest.</p>}
            {!dueToday.length && !overdue.length && <Empty>Nothing due today. Add a task above, or pull one from your Inbox.</Empty>}
            <ul className="list">{dueToday.map((t) => <TaskRow key={t.id} t={t} go={go} showDue={false} />)}</ul>
          </section>
          {doneToday.length > 0 && (
            <details className="card">
              <summary>
                <b>✅ Done today · {doneToday.length}</b>
              </summary>
              <ul className="list">{doneToday.map((t) => <TaskRow key={t.id} t={t} go={go} />)}</ul>
            </details>
          )}
        </>
      )}

      {view === "inbox" && (
        <>
          <section className="card">
            <QuickAdd placeholder="Capture anything… add a date later (or type 'tomorrow', 'fri', 'next week')" />
          </section>
          <section className="card">
            <h2>📥 Inbox · {inbox.length}</h2>
            <p className="muted small">Tasks without a date. Empty your head here, then give each one a day when you plan.</p>
            {!inbox.length && <Empty>Inbox zero. 🧘</Empty>}
            <ul className="list">{inbox.map((t) => <TaskRow key={t.id} t={t} go={go} />)}</ul>
          </section>
        </>
      )}

      {view === "upcoming" && <Upcoming open={open} go={go} />}
      {view === "matrix" && <Matrix open={open} go={go} />}
      {view === "done" && <DoneList all={all} go={go} />}
    </div>
  );
}

function Upcoming({ open, go }: { open: Task[]; go: Go }) {
  const today = todayStr();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
  const later = sortTasks(open.filter((t) => t.due && t.due > days[6]), today);
  return (
    <>
      <section className="card">
        <QuickAdd defaults={{ due: days[0] }} placeholder="Add for tomorrow… or type a day: 'Pitch client fri !1'" />
      </section>
      {days.map((d) => {
        const list = sortTasks(open.filter((t) => t.due === d), today);
        return (
          <section key={d} className={`card upcoming-day ${list.length ? "" : "empty-day"}`}>
            <div className="card-head">
              <h2>{fmtDay(d, { weekday: "long", day: "numeric", month: "short" })}</h2>
              <span className="muted small">{list.length ? `${list.length} · ${fmtHours(list.reduce((n, t) => n + (t.estimateMins || 0), 0))}` : "free"}</span>
            </div>
            <ul className="list">{list.map((t) => <TaskRow key={t.id} t={t} go={go} showDue={false} />)}</ul>
          </section>
        );
      })}
      {later.length > 0 && (
        <section className="card">
          <h2>Later</h2>
          <ul className="list">{later.map((t) => <TaskRow key={t.id} t={t} go={go} />)}</ul>
        </section>
      )}
    </>
  );
}

/** Eisenhower matrix: important = P1/P2, urgent = overdue or due within 1 day. */
function Matrix({ open, go }: { open: Task[]; go: Go }) {
  const today = todayStr();
  const soon = addDays(today, 1);
  const important = (t: Task) => t.priority === 1 || t.priority === 2;
  const urgent = (t: Task) => !!t.due && t.due <= soon;
  const q = [
    { key: "do", title: "🔥 Do now", sub: "Urgent & important", list: open.filter((t) => urgent(t) && important(t)) },
    { key: "plan", title: "🗓️ Schedule", sub: "Important, not urgent: where real progress happens", list: open.filter((t) => !urgent(t) && important(t)) },
    { key: "quick", title: "⚡ Quick / delegate", sub: "Urgent, not important: batch, shrink or hand off", list: open.filter((t) => urgent(t) && !important(t)) },
    { key: "drop", title: "🗑️ Drop?", sub: "Neither: could you say NO?", list: open.filter((t) => !urgent(t) && !important(t)) },
  ];
  return (
    <>
      <p className="muted small">Important = priority P1 or P2. Urgent = overdue or due by tomorrow. Give tasks a priority to sort them.</p>
      <div className="matrix">
        {q.map((x) => (
          <section key={x.key} className={`card quad quad-${x.key}`}>
            <h2>
              {x.title} <span className="muted small">{x.list.length}</span>
            </h2>
            <p className="muted tiny">{x.sub}</p>
            <ul className="list">{sortTasks(x.list, today).slice(0, 12).map((t) => <TaskRow key={t.id} t={t} go={go} />)}</ul>
            {x.list.length > 12 && <p className="muted tiny">+{x.list.length - 12} more</p>}
          </section>
        ))}
      </div>
    </>
  );
}

function DoneList({ all, go }: { all: Task[]; go: Go }) {
  const today = todayStr();
  const done = all.filter((t) => t.done && t.doneAt);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
  const byDay = (d: string) => done.filter((t) => t.doneAt!.slice(0, 10) === d);
  const week = done.filter((t) => t.doneAt!.slice(0, 10) >= weekStart(today)).length;
  const frogs = done.filter((t) => t.frog && t.frog === t.doneAt!.slice(0, 10)).length;
  let streak = 0;
  for (let d = byDay(today).length ? today : addDays(today, -1); byDay(d).length; d = addDays(d, -1)) streak++;
  return (
    <>
      <div className="grid-4">
        {[
          ["✅", byDay(today).length, "today"],
          ["📅", week, "this week"],
          ["🐸", frogs, "frogs eaten"],
          ["🔥", streak, "day streak"],
        ].map(([e, v, l]) => (
          <div key={l as string} className="card stat">
            <div className="stat-num">
              {e} {v}
            </div>
            <div className="muted small">{l}</div>
          </div>
        ))}
      </div>
      {days.map((d) => {
        const list = byDay(d);
        if (!list.length) return null;
        return (
          <section key={d} className="card">
            <h2>
              {d === today ? "Today" : fmtDay(d, { weekday: "long", day: "numeric", month: "short" })} <span className="muted small">· {list.length} done</span>
            </h2>
            <ul className="list">{list.map((t) => <TaskRow key={t.id} t={t} go={go} />)}</ul>
          </section>
        );
      })}
      {!done.length && <Empty>Your done list grows here. Every tick is proof of progress.</Empty>}
    </>
  );
}
