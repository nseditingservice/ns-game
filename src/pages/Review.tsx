import { useState } from "react";
import { EditAreasButton } from "../components/Areas";
import { useStore } from "../store";
import { AREAS, AREA_INFO, type Area, type Review } from "../types";
import { addDays, addMonths, dateRange, fmtDay, fmtHours, todayStr, weekStart } from "../dates";
import { entryMins, habitStatus, isScheduled, isWasted, levelFor, useIndex, useXp } from "../game";
import { coachReview } from "../ai";
import { celebrate } from "../ui";

const FIELDS: { key: "wins" | "challenges" | "lessons" | "nextFocus"; label: string; hint: string }[] = [
  { key: "wins", label: "🏆 Wins", hint: "What went well? What are you proud of?" },
  { key: "challenges", label: "🧱 Challenges", hint: "What got in the way? Where did time leak?" },
  { key: "lessons", label: "💡 Lessons", hint: "What would you do differently?" },
  { key: "nextFocus", label: "🎯 Next week's focus", hint: "The 1–2 things that matter most next week." },
];

function Radar({ series, max }: { series: { values: Partial<Record<Area, number>>; color: string; fill?: boolean }[]; max: number }) {
  const S = 260;
  const c = S / 2;
  const r = c - 46;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / AREAS.length - Math.PI / 2;
    return [c + Math.cos(a) * r * (v / max), c + Math.sin(a) * r * (v / max)];
  };
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="radar">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={AREAS.map((_, i) => pt(i, max * f).join(",")).join(" ")} className="radar-grid" />
      ))}
      {AREAS.map((a, i) => {
        const [x, y] = pt(i, max * 1.22);
        return (
          <text key={a} x={x} y={y} className="radar-label">
            {AREA_INFO[a].emoji}
          </text>
        );
      })}
      {series.map((s, k) => (
        <polygon key={k} points={AREAS.map((a, i) => pt(i, Math.min(s.values[a] ?? 0, max)).join(",")).join(" ")} style={{ stroke: s.color, fill: s.fill ? `${s.color}33` : "none", strokeDasharray: s.fill ? "" : "4 3" }} className="radar-shape" />
      ))}
    </svg>
  );
}

