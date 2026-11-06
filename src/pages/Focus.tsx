import { useState } from "react";
import { useList, useMap, useStore } from "../store";
import { addDays, fmtDay, fmtHours, fmtTime, todayStr, weekStart } from "../dates";
import { elapsedMs, remainingMs, timerDisplay, useNow } from "../focus";
import { entryMins } from "../game";
import { celebrate, Empty, useTimerActions } from "../ui";
import { EntryEditor, ProjectInput } from "../components/EntryEditor";
import type { Entry } from "../types";

export default function Focus() {
  const { prefs, timer, put } = useStore();
  const tags = useList("tags").filter((t) => !t.archived);
  const tagMap = useMap("tags");
  const tasks = useList("tasks").filter((t) => !t.done && t.week <= weekStart());
  const entries = useList("entries");
  const act = useTimerActions();
  const now = useNow(250);
  const [tagId, setTagId] = useState("tag-deep-work");
  const [taskId, setTaskId] = useState("");
  const [label, setLabel] = useState("");
  const [mins, setMins] = useState(prefs.focusMins);
  const [note, setNote] = useState("");
  const [project, setProject] = useState("");
  const [editEntry, setEditEntry] = useState<Entry | null>(null);

  const start = () => {
    const t = tasks.find((x) => x.id === taskId);
    act.start({ label: label.trim() || t?.title || tagMap.get(tagId)?.name || "Focus", tagId, taskId: t?.id ?? null, plannedMins: mins, project: project.trim() || undefined });
  };
  const finish = (taskDone: boolean) => {
    const m = act.stop({ note: note.trim() || undefined, taskDone });
    setNote("");
    if (m >= 1) celebrate(`Focused ${fmtHours(m)} · +${Math.floor(m / 5) + Math.floor(m / 15)} XP`, "🎯");
  };

  const today = todayStr();
  const focus = entries.filter((e) => e.source === "focus");
  const minsOn = (d: string) => focus.filter((e) => e.date === d).reduce((n, e) => n + entryMins(e), 0);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const maxDay = Math.max(60, ...last7.map(minsOn));
  const weekMins = focus.filter((e) => e.date >= weekStart()).reduce((n, e) => n + entryMins(e), 0);
  let streak = 0;
  for (let d = minsOn(today) > 0 ? today : addDays(today, -1); minsOn(d) > 0; d = addDays(d, -1)) streak++;
  const recent = [...focus].sort((a, b) => (b.date + fmtTime(b.start)).localeCompare(a.date + fmtTime(a.start))).slice(0, 8);

  const progress = timer?.plannedMins ? Math.min(1, elapsedMs(timer, now) / (timer.plannedMins * 60000)) : 0;
  const over = timer?.plannedMins ? remainingMs(timer, now) <= 0 : false;
  const R = 110;
  const C = 2 * Math.PI * R;
  const color = (timer?.tagId && tagMap.get(timer.tagId)?.color) || "var(--accent)";

  return (
    <div className="page">
      <header className="page-head">
        <h1>Focus</h1>
      </header>
      <section className="card focus-card">
        {timer ? (
          <>
            <svg width="260" height="260" className="ring">
              <circle cx="130" cy="130" r={R} className="ring-bg" />
              {timer.plannedMins && <circle cx="130" cy="130" r={R} className="ring-fg" style={{ stroke: over ? "var(--ok)" : color }} strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />}
              <text x="130" y="128" className="ring-time">
                {timerDisplay(timer, now)}
              </text>
              <text x="130" y="160" className="ring-sub">
                {timer.pausedAt ? "paused" : over ? "done! keep going or finish" : timer.plannedMins ? `of ${timer.plannedMins} min` : "tracking"}
              </text>
            </svg>
            <h2>{timer.label}</h2>
            {timer.tagId && <p style={{ color }}>{tagMap.get(timer.tagId)?.emoji} {tagMap.get(timer.tagId)?.name}</p>}
            <label className="small muted project-field">
              Thing
              <ProjectInput value={timer.project ?? ""} onChange={(p) => put("meta", { ...timer, project: p })} tagId={timer.tagId ?? undefined} />
            </label>
            <textarea rows={2} placeholder="Note: what did you get done?" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row wrap center">
              <button className="btn" onClick={act.pause}>
                {timer.pausedAt ? "Resume" : "Pause"}
              </button>
              <button className="btn primary" onClick={() => finish(false)}>
                Finish & log
              </button>
              {timer.taskId && (
                <button className="btn primary" onClick={() => finish(true)}>
                  Finish + task done ✓
                </button>
              )}
              <button className="btn ghost danger" onClick={() => confirm("Discard without logging?") && act.discard()}>
                Discard
              </button>
            </div>
          </>
        ) : (
          <div className="form focus-setup">
            <h2>Start a focus session</h2>
            <label>
              Tag (where the time goes in Things I Did)
              <select value={tagId} onChange={(e) => setTagId(e.target.value)}>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.emoji} {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Task (optional)
              <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">— none —</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Thing (optional)
              <ProjectInput value={project} onChange={setProject} tagId={tagId} />
            </label>
            {!taskId && (
              <label>
                What exactly?
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Chapter 3 draft" />
              </label>
            )}
            <div className="row wrap">
              {[25, 50, 90].map((m) => (
                <button key={m} className={`btn ${mins === m ? "primary" : "ghost"}`} onClick={() => setMins(m)}>
                  {m} min
                </button>
              ))}
              <input type="number" min={5} max={240} value={mins} onChange={(e) => setMins(Number(e.target.value) || 25)} style={{ width: 80 }} />
            </div>
            <button className="btn primary big" onClick={start}>
              ▶ Start
            </button>
            <p className="muted small">Tip: phone in another room, one tab open. Distraction is the enemy.</p>
          </div>
        )}
      </section>

      <div className="grid-3">
        <div className="card stat">
          <div className="stat-num">{fmtHours(minsOn(today))}</div>
          <div className="muted small">focus today</div>
        </div>
        <div className="card stat">
          <div className="stat-num">{fmtHours(weekMins)}</div>
          <div className="muted small">this week</div>
        </div>
        <div className="card stat">
          <div className="stat-num">{streak}🔥</div>
          <div className="muted small">day streak</div>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Last 7 days</h2>
          <div className="bars">
            {last7.map((d) => (
              <div key={d} className="bar-col" title={`${fmtDay(d)}: ${fmtHours(minsOn(d))}`}>
                <div className="bar-val">{minsOn(d) ? fmtHours(minsOn(d)) : ""}</div>
                <div className="bar-fill" style={{ height: `${(minsOn(d) / maxDay) * 100}%` }} />
                <div className="bar-day">{fmtDay(d, { weekday: "narrow" })}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>Recent sessions · tap to edit</h2>
          {!recent.length && <Empty>No focus sessions yet.</Empty>}
          <ul className="list">
            {recent.map((e) => (
              <li key={e.id} className="row between small session-row clickable" onClick={() => setEditEntry(e)}>
                <span>
                  {tagMap.get(e.tagId)?.emoji} {e.project ? <b>{e.project} </b> : null}
                  {e.note || (!e.project && tagMap.get(e.tagId)?.name)}
                </span>
                <span className="muted">
                  {fmtHours(entryMins(e))} · {fmtDay(e.date, { day: "numeric", month: "short" })} {fmtTime(e.start)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {editEntry && <EntryEditor entry={editEntry} isNew={false} onClose={() => setEditEntry(null)} />}
    </div>
  );
}
