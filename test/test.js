const core = require('../app.js');
let fails = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name}`);
}
const D = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min); // 1-based month helper

// ================= v1 core (regression) =================

// --- countdown: Aug 11 2026 -> Nov 21 2026 = 102 days
eq('daysLeft Aug 11', core.daysLeft(D(2026, 8, 11)), 102);
eq('daysLeft Nov 20', core.daysLeft(D(2026, 11, 20)), 1);
eq('daysLeft on deadline', core.daysLeft(D(2026, 11, 21)), 0);
eq('daysLeft past deadline clamps 0', core.daysLeft(D(2026, 11, 25)), 0);

// --- dynamic target
let s = { base: 133, entries: {}, firstDay: '2026-08-11' };
eq('target Aug 11 base133', core.target(s, D(2026, 8, 11)), 17);
eq('needsPerWeek Aug 11', Math.round(core.needsPerWeek(s, D(2026, 8, 11)) * 10) / 10, 16.9);
s = { base: 375, entries: {}, firstDay: '2026-08-11' };
eq('target floors at 10', core.target(s, D(2026, 8, 11)), 10);
s = { base: 379, entries: {}, firstDay: '2026-08-11' };
eq('target when done = 10', core.target(s, D(2026, 8, 11)), 10);
s = { base: 133, entries: {}, firstDay: '2026-08-11' };
eq('target grows if behind (Sep 1)', core.target(s, D(2026, 9, 1)), 22);
eq('target past deadline = remaining', core.target(s, D(2026, 11, 25)), 246);

// --- total
s = { base: 100, entries: { '2026-08-10': { s: 3, min: false }, '2026-08-11': { s: 2, min: false } }, firstDay: '2026-08-10' };
eq('totalSolved = base + sum', core.totalSolved(s), 105);
eq('totalBefore excludes cut date', core.totalBefore(s, D(2026, 8, 11)), 103);

// --- week math (Mon-start). Aug 11 2026 is a Tuesday; week = Aug 10 (Mon) .. Aug 16 (Sun)
eq('weekDays starts Monday', core.dkey(core.weekDays(D(2026, 8, 11))[0]), '2026-08-10');
eq('weekDays ends Sunday', core.dkey(core.weekDays(D(2026, 8, 11))[6]), '2026-08-16');
eq('weekTotal in-week', core.weekTotal(s, D(2026, 8, 11)), 5);
eq('weekTotal excludes prior week', core.weekTotal(s, D(2026, 8, 17)), 0);

// --- streak across week boundary
s = { base: 0, firstDay: '2026-08-08', entries: {
  '2026-08-08': { s: 1, min: false }, '2026-08-09': { s: 2, min: false },
  '2026-08-10': { s: 1, min: false }, '2026-08-11': { s: 1, min: false } } };
eq('streak across week boundary', core.streak(s, D(2026, 8, 11)), 4);
delete s.entries['2026-08-11'];
eq('streak today-unlogged = ending yesterday', core.streak(s, D(2026, 8, 11)), 3);
s.entries['2026-08-11'] = { s: 1, min: false };
delete s.entries['2026-08-10'];
eq('gap breaks streak', core.streak(s, D(2026, 8, 11)), 1);

// --- min-day
s = { base: 0, firstDay: '2026-08-10', entries: { '2026-08-10': { s: 0, min: true } } };
eq('min day is valid day', core.isValid(s, D(2026, 8, 10)), true);
eq('min counts toward streak', core.streak(s, D(2026, 8, 10)), 1);
eq('minUsedThisWeek true', core.minUsedThisWeek(s, D(2026, 8, 11)), true);
eq('minUsed resets next week', core.minUsedThisWeek(s, D(2026, 8, 17)), false);
s.entries['2026-08-10'].s = 3;
eq('min still used after solving', core.minUsedThisWeek(s, D(2026, 8, 11)), true);
s = { base: 0, firstDay: '2026-08-10', entries: { '2026-08-10': { s: 0, min: true } } };
eq('min day adds 0 solves to week', core.weekTotal(s, D(2026, 8, 11)), 0);

// ================= v2: migration =================
const v1data = { base: 140, entries: { '2026-08-10': { s: 2, min: false } }, firstDay: '2026-08-01' };
const v2data = core.migrateV1(v1data);
eq('migration keeps base', v2data.base, 140);
eq('migration keeps entries', v2data.entries, v1data.entries);
eq('migration keeps firstDay', v2data.firstDay, '2026-08-01');
eq('migration adds empty ach', v2data.ach, {});
const v2again = core.migrateV1({ base: 1, entries: {}, firstDay: '2026-08-01', ach: { st3: '2026-08-05' }, notifAsked: true });
eq('migration is idempotent (keeps ach)', v2again.ach, { st3: '2026-08-05' });
eq('migration keeps extra fields', v2again.notifAsked, true);

// ================= v2: mood transitions =================
// base 133, streak of 3 ending yesterday (Aug 8-10), today Aug 11 unlogged
const mkState = (todayEntry) => {
  const st = { base: 133, firstDay: '2026-08-08', ach: {}, entries: {
    '2026-08-08': { s: 1, min: false }, '2026-08-09': { s: 1, min: false }, '2026-08-10': { s: 1, min: false } } };
  if (todayEntry) st.entries['2026-08-11'] = todayEntry;
  return st;
};
eq('mood: 0 solved before 21:00 = waiting', core.mood(mkState(null), D(2026, 8, 11, 20, 59)).key, 'waiting');
let m = core.mood(mkState(null), D(2026, 8, 11, 21, 0));
eq('mood: 0 solved at 21:00 + streak = risk', m.key, 'risk');
eq('mood: risk carries streak N', m.streak, 3);
eq('mood: risk hoursLeft at 21:xx = 3', m.hoursLeft, 3);
eq('mood: risk hoursLeft at 23:10 = 1', core.mood(mkState(null), D(2026, 8, 11, 23, 10)).hoursLeft, 1);
// streak 0 -> never risk, even late
eq('mood: no streak at 22:00 = waiting', core.mood({ base: 133, firstDay: '2026-08-11', ach: {}, entries: {} }, D(2026, 8, 11, 22, 0)).key, 'waiting');
eq('mood: 1 solved = happy', core.mood(mkState({ s: 1, min: false }), D(2026, 8, 11, 12, 0)).key, 'happy');
eq('mood: 1 solved late stays happy (not risk)', core.mood(mkState({ s: 1, min: false }), D(2026, 8, 11, 22, 0)).key, 'happy');
m = core.mood(mkState({ s: 0, min: true }), D(2026, 8, 11, 22, 0));
eq('mood: min-day late = happy(saved), not risk', [m.key, m.saved], ['happy', true]);
m = core.mood(mkState({ s: 2, min: false }), D(2026, 8, 11, 12, 0));
eq('mood: 2 solved = delighted L1', [m.key, m.level], ['delighted', 1]);
// dailyNeed here = ceil((379-136)/102) = 3 -> 3 solves reaches pace = level 2
m = core.mood(mkState({ s: 3, min: false }), D(2026, 8, 11, 12, 0));
eq('mood: at daily pace = delighted L2', [m.key, m.level], ['delighted', 2]);

// ================= v2: achievements =================
// streak thresholds
const runOf = (n, endY, endM, endD) => {
  const e = {};
  for (let i = 0; i < n; i++) e[core.dkey(core.addDays(D(endY, endM, endD), -i))] = { s: 1, min: false };
  return e;
};
s = { base: 0, firstDay: '2026-05-01', ach: {}, entries: runOf(7, 2026, 8, 11) };
eq('streak badge: 7 earns st3+st7', core.earnedNow(s, D(2026, 8, 11)).filter(id => id.startsWith('st')), ['st3', 'st7']);
eq('streak badge: 6 not yet st7', core.badgeEarned({ ...s, entries: runOf(6, 2026, 8, 11) }, 'st7', D(2026, 8, 11)), false);
s = { base: 0, firstDay: '2026-05-01', ach: {}, entries: runOf(100, 2026, 8, 11) };
eq('streak badge: 100 earns full track', core.earnedNow(s, D(2026, 8, 11)).filter(id => id.startsWith('st')).length, 8);
// min-day counts as valid inside a streak run
s = { base: 0, firstDay: '2026-08-08', ach: {}, entries: {
  '2026-08-09': { s: 1, min: false }, '2026-08-10': { s: 0, min: true }, '2026-08-11': { s: 1, min: false } } };
eq('streak badge: min-day counts toward st3', core.badgeEarned(s, 'st3', D(2026, 8, 11)), true);

// volume thresholds
s = { base: 148, firstDay: '2026-08-10', ach: {}, entries: { '2026-08-11': { s: 2, min: false } } };
eq('volume badge: exactly 150 unlocks', core.badgeEarned(s, 'v150', D(2026, 8, 11)), true);
eq('volume badge: 150 does not unlock 200', core.badgeEarned(s, 'v200', D(2026, 8, 11)), false);
s = { base: 379, firstDay: '2026-08-11', ach: {}, entries: {} };
eq('volume badge: 379 = full track', core.earnedNow(s, D(2026, 8, 11)).filter(id => id.startsWith('v')).length, 6);

// --- Clutch: min-day used in a week AND that week still cleared the floor
s = { base: 0, firstDay: '2026-08-10', ach: {}, entries: {
  '2026-08-10': { s: 0, min: true },
  '2026-08-11': { s: 4, min: false }, '2026-08-12': { s: 3, min: false }, '2026-08-13': { s: 3, min: false } } };
eq('clutch: min + floor cleared = earned', core.badgeEarned(s, 'bClutch', D(2026, 8, 13)), true);
s.entries['2026-08-13'].s = 2; // week total 9 < floor
eq('clutch: min + under floor = not earned', core.badgeEarned(s, 'bClutch', D(2026, 8, 13)), false);
s = { base: 0, firstDay: '2026-08-10', ach: {}, entries: { '2026-08-10': { s: 12, min: false } } };
eq('clutch: floor without min = not earned', core.badgeEarned(s, 'bClutch', D(2026, 8, 11)), false);

// --- Overclocked: a week at 2x the dynamic target (as computed at that week's Monday)
// base 350 at week of Aug 10: remaining 29, daysLeft(Aug 10)=103 -> wk 14.71 -> target 10 (floor). 2x = 20.
s = { base: 350, firstDay: '2026-08-10', ach: {}, entries: {
  '2026-08-10': { s: 7, min: false }, '2026-08-11': { s: 7, min: false }, '2026-08-12': { s: 6, min: false } } };
eq('overclocked target check', core.targetAtWeekStart(s, D(2026, 8, 10)), 10);
eq('overclocked: 20 in a 10-target week = earned', core.badgeEarned(s, 'bOver', D(2026, 8, 12)), true);
s.entries['2026-08-12'].s = 5; // 19 < 20
eq('overclocked: 19 in a 10-target week = not earned', core.badgeEarned(s, 'bOver', D(2026, 8, 12)), false);
// base 133 week: target 17 -> needs 34
s = { base: 133, firstDay: '2026-08-10', ach: {}, entries: { '2026-08-10': { s: 33, min: false } } };
eq('overclocked: 33 vs 2x17=34 = not earned', core.badgeEarned(s, 'bOver', D(2026, 8, 11)), false);
s.entries['2026-08-10'].s = 34;
eq('overclocked: 34 vs 34 = earned', core.badgeEarned(s, 'bOver', D(2026, 8, 11)), true);

// --- Unbroken Month: 4 consecutive weeks each >= floor
const fourWeeks = {};
[
  '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03'
].forEach(mon => { fourWeeks[mon] = { s: 10, min: false }; });
s = { base: 0, firstDay: '2026-07-13', ach: {}, entries: fourWeeks };
eq('unbroken month: 4 weeks >= floor = earned', core.badgeEarned(s, 'bMonth', D(2026, 8, 9)), true);
const gapWeeks = { ...fourWeeks }; gapWeeks['2026-07-27'] = { s: 9, min: false };
s = { base: 0, firstDay: '2026-07-13', ach: {}, entries: gapWeeks };
eq('unbroken month: one week at 9 breaks it', core.badgeEarned(s, 'bMonth', D(2026, 8, 9)), false);
const threeWeeks = { ...fourWeeks }; delete threeWeeks['2026-08-03'];
s = { base: 0, firstDay: '2026-07-13', ach: {}, entries: threeWeeks };
eq('unbroken month: 3 weeks not enough', core.badgeEarned(s, 'bMonth', D(2026, 8, 2)), false);
// non-consecutive: floor, miss, floor, floor, floor
const brokenRun = {};
['2026-06-29', '2026-07-13', '2026-07-20', '2026-07-27'].forEach(mon => { brokenRun[mon] = { s: 10, min: false }; });
s = { base: 0, firstDay: '2026-06-29', ach: {}, entries: brokenRun };
eq('unbroken month: gap week resets run', core.badgeEarned(s, 'bMonth', D(2026, 8, 2)), false);

// badge catalogue sanity
eq('badge count = 17', core.BADGES.length, 17);
eq('tracks well-formed', core.BADGES.every(b => ['streak', 'volume', 'behaviour'].includes(b.track) && b.copy && b.need && b.emoji), true);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
