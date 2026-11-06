// Every synced record carries `u` (last-updated epoch ms) and an optional
// `del` tombstone so devices can merge with last-write-wins.
export interface Rec {
  id: string;
  u: number;
  del?: boolean;
}

export const SAID_NO_TAG_ID = "tag-said-no";
export const DEFAULT_WASTE_LIMIT = 60;

// Life areas are user-editable (Settings → Life areas). These are the defaults.
export type Area = string;
export interface AreaDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
}
export const DEFAULT_AREAS: AreaDef[] = [
  { id: "body", label: "Body & Health", emoji: "💪", color: "#10b981" },
  { id: "mind", label: "Mind & Learning", emoji: "🧠", color: "#6366f1" },
  { id: "work", label: "Career & Work", emoji: "💼", color: "#0ea5e9" },
  { id: "money", label: "Money", emoji: "💰", color: "#eab308" },
  { id: "people", label: "Relationships", emoji: "❤️", color: "#ec4899" },
  { id: "fun", label: "Fun & Rest", emoji: "🎮", color: "#f97316" },
  { id: "spirit", label: "Purpose & Spirit", emoji: "🌿", color: "#14b8a6" },
  { id: "home", label: "Home & Chores", emoji: "🏠", color: "#8b5cf6" },
];

// Live lookups, kept in sync with the user's settings by the store.
// Unknown ids (e.g. an area that was deleted) read as "Other" instead of crashing.
export let AREAS: string[] = [];
const areaMap: Record<string, AreaDef> = {};
export const AREA_INFO = new Proxy(areaMap, {
  get: (t, k: string) => t[k] ?? { id: k, label: "Other", emoji: "❔", color: "#94a3b8" },
}) as Record<string, AreaDef>;
export function setAreaDefs(defs: AreaDef[]) {
  AREAS = defs.map((d) => d.id);
  for (const k of Object.keys(areaMap)) delete areaMap[k];
  for (const d of defs) areaMap[d.id] = d;
}
setAreaDefs(DEFAULT_AREAS);

export interface Season extends Rec {
  name: string;
  start: string;
  end: string;
}

export interface Goal extends Rec {
  seasonId: string; // "" = ongoing quest (not tied to a season)
  title: string;
  why: string;
  color: string;
  area: Area;
  done: boolean;
  /** How progress is measured. Missing = progress from completed tasks. */
  metric?: GoalMetric;
  milestones?: Milestone[];
  hero?: string; // your character on the map
  boss?: string; // what waits at the end
  deadline?: string; // optional YYYY-MM-DD
}

export interface GoalMetric {
  unit: string; // "$" for money (US dollars), or "kg", "clients", "km"…
  target: number;
  /** total: add up all logs · monthly/weekly: add up logs in the current month/week ·
   *  latest: the most recent value counts (e.g. body weight, MRR) */
  mode: "total" | "monthly" | "weekly" | "latest";
  start: number; // starting value (for total/latest)
}

export interface Milestone {
  id: string;
  at: number; // fraction 0–1 of the way to the target
  name: string;
  reward: string;
}

export interface GoalLog extends Rec {
  goalId: string;
  date: string;
  value: number;
  note: string;
}

/** Polymath: a field of interest, fed by the time on its tags. */
export interface Domain extends Rec {
  name: string;
  emoji: string;
  color: string;
  tagIds: string[];
  projects: string[]; // project names that count toward this domain
  why: string;
}

/** Commonplace-book entry. */
export interface Idea extends Rec {
  date: string;
  text: string;
  source: string;
  domainIds: string[];
  links: string[]; // other idea ids
}

/** An actionable idea ("Ideas" section): captured, then executed. */
export interface Spark extends Rec {
  text: string;
  date: string; // captured
  done: boolean; // executed
  doneAt?: string; // YYYY-MM-DD executed
  rating?: 1 | 2 | 3; // potential (simple ICE)
  note?: string;
  taskId?: string; // task created from this idea
}

/** Feynman-style favourite problem. */
export interface Problem extends Rec {
  text: string;
  domainIds: string[];
  notes: string;
  status: "open" | "solved";
  createdAt: string;
}

export interface LibraryItem extends Rec {
  title: string;
  kind: "book" | "course" | "video" | "podcast" | "article" | "paper";
  creator: string;
  domainIds: string[];
  status: "queue" | "active" | "done";
  rating: number | null;
  takeaways: string;
  finishedAt?: string;
}