export default function ReviewPage() {
  const { data, put, local } = useStore();
  const ix = useIndex();
  const xp = useXp();
  const [week, setWeek] = useState(weekStart());
  const end = addDays(week, 6);
  const days = dateRange(week, end);
  const review: Review = (data.reviews[week] && !data.reviews[week].del ? data.reviews[week] : null) ?? { id: week, u: 0, week, wins: "", challenges: "", lessons: "", nextFocus: "" };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const entries = days.flatMap((d) => ix.entriesByDate.get(d) ?? []);
  const logged = entries.reduce((n, e) => n + entryMins(e), 0);
  const focus = entries.filter((e) => e.source === "focus").reduce((n, e) => n + entryMins(e), 0);
  const wastedW = entries.filter((e) => isWasted(e, ix.tags)).reduce((n, e) => n + entryMins(e), 0);
  const byTag = new Map<string, number>();
  entries.forEach((e) => byTag.set(e.tagId, (byTag.get(e.tagId) ?? 0) + entryMins(e)));
  const topTags = [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  let sched = 0;
  let doneH = 0;
  for (const d of days) if (d <= todayStr()) for (const h of ix.habits) if (isScheduled(h, d)) { sched++; if (habitStatus(h, d, ix) === "done") doneH++; }
  const workouts = days.flatMap((d) => ix.workoutsByDate.get(d) ?? []);
  const meals = days.flatMap((d) => ix.mealsByDate.get(d) ?? []);
  const healthy = meals.filter((m) => m.quality === "great").length;
  const sleeps = days.map((d) => ix.health.get(d)?.sleepHours).filter((x): x is number => x != null);
  const sleepAvg = sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : 0;
  const tasks = Object.values(data.tasks).filter((t) => !t.del && t.week === week);
  const tagName = (id: string) => `${ix.tags.get(id)?.emoji ?? ""} ${ix.tags.get(id)?.name ?? "?"}`;

  const set = (patch: Partial<Review>) => {
    const wasEmpty = !(review.wins || review.challenges || review.lessons || review.nextFocus);
    put("reviews", { ...review, ...patch });
    if (wasEmpty && Object.values(patch).some(Boolean)) celebrate("Weekly review +50 XP", "📝");
  };

  const coach = async () => {
    setBusy(true);
    setErr("");
    const ctx = `Week of ${week}.
Time logged: ${fmtHours(logged)} (${topTags.map(([t, m]) => `${ix.tags.get(t)?.name}: ${fmtHours(m)}`).join(", ") || "none"}).
Focus: ${fmtHours(focus)}. Wasted (could have said no): ${fmtHours(wastedW)}. Habits: ${doneH}/${sched} done (${ix.habits.map((h) => h.name).join(", ")}).
Workouts: ${workouts.length}. Meals logged: ${meals.length}, healthy: ${healthy}. Avg sleep: ${sleepAvg.toFixed(1)}h.
Tasks: ${tasks.filter((t) => t.done).length}/${tasks.length} done.
Reflection — Wins: ${review.wins || "-"} | Challenges: ${review.challenges || "-"} | Lessons: ${review.lessons || "-"} | Next focus: ${review.nextFocus || "-"}`;
    try {
      const out = await coachReview(local.apiKey, ctx);
      put("reviews", { ...review, coachFeedback: out.feedback, coachSuggestions: out.suggestions });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Wheel of Life (monthly self-rating) ----
  const [wheelAnchor, setWheelAnchor] = useState(todayStr());
  const month = wheelAnchor.slice(0, 7);
  const lastMonth = addMonths(wheelAnchor, -1).slice(0, 7);
  const wheel = (data.wheels[month] && !data.wheels[month].del ? data.wheels[month] : null) ?? { id: month, u: 0, month, scores: {} };
  const prevWheel = data.wheels[lastMonth] && !data.wheels[lastMonth].del ? data.wheels[lastMonth] : null;
  const rate = (a: Area, v: number | null) => {
    const first = !Object.keys(wheel.scores).length;
    const scores = { ...wheel.scores };
    if (v == null) delete scores[a];
    else scores[a] = v;
    put("wheels", { ...wheel, scores });
    if (first && v != null) celebrate("Wheel of Life +30 XP", "🎡");
  };
  const areaLevels = Object.fromEntries(AREAS.map((a) => [a, levelFor(xp.byArea[a], 0.5).level])) as Record<Area, number>;
  const maxLvl = Math.max(5, ...Object.values(areaLevels));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Review</h1>
          <p className="muted">
            {fmtDay(week)} – {fmtDay(end)}
          </p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => setWeek(addDays(week, -7))}>
            ←
          </button>
          <button className="btn ghost" onClick={() => setWeek(weekStart())}>
            This week
          </button>
          <button className="btn ghost" onClick={() => setWeek(addDays(week, 7))}>
            →
          </button>
        </div>
      </header>

      <div className="stat-grid">
        {[
          ["⏱️", fmtHours(logged), "time logged"],
          ["🎯", fmtHours(focus), "focus"],
          ["🚫", fmtHours(wastedW), "could have said NO"],
          ["✅", sched ? `${Math.round((doneH / sched) * 100)}%` : "–", "habits"],
          ["🏋️", String(workouts.length), "workouts"],
          ["🥗", meals.length ? `${Math.round((healthy / meals.length) * 100)}%` : "–", "healthy meals"],
          ["😴", sleepAvg ? `${sleepAvg.toFixed(1)}h` : "–", "avg sleep"],
          ["📌", `${tasks.filter((t) => t.done).length}/${tasks.length}`, "tasks"],
        ].map(([e, v, l]) => (
          <div key={l} className="card stat">
            <div className="stat-num">
              {e} {v}
            </div>
            <div className="muted small">{l}</div>
          </div>
        ))}
      </div>

      {topTags.length > 0 && (
        <section className="card">
          <h2>Where the week went</h2>
          {topTags.map(([t, m]) => (
            <div key={t} className="row between small">
              <span>{tagName(t)}</span>
              <b>{fmtHours(m)}</b>
            </div>
          ))}
        </section>
      )}

      <section className="card form">
        <h2>Reflect</h2>
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <textarea rows={2} placeholder={f.hint} value={review[f.key]} onChange={(e) => set({ [f.key]: e.target.value })} />
          </label>
        ))}
        <div>
          <button className="btn" onClick={coach} disabled={busy}>
            {busy ? "Thinking…" : "✦ AI coach (optional)"}
          </button>
        </div>
        {err && <p className="error">{err}</p>}
        {review.coachFeedback && (
          <div className="coach">
            <p>{review.coachFeedback}</p>
            <ul>
              {review.coachSuggestions?.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="row between">
            <h2>🎡 Wheel of Life · {fmtDay(`${month}-01`, { month: "long", year: "numeric" })}</h2>
            <span className="row">
              <EditAreasButton />
              <button className="btn ghost small" title="Previous month" onClick={() => setWheelAnchor(addMonths(wheelAnchor, -1))}>
                ←
              </button>
              <button className="btn ghost small" title="Next month" disabled={month >= todayStr().slice(0, 7)} onClick={() => setWheelAnchor(addMonths(wheelAnchor, 1))}>
                →
              </button>
            </span>
          </div>
          <p className="muted small">Once a month, rate how satisfied you feel with each area (1–10). Dashed = last month.</p>
          {Object.keys(wheel.scores).length > 0 && (
            <button className="btn ghost small" onClick={() => confirm(`Clear the ${fmtDay(`${month}-01`, { month: "long" })} Wheel of Life rating? (removes its 30 XP)`) && put("wheels", { ...wheel, scores: {} })}>
              Clear {fmtDay(`${month}-01`, { month: "long" })} rating
            </button>
          )}
          <Radar max={10} series={[...(prevWheel ? [{ values: prevWheel.scores, color: "#94a3b8" }] : []), { values: wheel.scores, color: "var(--accent)", fill: true }]} />
          {AREAS.map((a) => (
            <div key={a} className="wheel-row">
              <span>
                {AREA_INFO[a].emoji} {AREA_INFO[a].label}
              </span>
              <select value={wheel.scores[a] ?? ""} onChange={(e) => rate(a, e.target.value ? Number(e.target.value) : null)}>
                <option value="">not rated</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} / 10
                  </option>
                ))}
              </select>
              <b>{wheel.scores[a] ?? "–"}</b>
            </div>
          ))}
        </section>
        <section className="card">
          <div className="row between">
            <h2>⚔️ Character stats</h2>
            <EditAreasButton />
          </div>
          <p className="muted small">Your level in each life area, earned from everything you log. Grow the weak spokes.</p>
          <Radar max={maxLvl} series={[{ values: areaLevels, color: "#f59e0b", fill: true }]} />
          {AREAS.map((a) => {
            const l = levelFor(xp.byArea[a], 0.5);
            return (
              <div key={a} className="wheel-row">
                <span>
                  {AREA_INFO[a].emoji} {AREA_INFO[a].label}
                </span>
                <div className="bar thin grow">
                  <div style={{ width: `${(l.into / l.need) * 100}%`, background: AREA_INFO[a].color }} />
                </div>
                <b>Lv {l.level}</b>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
