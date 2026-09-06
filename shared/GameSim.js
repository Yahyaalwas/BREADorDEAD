// Headless, authoritative game simulation.
//
// The server runs one of these per room; solo mode runs one in the browser with
// AI supplying the inputs. Nothing in here touches Phaser or sockets, so both
// sides stay in agreement about what actually happened.

import {
  WORLD, PHYS, TIMING, ROLE, GAME_STATE, ZONES, CRUMB_SPAWNS, ANT_PATH, ANT_SPEED,
  ANT_RIDE_SPEED, KNIFE, SPAWN_POINTS, TASK, TASK_DEFS, TASKS_PER_PLAYER,
  SABOTAGE, SABOTAGE_DEFS, MOLD_TRAIL, BREAD_COLORS, TIMING as T,
} from './constants.js';
import {
  createBreadState, emptyInput, stepBread, rectContains, rectCenter, dist,
  clamp, antPosition, isFlat,
} from './physics.js';

let uid = 0;
const nextId = (p) => `${p}${++uid}`;

function pickTasks(rng) {
  const all = Object.values(TASK);
  const shuffled = all.slice().sort(() => rng() - 0.5);
  return shuffled.slice(0, Math.min(TASKS_PER_PLAYER, all.length))
    .map((id) => ({ id, progress: 0, done: false }));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GameSim {
  constructor(opts = {}) {
    this.rng = mulberry32(opts.seed ?? (Date.now() & 0xffffffff));
    this.state = GAME_STATE.LOBBY;
    this.players = new Map();     // id -> player
    this.crumbs = [];
    this.moldPatches = [];
    this.spores = [];
    this.bodies = [];
    this.events = [];             // drained by the owner each tick
    this.chat = [];
    this.time = 0;
    this.round = 1;
    this.roundTimer = TIMING.ROUND_SECONDS;
    this.meeting = null;
    this.toasterCrank = 0;        // seconds left before the toaster cooks everyone
    this.knife = { x: KNIFE.A.x, y: KNIFE.A.y, t: 0, dir: 1 };
    this.winner = null;
    this.version = 0;
  }

  // -- players -------------------------------------------------------------

  addPlayer({ id, name, isBot = false }) {
    if (this.players.has(id)) return this.players.get(id);
    const index = this.players.size;
    const spawn = SPAWN_POINTS[index % SPAWN_POINTS.length];
    const p = {
      id,
      name,
      isBot,
      colorIndex: index % BREAD_COLORS.length,
      role: ROLE.FRESH,
      alive: true,
      ready: false,
      bread: createBreadState(spawn.x, spawn.y, this.rng() * 360),
      input: emptyInput(),
      interact: false,
      tasks: [],
      // status effects
      stunUntil: 0,
      invertUntil: 0,
      framedUntil: 0,
      toastTime: 0,
      toastLevel: 0,     // 0..1 visual browning
      boardTime: 0,
      cooTime: 0,
      carrying: null,    // crumb id
      riding: null,      // ant index
      stackTime: 0,
      cooldowns: {},
      killTarget: null,
      killHold: 0,
      usedScream: false,
      lastMoldDrop: 0,
      deathCause: null,
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.carrying) this.dropCrumb(p);
    this.players.delete(id);
    if (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.MEETING) {
      this.checkWin();
    }
  }

  get alivePlayers() {
    return [...this.players.values()].filter((p) => p.alive);
  }

  get freshAlive() {
    return this.alivePlayers.filter((p) => p.role === ROLE.FRESH);
  }

  get moldyAlive() {
    return this.alivePlayers.filter((p) => p.role === ROLE.MOLDY);
  }

  // -- lifecycle -----------------------------------------------------------

  start({ moldyId = null } = {}) {
    const ids = [...this.players.keys()];
    if (ids.length === 0) return;
    const chosen = moldyId && this.players.has(moldyId)
      ? moldyId
      : ids[Math.floor(this.rng() * ids.length)];

    ids.forEach((id, i) => {
      const p = this.players.get(id);
      const spawn = SPAWN_POINTS[i % SPAWN_POINTS.length];
      p.role = id === chosen ? ROLE.MOLDY : ROLE.FRESH;
      p.alive = true;
      p.bread = createBreadState(spawn.x, spawn.y, this.rng() * 360);
      p.tasks = p.role === ROLE.FRESH ? pickTasks(this.rng) : pickTasks(this.rng);
      p.cooldowns = {};
      p.usedScream = false;
      p.deathCause = null;
      this.clearEffects(p);
    });

    this.crumbs = CRUMB_SPAWNS.map((s, i) => ({
      id: `crumb${i}`, x: s.x, y: s.y, held: null, delivered: false,
    }));
    this.moldPatches = [];
    this.spores = [];
    this.bodies = [];
    this.chat = [];
    this.round = 1;
    this.roundTimer = TIMING.ROUND_SECONDS;
    this.toasterCrank = 0;
    this.winner = null;
    this.meeting = null;
    this.state = GAME_STATE.PLAYING;
    this.emit('game:start', { round: this.round });
  }

  clearEffects(p) {
    p.stunUntil = 0; p.invertUntil = 0; p.framedUntil = 0;
    p.toastTime = 0; p.boardTime = 0; p.cooTime = 0; p.stackTime = 0;
    p.killTarget = null; p.killHold = 0;
    p.riding = null;
    p.bread.puff = 0;
  }

  emit(type, data = {}) {
    // `type` last: an event payload with its own `type` field must not shadow it.
    this.events.push({ ...data, type, t: this.time });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // -- input ---------------------------------------------------------------

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    p.input = {
      left: !!input.left, right: !!input.right,
      forward: !!input.forward, back: !!input.back,
      hop: !!input.hop, seq: input.seq | 0,
    };
    p.interact = !!input.interact;
  }

  // -- crumbs --------------------------------------------------------------

  tryPickup(p) {
    if (p.carrying) { this.dropCrumb(p); return; }
    let best = null, bestD = 90;
    for (const c of this.crumbs) {
      if (c.held || c.delivered) continue;
      const d = dist(p.bread.x, p.bread.y, c.x, c.y);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (best) {
      best.held = p.id;
      p.carrying = best.id;
      this.emit('crumb:pickup', { playerId: p.id, crumbId: best.id });
    }
  }

  dropCrumb(p) {
    const c = this.crumbs.find((x) => x.id === p.carrying);
    if (c) { c.held = null; c.x = p.bread.x; c.y = p.bread.y; }
    p.carrying = null;
  }

  // -- tasks ---------------------------------------------------------------

  taskOf(p, id) {
    return p.tasks.find((t) => t.id === id && !t.done);
  }

  completeTask(p, id) {
    const t = this.taskOf(p, id);
    if (!t) return;
    t.done = true;
    t.progress = 1;
    this.emit('task:complete', { playerId: p.id, taskId: id });
    this.checkWin();
  }

  get taskProgress() {
    let done = 0, total = 0;
    for (const p of this.players.values()) {
      if (p.role !== ROLE.FRESH) continue;
      for (const t of p.tasks) { total++; if (t.done) done++; }
    }
    return total === 0 ? 0 : done / total;
  }

  // -- sabotage ------------------------------------------------------------

  cooldownLeft(p, ability) {
    return Math.max(0, (p.cooldowns[ability] || 0) - this.time);
  }

  useSabotage(id, ability, targetId = null) {
    const p = this.players.get(id);
    if (!p || !p.alive || p.role !== ROLE.MOLDY) return;
    if (this.state !== GAME_STATE.PLAYING) return;
    const def = SABOTAGE_DEFS[ability];
    if (!def || def.passive) return;
    if (this.cooldownLeft(p, ability) > 0) return;

    switch (ability) {
      case SABOTAGE.SPORE_BURST: {
        this.spores.push({
          id: nextId('spore'), x: p.bread.x, y: p.bread.y,
          r: def.radius, until: this.time + def.duration,
        });
        for (const o of this.alivePlayers) {
          if (o.id === p.id) continue;
          if (dist(o.bread.x, o.bread.y, p.bread.x, p.bread.y) < def.radius) {
            o.invertUntil = this.time + def.duration;
          }
        }
        this.emit('sabotage:spore', { by: p.id, x: p.bread.x, y: p.bread.y, r: def.radius });
        break;
      }
      case SABOTAGE.TOASTER: {
        this.toasterCrank = def.evacuate;
        this.emit('sabotage:toaster', { by: p.id, seconds: def.evacuate });
        break;
      }
      case SABOTAGE.FRAME: {
        let victim = targetId ? this.players.get(targetId) : null;
        if (!victim || !victim.alive ||
            dist(victim.bread.x, victim.bread.y, p.bread.x, p.bread.y) > def.range) {
          victim = null;
          let bestD = def.range;
          for (const o of this.freshAlive) {
            const d = dist(o.bread.x, o.bread.y, p.bread.x, p.bread.y);
            if (d < bestD) { victim = o; bestD = d; }
          }
        }
        if (!victim) return;
        victim.framedUntil = this.time + def.duration;
        this.emit('sabotage:frame', { by: p.id, targetId: victim.id });
        break;
      }
      case SABOTAGE.KILL: {
        if (p.killTarget) return;    // already stalking someone
        let victim = targetId ? this.players.get(targetId) : null;
        if (!victim || !victim.alive || victim.role === ROLE.MOLDY ||
            dist(victim.bread.x, victim.bread.y, p.bread.x, p.bread.y) > def.range) {
          victim = null;
          let bestD = def.range;
          for (const o of this.freshAlive) {
            const d = dist(o.bread.x, o.bread.y, p.bread.x, p.bread.y);
            if (d < bestD) { victim = o; bestD = d; }
          }
        }
        if (!victim) return;
        p.killTarget = victim.id;
        p.killHold = 0;
        this.emit('sabotage:killStart', { by: p.id, targetId: victim.id });
        return;   // cooldown starts on the actual kill
      }
      default: return;
    }
    p.cooldowns[ability] = this.time + def.cooldown;
  }

  kill(victim, byId, cause = 'mold') {
    if (!victim.alive) return;
    victim.alive = false;
    victim.deathCause = cause;
    if (victim.carrying) this.dropCrumb(victim);
    this.bodies.push({
      id: nextId('body'), playerId: victim.id,
      x: victim.bread.x, y: victim.bread.y, reported: false, cause,
    });
    this.emit('player:died', { playerId: victim.id, by: byId, cause });
    this.checkWin();
  }

  // -- meetings ------------------------------------------------------------

  callMeeting(id, type = 'scream', bodyId = null) {
    if (this.state !== GAME_STATE.PLAYING) return;
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    if (type === 'scream') {
      if (p.usedScream) return;
      p.usedScream = true;
    } else {
      const body = this.bodies.find((b) => b.id === bodyId && !b.reported);
      if (!body) return;
      if (dist(p.bread.x, p.bread.y, body.x, body.y) > 110) return;
      body.reported = true;
    }
    this.openMeeting(id, type);
  }

  openMeeting(byId, type) {
    this.state = GAME_STATE.MEETING;
    this.meeting = {
      calledBy: byId,
      type,
      timer: TIMING.MEETING_SECONDS,
      votes: {},              // voterId -> targetId | 'skip'
      resolved: false,
      revealTimer: 0,
      result: null,
    };
    this.chat = [];
    for (const p of this.players.values()) {
      p.input = emptyInput();
      p.bread.vx = 0; p.bread.vy = 0; p.bread.angVel = 0;
      p.killTarget = null; p.killHold = 0;
      if (p.carrying) this.dropCrumb(p);
      p.riding = null;
    }
    this.bodies = [];
    this.emit('meeting:called', { by: byId, type });
  }

  vote(voterId, targetId) {
    if (this.state !== GAME_STATE.MEETING || !this.meeting || this.meeting.resolved) return;
    const v = this.players.get(voterId);
    if (!v || !v.alive) return;
    if (this.meeting.votes[voterId]) return;   // one vote each
    if (targetId !== 'skip') {
      const t = this.players.get(targetId);
      if (!t || !t.alive) return;
    }
    this.meeting.votes[voterId] = targetId;
    this.emit('meeting:voteUpdate', { voterId, count: Object.keys(this.meeting.votes).length });
    if (Object.keys(this.meeting.votes).length >= this.alivePlayers.length) {
      this.resolveMeeting();
    }
  }

  addChat(playerId, text) {
    const p = this.players.get(playerId);
    if (!p) return;
    const msg = {
      id: nextId('msg'),
      playerId,
      name: p.name,
      dead: !p.alive,
      text: String(text).slice(0, 160),
      t: this.time,
    };
    this.chat.push(msg);
    if (this.chat.length > 100) this.chat.shift();
    return msg;
  }

  resolveMeeting() {
    const m = this.meeting;
    if (!m || m.resolved) return;
    const tally = {};
    for (const target of Object.values(m.votes)) {
      tally[target] = (tally[target] || 0) + 1;
    }
    let top = null, topCount = 0, tie = false;
    for (const [k, v] of Object.entries(tally)) {
      if (v > topCount) { top = k; topCount = v; tie = false; }
      else if (v === topCount) { tie = true; }
    }
    let ejected = null;
    if (top && top !== 'skip' && !tie) {
      ejected = this.players.get(top) || null;
    }
    m.resolved = true;
    m.revealTimer = TIMING.VOTE_REVEAL_SECONDS;
    m.result = {
      tally,
      ejectedId: ejected ? ejected.id : null,
      ejectedName: ejected ? ejected.name : null,
      wasMoldy: ejected ? ejected.role === ROLE.MOLDY : false,
      skipped: !ejected,
    };
    if (ejected) {
      ejected.alive = false;
      ejected.deathCause = 'ejected';
    }
    this.emit('meeting:result', m.result);
  }

  endMeeting() {
    this.meeting = null;
    this.chat = [];
    if (this.checkWin()) return;
    this.round += 1;
    if (this.round > TIMING.MAX_ROUNDS) {
      this.finish(ROLE.MOLDY, 'The bread went stale before the tasks were done.');
      return;
    }
    this.roundTimer = TIMING.ROUND_SECONDS;
    this.state = GAME_STATE.PLAYING;
    this.moldPatches = [];
    this.spores = [];
    this.toasterCrank = 0;
    for (const p of this.players.values()) {
      this.clearEffects(p);
      const spawn = SPAWN_POINTS[[...this.players.keys()].indexOf(p.id) % SPAWN_POINTS.length];
      p.bread.x = spawn.x; p.bread.y = spawn.y;
      p.bread.vx = 0; p.bread.vy = 0; p.bread.angVel = 0; p.bread.lean = 0;
    }
    this.emit('round:start', { round: this.round });
  }

  // -- win checks ----------------------------------------------------------

  checkWin() {
    if (this.state === GAME_STATE.ENDED) return true;
    if (this.taskProgress >= 1 && this.freshAlive.length > 0) {
      this.finish(ROLE.FRESH, 'Every task done. The loaf endures.');
      return true;
    }
    if (this.moldyAlive.length === 0 && this.players.size > 0 && this.state !== GAME_STATE.LOBBY) {
      this.finish(ROLE.FRESH, 'The Moldy Slice went in the bin.');
      return true;
    }
    if (this.moldyAlive.length > 0 && this.freshAlive.length <= this.moldyAlive.length) {
      this.finish(ROLE.MOLDY, 'Nothing left but mold.');
      return true;
    }
    return false;
  }

  finish(winner, reason) {
    this.state = GAME_STATE.ENDED;
    this.winner = winner;
    this.meeting = null;
    this.emit('game:over', { winner, reason });
  }

  // -- main tick -----------------------------------------------------------

  update(dt) {
    this.time += dt;
    this.version++;

    if (this.state === GAME_STATE.MEETING) return this.updateMeeting(dt);
    if (this.state !== GAME_STATE.PLAYING) return;

    this.roundTimer -= dt;
    this.updateKnife(dt);
    this.updateHazards(dt);

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      this.updatePlayer(p, dt);
    }

    this.updateStacks(dt);

    this.moldPatches = this.moldPatches.filter((m) => m.until > this.time);
    this.spores = this.spores.filter((s) => s.until > this.time);

    if (this.roundTimer <= 0) {
      this.emit('round:end', { round: this.round });
      this.openMeeting(null, 'round');
    }
  }

  updateMeeting(dt) {
    const m = this.meeting;
    if (!m) return;
    if (m.resolved) {
      m.revealTimer -= dt;
      if (m.revealTimer <= 0) this.endMeeting();
      return;
    }
    m.timer -= dt;
    if (m.timer <= 0) this.resolveMeeting();
  }

  updateKnife(dt) {
    const k = this.knife;
    k.t += dt * k.dir;
    const span = dist(KNIFE.A.x, KNIFE.A.y, KNIFE.B.x, KNIFE.B.y) / KNIFE.SPEED;
    if (k.t > span) { k.t = span; k.dir = -1; }
    if (k.t < 0) { k.t = 0; k.dir = 1; }
    const u = span === 0 ? 0 : k.t / span;
    k.x = KNIFE.A.x + (KNIFE.B.x - KNIFE.A.x) * u;
    k.y = KNIFE.A.y + (KNIFE.B.y - KNIFE.A.y) * u;

    for (const p of this.alivePlayers) {
      if (p.bread.z > 45) continue;   // hopped over the blade
      if (this.time < p.stunUntil) continue;
      if (dist(p.bread.x, p.bread.y, k.x, k.y) < KNIFE.RADIUS) {
        p.stunUntil = this.time + TIMING.KNIFE_STUN_SECONDS;
        p.bread.lean = p.bread.lean >= 0 ? 88 : -88;
        p.bread.leanVel = 0;
        p.boardTime = 0;
        const t = this.taskOf(p, TASK.KNIFE_DASH);
        if (t) t.progress = 0;
        if (p.carrying) this.dropCrumb(p);
        this.emit('knife:hit', { playerId: p.id });
      }
    }
  }

  updateHazards(dt) {
    if (this.toasterCrank > 0) {
      this.toasterCrank -= dt;
      if (this.toasterCrank <= 0) {
        this.toasterCrank = 0;
        for (const p of this.alivePlayers) {
          if (rectContains(ZONES.TOASTER, p.bread.x, p.bread.y)) {
            this.kill(p, null, 'burnt');
          }
        }
        this.emit('sabotage:toasterFire', {});
      }
    }
  }

  updatePlayer(p, dt) {
    const b = p.bread;
    const stunned = this.time < p.stunUntil;
    const inverted = this.time < p.invertUntil;

    // Riding an ant is a free ride down the trail.
    let riding = null;
    if (p.riding !== null) {
      riding = antPosition(ANT_PATH, ANT_RIDE_SPEED, this.time, p.riding);
      if (p.input.hop || stunned) { p.riding = null; riding = null; b.vz = 260; b.grounded = false; }
    }

    stepBread(b, p.input, dt, {
      moldPatches: this.moldPatches,
      carrying: !!p.carrying,
      stunned,
      inverted,
      riding,
    });

    // Spore clouds keep working on anyone who wanders in.
    for (const s of this.spores) {
      if (p.role === ROLE.MOLDY) continue;
      if (dist(b.x, b.y, s.x, s.y) < s.r) p.invertUntil = Math.max(p.invertUntil, this.time + 1.5);
    }

    // Moldy leaves a passive trail while moving.
    if (p.role === ROLE.MOLDY && b.grounded) {
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 40 && this.time - p.lastMoldDrop > MOLD_TRAIL.DROP_INTERVAL) {
        p.lastMoldDrop = this.time;
        this.moldPatches.push({
          x: b.x, y: b.y, r: MOLD_TRAIL.RADIUS,
          until: this.time + MOLD_TRAIL.LIFETIME, by: p.id,
        });
        if (this.moldPatches.length > 120) this.moldPatches.shift();
      }
    }

    // Carried crumb follows the slice.
    if (p.carrying) {
      const c = this.crumbs.find((x) => x.id === p.carrying);
      if (c) { c.x = b.x; c.y = b.y - 6 - b.z; }
    }

    this.updateZones(p, dt);
    this.updateTasks(p, dt);
    this.updateKillHold(p, dt);
  }

  updateZones(p, dt) {
    const b = p.bread;

    // Ant trail: hop onto a passing ant for a fast ride.
    if (p.riding === null && rectContains(ZONES.ANT_TRAIL, b.x, b.y) && b.z > 20) {
      for (let i = 0; i < 4; i++) {
        const a = antPosition(ANT_PATH, ANT_SPEED, this.time, i * 260);
        if (dist(b.x, b.y, a.x, a.y) < 46) {
          p.riding = i * 260;
          this.emit('ant:ride', { playerId: p.id });
          break;
        }
      }
    }
    if (p.riding !== null && !rectContains(ZONES.ANT_TRAIL, b.x, b.y)) p.riding = null;

    // Butter dish launches a hopping slice.
    if (rectContains(ZONES.BUTTER, b.x, b.y) && !b.grounded && b.vz > 0) {
      b.vz = Math.max(b.vz, PHYS.HOP_IMPULSE * 1.4);
    }

    // Sink leaves a soggy trail — handled visually client-side via `soggy`.
    p.soggy = rectContains(ZONES.SINK, b.x, b.y);
  }

  updateTasks(p, dt) {
    const b = p.bread;

    // --- Perfect Toast -----------------------------------------------------
    const inToaster = rectContains(ZONES.TOASTER, b.x, b.y);
    if (inToaster) {
      p.toastTime += dt;
      p.toastLevel = clamp(p.toastTime / TIMING.TOAST_BURN, 0, 1);
      if (p.toastTime >= TIMING.TOAST_BURN) {
        this.kill(p, null, 'burnt');
        return;
      }
      const task = this.taskOf(p, TASK.PERFECT_TOAST);
      if (task) task.progress = clamp(p.toastTime / TIMING.TOAST_PERFECT, 0, 1);
    } else if (p.toastTime > 0) {
      const task = this.taskOf(p, TASK.PERFECT_TOAST);
      if (task) {
        if (Math.abs(p.toastTime - TIMING.TOAST_PERFECT) <= TIMING.TOAST_WINDOW) {
          this.completeTask(p, TASK.PERFECT_TOAST);
          this.emit('toast:perfect', { playerId: p.id });
        } else {
          task.progress = 0;
          this.emit('toast:failed', { playerId: p.id, seconds: p.toastTime });
        }
      }
      p.toastTime = 0;
    }

    // --- Crumbs to Ants ----------------------------------------------------
    if (p.carrying && rectContains(ZONES.ANT_TRAIL, b.x, b.y)) {
      const c = this.crumbs.find((x) => x.id === p.carrying);
      if (c) {
        c.delivered = true; c.held = null;
        const center = rectCenter(ZONES.ANT_TRAIL);
        c.x = center.x; c.y = center.y;
      }
      p.carrying = null;
      this.emit('crumb:delivered', { playerId: p.id });
      this.completeTask(p, TASK.CRUMB_DELIVERY);
    }
    const crumbTask = this.taskOf(p, TASK.CRUMB_DELIVERY);
    if (crumbTask) crumbTask.progress = p.carrying ? 0.5 : 0;

    // --- Coo ---------------------------------------------------------------
    const cooTask = this.taskOf(p, TASK.COO);
    if (cooTask) {
      if (p.interact && rectContains(ZONES.BREADBOX, b.x, b.y) && this.time >= p.stunUntil) {
        p.cooTime += dt;
        b.puff = clamp(p.cooTime / TIMING.COO_SECONDS, 0, 1);
        cooTask.progress = b.puff;
        if (p.cooTime >= TIMING.COO_SECONDS) {
          this.completeTask(p, TASK.COO);
          this.emit('coo:pop', { playerId: p.id, x: b.x, y: b.y });
          p.cooTime = 0; b.puff = 0;
        }
      } else if (p.cooTime > 0) {
        p.cooTime = 0; b.puff = 0; cooTask.progress = 0;
      }
    }

    // --- Avoid the Knife ---------------------------------------------------
    const knifeTask = this.taskOf(p, TASK.KNIFE_DASH);
    if (knifeTask) {
      if (rectContains(ZONES.BOARD, b.x, b.y) && this.time >= p.stunUntil) {
        p.boardTime += dt;
        knifeTask.progress = clamp(p.boardTime / 6, 0, 1);
        if (p.boardTime >= 6) {
          this.completeTask(p, TASK.KNIFE_DASH);
          p.boardTime = 0;
        }
      }
    }
  }

  updateStacks(dt) {
    const alive = this.alivePlayers;
    for (const p of alive) {
      const near = alive.filter((o) =>
        dist(o.bread.x, o.bread.y, p.bread.x, p.bread.y) < TIMING.STACK_RADIUS);
      const task = this.taskOf(p, TASK.BREAD_STACK);
      if (near.length >= TIMING.STACK_COUNT) {
        p.stackTime += dt;
        if (task) task.progress = clamp(p.stackTime / TIMING.STACK_SECONDS, 0, 1);
        if (p.stackTime >= TIMING.STACK_SECONDS && task) {
          this.completeTask(p, TASK.BREAD_STACK);
          p.stackTime = 0;
        }
      } else {
        p.stackTime = 0;
        if (task) task.progress = 0;
      }
    }
  }

  updateKillHold(p, dt) {
    if (p.role !== ROLE.MOLDY || !p.killTarget) return;
    const victim = this.players.get(p.killTarget);
    const def = SABOTAGE_DEFS[SABOTAGE.KILL];
    if (!victim || !victim.alive) { p.killTarget = null; p.killHold = 0; return; }
    const d = dist(victim.bread.x, victim.bread.y, p.bread.x, p.bread.y);
    if (d > def.range * 1.4) {
      p.killTarget = null; p.killHold = 0;
      this.emit('sabotage:killAbort', { by: p.id });
      return;
    }
    p.killHold += dt;
    if (p.killHold >= def.hold) {
      this.kill(victim, p.id, 'mold');
      p.cooldowns[SABOTAGE.KILL] = this.time + def.cooldown;
      p.killTarget = null;
      p.killHold = 0;
    }
  }

  // -- action entry point --------------------------------------------------

  action(id, action) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    switch (action.type) {
      case 'pickup':
        if (this.state === GAME_STATE.PLAYING) this.tryPickup(p);
        break;
      case 'report': {
        const body = this.bodies.find((b) => !b.reported &&
          dist(b.x, b.y, p.bread.x, p.bread.y) < 110);
        if (body) this.callMeeting(id, 'body', body.id);
        break;
      }
      case 'scream':
        this.callMeeting(id, 'scream');
        break;
      case 'sabotage':
        this.useSabotage(id, action.ability, action.targetId);
        break;
      default: break;
    }
  }

  // -- serialization -------------------------------------------------------

  /**
   * Snapshot for the network. `viewerId` decides what stays secret: only the
   * moldy slice learns who the moldy slice is.
   */
  snapshot(viewerId = null) {
    const viewer = viewerId ? this.players.get(viewerId) : null;
    const viewerIsMoldy = viewer && viewer.role === ROLE.MOLDY;
    const viewerDead = viewer && !viewer.alive;
    const revealRoles = this.state === GAME_STATE.ENDED;

    return {
      v: this.version,
      time: this.time,
      state: this.state,
      round: this.round,
      roundTimer: Math.max(0, this.roundTimer),
      taskProgress: this.taskProgress,
      toasterCrank: this.toasterCrank,
      winner: this.winner,
      knife: { x: this.knife.x, y: this.knife.y },
      antT: this.time,
      crumbs: this.crumbs.map((c) => ({ id: c.id, x: c.x, y: c.y, held: c.held, delivered: c.delivered })),
      mold: this.moldPatches.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), r: m.r })),
      spores: this.spores.map((s) => ({ x: s.x, y: s.y, r: s.r })),
      bodies: this.bodies.map((b) => ({ id: b.id, playerId: b.playerId, x: b.x, y: b.y, cause: b.cause })),
      chat: this.state === GAME_STATE.MEETING ? this.chat : [],
      meeting: this.meeting ? {
        calledBy: this.meeting.calledBy,
        type: this.meeting.type,
        timer: Math.max(0, this.meeting.timer),
        votes: this.meeting.votes,
        resolved: this.meeting.resolved,
        result: this.meeting.result,
      } : null,
      you: viewer ? {
        id: viewer.id,
        role: viewer.role,
        alive: viewer.alive,
        tasks: viewer.tasks,
        usedScream: viewer.usedScream,
        carrying: viewer.carrying,
        killTarget: viewer.killTarget,
        killHold: viewer.killHold,
        stunUntil: viewer.stunUntil,
        invertUntil: viewer.invertUntil,
        cooldowns: Object.fromEntries(
          Object.keys(SABOTAGE_DEFS).map((k) => [k, this.cooldownLeft(viewer, k)])),
      } : null,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        colorIndex: p.colorIndex,
        alive: p.alive,
        isBot: p.isBot,
        x: Math.round(p.bread.x * 10) / 10,
        y: Math.round(p.bread.y * 10) / 10,
        z: Math.round(p.bread.z * 10) / 10,
        angle: Math.round(p.bread.angle * 10) / 10,
        lean: Math.round(p.bread.lean * 10) / 10,
        puff: Math.round(p.bread.puff * 100) / 100,
        toastLevel: Math.round((p.toastLevel || 0) * 100) / 100,
        framed: this.time < p.framedUntil,
        stunned: this.time < p.stunUntil,
        soggy: !!p.soggy,
        riding: p.riding !== null,
        carrying: !!p.carrying,
        // Role only leaks to those entitled to it.
        role: (revealRoles || viewerDead || (viewerIsMoldy && p.role === ROLE.MOLDY) || p.id === viewerId)
          ? p.role : null,
        taskDone: p.tasks.filter((t) => t.done).length,
        taskTotal: p.tasks.length,
      })),
    };
  }
}
