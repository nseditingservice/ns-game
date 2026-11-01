import { useMemo, useState } from "react";
import { useList, useStore } from "../store";
import type { Entry } from "../types";
import { fmtTime, parseTime } from "../dates";
import { Modal } from "../ui";

/** Distinct projects you've used, most recent first (for autocomplete). */
export function useProjects(tagId?: string) {
  const entries = useList("entries");
  return useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of entries) {
      const p = e.project?.trim();
      if (!p || (tagId && e.tagId !== tagId)) continue;
      seen.set(p, Math.max(seen.get(p) ?? 0, e.u));
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  }, [entries, tagId]);
}

export function ProjectInput({ value, onChange, tagId, placeholder = "e.g. Zen Media House" }: { value: string; onChange: (v: string) => void; tagId?: string; placeholder?: string }) {
  const forTag = useProjects(tagId);
  const all = useProjects();
  const options = [...new Set([...forTag, ...all])].slice(0, 50);
  const listId = useMemo(() => `projects-${Math.random().toString(36).slice(2)}`, []);
  return (
    <>
      <input list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id={listId}>
        {options.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {!value && forTag.length > 0 && (
        <div className="chip-row">
          {forTag.slice(0, 6).map((p) => (
            <button key={p} type="button" className="mini-chip" onClick={() => onChange(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function TimeFields({ date, start, end, onChange }: { date: string; start: number; end: number; onChange: (p: { date?: string; start?: number; end?: number }) => void }) {
  return (
    <div className="row wrap">
      <label className="grow">
        Date
        <input type="date" value={date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} />
      </label>
      <label>
        From
        <input type="time" step={300} value={fmtTime(start)} onChange={(e) => e.target.value && onChange({ start: parseTime(e.target.value) })} />
      </label>
      <label>
        To
        <input type="time" step={300} value={end >= 24 * 60 ? "23:59" : fmtTime(end)} onChange={(e) => e.target.value && onChange({ end: e.target.value === "23:59" ? 24 * 60 : parseTime(e.target.value) })} />
      </label>
    </div>
  );
}

export function EntryEditor({ entry, isNew, onClose }: { entry: Entry; isNew: boolean; onClose: () => void }) {
  const { put, del } = useStore();
  const tags = useList("tags").filter((t) => !t.archived || t.id === entry.tagId);
  const [e, setE] = useState<Entry>({ ...entry, project: entry.project ?? "" });
  const tagWasted = !!tags.find((t) => t.id === e.tagId)?.wasted;
  const wasted = e.wasted ?? tagWasted;
  const valid = e.end > e.start;
  return (
    <Modal title={isNew ? "Log what I did" : "Edit log"} onClose={onClose}>
      <div className="tag-pick">
        {tags.map((t) => (
          <button key={t.id} className={`tag-chip ${e.tagId === t.id ? "armed" : ""}`} style={{ borderLeftColor: t.color }} onClick={() => setE({ ...e, tagId: t.id })}>
            {t.emoji} {t.name}
          </button>
        ))}
      </div>
      <label>
        Project / client / topic
        <ProjectInput value={e.project ?? ""} onChange={(project) => setE({ ...e, project })} tagId={e.tagId} />
      </label>
      <label>
        What exactly did you do?
        <input value={e.note} onChange={(ev) => setE({ ...e, note: ev.target.value })} placeholder="e.g. Video editing for client reel" />
      </label>
      <TimeFields date={e.date} start={e.start} end={e.end} onChange={(p) => setE({ ...e, ...p })} />
      <label className="row said-no">
        <input type="checkbox" checked={wasted} onChange={(ev) => setE({ ...e, wasted: ev.target.checked === tagWasted ? undefined : ev.target.checked })} />
        🚫 I could have said NO (count as wasted time)
      </label>
      {!valid && <p className="error small">End time must be after start time. For work past midnight, log the part after 00:00 on the next day.</p>}
      <div className="row between">
        <button className="btn primary" disabled={!valid} onClick={() => { put("entries", { ...e, project: e.project?.trim() || undefined }); onClose(); }}>
          Save
        </button>
        {!isNew && (
          <button className="btn ghost danger" onClick={() => { del("entries", e.id); onClose(); }}>
            Delete
          </button>
        )}
      </div>
    </Modal>
  );
}
