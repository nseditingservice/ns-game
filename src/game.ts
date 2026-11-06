// Derived "game" logic: indexes, habit status & streaks, XP and levels.
// Everything here is computed from the log, never stored, so it can't drift
// between devices.
import { useMemo } from "react";
import { useStore } from "./store";
import { AREAS, type Area, type Data, type Entry, type Habit, type HabitLog, type HealthDay, type Journal, type Meal, type Prefs, type Tag, type Urge, type Workout } from "./types";
import { penaltyOf } from "./v2";
import { waterMl, waterTargetL } from "./water";
import { questXp } from "./quest";
import { addDays, todayStr, weekdayIdx } from "./dates";

export interface Index {
  entriesByDate: Map<string, Entry[]>;
  mealsByDate: Map<string, Meal[]>;
  workoutsByDate: Map<string, Workout[]>;
  health: Map<string, HealthDay>;
  logs: Map<string, HabitLog>;
  habits: Habit[];
  tags: Map<string, Tag>;
  journal: Map<string, Journal>;
  urgesByDate: Map<string, Urge[]>;
  penalty: number;
}

function group<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const arr = m.get(it.date);
    if (arr) arr.push(it);
    else m.set(it.date, [it]);
  }
  return m;
}
const alive = <T extends { del?: boolean }>(r: Record<string, T>) => Object.values(r).filter((x) => !x.del);

export function buildIndex(d: Data): Index {
  return {
    entriesByDate: group(alive(d.entries)),
    mealsByDate: group(alive(d.meals)),
    workoutsByDate: group(alive(d.workouts)),
    health: new Map(alive(d.healthDays).map((h) => [h.date, h])),
    logs: new Map(alive(d.habitLogs).map((l) => [l.id, l])),
    habits: alive(d.habits).filter((h) => !h.archived),
    tags: new Map(alive(d.tags).map((t) => [t.id, t])),
    journal: new Map(alive(d.journal ?? {}).map((j) => [j.date, j])),
    urgesByDate: group(alive(d.urges ?? {})),
    penalty: penaltyOf((d.meta.prefs ?? {}) as Prefs),
  };
}

export function useIndex(): Index {
  const { data } = useStore();
  return useMemo(() => buildIndex(data), [data]);
}

export const entryMins = (e: Entry) => Math.max(0, e.end - e.start);

/** "I could have said NO": the entry's own flag wins, otherwise its tag decides. */
export const isWasted = (e: Entry, tags: Map<string, Tag>) => e.wasted ?? tags.get(e.tagId)?.wasted ?? false;
export const wastedMinsOn = (date: string, ix: Index) => (ix.entriesByDate.get(date) ?? []).filter((e) => isWasted(e, ix.tags)).reduce((n, e) => n + entryMins(e), 0);

// ---------- Habits ----------

export type HabitDayStatus = "done" | "skip" | "missed" | "pending" | "off";

export const isScheduled = (h: Habit, date: string) => date >= h.createdAt && h.days.includes(weekdayIdx(date));

/** Has the linked data met the habit's target on that date? */
export function autoProgress(h: Habit, date: string, ix: Index): { value: number; target: number; unit: string } | null {
  const l = h.link;
  const entries = ix.entriesByDate.get(date) ?? [];
  const meals = ix.mealsByDate.get(date) ?? [];
  const hd = ix.health.get(date);
  switch (l.kind) {
    case "manual":
      return null;
    case "tag":
      return { value: entries.filter((e) => e.tagId === l.tagId).reduce((n, e) => n + entryMins(e), 0), target: l.minMins, unit: "min" };
    case "focus":
      return { value: entries.filter((e) => e.source === "focus").reduce((n, e) => n + entryMins(e), 0), target: l.minMins, unit: "min" };
    case "workout":
      return { value: (ix.workoutsByDate.get(date) ?? []).length, target: 1, unit: "workout" };
    case "meals":
      return { value: meals.length, target: l.min, unit: "meals" };
    case "healthyMeals":
      return { value: meals.filter((m) => m.quality === "great").length, target: l.min, unit: "healthy meals" };
    case "water":
      return { value: waterMl(hd) / 1000, target: waterTargetL(l), unit: "L water" };
    case "sleep":
      return { value: hd?.sleepHours ?? 0, target: l.minHours, unit: "h sleep" };
    case "weight":
      return { value: hd?.weight != null ? 1 : 0, target: 1, unit: "weigh-in" };
    case "wasteLimit":
      return { value: wastedMinsOn(date, ix), target: l.maxMins, unit: "min wasted (max)" };
  }
}

