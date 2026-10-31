import { useState } from "react";
import { useList, useStore } from "../store";
import type { Journal } from "../types";
import { addDays, fmtDay, todayStr } from "../dates";
import { useDailyQuote } from "../useQuote";
import { celebrate, Empty } from "../ui";

const PROMPTS: { key: "learned" | "grateful" | "thoughts"; label: string; hint: string }[] = [
  { key: "learned", label: "🧠 What did I learn today?", hint: "An idea, a lesson, a mistake that taught you something…" },
  { key: "grateful", label: "🙏 What am I grateful for?", hint: "People, moments, small things…" },
  { key: "thoughts", label: "🖋️ Thoughts & reflections", hint: "Free writing. What's on your mind? What would the wise version of you say?" },
];

export default function JournalPage() {
  const { data, put } = useStore();
  const all = useList("journal").filter((j) => j.learned || j.grateful || j.thoughts);
  const [date, setDate] = useState(todayStr());
  const [query, setQuery] = useState("");
  const today = todayStr();
  const j: Journal = (data.journal?.[date] && !data.journal[date].del ? data.journal[date] : null) ?? { id: date, u: 0, date, learned: "", grateful: "", thoughts: "" };
  const { text: quote, author, credit } = useDailyQuote(date);
  let streak = 0;
  const has = new Set(all.map((x) => x.date));
  for (let d = has.has(today) ? today : addDays(today, -1); has.has(d); d = addDays(d, -1)) streak++;

  const set = (patch: Partial<Journal>) => {
    const wasEmpty = !(j.learned || j.grateful || j.thoughts);
    put("journal", { ...j, ...patch });
    if (wasEmpty) celebrate("Journal entry +10 XP", "🖋️");
  };

  const q = query.trim().toLowerCase();
  const past = all
    .filter((x) => !q || `${x.learned} ${x.grateful} ${x.thoughts}`.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 60);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Journal</h1>
          <p className="muted">
            {fmtDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {all.length} entries · {streak}🔥 day streak
          </p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => setDate(addDays(date, -1))}>
            ←
          </button>
          <button className="btn ghost" onClick={() => setDate(today)}>
            Today
          </button>
          <button className="btn ghost" onClick={() => setDate(addDays(date, 1))} disabled={date >= today}>
            →
          </button>
        </div>
      </header>

      <section className="card quote-card">
        <p className="quote">“{quote}”</p>
        <p className="quote-author">— {author}</p>
        {credit && (
          <a className="quote-credit" href={credit.href} target="_blank" rel="noreferrer">
            Quote via {credit.text}
          </a>
        )}
      </section>

      <section className="card form journal-card">
        {PROMPTS.map((p) => (
          <label key={p.key}>
            {p.label}
            <textarea rows={p.key === "thoughts" ? 6 : 3} placeholder={p.hint} value={j[p.key]} onChange={(e) => set({ [p.key]: e.target.value })} />
          </label>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Past entries</h2>
        </div>
        <div className="search-bar inner">
          <span>🔍</span>
          <input type="search" placeholder="Search your journal…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!past.length && <Empty>{q ? "No entries match." : "Your past entries will appear here."}</Empty>}
        {past.map((x) => (
          <div key={x.id} className="journal-past" onClick={() => { setDate(x.date); window.scrollTo(0, 0); }}>
            <div className="muted tiny">{fmtDay(x.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
            {x.learned && <div>🧠 {x.learned}</div>}
            {x.grateful && <div>🙏 {x.grateful}</div>}
            {x.thoughts && <div className="muted small">🖋️ {x.thoughts.length > 220 ? `${x.thoughts.slice(0, 220)}…` : x.thoughts}</div>}
          </div>
        ))}
      </section>
    </div>
  );
}
