// Shared game configuration. Imported by both the Vite client and the Node server,
// so it must stay dependency-free ESM.

export const WORLD = {
  WIDTH: 1600,
  HEIGHT: 1000,
  // Bread is a slice: wider than tall, rounded.
  BREAD_W: 54,
  BREAD_H: 60,
  BREAD_RADIUS: 27,
};

// The bread simulation. Bread does not walk: input applies torque, the slice
// tilts, and the tilt is what drags it across the counter.
export const PHYS = {
  TICK_HZ: 30,             // server simulation rate
  DT: 1 / 30,
  TORQUE: 900,             // deg/s^2 applied by left/right
  ANG_DAMP: 0.90,          // angular velocity decay per tick
  ANG_MAX: 700,            // deg/s
  THRUST: 1150,            // px/s^2 along the slice's facing
  LIN_DAMP: 0.88,          // velocity decay per tick on a dry counter
  MAX_SPEED: 320,
  // Lean is how far the slice has flopped onto its side. It wobbles freely and
  // is kicked by turning, hopping and collisions.
  LEAN_SPRING: 18,        // pulls lean back toward upright
  LEAN_DAMP: 0.965,
  LEAN_FROM_TURN: 1.6,     // spin past SPIN_TIP and the slice tips over
  SPIN_TIP: 250,           // deg/s of spin a slice can carry before it starts to topple
  LEAN_MAX: 90,
  FLAT_ANGLE: 45,          // |lean| beyond this and the slice is flat on the counter
  FLAT_FRICTION: 0.80,     // extra damping while flat
  FLAT_THRUST: 0.25,       // thrust multiplier while flat
  // Hop
  HOP_IMPULSE: 340,
  HOP_COOLDOWN: 0.45,
  GRAVITY_Z: 1250,
  HOP_LEAN_KICK: 120,      // random lean kick on takeoff
  HOP_SPIN_KICK: 260,      // random angular kick on takeoff
  LAND_LEAN_KICK: 45,
  // Carrying a crumb is heavy
  CARRY_SPEED_MULT: 0.62,
  CARRY_LEAN_BIAS: 12,
};

export const SURFACE = {
  NORMAL:  { drag: PHYS.LIN_DAMP, speed: 1.0 },
  BUTTER:  { drag: 0.995,         speed: 1.35 },  // slippery: almost no drag
  WATER:   { drag: 0.80,          speed: 0.50 },  // soggy
  MOLD:    { drag: 0.86,          speed: 0.80 },  // green crumbs
};

export const ROLE = { FRESH: 'fresh', MOLDY: 'moldy' };

export const GAME_STATE = {
  LOBBY: 'lobby',
  PLAYING: 'playing',
  MEETING: 'meeting',
  ENDED: 'ended',
};

export const TIMING = {
  ROUND_SECONDS: 60,
  MEETING_SECONDS: 60,
  VOTE_REVEAL_SECONDS: 6,
  MAX_ROUNDS: 5,
  KILL_HOLD_SECONDS: 2,
  KILL_RANGE: 50,
  TOAST_PERFECT: 3.0,
  TOAST_WINDOW: 0.45,      // +/- tolerance around a perfect toast
  TOAST_BURN: 6.0,
  STACK_SECONDS: 5,
  STACK_RADIUS: 96,
  STACK_COUNT: 3,
  COO_SECONDS: 2,
  KNIFE_STUN_SECONDS: 10,
};

export const ROOM = {
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 8,
  CODE_LENGTH: 4,
  EMPTY_TTL_MS: 60_000,
};

export const NET = {
  BROADCAST_HZ: 20,
  INPUT_HZ: 30,
  INTERP_MS: 100,
};

// ---------------------------------------------------------------------------
// Kitchen map
// ---------------------------------------------------------------------------

// Rectangles are {x, y, w, h} with x/y being the top-left corner.
export const ZONES = {
  TOASTER:   { id: 'TOASTER',   x: 1120, y: 120, w: 240, h: 200, color: 0x8a8f98, label: 'TOASTER' },
  BUTTER:    { id: 'BUTTER',    x: 220,  y: 660, w: 220, h: 170, color: 0xf5d76e, label: 'BUTTER' },
  SINK:      { id: 'SINK',      x: 1140, y: 690, w: 340, h: 240, color: 0x4aa3df, label: 'SINK' },
  BREADBOX:  { id: 'BREADBOX',  x: 150,  y: 130, w: 300, h: 210, color: 0xb07d4a, label: 'BREAD BOX' },
  ANT_TRAIL: { id: 'ANT_TRAIL', x: 660,  y: 470, w: 560, h: 80,  color: 0x5a4632, label: 'ANT TRAIL' },
  BOARD:     { id: 'BOARD',     x: 560,  y: 760, w: 420, h: 200, color: 0xc99a5b, label: 'CUTTING BOARD' },
};

// Solid props the bread bumps into.
export const OBSTACLES = [
  { id: 'jar',    x: 780,  y: 180, w: 110, h: 110 },
  { id: 'kettle', x: 380,  y: 430, w: 140, h: 120 },
];

// Where loose crumbs spawn.
export const CRUMB_SPAWNS = [
  { x: 620,  y: 260 },
  { x: 1000, y: 640 },
  { x: 300,  y: 880 },
  { x: 1360, y: 430 },
  { x: 860,  y: 900 },
];

// Ants walk this loop; bread can hitch a ride.
export const ANT_PATH = [
  { x: 700,  y: 510 },
  { x: 1160, y: 510 },
  { x: 1160, y: 620 },
  { x: 700,  y: 620 },
];

