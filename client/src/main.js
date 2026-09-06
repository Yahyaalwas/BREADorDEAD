import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import SoloScene from './scenes/SoloScene.js';
import MeetingScene from './scenes/MeetingScene.js';
import { net, NetDriver } from './net/Net.js';
import { Sfx } from './audio/Sfx.js';
import { ROOM, BREAD_COLORS } from '../../shared/constants.js';

const $ = (id) => document.getElementById(id);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#120d09',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    // The bread simulation is our own; Arcade is here for bodies and overlaps.
    arcade: { gravity: { y: 0 }, debug: false },
  },
  scene: [BootScene, MenuScene, GameScene, SoloScene, MeetingScene],
});

// ---------------------------------------------------------------------------
// Menu / lobby wiring
// ---------------------------------------------------------------------------

const NAME_KEY = 'bod:name';

// Safari private mode (and locked-down Android browsers) can throw on any
// storage access, so nothing on the critical path may assume it works.
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* not important enough to break play */ } },
};

// Touch players get the thumb-control legend instead of the key legend.
if ((navigator.maxTouchPoints || 0) > 0 || window.matchMedia('(pointer: coarse)').matches) {
  document.querySelector('#menu-home .help').hidden = true;
  $('touch-help').hidden = false;
}

const nameInput = $('name');
nameInput.value = storage.get(NAME_KEY) || '';
nameInput.addEventListener('change', () => storage.set(NAME_KEY, nameInput.value.trim()));

function playerName() {
  return (nameInput.value || '').trim().slice(0, 14) || 'Anon Loaf';
}

function showMenu(view = 'home') {
  $('menu').classList.add('on');
  $('menu-home').hidden = view !== 'home';
  $('menu-lobby').hidden = view !== 'lobby';
  $('gameover').classList.remove('on');
}

function hideMenu() {
  $('menu').classList.remove('on');
}

function menuError(msg) { $('menu-error').textContent = msg || ''; }
function lobbyError(msg) { $('lobby-error').textContent = msg || ''; }

function stopGameScenes() {
  for (const key of ['Game', 'Solo', 'Meeting']) {
    if (game.scene.isActive(key) || game.scene.isPaused(key)) game.scene.stop(key);
  }
}

function returnToMenu() {
  stopGameScenes();
  net.leaveRoom();
  if (!game.scene.isActive('Menu')) game.scene.start('Menu');
  showMenu('home');
}

// --- solo -------------------------------------------------------------------

/** Best-effort: iOS Safari refuses outside fullscreen, which is why it is guarded. */
function tryLockLandscape() {
  try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* unsupported */ }
}

/** Android's back gesture should leave the round, not the site. */
function guardBackButton() {
  try { history.pushState({ bod: 'game' }, ''); } catch { /* ignore */ }
}
window.addEventListener('popstate', () => {
  if (inGame()) returnToMenu();
});

$('btn-solo').onclick = () => {
  Sfx.unlock();
  tryLockLandscape();
  guardBackButton();
  hideMenu();
  game.scene.stop('Menu');
  game.scene.start('Solo', { name: playerName(), bots: 5 });
};

// --- multiplayer ------------------------------------------------------------

$('btn-create').onclick = async () => {
  Sfx.unlock();
  menuError('');
  const res = await net.createRoom(playerName());
  if (!res?.ok) return menuError(res?.error || 'Could not create a room.');
  showMenu('lobby');
};

$('btn-join').onclick = async () => {
  Sfx.unlock();
  menuError('');
  const code = ($('join-code').value || '').toUpperCase().trim();
  if (code.length !== ROOM.CODE_LENGTH) return menuError(`Room codes are ${ROOM.CODE_LENGTH} characters.`);
  const res = await net.joinRoom(playerName(), code);
  if (!res?.ok) return menuError(res?.error || 'Could not join that room.');
  showMenu('lobby');
};

$('btn-leave').onclick = () => returnToMenu();

$('btn-start').onclick = async () => {
  lobbyError('');
  const res = await net.startGame();
  if (!res?.ok) lobbyError(res?.error || 'Could not start.');
};

$('btn-again').onclick = () => returnToMenu();

$('btn-share').onclick = async () => {
  const title = $('win-title').textContent;
  const text = `${title} in Bread or Dead. ${$('win-reason').textContent}`.trim();
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Bread or Dead', text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    $('share-note').textContent = 'Copied. Go ruin a group chat.';
  } catch {
    // A cancelled share sheet is not a failure worth shouting about.
    $('share-note').textContent = '';
  }
};

net.on('lobby', (lobby) => {
  if (!lobby) return;
  $('lobby-code').textContent = lobby.code;
  $('lobby-players').innerHTML = lobby.players.map((p, i) => {
    const color = `#${BREAD_COLORS[i % BREAD_COLORS.length].toString(16).padStart(6, '0')}`;
    return `<div class="lobby-row">
      <span class="swatch" style="background:${color}"></span>
      <span>${escapeHtml(p.name)}</span>
      ${p.isHost ? '<span style="margin-left:auto;opacity:.6">host</span>' : ''}
    </div>`;
  }).join('');
  const me = lobby.players.find((p) => p.id === net.myId);
  const enough = lobby.players.length >= lobby.minPlayers;
  $('btn-start').disabled = !me?.isHost || !enough;
  $('lobby-hint').textContent = enough
    ? (me?.isHost ? 'Start when everyone is in the kitchen.' : 'Waiting for the host…')
    : `${lobby.players.length}/${lobby.minPlayers} slices — need ${lobby.minPlayers - lobby.players.length} more.`;
});

net.on('error', (e) => {
  const target = $('menu-lobby').hidden ? menuError : lobbyError;
  target(e?.error || 'Something went stale.');
});

net.on('start', (snapshot) => {
  tryLockLandscape();
  guardBackButton();
  hideMenu();
  stopGameScenes();
  game.scene.stop('Menu');
  const driver = new NetDriver(net.socket, snapshot);
  game.scene.start('Game', { driver });
});

net.on('disconnect', () => {
  if (game.scene.isActive('Game')) {
    stopGameScenes();
    game.scene.start('Menu');
    showMenu('home');
    menuError('Lost the connection to the kitchen.');
  }
});

// ---------------------------------------------------------------------------
// Mobile: orientation, and keeping Phaser's canvas honest about its own size
// ---------------------------------------------------------------------------

const isTouch = () => (navigator.maxTouchPoints || 0) > 0 ||
  window.matchMedia('(pointer: coarse)').matches;

function inGame() {
  return game.scene.isActive('Game') || game.scene.isActive('Solo');
}

function updateOrientation() {
  // Portrait phones can still read the menus; it is the kitchen that needs width.
  const portrait = window.innerHeight > window.innerWidth;
  $('rotate').classList.toggle('on', isTouch() && portrait && inGame());
}

function refreshScale() {
  // iOS Safari reports stale dimensions right after a rotate or a URL-bar
  // collapse, so re-measure a beat later as well as immediately.
  game.scale.refresh();
  updateOrientation();
  setTimeout(() => { game.scale.refresh(); updateOrientation(); }, 300);
}

window.addEventListener('orientationchange', refreshScale);
window.addEventListener('resize', updateOrientation);
window.visualViewport?.addEventListener('resize', refreshScale);
setInterval(updateOrientation, 1000);

// Two-finger pinch and double-tap zoom would fight the canvas on iOS.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// Safari blocks audio until a gesture, and a first attempt can still land while
// the context is suspended — so keep trying on every gesture until it runs.
for (const evt of ['pointerdown', 'touchend', 'keydown']) {
  window.addEventListener(evt, () => Sfx.unlock(), { passive: true });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
