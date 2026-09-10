// A room owns one GameSim and the sockets watching it.

import { GameSim } from '../../shared/GameSim.js';
import { GameLoop } from './GameLoop.js';
import { EV, GAME_STATE, ROOM } from '../../shared/constants.js';

export class GameRoom {
  constructor(code, io, onEmpty) {
    this.code = code;
    this.io = io;
    this.onEmpty = onEmpty;
    this.players = new Map();     // socketId -> Player
    this.sim = new GameSim();
    this.hostId = null;
    this.emptySince = null;
    this.loop = new GameLoop({
      onTick: (dt) => this.tick(dt),
      onBroadcast: () => this.broadcastState(),
    });
    this.loop.start();
  }

  get size() { return this.players.size; }
  get isFull() { return this.size >= ROOM.MAX_PLAYERS; }
  get inProgress() {
    return this.sim.state === GAME_STATE.PLAYING || this.sim.state === GAME_STATE.MEETING;
  }

  // -- membership ----------------------------------------------------------

  add(player) {
    if (this.isFull) return { ok: false, error: 'Room is full (8 slices max).' };
    if (this.inProgress) return { ok: false, error: 'That game has already started.' };

    this.players.set(player.id, player);
    player.roomCode = this.code;
    if (!this.hostId) { this.hostId = player.id; player.isHost = true; }
    this.sim.addPlayer({
      id: player.id, name: player.name,
      colorIndex: player.colorIndex, hatIndex: player.hatIndex,
    });
    this.emptySince = null;

    player.socket.join(this.code);
    this.io.to(this.code).emit(EV.PLAYER_JOINED, { id: player.id, name: player.name });
    this.broadcastLobby();
    return { ok: true };
  }

  remove(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.sim.removePlayer(playerId);
    player.socket.leave(this.code);
    player.roomCode = null;

    if (this.hostId === playerId) {
      const next = this.players.values().next().value;
      this.hostId = next ? next.id : null;
      if (next) next.isHost = true;
    }

    this.io.to(this.code).emit(EV.PLAYER_LEFT, { id: playerId, name: player.name });
    this.broadcastLobby();

    if (this.players.size === 0) {
      this.emptySince = Date.now();
    }
  }

  destroy() {
    this.loop.stop();
  }

  // -- lobby ---------------------------------------------------------------

  lobbyState() {
    return {
      code: this.code,
      hostId: this.hostId,
      state: this.sim.state,
      minPlayers: ROOM.MIN_PLAYERS,
      maxPlayers: ROOM.MAX_PLAYERS,
      players: [...this.players.values()].map((p) => {
        const sp = this.sim.players.get(p.id);
        return {
          ...p.toLobbyJSON(),
          colorIndex: sp ? sp.colorIndex : p.colorIndex,
          hatIndex: sp ? sp.hatIndex : p.hatIndex,
        };
      }),
    };
  }

  broadcastLobby() {
    this.io.to(this.code).emit(EV.ROOM_STATE, this.lobbyState());
  }

  setReady(playerId, ready) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.ready = !!ready;
    this.broadcastLobby();
  }

  start(byId) {
    if (byId !== this.hostId) return { ok: false, error: 'Only the host can start.' };
    if (this.size < ROOM.MIN_PLAYERS) {
      return { ok: false, error: `Need at least ${ROOM.MIN_PLAYERS} sheep.` };
    }
    if (this.inProgress) return { ok: false, error: 'Already playing.' };
    this.sim.start();
    for (const p of this.players.values()) {
      p.socket.emit(EV.GAME_START, this.sim.snapshot(p.id));
    }
    return { ok: true };
  }

  // -- gameplay ------------------------------------------------------------

  handleMove(playerId, input) {
    this.sim.setInput(playerId, input);
  }

  handleAction(playerId, action) {
    this.sim.action(playerId, action);
  }

  handleCustomize(playerId, profile) {
    const p = this.players.get(playerId);
    if (!p) return;
    this.sim.customize(playerId, profile);
    const simP = this.sim.players.get(playerId);
    if (simP) {
      p.name = simP.name;
      p.colorIndex = simP.colorIndex;
      p.hatIndex = simP.hatIndex;
    }
    this.broadcastLobby();
  }

  handleVote(playerId, targetId) {
    this.sim.vote(playerId, targetId);
    const m = this.sim.meeting;
    if (m) {
      this.io.to(this.code).emit(EV.MEETING_VOTE_UPDATE, {
        votes: Object.keys(m.votes).length,
        needed: this.sim.alivePlayers.length,
        voters: Object.keys(m.votes),
      });
    }
  }

  handleChat(playerId, text) {
    if (this.sim.state !== GAME_STATE.MEETING) return;
    const msg = this.sim.addChat(playerId, text);
    if (msg) this.io.to(this.code).emit(EV.MEETING_CHAT, msg);
  }

  tick(dt) {
    if (this.sim.state === GAME_STATE.LOBBY) return;
    this.sim.update(dt);
    const events = this.sim.drainEvents();
    for (const ev of events) this.routeEvent(ev);
  }

  routeEvent(ev) {
    switch (ev.type) {
      case 'meeting:called':
        this.io.to(this.code).emit(EV.MEETING_CALLED, ev);
        break;
      case 'meeting:result':
        this.io.to(this.code).emit(EV.MEETING_RESULT, ev);
        break;
      case 'game:over':
        this.io.to(this.code).emit(EV.GAME_OVER, ev);
        break;
      default:
        this.io.to(this.code).emit(EV.GAME_EVENT, ev);
        break;
    }
  }

  broadcastState() {
    if (this.sim.state === GAME_STATE.LOBBY) return;
    for (const p of this.players.values()) {
      p.socket.emit(EV.GAME_STATE, this.sim.snapshot(p.id));
    }
  }

  // Called by the manager sweep.
  isStale(now) {
    return this.players.size === 0 &&
      this.emptySince !== null &&
      now - this.emptySince > ROOM.EMPTY_TTL_MS;
  }
}
