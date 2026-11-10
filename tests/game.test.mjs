import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/core/game.js';

/** Plays a list of [from,to,promotion?] moves, asserting each one is accepted. Returns the last result. */
function play(game, moves) {
  let res;
  for (const [from, to, promo] of moves) {
    res = game.tryMove(from, to, promo);
    assert.ok(res.ok, `move ${from}-${to} rejected: ${res.reason}`);
  }
  return res;
}
const ids = (game) => new Set(game.pieces().map((p) => p.id));
const at = (game, sq) => game.pieces().find((p) => p.square === sq);

// ------------------------------------------------------------------ setup
test('start position: 32 unique pieces, white to move, playing', () => {
  const g = new Game();
  const pieces = g.pieces();
  assert.equal(pieces.length, 32);
  assert.equal(ids(g).size, 32);
  assert.equal(g.turn(), 'white');
  assert.equal(g.status().state, 'playing');
  assert.equal(at(g, 'd1').type, 'q');
  assert.equal(at(g, 'd1').color, 'white');
  assert.equal(at(g, 'e8').type, 'k');
  assert.deepEqual({ col: at(g, 'e2').col, row: at(g, 'e2').row }, { col: 4, row: 6 });
});

test('invalid FEN is reported, not thrown, by load()', () => {
  const g = new Game();
  const res = g.load('this is not a fen');
  assert.equal(res.ok, false);
  assert.ok(res.error);
  assert.throws(() => new Game('nonsense'));
});

