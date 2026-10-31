import { useEffect, useState } from "react";
import type { Timer } from "./types";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const elapsedMs = (t: Timer, now: number) => Math.max(0, (t.pausedAt ?? now) - t.startedAt - t.pausedMs);
export const remainingMs = (t: Timer, now: number) => (t.plannedMins ?? 0) * 60000 - elapsedMs(t, now);

export function fmtClock(ms: number) {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${neg ? "+" : ""}${h ? `${h}:${mm}` : mm}:${ss}`;
}

/** Display string: countdown for focus sessions, stopwatch otherwise. */
export const timerDisplay = (t: Timer, now: number) => (t.plannedMins ? fmtClock(remainingMs(t, now)) : fmtClock(elapsedMs(t, now)));

export function newTimer(opts: { label: string; tagId: string | null; taskId?: string | null; plannedMins: number | null }): Timer {
  if (opts.plannedMins && "Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  return { id: "timer", u: 0, running: true, tagId: opts.tagId, taskId: opts.taskId ?? null, label: opts.label, plannedMins: opts.plannedMins, startedAt: Date.now(), pausedAt: null, pausedMs: 0 };
}

export function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = [660, 880, 990][i];
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.7);
    });
  } catch {
    /* audio unavailable */
  }
}
