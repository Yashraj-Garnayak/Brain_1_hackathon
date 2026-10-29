/* TILE RUSH — public profile + BPI radar rendering.
 * Improvement and run history are only rendered when the viewer is the
 * profile owner; the server enforces the same rule.
 */
(function () {
  'use strict';

  var radarSeq = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function pct(v) { return Math.round((Number(v) || 0) * 100) + '%'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }

  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function seasonLabel(key) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
    return m ? MONTHS[Number(m[2]) - 1] + ' ' + m[1] : String(key || '\u2014');
  }
  function joinedLabel(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function regionLabel(country, region) {
    if (!country) return 'REGION UNKNOWN';
    return (region ? region + ' \u00b7 ' : '') + country;
  }

  function titleColor(name) {
    var B = window.BPI;
    if (!B) return '#94a3b8';
    for (var i = 0; i < B.TITLES.length; i++) if (B.TITLES[i].name === name) return B.TITLES[i].color;
    return '#94a3b8';
  }

  /* 7-axis fingerprint. One polygon per BPI axis, 0–100. */
  function radarSVG(axes, size, options) {
    var B = window.BPI;
    if (!B || !axes) return '';
    var AXES = B.AXES, n = AXES.length;
    size = size || 200;
    options = options || {};
    var pad = size * 0.2;
    var cx = size / 2, cy = size / 2;
    var R = size / 2 - pad;
    var uid = 'rg' + (++radarSeq);

    function xy(i, value) {
      var a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      var r = R * (clamp(value, 0, 100) / 100);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    function ring(v) {
      var pts = [];
      for (var i = 0; i < n; i++) { var p = xy(i, v); pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1)); }
      return pts.join(' ');
    }

    var rings = '';
    [25, 50, 75, 100].forEach(function (v) {
      rings += '<polygon points="' + ring(v) + '" fill="none" stroke="rgba(255,255,255,' +
        (v === 100 ? '.16' : '.07') + ')" stroke-width="1"/>';
    });

    var spokes = '';
    for (var i = 0; i < n; i++) {
      var end = xy(i, 100);
      spokes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + end[0].toFixed(1) + '" y2="' + end[1].toFixed(1) +
        '" stroke="rgba(255,255,255,.07)" stroke-width="1"/>';
    }

    var pts = [], dots = '', labels = '';
    for (var j = 0; j < n; j++) {
      var axis = AXES[j];
      var value = Number(axes[axis.key]) || 0;
      var p = xy(j, value);
      pts.push(p[0].toFixed(1) + ',' + p[1].toFixed(1));
      dots += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (size * 0.012).toFixed(1) +
        '" fill="' + (value < 40 ? '#fb7185' : value < 60 ? '#fbbf24' : '#5eead4') + '"/>';

      var a = -Math.PI / 2 + (j * 2 * Math.PI) / n;
      var lr = R + size * 0.085;
      var lx = cx + Math.cos(a) * lr;
      var ly = cy + Math.sin(a) * lr + size * 0.012;
      var anchor = Math.abs(Math.cos(a)) < 0.28 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
      labels += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + anchor +
        '" font-family="JetBrains Mono, monospace" font-size="' + (size * 0.052).toFixed(1) +
        '" letter-spacing=".06em" fill="rgba(148,163,184,.86)">' + axis.short + '</text>';
    }

    return '<svg class="radar" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="BPI axis fingerprint">' +
      '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="rgba(94,234,212,.5)"/>' +
      '<stop offset="100%" stop-color="rgba(167,139,250,.36)"/>' +
      '</linearGradient></defs>' +
      rings + spokes +
      '<polygon points="' + pts.join(' ') + '" fill="url(#' + uid + ')" stroke="#5eead4" stroke-width="1.4" stroke-linejoin="round"/>' +
      dots + labels +
      '</svg>';
  }

  function statRow(label, value) {
    return '<div class="ps-stat"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  var seasonMetric = 'bpi';
  var openSeason = null;
  var lastProfile = null;
  var lastSelf = false;

  var SEASON_METRICS = {
    bpi: {
      value: function (row) { return Number(row.bestBpi) || 0; },
      delta: 'bpi',
      unit: '',
      display: function (v) { return fmt(v); }
    },
    accuracy: {
      value: function (row) { return Math.round((Number(row.accuracy) || 0) * 100); },
      delta: 'accuracy',
      unit: 'pp',
      display: function (v) { return v + '%'; }
    },
    activity: {
      value: function (row) { return Number(row.games) || 0; },
      delta: 'games',
      unit: '',
      display: function (v) { return String(v); }
    },
    rank: {
      value: function (row) { return row.bestRank == null ? null : Number(row.bestRank); },
      delta: 'rank',
      unit: '',
      invert: true,
      display: function (v) { return v == null ? '\u2014' : '#' + v; }
    }
  };

  function trendSVG(rows, metricName) {
    var metric = SEASON_METRICS[metricName];
    var pts = rows.slice().reverse().filter(function (row) {
      var value = metric.value(row);
      return value != null && value > 0;
    }).map(function (row) {
      return { key: row.key, value: metric.value(row) };
    });

    if (pts.length < 2) {
      return '<p class="ps-empty">' + (pts.length
        ? 'First season is the baseline. The trend appears next month.'
        : 'No season data yet.') + '</p>';
    }

    var W = 320, H = 76, padX = 12, padY = 12;
    var innerW = W - padX * 2, innerH = H - padY * 2;
    var values = pts.map(function (p) { return p.value; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (min === max) { min = Math.max(0, min - 1); max = max + 1; }
    var range = max - min;

    function X(i) { return padX + (i / (pts.length - 1)) * innerW; }
    function Y(value) {
      var t = (value - min) / range;
      return metric.invert ? padY + t * innerH : padY + (1 - t) * innerH;
    }

    var line = '', dots = '';
    for (var i = 0; i < pts.length; i++) {
      var x = X(i), y = Y(pts[i].value);
      line += (i ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' +
        (i === pts.length - 1 ? 3.4 : 2.2) + '" fill="' +
        (i === pts.length - 1 ? '#5eead4' : 'rgba(148,163,184,.72)') + '"/>';
    }
    var area = line + ' L' + X(pts.length - 1).toFixed(1) + ' ' + (H - 1) +
      ' L' + X(0).toFixed(1) + ' ' + (H - 1) + ' Z';
    var uid = 'sg' + (++radarSeq);

    return '<svg class="ps-spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Season progression">' +
      '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="rgba(94,234,212,.34)"/>' +
      '<stop offset="100%" stop-color="rgba(94,234,212,0)"/>' +
      '</linearGradient></defs>' +
      '<line x1="' + padX + '" y1="' + (H - 1) + '" x2="' + (W - padX) + '" y2="' + (H - 1) +
        '" stroke="rgba(255,255,255,.07)" stroke-width="1"/>' +
      '<path d="' + area + '" fill="url(#' + uid + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="#5eead4" stroke-width="1.6" ' +
        'stroke-linejoin="round" stroke-linecap="round"/>' +
      dots + '</svg>';
  }

  function seasonRowHTML(row, index, metricName, showDelta) {
    var metric = SEASON_METRICS[metricName];
    var value = metric.value(row);
    var delta = showDelta && row.delta ? Number(row.delta[metric.delta]) : null;
    var hasDelta = delta != null && !isNaN(delta);
    var deltaCls = !hasDelta || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
    var deltaText = hasDelta ? (delta > 0 ? '+' : '') + delta + metric.unit : '';
    var open = openSeason === row.key;

    var meta = row.games + (row.games === 1 ? ' run' : ' runs') +
      ' \u00b7 ' + row.activeDays + ' active ' + (row.activeDays === 1 ? 'day' : 'days') +
      (row.logins ? ' \u00b7 ' + row.logins + ' sign-in' + (row.logins === 1 ? '' : 's') : '');

    return '<button type="button" class="ps-row' + (index === 0 ? ' current' : '') + (open ? ' open' : '') +
      '" data-season="' + esc(row.key) + '" aria-expanded="' + open + '">' +
      '<div class="ps-row-top">' +
        '<span class="ps-row-key">' + esc(seasonLabel(row.key)) +
          (index === 0 ? '<em>NOW</em>' : '') + '</span>' +
        '<span class="ps-row-val">' + (value == null ? '\u2014' : metric.display(value)) +
          (hasDelta ? '<b class="' + deltaCls + '">' + deltaText + '</b>' : '') +
          '<i class="ps-row-chev">' + (open ? '\u2212' : '+') + '</i></span>' +
      '</div>' +
      '<div class="ps-row-meta">' + meta + '</div>' +
    '</button>';
  }

  function shortDate(value) {
    if (!value) return '\u2014';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '\u2014';
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  function seasonDetailHTML(row, isSelf) {
    var B = window.BPI;
    var perDay = row.activeDays ? row.games / row.activeDays : 0;
    var stats =
      statRow('GAMES', String(row.games || 0)) +
      statRow('WON', String(row.wins || 0)) +
      statRow('LOST', String(row.losses || 0)) +
      statRow('ACCURACY', pct(row.accuracy)) +
      statRow('BEST BPI', String(row.bestBpi || 0)) +
      statRow('AVG BPI', String(row.avgBpi || 0)) +
      statRow('BEST SCORE', fmt(row.bestScore)) +
      statRow('AVG RT', row.avgRt ? row.avgRt + 'ms' : '\u2014') +
      statRow('ACTIVE DAYS', String(row.activeDays || 0)) +
      statRow('SIGN-INS', String(row.logins || 0)) +
      statRow('BEST RANK', row.bestRank ? '#' + row.bestRank : '\u2014') +
      statRow('RUNS / DAY', perDay.toFixed(1));

    var archetype = row.archetype || (row.axes && B ? B.archetypeFor(row.axes) : null);
    var radar = row.axes
      ? '<div class="ps-detail-radar"><span class="micro">' + esc(archetype || 'FINGERPRINT') + '</span>' +
        radarSVG(row.axes, 190) +
        '<p class="ps-detail-note">' + esc(archetype && B && B.ARCHETYPES[archetype] ? B.ARCHETYPES[archetype] : '') + '</p></div>'
      : '<div class="ps-detail-radar"><p class="ps-empty">No BPI fingerprint recorded for this season.</p></div>';

    var runs = '';
    if (isSelf && row.runs && row.runs.length) {
      var rows = row.runs.map(function (run) {
        return '<li><span>' + esc(shortDate(run.at)) + '</span><b>' + fmt(run.score) + '</b>' +
          '<em>BPI ' + (run.bpi || 0) + '</em></li>';
      }).join('');
      runs = '<div class="ps-detail-runs"><span class="micro">YOUR RUNS IN THIS SEASON <em>only visible to you</em></span>' +
        '<ul>' + rows + '</ul></div>';
    }

    return '<div class="ps-detail">' +
      '<div class="ps-detail-head">' +
        '<span class="micro">' + esc(seasonLabel(row.key)) + ' SEASON · FULL DETAIL</span>' +
        '<button class="linkish" type="button" data-season-close="' + esc(row.key) + '">close</button>' +
      '</div>' +
      '<div class="ps-detail-body">' +
        '<div class="ps-detail-stats">' + stats + '</div>' + radar +
      '</div>' + runs +
    '</div>';
  }

  function renderSeasonSummary(rows) {
    var el = $('profileSeasonSummary');
    if (!el) return;
    var cur = rows[0];
    if (!cur) { el.innerHTML = ''; return; }
    var perDay = cur.activeDays ? cur.games / cur.activeDays : 0;
    el.innerHTML =
      '<span><b>' + cur.activeDays + '</b> active ' + (cur.activeDays === 1 ? 'day' : 'days') + '</span>' +
      '<span><b>' + cur.logins + '</b> sign-ins</span>' +
      '<span><b>' + perDay.toFixed(1) + '</b> runs / active day</span>';
  }

  function syncSeasonSeg() {
    var seg = $('seasonMetrics');
    if (!seg) return;
    var buttons = seg.querySelectorAll('button[data-metric]');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute('data-metric') === seasonMetric;
      buttons[i].classList.toggle('active', on);
      buttons[i].setAttribute('aria-pressed', String(on));
    }
  }

  function renderSeasons(profile, isSelf) {
    var rows = (profile.seasons || []).slice(0, 12);
    var has = rows.length > 0;
    var metricName = SEASON_METRICS[seasonMetric] ? seasonMetric : 'bpi';

    renderSeasonSummary(rows);

    var seg = $('seasonMetrics');
    if (seg) seg.hidden = !has;

    var trend = $('profileSeasonTrend');
    if (trend) {
      trend.innerHTML = has && isSelf
        ? trendSVG(rows, metricName) + (rows.length > 1
          ? '<div class="ps-trend-axis"><span>' + esc(seasonLabel(rows[rows.length - 1].key)) +
            '</span><span>' + esc(seasonLabel(rows[0].key)) + '</span></div>'
          : '')
        : '';
    }

    var insight = $('profileSeasonInsight');
    if (insight) {
      insight.textContent = has && isSelf ? (profile.insight || '') : '';
      insight.hidden = !has || !isSelf || !profile.insight;
    }

    var list = $('profileSeasons');
    if (list) {
      if (!has) {
        list.innerHTML = '<p class="ps-empty">' + (isSelf
          ? 'No seasons yet. Play a ranked run to start one.'
          : 'No ranked seasons yet.') + '</p>';
      } else {
        if (openSeason && !rows.some(function (row) { return row.key === openSeason; })) openSeason = null;
        var html = '';
        for (var i = 0; i < rows.length; i++) {
          html += seasonRowHTML(rows[i], i, metricName, isSelf);
          if (rows[i].key === openSeason) html += seasonDetailHTML(rows[i], isSelf);
        }
        list.innerHTML = html;
      }
    }

    syncSeasonSeg();
  }

  function render(profile, isSelf, gameId) {
    if (!profile || !profile.user) return;
    var u = profile.user;
    var B = window.BPI;
    var season = profile.season || {};
    var axes = (profile.self && profile.self.axes) || profile.axes || null;
    var archetype = axes && B ? B.archetypeFor(axes) : null;

    var avatar = $('profileAvatar');
    if (avatar) {
      avatar.innerHTML = u.avatar
        ? '<img src="' + esc(u.avatar) + '" alt="" />'
        : '<span>' + esc(String(u.username || '?').charAt(0).toUpperCase()) + '</span>';
      avatar.classList.toggle('has-photo', !!u.avatar);
    }

    var name = $('profileName');
    if (name) name.textContent = '@' + u.username;

    var title = $('profileTitle');
    if (title) {
      title.textContent = u.title || 'DRIFTER';
      title.style.color = titleColor(u.title);
      title.style.borderColor = titleColor(u.title) + '55';
    }

    var meta = $('profileMeta');
    if (meta) {
      var bits = [regionLabel(u.country, u.region)];
      if (u.createdAt) bits.push('JOINED ' + joinedLabel(u.createdAt));
      meta.textContent = bits.join(' \u00b7 ');
    }
    var online = $('profileOnline');
    if (online) online.hidden = !u.online;

    var bpiEl = $('profileBestBpi');
    if (bpiEl) bpiEl.textContent = String(u.bestBpi || 0);
    var scoreEl = $('profileBestScore');
    if (scoreEl) scoreEl.textContent = fmt(u.bestScore);
    var gamesEl = $('profileGames');
    if (gamesEl) gamesEl.textContent = String(u.games || 0);
    var rankEl = $('profileRank');
    if (rankEl) rankEl.textContent = season.rank ? '#' + season.rank : '\u2014';

    var select = $('profileGameSelect');
    if (select) {
      var options = '';
      var games = profile.games || [];
      for (var g = 0; g < games.length; g++) {
        var game = games[g];
        options += '<option value="' + esc(game.id) + '">' + esc(game.name) + '</option>';
      }
      if (!games.length) options = '<option value="tile-rush">TILE RUSH</option>';
      select.innerHTML = options;
      select.value = gameId || 'tile-rush';
    }

    var seasonName = $('profileSeasonName');
    if (seasonName) seasonName.textContent = seasonLabel(season.key);

    var seasonStats = $('profileSeasonStats');
    if (seasonStats) {
      seasonStats.innerHTML =
        statRow('GAMES', String(season.games || 0)) +
        statRow('WON', String(season.wins || 0)) +
        statRow('LOST', String(season.losses || 0)) +
        statRow('ACCURACY', pct(season.accuracy)) +
        statRow('BEST BPI', String(season.bestBpi || 0)) +
        statRow('BEST SCORE', fmt(season.bestScore)) +
        statRow('RANK NOW', season.rank ? '#' + season.rank : '\u2014') +
        statRow('BEST RANK', season.bestRank ? '#' + season.bestRank : '\u2014');
    }

    lastProfile = profile;
    lastSelf = !!isSelf;
    renderSeasons(profile, isSelf);

    var radar = $('profileRadar');
    if (radar) radar.innerHTML = axes ? radarSVG(axes, 220) : '<span class="ps-empty">No fingerprint yet.</span>';

    var arch = $('profileArchetype');
    if (arch) arch.textContent = archetype || '\u2014';

    var feedback = $('profileFeedback');
    if (feedback) {
      var text = '';
      if (archetype && B && B.ARCHETYPES[archetype]) text = B.ARCHETYPES[archetype];
      else text = 'Play a ranked run to build a fingerprint.';
      feedback.textContent = text;
    }

    var improve = $('profileImprove');
    if (improve) {
      if (isSelf && profile.self && profile.self.improvement) {
        improve.hidden = false;
        var deltas = profile.self.improvement;
        var chips = '';
        for (var a = 0; a < B.AXES.length; a++) {
          var key = B.AXES[a].key;
          var d = Number(deltas[key]) || 0;
          chips += '<div class="ps-delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat') + '">' +
            '<span>' + B.AXES[a].short + '</span><b>' + (d > 0 ? '+' : '') + d + '</b></div>';
        }
        var list = $('profileImproveList');
        if (list) list.innerHTML = chips;
      } else {
        improve.hidden = true;
      }
    }

    var edit = $('profileEdit');
    if (edit) edit.hidden = !isSelf;
  }

  var seasonSeg = $('seasonMetrics');
  if (seasonSeg) {
    seasonSeg.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-metric]') : null;
      if (!btn) return;
      var metric = btn.getAttribute('data-metric');
      if (!SEASON_METRICS[metric]) return;
      seasonMetric = metric;
      if (lastProfile) renderSeasons(lastProfile, lastSelf);
      else syncSeasonSeg();
    });
  }

  var seasonList = $('profileSeasons');
  if (seasonList) {
    seasonList.addEventListener('click', function (e) {
      var close = e.target.closest ? e.target.closest('[data-season-close]') : null;
      if (close) {
        openSeason = null;
        if (lastProfile) renderSeasons(lastProfile, lastSelf);
        return;
      }
      var row = e.target.closest ? e.target.closest('[data-season]') : null;
      if (!row) return;
      var key = row.getAttribute('data-season');
      openSeason = openSeason === key ? null : key;
      if (lastProfile) renderSeasons(lastProfile, lastSelf);
    });
  }

  window.ProfileUI = {
    radarSVG: radarSVG,
    render: render,
    titleColor: titleColor,
    seasonLabel: seasonLabel,
    regionLabel: regionLabel
  };
})();
