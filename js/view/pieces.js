import * as THREE from 'three';

export const PIECE_TYPES = Object.freeze(['p', 'r', 'n', 'b', 'q', 'k']);

const GEOMETRIES = new Map();
const MATERIALS = new Map();
const LATHE_SEGMENTS = 24;
const OUTLINE_SCALE = 1.12;

function lathe(points) {
  return new THREE.LatheGeometry(points.map(([radius, y]) => new THREE.Vector2(radius, y)), LATHE_SEGMENTS);
}

function mergeParts(parts) {
  const attributes = { position: [], normal: [], uv: [] };

  for (const { geometry, position = [0, 0, 0], rotation = [0, 0, 0] } of parts) {
    const transformed = geometry.clone();
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(1, 1, 1)
    );
    transformed.applyMatrix4(transform);
    const flat = transformed.index ? transformed.toNonIndexed() : transformed;

    for (const name of Object.keys(attributes)) {
      const attribute = flat.getAttribute(name);
      if (attribute) attributes[name].push(...attribute.array);
    }

    if (flat !== transformed) flat.dispose();
    transformed.dispose();
    geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(attributes.position, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(attributes.normal, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(attributes.uv, 2));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function createPawnGeometry() {
  return mergeParts([
    { geometry: lathe([[0, 0], [0.012, 0], [0.015, 0.002], [0.016, 0.004], [0.011, 0.008], [0.0065, 0.014], [0.008, 0.018], [0.006, 0.022], [0, 0.023]]) },
    { geometry: new THREE.SphereGeometry(0.0075, 16, 12), position: [0, 0.028, 0] }
  ]);
}

function createRookGeometry() {
  return mergeParts([
    { geometry: lathe([[0, 0], [0.014, 0], [0.018, 0.002], [0.018, 0.005], [0.011, 0.009], [0.009, 0.027], [0.014, 0.029], [0.015, 0.032], [0.015, 0.036], [0, 0.036]]) },
    { geometry: new THREE.BoxGeometry(0.009, 0.007, 0.009), position: [0, 0.036, 0] }
  ]);
}

function createKnightGeometry() {
  const profile = new THREE.Shape();
  profile.moveTo(-0.009, 0.006);
  profile.lineTo(0.009, 0.006);
  profile.lineTo(0.008, 0.014);
  profile.lineTo(0.004, 0.017);
  profile.lineTo(0.011, 0.022);
  profile.lineTo(0.015, 0.026);
  profile.lineTo(0.007, 0.028);
  profile.lineTo(0.002, 0.037);
  profile.lineTo(-0.003, 0.031);
  profile.lineTo(-0.009, 0.033);
  profile.lineTo(-0.007, 0.024);
  profile.lineTo(-0.013, 0.018);
  profile.closePath();

  return mergeParts([
    { geometry: lathe([[0, 0], [0.014, 0], [0.017, 0.002], [0.017, 0.005], [0.011, 0.008], [0, 0.008]]) },
    { geometry: new THREE.ExtrudeGeometry(profile, { depth: 0.008, bevelEnabled: false }), position: [0, 0, -0.004] }
  ]);
}

function createBishopGeometry() {
  return mergeParts([
    { geometry: lathe([[0, 0], [0.014, 0], [0.017, 0.002], [0.017, 0.005], [0.010, 0.01], [0.007, 0.019], [0.009, 0.023], [0.007, 0.029], [0.004, 0.035], [0, 0.042]]) },
    { geometry: new THREE.SphereGeometry(0.004, 12, 8), position: [0, 0.034, 0] }
  ]);
}

function createQueenGeometry() {
  const points = [];
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      points.push({
        geometry: new THREE.ConeGeometry(0.0026, 0.008, 8),
        position: [x * 0.007, 0.042, z * 0.007]
      });
    }
  }

  return mergeParts([
    { geometry: lathe([[0, 0], [0.015, 0], [0.018, 0.002], [0.018, 0.005], [0.011, 0.01], [0.007, 0.023], [0.009, 0.027], [0.006, 0.034], [0, 0.041]]) },
    { geometry: new THREE.SphereGeometry(0.005, 12, 8), position: [0, 0.043, 0] },
    ...points
  ]);
}

function createKingGeometry() {
  return mergeParts([
    { geometry: lathe([[0, 0], [0.015, 0], [0.018, 0.002], [0.018, 0.005], [0.011, 0.01], [0.008, 0.023], [0.011, 0.027], [0.006, 0.034], [0.004, 0.043], [0, 0.044]]) },
    { geometry: new THREE.BoxGeometry(0.004, 0.013, 0.004), position: [0, 0.049, 0] },
    { geometry: new THREE.BoxGeometry(0.013, 0.003, 0.004), position: [0, 0.051, 0] }
  ]);
}

const FACTORIES = Object.freeze({
  p: createPawnGeometry,
  r: createRookGeometry,
  n: createKnightGeometry,
  b: createBishopGeometry,
  q: createQueenGeometry,
  k: createKingGeometry
});

export function createPieceGeometry(type) {
  const factory = FACTORIES[type];
  if (!factory) throw new Error(`Unknown chess piece type: ${type}`);
  if (!GEOMETRIES.has(type)) GEOMETRIES.set(type, factory());
  return GEOMETRIES.get(type);
}

export function createPieceMaterials(color) {
  if (color !== 'white' && color !== 'black') throw new Error(`Unknown chess color: ${color}`);
  if (!MATERIALS.has(color)) {
    const white = color === 'white';
    MATERIALS.set(color, {
      surface: new THREE.MeshStandardMaterial({
        color: white ? 0xfff2d6 : 0x24242c,
        roughness: white ? 0.38 : 0.32,
        metalness: 0.02
      }),
      outline: new THREE.MeshBasicMaterial({
        color: white ? 0x171717 : 0xf2f2e8,
        side: THREE.BackSide
      })
    });
  }
  return MATERIALS.get(color);
}

export { OUTLINE_SCALE };