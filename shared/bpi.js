/* TILE RUSH — Brain Performance Index (BPI).
 * Shared by the browser and the server so the displayed profile and the
 * authoritative profile are computed with exactly the same rules.
 *
 * BPI is a 0–1000 performance fingerprint, not an IQ or clinical measure.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round(v) { return Math.round(v); }

  var AXES = [
    { key: 'speed',       label: 'SPEED',       short: 'SPD', weight: 0.16, desc: 'how fast you commit to a target' },
    { key: 'search',      label: 'SEARCH',      short: 'SRCH', weight: 0.16, desc: 'how well you scan past close decoys' },
    { key: 'precision',   label: 'PRECISION',   short: 'PREC', weight: 0.20, desc: 'how often the first read is right' },
    { key: 'consistency', label: 'CONSISTENCY', short: 'CONS', weight: 0.14, desc: 'how steady your timing stays' },
    { key: 'updating',    label: 'UPDATING',    short: 'UPD', weight: 0.12, desc: 'how cheaply you re-bind a changed target' },
    { key: 'resilience',  label: 'RESILIENCE',  short: 'RES', weight: 0.10, desc: 'how quickly you recover from a miss' },
    { key: 'capacity',    label: 'CAPACITY',    short: 'CAP', weight: 0.12, desc: 'how deep into the difficulty curve you get' }
  ];

  var AXIS_BY_KEY = {};
  AXES.forEach(function (a) { AXIS_BY_KEY[a.key] = a; });

  var TITLES = [
    { min: 930, name: 'NOVA',         color: '#c084fc', note: 'top of the board',
      desc: 'The top band. Fast, precise and consistent across every board size.' },
    { min: 850, name: 'MAESTRO',      color: '#fb7185', note: 'reads the whole board at once',
      desc: 'Near-elite speed with very few wrong taps. The whole board is one pattern.' },
    { min: 760, name: 'TACTICIAN',    color: '#fb923c', note: 'turns pressure into points',
      desc: 'Strong late-round capacity and recovery. Pressure makes the read sharper.' },
    { min: 660, name: 'SHARPSHOOTER', color: '#fbbf24', note: 'fast and hard to rattle',
      desc: 'High speed and precision with steady timing. Fast, accurate and difficult to tilt.' },
    { min: 560, name: 'TRACKER',      color: '#a3e635', note: 'reliable under churn',
      desc: 'Handles target changes without losing the read. Reliable when the deck turns.' },
    { min: 440, name: 'HUNTER',       color: '#34d399', note: 'finding the target more often',
      desc: 'The scan is starting to click. Accuracy is climbing and fewer reads are wasted.' },
    { min: 320, name: 'SCOUT',        color: '#38bdf8', note: 'building the scan',
      desc: 'Accuracy is improving faster than speed. The basic scan pattern is forming.' },
    { min: 200, name: 'SPARK',        color: '#94a3b8', note: 'the reflex is waking up',
      desc: 'Early runs are starting to look repeatable. The reflex is waking up.' },
    { min: 0,   name: 'DRIFTER',      color: '#64748b', note: 'first runs, no read yet',
      desc: 'First runs, no read yet. Play a few scored runs to establish a fingerprint.' }
  ];

  var ARCHETYPES = {
    SCANNER: 'Finds the target fast and usually in the right neighbourhood, but fires before both features line up.',
    SNIPER: 'Deliberate and accurate. Rarely wrong, and hard to speed up without losing the read.',
    METRONOME: 'Timing barely moves. The score comes from never falling apart.',
    GRINDER: 'Wins by surviving difficulty rather than by raw speed. Strong late-round profile.',
    SWITCHBACK: 'Adapts to a changed target quickly, but the timing can swing while doing it.',
    'ALL-ROUNDER': 'No single leak. The next gain comes from raising the floor, not the ceiling.'
  };

  // Rules are checked top to bottom; the first match wins.
  var ARCHETYPE_RULES = {
    SCANNER: 'Speed ≥ 60 · Search ≥ 60 · Precision < 52',
    SNIPER: 'Precision ≥ 62 · Consistency ≥ 58',
    METRONOME: 'Consistency ≥ 62 · Resilience ≥ 55',
    GRINDER: 'Capacity ≥ 60 · Resilience ≥ 50',
    SWITCHBACK: 'Updating ≥ 58 · Consistency < 52',
    'ALL-ROUNDER': 'None of the specialist rules match'
  };

  function titleFor(bpi) {
    var n = Number(bpi) || 0;
    for (var i = 0; i < TITLES.length; i++) if (n >= TITLES[i].min) return TITLES[i];
    return TITLES[TITLES.length - 1];
  }

  function archetypeFor(axes) {
    if (!axes) return 'ALL-ROUNDER';
    if (axes.speed >= 60 && axes.search >= 60 && axes.precision < 52) return 'SCANNER';
    if (axes.precision >= 62 && axes.consistency >= 58) return 'SNIPER';
    if (axes.consistency >= 62 && axes.resilience >= 55) return 'METRONOME';
    if (axes.capacity >= 60 && axes.resilience >= 50) return 'GRINDER';
    if (axes.updating >= 58 && axes.consistency < 52) return 'SWITCHBACK';
    return 'ALL-ROUNDER';
  }

  function median(values) {
    if (!values.length) return 0;
    var a = values.slice().sort(function (x, y) { return x - y; });
    var mid = a.length >> 1;
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    var a = values.slice().sort(function (x, y) { return x - y; });
    var pos = (a.length - 1) * clamp(q, 0, 1);
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (pos - lo);
  }

  function meanAbsDev(values, centre) {
    if (!values.length) return 0;
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += Math.abs(values[i] - centre);
    return sum / values.length;
  }

  function wilsonLower(successes, total) {
    if (!total) return 0;
    var z = 1.96, p = successes / total, n = total;
    var denom = 1 + z * z / n;
    var centre = p + z * z / (2 * n);
    var spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n);
    return clamp((centre - spread) / denom, 0, 1);
  }

  function slope(points) {
    var n = points.length;
    if (n < 10) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) {
      sx += points[i][0]; sy += points[i][1];
      sxx += points[i][0] * points[i][0];
      sxy += points[i][0] * points[i][1];
    }
    var varX = sxx - (sx * sx) / n;
    if (varX < 0.01) return null;
    return (sxy - (sx * sy) / n) / varX;
  }

  function cleanTrials(input) {
    var out = [];
    if (!Array.isArray(input)) return out;
    for (var i = 0; i < input.length && i < 400; i++) {
      var t = input[i];
      if (!t || typeof t !== 'object') continue;
      var rt = Number(t.rt);
      if (!Number.isFinite(rt) || rt < 50 || rt > 15000) continue;
      out.push({
        rt: rt,
        correct: !!t.correct,
        near: clamp(Number(t.near) || 0, 0, 1),
        colorChanged: !!t.colorChanged,
        afterWrong: !!t.afterWrong,
        round: Number(t.round) || 0,
        size: Number(t.size) || 0,
        tier: Number(t.tier) || 0
      });
    }
    return out;
  }

  function compute(input) {
    input = input || {};
    var trials = cleanTrials(input.trials);
    var misses = clamp(Math.round(Number(input.misses) || 0), 0, 400);
    var cycles = clamp(Math.round(Number(input.cycles) || 0), 0, 100);
    var maxTier = clamp(Math.round(Number(input.maxTier) || 0), 0, 100);

    var correct = trials.filter(function (t) { return t.correct; });
    var wrong = trials.filter(function (t) { return !t.correct; });
    var attempts = correct.length + wrong.length + misses;
    var accuracy = attempts ? correct.length / attempts : 0;
    var rts = correct.map(function (t) { return t.rt; });
    var medRt = median(rts) || 0;
    var p10 = quantile(rts, 0.1);
    var p90 = quantile(rts, 0.9);
    var mad = meanAbsDev(rts, medRt);
    var cv = medRt ? mad / medRt : 0;
    var missRate = attempts ? misses / attempts : 0;

    var speed = medRt ? 100 * clamp((1400 - medRt) / 1000, 0, 1) : 0;

    var beta = slope(correct.map(function (t) { return [t.near, Math.log(t.rt)]; }));
    var search = beta === null ? 50 : 100 * clamp((1.15 - beta) / 0.85, 0, 1);

    var precision = 100 * wilsonLower(correct.length, attempts);

    var cvScore = 100 * clamp(1 - (cv - 0.12) / 0.5, 0, 1);
    var consistency = 0.7 * cvScore + 0.3 * (100 * (1 - missRate));

    var changed = correct.filter(function (t) { return t.colorChanged; }).map(function (t) { return t.rt; });
    var same = correct.filter(function (t) { return !t.colorChanged; }).map(function (t) { return t.rt; });
    var updating = 50;
    var colorCost = null;
    if (changed.length >= 5 && same.length >= 5) {
      var cm = median(changed), sm = median(same);
      colorCost = (cm - sm) / Math.max(120, sm);
      updating = 100 * clamp(1 - colorCost / 0.35, 0, 1);
    }

    var afterWrong = trials.filter(function (t) { return t.afterWrong; });
    var afterCorrect = afterWrong.filter(function (t) { return t.correct; });
    var resilience = 72;
    var postErrorAcc = null;
    if (afterWrong.length >= 3) {
      postErrorAcc = afterCorrect.length / afterWrong.length;
      var afterRt = median(afterCorrect.map(function (t) { return t.rt; })) || medRt;
      var rtPenalty = medRt ? clamp((afterRt - medRt) / medRt / 0.5, 0, 1) : 0;
      resilience = 100 * clamp(0.6 * postErrorAcc + 0.4 * (1 - rtPenalty), 0, 1);
    }

    var capacity = 100 * clamp(
      0.6 * clamp(maxTier / 12, 0, 1) +
      0.4 * clamp(cycles / 3, 0, 1),
      0, 1
    );

    var axes = {
      speed: round(speed),
      search: round(search),
      precision: round(precision),
      consistency: round(consistency),
      updating: round(updating),
      resilience: round(resilience),
      capacity: round(capacity)
    };

    var bpi = round(AXES.reduce(function (sum, a) {
      return sum + axes[a.key] * a.weight;
    }, 0) * 10);

    var attemptsForConfidence = attempts;
    var confidence = attemptsForConfidence >= 60 ? 'stable'
      : attemptsForConfidence >= 25 ? 'developing' : 'provisional';

    var stats = {
      attempts: attempts,
      correct: correct.length,
      wrong: wrong.length,
      misses: misses,
      accuracy: accuracy,
      medianRt: round(medRt),
      p10Rt: round(p10),
      p90Rt: round(p90),
      rtSum: Math.round(rts.reduce(function (sum, value) { return sum + value; }, 0)),
      rtCount: rts.length,
      cv: Math.round(cv * 100) / 100,
      missRate: Math.round(missRate * 100) / 100,
      beta: beta === null ? null : Math.round(beta * 100) / 100,
      colorCost: colorCost === null ? null : Math.round(colorCost * 100) / 100,
      postErrorAcc: postErrorAcc === null ? null : Math.round(postErrorAcc * 100) / 100,
      maxTier: maxTier,
      cycles: cycles,
      score: Math.max(0, Math.round(Number(input.score) || 0))
    };

    return {
      axes: axes,
      bpi: bpi,
      title: titleFor(bpi).name,
      archetype: archetypeFor(axes),
      confidence: confidence,
      stats: stats,
      feedback: feedbackFor(axes, stats)
    };
  }

  function pct(n) { return Math.round(n * 100) + '%'; }

  function feedbackFor(axes, stats) {
    var weakest = AXES.slice().sort(function (a, b) { return axes[a.key] - axes[b.key]; })[0];
    var strongest = AXES.slice().sort(function (a, b) { return axes[b.key] - axes[a.key]; })[0];
    var low = axes[weakest.key];
    var map = {
      speed: {
        headline: 'You are reading the board late.',
        body: 'Your median commit is ' + stats.medianRt + 'ms. That is time spent deciding, not moving. Sweep the whole grid once before the first tap.',
        drill: 'Next run: one full left-to-right scan, then commit.'
      },
      search: {
        headline: 'Close decoys are pulling you in.',
        body: stats.beta === null
          ? 'There are not enough close-decoy trials yet to read your search slope. Keep playing; the read will sharpen.'
          : 'Your reaction climbs ' + Math.round(stats.beta * 100) + '% for every step closer the decoys get. You are checking tiles one by one instead of scanning by feature.',
        drill: 'Next run: lock the colour first, then confirm the shape.'
      },
      precision: {
        headline: 'Your hands are ahead of your eyes.',
        body: 'You are correct on ' + pct(stats.accuracy) + ' of attempts, with ' + stats.wrong + ' wrong taps and ' + stats.misses + ' timeouts. The leak is commitment, not speed.',
        drill: 'Next run: add one beat before the first tap after a new target.'
      },
      consistency: {
        headline: 'Your timing swings too much.',
        body: 'Your reaction spread runs from ' + stats.p10Rt + 'ms to ' + stats.p90Rt + 'ms. The fast taps are fine; the slow tail is where cycles die.',
        drill: 'Next run: same pace every board, no hero taps.'
      },
      updating: {
        headline: 'A changed target costs you.',
        body: stats.colorCost === null
          ? 'Not enough colour-change trials yet to separate re-binding cost from general speed.'
          : 'When the target colour changes you lose about ' + Math.round(stats.colorCost * 100) + '% reaction time. You are still holding the old colour.',
        drill: 'Next run: say the colour in your head before you scan.'
      },
      resilience: {
        headline: 'One mistake snowballs.',
        body: stats.postErrorAcc === null
          ? 'You have not made enough errors to read recovery yet. That is not a bad thing.'
          : 'After a wrong tap you convert ' + pct(stats.postErrorAcc) + ' of the next attempts. The board is still there; reset, do not rush.',
        drill: 'Next run: after a wrong tap, take one deliberate breath.'
      },
      capacity: {
        headline: 'You are not reaching the deep rounds.',
        body: 'You reached tier ' + stats.maxTier + ' and cleared ' + stats.cycles + ' cycles. The score is capped by how long you survive, not by peak speed.',
        drill: 'Next run: protect accuracy in round one, then spend the lead later.'
      }
    };

    if (low >= 45) {
      return {
        axis: 'balanced',
        headline: 'No single leak. Raise the floor.',
        body: 'Your strongest axis is ' + strongest.label.toLowerCase() + ' at ' + axes[strongest.key] + '/100. The next gain is not a heroic run; it is making ' + weakest.label.toLowerCase() + ' (' + low + '/100) cost you less.',
        drill: 'Next run: play for a clean round one, then push.'
      };
    }

    var f = map[weakest.key];
    return {
      axis: weakest.key,
      headline: f.headline,
      body: f.body,
      drill: f.drill,
      weakest: weakest.label,
      strongest: strongest.label
    };
  }

  function improvement(previous, current) {
    if (!previous || !current) return null;
    var out = {};
    AXES.forEach(function (a) {
      out[a.key] = round((current[a.key] || 0) - (previous[a.key] || 0));
    });
    return out;
  }

  return {
    AXES: AXES,
    AXIS_BY_KEY: AXIS_BY_KEY,
    TITLES: TITLES,
    ARCHETYPES: ARCHETYPES,
    ARCHETYPE_RULES: ARCHETYPE_RULES,
    titleFor: titleFor,
    archetypeFor: archetypeFor,
    compute: compute,
    improvement: improvement,
    median: median,
    quantile: quantile
  };
});
