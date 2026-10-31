import { useState } from "react";
import { uid, useList, useStore } from "../store";
import type { Exercise, HealthDay, Meal, MealQuality, Workout } from "../types";
import { addDays, dateRange, fmtDay, fmtTime, nowMins, parseTime, todayStr, weekStart } from "../dates";
import { celebrate, Empty, Modal, Rating } from "../ui";

const WORKOUT_TYPES = ["Strength", "Run", "Walk", "Cycle", "HIIT", "Yoga", "Sport", "Swim", "Stretch", "Other"];
const Q: Record<MealQuality, { emoji: string; label: string }> = { great: { emoji: "🟢", label: "Healthy" }, ok: { emoji: "🟡", label: "Okay" }, junk: { emoji: "🔴", label: "Junk" } };
const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

const blankDay = (date: string): HealthDay => ({ id: date, u: 0, date, sleepHours: null, sleepQuality: null, weight: null, water: 0, steps: null, energy: null, mood: null, notes: "" });
const mealKindFor = (m: number): Meal["kind"] => (m < 10 * 60 + 30 ? "breakfast" : m < 15 * 60 ? "lunch" : m < 17 * 60 + 30 ? "snack" : "dinner");

export default function Health() {
  const { data, put, del } = useStore();
  const [date, setDate] = useState(todayStr());
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
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
            💧 Water (glasses)
            <div className="row">
              <button className="btn" onClick={() => setDay({ water: Math.max(0, hd.water - 1) })}>
                −
              </button>
              <b className="count">{hd.water}</b>
              <button className="btn primary" onClick={() => setDay({ water: hd.water + 1 })}>
                +
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

      <section className="card">
        <h2>🍽️ What I ate</h2>
        <ul className="list">
          {dayMeals.map((m) => (
            <li key={m.id} className="meal-row">
              <span>{Q[m.quality].emoji}</span>
              <span className="time">{fmtTime(m.time)}</span>
              <span className="grow">
                <span className="muted tiny">{m.kind} · </span>
                {m.what}
                {m.protein ? <span className="muted tiny"> · {m.protein}g protein</span> : null}
              </span>
              <button className="btn ghost small" onClick={() => del("meals", m.id)}>
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
            <h3>Workouts per week</h3>
            <div className="bars small-bars">
              {wPerWeek.map((n, i) => (
                <div key={i} className="bar-col" title={`Week of ${weeks[i]}: ${n}`}>
                  <div className="bar-val">{n || ""}</div>
                  <div className="bar-fill" style={{ height: `${(n / Math.max(5, ...wPerWeek)) * 100}%`, background: "var(--ok)" }} />
                </div>
              ))}
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

function WorkoutEditor({ w: initial, onClose }: { w: Workout; onClose: () => void }) {
  const { put, del, data, prefs } = useStore();
  const [w, setW] = useState(initial);
  const isNew = !data.workouts[w.id] || data.workouts[w.id].del;
  const setEx = (i: number, patch: Partial<Exercise>) => setW({ ...w, exercises: w.exercises.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  const save = () => {
    put("workouts", w);
    // Also show the workout on the calendar / in Things I Did.
    const tagId = prefs.workoutTagId && data.tags[prefs.workoutTagId] ? prefs.workoutTagId : null;
    const existing = Object.values(data.entries).find((e) => e.workoutId === w.id && !e.del);
    if (tagId && w.start != null) {
      put("entries", { id: existing?.id ?? uid(), tagId, date: w.date, start: w.start, end: Math.min(w.start + w.durationMins, 24 * 60), note: w.type, taskId: null, source: "workout", workoutId: w.id });
    } else if (existing) del("entries", existing.id);
    if (isNew) celebrate("Workout logged +25 XP", "🏋️");
    onClose();
  };

  return (
    <Modal title={isNew ? "Log workout" : "Edit workout"} onClose={onClose}>
      <div className="tag-pick">
        {WORKOUT_TYPES.map((t) => (
          <button key={t} className={`tag-chip ${w.type === t ? "armed" : ""}`} onClick={() => setW({ ...w, type: t })}>
            {t}
          </button>
        ))}
      </div>
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
            <input className="grow" placeholder="Exercise" value={x.name} onChange={(e) => setEx(i, { name: e.target.value })} />
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
