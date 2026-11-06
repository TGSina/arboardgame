import * as THREE from 'three';
import { SQUARE, SURFACE_Y } from './board.js';
import { createPieceGeometry, createPieceMaterials, OUTLINE_SCALE, PIECE_TYPES } from './pieces.js';

const COLORS = ['white', 'black'];
const MAX_PIECES_PER_BATCH = 64;
const MAX_PIECES = 32;

export class BoardView {
  constructor(game) {
    this.root = new THREE.Group();
    this.root.name = 'pieces';
    this.batches = new Map();
    this.pieceInstances = new Map();
    this.transform = new THREE.Object3D();
    this.pickIds = [];
    this.pickMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.019, 0.021, 0.075, 8),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      MAX_PIECES
    );
    this.pickMesh.name = 'piece-pickers';
    this.pickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pickMesh.frustumCulled = false;
    this.pickMesh.count = 0;
    this.root.add(this.pickMesh);

    this.captureGhost = new THREE.Mesh(
      createPieceGeometry('p'),
      new THREE.MeshStandardMaterial({ color: 0xfff2d6, transparent: true, depthWrite: false, roughness: 0.38 })
    );
    this.captureGhost.name = 'capture-animation';
    this.captureGhost.visible = false;
    this.root.add(this.captureGhost);

    this.promotionGhost = new THREE.Mesh(
      createPieceGeometry('p'),
      new THREE.MeshStandardMaterial({ color: 0xfff2d6, transparent: true, depthWrite: false, roughness: 0.38 })
    );
    this.promotionGhost.name = 'promotion-animation';
    this.promotionGhost.visible = false;
    this.root.add(this.promotionGhost);

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
    this.pickIds.length = 0;
    this.pickMesh.count = 0;
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
      const pickInstanceId = this.pickMesh.count++;
      batch.ids[instanceId] = piece.id;
      this.pickIds[pickInstanceId] = piece.id;

      this.transform.position.set(
        (piece.col - 3.5) * SQUARE,
        SURFACE_Y,
        (piece.row - 3.5) * SQUARE
      );
      this.transform.rotation.set(0, piece.type === 'n' && piece.color === 'black' ? Math.PI : 0, 0);
      this.transform.scale.setScalar(1);
      this.transform.updateMatrix();
      batch.surface.setMatrixAt(instanceId, this.transform.matrix);
      const position = this.transform.position.clone();
      const rotationY = this.transform.rotation.y;

      this.transform.scale.setScalar(OUTLINE_SCALE);
      this.transform.updateMatrix();
      batch.outline.setMatrixAt(instanceId, this.transform.matrix);

      this.transform.position.y += 0.0375;
      this.transform.rotation.set(0, 0, 0);
      this.transform.scale.setScalar(1);
      this.transform.updateMatrix();
      this.pickMesh.setMatrixAt(pickInstanceId, this.transform.matrix);

      this.pieceInstances.set(piece.id, {
        batch, instanceId, pickInstanceId, type: piece.type, color: piece.color,
        position, rotationY
      });
    }

    for (const batch of this.batches.values()) {
      batch.surface.userData.pieceIds = batch.ids;
      batch.outline.userData.pieceIds = batch.ids;
      batch.surface.instanceMatrix.needsUpdate = true;
      batch.outline.instanceMatrix.needsUpdate = true;
    }
    this.pickMesh.instanceMatrix.needsUpdate = true;
  }

  getPieceInstance(id) {
    return this.pieceInstances.get(id) ?? null;
  }

  getPieceIdAtPick(instanceId) {
    return this.pickIds[instanceId] ?? null;
  }

  setPiecePose(id, x, y, z, rotationY, scale = 1) {
    const piece = this.pieceInstances.get(id);
    if (!piece) return false;

    piece.position.set(x, y, z);
    piece.rotationY = rotationY;
    this.transform.position.copy(piece.position);
    this.transform.rotation.set(0, rotationY, 0);
    this.transform.scale.setScalar(scale);
    this.transform.updateMatrix();
    piece.batch.surface.setMatrixAt(piece.instanceId, this.transform.matrix);

    this.transform.scale.setScalar(scale * OUTLINE_SCALE);
    this.transform.updateMatrix();
    piece.batch.outline.setMatrixAt(piece.instanceId, this.transform.matrix);
    piece.batch.surface.instanceMatrix.needsUpdate = true;
    piece.batch.outline.instanceMatrix.needsUpdate = true;

    this.transform.position.y += 0.0375;
    this.transform.rotation.set(0, 0, 0);
    this.transform.scale.setScalar(1);
    this.transform.updateMatrix();
    this.pickMesh.setMatrixAt(piece.pickInstanceId, this.transform.matrix);
    this.pickMesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  showCaptureGhost(type, color, x, y, z) {
    this.captureGhost.geometry = createPieceGeometry(type);
    this.captureGhost.material.color.setHex(color === 'white' ? 0xfff2d6 : 0x24242c);
    this.captureGhost.material.opacity = 1;
    this.captureGhost.position.set(x, y, z);
    this.captureGhost.scale.setScalar(1);
    this.captureGhost.visible = true;
  }

  setCaptureGhostProgress(progress) {
    const scale = 1 - progress;
    this.captureGhost.scale.setScalar(scale);
    this.captureGhost.material.opacity = scale;
    if (progress >= 1) this.captureGhost.visible = false;
  }

  showPromotionGhost(type, color, x, y, z) {
    this.promotionGhost.geometry = createPieceGeometry(type);
    this.promotionGhost.material.color.setHex(color === 'white' ? 0xfff2d6 : 0x24242c);
    this.promotionGhost.material.opacity = 1;
    this.promotionGhost.position.set(x, y, z);
    this.promotionGhost.scale.setScalar(1);
    this.promotionGhost.visible = true;
  }

  setPromotionGhostPose(x, y, z, progress) {
    const scale = progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2;
    this.promotionGhost.position.set(x, y, z);
    this.promotionGhost.scale.setScalar(scale);
    this.promotionGhost.material.opacity = scale;
    if (progress >= 1) this.promotionGhost.visible = false;
  }
}