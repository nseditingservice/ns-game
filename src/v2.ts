// NS Game 2.0 helpers: defaults for everything the player can edit, plus
// derived stats (training volume, PRs, protein, battles, Things).
import { useMemo } from "react";
import { useList, useStore } from "./store";
import type { Data, Battle, Entry, HealthDay, Meal, PillarDef, Prefs, Tag, Thing, Timer, Urge, Workout } from "./types";
import { addDays, todayStr, weekStart } from "./dates";

export const DEFAULT_PENALTY = 40;
export const DEFAULT_MUSCLES = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"];
export const DEFAULT_SETS_TARGET = 10;
export const DEFAULT_ESTIMATES = [15, 30, 60, 120, 240, 360, 480];
export const DEFAULT_PROTEIN_FOODS = [
  { emoji: "🥚", label: "3 eggs", grams: 18 },
  { emoji: "🥛", label: "Whey scoop", grams: 24 },
  { emoji: "🍗", label: "Chicken 150g", grams: 45 },
  { emoji: "🧀", label: "Paneer 100g", grams: 18 },
  { emoji: "🫘", label: "Dal bowl", grams: 12 },
  { emoji: "🥣", label: "Greek yogurt", grams: 15 },
  { emoji: "🐟", label: "Fish 150g", grams: 33 },
  { emoji: "🌱", label: "Soya chunks 50g", grams: 26 },
];
export const DEFAULT_TRIGGERS = ["🌙 Late night", "😔 Lonely", "😩 Tired", "😤 Angry", "🍔 Hungry", "🥱 Bored", "🛏️ In bed", "📱 Notification", "😰 Stressed"];
const yearStartStr = () => `${new Date().getFullYear()}-01-01`;
export const DEFAULT_PILLARS: PillarDef[] = [
  { id: "body", label: "Body", emoji: "🥋", color: "#f43f5e", source: "body", target: 365 },
  { id: "wealth", label: "Wealth", emoji: "💰", color: "#fbbf24", source: "money", target: 100000, current: 0 },
  { id: "mind", label: "Mind", emoji: "🧘", color: "#38bdf8", source: "mind", target: 900 },
];
/** Fill in targets for pillars saved by earlier builds. */
function withDefaults(p: PillarDef): PillarDef {
  const q = p.id === "wealth" && p.source === "quest" && !p.questId ? { ...p, source: "money" as const } : p;
  if (q.source === "money") return { target: 100000, current: 0, ...q };
  // Mind goal default went from 365 to 900 points (≈ a full year at 2–3 points a day), unless you set it yourself.
  if (q.source === "mind" && q.target === 365 && !q.targetEdited) return withDefaults({ ...q, target: 900 });
  if (q.source === "body" || q.source === "mind") return { target: 365, start: yearStartStr(), ...q, ...(q.start ? {} : { start: yearStartStr() }) };
  return q;
}
export const DASH_CARDS: { id: string; label: string }[] = [
  { id: "hero", label: "Level, stats & pillars" },
  { id: "tasks", label: "📋 Today's tasks" },
  { id: "habits", label: "✅ Today's habits" },
  { id: "now", label: "What are you doing now?" },
  { id: "quests", label: "⚔️ Active quests" },
  { id: "waste", label: "⏳ Time I could have said NO to" },
  { id: "vision", label: "🌌 Vision board" },
  { id: "learn", label: "🖋️ What did I learn today?" },
];

/** Card order with any cards added in later versions appended. */
export function dashLayout(prefs: Prefs) {
  const saved = (prefs.dashCards ?? []).filter((c) => DASH_CARDS.some((d) => d.id === c.id));
  for (const d of DASH_CARDS) if (!saved.some((c) => c.id === d.id)) saved.push({ id: d.id, hidden: false });
  return saved;
}

export const penaltyOf = (p: Prefs) => p.mustDoPenalty ?? DEFAULT_PENALTY;
export const musclesOf = (p: Prefs) => (p.muscles?.length ? p.muscles : DEFAULT_MUSCLES);
export const estimatesOf = (p: Prefs) => (p.estimatePresets?.length ? p.estimatePresets : DEFAULT_ESTIMATES);
export const foodsOf = (p: Prefs) => p.proteinFoods ?? DEFAULT_PROTEIN_FOODS;
export const triggersOf = (p: Prefs) => (p.urgeTriggers?.length ? p.urgeTriggers : DEFAULT_TRIGGERS);
export const pillarsOf = (p: Prefs) => (p.pillars?.length ? p.pillars : DEFAULT_PILLARS).map(withDefaults);

