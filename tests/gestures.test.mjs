import test from 'node:test';
import assert from 'node:assert/strict';
import { setupGestures } from '../js/xr/gestures.js';

function makeElement() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const entries = listeners.get(type) ?? [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    setPointerCapture() {},
    dispatch(type, properties = {}) {
      for (const listener of listeners.get(type) ?? []) {
        listener({ type, preventDefault() {}, ...properties });
      }
    }
  };
}

const pointer = (pointerId, clientX, clientY) => ({ pointerId, clientX, clientY });

test('one-finger movement emits drag and suppresses tap', () => {
  const element = makeElement();
  const drags = [];
  let taps = 0;
  setupGestures(element, {
    onDrag: (x, y) => drags.push([x, y]),
    onTap: () => taps++
  });

  element.dispatch('pointerdown', pointer(1, 10, 10));
  element.dispatch('pointermove', pointer(1, 28, 12));
  element.dispatch('pointerup', pointer(1, 28, 12));

  assert.deepEqual(drags, [[28, 12]]);
  assert.equal(taps, 0);
});

test('two-finger movement reports pinch ratio and twist angle', () => {
  const element = makeElement();
  let transform;
  setupGestures(element, { onTransform: (value) => { transform = value; } });

  element.dispatch('pointerdown', pointer(1, 10, 10));
  element.dispatch('pointerdown', pointer(2, 30, 10));
  element.dispatch('pointermove', pointer(2, 10, 30));

  assert.ok(Math.abs(transform.ratio - 1) < 1e-6);
  assert.ok(Math.abs(transform.angleDelta - Math.PI / 2) < 1e-6);
  assert.deepEqual([transform.centerX, transform.centerY], [10, 20]);
});
