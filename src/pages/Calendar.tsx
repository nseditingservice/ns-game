import { useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from "react";
import { uid, useList, useMap, useStore } from "../store";
import type { Go } from "../App";
import type { Entry, Plan, Tag } from "../types";
import { addDays, fmtDay, fmtHours, fmtTime, nowMins, todayStr, weekStart } from "../dates";
import { planWeek } from "../ai";
import { celebrate, Modal, useTimerActions } from "../ui";
import { EntryEditor, ProjectInput, TimeFields } from "../components/EntryEditor";

const HOUR_PX = 44;
const SNAP = 15;

/** Side-by-side columns for overlapping blocks within one lane. */
function layoutLane<T extends { id: string; start: number; end: number }>(items: T[]): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: T[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const it of cluster) out.set(it.id, { col: out.get(it.id)!.col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd) flush();
    let col = colEnds.findIndex((e) => e <= it.start);
    if (col < 0) col = colEnds.push(it.end) - 1;
    else colEnds[col] = it.end;
    out.set(it.id, { col, cols: 0 });
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

const laneStyle = (lane: "plan" | "did", l?: { col: number; cols: number }) => {
  const cols = l?.cols || 1;
  const w = 50 / cols;
  const left = (lane === "plan" ? 0 : 50) + w * (l?.col ?? 0);
  return { left: `calc(${left}% + 2px)`, width: `calc(${w}% - 4px)` };
};

type Sel = { kind: "entry"; item: Entry; isNew: boolean } | { kind: "plan"; item: Plan; isNew: boolean };

function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia("(max-width: 800px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 800px)");
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return m;
}

export default function Calendar({ go }: { go: Go }) {
  const { prefs, put, putMany, del, local } = useStore();
  const tags = useList("tags").filter((t) => !t.archived);
  const tagMap = useMap("tags");
  const goals = useMap("goals");
  const tasks = useList("tasks");
  const entries = useList("entries");
  const plans = useList("plans");
  const allGoals = useList("goals");
  const mobile = useIsMobile();
  const [view, setView] = useState<"week" | "day">(mobile ? "day" : "week");
  const [anchor, setAnchor] = useState(todayStr());
  const [sel, setSel] = useState<Sel | null>(null);
  const [armed, setArmed] = useState<Tag | null>(null);
  const [dur, setDur] = useState(60);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [prefsText, setPrefsText] = useState("");
  const [project, setProject] = useState("");
  const grab = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { dayStart, dayEnd } = prefs;

  useEffect(() => setView(mobile ? "day" : "week"), [mobile]);
  useEffect(() => {
    // The calendar covers the full 24h; open it scrolled to ~2h before now.
    const el = bodyRef.current?.parentElement;
    if (el) el.scrollTop = Math.max(0, (nowMins() / 60 - 2) * HOUR_PX);
  }, []);

  const week = weekStart(anchor);
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(week, i)) : [anchor];
  const first = days[0];
  const last = days[days.length - 1];
  const today = todayStr();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const visEntries = entries.filter((e) => e.date >= first && e.date <= last);
  const visPlans = plans.filter((p) => p.date >= first && p.date <= last);
  const loggedMins = visEntries.reduce((n, e) => n + e.end - e.start, 0);
  const weekTasks = tasks.filter((t) => t.week === week && !t.done);
  const nm = nowMins();

  const yToMins = (clientY: number, el: Element, offset = 0) => {
    const r = el.getBoundingClientRect();
    const raw = ((clientY - r.top - offset) / HOUR_PX) * 60;
    return Math.min(Math.max(Math.round(raw / SNAP) * SNAP, 0), 24 * 60 - SNAP);
  };

  const newEntry = (tag: Tag, date: string, start: number, len = dur): Entry => ({ id: uid(), u: 0, tagId: tag.id, date, start, end: Math.min(start + len, 24 * 60), note: "", taskId: null, source: "manual", project: project.trim() || undefined });

  const onDrop = (e: DragEvent<HTMLDivElement>, date: string) => {
    e.preventDefault();
    const [kind, id] = e.dataTransfer.getData("text/plain").split(":");
    const el = e.currentTarget;
    if (kind === "tag") {
      const t = tagMap.get(id);
      if (t) {
        put("entries", newEntry(t, date, yToMins(e.clientY, el)));
        celebrate(`Logged ${t.name}`, t.emoji);
      }
    } else if (kind === "task") {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      const start = yToMins(e.clientY, el);
      put("plans", { id: uid(), date, start, end: Math.min(start + t.estimateMins, 24 * 60), title: t.title, taskId: t.id, goalId: t.goalId, tagId: null, source: "manual" });
    } else if (kind === "entry" || kind === "plan") {
      const col = kind === "entry" ? "entries" : "plans";
      const item = (kind === "entry" ? entries : plans).find((x) => x.id === id);
      if (!item) return;
      const len = item.end - item.start;
      const start = Math.min(yToMins(e.clientY, el, grab.current), 24 * 60 - len);
      put(col, { ...item, date, start, end: start + len } as never);
    }
  };

  const onColumnClick = (e: React.MouseEvent<HTMLDivElement>, date: string) => {
    if (e.target !== e.currentTarget) return;
    const start = yToMins(e.clientY, e.currentTarget);
    if (armed) {
      put("entries", newEntry(armed, date, start));
      celebrate(`Logged ${armed.name}`, armed.emoji);
      return;
    }
    const past = date < today || (date === today && start < nm);
    if (past && tags[0]) setSel({ kind: "entry", isNew: true, item: newEntry(tags[0], date, start) });
    else setSel({ kind: "plan", isNew: true, item: { id: uid(), u: 0, date, start, end: Math.min(start + 60, 24 * 60), title: "", taskId: null, goalId: null, tagId: null, source: "manual" } });
  };

  const startResize = (e: RPointerEvent, kind: "entry" | "plan", item: Entry | Plan) => {
    e.stopPropagation();
    e.preventDefault();
    const y0 = e.clientY;
    const move = (ev: PointerEvent) => {
      const delta = Math.round((((ev.clientY - y0) / HOUR_PX) * 60) / SNAP) * SNAP;
      const end = Math.min(Math.max(item.end + delta, item.start + SNAP), 24 * 60);
      put(kind === "entry" ? "entries" : "plans", { ...item, end } as never);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const aiPlan = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const out = await planWeek({ apiKey: local.apiKey, week, tasks: weekTasks, goals: allGoals, blocks: plans.filter((p) => p.date >= week && p.date <= addDays(week, 6)), dayStart, dayEnd, preferences: prefsText });
      putMany("plans", out.blocks.map((b) => ({ id: uid(), source: "ai" as const, tagId: null, ...b })));
      setMsg({ kind: "ok", text: `Added ${out.blocks.length} plan blocks. ${out.summary}` });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const step = view === "week" ? 7 : 1;
  const blockStyle = (s: number, en: number) => ({ top: (s / 60) * HOUR_PX, height: Math.max(((en - s) / 60) * HOUR_PX - 2, 16) });

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <h1>{view === "week" ? `Week of ${fmtDay(week, { day: "numeric", month: "long" })}` : fmtDay(anchor, { weekday: "long", day: "numeric", month: "long" })}</h1>
          <p className="muted small">
            {fmtHours(loggedMins)} logged<span className="hide-mobile"> · left lane = <b>plan</b>, right lane = <b>did</b>. Drag tags or tasks onto the calendar.</span>
          </p>
        </div>
        <div className="row wrap">
          <div className="seg">
            <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>
              Day
            </button>
            <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>
              Week
            </button>
          </div>
          <button className="btn ghost" onClick={() => setAnchor(addDays(anchor, -step))}>
            ←
          </button>
          <button className="btn ghost" onClick={() => setAnchor(todayStr())}>
            Today
          </button>
          <button className="btn ghost" onClick={() => setAnchor(addDays(anchor, step))}>
            →
          </button>
        </div>
      </header>

      <div className={`cal-layout ${view}`}>
        <aside className="card palette">
          <div className="row between">
            <h2>Tags</h2>
            <select value={dur} onChange={(e) => setDur(Number(e.target.value))} title="Default length">
              {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                <option key={m} value={m}>
                  {fmtHours(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="palette-tags">
            {tags.map((t) => (
              <div
                key={t.id}
                className={`tag-chip ${armed?.id === t.id ? "armed" : ""}`}
                style={{ borderLeftColor: t.color }}
                draggable={!mobile}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", `tag:${t.id}`)}
                onClick={() => setArmed(armed?.id === t.id ? null : t)}
              >
                {t.emoji} {t.name}
              </div>
            ))}
            <button className="tag-chip add" onClick={() => go("did")}>
              + Manage tags
            </button>
          </div>
          {(!mobile || armed) && (
            <label className="small muted">
              Project for new logs (optional)
              <ProjectInput value={project} onChange={setProject} tagId={armed?.id} />
            </label>
          )}
          {mobile && !armed && <p className="muted tiny">Tap a tag, then tap the calendar to log it. Tap empty space to plan.</p>}
          {!mobile && weekTasks.length > 0 && (
            <>
              <h3>Tasks to plan</h3>
              {weekTasks.map((t) => (
                <div key={t.id} className="task-chip" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", `task:${t.id}`)} style={{ borderLeftColor: (t.goalId && goals.get(t.goalId)?.color) || "#94a3b8" }}>
                  {t.title}
                  <div className="muted tiny">{fmtHours(t.estimateMins)}</div>
                </div>
              ))}
            </>
          )}
          {!mobile && (
            <div className="ai-box">
              <button className="btn ghost small" onClick={() => setShowAi(!showAi)}>
                ✦ AI week planner (optional) {showAi ? "▴" : "▾"}
              </button>
              {showAi && (
                <>
                  <textarea rows={3} placeholder="Preferences, e.g. gym 7-8am Mon/Wed/Fri" value={prefsText} onChange={(e) => setPrefsText(e.target.value)} />
                  <button className="btn primary full" onClick={aiPlan} disabled={busy}>
                    {busy ? "Planning…" : "Plan my week's tasks"}
                  </button>
                  {visPlans.some((p) => p.source === "ai") && (
                    <button className="btn ghost small full" onClick={() => visPlans.filter((p) => p.source === "ai").forEach((p) => del("plans", p.id))}>
                      Remove AI blocks
                    </button>
                  )}
                </>
              )}
              {msg && <p className={msg.kind === "err" ? "error" : "ai-note"}>{msg.text}</p>}
            </div>
          )}
        </aside>

        <div className="calendar card">
          {armed && (
            <div className="armed-banner" style={{ background: armed.color }}>
              Tap the calendar to log {armed.emoji} {armed.name}{project.trim() ? ` · ${project.trim()}` : ""} ({fmtHours(dur)})
              <button onClick={() => setArmed(null)}>Done</button>
            </div>
          )}
          <div className="cal-scroll">
            <div className="cal-head" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(${view === "week" ? 120 : 200}px, 1fr))` }}>
              <div />
              {days.map((d) => {
                const mins = visEntries.filter((e) => e.date === d).reduce((n, e) => n + e.end - e.start, 0);
                return (
                  <div key={d} className={`cal-day-label ${d === today ? "today" : ""}`} onClick={() => { setAnchor(d); setView("day"); }}>
                    {fmtDay(d, { weekday: "short" })} <span>{fmtDay(d, { day: "numeric" })}</span>
                    <div className="lane-labels">
                      <span>plan</span>
                      <span>did {mins ? fmtHours(mins) : ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={bodyRef} className="cal-body" style={{ height: hours.length * HOUR_PX, gridTemplateColumns: `48px repeat(${days.length}, minmax(${view === "week" ? 120 : 200}px, 1fr))` }}>
              <div>
                {hours.map((h) => (
                  <div key={h} className="hour-label" style={{ height: HOUR_PX }}>
                    {fmtTime(h * 60)}
                  </div>
                ))}
              </div>
              {days.map((d) => (
                <div key={d} className={`cal-col ${d === today ? "today" : ""} ${armed ? "armed" : ""}`} style={{ backgroundSize: `100% ${HOUR_PX}px` }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, d)} onClick={(e) => onColumnClick(e, d)}>
                  <div className="lane-divider" />
                  {d === today && <div className="now-line" style={{ top: (nm / 60) * HOUR_PX }} />}
                  {view === "day" && <div className="off-hours" style={{ top: 0, height: dayStart * HOUR_PX }} />}
                  {view === "day" && <div className="off-hours" style={{ top: dayEnd * HOUR_PX, height: (24 - dayEnd) * HOUR_PX }} />}
                  {(() => {
                    const dayPlans = visPlans.filter((p) => p.date === d);
                    const lay = layoutLane(dayPlans);
                    return dayPlans.map((p) => {
                      const color = (p.goalId && goals.get(p.goalId)?.color) || (p.tagId && tagMap.get(p.tagId)?.color) || "#94a3b8";
                      const done = p.taskId ? tasks.find((t) => t.id === p.taskId)?.done : false;
                      return (
                        <div key={p.id} className={`cal-block plan ${done ? "done" : ""}`} style={{ ...blockStyle(p.start, p.end), ...laneStyle("plan", lay.get(p.id)), borderColor: color, color }} draggable={!mobile} onDragStart={(e) => { grab.current = e.clientY - e.currentTarget.getBoundingClientRect().top; e.dataTransfer.setData("text/plain", `plan:${p.id}`); }} onClick={() => setSel({ kind: "plan", item: p, isNew: false })}>
                          <div className="cal-block-title">
                            {p.source === "ai" && "✦ "}
                            {p.title || "(plan)"}
                          </div>
                          <div className="cal-block-time">{fmtTime(p.start)}</div>
                          <div className="resize" onPointerDown={(e) => startResize(e, "plan", p)} onClick={(e) => e.stopPropagation()} />
                        </div>
                      );
                    });
                  })()}
                  {(() => {
                    const dayEntries = visEntries.filter((x) => x.date === d);
                    const lay = layoutLane(dayEntries);
                    return dayEntries.map((x) => {
                      const t = tagMap.get(x.tagId);
                      return (
                        <div key={x.id} className="cal-block did" style={{ ...blockStyle(x.start, x.end), ...laneStyle("did", lay.get(x.id)), background: t?.color ?? "#64748b" }} draggable={!mobile} onDragStart={(e) => { grab.current = e.clientY - e.currentTarget.getBoundingClientRect().top; e.dataTransfer.setData("text/plain", `entry:${x.id}`); }} onClick={() => setSel({ kind: "entry", item: x, isNew: false })}>
                          <div className="cal-block-title">
                            {t?.emoji} {t?.name ?? "?"}
                          </div>
                          {x.project && <div className="cal-block-time">{x.project}</div>}
                          <div className="cal-block-time">
                            {fmtTime(x.start)}–{fmtTime(x.end)}
                            {x.note ? ` · ${x.note}` : ""}
                          </div>
                          <div className="resize" onPointerDown={(e) => startResize(e, "entry", x)} onClick={(e) => e.stopPropagation()} />
                        </div>
                      );
                    });
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {sel?.kind === "entry" && <EntryEditor entry={sel.item} isNew={sel.isNew} onClose={() => setSel(null)} />}
      {sel?.kind === "plan" && <PlanEditor sel={sel.item} isNew={sel.isNew} onClose={() => setSel(null)} go={go} />}
    </div>
  );
}

function PlanEditor({ sel, isNew, onClose, go }: { sel: Plan; isNew: boolean; onClose: () => void; go: Go }) {
  const { put, del, data } = useStore();
  const tasks = useList("tasks").filter((t) => !t.done || t.id === sel.taskId);
  const goals = useList("goals");
  const tags = useList("tags").filter((t) => !t.archived);
  const timer = useTimerActions();
  const [p, setP] = useState(sel);
  const valid = p.end > p.start && (p.title.trim() || p.taskId);

  const didIt = () => {
    if (!p.tagId) return;
    put("entries", { id: uid(), tagId: p.tagId, date: p.date, start: p.start, end: p.end, note: p.title, taskId: p.taskId, source: "manual" });
    celebrate("Logged as done", "✅");
    onClose();
  };

  return (
    <Modal title={isNew ? "Plan a block" : "Planned block"} onClose={onClose}>
      <label>
        Task (optional)
        <select value={p.taskId ?? ""} onChange={(e) => { const t = data.tasks[e.target.value]; setP({ ...p, taskId: t?.id ?? null, goalId: t?.goalId ?? p.goalId, title: t ? t.title : p.title }); }}>
          <option value="">— none —</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} placeholder="What will you do?" />
      </label>
      <div className="row wrap">
        <label className="grow">
          Tag (to log it when done)
          <select value={p.tagId ?? ""} onChange={(e) => setP({ ...p, tagId: e.target.value || null })}>
            <option value="">— none —</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Goal
          <select value={p.goalId ?? ""} onChange={(e) => setP({ ...p, goalId: e.target.value || null })}>
            <option value="">— none —</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TimeFields date={p.date} start={p.start} end={p.end} onChange={(x) => setP({ ...p, ...x })} />
      <div className="row wrap between">
        <button className="btn primary" disabled={!valid} onClick={() => { put("plans", { ...p, title: p.title.trim() || data.tasks[p.taskId ?? ""]?.title || "" }); onClose(); }}>
          Save
        </button>
        {!isNew && (
          <div className="row wrap">
            <button className="btn" disabled={!p.tagId} title={p.tagId ? "" : "Pick a tag first"} onClick={didIt}>
              ✓ Did it
            </button>
            <button className="btn" onClick={() => { timer.start({ label: p.title || "Focus", tagId: p.tagId ?? "tag-deep-work", taskId: p.taskId, plannedMins: p.end - p.start }); go("focus"); }}>
              ▶ Focus
            </button>
            <button className="btn ghost danger" onClick={() => { del("plans", p.id); onClose(); }}>
              Delete
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
