/* DSA Streak — logic. Pure core is exported for Node tests; DOM layer runs in browser only. */
(function (root) {
  'use strict';

  var CFG = {
    KEY: 'dsa-streak-v1',
    GOAL: 379,
    SHEET_MAX: 474,
    FLOOR: 10,                       // hard minimum, never editable
    DEADLINE: { y: 2026, m: 10, d: 21 } // Nov 21, 2026 — LOCKED, local time
  };

  // ---------- pure helpers (no DOM, no globals) ----------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function dkey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
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
    var mon = addDays(today, -((today.getDay() + 6) % 7)), arr = [];
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

  var core = {
    CFG: CFG, dkey: dkey, startOfDay: startOfDay, addDays: addDays,
    deadlineDate: deadlineDate, entryFor: entryFor, isValid: isValid,
    streak: streak, weekDays: weekDays, weekTotal: weekTotal,
    minUsedThisWeek: minUsedThisWeek, totalSolved: totalSolved,
    daysLeft: daysLeft, weeksLeft: weeksLeft, target: target, needsPerWeek: needsPerWeek
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
      if (raw) state = JSON.parse(raw);
    } catch (e) { state = null; }
  }
  function save() {
    try { localStorage.setItem(CFG.KEY, JSON.stringify(state)); }
    catch (e) { toast('⚠️ storage failed — data may not persist'); }
  }
  function show(id) {
    ['setupCard', 'settingsCard', 'main'].forEach(function (x) { $(x).classList.add('hidden'); });
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

  function flameFor(streakN, todayValid) {
    var f = $('flame');
    f.classList.toggle('dim', !todayValid && streakN === 0);
    var scale = Math.min(1 + streakN * 0.06, 2.1);
    f.style.transform = 'scale(' + scale + ')';
    f.textContent = streakN >= 30 ? '🔥🔥' : '🔥';
  }

  // ---------- render ----------
  function render() {
    var t = today();
    var te = entryFor(state, t) || { s: 0, min: false };
    $('todayCount').textContent = te.s;

    var st = streak(state, t), tv = isValid(state, t);
    $('streakNum').textContent = st;
    $('streakUnit').textContent = st === 1 ? 'day' : 'days';
    flameFor(st, tv);

    var status = $('statusLine');
    if (tv && te.s > 0) status.textContent = '✓ aaj ka din pakka. streak secured!';
    else if (tv) status.textContent = '🛟 minimum day used — streak safe. ek solve would still be sweet.';
    else if (st > 0) status.textContent = 'not logged yet — one problem keeps the ' + st + '-day run alive.';
    else status.textContent = 'no active streak. one problem starts one. chal!';

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
  });

  $('startBtn').addEventListener('click', function () {
    var v = parseInt($('baseInput').value, 10);
    state = {
      base: isNaN(v) ? 0 : Math.min(CFG.SHEET_MAX, Math.max(0, v)),
      entries: {},
      firstDay: dkey(today())
    };
    save(); show('main'); render();
    popBig(); toast('scoreboard live. chal, ek aur 🔥');
  });

  $('gear').addEventListener('click', function () {
    if (!state) return;
    $('baseEdit').value = state.base;
    show('settingsCard');
  });
  $('saveBase').addEventListener('click', function () {
    var v = parseInt($('baseEdit').value, 10);
    if (!isNaN(v)) { state.base = Math.min(CFG.SHEET_MAX, Math.max(0, v)); save(); }
    show('main'); render();
  });
  $('closeSettings').addEventListener('click', function () { show('main'); render(); });
  $('resetAll').addEventListener('click', function () {
    if (!confirm('Wipe streak history and start over?')) return;
    state = null;
    try { localStorage.removeItem(CFG.KEY); } catch (e) {}
    $('baseInput').value = 133;
    show('setupCard');
  });

  // re-render when the app returns to foreground (day may have rolled over)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state) render();
  });

  // ---------- boot ----------
  loadState();
  if (state) { show('main'); render(); }
  else show('setupCard');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
})(this);
