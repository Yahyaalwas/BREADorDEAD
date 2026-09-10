import Phaser from 'phaser';
import { WORLD, ROOMS, CORRIDORS, CHORES, HAY, BELL } from '../../shared/constants.js';

/** Draws the farm: rooms, the corridors between them, and the fixed props. */
export class FarmMap {
  constructor(scene) {
    this.scene = scene;
    this.stations = new Map();
    this.build();
  }

  build() {
    const s = this.scene;
    const g = s.add.graphics().setDepth(-100);

    // Everything off the walkable map is night-time grass.
    g.fillStyle(0x1d2a1c, 1);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    // Corridors first so rooms paint over their overlapping ends.
    for (const c of CORRIDORS) {
      g.fillStyle(0x54463a, 1);
      g.fillRoundedRect(c.x, c.y, c.w, c.h, 10);
      g.fillStyle(0x5f5043, 1);
      g.fillRoundedRect(c.x + 5, c.y + 5, c.w - 10, c.h - 10, 8);
    }

    for (const key of Object.keys(ROOMS)) {
      const r = ROOMS[key];
      g.fillStyle(0x2b2b33, 1);
      g.fillRoundedRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12, 22);
      g.fillStyle(r.color, 1);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 18);
      // A lighter inset so rooms read as floors rather than flat blocks.
      g.fillStyle(0xffffff, 0.07);
      g.fillRoundedRect(r.x + 10, r.y + 10, r.w - 20, r.h - 20, 14);
    }

    this.labels = [];
    for (const key of Object.keys(ROOMS)) {
      const r = ROOMS[key];
      this.labels.push(s.add.text(r.x + r.w / 2, r.y + 16, r.name.toUpperCase(), {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '20px',
        color: '#ffffff', stroke: '#1a1a22', strokeThickness: 5,
      }).setOrigin(0.5, 0).setDepth(-80).setAlpha(0.5));
    }

    for (const h of HAY) {
      s.add.image(h.x, h.y, 'hay').setDepth(-50).setScale(1.1);
    }

    s.add.image(BELL.x, BELL.y, 'bell').setDepth(-50);
    s.add.text(BELL.x, BELL.y + 42, 'EMERGENCY BELL', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '13px',
      color: '#ffe066', stroke: '#1a1a22', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(-50);

    for (const c of CHORES) {
      const pad = s.add.image(c.x, c.y, 'station').setDepth(-60).setVisible(false);
      const label = s.add.text(c.x, c.y - 52, `${c.emoji} ${c.name}`, {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '14px',
        color: '#fff6d6', stroke: '#1a1a22', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(-40).setVisible(false);
      this.stations.set(c.id, { pad, label, def: c });
    }
  }

  /** Highlight only the chores this player still owes. */
  setActiveChores(ids, pulse) {
    for (const [id, st] of this.stations) {
      const on = ids.has(id);
      st.pad.setVisible(on);
      st.label.setVisible(on);
      if (on) st.pad.setAlpha(0.55 + Math.sin(pulse) * 0.3);
    }
  }

  setLabelsVisible(visible) {
    for (const l of this.labels) l.setVisible(visible);
  }
}
