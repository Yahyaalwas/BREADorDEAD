import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import SoloScene from './scenes/SoloScene.js';
import MeetingScene from './scenes/MeetingScene.js';
import { net, NetDriver } from './net/Net.js';
import { Sfx } from './audio/Sfx.js';
import { ROOM, WOOL_COLORS, HATS, SHEEP_NAMES } from '../../shared/constants.js';

const $ = (id) => document.getElementById(id);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d1018',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  scene: [BootScene, MenuScene, GameScene, SoloScene, MeetingScene],
});

// ---------------------------------------------------------------------------
// Profile: name, wool colour, hat
// ---------------------------------------------------------------------------

// Safari private mode throws on storage, so nothing may depend on it working.
const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not worth breaking play */ } },
};

const isTouch = () => (navigator.maxTouchPoints || 0) > 0 ||
  window.matchMedia('(pointer: coarse)').matches;

const profile = {
  name: storage.get('sheeple:name') || '',
  colorIndex: Number(storage.get('sheeple:color') || 0) || 0,
  hatIndex: Number(storage.get('sheeple:hat') || 0) || 0,
};

const nameInput = $('name');
nameInput.value = profile.name;
nameInput.placeholder = SHEEP_NAMES[Math.floor(Math.random() * SHEEP_NAMES.length)];
nameInput.addEventListener('change', () => {
  profile.name = nameInput.value.trim();
  storage.set('sheeple:name', profile.name);
  net.customize(playerProfile());
});

function playerProfile() {
  return {
    name: (nameInput.value || '').trim().slice(0, 12) || nameInput.placeholder,
    colorIndex: profile.colorIndex,
    hatIndex: profile.hatIndex,
  };
}

function buildPickers() {
  const colors = $('colors');
  colors.innerHTML = '';
  WOOL_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = `swatch-btn ${i === profile.colorIndex ? 'on' : ''}`;
    b.style.background = `#${c.hex.toString(16).padStart(6, '0')}`;
    b.title = c.name;
    b.onclick = () => {
      profile.colorIndex = i;
      storage.set('sheeple:color', String(i));
      buildPickers();
      net.customize(playerProfile());
    };
    colors.appendChild(b);
  });

  const hats = $('hats');
  hats.innerHTML = '';
  HATS.forEach((h, i) => {
    const b = document.createElement('button');
    b.className = `hat-btn ${i === profile.hatIndex ? 'on' : ''}`;
    b.textContent = h.name;
    b.onclick = () => {
      profile.hatIndex = i;
      storage.set('sheeple:hat', String(i));
      buildPickers();
      net.customize(playerProfile());
    };
    hats.appendChild(b);
  });
}
buildPickers();

if (isTouch()) {
  $('help-keys').hidden = true;
  $('help-touch').hidden = false;
}

// ---------------------------------------------------------------------------
// Menu flow
// ---------------------------------------------------------------------------

function showMenu(view = 'home') {
  $('menu').classList.add('on');
  $('menu-home').hidden = view !== 'home';
  $('menu-lobby').hidden = view !== 'lobby';
  $('gameover').classList.remove('on');
}
function hideMenu() { $('menu').classList.remove('on'); }
const menuError = (m) => { $('menu-error').textContent = m || ''; };
const lobbyError = (m) => { $('lobby-error').textContent = m || ''; };

function stopGameScenes() {
  for (const key of ['Game', 'Solo', 'Meeting']) {
    if (game.scene.isActive(key) || game.scene.isPaused(key)) game.scene.stop(key);
  }
}

function inGame() {
  return game.scene.isActive('Game') || game.scene.isActive('Solo');
}

function returnToMenu() {
  stopGameScenes();
  net.leaveRoom();
  if (!game.scene.isActive('Menu')) game.scene.start('Menu');
  showMenu('home');
}

function tryLockLandscape() {
  // iOS Safari refuses outside fullscreen, hence the rotate prompt as fallback.
  try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* unsupported */ }
}
function guardBackButton() {
  try { history.pushState({ sheeple: 'game' }, ''); } catch { /* ignore */ }
}
window.addEventListener('popstate', () => { if (inGame()) returnToMenu(); });

$('btn-solo').onclick = () => {
  Sfx.unlock(); tryLockLandscape(); guardBackButton();
  hideMenu();
  game.scene.stop('Menu');
  game.scene.start('Solo', { ...playerProfile(), bots: 6 });
};

