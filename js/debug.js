import * as THREE from 'three';
import { FULL_SIZE } from './board.js';

const GRID = 2;          // (2*GRID+1)^2 = 25 debug rays
const SPREAD = 0.22;     // ray fan spread (about ±24° total)
const VOXEL = 0.03;      // 3 cm de-duplication cells
const MAX_POINTS = 4000;

export function createDebug(scene) {
  const root = new THREE.Group();
  root.name = 'debug';
  scene.add(root);

  // axes at the session's world origin
  root.add(new THREE.AxesHelper(0.25));

  // ---- hit-test point cloud ----
  const positions = new Float32Array(MAX_POINTS * 3);
  const colors = new Float32Array(MAX_POINTS * 3);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', colAttr);
  geo.setDrawRange(0, 0);
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.012, vertexColors: true, depthTest: false, transparent: true, opacity: 0.95
  }));
  points.frustumCulled = false;
  points.renderOrder = 999;
  root.add(points);

  const voxels = new Map();
  const keys = new Array(MAX_POINTS);
  let count = 0, ptr = 0;
  const sources = [];
  const stats = { rays: 0, hits: 0, points: 0, planes: -1 };

  function addPoint(x, y, z, horizontal) {
    const key = `${Math.round(x / VOXEL)},${Math.round(y / VOXEL)},${Math.round(z / VOXEL)}`;
    let idx = voxels.get(key);
    if (idx === undefined) {
      if (count < MAX_POINTS) idx = count++;
      else { idx = ptr; ptr = (ptr + 1) % MAX_POINTS; voxels.delete(keys[idx]); }
      keys[idx] = key;
      voxels.set(key, idx);
    }
    positions[idx * 3] = x; positions[idx * 3 + 1] = y; positions[idx * 3 + 2] = z;
    if (horizontal) { colors[idx * 3] = 0.2; colors[idx * 3 + 1] = 1; colors[idx * 3 + 2] = 0.4; }
    else { colors[idx * 3] = 1; colors[idx * 3 + 1] = 0.6; colors[idx * 3 + 2] = 0.1; }
  }

  async function attach(session, viewerSpace) {
    sources.length = 0;
    const jobs = [];
    for (let i = -GRID; i <= GRID; i++) {
      for (let j = -GRID; j <= GRID; j++) {
        const ray = new XRRay({ x: 0, y: 0, z: 0, w: 1 }, { x: i * SPREAD, y: -j * SPREAD, z: -1, w: 0 });
        jobs.push(session.requestHitTestSource({ space: viewerSpace, offsetRay: ray }).catch(() => null));
      }
    }
    sources.push(...(await Promise.all(jobs)).filter(Boolean));
  }

  function detach() {
    sources.forEach((s) => s.cancel?.());
    sources.length = 0;
  }

  function clear() {
    voxels.clear();
    count = 0; ptr = 0;
    geo.setDrawRange(0, 0);
    stats.points = 0;
  }

  // ---- detected planes (only if the browser supports plane-detection) ----
  const planeObjs = new Map();

  function buildPlane(plane) {
    const color = plane.orientation === 'horizontal' ? 0x00ff88 : 0x4aa3ff;
    const pts = plane.polygon;
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;

    let fillGeo;
    try {
      fillGeo = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z))))
        .rotateX(-Math.PI / 2);
    } catch { fillGeo = new THREE.BufferGeometry(); }
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false
    }));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0, p.z)));
    const line = new THREE.LineLoop(lineGeo, new THREE.LineBasicMaterial({ color }));
    group.add(fill, line);
    return {
      group, changed: plane.lastChangedTime,
      dispose() { fillGeo.dispose(); lineGeo.dispose(); fill.material.dispose(); line.material.dispose(); }
    };
  }

  function updatePlanes(frame, refSpace) {
    const set = frame.detectedPlanes;
    if (!set) { stats.planes = -1; return; }
    stats.planes = set.size;
    for (const [plane, o] of planeObjs) {
      if (!set.has(plane)) { root.remove(o.group); o.dispose(); planeObjs.delete(plane); }
    }
    set.forEach((plane) => {
      let o = planeObjs.get(plane);
      if (!o || o.changed !== plane.lastChangedTime) {
        if (o) { root.remove(o.group); o.dispose(); }
        o = buildPlane(plane);
        planeObjs.set(plane, o);
        root.add(o.group);
      }
      const pose = frame.getPose(plane.planeSpace, refSpace);
      o.group.visible = !!pose;
      if (pose) { o.group.matrix.fromArray(pose.transform.matrix); o.group.matrixWorldNeedsUpdate = true; }
    });
  }

  function update(frame, refSpace) {
    stats.rays = sources.length;
    stats.hits = 0;
    for (const src of sources) {
      const r = frame.getHitTestResults(src);
      if (!r.length) continue;
      const pose = r[0].getPose(refSpace);
      if (!pose) continue;
      stats.hits++;
      const m = pose.transform.matrix;
      addPoint(m[12], m[13], m[14], m[5] > 0.85);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.setDrawRange(0, count);
    stats.points = count;
    updatePlanes(frame, refSpace);
  }

  return {
    root, stats, attach, detach, clear, update,
    get ready() { return sources.length > 0; },
    setVisible(v) { root.visible = v; }
  };
}

// axes + beacon pole + bounding box, attached to the board so they scale with it
export function createBoardDebug() {
  const g = new THREE.Group();
  g.add(new THREE.AxesHelper(0.3));

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff00ff })
  );
  pole.position.y = 0.4;
  g.add(pole);

  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(FULL_SIZE, 0.05, FULL_SIZE)),
    new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false })
  );
  box.position.y = 0.025;
  box.renderOrder = 998;
  g.add(box);
  return g;
}