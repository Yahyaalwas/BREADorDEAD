// Movement and map geometry, shared by the server (authoritative), the client
// (prediction) and the AI. Pure: no Phaser, no DOM.

import { WORLD, MOVE, WALKABLE, ROOMS } from './constants.js';

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export function createBody(x = 0, y = 0) {
  return { x, y, vx: 0, vy: 0, facing: 1, moving: false, bob: 0 };
}

export function emptyInput() {
  return { dx: 0, dy: 0 };
}

export function rectContains(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Keep a body inside the union of walkable rectangles.
 *
 * Rectangles are deflated by the body radius, so "walkable" means the whole
 * sheep fits. If the point is outside every rectangle it snaps to the nearest
 * one — which cannot wedge a player in a corner the way wall-normal collision
 * resolution can.
 */
export function clampToWalkable(x, y, r = WORLD.SHEEP_R) {
  let best = null;
  let bestD = Infinity;
  for (const rect of WALKABLE) {
    const x0 = rect.x + r;
    const x1 = rect.x + rect.w - r;
    const y0 = rect.y + r;
    const y1 = rect.y + rect.h - r;
    if (x1 < x0 || y1 < y0) continue;         // rectangle too thin to stand in
    const cx = clamp(x, x0, x1);
    const cy = clamp(y, y0, y1);
    if (cx === x && cy === y) return { x, y, inside: true };
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
  }
  return best ? { x: best.x, y: best.y, inside: false } : { x, y, inside: false };
}

export function isWalkable(x, y, r = WORLD.SHEEP_R) {
  return clampToWalkable(x, y, r).inside;
}

/** Which room a point is in, or null when it is in a corridor. */
export function roomAt(x, y) {
  for (const key of Object.keys(ROOMS)) {
    if (rectContains(ROOMS[key], x, y)) return key;
  }
  return null;
}

/**
 * One movement step. Input is a direction vector (already normalised by the
 * caller or normalised here); there is no momentum to fight.
 */
export function stepBody(body, input, dt, { speedMult = 1, frozen = false } = {}) {
  let dx = frozen ? 0 : (input.dx || 0);
  let dy = frozen ? 0 : (input.dy || 0);
  const mag = Math.hypot(dx, dy);
  if (mag > 1) { dx /= mag; dy /= mag; }

  const damp = Math.pow(MOVE.FRICTION, dt * MOVE.TICK_HZ);
  if (mag > 0.01) {
    body.vx += dx * MOVE.ACCEL * dt;
    body.vy += dy * MOVE.ACCEL * dt;
    if (Math.abs(dx) > 0.15) body.facing = dx > 0 ? 1 : -1;
  } else {
    body.vx *= damp;
    body.vy *= damp;
  }

  const max = MOVE.SPEED * speedMult;
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > max) {
    body.vx = (body.vx / speed) * max;
    body.vy = (body.vy / speed) * max;
  }

  const nx = body.x + body.vx * dt;
  const ny = body.y + body.vy * dt;

  // Resolve each axis separately so brushing a wall slides instead of sticking.
  const tryX = clampToWalkable(nx, body.y);
  const tryY = clampToWalkable(tryX.x, ny);
  body.x = tryY.x;
  body.y = tryY.y;
  if (!tryX.inside) body.vx *= 0.3;
  if (!tryY.inside) body.vy *= 0.3;

  body.moving = Math.hypot(body.vx, body.vy) > 24;
  body.bob = (body.bob + (body.moving ? dt * 11 : 0)) % (Math.PI * 2);
  return body;
}

export function teleport(body, x, y) {
  const p = clampToWalkable(x, y);
  body.x = p.x;
  body.y = p.y;
  body.vx = 0;
  body.vy = 0;
}

// ---------------------------------------------------------------------------
// Navigation
//
// The map is a handful of overlapping rectangles, so the cheapest correct
// pathfinder is a graph over those rectangles: nodes are rectangle centres,
// edges join rectangles that overlap. No grid, no A* heuristics, no tuning.
// ---------------------------------------------------------------------------

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function buildNav() {
  const nodes = WALKABLE.map((r) => ({
    rect: r,
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
  }));
  const edges = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (rectsOverlap(nodes[i].rect, nodes[j].rect)) {
        edges[i].push(j);
        edges[j].push(i);
      }
    }
  }
  return { nodes, edges };
}

const NAV = buildNav();

function nodeAt(x, y) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < NAV.nodes.length; i++) {
    const r = NAV.nodes[i].rect;
    if (rectContains(r, x, y)) {
      // Prefer the rectangle whose centre is nearest — inside a doorway both
      // the room and the corridor contain the point.
      const d = dist(x, y, NAV.nodes[i].x, NAV.nodes[i].y);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  if (best >= 0) return best;
  for (let i = 0; i < NAV.nodes.length; i++) {
    const d = dist(x, y, NAV.nodes[i].x, NAV.nodes[i].y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Waypoints from (ax,ay) to (bx,by), ending at the destination itself. */
export function findPath(ax, ay, bx, by) {
  const from = nodeAt(ax, ay);
  const to = nodeAt(bx, by);
  if (from < 0 || to < 0) return [{ x: bx, y: by }];
  if (from === to) return [{ x: bx, y: by }];

  const prev = new Array(NAV.nodes.length).fill(-1);
  const seen = new Array(NAV.nodes.length).fill(false);
  const queue = [from];
  seen[from] = true;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const next of NAV.edges[cur]) {
      if (seen[next]) continue;
      seen[next] = true;
      prev[next] = cur;
      queue.push(next);
    }
  }
  if (!seen[to]) return [{ x: bx, y: by }];

  const chain = [];
  for (let at = to; at !== -1 && at !== from; at = prev[at]) chain.unshift(at);
  const points = chain.map((i) => ({ x: NAV.nodes[i].x, y: NAV.nodes[i].y }));
  points.push({ x: bx, y: by });
  return points;
}
