import Phaser from 'phaser';
import Bread from './Bread.js';
import { SABOTAGE_DEFS, SABOTAGE } from '../../../shared/constants.js';

/**
 * The impostor's slice. Same physics, extra menace: a faint spore aura and the
 * kill-hold ring that fills while it lurks next to fresh bread.
 */
export default class MoldyBread extends Bread {
  constructor(scene, x, y, info) {
    super(scene, x, y, info);
    this.aura = scene.add.circle(x, y, 46, 0x6fbf4a, 0.14).setDepth(9);
    this.killRing = scene.add.graphics().setDepth(22);
    this.auraPhase = 0;
  }

  sync(p, dt) {
    super.sync(p, dt);
    this.aura.setVisible(p.alive);
    if (!p.alive) { this.killRing.clear(); return; }
    this.auraPhase += (dt || 0.016) * 2.4;
    const pulse = 1 + Math.sin(this.auraPhase) * 0.12;
    this.aura.setPosition(p.x, p.y - (p.z || 0)).setScale(pulse);
  }

  /** Draw the 2-second kill hold as a ring closing around the slice. */
  drawKillHold(x, y, held) {
    this.killRing.clear();
    if (held <= 0) return;
    const def = SABOTAGE_DEFS[SABOTAGE.KILL];
    const frac = Phaser.Math.Clamp(held / def.hold, 0, 1);
    this.killRing.lineStyle(5, 0xff4d3d, 0.9);
    this.killRing.beginPath();
    this.killRing.arc(x, y, 40, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    this.killRing.strokePath();
  }

  destroy(fromScene) {
    this.aura?.destroy();
    this.killRing?.destroy();
    super.destroy(fromScene);
  }
}
