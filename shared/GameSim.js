// Sheeple — the whole game as a headless, deterministic engine.
//
// The server runs one per room; solo mode runs one in the browser with AI
// supplying the inputs. Nothing here touches Phaser or sockets, so both sides
// always agree on what happened.

import {
  WORLD, MOVE, TIMING, VISION, ROLE, GAME_STATE, ROOMS, SPAWN, BELL, HAY,
  CHORES, CHORES_PER_PLAYER, CHORE_KIND, WOOL_COLORS, HATS,
} from './constants.js';
import {
  createBody, emptyInput, stepBody, teleport, dist, clamp, roomAt,
} from './movement.js';

let uid = 0;
const nextId = (p) => `${p}${++uid}`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two sheep with the same name makes a deduction game unplayable. */
function uniqueName(base, taken) {
  const clean = (base || 'Sheep').trim().slice(0, 12) || 'Sheep';
  if (!taken.has(clean.toLowerCase())) return clean;
  for (let n = 2; n < 50; n++) {
    const tryName = `${clean.slice(0, 10)} ${n}`;
    if (!taken.has(tryName.toLowerCase())) return tryName;
  }
  return clean;
}

export class GameSim {
  constructor(opts = {}) {
    this.rng = mulberry32(opts.seed ?? (Date.now() & 0xffffffff));
    this.state = GAME_STATE.LOBBY;
    this.players = new Map();
    this.bodies = [];          // corpses waiting to be found
    this.events = [];
    this.chat = [];
    this.time = 0;
    this.meeting = null;
    this.fogUntil = 0;
    this.winner = null;
    this.winReason = '';
    this.version = 0;
  }

  // -- players -------------------------------------------------------------

  addPlayer({ id, name, isBot = false, colorIndex = null, hatIndex = null }) {
    if (this.players.has(id)) return this.players.get(id);
    const taken = new Set([...this.players.values()].map((p) => p.colorIndex));
    let color = colorIndex;
    if (color === null || taken.has(color)) {
      color = WOOL_COLORS.findIndex((_, i) => !taken.has(i));
      if (color < 0) color = this.players.size % WOOL_COLORS.length;
    }
    const takenNames = new Set([...this.players.values()].map((o) => o.name.toLowerCase()));
    const p = {
      id,
      name: uniqueName(name, takenNames),
      isBot,
      colorIndex: color,
      hatIndex: hatIndex ?? Math.floor(this.rng() * HATS.length),
      role: ROLE.SHEEP,
      alive: true,
      body: createBody(SPAWN.x, SPAWN.y),
      input: emptyInput(),
      chores: [],
      // chore in progress
      choreId: null,
      choreProgress: 0,
      choreTaps: 0,
      // wolf state
      eatCd: 0,
      recentTarget: null,
      tunnelCd: 0,
      fogCd: 0,
      usedBell: false,
      lastKillAt: -999,
    };
    this.players.set(id, p);
    return p;
  }

  customize(id, { name, colorIndex, hatIndex }) {
    const p = this.players.get(id);
    if (!p || this.state !== GAME_STATE.LOBBY) return;
    if (typeof name === 'string' && name.trim()) {
      const taken = new Set([...this.players.values()]
        .filter((o) => o.id !== id).map((o) => o.name.toLowerCase()));
      p.name = uniqueName(name, taken);
    }
    if (Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex < WOOL_COLORS.length) {
      const taken = [...this.players.values()].some((o) => o.id !== id && o.colorIndex === colorIndex);
      if (!taken) p.colorIndex = colorIndex;
    }
    if (Number.isInteger(hatIndex) && hatIndex >= 0 && hatIndex < HATS.length) p.hatIndex = hatIndex;
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    if (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.MEETING) this.checkWin();
  }

  get alivePlayers() { return [...this.players.values()].filter((p) => p.alive); }
  get sheepAlive() { return this.alivePlayers.filter((p) => p.role === ROLE.SHEEP); }
  get wolvesAlive() { return this.alivePlayers.filter((p) => p.role === ROLE.WOLF); }

  // -- lifecycle -----------------------------------------------------------