// ---------- Task estimates ----------

/** "90" → 90 · "1.5h" → 90 · "2h30" / "2h 30m" → 150 · "45m" → 45 · "3d" → 3 work days of 8h. */
export function parseEstimate(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const m = s.match(/^(?:(\d+(?:\.\d+)?)d)?(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m?)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const mins = Number(m[1] ?? 0) * 8 * 60 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return mins > 0 ? Math.round(mins) : null;
}
export function fmtEstimate(mins: number): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

// ---------- Training ----------

const MUSCLE_GUESS: [RegExp, string][] = [
  [/plank|crunch|sit.?up|\babs?\b|core|leg raise|hollow|neck|grip/, "Core"],
  [/push.?up|bench|chest|fly|dip/, "Chest"],
  [/pull.?up|chin.?up|row|lat|deadlift|back/, "Back"],
  [/squat|lunge|leg|calf|hamstring|glute|step.?up|jump/, "Legs"],
  [/shoulder|overhead|ohp|military|lateral|raise|handstand|pike/, "Shoulders"],
  [/curl|bicep|tricep|extension|arm/, "Arms"],
];

export function muscleFor(name: string, prefs: Prefs): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const set = prefs.exerciseMuscles?.[key];
  if (set) return set;
  const muscles = musclesOf(prefs);
  for (const [re, m] of MUSCLE_GUESS) if (re.test(key) && muscles.includes(m)) return m;
  return null;
}

export function trainingWeek(workouts: Workout[], prefs: Prefs, from: string) {
  const to = addDays(from, 6);
  const perMuscle = new Map<string, number>(musclesOf(prefs).map((m) => [m, 0]));
  const unknown = new Set<string>();
  let sets = 0;
  let sessions = 0;
  for (const w of workouts) {
    if (w.date < from || w.date > to) continue;
    sessions++;
    for (const x of w.exercises) {
      if (!x.name.trim() || !x.sets) continue;
      sets += x.sets;
      const m = muscleFor(x.name, prefs);
      if (m && perMuscle.has(m)) perMuscle.set(m, perMuscle.get(m)! + x.sets);
      else unknown.add(x.name.trim());
    }
  }
  return { perMuscle, unknown: [...unknown], sets, sessions };
}

export interface PR {
  name: string;
  weight: number;
  reps: number;
  date: string;
}
/** Best set per exercise: heaviest weight (then most reps); bodyweight moves: most reps. */
export function personalRecords(workouts: Workout[]): PR[] {
  const best = new Map<string, PR>();
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sorted)
    for (const x of w.exercises) {
      const key = x.name.trim().toLowerCase();
      if (!key || !x.reps) continue;
      const cur = best.get(key);
      const better = !cur || x.weight > cur.weight || (x.weight === cur.weight && x.reps > cur.reps);
      if (better) best.set(key, { name: x.name.trim(), weight: x.weight || 0, reps: x.reps, date: w.date });
    }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date));
}
export const nextTarget = (pr: PR) => (pr.weight ? `${pr.weight + 2.5} kg × ${pr.reps}` : `${pr.reps + 1} reps`);

// ---------- Protein ----------

export const proteinOn = (date: string, meals: Meal[]) => meals.filter((m) => m.date === date).reduce((n, m) => n + (m.protein ?? 0), 0);
export function latestWeight(days: HealthDay[]): number | null {
  const w = days.filter((d) => d.weight).sort((a, b) => b.date.localeCompare(a.date))[0];
  return w?.weight ?? null;
}
export function proteinTargetOf(prefs: Prefs, days: HealthDay[]) {
  if (prefs.proteinTarget) return prefs.proteinTarget;
  const w = latestWeight(days);
  return w ? Math.round(w * 1.6) : 110;
}

// ---------- Battles ----------

