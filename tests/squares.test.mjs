import test from 'node:test';
import assert from 'node:assert/strict';
import { FILES, isSquare, squareToColRow, colRowToSquare } from '../js/core/squares.js';

test('corner and center squares map to col,row', () => {
  assert.deepEqual(squareToColRow('a8'), { col: 0, row: 0 });
  assert.deepEqual(squareToColRow('h1'), { col: 7, row: 7 });
  assert.deepEqual(squareToColRow('e2'), { col: 4, row: 6 });
  assert.deepEqual(squareToColRow('d1'), { col: 3, row: 7 });
});

test('round trip for all 64 squares', () => {
  for (const f of FILES) {
    for (let r = 1; r <= 8; r++) {
      const sq = f + r;
      const { col, row } = squareToColRow(sq);
      assert.equal(colRowToSquare(col, row), sq);
    }
  }
});

test('invalid input is rejected', () => {
  assert.equal(isSquare('i1'), false);
  assert.equal(isSquare('a9'), false);
  assert.equal(isSquare(null), false);
  assert.throws(() => squareToColRow('z9'));
  assert.throws(() => colRowToSquare(8, 0));
  assert.throws(() => colRowToSquare(0, -1));
});
