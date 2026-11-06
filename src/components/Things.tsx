import { useMemo, useState } from "react";
import { PALETTE, uid, useList, useStore } from "../store";
import type { Thing } from "../types";
import { fmtHours } from "../dates";
import { entryMins } from "../game";
import { Modal } from "../ui";
import { thingKey, useRenameThing, useThings } from "../v2";

const ICONS = ["🎬", "💼", "📈", "🏋️", "🥊", "📚", "🧠", "🧘", "💻", "🎨", "✍️", "🎮", "🏠", "❤️", "🌍", "⭐", "🚫", "🚪", "📣", "🎥", "💰", "🛠️", "📞", "✈️"];

/** Edit every Thing (what used to be called a project): icon, colour, name, Top 4, archive. */
export function ThingsEditor({ onClose }: { onClose: () => void }) {
  const entries = useList("entries");
  const tasks = useList("tasks");
  const things = useThings();
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; mins: number }>();
    for (const e of entries) {
      if (!e.project?.trim()) continue;
      const k = thingKey(e.project);
      const cur = m.get(k) ?? { name: e.project.trim(), mins: 0 };
      cur.mins += entryMins(e);
      m.set(k, cur);
    }
    for (const t of tasks) if (t.project?.trim() && !m.has(thingKey(t.project))) m.set(thingKey(t.project), { name: t.project.trim(), mins: 0 });
    for (const t of things.values()) if (!m.has(thingKey(t.name))) m.set(thingKey(t.name), { name: t.name, mins: 0 });
    return [...m.entries()].sort((a, b) => b[1].mins - a[1].mins);
  }, [entries, tasks, things]);

  return (
    <Modal title="✎ Edit Things" onClose={onClose}>
      <p className="muted small">A Thing is what you worked on: a client, a business, a skill. Give each one an icon and colour. Renaming updates all its past entries and tasks.</p>
      {!rows.length && <p className="muted">No Things yet. Type one in the "Thing" field when you log time or create a task.</p>}
      {rows.map(([k, r]) => (
        <ThingRow key={k} name={r.name} mins={r.mins} meta={things.get(k)} />
      ))}
      <button className="btn primary" onClick={onClose}>
        Done
      </button>
    </Modal>
  );
}

function ThingRow({ name, mins, meta }: { name: string; mins: number; meta?: Thing }) {
  const { put, prefs, setPrefs } = useStore();
  const rename = useRenameThing();
  const [text, setText] = useState(name);
  const [picking, setPicking] = useState(false);
  const t: Thing = meta ?? { id: uid(), u: 0, name, emoji: "🗂️", color: PALETTE[name.length % PALETTE.length] };
  const save = (patch: Partial<Thing>) => put("things", { ...t, ...patch });
  const hidden = (prefs.top4Hidden ?? []).map(thingKey).includes(thingKey(name));
  const commitName = () => {
    const nt = text.trim();
    if (!nt || nt === name) return setText(name);
    if (!confirm(`Rename “${name}” to “${nt}” everywhere (all its time entries and tasks)?`)) return setText(name);
    rename(name, nt);
    save({ name: nt });
    if (hidden) setPrefs({ top4Hidden: [...(prefs.top4Hidden ?? []).filter((x) => thingKey(x) !== thingKey(name)), nt] });
  };
  return (
    <div className={`thing-row ${t.archived ? "archived" : ""}`}>
      <div className="row">
        <button className="thing-icon" style={{ borderColor: t.color }} onClick={() => setPicking(!picking)} title="Change icon">
          {t.emoji}
        </button>
        <input className="grow" value={text} onChange={(e) => setText(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <input type="color" value={t.color} onChange={(e) => save({ color: e.target.value })} title="Colour" />
        <span className="muted tiny" style={{ minWidth: 40, textAlign: "right" }}>
          {mins ? fmtHours(mins) : ""}
        </span>
      </div>
      {picking && (
        <div className="icon-grid">
          {ICONS.map((ic) => (
            <button key={ic} className={ic === t.emoji ? "sel" : ""} onClick={() => { save({ emoji: ic }); setPicking(false); }}>
              {ic}
            </button>
          ))}
          <input className="emoji-input" placeholder="any" onChange={(e) => e.target.value.trim() && save({ emoji: e.target.value.trim().slice(0, 4) })} />
        </div>
      )}
      <div className="row wrap small muted">
        <label className="row">
          <input type="checkbox" checked={hidden} onChange={(e) => setPrefs({ top4Hidden: e.target.checked ? [...(prefs.top4Hidden ?? []), name] : (prefs.top4Hidden ?? []).filter((x) => thingKey(x) !== thingKey(name)) })} />
          hide from Top 4
        </label>
        <label className="row">
          <input type="checkbox" checked={!!t.archived} onChange={(e) => save({ archived: e.target.checked })} />
          archived (hidden from suggestions)
        </label>
      </div>
    </div>
  );
}
