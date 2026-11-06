import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../js/core/game.js';
import { isDarkSquare, SURFACE_Y } from '../js/view/board.js';
import { BoardView } from '../js/view/board-view.js';
import { createPieceGeometry } from '../js/view/pieces.js';

function instanceTransform(view, id) {
  const instance = view.getPieceInstance(id);
  assert.ok(instance, `missing rendered piece ${id}`);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  instance.batch.surface.getMatrixAt(instance.instanceId, matrix);
  matrix.decompose(position, rotation, scale);
  return { instance, position, rotation, scale };
}

test('procedural geometries cover every piece and king is tallest', () => {
  const types = ['p', 'r', 'n', 'b', 'q', 'k'];
  const geometries = types.map((type) => createPieceGeometry(type));
  assert.equal(new Set(geometries).size, types.length);
  for (const geometry of geometries) {
    assert.ok(geometry.boundingBox);
    assert.ok(geometry.boundingBox.min.y >= -1e-6);
    assert.ok(geometry.getAttribute('normal'));
  }
  assert.ok(geometries.at(-1).boundingBox.max.y > geometries.at(-2).boundingBox.max.y);
  assert.equal(createPieceGeometry('n'), geometries[2]);
  assert.throws(() => createPieceGeometry('x'), /Unknown chess piece type/);
});

test('start position renders 32 stable ids on the expected squares', () => {
  const game = new Game();
  const view = new BoardView(game);
  const renderedIds = [...view.batches.values()].flatMap((batch) => batch.ids);

  assert.equal(renderedIds.length, 32);
  assert.equal(new Set(renderedIds).size, 32);
  assert.deepEqual(new Set(renderedIds), new Set(game.pieces().map((piece) => piece.id)));
  assert.equal(view.pickMesh.count, 32);
  assert.equal(new Set(view.pickIds).size, 32);
  assert.equal(view.getPieceIdAtPick(view.pickIds.indexOf('white-p-e2')), 'white-p-e2');

  const { position: queen } = instanceTransform(view, 'white-q-d1');
  assert.ok(Math.abs(queen.x + 0.025) < 1e-6);
  assert.ok(Math.abs(queen.z - 0.175) < 1e-6);
  assert.ok(Math.abs(queen.y - SURFACE_Y) < 1e-6);
  assert.equal(isDarkSquare(0, 7), true);
  assert.equal(game.pieces().find((piece) => piece.type === 'k' && piece.color === 'white').square, 'e1');
  assert.equal(game.pieces().find((piece) => piece.type === 'k' && piece.color === 'black').square, 'e8');
  assert.equal(view.getPieceInstance('white-k-e1').type, 'k');
});

test('black knights face opposite the white knights', () => {
  const view = new BoardView(new Game());
  const white = instanceTransform(view, 'white-n-b1').rotation;
  const black = instanceTransform(view, 'black-n-g8').rotation;

  assert.ok(Math.abs(white.y) < 1e-6);
  assert.ok(Math.abs(Math.abs(black.y) - 1) < 1e-6);
});

test('FEN state and later captures and promotions sync without losing piece ids', () => {
  const game = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const view = new BoardView(game);
  assert.equal([...view.batches.values()].reduce((count, batch) => count + batch.ids.length, 0), 6);
  assert.equal(view.getPieceInstance('black-r-a8').type, 'r');

  const captureGame = new Game();
  captureGame.tryMove('e2', 'e4');
  captureGame.tryMove('d7', 'd5');
  captureGame.tryMove('e4', 'd5');
  view.syncFrom(captureGame);
  assert.equal([...view.batches.values()].reduce((count, batch) => count + batch.ids.length, 0), 31);
  assert.equal(view.getPieceInstance('black-p-d7'), null);
  assert.equal(view.getPieceInstance('white-p-e2').type, 'p');
  const movedPawn = view.getPieceInstance('white-p-e2');
  const movedMatrix = new THREE.Matrix4();
  const movedPosition = new THREE.Vector3();
  movedPawn.batch.surface.getMatrixAt(movedPawn.instanceId, movedMatrix);
  movedMatrix.decompose(movedPosition, new THREE.Quaternion(), new THREE.Vector3());
  assert.ok(Math.abs(movedPosition.z + 0.025) < 1e-6);

  const promotionGame = new Game('8/P7/8/8/8/8/7k/K7 w - - 0 1');
  const promotionView = new BoardView(promotionGame);
  assert.ok(promotionGame.tryMove('a7', 'a8', 'q').ok);
  promotionView.syncFrom(promotionGame);
  assert.equal(promotionView.getPieceInstance('white-p-a7').type, 'q');
  assert.equal(promotionView.getPieceInstance('white-p-a7').batch.ids[0], 'white-p-a7');
});