test('serialize() round trips through load()', () => {
  const g = new Game();
  play(g, [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']]);
  const s = g.serialize();
  assert.equal(s.ply, 3);
  assert.equal(s.turn, 'black');
  const g2 = new Game(s.fen);
  assert.equal(g2.fen(), g.fen());
  assert.equal(g2.pieces().length, 32);
});

// ------------------------------------------------------------------ turns and rejection reasons
test('turns alternate and wrong-side / empty / illegal moves are rejected with a reason', () => {
  const g = new Game();
  assert.deepEqual(g.tryMove('e7', 'e5'), { ok: false, reason: 'not-your-turn' });
  assert.deepEqual(g.tryMove('e4', 'e5'), { ok: false, reason: 'no-piece' });
  assert.deepEqual(g.tryMove('e2', 'e5'), { ok: false, reason: 'illegal' });
  assert.deepEqual(g.tryMove('a1', 'a3'), { ok: false, reason: 'illegal' });
  assert.ok(g.tryMove('e2', 'e4').ok);
  assert.equal(g.turn(), 'black');
  assert.deepEqual(g.tryMove('e4', 'e5'), { ok: false, reason: 'not-your-turn' });
});

test('legal targets from the start position (pawn, knight, blocked rook)', () => {
  const g = new Game();
  assert.deepEqual(g.legalTargetsFrom('e2').map((t) => t.to).sort(), ['e3', 'e4']);
  assert.deepEqual(g.legalTargetsFrom('b1').map((t) => t.to).sort(), ['a3', 'c3']);
  assert.deepEqual(g.legalTargetsFrom('a1'), []);
  assert.equal(g.legalTargetsFrom('e2')[0].capture, false);
});

// ------------------------------------------------------------------ captures and ids
test('capture removes the captured piece id and moves the capturer id', () => {
  const g = new Game();
  play(g, [['e2', 'e4'], ['d7', 'd5']]);
  const res = g.tryMove('e4', 'd5');
  assert.ok(res.ok);
  assert.equal(res.move.captured, 'p');
  assert.equal(res.move.capturedId, 'black-p-d7');
  assert.equal(res.move.pieceId, 'white-p-e2');
  assert.ok(res.events.some((e) => e.type === 'captured' && e.id === 'black-p-d7' && e.square === 'd5'));
  assert.equal(g.pieces().length, 31);
  assert.equal(at(g, 'd5').id, 'white-p-e2');
  assert.ok(!ids(g).has('black-p-d7'));
  // hints reflect captures
  const g2 = new Game();
  play(g2, [['e2', 'e4'], ['d7', 'd5']]);
  assert.equal(g2.legalTargetsFrom('e4').find((t) => t.to === 'd5').capture, true);
});

// ------------------------------------------------------------------ en passant
test('en passant is legal only immediately after the double step', () => {
  const g = new Game();
  play(g, [['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5']]);
  assert.ok(g.legalTargetsFrom('e5').some((t) => t.to === 'd6' && t.enPassant));
  const res = g.tryMove('e5', 'd6');
  assert.ok(res.ok);
  assert.equal(res.move.enPassant, true);
  assert.equal(res.move.capturedSquare, 'd5');
  assert.equal(res.move.capturedId, 'black-p-d7');
  assert.equal(at(g, 'd5'), undefined);
  assert.equal(at(g, 'd6').color, 'white');

  const late = new Game();
  play(late, [['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5'], ['h2', 'h3'], ['h7', 'h6']]);
  assert.deepEqual(late.tryMove('e5', 'd6'), { ok: false, reason: 'illegal' });
});

// ------------------------------------------------------------------ castling
test('castling both sides moves king and rook and keeps rook ids', () => {
  const g = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const targets = g.legalTargetsFrom('e1');
  assert.ok(targets.some((t) => t.to === 'g1' && t.castle === 'k'));
  assert.ok(targets.some((t) => t.to === 'c1' && t.castle === 'q'));

  const k = g.tryMove('e1', 'g1');
  assert.ok(k.ok);
  assert.equal(k.move.castle, 'k');
  assert.deepEqual(k.move.rook, { id: 'white-r-h1', from: 'h1', to: 'f1' });
  assert.equal(at(g, 'f1').id, 'white-r-h1');
  assert.equal(at(g, 'g1').type, 'k');
  assert.ok(k.events.some((e) => e.type === 'castled' && e.side === 'k'));

  const q = g.tryMove('e8', 'c8');
  assert.ok(q.ok);
  assert.equal(q.move.castle, 'q');
  assert.deepEqual(q.move.rook, { id: 'black-r-a8', from: 'a8', to: 'd8' });
  assert.equal(at(g, 'd8').id, 'black-r-a8');
});

test('castling is refused through check and out of check', () => {
  // black rook on f2 attacks f1: king-side castling passes through an attacked square
  const through = new Game('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
  assert.ok(!through.legalTargetsFrom('e1').some((t) => t.to === 'g1'));
  assert.ok(through.legalTargetsFrom('e1').some((t) => t.to === 'c1'));
  assert.deepEqual(through.tryMove('e1', 'g1'), { ok: false, reason: 'illegal' });

  // black rook on e4 gives check: no castling at all
  const inCheck = new Game('r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1');
  assert.equal(inCheck.status().state, 'check');
  assert.ok(!inCheck.legalTargetsFrom('e1').some((t) => t.castle));
});

// ------------------------------------------------------------------ promotion
test('promotion requires a piece, supports Q/R/B/N, and changes the piece type but not its id', () => {
  for (const piece of ['q', 'r', 'b', 'n']) {
    const g = new Game('8/P7/8/8/8/8/7k/K7 w - - 0 1');
    assert.equal(g.legalTargetsFrom('a7').find((t) => t.to === 'a8').promotion, true);
    assert.deepEqual(g.tryMove('a7', 'a8'), { ok: false, reason: 'promotion-required' });
    assert.deepEqual(g.tryMove('a7', 'a8', 'k'), { ok: false, reason: 'illegal' });
    const res = g.tryMove('a7', 'a8', piece);
    assert.ok(res.ok, `promotion to ${piece}`);
    assert.equal(res.move.promotion, piece);
    assert.ok(res.events.some((e) => e.type === 'promoted' && e.to === piece));
    assert.equal(at(g, 'a8').type, piece);
    assert.equal(at(g, 'a8').id, 'white-p-a7');
  }
});

// ------------------------------------------------------------------ pins
test('a pinned piece has no legal moves and cannot move', () => {
  const g = new Game('4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1');
  assert.deepEqual(g.legalTargetsFrom('e2'), []);
  assert.deepEqual(g.tryMove('e2', 'd3'), { ok: false, reason: 'illegal' });
});

// ------------------------------------------------------------------ check / mate / stalemate / draws
test("fool's mate: black wins, white loses, further moves rejected", () => {
  const g = new Game();
  play(g, [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]);
  const res = g.tryMove('d8', 'h4');
  assert.ok(res.ok);
  assert.equal(res.status.state, 'checkmate');
  assert.equal(res.status.winner, 'black');
  assert.equal(res.status.loser, 'white');
  assert.ok(res.events.some((e) => e.type === 'gameOver' && e.winner === 'black'));
  assert.deepEqual(g.tryMove('a2', 'a3'), { ok: false, reason: 'game-over' });
  assert.equal(g.kingSquare('white'), 'e1');
});

test("scholar's mate: white wins; check is reported before mate", () => {
  const g = new Game();
  play(g, [['e2', 'e4'], ['e7', 'e5'], ['d1', 'h5'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6']]);
  const mate = g.tryMove('h5', 'f7');
  assert.ok(mate.ok);
  assert.equal(mate.status.state, 'checkmate');
  assert.equal(mate.status.winner, 'white');

  // a plain check (not mate) is reported as 'check' with a check event
  const g2 = new Game();
  play(g2, [['e2', 'e4'], ['f7', 'f5']]);
  const checkRes = g2.tryMove('d1', 'h5');
  assert.ok(checkRes.ok);
  assert.equal(checkRes.status.state, 'check');
  assert.ok(checkRes.events.some((e) => e.type === 'check' && e.color === 'black'));
});

test('stalemate is a draw with no winner', () => {
  const g = new Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  const s = g.status();
  assert.equal(s.state, 'stalemate');
  assert.equal(s.winner, null);
  assert.equal(s.over, true);
  assert.deepEqual(g.tryMove('h8', 'g8'), { ok: false, reason: 'game-over' });
});

test('threefold repetition ends the game as a draw', () => {
  const g = new Game();
  const shuffle = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']];
  play(g, shuffle);
  assert.equal(g.status().over, false);
  const res = play(g, shuffle);
  assert.equal(res.status.state, 'draw');
  assert.equal(res.status.reason, 'threefold-repetition');
});

test('fifty-move rule and insufficient material are draws', () => {
  const fifty = new Game('4k3/8/8/8/8/8/8/R3K3 w - - 100 80');
  assert.equal(fifty.status().state, 'draw');
  assert.equal(fifty.status().reason, 'fifty-move-rule');

  const kb = new Game('8/8/8/8/8/2k5/8/K1B5 w - - 0 1');
  assert.equal(kb.status().state, 'draw');
  assert.equal(kb.status().reason, 'insufficient-material');
});

// ------------------------------------------------------------------ undo
test('undo restores position, turn and piece ids (including captures, castling, promotion)', () => {
  const g = new Game();
  play(g, [['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5']]);
  assert.equal(g.pieces().length, 31);
  assert.equal(g.undo(), true);
  assert.equal(g.pieces().length, 32);
  assert.equal(at(g, 'd5').id, 'black-p-d7');
  assert.equal(at(g, 'e4').id, 'white-p-e2');
  assert.equal(g.turn(), 'white');

  const c = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  play(c, [['e1', 'g1']]);
  assert.equal(c.undo(), true);
  assert.equal(at(c, 'h1').id, 'white-r-h1');
  assert.equal(at(c, 'e1').type, 'k');

  const p = new Game('8/P7/8/8/8/8/7k/K7 w - - 0 1');
  play(p, [['a7', 'a8', 'q']]);
  assert.equal(p.undo(), true);
  assert.equal(at(p, 'a7').type, 'p');

  assert.equal(new Game().undo(), false);
});

test('history() lists SAN moves; ids stay unique after a long sequence', () => {
  const g = new Game();
  play(g, [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'b5'], ['a7', 'a6'], ['b5', 'a4'], ['g8', 'f6'], ['e1', 'g1']]);
  assert.deepEqual(g.history().slice(0, 3), ['e4', 'e5', 'Nf3']);
  assert.equal(g.history().at(-1), 'O-O');
  assert.equal(ids(g).size, g.pieces().length);
  assert.equal(at(g, 'f1').id, 'white-r-h1');
});

test('resignation ends play and reset clears the result', () => {
  const g = new Game();
  assert.equal(g.resign(), true);
  assert.deepEqual(g.status(), {
    turn: 'white', winner: 'black', loser: 'white', over: true,
    inCheck: null, reason: 'resignation', state: 'resigned'
  });
  assert.deepEqual(g.tryMove('e2', 'e4'), { ok: false, reason: 'game-over' });
  assert.equal(g.resign(), false);

  assert.equal(g.reset().ok, true);
  assert.equal(g.status().state, 'playing');
  assert.equal(g.resign('black'), true);
  assert.equal(g.load('not a fen').ok, false);
  assert.equal(g.status().state, 'resigned');
});
