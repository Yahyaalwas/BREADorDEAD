// Server-side player record: the socket binding and lobby metadata. Everything
// about the bread itself lives in the room's GameSim.

export class Player {
  constructor(socket, name) {
    this.id = socket.id;
    this.socket = socket;
    this.name = (name || '').trim().slice(0, 14) || 'Anon Loaf';
    this.roomCode = null;
    this.isHost = false;
    this.ready = false;
    this.lastInputSeq = 0;
  }

  toLobbyJSON() {
    return {
      id: this.id,
      name: this.name,
      isHost: this.isHost,
      ready: this.ready,
    };
  }
}
