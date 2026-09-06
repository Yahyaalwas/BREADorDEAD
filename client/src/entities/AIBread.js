import {
  ROLE, ZONES, TASK, TIMING, SABOTAGE, SABOTAGE_DEFS, GAME_STATE, MOLD_TRAIL,
} from '../../../shared/constants.js';
import { dist, rectContains, rectCenter, clamp } from '../../../shared/physics.js';

export const AI_STATES = {
  WANDER: 'WANDER',
  DO_TASK: 'DO_TASK',
  FLEE: 'FLEE',
  STACK: 'STACK',
  SUSPECT: 'SUSPECT',
  PANIC: 'PANIC',
  HUNT: 'HUNT',
};

const CHATTER = {
  accuse: ['{n} was hovering by the toaster.', 'I saw {n} leave crumbs. Green ones.', '{n} has NOT done a task all round.', 'Where was {n} during the stack?'],
  defend: ['I was in the bread box, cooing.', 'I did toast. Ask the toaster.', 'Not me, I was carrying a crumb.', 'Why are you all looking at me.'],
  idle: ['Somebody is going stale.', 'I smell spores.', 'Skip? I have nothing.', 'This kitchen is not safe.'],
};

/**
 * A bot slice. Picks a behaviour, steers toward a point by torque, and pokes
 * the same GameSim API a human player would.
 */
export default class AIBread {
  constructor(sim, playerId, opts = {}) {
    this.sim = sim;
    this.id = playerId;
    this.state = AI_STATES.WANDER;
    this.stateTime = 0;
    this.target = null;
    this.targetPlayerId = null;
    this.interact = false;
    this.hopTimer = 0;
    this.rethink = 0;
    // Bots are deliberately imperfect: a distracted bot is a suspicious bot.
    this.skill = 0.55 + Math.random() * 0.4;
    this.suspicion = new Map();
    this.chatCooldown = 2 + Math.random() * 8;
    this.hasSpoken = false;
    this.votedFor = null;
    this.voteDelay = 4 + Math.random() * 20;
    this.reportDelay = 0;
    this.sabotageDelay = 8 + Math.random() * 12;
  }

  get me() { return this.sim.players.get(this.id); }
  get moldy() { return this.me?.role === ROLE.MOLDY; }

  // -- top level -----------------------------------------------------------

  update(dt) {
    const me = this.me;
    if (!me || !me.alive) return;

    if (this.sim.state === GAME_STATE.MEETING) {
      this.updateMeeting(dt);
      return;
    }
    if (this.sim.state !== GAME_STATE.PLAYING) return;

    this.stateTime += dt;
    this.rethink -= dt;
    this.sabotageDelay -= dt;

    if (this.rethink <= 0) {
      this.chooseState();
      this.rethink = 0.6 + Math.random() * 1.2;
    }

    this.act(dt);
    this.steer(dt);
    this.observe(dt);

    if (this.moldy) this.moldyBrain(dt);
    else this.maybeReport(dt);
  }

  // -- behaviour selection -------------------------------------------------

  chooseState() {
    const me = this.me;
    const b = me.bread;

    // The toaster alarm beats everything.
    if (this.sim.toasterCrank > 0 && rectContains(ZONES.TOASTER, b.x, b.y)) {
      return this.enter(AI_STATES.PANIC);
    }

    // Mold underfoot or a killer nearby: run.
    const threat = this.nearestThreat();
    if (!this.moldy && threat && threat.d < 170 && Math.random() < this.skill) {
      this.targetPlayerId = threat.p.id;
      return this.enter(AI_STATES.FLEE);
    }

    if (this.moldy) {
      const prey = this.nearestFresh();
      if (prey && prey.d < 300 && this.sim.cooldownLeft(me, SABOTAGE.KILL) <= 0 && Math.random() < 0.7) {
        this.targetPlayerId = prey.p.id;
        return this.enter(AI_STATES.HUNT);
      }
    }

    const pending = me.tasks.find((t) => !t.done);
    const roll = Math.random();
    if (pending && roll < this.skill) {
      this.taskId = pending.id;
      return this.enter(AI_STATES.DO_TASK);
    }
    if (roll < this.skill + 0.12) return this.enter(AI_STATES.STACK);
    if (roll < this.skill + 0.2) return this.enter(AI_STATES.SUSPECT);
    return this.enter(AI_STATES.WANDER);
  }

