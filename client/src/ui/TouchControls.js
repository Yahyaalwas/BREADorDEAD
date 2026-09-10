/**
 * Phone controls: a thumb stick on the left, action buttons on the right.
 *
 * A stick is right for this game (unlike the last one) because movement is a
 * plain direction — you push where you want to go and the sheep goes there.
 * Pointer events keep multi-touch honest: steering with one thumb while tapping
 * with the other is two independent pointers.
 */
export class TouchControls {
  constructor({ onPress, onRelease, onWolf } = {}) {
    this.root = document.getElementById('touch');
    this.stickBase = document.getElementById('stick-base');
    this.stickNub = document.getElementById('stick-nub');
    this.zone = document.getElementById('stick-zone');
    this.actionBtn = document.getElementById('touch-action');
    this.wolfBox = document.getElementById('touch-wolf');
    this.onPress = onPress || (() => {});
    this.onRelease = onRelease || (() => {});
    this.onWolf = onWolf || (() => {});

    this.vec = { dx: 0, dy: 0 };
    this.stickId = null;
    this.origin = { x: 0, y: 0 };
    this.radius = 62;
    this.bind();
  }

  static get isTouchDevice() {
    return (navigator.maxTouchPoints || 0) > 0 ||
      window.matchMedia('(pointer: coarse)').matches;
  }

  bind() {
    // The stick appears wherever the thumb lands in its half of the screen.
    this.zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
      this.stickBase.classList.add('on');
      this.moveStick(e.clientX, e.clientY);
      try { this.zone.setPointerCapture?.(e.pointerId); } catch { /* optional */ }
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      this.moveStick(e.clientX, e.clientY);
    });
    const drop = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.vec = { dx: 0, dy: 0 };
      this.stickBase.classList.remove('on');
      this.stickNub.style.transform = 'translate(-50%, -50%)';
    };
    this.zone.addEventListener('pointerup', drop);
    this.zone.addEventListener('pointercancel', drop);
    window.addEventListener('pointerup', drop);

    this.actionBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.actionBtn.classList.add('held');
      this.onPress();
    });
    const release = () => { this.actionBtn.classList.remove('held'); this.onRelease(); };
    this.actionBtn.addEventListener('pointerup', release);
    this.actionBtn.addEventListener('pointercancel', release);
    window.addEventListener('pointerup', release);

    this.wolfBox.querySelectorAll('[data-power]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onWolf(b.dataset.power); });
    });

    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  moveStick(x, y) {
    let dx = x - this.origin.x;
    let dy = y - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) { dx = (dx / d) * this.radius; dy = (dy / d) * this.radius; }
    this.stickNub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // A small dead zone stops a resting thumb from drifting the sheep.
    const mag = Math.hypot(dx, dy) / this.radius;
    if (mag < 0.16) { this.vec = { dx: 0, dy: 0 }; return; }
    this.vec = { dx: dx / this.radius, dy: dy / this.radius };
  }

  /** Mirror the HUD's context button onto the thumb button. */
  setContext(snap, action) {
    if (action) {
      this.actionBtn.hidden = false;
      this.actionBtn.textContent = action.label.replace(/^[^\s]+\s/, '');
      this.actionBtn.className = `tbtn big ${action.tone}`;
    } else {
      this.actionBtn.hidden = true;
    }
    const you = snap.you;
    const wolf = you && you.role === 'wolf' && you.alive;
    this.wolfBox.hidden = !wolf;
    if (wolf) {
      this.mark('eat', you.eatCd, you.canEat);
      this.mark('tunnel', you.tunnelCd, you.atHay);
      this.mark('fog', you.fogCd, true);
    }
  }

  mark(power, cd, ready) {
    const btn = this.wolfBox.querySelector(`[data-power="${power}"]`);
    if (!btn) return;
    btn.classList.toggle('ready', cd <= 0.05 && ready);
    const label = btn.querySelector('.cd');
    if (label) {
      if (cd > 0.05) { label.hidden = false; label.textContent = Math.ceil(cd); }
      else label.hidden = true;
    }
  }

  show() { this.root.classList.add('on'); }
  hide() { this.root.classList.remove('on'); this.releaseAll(); }

  releaseAll() {
    this.stickId = null;
    this.vec = { dx: 0, dy: 0 };
    this.stickBase.classList.remove('on');
    this.stickNub.style.transform = 'translate(-50%, -50%)';
    this.actionBtn.classList.remove('held');
  }

  read() { return this.vec; }

  destroy() { this.hide(); }
}
