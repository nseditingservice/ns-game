// Trophies: meaningful milestones (not badge spam). Progress is derived from your log.
import { useMemo } from "react";
import { useStore } from "./store";
import { AREAS, type Data } from "./types";
import { addDays, weekStart } from "./dates";
import { bestStreak, entryMins, useIndex, useXp, type Index } from "./game";
import { waterMl } from "./water";
import { questXp } from "./quest";

export interface Trophy {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  tier: "bronze" | "silver" | "gold" | "mythic";
  value: number;
  target: number;
}

const alive = <T extends { del?: boolean }>(r: Record<string, T> | undefined) => Object.values(r ?? {}).filter((x) => !x.del);

export function computeTrophies(d: Data, ix: Index, level: number): Trophy[] {
  const entries = alive(d.entries);
  const totalH = entries.reduce((n, e) => n + entryMins(e), 0) / 60;
  const focusH = entries.filter((e) => e.source === "focus").reduce((n, e) => n + entryMins(e), 0) / 60;
  const perTag = new Map<string, number>();
  for (const e of entries) perTag.set(e.tagId, (perTag.get(e.tagId) ?? 0) + entryMins(e) / 60);
  const topTagH = Math.max(0, ...perTag.values());
  const tagsWith10h = [...perTag.values()].filter((h) => h >= 10).length;
  const best = Math.max(0, ...ix.habits.map((h) => bestStreak(h, ix)));
  const workouts = alive(d.workouts).length;
  const healthy = alive(d.meals).filter((m) => m.quality === "great").length;
  const journals = alive(d.journal).filter((j) => j.learned || j.grateful || j.thoughts).length;
  const reviews = alive(d.reviews).filter((r) => r.wins || r.lessons || r.challenges || r.nextFocus).length;
  const goals = alive(d.goals).filter((g) => g.done).length;
  const waterDays = alive(d.healthDays).filter((h) => waterMl(h) >= 2500).length;
  const sleepDays = alive(d.healthDays).filter((h) => (h.sleepHours ?? 0) >= 7).length;
  const projects = new Set(entries.map((e) => e.project?.trim().toLowerCase()).filter(Boolean)).size;
  // Polymath: most life areas touched within any single week.
  const areasByWeek = new Map<string, Set<string>>();
  for (const e of entries) {
    const w = weekStart(e.date);
    const a = ix.tags.get(e.tagId)?.area;
    if (!a) continue;
    if (!areasByWeek.has(w)) areasByWeek.set(w, new Set());
    areasByWeek.get(w)!.add(a);
  }
  const maxAreas = Math.max(0, ...[...areasByWeek.values()].map((s) => s.size));
  // Days logged in a row (any entry).
  const days = new Set(entries.map((e) => e.date));
  let logStreak = 0;
  let run = 0;
  for (const dd of [...days].sort()) {
    run = days.has(addDays(dd, -1)) ? run + 1 : 1;
    logStreak = Math.max(logStreak, run);
  }

  const ideas = alive(d.ideas);
  const crossIdeas = ideas.filter((i) => i.domainIds.length >= 2 || i.links.length).length;
  const booksDone = alive(d.library).filter((b) => b.status === "done").length;
  const problemsN = alive(d.problems).length;
  const domainsN = alive(d.domains).length;
  const qx = questXp(d);
  const checkpoints = qx.filter((x) => x.label.startsWith("Checkpoint")).length;
  const bosses = qx.filter((x) => x.label.startsWith("Boss")).length;
  const T = (id: string, emoji: string, name: string, desc: string, tier: Trophy["tier"], value: number, target: number): Trophy => ({ id, emoji, name, desc, tier, value: Math.min(value, target), target });
  return [
    T("first-log", "🌱", "The First Step", "Log your first activity", "bronze", entries.length, 1),
    T("log-7", "📜", "Chronicler", "Log time 7 days in a row", "silver", logStreak, 7),
    T("log-30", "🏛️", "Historian of the Self", "Log time 30 days in a row", "gold", logStreak, 30),
    T("hours-10", "⏳", "Ten Hours", "Log 10 hours in total", "bronze", totalH, 10),
    T("hours-100", "⌛", "The Hundred", "Log 100 hours in total", "silver", totalH, 100),
    T("hours-1000", "🕰️", "Keeper of Time", "Log 1,000 hours in total", "gold", totalH, 1000),
    T("tag-100", "⚔️", "Centurion", "100 hours on a single tag", "gold", topTagH, 100),
    T("mastery", "🐉", "Path to Mastery", "1,000 hours on a single tag", "mythic", topTagH, 1000),
    T("focus-1", "🎯", "Into the Zone", "Finish a focus session", "bronze", focusH > 0 ? 1 : 0, 1),
    T("focus-50", "🧠", "Deep Diver", "50 hours of focus sessions", "gold", focusH, 50),
    T("streak-7", "🔥", "Kindled", "7-day habit streak", "bronze", best, 7),
    T("streak-30", "🔥", "Unbroken", "30-day habit streak", "silver", best, 30),
    T("streak-100", "☄️", "Iron Will", "100-day habit streak", "gold", best, 100),
    T("workout-10", "🥊", "Warrior Initiate", "Log 10 workouts", "bronze", workouts, 10),
    T("workout-100", "🏆", "Spartan", "Log 100 workouts", "gold", workouts, 100),
    T("healthy-30", "🥗", "Temple Keeper", "30 healthy meals", "silver", healthy, 30),
    T("water-7", "💧", "Like Water", "Drink 2.5 L+ on 7 days", "bronze", waterDays, 7),
    T("sleep-14", "🌙", "Well Rested", "Sleep 7h+ on 14 days", "silver", sleepDays, 14),
    T("journal-7", "🪶", "Stoic Scribe", "Write 7 journal entries", "bronze", journals, 7),
    T("journal-100", "📖", "Meditations", "Write 100 journal entries", "gold", journals, 100),
    T("review-4", "🔍", "Know Thyself", "Write 4 weekly reviews", "silver", reviews, 4),
    T("goal-1", "🏔️", "Summit", "Achieve a goal", "silver", goals, 1),
    T("projects-5", "🗂️", "Many Hats", "Log time on 5 different projects", "bronze", projects, 5),
    T("tags-5x10", "🎭", "Renaissance Mind", "10+ hours on 5 different tags", "gold", tagsWith10h, 5),
    T("polymath", "🌌", "Polymath", `Log time in all ${AREAS.length} life areas in one week`, "mythic", maxAreas, AREAS.length),
    T("quest-cp", "⛺", "Wayfarer", "Reach your first quest checkpoint", "bronze", checkpoints, 1),
    T("quest-boss", "🐲", "Dragonslayer", "Defeat a quest boss", "gold", bosses, 1),
    T("quest-boss-6", "⚔️", "Legend of the Realm", "Defeat 6 quest bosses", "mythic", bosses, 6),
    T("ideas-25", "🪶", "Commonplace", "Capture 25 ideas", "bronze", ideas.length, 25),
    T("medici", "⚡", "The Medici Effect", "10 ideas that connect different fields", "gold", crossIdeas, 10),
    T("library-12", "📚", "Renaissance Library", "Finish 12 books, courses or more", "silver", booksDone, 12),
    T("feynman", "❓", "Feynman's Dozen", "Keep 12 favorite problems", "silver", problemsN, 12),
    T("domains-5", "🌌", "Constellation", "Map 5 domains in your Mind Atlas", "bronze", domainsN, 5),
    T("level-5", "⭐", "Seeker", "Reach level 5", "bronze", level, 5),
    T("level-25", "🌟", "Sage", "Reach level 25", "gold", level, 25),
    T("level-50", "👑", "Philosopher-King", "Reach level 50", "mythic", level, 50),
  ];
}

export function useTrophies() {
  const { data } = useStore();
  const ix = useIndex();
  const xp = useXp();
  return useMemo(() => computeTrophies(data, ix, xp.lvl.level), [data, ix, xp.lvl.level]);
}
