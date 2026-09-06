import Phaser from 'phaser';
import { WORLD } from '../../../shared/constants.js';

// Every asset in the game is generated here with the Graphics API — no image
// files, no art pipeline.
export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    this.makeSlice();
    this.makeShadow();
    this.makeDot('crumb', 7, 0xf2cd7a, 0xb98f38);
    this.makeDot('moldcrumb', 9, 0x7fd45c, 0x3f7a29);
    this.makeDot('spark', 4, 0xffffff, 0xffffff);
    this.makeAnt();
    this.makeKnife();
    this.makeBody();
    this.scene.start('Menu');
  }

  // A slice: rounded top, squared bottom, tan crust around a pale crumb.
  makeSlice() {
    const w = WORLD.BREAD_W, h = WORLD.BREAD_H;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xc98f4a, 1);
    g.fillRoundedRect(0, 0, w, h, { tl: 22, tr: 22, bl: 8, br: 8 });
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(5, 5, w - 10, h - 10, { tl: 18, tr: 18, bl: 5, br: 5 });
    g.generateTexture('slice', w, h);
    g.destroy();

    // Mold splotches, drawn as their own overlay so any slice can wear them.
    const m = this.make.graphics({ x: 0, y: 0, add: false });
    m.fillStyle(0x4f9c33, 1);
    const blobs = [[14, 16, 7], [34, 12, 5], [40, 34, 8], [18, 42, 6], [27, 27, 4], [44, 20, 4]];
    for (const [x, y, r] of blobs) m.fillCircle(x, y, r);
    m.fillStyle(0x7fd45c, 1);
    for (const [x, y, r] of blobs) m.fillCircle(x - 1, y - 1, r * 0.5);
    m.generateTexture('mold', w, h);
    m.destroy();
  }

  makeShadow() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x000000, 0.32);
    g.fillEllipse(40, 16, 74, 26);
    g.generateTexture('shadow', 80, 32);
    g.destroy();
  }

  makeDot(key, r, fill, edge) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(edge, 1);
    g.fillCircle(r + 1, r + 1, r + 1);
    g.fillStyle(fill, 1);
    g.fillCircle(r + 1, r + 1, r);
    g.generateTexture(key, (r + 1) * 2, (r + 1) * 2);
    g.destroy();
  }

  makeAnt() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x2a1d12, 1);
    g.fillCircle(6, 9, 5);
    g.fillCircle(15, 9, 6);
    g.fillCircle(25, 9, 5);
    g.lineStyle(2, 0x2a1d12, 1);
    g.lineBetween(12, 9, 6, 1); g.lineBetween(15, 9, 15, 0); g.lineBetween(18, 9, 25, 1);
    g.lineBetween(12, 9, 6, 17); g.lineBetween(15, 9, 15, 18); g.lineBetween(18, 9, 25, 17);
    g.generateTexture('ant', 32, 20);
    g.destroy();
  }

  makeKnife() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x3a2a1c, 1);
    g.fillRoundedRect(0, 12, 34, 14, 6);          // handle
    g.fillStyle(0xd8dde3, 1);
    g.fillRoundedRect(32, 8, 78, 22, { tl: 3, tr: 12, bl: 3, br: 12 });
    g.fillStyle(0xf4f7fa, 1);
    g.fillRect(36, 12, 68, 6);                    // shine
    g.fillStyle(0xf7d98a, 0.85);
    g.fillCircle(88, 22, 5);                      // dab of butter
    g.generateTexture('knife', 112, 38);
    g.destroy();
  }

  makeBody() {
    const w = WORLD.BREAD_W, h = WORLD.BREAD_H;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x241a12, 1);
    g.fillRoundedRect(0, 0, w, h, { tl: 22, tr: 22, bl: 8, br: 8 });
    g.fillStyle(0x120c08, 1);
    g.fillRoundedRect(6, 6, w - 12, h - 12, { tl: 18, tr: 18, bl: 5, br: 5 });
    g.lineStyle(3, 0x6b4a2c, 1);
    g.lineBetween(12, 14, 24, 26); g.lineBetween(24, 14, 12, 26);
    g.lineBetween(30, 14, 42, 26); g.lineBetween(42, 14, 30, 26);
    g.generateTexture('burnt', w, h);
    g.destroy();
  }
}
