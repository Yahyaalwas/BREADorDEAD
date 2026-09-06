import { SABOTAGE, SABOTAGE_DEFS, ROLE } from '../../../shared/constants.js';
import { Sfx } from '../audio/Sfx.js';

const ORDER = [
  SABOTAGE.GREEN_CRUMBS, SABOTAGE.SPORE_BURST, SABOTAGE.TOASTER,
  SABOTAGE.FRAME, SABOTAGE.KILL,
];

/** Moldy ability bar: buttons, number-key bindings and cooldown readouts. */
export class SabotageManager {
  constructor(scene, onUse) {
    this.scene = scene;
    this.onUse = onUse;
    this.root = document.getElementById('hud-abilities');
    this.buttons = new Map();
    this.visible = false;
    this.build();
    this.bindKeys();
  }

  build() {
    this.root.innerHTML = '';
    for (const id of ORDER) {
      const def = SABOTAGE_DEFS[id];
      const el = document.createElement('div');
      el.className = 'ability';
      el.title = def.desc;
      el.innerHTML = `<div class="k">${def.passive ? 'AUTO' : def.key}</div>
                      <div class="n">${def.name}</div>
                      <div class="cd" hidden></div>`;
      el.onclick = () => this.use(id);
      this.root.appendChild(el);
      this.buttons.set(id, el);
    }
    this.root.style.display = 'none';
  }

  bindKeys() {
    this.keyHandler = (e) => {
      if (!this.visible) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      const def = ORDER.map((id) => SABOTAGE_DEFS[id]).find((d) => d.key === e.key);
      if (def) { e.preventDefault(); this.use(def.id); }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  use(id) {
    const def = SABOTAGE_DEFS[id];
    if (!def || def.passive) return;
    this.onUse(id);
  }

  update(snap) {
    const you = snap.you;
    const show = !!you && you.role === ROLE.MOLDY && you.alive;
    if (show !== this.visible) {
      this.visible = show;
      this.root.style.display = show ? 'flex' : 'none';
    }
    if (!show) return;

    for (const id of ORDER) {
      const el = this.buttons.get(id);
      const def = SABOTAGE_DEFS[id];
      const left = you.cooldowns?.[id] || 0;
      const cd = el.querySelector('.cd');
      if (def.passive || left <= 0.05) {
        cd.hidden = true;
        el.classList.add('ready');
      } else {
        cd.hidden = false;
        cd.textContent = Math.ceil(left);
        el.classList.remove('ready');
      }
    }
  }

  handleEvent(ev, scene) {
    switch (ev.type) {
      case 'sabotage:spore':
        Sfx.spore();
        scene.spawnSporeCloud(ev.x, ev.y, ev.r);
        break;
      case 'sabotage:toaster':
        Sfx.alarm();
        scene.cameras.main.shake(700, 0.008);
        scene.hud.addLog('The toaster is screaming.');
        break;
      case 'sabotage:toasterFire':
        Sfx.burn();
        scene.cameras.main.shake(500, 0.02);
        break;
      case 'sabotage:frame':
        if (ev.targetId === scene.myId) scene.hud.addLog('Something green is on you.');
        break;
      case 'sabotage:killStart':
        if (ev.by === scene.myId) scene.hud.addLog('Hold still… 2 seconds.');
        break;
      case 'sabotage:killAbort':
        if (ev.by === scene.myId) scene.hud.addLog('They got away.');
        break;
      default: break;
    }
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    this.root.innerHTML = '';
    this.root.style.display = 'none';
  }
}
