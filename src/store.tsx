import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { get, set } from "idb-keyval";
import { COLS, type Col, type Data, type ItemOf, type Local, type Prefs, type Tag, type Timer } from "./types";

export type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// Data and device state (incl. the sync cursor) are saved together in ONE
// write, so the sync cursor can never get ahead of the data it refers to.
const STATE_KEY = "nsgame:state";

export const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#64748b"];

export const uid = () => crypto.randomUUID();

function emptyData(): Data {
  return Object.fromEntries(COLS.map((c) => [c, {}])) as unknown as Data;
}

// Seeds use fixed ids so two devices that both start fresh merge cleanly.
const SEED_TAGS: Omit<Tag, "u">[] = [
  { id: "tag-deep-work", name: "Deep Work", emoji: "🎯", color: "#6366f1", area: "work", weeklyTargetMins: 0, archived: false },
  { id: "tag-learning", name: "Learning", emoji: "📚", color: "#0ea5e9", area: "mind", weeklyTargetMins: 0, archived: false },
  { id: "tag-workout", name: "Workout", emoji: "🏋️", color: "#10b981", area: "body", weeklyTargetMins: 0, archived: false },
  { id: "tag-reading", name: "Reading", emoji: "📖", color: "#14b8a6", area: "mind", weeklyTargetMins: 0, archived: false },
  { id: "tag-family", name: "Family & Friends", emoji: "❤️", color: "#ec4899", area: "people", weeklyTargetMins: 0, archived: false },
  { id: "tag-chores", name: "Chores & Errands", emoji: "🧹", color: "#8b5cf6", area: "home", weeklyTargetMins: 0, archived: false },
  { id: "tag-fun", name: "Fun & Rest", emoji: "🎮", color: "#f97316", area: "fun", weeklyTargetMins: 0, archived: false },
  { id: "tag-social-media", name: "Social Media", emoji: "📱", color: "#ef4444", area: "fun", weeklyTargetMins: 0, archived: false },
  { id: "tag-commute", name: "Commute & Travel", emoji: "🚗", color: "#64748b", area: "home", weeklyTargetMins: 0, archived: false },
  { id: "tag-meditation", name: "Meditation & Prayer", emoji: "🧘", color: "#22c55e", area: "spirit", weeklyTargetMins: 0, archived: false },
];

export const DEFAULT_PREFS: Prefs = { id: "prefs", u: 1, name: "", dayStart: 6, dayEnd: 23, focusMins: 50, currentSeasonId: null, workoutTagId: "tag-workout" };

function seed(d: Data): Data {
  for (const t of SEED_TAGS) d.tags[t.id] = { ...t, u: 1 };
  d.meta.prefs = DEFAULT_PREFS;
  return d;
}

const defaultLocal: Local = { apiKey: "", firebaseConfig: "", lastSync: 0, dirty: [] };

