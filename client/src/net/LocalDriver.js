import { GameSim } from '../../../shared/GameSim.js';
import AISheep from '../entities/AISheep.js';
import { SHEEP_NAMES, HATS, WOOL_COLORS } from '../../../shared/constants.js';

/**
 * Solo mode: the same simulation the server runs, in this tab, with AI brains
 * supplying every other sheep's input. No socket, no server.
 */
export class LocalDriver {
  constructor({ name = 'You', colorIndex = 0, hatIndex = 0, bots = 6 } = {}) {
    this.isLocal = true;
    this.myId = 'you';
    this.sim = new GameSim();
    this.sim.addPlayer({ id: this.myId, name: name.slice(0, 12) || 'You', colorIndex, hatIndex });

    const names = SHEEP_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < bots; i++) {
      this.sim.addPlayer({
        id: `bot${i}`,
        name: names[i % names.length],
        isBot: true,
        hatIndex: Math.floor(Math.random() * HATS.length),
      });
    }
    this.sim.start();
    this.brains = [];
    for (let i = 0; i < bots; i++) this.brains.push(new AISheep(this.sim, `bot${i}`));
  }

  snapshot() { return this.sim.snapshot(this.myId); }

  update(dt) {
    // Clamp so an alt-tabbed tab cannot fast-forward the farm.
    const step = Math.min(dt, 0.1);
    for (const b of this.brains) b.update(step);
    this.sim.update(step);
    // Bots read events before the scene drains them.
    for (const b of this.brains) b.observeEvents(this.sim.events);
  }

  sendInput(input) { this.sim.setInput(this.myId, input); }
  action(a) { this.sim.action(this.myId, a); }
  vote(targetId) { this.sim.vote(this.myId, targetId); }
  chat(text) { this.sim.addChat(this.myId, text); }
  drainEvents() { return this.sim.drainEvents(); }
  destroy() { this.brains = []; }
}
