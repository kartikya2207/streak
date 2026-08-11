# DSA Streak 🔥

Personal accountability scoreboard for grinding [Striver's A2Z DSA sheet](https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2)
to **379/474 by Nov 21, 2026** (deadline hardcoded, not editable — that's the point).

**Live:** https://kartikya2207.github.io/streak/

Single-user, offline-first static PWA. No accounts, no server, no analytics.
All data lives in `localStorage` on the device.

## How it works

- **Dynamic weekly target** — `max(10, ceil(remaining / weeksLeft))`, recomputed
  daily. Fall behind and the target visibly grows. The floor of 10/week is a hard
  minimum and is never editable.
- **Streak** — a day is valid with ≥1 solve, or by spending the once-per-calendar-week
  **minimum day** streak saver.
- **Mood hero** — neutral before 21:00, berry-red AT-RISK pulse after 21:00 with an
  unlogged day and a live streak, warm coral at 1 solve, gold sparks at 2+.
- **Achievements** — streak track (3→100 days), volume track (150→379 solved), and
  three behaviour badges (Clutch, Overclocked, Unbroken Month). Trophy button, top right.

## Storage

Key `dsa-streak-v2`: `{base, entries: {"YYYY-MM-DD": {s, min}}, firstDay, ach: {badgeId: dateEarned}}`.
Legacy `dsa-streak-v1` data is migrated automatically on first load (additively —
the v1 key is left in place as a backup).

## Notification honesty (read before expecting 9pm pings)

This app is fully static — there is **no push server**. What it can and cannot do:

- ✅ **In-app AT-RISK notification**: when the app is *open* (or in a recent tab)
  after 21:00 with an unlogged day, the service worker shows a local notification
  (once per day, only if you've granted permission — asked on your first
  achievement unlock, never on page load).
- ❌ **Scheduled daily reminders while the app is closed are not possible** from a
  static site. Browsers do not run arbitrary timers in closed PWAs. True 9pm pings
  need Web Push: a GitHub Actions cron + `web-push` + VAPID keys + a stored push
  subscription. That's a separate job — open an issue titled "web-push" when wanted.
- ⚠️ **Icon badge** (`navigator.setAppBadge`): attempted when today is unlogged.
  Renders on installed PWAs on **Windows/macOS/ChromeOS**. **Android Chrome does
  not support the Badging API** — the call is a silent no-op there. Android badge
  dots only come from notifications, per OS behaviour.
- ❌ An Android **home-screen widget** is not possible from a PWA (the manifest
  `widgets` member is Windows-11-only). The app icon is the ceiling.

## Development

Plain HTML/CSS/JS, no build step. `app.js` exports its pure core (streak math,
targets, mood, achievements, migration) for Node:

```
node test/test.js
```