export interface Task extends Rec {
  goalId: string | null;
  title: string;
  week: string; // Monday of the week it belongs to (derived from due date when set)
  estimateMins: number;
  done: boolean;
  doneAt?: string;
  // ---- To-do features (all optional so older tasks keep working) ----
  due?: string; // YYYY-MM-DD; none = Inbox
  priority?: 1 | 2 | 3; // 1 = high
  notes?: string;
  subtasks?: { id: string; title: string; done: boolean }[];
  repeat?: "day" | "weekday" | "week" | "month";
  frog?: string; // date this task is the "frog" (most important task)
  tagId?: string | null; // where focus time goes
  project?: string;
  createdAt?: string;
}

/** A planned block on the calendar (the "Plan" lane). */
export interface Plan extends Rec {
  date: string;
  start: number;
  end: number;
  title: string;
  taskId: string | null;
  goalId: string | null;
  tagId: string | null;
  source: "manual" | "ai";
}

/** A tag = an activity you do ("Reading", "Gym", "Coding"). */
export interface Tag extends Rec {
  name: string;
  emoji: string;
  color: string;
  area: Area;
  weeklyTargetMins: number; // 0 = no target
  archived: boolean;
  /** Time on this tag counts as wasted ("I could have said NO"). */
  wasted?: boolean;
}

/** Something you actually did (the "Did" lane). The core life log. */
export interface Entry extends Rec {
  tagId: string;
  date: string;
  start: number;
  end: number;
  note: string;
  taskId: string | null;
  source: "manual" | "timer" | "focus" | "workout";
  workoutId?: string;
  /** What exactly: project / client / topic, e.g. "Zen Media House". */
  project?: string;
  /** Per-entry override: true = "I could have said NO", false = not wasted. Undefined = follow the tag. */
  wasted?: boolean;
}

export type HabitLink =
  | { kind: "manual" }
  | { kind: "tag"; tagId: string; minMins: number }
  | { kind: "workout" }
  | { kind: "meals"; min: number }
  | { kind: "healthyMeals"; min: number }
  | { kind: "water"; min: number; liters?: number } // liters; old habits used glasses in `min`
  | { kind: "sleep"; minHours: number }
  | { kind: "focus"; minMins: number }
  | { kind: "weight" }
  | { kind: "wasteLimit"; maxMins: number };

export interface Habit extends Rec {
  name: string;
  emoji: string;
  identity: string; // "I am someone who…"
  anchor: string; // "After I…"
  tiny: string; // 2-minute version
  area: Area;
  days: number[]; // 0=Mon … 6=Sun
  link: HabitLink;
  archived: boolean;
  createdAt: string; // YYYY-MM-DD
  /** Hard Mode: missing it costs XP. */
  mustDo?: boolean;
  /** Date must-do was switched on (penalties only count from here). */
  mustDoSince?: string;
}

/** id = `${habitId}_${date}` */
export interface HabitLog extends Rec {
  habitId: string;
  date: string;
  status: "done" | "skip" | "undone";
}

/** id = date */
export interface HealthDay extends Rec {
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  weight: number | null;
  /** Legacy: glasses of water (250 ml each). New data uses waterMl. */
  water: number;
  waterMl?: number;
  steps: number | null;
  energy: number | null;
  mood: number | null;
  notes: string;
}

export interface Exercise {
  name: string;
  sets: number;
  reps: number;
  weight: number;
}

export interface Workout extends Rec {
  date: string;
  type: string;
  start: number | null;
  durationMins: number;
  intensity: number; // 1 easy … 3 hard
  exercises: Exercise[];
  notes: string;
}

export type MealQuality = "great" | "ok" | "junk";
export interface Meal extends Rec {
  date: string;
  time: number;
  kind: "breakfast" | "lunch" | "dinner" | "snack";
  what: string;
  quality: MealQuality;
  protein: number | null;
}

export interface Review extends Rec {
  week: string;
  wins: string;
  challenges: string;
  lessons: string;
  nextFocus: string;
  coachFeedback?: string;
  coachSuggestions?: string[];
}

/** Daily journal. id = date */
export interface Journal extends Rec {
  date: string;
  learned: string;
  grateful: string;
  thoughts: string;
}

/** Monthly Wheel of Life self-rating. id = YYYY-MM */
export interface Wheel extends Rec {
  month: string;
  scores: Partial<Record<Area, number>>;
}

