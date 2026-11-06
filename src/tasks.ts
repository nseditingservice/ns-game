import { parseEstimate } from "./v2";
// To-do helpers: quick-capture parsing, ordering, repeats, completion.
import { useStore, uid } from "./store";
import { addDays, addMonths, fmtDay, todayStr, weekStart, weekdayIdx } from "./dates";
import type { Task } from "./types";
import { celebrate } from "./ui";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/**
 * "Edit reel tomorrow !1 ~2h #Zen Media House" →
 * { title: "Edit reel", due: <tomorrow>, priority: 1, estimateMins: 120, project: "Zen Media House" }
 */
export function parseQuick(input: string, today = todayStr()) {
  let text = ` ${input.trim()} `;
  let due: string | undefined;
  let priority: 1 | 2 | 3 | undefined;
  let estimateMins: number | undefined;
  let project: string | undefined;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      fn(m);
      text = text.replace(m[0], " ");
    }
  };
  take(/\s#([^!~#]+?)(?=\s[!~]|\s(?:today|tomorrow|tmr|next week|in \d+ days?)\b|\s*$)/i, (m) => (project = m[1].trim()));
  take(/\s!([123])(?=\s)/, (m) => (priority = Number(m[1]) as 1 | 2 | 3));
  take(/\s~(\d+h\d+m?|\d+(?:\.\d+)?d)(?=\s)/i, (m) => (estimateMins = parseEstimate(m[1]) ?? undefined));
  take(/\s~(\d+(?:\.\d+)?)\s*(m|min|mins|h|hr|hrs)?(?=\s)/i, (m) => (estimateMins = Math.round(Number(m[1]) * (/^h/i.test(m[2] ?? "") ? 60 : m[2] ? 1 : Number(m[1]) <= 8 ? 60 : 1))));
  take(/\s(today|tod)(?=\s)/i, () => (due = today));
  take(/\s(tomorrow|tmr|tmrw)(?=\s)/i, () => (due = addDays(today, 1)));
  take(/\snext week(?=\s)/i, () => (due = addDays(weekStart(today), 7)));
  take(/\sin (\d+) days?(?=\s)/i, (m) => (due = addDays(today, Number(m[1]))));
  take(/\s(?:on\s)?(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?(?=\s)/i, (m) => {
    const idx = DAYS.findIndex((d) => d.startsWith(m[1].toLowerCase().slice(0, 3)));
    const diff = (idx - weekdayIdx(today) + 7) % 7 || 7;
    due = addDays(today, diff);
  });
  return { title: text.replace(/\s+/g, " ").trim(), due, priority, estimateMins, project };
}

export function newTask(fields: Partial<Task> & { title: string }, today = todayStr()): Task {
  const due = fields.due;
  return {
    id: uid(),
    u: 0,
    goalId: null,
    week: weekStart(due ?? today),
    estimateMins: 30,
    done: false,
    createdAt: today,
    ...fields,
  };
}

export const isOverdue = (t: Task, today = todayStr()) => !t.done && !!t.due && t.due < today;
export const isFrog = (t: Task, today = todayStr()) => t.frog === today && !t.done;

export function dueLabel(t: Task, today = todayStr()) {
  if (!t.due) return "";
  if (t.due === today) return "Today";
  if (t.due === addDays(today, 1)) return "Tomorrow";
  if (t.due === addDays(today, -1)) return "Yesterday";
  const diff = Math.round((new Date(t.due).getTime() - new Date(today).getTime()) / 864e5);
  if (diff > 1 && diff < 7) return fmtDay(t.due, { weekday: "long" });
  return fmtDay(t.due, { day: "numeric", month: "short" });
}

/** Frog first, then priority, then due date, then oldest. */
export function sortTasks(list: Task[], today = todayStr()) {
  return [...list].sort(
    (a, b) =>
      Number(isFrog(b, today)) - Number(isFrog(a, today)) ||
      (a.priority ?? 4) - (b.priority ?? 4) ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
}

export function nextDue(from: string, repeat: NonNullable<Task["repeat"]>) {
  if (repeat === "day") return addDays(from, 1);
  if (repeat === "week") return addDays(from, 7);
  if (repeat === "month") {
    const day = Number(from.slice(8));
    const m = addMonths(from, 1);
    const last = Number(addDays(addMonths(m, 1), -1).slice(8));
    return `${m.slice(0, 8)}${String(Math.min(day, last)).padStart(2, "0")}`;
  }
  let d = addDays(from, 1);
  while (weekdayIdx(d) > 4) d = addDays(d, 1);
  return d;
}

/** Complete / un-complete a task everywhere (repeats roll forward, celebrations). */
export function useTaskActions() {
  const { put, putMany } = useStore();
  return {
    toggle(t: Task) {
      const today = todayStr();
      if (t.done) {
        put("tasks", { ...t, done: false, doneAt: undefined });
        return;
      }
      const done = { ...t, done: true, doneAt: new Date().toISOString() };
      const extra: Task[] = [];
      if (t.repeat) {
        const base = t.due && t.due > today ? t.due : t.due ?? today;
        const due = nextDue(base < today ? today : base, t.repeat);
        extra.push({ ...newTask({ ...t, title: t.title, due }), id: uid(), done: false, doneAt: undefined, frog: undefined, subtasks: t.subtasks?.map((s) => ({ ...s, done: false })), week: weekStart(due) });
      }
      putMany("tasks", [done, ...extra]);
      if (t.frog === today) celebrate("Frog eaten! +25 XP", "🐸");
      else celebrate(t.priority === 1 ? "High-priority task done! +10 XP" : "Task done +10 XP", "✅");
    },
    setFrog(t: Task) {
      const today = todayStr();
      put("tasks", { ...t, frog: t.frog === today ? undefined : today, due: t.due && t.due <= today ? t.due : today, week: weekStart(today) });
    },
  };
}
