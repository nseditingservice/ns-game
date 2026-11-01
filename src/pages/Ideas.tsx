import { useMemo, useState } from "react";
import { uid, useList, useStore } from "../store";
import type { Spark } from "../types";
import { daysBetween, fmtDay, todayStr } from "../dates";
import { newTask } from "../tasks";
import { celebrate, Empty } from "../ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Filter = "all" | "open" | "done";

export default function Ideas() {
  const { put, putMany, del } = useStore();
  const sparks = useList("sparks");
  const today = todayStr();
  const [text, setText] = useState("");
  const [year, setYear] = useState(today.slice(0, 4));
  const [month, setMonth] = useState<number | null>(Number(today.slice(5, 7)) - 1); // null = whole year
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const years = useMemo(() => [...new Set([today.slice(0, 4), ...sparks.map((s) => s.date.slice(0, 4)), ...sparks.filter((s) => s.doneAt).map((s) => s.doneAt!.slice(0, 4))])].sort().reverse(), [sparks, today]);
  const prefix = month == null ? year : `${year}-${String(month + 1).padStart(2, "0")}`;
  const inPeriod = (d?: string) => !!d && d.startsWith(prefix);
  const captured = sparks.filter((s) => inPeriod(s.date));
  const executed = sparks.filter((s) => s.done && inPeriod(s.doneAt));
  const executedOfCaptured = captured.filter((s) => s.done).length;
  const rate = captured.length ? Math.round((executedOfCaptured / captured.length) * 100) : 0;
  const openTotal = sparks.filter((s) => !s.done).length;

  const q = query.trim().toLowerCase();
  const list = sparks
    .filter((s) => (q ? true : inPeriod(s.date) || inPeriod(s.doneAt)))
    .filter((s) => (filter === "open" ? !s.done : filter === "done" ? s.done : true))
    .filter((s) => !q || `${s.text} ${s.note ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => Number(a.done) - Number(b.done) || (b.rating ?? 0) - (a.rating ?? 0) || b.date.localeCompare(a.date) || b.u - a.u);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    put("sparks", { id: uid(), text: t, date: today, done: false });
    setText("");
    setYear(today.slice(0, 4));
    setMonth(Number(today.slice(5, 7)) - 1);
    celebrate("Idea captured +2 XP", "💡");
  };
  const toggle = (s: Spark) => {
    if (s.done) return put("sparks", { ...s, done: false, doneAt: undefined });
    put("sparks", { ...s, done: true, doneAt: today });
    celebrate("Idea executed! +20 XP", "🚀");
  };
  const toTask = (s: Spark) => {
    const t = newTask({ title: s.text.length > 120 ? `${s.text.slice(0, 117)}…` : s.text, notes: s.note ? `${s.text}\n\n${s.note}` : s.text });
    putMany("tasks", [t]);
    put("sparks", { ...s, taskId: t.id });
    celebrate("Added to your Tasks inbox", "📋");
  };

  const monthCount = (m: number) => {
    const p = `${year}-${String(m + 1).padStart(2, "0")}`;
    return { got: sparks.filter((s) => s.date.startsWith(p)).length, done: sparks.filter((s) => s.done && s.doneAt?.startsWith(p)).length };
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Ideas</h1>
          <p className="muted">Ideas are everywhere. Catch them, then execute the best ones. {openTotal} waiting.</p>
        </div>
      </header>

      <section className="card idea-capture">
        <div className="row">
          <input className="grow" placeholder="💡 New idea… (press Enter)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn primary" disabled={!text.trim()} onClick={add}>
            Add
          </button>
        </div>
      </section>

      <section className="card">
        <div className="row between wrap">
          <div className="seg">
            {years.map((y) => (
              <button key={y} className={year === y ? "on" : ""} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
          <div className="seg">
            {(["all", "open", "done"] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "open" ? "Open" : "Executed"}
              </button>
            ))}
          </div>
        </div>
        <div className="month-tabs">
          <button className={`month-tab ${month == null ? "on" : ""}`} onClick={() => setMonth(null)}>
            <b>Year</b>
            <span>{sparks.filter((s) => s.date.startsWith(year)).length}</span>
          </button>
          {MONTHS.map((m, i) => {
            const c = monthCount(i);
            const future = `${year}-${String(i + 1).padStart(2, "0")}` > today.slice(0, 7);
            return (
              <button key={m} className={`month-tab ${month === i ? "on" : ""} ${future ? "future" : ""}`} onClick={() => setMonth(i)} disabled={future && !c.got}>
                <b>{m}</b>
                <span>{c.got || (future ? "" : "0")}</span>
                {c.done > 0 && <span className="month-done">✓{c.done}</span>}
              </button>
            );
          })}
        </div>
        <div className="idea-stats">
          <div>
            <b>💡 {captured.length}</b>
            <span>ideas {month == null ? `in ${year}` : `in ${MONTHS[month]}`}</span>
          </div>
          <div>
            <b>🚀 {executed.length}</b>
            <span>executed {month == null ? `in ${year}` : `in ${MONTHS[month]}`}</span>
          </div>
          <div>
            <b>{rate}%</b>
            <span>of these ideas executed</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="search-bar inner">
          <span>🔍</span>
          <input placeholder="Search all ideas…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!list.length && <Empty>{q ? "No ideas match." : sparks.length ? "No ideas in this period." : "Your first idea goes in the box above. Write it before it escapes."}</Empty>}
        <ul className="list">
          {list.map((s) => (
            <li key={s.id} className={`idea-row ${s.done ? "done" : ""}`}>
              <button className="todo-check" onClick={() => toggle(s)} aria-label={s.done ? "Mark not executed" : "Mark executed"} title={s.done ? "Undo" : "I executed this idea"}>
                {s.done ? "✓" : ""}
              </button>
              <div className="grow idea-body">
                <div className="idea-date">
                  {fmtDay(s.date, { day: "numeric", month: "short", year: s.date.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined })}
                  {s.done && s.doneAt && (
                    <span className="idea-exec">
                      {" "}· ✓ executed {fmtDay(s.doneAt, { day: "numeric", month: "short" })}
                      {daysBetween(s.date, s.doneAt) > 0 ? ` (${daysBetween(s.date, s.doneAt)} day${daysBetween(s.date, s.doneAt) === 1 ? "" : "s"} later)` : " (same day)"}
                    </span>
                  )}
                  {s.taskId && !s.done && <span className="idea-task"> · 📋 in Tasks</span>}
                </div>
                {editing === s.id ? (
                  <div className="form" style={{ gap: 6 }}>
                    <textarea rows={2} autoFocus value={s.text} onChange={(e) => put("sparks", { ...s, text: e.target.value })} />
                    <input placeholder="Notes: how would you do it?" value={s.note ?? ""} onChange={(e) => put("sparks", { ...s, note: e.target.value })} />
                    <div className="row">
                      <label className="row small">
                        Executed on
                        <input type="date" value={s.doneAt ?? ""} onChange={(e) => put("sparks", { ...s, doneAt: e.target.value || undefined, done: !!e.target.value })} />
                      </label>
                      <button className="btn small" onClick={() => setEditing(null)}>
                        Done
                      </button>
                      <button className="btn ghost small danger" onClick={() => { if (confirm("Delete this idea?")) { del("sparks", s.id); setEditing(null); } }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="idea-text" onClick={() => setEditing(s.id)}>
                    {s.text}
                    {s.note && <div className="muted small">{s.note}</div>}
                  </div>
                )}
              </div>
              <div className="idea-actions">
                <span className="stars" title="Potential">
                  {[1, 2, 3].map((n) => (
                    <button key={n} className={(s.rating ?? 0) >= n ? "on" : ""} onClick={() => put("sparks", { ...s, rating: s.rating === n ? undefined : (n as 1 | 2 | 3) })} aria-label={`Potential ${n}`}>
                      ★
                    </button>
                  ))}
                </span>
                {!s.done && !s.taskId && (
                  <button className="icon-btn" title="Turn into a task" onClick={() => toTask(s)}>
                    📋
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <p className="muted tiny center-text">Tip: rate ⭐ potential, then execute the 3-star ones first. Tap an idea to edit it, add notes or change its date.</p>
    </div>
  );
}

export type { Spark };
