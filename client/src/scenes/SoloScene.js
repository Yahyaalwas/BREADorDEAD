import GameScene from './GameScene.js';
import { LocalDriver } from '../net/LocalDriver.js';

/**
 * Solo mode. Same kitchen, same rules — the other slices are AI, and one of
 * them is quietly mouldering. Runs with no server at all.
 */
export default class SoloScene extends GameScene {
  constructor() { super('Solo'); }

  init(data = {}) {
    const driver = new LocalDriver({ name: data.name || 'You', bots: data.bots ?? 5 });
    super.init({ driver });
  }

  create() {
    super.create();
    this.hud.addLog('Five slices. One is mouldering. Watch them.');
  }
}
