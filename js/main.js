// Composition root: creates the modules and wires them together. No business logic lives here.
import { Game } from './core/game.js';
import { FLAGS, SCALE, TAP_DEDUPE_MS } from './config.js';
import { createXRSession } from './xr/session.js';
import { createPlacement } from './xr/placement.js';
import { setupGestures } from './xr/gestures.js';
import { BoardManipulation } from './xr/manipulation.js';
import { BOARD_SIZE } from './view/board.js';
import { createBoardScene } from './view/board-scene.js';
import { MoveAnimator } from './view/animations.js';
import { createInteraction } from './view/interaction.js';
import { MoveHints } from './view/move-hints.js';
import { createHud } from './ui/hud.js';
import { createPromotionDialog } from './ui/promotion.js';
import { createGameDialog } from './ui/game-dialog.js';
import { createDebug, createBoardDebug } from './debug/debug.js';
import { createDebugHud } from './debug/debug-hud.js';

const $ = (id) => document.getElementById(id);
const el = {
  overlay: $('overlay'), touchpad: $('touchpad'), status: $('status'), hud: $('hud'),
  reset: $('reset'), resetTransform: $('btn-reset-transform'), mode: $('btn-mode'), resign: $('btn-resign'),
  debug: $('btn-debug'), anchor: $('btn-anchor'),
  zoomIn: $('btn-zoom-in'), zoomOut: $('btn-zoom-out'), promotion: $('promotion-dialog'),
  gameDialog: $('game-dialog'), gameTitle: $('game-title'), gameMessage: $('game-message'),
  gamePrimary: $('game-primary'), gameSecondary: $('game-secondary')
};

// ---- modules
const hud = createHud({ statusEl: el.status, hudEl: el.hud, btnDebug: el.debug, btnAnchor: el.anchor });
const app = createXRSession({ overlay: el.overlay, log: hud.log });
const requestedFen = FLAGS.debug || FLAGS.selectionDebug ? new URLSearchParams(location.search).get('fen') : null;
let game;
try {
  game = new Game(requestedFen === null ? undefined : requestedFen);
} catch (err) {
  game = new Game();
  hud.log(`invalid ?fen=: ${err.message}`);
}
const content = createBoardScene({ game });
const hints = new MoveHints({ root: content.boardRoot });
const animator = new MoveAnimator({ boardView: content.boardView });
const DRAW_LABELS = {
  'insufficient-material': 'insufficient material',
  'threefold-repetition': 'threefold repetition',
  'fifty-move-rule': 'the fifty-move rule'
};
const sideName = (side) => side[0].toUpperCase() + side.slice(1);
function statusText(status, san) {
  if (status.state === 'checkmate') return `Checkmate: ${sideName(status.winner)} wins.`;
  if (status.state === 'stalemate') return 'Stalemate: draw.';
  if (status.state === 'resigned') return `${sideName(status.loser)} resigned. ${sideName(status.winner)} wins.`;
  if (status.state === 'draw') return `Draw: ${DRAW_LABELS[status.reason] ?? 'draw'}.`;
  const move = san ? ` · ${san}` : '';
  return `${sideName(status.turn)} to move${status.state === 'check' ? ' - check' : ''}${move}.`;
}
function updateGameStatus(status, san) {
  hud.setCheck(status.state === 'check');
  hints.setCheckedKing(status.inCheck ? game.kingSquare(status.inCheck) : null);
  hud.setStatus(statusText(status, san));
}
const boardDebug = createBoardDebug();
content.boardRoot.add(boardDebug);
const dbg = createDebug(app.scene);
const controller = app.renderer.xr.getController(0);
app.scene.add(controller);
let interaction;
const promotionDialog = createPromotionDialog({
  element: el.promotion,
  onChoose: (piece) => interaction?.choosePromotion(piece)
});

const placement = createPlacement({
  app,
  boardRoot: content.boardRoot,
  boardSize: BOARD_SIZE,
  log: hud.log,
  hooks: {
    onReset() {
      el.reset.hidden = true;
      el.mode.hidden = true;
      el.resetTransform.hidden = true;
      el.resign.hidden = true;
      setEditMode(false);
      interaction?.clearSelection();
      hints.setCheckedKing(null);
      hud.setCheck(false);
      hud.setStatus('Scan a flat surface (move the phone slowly). Tap when the cyan grid sits where you want the board. Pinch to resize.');
    },
    onPlaced() {
      el.reset.hidden = false;
      el.mode.hidden = false;
      el.resign.hidden = false;
      updateGameStatus(game.status());
      if (game.status().over) gameDialog.showResult(game.status());
      hud.log('board placed');
    }
  }
});
const manipulation = new BoardManipulation({
  camera: app.camera,
  getXRCamera: () => app.renderer.xr.getCamera(app.camera),
  placement,
  boardRoot: content.boardRoot,
  setBoardScale: content.setBoardScale
});
const debugHud = createDebugHud({ app, placement, dbg, content, hud });
const gameDialog = createGameDialog({
  element: el.gameDialog,
  title: el.gameTitle,
  message: el.gameMessage,
  primary: el.gamePrimary,
  secondary: el.gameSecondary,
  onNewGame: startNewGame,
  onResign: resignGame
});
let debugOn = false;      // debug HUD + layers (see setDebug)
let editMode = false;
let attaching = false;    // debug hit-test fan is being created
let lastTapTime = -Infinity;
let pinchBase = 1;
let lastHudTs = 0;
interaction = createInteraction({
  camera: app.camera,
  getXRCamera: () => app.renderer.xr.getCamera(app.camera),
  controller,
  content,
  game,
  hints,
  animator,
  hud,
  onStatus: updateGameStatus,
  onGameOver: (status) => gameDialog.showResult(status),
  selectionDebug: FLAGS.selectionDebug,
  onPromotionRequired: (color) => promotionDialog.show(color)
});