  enter(state) {
    if (this.state !== state) { this.state = state; this.stateTime = 0; }
    return state;
  }

  act(dt) {
    const me = this.me;
    const b = me.bread;
    this.interact = false;

    switch (this.state) {
      case AI_STATES.DO_TASK: this.actTask(dt); break;

      case AI_STATES.STACK: {
        const others = this.sim.alivePlayers.filter((p) => p.id !== this.id);
        if (others.length) {
          const closest = others.reduce((a, c) =>
            dist(c.bread.x, c.bread.y, b.x, b.y) < dist(a.bread.x, a.bread.y, b.x, b.y) ? c : a);
          this.target = { x: closest.bread.x, y: closest.bread.y };
        }
        break;
      }

      case AI_STATES.SUSPECT: {
        // Stop and stare. Menacing, useless, funny.
        this.target = null;
        const victim = this.sim.alivePlayers.find((p) => p.id !== this.id);
        if (victim) this.faceTarget(victim.bread.x, victim.bread.y);
        if (this.stateTime > 2.5) this.enter(AI_STATES.WANDER);
        break;
      }

      case AI_STATES.FLEE: {
        const t = this.sim.players.get(this.targetPlayerId);
        if (t) {
          this.target = {
            x: clamp(b.x + (b.x - t.bread.x) * 2, 60, 1540),
            y: clamp(b.y + (b.y - t.bread.y) * 2, 60, 940),
          };
        }
        this.hopTimer -= dt;
        if (this.stateTime > 3) this.enter(AI_STATES.WANDER);
        break;
      }

      case AI_STATES.PANIC: {
        const exit = rectCenter(ZONES.ANT_TRAIL);
        this.target = { x: exit.x, y: exit.y + 160 };
        this.hopTimer = 0;                       // flail
        if (this.sim.toasterCrank <= 0) this.enter(AI_STATES.WANDER);
        break;
      }

      case AI_STATES.HUNT: {
        const t = this.sim.players.get(this.targetPlayerId);
        if (!t || !t.alive) { this.enter(AI_STATES.WANDER); break; }
        const d = dist(t.bread.x, t.bread.y, b.x, b.y);
        // Close in, then stop shoving: the kill needs two seconds of proximity,
        // and a bot that keeps thrusting bounces itself out of range.
        this.target = d < 60 ? null : { x: t.bread.x, y: t.bread.y };
        if (!this.target) this.faceTarget(t.bread.x, t.bread.y);
        const alone = this.sim.alivePlayers.filter((p) =>
          p.id !== this.id && p.id !== t.id &&
          dist(p.bread.x, p.bread.y, b.x, b.y) < 240).length === 0;
        if (d < TIMING.KILL_RANGE && alone) {
          this.sim.action(this.id, { type: 'sabotage', ability: SABOTAGE.KILL, targetId: t.id });
        }
        if (this.stateTime > 12) this.enter(AI_STATES.WANDER);
        break;
      }

      default: {
        if (!this.target || dist(this.target.x, this.target.y, b.x, b.y) < 70 || this.stateTime > 4) {
          this.target = { x: 120 + Math.random() * 1360, y: 120 + Math.random() * 760 };
          this.stateTime = 0;
        }
      }
    }
  }

