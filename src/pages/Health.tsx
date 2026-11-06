import { useState } from "react";
import { PALETTE, uid, useList, useStore } from "../store";
import type { Exercise, HealthDay, Meal, MealQuality, Workout, WorkoutType } from "../types";
import { addDays, dateRange, fmtDay, fmtTime, nowMins, parseTime, todayStr, weekStart } from "../dates";
import { celebrate, Empty, Modal, Rating } from "../ui";
import { fmtL, waterMl } from "../water";
import { DEFAULT_SETS_TARGET, foodsOf, muscleFor, musclesOf, nextTarget, personalRecords, proteinOn, proteinTargetOf, trainingWeek } from "../v2";

const DEFAULT_WORKOUT_TYPES: WorkoutType[] = ["Muay Thai", "Strength", "Run", "Walk", "Cycle", "HIIT", "Yoga", "Sport", "Swim", "Stretch", "Other"].map((name) => ({ name, tagId: null }));
const Q: Record<MealQuality, { emoji: string; label: string }> = { great: { emoji: "🟢", label: "Healthy" }, ok: { emoji: "🟡", label: "Okay" }, junk: { emoji: "🔴", label: "Junk" } };
const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

const blankDay = (date: string): HealthDay => ({ id: date, u: 0, date, sleepHours: null, sleepQuality: null, weight: null, water: 0, steps: null, energy: null, mood: null, notes: "" });
const mealKindFor = (m: number): Meal["kind"] => (m < 10 * 60 + 30 ? "breakfast" : m < 15 * 60 ? "lunch" : m < 17 * 60 + 30 ? "snack" : "dinner");

