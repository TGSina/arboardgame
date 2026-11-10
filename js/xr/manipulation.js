import * as THREE from 'three';
import { SCALE } from '../config.js';

export const MAX_TABLE_OFFSET = 0.6;

export class BoardManipulation {
  constructor({ camera, getXRCamera, placement, boardRoot, setBoardScale, getViewport = () => ({ width: innerWidth, height: innerHeight }) }) {
    this.camera = camera;
    this.getXRCamera = getXRCamera;
    this.placement = placement;
    this.boardRoot = boardRoot;
    this.setBoardScale = setBoardScale;
    this.getViewport = getViewport;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.dragPlane = new THREE.Plane();
    this.dragStart = new THREE.Vector3();
    this.dragPoint = new THREE.Vector3();
    this.boardStart = new THREE.Vector3();
    this.anchorPosition = new THREE.Vector3();
    this.targetWorld = new THREE.Vector3();
    this.inverseAnchor = new THREE.Matrix4();
    this.dragActive = false;
    this.transformBase = null;
  }

  #setRay(x, y) {
    const { width, height } = this.getViewport();
    if (!width || !height) return false;
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    const xrCamera = this.getXRCamera?.();
    this.raycaster.setFromCamera(this.ndc, xrCamera?.cameras?.[0] ?? this.camera);
    return true;
  }

  beginDrag(x, y) {
    this.placement.group.updateWorldMatrix(true, false);
    this.boardRoot.updateWorldMatrix(true, false);
    this.boardRoot.getWorldPosition(this.boardStart);
    this.dragPlane.setFromNormalAndCoplanarPoint(
      new THREE.Vector3(0, 1, 0),
      this.boardStart
    );
    if (!this.#setRay(x, y) || !this.raycaster.ray.intersectPlane(this.dragPlane, this.dragStart)) {
      this.dragActive = false;
      return false;
    }
    this.dragActive = true;
    return true;
  }

  dragTo(x, y) {
    if (!this.dragActive || !this.#setRay(x, y)) return false;
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) return false;

    this.placement.group.updateWorldMatrix(true, false);
    this.anchorPosition.setFromMatrixPosition(this.placement.group.matrixWorld);
    this.targetWorld.copy(this.boardStart).add(this.dragPoint).sub(this.dragStart);
    let offsetX = this.targetWorld.x - this.anchorPosition.x;
    let offsetZ = this.targetWorld.z - this.anchorPosition.z;
    const distance = Math.hypot(offsetX, offsetZ);
    if (distance > MAX_TABLE_OFFSET) {
      const ratio = MAX_TABLE_OFFSET / distance;
      offsetX *= ratio;
      offsetZ *= ratio;
    }
    this.targetWorld.set(this.anchorPosition.x + offsetX, this.boardStart.y, this.anchorPosition.z + offsetZ);
    this.inverseAnchor.copy(this.placement.group.matrixWorld).invert();
    this.boardRoot.position.copy(this.targetWorld.applyMatrix4(this.inverseAnchor));
    this.boardRoot.updateWorldMatrix(true, false);
    return true;
  }

  endDrag() {
    this.dragActive = false;
  }

  startTransform() {
    this.transformBase = {
      yaw: this.boardRoot.rotation.y,
      scale: this.boardRoot.scale.x
    };
  }

  transform({ ratio, angleDelta }) {
    if (!this.transformBase) return;
    this.boardRoot.rotation.y = this.transformBase.yaw + angleDelta;
    this.setBoardScale(THREE.MathUtils.clamp(
      this.transformBase.scale * ratio,
      SCALE.MIN,
      SCALE.MAX
    ));
  }

  resetTransform() {
    this.endDrag();
    this.transformBase = null;
    this.boardRoot.position.set(0, 0, 0);
    this.boardRoot.rotation.set(0, this.placement.state.baseYaw ?? 0, 0);
    this.setBoardScale(1);
  }
}
