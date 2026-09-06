// Deterministic bread simulation shared by the server (authoritative), the
// client (prediction) and the solo-mode AI. Keep it pure: no Phaser, no DOM.

import { PHYS, SURFACE, WORLD, ZONES, OBSTACLES } from './constants.js';

const DEG = Math.PI / 180;

export function createBreadState(x = 0, y = 0, angle = 0) {
  return {
    x, y,
    vx: 0, vy: 0,
    angle,          // facing, degrees
    angVel: 0,      // deg/s
    lean: 0,        // degrees the slice has flopped onto its side
    leanVel: 0,
    z: 0,           // hop height
    vz: 0,
    grounded: true,
    hopCd: 0,
    puff: 0,        // 0..1 "coo" inflation
  };
}

export function emptyInput() {
  return { left: false, right: false, forward: false, back: false, hop: false, seq: 0 };
}

export function isFlat(b) {
  return Math.abs(b.lean) > PHYS.FLAT_ANGLE;
}

export function rectContains(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function rectCenter(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function zonesAt(x, y) {
  const hits = [];
  for (const key of Object.keys(ZONES)) {
    if (rectContains(ZONES[key], x, y)) hits.push(key);
  }
  return hits;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Which surface modifier applies where the bread is standing.
export function surfaceAt(x, y, moldPatches = []) {
  const zones = zonesAt(x, y);
  if (zones.includes('SINK')) return SURFACE.WATER;
  if (zones.includes('BUTTER')) return SURFACE.BUTTER;
  for (const p of moldPatches) {
    if (dist(x, y, p.x, p.y) < (p.r || 34)) return SURFACE.MOLD;
  }
  return SURFACE.NORMAL;
}

function resolveObstacles(b) {
  const half = WORLD.BREAD_RADIUS;
  for (const o of OBSTACLES) {
    const nx = clamp(b.x, o.x, o.x + o.w);
    const ny = clamp(b.y, o.y, o.y + o.h);
    const dx = b.x - nx;
    const dy = b.y - ny;
    const d = Math.hypot(dx, dy);
    if (d < half && b.z < 40) {
      const push = half - d;
      if (d < 0.0001) {
        b.x += push;
      } else {
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
      // Bonking a jar sends the slice spinning.
      b.vx *= -0.35;
      b.vy *= -0.35;
      b.leanVel += (Math.random() - 0.5) * 160;
      b.angVel += (Math.random() - 0.5) * 220;
    }
  }
}

/**
 * Advance one bread by dt seconds.
 *
 * @param {object} b     bread state (mutated)
 * @param {object} input {left,right,forward,back,hop}
 * @param {number} dt    seconds
 * @param {object} env   {moldPatches, carrying, stunned, inverted, speedMult, riding}
 */
export function stepBread(b, input, dt, env = {}) {
  const {
    moldPatches = [],
    carrying = false,
    stunned = false,
    inverted = false,
    speedMult = 1,
    riding = null,
  } = env;

  const damp = (base) => Math.pow(base, dt * PHYS.TICK_HZ);

  b.hopCd = Math.max(0, b.hopCd - dt);

  let left = input.left, right = input.right, fwd = input.forward, back = input.back;
  if (inverted) {
    const t = left; left = right; right = t;
    const f = fwd; fwd = back; back = f;
  }
  if (stunned) { left = right = fwd = back = false; }

  const surface = surfaceAt(b.x, b.y, moldPatches);
  const flat = isFlat(b);

  // --- Angular: torque, not velocity. -------------------------------------
  let torque = 0;
  if (left) torque -= PHYS.TORQUE;
  if (right) torque += PHYS.TORQUE;
  if (flat) torque *= 0.4;                       // hard to pivot when face-down
  b.angVel += torque * dt;
  b.angVel = clamp(b.angVel * damp(PHYS.ANG_DAMP), -PHYS.ANG_MAX, PHYS.ANG_MAX);
  b.angle = (b.angle + b.angVel * dt) % 360;

  // Turning tips the slice sideways — but only past a threshold, so ordinary
  // steering stays controllable and only a berserk spin puts you on your face.
  const spin = Math.abs(b.angVel);
  if (spin > PHYS.SPIN_TIP) {
    const excess = (spin - PHYS.SPIN_TIP) * Math.sign(b.angVel);
    b.leanVel += excess * PHYS.LEAN_FROM_TURN * dt * PHYS.TICK_HZ;
  }

  // --- Lean spring: the slice wants to be upright, but slowly. -------------
  if (b.grounded) {
    b.leanVel += -b.lean * PHYS.LEAN_SPRING * dt;
    if (carrying) b.leanVel += PHYS.CARRY_LEAN_BIAS * dt;
  }
  b.leanVel *= damp(PHYS.LEAN_DAMP);
  b.lean = clamp(b.lean + b.leanVel * dt, -PHYS.LEAN_MAX, PHYS.LEAN_MAX);

  // --- Thrust along facing, scaled by how flopped over the slice is. -------
  let thrust = 0;
  if (fwd) thrust += PHYS.THRUST;
  if (back) thrust -= PHYS.THRUST * 0.55;
  const tilt = 1 - Math.abs(b.lean) / PHYS.LEAN_MAX;   // upright = full push
  let mult = speedMult * surface.speed * (flat ? PHYS.FLAT_THRUST : 0.35 + 0.65 * tilt);
  if (carrying) mult *= PHYS.CARRY_SPEED_MULT;
  if (!b.grounded) mult *= 0.45;                        // little control mid-hop

  const rad = b.angle * DEG;
  b.vx += Math.cos(rad) * thrust * mult * dt;
  b.vy += Math.sin(rad) * thrust * mult * dt;

  // --- Drag -----------------------------------------------------------------
  let drag = surface.drag;
  if (flat && b.grounded) drag *= PHYS.FLAT_FRICTION;
  if (!b.grounded) drag = 0.995;
  b.vx *= damp(drag);
  b.vy *= damp(drag);

  const speed = Math.hypot(b.vx, b.vy);
  const maxSpeed = PHYS.MAX_SPEED * speedMult * surface.speed * (carrying ? PHYS.CARRY_SPEED_MULT : 1);
  if (speed > maxSpeed) {
    b.vx = (b.vx / speed) * maxSpeed;
    b.vy = (b.vy / speed) * maxSpeed;
  }

  // --- Hop ------------------------------------------------------------------
  if (input.hop && b.grounded && b.hopCd <= 0 && !stunned) {
    b.vz = PHYS.HOP_IMPULSE * (surface === SURFACE.BUTTER ? 1.6 : 1);
    b.grounded = false;
    b.hopCd = PHYS.HOP_COOLDOWN;
    b.leanVel += (Math.random() - 0.5) * PHYS.HOP_LEAN_KICK;
    b.angVel += (Math.random() - 0.5) * PHYS.HOP_SPIN_KICK;
    // A hop launches the slice the way it is facing.
    b.vx += Math.cos(rad) * 90 * mult;
    b.vy += Math.sin(rad) * 90 * mult;
  }

  if (!b.grounded) {
    b.vz -= PHYS.GRAVITY_Z * dt;
    b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      b.vz = 0;
      b.grounded = true;
      b.leanVel += (Math.random() - 0.5) * PHYS.LAND_LEAN_KICK;
    }
  }

  // --- Integrate ------------------------------------------------------------
  if (riding) {
    b.x = riding.x;
    b.y = riding.y;
    b.vx *= 0.5;
    b.vy *= 0.5;
  } else {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // Counter edges
  const m = WORLD.BREAD_RADIUS;
  if (b.x < m) { b.x = m; b.vx = Math.abs(b.vx) * 0.4; b.leanVel += 60; }
  if (b.x > WORLD.WIDTH - m) { b.x = WORLD.WIDTH - m; b.vx = -Math.abs(b.vx) * 0.4; b.leanVel -= 60; }
  if (b.y < m) { b.y = m; b.vy = Math.abs(b.vy) * 0.4; b.leanVel += 60; }
  if (b.y > WORLD.HEIGHT - m) { b.y = WORLD.HEIGHT - m; b.vy = -Math.abs(b.vy) * 0.4; b.leanVel -= 60; }

  if (!riding) resolveObstacles(b);

  return b;
}

// Where an ant is along the loop at time t (seconds), for the ant-trail rides.
export function antPosition(path, speed, t, offset = 0) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const c = path[(i + 1) % path.length];
    const len = dist(a.x, a.y, c.x, c.y);
    segs.push({ a, c, len });
    total += len;
  }
  let d = ((t * speed + offset) % total + total) % total;
  for (const s of segs) {
    if (d <= s.len) {
      const k = s.len === 0 ? 0 : d / s.len;
      return { x: s.a.x + (s.c.x - s.a.x) * k, y: s.a.y + (s.c.y - s.a.y) * k };
    }
    d -= s.len;
  }
  return { x: path[0].x, y: path[0].y };
}
