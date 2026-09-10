import {
  ROLE, GAME_STATE, CHORES, CHORE_KIND, TIMING, VISION, HAY, BELL, QUICK_CHAT,
} from '../../../shared/constants.js';
import { dist, findPath, roomAt } from '../../../shared/movement.js';

export const AI_STATE = {
  CHORE: 'CHORE',
  WANDER: 'WANDER',
  FOLLOW: 'FOLLOW',
  REPORT: 'REPORT',
  HUNT: 'HUNT',
  LURK: 'LURK',
  FLEE: 'FLEE',
};

const SHEEP_LINES = [
  'i was doing chores i swear', 'where??', 'i saw nothing', 'skip?',
  'who was with {n}?', 'that was fast', 'i was in the coop', 'not me!!',
  'why is {n} so quiet', 'sus', 'i literally just spawned',
];
const WOLF_LINES = [
  'i was in the barn the whole time', 'wasnt me', 'i was doing the eggs',
  'why me??', 'i saw {n} run past', '{n} is acting weird', 'skip, no info',
];

/**
 * A bot sheep. It walks the same nav graph a player walks, pokes the same
 * GameSim API a player pokes, and is deliberately imperfect — a bot that never
 * misses a body or always spots the wolf makes the game unwinnable for the wolf.
 */
export default class AISheep {
  constructor(sim, playerId) {
    this.sim = sim;
    this.id = playerId;
    this.state = AI_STATE.WANDER;
    this.stateTime = 0;
    this.path = [];
    this.target = null;
    this.targetChore = null;
    this.tapCooldown = 0;
    this.rethink = 0;
    this.skill = 0.5 + Math.random() * 0.45;
    this.suspicion = new Map();
    this.chatCooldown = 3 + Math.random() * 10;
    this.voteDelay = 8 + Math.random() * 30;
    this.hesitate = 0;
    this.seenEvents = new Set();
    this.lastSeenWith = new Map();   // victimId -> [{ id, t }] sightings
    this.sightTimer = 0;
  }

  get me() { return this.sim.players.get(this.id); }
  get isWolf() { return this.me?.role === ROLE.WOLF; }

  // -- perception ----------------------------------------------------------

  /**
   * Remember who was standing near whom. When a body turns up, whoever was last
   * seen with the victim gets the suspicion — which is the actual reasoning
   * players do, and it makes the wolf's isolate-and-eat plan risky.
   */
  rememberSightings(dt) {
    this.sightTimer -= dt;
    if (this.sightTimer > 0) return;
    this.sightTimer = 0.5;
    const me = this.me;
    const visible = this.sim.alivePlayers.filter((p) =>
      p.id !== this.id && dist(p.body.x, p.body.y, me.body.x, me.body.y) < VISION.SHEEP);
    for (const a of visible) {
      const near = visible.filter((b) => b.id !== a.id &&
        dist(a.body.x, a.body.y, b.body.x, b.body.y) < 220);
      if (!near.length) continue;
      const list = this.lastSeenWith.get(a.id) || [];
      for (const b of near) list.push({ id: b.id, t: this.sim.time });
      this.lastSeenWith.set(a.id, list.filter((e) => this.sim.time - e.t < 25).slice(-12));
    }
  }

  /** Called with the sim's undrained events, so bots react to what they saw. */
  observeEvents(events) {
    const me = this.me;
    if (!me || !me.alive) return;
    for (const ev of events) {
      if (ev.type !== 'player:eaten' || this.seenEvents.has(ev.t + ev.playerId)) continue;
      this.seenEvents.add(ev.t + ev.playerId);
      const saw = dist(me.body.x, me.body.y, ev.x, ev.y) < VISION.SHEEP;
      if (saw && ev.by !== this.id) {
        // A witnessed kill is damning, and the witness will say so out loud.
        this.suspicion.set(ev.by, (this.suspicion.get(ev.by) || 0) + 10);
        this.witnessed = ev.by;
        continue;
      }
      // Otherwise fall back on who the victim was last seen with.
      const seen = this.lastSeenWith.get(ev.playerId) || [];
      const recent = seen.filter((e) => ev.t - e.t < 20);
      const counts = new Map();
      for (const e of recent) counts.set(e.id, (counts.get(e.id) || 0) + 1);
      for (const [who, n] of counts) {
        if (who === this.id) continue;
        this.suspicion.set(who, (this.suspicion.get(who) || 0) + Math.min(n, 6) * 0.7 * this.skill);
      }
    }
  }

  // -- steering ------------------------------------------------------------

  goTo(x, y) {
    const me = this.me;
    if (!this.target || dist(this.target.x, this.target.y, x, y) > 60 || !this.path.length) {
      this.target = { x, y };
      this.path = findPath(me.body.x, me.body.y, x, y);
    }
  }

