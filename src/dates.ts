const pad = (n: number) => String(n).padStart(2, "0");

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayStr = () => toDateStr(new Date());

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Monday of the week containing the given date. */
export function weekStart(s: string = todayStr()): string {
  const d = parseDate(s);
  const offset = (d.getDay() + 6) % 7;
  return addDays(s, -offset);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function fmtTime(mins: number): string {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export function parseTime(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtDay(s: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return parseDate(s).toLocaleDateString(undefined, opts);
}

export function quarterRange(today = todayStr()): { name: string; start: string; end: string } {
  const d = parseDate(today);
  const q = Math.floor(d.getMonth() / 3);
  const start = new Date(d.getFullYear(), q * 3, 1);
  const end = new Date(d.getFullYear(), q * 3 + 3, 0);
  return { name: `Q${q + 1} ${d.getFullYear()}`, start: toDateStr(start), end: toDateStr(end) };
}

export function weeksIn(start: string, end: string): string[] {
  const weeks: string[] = [];
  for (let w = weekStart(start); w <= end; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

/** 0 = Monday … 6 = Sunday */
export const weekdayIdx = (s: string) => (parseDate(s).getDay() + 6) % 7;
export const monthStart = (s: string = todayStr()) => s.slice(0, 8) + "01";
export const monthEnd = (s: string = todayStr()) => {
  const d = parseDate(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
export const yearStart = (s: string = todayStr()) => s.slice(0, 4) + "-01-01";
export const yearEnd = (s: string = todayStr()) => s.slice(0, 4) + "-12-31";
export const addMonths = (s: string, n: number) => {
  const d = parseDate(monthStart(s));
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + n, 1));
};
export const nowMins = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export const fmtHours = (mins: number) => (mins >= 600 ? `${Math.round(mins / 60)}h` : mins >= 60 ? `${(mins / 60).toFixed(1).replace(/\.0$/, "")}h` : `${Math.round(mins)}m`);
