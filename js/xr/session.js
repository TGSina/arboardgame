// WebXR session owner: renderer, camera, scene, AR button, centre-ray hit test, frame loop and perf stats.
// Other modules subscribe with onXRFrame / onTick / onAfterRender instead of owning a render loop.
import * as THREE from 'three';
import { ARButton } from '../../lib/three/addons/webxr/ARButton.js';

export function createXRSession({ overlay, log = () => {} }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 20);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.8));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['anchors', 'plane-detection', 'dom-overlay'],
    domOverlay: { root: overlay }
  }));

  // ---- centre-ray hit test state (refreshed every XR frame) ----
  const hit = {
    source: null,            // XRHitTestSource
    viewerSpace: null,
    centerHit: false,        // the centre ray hit something this frame
    hasPose: false,          // a pose was available this frame
    ok: false,               // ...and the surface is horizontal
    last: null,              // XRHitTestResult of this frame (only valid inside the frame callback)
    matrix: new THREE.Matrix4()   // last known hit pose (kept when a frame has no hit)
  };

  // ---- perf stats (read by the debug HUD) ----
  const perf = { fps: 0, frameMs: 0, maxMs: 0, cpuMs: 0, calls: 0, triangles: 0, geometries: 0, textures: 0, heapMB: null };
  let lastTs = 0, windowStart = 0, windowMax = 0;

  const frameCbs = [], tickCbs = [], afterCbs = [], startCbs = [], endCbs = [], hitReadyCbs = [];
  let hitRequested = false;

  async function setupHitTest(xrSession) {
    try {
      hit.viewerSpace = await xrSession.requestReferenceSpace('viewer');
      hit.source = await xrSession.requestHitTestSource({ space: hit.viewerSpace });
      log('hit-test ready');
      hitReadyCbs.forEach((cb) => cb(xrSession, hit.viewerSpace));
    } catch (err) {
      log('hit-test setup failed: ' + err.message);
    }
  }

  function updateHit(frame, refSpace) {
    if (!hit.source) return;
    const results = frame.getHitTestResults(hit.source);
    hit.centerHit = results.length > 0;
    hit.hasPose = false;
    hit.ok = false;
    hit.last = null;
    if (!hit.centerHit) return;
    const pose = results[0].getPose(refSpace);
    if (!pose) return;
    hit.last = results[0];
    hit.matrix.fromArray(pose.transform.matrix);
    hit.hasPose = true;
    hit.ok = hit.matrix.elements[5] > 0.85;      // horizontal surfaces only
  }

  function updatePerfInterval(ts) {
    if (lastTs) {
      const dt = ts - lastTs;
      perf.fps = perf.fps * 0.9 + (1000 / dt) * 0.1;
      perf.frameMs = perf.frameMs * 0.9 + dt * 0.1;
      if (dt > windowMax) windowMax = dt;
      if (ts - windowStart > 1000) { perf.maxMs = windowMax; windowMax = 0; windowStart = ts; }
    }
    lastTs = ts;
  }

  function updatePerfCost(cpuStart) {
    perf.cpuMs = perf.cpuMs * 0.9 + (performance.now() - cpuStart) * 0.1;
    const info = renderer.info;
    perf.calls = info.render.calls;
    perf.triangles = info.render.triangles;
    perf.geometries = info.memory.geometries;
    perf.textures = info.memory.textures;
    perf.heapMB = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
  }

  renderer.xr.addEventListener('sessionstart', () => startCbs.forEach((cb) => cb()));
  renderer.xr.addEventListener('sessionend', () => {
    hit.source?.cancel?.();
    hit.source = null;
    hit.viewerSpace = null;
    hit.centerHit = hit.hasPose = hit.ok = false;
    hit.last = null;
    hitRequested = false;
    endCbs.forEach((cb) => cb());
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  renderer.setAnimationLoop((ts, frame) => {
    const cpuStart = performance.now();
    updatePerfInterval(ts);

    if (frame) {
      const refSpace = renderer.xr.getReferenceSpace();
      if (!hitRequested) { hitRequested = true; setupHitTest(renderer.xr.getSession()); }
      updateHit(frame, refSpace);
      for (const cb of frameCbs) cb(ts, frame, refSpace);
    }
    for (const cb of tickCbs) cb(ts);

    renderer.render(scene, camera);

    updatePerfCost(cpuStart);
    for (const cb of afterCbs) cb(ts, frame);
  });

  return {
    scene, camera, renderer, hit, perf,
    get session() { return renderer.xr.getSession(); },
    onXRFrame: (cb) => frameCbs.push(cb),        // (ts, frame, refSpace) only while in an XR session
    onTick: (cb) => tickCbs.push(cb),            // (ts) every frame, XR or not, before render
    onAfterRender: (cb) => afterCbs.push(cb),    // (ts, frame) after render
    onSessionStart: (cb) => startCbs.push(cb),
    onSessionEnd: (cb) => endCbs.push(cb),
    onHitTestReady: (cb) => hitReadyCbs.push(cb) // (xrSession, viewerSpace)
  };
}
