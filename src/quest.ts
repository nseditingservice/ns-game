// Quest engine: turns a goal + its progress logs into a game state.
import { addDays, daysBetween, fmtDay, monthEnd, monthStart, todayStr, weekStart } from "./dates";
import type { Area, Data, Goal, GoalLog, Milestone, Task } from "./types";
import { uid } from "./store";

export const ZONES = ["The Village", "Whispering Forest", "Mountain Pass", "Iron Fortress", "Shadow Gate", "Sky Bridge", "Ember Wastes", "Crystal Caves"];
export const HEROES = ["🧙", "🥷", "🦸", "🧝", "🤺", "🧑‍🚀", "🐺", "🦅"];
export const BOSSES = ["🐉", "👹", "🏰", "👑", "💎", "🗿", "🌋", "🏆"];
// Money is always US dollars. (Other symbols are still recognised so they'd format sensibly.)
export const MONEY = "$";
export const CURRENCIES = ["$", "₹", "€", "£", "¥"];

/** Evenly spaced checkpoints. `stable` ids are used when a quest has none saved, so they don't change between renders. */
export function defaultMilestones(n = 4, stable = false): Milestone[] {
  return Array.from({ length: n }, (_, i) => ({ id: stable ? `cp-${i}` : uid(), at: (i + 1) / (n + 1), name: ZONES[i + 1] ?? `Checkpoint ${i + 1}`, reward: "" }));
}

/** Always US-style grouping (100,000 not 1,00,000), whatever the device's region. */
export function fmtVal(v: number, unit: string) {
  const abs = Math.abs(v);
  const money = CURRENCIES.includes(unit);
  const cents = Math.round(abs * 100) % 100 !== 0;
  // Money keeps its cents ($1,234.50); other units round big numbers (1,235 km).
  const n = money && cents ? abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : abs >= 1000 || Number.isInteger(abs) ? Math.round(abs).toLocaleString("en-US") : abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const sign = v < 0 ? "-" : "";
  if (!unit) return sign + n;
  return CURRENCIES.includes(unit) ? `${sign}${unit}${n}` : `${sign}${n} ${unit}`;
}

export function periodOf(mode: "monthly" | "weekly", date: string) {
  if (mode === "monthly") return { from: monthStart(date), to: monthEnd(date), label: fmtDay(monthStart(date), { month: "long", year: "numeric" }) };
  const from = weekStart(date);
  return { from, to: addDays(from, 6), label: `Week of ${fmtDay(from, { day: "numeric", month: "short" })}` };
}

const sumLogs = (logs: GoalLog[]) => logs.reduce((n, l) => n + l.value, 0);

export interface QuestState {
  kind: "metric" | "tasks";
  unit: string;
  current: number;
  target: number;
  start: number;
  frac: number; // 0..1 (can exceed 1 when overachieving)
  remaining: number;
  periodLabel: string | null;
  daysLeft: number | null; // days left in period / until deadline (incl. today)
  perDayNeeded: number | null;
  pacePerDay: number | null;
  projected: string | null; // projected finish date at current pace
  milestones: Milestone[];
  reached: Milestone[];
  next: Milestone | null;
  done: boolean;
  history: { label: string; total: number; hit: boolean }[];
  logDays: number; // distinct days with progress logged
  streak: number; // consecutive days with a log (ending today/yesterday)
}

