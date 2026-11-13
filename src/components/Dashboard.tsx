import { useEffect, useRef, useState } from "react";
import { useList, useStore } from "../store";
import type { PillarDef } from "../types";
import { fmtVal, questState } from "../quest";
import { celebrate, Modal, lastEmoji } from "../ui";
import { todayStr } from "../dates";
import { DASH_CARDS, DEFAULT_PILLARS, dashLayout, lifeWeeks, mindPoints, pillarsOf, questMoney } from "../v2";

/** Progress of one pillar: 0–1 plus a hover hint (the bar itself shows no numbers). */
export function usePillarValue() {
  const { data } = useStore();
  const workouts = useList("workouts");
  const goals = useList("goals");
  const goalLogs = useList("goalLogs");
  const tasks = useList("tasks");
  return (p: PillarDef): { frac: number; hint: string; parts?: { label: string; n: number; pts: number }[] } => {
    const target = Math.max(1, p.target ?? 1);
    if (p.source === "quest") {
      const g = goals.find((x) => x.id === p.questId) ?? goals.find((x) => !x.done);
      if (!g) return { frac: 0, hint: "Link a quest" };
      const st = questState(g, goalLogs, tasks);
      const v = (n: number) => (st.kind === "tasks" ? `${Math.round(n)}` : fmtVal(n, st.unit));
      return { frac: st.frac, hint: `${g.title}: ${v(st.current)} / ${v(st.target)}` };
    }
    if (p.source === "money") {
      const manual = p.current ?? 0;
      const q = questMoney(data, p.moneyQuests, p.start ?? "0000");
      const cur = manual + q.total;
      return {
        frac: cur / target,
        hint: `${fmtVal(cur, "$")} / ${fmtVal(target, "$")}`,
        parts: [{ label: "✍️ Typed in by you", n: 1, pts: manual }, ...q.parts.map((x) => ({ label: `⚔️ Quest: ${x.title}`, n: 1, pts: x.amount }))],
      };
    }
    const from = p.start ?? "0000";
    if (p.source === "body") {
      const n = workouts.filter((w) => w.date >= from).length;
      return { frac: n / target, hint: `${n} / ${target} workouts since ${from}` };
    }
    const m = mindPoints(data, from);
    return { frac: m.total / target, hint: `${m.total} / ${target} points since ${from}`, parts: m.parts };
  };
}