export const ANT_SPEED = 90;
export const ANT_RIDE_SPEED = 240;

export const KNIFE = {
  // The butter knife patrols the cutting board.
  A: { x: 590, y: 800 },
  B: { x: 950, y: 920 },
  SPEED: 210,
  RADIUS: 46,
};

export const SPAWN_POINTS = [
  { x: 700, y: 320 }, { x: 780, y: 380 }, { x: 860, y: 320 }, { x: 940, y: 380 },
  { x: 700, y: 700 }, { x: 780, y: 640 }, { x: 860, y: 700 }, { x: 940, y: 640 },
];

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const TASK = {
  PERFECT_TOAST: 'PERFECT_TOAST',
  CRUMB_DELIVERY: 'CRUMB_DELIVERY',
  BREAD_STACK: 'BREAD_STACK',
  COO: 'COO',
  KNIFE_DASH: 'KNIFE_DASH',
};

export const TASK_DEFS = {
  [TASK.PERFECT_TOAST]: {
    id: TASK.PERFECT_TOAST,
    name: 'Perfect Toast',
    hint: 'Sit in the toaster for exactly 3 seconds. Six seconds is a funeral.',
    zone: 'TOASTER',
  },
  [TASK.CRUMB_DELIVERY]: {
    id: TASK.CRUMB_DELIVERY,
    name: 'Crumbs to Ants',
    hint: 'Grab a crumb (E) and drag it to the ant trail.',
    zone: 'ANT_TRAIL',
  },
  [TASK.BREAD_STACK]: {
    id: TASK.BREAD_STACK,
    name: 'Bread Stack',
    hint: 'Pile up with 2 other slices for 5 seconds.',
    zone: null,
  },
  [TASK.COO]: {
    id: TASK.COO,
    name: 'Coo',
    hint: 'Hold C for 2 seconds in the bread box. Inflate. Pop.',
    zone: 'BREADBOX',
  },
  [TASK.KNIFE_DASH]: {
    id: TASK.KNIFE_DASH,
    name: 'Avoid the Knife',
    hint: 'Cross the cutting board twice without getting spread.',
    zone: 'BOARD',
  },
};

export const TASKS_PER_PLAYER = 4;

// ---------------------------------------------------------------------------
// Moldy abilities
// ---------------------------------------------------------------------------

export const SABOTAGE = {
  GREEN_CRUMBS: 'GREEN_CRUMBS',
  SPORE_BURST: 'SPORE_BURST',
  TOASTER: 'TOASTER',
  FRAME: 'FRAME',
  KILL: 'KILL',
};

export const SABOTAGE_DEFS = {
  [SABOTAGE.GREEN_CRUMBS]: {
    id: SABOTAGE.GREEN_CRUMBS, name: 'Green Crumbs', key: '1',
    cooldown: 0, passive: true, duration: 10,
    desc: 'Passive mold trail. Fresh bread that steps in it slows down.',
  },
  [SABOTAGE.SPORE_BURST]: {
    id: SABOTAGE.SPORE_BURST, name: 'Spore Burst', key: '2',
    cooldown: 30, radius: 220, duration: 5,
    desc: 'Cloud of spores. Controls inverted for anyone caught in it.',
  },
  [SABOTAGE.TOASTER]: {
    id: SABOTAGE.TOASTER, name: 'Crank the Toaster', key: '3',
    cooldown: 45, evacuate: 10,
    desc: 'Everyone has 10 seconds to leave the toaster or burn.',
  },
  [SABOTAGE.FRAME]: {
    id: SABOTAGE.FRAME, name: 'Frame', key: '4',
    cooldown: 20, range: 90, duration: 30,
    desc: 'Rub mold on a nearby slice. They look guilty for 30 seconds.',
  },
  [SABOTAGE.KILL]: {
    id: SABOTAGE.KILL, name: 'Kill', key: '5',
    cooldown: 35, range: TIMING.KILL_RANGE, hold: TIMING.KILL_HOLD_SECONDS,
    desc: 'Stay within 50px of a slice for 2 seconds. They become a crisp.',
  },
};

export const MOLD_TRAIL = {
  DROP_INTERVAL: 0.35,
  LIFETIME: 10,
  RADIUS: 34,
  SLOW: 0.8,
};

// ---------------------------------------------------------------------------
// Socket protocol
// ---------------------------------------------------------------------------

export const EV = {
  // client -> server
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_START: 'room:start',
  PLAYER_MOVE: 'player:move',
  PLAYER_TASK: 'player:task',
  PLAYER_SABOTAGE: 'player:sabotage',
  PLAYER_MEETING: 'player:meeting',
  PLAYER_VOTE: 'player:vote',
  PLAYER_CHAT: 'player:chat',

  // server -> client
  ROOM_STATE: 'room:state',
  ROOM_ERROR: 'room:error',
  GAME_START: 'game:start',
  GAME_STATE: 'game:state',
  GAME_EVENT: 'game:event',
  GAME_OVER: 'game:over',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  PLAYER_DIED: 'player:died',
  MEETING_CALLED: 'meeting:called',
  MEETING_VOTE_UPDATE: 'meeting:voteUpdate',
  MEETING_CHAT: 'meeting:chat',
  MEETING_RESULT: 'meeting:result',
};

export const BREAD_COLORS = [
  0xfff3d6, 0xffd9a0, 0xf7c59f, 0xe8b98a,
  0xffe8b0, 0xf2d0b0, 0xffdfc4, 0xead2ac,
];

export const BREAD_NAMES = [
  'Sourdough', 'Rye', 'Brioche', 'Focaccia',
  'Baguette', 'Ciabatta', 'Pumpernickel', 'Challah',
];
