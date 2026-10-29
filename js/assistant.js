/* Insights assistant: a built-in, rule-based helper (no AI, no network calls).
   Explains ring terms in plain words and answers questions about the runs the
   insights page has loaded, using window.Insights.context() from js/insights.js. */
(function () {
  'use strict';

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
    var p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* ---------- plain-language explanations ---------- */
  // `ring` names the field in a day's ring data; `fmt` turns it into words.
  var TERMS = {
    rem: {
      match: /\brem\b|dream/,
      title: 'REM sleep',
      ring: 'rem_sleep_min', fmt: duration,
      text: 'REM is the dreaming stage of sleep. Your brain is very active, sorting memories and practising skills you learned that day. Most REM comes in the second half of the night, so waking up early cuts it first. Adults usually spend about a fifth to a quarter of the night in REM.'
    },
    deep: {
      match: /deep/,
      title: 'Deep sleep',
      ring: 'deep_sleep_min', fmt: duration,
      text: 'Deep sleep is the most physically restful stage. Your heart rate and breathing slow right down and the body does its repair work. Most of it happens in the first few hours of the night. Too little usually leaves you feeling unrefreshed, which can slow your reactions.'
    },
    light: {
      match: /light sleep/,
      title: 'Light sleep',
      ring: 'light_sleep_min', fmt: duration,
      text: 'Light sleep is the in-between stage and makes up roughly half the night. It is completely normal and still useful; you pass through it between deep and REM sleep.'
    },
    hrv: {
      match: /\bhrv\b|variab/,
      title: 'HRV (heart rate variability)',
      ring: 'hrv_avg', fmt: function (v) { return v + ' ms'; },
      text: 'HRV is the tiny change in timing from one heartbeat to the next. Higher than your own usual generally means your body is rested and relaxed. Lower than usual often follows stress, poor sleep, alcohol, a hard workout or getting ill. Only compare it with your own numbers, because it varies a lot between people.'
    },
    rhr: {
      match: /resting|\brhr\b|pulse|heart ?rate/,
      title: 'Resting heart rate',
      ring: 'night_rhr', fmt: function (v) { return v + ' bpm'; },
      text: 'Resting heart rate is how fast your heart beats while you sleep. A few beats above your usual can mean your body is still busy recovering, from stress, a late meal, alcohol, hard exercise or a bug coming on.'
    },
    recovery: {
      match: /recover/,
      title: 'Recovery score',
      ring: 'recovery_index', fmt: function (v) { return v + ' / 100'; },
      text: 'Recovery is Ultrahuman\'s 0–100 score for how ready your body is today. It blends things like HRV, resting heart rate, temperature and last night\'s sleep. Higher is better; a low score is a hint to take it easier.'
    },
    sleep_score: {
      match: /sleep score/,
      title: 'Sleep score',
      ring: 'sleep_score', fmt: function (v) { return v + ' / 100'; },
      text: 'Sleep score rates last night as a whole, from 0 to 100: how long you slept, how much was deep and REM, how restless you were and how regular your timing was.'
    },
    total_sleep: {
      match: /total sleep|how much sleep|hours of sleep|how long .*sleep/,
      title: 'Total sleep',
      ring: 'total_sleep_min', fmt: duration,
      text: 'Total sleep is the time you were actually asleep, not just lying in bed. Most adults need about 7 to 9 hours.'
    },
    efficiency: {
      match: /efficien|restless/,
      title: 'Sleep efficiency',
      ring: 'sleep_efficiency', fmt: function (v) { return v + '%'; },
      text: 'Sleep efficiency is the share of your time in bed that you were actually asleep. Around 85% or more is generally considered good; lower means a restless night.'
    },
    temp: {
      match: /temp|fever/,
      title: 'Temperature deviation',
      ring: 'temp_deviation', fmt: function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + '°C'; },
      text: 'This is how far your skin temperature overnight was from your normal. Small changes are normal. A jump of about half a degree or more can come with strain, a late meal or alcohol, your menstrual cycle, or getting ill.'
    },
    alertness: {
      match: /alert|grogg|inertia|wake up/,
      title: 'Morning alertness',
      ring: 'morning_alertness_min', fmt: function (v) { return v + ' min'; },
      text: 'Morning alertness is how long it took after waking before you were fully alert. Until then you have "sleep inertia", the groggy feeling that also slows your reactions.'
    },
    rt: {
      match: /reaction|\brt\b|millisecond|\bms\b/,
      title: 'Reaction time',
      text: 'Reaction time is how long, in milliseconds, between the target appearing and your tap. Lower is faster; 1000 ms is one second. A difference of 50 to 100 ms is something you can feel in the game.'
    },
    accuracy: {
      match: /accura/,
      title: 'Accuracy',
      text: 'Accuracy is the share of your attempts that were correct taps, rather than tapping the wrong tile or letting the target time out.'
    }
  };

  // Practical tips, keyed like the factors in a day's analysis.
  var TIPS = {
    total_sleep_min: 'Sleep is your biggest lever. A fixed bedtime and 7–9 hours in bed make the most difference.',
    recovery_index: 'On low-recovery days expect slower runs, so treat them as practice rather than record attempts.',
    sleep_score: 'Poorer nights showed up in your runs. Keeping the same bed and wake time every day helps sleep quality.',
    deep_sleep_min: 'Deep sleep happens early in the night. Regular bedtimes and skipping alcohol or heavy meals late in the evening tend to help.',
    rem_sleep_min: 'REM comes mostly near morning, so cutting your sleep short at the end cuts REM first.',
    sleep_efficiency: 'Restless nights: a cool, dark, quiet room and less screen time right before bed can help.',
    hrv_avg: 'Low HRV points to strain such as stress, hard training, alcohol or a cold. Easier days help it bounce back.',
    night_rhr: 'A raised resting heart rate often follows late meals, alcohol or hard workouts. Give those a few hours before bed.',
    morning_alertness_min: 'You take a while to feel alert. Wait a bit after waking before playing; daylight, water or a short walk can speed it up.',
    temp_deviation: 'Your temperature was off your baseline. If you also feel unwell, rest, and see a doctor if it keeps happening.',
    late: 'Late-night runs pulled your average down. Try playing earlier in the evening.',
    groggy: 'Runs right after waking were slower. Give yourself time to wake up properly first.'
  };

  var WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  /* ---------- reading the page's data ---------- */
  function ctx() {
    return (window.Insights && window.Insights.context()) || { data: null, lastPlayed: null, selected: null, mode: 'week' };
  }

  function periodWord(c) { return c.mode === 'month' ? 'month' : 'week'; }

  function needData(c) {
    return c.data && c.data.summary && c.data.summary.runs ? null : {
      p: ['I don\'t have any runs to look at for the ' + periodWord(c) + ' on screen. Sign in, play a few runs, or switch to a week or month where you played.']
    };
  }

  // Which day the question is about: "yesterday", "today", a weekday name, or the one on screen.
  function findDay(q, c) {
    var days = (c.data && c.data.days) || [];
    var byKey = {};
    days.forEach(function (d) { byKey[d.day] = d; });
    var now = new Date();
    if (/yesterday/.test(q)) {
      var y = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      return byKey[y] || (c.lastPlayed && c.lastPlayed.day === y ? c.lastPlayed : { missing: 'yesterday' });
    }
    if (/today/.test(q)) return byKey[dateKey(now)] || { missing: 'today' };
    for (var i = 0; i < WEEKDAY_NAMES.length; i++) {
      if (new RegExp('\\b(' + WEEKDAY_NAMES[i] + '|' + WEEKDAY_NAMES[i].slice(0, 3) + ')\\b').test(q)) {
        var match = days.filter(function (d) { return new Date(d.day + 'T12:00:00').getDay() === i; })[0];
        return match || { missing: WEEKDAY_NAMES[i][0].toUpperCase() + WEEKDAY_NAMES[i].slice(1) + ' in the ' + periodWord(c) + ' on screen' };
      }
    }
    if (/last (day|time|game|run|session)|last played|recent/.test(q)) return c.lastPlayed;
    // Today is still in progress, so its ring numbers are partial; prefer the last full day.
    if (c.selected && c.selected.day === dateKey(now) && c.lastPlayed) return c.lastPlayed;
    return c.selected || c.lastPlayed;
  }

  /* ---------- answers ---------- */
  function explainTerm(key, q, c) {
    var t = TERMS[key];
    var out = { p: [t.text] };
    var d = findDay(q, c);
    if (t.ring && d && !d.missing && d.ring && d.ring[t.ring] != null) {
      var line = 'On ' + dayLabel(d.day) + ' yours was ' + t.fmt(d.ring[t.ring]) + '.';
      var note = (d.analysis.hurt.concat(d.analysis.helped)).filter(function (f) {
        return f.key === t.ring || (key === 'temp' && f.key === 'temp_deviation');
      })[0];
      out.p.push(note ? line + ' ' + note.text : line + ' That was close to your usual, so it probably wasn\'t a big factor that day.');
    }
    out.title = t.title;
    return out;
  }

  function explainDay(q, c) {
    var d = findDay(q, c);
    if (!d) return { p: ['I don\'t have a played day to look at yet. Play a few signed-in runs first.'] };
    if (d.missing) return { p: ['You didn\'t play on ' + d.missing + ', so there\'s nothing to compare. Pick a highlighted day on the calendar and ask again.'] };
    var a = d.analysis;
    var out = { title: dayLabel(d.day), p: [(a.rt_vs_usual < -25 ? 'Nice day: ' : '') + a.headline] };
    if (a.hurt.length) {
      out.p.push(a.rt_vs_usual > 25 ? 'The most likely reasons:' : 'Things that worked against you:');
      out.list = a.hurt.slice(0, 3).map(function (f) { return f.text; });
    } else if (a.rt_vs_usual > 25) {
      out.p.push('Your ring numbers looked normal that day, so it was more likely focus, distraction or just an off day.');
    }
    if (a.helped.length) out.foot = 'On your side: ' + a.helped[0].text;
    return out;
  }

  function adviseChanges(c) {
    var missing = needData(c);
    if (missing) return missing;
    var s = c.data.summary;
    var tips = s.top_hurt.filter(function (f) { return TIPS[f.key]; }).slice(0, 3).map(function (f) {
      return TIPS[f.key] + ' (' + f.days + ' of ' + s.days_played + ' days)';
    });
    var out = { title: 'What to change' };
    if (!tips.length) {
      out.p = ['Nothing in your ring data stood out this ' + periodWord(c) + '. Keep your sleep regular and keep practising: consistency is what moves reaction time.'];
    } else {
      out.p = ['Based on what held you back most this ' + periodWord(c) + ':'];
      out.list = tips;
    }
    var w = c.data.best_window;
    if (w) out.foot = 'You were fastest in the ' + w.label.toLowerCase() + ' (' + windowTime(w) + '), so that\'s a good time for serious runs.';
    return out;
  }

  function windowTime(w) { return pad(w.start_hour) + ':00–' + pad(w.end_hour) + ':00'; }

  function bestTime(c) {
    var missing = needData(c);
    if (missing) return missing;
    var w = c.data.best_window;
    if (!w) return { p: ['There isn\'t a clear best time yet this ' + periodWord(c) + '. Play a few runs at different times of day and I\'ll be able to tell.'] };
    var out = {
      title: 'Best time to play',
      p: ['This ' + periodWord(c) + ' your best time was the ' + w.label.toLowerCase() + ', ' + windowTime(w) + '. You averaged ' + w.avg_rt + ' ms there, ' + w.diff + ' ms faster than your other runs.']
    };
    if (w.reasons.length) {
      out.p.push('Why, based on your ring:');
      out.list = w.reasons;
    } else {
      out.p.push('Nothing in your ring data stands out for that window, so it\'s probably just when you\'re most focused.');
    }
    return out;
  }

  function duringDay(c) {
    var missing = needData(c);
    if (missing) return missing;
    var multi = c.data.days.filter(function (d) { return d.improved != null; });
    if (!multi.length) return { p: ['You only played one run per day this ' + periodWord(c) + ', so I can\'t tell yet whether you warm up during a day.'] };
    var faster = multi.filter(function (d) { return d.improved; }).length;
    var firstAvg = Math.round(multi.reduce(function (a, d) { return a + d.first_rt; }, 0) / multi.length);
    var lastAvg = Math.round(multi.reduce(function (a, d) { return a + d.last_rt; }, 0) / multi.length);
    return {
      title: 'Getting faster during the day',
      p: [
        'On ' + faster + ' of ' + multi.length + ' days with more than one run, your last run was faster than your first.',
        'On average your first run of the day was ' + firstAvg + ' ms and your last ' + lastAvg + ' ms. ' +
          (lastAvg < firstAvg ? 'So warming up helps you: a practice run or two before a serious one is worth it.'
            : 'So you tend to get slower as the day goes on: fatigue or late play is likely catching up with you.')
      ]
    };
  }

  function summary(c) {
    var missing = needData(c);
    if (missing) return missing;
    var s = c.data.summary;
    var word = periodWord(c);
    var out = {
      title: 'Your ' + word,
      p: ['You played ' + s.runs + ' runs over ' + s.days_played + (s.days_played === 1 ? ' day' : ' days') + ', averaging ' + s.avg_rt + ' ms (your usual is ' + s.usual_rt + ' ms).']
    };
    if (s.prev_avg_rt != null) {
      var diff = s.avg_rt - s.prev_avg_rt;
      out.p.push(Math.abs(diff) < 10 ? 'That\'s about the same as last ' + word + '.'
        : 'That\'s ' + Math.abs(diff) + ' ms ' + (diff < 0 ? 'faster' : 'slower') + ' than last ' + word + '.');
    }
    var r = s.ring, u = s.usual_ring;
    if (r.total_sleep_min != null) {
      out.p.push('You slept ' + duration(r.total_sleep_min) + ' a night on average' + (u.total_sleep_min != null ? ' (usual ' + duration(u.total_sleep_min) + ')' : '') + '.');
    }
    if (s.top_hurt.length) out.foot = 'Biggest thing holding you back: ' + s.top_hurt[0].label + ' (' + s.top_hurt[0].days + ' of ' + s.days_played + ' days).';
    return out;
  }

  function help() {
    return {
      p: [
        'Hi! I\'m a simple built-in helper. I can explain the ring terms on this page in plain words and tell you what helped or hurt your runs, using the week or month you have open.',
        'I\'m not an AI and this isn\'t medical advice, so I only understand certain questions. Tap one below or ask things like "why was I slow on Tuesday?" or "what is HRV?".'
      ]
    };
  }

  function fallback() {
    return { p: ['Sorry, I didn\'t catch that. I\'m a simple helper, so I only understand certain questions. Try one of the suggestions below.'] };
  }

  function termIn(q) {
    for (var key in TERMS) if (TERMS[key].match.test(q)) return key;
    return null;
  }

  function answer(question) {
    var q = ' ' + question.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ') + ' ';
    var c = ctx();
    var term = termIn(q);
    var aboutPlay = /slow|fast|perform|bad|worse|off day|what happened|why was i|go wrong|tired/.test(q);

    if (/^\s*(hi|hey|hello|yo|help|what can you)/.test(q)) return help();
    if (/what should i|what can i|how (can|do) i (improve|get better|get faster)|tips?|advice|change|fix|improve/.test(q) && !/during|over the day/.test(q)) return adviseChanges(c);
    if (/best time|what time|time of day|which hour|best hour|when (should|do) i play|when am i/.test(q)) return bestTime(c);
    if (/during the day|over the day|through the day|warm ?up|first run|as the day/.test(q)) return duringDay(c);
    if (term && !aboutPlay) return explainTerm(term, q, c);
    if (aboutPlay || /yesterday|today|last (day|time|game|run|session)|monday|tuesday|wednesday|thursday|friday|saturday|sunday/.test(q)) return explainDay(q, c);
    if (/week|month|overall|summary|how am i|how was|how did i|doing|progress/.test(q)) return summary(c);
    return fallback();
  }

  function suggestions() {
    var c = ctx();
    var list = ['Why was my last day slow?', 'What should I change?', 'When do I play best?', 'How was my ' + periodWord(c) + '?', 'Do I get faster during the day?', 'What is REM sleep?', 'What is HRV?'];
    if (c.selected && c.lastPlayed && c.selected.day !== c.lastPlayed.day) {
      list.splice(1, 0, 'Why was ' + new Date(c.selected.day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }) + ' like that?');
    }
    return list;
  }

  /* ---------- panel ---------- */
  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'as-fab';
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', 'asPanel');
  fab.innerHTML = '<span aria-hidden="true">?</span> Ask about your data';

  var panel = document.createElement('section');
  panel.className = 'as-panel';
  panel.id = 'asPanel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Insights helper');
  panel.innerHTML =
    '<header class="as-head"><div><b>Insights helper</b><span>Built in · explains your numbers in plain words</span></div>' +
    '<button type="button" class="as-close" aria-label="Close helper">×</button></header>' +
    '<div class="as-log" aria-live="polite"></div>' +
    '<div class="as-chips"></div>' +
    '<form class="as-form"><input type="text" maxlength="200" placeholder="Ask about sleep, HRV, your runs…" aria-label="Your question" />' +
    '<button type="submit">Ask</button></form>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var log = panel.querySelector('.as-log');
  var chips = panel.querySelector('.as-chips');
  var form = panel.querySelector('.as-form');
  var input = form.querySelector('input');

  function renderAnswer(a) {
    var html = a.title ? '<b class="as-title">' + esc(a.title) + '</b>' : '';
    (a.p || []).forEach(function (t) { html += '<p>' + esc(t) + '</p>'; });
    if (a.list && a.list.length) html += '<ul>' + a.list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    if (a.foot) html += '<p class="as-foot">' + esc(a.foot) + '</p>';
    return html;
  }

  function push(who, html) {
    var msg = document.createElement('div');
    msg.className = 'as-msg is-' + who;
    msg.innerHTML = html;
    log.appendChild(msg);
    log.scrollTop = log.scrollHeight;
  }

  function renderChips() {
    chips.innerHTML = suggestions().map(function (s) {
      return '<button type="button" data-q="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
  }

  function ask(question) {
    var q = String(question || '').trim();
    if (!q) return;
    push('me', esc(q));
    push('bot', renderAnswer(answer(q)));
    renderChips();
  }

  function open() {
    if (!log.childNodes.length) push('bot', renderAnswer(help()));
    renderChips();
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  function close() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  fab.addEventListener('click', function () { if (panel.hidden) open(); else close(); });
  panel.querySelector('.as-close').addEventListener('click', close);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  chips.addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]');
    if (b) ask(b.getAttribute('data-q'));
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
    input.value = '';
  });

  // "?" buttons next to terms in the day cards.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ask]');
    if (!b || !TERMS[b.getAttribute('data-ask')]) return;
    open();
    ask('What is ' + TERMS[b.getAttribute('data-ask')].title + '?');
  });

  window.InsightsAssistant = { answer: answer };
})();
