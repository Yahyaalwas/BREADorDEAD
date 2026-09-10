import Phaser from 'phaser';
import { WOOL_COLORS, HATS, ROLE } from '../../../shared/constants.js';

/**
 * One sheep on screen. Position comes from the simulation; this class owns the
 * look — the wool tint, the hat, the walk bob, and the wolf reveal at the end.
 */
export default class Sheep extends Phaser.GameObjects.Container {
  constructor(scene, x, y, info = {}) {
    super(scene, x, y);
    scene.add.existing(this);

    this.playerId = info.id;
    this.playerName = info.name || 'Sheep';
    this.isLocal = !!info.isLocal;

    this.legs = [
      scene.add.image(-14, 26, 'leg'),
      scene.add.image(12, 26, 'leg'),
    ];
    this.wool = scene.add.image(0, 0, 'wool');
    this.face = scene.add.image(-26, 6, 'face');
    this.hat = scene.add.image(-24, -18, 'hat-none');
    this.add([...this.legs, this.wool, this.face, this.hat]);
    this.setDepth(20);

    this.label = scene.add.text(x, y - 54, this.playerName, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '15px',
      color: info.isLocal ? '#ffe066' : '#ffffff',
      stroke: '#141018', strokeThickness: 5,
    }).setOrigin(0.5, 1).setDepth(30);

    this.busyRing = scene.add.graphics().setDepth(29);
    this.applyLook(info.colorIndex ?? 0, info.hatIndex ?? 0);
  }

  applyLook(colorIndex, hatIndex) {
    const wool = WOOL_COLORS[colorIndex % WOOL_COLORS.length];
    this.wool.setTint(wool.hex);
    const hat = HATS[hatIndex % HATS.length];
    this.hat.setTexture(`hat-${hat.id}`);
    this.hat.setVisible(hat.id !== 'none');
    this.colorIndex = colorIndex;
    this.hatIndex = hatIndex;
  }

  sync(p, dt) {
    if (p.colorIndex !== this.colorIndex || p.hatIndex !== this.hatIndex) {
      this.applyLook(p.colorIndex, p.hatIndex);
    }
    this.setVisible(p.alive);
    this.label.setVisible(p.alive);
    if (!p.alive) { this.busyRing.clear(); return; }

    this.setPosition(p.x, p.y);

    // Face the way you walk; the whole sheep flips, hat and all.
    const dir = p.facing >= 0 ? 1 : -1;
    this.wool.setScale(dir, 1);
    this.face.setX(-26 * dir);
    this.face.setScale(dir, 1);
    this.hat.setX(-24 * dir);
    this.hat.setScale(dir, 1);

    // Walk bob: the body lifts and the legs swing.
    const bob = p.moving ? Math.sin(p.bob) : 0;
    this.wool.setY(bob * 3);
    this.face.setY(6 + bob * 3);
    this.hat.setY(-18 + bob * 3);
    this.legs[0].setY(26 + (p.moving ? Math.sin(p.bob) * 4 : 0));
    this.legs[1].setY(26 + (p.moving ? Math.sin(p.bob + Math.PI) * 4 : 0));

    // The reveal: at game over the wolf finally shows its teeth.
    const wolf = p.role === ROLE.WOLF;
    this.face.setTexture(wolf ? 'face-wolf' : 'face');

    this.label.setPosition(p.x, p.y - 54);
    this.drawBusy(p);
  }

  /** A ring over anyone mid-chore — an alibi you can watch being earned. */
  drawBusy(p) {
    this.busyRing.clear();
    if (!p.busy) return;
    this.busyRing.lineStyle(4, 0xffe066, 0.9);
    this.busyRing.strokeCircle(p.x, p.y - 46, 12);
    this.busyRing.fillStyle(0xffe066, 0.9);
    this.busyRing.fillCircle(p.x, p.y - 46, 4);
  }

  setNameVisible(v) { this.label.setVisible(v); }

  destroy(fromScene) {
    this.label?.destroy();
    this.busyRing?.destroy();
    super.destroy(fromScene);
  }
}
