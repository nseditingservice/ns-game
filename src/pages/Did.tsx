import { useMemo, useState } from "react";
import { PALETTE, uid, useList, useStore } from "../store";
import { AREAS, AREA_INFO, type Area, type Entry, type Tag } from "../types";
import { addDays, addMonths, dateRange, fmtDay, fmtHours, fmtTime, monthEnd, monthStart, todayStr, weekStart, yearEnd, yearStart } from "../dates";
import { entryMins } from "../game";
import { Empty, Modal } from "../ui";
import { EntryEditor } from "../components/EntryEditor";

type Period = "day" | "week" | "month" | "year" | "all";

function range(p: Period, anchor: string, first: string): [string, string] {
  switch (p) {
    case "day":
      return [anchor, anchor];
    case "week":
      return [weekStart(anchor), addDays(weekStart(anchor), 6)];
    case "month":
      return [monthStart(anchor), monthEnd(anchor)];
    case "year":
      return [yearStart(anchor), yearEnd(anchor)];
    case "all":
      return [first, todayStr()];
  }
}
function shift(p: Period, anchor: string, n: number) {
  if (p === "day") return addDays(anchor, n);
  if (p === "week") return addDays(anchor, 7 * n);
  if (p === "month") return addMonths(anchor, n);
  if (p === "year") return `${Number(anchor.slice(0, 4)) + n}${anchor.slice(4)}`;
  return anchor;
}
function label(p: Period, a: string) {
  if (p === "day") return fmtDay(a, { weekday: "long", day: "numeric", month: "long" });
  if (p === "week") return `Week of ${fmtDay(weekStart(a), { day: "numeric", month: "short" })}`;
  if (p === "month") return fmtDay(a, { month: "long", year: "numeric" });
  if (p === "year") return a.slice(0, 4);
  return "All time";
}

const sumBy = (es: Entry[]) => {
  const m = new Map<string, number>();
  for (const e of es) m.set(e.tagId, (m.get(e.tagId) ?? 0) + entryMins(e));
  return m;
};

