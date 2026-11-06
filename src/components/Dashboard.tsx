import { useEffect, useRef, useState } from "react";
import { useList, useStore } from "../store";
import type { PillarDef } from "../types";
import { dateRange, todayStr, weekStart } from "../dates";
import { habitStatus, isScheduled, useIndex } from "../game";
import { fmtVal, questState } from "../quest";
import { Modal } from "../ui";
import { DASH_CARDS, DEFAULT_PILLARS, dashLayout, pillarsOf, trainingWeek } from "../v2";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Three thin bars: Body / Wealth / Mind (all editable in Customize). */
export function PillarsBar() {
  const { prefs } = useStore();
  const ix = useIndex();
  const workouts = useList("workouts");
  const goals = useList("goals");
  const goalLogs = useList("goalLogs");
  const tasks = useList("tasks");
  const urges = useList("urges");
  const today = todayStr();
  const wk = weekStart(today);

  const value = (p: PillarDef): { frac: number | null; text: string } => {
    if (p.source === "quest") {
      const g = goals.find((x) => x.id === p.questId) ?? goals.find((x) => !x.done && x.metric && ["$", "USD"].includes(x.metric.unit)) ?? goals.find((x) => !x.done);
      if (!g) return { frac: null, text: "add a quest" };
      const st = questState(g, goalLogs, tasks);
      const v = (n: number) => (st.kind === "tasks" ? `${Math.round(n)}` : fmtVal(n, st.unit));
      return { frac: st.frac, text: `${v(st.current)} / ${v(st.target)}` };
    }
    const days = dateRange(wk, today);
    if (p.source === "body") {
      const tw = trainingWeek(workouts, prefs, wk);
      const target = (prefs.setsTarget ?? 10) * 3; // ~10 sets for 3 big groups = a solid week
      const training = Math.min(1, Math.max(tw.sets / target, tw.sessions / 4));
      const sleeps = days.map((d) => ix.health.get(d)?.sleepHours).filter((h): h is number => !!h);
      const sleep = sleeps.length ? Math.min(1, (mean(sleeps) ?? 0) / 7.5) : null;
      const f = mean([training, ...(sleep != null ? [sleep] : [])]);
      return { frac: f, text: f == null ? "–" : `${Math.round(f * 100)}%` };
    }
    // mind: mind & spirit habits done this week + share of urges surfed
    const parts: number[] = [];
    let due = 0;
    let done = 0;
    for (const h of ix.habits.filter((x) => x.area === "mind" || x.area === "spirit"))
      for (const d of days) {
        if (!isScheduled(h, d)) continue;
        const s = habitStatus(h, d, ix);
        if (s === "skip" || (s === "pending" && d === today)) continue;
        due++;
        if (s === "done") done++;
      }
    if (due) parts.push(done / due);
    const wUrges = urges.filter((u) => u.date >= wk && u.kind === "urge" && u.outcome);
    if (wUrges.length) parts.push(wUrges.filter((u) => u.outcome === "surfed").length / wUrges.length);
    const reacted = urges.filter((u) => u.date >= wk && u.kind === "reacted").length;
    let f = mean(parts);
    if (f != null && reacted) f = Math.max(0, f - 0.05 * reacted);
    return { frac: f, text: f == null ? "–" : `${Math.round(f * 100)}%` };
  };

  return (
    <div className="pillars">
      {pillarsOf(prefs).map((p) => {
        const v = value(p);
        return (
          <div key={p.id} className="pillar" title={p.source === "body" ? "This week: training (sets or sessions) + sleep" : p.source === "mind" ? "This week: mind & spirit habits + urges surfed" : "Linked quest"}>
            <div className="row between small">
              <span>
                {p.emoji} {p.label}
              </span>
              <b>{v.text}</b>
            </div>
            <div className="bar thin">
              <div style={{ width: `${Math.min(100, (v.frac ?? 0) * 100)}%`, background: p.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Vision board ----------

async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Could not read that image."));
      i.src = url;
    });
    let max = 1800;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", 0.82);
      // Stay well under the 1 MB cloud-sync limit per item.
      if (out.length < 750_000) return out;
      max = Math.round(max * 0.8);
    }
    throw new Error("Image is too large.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function VisionCard() {
  const { data, put, del } = useStore();
  const board = data.vision?.board && !data.vision.board.del ? data.vision.board : null;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = () => fileRef.current?.click();
  const onFile = async (f: File) => {
    setBusy(true);
    try {
      put("vision", { id: "board", image: await compress(f), title: board?.title ?? `Vision ${new Date().getFullYear()}` });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  return (
    <section className="card vision-card">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
      {board ? (
        <button className="vision-mini" onClick={() => setOpen(true)}>
          <img src={board.image} alt="Vision board" />
          <span className="grow">
            <b>🌌 {board.title || "Vision board"}</b>
            <span className="muted small">Tap to open</span>
          </span>
          <span className="muted">⤢</span>
        </button>
      ) : (
        <div className="row between">
          <span>
            <b>🌌 Vision board</b> <span className="muted small">· add your picture</span>
          </span>
          <button className="btn small primary" disabled={busy} onClick={pick}>
            {busy ? "Saving…" : "🖼 Add picture"}
          </button>
        </div>
      )}
      {open && board && (
        <div className="lightbox" onClick={() => setOpen(false)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={board.image} alt="Vision board" />
            <div className="row between wrap">
              <span className="row">
                <button className="btn" disabled={busy} onClick={pick}>
                  {busy ? "Saving…" : "🖼 Change picture"}
                </button>
                <input className="vision-title" value={board.title} placeholder="Title" onChange={(e) => put("vision", { ...board, title: e.target.value })} />
              </span>
              <span className="row">
                <button className="btn ghost danger small" onClick={() => { if (confirm("Remove the vision board picture?")) { del("vision", "board"); setOpen(false); } }}>
                  Remove
                </button>
                <button className="btn" onClick={() => setOpen(false)}>
                  ✕ Close
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- Customize ----------

export function CustomizeDash({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs } = useStore();
  const goals = useList("goals");
  const layout = dashLayout(prefs);
  const pillars = pillarsOf(prefs);
  const save = (next: typeof layout) => setPrefs({ dashCards: next });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= layout.length) return;
    const next = [...layout];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const setPillar = (i: number, patch: Partial<PillarDef>) => setPrefs({ pillars: pillars.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <Modal title="⚙ Customize dashboard" onClose={onClose}>
      <p className="muted small">Show, hide and reorder cards. Changes save instantly and sync to your other devices.</p>
      <ul className="list customize-list">
        {layout.map((c, i) => (
          <li key={c.id} className={`row between ${c.hidden ? "muted" : ""}`}>
            <label className="row grow">
              <input type="checkbox" checked={!c.hidden} onChange={(e) => save(layout.map((x) => (x.id === c.id ? { ...x, hidden: !e.target.checked } : x)))} />
              {DASH_CARDS.find((d) => d.id === c.id)?.label}
            </label>
            <span className="row">
              <button className="btn ghost small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ▲
              </button>
              <button className="btn ghost small" disabled={i === layout.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ▼
              </button>
            </span>
          </li>
        ))}
      </ul>
      <h3>Pillars (bars in the level card)</h3>
      {pillars.map((p, i) => (
        <div key={p.id} className="row wrap pillar-edit">
          <input className="emoji-input" value={p.emoji} onChange={(e) => setPillar(i, { emoji: e.target.value.slice(0, 4) })} />
          <input value={p.label} onChange={(e) => setPillar(i, { label: e.target.value })} style={{ width: 110 }} />
          <input type="color" value={p.color} onChange={(e) => setPillar(i, { color: e.target.value })} />
          <select value={p.source === "quest" ? `q:${p.questId ?? ""}` : p.source} onChange={(e) => { const v = e.target.value; setPillar(i, v.startsWith("q:") ? { source: "quest", questId: v.slice(2) || undefined } : { source: v as "body" | "mind", questId: undefined }); }}>
            <option value="body">Body: training + sleep (auto)</option>
            <option value="mind">Mind: mind habits + urges surfed (auto)</option>
            <option value="q:">Quest: first money quest (auto)</option>
            {goals.map((g) => (
              <option key={g.id} value={`q:${g.id}`}>
                Quest: {g.title}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div className="row between">
        <button className="btn ghost small" onClick={() => setPrefs({ dashCards: undefined, pillars: DEFAULT_PILLARS })}>
          Reset to default
        </button>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}


