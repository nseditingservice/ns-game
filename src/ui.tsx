import { useEffect, useState, type ReactNode } from "react";
import { uid, useStore } from "./store";
import type { Entry, Tag } from "./types";
import { addDays, toDateStr } from "./dates";
import { elapsedMs, newTimer } from "./focus";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card form" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Celebration toasts (Tiny Habits: celebrate immediately) ----
type Toast = { id: number; text: string; emoji: string };
const listeners = new Set<(t: Toast) => void>();
export function celebrate(text: string, emoji = "✨") {
  const t = { id: Date.now() + Math.random(), text, emoji };
  listeners.forEach((l) => l(t));
  navigator.vibrate?.(30);
}
export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const l = (t: Toast) => {
      setToasts((x) => [...x, t]);
      setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 2200);
    };
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-emoji">{t.emoji}</span> {t.text}
        </div>
      ))}
    </div>
  );
}

export function Rating({ value, onChange, max = 5, labels }: { value: number | null; onChange: (v: number | null) => void; max?: number; labels?: string[] }) {
  return (
    <div className="rating">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" className={`rate ${value === n ? "on" : ""}`} onClick={() => onChange(value === n ? null : n)} title={labels?.[n - 1]}>
          {labels ? labels[n - 1] : n}
        </button>
      ))}
    </div>
  );
}

export function TagBadge({ tag }: { tag?: Tag }) {
  if (!tag) return <span className="tag-badge muted">?</span>;
  return (
    <span className="tag-badge" style={{ background: `${tag.color}22`, color: tag.color }}>
      {tag.emoji} {tag.name}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

/** Split a time span into per-day entries (handles timers running past midnight). */
export function spanToEntries(startMs: number, endMs: number, base: Omit<Entry, "id" | "u" | "date" | "start" | "end">): Omit<Entry, "u">[] {
  const out: Omit<Entry, "u">[] = [];
  const s = new Date(startMs);
  let date = toDateStr(s);
  let start = s.getHours() * 60 + s.getMinutes();
  let remaining = Math.round((endMs - startMs) / 60000);
  while (remaining > 0) {
    const end = Math.min(start + remaining, 24 * 60);
    out.push({ ...base, id: uid(), date, start, end });
    remaining -= end - start;
    date = addDays(date, 1);
    start = 0;
  }
  return out;
}

export function useTimerActions() {
  const { put, putMany, timer, data } = useStore();
  return {
    start: (opts: { label: string; tagId: string | null; taskId?: string | null; plannedMins: number | null; project?: string }) => put("meta", { ...newTimer(opts), project: opts.project }),
    pause: () => {
      if (!timer) return;
      put("meta", timer.pausedAt ? { ...timer, pausedMs: timer.pausedMs + Date.now() - timer.pausedAt, pausedAt: null } : { ...timer, pausedAt: Date.now() });
    },
    discard: () => timer && put("meta", { ...timer, running: false }),
    /** Stop and log what you did. Returns minutes logged. */
    stop: (opts: { note?: string; taskDone?: boolean; tagId?: string | null } = {}) => {
      if (!timer) return 0;
      const mins = Math.round(elapsedMs(timer, Date.now()) / 60000);
      const tagId = opts.tagId ?? timer.tagId;
      put("meta", { ...timer, running: false });
      if (mins >= 1 && tagId) {
        const endMs = Date.now();
        // Log as a contiguous block ending now (pauses are excluded).
        putMany("entries", spanToEntries(endMs - mins * 60000, endMs, { tagId, note: opts.note ?? (timer.label !== data.tags[tagId]?.name ? timer.label : ""), taskId: timer.taskId, source: timer.plannedMins ? "focus" : "timer", project: timer.project?.trim() || undefined }));
      }
      if (opts.taskDone && timer.taskId) {
        const t = data.tasks[timer.taskId];
        if (t) put("tasks", { ...t, done: true, doneAt: new Date().toISOString() });
      }
      return mins;
    },
  };
}
