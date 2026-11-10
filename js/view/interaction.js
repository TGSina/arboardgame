import * as THREE from 'three';
import { colRowToSquare } from '../core/squares.js';
import { localToSquare } from './board.js';

export function createInteraction({ camera, getXRCamera, controller, content, game, hints, animator, hud, onPromotionRequired, onStatus, onGameOver, selectionDebug = false }) {
  const { boardRoot, surface, boardView } = content;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const localPoint = new THREE.Vector3();
  let selectedSquare = null;
  let pendingPromotion = null;
  let showSelectionDebug = selectionDebug;

  function pieceAt(square) {
    return game.pieces().find((piece) => piece.square === square) ?? null;
  }

  function clearSelection() {
    selectedSquare = null;
    hints.clearTargets();
    hints.setSelected(null);
  }

  function selectPiece(piece) {
    selectedSquare = piece.square;
    hints.setSelected(piece.square);
    hints.setTargets(game.legalTargetsFrom(piece.square));
  }

  function snapshotPieces() {
    const snapshot = new Map();
    for (const piece of game.pieces()) {
      const instance = boardView.getPieceInstance(piece.id);
      if (!instance) continue;
      snapshot.set(piece.id, {
        type: piece.type,
        color: piece.color,
        x: instance.position.x,
        y: instance.position.y,
        z: instance.position.z
      });
    }
    return snapshot;
  }

  function attemptMove(to, promotion) {
    if (!selectedSquare || animator.busy || pendingPromotion || game.status().over) return null;
    const candidates = game.legalMovesFrom(selectedSquare).filter((move) => move.to === to);
    if (candidates.length === 0) {
      hud.flashStatus('Illegal move');
      return { ok: false, reason: 'illegal' };
    }

    if (candidates.some((move) => move.promotion) && !promotion) {
      pendingPromotion = { from: selectedSquare, to };
      onPromotionRequired?.(game.turn());
      return { ok: false, reason: 'promotion-required' };
    }

    const before = snapshotPieces();
    const result = game.tryMove(selectedSquare, to, promotion);
    if (!result.ok) {
      hud.flashStatus(result.reason === 'promotion-required' ? 'Choose a promotion piece' : 'Illegal move');
      return result;
    }

    clearSelection();
    hints.setLastMove(result.move);
    boardView.syncFrom(game);
    animator.start(result.move, before);
    hints.setCheckedKing?.(result.status.inCheck ? game.kingSquare(result.status.inCheck) : null);
    hud.setCheck?.(result.status.state === 'check');
    if (onStatus) onStatus(result.status, result.move.san);
    else hud.setStatus(`${result.status.turn[0].toUpperCase() + result.status.turn.slice(1)} to move${result.status.state === 'check' ? ' - check' : ''}.`);
    if (result.status.over) onGameOver?.(result.status);
    return result;
  }

  function tapPiece(square) {
    if (animator.busy || pendingPromotion || game.status().over) return false;
    const piece = pieceAt(square);
    if (!piece) return false;

    if (!selectedSquare) {
      if (piece.color !== game.turn()) return false;
      selectPiece(piece);
      return true;
    }

    if (piece.square === selectedSquare) {
      clearSelection();
      return true;
    }

    if (piece.color === game.turn()) {
      selectPiece(piece);
      return true;
    }

    return attemptMove(piece.square);
  }

  function tapSquare(square) {
    if (animator.busy || pendingPromotion || game.status().over) return null;
    if (!selectedSquare) {
      const piece = pieceAt(square);
      if (piece?.color === game.turn()) selectPiece(piece);
      return null;
    }
    if (square === selectedSquare) {
      clearSelection();
      return null;
    }
    return attemptMove(square);
  }

  function choosePromotion(piece) {
    if (!pendingPromotion || animator.busy) return null;
    selectedSquare = pendingPromotion.from;
    const { to } = pendingPromotion;
    pendingPromotion = null;
    return attemptMove(to, piece);
  }

  function cancelPromotion() {
    if (!pendingPromotion) return false;
    pendingPromotion = null;
    clearSelection();
    return true;
  }

  function pick(kind, x, y) {
    if (animator.busy || pendingPromotion || game.status().over) return;
    if (kind === 'xr') {
      raycaster.setFromXRController(controller);
    } else {
      ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
      const xrCamera = getXRCamera?.();
      const viewCamera = xrCamera?.cameras?.[0] ?? camera;
      raycaster.setFromCamera(ndc, viewCamera);
    }

    const surfaceHit = raycaster.intersectObject(surface, false)[0];
    if (!surfaceHit) return;
    boardRoot.worldToLocal(localPoint.copy(surfaceHit.point));
    const square = localToSquare(localPoint.x, localPoint.z);
    if (!square) return;

    const squareName = colRowToSquare(square.col, square.row);
    const piece = pieceAt(squareName);
    if (showSelectionDebug) {
      hud.log?.(`tap ${squareName}${piece ? ` (${piece.color} ${piece.type})` : ' (empty)'}`);
    }
    if (piece) tapPiece(squareName);
    else tapSquare(squareName);
  }

  return {
    pick,
    tapPiece,
    tapSquare,
    choosePromotion,
    cancelPromotion,
    clearSelection,
    setSelectionDebug(on) {
      showSelectionDebug = on;
      hints.setSelectionDebug?.(on);
    },
    get selectedSquare() { return selectedSquare; },
    get promotionPending() { return pendingPromotion !== null; },
    get busy() { return animator.busy || pendingPromotion !== null; }
  };
}
