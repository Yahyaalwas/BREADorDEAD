import GameScene from './GameScene.js';
import { LocalDriver } from '../net/LocalDriver.js';

/**
 * Solo mode: the same farm and the same rules, with AI sheep. One of them is
 * the wolf. Runs with no server at all.
 */
export default class SoloScene extends GameScene {
  constructor() { super('Solo'); }

  init(data = {}) {
    const driver = new LocalDriver({
      name: data.name || 'You',
      colorIndex: data.colorIndex ?? 0,
      hatIndex: data.hatIndex ?? 0,
      bots: data.bots ?? 6,
    });
    super.init({ driver });
  }

  create() {
    super.create();
    this.hud.log('Seven sheep. One is a wolf. Do your chores.');
  }
}
