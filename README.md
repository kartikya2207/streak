# DSA Streak

A tiny offline-first PWA that keeps me honest about grinding
[Striver's A2Z DSA sheet](https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2):
**379/474 problems by Nov 21, 2026**.

**Live:** https://kartikya2207.github.io/streak/

## What it is

A single-user accountability scoreboard. I log how many problems I solved each day, and the app
tells me whether I'm on pace, how long my streak is, and how much I need per week to hit the goal.
The deadline and the weekly floor are hardcoded on purpose — there is no settings screen that lets
me quietly move the goalposts.

No accounts, no server, no analytics. Plain HTML/CSS/JS, no build step, and all data lives in
`localStorage` on the device.

## What I did

- **Dynamic weekly target** — `max(10, ceil(remaining / weeksLeft))`, recomputed daily. If I fall
  behind, the target visibly grows. The floor of 10/week is a hard minimum (`CFG.FLOOR`) and is
  never editable.
- **Streak** — a day counts with ≥1 solve, or by spending the once-per-calendar-week
  **minimum day** streak saver. Weeks are Monday-start.
- **Mood hero** — neutral before 21:00, a red AT-RISK pulse after 21:00 if today is unlogged and
  the streak is alive, warm coral at 1 solve, gold at 2+ (with a stronger level when today's count
  beats what I need per day).
- **Achievements** — 17 badges: a streak track (3 → 100 days), a volume track (150 → 379 solved),
  and three behaviour badges (Clutch, Overclocked, Unbroken Month). Behaviour badges are computed
  retroactively per week using what the dynamic target *was* at the start of that week
  (`targetAtWeekStart`), not today's target.
- **Offline shell** — `sw.js` caches the app shell (and the confetti script from jsDelivr) so it
  opens without a network, and it's installable via `manifest.json`.
- **Testable core** — `app.js` is split into a pure core (date math, streaks, targets, mood,
  badges, migration) that is exported for Node, and a DOM layer that only runs in the browser.
  `test/test.js` has 63 assertions covering countdowns, target growth, week boundaries, mood
  states and every badge rule.

### Storage

Key `dsa-streak-v2`: `{base, entries: {"YYYY-MM-DD": {s, min}}, firstDay, ach: {badgeId: dateEarned}}`.
Legacy `dsa-streak-v1` data is migrated automatically on first load (additively — the v1 key is
left in place as a backup).

### Notification honesty (read before expecting 9pm pings)

The app is fully static — there is **no push server**. What it can and cannot do:

- **Works: in-app AT-RISK notification.** When the app is *open* (or in a recent tab) after 21:00
  with an unlogged day, the service worker shows a local notification (once per day, only if
  permission was granted — asked on the first achievement unlock, never on page load).
- **Not possible: scheduled reminders while the app is closed.** Browsers don't run arbitrary
  timers in closed PWAs. Real 9pm pings need Web Push: a GitHub Actions cron + `web-push` + VAPID
  keys + a stored push subscription. That's a separate job — open an issue titled "web-push" when wanted.
- **Partial: icon badge** (`navigator.setAppBadge`), attempted when today is unlogged. It renders on
  installed PWAs on Windows/macOS/ChromeOS. Android Chrome does not support the Badging API, so the
  call is a silent no-op there.
- **Not possible: an Android home-screen widget.** The manifest `widgets` member is Windows-11-only.

## What I learnt

- **Date math is where the bugs live.** Local-time `Date` objects, Monday-start weeks, "today vs
  yesterday" streak logic and a deadline that clamps to zero all needed explicit tests. Writing
  them first (e.g. "Aug 11 → Nov 21 = 102 days") caught off-by-ones I'd never have spotted by
  clicking around.
- **Keeping logic pure pays off.** Because the core takes `state` and `today` as arguments instead
  of reading globals, I can test "what does the app show at 21:30 on a Tuesday" in Node without a
  browser or a fake clock.
- **Schema migrations matter even for a toy.** Adding achievements in v2 meant changing the stored
  shape; migrating additively and keeping the v1 key meant I couldn't lose my own history.
- **The web platform has real limits.** I wanted 9pm reminders and an Android badge. Reading up on
  the Badging API and service-worker lifetimes showed that neither is possible from a static site,
  so I documented the limits instead of shipping something that silently doesn't work.
- **Design for the behaviour you want.** Making the deadline and floor non-editable was the most
  important "feature" — the friction is the point.

## Repo structure

```
index.html            UI (markup + styles)
app.js                pure core (exported for Node) + browser DOM layer
sw.js                 service worker: offline shell cache, notification click handling
manifest.json         PWA manifest
icon*.png, icon.svg   app icons
test/test.js          Node tests for the pure core
```

## How to run

It's a static site, so any local server works:

```
python -m http.server 8000     # then open http://localhost:8000
```

(Service workers need `localhost` or HTTPS, so opening `index.html` directly won't register it.)

Run the tests (Node, no dependencies):

```
node test/test.js
```
