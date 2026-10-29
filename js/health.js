/* Health metrics page: renders Ultrahuman daily metrics fetched through /api/ultrahuman. */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var base = (params.get('api') || '').replace(/\/$/, '');
  // Default range: the last 7 days (Ultrahuman's per-request limit), today included.
  var todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  var DEFAULT_END = Math.floor(todayMidnight.getTime() / 1000);
  var DEFAULT_START = Math.floor(new Date(todayMidnight.getFullYear(), todayMidnight.getMonth(), todayMidnight.getDate() - 6).getTime() / 1000);

  var form = document.getElementById('rangeForm');
  var fromInput = document.getElementById('fromDate');
  var toInput = document.getElementById('toDate');
  var statusEl = document.getElementById('status');
  var daysEl = document.getElementById('days');
  var syncEl = document.getElementById('syncInfo');

  var STAGE_ORDER = ['deep_sleep', 'rem_sleep', 'light_sleep', 'awake'];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function toDateValue(epoch) {
    var d = new Date(epoch * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Local midnight of a yyyy-mm-dd input, as unix seconds.
  function toEpoch(value) {
    var parts = value.split('-').map(Number);
    return Math.floor(new Date(parts[0], parts[1] - 1, parts[2]).getTime() / 1000);
  }

  function clock(epoch) {
    var d = new Date(epoch * 1000);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

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

  function byType(list) {
    var out = {};
    list.forEach(function (m) { out[m.type] = m.object || {}; });
    return out;
  }

  function tile(label, value, unit, note, tone) {
    return '<div class="hm-tile' + (tone ? ' is-' + tone : '') + '">' +
      '<span class="micro">' + esc(label) + '</span>' +
      '<b>' + esc(value == null ? '—' : value) + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</b>' +
      (note ? '<span class="hm-note">' + esc(note) + '</span>' : '') +
      '</div>';
  }

  function scoreTone(score) {
    if (score == null) return '';
    return score >= 85 ? 'good' : score >= 70 ? 'ok' : 'low';
  }

  function trendNote(obj) {
    if (!obj || obj.trend_title == null) return '';
    return 'vs avg ' + obj.trend_title;
  }

  function stagesBar(stages) {
    if (!stages || !stages.length) return '';
    var sorted = stages.slice().sort(function (a, b) {
      return STAGE_ORDER.indexOf(a.type) - STAGE_ORDER.indexOf(b.type);
    });
    var bar = sorted.map(function (s) {
      return '<i class="st-' + esc(s.type) + '" style="flex:' + Number(s.percentage || 0) + '" title="' + esc(s.title) + '"></i>';
    }).join('');
    var legend = sorted.map(function (s) {
      return '<li><i class="st-' + esc(s.type) + '"></i>' + esc(s.title) + ' <span>' + esc(s.stage_time_text) + '</span></li>';
    }).join('');
    return '<div class="hm-stages"><div class="hm-stage-bar">' + bar + '</div><ul>' + legend + '</ul></div>';
  }

  function hrChart(hr) {
    var values = (hr && hr.values) || [];
    if (values.length < 2) return '<p class="hm-empty">No heart-rate samples.</p>';
    var w = 600, h = 140, padY = 12;
    var t0 = values[0].timestamp, t1 = values[values.length - 1].timestamp;
    var lo = Infinity, hi = -Infinity;
    values.forEach(function (v) { lo = Math.min(lo, v.value); hi = Math.max(hi, v.value); });
    var span = Math.max(1, hi - lo);
    var points = values.map(function (v) {
      var x = ((v.timestamp - t0) / Math.max(1, t1 - t0)) * w;
      var y = padY + (1 - (v.value - lo) / span) * (h - padY * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<figure class="hm-chart">' +
      '<figcaption><span class="micro">HEART RATE</span><span>' + lo + '–' + hi + ' ' + esc(hr.unit || 'BPM') + '</span></figcaption>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="Heart rate through the day, ' + lo + ' to ' + hi + ' BPM">' +
      '<polyline points="' + points + '" /></svg>' +
      '<div class="hm-axis"><span>' + clock(t0) + '</span><span>' + clock(t1) + '</span></div>' +
      '</figure>';
  }

  function renderDay(key, list) {
    var m = byType(list);
    var sleep = m.sleep || {};
    var sleepScore = sleep.sleep_score && sleep.sleep_score.score;
    var total = sleep.total_sleep && sleep.total_sleep.minutes;
    var efficiency = sleep.sleep_efficiency && sleep.sleep_efficiency.percentage;
    var tempDev = sleep.temperature_deviation && sleep.temperature_deviation.celsius;
    var recovery = m.recovery_index && m.recovery_index.value;
    var movement = m.movement_index && m.movement_index.value;
    var bed = sleep.bedtime_start && sleep.bedtime_end
      ? clock(sleep.bedtime_start) + ' → ' + clock(sleep.bedtime_end) : '';

    var html = '<article class="hm-day">' +
      '<header><h2>' + esc(dayLabel(key)) + '</h2>' + (bed ? '<span class="hm-bed">Bed ' + esc(bed) + '</span>' : '') + '</header>' +
      '<div class="hm-scores">' +
        tile('SLEEP', sleepScore, '', sleep.total_sleep && sleep.total_sleep.badge ? sleep.total_sleep.badge.text : '', scoreTone(sleepScore)) +
        tile('RECOVERY', recovery, '', '', scoreTone(recovery)) +
        tile('MOVEMENT', movement, '', '', scoreTone(movement)) +
      '</div>' +
      '<div class="hm-grid">' +
        tile('TOTAL SLEEP', duration(total), '', efficiency != null ? efficiency + '% efficiency' : '') +
        tile('HRV', m.hrv && m.hrv.avg, 'ms', trendNote(m.hrv)) +
        tile('RESTING HR', m.night_rhr && m.night_rhr.avg, 'bpm', trendNote(m.night_rhr)) +
        tile('STEPS', m.steps && m.steps.total != null ? m.steps.total.toLocaleString() : null, '', trendNote(m.steps)) +
        tile('VO2 MAX', m.vo2_max && m.vo2_max.value, '', '') +
        tile('ALERTNESS', m.morning_alertness && m.morning_alertness.value, 'min', 'to feel alert') +
        tile('ACTIVE', m.active_minutes && m.active_minutes.value, 'min', m.inactive_time ? duration(m.inactive_time.value) + ' inactive' : '') +
        tile('TEMP DEV', tempDev != null ? (tempDev > 0 ? '+' : '') + tempDev.toFixed(2) : null, '°C', 'skin, overnight') +
      '</div>' +
      stagesBar(sleep.sleep_stages) +
      hrChart(m.hr) +
      '</article>';
    return html;
  }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', !!isError);
  }

  function load(start, end) {
    setStatus('Loading…');
    daysEl.innerHTML = '';
    fetch(base + '/api/ultrahuman?start_epoch=' + start + '&end_epoch=' + end, { credentials: 'include' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ').');
          return data;
        });
      })
      .then(function (data) {
        var metrics = data.metrics || {};
        var keys = Object.keys(metrics).sort().reverse();
        if (data.last_synced_at) {
          syncEl.textContent = 'Ultrahuman ring · last synced ' + new Date(data.last_synced_at * 1000).toLocaleString();
        } else {
          syncEl.textContent = 'Ultrahuman ring';
        }
        if (!keys.length) {
          setStatus('No data for this range.');
          return;
        }
        setStatus('');
        daysEl.innerHTML = keys.map(function (k) { return renderDay(k, metrics[k]); }).join('');
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var start = toEpoch(fromInput.value);
    var end = toEpoch(toInput.value);
    if (end < start) {
      setStatus('"To" must be on or after "From".', true);
      return;
    }
    load(start, end);
  });

  var start = Number(params.get('start_epoch')) || DEFAULT_START;
  var end = Number(params.get('end_epoch')) || DEFAULT_END;
  fromInput.value = toDateValue(start);
  toInput.value = toDateValue(end);
  load(start, end);
})();