export interface Prefs extends Rec {
  name: string;
  dayStart: number;
  dayEnd: number;
  focusMins: number;
  currentSeasonId: string | null;
  workoutTagId: string | null;
  /** Workout types shown on the Health page; each can log time to its own tag. */
  workoutTypes?: WorkoutType[];
  accent?: string;
  waterGoalL?: number;
  areas?: AreaDef[];
  wasteLimitMins?: number; // daily limit for wasted time
  // ---- NS Game 2.0 (all optional: older data keeps working) ----
  mustDoPenalty?: number; // XP lost per missed must-do habit (default 40)
  dashCards?: { id: string; hidden: boolean }[];
  pillars?: PillarDef[];
  proteinTarget?: number; // grams per day
  proteinFoods?: { emoji: string; label: string; grams: number }[];
  muscles?: string[];
  exerciseMuscles?: Record<string, string>; // lower-case exercise name → muscle
  setsTarget?: number; // hard sets per muscle per week
  estimatePresets?: number[]; // minutes
  top4By?: "things" | "tags";
  top4Hidden?: string[];
  urgeTriggers?: string[];
}

export interface PillarDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
  source: "body" | "mind" | "quest" | "money";
  questId?: string;
  target?: number; // body: workouts · mind: learnings + urges surfed · money: $
  start?: string; // count from this date (body / mind)
  current?: number; // money: where you are now ($)
}

/** Looks for a "Thing" (what used to be called a project). Keyed by name; entries keep storing the name. */
export interface Thing extends Rec {
  name: string;
  emoji: string;
  color: string;
  archived?: boolean;
}

/** A bad habit you're fighting. */
export interface Battle extends Rec {
  name: string;
  emoji: string;
  kind: "quit" | "reduce";
  tagIds: string[]; // reduce: time on these tags counts toward the weekly limit
  weeklyLimitMins: number;
  replacement: string;
  friction: { id: string; text: string; done: boolean }[];
  startDate: string;
  archived: boolean;
}

/** An urge (or a moment you reacted instead of responding). */
export interface Urge extends Rec {
  date: string;
  at: number; // epoch ms
  kind: "urge" | "reacted";
  battleId: string | null;
  intensity: number | null;
  trigger: string;
  outcome: "surfed" | "gave" | null;
  note: string;
}

/** The vision board picture. id = "board" */
export interface Vision extends Rec {
  image: string; // data URL (JPEG)
  title: string;
}

export interface WorkoutType {
  name: string;
  tagId: string | null; // null = use the default workout tag
}

/** A running timer, synced so you can start on PC and stop on phone. */
export interface Timer extends Rec {
  running: boolean;
  tagId: string | null;
  taskId: string | null;
  label: string;
  plannedMins: number | null; // null = open-ended stopwatch
  project?: string;
  startedAt: number;
  pausedAt: number | null;
  pausedMs: number;
}

export interface Data {
  seasons: Record<string, Season>;
  goals: Record<string, Goal>;
  tasks: Record<string, Task>;
  plans: Record<string, Plan>;
  tags: Record<string, Tag>;
  entries: Record<string, Entry>;
  habits: Record<string, Habit>;
  habitLogs: Record<string, HabitLog>;
  healthDays: Record<string, HealthDay>;
  workouts: Record<string, Workout>;
  meals: Record<string, Meal>;
  reviews: Record<string, Review>;
  wheels: Record<string, Wheel>;
  journal: Record<string, Journal>;
  goalLogs: Record<string, GoalLog>;
  domains: Record<string, Domain>;
  ideas: Record<string, Idea>;
  problems: Record<string, Problem>;
  library: Record<string, LibraryItem>;
  sparks: Record<string, Spark>;
  things: Record<string, Thing>;
  battles: Record<string, Battle>;
  urges: Record<string, Urge>;
  vision: Record<string, Vision>;
  meta: Record<string, Prefs | Timer>;
}
export type Col = keyof Data;
export const COLS: Col[] = ["seasons", "goals", "tasks", "plans", "tags", "entries", "habits", "habitLogs", "healthDays", "workouts", "meals", "reviews", "wheels", "journal", "goalLogs", "domains", "ideas", "problems", "library", "sparks", "things", "battles", "urges", "vision", "meta"];
export type ItemOf<C extends Col> = Data[C][string];

/** Device-only settings (never synced). */
export interface Local {
  apiKey: string;
  firebaseConfig: string;
  lastSync: number;
  lastBackup?: number;
  dirty: string[]; // `${col}/${id}` waiting to upload
}

export type Page = "today" | "calendar" | "did" | "habits" | "health" | "goals" | "focus" | "review" | "journal" | "trophies" | "atlas" | "tasks" | "ideas" | "settings" | "more";
