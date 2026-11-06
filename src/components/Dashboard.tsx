import { useEffect, useRef, useState } from "react";
import { useList, useStore } from "../store";
import type { PillarDef } from "../types";
import { useIndex } from "../game";
import { fmtVal, questState } from "../quest";
import { Modal } from "../ui";
import { DASH_CARDS, DEFAULT_PILLARS, dashLayout, pillarsOf } from "../v2";

/** Progress of one pillar: 0–1 plus a hover hint (the bar itself shows no numbers). */
export function usePillarValue() {
  const ix = useIndex();
  const workouts = useList("workouts");
  const goals = useList("goals");
  const goalLogs = useList("goalLogs");
  const tasks = useList("tasks");
  const urges = useList("urges");
  return (p: PillarDef): { frac: number; hint: string } => {
    const target = Math.max(1, p.target ?? 1);
    if (p.source === "quest") {
      const g = goals.find((x) => x.id === p.questId) ?? goals.find((x) => !x.done);
      if (!g) return { frac: 0, hint: "Link a quest" };
      const st = questState(g, goalLogs, tasks);
      const v = (n: number) => (st.kind === "tasks" ? `${Math.round(n)}` : fmtVal(n, st.unit));
      return { frac: st.frac, hint: `${g.title}: ${v(st.current)} / ${v(st.target)}` };
    }
    if (p.source === "money") {
      const cur = p.current ?? 0;
      return { frac: cur / target, hint: `${fmtVal(cur, "$")} / ${fmtVal(target, "$")}` };
    }
    const from = p.start ?? "0000";
    if (p.source === "body") {
      const n = workouts.filter((w) => w.date >= from).length;
      return { frac: n / target, hint: `${n} / ${target} workouts since ${from}` };
    }
    const learned = [...ix.journal.values()].filter((j) => j.date >= from && j.learned?.trim()).length;
    const surfed = urges.filter((u) => u.date >= from && u.kind === "urge" && u.outcome === "surfed").length;
    return { frac: (learned + surfed) / target, hint: `${learned} things learned + ${surfed} urges surfed = ${learned + surfed} / ${target} since ${from}` };
  };
}

/** Three thin bars: Body / Wealth / Mind. Just bars. Tap one to edit it. */
export function PillarsBar() {
  const { prefs } = useStore();
  const value = usePillarValue();
  const [edit, setEdit] = useState<number | null>(null);
  const pillars = pillarsOf(prefs);
  return (
    <div className="pillars">
      {pillars.map((p, i) => {
        const v = value(p);
        return (
          <button key={p.id} className="pillar" title={v.hint} onClick={() => setEdit(i)}>
            <span className="pillar-name">
              {p.emoji} {p.label}
            </span>
            <div className="bar thin">
              <div style={{ width: `${Math.min(100, Math.max(0, v.frac) * 100)}%`, background: p.color }} />
            </div>
          </button>
        );
      })}
      {edit != null && (
        <Modal title={`${pillars[edit].emoji} ${pillars[edit].label}`} onClose={() => setEdit(null)}>
          <PillarFields i={edit} />
          <button className="btn primary" onClick={() => setEdit(null)}>
            Done
          </button>
        </Modal>
      )}
    </div>
  );
}

/** Everything about one pillar, editable. */
function PillarFields({ i }: { i: number }) {
  const { prefs, setPrefs } = useStore();
  const goals = useList("goals");
  const value = usePillarValue();
  const pillars = pillarsOf(prefs);
  const p = pillars[i];
  const set = (patch: Partial<PillarDef>) => setPrefs({ pillars: pillars.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const num = (v: string) => (v === "" ? undefined : Math.max(0, Number(v)));
  return (
    <div className="pillar-edit">
      <div className="row wrap">
        <input className="emoji-input" value={p.emoji} onChange={(e) => set({ emoji: e.target.value.slice(0, 4) })} />
        <input value={p.label} onChange={(e) => set({ label: e.target.value })} style={{ width: 120 }} />
        <input type="color" value={p.color} onChange={(e) => set({ color: e.target.value })} title="Bar colour" />
        <select
          value={p.source === "quest" ? `q:${p.questId ?? ""}` : p.source}
          onChange={(e) => {
            const v = e.target.value;
            set(v.startsWith("q:") ? { source: "quest", questId: v.slice(2) || undefined } : { source: v as PillarDef["source"], questId: undefined });
          }}
        >
          <option value="body">Counts workouts</option>
          <option value="mind">Counts things learned + urges surfed</option>
          <option value="money">Money: amount I have ($)</option>
          <option value="q:">Follows a quest (first open one)</option>
          {goals.map((g) => (
            <option key={g.id} value={`q:${g.id}`}>
              Follows quest: {g.title}
            </option>
          ))}
        </select>
      </div>
      {p.source !== "quest" && (
        <div className="row wrap">
          {p.source === "money" && (
            <label>
              I have now ($)
              <input type="number" min={0} value={p.current ?? ""} onChange={(e) => set({ current: num(e.target.value) })} style={{ width: 140 }} />
            </label>
          )}
          <label>
            Goal {p.source === "money" ? "($)" : p.source === "body" ? "(workouts)" : "(learnings + urges)"}
            <input type="number" min={1} value={p.target ?? ""} onChange={(e) => set({ target: num(e.target.value) })} style={{ width: 140 }} />
          </label>
          {(p.source === "body" || p.source === "mind") && (
            <label>
              Count from
              <input type="date" value={p.start ?? ""} onChange={(e) => e.target.value && set({ start: e.target.value })} />
            </label>
          )}
        </div>
      )}
      <p className="muted tiny">{value(p).hint}</p>
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
      <h3>Pillars (the 3 bars in the level card)</h3>
      {pillars.map((p, i) => (
        <PillarFields key={p.id} i={i} />
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


