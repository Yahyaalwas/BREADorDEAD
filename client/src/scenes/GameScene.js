import Phaser from 'phaser';
import { KitchenMap } from '../KitchenMap.js';
import Bread from '../entities/Bread.js';
import MoldyBread from '../entities/MoldyBread.js';
import { TaskManager } from '../mechanics/TaskManager.js';
import { SabotageManager } from '../mechanics/SabotageManager.js';
import { HUD } from '../ui/HUD.js';
import { Sfx } from '../audio/Sfx.js';
import {
  WORLD, ZONES, ANT_PATH, ANT_SPEED, GAME_STATE, ROLE, BREAD_COLORS,
} from '../../../shared/constants.js';
import { createBreadState, stepBread, antPosition } from '../../../shared/physics.js';

/**
 * The kitchen. Renders whatever the active driver reports and forwards input.
 * Multiplayer and solo share this scene; only the driver differs.
 */
export default class GameScene extends Phaser.Scene {
  constructor(key = 'Game') { super(key); }

  init(data) {
    this.driver = data.driver;
    this.myId = this.driver.myId;
    this.breads = new Map();
    this.crumbSprites = new Map();
    this.bodySprites = new Map();
    this.sporeCircles = [];
    this.prediction = null;
    this.lastSnapState = null;
    this.ejecting = false;
    this.meetingScene = null;
    this.lastFrameAt = null;
  }

