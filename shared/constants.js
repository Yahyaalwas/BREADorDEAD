// Sheeple — shared game configuration.
// Imported by both the Vite client and the Node server, so: dependency-free ESM.

export const GAME_NAME = 'Sheeple';

export const WORLD = { WIDTH: 1800, HEIGHT: 1200, SHEEP_R: 26 };

// Movement is deliberately plain and responsive: you push, you go. No inertia
// games, no wobble — the fun is meant to come from the other players.
export const MOVE = {
  TICK_HZ: 30,
  SPEED: 265,          // px/s
  ACCEL: 2600,         // px/s^2, high enough to feel instant
  FRICTION: 0.80,      // per tick when not pushing
  WOLF_BONUS: 1.06,    // the wolf is a touch quicker, enough to matter in a chase
};

export const ROLE = { SHEEP: 'sheep', WOLF: 'wolf' };

export const GAME_STATE = {
  LOBBY: 'lobby',
  PLAYING: 'playing',
  MEETING: 'meeting',
  ENDED: 'ended',
};

export const TIMING = {
  MEETING_SECONDS: 75,      // one timer for chat and voting together
  REVEAL_SECONDS: 7,
  EAT_RANGE: 78,
  EAT_COOLDOWN: 42,
  TUNNEL_COOLDOWN: 18,
  TUNNEL_RANGE: 90,
  FOG_COOLDOWN: 45,
  FOG_SECONDS: 20,
  REPORT_RANGE: 130,
  CHORE_RANGE: 70,
  CHORE_HOLD: 3.0,          // seconds for a hold-type chore
  CHORE_TAPS: 8,            // taps for a tap-type chore
  START_GRACE: 8,           // no eating for the first few seconds
};

export const VISION = {
  SHEEP: 330,
  WOLF: 420,                // the wolf sees further; that is its edge
  FOG: 165,
};

export const ROOM = { MIN_PLAYERS: 4, MAX_PLAYERS: 10, CODE_LENGTH: 4, EMPTY_TTL_MS: 60_000 };

export const NET = { BROADCAST_HZ: 20, INPUT_HZ: 30 };

// ---------------------------------------------------------------------------
// The farm. Everything walkable is a rectangle; the union of them is the map.
// Collision is "stay inside the union", which needs no wall geometry and cannot
// trap a player in a corner.
// ---------------------------------------------------------------------------

export const ROOMS = {
  PASTURE: { id: 'PASTURE', name: 'Pasture',  x: 120,  y: 120, w: 420, h: 300, color: 0x6aa84f },
  BARN:    { id: 'BARN',    name: 'Barn',     x: 700,  y: 80,  w: 400, h: 280, color: 0x9c4a3c },
  POND:    { id: 'POND',    name: 'Pond',     x: 1260, y: 120, w: 420, h: 300, color: 0x3f7fa6 },
  COOP:    { id: 'COOP',    name: 'Coop',     x: 120,  y: 760, w: 420, h: 300, color: 0xb08540 },
  YARD:    { id: 'YARD',    name: 'Yard',     x: 700,  y: 820, w: 400, h: 280, color: 0x7a6a52 },
  SHED:    { id: 'SHED',    name: 'Shed',     x: 1260, y: 760, w: 420, h: 300, color: 0x5c5f6b },
};

// Corridors give the map loops, which is what makes hiding and alibis work.
// Each corridor overlaps the rooms it joins, so there is no seam to snag on,
// and each is wide enough that walking into one does not need pixel alignment.
// Each corridor reaches 70px INTO both rooms it joins. That matters: walkable
// rectangles are deflated by the sheep radius, so an overlap smaller than two
// radii would leave an impassable gap exactly at the doorway.
export const CORRIDORS = [
  { x: 470,  y: 205, w: 300, h: 110 },  // pasture -> barn
  { x: 1030, y: 205, w: 300, h: 110 },  // barn    -> pond
  { x: 265,  y: 350, w: 110, h: 480 },  // pasture -> coop
  { x: 1405, y: 350, w: 110, h: 480 },  // pond    -> shed
  { x: 845,  y: 290, w: 110, h: 600 },  // barn    -> yard
  { x: 470,  y: 905, w: 300, h: 110 },  // coop    -> yard
  { x: 1030, y: 905, w: 300, h: 110 },  // yard    -> shed
];

export const WALKABLE = [...Object.values(ROOMS), ...CORRIDORS];

export const SPAWN = { x: 900, y: 220 };

// The emergency bell: one meeting per player, and you have to walk to it.
export const BELL = { x: 900, y: 130, r: 46 };

// Hay bales the wolf can dive into and pop out of somewhere else.
export const HAY = [
  { id: 'hay-pasture', x: 200, y: 380 },
  { id: 'hay-barn',    x: 1040, y: 320 },
  { id: 'hay-pond',    x: 1600, y: 380 },
  { id: 'hay-coop',    x: 200, y: 820 },
  { id: 'hay-yard',    x: 760, y: 880 },
  { id: 'hay-shed',    x: 1600, y: 820 },
];

// ---------------------------------------------------------------------------
// Chores
// ---------------------------------------------------------------------------

export const CHORE_KIND = { HOLD: 'hold', TAP: 'tap' };

