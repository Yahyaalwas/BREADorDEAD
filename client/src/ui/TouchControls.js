/**
 * On-screen controls for phones and tablets.
 *
 * Steering is two big screen-edge zones rather than a joystick: bread does not
 * walk, it flops, so a stick implying analog movement would lie. Holding a zone
 * applies torque that way *and* keeps the slice flopping forward — torque alone
 * would only spin you on the spot, since thrust is what actually moves bread.
 *
 * Held buttons feed the same input object the keyboard produces, so physics and
 * networking never learn a thumb is involved. Pointer events (not touch events)
 * keep multi-touch honest: two thumbs are two independent pointers, and a
 * pointer lost off the edge of a control releases it instead of sticking.
 */
export class TouchControls {
  constructor({ onTap } = {}) {
    this.root = document.getElementById('touch');
    this.onTap = onTap || (() => {});
    this.state = {
      left: false, right: false, forward: false, back: false, hop: false, interact: false,
    };
    this.pointers = new Map();   // pointerId -> element
    this.enabled = false;
    this.bind();
  }

  /** A real touch screen, not merely a narrow window. */
  static get isTouchDevice() {
    return (navigator.maxTouchPoints || 0) > 0 ||
      window.matchMedia('(pointer: coarse)').matches;
  }

  bind() {
    const press = (el, e) => {
      e.preventDefault();
      // Set state first: pointer capture is best-effort and throws in some
      // browsers (and for synthetic pointers); that must not cost an input.
      this.pointers.set(e.pointerId, el);
      el.classList.add('held');
      if (el.dataset.zone) {
        this.state[el.dataset.zone] = true;
        this.state.forward = true;
        this.root.classList.add('settled');
      } else if (el.dataset.hold) {
        this.state[el.dataset.hold] = true;
      } else if (el.dataset.tap) {
        this.onTap(el.dataset.tap);
      }
      try { el.setPointerCapture?.(e.pointerId); } catch { /* capture is optional */ }
    };

    for (const el of this.root.querySelectorAll('.tbtn, .zone')) {
      el.addEventListener('pointerdown', (e) => press(el, e));
      const release = (e) => this.release(e.pointerId);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      // Stop iOS Safari turning a long press into selection or a callout.
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Safety net: without pointer capture a thumb can slide off a control and
    // never fire its pointerup there, which would jam the input on.
    this.globalRelease = (e) => this.release(e.pointerId);
    window.addEventListener('pointerup', this.globalRelease);
    window.addEventListener('pointercancel', this.globalRelease);
    this.blur = () => this.releaseAll();
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  release(pointerId) {
    const el = this.pointers.get(pointerId);
    if (!el) return;
    this.pointers.delete(pointerId);
    el.classList.remove('held');
    const still = [...this.pointers.values()];
    if (el.dataset.zone) {
      if (!still.includes(el)) this.state[el.dataset.zone] = false;
      // Forward creep stops only when no steering zone is held at all.
      this.state.forward = still.some((o) => o.dataset.zone);
    } else if (el.dataset.hold && !still.includes(el)) {
      this.state[el.dataset.hold] = false;
    }
  }

  show() {
    this.enabled = true;
    this.root.classList.add('on');
  }

  hide() {
    this.enabled = false;
    this.root.classList.remove('on');
    this.releaseAll();
  }

  releaseAll() {
    for (const el of this.pointers.values()) el.classList.remove('held');
    this.pointers.clear();
    for (const k of Object.keys(this.state)) this.state[k] = false;
  }

  read() { return this.state; }

  destroy() {
    this.hide();
    window.removeEventListener('pointerup', this.globalRelease);
    window.removeEventListener('pointercancel', this.globalRelease);
    window.removeEventListener('blur', this.blur);
  }
}