export const splitTriggers = (t: string) =>
  (t || "")
    .split(/[,;\n+&/]|\band\b/i)
    .map((x) => x.trim().replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter((x) => x.length > 1);

export function battleStats(b: Battle, urges: Urge[], entries: Entry[], tags: Map<string, Tag>, today = todayStr()) {
  const mine = urges.filter((u) => u.kind === "urge" && u.battleId === b.id).sort((a, c) => a.at - c.at);
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const inWeek = (u: Urge, w: string) => u.date >= w && u.date <= addDays(w, 6);
  const lapses = mine.filter((u) => u.outcome === "gave");
  const lastLapse = lapses[lapses.length - 1];
  const cleanFrom = lastLapse ? lastLapse.date : b.startDate;
  const daysClean = Math.max(0, Math.round((Date.parse(today) - Date.parse(cleanFrom)) / 864e5));
  // Best clean run between lapses (in days).
  let best = 0;
  let prev = b.startDate;
  for (const l of lapses) {
    best = Math.max(best, Math.round((Date.parse(l.date) - Date.parse(prev)) / 864e5));
    prev = l.date;
  }
  best = Math.max(best, daysClean);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, -7 * (7 - i)));
  const urgesPerWeek = weeks.map((w) => mine.filter((u) => inWeek(u, w)).length);
  const triggers = new Map<string, number>();
  // Triggers are free text ("tired, alone in bed, after 11pm"): count each part separately.
  for (const u of mine)
    for (const part of splitTriggers(u.trigger)) {
      const k = part.toLowerCase();
      triggers.set(k, (triggers.get(k) ?? 0) + 1);
    }
  const minsIn = (w: string) =>
    entries
      .filter((e) => e.date >= w && e.date <= addDays(w, 6) && (b.tagIds.length ? b.tagIds.includes(e.tagId) : (e.wasted ?? tags.get(e.tagId)?.wasted)))
      .reduce((n, e) => n + Math.max(0, e.end - e.start), 0);
  return {
    daysClean,
    best,
    week: mine.filter((u) => inWeek(u, thisWeek)),
    lastWeekCount: mine.filter((u) => inWeek(u, lastWeek)).length,
    lapsesThisWeek: mine.filter((u) => inWeek(u, thisWeek) && u.outcome === "gave").length,
    urgesPerWeek,
    weeks,
    topTriggers: [...triggers.entries()].sort((a, c) => c[1] - a[1]).slice(0, 3),
    minsPerWeek: weeks.map(minsIn),
  };
}

// ---------- Things (formerly "projects") ----------

export const thingKey = (name: string) => name.trim().toLowerCase();

export function useThings() {
  const things = useList("things");
  return useMemo(() => {
    const m = new Map<string, Thing>();
    for (const t of things) m.set(thingKey(t.name), t);
    return m;
  }, [things]);
}
export function thingIcon(name: string, things: Map<string, Thing>) {
  return things.get(thingKey(name))?.emoji ?? "🗂️";
}

/** Rename a Thing everywhere it's used (entries, tasks, timer). */
export function useRenameThing() {
  const { data, putMany, put } = useStore();
  return (from: string, to: string) => {
    const k = thingKey(from);
    const nt = to.trim();
    if (!nt || k === thingKey(nt)) return;
    const live = <T extends { del?: boolean; project?: string }>(r: Record<string, T>) => Object.values(r).filter((x) => !x.del && x.project && thingKey(x.project) === k);
    const es = live(data.entries);
    if (es.length) putMany("entries", es.map((e) => ({ ...e, project: nt })));
    const ts = live(data.tasks);
    if (ts.length) putMany("tasks", ts.map((t) => ({ ...t, project: nt })));
    const timer = data.meta.timer as Timer | undefined;
    if (timer && !timer.del && timer.project && thingKey(timer.project) === k) put("meta", { ...timer, project: nt });
  };
}

// ---------- Mind pillar ----------

/** Points that grow the Mind bar. Slips never subtract: a lapse resets "days clean", not your progress. */
export const MIND_POINTS = { study: 1, learned: 1, atlasIdea: 1, book: 5, executed: 3, surfed: 2, cleanDay: 1, reduceWeek: 5 } as const;

