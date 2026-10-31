import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MeshBVH} from 'three-mesh-bvh';

// A small deterministic finishing pass over the gravity-simulated cache. The
// returned coordinates stay in the closed bed's world axes (Y up, +Z foot).
// Nothing here changes the platform, its local origin or the Lift animation.
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const bell = (value, width) => Math.exp(-((value / width) ** 2));

function geometryFrom(piece) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(piece.position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(piece.uv, 2));
  return geometry;
}

function smoothNormals(geometry) {
  const positions = geometry.attributes.position;
  const sums = new Map(), keys = [];
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)]
      .map(value => Math.round(value * 1e5)).join(',');
    keys.push(key);
    if (!sums.has(key)) sums.set(key, new THREE.Vector3());
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    normal.crossVectors(b.sub(a), c.sub(a));
    for (let j = 0; j < 3; j++) sums.get(keys[i + j]).add(normal);
  }
  const normals = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const value = sums.get(keys[i]).clone().normalize();
    normals.set(value.toArray(), i * 3);
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function toPiece(geometry, source) {
  const expanded = geometry.index ? geometry.toNonIndexed() : geometry;
  smoothNormals(expanded);
  const result = {...source};
  for (const attribute of ['position', 'normal', 'uv']) {
    result[attribute] = Array.from(expanded.attributes[attribute].array);
  }
  if (!result.position.every(value => Number.isFinite(value) && Math.abs(value) < 3)) {
    throw new Error(`Invalid finished Hanna cloth: ${source.name}`);
  }
  return result;
}

function broadSlack(x, z) {
  // Short, unequal two-dimensional ridges; none runs across the entire bed.
  const patches = [
    [-.31, .21, .22, .31, .37, .0060],
    [ .36, .61, .27, .20, -.56, .0055],
    [-.17, .83, .20, .12, -.20, .0045],
    [ .50, .10, .15, .19, .80, .0035]
  ];
  let displacement = 0;
  for (const [cx, cz, width, length, angle, amount] of patches) {
    const dx = x - cx, dz = z - cz;
    const across = dx * Math.cos(angle) + dz * Math.sin(angle);
    const along = -dx * Math.sin(angle) + dz * Math.cos(angle);
    displacement += amount * bell(across, width) * bell(along, length);
  }
  // The side drops and their clearance from the fixed upholstered rails are
  // unchanged. The concealed back edge and front sewn border stay quiet too.
  const sideGate = 1 - smooth((Math.abs(x) - .60) / .15);
  const backGate = smooth((z + .02) / .12);
  const frontGate = 1 - smooth((z - .91) / .10);
  return Math.min(.0075, displacement) * sideGate * backGate * frontGate;
}

function refineQuilt(piece) {
  const geometry = geometryFrom(piece), positions = geometry.attributes.position;
  const gathers = [
    [-.53, .026, .036, .22, .0013],
    [-.29, .032, .050, -.31, .0017],
    [ .08, .022, .039, .16, .0012],
    [ .37, .031, .044, -.24, .0015],
    [ .61, .025, .033, .35, .0011]
  ];
  const frontFolds = [
    [-.57, .043, .0090, .0050, .12],
    [-.34, .035, .0060, -.0035, -.21],
    [-.08, .047, .0080, .0045, .10],
    [ .17, .032, .0065, -.0040, -.13],
    [ .43, .052, .0100, .0050, .18],
    [ .62, .032, .0070, -.0030, .05]
  ];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    let displacement = broadSlack(x, z);
    // Very shallow short gathers live on the hanging front hem, beyond the
    // mattress's front edge. They cannot introduce mattress intersections.
    if (z > 1.025 && Math.abs(x) < .70) {
      const gatherGate = smooth((z - 1.025) / .015) * (1 - smooth((Math.abs(x) - .65) / .05));
      for (const [at, width, reach, lean, amount] of gathers) {
        const line = x - at + (z - 1.058) * lean;
        const cross = -bell(line, width) + .40 * bell(line - width * 1.7, width * 1.5);
        displacement += amount * cross * bell(z - 1.058, reach) * gatherGate;
      }
    }
    // The sewn front line lies near z=1.005, before the lowest hem. Reach
    // both with short unequal gathers instead of leaving a ruler-straight lip.
    const frontGate = smooth((z - .94) / .07) * (1 - smooth((Math.abs(x) - .60) / .10));
    let depth = 0;
    for (const [at, width, height, forward, lean] of frontFolds) {
      const local = x - at + (z - 1.015) * lean;
      const fall = bell(z - 1.03, .075) * frontGate;
      displacement += height * bell(local, width) * fall;
      depth += forward * bell(local, width * 1.2) * fall;
    }
    positions.setY(i, y + displacement);
    positions.setZ(i, z + depth);
  }
  return toPiece(geometry, piece);
}

