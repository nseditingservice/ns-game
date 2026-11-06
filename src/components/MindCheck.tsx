import { useEffect, useState } from "react";
import { uid, useList, useStore } from "../store";
import { celebrate, Modal } from "../ui";
import { todayStr, weekStart } from "../dates";

const SURF_SECS = 90;

/** Urge surfing (Bowen & Marlatt 2009): notice the urge, breathe, watch it rise and fall. */
export function UrgeModal({ onClose, battleId: initialBattle = null }: { onClose: () => void; battleId?: string | null }) {
  const { put } = useStore();
  const battles = useList("battles").filter((b) => !b.archived);
  const [battleId, setBattleId] = useState<string | null>(initialBattle ?? (battles.length === 1 ? battles[0].id : null));
  const [intensity, setIntensity] = useState<number | null>(null);
  const [trigger, setTrigger] = useState("");
  const [note, setNote] = useState("");
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, SURF_SECS - Math.floor((now - start) / 1000));
  const phase = Math.floor((now - start) / 1000) % 10; // 4s in, 6s long out
  const save = (outcome: "surfed" | "gave") => {
    put("urges", { id: uid(), date: todayStr(), at: Date.now(), kind: "urge", battleId, intensity, trigger: trigger.trim(), outcome, note: note.trim() });
    if (outcome === "surfed") celebrate("You rode the wave. +15 XP", "🌊");
    else celebrate("Logged. One slip isn't who you are. Back on it.", "🤝");
    onClose();
  };
  return (
    <Modal title="⚡ Ride the urge" onClose={onClose}>
      <div className="surf">
        <div className={`surf-orb ${phase < 4 ? "in" : "out"}`}>{left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "✓"}</div>
        <p className="muted small">{left > 0 ? (phase < 4 ? "Breathe in slowly…" : "…and a long breath out. Where do you feel the urge in your body? Just watch it, like a wave.") : "The wave passed its peak. You're in charge now."}</p>
      </div>
      {battles.length > 0 && (
        <label>
          Which battle?
          <div className="row wrap">
            {battles.map((b) => (
              <button key={b.id} className={`btn small ${battleId === b.id ? "primary" : ""}`} onClick={() => setBattleId(battleId === b.id ? null : b.id)}>
                {b.emoji} {b.name}
              </button>
            ))}
          </div>
        </label>
      )}
      <label>
        How strong is it?
        <div className="row wrap">
          {[2, 4, 6, 8, 10].map((n) => (
            <button key={n} className={`btn small ${intensity === n ? "primary" : ""}`} onClick={() => setIntensity(intensity === n ? null : n)}>
              {n}
            </button>
          ))}
        </div>
      </label>
      <label>
        What triggered it? <span className="muted tiny">(write everything: it's often several things at once)</span>
        <textarea rows={2} placeholder="e.g. alone in bed after 11pm, tired, saw a story, felt lonely" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
      </label>
      <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row wrap between">
        <button className="btn primary" onClick={() => save("surfed")}>
          🌊 I rode it out (+15 XP)
        </button>
        <button className="btn ghost" onClick={() => save("gave")}>
          I gave in (log it, no shame)
        </button>
      </div>
    </Modal>
  );
}

/** "I reacted" (instead of responding calmly). Naming the emotion is the first step to calm. */
export function ReactedModal({ onClose }: { onClose: () => void }) {
  const { put } = useStore();
  const [trigger, setTrigger] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal title="😤 I reacted" onClose={onClose}>
      <p className="muted small">No judgement. Naming what happened is how you get calmer next time.</p>
      <label>
        What triggered it? <span className="muted tiny">(as many things as you like)</span>
        <textarea rows={2} placeholder="e.g. client was late, hungry, didn't sleep well" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
      </label>
      <textarea rows={2} placeholder="What happened? What would the calm version of you have done?" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className="btn primary"
        onClick={() => {
          put("urges", { id: uid(), date: todayStr(), at: Date.now(), kind: "reacted", battleId: null, intensity: null, trigger: trigger.trim(), outcome: null, note: note.trim() });
          celebrate("Noted. Awareness is the first step.", "🧘");
          onClose();
        }}
      >
        Save
      </button>
    </Modal>
  );
}

/** Dashboard card: ⚡ urge + 😤 reacted buttons with this week's count. */
export function MindCheckCard() {
  const urges = useList("urges");
  const [open, setOpen] = useState<"urge" | "reacted" | null>(null);
  const wk = weekStart(todayStr());
  const week = urges.filter((u) => u.date >= wk);
  const urgeCount = week.filter((u) => u.kind === "urge").length;
  const surfed = week.filter((u) => u.kind === "urge" && u.outcome === "surfed").length;
  const slips = week.filter((u) => u.kind === "urge" && u.outcome === "gave").length;
  const reacted = week.filter((u) => u.kind === "reacted").length;
  return (
    <section className="card">
      <div className="card-head">
        <h2>🧘 Mind check</h2>
        <span className="muted small">
          this week: {urgeCount} urge{urgeCount === 1 ? "" : "s"} ({surfed} surfed, {slips} slip{slips === 1 ? "" : "s"}) · {reacted} reacted
        </span>
      </div>
      <div className="row wrap">
        <button className="btn" onClick={() => setOpen("urge")}>
          ⚡ I have an urge
        </button>
        <button className="btn" onClick={() => setOpen("reacted")}>
          😤 I reacted
        </button>
      </div>
      {open === "urge" && <UrgeModal onClose={() => setOpen(null)} />}
      {open === "reacted" && <ReactedModal onClose={() => setOpen(null)} />}
    </section>
  );
}