  followPath() {
    const me = this.me;
    if (!this.path.length) { this.sim.setInput(this.id, { dx: 0, dy: 0 }); return true; }
    const wp = this.path[0];
    const dx = wp.x - me.body.x;
    const dy = wp.y - me.body.y;
    const d = Math.hypot(dx, dy);
    if (d < (this.path.length > 1 ? 46 : 26)) {
      this.path.shift();
      if (!this.path.length) { this.sim.setInput(this.id, { dx: 0, dy: 0 }); return true; }
      return false;
    }
    this.sim.setInput(this.id, { dx: dx / d, dy: dy / d });
    return false;
  }

  // -- main ----------------------------------------------------------------

  update(dt) {
    const me = this.me;
    if (!me || !me.alive) return;
    if (this.sim.state === GAME_STATE.MEETING) return this.updateMeeting(dt);
    if (this.sim.state !== GAME_STATE.PLAYING) return;

    this.stateTime += dt;
    this.rethink -= dt;
    this.rememberSightings(dt);
    this.tapCooldown -= dt;
    this.hesitate -= dt;

    if (this.rethink <= 0) {
      this.think();
      this.rethink = 0.5 + Math.random() * 1.2;
    }
    this.act(dt);
  }

  think() {
    const me = this.me;

    // Anyone can stumble on a body — but a distracted bot walks right past it.
    const body = this.sim.nearbyBody(me);
    if (body && (!this.isWolf || Math.random() < 0.25) && Math.random() < this.skill) {
      return this.enter(AI_STATE.REPORT);
    }

    if (this.isWolf) {
      const prey = this.isolatedPrey();
      if (prey && me.eatCd <= 0) { this.prey = prey.id; return this.enter(AI_STATE.HUNT); }
      if (me.eatCd > 0 && me.eatCd > TIMING.EAT_COOLDOWN - 6) return this.enter(AI_STATE.FLEE);
      // Otherwise loiter near chores so it looks busy.
      return this.enter(Math.random() < 0.6 ? AI_STATE.LURK : AI_STATE.WANDER);
    }

    const pending = me.chores.find((c) => !c.done);
    if (pending && Math.random() < this.skill + 0.25) {
      this.targetChore = CHORES.find((c) => c.id === pending.id);
      return this.enter(AI_STATE.CHORE);
    }
    if (Math.random() < 0.3) return this.enter(AI_STATE.FOLLOW);
    return this.enter(AI_STATE.WANDER);
  }

  enter(state) {
    if (this.state !== state) {
      this.state = state;
      this.stateTime = 0;
      this.path = [];
      this.target = null;
    }
    return state;
  }

  act(dt) {
    const me = this.me;
    switch (this.state) {
      case AI_STATE.REPORT: {
        const body = this.sim.nearbyBody(me);
        if (!body) { this.enter(AI_STATE.WANDER); break; }
        this.sim.action(this.id, { type: 'report' });
        break;
      }

      case AI_STATE.CHORE: {
        const def = this.targetChore;
        if (!def) { this.enter(AI_STATE.WANDER); break; }
        const mine = me.chores.find((c) => c.id === def.id);
        if (!mine || mine.done) { this.enter(AI_STATE.WANDER); break; }
        this.goTo(def.x, def.y);
        const arrived = this.followPath();
        if (!arrived) break;
        if (def.kind === CHORE_KIND.TAP) {
          if (this.tapCooldown <= 0) {
            this.sim.action(this.id, { type: 'chore' });
            this.tapCooldown = 0.18;
          }
        } else {
          this.sim.action(this.id, { type: 'holdStart' });
        }
        if (this.stateTime > 14) this.enter(AI_STATE.WANDER);
        break;
      }

      case AI_STATE.FOLLOW: {
        const buddy = this.nearestOther();
        if (!buddy) { this.enter(AI_STATE.WANDER); break; }
        this.goTo(buddy.body.x, buddy.body.y);
        this.followPath();
        if (this.stateTime > 6) this.enter(AI_STATE.WANDER);
        break;
      }

      case AI_STATE.HUNT: {
        const prey = this.sim.players.get(this.prey);
        if (!prey || !prey.alive) { this.enter(AI_STATE.WANDER); break; }
        this.goTo(prey.body.x, prey.body.y);
        this.followPath();
        const d = dist(prey.body.x, prey.body.y, me.body.x, me.body.y);
        // Fog first if the chase is long — that is what it is for.
        if (d < 260 && me.fogCd <= 0 && Math.random() < 0.02) {
          this.sim.action(this.id, { type: 'fog' });
        }
        if (d <= TIMING.EAT_RANGE && this.alone(prey)) {
          this.sim.action(this.id, { type: 'eat' });
          this.enter(AI_STATE.FLEE);
        }
        if (this.stateTime > 16) this.enter(AI_STATE.WANDER);
        break;
      }

      case AI_STATE.FLEE: {
        // Straight after a kill: tunnel away if a hay bale is close, else walk.
        const hay = HAY.find((h) => dist(h.x, h.y, me.body.x, me.body.y) <= TIMING.TUNNEL_RANGE);
        if (hay && me.tunnelCd <= 0) {
          this.sim.action(this.id, { type: 'tunnel' });
          this.enter(AI_STATE.LURK);
          break;
        }
        const far = HAY[Math.floor(Math.random() * HAY.length)];
        this.goTo(far.x, far.y);
        this.followPath();
        if (this.stateTime > 7) this.enter(AI_STATE.LURK);
        break;
      }

      case AI_STATE.LURK: {
        // Stand around a chore station doing nothing, like a normal sheep.
        if (!this.lurkSpot || this.stateTime > 8) {
          this.lurkSpot = CHORES[Math.floor(Math.random() * CHORES.length)];
          this.stateTime = 0;
        }
        this.goTo(this.lurkSpot.x, this.lurkSpot.y);
        this.followPath();
        break;
      }

      default: {
        if (!this.path.length || this.stateTime > 6) {
          const spot = Math.random() < 0.4
            ? { x: BELL.x, y: BELL.y }
            : CHORES[Math.floor(Math.random() * CHORES.length)];
          this.goTo(spot.x, spot.y);
          this.stateTime = 0;
        }
        this.followPath();
      }
    }
  }

