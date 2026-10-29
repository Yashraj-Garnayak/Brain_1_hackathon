/* TILE RUSH — 1v1 / room Durable Object.
 *
 * One DO instance per match id. A queue match holds up to two players. A room
 * (`room-CODE`) holds two players plus up to 20 read-only spectators; the first
 * two players to connect take the slots, everyone after that watches. Sockets
 * use the hibernation API, so an idle room costs nothing.
 *
 * Identity is never trusted from the socket payload: the Worker verifies the
 * Vercel-signed match ticket and passes `x-tr-uid` / `x-tr-name` / `x-tr-role`
 * headers. Spectator tickets cannot claim a player slot, and spectators cannot
 * send ready/progress/finish/emote/rematch messages.
 *
 * Protocol (client -> server):
 *   ready    { ready: true }
 *   progress { round, correct, wrong?, misses?, streak?, deal?, score, bpi? }
 *   solved   { round, deal, score }             // this board was solved; advance both
 *   churn    { round, deal }                    // board timed out; advance both
 *   finish   { score, bpi }
 *   emote    { id }                            // client sends these in breaks
 *   rematch  {}
 *   ping     {}
 *   join     {}                                // legacy no-op, identity is fixed
 *
 * Server -> client:
 *   state      { match, you, spectator? }
 *   peer       { player }
 *   countdown  { startsAt, round, seed, players }
 *   progress   { from, round, correct, wrong, misses, streak, deal, score }
 *   solved     { from, round, deal, score }     // lockstep board advance
 *   churn      { from, round, deal }            // lockstep timeout advance
 *   emote      { from, id }
 *   result     { winner, players }
 *   peer_left  { player }
 *   spectators { count }
 *   pong       { now }
 *   error      { code }
 */

const MAX_PLAYERS = 2;
const MAX_SPECTATORS = 20;
const MAX_MESSAGE = 4096;
const MAX_SCORE = 10_000_000;
const LEGACY_EMOTES = new Set(['gg', 'wave', 'nice', 'oops', 'focus', 'rematch']);
const MAX_EMOTE_EMOJI = 8;
const MAX_EMOTE_TEXT = 24;
const EMOTE_COOLDOWN_MS = 900;
const ROUNDS = 3;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function score(value) {
  return Math.max(0, Math.min(MAX_SCORE, Number(value) || 0));
}

/* Player-authored emotes are untrusted text: strip control characters and
   markup punctuation, then cap the length. Empty pairs are ignored. */
function cleanEmote(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max);
}

function newSeed() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function cleanCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