export function habitStatus(h: Habit, date: string, ix: Index, today = todayStr()): HabitDayStatus {
  if (!isScheduled(h, date)) return "off";
  const log = ix.logs.get(`${h.id}_${date}`);
  if (log?.status === "done") return "done";
  if (log?.status === "skip") return "skip";
  if (h.link.kind === "wasteLimit" && log?.status !== "undone") {
    // Judged when the day is over: done if you stayed at or under the limit.
    if (date >= today) return "pending";
    return wastedMinsOn(date, ix) <= h.link.maxMins ? "done" : "missed";
  }
  if (log?.status !== "undone") {
    const p = autoProgress(h, date, ix);
    if (p && p.value >= p.target) return "done";
  }
  return date >= today ? "pending" : "missed";
}

/**
 * "Never miss twice" streak: a single missed day doesn't break the streak
 * (it shows a warning instead); two missed scheduled days in a row do.
 */
export function habitStreak(h: Habit, ix: Index, today = todayStr()) {
  let streak = 0;
  let misses = 0;
  let warn = false;
  let first = true;
  for (let i = 0, d = today; i < 400 && d >= h.createdAt; i++, d = addDays(d, -1)) {
    const s = habitStatus(h, d, ix, today);
    if (s === "off" || s === "skip" || s === "pending") continue;
    if (s === "done") {
      streak++;
      misses = 0;
    } else {
      if (first) warn = true;
      misses++;
      if (misses >= 2) break;
    }
    first = false;
  }
  return { streak, warn: warn && misses < 2 };
}

export function bestStreak(h: Habit, ix: Index, today = todayStr()) {
  let best = 0;
  let cur = 0;
  let misses = 0;
  for (let d = h.createdAt; d <= today; d = addDays(d, 1)) {
    const s = habitStatus(h, d, ix, today);
    if (s === "done") {
      cur++;
      misses = 0;
      best = Math.max(best, cur);
    } else if (s === "missed") {
      misses++;
      if (misses >= 2) cur = 0;
    }
  }
  return best;
}

// ---------- XP ----------

export const XP_RULES = [
  ["Habit completed", "+10"],
  ["Missed must-do habit (Hard Mode, editable)", "−40"],
  ["🌊 Urge surfed (max 5/day)", "+15"],
  ["Perfect day (all habits done)", "+20"],
  ["Every 15 min of time logged", "+1"],
  ["Every 5 min of focus session", "+1"],
  ["Workout logged (max 2/day)", "+25"],
  ["Meal logged (healthy meal +3 more)", "+3"],
  ["Daily health check-in (sleep / weight / mood)", "+5"],
  ["Journal entry", "+10"],
  ["Task completed", "+10"],
  ["💡 Idea captured / executed", "+2 / +20"],
  ["🐸 Frog eaten (today's most important task)", "+15 more"],
  ["Goal achieved", "+200"],
  ["Weekly review written", "+50"],
  ["Monthly Wheel of Life rating", "+30"],
] as const;

export interface XpItem {
  label: string;
  xp: number;
  area: Area;
}
export interface XpDay {
  total: number;
  byArea: Record<Area, number>;
  items: XpItem[];
}

const zeroAreas = () => Object.fromEntries(AREAS.map((a) => [a, 0])) as Record<Area, number>;

