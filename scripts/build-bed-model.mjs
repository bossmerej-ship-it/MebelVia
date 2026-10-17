/**
 * A lightweight, original model based on the supplied Violetta photograph.
 * It is an illustrative reconstruction, not manufacturing CAD. Units: metres.
 * Run `npm run build:bed` to regenerate the GLB and pinned viewer distribution.
 */
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { PNG } from 'pngjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/assets/models');
const vendor = resolve(root, 'dist/assets/vendor');
await mkdir(out, { recursive: true });
await mkdir(vendor, { recursive: true });

// GLTFExporter only needs FileReader for packing its already-built binary blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); });
  }
};

const scene = new THREE.Scene();
const buckets = new Map();
const textureDefs = [];
const materials = {};
let seed = 1729;
function noise() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
const clamp = THREE.MathUtils.clamp;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

function texture(name, size, paint, normalStrength = 0) {
  const heights = new Float32Array(size * size);
  const colors = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const { rgb, h } = paint(x, y);
    const i = y * size + x;
    heights[i] = h;
    for (let c = 0; c < 3; c++) colors.data[i * 4 + c] = clamp(Math.round(rgb[c]), 0, 255);
    colors.data[i * 4 + 3] = 255;
  }
  const normals = new PNG({ width: size, height: size });
  const at = (x, y) => heights[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = new THREE.Vector3((at(x - 1, y) - at(x + 1, y)) * normalStrength,
      (at(x, y - 1) - at(x, y + 1)) * normalStrength, 1).normalize();
    const i = (y * size + x) * 4;
    normals.data[i] = (n.x * .5 + .5) * 255;
    normals.data[i + 1] = (n.y * .5 + .5) * 255;
    normals.data[i + 2] = (n.z * .5 + .5) * 255;
    normals.data[i + 3] = 255;
  }
  textureDefs.push({ name, color: PNG.sync.write(colors), normal: PNG.sync.write(normals) });
  return name;
}

const velvet = texture('warm-brown-upholstery', 256, (x, y) => {
  const grain = noise() - .5;
  const weave = Math.sin(x * Math.PI) * .7 + Math.cos(y * Math.PI) * .6;
  const shade = grain * 12 + weave;
  return { rgb: [112 + shade, 72 + shade * .8, 53 + shade * .7], h: grain * .22 };
}, .6);
const linen = texture('ivory-linen', 256, (x, y) => {
  const thread = ((x % 4 < 2) !== (y % 4 < 2) ? 1 : -1) * 1.8;
  const fleck = noise() * 3 - 1.5;
  return { rgb: [244 + thread + fleck, 241 + thread + fleck, 234 + thread + fleck], h: thread * .035 + fleck * .03 };
}, 1);
const herringbone = texture('charcoal-herringbone', 512, (x, y) => {
  const direction = Math.floor(x / 32) % 2 ? -1 : 1;
  const stripe = ((x + direction * y + 1024) % 12) / 12;
  const thread = Math.cos(stripe * Math.PI * 2);
  const grain = noise() - .5;
  const value = 78 + thread * 30 + grain * 20;
  return { rgb: [value + 8, value + 7, value + 5], h: thread * .22 + grain * .10 };
}, .75);

function material(name, color, textureName, roughness = .95) {
  const m = new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
  if (textureName) m.userData.fabric = textureName;
  materials[name] = m;
  return m;
}
const brown = material('Upholstered frame', '#ffffff', velvet);
const seamBrown = material('Upholstery seams', '#79563f');
const ivory = material('Linen', '#ffffff', linen);
const seamIvory = material('Linen piping', '#d8d5cb');
const throwMat = material('Woven throw', '#ffffff', herringbone);
const fringeMat = material('Throw fringe', '#77746d');
const dark = material('Recessed feet and underside', '#302722');

function add(geometry, mat, pos = [0, 0, 0], rotation = [0, 0, 0], fabricScale = 1) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.clearGroups();
  if (!g.getAttribute('color')) {
    const colors = new Float32Array(g.getAttribute('position').count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const uv = g.getAttribute('uv');
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * fabricScale, uv.getY(i) * fabricScale);
  const transform = new THREE.Matrix4().compose(new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(transform);
  if (!buckets.has(mat)) buckets.set(mat, []);
  buckets.get(mat).push(g);
}
function box(size, pos, mat, radius = .025, rotation = [0, 0, 0], fabricScale = 8) {
  add(new RoundedBoxGeometry(...size, 4, radius), mat, pos, rotation, fabricScale);
}
function tube(points, radius, mat, closed = false, segments = points.length * 2) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  add(new THREE.TubeGeometry(curve, segments, radius, 4, closed), mat);
}

// Low plinth, continuous padded rails, and the tall channel-tufted headboard.
box([1.66, .11, 1.86], [0, .08, .01], dark, .018);
for (const x of [-.91, .91]) box([.17, .31, 2.06], [x, .235, .015], brown, .042);
box([1.99, .33, .18], [0, .235, 1.005], brown, .045);
box([1.99, 1.44, .14], [0, .79, -1.025], brown, .055);
const panelCount = 11, panelWidth = 1.89 / panelCount;
for (let i = 0; i < panelCount; i++) {
  const x = (i - (panelCount - 1) / 2) * panelWidth;
  box([panelWidth - .007, 1.39, .065], [x, .793, -.94], brown, .023);
}
// Fine piping follows the outer upholstered edge, leaving the rear finished.
tube([[-.96,.375,1.07],[-.48,.384,1.09],[.48,.384,1.09],[.96,.375,1.07]],.0022,seamBrown);