export default function Health() {
  const { data, put, del, prefs } = useStore();
  const [date, setDate] = useState(todayStr());
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const meals = useList("meals");
  const workouts = useList("workouts");
  const healthDays = useList("healthDays");
  const hd = (data.healthDays[date] && !data.healthDays[date].del ? data.healthDays[date] : null) ?? blankDay(date);
  const dayMeals = meals.filter((m) => m.date === date).sort((a, b) => a.time - b.time);
  const dayWorkouts = workouts.filter((w) => w.date === date);
  const today = todayStr();

  const setDay = (patch: Partial<HealthDay>) => {
    const first = !data.healthDays[date] || (hd.sleepHours == null && hd.weight == null && hd.mood == null);
    put("healthDays", { ...hd, ...patch });
    if (first && (patch.sleepHours != null || patch.weight != null || patch.mood != null)) celebrate("Check-in +5 XP", "💪");
  };
  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  // ---- meal quick add ----
  const [what, setWhat] = useState("");
  const [quality, setQuality] = useState<MealQuality>("great");
  const [mealTime, setMealTime] = useState(fmtTime(nowMins()));
  const [protein, setProtein] = useState("");
  const addMeal = () => {
    if (!what.trim()) return;
    const t = parseTime(mealTime);
    put("meals", { id: uid(), date, time: t, kind: mealKindFor(t), what: what.trim(), quality, protein: protein ? Number(protein) : null });
    celebrate(quality === "great" ? "Healthy meal +6 XP" : "Meal logged +3 XP", Q[quality].emoji);
    setWhat("");
    setProtein("");
  };

  // ---- trends ----
  const last30 = dateRange(addDays(today, -29), today);
  const hmap = new Map(healthDays.map((h) => [h.date, h]));
  const weights = last30.map((d) => ({ d, v: hmap.get(d)?.weight ?? null })).filter((x) => x.v != null) as { d: string; v: number }[];
  const sleeps = last30.map((d) => ({ d, v: hmap.get(d)?.sleepHours ?? 0 }));
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today), -7 * (7 - i)));
  const wPerWeek = weeks.map((w) => workouts.filter((x) => x.date >= w && x.date <= addDays(w, 6)).length);
  const setsPerWeek = weeks.map((w) => trainingWeek(workouts, prefs, w).sets);
  const pTarget = proteinTargetOf(prefs, healthDays);
  const last14 = dateRange(addDays(today, -13), today);
  const recentMeals = meals.filter((m) => m.date >= addDays(today, -6));
  const qCount = (q: MealQuality) => recentMeals.filter((m) => m.quality === q).length;
  const sleepAvg = sleeps.filter((s) => s.v).reduce((n, s, _, a) => n + s.v / a.length, 0);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Health</h1>
          <p className="muted">{fmtDay(date, { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => setDate(addDays(date, -1))}>
            ←
          </button>
          <button className="btn ghost" onClick={() => setDate(today)}>
            Today
          </button>
          <button className="btn ghost" onClick={() => setDate(addDays(date, 1))} disabled={date >= today}>
            →
          </button>
        </div>
      </header>

      <section className="card form">
        <h2>Daily check-in</h2>
        <div className="health-grid">
          <label>
            😴 Sleep (hours)
            <input type="number" inputMode="decimal" step={0.25} min={0} max={24} value={hd.sleepHours ?? ""} onChange={(e) => setDay({ sleepHours: numOrNull(e.target.value) })} />
          </label>
          <label>
            ⚖️ Weight (kg)
            <input type="number" inputMode="decimal" step={0.1} min={0} value={hd.weight ?? ""} onChange={(e) => setDay({ weight: numOrNull(e.target.value) })} />
          </label>
          <label>
            👣 Steps
            <input type="number" inputMode="numeric" min={0} value={hd.steps ?? ""} onChange={(e) => setDay({ steps: numOrNull(e.target.value) })} />
          </label>
          <label>
            💧 Water (litres)
            <input type="number" inputMode="decimal" step={0.05} min={0} value={Math.round(waterMl(hd)) / 1000 || ""} placeholder="0" onChange={(e) => setDay({ waterMl: Math.max(0, Math.round(Number(e.target.value || 0) * 1000)) })} />
            <div className="row">
              <button className="btn small" onClick={() => setDay({ waterMl: Math.max(0, waterMl(hd) - 250) })}>
                −250
              </button>
              <button className="btn small primary" onClick={() => setDay({ waterMl: waterMl(hd) + 250 })}>
                +250 ml
              </button>
              <button className="btn small primary" onClick={() => setDay({ waterMl: waterMl(hd) + 500 })}>
                +500 ml
              </button>
            </div>
          </label>
        </div>
        <div className="health-grid">
          <label>
            Sleep quality
            <Rating value={hd.sleepQuality} onChange={(v) => setDay({ sleepQuality: v })} />
          </label>
          <label>
            Energy
            <Rating value={hd.energy} onChange={(v) => setDay({ energy: v })} />
          </label>
          <label>
            Mood
            <Rating value={hd.mood} onChange={(v) => setDay({ mood: v })} labels={MOODS} />
          </label>
        </div>
        <label>
          Notes (how did your body feel?)
          <textarea rows={2} value={hd.notes} onChange={(e) => setDay({ notes: e.target.value })} />
        </label>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>🏋️ Workouts</h2>
          <button className="btn primary small" onClick={() => setEditingWorkout({ id: uid(), u: 0, date, type: "Strength", start: date === today ? Math.max(0, nowMins() - 60) : 18 * 60, durationMins: 45, intensity: 2, exercises: [], notes: "" })}>
            + Log workout
          </button>
        </div>
        {!dayWorkouts.length && <Empty>No workout logged{date === today ? " yet today" : ""}.</Empty>}
        <ul className="list">
          {dayWorkouts.map((w) => (
            <li key={w.id} className="workout-row" onClick={() => setEditingWorkout(w)}>
              <div className="row between">
                <b>
                  {w.type} · {w.durationMins} min
                </b>
                <span className="muted small">
                  {["", "Easy", "Moderate", "Hard"][w.intensity]}
                  {w.start != null && ` · ${fmtTime(w.start)}`}
                </span>
              </div>
              {w.exercises.length > 0 && (
                <div className="muted small">
                  {w.exercises.map((x) => `${x.name} ${x.sets}×${x.reps}${x.weight ? ` @${x.weight}kg` : ""}`).join(" · ")}
                </div>
              )}
              {w.notes && <div className="muted small">{w.notes}</div>}
            </li>
          ))}
        </ul>
      </section>

      <TrainingCard date={date} />

      <ProteinCard date={date} />

      <section className="card">
        <h2>🍽️ What I ate</h2>
        <ul className="list">
          {dayMeals.map((m) => (
            <li key={m.id} className="meal-row clickable" onClick={() => setEditingMeal(m)}>
              <span>{Q[m.quality].emoji}</span>
              <span className="time">{fmtTime(m.time)}</span>
              <span className="grow">
                <span className="muted tiny">{m.kind} · </span>
                {m.what}
                {m.protein ? <span className="muted tiny"> · {m.protein}g protein</span> : null}
              </span>
              <button className="btn ghost small" onClick={(e) => { e.stopPropagation(); del("meals", m.id); }}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="meal-form">
          <input className="grow" placeholder="What did you eat? e.g. Dal, rice, salad" value={what} onChange={(e) => setWhat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMeal()} />
          <div className="row wrap">
            {(Object.keys(Q) as MealQuality[]).map((q) => (
              <button key={q} className={`btn small ${quality === q ? "primary" : ""}`} onClick={() => setQuality(q)}>
                {Q[q].emoji} {Q[q].label}
              </button>
            ))}
            <input type="time" value={mealTime} onChange={(e) => setMealTime(e.target.value)} />
            <input type="number" inputMode="numeric" placeholder="protein g" value={protein} onChange={(e) => setProtein(e.target.value)} style={{ width: 100 }} />
            <button className="btn primary" onClick={addMeal} disabled={!what.trim()}>
              Add meal
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Trends</h2>
        <div className="grid-2 trends">
          <div>
            <h3>Weight (30 days)</h3>
            {weights.length >= 2 ? <LineChart points={weights} /> : <Empty>Log your weight a few times to see the trend.</Empty>}
          </div>
          <div>
            <h3>Sleep · avg {sleepAvg ? `${sleepAvg.toFixed(1)}h` : "–"}</h3>
            <div className="bars small-bars">
              {sleeps.map((s) => (
                <div key={s.d} className="bar-col" title={`${s.d}: ${s.v}h`}>
                  <div className="bar-fill" style={{ height: `${(s.v / 10) * 100}%`, background: s.v >= 7 ? "var(--ok)" : s.v ? "#f59e0b" : "transparent" }} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>Water (30 days) · goal {prefs.waterGoalL ?? 3} L</h3>
            <div className="bars small-bars">
              {last30.map((d) => {
                const ml = waterMl(hmap.get(d));
                const goal = (prefs.waterGoalL ?? 3) * 1000;
                return (
                  <div key={d} className="bar-col" title={`${d}: ${fmtL(ml)}`}>
                    <div className="bar-fill" style={{ height: `${Math.min(100, (ml / (goal * 1.3)) * 100)}%`, background: ml >= goal ? "#0ea5e9" : ml ? "#7dd3fc" : "transparent" }} />
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3>Hard sets per week · target {(prefs.setsTarget ?? DEFAULT_SETS_TARGET) * musclesOf(prefs).length}</h3>
            <div className="bars small-bars">
              {setsPerWeek.map((n, i) => (
                <div key={i} className="bar-col" title={`Week of ${weeks[i]}: ${n} sets · ${wPerWeek[i]} sessions`}>
                  <div className="bar-val">{n || ""}</div>
                  <div className="bar-fill" style={{ height: `${(n / Math.max((prefs.setsTarget ?? DEFAULT_SETS_TARGET) * musclesOf(prefs).length, ...setsPerWeek)) * 100}%`, background: "var(--ok)" }} />
                </div>
              ))}
            </div>
            {!setsPerWeek.some(Boolean) && <p className="muted tiny">Add exercises (sets × reps) to your workouts to fill this.</p>}
          </div>
          <div>
            <h3>Protein per day (14 days) · target {pTarget} g</h3>
            <div className="bars small-bars">
              {last14.map((d) => {
                const g = proteinOn(d, meals);
                return (
                  <div key={d} className="bar-col" title={`${d}: ${g} g`}>
                    <div className="bar-fill" style={{ height: `${Math.min(100, (g / (pTarget * 1.3)) * 100)}%`, background: g >= pTarget ? "var(--ok)" : g ? "#f59e0b" : "transparent" }} />
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3>Eating (last 7 days)</h3>
            {recentMeals.length ? (
              <>
                <div className="stackbar">
                  {(Object.keys(Q) as MealQuality[]).map((q) => (
                    <div key={q} style={{ flex: qCount(q), background: q === "great" ? "#10b981" : q === "ok" ? "#eab308" : "#ef4444" }} />
                  ))}
                </div>
                <p className="muted small">
                  {Math.round((qCount("great") / recentMeals.length) * 100)}% healthy · {recentMeals.length} meals · 
                  {qCount("junk")} junk
                </p>
              </>
            ) : (
              <Empty>No meals logged this week.</Empty>
            )}
          </div>
        </div>
      </section>

      {editingWorkout && <WorkoutEditor w={editingWorkout} onClose={() => setEditingWorkout(null)} />}
      {editingMeal && <MealEditor meal={editingMeal} onClose={() => setEditingMeal(null)} />}
    </div>
  );
}

function LineChart({ points }: { points: { d: string; v: number }[] }) {
  const W = 300;
  const H = 110;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const pad = (max - min) * 0.15 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const xs = (i: number) => (i / (points.length - 1)) * (W - 20) + 10;
  const ys = (v: number) => H - 10 - ((v - lo) / (hi - lo)) * (H - 20);
  const path = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(p.v).toFixed(1)}`).join(" ");
  const diff = points[points.length - 1].v - points[0].v;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="line-chart">
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.d} cx={xs(i)} cy={ys(p.v)} r="3" fill="var(--accent)">
            <title>{`${p.d}: ${p.v}`}</title>
          </circle>
        ))}
      </svg>
      <p className="muted small">
        {points[points.length - 1].v} kg · {diff >= 0 ? "+" : ""}
        {diff.toFixed(1)} kg over {points.length} weigh-ins
      </p>
    </div>
  );
}

const INSET = { background: "var(--panel-2)", padding: 12 };
const LINK = { all: "unset", cursor: "pointer", color: "var(--accent)", textDecoration: "underline" } as const;

function WorkoutEditor({ w: initial, onClose }: { w: Workout; onClose: () => void }) {
  const { put, del, data, prefs, setPrefs } = useStore();
  const tags = useList("tags").filter((t) => !t.archived);
  const [w, setW] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTag, setNewTag] = useState("__new");
  const [newEmoji, setNewEmoji] = useState("🥊");
  const isNew = !data.workouts[w.id] || data.workouts[w.id].del;
  const types = prefs.workoutTypes ?? DEFAULT_WORKOUT_TYPES;
  const shown = types.some((t) => t.name === w.type) ? types : [...types, { name: w.type, tagId: null }];
  const setEx = (i: number, patch: Partial<Exercise>) => setW({ ...w, exercises: w.exercises.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const liveTag = (id: string | null | undefined) => (id && data.tags[id] && !data.tags[id].del ? id : null);
  const defaultTag = liveTag(prefs.workoutTagId);
  const tagFor = (typeName: string) => liveTag(types.find((t) => t.name === typeName)?.tagId) ?? defaultTag;
  const tagLabel = (id: string | null) => (id ? `${data.tags[id]?.emoji ?? ""} ${data.tags[id]?.name ?? "?"}` : "no tag");

  const save = () => {
    put("workouts", w);
    // Also show the workout on the calendar / in Things I Did, under this type's tag.
    const tagId = tagFor(w.type);
    const existing = Object.values(data.entries).find((e) => e.workoutId === w.id && !e.del);
    if (tagId && w.start != null) {
      put("entries", { id: existing?.id ?? uid(), tagId, date: w.date, start: w.start, end: Math.min(w.start + w.durationMins, 24 * 60), note: w.type, taskId: null, source: "workout", workoutId: w.id });
    } else if (existing) del("entries", existing.id);
    if (isNew) celebrate("Workout logged +25 XP", "🏋️");
    onClose();
  };

  const addType = () => {
    const name = newName.trim();
    if (!name || types.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    let tagId: string | null = newTag === "__default" ? null : newTag;
    if (newTag === "__new") {
      tagId = uid();
      put("tags", { id: tagId, name, emoji: newEmoji || "🏅", color: PALETTE[Object.keys(data.tags).length % PALETTE.length], area: "body", weeklyTargetMins: 0, archived: false });
    }
    setPrefs({ workoutTypes: [...types, { name, tagId }] });
    setW({ ...w, type: name });
    setAdding(false);
    setNewName("");
  };

  const updateType = (i: number, patch: Partial<WorkoutType>) => setPrefs({ workoutTypes: types.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const removeType = (i: number) => setPrefs({ workoutTypes: types.filter((_, j) => j !== i) });

  return (
    <Modal title={isNew ? "Log workout" : "Edit workout"} onClose={onClose}>
      <div className="tag-pick">
        {shown.map((t) => (
          <button key={t.name} className={`tag-chip ${w.type === t.name ? "armed" : ""}`} onClick={() => setW({ ...w, type: t.name })}>
            {t.tagId && data.tags[t.tagId] ? `${data.tags[t.tagId].emoji} ` : ""}
            {t.name}
          </button>
        ))}
        <button className="tag-chip add" onClick={() => setAdding(!adding)}>
          + New type
        </button>
      </div>
      <div className="muted tiny">
        Time goes to {tagLabel(tagFor(w.type))} in Things I Did{w.start == null ? " (set a start time to log it)" : ""} ·{" "}
        <button style={LINK} onClick={() => setManaging(!managing)}>
          {managing ? "done" : "manage types"}
        </button>
      </div>

      {adding && (
        <div className="card form" style={INSET}>
          <div className="row wrap">
            <input className="grow" autoFocus placeholder="e.g. Muay Thai, Boxing, Football" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addType()} />
          </div>
          <label>
            Log its time in Things I Did as
            <select value={newTag} onChange={(e) => setNewTag(e.target.value)}>
              <option value="__new">＋ A new tag called “{newName.trim() || "…"}”</option>
              <option value="__default">The default workout tag ({tagLabel(defaultTag)})</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.name}
                </option>
              ))}
            </select>
          </label>
          {newTag === "__new" && (
            <label className="row">
              Emoji
              <input className="emoji-input" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value.slice(0, 4))} />
            </label>
          )}
          <div className="row">
            <button className="btn primary" disabled={!newName.trim() || types.some((t) => t.name.toLowerCase() === newName.trim().toLowerCase())} onClick={addType}>
              Add type
            </button>
            <button className="btn ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {managing && (
        <div className="card" style={INSET}>
          {types.map((t, i) => (
            <div key={t.name} className="row" style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="grow">{t.name}</span>
              <select
                style={{ maxWidth: "55%", fontSize: "0.85rem" }}
                value={t.tagId ?? ""}
                onChange={(e) => {
                  if (e.target.value !== "__new") return updateType(i, { tagId: e.target.value || null });
                  const id = uid();
                  put("tags", { id, name: t.name, emoji: "🏅", color: PALETTE[Object.keys(data.tags).length % PALETTE.length], area: "body", weeklyTargetMins: 0, archived: false });
                  updateType(i, { tagId: id });
                }}
              >
                <option value="">Default ({tagLabel(defaultTag)})</option>
                {!tags.some((tg) => tg.name.toLowerCase() === t.name.toLowerCase()) && <option value="__new">＋ New tag “{t.name}”</option>}
                {tags.map((tg) => (
                  <option key={tg.id} value={tg.id}>
                    {tg.emoji} {tg.name}
                  </option>
                ))}
              </select>
              <button className="btn ghost small" title="Remove type" onClick={() => removeType(i)}>
                ✕
              </button>
            </div>
          ))}
          <p className="muted tiny">Changing a type's tag applies to workouts you save from now on.</p>
        </div>
      )}
      <div className="row wrap">
        <label>
          Date
          <input type="date" value={w.date} onChange={(e) => e.target.value && setW({ ...w, date: e.target.value })} />
        </label>
        <label>
          Start
          <input type="time" value={w.start != null ? fmtTime(w.start) : ""} onChange={(e) => setW({ ...w, start: e.target.value ? parseTime(e.target.value) : null })} />
        </label>
        <label>
          Minutes
          <input type="number" min={1} value={w.durationMins} onChange={(e) => setW({ ...w, durationMins: Number(e.target.value) || 1 })} style={{ width: 90 }} />
        </label>
      </div>
      <label>
        Intensity
        <div className="row">
          {["Easy", "Moderate", "Hard"].map((l, i) => (
            <button key={l} className={`btn small ${w.intensity === i + 1 ? "primary" : ""}`} onClick={() => setW({ ...w, intensity: i + 1 })}>
              {l}
            </button>
          ))}
        </div>
      </label>
      <div>
        <div className="muted small">Exercises (optional)</div>
        {w.exercises.map((x, i) => (
          <div key={i} className="row ex-row">
            <input className="grow" list="ns-exercises" placeholder="Exercise, e.g. Pull-ups" value={x.name} onChange={(e) => setEx(i, { name: e.target.value })} />
            <input type="number" inputMode="numeric" title="sets" value={x.sets} onChange={(e) => setEx(i, { sets: Number(e.target.value) })} />
            ×
            <input type="number" inputMode="numeric" title="reps" value={x.reps} onChange={(e) => setEx(i, { reps: Number(e.target.value) })} />
            <input type="number" inputMode="decimal" title="kg" placeholder="kg" value={x.weight || ""} onChange={(e) => setEx(i, { weight: Number(e.target.value) })} />
            <button className="btn ghost small" onClick={() => setW({ ...w, exercises: w.exercises.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button className="btn ghost small" onClick={() => setW({ ...w, exercises: [...w.exercises, { name: "", sets: 3, reps: 10, weight: 0 }] })}>
          + Add exercise
        </button>
        <datalist id="ns-exercises">
          {[...new Set(Object.values(data.workouts).filter((x) => !x.del).flatMap((x) => x.exercises.map((e) => e.name.trim())).filter(Boolean))].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {w.exercises.length > 0 && <div className="muted tiny">sets × reps · kg (0 = bodyweight). Hard sets count toward each muscle's weekly volume.</div>}
      </div>
      <label>
        Notes
        <input value={w.notes} onChange={(e) => setW({ ...w, notes: e.target.value })} placeholder="How did it feel?" />
      </label>
      <div className="row between">
        <button className="btn primary" onClick={save}>
          Save
        </button>
        {!isNew && (
          <button className="btn ghost danger" onClick={() => { del("workouts", w.id); onClose(); }}>
            Delete
          </button>
        )}
      </div>
    </Modal>
  );
}

function MealEditor({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const { put, del } = useStore();
  const [m, setM] = useState(meal);
  return (
    <Modal title="Edit meal" onClose={onClose}>
      <label>
        What did you eat?
        <input value={m.what} onChange={(e) => setM({ ...m, what: e.target.value })} />
      </label>
      <div className="row wrap">
        {(Object.keys(Q) as MealQuality[]).map((q) => (
          <button key={q} className={`btn small ${m.quality === q ? "primary" : ""}`} onClick={() => setM({ ...m, quality: q })}>
            {Q[q].emoji} {Q[q].label}
          </button>
        ))}
      </div>
      <div className="row wrap">
        <label>
          Meal
          <select value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value as Meal["kind"] })}>
            {["breakfast", "lunch", "snack", "dinner"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={m.date} onChange={(e) => e.target.value && setM({ ...m, date: e.target.value })} />
        </label>
        <label>
          Time
          <input type="time" value={fmtTime(m.time)} onChange={(e) => e.target.value && setM({ ...m, time: parseTime(e.target.value) })} />
        </label>
        <label>
          Protein (g)
          <input type="number" inputMode="numeric" value={m.protein ?? ""} onChange={(e) => setM({ ...m, protein: e.target.value ? Number(e.target.value) : null })} style={{ width: 100 }} />
        </label>
      </div>
      <div className="row between">
        <button className="btn primary" disabled={!m.what.trim()} onClick={() => { put("meals", { ...m, what: m.what.trim() }); onClose(); }}>
          Save
        </button>
        <button className="btn ghost danger" onClick={() => { del("meals", m.id); onClose(); }}>
          Delete
        </button>
      </div>
    </Modal>
  );
}

function TrainingCard({ date }: { date: string }) {
  const { prefs, setPrefs } = useStore();
  const workouts = useList("workouts");
  const wk = weekStart(date);
  const tw = trainingWeek(workouts, prefs, wk);
  const target = prefs.setsTarget ?? DEFAULT_SETS_TARGET;
  const prs = personalRecords(workouts).slice(0, 6);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(wk, -7 * (7 - i)));
  const hit = weeks.filter((w) => trainingWeek(workouts, prefs, w).sessions >= 3).length;
  const max = Math.max(target * 2, ...tw.perMuscle.values());
  return (
    <section className="card">
      <div className="card-head">
        <h2>🥋 Training this week</h2>
        <span className="chip ok" title="Weeks with 3+ sessions, out of the last 8">
          {hit}/8 weeks with 3+ sessions
        </span>
      </div>
      <div className="grid-2">
        <div>
          <h3>Hard sets per muscle · target {target}+</h3>
          {[...tw.perMuscle.entries()].map(([m, n]) => (
            <div key={m} className="muscle-row">
              <div className="row between small">
                <span>{m}</span>
                <b>{n}</b>
              </div>
              <div className="bar thin target-bar">
                <div style={{ width: `${Math.min(100, (n / max) * 100)}%`, background: n >= target ? "var(--ok)" : n ? "var(--warn)" : "transparent" }} />
                <i style={{ left: `${(target / max) * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="muted tiny">
            {tw.sessions} session{tw.sessions === 1 ? "" : "s"} · {tw.sets} hard sets. Around 10+ hard sets per muscle a week grows more muscle (Schoenfeld 2017).
          </p>
          {tw.unknown.length > 0 && (
            <div className="small">
              <span className="muted">Which muscle?</span>
              {tw.unknown.slice(0, 6).map((name) => (
                <div key={name} className="row">
                  <span className="grow">{name}</span>
                  <select value={muscleFor(name, prefs) ?? ""} onChange={(e) => setPrefs({ exerciseMuscles: { ...(prefs.exerciseMuscles ?? {}), [name.toLowerCase()]: e.target.value } })}>
                    <option value="">choose…</option>
                    {musclesOf(prefs).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3>🏆 PR board</h3>
          {!prs.length && <Empty>Log exercises with reps (and kg) in a workout. Your best sets show up here.</Empty>}
          {prs.map((p) => (
            <div key={p.name} className="pr-row">
              <div className="row between small">
                <span>
                  {p.name} {p.date >= addDays(todayStr(), -6) && <span className="chip ok">NEW PR</span>}
                </span>
                <b>{p.weight ? `${p.weight} kg × ${p.reps}` : `${p.reps} reps`}</b>
              </div>
              <div className="muted tiny">Next time try: {nextTarget(p)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProteinCard({ date }: { date: string }) {
  const { prefs, put } = useStore();
  const meals = useList("meals");
  const healthDays = useList("healthDays");
  const target = proteinTargetOf(prefs, healthDays);
  const got = proteinOn(date, meals);
  const today = todayStr();
  const week = dateRange(addDays(date, -6), date).map((d) => proteinOn(d, meals));
  const avg = Math.round(week.reduce((a, b) => a + b, 0) / 7);
  const hitDays = week.filter((g) => g >= target).length;
  const byKind = (["breakfast", "lunch", "snack", "dinner"] as const).map((k) => [k, meals.filter((m) => m.date === date && m.kind === k).reduce((n, m) => n + (m.protein ?? 0), 0)] as const);
  const add = (f: { emoji: string; label: string; grams: number }) => {
    const t = date === today ? nowMins() : 13 * 60;
    put("meals", { id: uid(), date, time: t, kind: mealKindFor(t), what: `${f.emoji} ${f.label}`, quality: "great", protein: f.grams });
    celebrate(`+${f.grams} g protein`, f.emoji);
  };
  const frac = Math.min(1, got / target);
  return (
    <section className="card">
      <div className="card-head">
        <h2>🍗 Protein</h2>
        <span className="muted small" title="1.6 g per kg of body weight a day is where muscle gains level off (Morton 2018). Change it in Settings.">
          target {target} g
        </span>
      </div>
      <div className="protein-top">
        <div className="protein-ring" style={{ background: `conic-gradient(var(--ok) 0 ${frac * 100}%, var(--panel-2) 0)` }}>
          <span>
            <b>{got}</b>
            <small>/ {target} g</small>
          </span>
        </div>
        <div className="grow">
          <div className="muted small">{got >= target ? "✅ Target hit. Strong." : `${target - got} g to go · aim for 25–40 g per meal`}</div>
          <div className="chip-row">
            {foodsOf(prefs).map((f) => (
              <button key={f.label} className="mini-chip" onClick={() => add(f)}>
                {f.emoji} {f.label} +{f.grams}g
              </button>
            ))}
          </div>
          <div className="row wrap small muted">
            {byKind.map(([k, g]) => (
              <span key={k}>
                {k}: <b>{g ? `${g} g` : "–"}</b>
                {g >= 25 ? " ✅" : ""}
              </span>
            ))}
          </div>
          <div className="muted tiny">
            7-day average {avg} g/day · target hit {hitDays}/7 days · edit foods in Settings
          </div>
        </div>
      </div>
    </section>
  );
}