export default function Did() {
  const allTags = useList("tags");
  const entries = useList("entries");
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(todayStr());
  const [detail, setDetail] = useState<Tag | null>(null);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [editEntry, setEditEntry] = useState<Entry | null>(null);

  const firstDate = useMemo(() => entries.reduce((m, e) => (e.date < m ? e.date : m), todayStr()), [entries]);
  const [from, to] = range(period, anchor, firstDate);
  const [pFrom, pTo] = period === "all" ? ["", ""] : range(period, shift(period, anchor, -1), firstDate);
  const inRange = entries.filter((e) => e.date >= from && e.date <= to);
  const prev = period === "all" ? [] : entries.filter((e) => e.date >= pFrom && e.date <= pTo);
  const byTag = sumBy(inRange);
  const prevByTag = sumBy(prev);
  const total = [...byTag.values()].reduce((a, b) => a + b, 0);
  const prevTotal = [...prevByTag.values()].reduce((a, b) => a + b, 0);
  const daysElapsed = Math.max(1, dateRange(from, to < todayStr() ? to : todayStr()).length);
  const tagMap = new Map(allTags.map((t) => [t.id, t]));
  const rows = allTags
    .filter((t) => byTag.has(t.id) || (!t.archived && period !== "all") || showArchived)
    .filter((t) => showArchived || !t.archived || byTag.has(t.id))
    .sort((a, b) => (byTag.get(b.id) ?? 0) - (byTag.get(a.id) ?? 0));
  const byArea = new Map<Area, number>();
  for (const [tid, m] of byTag) {
    const a = tagMap.get(tid)?.area ?? "work";
    byArea.set(a, (byArea.get(a) ?? 0) + m);
  }

  // Chart buckets: days (day/week/month), months (year/all).
  const buckets: { key: string; label: string; from: string; to: string }[] =
    period === "year" || period === "all"
      ? (() => {
          const out = [];
          for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push({ key: m, label: fmtDay(m, { month: "narrow" }), from: m, to: monthEnd(m) });
          return out.slice(-24);
        })()
      : dateRange(period === "day" ? addDays(from, -6) : from, to).map((d) => ({ key: d, label: period === "month" ? d.slice(8).replace(/^0/, "") : fmtDay(d, { weekday: "narrow" }), from: d, to: d }));
  const bucketData = buckets.map((b) => {
    const es = entries.filter((e) => e.date >= b.from && e.date <= b.to);
    return { ...b, total: es.reduce((n, e) => n + entryMins(e), 0), byTag: sumBy(es) };
  });
  const maxBucket = Math.max(60, ...bucketData.map((b) => b.total));
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
  const totalDelta = pct(total, prevTotal);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Things I Did</h1>
          <p className="muted">{label(period, anchor)}</p>
        </div>
        <div className="row wrap">
          <div className="seg">
            {(["day", "week", "month", "year", "all"] as Period[]).map((p) => (
              <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>
                {p === "all" ? "All" : p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {period !== "all" && (
            <>
              <button className="btn ghost" onClick={() => setAnchor(shift(period, anchor, -1))}>
                ←
              </button>
              <button className="btn ghost" onClick={() => setAnchor(todayStr())}>
                Now
              </button>
              <button className="btn ghost" onClick={() => setAnchor(shift(period, anchor, 1))}>
                →
              </button>
            </>
          )}
        </div>
      </header>

      <div className="search-bar">
        <span>🔍</span>
        <input type="text" placeholder="Search projects, notes or tags… e.g. Zen Media House" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button className="btn ghost small" onClick={() => setQuery("")}>
            ✕
          </button>
        )}
      </div>

      {query.trim() ? (
        <SearchResults query={query.trim()} entries={entries} tagMap={tagMap} onEdit={setEditEntry} />
      ) : (
        <>
      <div className="grid-3">
        <div className="card stat">
          <div className="stat-num">{fmtHours(total)}</div>
          <div className="muted small">
            logged{totalDelta != null && <span className={totalDelta >= 0 ? "up" : "down"}> {totalDelta >= 0 ? "▲" : "▼"} {Math.abs(totalDelta)}%</span>}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-num">{fmtHours(total / daysElapsed)}</div>
          <div className="muted small">per day</div>
        </div>
        <div className="card stat">
          <div className="stat-num">{inRange.length}</div>
          <div className="muted small">entries</div>
        </div>
      </div>

      <section className="card">
        <h2>Over time</h2>
        <div className="bars stacked">
          {bucketData.map((b) => (
            <div key={b.key} className="bar-col" title={`${b.key}: ${fmtHours(b.total)}`}>
              <div className="bar-val">{b.total ? fmtHours(b.total) : ""}</div>
              <div className="bar-stack" style={{ height: `${(b.total / maxBucket) * 100}%` }}>
                {[...b.byTag.entries()].map(([tid, m]) => (
                  <div key={tid} style={{ flex: m, background: tagMap.get(tid)?.color ?? "#94a3b8" }} />
                ))}
              </div>
              <div className="bar-day">{b.label}</div>
            </div>
          ))}
        </div>
      </section>

      {total > 0 && (
        <section className="card">
          <h2>By life area</h2>
          <div className="stackbar">
            {AREAS.filter((a) => byArea.get(a)).map((a) => (
              <div key={a} style={{ flex: byArea.get(a), background: AREA_INFO[a].color }} title={`${AREA_INFO[a].label}: ${fmtHours(byArea.get(a)!)}`} />
            ))}
          </div>
          <div className="area-chips">
            {AREAS.filter((a) => byArea.get(a))
              .sort((a, b) => byArea.get(b)! - byArea.get(a)!)
              .map((a) => (
                <span key={a} className="area-chip" style={{ background: `${AREA_INFO[a].color}22` }}>
                  {AREA_INFO[a].emoji} {AREA_INFO[a].label} · {fmtHours(byArea.get(a)!)} ({Math.round((byArea.get(a)! / total) * 100)}%)
                </span>
              ))}
          </div>
        </section>
      )}

      {(() => {
        const byProject = new Map<string, number>();
        for (const e of inRange) if (e.project?.trim()) byProject.set(e.project.trim(), (byProject.get(e.project.trim()) ?? 0) + entryMins(e));
        const top = [...byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (!top.length) return null;
        return (
          <section className="card">
            <h2>Top projects</h2>
            {top.map(([p, m]) => (
              <div key={p} className="did-row" onClick={() => setQuery(p)}>
                <span className="did-emoji">🗂️</span>
                <div className="grow">
                  <div className="row between">
                    <span>{p}</span>
                    <b>{fmtHours(m)}</b>
                  </div>
                  <div className="bar thin">
                    <div style={{ width: `${(m / top[0][1]) * 100}%`, background: "var(--accent)" }} />
                  </div>
                </div>
              </div>
            ))}
          </section>
        );
      })()}

      <section className="card">
        <div className="card-head">
          <h2>By tag</h2>
          <div className="row">
            <label className="row small muted">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> archived
            </label>
            <button className="btn primary small" onClick={() => setEditing({ id: uid(), u: 0, name: "", emoji: "⭐", color: PALETTE[allTags.length % PALETTE.length], area: "work", weeklyTargetMins: 0, archived: false })}>
              + New tag
            </button>
          </div>
        </div>
        {!entries.length && <Empty>Nothing logged yet. Start a timer on Today, or tap a tag on the Calendar.</Empty>}
        <ul className="list">
          {rows.map((t) => {
            const m = byTag.get(t.id) ?? 0;
            const d = pct(m, prevByTag.get(t.id) ?? 0);
            const target = period === "week" && t.weeklyTargetMins ? t.weeklyTargetMins : 0;
            return (
              <li key={t.id} className="did-row" onClick={() => setDetail(t)}>
                <span className="did-emoji" style={{ background: `${t.color}22` }}>
                  {t.emoji}
                </span>
                <div className="grow">
                  <div className="row between">
                    <span className={t.archived ? "muted" : ""}>{t.name}</span>
                    <span>
                      <b>{fmtHours(m)}</b>
                      {d != null && m > 0 && <span className={`tiny ${d >= 0 ? "up" : "down"}`}> {d >= 0 ? "▲" : "▼"}{Math.abs(d)}%</span>}
                    </span>
                  </div>
                  <div className="bar thin">
                    <div style={{ width: `${target ? Math.min(100, (m / target) * 100) : total ? (m / total) * 100 : 0}%`, background: t.color }} />
                  </div>
                  <div className="muted tiny">{target ? `${fmtHours(m)} / ${fmtHours(target)} weekly target` : total ? `${Math.round((m / total) * 100)}% of logged time` : ""}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

        </>
      )}

      {editEntry && <EntryEditor entry={editEntry} isNew={false} onClose={() => setEditEntry(null)} />}
      {detail && <TagDetail tag={tagMap.get(detail.id) ?? detail} entries={entries.filter((e) => e.tagId === detail.id)} onEditEntry={setEditEntry} onClose={() => setDetail(null)} onEdit={() => { setEditing(tagMap.get(detail.id) ?? detail); setDetail(null); }} />}
      {editing && <TagEditor tag={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TagDetail({ tag, entries, onClose, onEdit, onEditEntry }: { tag: Tag; entries: Entry[]; onClose: () => void; onEdit: () => void; onEditEntry: (e: Entry) => void }) {
  const today = todayStr();
  const sum = (f: string, t: string) => entries.filter((e) => e.date >= f && e.date <= t).reduce((n, e) => n + entryMins(e), 0);
  const perDay = new Map<string, number>();
  for (const e of entries) perDay.set(e.date, (perDay.get(e.date) ?? 0) + entryMins(e));
  const all = [...perDay.values()].reduce((a, b) => a + b, 0);
  const days = [...perDay.keys()].sort();
  let longest = 0;
  let run = 0;
  let prev = "";
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  for (let d = perDay.has(today) ? today : addDays(today, -1); perDay.has(d); d = addDays(d, -1)) current++;
  const best = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const last30 = dateRange(addDays(today, -29), today);
  const max30 = Math.max(30, ...last30.map((d) => perDay.get(d) ?? 0));
  // GitHub-style heatmap of the last 53 weeks.
  const heatStart = addDays(weekStart(today), -52 * 7);
  const heatDays = dateRange(heatStart, addDays(weekStart(today), 6));
  const maxDay = Math.max(30, ...perDay.values());
  const level = (m: number) => (m <= 0 ? 0 : m < maxDay * 0.25 ? 1 : m < maxDay * 0.5 ? 2 : m < maxDay * 0.75 ? 3 : 4);
  const [showAll, setShowAll] = useState(false);
  const sorted = [...entries].sort((a, b) => (b.date + fmtTime(b.start)).localeCompare(a.date + fmtTime(a.start)));
  const recent = showAll ? sorted : sorted.slice(0, 15);
  const byProject = new Map<string, number>();
  for (const e of entries) {
    const p = e.project?.trim() || "(no project)";
    byProject.set(p, (byProject.get(p) ?? 0) + entryMins(e));
  }
  const projectRows = [...byProject.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Modal title={`${tag.emoji} ${tag.name}`} onClose={onClose}>
      <div className="muted small">
        {AREA_INFO[tag.area].emoji} {AREA_INFO[tag.area].label}
        {days[0] && ` · since ${fmtDay(days[0], { day: "numeric", month: "short", year: "numeric" })}`}
      </div>
      <div className="mini-stats">
        {[
          ["Today", sum(today, today)],
          ["This week", sum(weekStart(today), today)],
          ["This month", sum(monthStart(today), today)],
          ["This year", sum(yearStart(today), today)],
          ["All time", all],
        ].map(([l, m]) => (
          <div key={l as string}>
            <b>{fmtHours(m as number)}</b>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <div className="mini-stats">
        <div>
          <b>{days.length}</b>
          <span>active days</span>
        </div>
        <div>
          <b>{current}🔥</b>
          <span>day streak</span>
        </div>
        <div>
          <b>{longest}</b>
          <span>best streak</span>
        </div>
        <div>
          <b>{entries.length ? fmtHours(all / entries.length) : "–"}</b>
          <span>avg session</span>
        </div>
        <div>
          <b>{best ? fmtHours(best[1]) : "–"}</b>
          <span>{best ? `best day ${fmtDay(best[0], { day: "numeric", month: "short" })}` : "best day"}</span>
        </div>
      </div>
      <h3>Last 30 days</h3>
      <div className="bars small-bars">
        {last30.map((d) => (
          <div key={d} className="bar-col" title={`${d}: ${fmtHours(perDay.get(d) ?? 0)}`}>
            <div className="bar-fill" style={{ height: `${((perDay.get(d) ?? 0) / max30) * 100}%`, background: tag.color }} />
          </div>
        ))}
      </div>
      <h3>Last 12 months</h3>
      <div className="heatmap">
        {heatDays.map((d) => (
          <div key={d} className={`heat l${level(perDay.get(d) ?? 0)}`} style={{ ["--c" as string]: tag.color }} title={`${d}: ${fmtHours(perDay.get(d) ?? 0)}`} />
        ))}
      </div>
      {projectRows.length > 1 || (projectRows[0] && projectRows[0][0] !== "(no project)") ? (
        <>
          <h3>By project (all time)</h3>
          {projectRows.map(([p, m]) => (
            <div key={p} className="row between small">
              <span className={p === "(no project)" ? "muted" : ""}>{p}</span>
              <b>{fmtHours(m)}</b>
            </div>
          ))}
        </>
      ) : null}
      <h3>{showAll ? `All ${sorted.length} entries` : "Recent"} · tap to edit</h3>
      {!recent.length && <Empty>No entries yet.</Empty>}
      <ul className="list">
        {recent.map((e) => (
          <EntryRow key={e.id} e={e} onClick={() => onEditEntry(e)} />
        ))}
      </ul>
      {sorted.length > 15 && (
        <button className="btn ghost small" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show less" : `Show all ${sorted.length}`}
        </button>
      )}
      <div>
        <button className="btn" onClick={onEdit}>
          Edit tag
        </button>
      </div>
    </Modal>
  );
}

const EMOJIS = ["🎯", "📚", "🏋️", "📖", "❤️", "🧹", "🎮", "📱", "🚗", "🧘", "💻", "✍️", "🎨", "🎵", "🍳", "🛒", "💼", "📞", "🙏", "😴", "🚶", "🏃", "⚽", "📺", "🧠", "💰", "🌱", "⭐"];

function TagEditor({ tag, onClose }: { tag: Tag; onClose: () => void }) {
  const { put, data } = useStore();
  const [t, setT] = useState(tag);
  const isNew = !data.tags[tag.id] || data.tags[tag.id].del;
  return (
    <Modal title={isNew ? "New tag" : "Edit tag"} onClose={onClose}>
      <label>
        Name
        <input autoFocus value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="e.g. Guitar practice" />
      </label>
      <div className="emoji-pick">
        {EMOJIS.map((e) => (
          <button key={e} className={t.emoji === e ? "on" : ""} onClick={() => setT({ ...t, emoji: e })}>
            {e}
          </button>
        ))}
        <input className="emoji-input" value={t.emoji} onChange={(e) => setT({ ...t, emoji: e.target.value.slice(0, 4) })} title="Type any emoji" />
      </div>
      <div className="row wrap">
        <label className="grow">
          Life area
          <select value={t.area} onChange={(e) => setT({ ...t, area: e.target.value as Area })}>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_INFO[a].emoji} {AREA_INFO[a].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weekly target (hours)
          <input type="number" min={0} step={0.5} value={t.weeklyTargetMins / 60 || ""} placeholder="none" onChange={(e) => setT({ ...t, weeklyTargetMins: Math.round(Number(e.target.value) * 60) || 0 })} />
        </label>
        <label>
          Colour
          <input type="color" value={t.color} onChange={(e) => setT({ ...t, color: e.target.value })} />
        </label>
      </div>
      <div className="row between">
        <button className="btn primary" disabled={!t.name.trim()} onClick={() => { put("tags", { ...t, name: t.name.trim() }); onClose(); }}>
          Save
        </button>
        {!isNew && (
          <button className="btn ghost" onClick={() => { put("tags", { ...t, archived: !t.archived }); onClose(); }}>
            {t.archived ? "Unarchive" : "Archive (keeps history)"}
          </button>
        )}
      </div>
    </Modal>
  );
}

function EntryRow({ e, onClick, tag }: { e: Entry; onClick: () => void; tag?: Tag }) {
  return (
    <li className="entry-row" onClick={onClick}>
      <span className="muted tiny entry-when">
        {fmtDay(e.date, { day: "numeric", month: "short", year: "2-digit" })}
        <br />
        {fmtTime(e.start)}–{fmtTime(e.end)}
      </span>
      <span className="grow">
        {tag && (
          <span style={{ color: tag.color }}>
            {tag.emoji} {tag.name}
            {e.project || e.note ? " · " : ""}
          </span>
        )}
        {e.project && <b>{e.project}</b>}
        {e.note && <span className="muted"> {e.project ? "· " : ""}{e.note}</span>}
      </span>
      <b>{fmtHours(entryMins(e))}</b>
    </li>
  );
}

function SearchResults({ query, entries, tagMap, onEdit }: { query: string; entries: Entry[]; tagMap: Map<string, Tag>; onEdit: (e: Entry) => void }) {
  const [showAll, setShowAll] = useState(false);
  const q = query.toLowerCase();
  const hits = entries
    .filter((e) => (e.project ?? "").toLowerCase().includes(q) || e.note.toLowerCase().includes(q) || (tagMap.get(e.tagId)?.name ?? "").toLowerCase().includes(q))
    .sort((a, b) => (b.date + fmtTime(b.start)).localeCompare(a.date + fmtTime(a.start)));
  const today = todayStr();
  const sum = (f: string, t: string) => hits.filter((e) => e.date >= f && e.date <= t).reduce((n, e) => n + entryMins(e), 0);
  const all = hits.reduce((n, e) => n + entryMins(e), 0);
  const byTag = sumBy(hits);
  const byProject = new Map<string, number>();
  for (const e of hits) {
    const p = e.project?.trim() || "(no project)";
    byProject.set(p, (byProject.get(p) ?? 0) + entryMins(e));
  }
  const days = new Set(hits.map((e) => e.date));
  const first = hits[hits.length - 1]?.date;
  // Monthly chart: last 12 months.
  const months: string[] = [];
  for (let m = addMonths(today, -11); m <= today; m = addMonths(m, 1)) months.push(m);
  const perMonth = months.map((m) => ({ m, mins: sum(monthStart(m), monthEnd(m)) }));
  const maxM = Math.max(60, ...perMonth.map((x) => x.mins));
  const shown = showAll ? hits : hits.slice(0, 30);

  if (!hits.length) return <section className="card"><Empty>Nothing found for “{query}”. Search looks in projects, notes and tag names.</Empty></section>;
  return (
    <>
      <section className="card search-summary">
        <h2>
          “{query}” · {fmtHours(all)} total
        </h2>
        <p className="muted small">
          {hits.length} {hits.length === 1 ? "entry" : "entries"} on {days.size} {days.size === 1 ? "day" : "days"}{first ? ` · since ${fmtDay(first, { day: "numeric", month: "short", year: "numeric" })}` : ""} · avg {fmtHours(all / Math.max(1, hits.length))} per session
        </p>
        <div className="mini-stats">
          {[
            ["Today", sum(today, today)],
            ["This week", sum(weekStart(today), today)],
            ["This month", sum(monthStart(today), today)],
            ["This year", sum(yearStart(today), today)],
            ["All time", all],
          ].map(([l, m]) => (
            <div key={l as string}>
              <b>{fmtHours(m as number)}</b>
              <span>{l}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="grid-2">
        <section className="card">
          <h2>Last 12 months</h2>
          <div className="bars">
            {perMonth.map(({ m, mins }) => (
              <div key={m} className="bar-col" title={`${m.slice(0, 7)}: ${fmtHours(mins)}`}>
                <div className="bar-val">{mins ? fmtHours(mins) : ""}</div>
                <div className="bar-fill" style={{ height: `${(mins / maxM) * 100}%` }} />
                <div className="bar-day">{fmtDay(m, { month: "narrow" })}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>Breakdown</h2>
          <h3>By tag</h3>
          {[...byTag.entries()].sort((a, b) => b[1] - a[1]).map(([t, m]) => (
            <div key={t} className="row between small">
              <span>
                {tagMap.get(t)?.emoji} {tagMap.get(t)?.name}
              </span>
              <b>{fmtHours(m)}</b>
            </div>
          ))}
          <h3>By project</h3>
          {[...byProject.entries()].sort((a, b) => b[1] - a[1]).map(([p, m]) => (
            <div key={p} className="row between small">
              <span className={p === "(no project)" ? "muted" : ""}>{p}</span>
              <b>{fmtHours(m)}</b>
            </div>
          ))}
        </section>
      </div>
      <section className="card">
        <h2>Every entry · tap to edit</h2>
        <ul className="list">
          {shown.map((e) => (
            <EntryRow key={e.id} e={e} tag={tagMap.get(e.tagId)} onClick={() => onEdit(e)} />
          ))}
        </ul>
        {hits.length > 30 && (
          <button className="btn ghost small" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show less" : `Show all ${hits.length}`}
          </button>
        )}
      </section>
    </>
  );
}
