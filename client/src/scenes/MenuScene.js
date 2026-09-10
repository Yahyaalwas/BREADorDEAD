import Phaser from 'phaser';
import { FarmMap } from '../FarmMap.js';
import Sheep from '../entities/Sheep.js';
import { WORLD, CHORES, WOOL_COLORS, HATS } from '../../../shared/constants.js';
import { createBody, stepBody, findPath } from '../../../shared/movement.js';

/** Attract mode behind the menu: sheep wandering the farm, minding nothing. */
export default class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    this.map = new FarmMap(this);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    cam.setZoom(Math.max(this.scale.width / WORLD.WIDTH, this.scale.height / WORLD.HEIGHT) * 1.15);
    cam.centerOn(WORLD.WIDTH / 2, WORLD.HEIGHT / 2);
    this.tweens.add({
      targets: cam, scrollX: '+=120', scrollY: '+=60',
      duration: 12000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.demo = [];
    for (let i = 0; i < 6; i++) {
      const spot = CHORES[i % CHORES.length];
      const body = createBody(spot.x, spot.y);
      const sheep = new Sheep(this, body.x, body.y, {
        id: `demo${i}`, name: '', colorIndex: i % WOOL_COLORS.length,
        hatIndex: (i + 1) % HATS.length,
      });
      sheep.label.setVisible(false);
      this.demo.push({ sheep, body, path: [], wait: Math.random() * 2 });
    }
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    for (const d of this.demo) {
      d.wait -= dt;
      if (!d.path.length && d.wait <= 0) {
        const to = CHORES[Math.floor(Math.random() * CHORES.length)];
        d.path = findPath(d.body.x, d.body.y, to.x, to.y);
        d.wait = 1 + Math.random() * 3;
      }
      let input = { dx: 0, dy: 0 };
      if (d.path.length) {
        const wp = d.path[0];
        const dx = wp.x - d.body.x, dy = wp.y - d.body.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 40) d.path.shift();
        else input = { dx: dx / dist, dy: dy / dist };
      }
      stepBody(d.body, input, dt, {});
      d.sheep.sync({ ...d.body, alive: true, role: null, busy: false,
        colorIndex: d.sheep.colorIndex, hatIndex: d.sheep.hatIndex }, dt);
      d.sheep.label.setVisible(false);
    }
  }
}
