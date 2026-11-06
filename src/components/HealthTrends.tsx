import { useList, useStore } from "../store";
import type { MealQuality } from "../types";
import { addDays, dateRange, fmtDay, todayStr, weekStart } from "../dates";
import { waterMl } from "../water";
import { proteinOn, proteinTargetOf } from "../v2";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Last 14 days as bars with a dashed goal line and day letters underneath. */
function GoalBars({ days, values, goal, unit, color }: { days: string[]; values: (number | null)[]; goal: number; unit: string; color: string }) {
  const max = Math.max(goal * 1.25, ...values.map((v) => v ?? 0));
  const today = todayStr();
  return (
    <div className="goal-bars">
      <div className="goal-bars-plot">
        <div className="goal-line" style={{ bottom: `${(goal / max) * 100}%` }}>
          <span>
            goal {goal}
            {unit}
          </span>
        </div>
        {values.map((v, i) => (
          <div key={days[i]} className="gb-col" title={`${fmtDay(days[i])}: ${v == null ? "not logged" : `${round1(v)} ${unit}`}`}>
            {v == null || v === 0 ? <div className="gb-empty" /> : <div className="gb-fill" style={{ height: `${(v / max) * 100}%`, background: v >= goal ? "var(--ok)" : color }} />}
          </div>
        ))}
      </div>
      <div className="gb-labels">
        {days.map((d) => (
          <span key={d} className={d === today ? "today-label" : ""}>
            {fmtDay(d, { weekday: "narrow" })}
          </span>
        ))}
      </div>
    </div>
  );
}

function Trend({ icon, title, big, sub, children }: { icon: string; title: string; big: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="trend">
      <div className="muted small">
        {icon} {title}
      </div>
      <div className="trend-big">{big}</div>
      <div className="small trend-sub">{sub}</div>
      {children}
    </div>
  );
}

