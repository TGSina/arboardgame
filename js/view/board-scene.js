// Builds everything that lives under boardRoot: board model, game pieces, shadow catcher and light.
import * as THREE from 'three';
import { createBoard } from './board.js';
import { BoardView } from './board-view.js';
import { SCALE } from '../config.js';

export function createBoardScene({ game }) {
  const boardRoot = new THREE.Group();

  const board = createBoard();
  boardRoot.add(board.group);

  // invisible plane that only catches shadows (grounds the board on the real table)
  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ opacity: 0.35 })
  );
  catcher.position.y = 0.0002;
  catcher.receiveShadow = true;
  catcher.raycast = () => {};
  boardRoot.add(catcher);

  const boardView = new BoardView(game);
  boardRoot.add(boardView.root);

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(0.25, 0.7, 0.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.002;
  boardRoot.add(sun, sun.target);

  /** Scales board + pieces together (clamped) and keeps the shadow frustum matched. Returns the applied scale. */
  function setBoardScale(s) {
    s = THREE.MathUtils.clamp(s, SCALE.MIN, SCALE.MAX);
    boardRoot.scale.setScalar(s);
    const c = sun.shadow.camera, k = 0.34 * s;
    c.left = -k; c.right = k; c.top = k; c.bottom = -k;
    c.near = 0.05 * s; c.far = 2 * s;
    c.updateProjectionMatrix();
    return s;
  }

  setBoardScale(1);

  return { boardRoot, surface: board.surface, boardView, sun, setBoardScale };
}
