import Phaser from 'phaser';
import { HATS } from '../../../shared/constants.js';

// Every sprite is generated here with the Graphics API — no image files, no art
// pipeline. Wool is drawn white so it can be tinted per player.
export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    this.makeWool();
    this.makeFace();
    this.makeWolfFace();
    this.makeHats();
    this.makeProps();
    this.makeVision();
    this.scene.start('Menu');
  }

  /** A fluffy blob: overlapping circles, white so tinting works. */
  makeWool() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const puffs = [
      [26, 30, 20], [46, 26, 16], [62, 34, 15], [56, 50, 16],
      [34, 52, 17], [18, 44, 14], [44, 40, 22],
    ];
    g.fillStyle(0xd9d2c5, 1);
    for (const [x, y, r] of puffs) g.fillCircle(x, y + 2, r + 2);
    g.fillStyle(0xffffff, 1);
    for (const [x, y, r] of puffs) g.fillCircle(x, y, r);
    g.generateTexture('wool', 84, 76);
    g.destroy();

    const l = this.make.graphics({ x: 0, y: 0, add: false });
    l.fillStyle(0x3c3229, 1);
    l.fillRoundedRect(0, 0, 7, 16, 3);
    l.generateTexture('leg', 7, 16);
    l.destroy();
  }

  makeFace() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x4a3f36, 1);
    g.fillEllipse(22, 22, 40, 38);
    g.fillStyle(0x5d5047, 1);
    g.fillEllipse(22, 28, 30, 24);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(14, 18, 7); g.fillCircle(30, 18, 7);
    g.fillStyle(0x141414, 1);
    g.fillCircle(15, 19, 3.4); g.fillCircle(31, 19, 3.4);
    g.fillStyle(0x2a2118, 1);
    g.fillCircle(18, 31, 2); g.fillCircle(26, 31, 2);
    g.generateTexture('face', 44, 44);
    g.destroy();
  }

  /** Same silhouette, but the teeth give it away once the game is over. */
  makeWolfFace() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x3b3238, 1);
    g.fillTriangle(4, 10, 12, -6, 20, 8);
    g.fillTriangle(24, 8, 32, -6, 40, 10);
    g.fillEllipse(22, 22, 40, 38);
    g.fillStyle(0x4a3f47, 1);
    g.fillEllipse(22, 29, 32, 24);
    g.fillStyle(0xffe9a3, 1);
    g.fillCircle(14, 18, 7); g.fillCircle(30, 18, 7);
    g.fillStyle(0x141414, 1);
    g.fillCircle(15, 19, 3.6); g.fillCircle(31, 19, 3.6);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(15, 34, 19, 34, 17, 41);
    g.fillTriangle(25, 34, 29, 34, 27, 41);
    g.generateTexture('face-wolf', 44, 44);
    g.destroy();
  }

  makeHats() {
    const draw = {
      none: () => {},
      cap: (g) => {
        g.fillStyle(0xe0483c, 1);
        g.fillEllipse(24, 20, 40, 22);
        g.fillRect(24, 16, 26, 8);
      },
      crown: (g) => {
        g.fillStyle(0xffd24a, 1);
        g.fillTriangle(6, 22, 14, 4, 22, 22);
        g.fillTriangle(18, 22, 26, 2, 34, 22);
        g.fillTriangle(30, 22, 38, 4, 46, 22);
        g.fillRect(6, 20, 40, 8);
      },
      party: (g) => {
        g.fillStyle(0x4ac0e0, 1);
        g.fillTriangle(10, 26, 26, 0, 42, 26);
        g.fillStyle(0xff5aa8, 1);
        g.fillCircle(26, 2, 5);
      },
      cowboy: (g) => {
        g.fillStyle(0x8a5a2b, 1);
        g.fillEllipse(26, 22, 52, 16);
        g.fillEllipse(26, 12, 28, 22);
      },
      bucket: (g) => {
        g.fillStyle(0x9aa4b2, 1);
        g.fillRect(10, 4, 32, 22);
        g.fillEllipse(26, 26, 40, 10);
      },
      halo: (g) => {
        g.lineStyle(5, 0xffe57a, 1);
        g.strokeEllipse(26, 14, 34, 14);
      },
      horns: (g) => {
        g.fillStyle(0xd94f3d, 1);
        g.fillTriangle(8, 26, 12, 2, 22, 24);
        g.fillTriangle(44, 26, 40, 2, 30, 24);
      },
    };
    for (const hat of HATS) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      (draw[hat.id] || draw.none)(g);
      g.generateTexture(`hat-${hat.id}`, 52, 30);
      g.destroy();
    }
  }

  makeProps() {
    let g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xc9a227, 1);
    g.fillRoundedRect(0, 6, 72, 52, 12);
    g.lineStyle(3, 0x8f6f14, 1);
    for (let i = 10; i < 70; i += 12) g.lineBetween(i, 8, i, 56);
    g.strokeRoundedRect(0, 6, 72, 52, 12);
    g.generateTexture('hay', 72, 64);
    g.destroy();

    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x6b6f78, 1);
    g.fillRect(26, 46, 12, 18);
    g.fillStyle(0xffd24a, 1);
    g.fillEllipse(32, 30, 48, 44);
    g.fillRect(8, 30, 48, 18);
    g.fillStyle(0xb8860b, 1);
    g.fillEllipse(32, 50, 52, 12);
    g.fillCircle(32, 58, 6);
    g.generateTexture('bell', 64, 68);
    g.destroy();

    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffe066, 0.25);
    g.fillCircle(46, 46, 44);
    g.lineStyle(5, 0xffe066, 0.95);
    g.strokeCircle(46, 46, 40);
    g.generateTexture('station', 92, 92);
    g.destroy();

    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xe8e2d6, 1);
    g.fillEllipse(34, 30, 54, 32);
    g.fillStyle(0xb9b1a2, 1);
    g.fillEllipse(34, 30, 34, 16);
    g.fillStyle(0x4a3f36, 1);
    g.fillCircle(14, 24, 9);
    g.fillStyle(0xd94f3d, 1);
    g.fillCircle(48, 22, 4); g.fillCircle(56, 30, 3); g.fillCircle(44, 38, 3);
    g.generateTexture('remains', 68, 60);
    g.destroy();

    g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('spark', 8, 8);
    g.destroy();
  }

  /** Radial gradient used as an inverted mask for the vision circle. */
  makeVision() {
    const size = 512;
    const tex = this.textures.createCanvas('vision', size, size);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.92)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }
}
