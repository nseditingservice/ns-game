import { useState } from "react";
import { PALETTE, uid, useList, useStore } from "../store";
import { AREAS, AREA_INFO, type Area, type Goal, type Season, type Task } from "../types";
import { fmtDay, quarterRange, todayStr, weekStart, weeksIn } from "../dates";
import { breakdownGoal } from "../ai";
import { celebrate } from "../ui";

export default function Goals() {
  const { prefs, setPrefs, put, del } = useStore();
  const seasons = useList("seasons").sort((a, b) => a.start.localeCompare(b.start));
  const goals = useList("goals");
  const season = seasons.find((s) => s.id === prefs.currentSeasonId) ?? seasons[seasons.length - 1];
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);

  const newSeason = () => setEditingSeason({ id: uid(), u: 0, ...quarterRange() });
  const saveSeason = (s: Season) => {
    put("seasons", s);
    setPrefs({ currentSeasonId: s.id });
    setEditingSeason(null);
  };
  const seasonGoals = season ? goals.filter((g) => g.seasonId === season.id) : [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Goals</h1>
          <p className="muted">A season (e.g. this quarter), 1–3 goals, broken into weekly actions.</p>
        </div>
        <div className="row">
          {seasons.length > 0 && (
            <select value={season?.id} onChange={(e) => setPrefs({ currentSeasonId: e.target.value })}>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn" onClick={newSeason}>
            + Season
          </button>
        </div>
      </header>

      {editingSeason && <SeasonForm season={editingSeason} onSave={saveSeason} onCancel={() => setEditingSeason(null)} />}

      {!season && !editingSeason && (
        <div className="card callout">
          <span>
            A <strong>season</strong> is a focused stretch of time (usually ~12 weeks) with a few goals.
          </span>
          <button className="btn primary" onClick={newSeason}>
            Create your first season
          </button>
        </div>
      )}

      {season && (
        <>
          <div className="row between">
            <span className="muted small">
              {fmtDay(season.start)} – {fmtDay(season.end)} · {weeksIn(season.start, season.end).length} weeks
            </span>
            <span className="row">
              <button className="btn ghost small" onClick={() => setEditingSeason(season)}>
                Edit season
              </button>
              <button className="btn ghost small danger" onClick={() => confirm(`Delete ${season.name} and all its goals and tasks?`) && del("seasons", season.id)}>
                Delete
              </button>
            </span>
          </div>
          {seasonGoals.map((g) => (
            <GoalCard key={g.id} goal={g} season={season} />
          ))}
          <NewGoal season={season} count={seasonGoals.length} />
        </>
      )}
    </div>
  );
}

function SeasonForm({ season, onSave, onCancel }: { season: Season; onSave: (s: Season) => void; onCancel: () => void }) {
  const [s, setS] = useState(season);
  return (
    <div className="card form">
      <h2>Season</h2>
      <label>
        Name
        <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
      </label>
      <div className="row">
        <label className="grow">
          Start
          <input type="date" value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} />
        </label>
        <label className="grow">
          End
          <input type="date" value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} />
        </label>
      </div>
      <div className="row">
        <button className="btn primary" disabled={!s.name || s.end < s.start} onClick={() => onSave(s)}>
          Save
        </button>
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function NewGoal({ season, count }: { season: Season; count: number }) {
  const { put } = useStore();
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [area, setArea] = useState<Area>("work");
  const add = () => {
    if (!title.trim()) return;
    put("goals", { id: uid(), seasonId: season.id, title: title.trim(), why: why.trim(), color: PALETTE[count % PALETTE.length], area, done: false });
    setTitle("");
    setWhy("");
  };
  return (
    <div className="card form">
      <h2>Add a goal</h2>
      {count >= 3 && <p className="warn">You already have {count} goals. Fewer goals = more progress.</p>}
      <input placeholder="e.g. Run a 10k" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="Why does this matter to you?" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} />
      <div className="row">
        <select value={area} onChange={(e) => setArea(e.target.value as Area)}>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {AREA_INFO[a].emoji} {AREA_INFO[a].label}
            </option>
          ))}
        </select>
        <button className="btn primary" onClick={add} disabled={!title.trim()}>
          Add goal
        </button>
      </div>
    </div>
  );
}

