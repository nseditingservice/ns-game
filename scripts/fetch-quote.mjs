// Runs in GitHub Actions after `vite build`: downloads today's quote on the
// server (no browser CORS limits, no API key) and saves it next to the app as
// quote.json. The app reads it from its own site, so PC and iPhone match.
import { writeFile } from "node:fs/promises";

const out = process.argv[2] ?? "dist/quote.json";

const sources = [
  {
    name: "ZenQuotes",
    url: "https://zenquotes.io/api/today",
    credit: { text: "ZenQuotes API", href: "https://zenquotes.io/" },
    pick: (j) => ({ text: j?.[0]?.q, author: j?.[0]?.a }),
  },
  {
    name: "Stoic Quotes",
    url: "https://stoic-quotes.com/api/quote",
    credit: { text: "stoic-quotes.com", href: "https://stoic-quotes.com/" },
    pick: (j) => ({ text: j?.text, author: j?.author }),
  },
];

for (const s of sources) {
  try {
    const res = await fetch(s.url, { headers: { "User-Agent": "ns-game-daily-quote" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { text, author } = s.pick(await res.json());
    if (!text || /too many requests|zenquotes\.io/i.test(text)) throw new Error("no usable quote");
    const quote = { text: text.trim(), author: (author || "Unknown").trim(), source: s.name, credit: s.credit, date: new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString() };
    await writeFile(out, JSON.stringify(quote, null, 2));
    console.log(`Quote of the day from ${s.name}: “${quote.text}” — ${quote.author}`);
    process.exit(0);
  } catch (e) {
    console.warn(`${s.name} failed: ${e.message}`);
  }
}
console.warn("No online quote today; the app will use its built-in list.");
