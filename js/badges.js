/* TILE RUSH — title and fingerprint explainer.
 *
 * Titles are BPI bands. Fingerprints (archetypes) are rule-based descriptions
 * of the seven-axis profile. Click any title/archetype badge to see the whole
 * ladder, the rules, and where the current player sits.
 */
(function () {
  'use strict';

  var B = window.BPI;
  if (!B) return;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var state = { kind: 'title', name: '' };
  var modal = document.createElement('div');
  modal.className = 'badge-modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="badge-backdrop" data-badge-close></div>' +
    '<section class="badge-card" role="dialog" aria-modal="true" aria-labelledby="badgeTitle">' +
      '<button class="modal-x" type="button" data-badge-close aria-label="Close">×</button>' +
      '<span class="kicker">TITLES &amp; FINGERPRINTS</span>' +
      '<h2 class="badge-title" id="badgeTitle">TITLES</h2>' +
      '<p class="badge-lede" id="badgeLede"></p>' +
      '<div class="badge-tabs" id="badgeTabs" role="tablist">' +
        '<button type="button" data-badge-tab="title" role="tab">TITLES</button>' +
        '<button type="button" data-badge-tab="archetype" role="tab">FINGERPRINTS</button>' +
      '</div>' +
      '<div class="badge-list" id="badgeList"></div>' +
    '</section>';
  document.body.appendChild(modal);

  var titleEl = modal.querySelector('#badgeTitle');
  var ledeEl = modal.querySelector('#badgeLede');
  var tabsEl = modal.querySelector('#badgeTabs');
  var listEl = modal.querySelector('#badgeList');

  function currentAxes() {
    if (window.ProfileUI && window.ProfileUI.axes) return window.ProfileUI.axes();
    if (window.TileRush && window.TileRush.axes) return window.TileRush.axes();
    return null;
  }

  function titleRange(index) {
    var max = index === 0 ? 1000 : B.TITLES[index - 1].min - 1;
    return B.TITLES[index].min + '–' + max;
  }

  function renderTitles() {
    return B.TITLES.map(function (t, i) {
      var current = state.name === t.name;
      return '<article class="badge-row' + (current ? ' is-current' : '') + '">' +
        '<i class="badge-dot" style="background:' + esc(t.color) + '"></i>' +
        '<div class="badge-main">' +
          '<div class="badge-line">' +
            '<b style="color:' + esc(t.color) + '">' + esc(t.name) + '</b>' +
            '<span class="badge-range">' + titleRange(i) + ' BPI</span>' +
            (current ? '<em class="badge-you">YOU</em>' : '') +
          '</div>' +
          '<span class="badge-note">' + esc(t.note) + '</span>' +
          '<p>' + esc(t.desc || '') + '</p>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderArchetypes() {
    var axes = currentAxes();
    var html = '';
    if (axes) {
      html += '<div class="badge-axes"><span class="micro">YOUR LATEST FINGERPRINT</span><div class="badge-axis-grid">' +
        B.AXES.map(function (a) {
          var value = Number(axes[a.key]);
          return '<span><i>' + esc(a.short) + '</i><b>' + (Number.isFinite(value) ? value : '—') + '</b></span>';
        }).join('') +
      '</div></div>';
    }
    html += Object.keys(B.ARCHETYPES).map(function (name) {
      var current = state.name === name;
      return '<article class="badge-row' + (current ? ' is-current' : '') + '">' +
        '<div class="badge-main">' +
          '<div class="badge-line">' +
            '<b>' + esc(name) + '</b>' +
            (current ? '<em class="badge-you">YOU</em>' : '') +
          '</div>' +
          '<span class="badge-note">' + esc((B.ARCHETYPE_RULES && B.ARCHETYPE_RULES[name]) || '') + '</span>' +
          '<p>' + esc(B.ARCHETYPES[name] || '') + '</p>' +
        '</div>' +
      '</article>';
    }).join('');
    return html;
  }

  function render() {
    var isTitle = state.kind === 'title';
    titleEl.textContent = isTitle ? 'Titles' : 'Fingerprints';
    ledeEl.textContent = isTitle
      ? 'Titles are BPI bands. Your title comes from the highest BPI you have ever banked, so it never drops. BPI is a 0–1000 weighted score built from seven axes.'
      : 'Fingerprints describe how you read, using the seven axes from your most recent scored run. Rules are checked top to bottom; the first match wins.';
    var tabs = tabsEl.querySelectorAll('[data-badge-tab]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-badge-tab') === state.kind;
      tabs[i].classList.toggle('active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    listEl.innerHTML = isTitle ? renderTitles() : renderArchetypes();
    listEl.scrollTop = 0;
  }

  function open(kind, name) {
    state.kind = kind === 'archetype' ? 'archetype' : 'title';
    state.name = String(name || '').replace(/^—$/, '').trim();
    modal.hidden = false;
    document.body.classList.add('badge-open');
    render();
    var close = modal.querySelector('.modal-x');
    if (close) setTimeout(function () { close.focus(); }, 30);
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('badge-open');
  }

  document.addEventListener('click', function (event) {
    var badge = event.target.closest ? event.target.closest('.profile-title, .profile-arch, .bpi-title, .bpi-arch, .intro-title, .board-title-badge') : null;
    if (badge) {
      var kind = /arch/.test(badge.className) ? 'archetype' : 'title';
      open(kind, badge.textContent);
      return;
    }
    if (event.target.closest && event.target.closest('[data-badge-close]')) {
      close();
      return;
    }
    var tab = event.target.closest ? event.target.closest('[data-badge-tab]') : null;
    if (tab) {
      state.kind = tab.getAttribute('data-badge-tab') === 'archetype' ? 'archetype' : 'title';
      render();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !modal.hidden) close();
  });

  window.BadgeUI = { open: open, close: close };
})();
