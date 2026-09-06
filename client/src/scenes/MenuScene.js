import Phaser from 'phaser';
import { KitchenMap } from '../KitchenMap.js';
import Bread from '../entities/Bread.js';
import MoldyBread from '../entities/MoldyBread.js';
import { WORLD, SPAWN_POINTS } from '../../../shared/constants.js';
import { createBreadState, stepBread } from '../../../shared/physics.js';

/**
 * Attract mode behind the DOM menu: a few slices flopping around an empty
 * kitchen so the physics sells itself before anyone presses a key.
 */
export default class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    this.map = new KitchenMap(this);
    this.cameras.main.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    this.cameras.main.centerOn(WORLD.WIDTH / 2, WORLD.HEIGHT / 2);
    this.cameras.main.setZoom(Math.max(
      this.scale.width / WORLD.WIDTH, this.scale.height / WORLD.HEIGHT) * 0.95);

    this.demo = [];
    for (let i = 0; i < 5; i++) {
      const spawn = SPAWN_POINTS[i];
      const Cls = i === 2 ? MoldyBread : Bread;
      const bread = new Cls(this, spawn.x, spawn.y, {
        id: `demo${i}`, name: '', colorIndex: i, isLocal: false,
      });
      bread.label.setVisible(false);
      this.demo.push({
        bread,
        state: createBreadState(spawn.x, spawn.y, Math.random() * 360),
        input: { left: false, right: false, forward: true, back: false, hop: false },
        timer: 0,
        role: i === 2 ? 'moldy' : 'fresh',
      });
    }

    this.cameras.main.pan(WORLD.WIDTH / 2, WORLD.HEIGHT / 2, 1);
    this.tweens.add({
      targets: this.cameras.main, scrollX: '+=60', duration: 9000,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    for (const d of this.demo) {
      d.timer -= dt;
      if (d.timer <= 0) {
        d.timer = 0.5 + Math.random() * 1.5;
        d.input = {
          left: Math.random() < 0.4,
          right: Math.random() < 0.4,
          forward: Math.random() < 0.8,
          back: false,
          hop: Math.random() < 0.35,
        };
      }
      stepBread(d.state, d.input, dt, {});
      d.bread.sync({
        ...d.state, id: d.bread.playerId, alive: true, role: d.role,
        toastLevel: 0, framed: false, stunned: false, puff: 0,
      }, dt);
    }
  }
}