  // -- helpers -------------------------------------------------------------

  nearestOther() {
    const me = this.me;
    let best = null, bestD = Infinity;
    for (const p of this.sim.alivePlayers) {
      if (p.id === this.id) continue;
      const d = dist(p.body.x, p.body.y, me.body.x, me.body.y);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  /** A sheep with nobody else nearby: the wolf's whole job is finding one. */
  isolatedPrey() {
    const me = this.me;
    let best = null, bestD = Infinity;
    for (const p of this.sim.sheepAlive) {
      if (p.id === this.id) continue;
      const witnesses = this.sim.alivePlayers.filter((o) =>
        o.id !== this.id && o.id !== p.id &&
        dist(o.body.x, o.body.y, p.body.x, p.body.y) < 330).length;
      if (witnesses > 0) continue;
      const d = dist(p.body.x, p.body.y, me.body.x, me.body.y);
      if (d < bestD && d < 900) { best = p; bestD = d; }
    }
    return best;
  }

  alone(prey) {
    const me = this.me;
    return !this.sim.alivePlayers.some((o) =>
      o.id !== this.id && o.id !== prey.id &&
      dist(o.body.x, o.body.y, me.body.x, me.body.y) < 330);
  }

  // -- meetings ------------------------------------------------------------

  updateMeeting(dt) {
    const m = this.sim.meeting;
    if (!m || m.resolved) return;
    this.chatCooldown -= dt;
    this.voteDelay -= dt;

    if (this.chatCooldown <= 0) {
      this.chatCooldown = 7 + Math.random() * 16;
      this.say();
    }
    if (this.voteDelay <= 0 && !m.votes[this.id]) {
      this.sim.vote(this.id, this.pickVote());
    }
  }

  say() {
    const others = this.sim.alivePlayers.filter((p) => p.id !== this.id);
    if (!others.length) return;
    let line;
    if (this.witnessed && !this.isWolf) {
      const seen = this.sim.players.get(this.witnessed);
      line = seen ? `IT WAS ${seen.name.toUpperCase()}, I SAW IT` : 'i saw it happen';
      this.witnessed = null;
    } else {
      const pool = this.isWolf ? WOLF_LINES : SHEEP_LINES;
      const pick = others[Math.floor(Math.random() * others.length)];
      line = pool[Math.floor(Math.random() * pool.length)].replace('{n}', pick.name);
    }
    this.sim.addChat(this.id, line);
  }

  pickVote() {
    const others = this.sim.alivePlayers.filter((p) => p.id !== this.id);
    if (!others.length) return 'skip';

    if (this.isWolf) {
      // Never yourself; ride whatever accusation is already loudest.
      const accused = Object.values(this.sim.meeting.votes)
        .filter((v) => v !== 'skip' && v !== this.id);
      if (accused.length && Math.random() < 0.7) return accused[0];
      return Math.random() < 0.4 ? 'skip' : others[Math.floor(Math.random() * others.length)].id;
    }

    let best = null, bestScore = 2;
    for (const p of others) {
      const s = this.suspicion.get(p.id) || 0;
      if (s > bestScore) { best = p; bestScore = s; }
    }
    if (best) return best.id;
    // No evidence: skip. Ejecting on a coin flip only ever helps the wolf.
    const votes = Object.values(this.sim.meeting.votes).filter((v) => v !== 'skip');
    if (votes.length && Math.random() < 0.2) return votes[0];
    return Math.random() < 0.88 ? 'skip' : others[Math.floor(Math.random() * others.length)].id;
  }
}
