import { useState } from "react";
import { uid, useList, useStore } from "../store";
import { AREA_INFO, type Area, type Habit, type HabitLink } from "../types";
import { addDays, dateRange, fmtDay, todayStr, weekStart } from "../dates";
import { autoProgress, bestStreak, habitStatus, habitStreak, isScheduled, useIndex, type Index } from "../game";
import { useHabitToggle } from "../habitActions";
import { Modal, lastEmoji } from "../ui";
import { AreaSelect } from "../components/Areas";
import { waterTargetL } from "../water";
import { Battles } from "./Battles";
import { penaltyOf } from "../v2";

/** Lally et al. (2010): a median of 66 days of repetition until a habit runs on autopilot. */
export const AUTOMATIC_DAYS = 66;
export const doneDays = (h: Habit, ix: Index, today = todayStr()) => dateRange(h.createdAt, today).filter((d) => habitStatus(h, d, ix, today) === "done").length;

const DAY_NAMES = ["M", "T", "W", "T", "F", "S", "S"];

const linkLabel = (l: HabitLink, tagName: (id: string) => string) => {
  switch (l.kind) {
    case "manual":
      return "Tick it yourself";
    case "tag":
      return `Auto: ${l.minMins}+ min of ${tagName(l.tagId)} logged`;
    case "focus":
      return `Auto: ${l.minMins}+ min of focus sessions`;
    case "workout":
      return "Auto: a workout logged";
    case "meals":
      return `Auto: ${l.min}+ meals logged`;
    case "healthyMeals":
      return `Auto: ${l.min}+ healthy meals`;
    case "water":
      return `Auto: ${waterTargetL(l)}+ L of water`;
    case "sleep":
      return `Auto: ${l.minHours}+ hours sleep`;
    case "weight":
      return "Auto: weight logged";
    case "wasteLimit":
      return `Auto: under ${l.maxMins} min of wasted time (judged at day's end)`;
  }
};

type Template = Omit<Habit, "id" | "u" | "createdAt" | "archived">;
const EVERY = [0, 1, 2, 3, 4, 5, 6];
const TEMPLATES: Template[] = [
  { name: "Drink water", emoji: "💧", identity: "I take care of my body", anchor: "After I wake up, I drink a glass", tiny: "One glass of water", area: "body", days: EVERY, link: { kind: "water", min: 10, liters: 2.5 } },
  { name: "Work out", emoji: "🏋️", identity: "I am an athlete", anchor: "After work, I change into gym clothes", tiny: "Put on workout clothes", area: "body", days: [0, 1, 2, 3, 4], link: { kind: "workout" } },
  { name: "Sleep 7+ hours", emoji: "😴", identity: "I protect my sleep", anchor: "At 10:30pm, phone goes on the charger outside the bedroom", tiny: "Phone away at 10:30", area: "body", days: EVERY, link: { kind: "sleep", minHours: 7 } },
  { name: "Eat healthy", emoji: "🥗", identity: "I fuel my body well", anchor: "Before each meal, I add something green", tiny: "One healthy meal", area: "body", days: EVERY, link: { kind: "healthyMeals", min: 2 } },
  { name: "Read", emoji: "📖", identity: "I am a reader", anchor: "After dinner, I open my book", tiny: "Read one page", area: "mind", days: EVERY, link: { kind: "tag", tagId: "tag-reading", minMins: 20 } },
  { name: "Deep work", emoji: "🎯", identity: "I do focused, meaningful work", anchor: "After morning coffee, I start a focus session", tiny: "Open the task and start a 25 min timer", area: "work", days: [0, 1, 2, 3, 4], link: { kind: "focus", minMins: 90 } },
  { name: "Meditate / pray", emoji: "🧘", identity: "I am calm and grounded", anchor: "After I brush my teeth in the morning", tiny: "Three deep breaths", area: "spirit", days: EVERY, link: { kind: "tag", tagId: "tag-meditation", minMins: 10 } },
  { name: "Log my meals", emoji: "🍽️", identity: "I know what I eat", anchor: "After each meal, I log it", tiny: "Log one meal", area: "body", days: EVERY, link: { kind: "meals", min: 3 } },
  { name: "Weigh in", emoji: "⚖️", identity: "I track my progress", anchor: "After using the bathroom in the morning", tiny: "Step on the scale", area: "body", days: EVERY, link: { kind: "weight" } },
  { name: "Plan tomorrow", emoji: "🗓️", identity: "I live on purpose", anchor: "After dinner, I open the calendar", tiny: "Write tomorrow's top task", area: "work", days: EVERY, link: { kind: "manual" } },
  { name: "Say NO more", emoji: "🚫", identity: "I protect my time", anchor: "Before saying yes, I ask: does this serve my goals?", tiny: "Pause 5 seconds before every yes", area: "spirit", days: EVERY, link: { kind: "wasteLimit", maxMins: 60 } },
  { name: "Call family", emoji: "📞", identity: "I show up for people I love", anchor: "On my evening walk", tiny: "Send one message", area: "people", days: [5, 6], link: { kind: "manual" } },
];

