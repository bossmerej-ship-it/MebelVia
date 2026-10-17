import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('../dist/assets/models/violetta.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const model = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binOffset = 20 + jsonLength + 8;

test('the complete bed is packaged as a bounded, self-contained GLB', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 5 * 1024 * 1024, 'model exceeds the hero asset budget');
  assert.ok(model.meshes.length <= 8, 'too many draw calls for the mobile hero');
  assert.ok(model.images.length >= 2, 'fabric textures must be embedded');
  for (const buffer of model.buffers) assert.equal(buffer.uri, undefined);
  for (const image of model.images) {
    assert.equal(image.uri, undefined);
    assert.equal(image.mimeType, 'image/png');
    assert.ok(model.bufferViews[image.bufferView]);
  }
  for (const view of model.bufferViews) {
    assert.ok((view.byteOffset || 0) + view.byteLength <= model.buffers[0].byteLength);
  }
});

test('all exported surfaces have finite 3D coordinates and valid triangle indices', () => {
  for (const mesh of model.meshes) for (const primitive of mesh.primitives) {
    const positions = model.accessors[primitive.attributes.POSITION];
    const normals = model.accessors[primitive.attributes.NORMAL];
    const uv = model.accessors[primitive.attributes.TEXCOORD_0];
    assert.equal(positions.componentType, 5126);
    assert.equal(normals.count, positions.count);
    assert.equal(uv.count, positions.count);
    const view = model.bufferViews[positions.bufferView];
    const start = binOffset + (view.byteOffset || 0) + (positions.byteOffset || 0);
    for (let i = 0; i < positions.count; i++) for (let axis = 0; axis < 3; axis++) {
      const value = bytes.readFloatLE(start + i * (view.byteStride || 12) + axis * 4);
      assert.ok(Number.isFinite(value) && Math.abs(value) < 3, `${mesh.name} has an invalid coordinate`);
    }
    const indices = model.accessors[primitive.indices];
    assert.equal(indices.count % 3, 0);
    assert.ok(indices.max[0] < positions.count);
    assert.ok(positions.max[0] > positions.min[0]);
    assert.ok(positions.max[1] > positions.min[1]);
    assert.ok(positions.max[2] > positions.min[2]);
  }
});
