import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../js/core/game.js';
import { BoardView } from '../js/view/board-view.js';
import { MoveAnimator } from '../js/view/animations.js';
import { MoveHints } from '../js/view/move-hints.js';
import { createInteraction } from '../js/view/interaction.js';
import { SURFACE_Y } from '../js/view/board.js';

function snapshots(view, ids) {
  return new Map(ids.map((id) => {
    const piece = view.getPieceInstance(id);
    return [id, { type: piece.type, color: piece.color, x: piece.position.x, y: piece.position.y, z: piece.position.z }];
  }));
}

function positionOf(view, id) {
  const piece = view.getPieceInstance(id);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  piece.batch.surface.getMatrixAt(piece.instanceId, matrix);
  matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
  return position;
}

test('move hints pool empty, capture, selected, and last-move overlays', () => {
  const root = new THREE.Group();
  const hints = new MoveHints({ root });
  hints.setTargets([
    { col: 4, row: 5, capture: false },
    { col: 3, row: 5, capture: true }
  ]);
  hints.setLastMove({ from: 'e2', to: 'e4' });
  hints.setSelected('e7');

  assert.equal(hints.emptyTargets.count, 1);
  assert.equal(hints.captureTargets.count, 1);
  assert.equal(hints.focus.count, 3);
  hints.clear();
  assert.equal(hints.emptyTargets.count, 0);
  assert.equal(hints.captureTargets.count, 0);
  assert.equal(hints.focus.count, 0);
});

test('knight slide uses an arc and settles exactly on its legal destination', () => {
  const game = new Game();
  const view = new BoardView(game);
  const ids = ['white-n-g1'];
  const before = snapshots(view, ids);
  const result = game.tryMove('g1', 'f3');
  assert.ok(result.ok);
  view.syncFrom(game);
  const animator = new MoveAnimator({ boardView: view, duration: 100 });
  animator.start(result.move, before);
  animator.update(0);
  animator.update(50);
  assert.ok(positionOf(view, 'white-n-g1').y > SURFACE_Y);
  animator.update(100);
  assert.equal(animator.busy, false);
  const end = positionOf(view, 'white-n-g1');
  assert.ok(Math.abs(end.x - 0.075) < 1e-6);
  assert.ok(Math.abs(end.z - 0.075) < 1e-6);
  assert.ok(Math.abs(end.y - SURFACE_Y) < 1e-6);
});

test('castling animates king and rook; captures fade a temporary piece', () => {
  const castleGame = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const castleView = new BoardView(castleGame);
  const beforeCastle = snapshots(castleView, ['white-k-e1', 'white-r-h1']);
  const castle = castleGame.tryMove('e1', 'g1');
  assert.ok(castle.ok);
  castleView.syncFrom(castleGame);
  const castleAnimator = new MoveAnimator({ boardView: castleView, duration: 100 });
  castleAnimator.start(castle.move, beforeCastle);
  assert.equal(castleAnimator.actions.length, 2);
  castleAnimator.update(0);
  castleAnimator.update(100);
  assert.ok(Math.abs(positionOf(castleView, 'white-k-e1').x - 0.125) < 1e-6);
  assert.ok(Math.abs(positionOf(castleView, 'white-r-h1').x - 0.075) < 1e-6);

  const captureGame = new Game();
  captureGame.tryMove('e2', 'e4');
  captureGame.tryMove('d7', 'd5');
  const captureView = new BoardView(captureGame);
  const beforeCapture = snapshots(captureView, ['white-p-e2', 'black-p-d7']);
  const capture = captureGame.tryMove('e4', 'd5');
  assert.ok(capture.ok);
  captureView.syncFrom(captureGame);
  const captureAnimator = new MoveAnimator({ boardView: captureView, duration: 100 });
  captureAnimator.start(capture.move, beforeCapture);
  assert.equal(captureView.captureGhost.visible, true);
  captureAnimator.update(0);
  captureAnimator.update(100);
  assert.equal(captureView.captureGhost.visible, false);
});

function makeInteraction(game, onPromotionRequired = () => {}) {
  const boardRoot = new THREE.Group();
  const boardView = new BoardView(game);
  boardRoot.add(boardView.root);
  const hints = new MoveHints({ root: boardRoot });
  const animator = new MoveAnimator({ boardView, duration: 10 });
  const feedback = [];
  const hud = { flashStatus: (text) => feedback.push(text), setStatus: (text) => feedback.push(text) };
  const interaction = createInteraction({
    camera: new THREE.PerspectiveCamera(),
    controller: new THREE.Group(),
    content: { boardRoot, boardView, surface: new THREE.Mesh() },
    game, hints, animator, hud, onPromotionRequired
  });
  return { interaction, boardView, hints, animator, feedback };
}

