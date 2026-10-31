import { useRef, useState } from "react";
import { useList, useStore } from "../store";
import { COLS, type Data } from "../types";
import { parseConfig, useSync } from "../sync";
import { BUILT_IN_FIREBASE_CONFIG } from "../config";
import { XP_RULES } from "../game";

export default function SettingsPage() {
  const { prefs, setPrefs, local, setLocal, data, replaceAll } = useStore();
  const tags = useList("tags").filter((t) => !t.archived);
  const sync = useSync();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cfg, setCfg] = useState(local.firebaseConfig);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const configured = !!(parseConfig(local.firebaseConfig) ?? BUILT_IN_FIREBASE_CONFIG);

  const auth = async (create: boolean) => {
    setBusy(true);
    try {
      await sync.signIn(email.trim(), password, create);
      setPassword("");
    } catch {
      /* error shown via sync.error */
    } finally {
      setBusy(false);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: "ns-game", version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ns-game-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text());
      const d = parsed.data as Data;
      if (parsed.app !== "ns-game" || !d || !COLS.every((c) => typeof d[c] === "object")) throw new Error("Not an NS Game backup file.");
      if (confirm("Replace ALL current data with this backup?")) replaceAll(d);
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  };

  const counts = COLS.filter((c) => c !== "meta").map((c) => `${Object.values(data[c]).filter((x) => !x.del).length} ${c}`);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <section className="card form">
        <h2>You</h2>
        <label>
          Your name
          <input value={prefs.name} onChange={(e) => setPrefs({ name: e.target.value })} />
        </label>
        <div className="row wrap">
          <label className="grow">
            Day starts (hour)
            <input type="number" min={0} max={prefs.dayEnd - 1} value={prefs.dayStart} onChange={(e) => setPrefs({ dayStart: Math.max(0, Math.min(Number(e.target.value), prefs.dayEnd - 1)) })} />
          </label>
          <label className="grow">
            Day ends (hour)
            <input type="number" min={prefs.dayStart + 1} max={24} value={prefs.dayEnd} onChange={(e) => setPrefs({ dayEnd: Math.min(24, Math.max(Number(e.target.value), prefs.dayStart + 1)) })} />
          </label>
          <label className="grow">
            Default focus (min)
            <input type="number" min={5} max={240} value={prefs.focusMins} onChange={(e) => setPrefs({ focusMins: Number(e.target.value) || 50 })} />
          </label>
        </div>
        <label>
          Workouts appear in Things I Did as
          <select value={prefs.workoutTagId ?? ""} onChange={(e) => setPrefs({ workoutTagId: e.target.value || null })}>
            <option value="">— don't log workouts as time —</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card form">
        <h2>☁️ Sync between PC & iPhone (free)</h2>
        {!configured ? (
          <>
            <p className="muted small">
              Your data is saved on this device. To sync your PC and iPhone, create a free Firebase project (5 minutes, no credit card) and paste its web config below.{" "}
              <b>Step-by-step guide: SETUP.md</b> in the app folder.
            </p>
            <label>
              Firebase config
              <textarea rows={5} placeholder={'{ apiKey: "…", authDomain: "…", projectId: "…", appId: "…" }'} value={cfg} onChange={(e) => setCfg(e.target.value)} />
            </label>
            <div>
              <button className="btn primary" disabled={!parseConfig(cfg)} onClick={() => setLocal({ firebaseConfig: cfg })}>
                Save config
              </button>
              {cfg && !parseConfig(cfg) && <span className="error small"> Couldn't read that. Paste the whole firebaseConfig object.</span>}
            </div>
          </>
        ) : sync.email ? (
          <>
            <p>
              Signed in as <b>{sync.email}</b> · status: <b>{sync.status}</b>
              {local.dirty.length > 0 && ` · ${local.dirty.length} changes waiting`}
            </p>
            <div>
              <button className="btn" onClick={() => void sync.signOut()}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">{sync.ready ? 'Use the same email & password on your PC and iPhone. The first time, tap "Create account".' : "Connecting to Firebase…"}</p>
            <div className="row wrap">
              <input className="grow" type="email" autoComplete="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="grow" type="password" autoComplete="current-password" placeholder="password (6+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn primary" disabled={busy || !sync.ready || !email || password.length < 6} onClick={() => void auth(false)}>
                Sign in
              </button>
              <button className="btn" disabled={busy || !sync.ready || !email || password.length < 6} onClick={() => void auth(true)}>
                Create account
              </button>
            </div>
          </>
        )}
        {sync.error && <p className="error">{sync.error}</p>}
        {configured && !BUILT_IN_FIREBASE_CONFIG && (
          <button className="btn ghost small" onClick={() => confirm("Remove the Firebase config from this device?") && setLocal({ firebaseConfig: "" })}>
            Remove config
          </button>
        )}
      </section>

      <section className="card">
        <h2>📱 Install on iPhone</h2>
        <ol className="small">
          <li>Open the app's web address in <b>Safari</b> on your iPhone.</li>
          <li>
            Tap the <b>Share</b> button (square with an arrow) → <b>Add to Home Screen</b>.
          </li>
          <li>Open NS Game from the home screen. It runs full-screen like a normal app and works offline.</li>
        </ol>
        <p className="muted small">On PC (Chrome/Edge), click the install icon in the address bar to get a desktop app.</p>
      </section>

      <section className="card form">
        <h2>✦ AI (optional, not free)</h2>
        <p className="muted small">The app is 100% free without this. If you ever want AI planning/coaching, add a Claude API key (pay-per-use, from console.anthropic.com). Stored on this device only.</p>
        <div className="row">
          <input className="grow" type={showKey ? "text" : "password"} value={local.apiKey} placeholder="sk-ant-… (leave empty)" onChange={(e) => setLocal({ apiKey: e.target.value.trim() })} />
          <button className="btn ghost" onClick={() => setShowKey(!showKey)}>
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
      </section>

      <section className="card form">
        <h2>💾 Your data</h2>
        <p className="muted small">{counts.join(" · ")}</p>
        <p className="muted small">Export a backup every month or so. With sync on, your data is also safe in your Firebase account.</p>
        <div className="row wrap">
          <button className="btn" onClick={exportData}>
            Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importData(e.target.files[0])} />
        </div>
      </section>

      <section className="card">
        <h2>🎮 How XP works</h2>
        <table className="xp-table">
          <tbody>
            {XP_RULES.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>
                  <b>{v}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">XP goes to the life area of the tag, habit or goal, which builds your character stats (Review page). Levels get gradually harder.</p>
      </section>
    </div>
  );
}