export default function Habits() {
  const habits = useList("habits");
  const ix = useIndex();
  const toggle = useHabitToggle(ix);
  const tags = useList("tags");
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? "tag";
  const [editing, setEditing] = useState<Habit | null>(null);
  const [detail, setDetail] = useState<Habit | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState<"habits" | "battles">(() => (sessionStorage.getItem("nsgame:habitTab") === "battles" ? "battles" : "habits"));
  const pickTab = (t: "habits" | "battles") => {
    sessionStorage.setItem("nsgame:habitTab", t);
    setTab(t);
  };
  const today = todayStr();
  const last7 = dateRange(addDays(today, -6), today);
  const active = habits.filter((h) => !h.archived);
  const shown = showArchived ? habits : active;
  const todays = active.filter((h) => isScheduled(h, today));
  const done = todays.filter((h) => habitStatus(h, today, ix) === "done").length;

  const blank = (t?: Template): Habit => ({ id: uid(), u: 0, createdAt: today, archived: false, ...(t ?? { name: "", emoji: "✅", identity: "", anchor: "", tiny: "", area: "body" as Area, days: EVERY, link: { kind: "manual" } as HabitLink }) });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Habits</h1>
          <p className="muted">
            Today: {done}/{todays.length} {todays.length > 0 && done === todays.length && "· 🌟 Perfect day!"}
          </p>
        </div>
        <div className="row">
          <div className="seg">
            <button className={tab === "habits" ? "on" : ""} onClick={() => pickTab("habits")}>
              ✅ Habits
            </button>
            <button className={tab === "battles" ? "on" : ""} onClick={() => pickTab("battles")}>
              ⚔️ Battles
            </button>
          </div>
          {tab === "habits" && (
            <>
              <button className="btn ghost" onClick={() => setShowTips(!showTips)}>
                How to win
              </button>
              <button className="btn primary" onClick={() => setEditing(blank())}>
                + New habit
              </button>
            </>
          )}
        </div>
      </header>

      {tab === "battles" ? (
        <Battles />
      ) : (
      <>

      {showTips && (
        <section className="card tips">
          <h2>The rules of the game</h2>
          <ul>
            <li>
              <b>Be someone, not just do something.</b> Each habit has an identity ("I am a reader"). Every tick is a vote for that person. <span className="muted">(James Clear, Atomic Habits)</span>
            </li>
            <li>
              <b>Start tiny.</b> Have a 2-minute version you can do on your worst day. <span className="muted">(BJ Fogg, Tiny Habits)</span>
            </li>
            <li>
              <b>Anchor it.</b> "After I [existing routine], I will [habit]." <span className="muted">(habit stacking)</span>
            </li>
            <li>
              <b>Must-do = Hard Mode.</b> Switch it on for your non-negotiables. Missing one costs XP (you set how much in Settings), so the game is honest about bad days.
            </li>
            <li>
              <b>~66 days to autopilot.</b> In research, a new habit took a median of 66 days of repeats to feel automatic. The counter on each habit shows how far you are. <span className="muted">(Lally et al., 2010)</span>
            </li>
            <li>
              <b>Never miss twice.</b> One miss is an accident; your streak survives with a warning. Two in a row breaks it.
            </li>
            <li>
              <b>Celebrate right away.</b> The pop and XP after each tick is there on purpose: feeling good wires the habit in.
            </li>
            <li>
              <b>Let your data do the ticking.</b> Link habits to your time log, meals, workouts, water or sleep and they complete themselves.
            </li>
          </ul>
        </section>
      )}

      {!active.length && (
        <section className="card">
          <h2>Start with 1–3 habits</h2>
          <p className="muted small">Tap one to add it. You can edit everything afterwards.</p>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button key={t.name} className="template" onClick={() => setEditing(blank(t))}>
                <span className="t-emoji">{t.emoji}</span>
                <b>{t.name}</b>
                <span className="muted tiny">{linkLabel(t.link, tagName)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {shown.length > 0 && (
        <section className="card">
          <div className="habit-grid-head">
            <span />
            {last7.map((d) => (
              <span key={d} className={`tiny ${d === today ? "today-label" : "muted"}`}>
                {fmtDay(d, { weekday: "narrow" })}
                <br />
                {d.slice(8)}
              </span>
            ))}
            <span />
          </div>
          {shown.map((h) => {
            const { streak, warn } = habitStreak(h, ix);
            const p = autoProgress(h, today, ix);
            const reps = doneDays(h, ix, today);
            return (
              <div key={h.id} className={`habit-grid-row ${h.archived ? "archived" : ""}`}>
                <div className="habit-name" onClick={() => setDetail(h)}>
                  <span className="h-emoji">{h.emoji}</span>
                  <div>
                    <div>
                      {h.name} {h.mustDo && <span className="must-chip">must-do</span>} {streak > 0 && <span className="streak">🔥{streak}</span>}
                    </div>
                    <div className="muted tiny">
                      {warn ? <span className="warn-text">Missed last time. Don't miss twice! </span> : h.identity ? `“${h.identity}” ` : ""}
                      {p && habitStatus(h, today, ix) !== "done" && `· ${Math.round(p.value * 10) / 10}/${p.target} ${p.unit}`}
                    </div>
                    <div className="auto-meter" title="Days done so far. Around 66 repeats, a habit usually runs on autopilot.">
                      <div className="bar thin">
                        <div style={{ width: `${Math.min(100, (reps / AUTOMATIC_DAYS) * 100)}%` }} />
                      </div>
                      <span className="muted tiny">{reps >= AUTOMATIC_DAYS ? "🧠 automatic" : `🧠 ${reps}/${AUTOMATIC_DAYS} to automatic`}</span>
                    </div>
                  </div>
                </div>
                {last7.map((d) => {
                  const s = habitStatus(h, d, ix);
                  return (
                    <button key={d} className={`dot-btn ${s}`} disabled={s === "off"} onClick={() => toggle(h, d)} title={`${d}: ${s}`}>
                      {s === "done" ? "✓" : s === "skip" ? "–" : ""}
                    </button>
                  );
                })}
                <span />
              </div>
            );
          })}
          <label className="row small muted" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> show archived
          </label>
        </section>
      )}

      {active.length > 0 && (
        <details className="card">
          <summary>
            <b>Add from templates</b>
          </summary>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button key={t.name} className="template" onClick={() => setEditing(blank(t))}>
                <span className="t-emoji">{t.emoji}</span>
                <b>{t.name}</b>
                <span className="muted tiny">{linkLabel(t.link, tagName)}</span>
              </button>
            ))}
          </div>
        </details>
      )}

      </>
      )}

      {editing && <HabitEditor habit={editing} onClose={() => setEditing(null)} />}
      {detail && <HabitDetail habit={habits.find((h) => h.id === detail.id) ?? detail} ix={ix} linkText={linkLabel(detail.link, tagName)} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} />}
    </div>
  );
}

