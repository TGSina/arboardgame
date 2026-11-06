// Pure helpers: algebraic squares <-> board (col,row). No THREE, no DOM.
// Convention (same as the 3D board): file a = col 0 ... file h = col 7,
// rank 8 = row 0 (far side) ... rank 1 = row 7 (near side, white's side).

export const FILES = 'abcdefgh';

export function isSquare(sq) {
  return typeof sq === 'string' && /^[a-h][1-8]$/.test(sq);
}

export function squareToColRow(sq) {
  if (!isSquare(sq)) throw new Error(`Invalid square: ${sq}`);
  return { col: FILES.indexOf(sq[0]), row: 8 - Number(sq[1]) };
}

export function colRowToSquare(col, row) {
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col > 7 || row < 0 || row > 7) {
    throw new Error(`Invalid col/row: ${col},${row}`);
  }
  return FILES[col] + String(8 - row);
}
