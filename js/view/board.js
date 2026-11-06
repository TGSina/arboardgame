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
      g.fillStyle = isDarkSquare(col, r) ? '#3f7d3a' : '#f5ecd0';
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

export function isDarkSquare(col, row) {
  return (col + row) % 2 !== 0;
}