  create() {
    this.map = new KitchenMap(this);
    this.moldGfx = this.add.graphics().setDepth(-60);
    this.sporeGfx = this.add.graphics().setDepth(8);
    this.trailGfx = this.add.graphics().setDepth(-55);
    this.toasterAlarm = this.map.makeToasterAlarm();

    this.ants = [];
    for (let i = 0; i < 4; i++) {
      this.ants.push(this.add.image(0, 0, 'ant').setDepth(4).setScale(1.1));
    }
    this.knife = this.add.image(0, 0, 'knife').setDepth(25).setOrigin(0.1, 0.5);

    this.cameras.main.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    this.cameras.main.setBackgroundColor('#120d09');
    this.cameras.main.setZoom(this.fitZoom());
    this.scale.on('resize', () => this.cameras.main.setZoom(this.fitZoom()));

    this.hud = new HUD();
    this.hud.show();
    this.hud.onScream(() => this.doAction({ type: 'scream' }));
    this.hud.onReport(() => this.doAction({ type: 'report' }));

    this.tasks = new TaskManager(this);
    this.sabotage = new SabotageManager(this, (ability) =>
      this.doAction({ type: 'sabotage', ability }));

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      arrowUp: Phaser.Input.Keyboard.KeyCodes.UP,
      arrowDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
      arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
      arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      hop: Phaser.Input.Keyboard.KeyCodes.SPACE,
      grab: Phaser.Input.Keyboard.KeyCodes.E,
      coo: Phaser.Input.Keyboard.KeyCodes.C,
      scream: Phaser.Input.Keyboard.KeyCodes.Q,
    });
    // The chat box owns the keyboard while a meeting is open.
    this.input.keyboard.on('keydown-E', () => this.doAction({ type: 'pickup' }));
    this.input.keyboard.on('keydown-Q', () => this.doAction({ type: 'scream' }));

    // Handy for debugging from the console (and for the smoke tests).
    window.__bod = { scene: this, driver: this.driver };
    this.events.once('shutdown', () => { delete window.__bod; this.teardown(); });
  }

  fitZoom() {
    const zx = this.scale.width / WORLD.WIDTH;
    const zy = this.scale.height / WORLD.HEIGHT;
    // Zoom in a little on small screens so a slice is still readable.
    return Phaser.Math.Clamp(Math.max(zx, zy) * 1.35, 0.6, 1.8);
  }

  typingInChat() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  doAction(a) {
    if (this.typingInChat() && a.type !== 'sabotage') return;
    const snap = this.driver.snapshot();
    if (!snap || snap.state !== GAME_STATE.PLAYING) return;
    if (a.type === 'scream') Sfx.scream();
    this.driver.action(a);
  }

  readInput() {
    const k = this.keys;
    if (this.typingInChat()) {
      return { left: false, right: false, forward: false, back: false, hop: false, interact: false };
    }
    return {
      left: k.left.isDown || k.arrowLeft.isDown,
      right: k.right.isDown || k.arrowRight.isDown,
      forward: k.up.isDown || k.arrowUp.isDown,
      back: k.down.isDown || k.arrowDown.isDown,
      hop: k.hop.isDown,
      interact: k.coo.isDown,
    };
  }

  update(time, delta) {
    // Phaser smooths its delta and pins it to the target frame time whenever the
    // window loses focus, which would stall the round timer and the whole solo
    // simulation. Timing the game off the wall clock keeps it honest.
    const now = performance.now();
    const dt = Math.min((now - (this.lastFrameAt ?? now - 16)) / 1000, 0.1);
    this.lastFrameAt = now;
    this.driver.update(dt);

    const snap = this.driver.snapshot();
    if (!snap) return;

    const playing = snap.state === GAME_STATE.PLAYING;
    const input = playing ? this.readInput() : {
      left: false, right: false, forward: false, back: false, hop: false, interact: false,
    };
    this.driver.sendInput(input);

    this.syncPlayers(snap, dt, input);
    this.syncWorld(snap, dt);

    this.hud.update(snap);
    this.tasks.update(snap, dt);
    this.sabotage.update(snap);

    this.syncMeetingScene(snap);

    for (const ev of this.driver.drainEvents()) this.handleEvent(ev, snap);
    this.lastSnapState = snap.state;
  }

  /** The meeting overlay lives in its own scene, running alongside this one. */
  syncMeetingScene(snap) {
    const inMeeting = snap.state === GAME_STATE.MEETING;
    if (inMeeting && !this.meetingScene) {
      this.scene.launch('Meeting', { driver: this.driver });
      this.meetingScene = this.scene.get('Meeting');
    }
    if (inMeeting) {
      this.meetingScene?.setSnapshot?.(snap);
    } else if (this.meetingScene) {
      this.scene.stop('Meeting');
      this.meetingScene = null;
    }
  }

  // -- players -------------------------------------------------------------

  syncPlayers(snap, dt, input) {
    const seen = new Set();
    for (const p of snap.players) {
      seen.add(p.id);
      let bread = this.breads.get(p.id);
      const wantMoldy = p.role === ROLE.MOLDY;
      if (bread && wantMoldy && !(bread instanceof MoldyBread)) {
        bread.destroy(); bread = null; this.breads.delete(p.id);
      }
      if (!bread) {
        const Cls = wantMoldy ? MoldyBread : Bread;
        bread = new Cls(this, p.x, p.y, {
          id: p.id, name: p.name, colorIndex: p.colorIndex, isLocal: p.id === this.myId,
        });
        this.breads.set(p.id, bread);
        if (p.id === this.myId) this.cameras.main.startFollow(bread, true, 0.12, 0.12);
      }

      const view = p.id === this.myId ? this.predict(p, input, dt, snap) : p;
      bread.setProgress(this.tasks.progressFor(snap, p.id));
      bread.sync(view, dt);

      if (bread instanceof MoldyBread && p.id === this.myId && snap.you) {
        bread.drawKillHold(view.x, view.y - (view.z || 0), snap.you.killHold || 0);
      }
      // Soggy bread leaves a wet trail behind it.
      if (p.soggy && p.alive) {
        this.trailGfx.fillStyle(0x9fd8ff, 0.25).fillCircle(p.x, p.y + 10, 10);
      }
    }

    for (const [id, bread] of this.breads) {
      if (!seen.has(id)) { bread.destroy(); this.breads.delete(id); }
    }
  }

  /**
   * Client-side prediction for your own slice.
   *
   * The server stays authoritative; we run the same stepper locally so input
   * feels instant, then pull the prediction toward the server's answer. Solo
   * mode simulates locally already, so it skips this entirely.
   */
  predict(p, input, dt, snap) {
    if (this.driver.isLocal || !p.alive || snap.state !== GAME_STATE.PLAYING) {
      this.prediction = null;
      return p;
    }
    if (!this.prediction) {
      this.prediction = createBreadState(p.x, p.y, p.angle);
    }
    const b = this.prediction;
    stepBread(b, input, dt, {
      moldPatches: snap.mold,
      carrying: !!snap.you?.carrying,
      stunned: !!p.stunned,
      inverted: (snap.you?.invertUntil || 0) > snap.time,
    });

    // Reconcile. A large gap means a teleport (respawn, ant ride): snap to it.
    const gap = Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y);
    if (gap > 160) {
      b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0; b.angle = p.angle; b.lean = p.lean;
    } else {
      const k = Phaser.Math.Clamp(dt * 6, 0, 1);
      b.x = Phaser.Math.Linear(b.x, p.x, k);
      b.y = Phaser.Math.Linear(b.y, p.y, k);
      b.angle = Phaser.Math.Angle.RotateTo(
        Phaser.Math.DegToRad(b.angle), Phaser.Math.DegToRad(p.angle), k * 0.6) * 180 / Math.PI;
    }
    return { ...p, x: b.x, y: b.y, z: b.z, angle: b.angle, lean: b.lean };
  }

  // -- world ---------------------------------------------------------------

  syncWorld(snap, dt) {
    // Mold patches fade as they age; the snapshot only sends live ones.
    this.moldGfx.clear();
    for (const m of snap.mold) {
      this.moldGfx.fillStyle(0x6fbf4a, 0.28).fillCircle(m.x, m.y, m.r);
      this.moldGfx.fillStyle(0x8fd96a, 0.35).fillCircle(m.x - 4, m.y - 3, m.r * 0.4);
    }

    this.sporeGfx.clear();
    for (const s of snap.spores) {
      this.sporeGfx.fillStyle(0x6fbf4a, 0.16).fillCircle(s.x, s.y, s.r);
      this.sporeGfx.lineStyle(3, 0x8fd96a, 0.4).strokeCircle(s.x, s.y, s.r);
    }

    // Crumbs
    const seenCrumbs = new Set();
    for (const c of snap.crumbs) {
      if (c.delivered) continue;
      seenCrumbs.add(c.id);
      let s = this.crumbSprites.get(c.id);
      if (!s) {
        s = this.add.image(c.x, c.y, 'crumb').setDepth(6);
        this.crumbSprites.set(c.id, s);
      }
      s.setPosition(c.x, c.y).setDepth(c.held ? 15 : 6);
    }
    for (const [id, s] of this.crumbSprites) {
      if (!seenCrumbs.has(id)) { s.destroy(); this.crumbSprites.delete(id); }
    }

    // Bodies
    const seenBodies = new Set();
    for (const b of snap.bodies) {
      seenBodies.add(b.id);
      if (!this.bodySprites.has(b.id)) {
        const s = this.add.image(b.x, b.y, 'burnt').setDepth(7).setAngle(90).setScale(1, 0.4);
        this.bodySprites.set(b.id, s);
      }
    }
    for (const [id, s] of this.bodySprites) {
      if (!seenBodies.has(id)) { s.destroy(); this.bodySprites.delete(id); }
    }

    // Ants march their loop; a rider is carried by the sim, not by us.
    for (let i = 0; i < this.ants.length; i++) {
      const pos = antPosition(ANT_PATH, ANT_SPEED, snap.antT, i * 260);
      const ahead = antPosition(ANT_PATH, ANT_SPEED, snap.antT + 0.1, i * 260);
      this.ants[i].setPosition(pos.x, pos.y)
        .setRotation(Math.atan2(ahead.y - pos.y, ahead.x - pos.x));
    }

    this.knife.setPosition(snap.knife.x, snap.knife.y);
    this.knife.setRotation(Math.atan2(
      snap.knife.y - (this.lastKnifeY ?? snap.knife.y),
      snap.knife.x - (this.lastKnifeX ?? snap.knife.x + 1)));
    this.lastKnifeX = snap.knife.x; this.lastKnifeY = snap.knife.y;

    const cranked = snap.toasterCrank > 0;
    this.toasterAlarm.setVisible(cranked);
    if (cranked) this.toasterAlarm.setAlpha(0.25 + Math.abs(Math.sin(snap.time * 8)) * 0.35);

    // Wet trails dry out.
    this.trailGfx.setAlpha(Math.max(0, this.trailGfx.alpha - dt * 0.06));
    if (this.trailGfx.alpha <= 0.02) { this.trailGfx.clear(); this.trailGfx.setAlpha(1); }
  }

  spawnSporeCloud(x, y, r) {
    const p = this.add.particles(x, y, 'moldcrumb', {
      speed: { min: 20, max: r },
      lifespan: 1400,
      quantity: 3,
      frequency: 40,
      scale: { start: 1.4, end: 0 },
      alpha: { start: 0.8, end: 0 },
      emitting: true,
    }).setDepth(9);
    this.time.delayedCall(1200, () => p.stop());
    this.time.delayedCall(3000, () => p.destroy());
  }

  // -- events --------------------------------------------------------------

  handleEvent(ev, snap) {
    this.tasks.handleEvent(ev, this);
    this.sabotage.handleEvent(ev, this);

    switch (ev.type) {
      case 'player:died': {
        Sfx.squish();
        const p = snap.players.find((x) => x.id === ev.playerId);
        const name = p ? p.name : 'A slice';
        if (ev.playerId === this.myId) {
          this.hud.addLog(ev.cause === 'burnt' ? 'You were toasted to death.' : 'You have been mouldered.');
          this.cameras.main.shake(400, 0.015);
        } else if (ev.cause === 'burnt') {
          this.hud.addLog(`${name} burned.`);
        }
        break;
      }
      case 'round:start':
        this.hud.addLog(`Round ${ev.round}. Back to work.`);
        this.trailGfx.clear();
        break;
      case 'meeting:called':
        this.prediction = null;
        break;
      case 'meeting:result':
        this.playEjection(ev, snap);
        break;
      case 'game:over':
        this.showGameOver(ev, snap);
        break;
      default: break;
    }
  }

  /** Ejected bread tumbles off the counter into the sink. */
  playEjection(result, snap) {
    if (!result || result.skipped || !result.ejectedId) return;
    const bread = this.breads.get(result.ejectedId);
    if (!bread) return;
    this.ejecting = true;
    const sink = { x: ZONES.SINK.x + ZONES.SINK.w / 2, y: ZONES.SINK.y + ZONES.SINK.h / 2 };
    this.tweens.add({
      targets: [bread, bread.label, bread.moldOverlay],
      x: sink.x, y: sink.y,
      angle: 1080,
      scaleX: 0.2, scaleY: 0.2,
      alpha: 0,
      duration: 2200,
      ease: 'Cubic.easeIn',
      onComplete: () => { this.ejecting = false; },
    });
  }

  showGameOver(ev, snap) {
    const layer = document.getElementById('gameover');
    const title = document.getElementById('win-title');
    const reason = document.getElementById('win-reason');
    const roles = document.getElementById('win-roles');
    const freshWon = ev.winner === ROLE.FRESH;
    title.textContent = freshWon ? 'Fresh bread wins' : 'The mold wins';
    title.className = `winner ${freshWon ? 'fresh' : 'moldy'}`;
    reason.textContent = ev.reason || '';
    roles.innerHTML = snap.players.map((p) => {
      const color = `#${BREAD_COLORS[p.colorIndex % BREAD_COLORS.length].toString(16).padStart(6, '0')}`;
      const moldy = p.role === ROLE.MOLDY;
      return `<div class="lobby-row"><span class="swatch" style="background:${color}"></span>
        <span>${p.name}</span>
        <span style="margin-left:auto;color:${moldy ? '#6fbf4a' : '#ffd98a'}">${moldy ? 'MOLDY SLICE' : 'fresh'}</span></div>`;
    }).join('');
    layer.classList.add('on');
    const iWon = snap.you && ((snap.you.role === ROLE.MOLDY) === !freshWon);
    if (iWon) Sfx.win(); else Sfx.lose();
  }

  teardown() {
    this.hud.hide();
    this.sabotage.destroy();
    if (this.meetingScene) { this.scene.stop('Meeting'); this.meetingScene = null; }
    this.driver?.destroy?.();
    for (const b of this.breads.values()) b.destroy();
    this.breads.clear();
    this.input.keyboard.removeAllListeners();
  }
}
