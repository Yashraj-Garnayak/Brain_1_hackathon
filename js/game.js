/* TILE RUSH — core loop, adaptive director, scoring, Elo, UI. */
(function () {
  'use strict';

  var TS = window.TILE_SHAPES;
  var SHAPES = TS.SHAPES, SHAPE_LIST = TS.SHAPE_LIST, PALETTE = TS.PALETTE, shapeSvg = TS.shapeSvg;
  var BPI = window.BPI;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (n) { return Math.floor(Math.random() * n); };
  var pick = function (a) { return a[rand(a.length)]; };
  var now = function () { return performance.now(); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  var CONFIG = {
    countdownMs: 3000,
    rounds: [
      { size: 3, duration: 25, churn: 2500, cycle: 10 },
      { size: 4, duration: 15, churn: 2000, cycle: 8 },
      { size: 5, duration: 10, churn: 1500, cycle: 6 }
    ],
    breakMs: 5000,
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
      bestBpi: 0, title: 'DRIFTER',
      runs: [], symbols: {},
      settings: { muted: false, motion: !reduced, theme: 'kids' }
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
      base.bestBpi = Number(d.bestBpi) || 0;
      base.title = d.title || 'DRIFTER';
      base.runs = Array.isArray(d.runs) ? d.runs.slice(0, 12) : [];
      base.symbols = d.symbols && typeof d.symbols === 'object' ? d.symbols : {};
      if (d.settings) {
        base.settings.muted = !!d.settings.muted;
        if (typeof d.settings.motion === 'boolean') base.settings.motion = d.settings.motion;
        if (d.settings.theme === 'sports') base.settings.theme = 'sports';
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
    countdown: $('countdown'), countdownNum: $('countdownNum'),
    roundBreak: $('roundBreak'), breakTitle: $('breakTitle'), breakSub: $('breakSub'),
    breakNext: $('breakNext'), breakNum: $('breakNum'),
    timebar: document.querySelector('.timebar'), timebarFill: $('timebarFill'),
    clock: $('clock'), timeValue: $('timeValue'),
    score: $('score'), eloValue: $('eloValue'), eloRank: $('eloRank'), rankDot: $('rankDot'),
    muteBtn: $('muteBtn'), muteIcon: $('muteIcon'),
    goalCard: $('goalCard'), goalIcon: $('goalIcon'), goalCopyTitle: $('goalCopyTitle'),
    goalTrack: $('goalTrack'), goalTrackFill: $('goalTrackFill'),
    churnValue: $('churnValue'), churnWrap: $('churnValue').parentElement,
    round: $('round'), cycleNum: $('cycleNum'), tier: $('tier'), pips: $('pips'),
    streak: $('streak'), streakWrap: $('streakWrap'),
    pressureFill: $('pressureFill'), pressureLabel: $('pressureLabel'), pressurePct: $('pressurePct'),
    statAcc: $('statAcc'), statRt: $('statRt'), statStreak: $('statStreak'),
    weakRow: $('weakRow'), weakNote: $('weakNote'), runs: $('runs'), gamesCount: $('gamesCount'), bestScore: $('bestScore'),
    musicToggle: $('musicToggle'), motionToggle: $('motionToggle'), themeChoice: $('themeChoice'),
    introScreen: $('introScreen'), introBest: $('introBest'), introBpi: $('introBpi'),
    introTitle: $('introTitle'), introElo: $('introElo'), introGames: $('introGames'),
    startBtn: $('startBtn'), resetBtn: $('resetBtn'),
    overScreen: $('overScreen'), overKicker: $('overKicker'), finalScore: $('finalScore'),
    finalAcc: $('finalAcc'), finalRt: $('finalRt'), finalBpi: $('finalBpi'),
    finalTitle: $('finalTitle'), finalArchetype: $('finalArchetype'),
    overFeedback: $('overFeedback'), overRadar: $('overRadar'),
    finalCycles: $('finalCycles'), finalStreak: $('finalStreak'),
    eloBefore: $('eloBefore'), eloAfter: $('eloAfter'), eloDelta: $('eloDelta'), rankPill: $('rankPill'),
    overNote: $('overNote'), newBest: $('newBest'), againBtn: $('againBtn'), homeBtn: $('homeBtn'),
    overBoardBtn: $('overBoardBtn'), overInsightsBtn: $('overInsightsBtn'),
    accountBtn: $('accountBtn'), accountAvatar: $('accountAvatar'), accountName: $('accountName'),
    authScreen: $('authScreen'), authClose: $('authClose'), authTitle: $('authTitle'), authLede: $('authLede'),
    authForm: $('authForm'), authUser: $('authUser'), authPass: $('authPass'),
    authConfirm: $('authConfirm'), authConfirmWrap: $('authConfirmWrap'), authError: $('authError'),
    authSubmit: $('authSubmit'), authGuest: $('authGuest'), tabLogin: $('tabLogin'), tabRegister: $('tabRegister'),
    boardScreen: $('boardScreen'), boardClose: $('boardClose'), boardList: $('boardList'),
    boardPlayers: $('boardPlayers'), boardOnline: $('boardOnline'), boardMe: $('boardMe'),
    boardIdentity: $('boardIdentity'), boardTitle: $('boardTitle'),
    boardScopeLabel: $('boardScopeLabel'), boardPeriodLabel: $('boardPeriodLabel'),
    boardScopes: $('boardScopes'), boardPeriods: $('boardPeriods'), boardMetrics: $('boardMetrics'),
    introBoardBtn: $('introBoardBtn'), introProfileBtn: $('introProfileBtn'),
    tutorialBtn: $('tutorialBtn'), tutorialScreen: $('tutorialScreen'), tutorialClose: $('tutorialClose'),
    tutorialTitle: $('tutorialTitle'), tutorialBody: $('tutorialBody'), tutorialStats: $('tutorialStats'),
    tutorialBoard: $('tutorialBoard'), tutorialPoints: $('tutorialPoints'), tutorialCount: $('tutorialCount'),
    tutorialPrev: $('tutorialPrev'), tutorialNext: $('tutorialNext'), tutorialDots: $('tutorialDots'),
    homeRank: $('homeRank'), homeRankValue: $('homeRankValue'), homeRankDelta: $('homeRankDelta'),
    homeRankSpark: $('homeRankSpark'), homeRankNote: $('homeRankNote'),
    overRank: $('overRank'), overRankValue: $('overRankValue'), overRankDelta: $('overRankDelta'),
    overRankSpark: $('overRankSpark'), overRankNote: $('overRankNote'),
    panelBoardBtn: $('panelBoardBtn'), globalTop: $('globalTop'),
    profileScreen: $('profileScreen'), profileClose: $('profileClose'), profileBoardBtn: $('profileBoardBtn'),
    profileLogout: $('profileLogout'),
    profileAvatar: $('profileAvatar'), profileName: $('profileName'), profileMeta: $('profileMeta'),
    profileTitle: $('profileTitle'), profileArchetype: $('profileArchetype'), profileOnline: $('profileOnline'),
    profileBestBpi: $('profileBestBpi'), profileBestScore: $('profileBestScore'),
    profileGames: $('profileGames'), profileRank: $('profileRank'),
    profileGameSelect: $('profileGameSelect'), profileSeasonName: $('profileSeasonName'),
    profileSeasonStats: $('profileSeasonStats'), profileSeasons: $('profileSeasons'),
    profileRadar: $('profileRadar'), profileFeedback: $('profileFeedback'),
    profileImprove: $('profileImprove'), profileImproveList: $('profileImproveList'),
    profileEdit: $('profileEdit'), avatarBtn: $('avatarBtn'), avatarInput: $('avatarInput'),
    avatarHint: $('avatarHint'),
    sectionBar: $('sectionBar'),
    profileTabs: $('profileTabs'), profileTabProfile: $('profileTabProfile'),
    profileTabSettings: $('profileTabSettings'), profileTabDevices: $('profileTabDevices'),
    settingsAccount: $('settingsAccount'),
    settingsRankToggle: $('settingsRankToggle'), settingsTutorialBtn: $('settingsTutorialBtn'),
    settingsDevicesBtn: $('settingsDevicesBtn'), settingsDevicesNote: $('settingsDevicesNote'),
    settingsLogoutBtn: $('settingsLogoutBtn'), profileInsightsBtn: $('profileInsightsBtn'),
    emoteEditor: $('emoteEditor'), emoteSaveBtn: $('emoteSaveBtn'),
    insightsScreen: $('insightsScreen'), insightsClose: $('insightsClose'),
    insightsEmpty: $('insightsEmpty'), insightsFeed: $('insightsFeed'),
    insightsConnectBtn: $('insightsConnectBtn'), insightsProfileBtn: $('insightsProfileBtn'),
    insightsManageBtn: $('insightsManageBtn'), insightsOuraState: $('insightsOuraState'),
    insightsUltraState: $('insightsUltraState'), insightsFootNote: $('insightsFootNote'),
    introInsightsBtn: $('introInsightsBtn')
  };

  var Account = window.Account;
  var authMode = 'login';
  var pendingStart = false;
  var guestMode = false;
  var boardBy = 'bpi';
  var boardScope = 'global';
  var boardPeriod = 'season';
  var boardRequest = 0;
  var profileRequest = 0;
  var profileReturn = null;
  var currentProfile = null;
  var currentProfileGame = 'tile-rush';
  var currentProfileSelf = false;
  var pendingProfileTab = null;

  var audio = new window.AudioEngine();
  var backdrop = new window.Backdrop($('backdrop'));
  audio.onBeat = function (s) { backdrop.pulse(s); };

  var tiles = [];
  var G = {
    state: 'intro',
    runId: 0,
    round: 0,
    roundId: 0,
    size: 3,
    timeLeft: 25,
    roundDuration: 25,
    roundChurn: 2500,
    cycleTarget: 10,
    score: 0, tier: 0, maxTier: 0, cycleCount: 0, cycleProgress: 0,
    cycleStart: null, pressure: 0.08,
    correct: 0, wrong: 0, misses: 0, rtSum: 0, rtCount: 0,
    streak: 0, bestStreak: 0,
    goal: null, goalIndex: -1, layout: null,
    roundStart: 0, roundEndsAt: 0, lockUntil: Infinity, resolving: false,
    churnStart: 0, churnDuration: 2500, churnDeadline: 0,
    lastShape: null, lastGoalColor: null, colorChanged: false, near: 0,
    wrongOnBoard: 0, lastTickSecond: 99, countdownEnd: 0, countdownNum: 0,
    breakEnd: 0, breakNum: 0,
    trials: [], roundStats: [], roundBase: null, finalMetrics: null,
    runSymbols: {}, lastFrame: 0, lastAudio: 0, pressureLabel: '',
    eloBefore: SAVE.elo, eloDelta: 0,
    duel: false, duelSeed: '', duelDeal: 0, duelBoard: -1, duelOpp: null, duelLastSent: 0,
    duelPending: null, duelLocked: false,
    timeline: [], runStartedAt: 0, timelineNext: 0
  };

  /* ---------- deterministic boards for 1v1 ---------- */
  /* Board generation is normally adaptive. In a duel both players must face the
     same ordered sequence, so each board is generated from (seed, round, index)
     instead of local history. */
  function hashSeed(text) {
    var h = 1779033703 ^ text.length;
    for (var i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function seededRandom(text) {
    var a = hashSeed(String(text));
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function duelHook(name, data) {
    var duel = window.Duel;
    if (!duel || typeof duel[name] !== 'function') return;
    try { duel[name](data); } catch (e) { /* never break the run */ }
  }

  /* Advance the shared board after the server resolves a deal. `mine` is true
     when this client won the deal; only then are its pending points applied.
     Echoes for a board we already left are ignored. */
  function duelAdvanceLocal(solvedDeal, mine) {
    if (!G.duel || G.state !== 'playing') return;
    var index = Math.max(0, Math.floor(Number(solvedDeal) || 0));
    if (index < G.duelBoard) return;
    if (G.duelPending && G.duelPending.deal <= index) settleDuelDeal(G.duelPending.deal, !!mine);
    G.duelPending = null;
    G.lockUntil = now() + 120;
    G.wrongOnBoard = 0;
    deal(index + 1);
  }

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
  function pickGoalShape(random) {
    var roll = random || Math.random;
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
    var r = roll() * total;
    for (var j = 0; j < SHAPE_LIST.length; j++) {
      r -= weights[j];
      if (r <= 0) return SHAPE_LIST[j];
    }
    return SHAPE_LIST[SHAPE_LIST.length - 1];
  }

  /* ---------- game state ---------- */
  function currentChurn() {
    return G.roundChurn || 2500;
  }

  /* Pure layout builder shared by live play and the read-only spectator
     mirrors. The random call order is part of the 1v1 contract: goal shape,
     goal colour, goal cell, then decoys. */
  function buildLayout(random, size, near, goalShape, goalColor) {
    var rPick = function (list) { return list[Math.floor(random() * list.length)]; };
    var rRand = function (n) { return Math.floor(random() * n); };
    var goal = { shape: goalShape, color: goalColor, key: goalShape.id + '|' + goalColor.id };
    var n = size * size;
    var used = {}, cells = new Array(n), goalIndex = rRand(n);
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
      if (random() < 0.5) {
        var pool = PALETTE.filter(function (c) { return c.group === goalColor.group; });
        return rPick(pool);
      }
      return rPick(PALETTE);
    }

    for (var i = 0; i < n; i++) {
      if (i === goalIndex) continue;
      var cell = null;
      for (var attempt = 0; attempt < 26 && !cell; attempt++) {
        var shape, color;
        if (random() < near) {
          if (family.length && random() < 0.58) {
            shape = rPick(family);
            color = random() < 0.4 ? goalColor : decoyColor();
          } else {
            shape = random() < 0.22 ? goalShape : rPick(SHAPE_LIST);
            color = decoyColor();
          }
        } else {
          shape = rPick(SHAPE_LIST);
          color = rPick(PALETTE);
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

    return { cells: cells, goal: goal, goalIndex: goalIndex, near: near };
  }

  /* Deterministic board for (seed, round, index) — the same result on every
     client, so spectators can mirror a player's current deal exactly. */
  function duelBoardAt(seedText, round, index) {
    var size = round <= 1 ? 3 : round === 2 ? 4 : 5;
    var useIndex = Math.max(0, Math.floor(Number(index) || 0));
    var random = seededRandom(String(seedText) + ':' + (round - 1) + ':' + useIndex);
    var rPick = function (list) { return list[Math.floor(random() * list.length)]; };
    var goalShape = rPick(SHAPE_LIST);
    var goalColor = rPick(PALETTE);
    var near = clamp(0.06 + (size - 3) * 0.1 + Math.min(useIndex + 1, 40) * 0.009, 0, 0.62);
    var built = buildLayout(random, size, near, goalShape, goalColor);
    built.size = size;
    return built;
  }

  function deal(boardIndex) {
    if (G.state !== 'playing' && G.state !== 'countdown' && G.state !== 'warmup') return;
    var t = now();
    var useIndex = G.duel
      ? (typeof boardIndex === 'number' && isFinite(boardIndex) ? Math.max(0, boardIndex) : G.duelDeal)
      : 0;
    var duelRng = G.duel ? seededRandom(G.duelSeed + ':' + G.round + ':' + useIndex) : null;
    var random = duelRng || Math.random;
    var rPick = function (list) { return list[Math.floor(random() * list.length)]; };
    var goalShape = G.duel ? rPick(SHAPE_LIST) : pickGoalShape();
    var goalColor = G.duel ? rPick(PALETTE) : pick(PALETTE);
    var near = G.duel
      ? clamp(0.06 + (G.size - 3) * 0.1 + Math.min(useIndex + 1, 40) * 0.009, 0, 0.62)
      : clamp(0.05 + G.pressure * 0.5 + G.tier * 0.025 + (G.size - 3) * 0.08, 0, 0.82);
    var built = buildLayout(random, G.size, near, goalShape, goalColor);
    var cells = built.cells, goal = built.goal, goalIndex = built.goalIndex;
    G.duelDeal = useIndex + 1;
    G.duelBoard = useIndex;

    for (var n2 = 0; n2 < G.size * G.size; n2++) {
      var tile = tiles[n2], cell2 = cells[n2];
      tile.dataset.key = cell2.key;
      tile.dataset.index = n2;
      tile.className = 'tile';
      tile.style.setProperty('--tint', cell2.color.hex);
      tile.innerHTML = shapeSvg(cell2.shape, cell2.color);
      tile.setAttribute('aria-label', 'Tile ' + (n2 + 1) + ': ' + cell2.color.id + ' ' + TS.label(cell2.shape));
      void tile.offsetWidth;
      tile.classList.add('deal');
      var glyph = tile.firstElementChild;
      if (glyph) glyph.style.animationDelay = ((n2 % G.size) + Math.floor(n2 / G.size)) * 14 + 'ms';
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
    G.duelLocked = false;
    G.roundStart = t;
    G.churnStart = t;
    G.churnDuration = currentChurn();
    G.churnDeadline = t + G.churnDuration;
    G.lastShape = goalShape.id;
    G.near = built.near;
    G.colorChanged = G.lastGoalColor !== null && G.lastGoalColor !== goalColor.id;
    G.lastGoalColor = goalColor.id;
    G.wrongOnBoard = 0;
    if (G.cycleStart === null) G.cycleStart = t;

    el.goalIcon.innerHTML = shapeSvg(goalShape, goalColor);
    el.goalIcon.dataset.goal = goal.key;
    el.goalIcon.setAttribute('aria-label', 'Target: ' + goalColor.id + ' ' + TS.label(goalShape));
    el.goalIcon.style.setProperty('--tint', goalColor.hex);
    el.goalCard.style.setProperty('--tint', goalColor.hex);
    el.goalTrack.classList.remove('urgent');
    el.churnWrap.classList.remove('urgent');
    el.churnValue.textContent = (G.churnDuration / 1000).toFixed(1);
    audio.deal();
    refreshRunHud();
  }

  function logTrial(entry) {
    if (G.trials.length >= 400) return;
    entry.round = G.round + 1;
    entry.size = G.size;
    entry.tier = G.tier;
    entry.timeLeft = Math.round(G.timeLeft * 10) / 10;
    G.trials.push(entry);
  }

  function cycleBonusAt(t) {
    var elapsed = (t - (G.cycleStart || t)) / 1000;
    return 400 + Math.round(Math.max(0, 4.5 - elapsed) * 35) + G.tier * 100 + (G.size - 3) * 80;
  }

  function hitTile(index, cell, t, x, y) {
    var rt = clamp(t - G.roundStart, 50, 15000);
    var speed = clamp((1600 - rt) / 1300, 0, 1);
    var streak = G.streak + 1;
    var pts = Math.round(
      CONFIG.basePoints *
      (1 + speed * 0.9) *
      (1 + Math.min(streak, 20) * 0.08) *
      (1 + G.tier * 0.12) *
      (1 + (G.size - 3) * 0.12)
    );

    var tile = tiles[index];
    tile.classList.add('correct');
    setTimeout(function () { tile.classList.remove('correct'); }, 340);
    audio.correct(streak);
    backdrop.pulse(0.4);

    /* Lockstep duel: the server decides which read reached a deal first. Hold
       the points until that decision lands, so the slower player cannot score
       the same board and both clients end on the same number. */
    if (G.duel) {
      var cycleComplete = G.cycleProgress + 1 >= G.cycleTarget;
      var bonus = cycleComplete ? cycleBonusAt(t) : 0;
      G.duelPending = {
        deal: G.duelBoard,
        round: G.round,
        at: t,
        rt: rt,
        speed: speed,
        points: pts,
        bonus: bonus,
        cycleComplete: cycleComplete,
        index: index,
        x: x,
        y: y,
        near: G.near,
        colorChanged: G.colorChanged,
        afterWrong: G.wrongOnBoard > 0,
        targetCell: G.goalIndex,
        targetKey: G.goal.key,
        tapKey: cell.key,
        shapeId: cell.shape.id
      };
      G.resolving = true;
      G.lockUntil = Infinity;
      refreshRunHud();
      duelHook('solved', { round: G.round + 1, deal: G.duelBoard, points: pts + bonus });
      return;
    }

    logTrial({
      rt: Math.round(rt), correct: true, near: G.near, colorChanged: G.colorChanged,
      afterWrong: G.wrongOnBoard > 0, tapCell: index, targetCell: G.goalIndex,
      tapKey: cell.key, targetKey: G.goal.key
    });
    G.correct++;
    G.rtSum += rt;
    G.rtCount++;
    G.streak = streak;
    if (G.streak > G.bestStreak) G.bestStreak = G.streak;
    G.score += pts;
    G.pressure = clamp(G.pressure + 0.014 + speed * 0.05 + G.tier * 0.002, 0, 1);
    G.maxTier = Math.max(G.maxTier, G.tier);
    var s = runStats(cell.shape.id);
    s.c++; s.rt += rt; s.rtc++;

    floatText('+' + pts, x, y, 'good');
    G.cycleProgress++;
    G.resolving = true;
    refreshRunHud();

    if (G.cycleProgress >= G.cycleTarget) { completeCycle(t); return; }
    G.lockUntil = t + 100;
    var runId = G.runId, roundId = G.roundId;
    setTimeout(function () {
      if (G.state === 'playing' && G.runId === runId && G.roundId === roundId) deal();
    }, 100);
  }

  /* Apply a duel hit only after the server confirms we reached the deal first. */
  function settleDuelDeal(deal, won) {
    var p = G.duelPending;
    if (!p || p.deal !== deal || p.round !== G.round) return;
    G.duelPending = null;
    if (!won) return;

    logTrial({
      rt: Math.round(p.rt), correct: true, near: p.near, colorChanged: p.colorChanged,
      afterWrong: p.afterWrong, tapCell: p.index, targetCell: p.targetCell,
      tapKey: p.tapKey, targetKey: p.targetKey
    });
    G.correct++;
    G.rtSum += p.rt;
    G.rtCount++;
    G.streak++;
    if (G.streak > G.bestStreak) G.bestStreak = G.streak;
    G.score += p.points + p.bonus;
    G.pressure = clamp(G.pressure + 0.014 + p.speed * 0.05 + G.tier * 0.002, 0, 1);
    G.maxTier = Math.max(G.maxTier, G.tier);
    var s = runStats(p.shapeId);
    s.c++; s.rt += p.rt; s.rtc++;
    floatText('+' + (p.points + p.bonus), p.x, p.y, 'good');
    G.cycleProgress++;
    if (p.cycleComplete) completeCycle(p.at, true, false);
    refreshRunHud();
  }

  function missTap(index, cell, t, x, y) {
    var rt = clamp(t - G.roundStart, 50, 15000);
    logTrial({
      rt: Math.round(rt), correct: false, near: G.near, colorChanged: G.colorChanged,
      afterWrong: G.wrongOnBoard > 0, tapCell: index, targetCell: G.goalIndex,
      tapKey: cell.key, targetKey: G.goal.key
    });
    G.wrong++;
    G.wrongOnBoard++;
    G.streak = 0;
    G.score = Math.max(0, G.score - CONFIG.wrongScore);
    if (!G.duel) {
      G.timeLeft = Math.max(0, G.timeLeft - CONFIG.wrongPenalty);
      G.roundEndsAt -= CONFIG.wrongPenalty * 1000;
    }
    G.pressure = clamp(G.pressure - 0.07, 0, 1);
    runStats(G.goal.shape.id).w++;
    var tile = tiles[index];
    tile.classList.add('wrong');
    setTimeout(function () { tile.classList.remove('wrong'); }, 400);
    audio.wrong();
    if (G.duel) {
      /* A mistake in a duel costs the points and the rest of this deal: you
         wait for the timer to expire or for the opponent to resolve it. */
      G.duelLocked = true;
      floatText('LOCKED', x, y, 'bad');
      duelHook('penalty', { round: G.round + 1, deal: G.duelBoard, amount: CONFIG.wrongScore });
    } else {
      floatText('\u2212' + CONFIG.wrongPenalty.toFixed(1) + 's', x, y, 'bad');
    }
    refreshRunHud();
    if (G.timeLeft <= 0) endRound();
  }

  function onChurnExpire(t) {
    /* The read window ran out: count the miss and churn to a new target. The
       answer is never revealed; the board changes only after the timer ends. */
    G.misses++;
    G.streak = 0;
    G.pressure = clamp(G.pressure - 0.045, 0, 1);
    runStats(G.goal.shape.id).m++;
    refreshRunHud();
    G.resolving = true;
    G.lockUntil = t + 180;
    var runId = G.runId, roundId = G.roundId;
    if (G.duel) {
      var churnDeal = G.duelBoard;
      duelHook('churn', { round: G.round + 1, deal: churnDeal });
      setTimeout(function () {
        if (G.state === 'playing' && G.runId === runId && G.roundId === roundId && G.duelBoard === churnDeal) {
          duelAdvanceLocal(churnDeal, false);
        }
      }, 150);
      return;
    }
    setTimeout(function () {
      if (G.state === 'playing' && G.runId === runId && G.roundId === roundId) deal();
    }, 150);
  }

  function completeCycle(t, lockstep, award) {
    var bonusPts = cycleBonusAt(t);
    if (award !== false) G.score += bonusPts;
    G.tier++;
    G.maxTier = Math.max(G.maxTier, G.tier);
    G.cycleCount++;
    G.cycleProgress = 0;
    G.cycleStart = null;
    G.resolving = true;
    G.pressure = clamp(G.pressure + 0.09, 0, 1);
    G.lockUntil = t + (lockstep ? 110 : 460);
    audio.cycle();
    backdrop.pulse(1.2);
    showToast('CYCLE CLEAR', '+' + fmt(bonusPts) + ' \u00b7 TIER ' + G.tier);
    clockGain();
    refreshRunHud();
    for (var i = 0; i < tiles.length; i++) {
      (function (tile, idx) {
        setTimeout(function () { tile.classList.add('correct'); }, idx * 14);
        setTimeout(function () { tile.classList.remove('correct'); }, 240 + idx * 14);
      })(tiles[i], i);
    }
    if (lockstep) return;
    var runId = G.runId, roundId = G.roundId;
    setTimeout(function () {
      if (G.state === 'playing' && G.runId === runId && G.roundId === roundId) deal();
    }, 460);
  }

  function finishRoundStats() {
    if (!G.roundBase) return;
    var cfg = CONFIG.rounds[G.round];
    G.roundStats.push({
      round: G.round + 1,
      size: cfg.size,
      duration: cfg.duration,
      score: Math.max(0, G.score - G.roundBase.score),
      correct: G.correct - G.roundBase.correct,
      wrong: G.wrong - G.roundBase.wrong,
      misses: G.misses - G.roundBase.misses,
      maxTier: G.maxTier
    });
    G.roundBase = null;
  }

  function endRound() {
    if (G.state !== 'playing') return;
    /* A solve sent just before the clock ran out still counts. The server will
       send the authoritative scores and settle any race after the run ends. */
    if (G.duelPending) settleDuelDeal(G.duelPending.deal, true);
    G.duelPending = null;
    finishRoundStats();
    if (G.round < CONFIG.rounds.length - 1) {
      G.state = 'break';
      G.resolving = true;
      G.lockUntil = Infinity;
      G.breakEnd = now() + CONFIG.breakMs;
      G.breakNum = 0;
      audio.stopMusic();
      audio.cycle();
      showRoundBreak();
      if (G.duel) duelHook('break', { round: G.round + 1, score: G.score });
      return;
    }
    endRun();
  }

  function endRun() {
    if (G.state === 'over') return;
    G.state = 'over';
    G.lockUntil = Infinity;
    G.timeLeft = Math.max(0, G.timeLeft);
    audio.stopMusic();
    audio.gameover();

    var attempts = Math.max(1, G.correct + G.wrong + G.misses);
    var acc = G.correct / attempts;
    var rt = G.rtCount ? G.rtSum / G.rtCount : 2000;
    var speedN = clamp((1800 - rt) / 1500, 0, 1);
    var tierN = clamp(G.maxTier / 10, 0, 1);
    var actual = clamp(acc * 0.55 + speedN * 0.3 + tierN * 0.15, 0, 1);
    var opponent = 820 + G.maxTier * 130;
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
    if (G.maxTier > SAVE.bestTier) SAVE.bestTier = G.maxTier;
    SAVE.elo = after;
    SAVE.games++;

    var metrics = BPI.compute({
      trials: G.trials,
      misses: G.misses,
      cycles: G.cycleCount,
      maxTier: G.maxTier,
      score: G.score
    });
    G.finalMetrics = metrics;
    if (metrics.bpi > SAVE.bestBpi) {
      SAVE.bestBpi = metrics.bpi;
      SAVE.title = metrics.title;
    }
    SAVE.runs.unshift({
      score: G.score, tier: G.maxTier, acc: Math.round(acc * 100),
      rt: Math.round(rt), bpi: metrics.bpi
    });
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
    el.finalBpi.textContent = String(metrics.bpi);
    el.finalTitle.textContent = metrics.title;
    el.finalTitle.style.color = titleColor(metrics.title);
    el.finalArchetype.textContent = metrics.archetype;
    el.overFeedback.textContent = metrics.feedback.headline + ' ' + metrics.feedback.body;
    el.overKicker.textContent = 'RUN COMPLETE \u00b7 ' + metrics.confidence.toUpperCase();
    if (window.ProfileUI && el.overRadar) {
      el.overRadar.innerHTML = window.ProfileUI.radarSVG(metrics.axes, 168);
    }

    el.overNote.textContent = metrics.feedback.drill || '';
    el.timeValue.textContent = '0.0';
    el.timebarFill.style.transform = 'scaleX(0)';
    refreshRunHud();
    refreshMeta();
    showScreen(el.overScreen);
    backdrop.pulse(1.4);
    if (G.duel) duelHook('finish', { score: G.score, bpi: metrics.bpi });

    /* Close the trace on the final score and stop sampling. */
    if (G.timeline.length) G.timeline[G.timeline.length - 1] = G.score;
    G.runStartedAt = 0;

    submitRun({
      score: G.score,
      tier: G.maxTier,
      accuracy: acc,
      avgRt: Math.round(rt),
      misses: G.misses,
      cycles: G.cycleCount,
      rounds: G.roundStats,
      trials: G.trials,
      timeline: G.timeline,
      gameId: 'tile-rush',
      bestStreak: G.bestStreak,
      tzOffset: new Date().getTimezoneOffset()
    }, G.runId);
  }

  /* ---------- run lifecycle ---------- */
  function resetRunCounters() {
    G.score = 0; G.tier = 0; G.maxTier = 0; G.cycleCount = 0; G.cycleProgress = 0;
    G.cycleStart = null; G.pressure = 0.08;
    G.correct = 0; G.wrong = 0; G.misses = 0; G.rtSum = 0; G.rtCount = 0;
    G.streak = 0; G.bestStreak = 0;
    G.goal = null; G.goalIndex = -1; G.layout = null;
    G.lastShape = null; G.lastGoalColor = null; G.colorChanged = false;
    G.wrongOnBoard = 0; G.trials = []; G.roundStats = []; G.roundBase = null;
    G.finalMetrics = null;
    G.runSymbols = {};
    G.lockUntil = Infinity;
    G.resolving = false;
    G.duelDeal = 0;
    G.duelBoard = -1;
    G.duelLastSent = 0;
    G.duelPending = null;
    G.duelLocked = false;
    G.timeline = [];
    G.runStartedAt = 0;
    G.timelineNext = 0;
  }

  function startRun() {
    audio.init();
    audio.setMuted(SAVE.settings.muted);

    G.runId++;
    G.themeSeed = G.duel ? String(G.duelSeed || 'duel') : 'solo:' + G.runId + ':' + Date.now();
    G.runTheme = SAVE.settings.theme;
    TS.setTheme(G.runTheme, G.themeSeed);
    G.state = 'countdown';
    G.round = 0;
    G.roundId++;
    G.size = CONFIG.rounds[0].size;
    G.roundDuration = CONFIG.rounds[0].duration;
    G.roundChurn = CONFIG.rounds[0].churn;
    G.cycleTarget = CONFIG.rounds[0].cycle;
    G.timeLeft = G.roundDuration;
    G.roundEndsAt = G.lastFrame + G.roundDuration * 1000;
    resetRunCounters();
    G.roundBase = { score: 0, correct: 0, wrong: 0, misses: 0, tier: 0 };
    G.lastFrame = now();
    G.eloBefore = SAVE.elo;
    G.countdownNum = 0;

    /* One cumulative-score sample per second, from the countdown onward, so the
       run can be replayed as a ghost later. */
    G.runStartedAt = G.lastFrame;
    G.timeline = [0];
    G.timelineNext = 1000;

    showScreen(null);
    buildGrid(G.size);
    el.clock.classList.remove('warn', 'danger', 'gain');
    el.timebar.classList.remove('warn', 'danger');
    el.timeValue.textContent = G.roundDuration.toFixed(1);
    el.timebarFill.style.transform = 'scaleX(1)';

    /* Deal once, before the countdown, and carry that exact board into play. */
    deal();
    G.cycleStart = null;
    el.goalCard.classList.add('locked');
    G.countdownEnd = now() + CONFIG.countdownMs;
    el.churnValue.textContent = (G.roundChurn / 1000).toFixed(1);
    el.churnWrap.classList.remove('urgent');
    el.goalTrack.classList.remove('urgent');
    el.goalTrackFill.style.transform = 'scaleX(1)';
    refreshRunHud();

    if (params.has('instant')) {
      beginPlay();
      return;
    }
    setCountdown(3);
  }

  function beginPlay() {
    if (G.state !== 'countdown') return;
    G.state = 'playing';
    var t = now();
    G.lastFrame = t;
    G.lastTickSecond = 99;
    G.lockUntil = 0;
    G.roundStart = t;
    G.roundEndsAt = t + G.roundDuration * 1000;
    G.cycleStart = t;
    G.churnStart = t;
    G.churnDuration = G.roundChurn;
    G.churnDeadline = t + G.churnDuration;
    G.resolving = false;
    el.goalCard.classList.remove('locked');
    hideCountdown();
    hideRoundBreak();
    flashGo('ROUND 1');
    audio.startMusic();
    audio.start();
    refreshRunHud();
  }

  function enterRound(index) {
    var cfg = CONFIG.rounds[index];
    G.roundId++;
    G.round = index;
    G.size = cfg.size;
    G.roundDuration = cfg.duration;
    G.roundChurn = cfg.churn;
    G.cycleTarget = cfg.cycle;
    G.timeLeft = cfg.duration;
    G.roundEndsAt = now() + cfg.duration * 1000;
    G.cycleProgress = 0;
    G.cycleStart = null;
    G.roundBase = { score: G.score, correct: G.correct, wrong: G.wrong, misses: G.misses, tier: G.tier };
    G.lastGoalColor = null;
    G.wrongOnBoard = 0;
    G.pressure = clamp(0.12 + index * 0.12, 0, 1);
    G.resolving = false;
    G.lockUntil = 0;
    G.lastTickSecond = 99;
    if (G.duel) { G.duelDeal = 0; G.duelBoard = -1; }
    G.duelPending = null;
    G.duelLocked = false;

    buildGrid(cfg.size);
    hideRoundBreak();
    showScreen(null);
    G.state = 'playing';
    var t = now();
    G.lastFrame = t;
    G.roundStart = t;
    G.churnStart = t;
    G.churnDuration = G.roundChurn;
    G.churnDeadline = t + G.churnDuration;
    G.cycleStart = null;
    deal();
    flashGo('ROUND ' + (index + 1));
    audio.startMusic();
    audio.start();
    el.goalCard.classList.remove('locked');
    el.grid.classList.remove('break');
    refreshRunHud();
    if (G.duel) duelHook('round', { round: index + 1 });
  }

  function showRoundBreak() {
    var cfg = CONFIG.rounds[G.round];
    var next = CONFIG.rounds[G.round + 1];
    el.breakTitle.textContent = 'ROUND ' + (G.round + 1) + ' CLEAR';
    el.breakSub.textContent = cfg.size + '×' + cfg.size + ' · ' + cfg.duration + 's · ' + G.correct + ' hits';
    el.breakNext.textContent = 'NEXT ' + next.size + '×' + next.size + ' · ' + next.duration + 's';
    el.breakNum.textContent = '5';
    el.roundBreak.classList.add('show');
    el.grid.classList.add('break');
    el.goalCard.classList.add('locked');
    G.breakNum = 5;
    audio.countdown(5);
  }

  function hideRoundBreak() {
    el.roundBreak.classList.remove('show');
    el.grid.classList.remove('break');
  }

  function setCountdown(n) {
    G.countdownNum = n;
    el.countdownNum.textContent = String(n);
    el.countdownNum.dataset.n = String(n);
    el.countdown.setAttribute('aria-label', 'Starting in ' + n + (n === 1 ? ' second' : ' seconds'));
    el.countdownNum.classList.remove('tick');
    void el.countdownNum.offsetWidth;
    el.countdownNum.classList.add('tick');
    el.countdown.classList.add('show');
    audio.countdown(n);
  }

  function hideCountdown() {
    el.countdown.classList.remove('show');
    el.countdownNum.classList.remove('tick');
  }

  function toMenu() {
    G.state = 'intro';
    G.runId++;
    G.roundId++;
    G.duel = false;
    G.duelSeed = '';
    G.duelOpp = null;
    hideRoundBreak();
    hideCountdown();
    showScreen(el.introScreen);
    showIdle();
    refreshMeta();
    duelHook('closed');
  }

  /* ---------- input ---------- */
  function onTile(index, x, y) {
    if (G.state !== 'playing') return;
    if (G.duel && G.duelLocked) return;
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
    if (e.key === 'Escape') {
      if (el.profileScreen.classList.contains('show')) { closeProfile(); return; }
      if (el.insightsScreen && el.insightsScreen.classList.contains('show')) { closeInsights(); return; }
      if (el.authScreen.classList.contains('show')) { closeAuth(); return; }
      if (el.boardScreen.classList.contains('show')) { closeBoard(); return; }
    }
    if (e.target && /^(input|select|textarea)$/i.test(e.target.tagName)) return;
    if (el.profileScreen.classList.contains('show') ||
        el.insightsScreen && el.insightsScreen.classList.contains('show') ||
        el.authScreen.classList.contains('show') ||
        el.boardScreen.classList.contains('show')) return;
    if (e.key === 'Enter') {
      if (G.state === 'intro' || G.state === 'over') { e.preventDefault(); requestStart(); }
      return;
    }
    if (e.key === ' ') {
      if (G.state === 'intro' || G.state === 'over') { e.preventDefault(); requestStart(); }
      return;
    }
    if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && G.state === 'playing') {
      e.preventDefault();
      var tile = tiles[n - 1];
      if (!tile) return;
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
  function setSymbolTheme(theme) {
    if (G.state === 'playing' || G.state === 'countdown' || G.state === 'break') return;
    SAVE.settings.theme = theme === 'sports' ? 'sports' : 'kids';
    TS.setTheme(SAVE.settings.theme, G.themeSeed || 'preview');
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
    var themeButtons = document.querySelectorAll('#themeChoice [data-theme]');
    for (var t = 0; t < themeButtons.length; t++) {
      var on = themeButtons[t].getAttribute('data-theme') === SAVE.settings.theme;
      themeButtons[t].classList.toggle('active', on);
      themeButtons[t].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (el.goalCopyTitle) {
      el.goalCopyTitle.textContent = SAVE.settings.theme === 'sports'
        ? 'Same icon. Same colour.'
        : 'Same shape. Same colour.';
    }
    if (el.weakNote) {
      el.weakNote.textContent = SAVE.settings.theme === 'sports'
        ? 'Misses pull these icons back into rotation.'
        : 'Misses pull these shapes back into rotation.';
    }
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
    el.cycleNum.textContent = G.cycleProgress + '/' + G.cycleTarget;
    var pips = '';
    for (var i = 0; i < G.cycleTarget; i++) pips += '<i class="' + (i < G.cycleProgress ? 'on' : '') + '"></i>';
    el.pips.innerHTML = pips;
    if (el.round) el.round.textContent = (G.round + 1) + '/3';
    el.streak.textContent = String(G.streak);
    el.streakWrap.classList.toggle('hot', G.streak >= 5);
    el.statAcc.textContent = accuracyPct() + '%';
    el.statRt.textContent = avgRt() ? avgRt() + 'ms' : '\u2014';
    el.statStreak.textContent = String(G.bestStreak);
    renderWeak();
  }

  function frameHud(t) {
    var duration = G.roundDuration || 25;
    if (G.state === 'playing' || G.state === 'over') {
      el.timeValue.textContent = G.timeLeft.toFixed(1);
      el.timebarFill.style.transform = 'scaleX(' + clamp(G.timeLeft / duration, 0, 1) + ')';
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

    var urgency = 1 - clamp(G.timeLeft / duration, 0, 1);
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
      html += '<div class="weak" title="' + TS.label(item.shape) + ' \u00b7 ' + Math.round(item.skill * 100) + '% mastery">' +
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
    if (el.introBpi) el.introBpi.textContent = String(SAVE.bestBpi || 0);
    if (el.introTitle) el.introTitle.textContent = SAVE.title || 'DRIFTER';
    el.gamesCount.textContent = SAVE.games + (SAVE.games === 1 ? ' run' : ' runs');
    el.bestScore.textContent = 'PB ' + fmt(SAVE.best);
    renderRuns();
    updateSettingsUI();
  }

  function showIdle() {
    G.round = 0;
    G.size = 3;
    G.roundDuration = CONFIG.rounds[0].duration;
    G.roundChurn = CONFIG.rounds[0].churn;
    G.cycleTarget = CONFIG.rounds[0].cycle;
    G.timeLeft = G.roundDuration;
    G.score = 0; G.tier = 0; G.cycleProgress = 0; G.pressure = 0.08;
    G.streak = 0; G.bestStreak = 0;
    G.layout = null; G.goal = null; G.cycleStart = null;
    buildGrid(3);
    hideRoundBreak();
    el.score.textContent = '0';
    el.timeValue.textContent = G.roundDuration.toFixed(1);
    el.timebarFill.style.transform = 'scaleX(1)';
    el.cycleNum.textContent = '0/' + G.cycleTarget;
    el.tier.textContent = '0';
    if (el.round) el.round.textContent = '1/3';
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
    el.goalCard.classList.remove('locked');
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
    el.authScreen.classList.toggle('show', node === el.authScreen);
    el.boardScreen.classList.toggle('show', node === el.boardScreen);
    el.profileScreen.classList.toggle('show', node === el.profileScreen);
    if (el.insightsScreen) el.insightsScreen.classList.toggle('show', node === el.insightsScreen);
    if (el.tutorialScreen) el.tutorialScreen.classList.toggle('show', node === el.tutorialScreen);
    syncSectionNav(node);
  }

  /* ---------- sections ---------- */
  var activeSection = 'game';
  var DEVICE_KEY = 'tile-rush.devices.v1';
  var HOME_RANK_KEY = 'tile-rush.homeRank.v1';

  function devices() {
    try {
      var raw = JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}') || {};
      return { oura: !!raw.oura, ultrahuman: !!raw.ultrahuman };
    } catch (e) {
      return { oura: false, ultrahuman: false };
    }
  }

  function saveDevices(next) {
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  }

  function hasDevice() {
    var d = devices();
    return d.oura || d.ultrahuman;
  }

  function homeRankEnabled() {
    try { return localStorage.getItem(HOME_RANK_KEY) !== '0'; } catch (e) { return true; }
  }

  function setHomeRank(enabled) {
    try { localStorage.setItem(HOME_RANK_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
    if (el.settingsRankToggle) {
      el.settingsRankToggle.textContent = enabled ? 'ON' : 'OFF';
      el.settingsRankToggle.classList.toggle('off', !enabled);
      el.settingsRankToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
    if (!enabled) {
      if (el.homeRank) el.homeRank.hidden = true;
    } else {
      loadRank();
    }
  }

  function sectionFor(node) {
    if (node === el.boardScreen) return 'leaderboard';
    if (node === el.profileScreen) return 'profile';
    if (node && node === el.insightsScreen) return 'insights';
    return 'game';
  }

  function setSectionActive(section) {
    activeSection = section;
    var buttons = el.sectionBar ? el.sectionBar.querySelectorAll('[data-section]') : [];
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].getAttribute('data-section') === section);
    }
  }

  function syncSectionNav(node) {
    if (!el.sectionBar) return;
    var modal = node === el.authScreen || node === el.tutorialScreen;
    var inRun = node === null && G && (G.state === 'playing' || G.state === 'countdown' || G.state === 'break');
    el.sectionBar.hidden = !!modal || !!inRun;
    if (!modal) setSectionActive(sectionFor(node));
  }

  function closeInsights() {
    showScreen(G.state === 'over' ? el.overScreen : G.state === 'intro' ? el.introScreen : null);
  }

  function renderDevicesPanel() {
    var d = devices();
    var rows = document.querySelectorAll('[data-device-toggle]');
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].getAttribute('data-device-toggle');
      var linked = !!d[key];
      rows[i].textContent = linked ? 'UNLINK' : 'CONNECT';
      var row = document.querySelector('[data-device-row="' + key + '"]');
      if (row) row.classList.toggle('linked', linked);
      var state = document.querySelector('[data-device-state="' + key + '"]');
      if (state) state.textContent = linked ? 'LINKED \u00b7 SAMPLE FEED' : 'NOT CONNECTED';
    }
    if (el.insightsOuraState) el.insightsOuraState.textContent = d.oura ? 'LINKED' : 'NOT LINKED';
    if (el.insightsUltraState) el.insightsUltraState.textContent = d.ultrahuman ? 'LINKED' : 'NOT LINKED';
    if (el.settingsDevicesNote) {
      el.settingsDevicesNote.textContent = d.oura && d.ultrahuman
        ? 'Oura and Ultrahuman linked on this device.'
        : d.oura ? 'Oura linked on this device.'
        : d.ultrahuman ? 'Ultrahuman linked on this device.'
        : 'No wearable linked yet.';
    }
  }

  function toggleDevice(key) {
    var d = devices();
    d[key] = !d[key];
    saveDevices(d);
    renderDevicesPanel();
    showToast('DEVICE', d[key] ? 'Linked · sample feed enabled.' : 'Unlinked.');
  }

  function renderInsights() {
    if (!el.insightsScreen) return;
    var on = hasDevice();
    el.insightsEmpty.hidden = on;
    el.insightsFeed.hidden = !on;
    el.insightsFootNote.textContent = on
      ? 'Sample feed. Live OAuth sync lands next.'
      : 'Link a device in your profile to unlock this view.';
    renderDevicesPanel();
  }

  function openInsights() {
    var api = params.get('api');
    window.location.href = 'insights.html' + (api ? '?api=' + encodeURIComponent(api) : '');
  }

  function setProfileTab(tab) {
    var allowed = ['profile', 'settings', 'devices'];
    if (allowed.indexOf(tab) < 0) tab = 'profile';
    if (el.profileTabProfile) el.profileTabProfile.hidden = tab !== 'profile';
    if (el.profileTabSettings) el.profileTabSettings.hidden = tab !== 'settings';
    if (el.profileTabDevices) el.profileTabDevices.hidden = tab !== 'devices';
    var buttons = el.profileTabs ? el.profileTabs.querySelectorAll('[data-ptab]') : [];
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute('data-ptab') === tab;
      buttons[i].classList.toggle('active', on);
      buttons[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if (tab === 'settings') renderSettings();
    if (tab === 'devices') renderDevicesPanel();
  }

  function renderEmoteEditor() {
    if (!el.emoteEditor || !window.Emotes) return;
    var list = Emotes.load();
    el.emoteEditor.textContent = '';
    list.forEach(function (preset, index) {
      var row = document.createElement('div');
      row.className = 'emote-row';

      var num = document.createElement('span');
      num.className = 'emote-num';
      num.textContent = String(index + 1).padStart(2, '0');

      var emoji = document.createElement('input');
      emoji.className = 'emote-input emote-input-emoji';
      emoji.type = 'text';
      emoji.value = preset.emoji;
      emoji.maxLength = 8;
      emoji.autocomplete = 'off';
      emoji.setAttribute('aria-label', 'Emote ' + (index + 1) + ' emoji');

      var text = document.createElement('input');
      text.className = 'emote-input emote-input-text';
      text.type = 'text';
      text.value = preset.text;
      text.maxLength = 24;
      text.autocomplete = 'off';
      text.placeholder = 'Message';
      text.setAttribute('aria-label', 'Emote ' + (index + 1) + ' message');

      row.appendChild(num);
      row.appendChild(emoji);
      row.appendChild(text);
      el.emoteEditor.appendChild(row);
    });
  }

  function saveEmoteEditor() {
    if (!el.emoteEditor || !window.Emotes) return;
    var rows = el.emoteEditor.querySelectorAll('.emote-row');
    var list = Array.prototype.map.call(rows, function (row) {
      return {
        emoji: row.querySelector('.emote-input-emoji').value,
        text: row.querySelector('.emote-input-text').value
      };
    });
    Emotes.save(list);
    renderEmoteEditor();
    if (window.Duel && Duel.refreshEmotes) Duel.refreshEmotes();
    showToast('EMOTES', 'Saved for @' + (Account.user() ? Account.user().username : 'you') + ' on this device.');
  }

  function renderSettings() {
    var user = Account && Account.user();
    if (!user) return;
    if (el.settingsAccount) el.settingsAccount.textContent = '@' + user.username + ' \u00b7 ' + (user.title || 'DRIFTER');
    var on = homeRankEnabled();
    if (el.settingsRankToggle) {
      el.settingsRankToggle.textContent = on ? 'ON' : 'OFF';
      el.settingsRankToggle.classList.toggle('off', !on);
      el.settingsRankToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    renderDevicesPanel();
    renderEmoteEditor();
  }

  function goSection(section) {
    if (section === 'game') {
      showScreen(G.state === 'over' ? el.overScreen : G.state === 'intro' ? el.introScreen : null);
      return;
    }
    if (section === 'leaderboard') { openBoard(boardBy); return; }
    if (section === 'profile') {
      if (Account && Account.user()) openProfile(Account.user().username);
      else openAuth(false);
      return;
    }
    if (section === 'insights') openInsights();
  }

  /* ---------- main loop ---------- */
  function loop(t) {
    requestAnimationFrame(loop);

    /* Sample the run clock (countdown, play and breaks) once per second. */
    if (G.runStartedAt && G.timeline.length < 120) {
      var sampleDue = Math.floor((t - G.runStartedAt) / 1000);
      while (G.timeline.length <= sampleDue && G.timeline.length < 120) {
        G.timeline.push(Math.round(G.score));
      }
    }

    if (G.state === 'playing') {
      /* Wall-clock deadline, not accumulated frames: switching tabs throttles
         requestAnimationFrame, but the round clock must keep running. */
      G.lastFrame = t;
      G.timeLeft = Math.max(0, (G.roundEndsAt - t) / 1000);
      if (G.timeLeft <= 0) {
        G.timeLeft = 0;
        endRound();
      } else {
        if (G.duel && t - G.duelLastSent > 800) {
          G.duelLastSent = t;
          duelHook('progress', { round: G.round + 1, score: G.score, correct: G.correct, wrong: G.wrong, misses: G.misses, streak: G.streak, deal: G.duelBoard });
        }
        if (G.duelPending && t - G.duelPending.at > 1800) {
          /* Socket fallback: if the server never answers, treat the read as
             accepted so the run cannot freeze on a lost message. */
          duelAdvanceLocal(G.duelPending.deal, true);
        }
        if (!G.resolving && t >= G.churnDeadline && t >= G.lockUntil) onChurnExpire(t);
        var sec = Math.ceil(G.timeLeft);
        if (sec <= 5 && sec >= 1 && sec !== G.lastTickSecond) {
          G.lastTickSecond = sec;
          audio.tick(sec);
        }
      }
    } else {
      G.lastFrame = t;
      if (G.state === 'break') {
        var remainBreak = G.breakEnd - t;
        var breakNum = Math.max(0, Math.ceil(remainBreak / 1000));
        if (breakNum !== G.breakNum) {
          G.breakNum = breakNum;
          el.breakNum.textContent = String(breakNum);
          if (breakNum > 0) audio.countdown(breakNum);
        }
        if (remainBreak <= 0) enterRound(G.round + 1);
      } else if (G.state === 'countdown') {
        var remain = G.countdownEnd - t;
        var num = Math.max(1, Math.ceil(remain / 1000));
        if (num !== G.countdownNum) setCountdown(num);
        if (remain <= 0) beginPlay();
      }
    }
    frameHud(t);
  }

  /* ---------- account + leaderboard ---------- */
  function signedIn() { return !!(Account && Account.user()); }

  function avatarInner(user) {
    if (user && user.avatar) {
      return '<img src="' + user.avatar + '" alt="" />';
    }
    return '<span>' + String((user && user.username) || '?').charAt(0).toUpperCase() + '</span>';
  }

  function titleColor(name) {
    return (window.ProfileUI && window.ProfileUI.titleColor) ? window.ProfileUI.titleColor(name) : '#94a3b8';
  }

  function syncSaveFromUser(user) {
    if (!user) return;
    SAVE.elo = Number(user.rating) || 1000;
    SAVE.best = Number(user.bestScore) || 0;
    SAVE.bestTier = Number(user.bestTier) || 0;
    SAVE.games = Number(user.games) || 0;
    SAVE.bestBpi = Number(user.bestBpi) || SAVE.bestBpi || 0;
    SAVE.title = user.title || SAVE.title || 'DRIFTER';
    persist();
  }

  function renderAccount() {
    var user = Account && Account.user();
    if (user) {
      el.accountAvatar.innerHTML = avatarInner(user);
      el.accountAvatar.classList.toggle('has-photo', !!user.avatar);
      el.accountName.textContent = '@' + user.username;
      el.accountBtn.classList.add('signed');
      el.accountBtn.title = 'Signed in as @' + user.username + ' — open profile';
      el.boardIdentity.textContent = 'Signed in as @' + user.username;
      if (el.introProfileBtn) el.introProfileBtn.hidden = false;
    } else {
      el.accountAvatar.innerHTML = '<span>?</span>';
      el.accountAvatar.classList.remove('has-photo');
      el.accountName.textContent = 'SIGN IN';
      el.accountBtn.classList.remove('signed');
      el.accountBtn.title = 'Sign in to rank your runs';
      el.boardIdentity.textContent = 'Not signed in — runs are unranked';
      if (el.introProfileBtn) el.introProfileBtn.hidden = true;
    }
  }

  function setAuthMode(mode) {
    authMode = mode === 'register' ? 'register' : 'login';
    var register = authMode === 'register';
    el.tabLogin.classList.toggle('active', !register);
    el.tabRegister.classList.toggle('active', register);
    el.tabLogin.setAttribute('aria-selected', String(!register));
    el.tabRegister.setAttribute('aria-selected', String(register));
    el.authConfirmWrap.hidden = !register;
    el.authTitle.innerHTML = register ? 'Claim your <em>callsign</em>' : 'Sign in to <em>rank</em>';
    el.authLede.textContent = register
      ? 'Pick 3–16 letters, numbers or underscores. Your callsign is unique and permanent.'
      : 'Your username is your leaderboard identity. No email, no socials.';
    el.authSubmit.innerHTML = register ? 'CREATE &amp; PLAY <span>↵</span>' : 'LOG IN &amp; PLAY <span>↵</span>';
    el.authPass.setAttribute('autocomplete', register ? 'new-password' : 'current-password');
    el.authPass.setAttribute('placeholder', register ? 'At least 6 characters' : 'Your password');
    el.authError.textContent = '';
  }

  function openAuth(forStart) {
    pendingStart = !!forStart;
    setAuthMode('login');
    el.authForm.reset();
    showScreen(el.authScreen);
    setTimeout(function () { el.authUser.focus(); }, 80);
  }

  function closeAuth() {
    showScreen(G.state === 'over' ? el.overScreen : G.state === 'intro' ? el.introScreen : null);
  }

  function requestStart() {
    if (window.Duel && Duel.active && Duel.active()) {
      if (Duel.primary) Duel.primary();
      return;
    }
    if (signedIn()) { startRun(); return; }
    if (guestMode) {
      if (!tutorialDone()) { openTutorial(0, true, startRun); return; }
      startRun();
      return;
    }
    if (!Account) { openAuth(true); return; }
    Account.ready().then(function (user) {
      if (user) startRun();
      else openAuth(true);
    });
  }

  function submitAuth(e) {
    if (e) e.preventDefault();
    if (!Account) return;
    var username = el.authUser.value.trim();
    var password = el.authPass.value;
    var confirm = el.authConfirm.value;

    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
      el.authError.textContent = 'Username must be 3–16 letters, numbers or underscores.';
      return;
    }
    if (password.length < 6) {
      el.authError.textContent = 'Password must be at least 6 characters.';
      return;
    }
    if (authMode === 'register' && password !== confirm) {
      el.authError.textContent = 'Passwords do not match.';
      return;
    }

    var shouldStart = pendingStart;
    el.authError.textContent = '';
    el.authSubmit.disabled = true;
    el.authSubmit.innerHTML = authMode === 'register' ? 'CREATING…' : 'LOGGING IN…';

    var wasRegister = authMode === 'register';
    var call = wasRegister
      ? Account.register(username, password)
      : Account.login(username, password);

    call.then(function (user) {
      guestMode = false;
      pendingStart = false;
      syncSaveFromUser(user);
      renderAccount();
      refreshMeta();
      loadGlobalCard();
      if (wasRegister) {
        openTutorial(0, true, function () { if (shouldStart) startRun(); });
        return;
      }
      if (shouldStart) startRun();
      else closeAuth();
    }).catch(function (err) {
      el.authError.textContent = err && err.message ? err.message : 'Could not sign in. Try again.';
    }).then(function () {
      el.authSubmit.disabled = false;
      el.authSubmit.innerHTML = authMode === 'register'
        ? 'CREATE &amp; PLAY <span>↵</span>'
        : 'LOG IN &amp; PLAY <span>↵</span>';
    });
  }

  /* ---------- leaderboard ---------- */
  function metricValue(row, by) {
    if (!row) return 0;
    if (by === 'rating') return Number(row.rating) || 0;
    if (by === 'bpi') return Number(row.bestBpi) || 0;
    return Number(row.bestScore) || 0;
  }

  function metricLabel(by) {
    return by === 'rating' ? 'RATING' : by === 'bpi' ? 'BPI' : 'SCORE';
  }

  function syncSeg(container, attr, value) {
    if (!container) return;
    var buttons = container.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute(attr) === value;
      buttons[i].classList.toggle('active', on);
      buttons[i].setAttribute('aria-pressed', String(on));
    }
  }

  function syncBoardFilters() {
    syncSeg(el.boardScopes, 'data-scope', boardScope);
    syncSeg(el.boardPeriods, 'data-period', boardPeriod);
    syncSeg(el.boardMetrics, 'data-by', boardBy);
  }

  function periodLabel(data) {
    if (boardPeriod === 'week') return data.weekLabel || 'THIS WEEK';
    if (boardPeriod === 'season') return data.seasonLabel || 'THIS SEASON';
    return 'ALL TIME';
  }

  function openBoard(by) {
    if (G.state === 'playing' || G.state === 'countdown' || G.state === 'break') return;
    if (by && /^(bpi|score|rating)$/.test(by)) boardBy = by;
    showScreen(el.boardScreen);
    syncBoardFilters();
    loadBoard();
  }

  function closeBoard() {
    showScreen(G.state === 'over' ? el.overScreen : G.state === 'intro' ? el.introScreen : null);
  }

  function loadBoard() {
    if (!Account) return;
    var id = ++boardRequest;
    el.boardList.innerHTML = '<p class="board-empty">Loading the board…</p>';
    el.boardMe.hidden = true;
    syncBoardFilters();
    Account.leaderboard({
      by: boardBy,
      scope: boardScope,
      period: boardPeriod,
      limit: 50
    }).then(function (data) {
      if (id !== boardRequest) return;
      renderBoard(data);
    }).catch(function () {
      if (id !== boardRequest) return;
      el.boardList.innerHTML = '<p class="board-empty">The board is unavailable right now. Try again.</p>';
    });
  }

  function renderBoard(data) {
    var user = Account && Account.user();
    var label = metricLabel(boardBy);
    el.boardScopeLabel.textContent = data.scopeLabel || 'WORLDWIDE';
    el.boardPeriodLabel.textContent = periodLabel(data);
    el.boardPlayers.textContent = data.players + (data.players === 1 ? ' ranked player' : ' ranked players');
    el.boardOnline.textContent = data.online + ' online now';

    if (!data.scopeAvailable) {
      el.boardList.innerHTML = '<p class="board-empty">We could not resolve your ' +
        (boardScope === 'country' ? 'country' : 'region') +
        '. Play from a network that exposes location or switch to Global.</p>';
      el.boardMe.hidden = true;
      return;
    }

    if (!data.entries.length) {
      el.boardList.innerHTML = '<p class="board-empty">No ranked runs on this board yet. Be the first.</p>';
    } else {
      var html = '';
      for (var i = 0; i < data.entries.length; i++) {
        var row = data.entries[i];
        var mine = user && row.id === user.id;
        var value = metricValue(row, boardBy);
        html += '<button class="board-row' + (mine ? ' me' : '') + '" type="button" data-user="' + row.username + '"' +
          ' data-rank="' + row.rank + '" aria-label="Open ' + row.username + ' profile">' +
          '<span class="board-rank">' + String(row.rank).padStart(2, '0') + '</span>' +
          '<span class="board-person">' +
            '<span class="board-avatar' + (row.avatar ? ' has-photo' : '') + '">' + avatarInner(row) + '</span>' +
            '<span class="board-name">' + row.username +
              (mine ? '<span class="board-you">YOU</span>' : '') +
              '<small class="board-title-badge" style="color:' + titleColor(row.title) + '">' + (row.title || 'DRIFTER') +
              ' · ' + row.games + (row.games === 1 ? ' run' : ' runs') + '</small>' +
            '</span>' +
          '</span>' +
          '<span class="board-val">' + fmt(value) + '<em>' + label + '</em></span>' +
          '<span class="board-go" aria-hidden="true">\u203a</span>' +
          '</button>';
      }
      el.boardList.innerHTML = html;
    }

    if (data.me) {
      var myValue = metricValue(data.me, boardBy);
      el.boardMe.innerHTML = 'YOUR RANK <b>#' + data.me.rank + '</b> · ' + fmt(myValue) +
        ' <span style="color:var(--dim)">' + label + '</span>';
      el.boardMe.hidden = false;
    } else if (user) {
      el.boardMe.textContent = 'Play one ranked run to enter this board.';
      el.boardMe.hidden = false;
    } else {
      el.boardMe.textContent = 'Sign in to rank your runs and claim a spot.';
      el.boardMe.hidden = false;
    }
  }

  function loadGlobalCard() {
    if (!Account || !el.globalTop) return;
    Account.leaderboard({ by: 'bpi', scope: 'global', period: 'season', limit: 3 }).then(function (data) {
      if (!data.entries.length) {
        el.globalTop.innerHTML = '<p class="card-note">No ranked players yet. Be the first.</p>';
        return;
      }
      var html = '';
      for (var i = 0; i < data.entries.length; i++) {
        var row = data.entries[i];
        html += '<div class="global-row"><span class="gr">' + String(row.rank).padStart(2, '0') + '</span>' +
          '<span class="gn">' + row.username + '</span>' +
          '<span class="gv">' + fmt(row.bestBpi) + '</span></div>';
      }
      el.globalTop.innerHTML = html;
    }).catch(function () {
      el.globalTop.innerHTML = '<p class="card-note">Leaderboard unavailable.</p>';
    });
  }

  /* ---------- profiles ---------- */
  function openProfile(username, gameId, tab) {
    if (!Account) return;
    var name = String(username || (Account.user() ? Account.user().username : '')).trim();
    if (!name) {
      openAuth(false);
      return;
    }
    profileReturn = el.boardScreen.classList.contains('show') ? 'board'
      : G.state === 'over' ? 'over' : 'intro';
    currentProfileGame = gameId || 'tile-rush';
    currentProfile = null;
    currentProfileSelf = false;
    showScreen(el.profileScreen);
    if (el.profileTabs) el.profileTabs.hidden = true;
    setProfileTab('profile');
    el.profileName.textContent = '@' + name.toLowerCase();
    el.profileMeta.textContent = '';
    el.profileOnline.hidden = true;
    /* Drop the previous viewer's self-only controls until we know whether
       this profile belongs to them. */
    el.profileEdit.hidden = true;
    el.profileLogout.hidden = true;
    el.profileImprove.hidden = true;
    el.profileSeasons.innerHTML = '<p class="ps-empty">Loading…</p>';
    renderDevicesPanel();
    pendingProfileTab = tab === 'devices' || tab === 'settings' ? tab : 'profile';
    loadProfile(name, currentProfileGame);
  }

  function loadProfile(username, gameId) {
    var id = ++profileRequest;
    Account.profile(username, gameId).then(function (data) {
      if (id !== profileRequest) return;
      currentProfile = data.profile;
      currentProfileSelf = !!data.isSelf;
      currentProfileGame = gameId;
      if (window.ProfileUI) window.ProfileUI.render(data.profile, data.isSelf, gameId);
      if (data.isSelf) {
        syncSaveFromUser(data.profile.user);
        if (el.profileTabs) el.profileTabs.hidden = false;
        setProfileTab(pendingProfileTab || 'profile');
      } else if (el.profileTabs) {
        el.profileTabs.hidden = true;
        setProfileTab('profile');
      }
      pendingProfileTab = null;
    }).catch(function () {
      if (id !== profileRequest) return;
      el.profileSeasons.innerHTML = '<p class="ps-empty">Could not load this profile.</p>';
    });
  }

  function closeProfile() {
    profileRequest++;
    pendingProfileTab = null;
    if (profileReturn === 'board') showScreen(el.boardScreen);
    else showScreen(G.state === 'over' ? el.overScreen : G.state === 'intro' ? el.introScreen : null);
    currentProfile = null;
  }

  function wireAvatarUpload() {
    if (!el.avatarInput) return;
    el.avatarInput.addEventListener('change', function () {
      var file = el.avatarInput.files && el.avatarInput.files[0];
      el.avatarInput.value = '';
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        el.avatarHint.textContent = 'Use a PNG, JPEG or WebP image.';
        return;
      }
      compressAvatar(file).then(function (dataUrl) {
        el.avatarHint.textContent = 'Uploading…';
        return Account.updateAvatar(dataUrl).then(function () {
          el.avatarHint.textContent = 'Photo updated.';
          renderAccount();
          if (currentProfile) loadProfile(currentProfile.user.username, currentProfileGame);
        });
      }).catch(function (err) {
        el.avatarHint.textContent = err && err.message ? err.message : 'Could not update the photo.';
      });
    });
  }

  function compressAvatar(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That image could not be decoded.')); };
        img.onload = function () {
          var size = 96;
          var canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          var ctx = canvas.getContext('2d');
          var side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          if (dataUrl.length > 160000) {
            reject(new Error('That photo is too detailed. Try a smaller one.'));
            return;
          }
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  var pendingSubmit = null;

  function submitRun(run, runId) {
    if (!Account || !Account.user()) return;
    var submit = pendingSubmit = Account.submitRun(run).then(function (data) {
      syncSaveFromUser(data.user);
      if (G.runId !== runId || G.state !== 'over') return;
      var r = data.run;
      var rank = rankOf(r.after);
      el.eloBefore.textContent = String(r.before);
      el.eloAfter.textContent = String(r.after);
      el.eloDelta.textContent = (r.delta >= 0 ? '+' : '') + r.delta;
      el.eloDelta.className = 'delta ' + (r.delta >= 0 ? 'up' : 'down');
      el.rankPill.textContent = rank.name;
      el.rankPill.style.color = rank.color;
      if (r.metrics) {
        G.finalMetrics = r.metrics;
        el.finalBpi.textContent = String(r.bpi);
        el.finalTitle.textContent = r.title;
        el.finalTitle.style.color = titleColor(r.title);
        el.finalArchetype.textContent = r.archetype;
        el.overFeedback.textContent = r.metrics.feedback.headline + ' ' + r.metrics.feedback.body;
        el.overNote.textContent = r.metrics.feedback.drill || '';
        if (window.ProfileUI && el.overRadar) {
          el.overRadar.innerHTML = window.ProfileUI.radarSVG(r.metrics.axes, 168);
        }
      }
      refreshMeta();
      loadGlobalCard();
      loadRank();
    }).catch(function (err) {
      if (err && err.status === 401 && Account) Account.refresh();
    }).then(function () {
      if (pendingSubmit === submit) pendingSubmit = null;
    });
  }

  /* ---------- weekly rank ---------- */
  var rankRequest = 0;

  function rankSparkSVG(trend) {
    var points = [];
    for (var i = 0; i < trend.length; i++) {
      if (trend[i] && trend[i].rank != null) points.push(trend[i]);
    }
    if (points.length < 2) return '';
    var w = 100, h = 34, pad = 5;
    var min = points[0].rank, max = points[0].rank;
    for (var j = 1; j < points.length; j++) {
      if (points[j].rank < min) min = points[j].rank;
      if (points[j].rank > max) max = points[j].rank;
    }
    var span = Math.max(1, max - min);
    var step = (w - pad * 2) / (points.length - 1);
    var coords = [];
    for (var k = 0; k < points.length; k++) {
      var x = pad + step * k;
      var y = pad + ((points[k].rank - min) / span) * (h - pad * 2);
      coords.push([x, y]);
    }
    var line = '';
    for (var m = 0; m < coords.length; m++) {
      line += (m ? 'L' : 'M') + coords[m][0].toFixed(1) + ' ' + coords[m][1].toFixed(1) + ' ';
    }
    var last = coords[coords.length - 1];
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="presentation">' +
      '<path d="' + line.trim() + '" fill="none" stroke="#5eead4" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity=".9"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.4" fill="#5eead4"/>' +
      '</svg>';
  }

  function paintRank(card, value, delta, spark, note, data) {
    if (!card) return;
    if (card === el.homeRank && !homeRankEnabled()) { card.hidden = true; return; }
    if (!data || !data.signedIn) { card.hidden = true; return; }
    card.hidden = false;
    if (data.rank == null) {
      value.innerHTML = '\u2014';
      delta.className = 'rank-move';
      delta.textContent = 'UNRANKED THIS WEEK';
      spark.innerHTML = '';
      note.textContent = 'Play one ranked run to enter ' + (data.weekLabel || 'this week') + '.';
      return;
    }
    value.innerHTML = '#' + data.rank + ' <em>/ ' + (data.players || '\u2014') + '</em>';
    if (data.delta == null) {
      delta.className = 'rank-move';
      delta.textContent = 'FIRST WEEK ON THE BOARD';
    } else if (data.delta > 0) {
      delta.className = 'rank-move up';
      delta.textContent = '\u25b2 ' + data.delta + ' THIS WEEK';
    } else if (data.delta < 0) {
      delta.className = 'rank-move down';
      delta.textContent = '\u25bc ' + Math.abs(data.delta) + ' THIS WEEK';
    } else {
      delta.className = 'rank-move';
      delta.textContent = 'NO CHANGE';
    }
    spark.innerHTML = rankSparkSVG(data.trend || []);
    note.textContent = (data.weekLabel || 'THIS WEEK') + ' \u00b7 best BPI \u00b7 ' + (data.players || 0) + ' ranked';
  }

  function loadRank() {
    if (!Account || !Account.user()) {
      if (el.homeRank) el.homeRank.hidden = true;
      if (el.overRank) el.overRank.hidden = true;
      return;
    }
    var request = ++rankRequest;
    Account.rank().then(function (data) {
      if (request !== rankRequest) return;
      paintRank(el.homeRank, el.homeRankValue, el.homeRankDelta, el.homeRankSpark, el.homeRankNote, data);
      paintRank(el.overRank, el.overRankValue, el.overRankDelta, el.overRankSpark, el.overRankNote, data);
    }).catch(function () { /* keep the previous card */ });
  }

  /* ---------- tutorial ---------- */
  var TUTORIAL = [
    {
      title: 'ROUND ONE',
      size: 3,
      stats: [['BOARD', '3 \u00d7 3'], ['CLOCK', '25s'], ['CHURN', '2.5s'], ['CYCLE', '10 reads']],
      body: 'The warm-up. Nine tiles, one target, and enough time to scan the whole board before it changes.',
      points: [
        'Match BOTH the shape and the colour. A shape-only match is still wrong.',
        'Every correct read scores. Ten correct reads clear a cycle and bank a bonus.',
        'A wrong tap costs 1 second and 30 points. The clock does not stop.',
        'If you do not solve it in 2.5s the board churns to a new target and you lose that read.'
      ]
    },
    {
      title: 'ROUND TWO',
      size: 4,
      stats: [['BOARD', '4 \u00d7 4'], ['CLOCK', '15s'], ['CHURN', '2.0s'], ['CYCLE', '8 reads']],
      body: 'Sixteen tiles. The clock drops and the board churns faster, so scanning in a fixed pattern starts to beat hunting randomly.',
      points: [
        'The target still needs shape AND colour, now with more decoys.',
        'Cycle length shrinks to 8 reads, so a clean streak is worth more.',
        'The churn window is 2.0s \u2014 commit on the first confident read.',
        'Five seconds of break follows. Use it to reset your scan, not your focus.'
      ]
    },
    {
      title: 'ROUND THREE',
      size: 5,
      stats: [['BOARD', '5 \u00d7 5'], ['CLOCK', '10s'], ['CHURN', '1.5s'], ['CYCLE', '6 reads']],
      body: 'The pressure round. Twenty-five tiles, a 10 second clock, and a board that turns every 1.5 seconds.',
      points: [
        'You will not see every tile. Read edges first, then sweep inward.',
        'Six correct reads clear a cycle \u2014 short, fast bursts win here.',
        'Wrong taps cost points; in a duel you also sit out the rest of that deal.',
        'In a duel this is where lockstep bites: an opponent solve moves BOTH boards.'
      ]
    },
    {
      title: 'HOW YOU ARE JUDGED',
      size: 3,
      stats: [['BPI', '0 \u2013 1000'], ['AXES', '7'], ['TITLE', '9 tiers'], ['RANK', 'weekly']],
      body: 'Every run produces a Brain Performance Index from your trials, plus a rating change and a weekly leaderboard position.',
      points: [
        'BPI weights speed, search, precision, consistency, updating, resilience and capacity.',
        'Accuracy and reaction time feed the score; misses and churn lower consistency.',
        'Clearing cycles raises your tier and multiplies the points inside a run.',
        'Weekly rank is your best BPI this ISO week, global. Seasons reset monthly.',
        'Titles and archetypes describe how you read, not how smart you are.'
      ]
    }
  ];
  var tutorialPage = 0;
  var tutorialForced = false;
  var tutorialAfter = null;
  var TUTORIAL_KEY = 'tile-rush.tutorial.v1';

  function tutorialDone() {
    try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (e) { return false; }
  }

  function accountTutorialKey(name) {
    return 'tile-rush.tutorial.account.' + String(name || '').toLowerCase();
  }

  function accountTutorialDone(name) {
    try { return localStorage.getItem(accountTutorialKey(name)) === '1'; } catch (e) { return false; }
  }

  function markTutorialDone() {
    try {
      localStorage.setItem(TUTORIAL_KEY, '1');
      var user = Account && Account.user();
      if (user) localStorage.setItem(accountTutorialKey(user.username), '1');
    } catch (e) { /* ignore */ }
  }

  function renderTutorial() {
    var page = TUTORIAL[tutorialPage];
    if (!page || !el.tutorialScreen) return;
    el.tutorialTitle.textContent = page.title;
    el.tutorialBody.textContent = page.body;
    el.tutorialCount.textContent = (tutorialPage + 1) + ' / ' + TUTORIAL.length;

    var cells = '';
    var goal = Math.floor(page.size * page.size / 2);
    for (var i = 0; i < page.size * page.size; i++) {
      cells += '<i' + (i === goal ? ' style="border-color:var(--accent);box-shadow:0 0 0 1px rgba(94,234,212,.45), inset 0 0 12px rgba(94,234,212,.18)"' : '') + '></i>';
    }
    el.tutorialBoard.style.setProperty('--n', String(page.size));
    el.tutorialBoard.innerHTML = cells;

    var stats = '';
    for (var s = 0; s < page.stats.length; s++) {
      stats += '<div class="tutorial-stat"><span>' + page.stats[s][0] + '</span><b>' + page.stats[s][1] + '</b></div>';
    }
    el.tutorialStats.innerHTML = stats;

    var points = '';
    for (var p = 0; p < page.points.length; p++) points += '<li>' + page.points[p] + '</li>';
    el.tutorialPoints.innerHTML = points;

    el.tutorialPrev.textContent = tutorialPage === 0 ? (tutorialForced ? 'BACK' : 'CLOSE') : 'BACK';
    el.tutorialPrev.disabled = tutorialForced && tutorialPage === 0;
    if (el.tutorialClose) el.tutorialClose.hidden = tutorialForced;
    el.tutorialNext.textContent = tutorialPage === TUTORIAL.length - 1 ? 'GOT IT' : 'NEXT';

    var dots = '';
    for (var d = 0; d < TUTORIAL.length; d++) dots += '<i' + (d === tutorialPage ? ' class="active"' : '') + '></i>';
    el.tutorialDots.innerHTML = dots;
  }

  var tutorialReturn = null;

  function openTutorial(page, forced, after) {
    tutorialReturn = el.profileScreen.classList.contains('show') ? el.profileScreen
      : el.boardScreen.classList.contains('show') ? el.boardScreen
      : el.insightsScreen && el.insightsScreen.classList.contains('show') ? el.insightsScreen
      : null;
    tutorialForced = !!forced;
    tutorialAfter = typeof after === 'function' ? after : null;
    tutorialPage = Math.max(0, Math.min(TUTORIAL.length - 1, Number(page) || 0));
    renderTutorial();
    showScreen(el.tutorialScreen);
  }

  function closeTutorial() {
    var after = tutorialAfter;
    var back = tutorialReturn;
    tutorialAfter = null;
    tutorialReturn = null;
    tutorialForced = false;
    if (el.tutorialClose) el.tutorialClose.hidden = false;
    if (after) { after(); return; }
    if (back) showScreen(back);
    else showScreen(G.state === 'over' ? el.overScreen : G.state === 'intro' ? el.introScreen : null);
  }

  function finishTutorial() {
    markTutorialDone();
    closeTutorial();
  }

  function maybeForceTutorial(user) {
    if (el.tutorialScreen && el.tutorialScreen.classList.contains('show')) return;
    if (user) {
      /* New accounts are forced on their first signed-in visit, on any device,
         until they finish the tutorial or bank a run. */
      if (!accountTutorialDone(user.username) && Number(user.games || 0) === 0) {
        openTutorial(0, true);
      }
    } else if (!tutorialDone()) {
      openTutorial(0, true);
    }
  }

  /* ---------- boot ---------- */
  function buildGrid(size) {
    G.size = size;
    tiles = [];
    el.grid.innerHTML = '';
    el.grid.style.setProperty('--n', String(size));
    el.grid.dataset.n = String(size);
    var count = size * size;
    for (var i = 0; i < count; i++) {
      var d = document.createElement('div');
      d.className = 'tile empty';
      d.dataset.index = String(i);
      d.setAttribute('role', 'button');
      d.setAttribute('tabindex', '-1');
      d.setAttribute('aria-label', 'Tile ' + (i + 1) + ', empty');
      el.grid.appendChild(d);
      tiles.push(d);
    }
  }

  document.body.classList.toggle('no-motion', !SAVE.settings.motion);
  TS.setTheme(SAVE.settings.theme, 'preview');
  var params = new URLSearchParams(window.location.search);
  if (params.has('still')) document.body.classList.add('still');
  if (params.has('dev')) el.resetBtn.hidden = false;
  refreshMeta();
  showIdle();
  frameHud(now());
  renderDevicesPanel();
  setHomeRank(homeRankEnabled());
  syncSectionNav(el.introScreen);
  /* Guest players must see the tutorial once; new accounts must see it on
     their first signed-in visit even if they already watched as a guest. */

  el.startBtn.addEventListener('click', requestStart);
  el.againBtn.addEventListener('click', requestStart);
  el.homeBtn.addEventListener('click', function () {
    if (window.Duel && Duel.active && Duel.active()) { Duel.leave(); return; }
    toMenu();
  });
  el.overBoardBtn.addEventListener('click', function () { openBoard('bpi'); });
  if (window.location.search) el.overInsightsBtn.href = 'insights.html' + window.location.search;
  // Leaving mid-submit would cancel the request, so let the run save first.
  el.overInsightsBtn.addEventListener('click', function (e) {
    if (!pendingSubmit) return;
    e.preventDefault();
    var href = el.overInsightsBtn.href;
    el.overInsightsBtn.textContent = 'SAVING…';
    pendingSubmit.then(function () { window.location.href = href; });
  });
  el.muteBtn.addEventListener('click', toggleMute);
  el.musicToggle.addEventListener('click', toggleMute);
  el.motionToggle.addEventListener('click', toggleMotion);
  if (el.themeChoice) {
    el.themeChoice.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-theme]') : null;
      if (btn) setSymbolTheme(btn.getAttribute('data-theme'));
    });
  }
  el.resetBtn.addEventListener('click', function () {
    if (!window.confirm('Reset your local rating, best score and adaptive history? (Your account is not affected.)')) return;
    SAVE = defaultSave();
    persist();
    refreshMeta();
    showIdle();
  });

  el.accountBtn.addEventListener('click', function () {
    if (signedIn()) openProfile(Account.user().username);
    else openAuth(false);
  });
  el.introBoardBtn.addEventListener('click', function () { openBoard(); });
  if (el.introInsightsBtn) el.introInsightsBtn.addEventListener('click', openInsights);
  if (el.sectionBar) {
    el.sectionBar.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-section]') : null;
      if (!btn) return;
      goSection(btn.getAttribute('data-section'));
    });
  }
  if (el.profileTabs) {
    el.profileTabs.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-ptab]') : null;
      if (!btn) return;
      setProfileTab(btn.getAttribute('data-ptab'));
    });
  }
  if (el.settingsRankToggle) {
    el.settingsRankToggle.addEventListener('click', function () { setHomeRank(!homeRankEnabled()); });
  }
  if (el.settingsTutorialBtn) el.settingsTutorialBtn.addEventListener('click', function () { openTutorial(0); });
  if (el.settingsDevicesBtn) el.settingsDevicesBtn.addEventListener('click', function () { setProfileTab('devices'); });
  if (el.settingsLogoutBtn) el.settingsLogoutBtn.addEventListener('click', function () { el.profileLogout.click(); });
  if (el.emoteSaveBtn) el.emoteSaveBtn.addEventListener('click', saveEmoteEditor);
  if (el.profileInsightsBtn) el.profileInsightsBtn.addEventListener('click', openInsights);
  if (el.insightsClose) el.insightsClose.addEventListener('click', closeInsights);
  if (el.insightsConnectBtn) el.insightsConnectBtn.addEventListener('click', function () {
    openProfile(Account && Account.user() ? Account.user().username : null, 'tile-rush', 'devices');
  });
  if (el.insightsManageBtn) el.insightsManageBtn.addEventListener('click', function () {
    openProfile(Account && Account.user() ? Account.user().username : null, 'tile-rush', 'devices');
  });
  if (el.insightsProfileBtn) el.insightsProfileBtn.addEventListener('click', function () {
    openProfile(Account && Account.user() ? Account.user().username : null);
  });
  var deviceButtons = document.querySelectorAll('[data-device-toggle]');
  for (var db = 0; db < deviceButtons.length; db++) {
    deviceButtons[db].addEventListener('click', function () {
      toggleDevice(this.getAttribute('data-device-toggle'));
    });
  }
  el.tutorialBtn.addEventListener('click', function () { openTutorial(0); });
  el.tutorialClose.addEventListener('click', closeTutorial);
  el.tutorialPrev.addEventListener('click', function () {
    if (tutorialPage === 0) {
      if (!tutorialForced) closeTutorial();
    } else { tutorialPage -= 1; renderTutorial(); }
  });
  el.tutorialNext.addEventListener('click', function () {
    if (tutorialPage === TUTORIAL.length - 1) finishTutorial();
    else { tutorialPage += 1; renderTutorial(); }
  });
  el.introProfileBtn.addEventListener('click', function () {
    if (Account && Account.user()) openProfile(Account.user().username);
    else openAuth(false);
  });
  el.panelBoardBtn.addEventListener('click', function () { openBoard('bpi'); });
  el.authClose.addEventListener('click', closeAuth);
  el.boardClose.addEventListener('click', closeBoard);
  el.profileClose.addEventListener('click', closeProfile);
  el.profileBoardBtn.addEventListener('click', function () {
    closeProfile();
    openBoard(boardBy);
  });
  el.profileLogout.addEventListener('click', function () {
    if (!Account) return;
    Account.logout().then(function () {
      profileReturn = G.state === 'over' ? 'over' : 'intro';
      closeProfile();
      renderAccount();
      refreshMeta();
      showIdle();
      loadGlobalCard();
      loadRank();
    }).catch(function () { /* ignore */ });
  });
  el.avatarBtn.addEventListener('click', function () { el.avatarInput.click(); });
  el.profileGameSelect.addEventListener('change', function () {
    if (!currentProfile) return;
    loadProfile(currentProfile.user.username, el.profileGameSelect.value);
  });
  wireAvatarUpload();

  el.tabLogin.addEventListener('click', function () { setAuthMode('login'); });
  el.tabRegister.addEventListener('click', function () { setAuthMode('register'); });
  el.authForm.addEventListener('submit', submitAuth);
  el.authGuest.addEventListener('click', function () {
    var shouldStart = pendingStart;
    guestMode = true;
    pendingStart = false;
    closeAuth();
    if (!tutorialDone()) {
      openTutorial(0, true, function () { if (shouldStart) startRun(); });
      return;
    }
    if (shouldStart) startRun();
  });

  el.boardScopes.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-scope]');
    if (!btn) return;
    boardScope = btn.getAttribute('data-scope');
    loadBoard();
  });
  el.boardPeriods.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-period]');
    if (!btn) return;
    boardPeriod = btn.getAttribute('data-period');
    loadBoard();
  });
  el.boardMetrics.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-by]');
    if (!btn) return;
    boardBy = btn.getAttribute('data-by');
    loadBoard();
  });
  el.boardList.addEventListener('click', function (e) {
    var row = e.target.closest('.board-row');
    if (!row) return;
    openProfile(row.getAttribute('data-user'));
  });


  if (Account) {
    Account.onChange(function (user) {
      renderAccount();
      if (user) {
        syncSaveFromUser(user);
        refreshMeta();
      }
      loadGlobalCard();
      loadRank();
      maybeForceTutorial(user);
    });
    Account.init();
  } else {
    renderAccount();
  }

  /* ---------- public hooks for the 1v1 layer ---------- */
  window.TileRush = {
    startDuel: function (seed, opponent) {
      G.duel = true;
      G.duelSeed = String(seed || 'duel');
      G.duelOpp = opponent || null;
      G.duelDeal = 0;
      G.duelBoard = -1;
      G.duelLastSent = 0;
      G.duelPending = null;
      G.duelLocked = false;
      startRun();
    },
    isDuel: function () { return G.duel; },
    boardAt: function (seedText, round, index) { return duelBoardAt(seedText, round, index); },
    axes: function () { return G.finalMetrics ? G.finalMetrics.axes : null; },
    applyTheme: function (seed) { TS.setTheme(SAVE.settings.theme, seed); },
    duelAdvance: function (solvedDeal, mine) { duelAdvanceLocal(solvedDeal, !!mine); },
    setScore: function (value) {
      if (!G.duel) return;
      G.score = Math.max(0, Math.round(Number(value) || 0));
      refreshRunHud();
      if (G.state === 'over' && el.finalScore) el.finalScore.textContent = fmt(G.score);
    },
    openAuth: openAuth,
    state: function () {
      return {
        state: G.state,
        round: G.round + 1,
        score: G.score,
        correct: G.correct,
        bpi: G.finalMetrics ? G.finalMetrics.bpi : 0
      };
    },
    toMenu: toMenu
  };

  requestAnimationFrame(loop);

  if (params.has('autostart')) {
    startRun();
  }
})();
