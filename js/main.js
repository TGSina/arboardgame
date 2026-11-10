// Composition root: creates the modules and wires them together. No business logic lives here.
import { Game } from './core/game.js';
import { FLAGS, SCALE, TAP_DEDUPE_MS } from './config.js';
import { createXRSession } from './xr/session.js';
import { createPlacement } from './xr/placement.js';
import { setupGestures } from './xr/gestures.js';
import { BOARD_SIZE } from './view/board.js';
import { createBoardScene } from './view/board-scene.js';
import { MoveAnimator } from './view/animations.js';
import { createInteraction } from './view/interaction.js';
import { MoveHints } from './view/move-hints.js';
import { createHud } from './ui/hud.js';
import { createPromotionDialog } from './ui/promotion.js';
import { createDebug, createBoardDebug } from './debug/debug.js';
import { createDebugHud } from './debug/debug-hud.js';

const $ = (id) => document.getElementById(id);
const el = {
  overlay: $('overlay'), touchpad: $('touchpad'), status: $('status'), hud: $('hud'),
  reset: $('reset'), debug: $('btn-debug'), anchor: $('btn-anchor'),
  zoomIn: $('btn-zoom-in'), zoomOut: $('btn-zoom-out'), promotion: $('promotion-dialog')
};

// ---- modules
const hud = createHud({ statusEl: el.status, hudEl: el.hud, btnDebug: el.debug, btnAnchor: el.anchor });
const app = createXRSession({ overlay: el.overlay, log: hud.log });
const requestedFen = new URLSearchParams(location.search).get('fen');
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
      interaction?.clearSelection();
      hud.setStatus('Scan a flat surface (move the phone slowly). Tap when the cyan grid sits where you want the board. Pinch to resize.');
    },
    onPlaced() {
      el.reset.hidden = false;
      hud.setStatus(`${game.turn()[0].toUpperCase() + game.turn().slice(1)} to move.`);
      hud.log('board placed');
    }
  }
});
const debugHud = createDebugHud({ app, placement, dbg, content, hud });
let debugOn = false;      // debug HUD + layers (see setDebug)
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
  if (!animator.busy && !promotionDialog.open) interaction.pick(kind, x, y);
}

gestures = setupGestures(el.touchpad, {
  onTap: (x, y) => handleInput('dom', x, y),
  onPinchStart: () => {
    if (animator.busy || promotionDialog.open) return;
    pinchBase = content.boardRoot.scale.x;
  },
  onPinch: (ratio) => {
    if (!animator.busy && !promotionDialog.open) {
      hud.flashStatus(`Board scale ×${content.setBoardScale(pinchBase * ratio).toFixed(2)}`);
    }
  }
});
controller.addEventListener('select', () => handleInput('xr'));

// ---- buttons
document.querySelectorAll('#controls button').forEach((b) =>
  b.addEventListener('beforexrselect', (e) => e.preventDefault()));

const zoom = (factor) => hud.flashStatus(`Board scale ×${content.setBoardScale(content.boardRoot.scale.x * factor).toFixed(2)}`);
el.zoomIn.addEventListener('click', () => zoom(SCALE.STEP));
el.zoomOut.addEventListener('click', () => zoom(1 / SCALE.STEP));
el.reset.addEventListener('click', () => placement.reset());
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

// ---- frame hooks
app.onXRFrame((ts, frame, refSpace) => { if (debugOn && dbg.ready) dbg.update(frame, refSpace); });
app.onTick((ts) => animator.update(ts));
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
  interaction.cancelPromotion();
  interaction.clearSelection();
  dbg.detach();
  dbg.clear();
});

addEventListener('error', (e) => hud.log('ERR ' + e.message));
addEventListener('unhandledrejection', (e) => hud.log('PROMISE ' + (e.reason?.message || e.reason)));

setDebug(FLAGS.debug || FLAGS.selectionDebug);
