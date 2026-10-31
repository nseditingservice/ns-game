import type { HabitLink, HealthDay } from "./types";

/** Water drunk in ml (old data stored glasses of 250 ml). */
export const waterMl = (hd?: HealthDay | null) => (hd ? hd.waterMl ?? (hd.water || 0) * 250 : 0);

export const fmtL = (ml: number) => `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : ml % 100 === 0 ? 1 : 2)} L`;

/** Litres a water habit asks for (old habits stored glasses). */
export const waterTargetL = (l: Extract<HabitLink, { kind: "water" }>) => l.liters ?? l.min * 0.25;
