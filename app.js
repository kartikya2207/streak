/* DSA Streak — logic. Pure core is exported for Node tests; DOM layer runs in browser only. */
(function (root) {
  'use strict';

  var CFG = {
    KEY_V1: 'dsa-streak-v1',
    KEY: 'dsa-streak-v2',
    GOAL: 379,
    SHEET_MAX: 474,
    FLOOR: 10,                       // hard minimum, never editable
    DEADLINE: { y: 2026, m: 10, d: 21 }, // Nov 21, 2026 — LOCKED, local time
    RISK_HOUR: 21                    // AT RISK kicks in at 21:00 local
  };

  // ---------- pure helpers (no DOM, no globals) ----------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function dkey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function mondayOf(d) { var x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); }
  function deadlineDate() { return new Date(CFG.DEADLINE.y, CFG.DEADLINE.m, CFG.DEADLINE.d); }

  function entryFor(state, d) { return state.entries[dkey(d)] || null; }
  function isValid(state, d) { var e = entryFor(state, d); return !!e && (e.s > 0 || !!e.min); }

  // consecutive valid days ending today (or yesterday if today is unlogged)
  function streak(state, today) {
    var n = 0, d = today;
    if (!isValid(state, d)) d = addDays(d, -1);
    while (isValid(state, d)) { n++; d = addDays(d, -1); }
    return n;
  }

  // Monday-start week containing `today`
  function weekDays(today) {
    var mon = mondayOf(today), arr = [];
    for (var i = 0; i < 7; i++) arr.push(addDays(mon, i));
    return arr;
  }
  function weekTotal(state, today) {
    return weekDays(today).reduce(function (s, d) {
      var e = entryFor(state, d); return s + (e ? e.s : 0);
    }, 0);
  }
  function minUsedThisWeek(state, today) {
    return weekDays(today).some(function (d) {
      var e = entryFor(state, d); return !!(e && e.min);
    });
  }
  function totalSolved(state) {
    return state.base + Object.values(state.entries).reduce(function (s, e) { return s + e.s; }, 0);
  }
  // base + solves logged strictly before `date` (for retroactive per-week targets)
  function totalBefore(state, date) {
    var cut = dkey(date);
    return state.base + Object.keys(state.entries).reduce(function (s, k) {
      return s + (k < cut ? state.entries[k].s : 0);
    }, 0);
  }

  function daysLeft(today) {
    return Math.max(0, Math.round((deadlineDate() - startOfDay(today)) / 86400000));
  }
  function weeksLeft(today) { return Math.max(1, daysLeft(today) / 7); }
  // dynamic weekly target: recomputed from remaining work; floor 10 always
  function target(state, today) {
    var remaining = Math.max(0, CFG.GOAL - totalSolved(state));
    return Math.max(CFG.FLOOR, Math.ceil(remaining / weeksLeft(today)));
  }
  function needsPerWeek(state, today) {
    return Math.max(0, CFG.GOAL - totalSolved(state)) / weeksLeft(today);
  }
  // what the dynamic target was at the start of a given week (Monday)
  function targetAtWeekStart(state, monday) {
    var remaining = Math.max(0, CFG.GOAL - totalBefore(state, monday));
    return Math.max(CFG.FLOOR, Math.ceil(remaining / weeksLeft(monday)));
  }

  // ---------- v1 → v2 migration (additive, lossless) ----------
  function migrateV1(v1) {
    var v2 = Object.assign({}, v1);
    v2.ach = v2.ach || {};            // badgeId -> "YYYY-MM-DD" earned
    return v2;
  }

  // ---------- mood state ----------
  // `now` is a full Date (with clock time)
  function mood(state, now) {
    var t = startOfDay(now);
    var e = entryFor(state, t) || { s: 0, min: false };
    var st = streak(state, t);
    if (e.s >= 2) {
      var rem = Math.max(0, CFG.GOAL - totalSolved(state));
      var dailyNeed = Math.max(1, Math.ceil(rem / Math.max(1, daysLeft(t))));
      var level = e.s >= Math.max(3, dailyNeed) ? 2 : 1;
      return { key: 'delighted', level: level, streak: st, todays: e.s };
    }
    if (e.s === 1) return { key: 'happy', streak: st, todays: 1, saved: false };
    if (e.min) return { key: 'happy', streak: st, todays: 0, saved: true };
    if (now.getHours() >= CFG.RISK_HOUR && st >= 1) {
      return { key: 'risk', streak: st, todays: 0, hoursLeft: 24 - now.getHours() };
    }
    return { key: 'waiting', streak: st, todays: 0 };
  }

  // ---------- achievements ----------
  function mondaysBetween(state, today) {
    var m = mondayOf(parseKey(state.firstDay)), end = mondayOf(today), out = [];
    while (m <= end) { out.push(m); m = addDays(m, 7); }
    return out;
  }
  function weekStats(state, monday) {
    var s = 0, hasMin = false;
    for (var i = 0; i < 7; i++) {
      var e = entryFor(state, addDays(monday, i));
      if (e) { s += e.s; if (e.min) hasMin = true; }
    }
    return { total: s, hasMin: hasMin };
  }
  function clutchEarned(state, today) {
    return mondaysBetween(state, today).some(function (m) {
      var w = weekStats(state, m); return w.hasMin && w.total >= CFG.FLOOR;
    });
  }
  function overclockedEarned(state, today) {
    return mondaysBetween(state, today).some(function (m) {
      return weekStats(state, m).total >= 2 * targetAtWeekStart(state, m);
    });
  }
  function unbrokenMonthEarned(state, today) {
    var runs = 0;
    var mondays = mondaysBetween(state, today);
    for (var i = 0; i < mondays.length; i++) {
      runs = weekStats(state, mondays[i]).total >= CFG.FLOOR ? runs + 1 : 0;
      if (runs >= 4) return true;
    }
    return false;
  }

  var BADGES = [
    // streak track (consecutive days; min-days count as valid)
    { id: 'st3',   track: 'streak', emoji: '🌱', name: 'Teen Din',      need: '3-day streak',  copy: 'Teen din. Ab yeh accident nahi hai.' },
    { id: 'st7',   track: 'streak', emoji: '🔥', name: 'One Week',      need: '7-day streak',  copy: "One week. You've stopped being someone who *plans* to do DSA." },
    { id: 'st14',  track: 'streak', emoji: '⚡', name: 'Fortnight',     need: '14-day streak', copy: 'Two weeks. The sheet has started to notice.' },
    { id: 'st21',  track: 'streak', emoji: '💪', name: '21 Club',       need: '21-day streak', copy: '21 days. This is where it stops needing willpower.' },
    { id: 'st30',  track: 'streak', emoji: '🌙', name: 'Ek Mahina',     need: '30-day streak', copy: 'Ek mahina. Nov 21 is now a math problem, not a hope.' },
    { id: 'st50',  track: 'streak', emoji: '🚀', name: 'Fifty',         need: '50-day streak', copy: "50. Most people quit around day 9. You're not in that dataset." },
    { id: 'st75',  track: 'streak', emoji: '🏔️', name: 'Seventy-Five', need: '75-day streak', copy: "75 days. Whatever scared you in June isn't scary anymore." },
    { id: 'st100', track: 'streak', emoji: '👑', name: 'Century',       need: '100-day streak', copy: '100. Chal, ek aur.' },
    // volume track (total A2Z solved)
    { id: 'v150', track: 'volume', emoji: '🎯', name: '150',      need: '150 total solved', copy: '150. Warm-up khatam.' },
    { id: 'v200', track: 'volume', emoji: '🏋️', name: '200',     need: '200 total solved', copy: '200. Halfway to the number that gets you in the room.' },
    { id: 'v250', track: 'volume', emoji: '⛰️', name: '250',     need: '250 total solved', copy: '250. More behind you than ahead.' },
    { id: 'v300', track: 'volume', emoji: '💎', name: '300',      need: '300 total solved', copy: '300. The last 79 are the ones that count.' },
    { id: 'v340', track: 'volume', emoji: '🦁', name: '340',      need: '340 total solved', copy: '340. Ab rukna mat.' },
    { id: 'v379', track: 'volume', emoji: '🏆', name: 'THE SHEET', need: '379 total solved', copy: '379/474. Done. Nov 21 met. Go be insufferable about it.' },
    // behaviour badges
    { id: 'bClutch', track: 'behaviour', emoji: '🛟', name: 'Clutch',         need: 'Use a min-day in a week and still clear the floor', copy: 'Saved the streak AND cleared the floor. That is champion behaviour.' },
    { id: 'bOver',   track: 'behaviour', emoji: '🧨', name: 'Overclocked',    need: 'One week at 2× the dynamic target',                 copy: 'Double the target in one week. The sheet felt that.' },
    { id: 'bMonth',  track: 'behaviour', emoji: '🗓️', name: 'Unbroken Month', need: '4 consecutive weeks, each ≥ the floor',            copy: 'Four straight weeks over the floor. Systems > moods.' }
  ];
  var STREAK_THRESH = { st3: 3, st7: 7, st14: 14, st21: 21, st30: 30, st50: 50, st75: 75, st100: 100 };
  var VOLUME_THRESH = { v150: 150, v200: 200, v250: 250, v300: 300, v340: 340, v379: 379 };

  function badgeEarned(state, id, now) {
    var t = startOfDay(now);
    if (STREAK_THRESH[id]) return streak(state, t) >= STREAK_THRESH[id];
    if (VOLUME_THRESH[id]) return totalSolved(state) >= VOLUME_THRESH[id];
    if (id === 'bClutch') return clutchEarned(state, t);
    if (id === 'bOver') return overclockedEarned(state, t);
    if (id === 'bMonth') return unbrokenMonthEarned(state, t);
    return false;
  }
  function earnedNow(state, now) {
    return BADGES.filter(function (b) { return badgeEarned(state, b.id, now); })
                 .map(function (b) { return b.id; });
  }

  var core = {
    CFG: CFG, dkey: dkey, parseKey: parseKey, startOfDay: startOfDay, addDays: addDays,
    mondayOf: mondayOf, deadlineDate: deadlineDate, entryFor: entryFor, isValid: isValid,
    streak: streak, weekDays: weekDays, weekTotal: weekTotal,
    minUsedThisWeek: minUsedThisWeek, totalSolved: totalSolved, totalBefore: totalBefore,
    daysLeft: daysLeft, weeksLeft: weeksLeft, target: target, needsPerWeek: needsPerWeek,
    targetAtWeekStart: targetAtWeekStart, migrateV1: migrateV1, mood: mood,
    BADGES: BADGES, badgeEarned: badgeEarned, earnedNow: earnedNow,
    weekStats: weekStats, mondaysBetween: mondaysBetween
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }
  if (typeof document === 'undefined') return;

  // ---------- browser app ----------
  var state = null;
  var $ = function (id) { return document.getElementById(id); };
  var today = function () { return startOfDay(new Date()); };
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadState() {
    try {
      var raw = localStorage.getItem(CFG.KEY);
      if (raw) { state = migrateV1(JSON.parse(raw)); return; }   // ensure ach exists even on v2
      var raw1 = localStorage.getItem(CFG.KEY_V1);
      if (raw1) {
        state = migrateV1(JSON.parse(raw1));                     // v1 kept untouched as backup
        save();
      }
    } catch (e) { state = null; }
  }
  function save() {
    try { localStorage.setItem(CFG.KEY, JSON.stringify(state)); }
    catch (e) { toast('⚠️ storage failed — data may not persist'); }
  }
  function show(id) {
    ['setupCard', 'settingsCard', 'achCard', 'main'].forEach(function (x) { $(x).classList.add('hidden'); });
    $(id).classList.remove('hidden');
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.opacity = 0; }, 1800);
  }

  // ---------- celebrations ----------
  function pop(opts) {
    if (reducedMotion || typeof confetti === 'undefined') return;
    confetti(Object.assign({ disableForReducedMotion: true }, opts));
  }
  var PALETTE = ['#FF5D3A', '#FF9A3D', '#FFB627', '#1FBF8F', '#FF7BAC'];
  function popSmall() {
    pop({ particleCount: 30, spread: 55, startVelocity: 32, origin: { y: 0.75 }, colors: PALETTE, scalar: 0.9 });
  }
  function popBig() {
    pop({ particleCount: 90, spread: 80, startVelocity: 42, origin: { y: 0.7 }, colors: PALETTE });
    setTimeout(function () { pop({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.8 }, colors: PALETTE }); }, 180);
    setTimeout(function () { pop({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.8 }, colors: PALETTE }); }, 320);
  }
  function popMega() {
    popBig();
    setTimeout(function () { pop({ particleCount: 120, spread: 120, startVelocity: 50, origin: { y: 0.55 }, colors: PALETTE, scalar: 1.2 }); }, 450);
  }
  var CHEERS = ['chal, ek aur 🔥', 'ek aur ho gaya! 💪', 'sheet is scared of you', 'full sending 🚀', 'crispy solve 😤', 'mast chal raha hai', 'aag laga di 🔥'];
  var cheerIdx = 0;
  function nextCheer() { cheerIdx = (cheerIdx + 1) % CHEERS.length; return CHEERS[cheerIdx]; }

  // ---------- notifications + badge (best-effort, no server) ----------
  function maybeAskNotifPermission() {
    // asked exactly once, and only from a user-gesture unlock — never on load
    if (state.notifAsked) return;
    if (!('Notification' in window)) return;
    state.notifAsked = true; save();
    if (Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }
  }
  function maybeRiskNotify(m) {
    if (m.key !== 'risk') return;
    var k = dkey(today());
    if (state.riskNotifDay === k) return;                        // once per day
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    state.riskNotifDay = k; save();
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.showNotification('🔥 Streak at risk', {
        body: 'streak ' + m.streak + ' din ka hai. ' + m.hoursLeft + (m.hoursLeft === 1 ? ' ghanta' : ' ghante') + ' bache hain. Ek problem = saved.',
        icon: './icon-192.png', badge: './icon-192.png', tag: 'dsa-risk'
      });
    }).catch(function () {});
  }
  function updateAppBadge(dayValid) {
    if (!('setAppBadge' in navigator)) return;
    try {
      var p = dayValid ? navigator.clearAppBadge() : navigator.setAppBadge(1);
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  // ---------- achievements UI ----------
  var takeoverQueue = [];
  function badgeById(id) { return BADGES.filter(function (b) { return b.id === id; })[0]; }
  function showTakeover(id) {
    var b = badgeById(id);
    $('tkEmoji').textContent = b.emoji;
    $('tkName').textContent = b.name;
    $('tkCopy').textContent = b.copy;
    $('takeover').classList.remove('hidden');
    popMega();
    $('tkClose').focus();
  }
  $('tkClose').addEventListener('click', function () {
    $('takeover').classList.add('hidden');
    if (takeoverQueue.length) showTakeover(takeoverQueue.shift());
  });
  function checkAchievements(fromGesture) {
    var fresh = earnedNow(state, new Date()).filter(function (id) { return !state.ach[id]; });
    if (!fresh.length) return;
    var stamp = dkey(today());
    fresh.forEach(function (id) { state.ach[id] = stamp; });
    save();
    if (fromGesture) maybeAskNotifPermission();
    takeoverQueue = takeoverQueue.concat(fresh);
    if ($('takeover').classList.contains('hidden')) showTakeover(takeoverQueue.shift());
  }
  function fmtDate(k) {
    var d = parseKey(k);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function renderAchievements() {
    var groups = { streak: $('badgesStreak'), volume: $('badgesVolume'), behaviour: $('badgesBehaviour') };
    Object.values(groups).forEach(function (el) { el.innerHTML = ''; });
    var count = 0;
    BADGES.forEach(function (b) {
      var earned = state.ach[b.id];
      if (earned) count++;
      var el = document.createElement('div');
      el.className = 'badge ' + (earned ? 'unlocked' : 'locked');
      el.innerHTML = '<div class="bemoji">' + b.emoji + '</div>' +
        '<div class="bname">' + b.name + '</div>' +
        (earned
          ? '<div class="bdate">✓ ' + fmtDate(earned) + '</div>'
          : '<div class="bneed">' + b.need + '</div>');
      groups[b.track].appendChild(el);
    });
    $('achCount').textContent = count + ' / ' + BADGES.length + ' unlocked';
  }

  // ---------- mood UI ----------
  function applyMood(m) {
    var hero = $('hero');
    hero.className = 'card hero mood-' + m.key + (m.key === 'delighted' && m.level === 2 ? ' lvl2' : '');
    var f = $('flame');
    f.classList.toggle('dim', m.key === 'waiting' || m.key === 'risk');
    var scale = Math.min(1 + m.streak * 0.06, 2.1);
    if (m.key === 'delighted') scale = Math.min(scale + 0.2 * m.level, 2.4);
    f.style.transform = 'scale(' + scale + ')';
    f.textContent = m.streak >= 30 ? '🔥🔥' : '🔥';

    var status = $('statusLine');
    if (m.key === 'risk') {
      status.textContent = '⏰ streak ' + m.streak + ' din ka hai. ' + m.hoursLeft + (m.hoursLeft === 1 ? ' ghanta bacha hai.' : ' ghante bache hain.') + ' ek problem = saved.';
    } else if (m.key === 'waiting') {
      status.textContent = 'aaj ka kaam baaki hai. ek problem, bas. ☕';
    } else if (m.key === 'happy' && m.saved) {
      status.textContent = '🛟 minimum day used — streak safe. ek solve would still be sweet.';
    } else if (m.key === 'happy') {
      status.textContent = '✓ aaj ka din pakka. streak secured!';
    } else if (m.level === 2) {
      status.textContent = '🔥🔥 ' + m.todays + ' today — ahead of pace. unstoppable.';
    } else {
      status.textContent = '🔥 ' + m.todays + ' today. aag lagi hai!';
    }
  }

  // ---------- render ----------
  function render() {
    var t = today();
    var te = entryFor(state, t) || { s: 0, min: false };
    $('todayCount').textContent = te.s;

    var st = streak(state, t), tv = isValid(state, t);
    $('streakNum').textContent = st;
    $('streakUnit').textContent = st === 1 ? 'day' : 'days';

    var m = mood(state, new Date());
    applyMood(m);
    maybeRiskNotify(m);
    updateAppBadge(tv);

    // never-miss-twice — the one serious message in the app
    var y = addDays(t, -1), b = $('banner');
    var trackedYesterday = dkey(y) >= state.firstDay;
    if (trackedYesterday && !isValid(state, y) && !tv) {
      b.className = 'banner red';
      b.textContent = '⚠️ Yesterday was a zero. Two zeros make a pattern. One problem today ends this — open the next problem now.';
      b.classList.remove('hidden');
    } else {
      b.classList.add('hidden');
    }

    // week strip — dynamic target cells
    var tgt = target(state, t), wt = weekTotal(state, t);
    $('weekHead').textContent = 'THIS WEEK · TARGET ' + tgt;
    $('tgtLegend').textContent = '◈ ' + tgt + ' = target';
    var cells = $('cells'); cells.innerHTML = '';
    for (var i = 1; i <= tgt; i++) {
      var c = document.createElement('div');
      c.className = 'cell' + (i <= wt ? ' done' : '') +
        (i === CFG.FLOOR ? ' floor' : '') + (i === tgt ? ' tgt' : '');
      if (i > wt) c.textContent = i;
      cells.appendChild(c);
    }
    var wl;
    if (wt >= tgt) wl = '<b>' + wt + '</b>/' + tgt + ' — target cleared! 🎉' + (wt > tgt ? ' <span class="bonus">+' + (wt - tgt) + ' bonus</span>' : '');
    else if (wt >= CFG.FLOOR) wl = '<b>' + wt + '</b>/' + tgt + ' — floor cleared 🙌 target in ' + (tgt - wt);
    else wl = '<b>' + wt + '</b>/' + tgt + ' — ' + (CFG.FLOOR - wt) + ' to floor';
    $('weekLine').innerHTML = wl;

    // sheet progress + countdown + pace
    var tot = totalSolved(state), rem = Math.max(0, CFG.GOAL - tot), days = daysLeft(t);
    $('fill').style.width = Math.min(100, tot / CFG.GOAL * 100) + '%';
    $('totalNum').textContent = tot;
    $('pctNum').textContent = Math.floor(tot / CFG.GOAL * 100) + '%';
    $('daysLeft').textContent = days + ' days → Nov 21';
    $('paceLine').innerHTML = rem === 0
      ? '379 done. sheet CLOSED. legend behaviour 🏆'
      : '<b>' + rem + '</b> to go · needs <b>' + needsPerWeek(state, t).toFixed(1) + '/wk</b> from here';

    // last 7 days dots
    var dots = $('dots'); dots.innerHTML = '';
    var names = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    for (var k = 6; k >= 0; k--) {
      var d = addDays(t, -k), e = entryFor(state, d);
      var wrap = document.createElement('div'); wrap.className = 'd';
      var dot = document.createElement('div');
      var cls;
      if (e && e.s > 0) cls = 'dot on';
      else if (e && e.min) cls = 'dot min';
      else if (dkey(d) === dkey(t)) cls = 'dot pending';
      else if (dkey(d) < state.firstDay) cls = 'dot';
      else cls = 'dot zero';
      dot.className = cls;
      wrap.appendChild(dot);
      var lab = document.createElement('span');
      lab.textContent = names[(d.getDay() + 6) % 7];
      wrap.appendChild(lab);
      dots.appendChild(wrap);
    }

    // minimum-day button
    var mb = $('minBtn');
    if (tv) { mb.disabled = true; mb.textContent = '🛟 day already valid'; }
    else if (minUsedThisWeek(state, t)) { mb.disabled = true; mb.textContent = '🛟 used this week (max 1)'; }
    else { mb.disabled = false; mb.textContent = '🛟 minimum day'; }

    // undo button
    $('undoBtn').disabled = te.s === 0;
  }

  // ---------- actions ----------
  function touchToday() {
    var k = dkey(today());
    if (!state.entries[k]) state.entries[k] = { s: 0, min: false };
    return state.entries[k];
  }

  $('solveBtn').addEventListener('click', function () {
    var t = today();
    var wtBefore = weekTotal(state, t), totBefore = totalSolved(state), tgt = target(state, t);
    touchToday().s++;
    save();
    var wtAfter = weekTotal(state, t), totAfter = totalSolved(state);

    if (Math.floor(totAfter / 25) > Math.floor(totBefore / 25)) {
      popMega(); toast('🏆 ' + totAfter + ' TOTAL SOLVES! milestone!');
    } else if (wtBefore < tgt && wtAfter >= tgt) {
      popMega(); toast('🎉 WEEKLY TARGET CLEARED! beast.');
    } else if (wtBefore < CFG.FLOOR && wtAfter >= CFG.FLOOR) {
      popBig(); toast('🙌 floor cleared — now go for target');
    } else {
      popSmall(); toast(nextCheer());
    }
    $('solveSub').textContent = nextCheer();
    render();
    checkAchievements(true);
  });

  $('undoBtn').addEventListener('click', function () {
    var e = touchToday();
    if (e.s > 0) {
      e.s--;
      if (e.s === 0 && !e.min) delete state.entries[dkey(today())];
      save(); render();
    }
  });

  $('minBtn').addEventListener('click', function () {
    var t = today();
    if (isValid(state, t) || minUsedThisWeek(state, t)) return;
    touchToday().min = true;
    save(); render();
    toast('🛟 streak saved — max 1 per week');
    checkAchievements(true);
  });

  $('startBtn').addEventListener('click', function () {
    var v = parseInt($('baseInput').value, 10);
    state = {
      base: isNaN(v) ? 0 : Math.min(CFG.SHEET_MAX, Math.max(0, v)),
      entries: {},
      firstDay: dkey(today()),
      ach: {}
    };
    save(); show('main'); render();
    popBig(); toast('scoreboard live. chal, ek aur 🔥');
    checkAchievements(true);
  });

  $('gear').addEventListener('click', function () {
    if (!state) return;
    $('baseEdit').value = state.base;
    show('settingsCard');
  });
  $('trophyBtn').addEventListener('click', function () {
    if (!state) return;
    renderAchievements();
    show('achCard');
  });
  $('closeAch').addEventListener('click', function () { show('main'); render(); });
  $('saveBase').addEventListener('click', function () {
    var v = parseInt($('baseEdit').value, 10);
    if (!isNaN(v)) { state.base = Math.min(CFG.SHEET_MAX, Math.max(0, v)); save(); }
    show('main'); render();
    checkAchievements(true);
  });
  $('closeSettings').addEventListener('click', function () { show('main'); render(); });
  $('resetAll').addEventListener('click', function () {
    if (!confirm('Wipe streak history and start over?')) return;
    state = null;
    try { localStorage.removeItem(CFG.KEY); localStorage.removeItem(CFG.KEY_V1); } catch (e) {}
    $('baseInput').value = 133;
    show('setupCard');
  });

  // re-render when the app returns to foreground (day may have rolled over)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state) render();
  });
  // clock tick so the 21:00 AT-RISK flip happens while the app is open
  setInterval(function () { if (state && !document.hidden) render(); }, 60000);

  // ---------- boot ----------
  loadState();
  if (state) {
    show('main'); render();
    checkAchievements(false);      // retro-unlocks after migration; never asks permission here
    if (location.hash === '#ach') { renderAchievements(); show('achCard'); }
  }
  else show('setupCard');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
})(this);
