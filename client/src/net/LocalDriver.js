import { GameSim } from '../../../shared/GameSim.js';
import AIBread from '../entities/AIBread.js';
import { BREAD_NAMES } from '../../../shared/constants.js';

/**
 * Solo mode: the same simulation the server runs, but in this tab, with AI
 * brains supplying inputs for everyone but you. No socket, no server.
 */
export class LocalDriver {
  constructor({ name = 'You', bots = 5 } = {}) {
    this.isLocal = true;
    this.myId = 'you';
    this.sim = new GameSim();
    this.sim.addPlayer({ id: this.myId, name: name.slice(0, 14) || 'You' });

    const names = BREAD_NAMES.slice().sort(() => Math.random() - 0.5);
    this.brains = [];
    for (let i = 0; i < bots; i++) {
      const id = `bot${i}`;
      this.sim.addPlayer({ id, name: names[i % names.length], isBot: true });
    }
    this.sim.start();
    for (let i = 0; i < bots; i++) this.brains.push(new AIBread(this.sim, `bot${i}`));
  }

  snapshot() { return this.sim.snapshot(this.myId); }

  update(dt) {
    // Clamp so an alt-tabbed tab does not fast-forward the round.
    const step = Math.min(dt, 0.1);
    for (const brain of this.brains) brain.update(step);
    this.sim.update(step);
  }

  sendInput(input) { this.sim.setInput(this.myId, input); }
  action(a) { this.sim.action(this.myId, a); }
  vote(targetId) { this.sim.vote(this.myId, targetId); }
  chat(text) { this.sim.addChat(this.myId, text); }
  drainEvents() { return this.sim.drainEvents(); }
  destroy() { this.brains = []; }
}
