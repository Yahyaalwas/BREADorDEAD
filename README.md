# 🍞 Bread or Dead

A physics-based social deduction game. You are a slice of bread on a kitchen
counter. So is everybody else. One of you is mouldering.

Bread does not walk. Left/right apply **torque**; the slice tilts, wobbles, and
that tilt is what drags it across the counter. Spin too hard and you flop onto
your face, where you are slow, useless and very obvious.

## Play

```bash
npm install
npm run dev          # Vite client on :5173, game server on :3000
```

Open http://localhost:5173. **Solo vs. AI** needs no server at all — the same
simulation runs in the tab against five bots, one of which is secretly moldy.

For a production-shaped run (one process serving everything):

```bash
npm run preview      # builds the client, then serves it from Express on :3000
```

## Phones

Playable on a touch screen with no keyboard. Hold either **side of the screen**
to tilt that way and keep flopping forward — torque alone would only spin you on
the spot, so a steering zone supplies the thrust too. Hold **both sides** and the
torques cancel: that is how you run in a straight line. **HOP** is bottom-centre,
**GRAB** and **COO** sit under your right thumb, tasks live behind the **☰**
drawer, and the Moldy Slice's five abilities are behind one **⚡** button.

Landscape is the intended orientation; portrait shows a rotate prompt during play
but the menus and lobby work either way.

## Controls

| Key | Action |
| --- | --- |
| `W` / `S` | flop forward / back along your facing |
| `A` / `D` | apply torque — this is how you turn, and how you fall over |
| `SPACE` | hop (random spin on takeoff; the butter dish launches you) |
| `E` | grab or drop a crumb / report a body |
| `C` | coo (hold) |
| `Q` | SCREAM — call an emergency meeting, once per game |
| `1`–`5` | moldy abilities |

On touch: left/right screen zone = torque + forward, both zones = straight,
HOP / GRAB / COO buttons, ☰ tasks, ⚡ abilities.

## The kitchen

| Zone | What it does |
| --- | --- |
| **Toaster** | Stand in it 3s for Perfect Toast. 6s and you are dead. |
| **Butter dish** | Almost no friction, and it launches a hopping slice. |
| **Sink** | Soggy: half speed, and you leave a wet trail. |
| **Bread box** | Where you coo. |
| **Ant trail** | Hop onto a passing ant for a fast ride; crumbs get delivered here. |
| **Cutting board** | The butter knife patrols. Getting hit is a 10-second spread. |

## Tasks (fresh bread)

Perfect Toast · Crumbs to Ants · Bread Stack (3 slices piled for 5s) · Coo ·
Avoid the Knife. Finish every task and fresh bread wins.

## Abilities (the Moldy Slice)

| Ability | Effect | Cooldown |
| --- | --- | --- |
| Green Crumbs | Passive mold trail, 10s, slows fresh bread — and gives you away | passive |
| Spore Burst | Controls inverted for 5s inside the cloud | 30s |
| Crank the Toaster | Everyone has 10s to leave the toaster or burn | 45s |
| Frame | Rub mold on a nearby slice; they look guilty for 30s | 20s |
| Kill | Stay within 50px of a slice for 2s | 35s |

Rounds last 60 seconds and end in a meeting. Five rounds without finishing the
tasks and the mold wins.

## How it fits together

```
shared/         constants.js · physics.js · GameSim.js   ← one rulebook
server/src/     index.js · GameRoom.js · GameLoop.js · Player.js
client/src/     scenes/ · entities/ · mechanics/ · ui/ · net/ · audio/
```

`shared/GameSim.js` is the whole game as a headless, deterministic engine. The
server runs one per room at 30 Hz and broadcasts snapshots at 20 Hz; solo mode
runs the identical engine in the browser with `AIBread` brains supplying input.
Nothing about the rules is written twice.

`shared/physics.js` is the bread stepper, shared three ways: the server uses it
authoritatively, the client re-runs it for local prediction (then eases toward
the server's answer), and the AI drives it the same way a player would.

Every snapshot is filtered per viewer, so roles never reach a client that has
not earned them — only the moldy slice, the dead, and the end screen see them.

No image or audio files: sprites come from Phaser's Graphics API at boot, and
sounds are synthesised with the Web Audio API. No database either — rooms live
in memory and are swept a minute after the last slice leaves.

## Mobile notes

Everything is sized for a thumb: 44pt minimum tap targets, safe-area padding for
the notch and home indicator, and 16px chat input (anything smaller makes iOS
zoom the page). The chat bar is fixed and tracks `visualViewport`, so the
software keyboard pushes it up instead of burying it. Audio unlocks on the first
gesture and keeps retrying until the `AudioContext` is actually running, and
`localStorage` is wrapped — Safari private mode throws on it.

The canvas renders at CSS resolution rather than 2–3x device pixels, which is
what keeps frame rates sane on phones. Game time comes from the wall clock, so a
device that drops to 20fps still runs 60-second rounds in 60 seconds.

**Tested** on emulated iPhone SE / 14 / 15 Pro Max and Pixel 7 (Chromium device
emulation): layout, tap targets, multi-touch, drawer, meeting and voting all
pass. That is not the same as WebKit — a real iPhone or the iOS Simulator is
still the only way to confirm Safari-specific behaviour.

## Deploying

Any Node host works, because the server also serves the built client:

```bash
npm install && npm run build && npm start      # honours $PORT
```

Split hosting works too — deploy `client/dist` as a static site and set
`VITE_SERVER_URL` at build time to point at the Node server.