/** XP earned on one day, with a line per reason so the player can see why. */
export function dayXp(date: string, ix: Index, today = todayStr()): XpDay {
  const byArea = zeroAreas();
  const items: XpItem[] = [];
  const add = (area: Area, xp: number, label: string, allowNegative = false) => {
    if (xp <= 0 && !(allowNegative && xp < 0)) return;
    byArea[area] = (byArea[area] ?? 0) + xp;
    items.push({ label, xp, area });
  };
  const scheduled = ix.habits.filter((h) => isScheduled(h, date));
  let allDone = scheduled.length > 0;
  let anyDone = false;
  for (const h of scheduled) {
    const s = habitStatus(h, date, ix, today);
    if (s === "done") {
      add(h.area, 10, `Habit: ${h.name}`);
      anyDone = true;
    } else if (s !== "skip") allDone = false;
    // Hard Mode: a missed must-do habit costs XP (only for finished days, from the day it became must-do).
    if (s === "missed" && h.mustDo && date < today && date >= (h.mustDoSince ?? h.createdAt) && ix.penalty > 0) add(h.area, -ix.penalty, `Missed must-do: ${h.name}`, true);
  }
  if (allDone && anyDone) add("spirit", 20, "Perfect day: all habits done");
  let tracked = 0;
  let focus = 0;
  const tagMins = new Map<Area, number>();
  for (const e of ix.entriesByDate.get(date) ?? []) {
    const m = entryMins(e);
    tracked += m;
    if (e.source === "focus") focus += m;
    const a = ix.tags.get(e.tagId)?.area ?? "work";
    tagMins.set(a, (tagMins.get(a) ?? 0) + m);
  }
  // Split logging XP across areas in proportion to time.
  const logXp = Math.floor(Math.min(tracked, 18 * 60) / 15);
  for (const [a, m] of tagMins) add(a, Math.round((logXp * m) / Math.max(tracked, 1)), `Time logged (${Math.round(m)} min)`);
  add("mind", Math.floor(focus / 5), `Focus sessions (${focus} min)`);
  for (const w of (ix.workoutsByDate.get(date) ?? []).slice(0, 2)) add("body", 25, `Workout: ${w.type}`);
  for (const m of (ix.mealsByDate.get(date) ?? []).slice(0, 6)) add("body", m.quality === "great" ? 6 : 3, `Meal: ${m.what}`);
  const hd = ix.health.get(date);
  if (hd && (hd.sleepHours != null || hd.weight != null || hd.mood != null)) add("body", 5, "Health check-in");
  const surfed = (ix.urgesByDate.get(date) ?? []).filter((u) => u.kind === "urge" && u.outcome === "surfed").length;
  if (surfed) add("spirit", Math.min(surfed, 5) * 15, `🌊 Urges surfed (${surfed})`);
  const j = ix.journal.get(date);
  if (j && (j.learned || j.grateful || j.thoughts)) add("mind", 10, "Journal entry");
  return { total: Object.values(byArea).reduce((n, v) => n + v, 0), byArea, items };
}

/** One-off XP that isn't tied to a single day's log (tasks, goals, reviews). */
export function extraXpForDay(date: string, d: Data): XpItem[] {
  const goalArea = new Map(alive(d.goals).map((g) => [g.id, g.area]));
  const out: XpItem[] = [];
  for (const t of alive(d.tasks)) {
    if (!t.done || !t.doneAt || t.doneAt.slice(0, 10) !== date) continue;
    out.push({ label: `Task: ${t.title}`, xp: 10, area: (t.goalId && goalArea.get(t.goalId)) || "work" });
    if (t.frog === date) out.push({ label: `🐸 Frog eaten: ${t.title}`, xp: 15, area: (t.goalId && goalArea.get(t.goalId)) || "work" });
  }
  for (const q of questXp(d)) if (q.date === date) out.push({ label: q.label, xp: q.xp, area: q.area });
  for (const x of polymathXp(d)) if (x.date === date) out.push({ label: x.label, xp: x.xp, area: x.area });
  return out;
}

