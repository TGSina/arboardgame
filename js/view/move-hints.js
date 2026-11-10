import * as THREE from 'three';
import { SQUARE, SURFACE_Y } from './board.js';
import { squareToColRow } from '../core/squares.js';

const MAX_HINTS = 27;
const HINT_Y = SURFACE_Y + 0.001;
const SELECTED_COLOR = new THREE.Color(0x00d8ff);
const DEBUG_SELECTED_COLOR = new THREE.Color(0xffe34d);
const LAST_FROM_COLOR = new THREE.Color(0xffc857);
const LAST_TO_COLOR = new THREE.Color(0xff7a45);

export class MoveHints {
  constructor({ root }) {
    this.root = new THREE.Group();
    this.root.name = 'move-hints';
    this.transform = new THREE.Object3D();
    this.selectedSquare = null;
    this.lastMove = null;
    this.selectionDebug = false;
    this.checkedSquare = null;

    this.emptyTargets = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.009, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x182018, transparent: true, opacity: 0.48, depthWrite: false }),
      MAX_HINTS
    );
    this.captureTargets = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.012, 0.019, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf04444, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      MAX_HINTS
    );
    this.focus = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.020, 0.024, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
      3
    );
    this.checkPulse = new THREE.Mesh(
      new THREE.RingGeometry(0.026, 0.031, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf04444, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
    );
    this.checkPulse.name = 'checked-king-pulse';
    this.checkPulse.visible = false;

    this.emptyTargets.name = 'empty-move-hints';
    this.captureTargets.name = 'capture-move-hints';
    this.focus.name = 'square-highlights';
    this.emptyTargets.count = 0;
    this.captureTargets.count = 0;
    this.focus.count = 0;
    this.root.add(this.emptyTargets, this.captureTargets, this.focus, this.checkPulse);
    root.add(this.root);
  }

  setTargets(targets) {
    if (targets.length > MAX_HINTS) throw new Error(`Move hint limit exceeded: ${targets.length}`);
    let emptyCount = 0;
    let captureCount = 0;
    for (const target of targets) {
      const instanceId = target.capture ? captureCount++ : emptyCount++;
      const mesh = target.capture ? this.captureTargets : this.emptyTargets;
      this.#setSquareMatrix(mesh, instanceId, target.col, target.row, HINT_Y);
    }
    this.emptyTargets.count = emptyCount;
    this.captureTargets.count = captureCount;
    this.emptyTargets.instanceMatrix.needsUpdate = true;
    this.captureTargets.instanceMatrix.needsUpdate = true;
  }

  clearTargets() {
    this.emptyTargets.count = 0;
    this.captureTargets.count = 0;
  }

  setSelected(square) {
    this.selectedSquare = square;
    this.#updateFocus();
  }

  setSelectionDebug(on) {
    this.selectionDebug = on;
    this.#updateFocus();
  }

  setCheckedKing(square) {
    this.checkedSquare = square;
    this.checkPulse.visible = Boolean(square);
    if (!square) return;
    const checked = squareToColRow(square);
    this.checkPulse.position.set((checked.col - 3.5) * SQUARE, HINT_Y + 0.001, (checked.row - 3.5) * SQUARE);
    this.checkPulse.scale.setScalar(1);
  }

  update(timestamp) {
    if (!this.checkedSquare) return;
    const pulse = (Math.sin(timestamp * 0.007) + 1) / 2;
    this.checkPulse.scale.setScalar(0.86 + pulse * 0.24);
    this.checkPulse.material.opacity = 0.5 + pulse * 0.45;
  }

  setLastMove(move) {
    this.lastMove = move ? { from: move.from, to: move.to } : null;
    this.#updateFocus();
  }

  clear() {
    this.clearTargets();
    this.setSelected(null);
    this.setLastMove(null);
    this.setCheckedKing(null);
  }

  #setSquareMatrix(mesh, instanceId, col, row, y) {
    this.transform.position.set((col - 3.5) * SQUARE, y, (row - 3.5) * SQUARE);
    this.transform.rotation.set(0, 0, 0);
    this.transform.scale.setScalar(1);
    this.transform.updateMatrix();
    mesh.setMatrixAt(instanceId, this.transform.matrix);
  }

  #updateFocus() {
    let count = 0;
    if (this.lastMove) {
      const from = squareToColRow(this.lastMove.from);
      const to = squareToColRow(this.lastMove.to);
      this.#setSquareMatrix(this.focus, count, from.col, from.row, HINT_Y);
      this.focus.setColorAt(count++, LAST_FROM_COLOR);
      this.#setSquareMatrix(this.focus, count, to.col, to.row, HINT_Y);
      this.focus.setColorAt(count++, LAST_TO_COLOR);
    }
    if (this.selectedSquare) {
      const selected = squareToColRow(this.selectedSquare);
      this.#setSquareMatrix(this.focus, count, selected.col, selected.row, HINT_Y);
      this.focus.setColorAt(count++, this.selectionDebug ? DEBUG_SELECTED_COLOR : SELECTED_COLOR);
    }
    this.focus.count = count;
    this.focus.instanceMatrix.needsUpdate = true;
    if (this.focus.instanceColor) this.focus.instanceColor.needsUpdate = true;
  }
}