// ---- state
let gestures;
function handleInput(kind, x, y) {
  const now = performance.now();
  if (now - lastTapTime < TAP_DEDUPE_MS || gestures.recentlyGestured()) return;
  lastTapTime = now;
  if (placement.state.phase === 'placing') {
    placement.requestPlace();
    return;
  }
  if (editMode) return;
  if (!animator.busy && !promotionDialog.open) interaction.pick(kind, x, y);
}

gestures = setupGestures(el.touchpad, {
  onTap: (x, y) => handleInput('dom', x, y),
  onDragStart: (x, y) => {
    if (editMode && !animator.busy && !promotionDialog.open && !gameDialog.open) manipulation.beginDrag(x, y);
  },
  onDrag: (x, y) => {
    if (editMode && !animator.busy && !promotionDialog.open && !gameDialog.open) manipulation.dragTo(x, y);
  },
  onPinchStart: () => {
    if (animator.busy || promotionDialog.open || gameDialog.open) return;
    manipulation.endDrag();
    if (editMode) manipulation.startTransform();
    else pinchBase = content.boardRoot.scale.x;
  },
  onTransform: ({ ratio, angleDelta }) => {
    if (animator.busy || promotionDialog.open || gameDialog.open) return;
    if (editMode) {
      manipulation.transform({ ratio, angleDelta });
    } else {
      content.setBoardScale(pinchBase * ratio);
    }
  },
  onPinchEnd: () => manipulation.endDrag()
});
controller.addEventListener('select', () => handleInput('xr'));

// ---- buttons
document.querySelectorAll('#controls button').forEach((b) =>
  b.addEventListener('beforexrselect', (e) => e.preventDefault()));

const zoom = (factor) => hud.flashStatus(`Board scale ×${content.setBoardScale(content.boardRoot.scale.x * factor).toFixed(2)}`);
el.zoomIn.addEventListener('click', () => zoom(SCALE.STEP));
el.zoomOut.addEventListener('click', () => zoom(1 / SCALE.STEP));
el.reset.addEventListener('click', () => placement.reset());
el.mode.addEventListener('click', () => setEditMode(!editMode));
el.resetTransform.addEventListener('click', () => {
  manipulation.resetTransform();
  hud.flashStatus('Board transform reset');
});
el.resign.addEventListener('click', () => {
  if (placement.state.phase === 'playing' && !game.status().over) gameDialog.showResign();
});
el.anchor.addEventListener('click', () => hud.setAnchorButton(placement.toggleAnchor()));
el.debug.addEventListener('click', () => setDebug(!debugOn));

// ---- debug on/off (off by default; ?debug=1 starts it on)
async function attachDebugSources() {
  if (attaching || dbg.ready || !app.hit.viewerSpace || !app.session) return;
  attaching = true;
  try {
    await dbg.attach(app.session, app.hit.viewerSpace);
    hud.log(`debug fan ready (${dbg.sourceCount} rays)`);
  } catch (err) {
    hud.log('debug attach failed: ' + err.message);
  } finally {
    attaching = false;
  }
}

function setDebug(on) {
  debugOn = on;
  interaction.setSelectionDebug(on || FLAGS.selectionDebug);
  hud.setDebugUi(on);
  hud.setAnchorButton(placement.state.useAnchor);
  dbg.setVisible(on);
  boardDebug.visible = on;
  if (on) {
    attachDebugSources();
  } else {
    dbg.detach();
    dbg.clear();
  }
}

function setEditMode(on) {
  editMode = Boolean(on && placement.state.phase === 'playing');
  manipulation.endDrag();
  interaction?.clearSelection();
  el.mode.textContent = editMode ? 'Play' : 'Edit';
  el.mode.setAttribute('aria-pressed', String(editMode));
  el.resetTransform.hidden = !editMode;
}

function startNewGame() {
  setEditMode(false);
  animator.cancel();
  promotionDialog.close();
  interaction.cancelPromotion();
  game.reset();
  content.boardView.syncFrom(game);
  hints.clear();
  interaction.clearSelection();
  updateGameStatus(game.status());
  el.resign.hidden = placement.state.phase !== 'playing';
  hud.log('new game');
}

function resignGame() {
  if (!game.resign()) return;
  const status = game.status();
  updateGameStatus(status);
  gameDialog.showResult(status);
}

// ---- frame hooks
app.onXRFrame((ts, frame, refSpace) => { if (debugOn && dbg.ready) dbg.update(frame, refSpace); });
app.onTick((ts) => { animator.update(ts); hints.update(ts); });
app.onAfterRender((ts) => {
  if (debugOn && ts - lastHudTs > 250) { lastHudTs = ts; debugHud.update(); }
});
app.onHitTestReady(() => { if (debugOn) attachDebugSources(); });

// ---- session lifecycle
app.onSessionStart(() => {
  document.body.classList.add('ar-active');
  placement.reset();
  hud.log('session started');
});
app.onSessionEnd(() => {
  document.body.classList.remove('ar-active');
  promotionDialog.close();
  gameDialog.close();
  interaction.cancelPromotion();
  interaction.clearSelection();
  dbg.detach();
  dbg.clear();
});

addEventListener('error', (e) => hud.log('ERR ' + e.message));
addEventListener('unhandledrejection', (e) => hud.log('PROMISE ' + (e.reason?.message || e.reason)));

setDebug(FLAGS.debug || FLAGS.selectionDebug);
