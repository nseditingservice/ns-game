import { useState } from "react";
import { uid, useList, useStore } from "../store";
import type { Battle, Urge } from "../types";
import { fmtDay, fmtHours, todayStr } from "../dates";
import { Modal } from "../ui";
import { battleStats } from "../v2";
import { UrgeModal } from "../components/MindCheck";

const TEMPLATES: Omit<Battle, "id" | "u" | "startDate" | "archived">[] = [
  { name: "Checking ex's Instagram", emoji: "📱", kind: "quit", tagIds: [], weeklyLimitMins: 0, replacement: "Text a friend or go for a 5-minute walk", friction: [{ id: "f1", text: "Log out of the account", done: false }, { id: "f2", text: "Remove the app from the home screen", done: false }, { id: "f3", text: "Set a Screen Time limit", done: false }] },
  { name: "Time-wasting (YouTube / Reels)", emoji: "⏳", kind: "reduce", tagIds: [], weeklyLimitMins: 6 * 60, replacement: "Start a 25-minute focus session instead", friction: [{ id: "f1", text: "Phone in another room while working", done: false }, { id: "f2", text: "Turn off autoplay", done: false }] },
  { name: "Late-night phone", emoji: "🌙", kind: "quit", tagIds: [], weeklyLimitMins: 0, replacement: "Phone charges in the kitchen; read 2 pages", friction: [{ id: "f1", text: "Charger outside the bedroom", done: false }] },
];

const blank = (t?: (typeof TEMPLATES)[number]): Battle => ({ id: uid(), u: 0, startDate: todayStr(), archived: false, ...(t ? { ...t, friction: t.friction.map((f) => ({ ...f, id: uid() })) } : { name: "", emoji: "⚔️", kind: "quit", tagIds: [], weeklyLimitMins: 0, replacement: "", friction: [] }) });

export function Battles() {
  const battles = useList("battles");
  const urges = useList("urges");
  const entries = useList("entries");
  const tagList = useList("tags");
  const tags = new Map(tagList.map((t) => [t.id, t]));
  const [editing, setEditing] = useState<Battle | null>(null);
  const [surf, setSurf] = useState<string | null | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);
  const shown = battles.filter((b) => showArchived || !b.archived).sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>⚔️ Battles: bad habits you're fighting</h2>
            <p className="muted small">Bad habits fade over weeks, not in a day. Log every urge: when the urge line goes down, the habit is dying. One slip is just data.</p>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setSurf(null)}>
              ⚡ I have an urge
            </button>
            <button className="btn primary" onClick={() => setEditing(blank())}>
              + New battle
            </button>
          </div>
        </div>
        {!battles.length && (
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button key={t.name} className="template" onClick={() => setEditing(blank(t))}>
                <span className="t-emoji">{t.emoji}</span>
                <b>{t.name}</b>
                <span className="muted tiny">{t.kind === "quit" ? "Quit: count days clean" : "Reduce: weekly time limit"}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {shown.map((b) => (
        <BattleCard key={b.id} b={b} urges={urges} stats={battleStats(b, urges, entries, tags)} onEdit={() => setEditing(b)} onUrge={() => setSurf(b.id)} />
      ))}
      {battles.some((b) => b.archived) && (
        <label className="row small muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> show won / archived battles
        </label>
      )}

      {editing && <BattleEditor battle={editing} onClose={() => setEditing(null)} />}
      {surf !== undefined && <UrgeModal battleId={surf} onClose={() => setSurf(undefined)} />}
    </>
  );
}

