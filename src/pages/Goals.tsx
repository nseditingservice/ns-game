import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { PALETTE, uid, useList, useStore } from "../store";
import { AREAS, AREA_INFO, type Area, type Goal, type GoalLog, type GoalMetric, type Milestone, type Season, type Task } from "../types";
import { addDays, fmtDay, quarterRange, todayStr, weekStart, weeksIn } from "../dates";
import { breakdownGoal } from "../ai";
import { celebrate, Empty, Modal } from "../ui";
import { BOSSES, defaultMilestones, fmtVal, HEROES, questState, ZONES, type QuestState } from "../quest";

export default function Goals() {
  const goals = useList("goals");
  const logs = useList("goalLogs");
  const tasks = useList("tasks");
  const [selId, setSelId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const active = goals.filter((g) => !g.done).sort((a, b) => a.title.localeCompare(b.title));
  const finished = goals.filter((g) => g.done);
  const sel = goals.find((g) => g.id === selId) ?? active[0] ?? finished[0];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Quests</h1>
          <p className="muted">Every goal is a journey. Log progress and watch your hero move toward the boss.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New quest
        </button>
      </header>

      {!goals.length && (
        <section className="card quest-empty">
          <div className="quest-empty-art">🧙 ─ ─ ⛺ ─ ─ ⛺ ─ ─ 🐉</div>
          <h2>Begin your first quest</h2>
          <p className="muted">Pick something measurable: “Hit $10,000/month for Zen Media House”, “Read 24 books”, “Reach 72 kg”. Log progress as it happens and your hero walks the road.</p>
          <button className="btn primary big" onClick={() => setCreating(true)}>
            ⚔️ Create a quest
          </button>
        </section>
      )}

      {goals.length > 0 && (
        <div className="world-map">
          {[...active, ...finished].map((g) => {
            const st = questState(g, logs, tasks);
            return (
              <button key={g.id} className={`quest-tile ${sel?.id === g.id ? "on" : ""} ${g.done ? "finished" : ""}`} style={{ ["--qc" as string]: g.color }} onClick={() => setSelId(g.id)}>
                <span className="tile-ring" style={{ background: `conic-gradient(${g.color} ${Math.min(1, st.frac) * 360}deg, rgb(255 255 255 / 0.08) 0)` }}>
                  <span>{g.done ? "🏆" : g.hero ?? "🧙"}</span>
                </span>
                <span className="tile-text">
                  <b>{g.title}</b>
                  <span className="muted tiny">
                    {Math.round(Math.min(1, st.frac) * 100)}%{st.periodLabel ? ` · ${st.periodLabel}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {sel && <QuestView key={sel.id} goal={sel} logs={logs} tasks={tasks} />}
      <SeasonsCard />
      {creating && <QuestEditor goal={null} onClose={(id) => { setCreating(false); if (id) setSelId(id); }} />}
    </div>
  );
}

// ------------------------------------------------------------------ Quest view

function QuestView({ goal, logs, tasks }: { goal: Goal; logs: GoalLog[]; tasks: Task[] }) {
  const { put } = useStore();
  const st = questState(goal, logs, tasks);
  const [editing, setEditing] = useState(false);
  const [editLog, setEditLog] = useState<GoalLog | null>(null);
  const m = goal.metric;
  const myLogs = logs.filter((l) => l.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date) || b.u - a.u);
  const shownLogs = m && (m.mode === "monthly" || m.mode === "weekly") ? myLogs.slice(0, 30) : myLogs.slice(0, 30);

  return (
    <>
      <section className="card quest-card" style={{ ["--qc" as string]: goal.color }}>
        <div className="card-head">
          <div>
            <h2 className="quest-title">
              {goal.hero ?? "🧙"} {goal.title}
            </h2>
            <p className="muted small">
              {AREA_INFO[goal.area].emoji} {AREA_INFO[goal.area].label}
              {goal.why ? ` · ${goal.why}` : ""}
            </p>
          </div>
          <button className="btn ghost small" onClick={() => setEditing(true)}>
            ⚙️ Edit quest
          </button>
        </div>

        <div className="quest-layout">
          <QuestMap goal={goal} st={st} />
          <div className="quest-hud">
            <Hud goal={goal} st={st} />
            {m ? <LogProgress goal={goal} st={st} logs={logs} tasks={tasks} /> : <p className="muted small">This quest moves forward as you complete its tasks below. Want to track a number instead (money, books, kg…)? Edit the quest and choose a measure.</p>}
            {st.done && !goal.done && (
              <button className="btn primary full" onClick={() => { put("goals", { ...goal, done: true }); celebrate(`Quest complete: ${goal.title}`, "🏆"); }}>
                🏆 Mark quest complete (move to Hall of Fame)
              </button>
            )}
            {goal.done && (
              <button className="btn ghost small" onClick={() => put("goals", { ...goal, done: false })}>
                Reopen quest
              </button>
            )}
          </div>
        </div>
      </section>

      {m && (
        <section className="card">
          <h2>📜 Quest log</h2>
          {!myLogs.length && <Empty>No progress logged yet. Every entry moves your hero.</Empty>}
          <ul className="list">
            {shownLogs.map((l) => (
              <li key={l.id} className="entry-row" onClick={() => setEditLog(l)}>
                <span className="muted tiny entry-when">{fmtDay(l.date, { day: "numeric", month: "short", year: "2-digit" })}</span>
                <span className="grow">{l.note || <span className="muted">—</span>}</span>
                <b className={l.value < 0 ? "down" : "up"}>{m.mode === "latest" ? fmtVal(l.value, m.unit) : `${l.value >= 0 ? "+" : ""}${fmtVal(l.value, m.unit)}`}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <QuestTasks goal={goal} />
      {editing && <QuestEditor goal={goal} onClose={() => setEditing(false)} />}
      {editLog && m && <LogEditor log={editLog} unit={m.unit} onClose={() => setEditLog(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ The road

function QuestMap({ goal, st }: { goal: Goal; st: QuestState }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [hero, setHero] = useState<{ x: number; y: number } | null>(null);
  const nodes = [{ id: "start", at: 0, name: "Start", reward: "" }, ...st.milestones, { id: "boss", at: 1, name: "Boss", reward: "" }];
  const SEG = 112;
  const W = 340;
  const H = (nodes.length - 1) * SEG + 140; // extra headroom for the boss label
  // Bottom → top, zig-zagging like a classic level map.
  const pts = nodes.map((_, i) => ({ x: i === 0 || i === nodes.length - 1 ? W / 2 : i % 2 ? W * 0.74 : W * 0.26, y: H - 45 - i * SEG }));
  const d = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `C${pts[i - 1].x},${pts[i - 1].y - SEG * 0.55} ${p.x},${p.y + SEG * 0.55} ${p.x},${p.y}`)).join(" ");
  // Where along the road is the hero? Nodes are evenly spaced; value fractions are not.
  const f = Math.min(1, st.frac);
  let pos = 1;
  for (let i = 0; i < nodes.length - 1; i++) {
    if (f < nodes[i + 1].at) {
      pos = (i + (f - nodes[i].at) / Math.max(1e-9, nodes[i + 1].at - nodes[i].at)) / (nodes.length - 1);
      break;
    }
  }
  useLayoutEffect(() => {
    const p = pathRef.current;
    if (!p) return;
    const pt = p.getPointAtLength(p.getTotalLength() * pos);
    setHero({ x: pt.x, y: pt.y });
  }, [pos, d]);
  const thresholdText = (at: number) => (st.kind === "tasks" ? `${Math.round(at * st.target)} tasks` : fmtVal(st.start + (st.target - st.start) * at, st.unit));

  return (
    <div className="quest-map">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 420 }}>
        <defs>
          <linearGradient id={`sky-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={goal.color} stopOpacity="0.16" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${goal.id}`}>
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width={W} height={H} rx="18" fill={`url(#sky-${goal.id})`} />
        {/* scenery */}
        {nodes.map((_, i) => (
          <text key={`s${i}`} x={i % 2 ? 40 : W - 40} y={H - 60 - i * SEG} className="scenery">
            {["🌲", "⛰️", "🌲", "🏔️", "🌋", "☁️", "🌲", "⛰️"][i % 8]}
          </text>
        ))}
        <path d={d} className="road-bed" />
        <path ref={pathRef} d={d} className="road-todo" />
        <path d={d} className="road-done" pathLength={1000} strokeDasharray={`${pos * 1000} 1000`} style={{ stroke: goal.color }} filter={`url(#glow-${goal.id})`} />
        {nodes.map((n, i) => {
          const p = pts[i];
          const isBoss = i === nodes.length - 1;
          const reached = f >= n.at - 1e-9 && i > 0;
          const isNext = st.next?.id === n.id || (isBoss && !st.next && !st.done);
          return (
            <g key={n.id} className={`node ${reached ? "reached" : ""} ${isNext ? "next" : ""}`}>
              <circle cx={p.x} cy={p.y} r={isBoss ? 30 : i === 0 ? 18 : 22} className="node-ring" style={reached ? { stroke: goal.color } : undefined} />
              <text x={p.x} y={p.y + (isBoss ? 10 : 7)} className="node-emoji" style={{ fontSize: isBoss ? 28 : 20 }}>
                {i === 0 ? "🏁" : isBoss ? (st.done ? "🏆" : goal.boss ?? "🐉") : reached ? "✅" : "⛺"}
              </text>
              {i > 0 && (
                <>
                  <text x={p.x + (p.x < W / 2 ? 34 : -34) * (isBoss ? 0 : 1)} y={isBoss ? p.y - 40 : p.y - 6} className="node-label" textAnchor={isBoss ? "middle" : p.x < W / 2 ? "start" : "end"}>
                    {isBoss ? (st.done ? "Boss defeated!" : `Boss · ${thresholdText(1)}`) : n.name}
                  </text>
                  {!isBoss && (
                    <text x={p.x + (p.x < W / 2 ? 34 : -34)} y={p.y + 10} className="node-sub" textAnchor={p.x < W / 2 ? "start" : "end"}>
                      {thresholdText(n.at)}
                      {n.reward ? ` · 🎁 ${n.reward}` : ""}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
        {hero && (
          <g className="hero" transform={`translate(${hero.x},${hero.y})`}>
            <circle r="21" className="hero-halo" style={{ fill: goal.color }} />
            <text y="8" className="hero-emoji">
              {goal.hero ?? "🧙"}
            </text>
            <g transform="translate(0,36)">
              <rect x="-42" y="-12" width="84" height="20" rx="10" className="hero-tag" />
              <text y="3" className="hero-tag-text">
                {st.kind === "tasks" ? `${st.current}/${st.target}` : fmtVal(st.current, st.unit)}
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ HUD

function Hud({ goal, st }: { goal: Goal; st: QuestState }) {
  const pct = Math.round(st.frac * 100);
  const maxH = Math.max(1, ...st.history.map((h) => h.total), st.target);
  const v = (n: number) => (st.kind === "tasks" ? `${Math.round(n)}` : fmtVal(n, st.unit));
  return (
    <div className="hud">
      {st.periodLabel && <div className="hud-period">⏳ {st.periodLabel}</div>}
      <div className="hud-big">
        <span>{v(st.current)}</span>
        <span className="muted"> / {v(st.target)}</span>
      </div>
      <div className="bar xp hud-bar">
        <div style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="row between small">
        <b style={{ color: goal.color }}>{pct}% of the way</b>
        <span className="muted">{st.done ? "🏆 Boss defeated" : st.next ? `Next: ${st.next.name}` : "Next: the boss"}</span>
      </div>
      <div className="hud-stats">
        <div>
          <b>{st.done ? "0" : v(st.remaining)}</b>
          <span>to go</span>
        </div>
        {st.daysLeft != null && (
          <div>
            <b>{Math.max(0, st.daysLeft)}</b>
            <span>{st.periodLabel ? "days left" : "days to deadline"}</span>
          </div>
        )}
        {st.perDayNeeded != null && st.perDayNeeded > 0 && (
          <div className="daily-quest">
            <b>{v(st.perDayNeeded)}</b>
            <span>daily quest</span>
          </div>
        )}
        {st.pacePerDay != null && st.kind === "metric" && (
          <div>
            <b>{v(st.pacePerDay)}</b>
            <span>your pace / day</span>
          </div>
        )}
        <div>
          <b>{st.streak}🔥</b>
          <span>log streak</span>
        </div>
      </div>
      {st.projected && !st.done && (
        <p className="small hud-note">
          🔮 At this pace you'll reach the boss on <b>{fmtDay(st.projected, { day: "numeric", month: "short", year: "numeric" })}</b>
          {st.periodLabel && st.daysLeft != null && st.projected > addDays(todayStr(), st.daysLeft - 1) ? " (after this period ends; speed up!)" : ""}
        </p>
      )}
      {st.history.length > 0 && (
        <div className="hud-history">
          <div className="muted tiny">Past {goal.metric?.mode === "weekly" ? "weeks" : "months"} (★ = boss defeated)</div>
          <div className="bars small-bars">
            {st.history.map((h, i) => (
              <div key={i} className="bar-col" title={`${h.label}: ${v(h.total)}`}>
                <div className="bar-val">{h.hit ? "★" : ""}</div>
                <div className="bar-fill" style={{ height: `${(h.total / maxH) * 100}%`, background: h.hit ? goal.color : "rgb(255 255 255 / 0.25)" }} />
                <div className="bar-day">{h.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LogProgress({ goal, st, logs, tasks }: { goal: Goal; st: QuestState; logs: GoalLog[]; tasks: Task[] }) {
  const { put } = useStore();
  const m = goal.metric!;
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const add = () => {
    const n = Number(value);
    if (!value || !Number.isFinite(n)) return;
    const log: GoalLog = { id: uid(), u: Date.now(), goalId: goal.id, date, value: n, note: note.trim() };
    const after = questState(goal, [...logs, log], tasks);
    put("goalLogs", log);
    const newly = after.reached.filter((x) => !st.reached.some((y) => y.id === x.id));
    celebrate(`${m.mode === "latest" ? "Updated" : "+" + fmtVal(n, m.unit)} · +5 XP`, goal.hero ?? "🧙");
    newly.forEach((x, i) => setTimeout(() => celebrate(`Checkpoint: ${x.name}! +50 XP${x.reward ? ` · 🎁 ${x.reward}` : ""}`, "⛺"), 700 * (i + 1)));
    if (after.done && !st.done) setTimeout(() => celebrate(`BOSS DEFEATED: ${goal.title}! +200 XP`, goal.boss ?? "🐉"), 700 * (newly.length + 1));
    setValue("");
    setNote("");
  };
  const label = m.mode === "latest" ? `New value (${m.unit})` : `Amount (${m.unit})`;
  return (
    <div className="log-progress">
      <div className="muted tiny">{m.mode === "latest" ? "Log your latest number" : "Log progress (earned, done, added…)"}</div>
      <div className="row wrap">
        <input className="grow" type="number" inputMode="decimal" placeholder={label} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <input placeholder="Note (optional), e.g. client reel, retainer" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      <button className="btn primary full" disabled={!value} onClick={add}>
        ⚔️ Advance
      </button>
    </div>
  );
}

function LogEditor({ log, unit, onClose }: { log: GoalLog; unit: string; onClose: () => void }) {
  const { put, del } = useStore();
  const [l, setL] = useState(log);
  return (
    <Modal title="Edit quest log" onClose={onClose}>
      <div className="row wrap">
        <label className="grow">
          Value ({unit})
          <input type="number" inputMode="decimal" value={l.value} onChange={(e) => setL({ ...l, value: Number(e.target.value) })} />
        </label>
        <label>
          Date
          <input type="date" value={l.date} onChange={(e) => e.target.value && setL({ ...l, date: e.target.value })} />
        </label>
      </div>
      <label>
        Note
        <input value={l.note} onChange={(e) => setL({ ...l, note: e.target.value })} />
      </label>
      <div className="row between">
        <button className="btn primary" onClick={() => { put("goalLogs", l); onClose(); }}>
          Save
        </button>
        <button className="btn ghost danger" onClick={() => { del("goalLogs", l.id); onClose(); }}>
          Delete (hero steps back)
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Create / edit

type MeasureKind = "monthly" | "weekly" | "total" | "latest" | "tasks";

function QuestEditor({ goal, onClose }: { goal: Goal | null; onClose: (newId?: string) => void }) {
  const { put, del, data } = useStore();
  const seasons = useList("seasons");
  const isNew = !goal;
  const [g, setG] = useState<Goal>(
    goal ?? { id: uid(), u: 0, seasonId: "", title: "", why: "", color: PALETTE[Object.keys(data.goals).length % PALETTE.length], area: "work", done: false, hero: "🧙", boss: "🐉", metric: { unit: "$", target: 10000, mode: "monthly", start: 0 }, milestones: defaultMilestones() },
  );
  const kind: MeasureKind = g.metric ? g.metric.mode : "tasks";
  const setMetric = (patch: Partial<GoalMetric>) => setG({ ...g, metric: { ...(g.metric ?? { unit: "$", target: 100, mode: "total", start: 0 }), ...patch } });
  const ms = [...(g.milestones ?? defaultMilestones(4, true))].sort((a, b) => a.at - b.at);
  const setMs = (list: Milestone[]) => setG({ ...g, milestones: list });
  const valid = g.title.trim() && (!g.metric || (Number.isFinite(g.metric.target) && g.metric.target !== (g.metric.mode === "monthly" || g.metric.mode === "weekly" ? 0 : g.metric.start)));

  return (
    <Modal title={isNew ? "New quest" : "Edit quest"} onClose={() => onClose()}>
      <label>
        Quest
        <input autoFocus value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} placeholder="e.g. Zen Media House: $10k / month" />
      </label>
      <label>
        Why does it matter?
        <input value={g.why} onChange={(e) => setG({ ...g, why: e.target.value })} placeholder="Freedom to choose my projects" />
      </label>

      <label>
        How do you measure progress?
        <select
          value={kind}
          onChange={(e) => {
            const k = e.target.value as MeasureKind;
            if (k === "tasks") setG({ ...g, metric: undefined });
            else setMetric({ mode: k, start: k === "latest" || k === "total" ? g.metric?.start ?? 0 : 0 });
          }}
        >
          <option value="monthly">Monthly target: resets each month (income, sales…)</option>
          <option value="weekly">Weekly target: resets each week</option>
          <option value="total">Running total: add up everything (savings, books, km…)</option>
          <option value="latest">Latest number: reach a value (weight, MRR, followers…)</option>
          <option value="tasks">Tasks: progress = completed tasks</option>
        </select>
      </label>
      {g.metric && (
        <div className="row wrap">
          <label>
            Unit
            <input list="units" value={g.metric.unit} onChange={(e) => setMetric({ unit: e.target.value })} onBlur={() => !g.metric?.unit.trim() && setMetric({ unit: "$" })} style={{ width: 90 }} />
            <datalist id="units">
              {["$", "kg", "books", "clients", "km", "hours", "followers", "videos"].map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
          {(g.metric.mode === "total" || g.metric.mode === "latest") && (
            <label>
              Starting value
              <input type="number" inputMode="decimal" value={g.metric.start} onChange={(e) => setMetric({ start: Number(e.target.value) })} style={{ width: 120 }} />
            </label>
          )}
          <label>
            Target {g.metric.mode === "monthly" ? "per month" : g.metric.mode === "weekly" ? "per week" : ""}
            <input type="number" inputMode="decimal" value={g.metric.target} onChange={(e) => setMetric({ target: Number(e.target.value) })} style={{ width: 130 }} />
          </label>
        </div>
      )}

      <div className="row wrap">
        <label>
          Your hero
          <div className="emoji-pick">
            {HEROES.map((h) => (
              <button key={h} type="button" className={g.hero === h ? "on" : ""} onClick={() => setG({ ...g, hero: h })}>
                {h}
              </button>
            ))}
          </div>
        </label>
        <label>
          The boss
          <div className="emoji-pick">
            {BOSSES.map((h) => (
              <button key={h} type="button" className={g.boss === h ? "on" : ""} onClick={() => setG({ ...g, boss: h })}>
                {h}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="row wrap">
        <label className="grow">
          Life area
          <select value={g.area} onChange={(e) => setG({ ...g, area: e.target.value as Area })}>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_INFO[a].emoji} {AREA_INFO[a].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deadline (optional)
          <input type="date" value={g.deadline ?? ""} onChange={(e) => setG({ ...g, deadline: e.target.value || undefined })} />
        </label>
        <label>
          Colour
          <input type="color" value={g.color} onChange={(e) => setG({ ...g, color: e.target.value })} />
        </label>
      </div>
      <label>
        Season (optional; for weekly task planning)
        <select value={g.seasonId} onChange={(e) => setG({ ...g, seasonId: e.target.value })}>
          <option value="">Ongoing quest (no season)</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="row between">
          <b className="small">Checkpoints & rewards</b>
          <span className="row">
            <button type="button" className="btn ghost small" onClick={() => setMs(defaultMilestones(ms.length || 4))}>
              Even spacing
            </button>
            <button type="button" className="btn ghost small" disabled={ms.length >= 8} onClick={() => setMs([...ms, { id: uid(), at: Math.min(0.95, (ms[ms.length - 1]?.at ?? 0) + 0.1), name: ZONES[ms.length + 1] ?? "Checkpoint", reward: "" }])}>
              + Add
            </button>
          </span>
        </div>
        {ms.map((x, i) => (
          <div key={x.id} className="row ms-row">
            <input className="grow" value={x.name} onChange={(e) => setMs(ms.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
            <input
              type="number"
              title="% of the way"
              value={Math.round(x.at * 100)}
              onChange={(e) => setMs(ms.map((y, j) => (j === i ? { ...y, at: Math.min(99, Math.max(1, Number(e.target.value))) / 100 } : y)))}
              style={{ width: 64 }}
            />
            %
            <input className="grow" placeholder="🎁 reward (optional)" value={x.reward} onChange={(e) => setMs(ms.map((y, j) => (j === i ? { ...y, reward: e.target.value } : y)))} />
            <button type="button" className="btn ghost small" onClick={() => setMs(ms.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        {g.metric && ms.length > 0 && (
          <p className="muted tiny">
            e.g. {ms[0].name} at {fmtVal((g.metric.mode === "monthly" || g.metric.mode === "weekly" ? 0 : g.metric.start) + ((g.metric.target - (g.metric.mode === "monthly" || g.metric.mode === "weekly" ? 0 : g.metric.start)) * ms[0].at), g.metric.unit)}
          </p>
        )}
      </div>

      <div className="row between">
        <button className="btn primary" disabled={!valid} onClick={() => { put("goals", { ...g, title: g.title.trim(), milestones: ms }); onClose(isNew ? g.id : undefined); }}>
          {isNew ? "⚔️ Begin quest" : "Save"}
        </button>
        {!isNew && (
          <button className="btn ghost danger" onClick={() => { if (confirm("Delete this quest, its progress log and tasks?")) { Object.values(data.goalLogs ?? {}).filter((l) => l.goalId === g.id && !l.del).forEach((l) => del("goalLogs", l.id)); del("goals", g.id); onClose(); } }}>
            Delete quest
          </button>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Tasks (kept from before)

function QuestTasks({ goal }: { goal: Goal }) {
  const { put, putMany, del, local, data } = useStore();
  const tasks = useList("tasks").filter((t) => t.goalId === goal.id);
  const season = goal.seasonId ? (data.seasons[goal.seasonId] as Season | undefined) : undefined;
  const thisWeek = weekStart(todayStr());
  const weeks = useMemo(() => (season && !season.del ? weeksIn(season.start, season.end) : Array.from({ length: 12 }, (_, i) => addDays(thisWeek, 7 * i))), [season, thisWeek]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newWeek, setNewWeek] = useState(weeks.includes(thisWeek) ? thisWeek : weeks[0]);
  const allWeeks = [...new Set([...weeks, ...tasks.map((t) => t.week)])].sort();

  const aiBreakdown = async () => {
    if (!season) return;
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
    <section className="card">
      <div className="card-head">
        <h2>🗡️ Side quests (tasks)</h2>
        {season && (
          <button className="btn ghost small" onClick={aiBreakdown} disabled={busy}>
            {busy ? "Thinking…" : "✦ AI breakdown (optional)"}
          </button>
        )}
      </div>
      {msg && <p className={msg.kind === "err" ? "error" : "ai-note"}>{msg.text}</p>}
      {!tasks.length && <Empty>Break the quest into weekly actions. They show up on Today and can be dragged onto the calendar.</Empty>}
      {allWeeks
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
                      {allWeeks.map((wk) => (
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
    </section>
  );
}

// ------------------------------------------------------------------ Seasons

function SeasonsCard() {
  const { put, del, prefs, setPrefs } = useStore();
  const seasons = useList("seasons").sort((a, b) => a.start.localeCompare(b.start));
  const [editing, setEditing] = useState<Season | null>(null);
  return (
    <details className="card">
      <summary>
        <b>🗓️ Seasons</b> <span className="muted small">· optional ~12-week chapters for planning weekly tasks</span>
      </summary>
      <div className="list" style={{ marginTop: 10 }}>
        {seasons.map((s) => (
          <div key={s.id} className="row between small">
            <span>
              {s.name} <span className="muted">· {fmtDay(s.start)} – {fmtDay(s.end)}</span> {prefs.currentSeasonId === s.id && <span className="tag">current</span>}
            </span>
            <span className="row">
              <button className="btn ghost small" onClick={() => setPrefs({ currentSeasonId: s.id })}>
                Set current
              </button>
              <button className="btn ghost small" onClick={() => setEditing(s)}>
                Edit
              </button>
              <button className="btn ghost small danger" onClick={() => confirm(`Delete ${s.name}? Its quests become ongoing.`) && del("seasons", s.id)}>
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
      <button className="btn small" onClick={() => setEditing({ id: uid(), u: 0, ...quarterRange() })}>
        + New season
      </button>
      {editing && (
        <Modal title="Season" onClose={() => setEditing(null)}>
          <label>
            Name
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <div className="row">
            <label className="grow">
              Start
              <input type="date" value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} />
            </label>
            <label className="grow">
              End
              <input type="date" value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} />
            </label>
          </div>
          <button className="btn primary" disabled={!editing.name || editing.end < editing.start} onClick={() => { put("seasons", editing); setPrefs({ currentSeasonId: editing.id }); setEditing(null); }}>
            Save
          </button>
        </Modal>
      )}
    </details>
  );
}
