import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BoardManipulation, MAX_TABLE_OFFSET } from '../js/xr/manipulation.js';

function makeManipulation() {
  const placementGroup = new THREE.Group();
  const boardRoot = new THREE.Group();
  placementGroup.add(boardRoot);
  const placement = { group: placementGroup, state: { baseYaw: 0.4 } };
  const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 20);
  camera.position.set(0, 1, 2);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const manipulation = new BoardManipulation({
    camera,
    placement,
    boardRoot,
    setBoardScale: (scale) => boardRoot.scale.setScalar(scale),
    getViewport: () => ({ width: 100, height: 100 })
  });
  return { manipulation, placementGroup, boardRoot };
}

test('drag projects to the placement plane and clamps the board to the table radius', () => {
  const { manipulation, boardRoot, placementGroup } = makeManipulation();
  placementGroup.updateMatrixWorld(true);

  assert.equal(manipulation.beginDrag(50, 50), true);
  assert.equal(manipulation.dragTo(500, 50), true);
  assert.ok(Math.abs(Math.hypot(boardRoot.position.x, boardRoot.position.z) - MAX_TABLE_OFFSET) < 1e-6);
  manipulation.endDrag();
  assert.equal(manipulation.dragTo(50, 50), false);
});

test('two-finger transform clamps scale, applies twist, and resets board-local offsets', () => {
  const { manipulation, boardRoot } = makeManipulation();
  boardRoot.position.set(0.2, 0, -0.1);
  boardRoot.rotation.y = 0.8;
  manipulation.startTransform();
  manipulation.transform({ ratio: 20, angleDelta: 0.35 });

  assert.equal(boardRoot.scale.x, 3);
  assert.ok(Math.abs(boardRoot.rotation.y - 1.15) < 1e-6);

  manipulation.resetTransform();

  assert.deepEqual(boardRoot.position.toArray(), [0, 0, 0]);
  assert.ok(Math.abs(boardRoot.rotation.y - 0.4) < 1e-6);
  assert.deepEqual(boardRoot.scale.toArray(), [1, 1, 1]);
});