  actTask(dt) {
    const me = this.me;
    const b = me.bread;
    const task = me.tasks.find((t) => t.id === this.taskId && !t.done)
      || me.tasks.find((t) => !t.done);
    if (!task) { this.enter(AI_STATES.WANDER); return; }
    this.taskId = task.id;

    switch (task.id) {
      case TASK.PERFECT_TOAST: {
        const c = rectCenter(ZONES.TOASTER);
        this.target = c;
        // Leave the toaster once the count is close to three seconds. A clumsy
        // bot sometimes lingers and gets crisped, which is the joke.
        if (rectContains(ZONES.TOASTER, b.x, b.y)) {
          const wantOut = me.toastTime > TIMING.TOAST_PERFECT - 0.25 * this.skill;
          if (wantOut) this.target = { x: c.x, y: ZONES.TOASTER.y + ZONES.TOASTER.h + 140 };
        }
        break;
      }
      case TASK.CRUMB_DELIVERY: {
        if (me.carrying) {
          this.target = rectCenter(ZONES.ANT_TRAIL);
        } else {
          const free = this.sim.crumbs.filter((c) => !c.held && !c.delivered);
          if (!free.length) { this.enter(AI_STATES.WANDER); break; }
          const c = free.reduce((a, x) =>
            dist(x.x, x.y, b.x, b.y) < dist(a.x, a.y, b.x, b.y) ? x : a);
          this.target = { x: c.x, y: c.y };
          if (dist(c.x, c.y, b.x, b.y) < 70) this.sim.action(this.id, { type: 'pickup' });
        }
        break;
      }
      case TASK.COO: {
        const c = rectCenter(ZONES.BREADBOX);
        this.target = c;
        if (rectContains(ZONES.BREADBOX, b.x, b.y)) { this.interact = true; this.target = null; }
        break;
      }
      case TASK.KNIFE_DASH: {
        const c = rectCenter(ZONES.BOARD);
        this.target = c;
        const k = this.sim.knife;
        if (dist(k.x, k.y, b.x, b.y) < 150) {
          this.hopTimer = 0;                      // hop the blade
          this.target = { x: b.x + (b.x - k.x), y: b.y + (b.y - k.y) };
        }
        break;
      }
      case TASK.BREAD_STACK:
      default:
        this.enter(AI_STATES.STACK);
        break;
    }
  }

  // -- steering ------------------------------------------------------------

  faceTarget(tx, ty) {
    const b = this.me.bread;
    const want = Math.atan2(ty - b.y, tx - b.x) * 180 / Math.PI;
    let diff = ((want - b.angle + 540) % 360) - 180;
    return diff;
  }

  steer(dt) {
    const me = this.me;
    const b = me.bread;
    const input = { left: false, right: false, forward: false, back: false, hop: false, interact: this.interact };

    if (this.target) {
      const diff = this.faceTarget(this.target.x, this.target.y);
      const deadzone = 12;
      if (diff > deadzone) input.right = true;
      else if (diff < -deadzone) input.left = true;
      // Only push once roughly pointing the right way, or the slice spins out.
      if (Math.abs(diff) < 55) input.forward = true;

      this.hopTimer -= dt;
      if (this.hopTimer <= 0) {
        input.hop = Math.random() < 0.5;
        this.hopTimer = 0.8 + Math.random() * 2.2;
      }
    } else if (this.state === AI_STATES.PANIC) {
      input.left = Math.random() < 0.5;
      input.right = !input.left;
      input.hop = Math.random() < 0.3;
    }

    this.sim.setInput(this.id, input);
    this.sim.players.get(this.id).interact = this.interact;
  }

  // -- perception ----------------------------------------------------------

  nearestFresh() {
    const b = this.me.bread;
    let best = null;
    for (const p of this.sim.freshAlive) {
      if (p.id === this.id) continue;
      const d = dist(p.bread.x, p.bread.y, b.x, b.y);
      if (!best || d < best.d) best = { p, d };
    }
    return best;
  }

  nearestThreat() {
    const b = this.me.bread;
    let best = null;
    for (const p of this.sim.alivePlayers) {
      if (p.id === this.id) continue;
      // Bots cannot see roles; they react to mold underfoot and to framed slices.
      const framed = this.sim.time < p.framedUntil;
      const moldNear = this.sim.moldPatches.some((m) =>
        dist(m.x, m.y, p.bread.x, p.bread.y) < MOLD_TRAIL.RADIUS * 1.5);
      if (!framed && !moldNear) continue;
      const d = dist(p.bread.x, p.bread.y, b.x, b.y);
      if (!best || d < best.d) best = { p, d };
    }
    return best;
  }

  observe(dt) {
    const b = this.me.bread;
    for (const p of this.sim.alivePlayers) {
      if (p.id === this.id) continue;
      const d = dist(p.bread.x, p.bread.y, b.x, b.y);
      if (d > 380) continue;
      let delta = 0;
      if (this.sim.time < p.framedUntil) delta += dt * 0.9;
      // A bot has to actually be standing in the trail, close to whoever left
      // it, and observant enough to join the dots. Dim bots miss it entirely.
      const noticing = Math.max(0, this.skill - 0.55);
      if (d < 250 && this.sim.moldPatches.some((m) =>
        m.by === p.id && dist(m.x, m.y, b.x, b.y) < 120)) {
        delta += dt * 1.1 * noticing;
      }
      // Only a close-up witness sees a stalk — the same radius the moldy bot
      // checks before committing, so a careful kill really is unseen.
      if (p.killTarget && d < 200) delta += dt * 3;
      // Bread is paranoid. A little groundless suspicion keeps votes wrong.
      delta += dt * 0.09 * Math.random();
      if (delta) this.suspicion.set(p.id, (this.suspicion.get(p.id) || 0) + delta);
    }
  }

