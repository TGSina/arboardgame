// Pure chess game logic (no THREE, no DOM, no WebXR). Wraps the vendored chess.js rules engine.
// - Legal-move generation, check/checkmate/stalemate/draw detection come from chess.js.
// - This wrapper adds: stable piece ids (so the view can animate the same object across moves),
//   typed results/events, and (col,row) helpers matching the 3D board.
import { Chess } from '../../lib/chess.js/chess.js';
import { squareToColRow } from './squares.js';

const COLOR = { w: 'white', b: 'black' };
const OTHER = { white: 'black', black: 'white' };
const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];

export class Game {
  /** @param {string} [fen] optional start position (defaults to the standard start) */
  constructor(fen) {
    this.chess = new Chess();
    this.ids = new Map();       // square -> { id, type, color }
    this.snapshots = [];        // id-map snapshots, one per played move (for undo)
    const res = this.load(fen);
    if (!res.ok) throw new Error(`Invalid FEN: ${res.error}`);
  }

  // ------------------------------------------------------------ setup / state
  /** Loads a FEN (or the start position when omitted). Returns {ok} or {ok:false,error}. */
  load(fen) {
    try {
      if (fen === undefined) this.chess.reset();
      else this.chess.load(fen);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    this.snapshots = [];
    this.#rebuildIds();
    return { ok: true };
  }

  reset() { return this.load(); }

  turn() { return COLOR[this.chess.turn()]; }

  fen() { return this.chess.fen(); }

  /** Moves played so far in SAN, e.g. ['e4','e5','Nf3'] */
  history() { return this.chess.history(); }

  /** Everything needed to save/restore or sync a game. */
  serialize() {
    return { fen: this.chess.fen(), pgn: this.chess.pgn(), ply: this.chess.history().length, turn: this.turn() };
  }

  /** All pieces currently on the board: [{id,type,color,square,col,row}] sorted by id. */
  pieces() {
    const out = [];
    for (const [square, p] of this.ids) {
      out.push({ id: p.id, type: p.type, color: p.color, square, ...squareToColRow(square) });
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /** Square of the given color's king (or null). */
  kingSquare(color) {
    for (const [square, p] of this.ids) if (p.type === 'k' && p.color === color) return square;
    return null;
  }

  // ------------------------------------------------------------ queries
  /** Raw legal moves from a square: [{from,to,piece,captured,promotion,flags,san}] */
  legalMovesFrom(square) {
    return this.chess.moves({ square, verbose: true }).map((m) => ({
      from: m.from, to: m.to, piece: m.piece, captured: m.captured ?? null,
      promotion: m.promotion ?? null, flags: m.flags, san: m.san
    }));
  }

  /** Unique legal destination squares from a square (promotion variants merged). For hints. */
  legalTargetsFrom(square) {
    const byTo = new Map();
    for (const m of this.legalMovesFrom(square)) {
      if (byTo.has(m.to)) continue;
      byTo.set(m.to, {
        to: m.to,
        ...squareToColRow(m.to),
        capture: m.flags.includes('c') || m.flags.includes('e'),
        enPassant: m.flags.includes('e'),
        castle: m.flags.includes('k') ? 'k' : m.flags.includes('q') ? 'q' : null,
        promotion: m.promotion !== null
      });
    }
    return [...byTo.values()];
  }

  /** Game status: { state, winner, loser, reason, over, turn, inCheck } */
  status() {
    const c = this.chess;
    const turn = this.turn();
    const base = { turn, winner: null, loser: null, over: false, inCheck: null, reason: null };
    if (c.isCheckmate()) {
      return { ...base, state: 'checkmate', winner: OTHER[turn], loser: turn, over: true, inCheck: turn, reason: 'checkmate' };
    }
    if (c.isStalemate()) return { ...base, state: 'stalemate', over: true, reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { ...base, state: 'draw', over: true, reason: 'insufficient-material' };
    if (c.isThreefoldRepetition()) return { ...base, state: 'draw', over: true, reason: 'threefold-repetition' };
    if (c.isDrawByFiftyMoves()) return { ...base, state: 'draw', over: true, reason: 'fifty-move-rule' };
    if (c.isCheck()) return { ...base, state: 'check', inCheck: turn };
    return { ...base, state: 'playing' };
  }

  // ------------------------------------------------------------ actions
  /**
   * Tries to play a move. Never throws.
   * @returns {{ok:true, move:object, events:object[], status:object} | {ok:false, reason:string}}
   * reasons: 'game-over' | 'no-piece' | 'not-your-turn' | 'illegal' | 'promotion-required'
   */
  tryMove(from, to, promotion) {
    if (this.status().over) return { ok: false, reason: 'game-over' };
    const piece = this.ids.get(from);
    if (!piece) return { ok: false, reason: 'no-piece' };
    if (piece.color !== this.turn()) return { ok: false, reason: 'not-your-turn' };

    const candidates = this.chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (candidates.length === 0) return { ok: false, reason: 'illegal' };
    const needsPromotion = candidates.some((m) => m.promotion);
    if (needsPromotion && !promotion) return { ok: false, reason: 'promotion-required' };
    if (needsPromotion && !PROMOTION_PIECES.includes(promotion)) return { ok: false, reason: 'illegal' };

    const snapshot = new Map([...this.ids].map(([sq, p]) => [sq, { ...p }]));
    let m;
    try {
      m = this.chess.move({ from, to, promotion: needsPromotion ? promotion : undefined });
    } catch {
      return { ok: false, reason: 'illegal' };
    }
    this.snapshots.push(snapshot);

    // ---- keep piece ids in sync (captures, en passant, castling, promotion)
    const mover = this.ids.get(from);
    let capturedPiece = null;
    let capturedSquare = null;
    if (m.flags.includes('e')) {
      capturedSquare = to[0] + from[1];
      capturedPiece = this.ids.get(capturedSquare);
      this.ids.delete(capturedSquare);
    } else if (m.captured) {
      capturedSquare = to;
      capturedPiece = this.ids.get(to);
      this.ids.delete(to);
    }
    this.ids.delete(from);
    if (m.promotion) mover.type = m.promotion;
    this.ids.set(to, mover);

    let rook = null;
    const castle = m.flags.includes('k') ? 'k' : m.flags.includes('q') ? 'q' : null;
    if (castle) {
      const rank = from[1];
      const rookFrom = (castle === 'k' ? 'h' : 'a') + rank;
      const rookTo = (castle === 'k' ? 'f' : 'd') + rank;
      const rookPiece = this.ids.get(rookFrom);
      this.ids.delete(rookFrom);
      this.ids.set(rookTo, rookPiece);
      rook = { id: rookPiece.id, from: rookFrom, to: rookTo };
    }

    const move = {
      from, to,
      pieceId: mover.id,
      piece: m.piece,
      color: COLOR[m.color],
      san: m.san,
      flags: m.flags,
      captured: m.captured ?? null,
      capturedId: capturedPiece?.id ?? null,
      capturedSquare,
      enPassant: m.flags.includes('e'),
      castle,
      rook,
      promotion: m.promotion ?? null
    };

    const status = this.status();
    const events = [{ type: 'moved', ...move }];
    if (capturedPiece) events.push({ type: 'captured', id: capturedPiece.id, square: capturedSquare, piece: m.captured });
    if (castle) events.push({ type: 'castled', side: castle, rook });
    if (m.promotion) events.push({ type: 'promoted', id: mover.id, to: m.promotion });
    if (status.state === 'check') events.push({ type: 'check', color: status.inCheck });
    if (status.over) {
      events.push({ type: 'gameOver', state: status.state, winner: status.winner, loser: status.loser, reason: status.reason });
    }
    return { ok: true, move, events, status };
  }

  /** Takes back the last move. Returns true if a move was undone. */
  undo() {
    const undone = this.chess.undo();
    if (!undone) return false;
    this.ids = this.snapshots.pop();
    return true;
  }

  // ------------------------------------------------------------ internals
  #rebuildIds() {
    this.ids = new Map();
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        this.ids.set(cell.square, {
          id: `${COLOR[cell.color]}-${cell.type}-${cell.square}`,
          type: cell.type,
          color: COLOR[cell.color]
        });
      }
    }
  }
}