test('selection follows turn, shows only legal targets, switches and deselects', () => {
  const game = new Game();
  const { interaction, hints, feedback } = makeInteraction(game);

  assert.equal(interaction.tapPiece('e7'), false);
  assert.equal(interaction.selectedSquare, null);
  assert.equal(interaction.tapPiece('e2'), true);
  assert.equal(interaction.selectedSquare, 'e2');
  assert.equal(hints.emptyTargets.count, 2);
  assert.deepEqual(interaction.tapSquare('e5'), { ok: false, reason: 'illegal' });
  assert.equal(interaction.selectedSquare, 'e2');
  assert.equal(feedback.at(-1), 'Illegal move');
  interaction.tapSquare('e2');
  assert.equal(interaction.selectedSquare, null);
  interaction.tapPiece('e2');
  assert.equal(interaction.tapPiece('d2'), true);
  assert.equal(interaction.selectedSquare, 'd2');
  assert.equal(hints.emptyTargets.count, 2);
  interaction.tapPiece('d2');
  assert.equal(interaction.selectedSquare, null);
  assert.equal(hints.emptyTargets.count, 0);

  const pinned = new Game('4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1');
  const pinnedState = makeInteraction(pinned);
  pinnedState.interaction.tapPiece('e2');
  assert.equal(pinnedState.hints.emptyTargets.count, 0);
  assert.equal(pinnedState.hints.captureTargets.count, 0);
});

test('legal target taps and enemy-piece taps move state and animate captures', () => {
  const game = new Game();
  const { interaction, boardView, animator } = makeInteraction(game);
  interaction.tapPiece('e2');
  assert.ok(interaction.tapSquare('e4').ok);
  assert.equal(interaction.tapPiece('d7'), false);
  animator.update(0);
  animator.update(10);
  interaction.tapPiece('d7');
  assert.ok(interaction.tapSquare('d5').ok);
  animator.update(20);
  animator.update(30);

  interaction.tapPiece('e4');
  const capture = interaction.tapPiece('d5');
  assert.ok(capture.ok);
  assert.equal(game.pieces().length, 31);
  assert.equal(boardView.getPieceInstance('black-p-d7'), null);
  assert.equal(animator.busy, true);
  assert.equal(interaction.tapSquare('e6'), null);
});

test('promotion waits for a choice and keeps the pawn id when rendering the promoted piece', () => {
  const game = new Game('8/P7/8/8/8/8/7k/K7 w - - 0 1');
  const requested = [];
  const { interaction, boardView, animator } = makeInteraction(game, (color) => requested.push(color));
  interaction.tapPiece('a7');
  const pending = interaction.tapSquare('a8');
  assert.deepEqual(pending, { ok: false, reason: 'promotion-required' });
  assert.equal(interaction.busy, true);
  assert.deepEqual(requested, ['white']);
  assert.equal(interaction.tapPiece('h2'), false);
  assert.equal(game.pieces().find((piece) => piece.square === 'a7').type, 'p');

  assert.ok(interaction.choosePromotion('q').ok);
  assert.equal(boardView.getPieceInstance('white-p-a7').type, 'q');
  animator.update(0);
  assert.equal(boardView.promotionGhost.visible, true);
  assert.ok(positionOf(boardView, 'white-p-a7').y >= SURFACE_Y);
  animator.update(10);
  assert.equal(interaction.busy, false);
  assert.equal(boardView.promotionGhost.visible, false);
  assert.ok(Math.abs(positionOf(boardView, 'white-p-a7').y - SURFACE_Y) < 1e-6);
});

test('en passant interaction removes the adjacent pawn and animates its capture', () => {
  const game = new Game();
  const { interaction, boardView, animator } = makeInteraction(game);
  let timestamp = 0;
  const move = (from, to) => {
    interaction.tapPiece(from);
    const result = interaction.tapSquare(to);
    assert.ok(result?.ok, `${from}-${to} rejected`);
    animator.update(timestamp);
    timestamp += 10;
    animator.update(timestamp);
    timestamp += 10;
    return result;
  };

  move('e2', 'e4');
  move('a7', 'a6');
  move('e4', 'e5');
  move('d7', 'd5');
  interaction.tapPiece('e5');
  const enPassant = interaction.tapSquare('d6');

  assert.equal(enPassant.move.enPassant, true);
  assert.equal(boardView.getPieceInstance('black-p-d7'), null);
  assert.equal(boardView.captureGhost.visible, true);
});

test('pending promotion can be cancelled cleanly', () => {
  const game = new Game('8/P7/8/8/8/8/7k/K7 w - - 0 1');
  const { interaction } = makeInteraction(game);
  interaction.tapPiece('a7');
  interaction.tapSquare('a8');
  assert.equal(interaction.cancelPromotion(), true);
  assert.equal(interaction.busy, false);
  assert.equal(interaction.selectedSquare, null);
  assert.equal(game.pieces().find((piece) => piece.square === 'a7').type, 'p');
});