  start({ wolfId = null } = {}) {
    const ids = [...this.players.keys()];
    if (!ids.length) return;
    const chosen = wolfId && this.players.has(wolfId)
      ? wolfId
      : ids[Math.floor(this.rng() * ids.length)];

    ids.forEach((id, i) => {
      const p = this.players.get(id);
      p.role = id === chosen ? ROLE.WOLF : ROLE.SHEEP;
      p.alive = true;
      // Spread everyone around the barn so nobody starts inside anybody else.
      const angle = (i / ids.length) * Math.PI * 2;
      p.body = createBody(SPAWN.x + Math.cos(angle) * 90, SPAWN.y + Math.sin(angle) * 60);
      p.chores = this.pickChores();
      p.choreId = null; p.choreProgress = 0; p.choreTaps = 0;
      p.eatCd = TIMING.START_GRACE;
      p.tunnelCd = 0; p.fogCd = 0;
      p.usedBell = false;
    });

    this.bodies = [];
    this.chat = [];
    this.meeting = null;
    this.fogUntil = 0;
    this.winner = null;
    this.state = GAME_STATE.PLAYING;
    this.emit('game:start', {});
  }

  pickChores() {
    const shuffled = CHORES.slice().sort(() => this.rng() - 0.5);
    return shuffled.slice(0, CHORES_PER_PLAYER)
      .map((c) => ({ id: c.id, done: false, progress: 0 }));
  }

  emit(type, data = {}) {
    // `type` last so a payload field can never shadow it.
    this.events.push({ ...data, type, t: this.time });
  }

  drainEvents() { const e = this.events; this.events = []; return e; }

