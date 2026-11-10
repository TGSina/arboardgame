import { squareToColRow } from '../core/squares.js';
import { SQUARE, SURFACE_Y } from './board.js';

const KNIGHT_ARC = 0.024;

function localPosition(square) {
  const { col, row } = squareToColRow(square);
  return { x: (col - 3.5) * SQUARE, y: SURFACE_Y, z: (row - 3.5) * SQUARE };
}

export class MoveAnimator {
  constructor({ boardView, duration = 340, onComplete = () => {} }) {
    this.boardView = boardView;
    this.duration = duration;
    this.onComplete = onComplete;
    this.actions = [];
    this.startedAt = null;
    this.active = false;
  }

  get busy() { return this.active; }

  cancel() {
    this.actions.length = 0;
    this.startedAt = null;
    this.active = false;
    this.boardView.captureGhost.visible = false;
    this.boardView.promotionGhost.visible = false;
  }

  start(move, beforePieces) {
    this.actions.length = 0;
    this.startedAt = null;
    this.active = true;

    this.#addAction(move.pieceId, move.to, beforePieces.get(move.pieceId), move.promotion);
    if (move.rook) this.#addAction(move.rook.id, move.rook.to, beforePieces.get(move.rook.id), null);

    if (move.promotion) {
      const pawn = beforePieces.get(move.pieceId);
      if (pawn) this.boardView.showPromotionGhost(pawn.type, pawn.color, pawn.x, pawn.y, pawn.z);
    }

    if (move.capturedId) {
      const captured = beforePieces.get(move.capturedId);
      if (captured) {
        this.boardView.showCaptureGhost(captured.type, captured.color, captured.x, captured.y, captured.z);
      }
    }
  }

  update(timestamp) {
    if (!this.active) return false;
    if (this.startedAt === null) this.startedAt = timestamp;

    const progress = Math.min(1, (timestamp - this.startedAt) / this.duration);
    const eased = progress * progress * (3 - 2 * progress);
    for (const action of this.actions) {
      const x = action.fromX + (action.toX - action.fromX) * eased;
      const z = action.fromZ + (action.toZ - action.fromZ) * eased;
      const arc = action.type === 'n' ? Math.sin(progress * Math.PI) * KNIGHT_ARC : 0;
      const y = action.fromY + (action.toY - action.fromY) * eased + arc;
      const scale = action.promotion ? Math.max(0, Math.min(1, (progress - 0.8) / 0.2)) : 1;
      this.boardView.setPiecePose(action.id, x, y, z, action.rotationY, scale);
      if (action.promotion) this.boardView.setPromotionGhostPose(x, y, z, progress);
    }
    this.boardView.setCaptureGhostProgress(progress);

    if (progress >= 1) {
      this.active = false;
      this.boardView.setCaptureGhostProgress(1);
      this.onComplete();
    }
    return true;
  }

  #addAction(id, destination, before, promotion) {
    const piece = this.boardView.getPieceInstance(id);
    if (!piece || !before) return;
    const target = localPosition(destination);
    this.actions.push({
      id,
      type: before.type,
      fromX: before.x,
      fromY: before.y,
      fromZ: before.z,
      toX: target.x,
      toY: target.y,
      toZ: target.z,
      rotationY: piece.rotationY,
      promotion: !!promotion
    });
    this.boardView.setPiecePose(id, before.x, before.y, before.z, piece.rotationY);
  }
}