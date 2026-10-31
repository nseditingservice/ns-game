import { useStore } from "./store";
import { celebrate } from "./ui";
import { habitStatus, habitStreak, type Index } from "./game";
import type { Habit } from "./types";

const CHEERS = ["Nice!", "Yes!", "Awesome!", "Keep going!", "That's who you are!", "Boom!", "Proud of you!"];

export function useHabitToggle(ix: Index) {
  const { put } = useStore();
  return (h: Habit, date: string, to?: "done" | "skip" | "undone") => {
    const cur = habitStatus(h, date, ix);
    const next = to ?? (cur === "done" ? "undone" : "done");
    put("habitLogs", { id: `${h.id}_${date}`, habitId: h.id, date, status: next });
    if (next === "done" && cur !== "done") {
      const { streak } = habitStreak(h, ix);
      celebrate(`${CHEERS[Math.floor(Math.random() * CHEERS.length)]} +10 XP${streak >= 2 ? ` · 🔥 ${streak + 1}` : ""}`, h.emoji);
    }
  };
}
