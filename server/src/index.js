// Bread or Dead — Express + Socket.io entry point.
//
// Serves the built client (so the whole game deploys as one Node process) and
// runs every room's authoritative simulation.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';

import { Player } from './Player.js';
import { GameRoom } from './GameRoom.js';
import { EV, ROOM } from '../../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
});

const rooms = new Map();     // code -> GameRoom
const players = new Map();   // socketId -> Player

// Codes avoid I/O/0/1 so nobody mistypes them.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM.CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return `R${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

function getOrCreateRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = new GameRoom(code, io, () => rooms.delete(code));
    rooms.set(code, room);
  }
  return room;
}

function leaveCurrentRoom(player) {
  if (!player.roomCode) return;
  const room = rooms.get(player.roomCode);
  if (room) room.remove(player.id);
}

// --- HTTP -------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    players: players.size,
    uptime: Math.round(process.uptime()),
  });
});

app.get('/api/rooms', (_req, res) => {
  res.json([...rooms.values()]
    .filter((r) => !r.inProgress && !r.isFull)
    .map((r) => ({ code: r.code, players: r.size, max: ROOM.MAX_PLAYERS })));
});

app.use(express.static(CLIENT_DIST));
// Single-page client: anything not matched above falls through to index.html.
app.get(/^(?!\/(api|socket\.io|health)).*/, (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
    if (err) res.status(404).send('Client not built yet. Run `npm run build`.');
  });
});

// --- Sockets ----------------------------------------------------------------

io.on('connection', (socket) => {
  socket.on(EV.ROOM_CREATE, ({ name } = {}, ack) => {
    const player = new Player(socket, name);
    players.set(socket.id, player);
    const code = makeCode();
    const room = getOrCreateRoom(code);
    const result = room.add(player);
    if (typeof ack === 'function') ack({ ...result, code, id: socket.id });
  });

  socket.on(EV.ROOM_JOIN, ({ name, code } = {}, ack) => {
    const clean = String(code || '').toUpperCase().trim();
    const room = rooms.get(clean);
    if (!room) {
      const err = { ok: false, error: `No room called ${clean || '????'}.` };
      socket.emit(EV.ROOM_ERROR, err);
      if (typeof ack === 'function') ack(err);
      return;
    }
    let player = players.get(socket.id);
    if (!player) {
      player = new Player(socket, name);
      players.set(socket.id, player);
    } else {
      player.name = (name || player.name).trim().slice(0, 14) || player.name;
      leaveCurrentRoom(player);
    }
    const result = room.add(player);
    if (!result.ok) socket.emit(EV.ROOM_ERROR, result);
    if (typeof ack === 'function') ack({ ...result, code: clean, id: socket.id });
  });

  socket.on(EV.ROOM_LEAVE, () => {
    const player = players.get(socket.id);
    if (player) leaveCurrentRoom(player);
  });

  socket.on(EV.ROOM_START, (_data, ack) => {
    const player = players.get(socket.id);
    const room = player && rooms.get(player.roomCode);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not in a room.' });
      return;
    }
    const result = room.start(socket.id);
    if (!result.ok) socket.emit(EV.ROOM_ERROR, result);
    if (typeof ack === 'function') ack(result);
  });

  const withRoom = (fn) => (payload) => {
    const player = players.get(socket.id);
    const room = player && rooms.get(player.roomCode);
    if (!room) return;
    fn(room, payload || {});
  };

  socket.on(EV.PLAYER_MOVE, withRoom((room, input) => room.handleMove(socket.id, input)));

  socket.on(EV.PLAYER_TASK, withRoom((room, data) =>
    room.handleAction(socket.id, { type: data.action || 'pickup', taskId: data.taskId })));

  socket.on(EV.PLAYER_SABOTAGE, withRoom((room, data) =>
    room.handleAction(socket.id, { type: 'sabotage', ability: data.abilityId, targetId: data.targetId })));

  socket.on(EV.PLAYER_MEETING, withRoom((room, data) =>
    room.handleAction(socket.id, { type: data.type === 'body' ? 'report' : 'scream' })));

  socket.on(EV.PLAYER_VOTE, withRoom((room, data) => room.handleVote(socket.id, data.targetId)));

  socket.on(EV.PLAYER_CHAT, withRoom((room, data) => room.handleChat(socket.id, data.text)));

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) leaveCurrentRoom(player);
    players.delete(socket.id);
  });
});

// Empty rooms die on their own; there is no database to clean up.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.isStale(now)) {
      room.destroy();
      rooms.delete(code);
    }
  }
}, 15_000).unref();

server.listen(PORT, () => {
  console.log(`🍞 Bread or Dead server listening on http://localhost:${PORT}`);
});

export { app, server, io };
