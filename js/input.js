// Tap + two-finger pinch detection on a DOM element (works inside WebXR DOM overlay).
export function setupGestures(el, cb) {
  const pointers = new Map();
  let pinchStart = 0, tap = null, lastGestureTime = 0;

  const dist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  // stop the 2nd finger from also producing an XR "select"
  el.addEventListener('beforexrselect', (e) => { if (pointers.size >= 1) e.preventDefault(); });

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) tap = { x: e.clientX, y: e.clientY, t: performance.now(), ok: true };
    if (pointers.size === 2) {
      if (tap) tap.ok = false;
      pinchStart = dist();
      cb.onPinchStart?.();
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) tap.ok = false;
    if (pointers.size === 2 && pinchStart > 0) {
      lastGestureTime = performance.now();
      cb.onPinch(dist() / pinchStart);
    }
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const wasPinch = pointers.size >= 2;
    pointers.delete(e.pointerId);
    if (wasPinch) {
      lastGestureTime = performance.now();
      if (pointers.size < 2) cb.onPinchEnd?.();
    } else if (e.type === 'pointerup' && tap?.ok && performance.now() - tap.t < 500) {
      cb.onTap(e.clientX, e.clientY);
    }
    if (pointers.size === 0) tap = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return { recentlyGestured: () => performance.now() - lastGestureTime < 450 };
}