export function questState(goal: Goal, allLogs: GoalLog[], tasks: Task[], today = todayStr()): QuestState {
  const logs = allLogs.filter((l) => l.goalId === goal.id).sort((a, b) => a.date.localeCompare(b.date));
  const milestones = [...(goal.milestones ?? defaultMilestones(4, true))].sort((a, b) => a.at - b.at);
  const days = new Set(logs.map((l) => l.date));
  let streak = 0;
  for (let d = days.has(today) ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) streak++;
  const base = { milestones, logDays: days.size, streak };

  if (!goal.metric) {
    const ts = tasks.filter((t) => t.goalId === goal.id);
    const done = ts.filter((t) => t.done).length;
    const frac = ts.length ? done / ts.length : 0;
    return finish({ ...base, kind: "tasks", unit: "tasks", current: done, target: Math.max(ts.length, 1), start: 0, frac, remaining: ts.length - done, periodLabel: null, daysLeft: goal.deadline ? daysBetween(today, goal.deadline) + 1 : null, perDayNeeded: null, pacePerDay: null, projected: null, history: [] }, goal.done || (ts.length > 0 && done === ts.length));
  }

  const m = goal.metric;
  if (m.mode === "monthly" || m.mode === "weekly") {
    const p = periodOf(m.mode, today);
    const inPeriod = logs.filter((l) => l.date >= p.from && l.date <= p.to);
    const current = sumLogs(inPeriod);
    const daysLeft = daysBetween(today, p.to) + 1;
    const elapsed = daysBetween(p.from, today) + 1;
    const pace = current / elapsed;
    const remaining = Math.max(0, m.target - current);
    const projected = remaining <= 0 ? today : pace > 0 ? addDays(today, Math.ceil(remaining / pace)) : null;
    // History of previous periods (most recent last).
    const history: QuestState["history"] = [];
    let cursor = p.from;
    for (let i = 0; i < 6; i++) {
      const pp = periodOf(m.mode, cursor);
      const total = sumLogs(logs.filter((l) => l.date >= pp.from && l.date <= pp.to));
      history.unshift({ label: m.mode === "monthly" ? fmtDay(pp.from, { month: "short" }) : fmtDay(pp.from, { day: "numeric", month: "short" }), total, hit: total >= m.target });
      cursor = addDays(pp.from, -1);
    }
    return finish({ ...base, kind: "metric", unit: m.unit, current, target: m.target, start: 0, frac: m.target ? current / m.target : 0, remaining, periodLabel: p.label, daysLeft, perDayNeeded: remaining > 0 ? remaining / daysLeft : 0, pacePerDay: pace, projected, history }, current >= m.target);
  }

  // total / latest
  const current = m.mode === "total" ? m.start + sumLogs(logs) : logs.length ? logs[logs.length - 1].value : m.start;
  const span = m.target - m.start;
  const frac = span === 0 ? 1 : (current - m.start) / span;
  const remaining = Math.max(0, span >= 0 ? m.target - current : current - m.target);
  const firstDate = logs[0]?.date ?? today;
  const elapsed = Math.max(1, daysBetween(firstDate, today) + 1);
  const moved = Math.abs(current - m.start);
  const pace = logs.length ? moved / elapsed : null;
  const projected = remaining <= 0 ? today : pace ? addDays(today, Math.ceil(remaining / pace)) : null;
  const daysLeft = goal.deadline ? daysBetween(today, goal.deadline) + 1 : null;
  return finish({ ...base, kind: "metric", unit: m.unit, current, target: m.target, start: m.start, frac, remaining, periodLabel: null, daysLeft, perDayNeeded: daysLeft && daysLeft > 0 && remaining > 0 ? remaining / daysLeft : null, pacePerDay: pace, projected, history: [] }, frac >= 1);

  function finish(s: Omit<QuestState, "reached" | "next" | "done">, done: boolean): QuestState {
    const f = Math.max(0, s.frac);
    const reached = s.milestones.filter((x) => f >= x.at - 1e-9);
    return { ...s, frac: f, reached, next: s.milestones.find((x) => f < x.at - 1e-9) ?? null, done };
  }
}

/**
 * XP from quests, with the date each was earned (so the XP history can show it):
 * +5 per progress log (max 3 per quest per day), +50 per checkpoint reached,
 * +200 when the boss falls (each month/week for recurring quests).
 */
export function questXp(d: Data): { date: string; label: string; xp: number; area: Area }[] {
  const out: { date: string; label: string; xp: number; area: Area }[] = [];
  const logsAll = Object.values(d.goalLogs ?? {}).filter((l) => !l.del);
  for (const g of Object.values(d.goals).filter((x) => !x.del)) {
    if (!g.metric) continue;
    const m = g.metric;
    const logs = logsAll.filter((l) => l.goalId === g.id).sort((a, b) => a.date.localeCompare(b.date) || a.u - b.u);
    const perDay = new Map<string, number>();
    for (const l of logs) {
      const n = perDay.get(l.date) ?? 0;
      perDay.set(l.date, n + 1);
      if (n < 3) out.push({ date: l.date, label: `Quest progress: ${g.title}`, xp: 5, area: g.area });
    }
    const ms = [...(g.milestones ?? defaultMilestones(4, true))].sort((a, b) => a.at - b.at);
    const fracOf = (v: number) => (m.mode === "monthly" || m.mode === "weekly" ? v / (m.target || 1) : m.target === m.start ? 1 : (v - m.start) / (m.target - m.start));
    // Walk through logs in order, noting when each checkpoint / the boss is first passed.
    const award = (seen: Set<string>, frac: number, date: string, tag: string) => {
      for (const x of ms) if (frac >= x.at && !seen.has(x.id)) { seen.add(x.id); out.push({ date, label: `Checkpoint: ${x.name}${tag} (${g.title})`, xp: 50, area: g.area }); }
      if (frac >= 1 && !seen.has("boss")) { seen.add("boss"); out.push({ date, label: `Boss defeated${tag}: ${g.title}`, xp: 200, area: g.area }); }
    };
    if (m.mode === "monthly" || m.mode === "weekly") {
      const byPeriod = new Map<string, { seen: Set<string>; total: number }>();
      for (const l of logs) {
        const p = periodOf(m.mode, l.date);
        const st = byPeriod.get(p.from) ?? { seen: new Set<string>(), total: 0 };
        st.total += l.value;
        byPeriod.set(p.from, st);
        award(st.seen, fracOf(st.total), l.date, ` · ${p.label}`);
      }
    } else {
      const seen = new Set<string>();
      let v = m.start;
      for (const l of logs) {
        v = m.mode === "total" ? v + l.value : l.value;
        award(seen, fracOf(v), l.date, "");
      }
    }
  }
  return out;
}
