# 🐑 Sheeple

A farm full of sheep. One of them is a wolf in a wool coat.

Do your chores, watch everybody else, and when somebody turns up eaten, argue
about it in the chat until you vote the wrong sheep over the fence.

Plays in a browser, on a phone, with friends or against bots.

## Play

```bash
npm install
npm run dev          # client on :5173, game server on :3000
```

Open http://localhost:5173. **Play vs AI** needs no server at all — the same
simulation runs in the tab against six bots, one of which is quietly the wolf.

For multiplayer, one player hits **Create room** and reads out the 4-letter code;
everyone else types it into **Join**. Four sheep minimum, ten maximum.

## Testing it on your phone

The phone and the computer running the game must be on the same Wi-Fi.
`npm run dev` prints a **Network** line — `http://192.168.x.x:5173/` — open that
on the phone. Both servers listen on every interface, so nothing else needs
configuring. For cellular, or to hand someone a link:

```bash
npx cloudflared tunnel --url http://localhost:3000     # prints an https URL
```

`navigator.share` and the clipboard need a secure context, so on plain LAN HTTP
the share button quietly does nothing; everything else works.

## Controls

| | Desktop | Phone |
| --- | --- | --- |
| Move | `W` `A` `S` `D` or arrows | thumb stick, left half of the screen |
| Do the thing you're standing on | `E` (hold for hold-chores) | the big round button |
| Eat someone (wolf) | `SPACE` | EAT |
| Hay tunnel (wolf) | `Q` | HAY |
| Fog (wolf) | `F` | FOG |

One button covers everything contextual: it becomes **REPORT** over a body,
**BELL** at the emergency bell, and the chore name when you're on a station.

## The farm

Six rooms joined by corridors — Pasture, Barn, Pond, Coop, Yard, Shed. You can
only see a short way around yourself, so most of what you "know" is really what
somebody told you in the last meeting.

- **Chores** are twelve fixed stations; you get five at random. Some you hold,
  some you tap. Finish every sheep's list and the sheep win.
- **Hay bales** are wolf-only tunnels between rooms.
- **The bell** in the barn calls a meeting — once per player, per game.

## The wolf

| Power | What it does | Cooldown |
| --- | --- | --- |
| Eat | Within 78px, one sheep becomes remains | 42s |
| Hay tunnel | Dive into a bale, pop out of another | 18s |
| Fog | Everybody's view closes in for 20s | 45s |

The wolf leaves no trail and moves barely faster than a sheep. Its real problem
is that sheep remember who they last saw you standing next to.

## Meetings

Somebody finds a body or rings the bell, everyone freezes and lands in the chat.
75 seconds to accuse each other, then vote or skip. Quick-chat buttons mean a
phone player can accuse someone with one thumb. The ejected sheep's role is
revealed on the way over the fence.

Sheep win by finishing every chore or ejecting the wolf. The wolf wins when
there are as many wolves as sheep left.

## How it fits together

```
shared/         constants.js · movement.js · GameSim.js   ← one rulebook
server/src/     index.js · GameRoom.js · GameLoop.js · Player.js
client/src/     scenes/ · entities/ · mechanics/ · ui/ · net/ · audio/
```

`shared/GameSim.js` is the whole game as a headless, deterministic engine. The
server runs one per room at 30 Hz and broadcasts snapshots at 20 Hz; solo mode
runs the identical engine in the browser with `AISheep` brains supplying input.
No rule is implemented twice.

Every snapshot is filtered per viewer, so a client is never sent a role it has
not earned — only the wolf, the dead, and the end screen see them.

The map is a set of overlapping rectangles. Walkability is "the whole sheep fits
inside the union", and pathfinding is a graph over those rectangles, so there is
no grid, no tuning, and no way to get wedged in a corner.

No image or audio files: sprites come from Phaser's Graphics API at boot and
every sound is synthesised with Web Audio. No database — rooms live in memory
and are swept a minute after the last sheep leaves.

## Mobile notes

44pt minimum tap targets, safe-area padding for the notch and home indicator,
16px chat input (anything smaller makes iOS zoom the page), and a chat bar that
tracks `visualViewport` so the keyboard pushes it up instead of burying it.
Audio unlocks on the first gesture and keeps retrying until the `AudioContext`
actually runs; `localStorage` is wrapped, because Safari private mode throws.

Game time comes from the wall clock, so a phone dropping to 20fps still plays a
75-second meeting in 75 seconds.

Tested on emulated iPhone SE / 14 and Pixel 7 (Chromium device emulation). That
is not WebKit — a real iPhone is still the only way to confirm Safari-specific
behaviour.

## Deploying

The server serves the built client, so the whole game is one process:

```bash
npm install && npm run build && npm start      # honours $PORT
```

**Render** — `render.yaml` is a blueprint: point Render at the repo and hit
Apply. WebSockets work on the free plan; a free instance sleeps after 15 minutes
idle, and because rooms live in memory a sleep ends any game in progress.

**Fly.io** — `fly launch --copy-config --no-deploy && fly deploy`. `fly.toml`
pins `bom` (Mumbai) as the closest region to the Gulf and keeps one machine up.

**Not Vercel** — Socket.io needs a long-lived process, so a Vercel deploy gives
you solo mode only.
