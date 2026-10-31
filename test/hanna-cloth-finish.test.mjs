import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MeshBVH} from 'three-mesh-bvh';
import {finishHannaClothPieces} from '../scripts/hanna-cloth-finish.mjs';

const cache = JSON.parse(gunzipSync(readFileSync(new URL('../scripts/materials/hanna-cloth.json.gz', import.meta.url))));
const originalCache = JSON.stringify(cache);
const finished = finishHannaClothPieces(cache);
const byMaterial = material => finished.find(piece => piece.material === material);
const bounds = piece => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < piece.position.length; i += 3) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], piece.position[i + axis]);
    max[axis] = Math.max(max[axis], piece.position[i + axis]);
  }
  return {min, max, size: max.map((value, axis) => value - min[axis])};
};

test('the turned edge is thin, closed and consistently wound rather than a collapsed floating bar', () => {
  const piece = byMaterial('reverse'), extent = bounds(piece);
  assert.ok(extent.size[0] > 1.5 && extent.size[0] < 1.62, 'retain the photographed width');
  assert.ok(extent.size[1] < .016, 'the turned edge must not become a tall cushion');
  assert.ok(extent.size[2] < .09, 'a narrow turned edge must not roll over several times');
  assert.ok(extent.min[1] > .67 && extent.max[1] < .70, 'keep it beneath the striped linen');

  const vertices = new Map(), edges = new Map();
  const vertexId = point => {
    const key = point.map(value => Math.round(value * 1e6)).join(',');
    if (!vertices.has(key)) vertices.set(key, vertices.size);
    return vertices.get(key);
  };
  let volume = 0;
  for (let i = 0; i < piece.position.length; i += 9) {
    const a = new THREE.Vector3().fromArray(piece.position, i);
    const b = new THREE.Vector3().fromArray(piece.position, i + 3);
    const c = new THREE.Vector3().fromArray(piece.position, i + 6);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert.ok(normal.length() > 1e-9, 'every fabric face must have a nonzero area');
    volume += a.dot(b.clone().cross(c)) / 6;
    const ids = [a, b, c].map(point => vertexId(point.toArray()));
    for (const [from, to] of [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]]) {
      const key = from < to ? `${from},${to}` : `${to},${from}`;
      const edge = edges.get(key) ?? {count: 0, winding: 0};
      edge.count++;
      edge.winding += from < to ? 1 : -1;
      edges.set(key, edge);
    }
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, 'the thin filled cloth must have no holes or duplicate faces');
    assert.equal(edge.winding, 0, 'neighboring faces must agree about the outside');
  }
  assert.equal(vertices.size - edges.size + piece.position.length / 9, 2);
  assert.ok(volume > .0002 && volume < .0011, `unphysical turned-edge volume: ${volume}`);
});

test('the linen rests on the quilt without intersections or a continuous hovering gap', () => {
  const geometry = piece => {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(piece.position, 3));
    return result;
  };
  const support = new MeshBVH(mergeGeometries([byMaterial('quilt'), byMaterial('reverse')].map(geometry)));
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const stripe = byMaterial('stripe');
  let sampled = 0, touching = 0;
  for (let i = 0; i < stripe.position.length; i += 3) {
    const [x, y, z] = stripe.position.slice(i, i + 3);
    // Only the supported upper band: the long left tail is deliberately free.
    if (Math.abs(x) >= .68 || z >= .95 || y <= .675) continue;
    ray.origin.set(x, 1.2, z);
    const hit = support.raycastFirst(ray, THREE.DoubleSide);
    if (!hit) continue;
    const clearance = y - (1.2 - hit.distance);
    assert.ok(clearance >= .002 - 1e-6, `linen intersects its support: ${clearance} m`);
    sampled++;
    if (clearance <= .004) touching++;
  }
  assert.ok(sampled > 1000, 'inspect the fabric surface, not a single convenient point');
  assert.ok(touching / sampled > .15, 'the linen must rest against its support across a substantial area');
});

test('refinement retains the side hems and mattress clearance instead of pushing fabric into the frame', () => {
  const original = cache.find(piece => piece.material === 'quilt'), quilt = byMaterial('quilt');
  const roundedDistance = (point, centre, size, radius) => {
    const q = point.map((value, axis) => Math.abs(value - centre[axis]) - size[axis] / 2 + radius);
    return Math.hypot(...q.map(value => Math.max(0, value))) + Math.min(Math.max(...q), 0) - radius;
  };
  let protectedVertices = 0, frontVertices = 0;
  for (let i = 0; i < original.position.length; i += 3) {
    const [x, , z] = original.position.slice(i, i + 3);
    if (Math.abs(x) >= .75) {
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(Math.abs(quilt.position[i + axis] - original.position[i + axis]) < 1e-7);
      }
      protectedVertices++;
    }
    if (Math.abs(x) < .75 && z < .95) {
      assert.ok(quilt.position[i + 1] >= .6325 + .002, 'the mattress top must remain below the quilt');
    }
    if (Math.abs(x) < .70 && z > .90) {
      const point = quilt.position.slice(i, i + 3);
      const body = roundedDistance(point, [0, .4875, 0], [1.6, .245, 2], .045);
      const pad = roundedDistance(point, [0, .610, 0], [1.6, .045, 2], .021);
      assert.ok(Math.min(body, pad) >= .002 - 1e-6, 'front gathers must clear both rounded mattress layers');
      frontVertices++;
    }
  }
  assert.ok(protectedVertices > 1000, 'retain both complete side drops near the fixed rails');
  assert.ok(frontVertices > 500, 'inspect the front seam and hem across their full surface');
});

test('the reusable cloth cache stays unchanged and the finished surfaces have finite unit normals', () => {
  assert.equal(JSON.stringify(cache), originalCache, 'finishing must not mutate the checked-in simulation cache');
  for (const piece of finished) {
    assert.equal(piece.position.length, piece.normal.length);
    assert.equal(piece.position.length / 3, piece.uv.length / 2);
    assert.ok(piece.position.every(value => Number.isFinite(value) && Math.abs(value) < 3));
    assert.ok(piece.uv.every(Number.isFinite));
    for (let i = 0; i < piece.normal.length; i += 3) {
      const length = Math.hypot(piece.normal[i], piece.normal[i + 1], piece.normal[i + 2]);
      assert.ok(Number.isFinite(length) && Math.abs(length - 1) < 1e-5);
    }
  }
});
