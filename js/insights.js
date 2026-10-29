/* Insights page: signed-in runs for one week or month next to Ultrahuman ring metrics.
   Each period is fetched from /api/insights only when it is first shown. */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var base = (params.get('api') || '').replace(/\/$/, '');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function duration(minutes) {
    if (minutes == null) return '—';
    return Math.floor(minutes / 60) + 'h ' + pad(Math.round(minutes % 60)) + 'm';
  }

  function dayLabel(key) {
    var parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric'
    });
  }

  function tile(label, value, unit, note, tone) {
    return '<div class="hm-tile' + (tone ? ' is-' + tone : '') + '">' +
      '<span class="micro">' + esc(label) + '</span>' +
      '<b>' + esc(value == null ? '—' : value) + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</b>' +
      (note ? '<span class="hm-note">' + esc(note) + '</span>' : '') +
      '</div>';
  }

  var statusEl = document.getElementById('insightsStatus');
  var lastDayEl = document.getElementById('lastDay');
  var tabWeek = document.getElementById('tabWeek');
  var tabMonth = document.getElementById('tabMonth');
  var periodTitle = document.getElementById('periodTitle');
  var periodPrev = document.getElementById('periodPrev');
  var periodNext = document.getElementById('periodNext');
  var periodBody = document.getElementById('periodBody');
  var periodTiles = document.getElementById('periodTiles');
  var periodRing = document.getElementById('periodRing');
  var bestWindowEl = document.getElementById('bestWindow');
  var worstWindowEl = document.getElementById('worstWindow');
  var calGrid = document.getElementById('calGrid');
  var insightsDays = document.getElementById('insightsDays');

  /* ---------- dates ---------- */
  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(key) { var p = key.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function minuteLabel(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }

  var TODAY = dateKey(new Date());

  // The week (Mon–Sun) or month containing `anchor`.
  function periodOf(mode, anchor) {
    var from, to;
    if (mode === 'week') {
      from = addDays(anchor, -((anchor.getDay() + 6) % 7));
      to = addDays(from, 6);
    } else {
      from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    }
    return { mode: mode, from: from, to: to, key: mode + ':' + dateKey(from) };
  }

  function shift(period, n) {
    var anchor = period.mode === 'week'
      ? addDays(period.from, 7 * n)
      : new Date(period.from.getFullYear(), period.from.getMonth() + n, 1);
    return periodOf(period.mode, anchor);
  }

  function periodLabel(p) {
    if (p.mode === 'month') return p.from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    var opts = { month: 'short', day: 'numeric' };
    var thisWeek = periodOf('week', new Date()).key === p.key;
    return (thisWeek ? 'This week · ' : '') + p.from.toLocaleDateString(undefined, opts) + ' – ' + p.to.toLocaleDateString(undefined, opts);
  }

  /* ---------- fetching, one period at a time ---------- */
  var cache = {};
  var state = { mode: 'week', period: periodOf('week', new Date()), range: null, selected: null, data: null };

  function request(p, withLast) {
    var url = base + '/api/insights?from=' + dateKey(p.from) + '&to=' + dateKey(p.to) + '&today=' + TODAY + (withLast ? '&last=1' : '');
    return fetch(url, { credentials: 'include' }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) throw new Error('Sign in on the game screen to see your insights.');
        if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ').');
        return data;
      });
    });
  }

  function load(p, withLast) {
    if (!cache[p.key]) {
      cache[p.key] = request(p, withLast).catch(function (err) {
        delete cache[p.key];
        throw err;
      });
    }
    return cache[p.key];
  }

  function show(p) {
    state.period = p;
    periodTitle.textContent = periodLabel(p);
    updateNav();
    statusEl.textContent = 'Loading…';
    statusEl.classList.remove('is-error');
    periodBody.hidden = true;
    load(p, false).then(function (data) {
      if (state.period.key !== p.key) return; // a newer period was picked meanwhile
      state.range = data.range;
      state.data = data;
      updateNav();
      renderPeriod(data);
    }).catch(function (err) {
      if (state.period.key !== p.key) return;
      statusEl.textContent = err.message;
      statusEl.classList.add('is-error');
    });
  }

  function updateNav() {
    var p = state.period;
    var first = state.range && state.range.first_day;
    periodPrev.disabled = !!first && dateKey(addDays(p.from, -1)) < first;
    periodNext.disabled = dateKey(addDays(p.to, 1)) > TODAY;
    periodPrev.setAttribute('aria-label', p.mode === 'week' ? 'Previous week' : 'Previous month');
    periodNext.setAttribute('aria-label', p.mode === 'week' ? 'Next week' : 'Next month');
  }

  /* ---------- period summary ---------- */
  function compareNote(s) {
    var label = state.mode === 'week' ? 'last week' : 'last month';
    if (s.avg_rt == null || s.prev_avg_rt == null) return 'no runs ' + label;
    var diff = s.avg_rt - s.prev_avg_rt;
    if (Math.abs(diff) < 10) return 'same as ' + label;
    return (diff < 0 ? '▲ ' + -diff + 'ms faster' : '▼ ' + diff + 'ms slower') + ' than ' + label;
  }

  function renderPeriod(data) {
    var s = data.summary;
    if (!s.runs) {
      statusEl.textContent = 'No runs this ' + state.mode + '.' + (state.range && state.range.last_day ? ' Use ‹ to look back.' : ' Play a signed-in run to start.');
      insightsDays.innerHTML = '';
      return;
    }
    statusEl.textContent = '';
    periodBody.hidden = false;

    periodTiles.innerHTML =
      tile('RUNS', s.runs, '', s.days_played + (s.days_played === 1 ? ' day played' : ' days played')) +
      tile('AVG RT', s.avg_rt, 'ms', compareNote(s), s.prev_avg_rt != null && s.avg_rt < s.prev_avg_rt - 10 ? 'good' : '') +
      tile('BEST RT', s.best_rt, 'ms', 'usual avg ' + s.usual_rt + 'ms') +
      tile('ACCURACY', Math.round(s.avg_accuracy * 100), '%', 'best score ' + Number(s.best_score).toLocaleString());

    var r = s.ring, u = s.usual_ring;
    var ringBits = [
      ['Sleep', r.total_sleep_min != null ? duration(r.total_sleep_min) : null, u.total_sleep_min != null ? duration(u.total_sleep_min) : null],
      ['Recovery', r.recovery_index, u.recovery_index],
      ['HRV', r.hrv_avg != null ? r.hrv_avg + 'ms' : null, u.hrv_avg != null ? u.hrv_avg + 'ms' : null],
      ['Resting HR', r.night_rhr != null ? r.night_rhr + 'bpm' : null, u.night_rhr != null ? u.night_rhr + 'bpm' : null]
    ].filter(function (b) { return b[1] != null; });
    periodRing.innerHTML = ringBits.length
      ? '<span class="micro">RING AVERAGE</span>' + ringBits.map(function (b) {
          return '<span>' + esc(b[0]) + ' <b>' + esc(b[1]) + '</b>' + (b[2] != null ? ' <em>usual ' + esc(b[2]) + '</em>' : '') + '</span>';
        }).join('')
      : '';

    bestWindowEl.innerHTML = renderWindow(data.best_window, 'best');
    worstWindowEl.innerHTML = renderWindow(data.worst_window, 'worst');

    var byDay = {};
    data.days.forEach(function (d) { byDay[d.day] = d; });
    state.byDay = byDay;
    var keep = state.selected && byDay[state.selected];
    state.selected = keep ? state.selected : data.days[0].day;
    renderGrid();
    renderSelected();
  }

  // One window of the day and why it worked, from data.best_window.
  // One window of the day and why it went well or badly, from data.best_window / worst_window.
  var WINDOW_TEXT = {
    best: {
      empty: 'Play at a few different times of day and this will show when you\'re sharpest, and why.',
      why: 'WHY IT WORKED', diff: 'faster', tone: 'good', factors: 'help',
      none: 'Nothing in your ring data stands out for this window, so it\'s likely just when you\'re most focused.'
    },
    worst: {
      empty: 'Play at a few different times of day and this will show when you\'re slowest, and why.',
      why: 'WHAT SLOWED YOU DOWN', diff: 'slower', tone: 'bad', factors: 'hurt',
      none: 'Your sleep, heart rate and activity looked normal for these runs, so it\'s more likely focus or distraction.'
    }
  };

  function renderWindow(w, kind) {
    var t = WINDOW_TEXT[kind];
    if (!w) return '<p class="hm-empty">' + esc(t.empty) + '</p>';
    var context = [];
    if (w.awake) context.push('awake about ' + w.awake);
    if (w.hr_at_play != null) context.push('heart rate around ' + w.hr_at_play + ' bpm');
    var why = w.reasons.length
      ? '<span class="micro">' + t.why + '</span><ul>' + w.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>'
      : '<p class="hm-note">' + esc(t.none) +
        (context.length ? ' When you played then you were ' + esc(context.join(', ')) + '.' : '') + '</p>';
    return '<div class="in-window is-' + kind + '">' +
      '<b class="in-window-name">' + esc(w.label) + '</b>' +
      '<span class="in-window-time">' + pad(w.start_hour) + ':00 – ' + pad(w.end_hour) + ':00</span>' +
      '</div>' +
      '<p class="in-window-stat"><b>' + esc(w.avg_rt) + ' ms</b> average over ' + w.runs + ' runs, ' +
        '<b class="is-' + t.tone + '">' + esc(w.diff) + ' ms ' + t.diff + '</b> than your other runs (' + esc(w.other_rt) + ' ms).</p>' +
      '<div class="in-factors is-' + t.factors + '">' + why + '</div>';
  }

  /* ---------- week strip / month calendar ---------- */
  // 0 = 200ms+ slower than usual, 1 = 200ms+ faster; 0.5 is your usual pace.
  function heat(rt) {
    var usual = state.data.summary.usual_rt || rt;
    return Math.max(0, Math.min(1, 0.5 + (usual - rt) / 400));
  }

  function cell(date) {
    var key = dateKey(date);
    var d = state.byDay[key];
    var n = date.getDate();
    var cls = 'in-cal-cell' + (key === TODAY ? ' is-today' : '') + (key === state.selected ? ' is-selected' : '');
    if (!d) return '<span class="' + cls + ' is-empty"><span class="in-cal-n">' + n + '</span></span>';
    var arrow = d.improved == null ? '' : d.improved ? '<em class="is-up">▲</em>' : '<em class="is-down">▼</em>';
    var label = dayLabel(key) + ': ' + d.runs + (d.runs === 1 ? ' run' : ' runs') + ', average ' + d.avg_rt + ' milliseconds' +
      (d.improved == null ? '' : d.improved ? ', got faster' : ', got slower');
    return '<button type="button" class="' + cls + '" data-day="' + key + '" style="--heat:' + heat(d.avg_rt).toFixed(2) + '"' +
      ' aria-label="' + esc(label) + '" aria-pressed="' + (key === state.selected) + '">' +
      '<span class="in-cal-n">' + n + arrow + '</span>' +
      '<b>' + esc(d.avg_rt) + '<small>ms</small></b>' +
      '</button>';
  }

  function renderGrid() {
    var p = state.period;
    var html = WEEKDAYS.map(function (w) { return '<span class="in-cal-wd">' + w + '</span>'; }).join('');
    var lead = (p.from.getDay() + 6) % 7;
    for (var i = 0; i < lead; i++) html += '<span class="in-cal-cell is-pad"></span>';
    for (var d = p.from; d <= p.to; d = addDays(d, 1)) html += cell(d);
    calGrid.innerHTML = html;
  }

  /* ---------- one day ---------- */
  function trendBadge(day) {
    if (day.improved == null) return '<span class="in-badge">1 RUN</span>';
    if (day.last_rt === day.first_rt) return '<span class="in-badge">NO CHANGE</span>';
    var change = Math.abs(day.last_rt - day.first_rt) + 'ms';
    return day.improved
      ? '<span class="in-badge is-up">FASTER ' + esc(change) + '</span>'
      : '<span class="in-badge is-down">SLOWER ' + esc(change) + '</span>';
  }

  function ringLine(r) {
    if (!r) return '<p class="hm-empty">No ring data for this day.</p>';
    var u = (state.data && state.data.summary && state.data.summary.usual_ring) || {};
    // [label, value, unit, helper term, usual value]
    var bits = [
      ['Recovery', r.recovery_index, '', 'recovery', u.recovery_index],
      ['Sleep score', r.sleep_score, '', 'sleep_score', u.sleep_score],
      ['Slept', r.total_sleep_min != null ? duration(r.total_sleep_min) : null, '', 'total_sleep', u.total_sleep_min != null ? duration(u.total_sleep_min) : null],
      ['HRV', r.hrv_avg, 'ms', 'hrv', u.hrv_avg],
      ['Resting HR', r.night_rhr, 'bpm', 'rhr', u.night_rhr],
      ['Deep sleep', r.deep_sleep_min != null ? duration(r.deep_sleep_min) : null, '', 'deep', null],
      ['REM sleep', r.rem_sleep_min != null ? duration(r.rem_sleep_min) : null, '', 'rem', null],
      ['Steps', r.steps != null ? r.steps.toLocaleString() : null, '', '', null]
    ].filter(function (b) { return b[1] != null; });
    if (!bits.length) return '<p class="hm-empty">Ring has not processed this day yet.</p>';
    return '<div class="hm-grid in-ring-grid">' + bits.map(function (b) {
      var ask = b[3] ? '<button type="button" class="in-ask" data-ask="' + b[3] + '" aria-label="What is ' + esc(b[0]) + '?">?</button>' : '';
      return '<div class="hm-tile">' +
        '<span class="micro">' + esc(b[0].toUpperCase()) + ask + '</span>' +
        '<b>' + esc(b[1]) + (b[2] ? '<small>' + esc(b[2]) + '</small>' : '') + '</b>' +
        (b[4] != null ? '<span class="hm-note">usual ' + esc(b[4]) + esc(b[2] ? ' ' + b[2] : '') + '</span>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function factorList(title, items, tone) {
    if (!items.length) return '';
    return '<div class="in-factors is-' + tone + '"><span class="micro">' + esc(title) + '</span><ul>' +
      items.map(function (f) { return '<li>' + esc(f.text) + '</li>'; }).join('') + '</ul></div>';
  }

  function renderInsightDay(d) {
    var span = d.runs > 1 ? minuteLabel(d.first_minute) + '–' + minuteLabel(d.last_minute) : minuteLabel(d.first_minute);
    return '<article class="in-day">' +
      '<header><h3>' + esc(dayLabel(d.day)) + '</h3>' + trendBadge(d) + '</header>' +
      '<div class="hm-grid">' +
        tile('RUNS', d.runs, '', span) +
        tile('AVG RT', d.avg_rt, 'ms', d.runs > 1 ? d.first_rt + ' → ' + d.last_rt + 'ms' : '') +
        tile('BEST RT', d.best_rt, 'ms', '') +
        tile('ACCURACY', Math.round(d.avg_accuracy * 100), '%', 'best score ' + Number(d.best_score).toLocaleString()) +
      '</div>' +
      '<p class="in-headline">' + esc(d.analysis.headline) + '</p>' +
      ringLine(d.ring) +
      '<div class="in-analysis">' +
        factorList('WORKING AGAINST YOU', d.analysis.hurt, 'hurt') +
        factorList('ON YOUR SIDE', d.analysis.helped, 'help') +
      '</div>' +
      '</article>';
  }

  function renderSelected() {
    var d = state.byDay && state.byDay[state.selected];
    insightsDays.innerHTML = d ? renderInsightDay(d) : '';
  }

  // Most recent played day before today: what slowed you down, in plain sentences.
  function renderLastDay(d) {
    if (!d) return;
    var a = d.analysis;
    var tone = a.rt_vs_usual > 25 ? 'slow' : a.rt_vs_usual < -25 ? 'fast' : 'even';
    lastDayEl.className = 'in-callout is-' + tone;
    lastDayEl.innerHTML = '<span class="micro">LAST PLAYED · ' + esc(dayLabel(d.day).toUpperCase()) + '</span>' +
      '<p class="in-callout-head">' + esc(a.headline) + '</p>' +
      (a.hurt.length ? factorList('WHAT HELD YOU BACK', a.hurt, 'hurt') : '<p class="hm-empty">Nothing in your ring data worked against you that day.</p>') +
      factorList('WHAT HELPED', a.helped, 'help') +
      '<button type="button" class="in-callout-open">Open day →</button>';
    lastDayEl.hidden = false;
    lastDayEl.querySelector('.in-callout-open').addEventListener('click', function () {
      state.selected = d.day;
      var p = periodOf(state.mode, parseKey(d.day));
      if (p.key === state.period.key) { renderGrid(); renderSelected(); } else show(p);
      insightsDays.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------- controls ---------- */
  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    tabWeek.setAttribute('aria-selected', String(mode === 'week'));
    tabMonth.setAttribute('aria-selected', String(mode === 'month'));
    // Stay around the day being looked at.
    show(periodOf(mode, state.selected ? parseKey(state.selected) : new Date()));
  }

  tabWeek.addEventListener('click', function () { setMode('week'); });
  tabMonth.addEventListener('click', function () { setMode('month'); });
  periodPrev.addEventListener('click', function () { show(shift(state.period, -1)); });
  periodNext.addEventListener('click', function () { show(shift(state.period, 1)); });
  calGrid.addEventListener('click', function (e) {
    var target = e.target.closest('[data-day]');
    if (!target) return;
    state.selected = target.getAttribute('data-day');
    renderGrid();
    renderSelected();
  });

  // First paint: this week, plus the last-played callout in the same request.
  // Read-only view of what the page is showing, for js/assistant.js.
  window.Insights = {
    context: function () {
      return {
        mode: state.mode,
        data: state.data,
        lastPlayed: state.lastPlayed || null,
        selected: (state.byDay && state.byDay[state.selected]) || null
      };
    }
  };

  periodTitle.textContent = periodLabel(state.period);
  updateNav();
  load(state.period, true).then(function (data) {
    state.lastPlayed = data.last_played;
    renderLastDay(data.last_played);
  }).catch(function () { /* shown by show() */ });
  show(state.period);
})();
