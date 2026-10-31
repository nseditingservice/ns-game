import { useEffect, useMemo, useState } from "react";
import { PALETTE, uid, useList, useStore } from "../store";
import type { Domain, Entry, Idea, LibraryItem, Problem } from "../types";
import { fmtDay, fmtHours, monthStart, todayStr } from "../dates";
import { entryMins } from "../game";
import { celebrate, Empty, Modal } from "../ui";

// Mastery tiers, from Josh Kaufman's "first 20 hours" to the 10,000-hour mark.
export const TIERS: [number, string][] = [
  [0, "Spark"],
  [20, "Apprentice"],
  [100, "Practitioner"],
  [500, "Adept"],
  [1000, "Expert"],
  [5000, "Master"],
  [10000, "Grandmaster"],
];
export function tierFor(hours: number) {
  let i = 0;
  while (i + 1 < TIERS.length && hours >= TIERS[i + 1][0]) i++;
  const [from, name] = TIERS[i];
  const next = TIERS[i + 1];
  return { name, index: i, next: next ? { at: next[0], name: next[1] } : null, frac: next ? (hours - from) / (next[0] - from) : 1 };
}

export function domainMins(d: Domain, entries: Entry[], from = "0000") {
  const projects = new Set(d.projects.map((p) => p.trim().toLowerCase()).filter(Boolean));
  return entries.filter((e) => e.date >= from && (d.tagIds.includes(e.tagId) || (e.project && projects.has(e.project.trim().toLowerCase())))).reduce((n, e) => n + entryMins(e), 0);
}

const hashPick = (seed: string, n: number) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return n ? h % n : 0;
};

type Tab = "constellation" | "ideas" | "problems" | "library";

