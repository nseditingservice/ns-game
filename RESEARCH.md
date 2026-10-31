# The research behind NS Game

Each feature is based on what experts and studies say actually works. Most of the sources below are summaries and secondary write-ups found through web search, so treat them as practical guidance rather than proof.

## Habits

| Idea | Expert / source | How NS Game uses it |
|---|---|---|
| **Identity-based habits**: "every action is a vote for the type of person you want to become" | James Clear, *Atomic Habits* | Every habit has an identity line ("I am a reader"), and the habit detail screen counts your *"votes for who you are"*. |
| **Habit stacking**: "After [current habit], I will [new habit]" | James Clear | Each habit has an **anchor** field. |
| **Never miss twice**: one miss is an accident, two is the start of a new (bad) habit | James Clear (one source notes it's a motivational heuristic, not a proven rule) | Streaks survive one missed day and show a "Don't miss twice!" warning. Two misses in a row reset the streak. |
| **Habit tracking is motivating**: seeing progress makes you not want to break it | James Clear | 7-day grid, 🔥 streaks, best streak, 30-day %, 12-month heatmap. |
| **Tiny Habits**: anchor + a behaviour so small you can't fail + **celebrate immediately** to feel "shine" | BJ Fogg, Stanford | Every habit has a "tiny version" for bad days. Every tick triggers an instant celebration (pop-up, XP, haptic buzz on supported phones). |
| **Rest days are fine** | Self-compassion / sustainable streaks | "Skip today" doesn't break a streak. |

## Time tracking ("Things I Did")

| Idea | Expert / source | How NS Game uses it |
|---|---|---|
| **Log your time to see where it actually goes vs where you think it goes** | Laura Vanderkam, *168 Hours* | The Calendar's **Did** lane, one-tap timers, and the "logged X of Y hours today" nudge. |
| **Group activities into categories** (work, exercise, family…) | Vanderkam | Tags, and each tag belongs to a life area. |
| **Compare your actual time with your ideal schedule** | Vanderkam | **Plan** lane next to **Did** lane, and "Plan vs did" on Today. |
| **Forgot to log? Approximate it later**, and **track weekends too** | Vanderkam | Tap or drag on any past time slot. All 7 days are shown. |
| **Use reminders until logging is a habit** | Vanderkam | Today shows untracked time. You can add a habit linked to your time log. |

## Health

| Idea | Source | How NS Game uses it |
|---|---|---|
| **Consistent food and weight logging is linked to reaching goals**; people who log more in their first week are more likely to succeed | Weight-management trials; MyFitnessPal user study (observational) | Logging a meal takes about 3 seconds (text + 🟢🟡🔴). Logging is rewarded with XP, and you can add a "Log my meals" habit. |
| **A simple food journal**: meals, quality, hydration, activity, sleep, energy, mood | Health-tracking guides | Exactly the fields in the daily check-in. Nothing more, to keep it fast. |
| **Track sleep duration and quality** | Sleep-journal guidance | Sleep hours and quality, a 30-day chart, and a 7h+ sleep habit. |

## Gamification (the "Game" in NS Game)

| Finding | Source | Design decision |
|---|---|---|
| Gamification only works when it supports **autonomy, competence and relatedness** (Self-Determination Theory), not just points on screen | Gamification research reviews | XP is tied to *real* behaviours you choose: habits, logged time, workouts, healthy meals, reviews. |
| **XP should match effort and the behaviour you want** | Habit-gamification guides | Focus time and workouts earn more. Merely logging still earns a little, because logging is the habit that makes everything else work. |
| **Stacking too many systems** (XP + levels + streaks + quests + badges) overwhelms people | Habit-gamification guides | Only **XP, levels, streaks and life-area stats**. No badge spam. |
| **Harsh streaks cause anxiety** | Gamification critiques | Forgiving "never miss twice" streaks and rest days. |
| **Immediate feedback** | Gamification research | XP pop-up the moment you act. |

## Life balance

| Idea | Source | How NS Game uses it |
|---|---|---|
| **Wheel of Life**: rate about 8 life areas from 1 to 10 to see imbalance and choose priorities; revisit regularly | Paul J. Meyer (1960s), used widely in coaching | Monthly rating with a radar chart vs last month. The same 8 areas organise tags, habits, goals and XP into **character stats**. |
| **Goals in ~12-week seasons, broken into weekly actions** | Common goal-setting advice (and the original Superfocus idea) | The Goals page: seasons → goals → weekly tasks → calendar plan. |

## Platform choices

| Need | Finding | Decision |
|---|---|---|
| iPhone + PC, free, no App Store | Installed home-screen web apps on iOS run full-screen. Storage can be cleared by iOS, but installed apps that ask for persistent storage are protected best. | An installable web app (PWA) that requests persistent storage and syncs to the cloud. |
| Free sync | Firebase's free Spark plan includes Auth, 1 GiB Firestore, 50K reads and 20K writes per day; it shuts off rather than charging you if exceeded | Firebase, with incremental sync (only changed items are downloaded) to stay far under the limits. |
| Offline | Web Firestore doesn't cache offline by default; iOS has no background sync | The app stores everything locally first, saves immediately when it goes to the background, and syncs when it reopens. |

## Sources

- James Clear, *Atomic Habits* summaries: [nateliason.com](https://www.nateliason.com/notes/atomic-habits-james-clear), [habitbox.app](https://habitbox.app/blog/atomic-habits-summary), [activatedhuman.earth](https://activatedhuman.earth/methods/atomic-habits)
- BJ Fogg, *Tiny Habits*: [Stanford PDF](https://med.stanford.edu/content/dam/sm/ascend/documents/Introduction_%20Tiny%20Habits%20for%20Self%20Compassion,%20Getting%20Started.pdf), [supersummary.com](https://www.supersummary.com/tiny-habits/summary/), [coachingforleaders.com](https://coachingforleaders.com/wp-content/uploads/free/bj-fogg-tiny-habits.pdf)
- Laura Vanderkam, time logging: [Time tracking FAQs](https://lauravanderkam.com/2019/09/time-tracking-faqs/), [interview](https://michaelrucker.com/thought-leader-interviews/laura-vanderkam-keeping-a-time-log/), [Next Big Idea Club](https://nextbigideaclub.com/magazine/laura-vanderkam-one-tool-need-keep-track-time/7717/)
- Gamification: [arXiv health habit study](https://arxiv.org/pdf/1708.04418), [DiGRA SDT paper](https://dl.digra.org/index.php/dl/article/view/2773), [lifestack.ai](https://lifestack.ai/blog/gamified-habit-formation), [themasterly.com](https://www.themasterly.com/blog/progression-systems-that-build-daily-habits), [ogamic.com](https://ogamic.com/blog/gamified-habit-tracker-app-with-xp-and-streaks)
- Self-monitoring: [MyFitnessPal study (arXiv)](https://arxiv.org/pdf/1904.02813), [Log2Lose trial](https://cdn.clinicaltrials.gov/large-docs/09/NCT04770909/ICF_001.pdf)
- Wheel of Life: [positivepsychology.com](https://positivepsychology.com/wheel-of-life-coaching/), [BetterUp](https://www.betterup.com/blog/wheel-of-life)
- iOS web apps: [WebKit storage policy](https://webkit.org/updates), [progressivewebapps.com](https://progressivewebapps.com/platforms/ios-safari/), [MobiLoud](https://www.mobiloud.com/blog/progressive-web-apps-ios/)
- Firebase: [offline data docs](https://firebase.google.com/docs/firestore/enable-offline), [pricing summary](https://agentdeals.dev/vendor/firebase)
