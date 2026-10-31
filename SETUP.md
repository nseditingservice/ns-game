# NS Game setup (free, about 15 minutes, once)

You'll do three things:

1. Put the app online with **GitHub Pages**.
2. Turn on sync with **Firebase**.
3. Install it on your **iPhone** and PC.

All three are free.

---

## 1. Put it online (GitHub Pages)

1. Create a free account at https://github.com if you don't have one.
2. Click **New repository**, name it `ns-game`, and choose **Public**. (GitHub Pages is free for public repos. Only the app's code is public. Your personal data lives in Firebase and is private to your login.)
3. Upload this whole folder to the repo, **except** `node_modules` and `dist`. On the repo page, **Add file → Upload files** and drag the files in. Make sure the hidden `.github` folder is included. If drag-and-drop skips it, ask Claude to push the code for you.
4. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
5. Open the **Actions** tab and wait for the green ✓ (about 1 minute).
6. Your app is now live at **`https://YOUR-USERNAME.github.io/ns-game/`**.

> You can skip the rest and use the app on one device only. Your data stays in that browser.

---

## 2. Turn on sync between PC and iPhone (Firebase, free Spark plan)

1. Go to https://console.firebase.google.com and click **Create a project**. Call it `ns-game`. You can turn Google Analytics off. You'll be on the free **Spark** plan, with no credit card needed.
2. **Turn on login:** left menu **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save**.
3. **Create the database:** **Build → Firestore Database → Create database**. Pick a location close to you (for example `asia-south1` for India) and start in **production mode**.
4. **Make your data private:** in Firestore, open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
5. **Get your web config:** **Project settings** (⚙️ next to "Project overview") → **Your apps** → click the **`</>` (Web)** icon → name it `ns-game` → **Register app**. You'll see a block like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "ns-game-xxxx.firebaseapp.com",
     projectId: "ns-game-xxxx",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "1:…:web:…"
   };
   ```
   This config isn't secret. It's designed to sit inside web apps, and the security rules from step 4 protect your data.
6. **Give the config to the app.** Pick one option:
   - **Recommended:** paste it into `src/config.ts` on GitHub (click the file → ✏️ edit):
     ```ts
     export const BUILT_IN_FIREBASE_CONFIG: Record<string, string> | null = {
       apiKey: "AIza…",
       authDomain: "ns-game-xxxx.firebaseapp.com",
       projectId: "ns-game-xxxx",
       appId: "1:…:web:…",
     };
     ```
     Commit the change. The app rebuilds automatically in about a minute, and every device gets sync with nothing to paste.
   - **Or:** open the app, go to **Settings → Sync** and paste the config there. You'd need to do this on each device.
7. In the app, go to **Settings → Sync** and tap **Create account** (email + a password). On your other device, use **Sign in** with the same email and password.

The ☁️ icon means you're synced. Changes appear on your other device within a few seconds.

**Free limits:** 1 GiB of storage and about 20,000 writes per day. A very active day of logging uses a few hundred writes, so you won't come close.

---

## 3. Install the app

**iPhone**
1. Open `https://YOUR-USERNAME.github.io/ns-game/` in **Safari**.
2. Tap **Share** (□↑) → **Add to Home Screen** → **Add**.
3. Open **NS Game** from your home screen. It runs full-screen and works offline.
4. Go to Settings → Sync and sign in.

**PC (Chrome or Edge)**
1. Open the same address.
2. Click the **install** icon at the right of the address bar.
3. NS Game opens in its own window and gets a Start-menu or Dock icon.

---

## Daily routine (suggested)

- **Morning (1 min):** Health → sleep and weight. Glance at Today's habits.
- **During the day:** tap a tag on Today when you switch activity, or fill in the calendar later. Tap 💧 + when you drink water and log meals as you eat.
- **Evening (2 min):** fill any gaps in the calendar's "did" lane and tick manual habits.
- **Sunday (10 min):** Review → reflect, then plan next week's tasks.
- **1st of the month:** rate your Wheel of Life.

## Troubleshooting

- **"Permission denied" in Settings → Sync:** the Firestore rules from step 2.4 weren't published.
- **Sign-in fails:** check that Email/Password is enabled (step 2.2).
- **The app looks out of date on iPhone:** close it fully (swipe up) and reopen. It updates itself on the next launch.
- **Back up anyway:** Settings → Export backup, about once a month.
