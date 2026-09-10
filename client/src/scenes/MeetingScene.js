import Phaser from 'phaser';
import { MeetingManager } from '../mechanics/MeetingManager.js';

/**
 * Runs alongside GameScene while everyone argues. It owns the DOM meeting
 * overlay and darkens the farm behind it; the simulation keeps ticking, so the
 * meeting timer is real.
 */
export default class MeetingScene extends Phaser.Scene {
  constructor() { super('Meeting'); }

  init(data) {
    this.driver = data.driver;
    this.shown = false;
  }

  create() {
    this.ui = new MeetingManager({
      onVote: (t) => this.driver.vote(t),
      onChat: (t) => this.driver.chat(t),
    });
    this.events.once('shutdown', () => this.ui.destroy());
  }

  setSnapshot(snap) {
    if (!this.ui) return;
    if (!this.shown) { this.ui.show(snap); this.shown = true; }
    this.ui.update(snap);
  }
}