function BattleCard({ b, urges, stats: s, onEdit, onUrge }: { b: Battle; urges: Urge[]; stats: ReturnType<typeof battleStats>; onEdit: () => void; onUrge: () => void }) {
  const { put, del } = useStore();
  const [showLog, setShowLog] = useState(false);
  const surfed = s.week.filter((u) => u.outcome === "surfed").length;
  const maxU = Math.max(3, ...s.urgesPerWeek);
  const maxM = Math.max(b.weeklyLimitMins || 60, ...s.minsPerWeek);
  const nowMins = s.minsPerWeek[s.minsPerWeek.length - 1];
  const prevMins = s.minsPerWeek[s.minsPerWeek.length - 2];
  const log = urges.filter((u) => u.battleId === b.id).sort((a, c) => c.at - a.at);
  return (
    <section className={`card battle ${b.archived ? "archived" : ""}`}>
      <div className="card-head">
        <h2>
          {b.emoji} {b.name}
        </h2>
        <div className="row">
          {b.kind === "quit" ? <span className="chip ok">{s.daysClean} day{s.daysClean === 1 ? "" : "s"} clean</span> : <span className={`chip ${b.weeklyLimitMins && nowMins > b.weeklyLimitMins ? "bad" : "ok"}`}>{fmtHours(nowMins)} this week</span>}
          <button className="btn ghost small" onClick={onEdit}>
            ✎
          </button>
        </div>
      </div>

      <div className="mini-stats">
        <div>
          <b>{s.week.length}</b>
          <span>
            urges this week{" "}
            {s.lastWeekCount > 0 && (
              <em className={s.week.length <= s.lastWeekCount ? "up" : "down"}>
                {s.week.length <= s.lastWeekCount ? "▼" : "▲"} from {s.lastWeekCount}
              </em>
            )}
          </span>
        </div>
        <div>
          <b>
            {surfed}/{s.week.length}
          </b>
          <span>surfed</span>
        </div>
        <div>
          <b>{s.lapsesThisWeek}</b>
          <span>slips this week</span>
        </div>
        <div>
          <b>{b.kind === "quit" ? `${s.best}d` : b.weeklyLimitMins ? fmtHours(b.weeklyLimitMins) : "–"}</b>
          <span>{b.kind === "quit" ? "best clean run" : "weekly limit"}</span>
        </div>
      </div>

      <h3>{b.kind === "quit" ? "Urges per week (8 weeks): you want this going down" : "Time per week (8 weeks) · line = your limit"}</h3>
      <div className="bars small-bars battle-bars">
        {(b.kind === "quit" ? s.urgesPerWeek : s.minsPerWeek).map((v, i) => {
          const max = b.kind === "quit" ? maxU : maxM;
          const over = b.kind === "reduce" && b.weeklyLimitMins > 0 && v > b.weeklyLimitMins;
          return (
            <div key={i} className="bar-col" title={`Week of ${s.weeks[i]}: ${b.kind === "quit" ? `${v} urges` : fmtHours(v)}`}>
              <div className="bar-val">{v ? (b.kind === "quit" ? v : fmtHours(v)) : ""}</div>
              <div className="bar-fill" style={{ height: `${(v / max) * 100}%`, background: over ? "var(--danger)" : b.kind === "quit" ? "var(--accent)" : "var(--warn)" }} />
            </div>
          );
        })}
        {b.kind === "reduce" && b.weeklyLimitMins > 0 && <div className="limit-line" style={{ bottom: `${(b.weeklyLimitMins / maxM) * 100}%` }} />}
      </div>
      {b.kind === "reduce" && prevMins > 0 && (
        <p className="muted small">
          {nowMins <= prevMins ? "▼" : "▲"} {Math.abs(Math.round(((nowMins - prevMins) / prevMins) * 100))}% vs last week · counts {b.tagIds.length ? "the tags you picked" : "everything marked “I could have said NO”"}
        </p>
      )}

      {s.topTriggers.length > 0 && (
        <div className="row wrap small">
          <span className="muted">Top triggers:</span>
          {s.topTriggers.map(([t, n]) => (
            <span key={t} className="chip bad">
              {t} ×{n}
            </span>
          ))}
        </div>
      )}
      {b.replacement && (
        <p className="small">
          🔁 Instead: <b>{b.replacement}</b>
        </p>
      )}
      {b.friction.length > 0 && (
        <div className="row wrap small">
          <span className="muted">Friction:</span>
          {b.friction.map((f) => (
            <button key={f.id} className={`chip ${f.done ? "ok" : ""}`} onClick={() => put("battles", { ...b, friction: b.friction.map((x) => (x.id === f.id ? { ...x, done: !x.done } : x)) })}>
              {f.done ? "✓" : "☐"} {f.text}
            </button>
          ))}
        </div>
      )}
      <div className="row wrap" style={{ marginTop: 8 }}>
        <button className="btn primary small" onClick={onUrge}>
          ⚡ Log an urge
        </button>
        {log.length > 0 && (
          <button className="btn ghost small" onClick={() => setShowLog(!showLog)}>
            {showLog ? "Hide log" : `Urge log (${log.length})`}
          </button>
        )}
      </div>
      {showLog && (
        <ul className="list small">
          {log.slice(0, 50).map((u) => (
            <li key={u.id} className="row between">
              <span>
                {u.outcome === "surfed" ? "🌊" : "↩️"} {fmtDay(u.date)} {new Date(u.at).toTimeString().slice(0, 5)}
                {u.intensity ? ` · ${u.intensity}/10` : ""}
                {u.trigger ? ` · ${u.trigger}` : ""}
                {u.note ? <span className="muted"> · {u.note}</span> : null}
              </span>
              <span className="row">
                <button className="btn ghost small" title={u.outcome === "surfed" ? "Change to: gave in" : "Change to: rode it out"} onClick={() => put("urges", { ...u, outcome: u.outcome === "surfed" ? "gave" : "surfed" })}>
                  ⇄
                </button>
                <button className="btn ghost small" onClick={() => del("urges", u.id)}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BattleEditor({ battle, onClose }: { battle: Battle; onClose: () => void }) {
  const { put, del, data } = useStore();
  const tags = useList("tags").filter((t) => !t.archived);
  const [b, setB] = useState(battle);
  const [nf, setNf] = useState("");
  const isNew = !data.battles[battle.id] || data.battles[battle.id].del;
  return (
    <Modal title={isNew ? "New battle" : "Edit battle"} onClose={onClose}>
      <div className="row">
        <input className="emoji-input" value={b.emoji} onChange={(e) => setB({ ...b, emoji: e.target.value.slice(0, 4) })} />
        <input className="grow" autoFocus placeholder="Bad habit, e.g. Checking ex's Instagram" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
      </div>
      <label>
        Type
        <div className="row wrap">
          <button className={`btn small ${b.kind === "quit" ? "primary" : ""}`} onClick={() => setB({ ...b, kind: "quit" })}>
            🚫 Quit (count days clean)
          </button>
          <button className={`btn small ${b.kind === "reduce" ? "primary" : ""}`} onClick={() => setB({ ...b, kind: "reduce" })}>
            📉 Reduce (weekly time limit)
          </button>
        </div>
      </label>
      {b.kind === "reduce" && (
        <>
          <label>
            Weekly limit (hours)
            <input type="number" min={0} step={0.5} value={b.weeklyLimitMins / 60 || ""} onChange={(e) => setB({ ...b, weeklyLimitMins: Math.round(Number(e.target.value || 0) * 60) })} style={{ width: 110 }} />
          </label>
          <label>
            Count time from these tags (none picked = everything marked “I could have said NO”)
            <div className="row wrap">
              {tags.map((t) => (
                <button key={t.id} className={`btn small ${b.tagIds.includes(t.id) ? "primary" : ""}`} onClick={() => setB({ ...b, tagIds: b.tagIds.includes(t.id) ? b.tagIds.filter((x) => x !== t.id) : [...b.tagIds, t.id] })}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
          </label>
        </>
      )}
      <label>
        Replacement: what you do instead
        <input placeholder="e.g. Text a friend / 5-minute walk" value={b.replacement} onChange={(e) => setB({ ...b, replacement: e.target.value })} />
      </label>
      <div>
        <div className="muted small">Friction: ways to make it harder</div>
        {b.friction.map((f) => (
          <div key={f.id} className="row">
            <input className="grow" value={f.text} onChange={(e) => setB({ ...b, friction: b.friction.map((x) => (x.id === f.id ? { ...x, text: e.target.value } : x)) })} />
            <button className="btn ghost small" onClick={() => setB({ ...b, friction: b.friction.filter((x) => x.id !== f.id) })}>
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <input
            className="grow"
            placeholder="Add one, e.g. Log out of the app"
            value={nf}
            onChange={(e) => setNf(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nf.trim()) {
                setB({ ...b, friction: [...b.friction, { id: uid(), text: nf.trim(), done: false }] });
                setNf("");
              }
            }}
          />
          <button className="btn small" disabled={!nf.trim()} onClick={() => { setB({ ...b, friction: [...b.friction, { id: uid(), text: nf.trim(), done: false }] }); setNf(""); }}>
            Add
          </button>
        </div>
      </div>
      <label>
        Started
        <input type="date" value={b.startDate} onChange={(e) => e.target.value && setB({ ...b, startDate: e.target.value })} />
      </label>
      <div className="row between">
        <button className="btn primary" disabled={!b.name.trim()} onClick={() => { put("battles", { ...b, name: b.name.trim() }); onClose(); }}>
          Save
        </button>
        {!isNew && (
          <span className="row">
            <button className="btn ghost" onClick={() => { put("battles", { ...b, archived: !b.archived }); onClose(); }}>
              {b.archived ? "Unarchive" : "🏆 Won / archive"}
            </button>
            <button className="btn ghost danger" onClick={() => { if (confirm("Delete this battle? (Its urge log is kept.)")) { del("battles", b.id); onClose(); } }}>
              Delete
            </button>
          </span>
        )}
      </div>
    </Modal>
  );
}


