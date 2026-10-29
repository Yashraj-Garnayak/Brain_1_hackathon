/* Eight per-player emote presets. The editor is private to the account on
   this device; the sent emoji/text is what both players see. */
(function () {
  'use strict';

  var DEFAULTS = [
    { emoji: '\uD83D\uDE04', text: 'GG' },
    { emoji: '\uD83D\uDD25', text: 'Nice' },
    { emoji: '\uD83C\uDFAF', text: 'Focus' },
    { emoji: '\uD83D\uDE05', text: 'Oops' },
    { emoji: '\uD83D\uDC4B', text: 'Hey' },
    { emoji: '\uD83D\uDCAA', text: 'Close' },
    { emoji: '\uD83D\uDD01', text: 'Rematch' },
    { emoji: '\uD83D\uDE4F', text: 'Thanks' }
  ];

  function clean(preset) {
    var emoji = String(preset && preset.emoji || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 4);
    var text = String(preset && preset.text || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
    return { emoji: emoji || '\u2728', text: text || 'Nice' };
  }

  function key() {
    var user = window.Account && window.Account.user ? window.Account.user() : null;
    var name = user && user.username ? String(user.username).toLowerCase() : 'guest';
    return 'tile-rush.emotes.v1.' + name;
  }

  function load() {
    try {
      var raw = localStorage.getItem(key());
      var parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length === 8) return parsed.map(clean);
    } catch (e) { /* private mode */ }
    return DEFAULTS.map(clean);
  }

  function save(list) {
    var out = (Array.isArray(list) ? list : []).slice(0, 8).map(clean);
    while (out.length < 8) out.push(clean(DEFAULTS[out.length]));
    try { localStorage.setItem(key(), JSON.stringify(out)); } catch (e) { /* ignore */ }
    return out;
  }

  function label(preset) {
    var p = clean(preset);
    return (p.emoji + ' ' + p.text).trim();
  }

  window.Emotes = { DEFAULTS: DEFAULTS.map(clean), load: load, save: save, label: label, key: key };
})();