function GoalCard({ goal, season }: { goal: Goal; season: Season }) {
  const { put, putMany, del, local } = useStore();
  const tasks = useList("tasks").filter((t) => t.goalId === goal.id);
  const weeks = weeksIn(season.start, season.end);
  const thisWeek = weekStart(todayStr());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newWeek, setNewWeek] = useState(weeks.includes(thisWeek) ? thisWeek : weeks[0]);
  const [open, setOpen] = useState(true);
  const done = tasks.filter((t) => t.done).length;

  const aiBreakdown = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const out = await breakdownGoal(local.apiKey, goal, season, tasks);
      putMany("tasks", out.tasks.map((t) => ({ id: uid(), goalId: goal.id, done: false, ...t })));
      setMsg({ kind: "ok", text: `Added ${out.tasks.length} tasks. ${out.advice}` });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const addTask = () => {
    if (!newTitle.trim()) return;
    put("tasks", { id: uid(), goalId: goal.id, title: newTitle.trim(), week: newWeek, estimateMins: 50, done: false });
    setNewTitle("");
  };
  const toggle = (t: Task) => {
    put("tasks", { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : undefined });
    if (!t.done) celebrate("Task done +10 XP", "✅");
  };

  return (
    <section className="card goal-card" style={{ borderLeftColor: goal.color }}>
      <div className="card-head">
        <div className="grow clickable" onClick={() => setOpen(!open)}>
          <h2 className={goal.done ? "strike" : ""}>
            {open ? "▾" : "▸"} {goal.title}
          </h2>
          <p className="muted small">
            {AREA_INFO[goal.area].emoji} {goal.why}
          </p>
        </div>
        <span className="muted">
          {done}/{tasks.length}
        </span>
      </div>
      <div className="bar thin">
        <div style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`, background: goal.color }} />
      </div>
      {open && (
        <>
          <div className="row wrap">
            <button className="btn" onClick={aiBreakdown} disabled={busy}>
              {busy ? "Thinking…" : "✦ AI breakdown (optional)"}
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                put("goals", { ...goal, done: !goal.done });
                if (!goal.done) celebrate("GOAL ACHIEVED +200 XP", "🏆");
              }}
            >
              {goal.done ? "Reopen" : "🏆 Mark achieved"}
            </button>
            <input type="color" value={goal.color} onChange={(e) => put("goals", { ...goal, color: e.target.value })} />
            <button className="btn ghost danger" onClick={() => confirm("Delete this goal and its tasks?") && del("goals", goal.id)}>
              Delete
            </button>
          </div>
          {msg && <p className={msg.kind === "err" ? "error" : "ai-note"}>{msg.text}</p>}
          {weeks
            .filter((w) => tasks.some((t) => t.week === w))
            .map((w) => (
              <div key={w} className={`week-group ${w === thisWeek ? "current" : ""}`}>
                <div className="week-label">
                  Week of {fmtDay(w, { day: "numeric", month: "short" })} {w === thisWeek && <span className="tag">this week</span>}
                </div>
                <ul className="list">
                  {tasks
                    .filter((t) => t.week === w)
                    .map((t) => (
                      <li key={t.id} className={`task-row ${t.done ? "done" : ""}`}>
                        <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
                        <input className="inline grow" value={t.title} onChange={(e) => put("tasks", { ...t, title: e.target.value })} />
                        <select value={t.week} onChange={(e) => put("tasks", { ...t, week: e.target.value })}>
                          {weeks.map((wk) => (
                            <option key={wk} value={wk}>
                              {fmtDay(wk, { day: "numeric", month: "short" })}
                            </option>
                          ))}
                        </select>
                        <button className="btn small ghost" onClick={() => del("tasks", t.id)}>
                          ✕
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          <div className="row">
            <input className="grow" placeholder="Add a task…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
            <select value={newWeek} onChange={(e) => setNewWeek(e.target.value)}>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  {fmtDay(w, { day: "numeric", month: "short" })}
                </option>
              ))}
            </select>
            <button className="btn" onClick={addTask}>
              Add
            </button>
          </div>
        </>
      )}
    </section>
  );
}