export const CHORES = [
  { id: 'milk',   name: 'Milk the cow',    room: 'BARN',    kind: CHORE_KIND.HOLD, x: 800,  y: 300, emoji: '🐄' },
  { id: 'sweep',  name: 'Sweep the hay',   room: 'BARN',    kind: CHORE_KIND.TAP,  x: 1010, y: 150, emoji: '🧹' },
  { id: 'count',  name: 'Count the sheep', room: 'PASTURE', kind: CHORE_KIND.TAP,  x: 220,  y: 200, emoji: '🔢' },
  { id: 'fence',  name: 'Fix the fence',   room: 'PASTURE', kind: CHORE_KIND.HOLD, x: 450,  y: 360, emoji: '🔨' },
  { id: 'boot',   name: 'Fish out a boot', room: 'POND',    kind: CHORE_KIND.HOLD, x: 1370, y: 250, emoji: '🥾' },
  { id: 'ducks',  name: 'Count the ducks', room: 'POND',    kind: CHORE_KIND.TAP,  x: 1600, y: 180, emoji: '🦆' },
  { id: 'eggs',   name: 'Collect eggs',    room: 'COOP',    kind: CHORE_KIND.TAP,  x: 380,  y: 830, emoji: '🥚' },
  { id: 'feed',   name: 'Feed the hens',   room: 'COOP',    kind: CHORE_KIND.HOLD, x: 190,  y: 990, emoji: '🌾' },
  { id: 'fuel',   name: 'Fuel the tractor',room: 'SHED',    kind: CHORE_KIND.HOLD, x: 1370, y: 900, emoji: '⛽' },
  { id: 'tools',  name: 'Sort the tools',  room: 'SHED',    kind: CHORE_KIND.TAP,  x: 1610, y: 1000, emoji: '🔧' },
  { id: 'crows',  name: 'Scare the crows', room: 'YARD',    kind: CHORE_KIND.TAP,  x: 780,  y: 900, emoji: '🐦' },
  { id: 'wash',   name: 'Wash the trough', room: 'YARD',    kind: CHORE_KIND.HOLD, x: 1020, y: 1020, emoji: '🪣' },
];

// Six each: the travel between stations is the real clock, and four made a
// full game finish in under half a minute.
export const CHORES_PER_PLAYER = 5;

// ---------------------------------------------------------------------------
// Look and feel
// ---------------------------------------------------------------------------

export const WOOL_COLORS = [
  { id: 'cream',  hex: 0xfff6e5, name: 'Cream' },
  { id: 'pink',   hex: 0xffc2d4, name: 'Pink' },
  { id: 'mint',   hex: 0xbdf0d2, name: 'Mint' },
  { id: 'sky',    hex: 0xbcd9ff, name: 'Sky' },
  { id: 'lemon',  hex: 0xffe9a3, name: 'Lemon' },
  { id: 'lilac',  hex: 0xdcc6ff, name: 'Lilac' },
  { id: 'peach',  hex: 0xffd0b0, name: 'Peach' },
  { id: 'ash',    hex: 0xd8d8e0, name: 'Ash' },
  { id: 'moss',   hex: 0xcfe3a8, name: 'Moss' },
  { id: 'coal',   hex: 0xa9a3b5, name: 'Coal' },
];

// Hats are the whole personality budget. Keep them stupid.
export const HATS = [
  { id: 'none',    name: 'Bald' },
  { id: 'cap',     name: 'Cap' },
  { id: 'crown',   name: 'Crown' },
  { id: 'party',   name: 'Party hat' },
  { id: 'cowboy',  name: 'Cowboy' },
  { id: 'bucket',  name: 'Bucket' },
  { id: 'halo',    name: 'Halo' },
  { id: 'horns',   name: 'Horns' },
];

export const SHEEP_NAMES = [
  'Woolliam', 'Baabara', 'Lamb Chop', 'Sir Fluff', 'Mutton', 'Cloud',
  'Shear Khan', 'Nugget', 'Ewe Two', 'Merino', 'Dolly', 'Sheepthoven',
];

// Canned lines for the chat, so a phone player can talk with one thumb.
export const QUICK_CHAT = [
  'Where?', 'With me the whole time', 'I saw {n} near the body',
  '{n} did nothing all game', 'Skip', 'It is 100% {n}',
  'I was doing chores', 'Vote {n}', 'Not me!!',
];

// ---------------------------------------------------------------------------
// Socket protocol
// ---------------------------------------------------------------------------

export const EV = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_START: 'room:start',
  ROOM_CUSTOMIZE: 'room:customize',

  PLAYER_MOVE: 'player:move',
  PLAYER_ACTION: 'player:action',
  PLAYER_VOTE: 'player:vote',
  PLAYER_CHAT: 'player:chat',

  ROOM_STATE: 'room:state',
  ROOM_ERROR: 'room:error',
  GAME_START: 'game:start',
  GAME_STATE: 'game:state',
  GAME_EVENT: 'game:event',
  GAME_OVER: 'game:over',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  MEETING_CALLED: 'meeting:called',
  MEETING_CHAT: 'meeting:chat',
  MEETING_VOTE_UPDATE: 'meeting:voteUpdate',
  MEETING_RESULT: 'meeting:result',
};
