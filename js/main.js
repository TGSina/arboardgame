import * as THREE from 'three';
import { ARButton } from '../lib/three/addons/webxr/ARButton.js';
import { createBoard, createPawns, squareToLocal, localToSquare } from './board.js';

const overlay = document.getElementById('overlay');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('reset');
const setStatus = (t) => { statusEl.textContent = t; };

let renderer, scene, camera, controller, reticle;
let placement, boardRoot, boardMesh, pawns = [];
let phase = 'placing';                 // 'placing' | 'playing'
let hitTestSource = null, hitTestSourceRequested = false;
let lastHit = null, anchor = null, selected = null;
const raycaster = new THREE.Raycaster();

init();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 20);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(1, 3, 2);
  scene.add(sun);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['anchors', 'dom-overlay'],
    domOverlay: { root: overlay }
  }));

  // Reticle (shows where the board will be placed)
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Board hierarchy
  placement = new THREE.Group();
  placement.matrixAutoUpdate = false;
  placement.visible = false;
  scene.add(placement);

  boardRoot = new THREE.Group();
  placement.add(boardRoot);

  boardMesh = createBoard();
  boardRoot.add(boardMesh);
  pawns = createPawns();
  pawns.forEach((p) => boardRoot.add(p));

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  resetBtn.addEventListener('beforexrselect', (e) => e.preventDefault());
  resetBtn.addEventListener('click', resetPlacement);

  renderer.xr.addEventListener('sessionstart', () => {
    document.body.classList.add('ar-active');
    resetPlacement();
  });
  renderer.xr.addEventListener('sessionend', () => {
    document.body.classList.remove('ar-active');
    hitTestSource = null;
    hitTestSourceRequested = false;
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  renderer.setAnimationLoop(render);
}

function resetPlacement() {
  anchor?.delete?.();
  anchor = null;
  phase = 'placing';
  placement.visible = false;
  resetBtn.hidden = true;
  select(null);
  setStatus('Move the phone slowly to scan a flat surface, then tap to place the board.');
}

async function placeBoard() {
  const hit = lastHit;
  placement.matrix.copy(reticle.matrix);
  placement.matrixWorldNeedsUpdate = true;
  placement.updateMatrixWorld(true);

  // Rotate the board so the "white" side faces the player
  const camPos = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
  const local = placement.worldToLocal(camPos);
  boardRoot.rotation.y = Math.atan2(local.x, local.z);

  placement.visible = true;
  reticle.visible = false;
  phase = 'playing';
  resetBtn.hidden = false;
  setStatus('Tap a pawn to select it, then tap a square to move it.');

  // Anchor = the system keeps the board fixed in the real world as tracking improves
  try {
    anchor = await hit.createAnchor();
  } catch (err) {
    console.warn('Anchors unavailable, board uses fixed pose only', err);
  }
}

function onSelect() {
  if (phase === 'placing') {
    if (reticle.visible && lastHit) placeBoard();
    return;
  }

  raycaster.setFromXRController(controller);

  // 1) tapped a pawn -> select it
  const pawnHits = raycaster.intersectObjects(pawns, true);
  if (pawnHits.length) {
    select(pawnOf(pawnHits[0].object));
    return;
  }

  // 2) tapped the board -> move the selected pawn there
  if (!selected) return;
  const boardHit = raycaster.intersectObject(boardMesh, false)[0];
  if (!boardHit) return;
  const p = boardRoot.worldToLocal(boardHit.point.clone());
  const sq = localToSquare(p.x, p.z);
  if (!sq) return;
  const occupied = pawns.some((o) => o.userData.col === sq.col && o.userData.row === sq.row);
  if (occupied) return;

  selected.userData.col = sq.col;
  selected.userData.row = sq.row;
  selected.userData.target.copy(squareToLocal(sq.col, sq.row));
  select(null);
}

function pawnOf(obj) {
  while (obj && !obj.userData.isPawn) obj = obj.parent;
  return obj;
}

function select(pawn) {
  if (selected) selected.userData.mat.emissive.setHex(0x000000);
  selected = pawn;
  if (selected) selected.userData.mat.emissive.setHex(0x0066ff);
}

function render(timestamp, frame) {
  if (frame) {
    const refSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then((viewerSpace) =>
        session.requestHitTestSource({ space: viewerSpace }).then((src) => { hitTestSource = src; })
      );
      hitTestSourceRequested = true;
    }

    if (phase === 'placing' && hitTestSource) {
      const results = frame.getHitTestResults(hitTestSource);
      if (results.length) {
        lastHit = results[0];
        const pose = lastHit.getPose(refSpace);
        reticle.matrix.fromArray(pose.transform.matrix);
        reticle.matrixWorldNeedsUpdate = true;
        reticle.visible = reticle.matrix.elements[5] > 0.85;   // horizontal surfaces only
      } else {
        lastHit = null;
        reticle.visible = false;
      }
    }

    if (anchor) {
      const pose = frame.getPose(anchor.anchorSpace, refSpace);
      if (pose) {
        placement.matrix.fromArray(pose.transform.matrix);
        placement.matrixWorldNeedsUpdate = true;
      }
    }
  }

  for (const p of pawns) p.position.lerp(p.userData.target, 0.25);   // smooth slide
  renderer.render(scene, camera);
}