  // -- input ---------------------------------------------------------------

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    p.input = { dx: clamp(+input.dx || 0, -1, 1), dy: clamp(+input.dy || 0, -1, 1) };
  }

  // -- chores --------------------------------------------------------------

  choreAt(x, y) {
    for (const c of CHORES) {
      if (dist(x, y, c.x, c.y) <= TIMING.CHORE_RANGE) return c;
    }
    return null;
  }

  /** The chore this player could start right now: nearby, theirs, unfinished. */
  availableChore(p) {
    const near = this.choreAt(p.body.x, p.body.y);
    if (!near) return null;
    const mine = p.chores.find((c) => c.id === near.id && !c.done);
    return mine ? near : null;
  }

  doChore(p) {
    const def = this.availableChore(p);
    if (!def) return;
    const mine = p.chores.find((c) => c.id === def.id);
    if (def.kind === CHORE_KIND.TAP) {
      p.choreId = def.id;
      p.choreTaps += 1;
      mine.progress = clamp(p.choreTaps / TIMING.CHORE_TAPS, 0, 1);
      this.emit('chore:tap', { playerId: p.id, choreId: def.id, progress: mine.progress });
      if (p.choreTaps >= TIMING.CHORE_TAPS) this.finishChore(p, mine, def);
    } else {
      // Hold chores are driven by holding the button; this just starts them.
      p.choreId = def.id;
    }
  }

  finishChore(p, mine, def) {
    mine.done = true;
    mine.progress = 1;
    p.choreId = null; p.choreProgress = 0; p.choreTaps = 0;
    this.emit('chore:done', { playerId: p.id, choreId: def.id, name: def.name });
    this.checkWin();
  }

  updateChore(p, dt, holding) {
    if (!p.choreId) return;
    const def = CHORES.find((c) => c.id === p.choreId);
    const mine = p.chores.find((c) => c.id === p.choreId);
    if (!def || !mine || mine.done) { p.choreId = null; return; }
    // Walking away or letting go cancels it.
    if (dist(p.body.x, p.body.y, def.x, def.y) > TIMING.CHORE_RANGE) {
      p.choreId = null; p.choreProgress = 0; p.choreTaps = 0; mine.progress = 0;
      return;
    }
    if (def.kind !== CHORE_KIND.HOLD) return;
    if (!holding) {
      p.choreProgress = Math.max(0, p.choreProgress - dt * 1.5);
      mine.progress = p.choreProgress / TIMING.CHORE_HOLD;
      return;
    }
    p.choreProgress += dt;
    mine.progress = clamp(p.choreProgress / TIMING.CHORE_HOLD, 0, 1);
    if (p.choreProgress >= TIMING.CHORE_HOLD) this.finishChore(p, mine, def);
  }

  get choreProgress() {
    let done = 0, total = 0;
    for (const p of this.players.values()) {
      if (p.role !== ROLE.SHEEP) continue;
      for (const c of p.chores) { total++; if (c.done) done++; }
    }
    return total ? done / total : 0;
  }

  // -- the wolf ------------------------------------------------------------

  eatTarget(wolf, rangeMult = 1) {
    let best = null, bestD = TIMING.EAT_RANGE * rangeMult;
    for (const o of this.sheepAlive) {
      if (o.id === wolf.id) continue;
      const d = dist(o.body.x, o.body.y, wolf.body.x, wolf.body.y);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  eat(id) {
    const wolf = this.players.get(id);
    if (!wolf || wolf.role !== ROLE.WOLF || !wolf.alive) return;
    if (this.state !== GAME_STATE.PLAYING || wolf.eatCd > 0) return;
    // The EAT button lights up from a snapshot that is already a tick or two
    // old, so a wolf sprinting past its target can press a button the UI called
    // valid and hit nothing. Forgive that by remembering who was genuinely in
    // range a moment ago, rather than by simply widening the radius — which
    // would let a wolf kill from a distance it was never shown as able to.
    let victim = this.eatTarget(wolf);
    if (!victim && wolf.recentTarget && this.time - wolf.recentTarget.t < 0.4) {
      const remembered = this.players.get(wolf.recentTarget.id);
      if (remembered && remembered.alive && remembered.role === ROLE.SHEEP) victim = remembered;
    }
    if (!victim) return;
    victim.alive = false;
    victim.choreId = null;
    this.bodies.push({
      id: nextId('body'), playerId: victim.id,
      x: victim.body.x, y: victim.body.y, room: roomAt(victim.body.x, victim.body.y),
    });
    wolf.eatCd = TIMING.EAT_COOLDOWN;
    wolf.lastKillAt = this.time;
    teleport(wolf.body, victim.body.x, victim.body.y);
    this.emit('player:eaten', { playerId: victim.id, by: wolf.id, x: victim.body.x, y: victim.body.y });
    this.checkWin();
  }

  tunnel(id) {
    const wolf = this.players.get(id);
    if (!wolf || wolf.role !== ROLE.WOLF || !wolf.alive) return;
    if (this.state !== GAME_STATE.PLAYING || wolf.tunnelCd > 0) return;
    const here = HAY.find((h) => dist(h.x, h.y, wolf.body.x, wolf.body.y) <= TIMING.TUNNEL_RANGE);
    if (!here) return;
    const others = HAY.filter((h) => h.id !== here.id);
    const to = others[Math.floor(this.rng() * others.length)];
    teleport(wolf.body, to.x, to.y);
    wolf.tunnelCd = TIMING.TUNNEL_COOLDOWN;
    this.emit('wolf:tunnel', { playerId: wolf.id, from: here.id, to: to.id, x: to.x, y: to.y });
  }

  fog(id) {
    const wolf = this.players.get(id);
    if (!wolf || wolf.role !== ROLE.WOLF || !wolf.alive) return;
    if (this.state !== GAME_STATE.PLAYING || wolf.fogCd > 0) return;
    this.fogUntil = this.time + TIMING.FOG_SECONDS;
    wolf.fogCd = TIMING.FOG_COOLDOWN;
    this.emit('wolf:fog', { by: wolf.id, seconds: TIMING.FOG_SECONDS });
  }

  // -- meetings ------------------------------------------------------------

  nearbyBody(p) {
    return this.bodies.find((b) => dist(b.x, b.y, p.body.x, p.body.y) <= TIMING.REPORT_RANGE) || null;
  }

  atBell(p) {
    return dist(p.body.x, p.body.y, BELL.x, BELL.y) <= BELL.r + 40;
  }

  report(id) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.state !== GAME_STATE.PLAYING) return;
    const body = this.nearbyBody(p);
    if (!body) return;
    const victim = this.players.get(body.playerId);
    this.openMeeting(id, 'body', victim ? victim.name : 'someone');
  }

  ringBell(id) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.state !== GAME_STATE.PLAYING) return;
    if (p.usedBell || !this.atBell(p)) return;
    p.usedBell = true;
    this.openMeeting(id, 'bell', null);
  }

  openMeeting(byId, kind, victimName) {
    this.state = GAME_STATE.MEETING;
    this.meeting = {
      calledBy: byId,
      kind,
      victimName,
      timer: TIMING.MEETING_SECONDS,
      votes: {},
      resolved: false,
      revealTimer: 0,
      result: null,
    };
    this.chat = [];
    this.bodies = [];
    for (const p of this.players.values()) {
      p.input = emptyInput();
      p.body.vx = 0; p.body.vy = 0;
      p.choreId = null; p.choreProgress = 0; p.choreTaps = 0;
      for (const c of p.chores) if (!c.done) c.progress = 0;
    }
    this.emit('meeting:called', { by: byId, kind, victimName });
  }

  vote(voterId, targetId) {
    if (this.state !== GAME_STATE.MEETING || !this.meeting || this.meeting.resolved) return;
    const v = this.players.get(voterId);
    if (!v || !v.alive || this.meeting.votes[voterId]) return;
    if (targetId !== 'skip') {
      const t = this.players.get(targetId);
      if (!t || !t.alive) return;
    }
    this.meeting.votes[voterId] = targetId;
    this.emit('meeting:vote', { voterId, count: Object.keys(this.meeting.votes).length });
    if (Object.keys(this.meeting.votes).length >= this.alivePlayers.length) this.resolveMeeting();
  }

  addChat(playerId, text) {
    const p = this.players.get(playerId);
    if (!p || this.state !== GAME_STATE.MEETING) return null;
    const msg = {
      id: nextId('msg'), playerId, name: p.name, dead: !p.alive,
      colorIndex: p.colorIndex,
      text: String(text).slice(0, 140), t: this.time,
    };
    this.chat.push(msg);
    if (this.chat.length > 120) this.chat.shift();
    return msg;
  }

  resolveMeeting() {
    const m = this.meeting;
    if (!m || m.resolved) return;
    const tally = {};
    for (const target of Object.values(m.votes)) tally[target] = (tally[target] || 0) + 1;

    let top = null, topCount = 0, tie = false;
    for (const [k, v] of Object.entries(tally)) {
      if (v > topCount) { top = k; topCount = v; tie = false; }
      else if (v === topCount) tie = true;
    }
    const ejected = (top && top !== 'skip' && !tie) ? this.players.get(top) : null;

    m.resolved = true;
    m.revealTimer = TIMING.REVEAL_SECONDS;
    m.result = {
      tally,
      ejectedId: ejected ? ejected.id : null,
      ejectedName: ejected ? ejected.name : null,
      wasWolf: ejected ? ejected.role === ROLE.WOLF : false,
      skipped: !ejected,
      wolvesLeft: this.wolvesAlive.length - (ejected && ejected.role === ROLE.WOLF ? 1 : 0),
    };
    if (ejected) ejected.alive = false;
    this.emit('meeting:result', m.result);
  }

  endMeeting() {
    this.meeting = null;
    this.chat = [];
    if (this.checkWin()) return;
    this.state = GAME_STATE.PLAYING;
    this.fogUntil = 0;
    const ids = [...this.players.keys()];
    for (const p of this.players.values()) {
      const i = ids.indexOf(p.id);
      const angle = (i / ids.length) * Math.PI * 2;
      teleport(p.body, SPAWN.x + Math.cos(angle) * 90, SPAWN.y + Math.sin(angle) * 60);
      p.eatCd = Math.max(p.eatCd, TIMING.START_GRACE);
    }
    this.emit('round:resume', {});
  }

  // -- win checks ----------------------------------------------------------

  checkWin() {
    if (this.state === GAME_STATE.ENDED) return true;
    if (this.state === GAME_STATE.LOBBY) return false;
    if (this.choreProgress >= 1 && this.sheepAlive.length > 0) {
      return this.finish(ROLE.SHEEP, 'Every chore done. The farm survives.');
    }
    if (this.wolvesAlive.length === 0) {
      return this.finish(ROLE.SHEEP, 'The wolf was thrown out of the paddock.');
    }
    if (this.sheepAlive.length <= this.wolvesAlive.length) {
      return this.finish(ROLE.WOLF, 'Not enough sheep left to argue.');
    }
    return false;
  }

  finish(winner, reason) {
    this.state = GAME_STATE.ENDED;
    this.winner = winner;
    this.winReason = reason;
    this.meeting = null;
    this.emit('game:over', { winner, reason });
    return true;
  }

  // -- tick ----------------------------------------------------------------

  update(dt) {
    this.time += dt;
    this.version++;

    if (this.state === GAME_STATE.MEETING) {
      const m = this.meeting;
      if (!m) return;
      if (m.resolved) {
        m.revealTimer -= dt;
        if (m.revealTimer <= 0) this.endMeeting();
      } else {
        m.timer -= dt;
        if (m.timer <= 0) this.resolveMeeting();
      }
      return;
    }
    if (this.state !== GAME_STATE.PLAYING) return;

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.eatCd = Math.max(0, p.eatCd - dt);
      p.tunnelCd = Math.max(0, p.tunnelCd - dt);
      p.fogCd = Math.max(0, p.fogCd - dt);
      if (p.role === ROLE.WOLF && p.eatCd <= 0) {
        const inRange = this.eatTarget(p);
        if (inRange) p.recentTarget = { id: inRange.id, t: this.time };
      }
      const speedMult = p.role === ROLE.WOLF ? MOVE.WOLF_BONUS : 1;
      // Chores do not freeze you; walking out of range simply cancels them,
      // which is why standing at a station is a real (fakeable) alibi.
      stepBody(p.body, p.input, dt, { speedMult });
      this.updateChore(p, dt, p.holding);
    }
  }

  /** One entry point for every player action. */
  action(id, action) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    switch (action.type) {
      case 'chore': this.doChore(p); break;
      case 'holdStart': p.holding = true; this.doChore(p); break;
      case 'holdEnd': p.holding = false; break;
      case 'eat': this.eat(id); break;
      case 'tunnel': this.tunnel(id); break;
      case 'fog': this.fog(id); break;
      case 'report': this.report(id); break;
      case 'bell': this.ringBell(id); break;
      default: break;
    }
  }

  // -- serialization -------------------------------------------------------

  /** Per-viewer snapshot: only those entitled to a role ever see one. */
  snapshot(viewerId = null) {
    const viewer = viewerId ? this.players.get(viewerId) : null;
    const viewerIsWolf = viewer && viewer.role === ROLE.WOLF;
    const viewerDead = viewer && !viewer.alive;
    const reveal = this.state === GAME_STATE.ENDED;
    const foggy = this.time < this.fogUntil;

    return {
      v: this.version,
      time: this.time,
      state: this.state,
      choreProgress: this.choreProgress,
      fog: foggy,
      fogLeft: Math.max(0, this.fogUntil - this.time),
      winner: this.winner,
      winReason: this.winReason,
      bodies: this.bodies.map((b) => ({ id: b.id, playerId: b.playerId, x: b.x, y: b.y })),
      chat: this.state === GAME_STATE.MEETING ? this.chat : [],
      meeting: this.meeting ? {
        calledBy: this.meeting.calledBy,
        kind: this.meeting.kind,
        victimName: this.meeting.victimName,
        timer: Math.max(0, this.meeting.timer),
        votes: this.meeting.votes,
        resolved: this.meeting.resolved,
        result: this.meeting.result,
      } : null,
      you: viewer ? {
        id: viewer.id,
        role: viewer.role,
        alive: viewer.alive,
        chores: viewer.chores,
        usedBell: viewer.usedBell,
        vision: (viewer.role === ROLE.WOLF ? VISION.WOLF : VISION.SHEEP) * (foggy ? 0.5 : 1),
        nearChore: (() => { const c = this.availableChore(viewer); return c ? c.id : null; })(),
        nearBody: !!this.nearbyBody(viewer),
        atBell: this.atBell(viewer),
        canEat: viewer.role === ROLE.WOLF && viewer.eatCd <= 0 && !!this.eatTarget(viewer),
        eatCd: viewer.eatCd,
        tunnelCd: viewer.tunnelCd,
        fogCd: viewer.fogCd,
        atHay: viewer.role === ROLE.WOLF &&
          HAY.some((h) => dist(h.x, h.y, viewer.body.x, viewer.body.y) <= TIMING.TUNNEL_RANGE),
      } : null,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        colorIndex: p.colorIndex,
        hatIndex: p.hatIndex,
        alive: p.alive,
        isBot: p.isBot,
        x: Math.round(p.body.x * 10) / 10,
        y: Math.round(p.body.y * 10) / 10,
        facing: p.body.facing,
        moving: p.body.moving,
        bob: Math.round(p.body.bob * 100) / 100,
        busy: !!p.choreId,
        choresDone: p.chores.filter((c) => c.done).length,
        choreTotal: p.chores.length,
        role: (reveal || viewerDead || (viewerIsWolf && p.role === ROLE.WOLF) || p.id === viewerId)
          ? p.role : null,
      })),
    };
  }
}
