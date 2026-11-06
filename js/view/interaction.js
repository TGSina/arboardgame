// Temporary "free move" interaction from the prototype: tap a pawn, then tap a square to move it.
// M3 replaces this with rules-driven selection, legal-move hints and turns.
import * as THREE from 'three';
import { SURFACE_Y, squareToLocal, localToSquare } from './board.js';

export function createInteraction({ camera, controller, content }) {
  const { boardRoot, surface, pawns, selectRing } = content;
  const raycaster = new THREE.Raycaster();
  const tmpV = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  let selected = null;

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

  /** kind: 'xr' (controller ray) or 'dom' (screen tap at x,y in CSS pixels) */
  function pick(kind, x, y) {
    if (kind === 'xr') {
      raycaster.setFromXRController(controller);
    } else {
      ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    }

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

  /** Smooth slide toward each pawn's target position (runs every frame). */
  function animate() {
    for (const p of pawns) p.position.lerp(p.userData.target, 0.25);
  }

  return { pick, select, animate };
}