  maybeReport(dt) {
    const b = this.me.bread;
    this.reportDelay -= dt;
    const body = this.sim.bodies.find((x) => !x.reported && dist(x.x, x.y, b.x, b.y) < 110);
    if (body && this.reportDelay <= 0) {
      this.suspicion.set(body.playerId, -99);   // the dead are innocent
      this.sim.action(this.id, { type: 'report' });
      this.reportDelay = 5;
    }
  }

  moldyBrain(dt) {
    const me = this.me;
    if (this.sabotageDelay > 0) return;
    const witnesses = this.sim.alivePlayers.filter((p) =>
      p.id !== this.id && dist(p.bread.x, p.bread.y, me.bread.x, me.bread.y) < 260).length;

    const options = [];
    if (this.sim.cooldownLeft(me, SABOTAGE.SPORE_BURST) <= 0 && witnesses > 0) options.push(SABOTAGE.SPORE_BURST);
    if (this.sim.cooldownLeft(me, SABOTAGE.TOASTER) <= 0) options.push(SABOTAGE.TOASTER);
    if (this.sim.cooldownLeft(me, SABOTAGE.FRAME) <= 0 && witnesses > 0) options.push(SABOTAGE.FRAME);
    if (!options.length) { this.sabotageDelay = 4; return; }

    const ability = options[Math.floor(Math.random() * options.length)];
    this.sim.action(this.id, { type: 'sabotage', ability });
    this.sabotageDelay = 10 + Math.random() * 14;
  }

  // -- meetings ------------------------------------------------------------

  updateMeeting(dt) {
    const m = this.sim.meeting;
    if (!m || m.resolved) return;

    this.chatCooldown -= dt;
    if (this.chatCooldown <= 0) {
      this.chatCooldown = 6 + Math.random() * 14;
      this.say();
    }

    this.voteDelay -= dt;
    if (this.voteDelay <= 0 && !m.votes[this.id]) {
      this.sim.vote(this.id, this.pickVote());
    }
  }

  pickVote() {
    const alive = this.sim.alivePlayers.filter((p) => p.id !== this.id);
    if (!alive.length) return 'skip';

    if (this.moldy) {
      // Vote for whoever the room already dislikes, never for yourself.
      const framed = alive.find((p) => this.sim.time < p.framedUntil);
      if (framed) return framed.id;
      return Math.random() < 0.5 ? 'skip' : alive[Math.floor(Math.random() * alive.length)].id;
    }

    let best = null, bestScore = 1.6;   // below this, a bot would rather skip
    for (const p of alive) {
      const s = this.suspicion.get(p.id) || 0;
      if (s > bestScore) { best = p; bestScore = s; }
    }
    if (best) return best.id;
    return Math.random() < 0.55 ? 'skip' : alive[Math.floor(Math.random() * alive.length)].id;
  }

  say() {
    const alive = this.sim.alivePlayers.filter((p) => p.id !== this.id);
    if (!alive.length) return;
    let line;
    const suspect = alive.reduce((a, c) =>
      (this.suspicion.get(c.id) || 0) > (this.suspicion.get(a.id) || 0) ? c : a, alive[0]);
    const score = this.suspicion.get(suspect.id) || 0;
    if (score > 1 && !this.moldy) {
      line = CHATTER.accuse[Math.floor(Math.random() * CHATTER.accuse.length)]
        .replace('{n}', suspect.name);
    } else if (this.moldy && Math.random() < 0.5) {
      line = CHATTER.defend[Math.floor(Math.random() * CHATTER.defend.length)];
    } else {
      line = CHATTER.idle[Math.floor(Math.random() * CHATTER.idle.length)];
    }
    this.sim.addChat(this.id, line);
  }
}
