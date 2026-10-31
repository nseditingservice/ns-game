import { useEffect, useState } from "react";
import { quoteOfDay } from "./quotes";
import { todayStr } from "./dates";

export interface DailyQuote {
  text: string;
  author: string;
  credit?: { text: string; href: string };
}

const KEY = "nsgame:quotes"; // { [localDate]: DailyQuote } — remembers each day's quote

function readCache(): Record<string, DailyQuote> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function remember(date: string, q: DailyQuote) {
  const all = readCache();
  all[date] = q;
  // Keep the last ~2 years so the Journal can show past days' quotes.
  const keys = Object.keys(all).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 730))) delete all[k];
  localStorage.setItem(KEY, JSON.stringify(all));
}

const local = (date: string): DailyQuote => {
  const [text, author] = quoteOfDay(date);
  return { text, author };
};

async function fetchToday(): Promise<DailyQuote | null> {
  // 1. Quote fetched by the nightly GitHub build (same site → no CORS issues).
  try {
    const res = await fetch(`./quote.json?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      const ageH = (Date.now() - new Date(j.fetchedAt).getTime()) / 36e5;
      if (j.text && ageH < 36) return { text: j.text, author: j.author, credit: j.credit };
    }
  } catch {
    /* fall through */
  }
  // 2. Live philosophy quote straight from the browser.
  try {
    const res = await fetch("https://stoic-quotes.com/api/quote", { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const j = await res.json();
      if (j.text) return { text: j.text, author: j.author || "Unknown", credit: { text: "stoic-quotes.com", href: "https://stoic-quotes.com/" } };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Quote for a given day: online for today (cached all day), remembered for past days, built-in list as fallback. */
export function useDailyQuote(date: string): DailyQuote {
  const [q, setQ] = useState<DailyQuote>(() => readCache()[date] ?? local(date));
  useEffect(() => {
    const cached = readCache()[date];
    setQ(cached ?? local(date));
    if (cached || date !== todayStr()) return;
    // Try the internet at most once per day per session; otherwise keep the built-in quote.
    const tried = `nsgame:quote-tried:${date}`;
    if (sessionStorage.getItem(tried)) return;
    sessionStorage.setItem(tried, "1");
    let alive = true;
    void fetchToday().then((fresh) => {
      if (!fresh) return;
      remember(date, fresh);
      if (alive) setQ(fresh);
    });
    return () => {
      alive = false;
    };
  }, [date]);
  return q;
}
