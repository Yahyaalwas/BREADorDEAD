import Phaser from 'phaser';
import { WORLD, ZONES, OBSTACLES, ANT_PATH } from '../../shared/constants.js';

// Draws the counter and its zones, and exposes Arcade zone bodies so scenes can
// listen for bread entering and leaving.
export class KitchenMap {
  constructor(scene) {
    this.scene = scene;
    this.zoneBodies = {};
    this.build();
  }

  build() {
    const s = this.scene;
    const g = s.add.graphics().setDepth(-100);

    // Counter top with a wood grain.
    g.fillStyle(0x6f4b2a, 1);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    g.fillStyle(0x7c552f, 1);
    for (let y = 0; y < WORLD.HEIGHT; y += 46) {
      g.fillRect(0, y, WORLD.WIDTH, 22);
    }
    g.lineStyle(2, 0x5b3c21, 0.5);
    for (let y = 0; y < WORLD.HEIGHT; y += 46) g.lineBetween(0, y, WORLD.WIDTH, y);

    this.drawZone(g, ZONES.BREADBOX, 0x8a5c2c, 0.85, () => {
      g.fillStyle(0x6d4520, 1);
      g.fillRect(ZONES.BREADBOX.x + 20, ZONES.BREADBOX.y + 20, ZONES.BREADBOX.w - 40, 26);
    });

    // Toaster: metal body, glowing slots.
    this.drawZone(g, ZONES.TOASTER, 0x8a8f98, 1, () => {
      const z = ZONES.TOASTER;
      g.fillStyle(0x2a2f36, 1);
      g.fillRoundedRect(z.x + 18, z.y + 26, z.w - 36, z.h - 52, 10);
      g.fillStyle(0xff5a2b, 0.85);
      g.fillRoundedRect(z.x + 30, z.y + 38, z.w - 60, z.h - 76, 8);
      g.fillStyle(0xffd070, 0.55);
      for (let i = 0; i < 4; i++) {
        g.fillRect(z.x + 36, z.y + 46 + i * 22, z.w - 72, 6);
      }
    });

    this.drawZone(g, ZONES.BUTTER, 0xf5d76e, 1, () => {
      const z = ZONES.BUTTER;
      g.fillStyle(0xfff3c0, 1);
      g.fillRoundedRect(z.x + 26, z.y + 30, z.w - 52, z.h - 60, 8);
    });

    this.drawZone(g, ZONES.SINK, 0x2f6f9a, 1, () => {
      const z = ZONES.SINK;
      g.fillStyle(0x4aa3df, 0.9);
      g.fillRoundedRect(z.x + 16, z.y + 16, z.w - 32, z.h - 32, 14);
      g.fillStyle(0x9fd8ff, 0.5);
      for (let i = 0; i < 5; i++) {
        g.fillEllipse(z.x + 60 + i * 52, z.y + 60 + (i % 2) * 70, 44, 14);
      }
    });

    this.drawZone(g, ZONES.BOARD, 0xc99a5b, 1, () => {
      const z = ZONES.BOARD;
      g.lineStyle(2, 0xa87c42, 0.9);
      for (let x = z.x + 14; x < z.x + z.w - 10; x += 26) g.lineBetween(x, z.y + 8, x, z.y + z.h - 8);
    });

    // Ant trail: a worn groove across the counter.
    const at = ZONES.ANT_TRAIL;
    g.fillStyle(0x4a3826, 0.65);
    g.fillRoundedRect(at.x, at.y, at.w, at.h, 26);
    g.lineStyle(3, 0x2a1d12, 0.5);
    for (let i = 0; i < ANT_PATH.length; i++) {
      const a = ANT_PATH[i], b = ANT_PATH[(i + 1) % ANT_PATH.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // Props.
    for (const o of OBSTACLES) {
      g.fillStyle(0x3f3f46, 1);
      g.fillRoundedRect(o.x, o.y, o.w, o.h, 14);
      g.fillStyle(0x5b5b66, 1);
      g.fillRoundedRect(o.x + 8, o.y + 8, o.w - 16, o.h - 16, 10);
    }

    this.labels = [];
    for (const key of Object.keys(ZONES)) {
      const z = ZONES[key];
      const label = this.scene.add.text(z.x + z.w / 2, z.y - 14, z.label, {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '15px',
        color: '#ffe6b8', stroke: '#2a1d12', strokeThickness: 4,
      }).setOrigin(0.5, 1).setDepth(-90).setAlpha(0.75);
      this.labels.push(label);
      this.zoneBodies[key] = this.makeZoneBody(z);
    }

    // Counter edge, so the play area reads as a surface with a drop-off.
    g.lineStyle(10, 0x4a3018, 1);
    g.strokeRect(5, 5, WORLD.WIDTH - 10, WORLD.HEIGHT - 10);
  }

  drawZone(g, z, color, alpha, extra) {
    g.fillStyle(color, alpha);
    g.fillRoundedRect(z.x, z.y, z.w, z.h, 16);
    if (extra) extra();
    g.lineStyle(4, 0x2a1d12, 0.4);
    g.strokeRoundedRect(z.x, z.y, z.w, z.h, 16);
  }

  makeZoneBody(z) {
    const zone = this.scene.add.zone(z.x + z.w / 2, z.y + z.h / 2, z.w, z.h);
    this.scene.physics.add.existing(zone, true);
    zone.zoneId = z.id;
    return zone;
  }

  /** Overlay used while the toaster is cranked. */
  makeToasterAlarm() {
    const z = ZONES.TOASTER;
    const rect = this.scene.add.rectangle(
      z.x + z.w / 2, z.y + z.h / 2, z.w, z.h, 0xff3b1f, 0.45)
      .setDepth(-80).setVisible(false);
    return rect;
  }
}
