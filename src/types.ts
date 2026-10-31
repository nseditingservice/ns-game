// Every synced record carries `u` (last-updated epoch ms) and an optional
// `del` tombstone so devices can merge with last-write-wins.
export interface Rec {
  id: string;
  u: number;
  del?: boolean;
}

export const AREAS = ["body", "mind", "work", "money", "people", "fun", "spirit", "home"] as const;
export type Area = (typeof AREAS)[number];
export const AREA_INFO: Record<Area, { label: string; emoji: string; color: string }> = {
  body: { label: "Body & Health", emoji: "💪", color: "#10b981" },
  mind: { label: "Mind & Learning", emoji: "🧠", color: "#6366f1" },
  work: { label: "Career & Work", emoji: "💼", color: "#0ea5e9" },
  money: { label: "Money", emoji: "💰", color: "#eab308" },
  people: { label: "Relationships", emoji: "❤️", color: "#ec4899" },
  fun: { label: "Fun & Rest", emoji: "🎮", color: "#f97316" },
  spirit: { label: "Purpose & Spirit", emoji: "🌿", color: "#14b8a6" },
  home: { label: "Home & Chores", emoji: "🏠", color: "#8b5cf6" },
};

export interface Season extends Rec {
  name: string;
  start: string;
  end: string;
}

export interface Goal extends Rec {
  seasonId: string;
  title: string;
  why: string;
  color: string;
  area: Area;
  done: boolean;
}

export interface Task extends Rec {
  goalId: string | null;
  title: string;
  week: string;
  estimateMins: number;
  done: boolean;
  doneAt?: string;
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
  | { kind: "weight" };

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
  meta: Record<string, Prefs | Timer>;
}
export type Col = keyof Data;
export const COLS: Col[] = ["seasons", "goals", "tasks", "plans", "tags", "entries", "habits", "habitLogs", "healthDays", "workouts", "meals", "reviews", "wheels", "journal", "meta"];
export type ItemOf<C extends Col> = Data[C][string];

/** Device-only settings (never synced). */
export interface Local {
  apiKey: string;
  firebaseConfig: string;
  lastSync: number;
  dirty: string[]; // `${col}/${id}` waiting to upload
}

export type Page = "today" | "calendar" | "did" | "habits" | "health" | "goals" | "focus" | "review" | "journal" | "trophies" | "settings" | "more";