export function totalXp(d: Data, ix: Index) {
  const goalArea = new Map(alive(d.goals).map((g) => [g.id, g.area]));
  const byArea = zeroAreas();
  const dates = new Set<string>([...ix.entriesByDate.keys(), ...ix.mealsByDate.keys(), ...ix.workoutsByDate.keys(), ...ix.health.keys(), ...ix.journal.keys(), ...ix.urgesByDate.keys()]);
  for (const l of ix.logs.values()) dates.add(l.date);
  for (const h of ix.habits) for (let x = h.createdAt, i = 0; x <= todayStr() && i < 2000; x = addDays(x, 1), i++) dates.add(x);
  const perDay = new Map<string, number>();
  // Full audit trail so the player can always see where every XP point came from.
  const history: { date: string; items: XpItem[] }[] = [];
  const oneOff = (date: string, item: XpItem) => {
    byArea[item.area] = (byArea[item.area] ?? 0) + item.xp;
    history.push({ date, items: [item] });
  };
  for (const date of dates) {
    const x = dayXp(date, ix);
    perDay.set(date, x.total);
    for (const [a, v] of Object.entries(x.byArea)) byArea[a] = (byArea[a] ?? 0) + v;
    if (x.items.length) history.push({ date, items: x.items });
  }
  for (const t of alive(d.tasks)) {
    if (!t.done) continue;
    const date = t.doneAt?.slice(0, 10) ?? t.week;
    oneOff(date, { label: `Task: ${t.title}`, xp: 10, area: (t.goalId && goalArea.get(t.goalId)) || "work" });
    if (t.frog && t.frog === date) oneOff(date, { label: `🐸 Frog eaten: ${t.title}`, xp: 15, area: (t.goalId && goalArea.get(t.goalId)) || "work" });
  }
  for (const g of alive(d.goals)) if (g.done && !g.metric) oneOff(todayStr(), { label: `Goal achieved: ${g.title}`, xp: 200, area: g.area });
  for (const q of questXp(d)) oneOff(q.date, { label: q.label, xp: q.xp, area: q.area });
  for (const x of polymathXp(d)) oneOff(x.date, { label: x.label, xp: x.xp, area: x.area });
  for (const r of alive(d.reviews)) if (r.wins || r.lessons || r.challenges || r.nextFocus) oneOff(r.week, { label: `Weekly review (week of ${r.week})`, xp: 50, area: "mind" });
  for (const w of alive(d.wheels)) if (Object.keys(w.scores).length) oneOff(`${w.month}-01`, { label: `Wheel of Life rating (${w.month})`, xp: 30, area: "spirit" });
  // Merge entries per date, newest first.
  const merged = new Map<string, XpItem[]>();
  for (const h of history) merged.set(h.date, [...(merged.get(h.date) ?? []), ...h.items]);
  const log = [...merged.entries()].map(([date, items]) => ({ date, items, total: items.reduce((n, i) => n + i.xp, 0) })).sort((a, b) => b.date.localeCompare(a.date));
  return { total: Object.values(byArea).reduce((n, v) => n + v, 0), byArea, perDay, log };
}

/** Level curve: you start at level 0; level n → n+1 costs 100 + 50·n XP. */
export function levelFor(xp: number, scale = 1) {
  let level = 0;
  let need = 100 * scale;
  let rest = xp;
  while (rest >= need) {
    rest -= need;
    level++;
    need = (100 + 50 * level) * scale;
  }
  return { level, into: rest, need };
}

// Every 5 levels earns a new title, from Novice to Philosopher-King.
export const TITLES = ["Novice", "Seeker", "Apprentice", "Adept", "Scholar", "Strategist", "Sage", "Master", "Polymath", "Philosopher-King", "Legend"];
export const titleFor = (level: number) => TITLES[Math.min(Math.floor(level / 5), TITLES.length - 1)];

export function useXp() {
  const { data } = useStore();
  const ix = useIndex();
  return useMemo(() => {
    const x = totalXp(data, ix);
    return { ...x, lvl: levelFor(Math.max(0, x.total)) };
  }, [data, ix]);
}

/** Polymath XP: ideas (+5, +5 more if they bridge two domains or link ideas), finished library items (+20). */
export function polymathXp(d: Data): { date: string; label: string; xp: number; area: Area }[] {
  const out: { date: string; label: string; xp: number; area: Area }[] = [];
  for (const i of alive(d.ideas ?? {})) {
    out.push({ date: i.date, label: "Idea captured", xp: 5, area: "mind" });
    if (i.domainIds.length >= 2 || i.links.length) out.push({ date: i.date, label: "Cross-pollination: idea connects fields", xp: 5, area: "mind" });
  }
  for (const b of alive(d.library ?? {})) if (b.status === "done" && b.finishedAt) out.push({ date: b.finishedAt, label: `Finished: ${b.title}`, xp: 20, area: "mind" });
  for (const s of alive(d.sparks ?? {})) {
    out.push({ date: s.date, label: "💡 Idea captured", xp: 2, area: "mind" });
    if (s.done && s.doneAt) out.push({ date: s.doneAt, label: `💡 Idea executed: ${s.text.slice(0, 40)}`, xp: 20, area: "work" });
  }
  return out;
}