function HabitDetail({ habit: h, ix, linkText, onClose, onEdit }: { habit: Habit; ix: Index; linkText: string; onClose: () => void; onEdit: () => void }) {
  const { del, prefs } = useStore();
  const today = todayStr();
  const { streak } = habitStreak(h, ix);
  const best = bestStreak(h, ix);
  const last30 = dateRange(addDays(today, -29), today).filter((d) => isScheduled(h, d) && d < today);
  const done30 = last30.filter((d) => habitStatus(h, d, ix) === "done").length;
  const heatStart = addDays(weekStart(today), -52 * 7);
  const heat = dateRange(heatStart, addDays(weekStart(today), 6));
  const allDone = dateRange(h.createdAt, today).filter((d) => habitStatus(h, d, ix) === "done").length;
  return (
    <Modal title={`${h.emoji} ${h.name}`} onClose={onClose}>
      {h.identity && <p className="identity">“{h.identity}”</p>}
      <div className="muted small">
        {h.anchor && <div>⚓ {h.anchor}</div>}
        {h.tiny && <div>🌱 Tiny version: {h.tiny}</div>}
        {h.mustDo && <div>⚔️ Must-do: missing it costs {penaltyOf(prefs)} XP</div>}
        <div>
          🔗 {linkText} · {AREA_INFO[h.area].emoji} {AREA_INFO[h.area].label} · {h.days.length === 7 ? "every day" : h.days.map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]).join(", ")}
        </div>
      </div>
      <div className="mini-stats">
        <div>
          <b>{streak}🔥</b>
          <span>streak</span>
        </div>
        <div>
          <b>{best}</b>
          <span>best streak</span>
        </div>
        <div>
          <b>{last30.length ? Math.round((done30 / last30.length) * 100) : 0}%</b>
          <span>last 30 days</span>
        </div>
        <div>
          <b>{Math.min(allDone, AUTOMATIC_DAYS)}/{AUTOMATIC_DAYS}</b>
          <span>{allDone >= AUTOMATIC_DAYS ? "🧠 automatic" : "to automatic"}</span>
        </div>
      </div>
      <h3>Last 12 months</h3>
      <div className="heatmap">
        {heat.map((d) => {
          const s = habitStatus(h, d, ix);
          return <div key={d} className={`heat ${s === "done" ? "l4" : s === "missed" ? "miss" : s === "skip" ? "l1" : "l0"}`} style={{ ["--c" as string]: AREA_INFO[h.area].color }} title={`${d}: ${s}`} />;
        })}
      </div>
      <div className="row wrap">
        <button className="btn" onClick={onEdit}>
          Edit
        </button>
        <button className="btn ghost danger" onClick={() => { if (confirm("Delete this habit and all its history? (Archive instead to keep history.)")) { del("habits", h.id); onClose(); } }}>
          Delete
        </button>
      </div>
    </Modal>
  );
}

