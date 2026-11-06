// Placement: reticle, ghost board preview, placing/playing phase, anchor tracking.
import * as THREE from 'three';

export function createPlacement({ app, boardRoot, boardSize, hooks = {}, log = () => {} }) {
  const { scene, camera, hit } = app;
  const tmpV = new THREE.Vector3();

  const state = {
    phase: 'placing',          // 'placing' | 'playing'
    anchor: null,
    anchorState: 'none',
    useAnchor: true,
    anchorPoseOk: false,
    pendingPlace: false
  };

  // reticle (where the surface hit is)
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // ghost preview of the board footprint (size = board size x current scale)
  const ghost = new THREE.Group();
  ghost.matrixAutoUpdate = false;
  ghost.visible = false;
  const ghostInner = new THREE.Group();
  ghost.add(ghostInner);
  {
    const grid = new THREE.GridHelper(boardSize, 8, 0x00e5ff, 0x00e5ff);
    grid.material.transparent = true;
    grid.material.opacity = 0.9;
    grid.material.depthTest = false;
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(boardSize, boardSize).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })
    );
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.045, 3), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
    arrow.rotation.x = Math.PI / 2;               // points toward the player's side (+z)
    arrow.position.set(0, 0.01, boardSize / 2 + 0.04);
    ghostInner.add(fill, grid, arrow);
  }
  scene.add(ghost);

  // placement group: pose comes from the hit (then from the anchor); boardRoot adds yaw + scale
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.visible = false;
  group.add(boardRoot);
  scene.add(group);

  function yawTowardCamera(obj) {
    tmpV.setFromMatrixPosition(camera.matrixWorld);
    obj.worldToLocal(tmpV);
    const yaw = Math.atan2(tmpV.x, tmpV.z);
    return Number.isFinite(yaw) ? yaw : 0;
  }

  function reset() {
    state.anchor?.delete?.();
    state.anchor = null;
    state.anchorState = 'none';
    state.phase = 'placing';
    state.pendingPlace = false;
    group.visible = false;
    hooks.onReset?.();
  }

  function placeBoard(h) {
    group.matrix.copy(reticle.matrix);
    group.matrixWorldNeedsUpdate = true;
    group.updateMatrixWorld(true);
    boardRoot.rotation.y = yawTowardCamera(group);   // your side faces you

    group.visible = true;
    state.phase = 'playing';
    hooks.onPlaced?.();

    // the anchor is requested inside the XR frame callback (required by the spec)
    state.anchor = null;
    if (typeof h.createAnchor === 'function') {
      state.anchorState = 'creating';
      h.createAnchor()
        .then((a) => { state.anchor = a; state.anchorState = 'ok'; log('anchor ok'); })
        .catch((err) => { state.anchorState = 'failed: ' + err.name; log('anchor failed: ' + err.message); });
    } else {
      state.anchorState = 'unsupported';
      log('anchors unsupported');
    }
  }

  /** Called on a tap while placing: the board is placed on the next XR frame (needs an active frame). */
  function requestPlace() {
    if (hit.ok) state.pendingPlace = true;
  }

  function toggleAnchor() {
    state.useAnchor = !state.useAnchor;
    log('anchor use ' + (state.useAnchor ? 'ON' : 'OFF'));
    return state.useAnchor;
  }

  app.onXRFrame((ts, frame, refSpace) => {
    const placing = state.phase === 'placing';
    if (hit.hasPose) {
      reticle.matrix.copy(hit.matrix);
      reticle.matrixWorldNeedsUpdate = true;
    }
    reticle.visible = placing && hit.ok;
    ghost.visible = placing && hit.ok;
    if (ghost.visible) {
      ghost.matrix.copy(reticle.matrix);
      ghost.matrixWorldNeedsUpdate = true;
      ghost.updateMatrixWorld(true);
      ghostInner.rotation.y = yawTowardCamera(ghost);
      ghostInner.scale.setScalar(boardRoot.scale.x);
    }

    if (state.pendingPlace) {
      state.pendingPlace = false;
      if (placing && hit.ok && hit.last) placeBoard(hit.last);
    }

    if (state.anchor && state.useAnchor && state.phase === 'playing') {
      const pose = frame.getPose(state.anchor.anchorSpace, refSpace);
      state.anchorPoseOk = !!pose;
      if (pose) {
        group.matrix.fromArray(pose.transform.matrix);
        group.matrixWorldNeedsUpdate = true;
      }
    }
  });

  return { state, group, reticle, reset, requestPlace, toggleAnchor };
}
