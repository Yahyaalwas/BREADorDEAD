import Phaser from 'phaser';
import { MeetingManager } from '../mechanics/MeetingManager.js';

/**
 * Runs alongside GameScene while everyone is arguing. It owns the DOM meeting
 * overlay and darkens the kitchen behind it; the simulation keeps ticking, so
 * the meeting timer is real.
 */
export default class MeetingScene extends Phaser.Scene {
  constructor() { super('Meeting'); }

  init(data) {
    this.driver = data.driver;
    this.shown = false;
  }

  create() {
    this.vignette = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a0704, 0.45)
      .setOrigin(0).setScrollFactor(0).setDepth(1000);
    this.scale.on('resize', this.resize, this);

    this.ui = new MeetingManager({
      onVote: (t) => this.driver.vote(t),
      onChat: (t) => this.driver.chat(t),
    });

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.resize, this);
      this.ui.destroy();
    });
  }

  resize() {
    this.vignette?.setSize(this.scale.width, this.scale.height);
  }

  /** GameScene pushes each snapshot through here. */
  setSnapshot(snap) {
    if (!this.ui) return;
    if (!this.shown) { this.ui.show(snap); this.shown = true; }
    this.ui.update(snap);
  }
}
