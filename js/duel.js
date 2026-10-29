/* TILE RUSH — 1v1 client.
 *
 * Flow: signed-in player asks the Vercel API for a short-lived ticket, polls
 * the Cloudflare queue with it, then opens the match socket. Both players ready
 * up, the server starts a shared 3-second countdown, and each client runs the
 * normal three-round game on the same seeded boards. Scores stream to the
 * opponent, emotes are available during the 5-second breaks, and the server
 * decides the winner.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    screen: $('duelScreen'), kicker: $('duelKicker'), badge: $('duelBadge'),
    title: $('duelTitle'), lede: $('duelLede'), status: $('duelStatus'), note: $('duelNote'),
    versus: $('duelVersus'), you: $('duelYou'), opp: $('duelOpp'),
    youScore: $('duelYouScore'), oppScore: $('duelOppScore'),
    primary: $('duelPrimary'), cancel: $('duelCancel'),
    hud: $('duelHud'), hudYou: $('duelHudYou'), hudOpp: $('duelHudOpp'), hudName: $('duelHudName'),
    feed: $('duelFeed'), emotes: $('duelEmotes'), enter: $('duelBtn')
  };

  var state = 'idle';            // idle | lobby | queue | matched | playing | result
  var ticket = null;
  var endpoints = null;
  var socket = null;
  var pollTimer = null;
  var clockTimer = null;
  var connectTimer = null;
  var queueStart = 0;
  var matchId = '';
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
  }

  function showHud(on) {
    els.hud.hidden = !on;
  }

  function syncEmotes() {
    els.emotes.hidden = !(state === 'playing');
  }

  function setState(next) {
    state = next;
    render();
    syncEmotes();
  }

  function render() {
    var on = state !== 'idle' && state !== 'playing';
    showScreen(on);
    if (state === 'idle') {
      showHud(false);
      return;
    }

    els.badge.textContent = state === 'result' ? 'MATCH COMPLETE' : 'RATED RUN';
    els.cancel.hidden = state === 'queue';
    els.primary.disabled = false;

    if (state === 'lobby') {
      els.kicker.textContent = '1V1 · LIVE DUEL';
      els.title.textContent = 'DUEL';
      els.lede.textContent = 'Same three rounds. Same boards. Two players, one clock.';
      els.versus.hidden = true;
      els.primary.textContent = 'FIND MATCH';
      els.cancel.textContent = 'BACK';
      setStatus(signedIn() ? 'You are signed in. Queue up against a player near your rating.'
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
      els.note.textContent = 'The queue waits two minutes for an opponent. If nobody arrives, try again later.';
      return;
    }

    if (state === 'matched') {
      els.kicker.textContent = 'MATCH FOUND';
      els.title.textContent = 'READY UP';
      els.lede.textContent = 'Both players ready and the clock starts together.';
      els.versus.hidden = false;
      els.you.textContent = me || 'YOU';
      els.opp.textContent = opponent || 'WAITING';
      els.youScore.textContent = fmt(myScore);
      els.oppScore.textContent = fmt(oppScore);
      els.primary.textContent = rematchSent ? 'REMATCH REQUESTED' : 'READY';
      els.primary.disabled = rematchSent;
      els.cancel.textContent = 'LEAVE';
      if (!rematchSent) setStatus('Tap READY when you want the countdown to start.');
      els.note.textContent = 'Rounds start after both players are ready. Emotes unlock in the breaks.';
      return;
    }

    if (state === 'result') {
      els.versus.hidden = false;
      els.you.textContent = me || 'YOU';
      els.opp.textContent = opponent || 'OPPONENT';
      els.youScore.textContent = fmt(myScore);
      els.oppScore.textContent = fmt(oppScore);
      els.primary.textContent = rematchSent ? 'REMATCH REQUESTED' : 'REMATCH';
      els.primary.disabled = rematchSent;
      els.cancel.textContent = 'LEAVE';
      els.note.textContent = 'Both runs are rated and saved to your season stats.';
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
  }

  function startQueue() {
    if (!signedIn()) {
      setState('lobby');
      setStatus('Sign in to play 1v1.');
      els.primary.textContent = 'SIGN IN';
      return;
    }
    clearTimers();
    rematchSent = false;
    closedByUs = false;
    reconnects = 0;
    setState('queue');
    if (!ticket || !endpoints) {
      setStatus('Issuing match ticket…');
    }
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

  function fetchTicket() {
    return Account.duelTicket().then(function (data) {
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

  /* ---------- socket ---------- */

  function connect() {
    if (!ticket || !endpoints) return;
    var url = endpoints.socket + '/' + encodeURIComponent(matchId) + '/ws?ticket=' + encodeURIComponent(ticket);
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
      if (msg.you && msg.you.name) me = msg.you.name;
      if (pendingFinish && state === 'playing') {
        if (send(pendingFinish)) pendingFinish = null;
      }
      applyMatch(msg.match || {});
      return;
    }

    if (msg.type === 'peer') {
      if (msg.player && msg.player.name) {
        opponent = msg.player.name;
        clearTimers();
        if (state === 'matched') setStatus('Opponent connected. Tap READY.');
        render();
      }
      return;
    }

    if (msg.type === 'countdown') {
      if (started) return;
      seed = msg.seed || seed;
      startMatch();
      return;
    }

    if (msg.type === 'progress') {
      if (msg.from === me) return;
      oppScore = Number(msg.score) || 0;
      if (msg.from) opponent = msg.from;
      updateHud();
      return;
    }

    if (msg.type === 'emote') {
      if (msg.from === me) return;
      bubble(msg.from || 'OPPONENT', msg.id);
      return;
    }

    if (msg.type === 'result') {
      finishMatch(msg);
      return;
    }

    if (msg.type === 'peer_left') {
      if (state === 'playing' || state === 'matched') {
        setStatus((msg.player || 'Opponent') + ' left the match.');
      }
      return;
    }

    if (msg.type === 'error') {
      if (msg.code === 'ticket_required') fail('Your match ticket expired. Sign in again.');
      else if (msg.code === 'match_full') fail('That match is already full.');
    }
  }

  function applyMatch(match) {
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

  function finishMatch(msg) {
    clearTimers();
    var players = Array.isArray(msg.players) ? msg.players : [];
    var mine = players.find(function (p) { return p.name === me; });
    var theirs = players.find(function (p) { return p.name !== me; });
    if (mine) myScore = Number(mine.score) || 0;
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
    send({ type: 'progress', round: data.round, correct: data.correct, score: myScore });
  }

  function finish(data) {
    if (state !== 'playing') return;
    myScore = Number(data.score) || 0;
    updateHud();
    setStatus('Run complete. Waiting for ' + (opponent || 'the opponent') + '…');
    var payload = { type: 'finish', score: myScore, bpi: Number(data.bpi) || 0 };
    if (!send(payload)) pendingFinish = payload;
  }

  function round() {
    els.emotes.hidden = true;
  }

  function breakStart() {
    if (state === 'playing') els.emotes.hidden = false;
  }

  function bubble(name, id) {
    var label = String(id || '').replace(/_/g, ' ').toUpperCase();
    var node = document.createElement('div');
    node.className = 'duel-bubble';
    node.textContent = String(name).toUpperCase() + ' · ' + label;
    els.feed.appendChild(node);
    setTimeout(function () { node.remove(); }, 2600);
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
    started = false;
    rematchSent = false;
    pendingFinish = null;
    me = opponent = matchId = seed = '';
    myScore = oppScore = 0;
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
      startQueue();
      return;
    }
    if (state === 'queue') { cancelQueue(); return; }
    if (state === 'matched') { ready(); return; }
    if (state === 'result') { rematch(); return; }
  }

  function open() {
    if (state !== 'idle') return;
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

  els.emotes.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('button[data-emote]') : null;
    if (!button) return;
    var id = button.getAttribute('data-emote');
    if (send({ type: 'emote', id: id })) bubble('YOU', id);
  });

  window.Duel = {
    open: open,
    active: function () { return state !== 'idle'; },
    primary: primary,
    leave: leave,
    progress: progress,
    finish: finish,
    round: round,
    break: breakStart,
    closed: function () {
      if (state === 'idle') return;
      closedByUs = true;
      clearTimers();
      if (socket) { try { socket.close(); } catch (e) { /* ignore */ } socket = null; }
      state = 'idle';
      started = false;
      rematchSent = false;
      pendingFinish = null;
      me = opponent = matchId = seed = '';
      myScore = oppScore = 0;
      showScreen(false);
      showHud(false);
      els.emotes.hidden = true;
    }
  };
})();
