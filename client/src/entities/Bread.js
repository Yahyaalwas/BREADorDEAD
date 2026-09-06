import Phaser from 'phaser';
import { WORLD, PHYS, BREAD_COLORS } from '../../../shared/constants.js';
import { isFlat } from '../../../shared/physics.js';

/**
 * The visual bread slice.
 *
 * Position comes from the simulation (server-authoritative in multiplayer,
 * local in solo). This class owns the *look* of a slice: the wobble, the squash
 * when it flops flat, the hop shadow, mold, browning and the name tag.
 */
export default class Bread extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, info = {}) {
    super(scene, x, y, 'slice');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setAllowGravity(false);
    this.body.setSize(WORLD.BREAD_W * 0.8, WORLD.BREAD_H * 0.8);
    this.body.setImmovable(true);

    this.playerId = info.id;
    this.playerName = info.name || 'Loaf';
    this.baseColor = BREAD_COLORS[(info.colorIndex ?? 0) % BREAD_COLORS.length];
    this.isLocal = !!info.isLocal;

    this.setOrigin(0.5, 0.5).setDepth(10).setTint(this.baseColor);

    this.shadow = scene.add.image(x, y, 'shadow').setDepth(5).setAlpha(0.35);
    this.moldOverlay = scene.add.image(x, y, 'mold')
      .setDepth(11).setVisible(false).setAlpha(0.95);

    this.label = scene.add.text(x, y, this.playerName, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '13px',
      color: info.isLocal ? '#ffd98a' : '#fff3d6',
      stroke: '#2a1d12', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(20);

    this.bar = scene.add.graphics().setDepth(21);
    this.progress = 0;
    this.alive = true;
    this.wobblePhase = Math.random() * Math.PI * 2;
    this.lastZ = 0;
  }

  /** Feed one snapshot of this slice. */
  sync(p, dt) {
    this.alive = p.alive;
    this.setVisible(p.alive);
    this.shadow.setVisible(p.alive);
    this.label.setVisible(p.alive);
    this.moldOverlay.setVisible(p.alive && (p.role === 'moldy' || p.framed));
    if (!p.alive) { this.bar.clear(); return; }

    const lift = p.z || 0;
    this.setPosition(p.x, p.y - lift);
    this.setRotation(Phaser.Math.DegToRad(p.angle + 90));

    // Lean squashes the slice: at 90 degrees it is lying flat on the counter.
    const leanRad = Phaser.Math.DegToRad(Math.abs(p.lean));
    const squash = Phaser.Math.Clamp(Math.cos(leanRad), 0.3, 1);
    const puff = 1 + (p.puff || 0) * 0.5;
    // A gentle idle breathe so a parked slice still looks like dough.
    this.wobblePhase += (dt || 0.016) * 4;
    const breathe = 1 + Math.sin(this.wobblePhase) * 0.02;

    this.setScale(
      puff * breathe * (1 + (1 - squash) * 0.35),
      puff * breathe * squash,
    );
    this.setAlpha(p.stunned ? 0.75 : 1);

    // Browning: white crumb -> tan -> brown -> char.
    this.setTint(this.toastTint(p.toastLevel || 0));

    this.moldOverlay.setPosition(this.x, this.y);
    this.moldOverlay.setRotation(this.rotation);
    this.moldOverlay.setScale(this.scaleX, this.scaleY);
    this.moldOverlay.setAlpha(p.role === 'moldy' ? 0.95 : 0.6);

    // Shadow stays on the counter and shrinks as the slice hops.
    const hop = Phaser.Math.Clamp(lift / 160, 0, 1);
    this.shadow.setPosition(p.x, p.y + 14);
    this.shadow.setScale(1 - hop * 0.45).setAlpha(0.35 - hop * 0.2);

    this.label.setPosition(p.x, p.y - lift - 40);
    this.label.setColor(p.framed ? '#8fd96a' : (this.isLocal ? '#ffd98a' : '#fff3d6'));

    this.drawBar(p);
    this.lastZ = lift;
  }

  toastTint(level) {
    const stops = [this.baseColor, 0xd9a35c, 0x8a5a2b, 0x2a1d12];
    const seg = Phaser.Math.Clamp(level, 0, 0.999) * (stops.length - 1);
    const i = Math.floor(seg);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(stops[i]),
      Phaser.Display.Color.ValueToColor(stops[Math.min(i + 1, stops.length - 1)]),
      100, Math.round((seg - i) * 100));
    return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
  }

  setProgress(v) { this.progress = v; }

  drawBar(p) {
    this.bar.clear();
    const v = Phaser.Math.Clamp(this.progress, 0, 1);
    if (v <= 0.001) return;
    const w = 54, h = 8;
    const x = p.x - w / 2, y = p.y - (p.z || 0) - 58;
    this.bar.fillStyle(0x000000, 0.6).fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 5);
    this.bar.fillStyle(v >= 1 ? 0x8fd96a : 0xffd98a, 1).fillRoundedRect(x, y, w * v, h, 4);
  }

  /** True while the slice is flopped over on its side. */
  get flat() { return isFlat({ lean: this.lean || 0 }); }

  destroy(fromScene) {
    this.shadow?.destroy();
    this.moldOverlay?.destroy();
    this.label?.destroy();
    this.bar?.destroy();
    super.destroy(fromScene);
  }
}
