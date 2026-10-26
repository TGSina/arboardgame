import * as THREE from 'three';

export const SQUARE = 0.05;                       // 5 cm squares
export const BOARD_SIZE = SQUARE * 8;             // 0.40 m playing area
export const FRAME = 0.02;                        // wooden border
export const FULL_SIZE = BOARD_SIZE + FRAME * 2;  // 0.44 m
export const THICK = 0.012;                       // board thickness
export const SURFACE_Y = THICK + 0.0006;          // height where pawns stand

// col 0..7 = files a..h, row 0 = far side (rank 8), row 7 = near side (rank 1)
export function squareToLocal(col, row) {
  return new THREE.Vector3((col - 3.5) * SQUARE, SURFACE_Y, (row - 3.5) * SQUARE);
}

export function localToSquare(x, z) {
  const col = Math.floor(x / SQUARE + 4);
  const row = Math.floor(z / SQUARE + 4);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return { col, row };
}

function makeBoardTexture() {
  const px = 1100, border = 50, s = 125;           // 2500 px per metre
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');

  g.fillStyle = '#4a2f1a';
  g.fillRect(0, 0, px, px);
  g.strokeStyle = '#c9a46a';
  g.lineWidth = 4;
  g.strokeRect(border - 3, border - 3, s * 8 + 6, s * 8 + 6);

  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 8; col++) {
      g.fillStyle = (r + col) % 2 === 0 ? '#f5ecd0' : '#3f7d3a';
      g.fillRect(border + col * s, border + r * s, s, s);
    }
  }

  g.fillStyle = '#f3d9a4';
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    g.fillText('abcdefgh'[i], border + i * s + s / 2, px - border / 2);
    g.fillText(String(8 - i), border / 2, border + i * s + s / 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createBoard() {
  const group = new THREE.Group();
  group.name = 'boardModel';

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(FULL_SIZE, THICK, FULL_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x5a381c, roughness: 0.55 })
  );
  slab.position.y = THICK / 2;
  slab.castShadow = true;
  slab.receiveShadow = true;

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(FULL_SIZE, FULL_SIZE).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: makeBoardTexture(), roughness: 0.6 })
  );
  surface.position.y = THICK + 0.0004;
  surface.receiveShadow = true;
  surface.name = 'surface';

  group.add(slab, surface);
  return { group, surface };
}

// ---- Pawns -------------------------------------------------------------
const K = 0.95;
const PROFILE = [
  [0, 0], [0.018, 0], [0.019, 0.003], [0.017, 0.006], [0.011, 0.010], [0.008, 0.016],
  [0.0075, 0.024], [0.0115, 0.026], [0.0115, 0.029], [0.0075, 0.0305], [0, 0.0305]
].map(([r, h]) => new THREE.Vector2(r * K, h * K));

const bodyGeo = new THREE.LatheGeometry(PROFILE, 48);
const headGeo = new THREE.SphereGeometry(0.0105 * K, 32, 20);
const HEAD_Y = 0.0385 * K;
const outlineWhite = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide });
const outlineBlack = new THREE.MeshBasicMaterial({ color: 0xe8e8e8, side: THREE.BackSide });

export function createPawn(color, col, row) {
  const white = color === 'white';
  const mat = new THREE.MeshStandardMaterial({
    color: white ? 0xfff6e0 : 0x24242b, roughness: white ? 0.35 : 0.3, metalness: 0
  });

  const body = new THREE.Mesh(bodyGeo, mat);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = HEAD_Y;
  body.castShadow = head.castShadow = true;
  body.receiveShadow = head.receiveShadow = true;

  // back-face outline so pawns stay readable on any real-world surface
  const oMat = white ? outlineWhite : outlineBlack;
  const bodyOutline = new THREE.Mesh(bodyGeo, oMat);
  const headOutline = new THREE.Mesh(headGeo, oMat);
  bodyOutline.scale.setScalar(1.12);
  headOutline.scale.setScalar(1.12);
  headOutline.position.y = HEAD_Y;
  bodyOutline.raycast = headOutline.raycast = () => {};

  const pawn = new THREE.Group();
  pawn.add(body, head, bodyOutline, headOutline);
  pawn.position.copy(squareToLocal(col, row));
  pawn.userData = { isPawn: true, color, col, row, mat, target: pawn.position.clone() };
  return pawn;
}

export function createPawns() {
  const pawns = [];
  for (let c = 0; c < 8; c++) {
    pawns.push(createPawn('black', c, 1));
    pawns.push(createPawn('white', c, 6));
  }
  return pawns;
}

export function createSelectionRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.019, 0.025, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide })
  );
  ring.position.y = SURFACE_Y + 0.001;
  ring.visible = false;
  ring.raycast = () => {};
  return ring;
}