// Composes the debug HUD text (perf stats, hit-test state, board pose, anchor state, log).
import * as THREE from 'three';

export function createDebugHud({ app, placement, dbg, content, hud }) {
  const { camera, hit, perf } = app;
  const { boardRoot, surface } = content;
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();
  const f = (n) => (Number.isFinite(n) ? n.toFixed(2) : 'NaN');

  function update() {
    const state = placement.state;
    const session = app.session;
    const e = hit.matrix.elements;
    const L = [];

    L.push(`fps ${perf.fps.toFixed(0)}  frame ${perf.frameMs.toFixed(1)}ms (max ${perf.maxMs.toFixed(0)})  cpu ${perf.cpuMs.toFixed(1)}ms`);
    L.push(`draws ${perf.calls}  tris ${(perf.triangles / 1000).toFixed(1)}k  geo ${perf.geometries}  tex ${perf.textures}  heap ${perf.heapMB === null ? 'n/a' : perf.heapMB.toFixed(0) + 'MB'}`);
    L.push(`phase ${state.phase}  scale ${boardRoot.scale.x.toFixed(2)}`);
    L.push(`features: ${(session?.enabledFeatures ?? ['?']).join(', ')}`);
    L.push(`hit-test: ${hit.source ? 'ok' : 'none'}  centre ray: ${hit.centerHit ? 'HIT' : 'miss'}  fan: ${dbg.stats.hits}/${dbg.stats.rays}`);
    L.push(`reticle: ${hit.ok ? 'horizontal OK' : 'no valid surface'}  pos ${f(e[12])},${f(e[13])},${f(e[14])}`);
    L.push(`cloud: ${dbg.stats.points} pts   planes: ${dbg.stats.planes < 0 ? 'n/a (no plane-detection)' : dbg.stats.planes}`);

    boardRoot.getWorldPosition(tmpV);
    tmpM.copy(camera.matrixWorld).invert();
    tmpV2.copy(tmpV).applyMatrix4(tmpM);
    L.push(`board world: ${f(tmpV.x)},${f(tmpV.y)},${f(tmpV.z)}`);
    L.push(`board in cam: x${f(tmpV2.x)} y${f(tmpV2.y)} z${f(tmpV2.z)}  ${tmpV2.z < 0 ? 'IN FRONT' : 'BEHIND'}  d=${f(tmpV2.length())}m`);
    L.push(`visible: placement=${placement.group.visible} root=${boardRoot.visible} surface=${surface.visible}  yaw=${(boardRoot.rotation.y * 57.3).toFixed(0)}°`);
    L.push(`anchor: ${state.anchorState}${state.anchor ? (state.anchorPoseOk ? ' (tracking)' : ' (no pose)') : ''}  use=${state.useAnchor}`);
    L.push('-- log --');
    L.push(...hud.getLog());
    hud.render(L.join('\n'));
  }

  return { update };
}