export function HealthTrends() {
  const { prefs } = useStore();
  const healthDays = useList("healthDays");
  const meals = useList("meals");
  const workouts = useList("workouts");
  const today = todayStr();
  const hmap = new Map(healthDays.map((h) => [h.date, h]));
  const days14 = dateRange(addDays(today, -13), today);
  const days7 = days14.slice(-7);

  // Weight
  const weights = dateRange(addDays(today, -29), today)
    .map((d) => ({ d, v: hmap.get(d)?.weight ?? null }))
    .filter((x): x is { d: string; v: number } => x.v != null);
  const wNow = weights[weights.length - 1]?.v;
  const wDiff = weights.length >= 2 ? round1(weights[weights.length - 1].v - weights[0].v) : null;

  // Sleep
  const sleepGoal = 7;
  const sleep14 = days14.map((d) => hmap.get(d)?.sleepHours ?? null);
  const sleep7 = sleep14.slice(-7).filter((v): v is number => !!v);
  const sleepHit = sleep7.filter((v) => v >= sleepGoal).length;

  // Water
  const waterGoal = prefs.waterGoalL ?? 3;
  const water14 = days14.map((d) => {
    const ml = waterMl(hmap.get(d));
    return ml ? ml / 1000 : null;
  });
  const water7 = water14.slice(-7).filter((v): v is number => !!v);

  // Protein
  const pGoal = proteinTargetOf(prefs, healthDays);
  const prot14 = days14.map((d) => proteinOn(d, meals) || null);
  const prot7 = days7.map((d) => proteinOn(d, meals));

  // Workouts
  const wDays = new Set(workouts.map((w) => w.date));
  const gridStart = addDays(weekStart(today), -21);
  const grid = dateRange(gridStart, addDays(weekStart(today), 6));
  const thisWeek = workouts.filter((w) => w.date >= weekStart(today)).length;
  const thisYear = workouts.filter((w) => w.date >= `${today.slice(0, 4)}-01-01`).length;

  // Eating
  const recent = meals.filter((m) => m.date >= days7[0]);
  const q = (k: MealQuality) => recent.filter((m) => m.quality === k).length;

  return (
    <section className="card">
      <h2>Trends</h2>
      <div className="trends-grid">
        <Trend icon="⚖️" title="Weight" big={wNow != null ? `${wNow} kg` : "–"} sub={wDiff == null ? "Weigh in a few times to see your trend." : `${wDiff > 0 ? "▲ +" : wDiff < 0 ? "▼ " : ""}${wDiff} kg in the last 30 days`}>
          {weights.length >= 2 && <WeightLine points={weights} />}
        </Trend>

        <Trend icon="😴" title="Sleep" big={sleep7.length ? `${round1(avg(sleep7))} h` : "–"} sub={sleep7.length ? `average last 7 nights · ${sleepHit} of ${sleep7.length} nights were ${sleepGoal}h+` : "Log your sleep in the daily check-in."}>
          <GoalBars days={days14} values={sleep14} goal={sleepGoal} unit="h" color="#f59e0b" />
        </Trend>

        <Trend icon="💧" title="Water" big={water7.length ? `${round1(avg(water7))} L` : "–"} sub={water7.length ? `average per day (last 7) · goal hit ${water7.filter((v) => v >= waterGoal).length}/7 days` : "Tap +250 ml in the check-in when you drink."}>
          <GoalBars days={days14} values={water14} goal={waterGoal} unit="L" color="#7dd3fc" />
        </Trend>

        <Trend icon="🍗" title="Protein" big={`${Math.round(avg(prot7))} g`} sub={`average per day (last 7) · goal ${pGoal} g hit ${prot7.filter((g) => g >= pGoal).length}/7 days`}>
          <GoalBars days={days14} values={prot14} goal={pGoal} unit="g" color="#f59e0b" />
        </Trend>

        <Trend icon="🏋️" title="Workouts" big={`${thisWeek} this week`} sub={`${thisYear} workouts this year · green = a day you trained`}>
          <div className="workout-grid">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} className="muted tiny wg-head">
                {d}
              </span>
            ))}
            {grid.map((d) => (
              <span key={d} className={`wg-day ${wDays.has(d) ? "on" : ""} ${d > today ? "future" : ""} ${d === today ? "is-today" : ""}`} title={d}>
                {wDays.has(d) ? "✓" : ""}
              </span>
            ))}
          </div>
        </Trend>

        <Trend icon="🍽️" title="Eating" big={recent.length ? `${Math.round((q("great") / recent.length) * 100)}% healthy` : "–"} sub={recent.length ? `last 7 days · 🟢 ${q("great")} healthy · 🟡 ${q("ok")} okay · 🔴 ${q("junk")} junk` : "No meals logged this week."}>
          {recent.length > 0 && (
            <div className="stackbar">
              <div style={{ flex: q("great"), background: "#10b981" }} />
              <div style={{ flex: q("ok"), background: "#eab308" }} />
              <div style={{ flex: q("junk"), background: "#ef4444" }} />
            </div>
          )}
        </Trend>
      </div>
    </section>
  );
}

function WeightLine({ points }: { points: { d: string; v: number }[] }) {
  const W = 300;
  const H = 90;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const pad = (max - min) * 0.2 || 0.5;
  const lo = min - pad;
  const hi = max + pad;
  const xs = (i: number) => (i / (points.length - 1)) * (W - 50) + 8;
  const ys = (v: number) => H - 8 - ((v - lo) / (hi - lo)) * (H - 16);
  const path = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(p.v).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="line-chart">
        <text x={W - 4} y={ys(max) + 4} textAnchor="end" className="axis-label">
          {max} kg
        </text>
        {max !== min && (
          <text x={W - 4} y={ys(min) + 4} textAnchor="end" className="axis-label">
            {min} kg
          </text>
        )}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.d} cx={xs(i)} cy={ys(p.v)} r="3" fill="var(--accent)">
            <title>{`${fmtDay(p.d)}: ${p.v} kg`}</title>
          </circle>
        ))}
      </svg>
      <div className="row between muted tiny">
        <span>{fmtDay(points[0].d, { day: "numeric", month: "short" })}</span>
        <span>{fmtDay(points[points.length - 1].d, { day: "numeric", month: "short" })}</span>
      </div>
    </div>
  );
}