function supportSampler(geometry) {
  // MeshBVH may add/reorder an index; keep the caller's geometry untouched.
  const bvh = new MeshBVH(geometry.clone()), ray = new THREE.Ray();
  ray.direction.set(0, -1, 0);
  return (x, z) => {
    ray.origin.set(x, 1.2, z);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
    return hit ? 1.2 - hit.distance : null;
  };
}

/** A thin, relaxed turned edge instead of the collapsed simulated strip. */
export function createHannaTurnedEdge(quiltGeometry = null) {
  const support = quiltGeometry ? supportSampler(quiltGeometry) : () => null;
  const nx = 52, nz = 10, positions = [], uvs = [], indices = [];
  const thickness = .0048, width = 1.58, length = .075;
  for (const side of [1, -1]) {
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / nz;
      const x = (u - .5) * width;
      const z = -.075 + v * length + .0012 * bell(x + .20, .32) * (v - .5);
      let middle = .6842 + .0012 * bell(x + .28, .26)
        + .0007 * bell(x - .41, .18) + .0005 * (2 * v - 1);
      const under = support(x, z);
      if (under !== null) middle = Math.max(middle, under + .0013 + thickness / 2);
      positions.push(x, middle + side * thickness / 2, z);
      uvs.push(u * width, v * length);
    }
  }
  const rows = (nx + 1) * (nz + 1);
  for (let side = 0; side < 2; side++) {
    const offset = side * rows;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = offset + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      indices.push(...(side === 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
    }
  }
  // Continuous rim: top and bottom use the same fabric coordinates, keeping
  // its rounded normal interpolation free of a separate hard piping cord.
  const rim = [];
  for (let i = 0; i <= nx; i++) rim.push(i);
  for (let j = 1; j <= nz; j++) rim.push(j * (nx + 1) + nx);
  for (let i = nx - 1; i >= 0; i--) rim.push(nz * (nx + 1) + i);
  for (let j = nz - 1; j >= 1; j--) rim.push(j * (nx + 1));
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i], b = rim[(i + 1) % rim.length];
    indices.push(a, b, a + rows, b, b + rows, a + rows);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return smoothNormals(geometry.toNonIndexed());
}

function seatStripe(piece, sampleSupport) {
  const geometry = geometryFrom(piece), positions = geometry.attributes.position;
  const groups = new Map();
  // Matching UVs identify the two faces of the 4.5 mm filled linen. Move both
  // faces together so contact correction does not squash every fold flat.
  for (let i = 0; i < positions.count; i++) {
    const key = [piece.uv[i * 2], piece.uv[i * 2 + 1]]
      .map(value => Math.round(value * 1e5)).join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  for (const vertices of groups.values()) {
    let gate = 0, required = -Infinity, hasSupport = false;
    for (const i of vertices) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const sideGate = 1 - smooth((Math.abs(x) - .68) / .13);
      const frontGate = 1 - smooth((z - .96) / .08);
      const topGate = smooth((y - .63) / .045);
      const weight = sideGate * frontGate * topGate;
      if (weight <= 0) continue;
      const under = sampleSupport(x, z);
      if (under === null) continue;
      hasSupport = true;
      gate = Math.max(gate, weight);
      required = Math.max(required, under + .0026 - y);
    }
    if (!hasSupport) continue;
    const displacement = Math.max(-.007 * gate, required);
    for (const i of vertices) positions.setY(i, positions.getY(i) + displacement);
  }
  return toPiece(geometry, piece);
}

/**
 * Drop-in cache adapter. Returns new arrays with the original piece names,
 * materials and UVs; the model builder can keep its existing rigid parenting.
 */
export function finishHannaClothPieces(pieces) {
  const originalQuilt = pieces.find(piece => piece.material === 'quilt');
  if (!originalQuilt) throw new Error('Hanna cloth cache is missing its quilt');
  const quilt = refineQuilt(originalQuilt), quiltGeometry = geometryFrom(quilt);
  const originalReverse = pieces.find(piece => piece.material === 'reverse');
  const reverseGeometry = createHannaTurnedEdge(quiltGeometry);
  const reverse = toPiece(reverseGeometry, originalReverse ?? {
    name: 'Hanna turned quilt edge', material: 'reverse'
  });
  const supportGeometry = mergeGeometries([quiltGeometry, geometryFrom(reverse)]);
  const sampleSupport = supportSampler(supportGeometry);
  return pieces.map(piece => {
    if (piece.material === 'quilt') return quilt;
    if (piece.material === 'reverse') return reverse;
    if (piece.material === 'stripe') return seatStripe(piece, sampleSupport);
    return {...piece, position: [...piece.position], normal: [...piece.normal], uv: [...piece.uv]};
  });
}
