// Fixed-timestep driver. Simulation runs at PHYS.TICK_HZ; snapshots go out at
// NET.BROADCAST_HZ so we are not shipping 30 full states a second.

import { PHYS, NET } from '../../shared/constants.js';

export class GameLoop {
  constructor({ onTick, onBroadcast }) {
    this.onTick = onTick;
    this.onBroadcast = onBroadcast;
    this.timer = null;
    this.last = 0;
    this.accumulator = 0;
    this.broadcastAcc = 0;
    this.step = 1 / PHYS.TICK_HZ;
    this.broadcastStep = 1 / NET.BROADCAST_HZ;
  }

  start() {
    if (this.timer) return;
    this.last = Date.now();
    this.timer = setInterval(() => this.frame(), 1000 / PHYS.TICK_HZ);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  frame() {
    const now = Date.now();
    let delta = (now - this.last) / 1000;
    this.last = now;
    // A stalled event loop should not fast-forward the whole game.
    if (delta > 0.25) delta = 0.25;

    this.accumulator += delta;
    while (this.accumulator >= this.step) {
      this.onTick(this.step);
      this.accumulator -= this.step;
    }

    this.broadcastAcc += delta;
    if (this.broadcastAcc >= this.broadcastStep) {
      this.broadcastAcc = 0;
      this.onBroadcast();
    }
  }
}
