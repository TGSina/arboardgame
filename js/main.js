import * as THREE from 'three';
import { ARButton } from '../lib/three/addons/webxr/ARButton.js';
import {
  BOARD_SIZE, SURFACE_Y, createBoard, createPawns, createSelectionRing,
  squareToLocal, localToSquare
} from './board.js';
import { createDebug, createBoardDebug } from './debug.js';
import { setupGestures } from './input.js';

const $ = (id) => document.getElementById(id);
const overlay = $('overlay'), touchpad = $('touchpad'), statusEl = $('status'), hudEl = $('hud');
const btnReset = $('reset'), btnDebug = $('btn-debug'), btnAnchor = $('btn-anchor');
const btnIn = $('btn-zoom-in'), btnOut = $('btn-zoom-out');

const SCALE_MIN = 0.4, SCALE_MAX = 3;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4();

let renderer, scene, camera, controller, reticle, ghost, ghostInner, sun;
let placement, boardRoot, surface, boardDebug, selectRing, dbg;
let pawns = [], selected = null;
let phase = 'placing';                       // 'placing' | 'playing'
let hitTestSource = null, hitTestSourceRequested = false;
let lastHit = null, reticleOk = false, centerHit = false, pendingPlace = false;
let anchor = null, anchorState = 'none', useAnchor = true, anchorPoseOk = false;
let debugOn = true, pinchBase = 1, lastTapTime = 0;
let fps = 0, lastTs = 0, lastHudTs = 0, baseStatus = '', statusTimer = null;
const logLines = [];
const t0 = performance.now();
const raycaster = new THREE.Raycaster();
let gestures;

init();

// ---------------------------------------------------------------- setup
function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 20);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.8));

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['anchors', 'plane-detection', 'dom-overlay'],
    domOverlay: { root: overlay }
  }));

  // reticle
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  createGhost();

  // board hierarchy: placement (AR pose) -> boardRoot (yaw + scale) -> board, pawns, light
  placement = new THREE.Group();
  placement.matrixAutoUpdate = false;
  placement.visible = false;
  scene.add(placement);

  boardRoot = new THREE.Group();
  placement.add(boardRoot);

  const board = createBoard();
  surface = board.surface;
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

  pawns = createPawns();
  pawns.forEach((p) => boardRoot.add(p));

  selectRing = createSelectionRing();
  boardRoot.add(selectRing);

  sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(0.25, 0.7, 0.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.002;
  boardRoot.add(sun, sun.target);

  boardDebug = createBoardDebug();
  boardRoot.add(boardDebug);

  dbg = createDebug(scene);

  setBoardScale(1);

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => handleTap('xr'));
  scene.add(controller);

  gestures = setupGestures(touchpad, {
    onTap: (x, y) => handleTap('dom', x, y),
    onPinchStart: () => { pinchBase = boardRoot.scale.x; },
    onPinch: (ratio) => { const s = setBoardScale(pinchBase * ratio); flashStatus(`Board scale ×${s.toFixed(2)}`); }
  });

  document.querySelectorAll('#controls button').forEach((b) =>
    b.addEventListener('beforexrselect', (e) => e.preventDefault()));
  btnReset.addEventListener('click', resetPlacement);
  btnIn.addEventListener('click', () => flashStatus(`Board scale ×${setBoardScale(boardRoot.scale.x * 1.15).toFixed(2)}`));
  btnOut.addEventListener('click', () => flashStatus(`Board scale ×${setBoardScale(boardRoot.scale.x / 1.15).toFixed(2)}`));
  btnDebug.addEventListener('click', () => setDebug(!debugOn));
  btnAnchor.addEventListener('click', () => {
    useAnchor = !useAnchor;
    btnAnchor.textContent = 'Anchor: ' + (useAnchor ? 'ON' : 'OFF');
    hudLog('anchor use ' + (useAnchor ? 'ON' : 'OFF'));
  });

  renderer.xr.addEventListener('sessionstart', () => {
    document.body.classList.add('ar-active');
    resetPlacement();
    hudLog('session started');
  });
  renderer.xr.addEventListener('sessionend', () => {
    document.body.classList.remove('ar-active');
    hitTestSource?.cancel?.();
    hitTestSource = null;
    hitTestSourceRequested = false;
    dbg.detach();
    dbg.clear();
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  addEventListener('error', (e) => hudLog('ERR ' + e.message));
  addEventListener('unhandledrejection', (e) => hudLog('PROMISE ' + (e.reason?.message || e.reason)));

  setDebug(true);
  renderer.setAnimationLoop(render);
}

function createGhost() {
  ghost = new THREE.Group();
  ghost.matrixAutoUpdate = false;
  ghost.visible = false;
  ghostInner = new THREE.Group();
  ghost.add(ghostInner);

  const grid = new THREE.GridHelper(BOARD_SIZE, 8, 0x00e5ff, 0x00e5ff);
  grid.material.transparent = true;
  grid.material.opacity = 0.9;
  grid.material.depthTest = false;
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })
  );
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.045, 3), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
  arrow.rotation.x = Math.PI / 2;               // points toward the player's side (+z)
  arrow.position.set(0, 0.01, BOARD_SIZE / 2 + 0.04);
  ghostInner.add(fill, grid, arrow);
  scene.add(ghost);
}

