import * as THREE from 'three';
import { SQUARE, SURFACE_Y } from './board.js';
import { createPieceGeometry, createPieceMaterials, OUTLINE_SCALE, PIECE_TYPES } from './pieces.js';

const COLORS = ['white', 'black'];
const MAX_PIECES_PER_BATCH = 64;

export class BoardView {
  constructor(game) {
    this.root = new THREE.Group();
    this.root.name = 'pieces';
    this.batches = new Map();
    this.pieceInstances = new Map();
    this.transform = new THREE.Object3D();

    for (const color of COLORS) {
      const materials = createPieceMaterials(color);
      for (const type of PIECE_TYPES) {
        const key = `${color}-${type}`;
        const geometry = createPieceGeometry(type);
        const surface = new THREE.InstancedMesh(geometry, materials.surface, MAX_PIECES_PER_BATCH);
        const outline = new THREE.InstancedMesh(geometry, materials.outline, MAX_PIECES_PER_BATCH);
        const ids = [];

        surface.name = `pieces-${key}`;
        outline.name = `outlines-${key}`;
        surface.userData.pieceIds = ids;
        outline.userData.pieceIds = ids;
        surface.castShadow = true;
        surface.receiveShadow = true;
        surface.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        outline.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        surface.frustumCulled = false;
        outline.frustumCulled = false;
        surface.count = 0;
        outline.count = 0;
        this.root.add(surface, outline);
        this.batches.set(key, { color, type, ids, surface, outline });
      }
    }

    this.syncFrom(game);
  }

  syncFrom(game) {
    this.pieceInstances.clear();
    for (const batch of this.batches.values()) {
      batch.ids.length = 0;
      batch.surface.count = 0;
      batch.outline.count = 0;
    }

    for (const piece of game.pieces()) {
      const batch = this.batches.get(`${piece.color}-${piece.type}`);
      if (!batch) throw new Error(`Unsupported piece in game state: ${piece.color} ${piece.type}`);
      if (batch.surface.count >= MAX_PIECES_PER_BATCH) {
        throw new Error(`Too many ${piece.color} ${piece.type} pieces to render`);
      }

      const instanceId = batch.surface.count++;
      batch.outline.count++;
      batch.ids[instanceId] = piece.id;

      this.transform.position.set(
        (piece.col - 3.5) * SQUARE,
        SURFACE_Y,
        (piece.row - 3.5) * SQUARE
      );
      this.transform.rotation.set(0, piece.type === 'n' && piece.color === 'black' ? Math.PI : 0, 0);
      this.transform.scale.setScalar(1);
      this.transform.updateMatrix();
      batch.surface.setMatrixAt(instanceId, this.transform.matrix);

      this.transform.scale.setScalar(OUTLINE_SCALE);
      this.transform.updateMatrix();
      batch.outline.setMatrixAt(instanceId, this.transform.matrix);

      this.pieceInstances.set(piece.id, { batch, instanceId, type: piece.type, color: piece.color });
    }

    for (const batch of this.batches.values()) {
      batch.surface.userData.pieceIds = batch.ids;
      batch.outline.userData.pieceIds = batch.ids;
      batch.surface.instanceMatrix.needsUpdate = true;
      batch.outline.instanceMatrix.needsUpdate = true;
    }
  }

  getPieceInstance(id) {
    return this.pieceInstances.get(id) ?? null;
  }
}