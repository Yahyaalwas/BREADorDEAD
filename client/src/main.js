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
const nameInput = $('name');
nameInput.value = localStorage.getItem(NAME_KEY) || '';
nameInput.addEventListener('change', () => localStorage.setItem(NAME_KEY, nameInput.value.trim()));

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

$('btn-solo').onclick = () => {
  Sfx.unlock();
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

// Browsers will not make a sound until the user touches something.
window.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
window.addEventListener('keydown', () => Sfx.unlock(), { once: true });

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