// Fitted mattress: gently rounded, with restrained ticking at the perimeter.
box([1.76, .26, 1.94], [0, .49, .015], ivory, .065, [0,0,0], 11);
box([1.77, .075, 1.95], [0, .625, .015], ivory, .035, [0,0,0], 11);
tube([[-.82,.60,-.91],[-.875,.60,-.85],[-.875,.60,.88],[-.81,.60,.97],[.81,.60,.97],[.875,.60,.88],[.875,.60,-.85],[.82,.60,-.91]],.002,seamIvory,true);

function surface(fn, nx, nz, shade = () => 1) {
  const positions = [], uvs = [], indices = [], colors = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    positions.push(...fn(i / nx, j / nz));
    uvs.push(i / nx, j / nz);
    const ao = shade(i / nx, j / nz);
    colors.push(ao,ao,ao);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    indices.push(a,c,b,b,c,d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

// Pillows use a sewn perimeter with uneven loft; no box-shaped corners.
function pillow(w, d, loft, pos, rotation, phase) {
  const shape = (u, v, side = 1) => {
    const a = u * 2 - 1, b = v * 2 - 1;
    const edge = Math.max(0, (1 - a * a) * (1 - b * b));
    const bulge = Math.pow(edge, .46);
    const wrinkles = (.009*Math.sin(a*29+b*12+phase) + .006*Math.sin(b*39-a*16)) * Math.pow(edge,.25) * (1-bulge*.8);
    const indent = .019*Math.exp(-Math.pow((a-.34+b*.18)/.09,2))*Math.pow(Math.abs(b),3);
    return [a*w/2*(1-.07*Math.pow(Math.abs(b),6)), side*(.008+loft*bulge+wrinkles-indent), b*d/2*(1-.07*Math.pow(Math.abs(a),6))];
  };
  const pillowShade = (u,v) => {
    const a=u*2-1,b=v*2-1;
    const edge=Math.max(0,(1-a*a)*(1-b*b));
    return .73+.25*Math.pow(edge,.3)-.05*Math.sin(a*29+b*12+phase)**2*(1-Math.pow(edge,.3));
  };
  add(surface((u,v)=>shape(u,v,1),48,40,pillowShade),ivory,pos,rotation,5);
  const lower = surface((u,v)=>shape(u,1-v,-.65),24,20,()=>.65);
  add(lower,ivory,pos,rotation,5);
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
  matrix.setPosition(...pos);
  const points=[];
  for(let k=0;k<80;k++) {
    const t=k/20, side=Math.floor(t), p=t-side;
    const uv=side===0?[p,0]:side===1?[1,p]:side===2?[1-p,1]:[0,1-p];
    const pt=shape(...uv); pt[1]=0;
    const v=new THREE.Vector3(...pt).applyMatrix4(matrix);points.push(v.toArray());
  }
  tube(points,.0018,seamIvory,true,120);
}
pillow(.80,.49,.12,[-.44,.79,-.71],[.55,.02,-.045],.2);
pillow(.80,.49,.12,[.43,.80,-.72],[.48,-.06,.025],1.8);
pillow(.78,.50,.14,[-.42,.78,-.43],[.12,-.09,-.035],2.4);
pillow(.78,.50,.14,[.42,.78,-.42],[.16,.075,.03],4.2);

// Continuous duvet with gravity-draped sides, large soft folds and finer creases.
function duvetAt(u,v) {
  const a=(u-.5)*2.43, b=-.49+v*1.78;
  const overX=Math.max(0,Math.abs(a)-.85), overZ=Math.max(0,b-.94);
  const x=Math.sign(a)*(Math.min(Math.abs(a),.85)+.105*(1-Math.exp(-overX/.075)));
  const z=Math.min(b,.94)+.11*(1-Math.exp(-overZ/.065));
  const drop=Math.max(overX*.96,overZ*.90);
  const waves=.015*Math.sin(a*11+b*4)+.012*Math.sin(b*13-a*3)+.006*Math.cos(a*24+b*17);
  const broad=.038*Math.exp(-Math.pow((a+.30+b*.25)/.27,2)) + .026*Math.exp(-Math.pow((b-.3-a*.35)/.22,2));
  const crease=.014*Math.sin(a*49+b*15)*Math.exp(-Math.pow((Math.abs(a)-.86)/.22,2));
  const lip=.036*Math.exp(-Math.pow(v/.055,2));
  return [x,.719-drop+waves+broad+crease+lip,z];
}
const duvetShade = (u,v) => {
  const a=(u-.5)*2.43,b=-.49+v*1.78;
  const sideShade = .15*smooth((Math.abs(a)-.8)/.35);
  const pillowShadow = .19*Math.exp(-Math.pow(v/.13,2));
  const folds = .035*(1+Math.sin(a*11+b*4))+.02*Math.sin(a*24+b*17)**2;
  return 1-sideShade-pillowShadow-folds;
};
add(surface(duvetAt,96,80,duvetShade),ivory,[0,0,0],[0,0,0],16);
for(const edge of [0,1]) tube(Array.from({length:65},(_,i)=>duvetAt(edge,i/64)),.002,seamIvory,false,100);
tube(Array.from({length:81},(_,i)=>duvetAt(i/80,1)),.002,seamIvory,false,120);

// A folded linen edge below the pillows, softly rolled rather than a rigid slab.
add(surface((u,v)=>{
  const p=duvetAt(u,.022+v*.13);
  p[1]+=.012+.042*Math.sin(v*Math.PI)+.005*Math.sin(u*31);
  return p;
},96,18),ivory,[0,0,0],[0,0,0],10);

// Herringbone runner falls over the side and foot; lifted clear of the duvet.
function throwAt(u,v) {
  const du=.04+u*.69;
  const dv=.44+v*.49+u*.035;
  const p=duvetAt(du,dv);
  p[1]+=.027+.008*Math.sin(u*39+v*7)**2+.018*Math.exp(-Math.pow((u-.4)/.12,2));
  // Outward offset also matters on vertical drapes, where a y-only offset intersects.
  if(du<.16) p[0]-=.012;
  if(dv>.81) p[2]+=.012;
  return p;
}
add(surface(throwAt,96,64,(u,v)=>.88+.1*Math.cos(u*39+v*7)),throwMat,[0,0,0],[0,0,0],3);
for (const v of [0,1]) tube(Array.from({length:65},(_,i)=>throwAt(i/64,v)),.0028,fringeMat,false,100);
for(let i=0;i<100;i++) {
  const u=i/99, p=throwAt(u,1);
  tube([p,[p[0]+.002,p[1]-.012,p[2]+.012],[p[0]+(noise()-.5)*.009,p[1]-.029,p[2]+.027]],.0009,fringeMat,false,5);
}

// Merge by fabric so the viewer draws only a handful of meshes.
let triangles=0;
for(const [mat,geometries] of buckets) {
  const g=mergeVertices(mergeGeometries(geometries),.00001);
  const colors=g.getAttribute('color');
  g.setAttribute('color',new THREE.Uint8BufferAttribute(Uint8Array.from(colors.array,n=>Math.round(n*255)),3,true));
  const mesh=new THREE.Mesh(g,mat);mesh.name=mat.name;
  triangles+=g.index.count/3;scene.add(mesh);
}
scene.userData={description:'Illustrative reconstruction of the supplied Violetta bed photograph. Not manufacturing CAD.',units:'metres'};
const binary=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true}));
const jsonLength=binary.readUInt32LE(12);
const gltf=JSON.parse(binary.subarray(20,20+jsonLength).toString());
const binStart=20+jsonLength+8;
const parts=[binary.subarray(binStart)];
let byteLength=parts[0].length;
gltf.images=[];gltf.textures=[];
gltf.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
function embedImage(bytes,name) {
  const pad=(4-byteLength%4)%4;if(pad){parts.push(Buffer.alloc(pad));byteLength+=pad;}
  const bufferView=gltf.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length})-1;
  parts.push(bytes);byteLength+=bytes.length;
  const source=gltf.images.push({bufferView,mimeType:'image/png',name})-1;
  return gltf.textures.push({source,sampler:0})-1;
}
for(const texture of textureDefs) {
  const base=embedImage(texture.color,texture.name);
  const normal=embedImage(texture.normal,texture.name+'-normal');
  for(const mat of gltf.materials) if(mat.extras?.fabric===texture.name) {
    mat.pbrMetallicRoughness.baseColorTexture={index:base};
    mat.normalTexture={index:normal,scale:.65};
  }
}
gltf.buffers[0].byteLength=byteLength;
const json=Buffer.from(JSON.stringify(gltf));
const jsonPad=Buffer.alloc((4-json.length%4)%4,0x20);
const body=Buffer.concat(parts);
const bodyPad=Buffer.alloc((4-body.length%4)%4);
const header=Buffer.alloc(20);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);
header.writeUInt32LE(20+json.length+jsonPad.length+8+body.length+bodyPad.length,8);
header.writeUInt32LE(json.length+jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(body.length+bodyPad.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const result=Buffer.concat([header,json,jsonPad,binHeader,body,bodyPad]);
await writeFile(resolve(out,'violetta.glb'),result);
await copyFile(resolve(root,'node_modules/@google/model-viewer/dist/model-viewer.min.js'),resolve(vendor,'model-viewer-4.4.0.min.js'));
await copyFile(resolve(root,'node_modules/@google/model-viewer/LICENSE'),resolve(vendor,'model-viewer-LICENSE.txt'));
await copyFile(resolve(root,'node_modules/three/LICENSE'),resolve(vendor,'three-LICENSE.txt'));
console.log(JSON.stringify({model:'dist/assets/models/violetta.glb',bytes:result.length,triangles,drawCalls:scene.children.length}));
