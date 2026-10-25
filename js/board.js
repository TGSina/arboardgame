import * as THREE from 'three';

export const SQUARE = 0.05;                 // metres
export const BOARD_SIZE = SQUARE * 8;       // 0.4 m

// square (col,row) -> local x,z of its centre
export function squareToLocal(col, row) {
  return new THREE.Vector3((col - 3.5) * SQUARE, 0, (row - 3.5) * SQUARE);
}

// local x,z -> {col,row} or null if off the board
export function localToSquare(x, z) {
  const col = Math.floor(x / SQUARE + 4);
  const row = Math.floor(z / SQUARE + 4);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return { col, row };
}

export function createBoard() {
  const px = 1024, s = px / 8;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d');
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      g.fillStyle = (r + c) % 2 === 0 ? '#f0d9b5' : '#b58863';
      g.fillRect(c * s, r * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0005;                 // avoid z-fighting with the table
  mesh.name = 'board';
  return mesh;
}

export function createPawn(color, col, row) {
  const mat = new THREE.MeshStandardMaterial({
    color: color === 'white' ? 0xf4f4f4 : 0x222222, roughness: 0.45, metalness: 0.05
  });
  const pawn = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.008, 32), mat);
  base.position.y = 0.004;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.012, 0.028, 32), mat);
  body.position.y = 0.022;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.01, 32, 16), mat);
  head.position.y = 0.044;
  pawn.add(base, body, head);

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