import { useState } from "react";
import { useStore } from "../store";
import { DEFAULT_PENALTY, estimatesOf, fmtEstimate, foodsOf, parseEstimate } from "../v2";

/** Comma-separated list field that saves when you leave it. */
function ListField({ label, value, onSave, hint }: { label: string; value: string[]; onSave: (v: string[]) => void; hint?: string }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <label>
      {label}
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onSave(text.split(",").map((x) => x.trim()).filter(Boolean))} />
      {hint && <span className="muted tiny">{hint}</span>}
    </label>
  );
}

export function GameSettings() {
  const { prefs, setPrefs } = useStore();
  const foods = foodsOf(prefs);
  const [nf, setNf] = useState({ emoji: "🍽️", label: "", grams: "" });
  const num = (v: string) => (v === "" ? undefined : Math.max(0, Number(v)));

  return (
    <section className="card form">
      <h2>🎮 Game & health settings</h2>
      <p className="muted small">Everything here is yours to change. Leave a number empty to use the default.</p>
      <div className="row wrap">
        <label>
          Missed must-do habit costs (XP)
          <input type="number" min={0} step={5} placeholder={String(DEFAULT_PENALTY)} value={prefs.mustDoPenalty ?? ""} onChange={(e) => setPrefs({ mustDoPenalty: num(e.target.value) })} style={{ width: 130 }} />
          <span className="muted tiny">0 = Hard Mode off</span>
        </label>
        <label>
          Protein target (g / day)
          <input type="number" min={0} placeholder="auto: 1.6 × weight" value={prefs.proteinTarget ?? ""} onChange={(e) => setPrefs({ proteinTarget: num(e.target.value) || undefined })} style={{ width: 150 }} />
        </label>
        <label>
          Top 4 in Things I Did ranks
          <select value={prefs.top4By ?? "things"} onChange={(e) => setPrefs({ top4By: e.target.value as "things" | "tags" })}>
            <option value="things">by Things (fallback: tag)</option>
            <option value="tags">by tags</option>
          </select>
        </label>
      </div>
      <ListField label="Task estimate quick picks" value={estimatesOf(prefs).map(fmtEstimate)} onSave={(v) => setPrefs({ estimatePresets: v.map(parseEstimate).filter((x): x is number => !!x) })} hint="e.g. 15m, 30m, 1h, 2h, 4h, 6h, 8h, 2d" />
      <div>
        <div className="muted small">🍗 One-tap protein foods (Health page)</div>
        {foods.map((f, i) => (
          <div key={i} className="row" style={{ padding: "3px 0" }}>
            <input className="emoji-input" value={f.emoji} onChange={(e) => setPrefs({ proteinFoods: foods.map((x, j) => (j === i ? { ...x, emoji: e.target.value.slice(0, 4) } : x)) })} />
            <input className="grow" value={f.label} onChange={(e) => setPrefs({ proteinFoods: foods.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <input type="number" min={0} value={f.grams} onChange={(e) => setPrefs({ proteinFoods: foods.map((x, j) => (j === i ? { ...x, grams: Number(e.target.value) || 0 } : x)) })} style={{ width: 70 }} />
            <span className="muted small">g</span>
            <button className="btn ghost small" onClick={() => setPrefs({ proteinFoods: foods.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <div className="row" style={{ paddingTop: 4 }}>
          <input className="emoji-input" value={nf.emoji} onChange={(e) => setNf({ ...nf, emoji: e.target.value.slice(0, 4) })} />
          <input className="grow" placeholder="New food, e.g. Tofu 100g" value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} />
          <input type="number" min={0} placeholder="g" value={nf.grams} onChange={(e) => setNf({ ...nf, grams: e.target.value })} style={{ width: 70 }} />
          <button
            className="btn small primary"
            disabled={!nf.label.trim() || !Number(nf.grams)}
            onClick={() => {
              setPrefs({ proteinFoods: [...foods, { emoji: nf.emoji || "🍽️", label: nf.label.trim(), grams: Number(nf.grams) }] });
              setNf({ emoji: "🍽️", label: "", grams: "" });
            }}
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}