/** Three thin bars: Body / Wealth / Mind. Just bars. Tap one to edit it. */
export function PillarsBar() {
  const { prefs } = useStore();
  const value = usePillarValue();
  const [edit, setEdit] = useState<number | null>(null);
  const [learn, setLearn] = useState(false);
  const pillars = pillarsOf(prefs);
  return (
    <div className="pillars">
      {pillars.map((p, i) => {
        const v = value(p);
        return (
          <button key={p.id} className="pillar" title={v.hint} onClick={() => setEdit(i)}>
            <span className="pillar-name">
              {p.emoji} {p.label}
              {p.source === "mind" && (
                <span className="pillar-add" role="button" title="I learned something" onClick={(e) => { e.stopPropagation(); setLearn(true); }}>
                  ＋
                </span>
              )}
            </span>
            <div className="bar thin">
              <div style={{ width: `${Math.min(100, Math.max(0, v.frac) * 100)}%`, background: p.color }} />
            </div>
          </button>
        );
      })}
      {learn && <LearnedModal onClose={() => setLearn(false)} />}
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

/** Quick "I learned something": adds a line to today's "What did I learn today?". */
function LearnedModal({ onClose }: { onClose: () => void }) {
  const { data, put } = useStore();
  const [text, setText] = useState("");
  const today = todayStr();
  const j = data.journal[today] && !data.journal[today].del ? data.journal[today] : null;
  const save = () => {
    const t = text.trim();
    if (!t) return;
    const learned = j?.learned?.trim() ? `${j.learned.trim()}\n• ${t}` : `• ${t}`;
    put("journal", { id: today, date: today, learned, grateful: j?.grateful ?? "", thoughts: j?.thoughts ?? "" });
    celebrate(j?.learned?.trim() ? "Added to today's learnings" : "Learned something today · Mind +1", "📖");
    onClose();
  };
  return (
    <Modal title="📖 I learned something" onClose={onClose}>
      <textarea autoFocus rows={3} placeholder="One idea, lesson or insight…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && save()} />
      <p className="muted tiny">Saved in "What did I learn today?" (Journal). Counts once per day for the Mind bar.</p>
      <button className="btn primary" disabled={!text.trim()} onClick={save}>
        Save
      </button>
    </Modal>
  );
}

/** Which $ quests add their logged money to the Wealth bar. */
function MoneyQuestPicker({ p, set, goals }: { p: PillarDef; set: (patch: Partial<PillarDef>) => void; goals: { id: string; title: string; metric?: { unit: string } }[] }) {
  const money = goals.filter((g) => g.metric?.unit === "$");
  const sel = p.moneyQuests ?? "all";
  const picked = (id: string) => sel === "all" || (Array.isArray(sel) && sel.includes(id));
  return (
    <div className="small">
      <div className="muted">Add money logged in quests:</div>
      <div className="row wrap">
        <button className={`btn small ${sel === "all" ? "primary" : ""}`} onClick={() => set({ moneyQuests: "all" })}>
          All $ quests (also future ones)
        </button>
        <button className={`btn small ${sel === "none" ? "primary" : ""}`} onClick={() => set({ moneyQuests: "none" })}>
          None, only what I type
        </button>
      </div>
      {money.length > 0 && (
        <div className="row wrap" style={{ marginTop: 4 }}>
          <span className="muted">or pick:</span>
          {money.map((g) => (
            <label key={g.id} className="row">
              <input
                type="checkbox"
                checked={picked(g.id)}
                onChange={(e) => {
                  const cur = sel === "all" ? money.map((x) => x.id) : sel === "none" ? [] : sel;
                  set({ moneyQuests: e.target.checked ? [...new Set([...cur, g.id])] : cur.filter((x) => x !== g.id) });
                }}
              />
              {g.title}
            </label>
          ))}
        </div>
      )}
      <div className="muted tiny">Monthly/total quests add up every amount you logged; "latest" quests (like MRR) count their latest value.</div>
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
        <input className="emoji-input" value={p.emoji} onChange={(e) => set({ emoji: lastEmoji(e.target.value) })} />
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
          <option value="mind">Mind points: learning, ideas executed, battles won</option>
          <option value="money">Money: typed in + earned in quests ($)</option>
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
              Extra money I add myself ($)
              <input type="number" min={0} value={p.current ?? ""} onChange={(e) => set({ current: num(e.target.value) })} style={{ width: 140 }} />
            </label>
          )}
          <label>
            Goal {p.source === "money" ? "($)" : p.source === "body" ? "(workouts)" : "(points)"}
            <input type="number" min={1} value={p.target ?? ""} onChange={(e) => set({ target: num(e.target.value), targetEdited: true })} style={{ width: 140 }} />
          </label>
          {(p.source === "body" || p.source === "mind" || p.source === "money") && (
            <label>
              {p.source === "money" ? "Count quest money from (empty = all time)" : "Count from"}
              <input type="date" value={p.start ?? ""} onChange={(e) => (e.target.value ? set({ start: e.target.value }) : p.source === "money" && set({ start: undefined }))} />
            </label>
          )}
        </div>
      )}
      <p className="muted tiny">{value(p).hint}</p>
      {p.source === "money" && <MoneyQuestPicker p={p} set={set} goals={goals} />}
      {p.source === "money" && (
        <div className="mind-breakdown">
          {value(p).parts?.map((x) => (
            <div key={x.label} className="row between small">
              <span>{x.label}</span>
              <b>{fmtVal(x.pts, "$")}</b>
            </div>
          ))}
          <div className="row between small">
            <span>= Total</span>
            <b>{value(p).hint}</b>
          </div>
        </div>
      )}
      {p.source === "mind" && (
        <div className="mind-breakdown">
          {value(p).parts?.map((x) => (
            <div key={x.label} className="row between small">
              <span>{x.label}</span>
              <span className="muted">
                {x.n} × {x.n ? x.pts / x.n : "–"} = <b>{x.pts}</b>
              </span>
            </div>
          ))}
          <p className="muted tiny">Points per item: learned 1 · study day 1 · Atlas idea 1 · book 5 · idea executed 3 · urge ridden out 2 · clean day 1 · week under limit 5. Slips never take points away.</p>
        </div>
      )}
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



// ---------- Life in weeks ----------

/** Your life in weeks, right on the dashboard: every finished week is crossed off automatically. */
export function MissionBadge() {
  const { prefs } = useStore();
  const w = lifeWeeks(prefs);
  const startYear = Number(w.birth.slice(0, 4));
  return (
    <div className="mission" title={`Born ${w.birth} · ${w.lived.toLocaleString("en-US")} weeks gone · ${w.left} weeks left · change your birthday in Settings`}>
      <div className="mission-head">
        <span className="mission-kicker">{w.years} year mission</span>
        <span>
          <b className="mission-num">{w.left.toLocaleString("en-US")}</b> <span className="mission-sub">weeks left</span>
        </span>
      </div>
      <div className="mission-grid">
        {w.rows.map((row, r) =>
          row.map((st, c) => <i key={`${r}-${c}`} className={`${st}${r && r % 10 === 0 ? " decade" : ""}`} />),
        )}
      </div>
      <div className="mission-foot">
        <span>{startYear}</span>
        <span>
          ✕ gone · <span className="mission-now-dot" /> this week
        </span>
        <span>{startYear + w.years}</span>
      </div>
    </div>
  );
}