interface Store {
  data: Data;
  local: Local;
  prefs: Prefs;
  timer: Timer | null;
  put: <C extends Col>(col: C, item: DistOmit<ItemOf<C>, "u"> & { u?: number }) => void;
  putMany: <C extends Col>(col: C, items: (DistOmit<ItemOf<C>, "u"> & { u?: number })[]) => void;
  del: (col: Col, id: string) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  setLocal: (patch: Partial<Local> | ((l: Local) => Partial<Local>)) => void;
  /** Apply records that came from the cloud. Returns nothing; newer wins. */
  mergeRemote: (recs: { col: Col; item: ItemOf<Col> }[]) => void;
  replaceAll: (d: Data) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [local, setLocalState] = useState<Local>(defaultLocal);
  const saveTimer = useRef<number | undefined>(undefined);
  const firstChange = useRef(0);
  const latest = useRef<{ data: Data; local: Local } | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await get<{ data: Data; local: Local }>(STATE_KEY);
      const base = emptyData();
      setData(saved?.data ? { ...base, ...saved.data } : seed(base));
      if (saved?.local) setLocalState({ ...defaultLocal, ...saved.local });
      // Ask the browser not to evict our data (important on iPhone).
      void navigator.storage?.persist?.();
    })();
  }, []);

  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    firstChange.current = 0;
    if (latest.current) void set(STATE_KEY, latest.current);
  }, []);

  // Debounced save (max 1s delay), plus an immediate save when the app is
  // backgrounded/closed, since iOS may kill a backgrounded web app at any time.
  useEffect(() => {
    if (!data) return;
    latest.current = { data, local };
    const now = Date.now();
    if (!firstChange.current) firstChange.current = now;
    window.clearTimeout(saveTimer.current);
    if (now - firstChange.current > 1000) flush();
    else saveTimer.current = window.setTimeout(flush, 250);
  }, [data, local, flush]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [flush]);

  const markDirty = useCallback((keys: string[]) => {
    setLocalState((l) => ({ ...l, dirty: [...new Set([...l.dirty, ...keys])] }));
  }, []);

  const putMany = useCallback(
    <C extends Col>(col: C, items: (DistOmit<ItemOf<C>, "u"> & { u?: number })[]) => {
      const now = Date.now();
      setData((d) => {
        if (!d) return d;
        const next = { ...d[col] } as Record<string, ItemOf<C>>;
        for (const it of items) next[it.id] = { ...it, u: now } as unknown as ItemOf<C>;
        return { ...d, [col]: next };
      });
      markDirty(items.map((i) => `${col}/${i.id}`));
    },
    [markDirty],
  );

  const delMany = useCallback(
    (pairs: [Col, string][]) => {
      const now = Date.now();
      setData((d) => {
        if (!d) return d;
        const next = { ...d };
        for (const [col, id] of pairs) {
          const cur = next[col][id];
          if (!cur) continue;
          next[col] = { ...next[col], [id]: { ...cur, u: now, del: true } } as never;
        }
        return next;
      });
      markDirty(pairs.map(([c, id]) => `${c}/${id}`));
    },
    [markDirty],
  );

  const store = useMemo<Store | null>(() => {
    if (!data) return null;
    const prefs = { ...DEFAULT_PREFS, ...(data.meta.prefs as Prefs | undefined) };
    const t = data.meta.timer as Timer | undefined;
    const alive = <C extends Col>(col: C) => Object.values(data[col]).filter((x) => !x.del) as ItemOf<C>[];
    return {
      data,
      local,
      prefs,
      timer: t && !t.del && t.running ? t : null,
      putMany,
      put: (col, item) => putMany(col, [item]),
      del: (col, id) => {
        // Cascade so we don't leave orphans behind.
        const pairs: [Col, string][] = [[col, id]];
        if (col === "goals") {
          alive("tasks").filter((x) => x.goalId === id).forEach((x) => pairs.push(["tasks", x.id]));
          alive("goalLogs").filter((x) => x.goalId === id).forEach((x) => pairs.push(["goalLogs", x.id]));
        }
        if (col === "seasons") {
          // Quests outlive seasons: they simply become "ongoing".
          const orphans = alive("goals").filter((g) => g.seasonId === id);
          if (orphans.length) putMany("goals", orphans.map((g) => ({ ...g, seasonId: "" })));
        }
        if (col === "habits") alive("habitLogs").filter((x) => x.habitId === id).forEach((x) => pairs.push(["habitLogs", x.id]));
        if (col === "workouts") alive("entries").filter((x) => x.workoutId === id).forEach((x) => pairs.push(["entries", x.id]));
        delMany(pairs);
      },
      setPrefs: (patch) => putMany("meta", [{ ...prefs, ...patch }]),
      setLocal: (patch) => setLocalState((l) => ({ ...l, ...(typeof patch === "function" ? patch(l) : patch) })),
      mergeRemote: (recs) =>
        setData((d) => {
          if (!d) return d;
          const next = { ...d };
          for (const { col, item } of recs) {
            if (!next[col]) continue;
            const cur = next[col][item.id];
            if (!cur || item.u > cur.u) next[col] = { ...next[col], [item.id]: item } as never;
          }
          return next;
        }),
      replaceAll: (d) => {
        const now = Date.now();
        const base = emptyData();
        for (const c of COLS) {
          for (const [id, it] of Object.entries(d[c] ?? {})) {
            (base[c] as Record<string, unknown>)[id] = { ...it, u: now };
          }
        }
        // Tombstone anything that existed before but isn't in the import.
        for (const c of COLS) for (const id of Object.keys(data[c])) if (!base[c][id]) (base[c] as Record<string, unknown>)[id] = { ...data[c][id], u: now, del: true };
        setData(base);
        markDirty(COLS.flatMap((c) => Object.keys(base[c]).map((id) => `${c}/${id}`)));
      },
    };
  }, [data, local, putMany, delMany, markDirty]);

  if (!store) return <div className="boot">NS Game</div>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

/** Non-deleted items of a collection. */
export function useList<C extends Col>(col: C): ItemOf<C>[] {
  const { data } = useStore();
  return useMemo(() => Object.values(data[col]).filter((x) => !x.del) as ItemOf<C>[], [data, col]);
}

export function useMap<C extends Col>(col: C): Map<string, ItemOf<C>> {
  const list = useList(col);
  return useMemo(() => new Map(list.map((x) => [x.id, x])), [list]);
}
