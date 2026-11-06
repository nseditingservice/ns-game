import { useState } from "react";
import { uid, useList, useMap, useStore } from "../store";
import type { Task } from "../types";
import { fmtHours, todayStr, weekStart } from "../dates";
import { entryMins } from "../game";
import { dueLabel, isFrog, isOverdue, parseQuick, newTask, useTaskActions } from "../tasks";
import { celebrate, Modal, useTimerActions } from "../ui";
import { ProjectInput } from "./EntryEditor";
import { estimatesOf, fmtEstimate, parseEstimate, thingIcon, useThings } from "../v2";
import type { Go } from "../App";

const P_LABEL = { 1: "P1", 2: "P2", 3: "P3" } as const;

/** One-line capture: "Edit reel tomorrow !1 ~2h #Zen Media House" */
export function QuickAdd({ defaults, placeholder }: { defaults?: Partial<Task>; placeholder?: string }) {
  const { put } = useStore();
  const things = useThings();
  const [text, setText] = useState("");
  const preview = text.trim() ? parseQuick(text) : null;
  const add = () => {
    const p = parseQuick(text);
    if (!p.title) return;
    const t = newTask({ ...defaults, title: p.title, due: p.due ?? defaults?.due, priority: p.priority ?? defaults?.priority, estimateMins: p.estimateMins ?? 30, project: p.project ?? defaults?.project });
    put("tasks", t);
    setText("");
    celebrate(`Captured: ${t.title}`, "📥");
  };
  return (
    <div className="quick-add">
      <div className="row">
        <input
          className="grow"
          placeholder={placeholder ?? "Add a task… e.g. Edit reel tomorrow !1 ~2h #Zen Media House"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button className="btn primary" disabled={!preview?.title} onClick={add}>
          Add
        </button>
      </div>
      {preview && (preview.due || preview.priority || preview.estimateMins || preview.project) && (
        <div className="chip-row">
          {preview.due && <span className="mini-chip static">📅 {dueLabel({ due: preview.due } as Task)}</span>}
          {preview.priority && <span className={`mini-chip static prio-${preview.priority}`}>{P_LABEL[preview.priority]}</span>}
          {preview.estimateMins && <span className="mini-chip static">⏱ {fmtHours(preview.estimateMins)}</span>}
          {preview.project && <span className="mini-chip static">{thingIcon(preview.project, things)} {preview.project}</span>}
        </div>
      )}
    </div>
  );
}

export function TaskRow({ t, go, showDue = true }: { t: Task; go?: Go; showDue?: boolean }) {
  const { timer } = useStore();
  const things = useThings();
  const goals = useMap("goals");
  const entries = useList("entries");
  const act = useTaskActions();
  const timerAct = useTimerActions();
  const [open, setOpen] = useState(false);
  const today = todayStr();
  const spent = entries.filter((e) => e.taskId === t.id).reduce((n, e) => n + entryMins(e), 0);
  const subs = t.subtasks ?? [];
  const g = t.goalId ? goals.get(t.goalId) : undefined;
  const frog = isFrog(t, today);
  return (
    <li className={`todo ${t.done ? "done" : ""} ${frog ? "frog" : ""} ${isOverdue(t, today) ? "overdue" : ""}`}>
      <button className={`todo-check prio-${t.priority ?? 4}`} onClick={() => act.toggle(t)} aria-label={t.done ? "Mark not done" : "Complete task"}>
        {t.done ? "✓" : ""}
      </button>
      <div className="grow todo-main" onClick={() => setOpen(true)}>
        <div className="todo-title">
          {frog && <span className="frog-badge">🐸 FROG</span>}
          {t.title}
        </div>
        <div className="todo-meta">
          {showDue && t.due && <span className={isOverdue(t, today) ? "late" : ""}>📅 {dueLabel(t, today)}</span>}
          {t.priority && <span className={`prio-text-${t.priority}`}>{P_LABEL[t.priority]}</span>}
          {t.repeat && <span>🔁 {t.repeat === "day" ? "daily" : t.repeat === "weekday" ? "weekdays" : t.repeat === "week" ? "weekly" : "monthly"}</span>}
          {(t.estimateMins || spent > 0) && <span>⏱ {spent ? `${fmtHours(spent)} / ` : ""}{fmtHours(t.estimateMins)}</span>}
          {subs.length > 0 && <span>☑ {subs.filter((s) => s.done).length}/{subs.length}</span>}
          {t.project && <span>{thingIcon(t.project, things)} {t.project}</span>}
          {g && <span style={{ color: g.color }}>{g.hero ?? "🗺️"} {g.title}</span>}
          {t.notes && <span>📝</span>}
        </div>
      </div>
      {!t.done && (
        <div className="todo-actions">
          <button className={`icon-btn ${frog ? "on" : ""}`} title={frog ? "Not the frog" : "Make this today's frog (most important task)"} onClick={() => act.setFrog(t)}>
            🐸
          </button>
          {!timer && (
            <button
              className="icon-btn"
              title="Focus on this task"
              onClick={() => {
                timerAct.start({ label: t.title, tagId: t.tagId ?? "tag-deep-work", taskId: t.id, plannedMins: Math.max(t.estimateMins || 50, 5), project: t.project });
                go?.("focus");
              }}
            >
              ▶
            </button>
          )}
        </div>
      )}
      {open && <TaskEditor task={t} onClose={() => setOpen(false)} />}
    </li>
  );
}

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const { put, del, data } = useStore();
  const goals = useList("goals").filter((g) => !g.done || g.id === task.goalId);
  const tags = useList("tags").filter((x) => !x.archived);
  const entries = useList("entries").filter((e) => e.taskId === task.id);
  const [t, setT] = useState<Task>({ ...task, subtasks: task.subtasks ?? [], notes: task.notes ?? "" });
  const [sub, setSub] = useState("");
  const isNew = !data.tasks[task.id] || data.tasks[task.id].del;
  const spent = entries.reduce((n, e) => n + entryMins(e), 0);
  const save = () => {
    put("tasks", { ...t, title: t.title.trim(), week: t.due ? weekStart(t.due) : t.week });
    onClose();
  };
  const addSub = () => {
    if (!sub.trim()) return;
    setT({ ...t, subtasks: [...(t.subtasks ?? []), { id: uid(), title: sub.trim(), done: false }] });
    setSub("");
  };
  return (
    <Modal title={isNew ? "New task" : "Task"} onClose={() => { if (!isNew && t.title.trim()) save(); else onClose(); }}>
      <input className="task-title-input" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="Task" autoFocus={isNew} />
      <div className="row wrap">
        <label>
          Due
          <div className="row">
            <input type="date" value={t.due ?? ""} onChange={(e) => setT({ ...t, due: e.target.value || undefined })} />
            {t.due && (
              <button className="btn ghost small" onClick={() => setT({ ...t, due: undefined })} title="Remove date (back to Inbox)">
                ✕
              </button>
            )}
          </div>
        </label>
        <label>
          Priority
          <div className="row">
            {([1, 2, 3] as const).map((p) => (
              <button key={p} type="button" className={`btn small prio-btn prio-${p} ${t.priority === p ? "on" : ""}`} onClick={() => setT({ ...t, priority: t.priority === p ? undefined : p })}>
                P{p}
              </button>
            ))}
          </div>
        </label>
        <label>
          Estimate
          <EstimateInput value={t.estimateMins} onChange={(m) => setT({ ...t, estimateMins: m })} />
        </label>
        <label>
          Repeat
          <select value={t.repeat ?? ""} onChange={(e) => setT({ ...t, repeat: (e.target.value || undefined) as Task["repeat"] })}>
            <option value="">Never</option>
            <option value="day">Every day</option>
            <option value="weekday">Weekdays</option>
            <option value="week">Every week</option>
            <option value="month">Every month</option>
          </select>
        </label>
      </div>
      <label>
        Notes
        <textarea rows={3} value={t.notes} onChange={(e) => setT({ ...t, notes: e.target.value })} placeholder="Details, links, ideas…" />
      </label>
      <div>
        <div className="muted small">Subtasks</div>
        {(t.subtasks ?? []).map((s, i) => (
          <div key={s.id} className="row subtask">
            <input type="checkbox" checked={s.done} onChange={() => setT({ ...t, subtasks: t.subtasks!.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
            <input className="inline grow" value={s.title} onChange={(e) => setT({ ...t, subtasks: t.subtasks!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
            <button className="btn ghost small" onClick={() => setT({ ...t, subtasks: t.subtasks!.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <input className="grow" placeholder="+ Add a step" value={sub} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} />
        </div>
      </div>
      <div className="row wrap">
        <label className="grow">
          Quest
          <select value={t.goalId ?? ""} onChange={(e) => setT({ ...t, goalId: e.target.value || null })}>
            <option value="">— none —</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.hero ?? "🗺️"} {g.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Focus time goes to tag
          <select value={t.tagId ?? ""} onChange={(e) => setT({ ...t, tagId: e.target.value || null })}>
            <option value="">🎯 Deep Work (default)</option>
            {tags.map((x) => (
              <option key={x.id} value={x.id}>
                {x.emoji} {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Thing
        <ProjectInput value={t.project ?? ""} onChange={(project) => setT({ ...t, project: project || undefined })} />
      </label>
      {spent > 0 && <p className="muted small">⏱ {fmtHours(spent)} spent so far across {entries.length} session(s).</p>}
      <div className="row between">
        <button className="btn primary" disabled={!t.title.trim()} onClick={save}>
          Save
        </button>
        {!isNew && (
          <button className="btn ghost danger" onClick={() => { del("tasks", t.id); onClose(); }}>
            Delete
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Type any duration ("6h30", "90", "2d") or tap a quick pick (editable in Settings). */
export function EstimateInput({ value, onChange }: { value: number; onChange: (mins: number) => void }) {
  const { prefs } = useStore();
  const [text, setText] = useState(fmtEstimate(value));
  const parsed = parseEstimate(text);
  return (
    <span className="estimate-input">
      <input
        value={text}
        placeholder="e.g. 6h30"
        style={{ width: 100 }}
        onChange={(e) => {
          setText(e.target.value);
          const m = parseEstimate(e.target.value);
          if (m) onChange(m);
        }}
        onBlur={() => setText(fmtEstimate(parseEstimate(text) ?? value))}
      />
      {text && !parsed && <span className="warn-text tiny"> try 45m, 2h, 6h30, 2d</span>}
      <span className="chip-row">
        {estimatesOf(prefs).map((m) => (
          <button key={m} type="button" className={`mini-chip ${value === m ? "on" : ""}`} onClick={() => { onChange(m); setText(fmtEstimate(m)); }}>
            {fmtEstimate(m)}
          </button>
        ))}
      </span>
    </span>
  );
}