export function mindPoints(d: Data, from: string, today = todayStr()) {
  const alive = <T extends { del?: boolean }>(r: Record<string, T> | undefined) => Object.values(r ?? {}).filter((x) => !x.del);
  const learned = alive(d.journal).filter((j) => j.date >= from && j.learned?.trim()).length;
  const atlasIdeas = alive(d.ideas).filter((i) => i.date >= from).length;
  const books = alive(d.library).filter((b) => b.status === "done" && b.finishedAt && b.finishedAt >= from).length;
  const executed = alive(d.sparks).filter((s) => s.done && s.doneAt && s.doneAt >= from).length;
  const urges = alive(d.urges);
  const surfed = urges.filter((u) => u.date >= from && u.kind === "urge" && u.outcome === "surfed").length;
  const tags = new Map(alive(d.tags).map((t) => [t.id, t]));
  const entries = alive(d.entries);
  // Study days: 15+ min logged on Mind & Learning tags (Reading, Learning…) count automatically.
  const studyMins = new Map<string, number>();
  for (const e of entries) {
    if (e.date < from || tags.get(e.tagId)?.area !== "mind" || (e.wasted ?? tags.get(e.tagId)?.wasted)) continue;
    studyMins.set(e.date, (studyMins.get(e.date) ?? 0) + Math.max(0, e.end - e.start));
  }
  const study = [...studyMins.values()].filter((m) => m >= 15).length;
  let cleanDays = 0;
  let reduceWeeks = 0;
  for (const b of alive(d.battles)) {
    const start = b.startDate > from ? b.startDate : from;
    if (b.kind === "quit") {
      // Every finished day without a slip counts.
      const slipDays = new Set(urges.filter((u) => u.battleId === b.id && u.outcome === "gave").map((u) => u.date));
      for (let x = start; x < today; x = addDays(x, 1)) if (!slipDays.has(x)) cleanDays++;
    } else if (b.weeklyLimitMins > 0) {
      // Every finished week at or under the limit counts.
      for (let w = weekStart(start) < start ? addDays(weekStart(start), 7) : weekStart(start); addDays(w, 6) < today; w = addDays(w, 7)) {
        const mins = entries
          .filter((e) => e.date >= w && e.date <= addDays(w, 6) && (b.tagIds.length ? b.tagIds.includes(e.tagId) : (e.wasted ?? tags.get(e.tagId)?.wasted)))
          .reduce((n, e) => n + Math.max(0, e.end - e.start), 0);
        if (mins <= b.weeklyLimitMins) reduceWeeks++;
      }
    }
  }
  const P = MIND_POINTS;
  const parts = [
    { label: "📖 Things learned", n: learned, pts: learned * P.learned },
    { label: "📚 Study days (15+ min reading / learning)", n: study, pts: study * P.study },
    { label: "🌌 Atlas ideas", n: atlasIdeas, pts: atlasIdeas * P.atlasIdea },
    { label: "📚 Books finished", n: books, pts: books * P.book },
    { label: "💡 Ideas executed", n: executed, pts: executed * P.executed },
    { label: "🌊 Urges ridden out", n: surfed, pts: surfed * P.surfed },
    { label: "⚔️ Clean days (quit battles)", n: cleanDays, pts: cleanDays * P.cleanDay },
    { label: "📉 Weeks under limit (reduce battles)", n: reduceWeeks, pts: reduceWeeks * P.reduceWeek },
  ];
  return { parts, total: parts.reduce((n, p) => n + p.pts, 0) };
}

// ---------- Wealth pillar ----------

/** Money from quests: sums what you logged in $ quests since `from` ("latest" quests like MRR count their latest value). */
export function questMoney(d: Data, pick: "all" | "none" | string[] | undefined, from: string) {
  const sel = pick ?? "all";
  if (sel === "none") return { total: 0, parts: [] as { title: string; amount: number }[] };
  const goals = Object.values(d.goals ?? {}).filter((g) => !g.del && g.metric && g.metric.unit === "$" && (sel === "all" || sel.includes(g.id)));
  const logs = Object.values(d.goalLogs ?? {}).filter((l) => !l.del && l.date >= from);
  const parts = goals.map((g) => {
    const mine = logs.filter((l) => l.goalId === g.id).sort((a, b) => a.date.localeCompare(b.date));
    const amount = g.metric!.mode === "latest" ? (mine[mine.length - 1]?.value ?? 0) : mine.reduce((n, l) => n + l.value, 0);
    return { title: g.title, amount };
  });
  return { total: parts.reduce((n, p) => n + p.amount, 0), parts };
}
