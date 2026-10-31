import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import { useStore } from "./store";
import { COLS, type Col, type ItemOf } from "./types";
import { BUILT_IN_FIREBASE_CONFIG } from "./config";

type Status = "off" | "signed-out" | "connecting" | "synced" | "uploading" | "error";

interface SyncApi {
  status: Status;
  ready: boolean;
  email: string | null;
  error: string;
  signIn: (email: string, password: string, create: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SyncApi>({ status: "off", ready: false, email: null, error: "", signIn: async () => {}, signOut: async () => {} });
export const useSync = () => useContext(Ctx);

interface Fb {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  fs: typeof import("firebase/firestore");
  au: typeof import("firebase/auth");
}

export function parseConfig(raw: string): Record<string, string> | null {
  if (!raw.trim()) return null;
  try {
    // Accept either JSON or the JS object Firebase shows (unquoted keys).
    const jsonish = raw
      .slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)
      .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*}/g, "}");
    const cfg = JSON.parse(jsonish);
    return cfg.apiKey && cfg.projectId ? cfg : null;
  } catch {
    return null;
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { local, setLocal, mergeRemote, data } = store;
  const config = parseConfig(local.firebaseConfig) ?? BUILT_IN_FIREBASE_CONFIG;
  const configKey = config ? JSON.stringify(config) : "";
  const [fb, setFb] = useState<Fb | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("off");
  const [error, setError] = useState("");
  const lastSyncRef = useRef(local.lastSync);
  const pushing = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  // 1. Load Firebase only if configured (keeps the app light otherwise).
  useEffect(() => {
    if (!config) {
      setFb(null);
      setStatus("off");
      return;
    }
    let cancelled = false;
    let unsubAuth: Unsubscribe | undefined;
    (async () => {
      try {
        const [{ initializeApp, getApps, deleteApp }, au, fs] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
        await Promise.all(getApps().map((a) => deleteApp(a)));
        const app = initializeApp(config);
        const auth = au.getAuth(app);
        const db = fs.getFirestore(app);
        // "demo-" projects are Firebase's offline emulator convention (used for testing).
        if (String(config.projectId).startsWith("demo-")) {
          au.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
          fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
        }
        await au.setPersistence(auth, au.indexedDBLocalPersistence);
        if (cancelled) return;
        setFb({ app, auth, db, fs, au });
        unsubAuth = au.onAuthStateChanged(auth, (u) => {
          setUser(u);
          setStatus(u ? "connecting" : "signed-out");
        });
      } catch (e) {
        setStatus("error");
        setError(`Firebase setup failed: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      unsubAuth?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  // 2. Pull: listen for docs changed since our last sync.
  useEffect(() => {
    if (!fb || !user) return;
    const { fs, db } = fb;
    const q = fs.query(fs.collection(db, "users", user.uid, "items"), fs.where("s", ">", fs.Timestamp.fromMillis(lastSyncRef.current)));
    const unsub = fs.onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        const recs: { col: Col; item: ItemOf<Col> }[] = [];
        let maxS = lastSyncRef.current;
        snap.docChanges().forEach((ch) => {
          if (ch.type === "removed") return;
          const d = ch.doc.data({ serverTimestamps: "none" });
          if (!COLS.includes(d.col)) return;
          try {
            recs.push({ col: d.col, item: JSON.parse(d.json) });
          } catch {
            /* skip corrupt doc */
          }
          if (d.s && !ch.doc.metadata.hasPendingWrites) maxS = Math.max(maxS, d.s.toMillis());
        });
        if (recs.length) mergeRemote(recs);
        if (maxS > lastSyncRef.current) {
          lastSyncRef.current = maxS;
          setLocal({ lastSync: maxS });
        }
        setStatus((s) => (s === "uploading" ? s : "synced"));
      },
      (e) => {
        setStatus("error");
        setError(e.message.includes("permission") ? "Permission denied. Check your Firestore security rules (see SETUP.md)." : e.message);
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fb, user]);

  // 3. Push: upload dirty records in batches.
  useEffect(() => {
    if (!fb || !user || !local.dirty.length || pushing.current) return;
    const { fs, db } = fb;
    pushing.current = true;
    setStatus("uploading");
    const keys = local.dirty.slice(0, 450);
    (async () => {
      try {
        const batch = fs.writeBatch(db);
        const sent = new Map<string, number>();
        for (const key of keys) {
          const [col, id] = key.split("/") as [Col, string];
          const item = data[col]?.[id];
          if (!item) {
            sent.set(key, -1);
            continue;
          }
          sent.set(key, item.u);
          batch.set(fs.doc(db, "users", user.uid, "items", `${col}__${id}`), { col, u: item.u, json: JSON.stringify(item), s: fs.serverTimestamp() });
        }
        await batch.commit();
        // Only clear keys whose record hasn't changed again while uploading.
        const curU = (k: string) => {
          const [col, id] = k.split("/") as [Col, string];
          return dataRef.current[col]?.[id]?.u ?? -1;
        };
        setLocal((l) => ({ dirty: l.dirty.filter((k) => !sent.has(k) || sent.get(k) !== curU(k)) }));
        setStatus("synced");
        setError("");
      } catch (e) {
        setStatus("error");
        setError((e as Error).message);
      } finally {
        pushing.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fb, user, local.dirty]);

  const api: SyncApi = {
    status,
    ready: !!fb,
    email: user?.email ?? null,
    error,
    signIn: async (email, password, create) => {
      if (!fb) {
        const msg = status === "error" ? error : "Still connecting to Firebase… try again in a second.";
        setError(msg);
        throw new Error(msg);
      }
      setError("");
      const { au, auth } = fb;
      try {
        if (create) await au.createUserWithEmailAndPassword(auth, email, password);
        else await au.signInWithEmailAndPassword(auth, email, password);
        // Upload everything on first sign-in on this device.
        const all = COLS.flatMap((c) => Object.keys(data[c]).map((id) => `${c}/${id}`));
        setLocal((l) => ({ dirty: [...new Set([...l.dirty, ...all])] }));
      } catch (e) {
        const code = (e as { code?: string }).code ?? "";
        const msg = code.includes("invalid-credential") || code.includes("wrong-password") ? "Wrong email or password." : code.includes("email-already-in-use") ? "That email already has an account. Use Sign in." : code.includes("weak-password") ? "Password must be at least 6 characters." : (e as Error).message;
        setError(msg);
        throw new Error(msg);
      }
    },
    signOut: async () => {
      if (fb) await fb.au.signOut(fb.auth);
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
