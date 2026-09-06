import Phaser from 'phaser';
import { ZONES, TASK, TASK_DEFS, TIMING } from '../../../shared/constants.js';
import { Sfx } from '../audio/Sfx.js';

/**
 * Client-side presentation of tasks: which zone to glow, the progress bar over
 * your own slice, and the little payoffs (ding, pop, puff of flour).
 */
export class TaskManager {
  constructor(scene) {
    this.scene = scene;
    this.highlights = {};
    for (const key of Object.keys(ZONES)) {
      const z = ZONES[key];
      this.highlights[key] = scene.add
        .rectangle(z.x + z.w / 2, z.y + z.h / 2, z.w + 10, z.h + 10)
        .setStrokeStyle(5, 0xffd98a, 0.9)
        .setDepth(-70)
        .setVisible(false);
    }
    this.pulse = 0;
  }

  /** Zone a task wants you to be standing in, if any. */
  static zoneFor(taskId) {
    return TASK_DEFS[taskId]?.zone || null;
  }

  update(snap, dt) {
    this.pulse += dt * 3;
    const you = snap.you;
    const wanted = new Set();
    if (you && you.alive) {
      for (const t of you.tasks) {
        if (t.done) continue;
        const zone = TaskManager.zoneFor(t.id);
        if (zone) wanted.add(zone);
        // Carrying a crumb means the ant trail is the next stop.
        if (t.id === TASK.CRUMB_DELIVERY && you.carrying) wanted.add('ANT_TRAIL');
      }
    }
    const alpha = 0.45 + Math.sin(this.pulse) * 0.25;
    for (const key of Object.keys(this.highlights)) {
      const h = this.highlights[key];
      h.setVisible(wanted.has(key));
      if (h.visible) h.setStrokeStyle(5, 0xffd98a, alpha);
    }
  }

  /** Progress to display over a given player's slice. */
  progressFor(snap, playerId) {
    const you = snap.you;
    if (!you || you.id !== playerId) return 0;
    const active = you.tasks.filter((t) => !t.done && t.progress > 0.01);
    if (!active.length) return 0;
    return Math.max(...active.map((t) => t.progress));
  }

  handleEvent(ev, scene) {
    switch (ev.type) {
      case 'task:complete':
        if (ev.playerId === scene.myId) {
          Sfx.toastDing();
          scene.hud.addLog(`Task done: ${TASK_DEFS[ev.taskId]?.name || ev.taskId}`);
        }
        break;
      case 'toast:perfect':
        this.burstAt(scene, ev.playerId, 0xffd98a, 26);
        break;
      case 'toast:failed':
        if (ev.playerId === scene.myId) {
          Sfx.toastFail();
          const over = ev.seconds > TIMING.TOAST_PERFECT;
          scene.hud.addLog(over ? 'Too long in the toaster.' : 'Barely warm. Try again.');
        }
        break;
      case 'coo:pop':
        Sfx.pop();
        this.burstAt(scene, ev.playerId, 0xfff3d6, 34);
        break;
      case 'crumb:pickup':
        if (ev.playerId === scene.myId) Sfx.crumb();
        break;
      case 'crumb:delivered':
        Sfx.ant();
        this.burstAt(scene, ev.playerId, 0xf2cd7a, 20);
        break;
      case 'ant:ride':
        if (ev.playerId === scene.myId) Sfx.ant();
        break;
      case 'knife:hit':
        Sfx.knife();
        if (ev.playerId === scene.myId) {
          scene.cameras.main.shake(220, 0.012);
          scene.hud.addLog('SPREAD. Ten seconds flat on your back.');
        }
        break;
      default: break;
    }
  }

  burstAt(scene, playerId, color, count) {
    const bread = scene.breads.get(playerId);
    if (!bread) return;
    const p = scene.add.particles(bread.x, bread.y, 'spark', {
      speed: { min: 60, max: 220 },
      lifespan: 500,
      quantity: count,
      scale: { start: 1.2, end: 0 },
      tint: color,
      emitting: false,
    }).setDepth(30);
    p.explode(count);
    scene.time.delayedCall(700, () => p.destroy());
  }
}
