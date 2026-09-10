import Phaser from 'phaser';
import { FarmMap } from '../FarmMap.js';
import Sheep from '../entities/Sheep.js';
import { HUD } from '../ui/HUD.js';
import { TouchControls } from '../ui/TouchControls.js';
import { MobileUI } from '../ui/MobileUI.js';
import { Sfx } from '../audio/Sfx.js';
import {
  WORLD, GAME_STATE, ROLE, CHORES, CHORE_KIND, WOOL_COLORS,
} from '../../../shared/constants.js';
import { createBody, stepBody, dist } from '../../../shared/movement.js';

/**
 * The farm. Renders whatever the active driver reports and forwards input.
 * Multiplayer and solo share this scene; only the driver differs.
 */
export default class GameScene extends Phaser.Scene {
  constructor(key = 'Game') { super(key); }

  init(data) {
    this.driver = data.driver;
    this.myId = this.driver.myId;
    this.sheep = new Map();
    this.remains = new Map();
    this.prediction = null;
    this.meetingScene = null;
    this.lastFrameAt = null;
    this.pulse = 0;
    this.holding = false;
  }

  create() {
    this.map = new FarmMap(this);
    this.compact = window.innerWidth < 820 || TouchControls.isTouchDevice;

    this.cameras.main.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    this.cameras.main.setBackgroundColor('#0d1018');
    this.cameras.main.setZoom(this.fitZoom());
    this.scale.on('resize', () => this.cameras.main.setZoom(this.fitZoom()));

    this.buildVision();

    this.hud = new HUD();
    this.hud.show();
    this.hud.onPrimary(
      () => this.pressPrimary(),
      () => this.releasePrimary(),
    );
    this.hud.onWolf((what) => this.driver.action({ type: what }));

    this.touch = new TouchControls({
      onPress: () => this.pressPrimary(),
      onRelease: () => this.releasePrimary(),
      onWolf: (what) => this.driver.action({ type: what }),
    });
    this.mobile = new MobileUI({ onOverlayOpen: () => this.touch.releaseAll() });
    this.isTouch = TouchControls.isTouchDevice;
    if (this.isTouch) this.touch.show();

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      aUp: Phaser.Input.Keyboard.KeyCodes.UP,
      aDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
      aLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
      aRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      use: Phaser.Input.Keyboard.KeyCodes.E,
    });
    this.input.keyboard.on('keydown-E', () => this.pressPrimary());
    this.input.keyboard.on('keyup-E', () => this.releasePrimary());
    this.input.keyboard.on('keydown-SPACE', () => this.driver.action({ type: 'eat' }));
    this.input.keyboard.on('keydown-Q', () => this.driver.action({ type: 'tunnel' }));
    this.input.keyboard.on('keydown-F', () => this.driver.action({ type: 'fog' }));

    window.__sheeple = { scene: this, driver: this.driver };
    this.events.once('shutdown', () => { delete window.__sheeple; this.teardown(); });
  }

  /**
   * Dark everywhere except a circle around you — the whole point of sneaking.
   *
   * The darkness is a world-sized render texture, refilled each frame with the
   * vision gradient erased out of it. Keeping it in world space (rather than
   * screen space) means the camera's zoom and scroll apply to it exactly as
   * they do to the farm, so the hole always sits on the player.
   */
  buildVision() {
    this.fog = this.add.renderTexture(0, 0, WORLD.WIDTH, WORLD.HEIGHT)
      .setOrigin(0).setDepth(500);
    this.visionShape = this.make.image({ key: 'vision', add: false }).setOrigin(0.5);
  }

  /** Repaint the darkness with a hole over the player, in world coordinates. */
  drawVision(worldX, worldY, radius, dark) {
    this.fog.clear();
    this.fog.fill(0x05060c, dark);
    this.visionShape.setPosition(worldX, worldY);
    this.visionShape.setScale((radius * 2) / 512);
    this.fog.erase(this.visionShape);
  }

  fitZoom() {
    const zx = this.scale.width / WORLD.WIDTH;
    const zy = this.scale.height / WORLD.HEIGHT;
    return Phaser.Math.Clamp(Math.max(zx, zy) * 1.5, 0.55, 1.5);
  }

  typing() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  // -- input ---------------------------------------------------------------

  /** One button does the right thing: report a body, ring the bell, or work. */
  primaryAction(snap) {
    const you = snap?.you;
    if (!you || !you.alive || snap.state !== GAME_STATE.PLAYING) return null;
    if (you.nearBody) return { type: 'report', label: 'REPORT', tone: 'danger' };
    if (you.atBell && !you.usedBell) return { type: 'bell', label: 'BELL', tone: 'warn' };
    if (you.nearChore) {
      const def = CHORES.find((c) => c.id === you.nearChore);
      return {
        type: 'chore',
        kind: def?.kind,
        label: def ? `${def.emoji} ${def.name}` : 'CHORE',
        tone: 'ok',
      };
    }
    return null;
  }

  pressPrimary() {
    if (this.typing()) return;
    const snap = this.driver.snapshot();
    const action = this.primaryAction(snap);
    if (!action) return;
    if (action.type === 'chore' && action.kind === CHORE_KIND.HOLD) {
      this.holding = true;
      this.driver.action({ type: 'holdStart' });
    } else if (action.type === 'chore') {
      this.driver.action({ type: 'chore' });
      Sfx.tap();
    } else {
      if (action.type === 'report') Sfx.scream(); else Sfx.bell();
      this.driver.action({ type: action.type });
    }
  }

  releasePrimary() {
    if (!this.holding) return;
    this.holding = false;
    this.driver.action({ type: 'holdEnd' });
  }

  readInput() {
    if (this.typing()) return { dx: 0, dy: 0 };
    const k = this.keys;
    let dx = 0, dy = 0;
    if (k.left.isDown || k.aLeft.isDown) dx -= 1;
    if (k.right.isDown || k.aRight.isDown) dx += 1;
    if (k.up.isDown || k.aUp.isDown) dy -= 1;
    if (k.down.isDown || k.aDown.isDown) dy += 1;
    const stick = this.touch.read();
    if (Math.abs(stick.dx) > 0.01 || Math.abs(stick.dy) > 0.01) { dx = stick.dx; dy = stick.dy; }
    return { dx, dy };
  }

  // -- loop ----------------------------------------------------------------

  update() {
    // Wall-clock timing: Phaser pins its delta to the target frame time when the
    // window loses focus, which would stall the simulation and the meeting timer.
    const now = performance.now();
    const dt = Math.min((now - (this.lastFrameAt ?? now - 16)) / 1000, 0.1);
    this.lastFrameAt = now;
    this.pulse += dt * 3;

    this.driver.update(dt);
    const snap = this.driver.snapshot();
    if (!snap) return;

    const playing = snap.state === GAME_STATE.PLAYING;
    const input = playing ? this.readInput() : { dx: 0, dy: 0 };
    this.driver.sendInput(input);

    this.syncSheep(snap, dt, input);
    this.syncWorld(snap, dt);

    const action = this.primaryAction(snap);
    this.hud.update(snap, action);
    if (this.isTouch) {
      this.mobile.update(snap);
      this.touch.setContext(snap, action);
    }
    this.syncMeetingScene(snap);

    for (const ev of this.driver.drainEvents()) this.handleEvent(ev, snap);
  }

  syncMeetingScene(snap) {
    const inMeeting = snap.state === GAME_STATE.MEETING;
    if (inMeeting && !this.meetingScene) {
      this.scene.launch('Meeting', { driver: this.driver });
      this.meetingScene = this.scene.get('Meeting');
    }
    if (this.isTouch) {
      if (snap.state === GAME_STATE.PLAYING) this.touch.show();
      else { this.touch.hide(); this.mobile.reset(); }
    }
    if (inMeeting) {
      this.meetingScene?.setSnapshot?.(snap);
    } else if (this.meetingScene) {
      this.scene.stop('Meeting');
      this.meetingScene = null;
    }
  }

  syncSheep(snap, dt, input) {
    const me = snap.players.find((p) => p.id === this.myId);
    const seen = new Set();

    for (const p of snap.players) {
      seen.add(p.id);
      let s = this.sheep.get(p.id);
      if (!s) {
        s = new Sheep(this, p.x, p.y, {
          id: p.id, name: p.name, colorIndex: p.colorIndex,
          hatIndex: p.hatIndex, isLocal: p.id === this.myId,
        });
        this.sheep.set(p.id, s);
        if (p.id === this.myId) this.cameras.main.startFollow(s, true, 0.15, 0.15);
      }
      const view = p.id === this.myId ? this.predict(p, input, dt, snap) : p;
      s.sync(view, dt);
      // Names only within sight; a shape in the dark should stay a shape.
      if (me && p.id !== this.myId) {
        const d = dist(me.x, me.y, p.x, p.y);
        s.setNameVisible(p.alive && d < (snap.you?.vision || 330) * 0.92);
      }
    }
    for (const [id, s] of this.sheep) {
      if (!seen.has(id)) { s.destroy(); this.sheep.delete(id); }
    }

    // The darkness follows your own sheep and closes in during fog.
    const you = snap.you;
    if (me && you) {
      const view = this.prediction || me;
      this.drawVision(view.x, view.y, you.vision || 330, snap.fog ? 0.97 : 0.93);
    }
  }

  /**
   * Client-side prediction for your own sheep: the server stays authoritative,
   * but running the same stepper locally keeps input instant. Solo mode already
   * simulates locally, so it skips this.
   */
  predict(p, input, dt, snap) {
    if (this.driver.isLocal || !p.alive || snap.state !== GAME_STATE.PLAYING) {
      this.prediction = null;
      return p;
    }
    if (!this.prediction) this.prediction = createBody(p.x, p.y);
    const b = this.prediction;
    stepBody(b, input, dt, {
      speedMult: snap.you?.role === ROLE.WOLF ? 1.06 : 1,
    });
    const gap = Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y);
    if (gap > 140) {                        // teleport: tunnel, respawn, eat
      b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0;
    } else {
      const k = Phaser.Math.Clamp(dt * 7, 0, 1);
      b.x = Phaser.Math.Linear(b.x, p.x, k);
      b.y = Phaser.Math.Linear(b.y, p.y, k);
    }
    return { ...p, x: b.x, y: b.y, facing: b.facing, moving: b.moving, bob: b.bob };
  }

  syncWorld(snap, dt) {
    const you = snap.you;
    const owed = new Set((you?.chores || []).filter((c) => !c.done).map((c) => c.id));
    this.map.setActiveChores(owed, this.pulse);
    if (this.compact) this.map.setLabelsVisible(false);

    const seen = new Set();
    for (const b of snap.bodies) {
      seen.add(b.id);
      if (!this.remains.has(b.id)) {
        const img = this.add.image(b.x, b.y, 'remains').setDepth(15);
        this.tweens.add({ targets: img, angle: { from: -4, to: 4 }, duration: 900, yoyo: true, repeat: -1 });
        this.remains.set(b.id, img);
      }
    }
    for (const [id, img] of this.remains) {
      if (!seen.has(id)) { img.destroy(); this.remains.delete(id); }
    }

  }

  // -- events --------------------------------------------------------------

  handleEvent(ev, snap) {
    switch (ev.type) {
      case 'chore:done':
        if (ev.playerId === this.myId) { Sfx.ding(); this.hud.log(`Done: ${ev.name}`); }
        break;
      case 'player:eaten': {
        Sfx.chomp();
        if (ev.playerId === this.myId) {
          this.cameras.main.shake(400, 0.02);
          this.hud.log('You have been eaten. Keep watching.');
        } else if (ev.by === this.myId) {
          this.hud.log('Chomp. Walk away casually.');
        }
        break;
      }
      case 'wolf:fog':
        Sfx.fog();
        this.hud.log('Fog rolls in over the farm.');
        break;
      case 'wolf:tunnel':
        if (ev.playerId === this.myId) Sfx.whoosh();
        break;
      case 'meeting:called':
        Sfx.bell();
        this.prediction = null;
        break;
      case 'game:over':
        this.showGameOver(ev, snap);
        break;
      default: break;
    }
  }

  showGameOver(ev, snap) {
    const layer = document.getElementById('gameover');
    const sheepWon = ev.winner === ROLE.SHEEP;
    document.getElementById('win-title').textContent = sheepWon ? 'The sheep win' : 'The wolf wins';
    document.getElementById('win-title').className = `winner ${sheepWon ? 'sheep' : 'wolf'}`;
    document.getElementById('win-reason').textContent = ev.reason || '';
    document.getElementById('win-roles').innerHTML = snap.players.map((p) => {
      const color = `#${WOOL_COLORS[p.colorIndex % WOOL_COLORS.length].hex.toString(16).padStart(6, '0')}`;
      const wolf = p.role === ROLE.WOLF;
      return `<div class="lobby-row"><span class="swatch" style="background:${color}"></span>
        <span>${p.name}</span>
        <span style="margin-left:auto;color:${wolf ? '#ff6b5a' : '#ffe066'}">${wolf ? '🐺 WOLF' : 'sheep'}</span></div>`;
    }).join('');
    layer.classList.add('on');
    const youWon = snap.you && ((snap.you.role === ROLE.WOLF) === !sheepWon);
    if (youWon) Sfx.win(); else Sfx.lose();
  }

  teardown() {
    this.hud.hide();
    this.touch.destroy();
    this.mobile.reset();
    if (this.meetingScene) { this.scene.stop('Meeting'); this.meetingScene = null; }
    this.driver?.destroy?.();
    for (const s of this.sheep.values()) s.destroy();
    this.sheep.clear();
    this.input.keyboard.removeAllListeners();
  }
}