export default function Atlas() {
  const domains = useList("domains").sort((a, b) => a.name.localeCompare(b.name));
  const entries = useList("entries");
  const ideas = useList("ideas");
  const [tab, setTab] = useState<Tab>("constellation");
  const [prefill, setPrefill] = useState<{ text: string; domainIds: string[] } | null>(null);
  const today = todayStr();

  // Daily cross-pollination prompt: two different domains chosen by date.
  const prompt = useMemo(() => {
    if (domains.length < 2) return null;
    const a = domains[hashPick(today, domains.length)];
    const rest = domains.filter((d) => d.id !== a.id);
    const b = rest[hashPick(today + "b", rest.length)];
    const templates = [
      `How could ${a.name} make you better at ${b.name}?`,
      `What would a master of ${a.name} notice about your ${b.name}?`,
      `Steal one principle from ${a.name} and apply it to ${b.name} today.`,
      `Where do ${a.name} and ${b.name} secretly follow the same rule?`,
      `Explain one idea from ${b.name} using a metaphor from ${a.name}.`,
    ];
    return { a, b, text: templates[hashPick(today + "t", templates.length)] };
  }, [domains, today]);

  const resurfaced = ideas.length > 2 ? [...ideas].sort((x, y) => x.id.localeCompare(y.id))[hashPick(today + "idea", ideas.length)] : null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Mind Atlas</h1>
          <p className="muted">Your fields, your ideas, your open questions, and the connections between them.</p>
        </div>
      </header>

      {prompt && (
        <section className="card prompt-card">
          <div className="muted tiny">⚡ TODAY'S CROSS-POLLINATION</div>
          <p className="prompt-text">
            {prompt.a.emoji} {prompt.text} {prompt.b.emoji}
          </p>
          <button className="btn small" onClick={() => { setPrefill({ text: "", domainIds: [prompt.a.id, prompt.b.id] }); setTab("ideas"); }}>
            🖋️ Capture an idea
          </button>
        </section>
      )}
      {resurfaced && tab === "constellation" && (
        <section className="card resurface">
          <div className="muted tiny">🔁 FROM YOUR COMMONPLACE BOOK · {fmtDay(resurfaced.date, { day: "numeric", month: "short", year: "numeric" })}</div>
          <p>{resurfaced.text}</p>
          {resurfaced.source && <p className="muted tiny">— {resurfaced.source}</p>}
        </section>
      )}

      <div className="seg atlas-tabs">
        {(
          [
            ["constellation", "🌌 Domains"],
            ["ideas", "🖋️ Commonplace Book"],
            ["problems", "❓ 12 Problems"],
            ["library", "📚 Library"],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "constellation" && <Constellation domains={domains} entries={entries} ideas={ideas} />}
      {tab === "ideas" && <IdeasTab domains={domains} prefill={prefill} onPrefillUsed={() => setPrefill(null)} />}
      {tab === "problems" && <ProblemsTab domains={domains} />}
      {tab === "library" && <LibraryTab domains={domains} />}
    </div>
  );
}

// ------------------------------------------------------------------ Domains + constellation

function Constellation({ domains, entries, ideas }: { domains: Domain[]; entries: Entry[]; ideas: Idea[] }) {
  const { putMany } = useStore();
  const tags = useList("tags").filter((t) => !t.archived);
  const problems = useList("problems");
  const [editing, setEditing] = useState<Domain | null>(null);
  const month = monthStart();
  const stats = domains.map((d) => {
    const mins = domainMins(d, entries);
    return { d, mins, month: domainMins(d, entries, month), tier: tierFor(mins / 60), ideas: ideas.filter((i) => i.domainIds.includes(d.id)).length, problems: problems.filter((p) => p.domainIds.includes(d.id) && p.status === "open").length };
  });
  // Connections: ideas that touch two domains, or linked ideas in different domains.
  const byId = new Map(ideas.map((i) => [i.id, i]));
  const links = new Map<string, number>();
  const bump = (a: string, b: string) => {
    if (a === b) return;
    const k = [a, b].sort().join("|");
    links.set(k, (links.get(k) ?? 0) + 1);
  };
  for (const i of ideas) {
    for (let x = 0; x < i.domainIds.length; x++) for (let y = x + 1; y < i.domainIds.length; y++) bump(i.domainIds[x], i.domainIds[y]);
    for (const l of i.links) {
      const o = byId.get(l);
      if (o && i.id < o.id) for (const a of i.domainIds) for (const b of o.domainIds) bump(a, b);
    }
  }
  const S = 360;
  const c = S / 2;
  const R = S / 2 - 62;
  const maxMins = Math.max(60, ...stats.map((s) => s.mins));
  const pos = new Map(stats.map((s, i) => [s.d.id, { x: c + Math.cos((i / stats.length) * Math.PI * 2 - Math.PI / 2) * R, y: c + Math.sin((i / stats.length) * Math.PI * 2 - Math.PI / 2) * R }]));
  const quickStart = () => {
    putMany(
      "domains",
      tags.map((t, i) => ({ id: uid(), name: t.name, emoji: t.emoji, color: t.color || PALETTE[i % PALETTE.length], tagIds: [t.id], projects: [], why: "" })),
    );
    celebrate("Domains created from your tags", "🌌");
  };

  return (
    <>
      {!domains.length ? (
        <section className="card">
          <h2>Map your fields</h2>
          <p className="muted small">A domain is a field you're growing in: Video Editing, Philosophy, Muay Thai, Business… Each one takes its hours from the tags (and projects) you choose, and levels up through mastery tiers.</p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => setEditing(blankDomain(0))}>
              + Create a domain
            </button>
            {tags.length > 0 && (
              <button className="btn" onClick={quickStart}>
                ⚡ Quick start: one domain per tag
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="card constellation-card">
          <div className="card-head">
            <h2>Constellation</h2>
            <button className="btn primary small" onClick={() => setEditing(blankDomain(domains.length))}>
              + Domain
            </button>
          </div>
          <svg viewBox={`0 0 ${S} ${S}`} className="constellation">
            {[...links.entries()].map(([k, n]) => {
              const [a, b] = k.split("|");
              const pa = pos.get(a);
              const pb = pos.get(b);
              if (!pa || !pb) return null;
              return <line key={k} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className="link-line" strokeWidth={Math.min(6, 1 + n)} />;
            })}
            {stats.map((s) => {
              const p = pos.get(s.d.id)!;
              return <line key={`c${s.d.id}`} x1={c} y1={c} x2={p.x} y2={p.y} className="spoke" />;
            })}
            <circle cx={c} cy={c} r="22" className="you-star" />
            <text x={c} y={c + 7} className="star-emoji">
              🧠
            </text>
            {stats.map((s) => {
              const p = pos.get(s.d.id)!;
              const r = 12 + 20 * Math.sqrt(s.mins / maxMins);
              return (
                <g key={s.d.id} className="star" onClick={() => setEditing(s.d)}>
                  <circle cx={p.x} cy={p.y} r={r + 6} style={{ fill: s.d.color }} className="star-glow" />
                  <circle cx={p.x} cy={p.y} r={r} style={{ fill: "#0d0d18", stroke: s.d.color }} className="star-core" />
                  <text x={p.x} y={p.y + 6} className="star-emoji" style={{ fontSize: Math.max(14, r * 0.9) }}>
                    {s.d.emoji}
                  </text>
                  <text x={p.x} y={p.y + r + 16} className="star-label">
                    {s.d.name}
                  </text>
                  <text x={p.x} y={p.y + r + 29} className="star-sub">
                    {s.tier.name} · {fmtHours(s.mins)}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="muted tiny center-text">Bigger star = more hours. Lines between stars = ideas that connect those fields.</p>
        </section>
      )}

      {stats.length > 0 && (
        <div className="domain-grid">
          {stats
            .sort((a, b) => b.mins - a.mins)
            .map((s) => (
              <button key={s.d.id} className="card domain-card" style={{ ["--dc" as string]: s.d.color }} onClick={() => setEditing(s.d)}>
                <div className="row between">
                  <span className="domain-name">
                    {s.d.emoji} {s.d.name}
                  </span>
                  <span className="tier-pill">{s.tier.name}</span>
                </div>
                <div className="domain-hours">
                  <b>{fmtHours(s.mins)}</b> <span className="muted small">total · {fmtHours(s.month)} this month</span>
                </div>
                <div className="bar thin">
                  <div style={{ width: `${Math.min(100, s.tier.frac * 100)}%`, background: s.d.color }} />
                </div>
                <div className="muted tiny">{s.tier.next ? `${fmtHours(s.tier.next.at * 60 - s.mins)} to ${s.tier.next.name}` : "Grandmaster 🌟"}</div>
                <div className="muted tiny">
                  🖋️ {s.ideas} ideas · ❓ {s.problems} open problems
                </div>
              </button>
            ))}
        </div>
      )}
      {editing && <DomainEditor domain={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const blankDomain = (n: number): Domain => ({ id: uid(), u: 0, name: "", emoji: "✨", color: PALETTE[n % PALETTE.length], tagIds: [], projects: [], why: "" });

function DomainEditor({ domain, onClose }: { domain: Domain; onClose: () => void }) {
  const { put, del, data } = useStore();
  const tags = useList("tags").filter((t) => !t.archived || domain.tagIds.includes(t.id));
  const [d, setD] = useState(domain);
  const [projects, setProjects] = useState(domain.projects.join(", "));
  const isNew = !data.domains?.[domain.id] || data.domains[domain.id].del;
  const toggleTag = (id: string) => setD({ ...d, tagIds: d.tagIds.includes(id) ? d.tagIds.filter((x) => x !== id) : [...d.tagIds, id] });
  return (
    <Modal title={isNew ? "New domain" : "Edit domain"} onClose={onClose}>
      <div className="row">
        <input className="emoji-input" value={d.emoji} onChange={(e) => setD({ ...d, emoji: e.target.value.slice(0, 4) })} />
        <input className="grow" autoFocus placeholder="e.g. Video Editing, Philosophy, Muay Thai" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} />
      </div>
      <label>
        Why this field matters to you
        <input value={d.why} onChange={(e) => setD({ ...d, why: e.target.value })} placeholder="It lets me tell stories that move people" />
      </label>
      <div>
        <div className="muted small">Hours come from these tags:</div>
        <div className="tag-pick">
          {tags.map((t) => (
            <button key={t.id} type="button" className={`tag-chip ${d.tagIds.includes(t.id) ? "armed" : ""}`} style={{ borderLeftColor: t.color }} onClick={() => toggleTag(t.id)}>
              {t.emoji} {t.name}
            </button>
          ))}
        </div>
      </div>
      <label>
        …and from these projects (comma separated, optional)
        <input value={projects} onChange={(e) => setProjects(e.target.value)} placeholder="Zen Media House, Client reels" />
      </label>
      <div className="row between">
        <button className="btn primary" disabled={!d.name.trim()} onClick={() => { put("domains", { ...d, name: d.name.trim(), projects: projects.split(",").map((p) => p.trim()).filter(Boolean) }); onClose(); }}>
          Save
        </button>
        {!isNew && (
          <button className="btn ghost danger" onClick={() => { if (confirm("Delete this domain? Ideas and logs stay.")) { del("domains", d.id); onClose(); } }}>
            Delete
          </button>
        )}
      </div>
    </Modal>
  );
}

function DomainPick({ domains, value, onChange }: { domains: Domain[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!domains.length) return <p className="muted tiny">Tip: create domains (🌌 tab) to tag ideas by field.</p>;
  return (
    <div className="chip-row">
      {domains.map((d) => (
        <button key={d.id} type="button" className={`mini-chip ${value.includes(d.id) ? "on" : ""}`} style={value.includes(d.id) ? { background: `${d.color}33`, borderColor: d.color } : undefined} onClick={() => onChange(value.includes(d.id) ? value.filter((x) => x !== d.id) : [...value, d.id])}>
          {d.emoji} {d.name}
        </button>
      ))}
    </div>
  );
}

const DomainBadges = ({ ids, domains }: { ids: string[]; domains: Domain[] }) => (
  <span className="chip-row inline">
    {ids.map((id) => {
      const d = domains.find((x) => x.id === id);
      return d ? (
        <span key={id} className="mini-chip static" style={{ background: `${d.color}26`, borderColor: `${d.color}66` }}>
          {d.emoji} {d.name}
        </span>
      ) : null;
    })}
  </span>
);

// ------------------------------------------------------------------ Commonplace book

function IdeasTab({ domains, prefill, onPrefillUsed }: { domains: Domain[]; prefill: { text: string; domainIds: string[] } | null; onPrefillUsed: () => void }) {
  const { put } = useStore();
  const ideas = useList("ideas").sort((a, b) => b.date.localeCompare(a.date) || b.u - a.u);
  const [text, setText] = useState(prefill?.text ?? "");
  const [source, setSource] = useState("");
  const [sel, setSel] = useState<string[]>(prefill?.domainIds ?? []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [linking, setLinking] = useState<Idea | null>(null);
  useEffect(() => {
    if (prefill) onPrefillUsed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = () => {
    if (!text.trim()) return;
    put("ideas", { id: uid(), date: todayStr(), text: text.trim(), source: source.trim(), domainIds: sel, links: [] });
    celebrate(sel.length >= 2 ? "Cross-pollination! +10 XP" : "Idea captured +5 XP", "🖋️");
    setText("");
    setSource("");
  };
  const q = query.trim().toLowerCase();
  const shown = ideas.filter((i) => (!filter || i.domainIds.includes(filter)) && (!q || `${i.text} ${i.source}`.toLowerCase().includes(q)));
  const cross = ideas.filter((i) => i.domainIds.length >= 2 || i.links.length).length;

  return (
    <>
      <section className="card form">
        <h2>🖋️ Capture</h2>
        <textarea rows={3} placeholder="An idea, a quote, an observation, a question… anything worth keeping." value={text} onChange={(e) => setText(e.target.value)} />
        <input placeholder="Source (book, person, video, shower thought…)" value={source} onChange={(e) => setSource(e.target.value)} />
        <DomainPick domains={domains} value={sel} onChange={setSel} />
        <div>
          <button className="btn primary" disabled={!text.trim()} onClick={add}>
            Save to Commonplace Book
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Your notebook</h2>
          <span className="muted small">
            {ideas.length} ideas · ⚡ {cross} connections across fields
          </span>
        </div>
        <div className="search-bar inner">
          <span>🔍</span>
          <input placeholder="Search ideas…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {domains.length > 0 && (
          <div className="chip-row" style={{ marginBottom: 8 }}>
            <button className={`mini-chip ${!filter ? "on" : ""}`} onClick={() => setFilter(null)}>
              All
            </button>
            {domains.map((d) => (
              <button key={d.id} className={`mini-chip ${filter === d.id ? "on" : ""}`} onClick={() => setFilter(filter === d.id ? null : d.id)}>
                {d.emoji} {d.name}
              </button>
            ))}
          </div>
        )}
        {!shown.length && <Empty>{ideas.length ? "No ideas match." : "Your first idea goes above. Leonardo filled thousands of pages; start with one line."}</Empty>}
        {shown.map((i) => (
          <div key={i.id} className="idea-card">
            <div className="row between">
              <span className="muted tiny">{fmtDay(i.date, { day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="row">
                {(i.domainIds.length >= 2 || i.links.length > 0) && <span className="spark-badge">⚡ cross-pollination</span>}
                <button className="btn ghost small" onClick={() => setLinking(i)}>
                  🔗 Connect
                </button>
                <button className="btn ghost small" onClick={() => setEditing(i)}>
                  ✏️
                </button>
              </span>
            </div>
            <p className="idea-text">{i.text}</p>
            {i.source && <p className="muted tiny">— {i.source}</p>}
            <DomainBadges ids={i.domainIds} domains={domains} />
            {i.links.length > 0 && (
              <div className="idea-links">
                {i.links
                  .map((l) => ideas.find((x) => x.id === l))
                  .filter(Boolean)
                  .map((o) => (
                    <span key={o!.id} className="idea-link">
                      ↔ {o!.text.length > 70 ? `${o!.text.slice(0, 70)}…` : o!.text}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}
      </section>
      {editing && <IdeaEditor idea={editing} domains={domains} onClose={() => setEditing(null)} />}
      {linking && <LinkPicker idea={linking} ideas={ideas} onClose={() => setLinking(null)} />}
    </>
  );
}

function IdeaEditor({ idea, domains, onClose }: { idea: Idea; domains: Domain[]; onClose: () => void }) {
  const { put, del, data } = useStore();
  const [i, setI] = useState(idea);
  return (
    <Modal title="Edit idea" onClose={onClose}>
      <textarea rows={4} value={i.text} onChange={(e) => setI({ ...i, text: e.target.value })} />
      <input placeholder="Source" value={i.source} onChange={(e) => setI({ ...i, source: e.target.value })} />
      <DomainPick domains={domains} value={i.domainIds} onChange={(domainIds) => setI({ ...i, domainIds })} />
      <div className="row between">
        <button className="btn primary" disabled={!i.text.trim()} onClick={() => { put("ideas", i); onClose(); }}>
          Save
        </button>
        <button
          className="btn ghost danger"
          onClick={() => {
            // Remove back-links too.
            Object.values(data.ideas ?? {}).filter((o) => !o.del && o.links.includes(i.id)).forEach((o) => put("ideas", { ...o, links: o.links.filter((l) => l !== i.id) }));
            del("ideas", i.id);
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}

function LinkPicker({ idea, ideas, onClose }: { idea: Idea; ideas: Idea[]; onClose: () => void }) {
  const { put, data } = useStore();
  const [q, setQ] = useState("");
  const current = (data.ideas?.[idea.id] ?? idea) as Idea;
  const toggle = (other: Idea) => {
    const linked = current.links.includes(other.id);
    put("ideas", { ...current, links: linked ? current.links.filter((l) => l !== other.id) : [...current.links, other.id] });
    put("ideas", { ...other, links: linked ? other.links.filter((l) => l !== current.id) : [...new Set([...other.links, current.id])] });
    if (!linked) celebrate("Ideas connected", "🔗");
  };
  const list = ideas.filter((o) => o.id !== idea.id && (!q || o.text.toLowerCase().includes(q.toLowerCase())));
  return (
    <Modal title="Connect ideas" onClose={onClose}>
      <p className="small">“{current.text.length > 120 ? `${current.text.slice(0, 120)}…` : current.text}”</p>
      <p className="muted tiny">Great ideas often come from linking things from different fields. Tap ideas to connect or disconnect.</p>
      <input placeholder="Search ideas…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!list.length && <Empty>No other ideas yet.</Empty>}
      {list.slice(0, 50).map((o) => (
        <button key={o.id} className={`link-option ${current.links.includes(o.id) ? "on" : ""}`} onClick={() => toggle((data.ideas?.[o.id] ?? o) as Idea)}>
          {current.links.includes(o.id) ? "🔗 " : ""}
          {o.text.length > 140 ? `${o.text.slice(0, 140)}…` : o.text}
        </button>
      ))}
    </Modal>
  );
}

// ------------------------------------------------------------------ 12 favorite problems

function ProblemsTab({ domains }: { domains: Domain[] }) {
  const { put, del } = useStore();
  const problems = useList("problems").sort((a, b) => Number(a.status === "solved") - Number(b.status === "solved") || a.createdAt.localeCompare(b.createdAt));
  const [text, setText] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const openCount = problems.filter((p) => p.status === "open").length;
  const add = () => {
    if (!text.trim()) return;
    put("problems", { id: uid(), text: text.trim(), domainIds: sel, notes: "", status: "open", createdAt: todayStr() });
    setText("");
    setSel([]);
  };
  return (
    <>
      <section className="card tips">
        <h2>❓ Your 12 favorite problems</h2>
        <p className="small">
          Richard Feynman kept a dozen open questions in mind. Whenever he learned something new, he tested it against each one, and occasionally got a hit. Keep about 12 big questions here. When something you read, watch or do sheds light on one, write it in its notes.
        </p>
      </section>
      <section className="card form">
        <input placeholder="e.g. How can I tell stories that change how people see themselves?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <DomainPick domains={domains} value={sel} onChange={setSel} />
        <div className="row between">
          <button className="btn primary" disabled={!text.trim()} onClick={add}>
            Add problem
          </button>
          <span className={`small ${openCount > 12 ? "warn" : "muted"}`}>{openCount}/12 open</span>
        </div>
      </section>
      <section className="card">
        {!problems.length && <Empty>No problems yet. What questions do you keep coming back to?</Empty>}
        {problems.map((p, n) => (
          <div key={p.id} className={`problem ${p.status}`}>
            <div className="row between" onClick={() => setOpen(open === p.id ? null : p.id)}>
              <span className="problem-text">
                <span className="problem-num">{n + 1}</span> {p.text}
              </span>
              <span className="muted tiny">{p.status === "solved" ? "✓ solved" : open === p.id ? "▴" : "▾"}</span>
            </div>
            <DomainBadges ids={p.domainIds} domains={domains} />
            {open === p.id && (
              <div className="form" style={{ marginTop: 8 }}>
                <textarea rows={4} placeholder="Clues, connections, partial answers…" value={p.notes} onChange={(e) => put("problems", { ...p, notes: e.target.value })} />
                <div className="row wrap">
                  <button className="btn small" onClick={() => put("problems", { ...p, status: p.status === "open" ? "solved" : "open" })}>
                    {p.status === "open" ? "✓ Mark solved" : "Reopen"}
                  </button>
                  <button className="btn ghost small danger" onClick={() => confirm("Delete this problem?") && del("problems", p.id)}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ Library

const KINDS: [LibraryItem["kind"], string][] = [
  ["book", "📕"],
  ["course", "🎓"],
  ["video", "🎬"],
  ["podcast", "🎧"],
  ["article", "📰"],
  ["paper", "📄"],
];

function LibraryTab({ domains }: { domains: Domain[] }) {
  const { put } = useStore();
  const items = useList("library");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [kind, setKind] = useState<LibraryItem["kind"]>("book");
  const [sel, setSel] = useState<string[]>([]);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const add = () => {
    if (!title.trim()) return;
    put("library", { id: uid(), title: title.trim(), creator: creator.trim(), kind, domainIds: sel, status: "queue", rating: null, takeaways: "" });
    setTitle("");
    setCreator("");
  };
  const col = (status: LibraryItem["status"]) => items.filter((i) => i.status === status).sort((a, b) => b.u - a.u);
  const emoji = (k: LibraryItem["kind"]) => KINDS.find(([x]) => x === k)?.[1] ?? "📕";
  const move = (i: LibraryItem, status: LibraryItem["status"]) => {
    put("library", { ...i, status, finishedAt: status === "done" ? todayStr() : i.finishedAt });
    if (status === "done") celebrate(`Finished ${i.title} +20 XP`, emoji(i.kind));
  };
  return (
    <>
      <section className="card form">
        <h2>📚 Add to your learning queue</h2>
        <div className="row wrap">
          <input className="grow" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <input placeholder="Author / creator" value={creator} onChange={(e) => setCreator(e.target.value)} />
        </div>
        <div className="row wrap">
          {KINDS.map(([k, e]) => (
            <button key={k} className={`btn small ${kind === k ? "primary" : ""}`} onClick={() => setKind(k)}>
              {e} {k}
            </button>
          ))}
        </div>
        <DomainPick domains={domains} value={sel} onChange={setSel} />
        <div>
          <button className="btn primary" disabled={!title.trim()} onClick={add}>
            Add
          </button>
        </div>
      </section>
      <div className="library-cols">
        {(
          [
            ["active", "📖 In progress"],
            ["queue", "🗂️ Up next"],
            ["done", "✅ Finished"],
          ] as [LibraryItem["status"], string][]
        ).map(([s, label]) => (
          <section key={s} className="card">
            <h2>
              {label} <span className="muted small">{col(s).length}</span>
            </h2>
            {!col(s).length && <Empty>Nothing here.</Empty>}
            {col(s).map((i) => (
              <div key={i.id} className="lib-item" onClick={() => setEditing(i)}>
                <div>
                  {emoji(i.kind)} <b>{i.title}</b>
                  {i.creator && <span className="muted small"> · {i.creator}</span>}
                </div>
                {i.status === "done" && i.rating ? <div className="tiny">{"★".repeat(i.rating)}</div> : null}
                <DomainBadges ids={i.domainIds} domains={domains} />
                <div className="row" onClick={(e) => e.stopPropagation()}>
                  {s !== "active" && (
                    <button className="btn ghost small" onClick={() => move(i, "active")}>
                      ▶ Start
                    </button>
                  )}
                  {s !== "done" && (
                    <button className="btn ghost small" onClick={() => move(i, "done")}>
                      ✓ Finish
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      {editing && <LibraryEditor item={editing} domains={domains} onClose={() => setEditing(null)} />}
    </>
  );
}

function LibraryEditor({ item, domains, onClose }: { item: LibraryItem; domains: Domain[]; onClose: () => void }) {
  const { put, del } = useStore();
  const [i, setI] = useState(item);
  return (
    <Modal title="Library item" onClose={onClose}>
      <input value={i.title} onChange={(e) => setI({ ...i, title: e.target.value })} />
      <input placeholder="Author / creator" value={i.creator} onChange={(e) => setI({ ...i, creator: e.target.value })} />
      <div className="row wrap">
        <select value={i.status} onChange={(e) => setI({ ...i, status: e.target.value as LibraryItem["status"], finishedAt: e.target.value === "done" ? i.finishedAt ?? todayStr() : i.finishedAt })}>
          <option value="queue">Up next</option>
          <option value="active">In progress</option>
          <option value="done">Finished</option>
        </select>
        <select value={i.rating ?? ""} onChange={(e) => setI({ ...i, rating: e.target.value ? Number(e.target.value) : null })}>
          <option value="">No rating</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)}
            </option>
          ))}
        </select>
      </div>
      <DomainPick domains={domains} value={i.domainIds} onChange={(domainIds) => setI({ ...i, domainIds })} />
      <label>
        Key takeaways
        <textarea rows={4} value={i.takeaways} onChange={(e) => setI({ ...i, takeaways: e.target.value })} placeholder="What will you remember from this?" />
      </label>
      <div className="row between">
        <button className="btn primary" disabled={!i.title.trim()} onClick={() => { put("library", i); onClose(); }}>
          Save
        </button>
        <button className="btn ghost danger" onClick={() => { del("library", i.id); onClose(); }}>
          Delete
        </button>
      </div>
    </Modal>
  );
}

export type { Problem };