// ---------------------------------------------------------------- helpers
function setStatus(t) { baseStatus = t; statusEl.textContent = t; }
function flashStatus(t) {
  statusEl.textContent = t;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusEl.textContent = baseStatus; }, 1400);
}
function hudLog(msg) {
  logLines.push(`${((performance.now() - t0) / 1000).toFixed(1)}s ${msg}`);
  if (logLines.length > 6) logLines.shift();
}

function setDebug(v) {
  debugOn = v;
  btnDebug.textContent = 'Debug: ' + (v ? 'ON' : 'OFF');
  hudEl.hidden = !v;
  btnAnchor.hidden = !v;
  dbg.setVisible(v);
  boardDebug.visible = v;
}

function setBoardScale(s) {
  s = THREE.MathUtils.clamp(s, SCALE_MIN, SCALE_MAX);
  boardRoot.scale.setScalar(s);
  const c = sun.shadow.camera, k = 0.34 * s;      // keep the shadow frustum matched to the board
  c.left = -k; c.right = k; c.top = k; c.bottom = -k;
  c.near = 0.05 * s; c.far = 2 * s;
  c.updateProjectionMatrix();
  return s;
}

function yawTowardCamera(obj) {
  tmpV.setFromMatrixPosition(camera.matrixWorld);
  obj.worldToLocal(tmpV);
  const yaw = Math.atan2(tmpV.x, tmpV.z);
  return Number.isFinite(yaw) ? yaw : 0;
}

// ---------------------------------------------------------------- placement
function resetPlacement() {
  anchor?.delete?.();
  anchor = null;
  anchorState = 'none';
  phase = 'placing';
  pendingPlace = false;
  placement.visible = false;
  btnReset.hidden = true;
  select(null);
  setStatus('Scan a flat surface (move the phone slowly). Tap when the cyan grid sits where you want the board. Pinch to resize.');
}

function placeBoard(hit) {
  placement.matrix.copy(reticle.matrix);
  placement.matrixWorldNeedsUpdate = true;
  placement.updateMatrixWorld(true);
  boardRoot.rotation.y = yawTowardCamera(placement);   // your side faces you

  placement.visible = true;
  phase = 'playing';
  btnReset.hidden = false;
  select(null);
  setStatus('Tap a pawn to select it, then tap a square to move it. Pinch to resize.');
  hudLog('board placed');

  // anchor is requested inside the XR frame callback (required by the spec)
  anchor = null;
  if (typeof hit.createAnchor === 'function') {
    anchorState = 'creating';
    hit.createAnchor()
      .then((a) => { anchor = a; anchorState = 'ok'; hudLog('anchor ok'); })
      .catch((err) => { anchorState = 'failed: ' + err.name; hudLog('anchor failed: ' + err.message); });
  } else {
    anchorState = 'unsupported';
    hudLog('anchors unsupported');
  }
}

// ---------------------------------------------------------------- input
function handleTap(kind, x, y) {
  const now = performance.now();
  if (now - lastTapTime < 350) return;               // XR select + DOM tap can both fire: take one
  if (gestures.recentlyGestured()) return;           // ignore the end of a pinch
  lastTapTime = now;

  if (phase === 'placing') {
    if (reticleOk) pendingPlace = true;              // handled inside the next XR frame
    return;
  }

  if (kind === 'xr') raycaster.setFromXRController(controller);
  else raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  pickAndMove();
}

function pickAndMove() {
  const hits = raycaster.intersectObjects(pawns, true);
  if (hits.length) {
    const p = pawnOf(hits[0].object);
    select(p === selected ? null : p);
    return;
  }
  if (!selected) return;

  const hit = raycaster.intersectObject(surface, false)[0];
  if (!hit) return;
  boardRoot.worldToLocal(tmpV.copy(hit.point));
  const sq = localToSquare(tmpV.x, tmpV.z);
  if (!sq) return;
  if (pawns.some((o) => o.userData.col === sq.col && o.userData.row === sq.row)) return;

  selected.userData.col = sq.col;
  selected.userData.row = sq.row;
  selected.userData.target.copy(squareToLocal(sq.col, sq.row));
  select(null);
}

function pawnOf(obj) {
  while (obj && !obj.userData.isPawn) obj = obj.parent;
  return obj;
}

