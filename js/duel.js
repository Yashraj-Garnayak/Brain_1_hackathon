/* TILE RUSH — 1v1 + ghost client.
 *
 * 1v1: a signed-in player asks the Vercel API for a short-lived ticket, polls
 * the Cloudflare queue with it, then opens the match socket. Both players ready
 * up, the server starts a shared 3-second countdown, and each client runs the
 * normal three-round game on the same seeded boards. Scores stream to the
 * opponent, emotes are available during the 5-second breaks, and the server
 * decides the winner.
 *
 * Ghost: the same flow without a socket. The player races a replay of their own
 * best run, sampled once per second on the server and driven locally.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    screen: $('duelScreen'), kicker: $('duelKicker'), badge: $('duelBadge'),
    title: $('duelTitle'), lede: $('duelLede'), status: $('duelStatus'), note: $('duelNote'),
    versus: $('duelVersus'), you: $('duelYou'), opp: $('duelOpp'),
    youScore: $('duelYouScore'), oppScore: $('duelOppScore'),
    youLabel: $('duelYouLabel'), oppLabel: $('duelOppLabel'),
    primary: $('duelPrimary'), cancel: $('duelCancel'), ghostBtn: $('duelGhostBtn'),
    hud: $('duelHud'), hudYou: $('duelHudYou'), hudOpp: $('duelHudOpp'), hudName: $('duelHudName'),
    hudTag: $('duelHudTag'),
    feed: $('duelFeed'), emotes: $('duelEmotes'), lobbyEmotes: $('duelEmotesLobby'),
    enter: $('duelBtn'), ghostEntry: $('ghostBtn'),
    share: $('duelShare'), shareLink: $('duelShareLink'), shareCopy: $('duelShareCopy'),
    room: $('duelRoom'), roomInput: $('roomCodeInput'),
    watchBoards: $('watchBoards'), watchSwitch: $('watchSwitch'),
    roomJoin: $('roomJoinBtn'), roomWatch: $('roomWatchBtn'), roomCreate: $('roomCreateBtn')
  };

  var state = 'idle';            // idle | lobby | queue | matched | playing | watching | result
  var mode = 'duel';             // duel | ghost | room
  var ticket = null;
  var endpoints = null;
  var socket = null;
  var pollTimer = null;
  var clockTimer = null;
  var connectTimer = null;
  var ghostTimer = null;
  var ghost = null;
  var ghostTrack = null;
  var ghostAt = 0;
  var queueStart = 0;
  var matchId = '';
  var roomCode = '';
  var watching = false;
  var autoWatched = false;
  var spectatorCount = 0;
  var watchPlayers = [];
  var watchFocus = 0;
  var matchSeed = '';
  var me = '';
  var opponent = '';
  var myScore = 0;
  var oppScore = 0;
  var seed = '';
  var started = false;
  var rematchSent = false;
  var reconnects = 0;
  var closedByUs = false;
  var pendingFinish = null;

  function signedIn() {
    return !!(window.Account && Account.user && Account.user());
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function elapsed() {
    var s = Math.max(0, Math.floor((Date.now() - queueStart) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function showScreen(on) {
    els.screen.classList.toggle('show', on);
    document.body.classList.toggle('duel-on', !!on);
    document.body.classList.toggle('spectating', !!on && watching);
  }

  function showHud(on) {
    els.hud.hidden = !on;
  }

  function emoteList() {
    if (window.Emotes) return Emotes.load();
    return [];
  }

  function emoteButton(preset, index) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'emote-btn';
    button.setAttribute('data-emote-index', String(index));
    button.setAttribute('aria-label', preset.emoji + ' ' + preset.text);
    var emoji = document.createElement('span');
    emoji.className = 'emote-emoji';
    emoji.textContent = preset.emoji;
    var text = document.createElement('span');
    text.className = 'emote-text';
    text.textContent = preset.text;
    button.appendChild(emoji);
    button.appendChild(text);
    return button;
  }

  function paintEmoteBars() {
    var list = emoteList();
    [els.emotes, els.lobbyEmotes].forEach(function (host) {
      if (!host) return;
      host.textContent = '';
      list.forEach(function (preset, index) { host.appendChild(emoteButton(preset, index)); });
    });
  }

  function syncEmotes() {
    var live = (mode === 'duel' || mode === 'room') && !watching;
    if (els.emotes) els.emotes.hidden = !(state === 'playing' && live);
    if (els.lobbyEmotes) els.lobbyEmotes.hidden = !(state === 'matched' && live);
  }

  function setState(next) {
    state = next;
    render();
    syncEmotes();
  }

  function inviteLink() {
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) return '';
    return location.origin + '/?room=' + roomCode;
  }

  function render() {
    var on = state !== 'idle' && state !== 'playing';
    showScreen(on);
    if (state === 'idle') {
      showHud(false);
      return;
    }

    els.room.hidden = state !== 'lobby';
    if (els.watchBoards && !watching) els.watchBoards.hidden = true;
    if (els.watchSwitch && !watching) els.watchSwitch.hidden = true;
    var link = inviteLink();
    els.share.hidden = !link || state === 'lobby';
    if (link) els.shareLink.textContent = link.replace(/^https?:\/\//, '');

    els.badge.textContent = state === 'result'
      ? (mode === 'ghost' ? 'GHOST RUN' : watching ? 'FINISHED' : 'MATCH COMPLETE')
      : watching
        ? 'LIVE'
        : mode === 'ghost'
          ? 'BEST SELF'
          : mode === 'room'
            ? 'PRIVATE ROOM'
            : 'RATED RUN';
    els.cancel.hidden = state === 'queue';
    els.primary.hidden = false;
    els.primary.disabled = false;
    els.ghostBtn.hidden = !((state === 'lobby' || state === 'queue') && mode !== 'room');

    if (state === 'lobby') {
      if (mode === 'room') {
        els.kicker.textContent = 'PRIVATE ROOM';
        els.title.textContent = roomCode ? 'ROOM ' + roomCode : 'DUEL';
        els.lede.textContent = 'Two players race. Everyone else watches live, read-only.';
        els.versus.hidden = true;
        els.primary.textContent = signedIn() ? 'JOIN AS PLAYER' : 'SIGN IN TO PLAY';
        els.cancel.textContent = 'BACK';
        setStatus(roomCode
          ? 'Room ' + roomCode + ' · JOIN takes the next player slot. WATCH is read-only.'
          : 'Create a room or type a code to join or watch.');
        els.note.textContent = 'Room links open this lobby. First two players race; the next 20 can watch.';
        return;
      }
      els.kicker.textContent = mode === 'ghost' ? 'SOLO · BEST SELF' : '1V1 · LIVE DUEL';
      els.title.textContent = mode === 'ghost' ? 'YOUR BEST' : 'DUEL';
      els.lede.textContent = mode === 'ghost'
        ? 'Race a replay of your highest-scoring run. Same three rounds, one ghost.'
        : 'Same three rounds. Same boards. Two players, one clock.';
      els.versus.hidden = true;
      els.primary.textContent = 'FIND MATCH';
      els.cancel.textContent = 'BACK';
      setStatus(signedIn() ? (mode === 'ghost' ? 'Loading your ghost…' : 'You are signed in. Queue up against a player near your rating.')
        : 'Sign in to queue. Accounts keep matches fair and rated.');
      els.note.textContent = '3×3 · 25s → 4×4 · 15s → 5×5 · 10s. Breaks are 5s. Both players see the same boards.';
      return;
    }

    if (state === 'queue') {
      els.kicker.textContent = 'MATCHMAKING';
      els.title.textContent = 'SEARCHING';
      els.lede.textContent = 'Scanning for a player in your BPI band.';
      els.versus.hidden = true;
      els.primary.textContent = 'CANCEL SEARCH';
      els.cancel.textContent = 'BACK';
      els.note.textContent = 'Nobody yet? Keep waiting, or race your best while the queue runs.';
      return;
    }

    if (state === 'matched') {
      els.kicker.textContent = mode === 'room' ? 'PRIVATE ROOM · ' + (roomCode || '') : 'MATCH FOUND';
      els.title.textContent = 'READY UP';
      els.lede.textContent = mode === 'room'
        ? 'The first two players race. Everyone else can watch live.'
        : 'Both players ready and the clock starts together.';
      els.versus.hidden = false;
      els.youLabel.textContent = 'YOU';
      els.oppLabel.textContent = 'OPPONENT';
      els.you.textContent = me || 'YOU';
      els.opp.textContent = opponent || 'WAITING';
      els.youScore.textContent = fmt(myScore);
      els.oppScore.textContent = fmt(oppScore);
      els.primary.textContent = rematchSent ? 'REMATCH REQUESTED' : 'READY';
      els.primary.disabled = rematchSent;
      els.cancel.textContent = mode === 'room' ? 'LEAVE ROOM' : 'LEAVE';
      if (!rematchSent) setStatus(mode === 'room' && !opponent
        ? 'Waiting for a second player. Share the invite link.'
        : 'Tap READY when you want the countdown to start.');
      els.note.textContent = mode === 'room'
        ? (spectatorCount ? spectatorCount + ' watching · ' : '') +
          'Share the link to fill the room or invite spectators.'
        : 'Rounds start after both players are ready. Emotes unlock in the breaks.';
      return;
    }

    if (state === 'watching') {
      var a = watchPlayers[0] || null;
      var b = watchPlayers[1] || null;
      els.kicker.textContent = 'SPECTATING · ' + (roomCode ? 'ROOM ' + roomCode : String(matchId).slice(0, 8).toUpperCase());
      els.title.textContent = 'LIVE';
      els.lede.textContent = 'You are watching read-only. Emotes and runs stay with the players.';
      els.versus.hidden = false;
      els.youLabel.textContent = 'PLAYER 1';
      els.oppLabel.textContent = 'PLAYER 2';
      els.you.textContent = a ? a.name : 'WAITING';
      els.opp.textContent = b ? b.name : 'WAITING';
      els.youScore.textContent = fmt(a ? a.score : 0);
      els.oppScore.textContent = fmt(b ? b.score : 0);
      els.primary.hidden = true;
      els.cancel.textContent = 'LEAVE';
      els.note.textContent = (spectatorCount ? spectatorCount + ' watching · ' : '') +
        'Live boards mirror each player\'s current deal.';
      renderWatchBoards();
      return;
    }

    if (state === 'result') {
      els.versus.hidden = false;
      if (watching) {
        var first = watchPlayers[0] || { name: 'PLAYER 1', score: 0 };
        var second = watchPlayers[1] || { name: 'PLAYER 2', score: 0 };
        els.youLabel.textContent = 'PLAYER 1';
        els.oppLabel.textContent = 'PLAYER 2';
        els.you.textContent = first.name;
        els.opp.textContent = second.name;
        els.youScore.textContent = fmt(first.score);
        els.oppScore.textContent = fmt(second.score);
        els.primary.hidden = true;
        els.cancel.textContent = 'LEAVE';
        els.note.textContent = 'Read-only room replay. The players can run it back with a rematch.';
        renderWatchBoards();
        return;
      }
      els.youLabel.textContent = 'YOU';
      els.oppLabel.textContent = 'OPPONENT';
      els.you.textContent = me || 'YOU';
      els.opp.textContent = opponent || (mode === 'ghost' ? 'YOUR BEST' : 'OPPONENT');
      els.youScore.textContent = fmt(myScore);
      els.oppScore.textContent = fmt(oppScore);
      if (mode === 'ghost') {
        els.primary.textContent = 'RACE AGAIN';
        els.note.textContent = 'Your ghost replays your best run second by second. Beat it for a new personal best.';
      } else if (mode === 'room') {
        els.primary.textContent = rematchSent ? 'REMATCH REQUESTED' : 'REMATCH';
        els.note.textContent = 'Both runs are rated and saved. The room stays open for a rematch.';
      } else {
        els.primary.textContent = rematchSent ? 'REMATCH REQUESTED' : 'REMATCH';
        els.note.textContent = 'Both runs are rated and saved to your season stats.';
      }
      els.primary.disabled = rematchSent;
      els.cancel.textContent = mode === 'room' ? 'LEAVE ROOM' : 'LEAVE';
      return;
    }
  }

  /* ---------- ticket + queue ---------- */

  function fail(message) {
    clearTimers();
    setState('lobby');
    setStatus(message || 'Could not start the duel.');
    els.primary.textContent = 'TRY AGAIN';
  }

  function clearTimers() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    if (ghostTimer) { clearInterval(ghostTimer); ghostTimer = null; }
  }

  function startQueue() {
    if (!signedIn()) {
      setState('lobby');
      setStatus('Sign in to play 1v1.');
      els.primary.textContent = 'SIGN IN';
      return;
    }
    clearTimers();
    mode = 'duel';
    watching = false;
    roomCode = '';
    spectatorCount = 0;
    watchPlayers = [];
    els.hudTag.textContent = '1V1';
    rematchSent = false;
    closedByUs = false;
    reconnects = 0;
    setState('queue');
    setStatus('Issuing match ticket…');
    ticket = null;
    fetchTicket().then(function () {
      queueStart = Date.now();
      setStatus('In queue · ' + elapsed());
      clockTimer = setInterval(function () {
        if (state === 'queue') setStatus('In queue · ' + elapsed());
      }, 500);
      poll();
    }).catch(function (err) {
      fail(err && err.message ? err.message : 'Could not reach the match service.');
    });
  }

  function fetchTicket(spectator) {
    return Account.duelTicket({ spectator: !!spectator }).then(function (data) {
      ticket = data.ticket;
      endpoints = { queue: data.queueUrl, socket: data.socketBase };
      return data;
    });
  }

  function poll() {
    if (state !== 'queue') return;
    fetch(endpoints.queue, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket: ticket })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    }).then(function (res) {
      if (state !== 'queue') return;
      if (!res.ok) {
        if (res.status === 401) {
          ticket = null;
          return fetchTicket().then(poll);
        }
        throw new Error(res.data.error || 'Matchmaking is unavailable.');
      }
      if (res.data.matchId) return join(res.data.matchId);
      pollTimer = setTimeout(poll, 1200);
    }).catch(function (err) {
      fail(err && err.message ? err.message : 'Matchmaking is unavailable.');
    });
  }

  function join(id) {
    clearTimers();
    matchId = id;
    setState('matched');
    setStatus('Connecting to the match…');
    connectTimer = setTimeout(function () {
      if (state === 'matched' && !opponent) {
        setStatus('Opponent did not connect. Leave and try again.');
      }
    }, 20000);
    connect();
  }

  /* ---------- ghost: race your own best run ---------- */

  function goGhost() {
    if (!signedIn()) {
      if (window.TileRush && TileRush.openAuth) TileRush.openAuth(false);
      return;
    }
    clearTimers();
    if (state === 'queue') cancelQueue();
    if (socket) {
      closedByUs = true;
      try { socket.close(); } catch (e) { /* ignore */ }
      socket = null;
    }
    mode = 'ghost';
    started = false;
    rematchSent = false;
    myScore = 0;
    oppScore = 0;
    setState('lobby');
    els.primary.textContent = 'LOADING';
    els.primary.disabled = true;
    setStatus('Loading your best run…');

    Account.ghost().then(function (data) {
      if (mode !== 'ghost') return;
      if (!data || !data.ghost) {
        els.primary.disabled = false;
        els.primary.textContent = 'FIND MATCH';
        setStatus('No best run yet. Finish a ranked run and it becomes your ghost.');
        return;
      }
      ghost = data.ghost;
      ghostTrack = Array.isArray(ghost.timeline) ? ghost.timeline : [0, ghost.score];
      opponent = 'YOUR BEST';
      me = (Account.user() && Account.user().username) || 'YOU';
      seed = 'ghost-' + Math.random().toString(36).slice(2, 10);
      oppScore = 0;
      startMatch();
      ghostAt = Date.now();
      ghostTimer = setInterval(ghostTick, 200);
    }).catch(function (err) {
      if (mode !== 'ghost') return;
      els.primary.disabled = false;
      els.primary.textContent = 'FIND MATCH';
      setStatus((err && err.message) || 'Could not load your ghost.');
    });
  }

  function ghostTick() {
    if (mode !== 'ghost' || state !== 'playing') return;
    var t = Math.floor((Date.now() - ghostAt) / 1000);
    var i = Math.max(0, Math.min(ghostTrack.length - 1, t));
    oppScore = Number(ghostTrack[i]) || 0;
    updateHud();
  }

  function ghostResult() {
    clearTimers();
    var best = ghost ? Number(ghost.score) || 0 : 0;
    oppScore = best;
    var diff = myScore - best;
    els.kicker.textContent = 'SOLO · BEST SELF';
    els.title.textContent = diff > 0 ? 'NEW BEST' : diff === 0 ? 'TIED YOUR BEST' : 'DEFEAT';
    els.lede.textContent = diff > 0
      ? 'You beat your ghost by ' + fmt(diff) + '. That run is your new best.'
      : diff === 0
        ? 'A dead heat with your best run.'
        : 'Your best stayed ' + fmt(-diff) + ' ahead this time.';
    setStatus('You ' + fmt(myScore) + ' · best ' + fmt(best));
    rematchSent = false;
    setState('result');
    showHud(false);
    syncEmotes();
  }

  /* ---------- rooms + read-only spectators ---------- */

  var ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function makeRoomCode() {
    var bytes = new Uint8Array(6);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var b = 0; b < bytes.length; b++) bytes[b] = Math.floor(Math.random() * 256);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length];
    return out;
  }

  /* A six-character code is always a room. Anything else that looks like a
     match id can still be watched, which covers "type the game id". */
  function normalizeEntry(raw) {
    var value = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    var room = /^(?:ROOM-)?([A-Z0-9]{6})$/.exec(value);
    if (room) return { id: 'room-' + room[1], code: room[1] };
    var loose = String(raw || '').trim();
    if (/^[A-Za-z0-9_-]{4,40}$/.test(loose)) return { id: loose, code: '' };
    return null;
  }

  function roomEntry() {
    return normalizeEntry(els.roomInput.value || roomCode || matchId);
  }

  function openRoom(code) {
    var entry = normalizeEntry(code);
    if (!entry) return;
    mode = 'room';
    watching = false;
    paintEmoteBars();
    roomCode = entry.code;
    matchId = entry.id;
    watchPlayers = [];
    spectatorCount = 0;
    els.roomInput.value = entry.code || entry.id;
    if (state === 'idle') setState('lobby');
    else render();
    if (entry.code) {
      setStatus('Room ' + entry.code + ' · JOIN takes the next player slot, WATCH is read-only.');
    }
  }

  function createRoom() {
    if (!signedIn()) {
      setStatus('Sign in to open a room. Watching needs no account.');
      if (window.TileRush && TileRush.openAuth) TileRush.openAuth(false);
      return;
    }
    var code = makeRoomCode();
    els.roomInput.value = code;
    enterRoom('room-' + code, 'player');
  }

  function joinRoom() {
    var entry = roomEntry();
    if (!entry) {
      setStatus('Type a 6-character room code first.');
      return;
    }
    if (!signedIn()) {
      setStatus('Sign in to take a player slot. You can WATCH without an account.');
      if (window.TileRush && TileRush.openAuth) TileRush.openAuth(false);
      return;
    }
    enterRoom(entry.id, 'player');
  }

  function watchRoom() {
    var entry = roomEntry();
    if (!entry) {
      setStatus('Type a 6-character room code first.');
      return;
    }
    enterRoom(entry.id, 'spectator');
  }

  function enterRoom(id, role) {
    var entry = normalizeEntry(id);
    if (!entry) {
      setStatus('That room code is not valid.');
      return;
    }

    var asWatcher = role === 'spectator';
    clearTimers();
    if (state === 'queue') cancelQueue();
    if (socket) {
      closedByUs = true;
      try { socket.close(); } catch (e) { /* ignore */ }
      socket = null;
    }

    mode = 'room';
    watching = asWatcher;
    autoWatched = false;
    matchId = entry.id;
    roomCode = entry.code;
    me = asWatcher ? '' : ((Account.user() && Account.user().username) || '');
    opponent = '';
    myScore = oppScore = 0;
    watchPlayers = [];
    spectatorCount = 0;
    seed = '';
    started = false;
    rematchSent = false;
    closedByUs = false;
    reconnects = 0;
    pendingFinish = null;
    els.roomInput.value = entry.code || entry.id;
    els.hudTag.textContent = asWatcher ? 'WATCH' : 'ROOM';
    setState(asWatcher ? 'watching' : 'matched');
    setStatus(asWatcher ? 'Connecting to watch…' : 'Joining the room…');
    ticket = null;

    connectTimer = setTimeout(function () {
      if ((state === 'matched' || state === 'watching') && !opponent) {
        setStatus(asWatcher ? 'Room not answering yet. The link may be new or wrong.' : 'Room is not answering. Leave and try again.');
      }
    }, 20000);

    fetchTicket(asWatcher).then(function () {
      connect();
    }).catch(function (err) {
      fail(err && err.message ? err.message : 'Could not reach the match service.');
    });
  }

  function copyInvite() {
    var link = inviteLink();
    if (!link) return;
    var done = function () {
      els.shareCopy.textContent = 'copied';
      setTimeout(function () { els.shareCopy.textContent = 'copy link'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(function () { fallbackCopy(link, done); });
    } else {
      fallbackCopy(link, done);
    }
  }

  function fallbackCopy(text, done) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    area.remove();
  }

  function clearInviteParam() {
    try {
      var url = new URL(location.href);
      if (!url.searchParams.has('room')) return;
      url.searchParams.delete('room');
      history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
    } catch (e) { /* ignore */ }
  }

  /* ---------- socket ---------- */

  function connect() {
    if (!ticket || !endpoints) return;
    var url = endpoints.socket + '/' + encodeURIComponent(matchId) + '/ws?ticket=' + encodeURIComponent(ticket) +
      '&role=' + (watching ? 'spectator' : 'player') +
      (mode === 'room' ? '&mode=room' : '');
    try {
      socket = new WebSocket(url);
    } catch (err) {
      fail('Could not open the match socket.');
      return;
    }

    socket.addEventListener('message', function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      handle(msg);
    });

    socket.addEventListener('close', function () {
      if (closedByUs) return;
      if (state === 'idle' || state === 'lobby' || state === 'queue' || state === 'result') return;
      if (reconnects < 3) {
        reconnects++;
        setStatus('Connection dropped. Reconnecting…');
        setTimeout(connect, 800 * reconnects);
        return;
      }
      fail('Connection lost. Rejoin from the menu.');
    });
  }

  function handle(msg) {
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'state') {
      reconnects = 0;
      if (watching && connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (msg.spectator) {
        watching = true;
        me = '';
        autoWatched = !!msg.auto;
        if (autoWatched && state !== 'result') {
          setStatus('The room already has two players. You are watching live.');
        }
      } else if (msg.you && msg.you.name) {
        me = msg.you.name;
      }
      if (pendingFinish && state === 'playing') {
        if (send(pendingFinish)) pendingFinish = null;
      }
      applyMatch(msg.match || {});
      return;
    }

    if (msg.type === 'peer') {
      if (watching) return;
      if (msg.player && msg.player.name) {
        opponent = msg.player.name;
        clearTimers();
        if (state === 'matched') setStatus('Opponent connected. Tap READY.');
        render();
      }
      return;
    }

    if (msg.type === 'countdown') {
      if (msg.seed) matchSeed = msg.seed;
      if (watching) {
        if (state !== 'watching') setState('watching');
        setStatus('LIVE · ROUND 1');
        watchPlayers.forEach(function (p) { p.round = 1; p.deal = 0; });
        renderWatchBoards();
        return;
      }
      if (started) return;
      seed = msg.seed || seed;
      startMatch();
      return;
    }

    if (msg.type === 'solved' || msg.type === 'churn') {
      var eventRound = Math.max(1, Number(msg.round) || 1);
      var eventDeal = Math.max(0, Number(msg.deal) || 0);
      if (watching) {
        watchPlayers.forEach(function (p) {
          p.round = eventRound;
          p.deal = eventDeal + 1;
          if (msg.scores && msg.scores[p.name] != null) p.score = Number(msg.scores[p.name]) || 0;
          else if (msg.type === 'solved' && p.name === msg.from) p.score = Number(msg.score) || p.score;
        });
        setStatus('LIVE · ROUND ' + eventRound);
        renderWatchBoards();
        render();
        return;
      }
      if (msg.from && msg.from !== me) opponent = msg.from;
      /* The server echo is what settles the race: only the winner's pending
         points are applied, and the loser's board advances without scoring. */
      var mine = msg.type === 'solved' && (msg.winner === me || (!msg.winner && msg.from === me));
      var live = window.TileRush && TileRush.state ? TileRush.state() : null;
      if (window.TileRush && TileRush.duelAdvance && live && live.state === 'playing' && Number(live.round) === eventRound) {
        TileRush.duelAdvance(eventDeal, mine);
      }
      if (msg.scores) applyScores(msg.scores);
      return;
    }

    if (msg.type === 'scores') {
      applyScores(msg.scores || {});
      return;
    }

    if (msg.type === 'deal_closed') {
      if (msg.scores) applyScores(msg.scores);
      return;
    }

    if (msg.type === 'progress') {
      if (watching) {
        var target = null;
        for (var w = 0; w < watchPlayers.length; w++) {
          if (watchPlayers[w].name === msg.from) target = watchPlayers[w];
        }
        if (target) {
          target.score = Number(msg.score) || 0;
          target.round = Number(msg.round) || target.round;
          target.deal = Number(msg.deal) || 0;
          target.correct = Number(msg.correct) || 0;
          target.wrong = Number(msg.wrong) || 0;
          target.misses = Number(msg.misses) || 0;
          target.streak = Number(msg.streak) || 0;
        }
        if (msg.scores) {
          watchPlayers.forEach(function (p) {
            if (msg.scores[p.name] != null) p.score = Number(msg.scores[p.name]) || 0;
          });
        }
        if (state === 'watching') {
          setStatus('LIVE · ROUND ' + (Number(msg.round) || 1));
          render();
          renderWatchBoards();
        }
        return;
      }
      if (msg.from === me) return;
      if (msg.from) opponent = msg.from;
      if (msg.scores) applyScores(msg.scores);
      else oppScore = Number(msg.score) || 0;
      updateHud();
      return;
    }

    if (msg.type === 'emote') {
      if (msg.from === me) return;
      bubble(msg.from || 'OPPONENT', msg.emoji, msg.text, msg.id);
      return;
    }

    if (msg.type === 'result') {
      if (watching) finishWatch(msg);
      else finishMatch(msg);
      return;
    }

    if (msg.type === 'spectators') {
      spectatorCount = Number(msg.count) || 0;
      if (state === 'matched' || state === 'watching') render();
      return;
    }

    if (msg.type === 'peer_left') {
      if (state === 'playing' || state === 'matched' || state === 'watching') {
        setStatus((msg.player || 'Opponent') + ' left the room.');
      }
      return;
    }

    if (msg.type === 'error') {
      if (msg.code === 'ticket_required') fail('Your match ticket expired. Sign in again.');
      else if (msg.code === 'match_full') fail('That match is already full.');
      else if (msg.code === 'spectator_full') fail('This room has reached its spectator limit.');
      else if (msg.code === 'read_only') setStatus('Spectators cannot send game actions.');
      else if (msg.code === 'players_only') fail('Spectator tickets cannot join the queue.');
    }
  }

  function applyWatch(match) {
    if (match.code) roomCode = match.code;
    spectatorCount = Number(match.spectators) || 0;
    if (match.seed) matchSeed = match.seed;
    watchPlayers = (Array.isArray(match.players) ? match.players : []).map(function (p) {
      return {
        name: p.name,
        score: Number(p.score) || 0,
        bpi: Number(p.bpi) || 0,
        done: !!p.done,
        round: Number(p.round) || 0,
        deal: Number(p.deal) || 0,
        correct: Number(p.correct) || 0,
        wrong: Number(p.wrong) || 0,
        misses: Number(p.misses) || 0,
        streak: Number(p.streak) || 0
      };
    });

    if (match.status === 'result') {
      finishWatch({ winner: match.winner, players: match.players || [] });
      return;
    }

    if (state !== 'watching') setState('watching');
    else render();

    if (match.status === 'open') {
      setStatus('Waiting for two players. Share the invite link.');
    } else if (match.status === 'countdown') {
      setStatus('LIVE · ROUND 1');
    } else {
      setStatus('LIVE · ROUND ' + (Number(match.round) || 1));
    }
  }

  /* Two live mirrors: each player's current deterministic deal, rebuilt from
     (seed, round, deal) so spectators see the rounds as they happen. */
  function renderWatchBoards() {
    if (!els.watchBoards) return;
    if (!watching) {
      els.watchBoards.hidden = true;
      if (els.watchSwitch) els.watchSwitch.hidden = true;
      return;
    }
    els.watchBoards.hidden = false;
    if (els.watchSwitch) {
      els.watchSwitch.hidden = false;
      var tabs = els.watchSwitch.querySelectorAll('.watch-tab');
      for (var t = 0; t < tabs.length; t++) {
        var slot = Number(tabs[t].getAttribute('data-slot')) || 0;
        var tabPlayer = watchPlayers[slot];
        tabs[t].textContent = 'P' + (slot + 1) + ' · ' +
          (tabPlayer ? tabPlayer.name : 'WAITING') + ' · ' +
          fmt(tabPlayer ? tabPlayer.score : 0);
        tabs[t].classList.toggle('active', watchFocus === slot);
      }
    }
    els.watchBoards.classList.toggle('focus-0', watchFocus === 0);
    els.watchBoards.classList.toggle('focus-1', watchFocus === 1);
    var TS = window.TILE_SHAPES;
    var boardsHtml = [];
    var metricsHtml = [];
    for (var i = 0; i < 2; i++) {
      var p = watchPlayers[i] || null;
      var round = p && p.round ? Math.min(3, Math.max(1, p.round)) : 1;
      var deal = p ? Math.max(0, p.deal || 0) : 0;
      var board = (matchSeed && window.TileRush && TileRush.boardAt)
        ? TileRush.boardAt(matchSeed, round, deal)
        : null;
      var attempts = p ? (p.correct + p.wrong + p.misses) : 0;
      var accLabel = attempts ? Math.round((p.correct / attempts) * 100) + '%' : '\u2014';
      var size = board ? board.size : (round === 1 ? 3 : round === 2 ? 4 : 5);
      var tiles = '';
      if (board && TS) {
        for (var k = 0; k < board.cells.length; k++) {
          var cell = board.cells[k];
          tiles += '<i class="watch-tile' + (k === board.goalIndex ? ' goal-cell' : '') + '">' +
            TS.shapeSvg(cell.shape, cell.color) + '</i>';
        }
      } else {
        tiles = '<span class="watch-wait">Waiting for the first deal…</span>';
      }
      var goal = board && TS
        ? '<span class="watch-target" style="--tint:' + board.goal.color.hex + '">' +
            TS.shapeSvg(board.goal.shape, board.goal.color) +
          '</span><em>' + board.goal.shape.id + ' · ' + board.goal.color.id + '</em>'
        : '<em>target loads with the run</em>';

      metricsHtml[i] = '<aside class="watch-metrics" data-slot="' + i + '">' +
        '<span class="watch-metrics-tag"><i class="watch-live-dot"></i>PLAYER ' + (i + 1) + '</span>' +
        '<b class="watch-metrics-name">' + (p ? escName(p.name) : 'WAITING') + '</b>' +
        '<div class="watch-metric"><span>SCORE</span><b>' + fmt(p ? p.score : 0) + '</b></div>' +
        '<div class="watch-metric"><span>ROUND</span><b>' + round + ' / 3</b></div>' +
        '<div class="watch-metric"><span>DEAL</span><b>#' + (deal + 1) + '</b></div>' +
        '<div class="watch-metric"><span>ACCURACY</span><b>' + accLabel + '</b></div>' +
        '<div class="watch-metric"><span>STREAK</span><b>\u00d7' + (p ? p.streak : 0) + '</b></div>' +
        '<div class="watch-metric"><span>MISSES</span><b>' + (p ? p.misses : 0) + '</b></div>' +
        '<div class="watch-metric"><span>HITS</span><b>' + (p ? p.correct : 0) + '</b></div>' +
        (p && p.done ? '<span class="watch-done">DONE</span>' : '') +
      '</aside>';

      boardsHtml[i] = '<div class="watch-board" data-slot="' + i + '">' +
        '<div class="watch-head">' +
          '<div><span class="watch-tag">PLAYER ' + (i + 1) + '</span>' +
          '<b class="watch-name">' + (p ? escName(p.name) : 'WAITING') + '</b></div>' +
          '<b class="watch-score">' + fmt(p ? p.score : 0) + '</b>' +
        '</div>' +
        '<div class="watch-meta">' +
          '<span>R' + round + ' · ' + size + '×' + size + '</span>' +
          '<span>' + accLabel + ' acc</span>' +
          '<span>#' + (deal + 1) + '</span>' +
          '<span>\u00d7' + (p ? p.streak : 0) + ' streak</span>' +
          '<span>' + (p ? p.correct : 0) + ' hits</span>' +
          '<span>' + (p ? p.misses : 0) + ' misses</span>' +
          (p && p.done ? '<span class="watch-done">DONE</span>' : '') +
        '</div>' +
        '<div class="watch-goal">' + goal + '</div>' +
        '<div class="watch-grid" data-n="' + size + '">' + tiles + '</div>' +
      '</div>';
    }
    els.watchBoards.innerHTML = metricsHtml[0] + boardsHtml[0] + boardsHtml[1] + metricsHtml[1];
  }

  function escName(value) {
    return String(value || '').replace(/[<>&"]/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c];
    });
  }

  function finishWatch(msg) {
    clearTimers();
    var players = Array.isArray(msg.players) ? msg.players : [];
    watchPlayers = players.map(function (p) {
      return {
        name: p.name,
        score: Number(p.score) || 0,
        bpi: Number(p.bpi) || 0,
        done: true,
        round: 3,
        deal: 0,
        correct: 0,
        wrong: 0,
        misses: 0,
        streak: 0
      };
    });
    var a = watchPlayers[0];
    var b = watchPlayers[1];
    var winner = msg.winner;
    els.kicker.textContent = 'SPECTATING · ' + (roomCode ? 'ROOM ' + roomCode : String(matchId).slice(0, 8).toUpperCase());
    els.title.textContent = winner == null ? 'DRAW' : String(winner).toUpperCase() + ' WINS';
    els.lede.textContent = a && b
      ? a.name + ' ' + fmt(a.score) + ' · ' + b.name + ' ' + fmt(b.score)
      : 'The room finished.';
    setStatus(winner == null ? 'Dead heat.' : winner + ' takes it.');
    setState('result');
    showHud(false);
    syncEmotes();
  }

  function applyMatch(match) {
    if (watching) return applyWatch(match);
    if (match.code) roomCode = match.code;
    if (match.spectators != null) spectatorCount = Number(match.spectators) || 0;
    var players = Array.isArray(match.players) ? match.players : [];
    if (!me) {
      var you = players.find(function (p) { return p.connected; });
      if (you) me = you.name;
    }
    var other = players.find(function (p) { return p.name !== me; });
    if (other) {
      opponent = other.name;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    }
    if (match.seed) seed = match.seed;

    if (match.status === 'result' && state !== 'result') {
      finishMatch({ winner: match.winner, players: players });
      return;
    }

    if (match.status === 'open') {
      if (state === 'result' || state === 'playing') {
        started = false;
        rematchSent = false;
        myScore = 0;
        oppScore = 0;
        startMatchCleanup();
        setState('matched');
        setStatus('Rematch accepted. Tap READY.');
      } else if (players.length >= 2) {
        if (state !== 'matched') setState('matched');
        else render();
      } else if (state !== 'matched') {
        setState('matched');
        setStatus('Waiting for an opponent to join…');
      } else {
        render();
      }
      return;
    }

    if (match.status === 'countdown' || match.status === 'playing') {
      if (!started) startMatch();
      return;
    }
  }

  function startMatch() {
    if (started) return;
    started = true;
    clearTimers();
    myScore = 0;
    oppScore = 0;
    els.hudTag.textContent = mode === 'ghost' ? 'GHOST' : mode === 'room' ? 'ROOM' : '1V1';
    els.hud.classList.toggle('ghost', mode === 'ghost');
    updateHud();
    setState('playing');
    showHud(true);
    if (window.TileRush && TileRush.startDuel) TileRush.startDuel(seed, opponent);
  }

  function startMatchCleanup() {
    showHud(false);
    syncEmotes();
  }

  function updateHud() {
    els.hudYou.textContent = fmt(myScore);
    els.hudOpp.textContent = fmt(oppScore);
    els.hudName.textContent = opponent ? opponent.toUpperCase().slice(0, 10) : 'OPP';
  }

  /* The server owns both scores. Adopt them verbatim so a rejected late solve
     cannot leave this client showing points the match did not award. */
  function applyScores(scores) {
    if (!scores) return;
    if (me && scores[me] != null) myScore = Number(scores[me]) || 0;
    if (opponent && scores[opponent] != null) oppScore = Number(scores[opponent]) || 0;
    else if (me) {
      Object.keys(scores).forEach(function (name) {
        if (name !== me) oppScore = Number(scores[name]) || 0;
      });
    }
    if (window.TileRush && TileRush.setScore && me && scores[me] != null) {
      TileRush.setScore(scores[me]);
    }
    updateHud();
  }

  function finishMatch(msg) {
    clearTimers();
    var players = Array.isArray(msg.players) ? msg.players : [];
    var mine = players.find(function (p) { return p.name === me; });
    var theirs = players.find(function (p) { return p.name !== me; });
    if (mine) {
      myScore = Number(mine.score) || 0;
      if (window.TileRush && TileRush.setScore) TileRush.setScore(myScore);
    }
    if (theirs) {
      oppScore = Number(theirs.score) || 0;
      opponent = theirs.name;
    }

    var winner = msg.winner;
    var title = winner === null ? 'DRAW' : winner === me ? 'VICTORY' : 'DEFEAT';
    els.kicker.textContent = '1V1 · RESULT';
    els.title.textContent = title;
    els.lede.textContent = winner === null
      ? 'Dead heat. Both players scored the same.'
      : winner === me
        ? 'You out-scored ' + (opponent || 'the opponent') + '.'
        : (opponent || 'The opponent') + ' edged you out this time.';
    setStatus('You ' + fmt(myScore) + ' · ' + (opponent || 'opponent') + ' ' + fmt(oppScore));
    rematchSent = false;
    setState('result');
    showHud(false);
    syncEmotes();
  }

  /* ---------- game hooks ---------- */

  function send(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try { socket.send(JSON.stringify(payload)); return true; } catch (e) { return false; }
  }

  function progress(data) {
    if (state !== 'playing') return;
    myScore = Number(data.score) || 0;
    updateHud();
    if (mode === 'ghost') return;
    send({
      type: 'progress',
      round: data.round,
      correct: data.correct,
      wrong: data.wrong,
      misses: data.misses,
      streak: data.streak,
      deal: data.deal,
      score: myScore
    });
  }

  function finish(data) {
    if (state !== 'playing') return;
    myScore = Number(data.score) || 0;
    updateHud();
    if (mode === 'ghost') { ghostResult(); return; }
    setStatus('Run complete. Waiting for ' + (opponent || 'the opponent') + '…');
    var payload = { type: 'finish', score: myScore, bpi: Number(data.bpi) || 0 };
    if (!send(payload)) pendingFinish = payload;
  }

  function round() {
    els.emotes.hidden = true;
  }

  function breakStart() {
    if (state === 'playing' && (mode === 'duel' || mode === 'room')) els.emotes.hidden = false;
  }

  function bubble(name, emoji, text, id) {
    var face = String(emoji || '').trim();
    var label = String(text || '').trim();
    if (!label && id) label = String(id).replace(/_/g, ' ');
    if (!label && !face) return;
    var node = document.createElement('div');
    node.className = 'duel-bubble';
    var who = document.createElement('b');
    who.textContent = String(name).toUpperCase();
    node.appendChild(who);
    node.appendChild(document.createTextNode(' ' + (face ? face + ' ' : '') + label));
    els.feed.appendChild(node);
    setTimeout(function () { node.remove(); }, 3000);
  }

  /* ---------- actions ---------- */

  function ready() {
    if (state !== 'matched') return;
    send({ type: 'ready', ready: true });
    els.primary.disabled = true;
    els.primary.textContent = 'WAITING FOR OPPONENT';
    setStatus('Ready. Starting when both players are ready.');
  }

  function rematch() {
    if (state !== 'result') return;
    if (rematchSent) return;
    rematchSent = true;
    send({ type: 'rematch' });
    render();
    setStatus('Rematch requested. Waiting for ' + (opponent || 'the opponent') + '…');
  }

  function cancelQueue() {
    clearTimers();
    /* Tell the queue to drop the ticket so it cannot pair us after we left. */
    if (ticket && endpoints && endpoints.queue) {
      fetch(endpoints.queue, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: ticket, leave: true })
      }).catch(function () { /* best effort */ });
    }
    setState('lobby');
    setStatus('Search cancelled. Queue again when you are ready.');
  }

  function leave() {
    closedByUs = true;
    clearTimers();
    if (socket) {
      try { socket.close(); } catch (e) { /* ignore */ }
      socket = null;
    }
    state = 'idle';
    mode = 'duel';
    watching = false;
    autoWatched = false;
    started = false;
    rematchSent = false;
    pendingFinish = null;
    ghost = null;
    ghostTrack = null;
    roomCode = '';
    spectatorCount = 0;
    watchPlayers = [];
    me = opponent = matchId = seed = '';
    myScore = oppScore = 0;
    els.hudTag.textContent = '1V1';
    els.primary.hidden = false;
    clearInviteParam();
    showScreen(false);
    showHud(false);
    els.emotes.hidden = true;
    if (window.TileRush && TileRush.toMenu) TileRush.toMenu();
  }

  function primary() {
    if (state === 'idle' || state === 'lobby') {
      if (!signedIn()) {
        if (window.TileRush && TileRush.openAuth) TileRush.openAuth(false);
        return;
      }
      if (mode === 'room') { joinRoom(); return; }
      startQueue();
      return;
    }
    if (state === 'queue') { cancelQueue(); return; }
    if (state === 'matched') { ready(); return; }
    if (state === 'result') {
      if (watching) return;
      if (mode === 'ghost') goGhost();
      else rematch();
      return;
    }
  }

  function open() {
    if (state !== 'idle') return;
    mode = 'duel';
    watching = false;
    paintEmoteBars();
    roomCode = '';
    matchId = '';
    clearInviteParam();
    els.hudTag.textContent = '1V1';
    if (!signedIn()) {
      setState('lobby');
      setStatus('Sign in to queue. Accounts keep matches fair and rated.');
      els.primary.textContent = 'SIGN IN';
      return;
    }
    setState('lobby');
  }

  /* ---------- wiring ---------- */

  els.primary.addEventListener('click', primary);
  els.cancel.addEventListener('click', function () {
    if (state === 'queue') cancelQueue();
    else leave();
  });
  els.enter.addEventListener('click', open);
  els.ghostEntry.addEventListener('click', goGhost);
  els.ghostBtn.addEventListener('click', goGhost);
  els.roomCreate.addEventListener('click', createRoom);
  els.roomJoin.addEventListener('click', joinRoom);
  els.roomWatch.addEventListener('click', watchRoom);
  if (els.watchSwitch) {
    els.watchSwitch.addEventListener('click', function (event) {
      var btn = event.target.closest ? event.target.closest('.watch-tab') : null;
      if (!btn) return;
      watchFocus = Number(btn.getAttribute('data-slot')) === 1 ? 1 : 0;
      renderWatchBoards();
    });
  }
  els.roomInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      joinRoom();
    }
  });
  els.shareCopy.addEventListener('click', copyInvite);

  function onEmoteClick(event) {
    var button = event.target.closest ? event.target.closest('button[data-emote-index]') : null;
    if (!button) return;
    var preset = emoteList()[Number(button.getAttribute('data-emote-index'))];
    if (!preset) return;
    if (send({ type: 'emote', emoji: preset.emoji, text: preset.text })) {
      bubble('YOU', preset.emoji, preset.text);
    }
  }
  if (els.emotes) els.emotes.addEventListener('click', onEmoteClick);
  if (els.lobbyEmotes) els.lobbyEmotes.addEventListener('click', onEmoteClick);
  paintEmoteBars();

  /* Invite links: /?room=CODE opens this lobby with the code filled in. */
  var invited = new URLSearchParams(location.search).get('room');
  if (invited) {
    if (window.Account && Account.ready) Account.ready().then(function () { openRoom(invited); });
    else openRoom(invited);
  }

  window.Duel = {
    refreshEmotes: function () { paintEmoteBars(); syncEmotes(); },
    open: open,
    ghost: goGhost,
    openRoom: openRoom,
    watchRoom: watchRoom,
    room: function () { return { state: state, mode: mode, watching: watching, code: roomCode, id: matchId }; },
    active: function () { return state !== 'idle'; },
    primary: primary,
    leave: leave,
    progress: progress,
    solved: function (data) {
      if (mode === 'ghost') {
        /* Ghost races are local: confirm the read immediately. */
        if (window.TileRush && TileRush.duelAdvance) TileRush.duelAdvance(data.deal, true);
        return;
      }
      if (state !== 'playing') return;
      send({
        type: 'solved',
        round: data.round,
        deal: data.deal,
        points: Number(data.points) || 0
      });
    },
    penalty: function (data) {
      if (mode === 'ghost' || state !== 'playing') return;
      send({
        type: 'penalty',
        round: data.round,
        deal: data.deal,
        amount: Number(data.amount) || 0
      });
    },
    churn: function (data) {
      if (mode === 'ghost' || state !== 'playing') return;
      send({
        type: 'churn',
        round: data.round,
        deal: data.deal
      });
    },
    finish: finish,
    round: round,
    break: breakStart,
    closed: function () {
      if (state === 'idle') return;
      closedByUs = true;
      clearTimers();
      if (socket) { try { socket.close(); } catch (e) { /* ignore */ } socket = null; }
      state = 'idle';
      mode = 'duel';
      watching = false;
      autoWatched = false;
      started = false;
      rematchSent = false;
      pendingFinish = null;
      ghost = null;
      ghostTrack = null;
      roomCode = '';
      spectatorCount = 0;
      watchPlayers = [];
      me = opponent = matchId = seed = '';
      myScore = oppScore = 0;
      els.hudTag.textContent = '1V1';
      els.primary.hidden = false;
      clearInviteParam();
      showScreen(false);
      showHud(false);
      els.emotes.hidden = true;
    }
  };
})();
