import { io } from 'socket.io-client';
import { EV } from '../../../shared/constants.js';

/** One socket for the page: lobby work plus the in-game NetDriver. */
class Net {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.lobby = null;
    this.myId = null;
  }

  connect() {
    if (this.socket) return this.socket;
    const url = import.meta.env.VITE_SERVER_URL || undefined;   // same origin by default
    this.socket = io(url, { transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => { this.myId = this.socket.id; this.fire('connect'); });
    this.socket.on('disconnect', () => this.fire('disconnect'));
    this.socket.on(EV.ROOM_STATE, (s) => { this.lobby = s; this.fire('lobby', s); });
    this.socket.on(EV.ROOM_ERROR, (e) => this.fire('error', e));
    this.socket.on(EV.GAME_START, (snap) => this.fire('start', snap));
    return this.socket;
  }

  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(fn);
    return () => this.listeners.get(evt).delete(fn);
  }

  fire(evt, data) { for (const fn of this.listeners.get(evt) || []) fn(data); }

  createRoom(profile) {
    return new Promise((resolve) => this.connect().emit(EV.ROOM_CREATE, profile, resolve));
  }

  joinRoom(profile, code) {
    return new Promise((resolve) => this.connect().emit(EV.ROOM_JOIN, { ...profile, code }, resolve));
  }

  customize(profile) { this.socket?.emit(EV.ROOM_CUSTOMIZE, profile); }
  startGame() {
    return new Promise((resolve) => this.connect().emit(EV.ROOM_START, {}, resolve));
  }
  leaveRoom() { this.socket?.emit(EV.ROOM_LEAVE); this.lobby = null; }
}

export const net = new Net();

/** Drives GameScene from the authoritative server. */
export class NetDriver {
  constructor(socket, firstSnapshot) {
    this.socket = socket;
    this.isLocal = false;
    this.myId = socket.id;
    this.snap = firstSnapshot;
    this.events = [];
    this.seq = 0;

    this.handlers = {
      [EV.GAME_STATE]: (s) => { this.snap = s; },
      [EV.GAME_EVENT]: (e) => this.events.push(e),
      [EV.MEETING_CALLED]: (e) => this.events.push(e),
      [EV.MEETING_RESULT]: (e) => this.events.push({ ...e, type: 'meeting:result' }),
      [EV.GAME_OVER]: (e) => this.events.push({ ...e, type: 'game:over' }),
    };
    for (const [k, fn] of Object.entries(this.handlers)) socket.on(k, fn);
  }

  snapshot() { return this.snap; }
  update() { /* the server owns the simulation */ }

  sendInput(input) {
    // Level-triggered, so a dropped packet self-corrects on the next tick.
    this.socket.emit(EV.PLAYER_MOVE, { dx: input.dx, dy: input.dy, seq: ++this.seq });
  }

  action(a) { this.socket.emit(EV.PLAYER_ACTION, a); }
  vote(targetId) { this.socket.emit(EV.PLAYER_VOTE, { targetId }); }
  chat(text) { this.socket.emit(EV.PLAYER_CHAT, { text }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  destroy() {
    for (const [k, fn] of Object.entries(this.handlers)) this.socket.off(k, fn);
  }
}
