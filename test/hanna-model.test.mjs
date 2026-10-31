import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Object3D, Vector3, Quaternion} from 'three';

const bytes = readFileSync(new URL('../dist/assets/models/hanna.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binaryStart = 28 + jsonLength;
const clip = gltf.animations.find(animation => animation.name === 'Lift');
const objects = gltf.nodes.map(node => {
  const object = new Object3D();
  object.name = node.name;
  if (node.translation) object.position.fromArray(node.translation);
  if (node.rotation) object.quaternion.fromArray(node.rotation);
  if (node.scale) object.scale.fromArray(node.scale);
  return object;
});
gltf.nodes.forEach((node, index) => node.children?.forEach(child => objects[index].add(objects[child])));
const root = new Object3D();
gltf.scenes[gltf.scene ?? 0].nodes.forEach(index => root.add(objects[index]));
const byName = name => objects.find(object => object.name === name);
const componentCounts = {SCALAR:1, VEC2:2, VEC3:3, VEC4:4};
function values(index) {
  const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  const count = componentCounts[accessor.type];
  const start = binaryStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  return Array.from({length:accessor.count}, (_, row) => Array.from({length:count}, (_, column) =>
    bytes.readFloatLE(start + row * (view.byteStride || count * 4) + column * 4)));
}
const channels = clip.channels.map(channel => {
  const sampler = clip.samplers[channel.sampler];
  return {object:objects[channel.target.node], path:channel.target.path,
    times:values(sampler.input).flat(), data:values(sampler.output)};
});
function pose(time) {
  for (const {object,path,times,data} of channels) {
    let index = Math.max(0, times.findIndex(value => value >= time));
    if (index === 0 && time > 0) index = times.length - 1;
    const previous = Math.max(0, index - 1);
    const fraction = index === previous ? 0 : (time-times[previous])/(times[index]-times[previous]);
    if (path === 'rotation') object.quaternion.fromArray(data[previous]).slerp(new Quaternion().fromArray(data[index]), fraction);
    else object[path === 'translation' ? 'position' : 'scale'].fromArray(data[previous]).lerp(new Vector3().fromArray(data[index]), fraction);
  }
  root.updateMatrixWorld(true);
}
const world = name => byName(name).getWorldPosition(new Vector3());
function ends(name) {
  const index = objects.indexOf(byName(name));
  const primitive = gltf.meshes[gltf.nodes[index].mesh].primitives[0];
  const bounds = gltf.accessors[primitive.attributes.POSITION];
  return [bounds.min[1], bounds.max[1]].map(y => byName(name).localToWorld(new Vector3(0,y,0)));
}
function close(actual, expected, message) {
  assert.ok(actual.distanceTo(expected) < .001, `${message}: ${actual.distanceTo(expected)} m`);
}

test('Hanna is a self-contained animated GLB within the mobile download budget', () => {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 10 * 1024 * 1024);
  assert.ok(gltf.images.length >= 3);
  for (const buffer of gltf.buffers) assert.equal(buffer.uri, undefined);
  for (const image of gltf.images) {
    assert.equal(image.uri, undefined);
    assert.ok(gltf.bufferViews[image.bufferView]);
  }
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    for (const position of values(primitive.attributes.POSITION)) {
      assert.ok(position.every(value => Number.isFinite(value) && Math.abs(value) < 3));
    }
  }
});

test('the mattress and bedding lift as one assembly while the upholstered shell stays fixed', () => {
  const upper = byName('UpperAssembly'), fixed = byName('FixedFrame');
  const animated = new Set(channels.map(channel => channel.object));
  fixed.traverse(object => assert.ok(!animated.has(object), `${object.name} must remain fixed`));
  upper.children.forEach(object => assert.ok(!animated.has(object), `${object.name} must stay attached to the platform`));
  assert.ok(upper.children.some(object => /slats/.test(object.name)));
  assert.ok(upper.children.some(object => /pillows/.test(object.name)));
  pose(0);
  const shell = fixed.matrixWorld.clone();
  const closed = upper.quaternion.clone();
  pose(1);
  assert.ok(fixed.matrixWorld.equals(shell));
  const degrees = closed.angleTo(upper.quaternion) * 180 / Math.PI;
  assert.ok(degrees >= 35 && degrees <= 45, `opening angle ${degrees}`);
});

test('fabric exports retain restrained fibre sheen instead of a full white coating', () => {
  const fabrics = gltf.materials.filter(material => material.extras?.fabric);
  assert.ok(fabrics.length >= 5);
  for (const material of fabrics) {
    const sheen = material.extensions?.KHR_materials_sheen?.sheenColorFactor;
    assert.ok(sheen?.length === 3, `${material.name} must retain its fabric sheen`);
    assert.ok(sheen.every(value => value >= 0 && value <= .35), `${material.name} must not export full-intensity sheen`);
    assert.equal(material.pbrMetallicRoughness.metallicFactor, 0);
  }
});

test('exported arms and telescopic struts stay attached throughout the lift, including between keyframes', () => {
  for (let sample = 0; sample <= 160; sample++) {
    pose(sample / 160);
    for (const side of ['Left','Right']) {
      for (const [arm,start,end] of [['Short','A','B'],['Long','D','C']]) {
        const endpoints = ends(`LiftArm${side}${arm}`);
        close(endpoints[0],world(`Pivot${side}${start}`),`${side} ${arm} fixed hinge`);
        close(endpoints[1],world(`Pivot${side}${end}`),`${side} ${arm} moving hinge`);
      }
      const body = ends(`GasBody${side}`), rod = ends(`GasRod${side}`);
      const fixed = world(`Pivot${side}GasFixed`), moving = world(`Pivot${side}GasMoving`);
      close(body[0],fixed,`${side} gas body mount`);
      close(rod[1],moving,`${side} piston mount`);
      const axis = moving.clone().sub(fixed).normalize();
      const rodBaseOffset = rod[0].clone().sub(fixed);
      assert.ok(rodBaseOffset.clone().cross(axis).length() < .001, 'piston must remain coaxial');
      const overlap = body[1].clone().sub(rod[0]).dot(axis);
      assert.ok(overlap > .025 && overlap < .48, `invalid telescopic overlap ${overlap}`);
    }
  }
});