$('btn-create').onclick = async () => {
  Sfx.unlock(); menuError('');
  const res = await net.createRoom(playerProfile());
  if (!res?.ok) return menuError(res?.error || 'Could not create a room.');
  showMenu('lobby');
};

$('btn-join').onclick = async () => {
  Sfx.unlock(); menuError('');
  const code = ($('join-code').value || '').toUpperCase().trim();
  if (code.length !== ROOM.CODE_LENGTH) return menuError(`Room codes are ${ROOM.CODE_LENGTH} letters.`);
  const res = await net.joinRoom(playerProfile(), code);
  if (!res?.ok) return menuError(res?.error || 'Could not join that room.');
  showMenu('lobby');
};

$('btn-leave').onclick = () => returnToMenu();
$('btn-again').onclick = () => returnToMenu();

$('btn-start').onclick = async () => {
  lobbyError('');
  const res = await net.startGame();
  if (!res?.ok) lobbyError(res?.error || 'Could not start.');
};

$('btn-share').onclick = async () => {
  const text = `${$('win-title').textContent} in Sheeple. ${$('win-reason').textContent}`.trim();
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) { await navigator.share({ title: 'Sheeple', text, url }); return; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    $('share-note').textContent = 'Copied. Go ruin a group chat.';
  } catch {
    $('share-note').textContent = '';   // a cancelled share sheet is not an error
  }
};

net.on('lobby', (lobby) => {
  if (!lobby) return;
  $('lobby-code').textContent = lobby.code;
  $('lobby-players').innerHTML = lobby.players.map((p) => {
    const c = WOOL_COLORS[(p.colorIndex ?? 0) % WOOL_COLORS.length];
    const hat = HATS[(p.hatIndex ?? 0) % HATS.length];
    return `<div class="lobby-row">
      <span class="swatch" style="background:#${c.hex.toString(16).padStart(6, '0')}"></span>
      <span>${escapeHtml(p.name)}</span>
      <span class="muted">${hat.name}</span>
      ${p.isHost ? '<span style="margin-left:auto;opacity:.6">host</span>' : ''}
    </div>`;
  }).join('');
  const me = lobby.players.find((p) => p.id === net.myId);
  const enough = lobby.players.length >= lobby.minPlayers;
  $('btn-start').disabled = !me?.isHost || !enough;
  $('lobby-hint').textContent = enough
    ? (me?.isHost ? 'Start when everyone is in.' : 'Waiting for the host…')
    : `${lobby.players.length}/${lobby.minPlayers} sheep — need ${lobby.minPlayers - lobby.players.length} more.`;
});

net.on('error', (e) => {
  ($('menu-lobby').hidden ? menuError : lobbyError)(e?.error || 'Something went wrong.');
});

net.on('start', (snapshot) => {
  tryLockLandscape(); guardBackButton();
  hideMenu();
  stopGameScenes();
  game.scene.stop('Menu');
  game.scene.start('Game', { driver: new NetDriver(net.socket, snapshot) });
});

net.on('disconnect', () => {
  if (game.scene.isActive('Game')) {
    stopGameScenes();
    game.scene.start('Menu');
    showMenu('home');
    menuError('Lost the connection to the farm.');
  }
});

// ---------------------------------------------------------------------------
// Mobile plumbing
// ---------------------------------------------------------------------------

function updateOrientation() {
  const portrait = window.innerHeight > window.innerWidth;
  $('rotate').classList.toggle('on', isTouch() && portrait && inGame());
}

function refreshScale() {
  // iOS reports stale dimensions right after a rotate or a URL-bar collapse.
  game.scale.refresh();
  updateOrientation();
  setTimeout(() => { game.scale.refresh(); updateOrientation(); }, 300);
}

window.addEventListener('orientationchange', refreshScale);
window.addEventListener('resize', updateOrientation);
window.visualViewport?.addEventListener('resize', refreshScale);
setInterval(updateOrientation, 1000);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// Safari blocks audio until a gesture, and the first attempt can land while the
// context is still suspended — so retry on every gesture until it runs.
for (const evt of ['pointerdown', 'touchend', 'keydown']) {
  window.addEventListener(evt, () => Sfx.unlock(), { passive: true });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