function HabitEditor({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const { put, data, prefs } = useStore();
  const tags = useList("tags").filter((t) => !t.archived);
  const [h, setH] = useState(habit);
  const isNew = !data.habits[habit.id] || data.habits[habit.id].del;
  const l = h.link;
  const setLink = (link: HabitLink) => setH({ ...h, link });
  const num = (v: string, d: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

  return (
    <Modal title={isNew ? "New habit" : "Edit habit"} onClose={onClose}>
      <div className="row">
        <input className="emoji-input" value={h.emoji} onChange={(e) => setH({ ...h, emoji: lastEmoji(e.target.value) })} />
        <input className="grow" autoFocus placeholder="Habit name, e.g. Read" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
      </div>
      <label>
        Identity: who do you want to become?
        <input placeholder="I am a reader" value={h.identity} onChange={(e) => setH({ ...h, identity: e.target.value })} />
      </label>
      <label>
        Anchor: after I… (when / where)
        <input placeholder="After dinner, I open my book" value={h.anchor} onChange={(e) => setH({ ...h, anchor: e.target.value })} />
      </label>
      <label>
        Tiny version (for bad days)
        <input placeholder="Read one page" value={h.tiny} onChange={(e) => setH({ ...h, tiny: e.target.value })} />
      </label>
      <label>
        Days
        <div className="row wrap">
          {DAY_NAMES.map((n, i) => (
            <button key={i} type="button" className={`day-btn ${h.days.includes(i) ? "on" : ""}`} onClick={() => setH({ ...h, days: h.days.includes(i) ? h.days.filter((d) => d !== i) : [...h.days, i].sort() })}>
              {n}
            </button>
          ))}
          <button type="button" className="btn ghost small" onClick={() => setH({ ...h, days: EVERY })}>
            Every day
          </button>
          <button type="button" className="btn ghost small" onClick={() => setH({ ...h, days: [0, 1, 2, 3, 4] })}>
            Weekdays
          </button>
        </div>
      </label>
      <div className="row wrap">
        <label className="grow">
          How is it completed?
          <select
            value={l.kind}
            onChange={(e) => {
              const k = e.target.value as HabitLink["kind"];
              const defaults: Record<HabitLink["kind"], HabitLink> = {
                manual: { kind: "manual" },
                tag: { kind: "tag", tagId: tags[0]?.id ?? "", minMins: 30 },
                focus: { kind: "focus", minMins: 60 },
                workout: { kind: "workout" },
                meals: { kind: "meals", min: 3 },
                healthyMeals: { kind: "healthyMeals", min: 2 },
                water: { kind: "water", min: 10, liters: 2.5 },
                sleep: { kind: "sleep", minHours: 7 },
                weight: { kind: "weight" },
                wasteLimit: { kind: "wasteLimit", maxMins: 60 },
              };
              setLink(defaults[k]);
            }}
          >
            <option value="manual">I tick it myself</option>
            <option value="tag">Auto: time logged on a tag</option>
            <option value="focus">Auto: focus session minutes</option>
            <option value="workout">Auto: a workout logged</option>
            <option value="meals">Auto: number of meals logged</option>
            <option value="healthyMeals">Auto: number of healthy meals</option>
            <option value="water">Auto: litres of water</option>
            <option value="sleep">Auto: hours of sleep</option>
            <option value="weight">Auto: weight logged</option>
            <option value="wasteLimit">Auto: wasted time under a limit</option>
          </select>
        </label>
        {l.kind === "tag" && (
          <>
            <label>
              Tag
              <select value={l.tagId} onChange={(e) => setLink({ ...l, tagId: e.target.value })}>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.emoji} {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Min. minutes
              <input type="number" min={1} value={l.minMins} onChange={(e) => setLink({ ...l, minMins: num(e.target.value, 1) })} />
            </label>
          </>
        )}
        {l.kind === "focus" && (
          <label>
            Min. minutes
            <input type="number" min={1} value={l.minMins} onChange={(e) => setLink({ ...l, minMins: num(e.target.value, 1) })} />
          </label>
        )}
        {l.kind === "wasteLimit" && (
          <label>
            Max minutes wasted per day
            <input type="number" min={0} step={15} value={l.maxMins} onChange={(e) => setLink({ ...l, maxMins: num(e.target.value, 60) })} />
          </label>
        )}
        {l.kind === "water" && (
          <label>
            Litres (at least)
            <input type="number" min={0.25} step={0.25} value={waterTargetL(l)} onChange={(e) => setLink({ ...l, liters: num(e.target.value, 2.5) })} />
          </label>
        )}
        {(l.kind === "meals" || l.kind === "healthyMeals") && (
          <label>
            At least
            <input type="number" min={1} value={l.min} onChange={(e) => setLink({ ...l, min: num(e.target.value, 1) })} />
          </label>
        )}
        {l.kind === "sleep" && (
          <label>
            Min. hours
            <input type="number" min={1} step={0.5} value={l.minHours} onChange={(e) => setLink({ ...l, minHours: num(e.target.value, 7) })} />
          </label>
        )}
      </div>
      <label>
        Life area
        <AreaSelect value={h.area} onChange={(area) => setH({ ...h, area })} />
      </label>
      <label className="row check-label">
        <input type="checkbox" checked={!!h.mustDo} onChange={(e) => setH({ ...h, mustDo: e.target.checked, mustDoSince: e.target.checked ? (h.mustDoSince ?? todayStr()) : undefined })} />
        <span>
          ⚔️ <b>Must-do (Hard Mode)</b>
          <span className="muted tiny"> · missing it costs {penaltyOf(prefs)} XP (change in Settings). Counts from today.</span>
        </span>
      </label>
      <div className="row between">
        <button className="btn primary" disabled={!h.name.trim() || !h.days.length} onClick={() => { put("habits", { ...h, name: h.name.trim() }); onClose(); }}>
          Save
        </button>
        {!isNew && (
          <button className="btn ghost" onClick={() => { put("habits", { ...h, archived: !h.archived }); onClose(); }}>
            {h.archived ? "Unarchive" : "Archive"}
          </button>
        )}
      </div>
    </Modal>
  );
}
