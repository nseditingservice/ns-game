import { useTrophies } from "../achievements";
import { EditAreasButton } from "../components/Areas";
import { AREAS, AREA_INFO } from "../types";
import { levelFor, titleFor, TITLES, useXp } from "../game";

const TIER_LABEL = { bronze: "Bronze", silver: "Silver", gold: "Gold", mythic: "Mythic" } as const;

export default function Trophies() {
  const trophies = useTrophies();
  const xp = useXp();
  const unlocked = trophies.filter((t) => t.value >= t.target);
  const sorted = [...trophies].sort((a, b) => Number(b.value >= b.target) - Number(a.value >= a.target) || b.value / b.target - a.value / a.target);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Trophies</h1>
          <p className="muted">
            {unlocked.length}/{trophies.length} unlocked · Level {xp.lvl.level} {titleFor(xp.lvl.level)}
          </p>
        </div>
      </header>

      <section className="card">
        <h2>The path of titles</h2>
        <div className="title-path">
          {TITLES.map((t, i) => (
            <div key={t} className={`title-step ${xp.lvl.level >= i * 5 ? "reached" : ""} ${titleFor(xp.lvl.level) === t ? "current" : ""}`}>
              <span className="title-lvl">Lv {i * 5}</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="trophy-grid">
        {sorted.map((t) => {
          const done = t.value >= t.target;
          return (
            <div key={t.id} className={`trophy ${done ? "unlocked" : "locked"}`} data-tier={t.tier}>
              <div className="trophy-medal">
                <span>{t.emoji}</span>
              </div>
              <div className="trophy-name">{t.name}</div>
              <div className="trophy-desc">{t.desc}</div>
              <div className="trophy-tier">{done ? `✓ ${TIER_LABEL[t.tier]}` : TIER_LABEL[t.tier]}</div>
              {!done && (
                <>
                  <div className="bar">
                    <div className={`fill-${t.tier}`} style={{ width: `${(t.value / t.target) * 100}%` }} />
                  </div>
                  <div className="trophy-progress">
                    {Math.floor(t.value).toLocaleString("en-US")} / {t.target.toLocaleString("en-US")}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <section className="card">
        <div className="row between">
          <h2>⚔️ Character stats</h2>
          <EditAreasButton />
        </div>
        {AREAS.map((a) => {
          const l = levelFor(xp.byArea[a], 0.5);
          return (
            <div key={a} className="wheel-row">
              <span>
                {AREA_INFO[a].emoji} {AREA_INFO[a].label}
              </span>
              <div className="bar thin grow">
                <div style={{ width: `${(l.into / l.need) * 100}%`, background: AREA_INFO[a].color }} />
              </div>
              <b>Lv {l.level}</b>
            </div>
          );
        })}
      </section>
    </div>
  );
}