function select(p) {
  if (selected) {
    selected.userData.mat.emissive.setHex(0x000000);
    selected.userData.target.y = SURFACE_Y;
  }
  selected = p;
  if (selected) {
    selected.userData.mat.emissive.setHex(0x0b4a8a);
    selected.userData.target.y = SURFACE_Y + 0.015;
    selectRing.position.copy(squareToLocal(selected.userData.col, selected.userData.row));
    selectRing.position.y = SURFACE_Y + 0.001;
    selectRing.visible = true;
  } else {
    selectRing.visible = false;
  }
}

// ---------------------------------------------------------------- loop
async function setupHitTest(session) {
  try {
    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    await dbg.attach(session, viewerSpace);
    hudLog(`hit-test ready (+${dbg.stats.rays} debug rays)`);
  } catch (err) {
    hudLog('hit-test setup failed: ' + err.message);
  }
}

function render(ts, frame) {
  if (lastTs) fps = fps * 0.9 + (1000 / (ts - lastTs)) * 0.1;
  lastTs = ts;

  if (frame) {
    const refSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (!hitTestSourceRequested) { hitTestSourceRequested = true; setupHitTest(session); }

    if (hitTestSource) {
      const results = frame.getHitTestResults(hitTestSource);
      centerHit = results.length > 0;
      reticleOk = false;
      lastHit = null;
      if (centerHit) {
        const pose = results[0].getPose(refSpace);
        if (pose) {
          lastHit = results[0];
          reticle.matrix.fromArray(pose.transform.matrix);
          reticle.matrixWorldNeedsUpdate = true;
          reticleOk = reticle.matrix.elements[5] > 0.85;     // horizontal surfaces only
        }
      }
    }

    const placing = phase === 'placing';
    reticle.visible = placing && reticleOk;
    ghost.visible = placing && reticleOk;
    if (ghost.visible) {
      ghost.matrix.copy(reticle.matrix);
      ghost.matrixWorldNeedsUpdate = true;
      ghost.updateMatrixWorld(true);
      ghostInner.rotation.y = yawTowardCamera(ghost);
      ghostInner.scale.setScalar(boardRoot.scale.x);
    }

    if (pendingPlace) {
      pendingPlace = false;
      if (placing && reticleOk && lastHit) placeBoard(lastHit);
    }

    if (debugOn && dbg.ready) dbg.update(frame, refSpace);

    if (anchor && useAnchor && phase === 'playing') {
      const pose = frame.getPose(anchor.anchorSpace, refSpace);
      anchorPoseOk = !!pose;
      if (pose) {
        placement.matrix.fromArray(pose.transform.matrix);
        placement.matrixWorldNeedsUpdate = true;
      }
    }
  }

  for (const p of pawns) p.position.lerp(p.userData.target, 0.25);   // smooth slide

  renderer.render(scene, camera);

  if (debugOn && ts - lastHudTs > 250) { lastHudTs = ts; updateHud(frame); }
}

function updateHud(frame) {
  const f = (n) => (Number.isFinite(n) ? n.toFixed(2) : 'NaN');
  const session = renderer.xr.getSession();
  const L = [];
  L.push(`fps ${fps.toFixed(0)}  phase ${phase}  scale ${boardRoot.scale.x.toFixed(2)}`);
  L.push(`features: ${(session?.enabledFeatures ?? ['?']).join(', ')}`);
  L.push(`hit-test: ${hitTestSource ? 'ok' : 'none'}  centre ray: ${centerHit ? 'HIT' : 'miss'}  fan: ${dbg.stats.hits}/${dbg.stats.rays}`);
  L.push(`reticle: ${reticleOk ? 'horizontal OK' : 'no valid surface'}  pos ${f(reticle.matrix.elements[12])},${f(reticle.matrix.elements[13])},${f(reticle.matrix.elements[14])}`);
  L.push(`cloud: ${dbg.stats.points} pts   planes: ${dbg.stats.planes < 0 ? 'n/a (no plane-detection)' : dbg.stats.planes}`);

  boardRoot.getWorldPosition(tmpV);
  tmpM.copy(camera.matrixWorld).invert();
  tmpV2.copy(tmpV).applyMatrix4(tmpM);
  const front = tmpV2.z < 0;
  L.push(`board world: ${f(tmpV.x)},${f(tmpV.y)},${f(tmpV.z)}`);
  L.push(`board in cam: x${f(tmpV2.x)} y${f(tmpV2.y)} z${f(tmpV2.z)}  ${front ? 'IN FRONT' : 'BEHIND'}  d=${f(tmpV2.length())}m`);
  L.push(`visible: placement=${placement.visible} root=${boardRoot.visible} surface=${surface.visible}  yaw=${(boardRoot.rotation.y * 57.3).toFixed(0)}°`);
  L.push(`anchor: ${anchorState}${anchor ? (anchorPoseOk ? ' (tracking)' : ' (no pose)') : ''}  use=${useAnchor}`);
  L.push('-- log --');
  L.push(...logLines);
  hudEl.textContent = L.join('\n');
}