export class MatchRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.match = null;
  }

  async load(init) {
    if (this.match) return this.match;
    const stored = await this.state.storage.get('match');
    this.match = stored || {
      status: 'open',
      round: 0,
      startsAt: 0,
      seed: newSeed(),
      winner: null,
      players: [],
      spectators: [],
      resolved: {},
      kind: 'duel',
      code: null,
      updatedAt: Date.now()
    };
    if (!this.match.seed) this.match.seed = newSeed();
    if (!Array.isArray(this.match.players)) this.match.players = [];
    if (!Array.isArray(this.match.spectators)) this.match.spectators = [];
    if (!this.match.kind) this.match.kind = 'duel';
    if (!this.match.resolved || typeof this.match.resolved !== 'object') this.match.resolved = {};

    /* Kind is fixed when the object is first created. Watching a queue match
       by id must not relabel it as a room. */
    if (init) {
      if (!stored) {
        this.match.kind = init.kind;
        this.match.code = init.code || null;
      } else if (this.match.kind === 'room' && !this.match.code) {
        this.match.code = init.code;
      }
    }

    /* Hibernation drops no sockets, but it does drop in-memory flags. Derive
       connectivity from the live sockets instead of resetting everyone, and
       forget spectators whose socket is gone. */
    const players = new Set();
    const watchers = new Set();
    for (const ws of this.sockets()) {
      const attachment = ws.deserializeAttachment();
      if (!attachment || !attachment.uid) continue;
      if (attachment.role === 'spectator') watchers.add(attachment.uid);
      else players.add(attachment.uid);
    }
    for (const player of this.match.players) player.connected = players.has(player.uid);
    this.match.spectators = this.match.spectators.filter((s) => watchers.has(s.uid));
    return this.match;
  }

  async save() {
    this.match.updatedAt = Date.now();
    await this.state.storage.put('match', this.match);
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'upgrade_required' }, 426);
    }

    const uid = request.headers.get('x-tr-uid');
    let name = request.headers.get('x-tr-name') || '';
    try { name = decodeURIComponent(name); } catch { /* keep raw */ }
    name = String(name).trim().slice(0, 32);
    if (!uid || !name) return json({ error: 'ticket_required' }, 401);

    const kind = request.headers.get('x-tr-kind') === 'room' ? 'room' : 'duel';
    const code = cleanCode(request.headers.get('x-tr-room'));
    const wantsPlayer = request.headers.get('x-tr-role') !== 'spectator';

    const match = await this.load({ kind, code });

    if (wantsPlayer) {
      const existing = match.players.find((p) => p.uid === uid);
      if (existing) return this.acceptPlayer(match, existing, name);

      if (match.players.length >= MAX_PLAYERS && match.status === 'open') {
        match.players = match.players.filter((p) => p.connected);
      }
      if (match.players.length >= MAX_PLAYERS) {
        /* In a room the next arrival simply becomes a spectator; in a queue
           match the second player was already decided, so refuse. */
        if (match.kind !== 'room') return json({ error: 'match_full' }, 409);
        return this.acceptSpectator(match, uid, name, true);
      }

      const player = {
        uid,
        name,
        ready: false,
        score: 0,
        bpi: 0,
        done: false,
        connected: true,
        round: 0,
        deal: 0,
        correct: 0,
        wrong: 0,
        misses: 0,
        streak: 0
      };
      match.players.push(player);
      return this.acceptPlayer(match, player, name, true);
    }

    return this.acceptSpectator(match, uid, name, false);
  }

  async acceptPlayer(match, player, name, fresh = false) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ uid: player.uid, role: 'player' });

    player.connected = true;
    player.name = name;
    await this.save();

    this.send(server, { type: 'state', you: this.publicPlayer(player), match: this.snapshot() });
    this.broadcastTo('player', { type: 'peer', player: this.publicPlayer(player) }, server);
    this.broadcastTo('spectator', { type: 'state', match: this.snapshot() });
    if (fresh) await this.maybeStart();
    return new Response(null, { status: 101, webSocket: client });
  }

  async acceptSpectator(match, uid, name, auto) {
    let watcher = match.spectators.find((s) => s.uid === uid);
    if (!watcher) {
      if (match.spectators.length >= MAX_SPECTATORS) {
        return json({ error: 'spectator_full' }, 409);
      }
      watcher = { uid, name, connected: true };
      match.spectators.push(watcher);
    }
    watcher.name = name;
    watcher.connected = true;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ uid, role: 'spectator' });

    await this.save();

    this.send(server, {
      type: 'state',
      spectator: true,
      auto: !!auto,
      you: null,
      match: this.snapshot()
    });
    this.broadcast({ type: 'spectators', count: this.spectatorCount() });
    return new Response(null, { status: 101, webSocket: client });
  }

  publicPlayer(player) {
    return {
      name: player.name,
      ready: player.ready,
      score: player.score,
      bpi: player.bpi,
      done: player.done,
      connected: player.connected,
      round: Number(player.round) || 0,
      deal: Number(player.deal) || 0,
      correct: Number(player.correct) || 0,
      wrong: Number(player.wrong) || 0,
      misses: Number(player.misses) || 0,
      streak: Number(player.streak) || 0
    };
  }

  sockets() {
    return this.state.getWebSockets();
  }

  roleOf(ws) {
    const attachment = ws.deserializeAttachment();
    return attachment && attachment.role === 'spectator' ? 'spectator' : 'player';
  }

  send(ws, payload) {
    try { ws.send(JSON.stringify(payload)); } catch { /* socket is closing */ }
  }

  broadcast(payload, except) {
    for (const ws of this.sockets()) {
      if (ws !== except) this.send(ws, payload);
    }
  }

  broadcastTo(role, payload, except) {
    for (const ws of this.sockets()) {
      if (ws !== except && this.roleOf(ws) === role) this.send(ws, payload);
    }
  }

  spectatorCount() {
    return this.match.spectators.filter((s) => s.connected).length;
  }

  scores() {
    const out = {};
    for (const player of this.match.players) out[player.name] = score(player.score);
    return out;
  }

  playerFor(ws) {
    const attachment = ws.deserializeAttachment();
    if (!attachment) return null;
    return this.match.players.find((p) => p.uid === attachment.uid) || null;
  }

  stateFor(ws, me) {
    if (this.roleOf(ws) === 'spectator') {
      return { type: 'state', spectator: true, you: null, match: this.snapshot() };
    }
    return { type: 'state', you: me ? this.publicPlayer(me) : null, match: this.snapshot() };
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    await this.load();

    /* Spectators are read-only: they may ping or ask for a refresh, nothing
       else can touch match state. */
    if (this.roleOf(ws) === 'spectator') {
      if (msg.type === 'ping') return this.send(ws, { type: 'pong', now: Date.now() });
      if (msg.type === 'join' || msg.type === 'hello') return this.send(ws, this.stateFor(ws, null));
      return this.send(ws, { type: 'error', code: 'read_only' });
    }

    const me = this.playerFor(ws);
    if (!me) return this.send(ws, { type: 'error', code: 'ticket_required' });

    if (msg.type === 'join' || msg.type === 'hello') {
      return this.send(ws, this.stateFor(ws, me));
    }

    if (msg.type === 'ready') {
      if (this.match.status !== 'open' && this.match.status !== 'countdown') return;
      me.ready = !!msg.ready;
      await this.save();
      this.broadcast({ type: 'state', match: this.snapshot() }, ws);
      await this.maybeStart();
      return;
    }

    if (msg.type === 'emote') {
      if (this.match.status === 'finished') return;
      const now = Date.now();
      if (now - (me.lastEmoteAt || 0) < EMOTE_COOLDOWN_MS) return;
      let emoji = cleanEmote(msg.emoji, MAX_EMOTE_EMOJI);
      let text = cleanEmote(msg.text, MAX_EMOTE_TEXT);
      if (!emoji && !text) {
        const id = String(msg.id || '');
        if (!LEGACY_EMOTES.has(id)) return;
        text = id.toUpperCase();
      }
      me.lastEmoteAt = now;
      this.broadcast({ type: 'emote', from: me.name, emoji, text });
      return;
    }

    if (msg.type === 'progress') {
      if (me.done) return;
      if (this.match.status === 'countdown') this.match.status = 'playing';
      me.bpi = Math.max(0, Math.min(1000, Number(msg.bpi) || me.bpi));
      me.round = Math.max(1, Math.min(ROUNDS, Number(msg.round) || me.round || 1));
      if (msg.deal != null) me.deal = Math.max(0, Math.min(500, Number(msg.deal) || 0));
      me.correct = Math.max(0, Math.min(500, Number(msg.correct) || 0));
      me.wrong = Math.max(0, Math.min(500, Number(msg.wrong) || 0));
      me.misses = Math.max(0, Math.min(500, Number(msg.misses) || 0));
      me.streak = Math.max(0, Math.min(500, Number(msg.streak) || 0));
      this.broadcast({
        type: 'progress',
        from: me.name,
        round: me.round,
        correct: me.correct,
        wrong: me.wrong,
        misses: me.misses,
        streak: me.streak,
        deal: me.deal,
        score: score(me.score),
        scores: this.scores()
      }, ws);
      return;
    }

    /* A wrong tap is deducted by the client immediately; mirror the same
       deduction on the server so the authoritative score stays in step. */
    if (msg.type === 'penalty') {
      if (me.done) return;
      const amount = Math.max(0, Math.min(500, Number(msg.amount) || 0));
      if (amount) me.score = score(me.score - amount);
      await this.save();
      this.broadcast({ type: 'scores', scores: this.scores() });
      return;
    }

    /* Lockstep boards: the first correct read OR the first expired timer on a
       board moves BOTH players to the next deterministic deal. A timeout is a
       miss and awards no points; the answer is never revealed. */
    if (msg.type === 'churn') {
      if (me.done) return;
      if (this.match.status === 'open' || this.match.status === 'countdown') this.match.status = 'playing';
      const round = Math.max(1, Math.min(ROUNDS, Number(msg.round) || me.round || 1));
      const deal = Math.max(0, Math.min(500, Number(msg.deal) || 0));
      const key = round + ':' + deal;
      if (!this.match.resolved) this.match.resolved = {};
      if (this.match.resolved[key]) return;
      this.match.resolved[key] = 'churn';

      me.round = round;
      me.deal = Math.max(Number(me.deal) || 0, deal + 1);
      for (const p of this.match.players) {
        if (p !== me && p.round === round) {
          p.deal = Math.max(Number(p.deal) || 0, deal + 1);
        }
      }
      await this.save();
      this.broadcast({
        type: 'churn',
        from: me.name,
        winner: null,
        round,
        deal,
        scores: this.scores()
      });
      return;
    }

    if (msg.type === 'solved') {
      if (me.done) return;
      if (this.match.status === 'open' || this.match.status === 'countdown') this.match.status = 'playing';
      const round = Math.max(1, Math.min(ROUNDS, Number(msg.round) || me.round || 1));
      const deal = Math.max(0, Math.min(500, Number(msg.deal) || 0));
      const key = round + ':' + deal;
      if (!this.match.resolved) this.match.resolved = {};
      if (this.match.resolved[key]) {
        /* Someone else got there first. Tell the late claimant the current
           scores so it can drop its pending solve without scoring twice. */
        this.send(ws, { type: 'deal_closed', round, deal, scores: this.scores() });
        return;
      }
      this.match.resolved[key] = me.name;

      const points = Math.max(0, Math.min(20000, Number(msg.points) || 0));
      me.score = score(me.score + points);
      if (msg.bpi != null) me.bpi = Math.max(0, Math.min(1000, Number(msg.bpi) || me.bpi));

      me.round = round;
      me.deal = Math.max(Number(me.deal) || 0, deal + 1);
      for (const p of this.match.players) {
        /* Only advance a player who is already in this round. A player still
           finishing the previous round keeps their own deal until they enter
           the next one; otherwise a fast opponent would skip their board. */
        if (p !== me && p.round === round) {
          p.deal = Math.max(Number(p.deal) || 0, deal + 1);
        }
      }
      await this.save();
      this.broadcast({
        type: 'solved',
        from: me.name,
        winner: me.name,
        round,
        deal,
        points,
        score: score(me.score),
        scores: this.scores()
      });
      return;
    }

    if (msg.type === 'finish') {
      if (me.done) return;
      /* The server already owns the score from accepted solves/penalties.
         Never let a client's final frame inflate a rejected board. */
      me.score = score(me.score);
      me.bpi = Math.max(0, Math.min(1000, Number(msg.bpi) || me.bpi));
      me.done = true;
      if (this.match.players.length === MAX_PLAYERS && this.match.players.every((p) => p.done)) {
        await this.finish();
      }
      await this.save();
      return;
    }

    if (msg.type === 'rematch') {
      me.rematch = true;
      if (this.match.players.length === MAX_PLAYERS && this.match.players.every((p) => p.rematch)) {
        for (const p of this.match.players) {
          p.rematch = false;
          p.ready = false;
          p.score = 0;
          p.bpi = 0;
          p.done = false;
          p.round = 0;
          p.deal = 0;
          p.correct = 0;
          p.wrong = 0;
          p.misses = 0;
          p.streak = 0;
        }
        this.match.status = 'open';
        this.match.round = 0;
        this.match.startsAt = 0;
        this.match.seed = newSeed();
        this.match.winner = null;
        this.match.resolved = {};
        await this.save();
        this.broadcast({ type: 'state', match: this.snapshot() });
      }
      return;
    }

    if (msg.type === 'ping') this.send(ws, { type: 'pong', now: Date.now() });
  }

  async maybeStart() {
    if (this.match.status !== 'open') return;
    if (this.match.players.length !== MAX_PLAYERS) return;
    if (!this.match.players.every((p) => p.ready && p.connected)) return;

    this.match.status = 'countdown';
    this.match.round = 1;
    this.match.startsAt = Date.now() + 3000;
    this.match.resolved = {};
    await this.save();
    this.broadcast({
      type: 'countdown',
      round: 1,
      startsAt: this.match.startsAt,
      seed: this.match.seed,
      players: this.match.players.map((p) => ({ name: p.name, score: p.score }))
    });
  }

  async finish() {
    const [a, b] = this.match.players;
    this.match.status = 'result';
    this.match.winner = a.score === b.score ? null : a.score > b.score ? a.name : b.name;
    const players = this.match.players.map((p) => ({ name: p.name, score: p.score, bpi: p.bpi }));
    this.broadcast({ type: 'result', winner: this.match.winner, players });
    await this.state.storage.put('lastResult', { winner: this.match.winner, players, at: Date.now() });
  }

  snapshot() {
    return {
      kind: this.match.kind,
      code: this.match.code,
      status: this.match.status,
      round: this.match.round,
      startsAt: this.match.startsAt,
      seed: this.match.seed,
      winner: this.match.winner,
      spectators: this.spectatorCount(),
      players: this.match.players.map((p) => this.publicPlayer(p))
    };
  }

  async webSocketClose(ws, code, reason) {
    const attachment = ws.deserializeAttachment();
    if (!attachment) return;
    await this.load();

    const others = this.sockets().filter((other) => other !== ws);

    if (attachment.role === 'spectator') {
      const stillLive = others.some((other) => {
        const att = other.deserializeAttachment();
        return att && att.role === 'spectator' && att.uid === attachment.uid;
      });
      if (!stillLive) {
        this.match.spectators = this.match.spectators.filter((s) => s.uid !== attachment.uid);
        await this.save();
      }
      this.broadcast({ type: 'spectators', count: this.spectatorCount() });
      return;
    }

    const player = this.match.players.find((p) => p.uid === attachment.uid);
    if (!player) return;

    const stillLive = others.some((other) => {
      const att = other.deserializeAttachment();
      return att && att.role !== 'spectator' && att.uid === attachment.uid;
    });
    if (stillLive) return;

    player.connected = false;

    if (this.match.status === 'countdown') {
      this.match.status = 'open';
      this.match.round = 0;
      this.match.startsAt = 0;
      for (const p of this.match.players) p.ready = false;
    } else if (this.match.status === 'open') {
      this.match.players = this.match.players.filter((p) => p.uid !== player.uid);
    }

    await this.save();
    this.broadcast({ type: 'peer_left', player: player.name });
    this.broadcast({ type: 'state', match: this.snapshot() });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011, 'socket_error');
  }
}
