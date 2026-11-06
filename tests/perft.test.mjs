// Validates the vendored rules engine's move generation against well-known perft node counts.
// (Reference values: chessprogramming.org "Perft Results".)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../lib/chess.js/chess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const POS3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const POS4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
const POS5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';

const cases = [
  ['start position', START, [20, 400, 8902, 197281]],
  ['kiwipete (castling, pins, en passant)', KIWIPETE, [48, 2039, 97862]],
  ['position 3 (en passant, discovered checks)', POS3, [14, 191, 2812, 43238]],
  ['position 4 (promotions, castling)', POS4, [6, 264, 9467]],
  ['position 5 (promotion + check)', POS5, [44, 1486, 62379]]
];

for (const [name, fen, expected] of cases) {
  test(`perft: ${name}`, () => {
    expected.forEach((nodes, i) => {
      assert.equal(new Chess(fen).perft(i + 1), nodes, `depth ${i + 1}`);
    });
  });
}
