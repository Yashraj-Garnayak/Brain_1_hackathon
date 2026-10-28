/* TILE RUSH — core loop, adaptive director, scoring, Elo, UI. */
(function () {
  'use strict';

  var TS = window.TILE_SHAPES;
  var SHAPES = TS.SHAPES, SHAPE_LIST = TS.SHAPE_LIST, PALETTE = TS.PALETTE, shapeSvg = TS.shapeSvg;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (n) { return Math.floor(Math.random() * n); };
  var pick = function (a) { return a[rand(a.length)]; };
  var now = function () { return performance.now(); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  var CONFIG = {
    startTime: 30,
    maxTime: 45,
    cycleLength: 10,
    cyclePar: 8.6,
    bonusBase: 1.1,
    bonusGain: 1.2,
    maxBonus: 9,
    churnSlow: 3000,
    churnFast: 1100,
    wrongPenalty: 1.0,
    wrongScore: 30,
    basePoints: 100
  };

  var SAVE_KEY = 'tile-rush.save.v1';
  function zeroStats() { return { c: 0, w: 0, m: 0, rt: 0, rtc: 0 }; }
  function defaultSave() {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      elo: 1000, games: 0, best: 0, bestTier: 0, bestStreak: 0,
      runs: [], symbols: {},
      settings: { muted: false, motion: !reduced }
    };
  }
  function loadSave() {
    var base = defaultSave();
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return base;
      var d = JSON.parse(raw) || {};
      base.elo = Number(d.elo) || 1000;
      base.games = Number(d.games) || 0;
      base.best = Number(d.best) || 0;
      base.bestTier = Number(d.bestTier) || 0;
      base.bestStreak = Number(d.bestStreak) || 0;
      base.runs = Array.isArray(d.runs) ? d.runs.slice(0, 12) : [];
      base.symbols = d.symbols && typeof d.symbols === 'object' ? d.symbols : {};
      if (d.settings) {
        base.settings.muted = !!d.settings.muted;
        if (typeof d.settings.motion === 'boolean') base.settings.motion = d.settings.motion;
      }
    } catch (e) { /* private mode etc. */ }
    return base;
  }
  var SAVE = loadSave();
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* ignore */ }
  }

  var RANKS = [
    { min: 1900, name: 'NOVA', color: '#fb7185' },
    { min: 1700, name: 'DIAMOND', color: '#c084fc' },
    { min: 1500, name: 'PLATINUM', color: '#67e8f9' },
    { min: 1300, name: 'GOLD', color: '#fbbf24' },
    { min: 1100, name: 'SILVER', color: '#cbd5e1' },
    { min: 900, name: 'BRONZE', color: '#f59e0b' },
    { min: 0, name: 'IRON', color: '#94a3b8' }
  ];
  function rankOf(elo) {
    for (var i = 0; i < RANKS.length; i++) if (elo >= RANKS[i].min) return RANKS[i];
    return RANKS[RANKS.length - 1];
  }

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    grid: $('grid'), fx: $('fx'), toast: $('toast'), goFlash: $('goFlash'),
    timebar: document.querySelector('.timebar'), timebarFill: $('timebarFill'),
    clock: $('clock'), timeValue: $('timeValue'),
    score: $('score'), eloValue: $('eloValue'), eloRank: $('eloRank'), rankDot: $('rankDot'),
    muteBtn: $('muteBtn'), muteIcon: $('muteIcon'),
    goalCard: $('goalCard'), goalIcon: $('goalIcon'), goalTrack: $('goalTrack'), goalTrackFill: $('goalTrackFill'),
    churnValue: $('churnValue'), churnWrap: $('churnValue').parentElement,
    cycleNum: $('cycleNum'), tier: $('tier'), pips: $('pips'),
    streak: $('streak'), streakWrap: $('streakWrap'),
    pressureFill: $('pressureFill'), pressureLabel: $('pressureLabel'), pressurePct: $('pressurePct'),
    statAcc: $('statAcc'), statRt: $('statRt'), statStreak: $('statStreak'),
    weakRow: $('weakRow'), runs: $('runs'), gamesCount: $('gamesCount'), bestScore: $('bestScore'),
    musicToggle: $('musicToggle'), motionToggle: $('motionToggle'),
    introScreen: $('introScreen'), introBest: $('introBest'), introElo: $('introElo'), introGames: $('introGames'),
    startBtn: $('startBtn'), resetBtn: $('resetBtn'),
    overScreen: $('overScreen'), finalScore: $('finalScore'), finalAcc: $('finalAcc'), finalRt: $('finalRt'),
    finalCycles: $('finalCycles'), finalStreak: $('finalStreak'),
    eloBefore: $('eloBefore'), eloAfter: $('eloAfter'), eloDelta: $('eloDelta'), rankPill: $('rankPill'),
    overNote: $('overNote'), newBest: $('newBest'), againBtn: $('againBtn'), homeBtn: $('homeBtn')
  };

  var audio = new window.AudioEngine();
  var backdrop = new window.Backdrop($('backdrop'));
  audio.onBeat = function (s) { backdrop.pulse(s); };

  var tiles = [];
  var G = {
    state: 'intro',
    runId: 0,
    timeLeft: CONFIG.startTime,
    score: 0, tier: 0, cycleCount: 0, cycleProgress: 0,
    cycleStart: null, pressure: 0.08,
    correct: 0, wrong: 0, misses: 0, rtSum: 0, rtCount: 0,
    streak: 0, bestStreak: 0,
    goal: null, goalIndex: -1, layout: null,
    roundStart: 0, lockUntil: Infinity, resolving: false,
    churnStart: 0, churnDuration: CONFIG.churnSlow, churnDeadline: 0,
    lastShape: null, lastTickSecond: 99,
    runSymbols: {}, lastFrame: 0, lastAudio: 0, pressureLabel: '',
    eloBefore: SAVE.elo, eloDelta: 0
  };

  /* ---------- persistence helpers ---------- */
  function runStats(id) { return G.runSymbols[id] || (G.runSymbols[id] = zeroStats()); }
  function mergedStats(id) {
    var p = SAVE.symbols[id] || zeroStats();
    var r = G.runSymbols[id] || zeroStats();
    return { c: p.c + r.c, w: p.w + r.w, m: p.m + r.m, rt: p.rt + r.rt, rtc: p.rtc + r.rtc };
  }
  function skillFor(id) {
    var s = mergedStats(id);
    var acc = (s.c + 1) / (s.c + s.w + s.m + 2);
    var rt = s.rtc ? s.rt / s.rtc : 1200;
    var spd = clamp((1800 - rt) / 1500, 0, 1);
    return clamp(acc * 0.62 + spd * 0.38, 0, 1);
  }
  function pickGoalShape() {
    var weights = [], total = 0;
    for (var i = 0; i < SHAPE_LIST.length; i++) {
      var s = mergedStats(SHAPE_LIST[i].id);
      var seen = s.c + s.w + s.m;
      var w = 0.35 + Math.pow(1 - skillFor(SHAPE_LIST[i].id), 2) * 2.8;
      if (seen < 2) w += 0.9;
      if (SHAPE_LIST[i].id === G.lastShape) w *= 0.1;
      weights.push(w);
      total += w;
    }
    var r = Math.random() * total;
    for (var j = 0; j < SHAPE_LIST.length; j++) {
      r -= weights[j];
      if (r <= 0) return SHAPE_LIST[j];
    }
    return SHAPE_LIST[SHAPE_LIST.length - 1];
  }

  /* ---------- game state ---------- */
  function churnMs() {
    return Math.max(950, lerp(CONFIG.churnSlow, CONFIG.churnFast, G.pressure));
  }

  function deal() {
    if (G.state !== 'playing' && G.state !== 'warmup') return;
    var t = now();
    var goalShape = pickGoalShape();
    var goalColor = pick(PALETTE);
    var goal = { shape: goalShape, color: goalColor, key: goalShape.id + '|' + goalColor.id };
    var near = clamp(0.05 + G.pressure * 0.62 + G.tier * 0.02, 0, 0.8);
    var used = {}, cells = new Array(9), goalIndex = rand(9);
    used[goal.key] = true;
    cells[goalIndex] = goal;

    var family = [];
    for (var f = 0; f < SHAPE_LIST.length; f++) {
      if (SHAPE_LIST[f].family === goalShape.family && SHAPE_LIST[f].id !== goalShape.id) family.push(SHAPE_LIST[f]);
    }
    var allCombos = [];
    for (var a = 0; a < SHAPE_LIST.length; a++) {
      for (var b = 0; b < PALETTE.length; b++) {
        allCombos.push({ shape: SHAPE_LIST[a], color: PALETTE[b], key: SHAPE_LIST[a].id + '|' + PALETTE[b].id });
      }
    }
    function decoyColor() {
      if (Math.random() < 0.5) {
        var pool = PALETTE.filter(function (c) { return c.group === goalColor.group; });
        return pick(pool);
      }
      return pick(PALETTE);
    }

    for (var i = 0; i < 9; i++) {
      if (i === goalIndex) continue;
      var cell = null;
      for (var attempt = 0; attempt < 26 && !cell; attempt++) {
        var shape, color;
        if (Math.random() < near) {
          if (family.length && Math.random() < 0.58) {
            shape = pick(family);
            color = Math.random() < 0.4 ? goalColor : decoyColor();
          } else {
            shape = Math.random() < 0.22 ? goalShape : pick(SHAPE_LIST);
            color = decoyColor();
          }
        } else {
          shape = pick(SHAPE_LIST);
          color = pick(PALETTE);
        }
        var key = shape.id + '|' + color.id;
        if (!used[key]) { used[key] = true; cell = { shape: shape, color: color, key: key }; }
      }
      if (!cell) {
        for (var c2 = 0; c2 < allCombos.length; c2++) {
          if (!used[allCombos[c2].key]) { cell = allCombos[c2]; used[cell.key] = true; break; }
        }
      }
      cells[i] = cell || { shape: goalShape, color: goalColor, key: goal.key + '|x' };
    }

    for (var n = 0; n < 9; n++) {
      var tile = tiles[n], cell2 = cells[n];
      tile.dataset.key = cell2.key;
      tile.dataset.index = n;
      tile.className = 'tile';
      tile.style.setProperty('--tint', cell2.color.hex);
      tile.innerHTML = shapeSvg(cell2.shape, cell2.color);
      tile.setAttribute('aria-label', 'Tile ' + (n + 1) + ': ' + cell2.color.id + ' ' + cell2.shape.id);
      void tile.offsetWidth;
      tile.classList.add('deal');
      var glyph = tile.firstElementChild;
      if (glyph) glyph.style.animationDelay = (n % 3 + Math.floor(n / 3)) * 16 + 'ms';
    }
    var runId = G.runId;
    setTimeout(function () {
      if (G.runId !== runId) return;
      for (var k = 0; k < tiles.length; k++) tiles[k].classList.remove('deal');
    }, 480);

    G.goal = goal;
    G.goalIndex = goalIndex;
    G.layout = cells;
    G.resolving = false;
    G.roundStart = t;
    G.churnStart = t;
    G.churnDuration = churnMs();
    G.churnDeadline = t + G.churnDuration;
    G.lastShape = goalShape.id;
    if (G.cycleStart === null) G.cycleStart = t;

    el.goalIcon.innerHTML = shapeSvg(goalShape, goalColor);
    el.goalIcon.dataset.goal = goal.key;
    el.goalIcon.setAttribute('aria-label', 'Target: ' + goalColor.id + ' ' + goalShape.id);
    el.goalIcon.style.setProperty('--tint', goalColor.hex);
    el.goalCard.style.setProperty('--tint', goalColor.hex);
    el.goalTrack.classList.remove('urgent');
    el.churnWrap.classList.remove('urgent');
    audio.deal();
    refreshRunHud();
  }

  function hitTile(index, cell, t, x, y) {
    var rt = clamp(t - G.roundStart, 50, 4000);
    G.correct++;
    G.rtSum += rt;
    G.rtCount++;
    G.streak++;
    if (G.streak > G.bestStreak) G.bestStreak = G.streak;
    var speed = clamp((1600 - rt) / 1300, 0, 1);
    var pts = Math.round(CONFIG.basePoints * (1 + speed * 0.9) * (1 + Math.min(G.streak, 20) * 0.08) * (1 + G.tier * 0.12));
    G.score += pts;
    G.pressure = clamp(G.pressure + 0.014 + speed * 0.05 + G.tier * 0.002, 0, 1);
    var s = runStats(cell.shape.id);
    s.c++; s.rt += rt; s.rtc++;

    var tile = tiles[index];
    tile.classList.add('correct');
    setTimeout(function () { tile.classList.remove('correct'); }, 340);
    floatText('+' + pts, x, y, 'good');
    audio.correct(G.streak);
    backdrop.pulse(0.4);
    G.cycleProgress++;
    G.resolving = true;
    refreshRunHud();

    if (G.cycleProgress >= CONFIG.cycleLength) { completeCycle(t); return; }
    G.lockUntil = t + 130;
    var runId = G.runId;
    setTimeout(function () {
      if (G.state === 'playing' && G.runId === runId) deal();
    }, 130);
  }

  function missTap(index, cell, t, x, y) {
    G.wrong++;
    G.streak = 0;
    G.score = Math.max(0, G.score - CONFIG.wrongScore);
    G.timeLeft = Math.max(0, G.timeLeft - CONFIG.wrongPenalty);
    G.pressure = clamp(G.pressure - 0.07, 0, 1);
    runStats(G.goal.shape.id).w++;
    var tile = tiles[index];
    tile.classList.add('wrong');
    setTimeout(function () { tile.classList.remove('wrong'); }, 400);
    floatText('\u2212' + CONFIG.wrongPenalty.toFixed(1) + 's', x, y, 'bad');
    audio.wrong();
    refreshRunHud();
    if (G.timeLeft <= 0) endRun();
  }

  function onChurnExpire(t) {
    G.misses++;
    G.resolving = true;
    G.streak = 0;
    G.pressure = clamp(G.pressure - 0.045, 0, 1);
    runStats(G.goal.shape.id).m++;
    refreshRunHud();
    var correctTile = tiles[G.goalIndex];
    if (correctTile) {
      correctTile.classList.add('reveal');
      setTimeout(function () { correctTile.classList.remove('reveal'); }, 360);
    }
    G.lockUntil = t + 280;
    var runId = G.runId;
    setTimeout(function () {
      if (G.state === 'playing' && G.runId === runId) deal();
    }, 260);
  }

  function completeCycle(t) {
    var elapsed = (t - (G.cycleStart || t)) / 1000;
    var bonus = clamp((CONFIG.cyclePar - elapsed) * CONFIG.bonusGain + CONFIG.bonusBase, 0.4, CONFIG.maxBonus);
    bonus = Math.round(bonus * 10) / 10;
    G.timeLeft = Math.min(CONFIG.maxTime, G.timeLeft + bonus);
    var bonusPts = 400 + Math.round(bonus * 60) + G.tier * 100;
    G.score += bonusPts;
    G.tier++;
    G.cycleCount++;
    G.cycleProgress = 0;
    G.cycleStart = null;
    G.resolving = true;
    G.pressure = clamp(G.pressure + 0.09, 0, 1);
    G.lockUntil = t + 580;
    audio.cycle();
    backdrop.pulse(1.2);
    showToast('CYCLE CLEAR', '+' + bonus.toFixed(1) + 's \u00b7 +' + fmt(bonusPts));
    clockGain();
    refreshRunHud();
    for (var i = 0; i < tiles.length; i++) {
      (function (tile, idx) {
        setTimeout(function () { tile.classList.add('correct'); }, idx * 18);
        setTimeout(function () { tile.classList.remove('correct'); }, 280 + idx * 18);
      })(tiles[i], i);
    }
    var runId = G.runId;
    setTimeout(function () {
      if (G.state === 'playing' && G.runId === runId) deal();
    }, 580);
  }

  function endRun() {
    if (G.state !== 'playing') return;
    G.state = 'over';
    G.lockUntil = Infinity;
    G.timeLeft = Math.max(0, G.timeLeft);
    audio.stopMusic();
    audio.gameover();

    var attempts = Math.max(1, G.correct + G.wrong + G.misses);
    var acc = G.correct / attempts;
    var rt = G.rtCount ? G.rtSum / G.rtCount : 2000;
    var speedN = clamp((1800 - rt) / 1500, 0, 1);
    var tierN = clamp(G.tier / 8, 0, 1);
    var actual = clamp(acc * 0.55 + speedN * 0.3 + tierN * 0.15, 0, 1);
    var opponent = 820 + G.tier * 130;
    var expected = 1 / (1 + Math.pow(10, (opponent - SAVE.elo) / 400));
    var K = SAVE.games < 10 ? 44 : 28;
    var before = SAVE.elo;
    var after = Math.max(100, Math.round(before + clamp(Math.round(K * (actual - expected)), -60, 60)));
    var delta = after - before;

    Object.keys(G.runSymbols).forEach(function (id) {
      var r = G.runSymbols[id];
      var p = SAVE.symbols[id] || (SAVE.symbols[id] = zeroStats());
      p.c += r.c; p.w += r.w; p.m += r.m; p.rt += r.rt; p.rtc += r.rtc;
    });
    var isBest = G.score > SAVE.best;
    if (isBest) SAVE.best = G.score;
    if (G.bestStreak > SAVE.bestStreak) SAVE.bestStreak = G.bestStreak;
    if (G.tier > SAVE.bestTier) SAVE.bestTier = G.tier;
    SAVE.elo = after;
    SAVE.games++;
    SAVE.runs.unshift({ score: G.score, tier: G.tier, acc: Math.round(acc * 100), rt: Math.round(rt) });
    SAVE.runs = SAVE.runs.slice(0, 12);
    persist();

    var rank = rankOf(after);
    el.finalScore.textContent = fmt(G.score);
    el.finalAcc.textContent = Math.round(acc * 100) + '%';
    el.finalRt.textContent = Math.round(rt) + 'ms';
    el.finalCycles.textContent = String(G.cycleCount);
    el.finalStreak.textContent = String(G.bestStreak);
    el.eloBefore.textContent = String(before);
    el.eloAfter.textContent = String(after);
    el.eloDelta.textContent = (delta >= 0 ? '+' : '') + delta;
    el.eloDelta.className = 'delta ' + (delta >= 0 ? 'up' : 'down');
    el.rankPill.textContent = rank.name;
    el.rankPill.style.color = rank.color;
    el.newBest.classList.toggle('show', isBest && G.score > 0);

    var note;
    if (acc < 0.62) note = 'Accuracy is leaking seconds. Scan first, commit once.';
    else if (rt > 1250) note = 'You are reading the board late. Lock onto the target before sweeping.';
    else if (G.tier < 2) note = 'Clean but short. Push cycle time down to grow the bonus bank.';
    else if (delta >= 8) note = 'The director is feeding your weak shapes. Keep the streak alive.';
    else note = 'Solid run. The next tier comes with tighter decoys and a faster clock.';
    el.overNote.textContent = note;

    el.timeValue.textContent = '0.0';
    el.timebarFill.style.transform = 'scaleX(0)';
    refreshRunHud();
    refreshMeta();
    showScreen(el.overScreen);
    backdrop.pulse(1.4);
  }

  /* ---------- run lifecycle ---------- */
  function startRun() {
    audio.init();
    audio.setMuted(SAVE.settings.muted);
    audio.startMusic();
    audio.start();

    G.runId++;
    G.state = 'warmup';
    G.timeLeft = CONFIG.startTime;
    G.score = 0; G.tier = 0; G.cycleCount = 0; G.cycleProgress = 0;
    G.cycleStart = null; G.pressure = 0.08;
    G.correct = 0; G.wrong = 0; G.misses = 0; G.rtSum = 0; G.rtCount = 0;
    G.streak = 0; G.bestStreak = 0;
    G.goal = null; G.goalIndex = -1; G.layout = null;
    G.lastShape = null; G.lastTickSecond = 99;
    G.runSymbols = {};
    G.lockUntil = Infinity;
    G.resolving = false;
    G.lastFrame = now();
    G.pressureLabel = '';
    G.eloBefore = SAVE.elo;

    showScreen(null);
    el.clock.classList.remove('warn', 'danger', 'gain');
    el.timebar.classList.remove('warn', 'danger');
    deal();
    refreshRunHud();
    frameHud(now());
    flashGo('READY');

    var id = G.runId;
    function beginPlay() {
      if (G.runId !== id || G.state !== 'warmup') return;
      G.state = 'playing';
      var t = now();
      G.lastFrame = t;
      G.lastTickSecond = 99;
      G.lockUntil = 0;
      G.cycleStart = t;
      deal();
      G.cycleStart = t;
      flashGo('GO');
      audio.start();
    }
    if (params.has('instant')) beginPlay();
    else setTimeout(beginPlay, 820);
  }

  function toMenu() {
    G.state = 'intro';
    G.runId++;
    audio.stopMusic();
    showScreen(el.introScreen);
    showIdle();
    refreshMeta();
  }

  /* ---------- input ---------- */
  function onTile(index, x, y) {
    if (G.state !== 'playing') return;
    var t = now();
    if (t < G.lockUntil) return;
    var cell = G.layout && G.layout[index];
    if (!cell) return;
    if (cell.key === G.goal.key) hitTile(index, cell, t, x, y);
    else missTap(index, cell, t, x, y);
  }

  el.grid.addEventListener('pointerdown', function (e) {
    var tile = e.target.closest ? e.target.closest('.tile') : null;
    if (!tile) return;
    e.preventDefault();
    var r = tile.getBoundingClientRect();
    onTile(Number(tile.dataset.index), r.left + r.width / 2, r.top + r.height / 2);
  });
  el.grid.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      if (G.state === 'intro' || G.state === 'over') { e.preventDefault(); startRun(); }
      return;
    }
    if (e.key === ' ') {
      if (G.state === 'intro' || G.state === 'over') { e.preventDefault(); startRun(); }
      return;
    }
    if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && G.state === 'playing') {
      e.preventDefault();
      var tile = tiles[n - 1];
      var r = tile.getBoundingClientRect();
      onTile(n - 1, r.left + r.width / 2, r.top + r.height / 2);
    }
  });

  /* ---------- audio / settings ---------- */
  function toggleMute() {
    SAVE.settings.muted = !SAVE.settings.muted;
    audio.init();
    audio.setMuted(SAVE.settings.muted);
    persist();
    updateSettingsUI();
  }
  function toggleMotion() {
    SAVE.settings.motion = !SAVE.settings.motion;
    document.body.classList.toggle('no-motion', !SAVE.settings.motion);
    persist();
    updateSettingsUI();
  }
  function updateSettingsUI() {
    el.muteIcon.textContent = SAVE.settings.muted ? '\u2715' : '\u266a';
    el.muteBtn.setAttribute('aria-pressed', SAVE.settings.muted ? 'true' : 'false');
    el.musicToggle.textContent = SAVE.settings.muted ? 'OFF' : 'ON';
    el.musicToggle.classList.toggle('off', SAVE.settings.muted);
    el.motionToggle.textContent = SAVE.settings.motion ? 'FULL' : 'LOW';
    el.motionToggle.classList.toggle('off', !SAVE.settings.motion);
    document.body.classList.toggle('no-motion', !SAVE.settings.motion);
  }

  /* ---------- HUD ---------- */
  function accuracyPct() {
    var attempts = G.correct + G.wrong + G.misses;
    return attempts ? Math.round((G.correct / attempts) * 100) : 100;
  }
  function avgRt() { return G.rtCount ? Math.round(G.rtSum / G.rtCount) : 0; }

  function refreshRunHud() {
    el.score.textContent = fmt(G.score);
    el.tier.textContent = String(G.tier);
    el.cycleNum.textContent = G.cycleProgress + '/10';
    var pips = '';
    for (var i = 0; i < 10; i++) pips += '<i class="' + (i < G.cycleProgress ? 'on' : '') + '"></i>';
    el.pips.innerHTML = pips;
    el.streak.textContent = String(G.streak);
    el.streakWrap.classList.toggle('hot', G.streak >= 5);
    el.statAcc.textContent = accuracyPct() + '%';
    el.statRt.textContent = avgRt() ? avgRt() + 'ms' : '\u2014';
    el.statStreak.textContent = String(G.bestStreak);
    renderWeak();
  }

  function frameHud(t) {
    if (G.state === 'playing' || G.state === 'over') {
      el.timeValue.textContent = G.timeLeft.toFixed(1);
      el.timebarFill.style.transform = 'scaleX(' + clamp(G.timeLeft / CONFIG.startTime, 0, 1) + ')';
      var sec = Math.ceil(G.timeLeft);
      el.clock.classList.toggle('warn', sec <= 10 && sec > 5);
      el.clock.classList.toggle('danger', sec <= 5 && G.state === 'playing');
      el.timebar.classList.toggle('warn', sec <= 10 && sec > 5);
      el.timebar.classList.toggle('danger', sec <= 5 && G.state === 'playing');
    }
    if (G.state === 'playing') {
      var remainMs = clamp(G.churnDeadline - t, 0, G.churnDuration);
      el.goalTrackFill.style.transform = 'scaleX(' + clamp(remainMs / G.churnDuration, 0, 1) + ')';
      el.churnValue.textContent = (remainMs / 1000).toFixed(1);
      var urgent = remainMs < 650;
      el.churnWrap.classList.toggle('urgent', urgent);
      el.goalTrack.classList.toggle('urgent', urgent);
    }
    var pct = Math.round(G.pressure * 100);
    el.pressureFill.style.width = (6 + G.pressure * 94) + '%';
    el.pressurePct.textContent = pct + '%';
    var label = G.pressure < 0.25 ? 'CALM' : G.pressure < 0.5 ? 'WARM' : G.pressure < 0.75 ? 'HOT' : 'CRITICAL';
    if (label !== G.pressureLabel) { G.pressureLabel = label; el.pressureLabel.textContent = label; }

    var urgency = 1 - clamp(G.timeLeft / CONFIG.startTime, 0, 1);
    backdrop.setUrgency(urgency);
    backdrop.setIntensity(clamp(G.pressure * 0.75 + urgency * 0.45, 0, 1));
    if (t - G.lastAudio > 120) {
      G.lastAudio = t;
      audio.setUrgency(urgency);
      audio.setIntensity(clamp(G.pressure * 0.7 + urgency * 0.45 + Math.min(G.tier, 6) * 0.03, 0, 1));
    }
  }

  function renderWeak() {
    var list = [];
    for (var i = 0; i < SHAPE_LIST.length; i++) {
      var st = mergedStats(SHAPE_LIST[i].id);
      var seen = st.c + st.w + st.m;
      if (seen > 0) list.push({ shape: SHAPE_LIST[i], skill: skillFor(SHAPE_LIST[i].id) });
    }
    list.sort(function (a, b) { return a.skill - b.skill; });
    list = list.slice(0, 3);
    if (!list.length) {
      el.weakRow.innerHTML = '<span class="weak-empty">No reads yet. The game starts neutral.</span>';
      return;
    }
    var html = '';
    for (var j = 0; j < list.length; j++) {
      var item = list[j];
      var color = item.skill < 0.45 ? '#fb7185' : item.skill < 0.65 ? '#fbbf24' : '#8b93a7';
      html += '<div class="weak" title="' + item.shape.id + ' \u00b7 ' + Math.round(item.skill * 100) + '% mastery">' +
        shapeSvg(item.shape, { hex: color }) +
        '<b>' + Math.round(item.skill * 100) + '%</b></div>';
    }
    el.weakRow.innerHTML = html;
  }

  function renderRuns() {
    var max = 0;
    for (var i = 0; i < SAVE.runs.length; i++) max = Math.max(max, SAVE.runs[i].score || 0);
    var recent = SAVE.runs.slice(0, 8).reverse();
    var html = '';
    for (var k = 0; k < 8 - recent.length; k++) html += '<i class="dim" style="height:4px"></i>';
    for (var j = 0; j < recent.length; j++) {
      var h = max > 0 ? Math.max(5, Math.round((recent[j].score / max) * 34)) : 5;
      html += '<i style="height:' + h + 'px" title="' + fmt(recent[j].score) + ' pts \u00b7 tier ' + (recent[j].tier || 0) + '"></i>';
    }
    el.runs.innerHTML = html;
  }

  function refreshMeta() {
    var rank = rankOf(SAVE.elo);
    el.eloValue.textContent = String(Math.round(SAVE.elo));
    el.eloRank.textContent = rank.name;
    el.rankDot.style.background = rank.color;
    el.rankDot.style.color = rank.color;
    el.introBest.textContent = fmt(SAVE.best);
    el.introElo.textContent = String(Math.round(SAVE.elo));
    el.introGames.textContent = String(SAVE.games);
    el.gamesCount.textContent = SAVE.games + (SAVE.games === 1 ? ' run' : ' runs');
    el.bestScore.textContent = 'PB ' + fmt(SAVE.best);
    renderRuns();
    updateSettingsUI();
  }

  function showIdle() {
    G.timeLeft = CONFIG.startTime;
    G.score = 0; G.tier = 0; G.cycleProgress = 0; G.pressure = 0.08;
    G.streak = 0; G.bestStreak = 0;
    G.layout = null; G.goal = null; G.cycleStart = null;
    el.score.textContent = '0';
    el.timeValue.textContent = CONFIG.startTime.toFixed(1);
    el.timebarFill.style.transform = 'scaleX(1)';
    el.cycleNum.textContent = '0/10';
    el.tier.textContent = '0';
    el.pips.innerHTML = '';
    el.streak.textContent = '0';
    el.streakWrap.classList.remove('hot');
    el.statAcc.textContent = '100%';
    el.statRt.textContent = '\u2014';
    el.statStreak.textContent = '0';
    el.churnValue.textContent = '\u2014';
    el.goalTrackFill.style.transform = 'scaleX(1)';
    el.goalTrack.classList.remove('urgent');
    el.churnWrap.classList.remove('urgent');
    el.goalIcon.innerHTML = '';
    el.clock.classList.remove('warn', 'danger', 'gain');
    el.timebar.classList.remove('warn', 'danger');
    for (var i = 0; i < tiles.length; i++) {
      tiles[i].className = 'tile empty';
      tiles[i].innerHTML = '';
      tiles[i].removeAttribute('style');
      tiles[i].removeAttribute('data-key');
      tiles[i].setAttribute('aria-label', 'Tile ' + (i + 1) + ', empty');
    }
    renderWeak();
  }

  /* ---------- effects ---------- */
  function floatText(text, x, y, cls) {
    var span = document.createElement('span');
    span.className = 'fx-item ' + cls;
    span.textContent = text;
    span.style.left = x + 'px';
    span.style.top = y + 'px';
    el.fx.appendChild(span);
    setTimeout(function () { if (span.parentNode) span.parentNode.removeChild(span); }, 1000);
  }
  function showToast(title, sub) {
    el.toast.innerHTML = '<b>' + title + '</b><span>' + sub + '</span>';
    el.toast.classList.remove('show');
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
  }
  function flashGo(text) {
    el.goFlash.textContent = text;
    el.goFlash.classList.remove('show');
    void el.goFlash.offsetWidth;
    el.goFlash.classList.add('show');
  }
  function clockGain() {
    el.clock.classList.add('gain');
    setTimeout(function () { el.clock.classList.remove('gain'); }, 520);
  }
  function showScreen(node) {
    el.introScreen.classList.toggle('show', node === el.introScreen);
    el.overScreen.classList.toggle('show', node === el.overScreen);
  }

  /* ---------- main loop ---------- */
  function loop(t) {
    requestAnimationFrame(loop);
    if (G.state === 'playing') {
      if (!G.lastFrame) G.lastFrame = t;
      var dt = clamp((t - G.lastFrame) / 1000, 0, 0.1);
      G.lastFrame = t;
      G.timeLeft -= dt;
      if (G.timeLeft <= 0) {
        G.timeLeft = 0;
        endRun();
      } else {
        if (!G.resolving && t >= G.churnDeadline && t >= G.lockUntil) onChurnExpire(t);
        var sec = Math.ceil(G.timeLeft);
        if (sec <= 5 && sec >= 1 && sec !== G.lastTickSecond) {
          G.lastTickSecond = sec;
          audio.tick(sec);
        }
      }
    } else {
      G.lastFrame = t;
    }
    frameHud(t);
  }

  /* ---------- boot ---------- */
  function buildGrid() {
    for (var i = 0; i < 9; i++) {
      var d = document.createElement('div');
      d.className = 'tile empty';
      d.dataset.index = i;
      d.setAttribute('role', 'button');
      d.setAttribute('tabindex', '-1');
      d.setAttribute('aria-label', 'Tile ' + (i + 1) + ', empty');
      el.grid.appendChild(d);
      tiles.push(d);
    }
  }

  buildGrid();
  document.body.classList.toggle('no-motion', !SAVE.settings.motion);
  var params = new URLSearchParams(window.location.search);
  if (params.has('still')) document.body.classList.add('still');
  refreshMeta();
  showIdle();
  frameHud(now());

  el.startBtn.addEventListener('click', startRun);
  el.againBtn.addEventListener('click', startRun);
  el.homeBtn.addEventListener('click', toMenu);
  el.muteBtn.addEventListener('click', toggleMute);
  el.musicToggle.addEventListener('click', toggleMute);
  el.motionToggle.addEventListener('click', toggleMotion);
  el.resetBtn.addEventListener('click', function () {
    if (!window.confirm('Reset your rating, best score and adaptive history?')) return;
    SAVE = defaultSave();
    persist();
    refreshMeta();
    showIdle();
  });

  requestAnimationFrame(loop);

  if (params.has('autostart')) {
    startRun();
  }
})();
