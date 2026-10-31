import test from 'node:test';
import assert from 'node:assert/strict';
import {Ray, Vector3, DoubleSide} from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {createHannaOrganicPillows} from '../scripts/hanna-pillows.mjs';

const pillows = createHannaOrganicPillows();
const whites = pillows.filter(piece => piece.material === 'white');
const taupe = pillows.find(piece => piece.material === 'taupe');

test('Hanna retains two low white cases and the wider rectangular accent pillow', () => {
  assert.equal(pillows.length, 3);
  assert.equal(whites.length, 2);
  assert.ok(taupe);
  assert.ok(whites[0].geometry.boundingBox.max.x < whites[1].geometry.boundingBox.min.x,
    'the loose inner corners must not intersect the neighbouring white case');
  for (const {geometry} of whites) {
    const bounds = geometry.boundingBox;
    assert.ok(bounds.min.y >= .634, 'the white cases must not enter the mattress');
    assert.ok(bounds.min.y < .645, 'the white cases must remain supported by the mattress');
    assert.ok(bounds.max.y < .98, 'the headboard must remain visible above the low cases');
  }
  const accent = taupe.geometry.boundingBox.getSize(new Vector3());
  assert.ok(accent.x / accent.y > 2.2, 'the reference accent is a landscape rectangle, not a square cushion');
  assert.ok(accent.z < .19, 'the small case must not become an overfilled block');
});

test('the accent case compresses against real curved support without a floating plane', () => {
  const supports = whites.map(piece => new MeshBVH(piece.geometry));
  const ray = new Ray(new Vector3(), new Vector3(0, 0, -1));
  const positions = taupe.geometry.attributes.position;
  let contactCount = 0;
  let minimumContact = Infinity;
  let maximumContact = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    ray.origin.set(x, y, .1);
    let surface = null;
    for (const bvh of supports) {
      const hit = bvh.raycastFirst(ray, DoubleSide);
      if (hit) surface = Math.max(surface ?? -Infinity, .1 - hit.distance);
    }
    if (surface === null) continue;
    const gap = z - surface;
    assert.ok(gap > .0014, 'the accent must not penetrate either white case');
    if (gap < .003) {
      contactCount++;
      minimumContact = Math.min(minimumContact, z);
      maximumContact = Math.max(maximumContact, z);
    }
  }
  assert.ok(contactCount > 200, 'a broad contact area must replace the old centimetres-wide air gap');
  assert.ok(maximumContact - minimumContact > .02, 'contact must follow curved cases instead of a constant plane');
});

test('all pillow positions and smooth normals remain finite and clear of the headboard', () => {
  for (const {geometry, name} of pillows) {
    assert.ok(geometry.boundingBox.min.z > -1.04, `${name} must clear the fixed headboard`);
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    for (let i = 0; i < positions.count; i++) {
      const position = new Vector3().fromBufferAttribute(positions, i);
      const normal = new Vector3().fromBufferAttribute(normals, i);
      assert.ok(position.toArray().every(Number.isFinite), `${name}: invalid surface vertex`);
      assert.ok(normal.toArray().every(Number.isFinite), `${name}: invalid surface normal`);
      assert.ok(Math.abs(normal.length() - 1) < .001, `${name}: normals must stay normalized`);
    }
  }
});
