/**
 * A lightweight, original model based on the supplied Violetta photograph.
 * It is an illustrative reconstruction, not manufacturing CAD. Units: metres.
 * Run `npm run build:bed` to regenerate the GLB and pinned viewer distribution.
 */
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { MeshBVH } from 'three-mesh-bvh';
import { PNG } from 'pngjs';
import { gunzipSync } from 'node:zlib';

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

// Photographed, CC0 textile maps. The geometry and colour choices remain original.
const fabricFile = name => readFile(resolve(root, 'scripts/materials', name));
const velvet = 'velvet', linen = 'cotton', herringbone = 'herringbone';
const velvetColor = new PNG({width:512,height:512});
const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
function grain(x,y,period) {
  const a=x/512*period,b=y/512*period,ix=Math.floor(a),iy=Math.floor(b);
  const u=smooth(a-ix),v=smooth(b-iy);
  const top=hash(ix%period,iy%period)*(1-u)+hash((ix+1)%period,iy%period)*u;
  const bottom=hash(ix%period,(iy+1)%period)*(1-u)+hash((ix+1)%period,(iy+1)%period)*u;
  return top*(1-v)+bottom*v;
}
for(let y=0;y<512;y++) for(let x=0;x<512;x++) {
  const value=clamp(224+8*(grain(x,y,7)-.5)+5*(grain(x,y,31)-.5)+12*(noise()-.5),0,255);
  velvetColor.data.set([value,value,value,255],(y*512+x)*4);
}
// Fine alternating yarns, rather than a bold graphic chevron.
const wovenColor = new PNG({width:512,height:512});
for(let y=0;y<512;y++) for(let x=0;x<512;x++) {
  const direction=Math.floor(x/16)%2?1:-1;
  const strand=((x+direction*y+1024)%8)/8;
  const light=Math.pow(.5+.5*Math.cos(strand*Math.PI*2),1.4);
  const cross=(x%3===0||y%3===0)?-.05:0;
  const value=clamp(78+166*light+20*(noise()-.5)+cross*160,0,255);
  const i=(y*512+x)*4;
  wovenColor.data.set([value,value,value,255],i);
}
textureDefs.push(
  { name: velvet, color:PNG.sync.write(velvetColor),colorMime:'image/png',normal: await fabricFile('velvet-normal.jpg'), strength: .7 },
  { name: linen, normal: await fabricFile('cotton-normal.jpg'), strength: .38 },
  { name: 'pillow', normal: await fabricFile('pillow-normal.jpg'), strength: 1 },
  { name: herringbone, color: PNG.sync.write(wovenColor), colorMime:'image/png', normal: await fabricFile('herringbone-normal.jpg'), strength: .7 }
);

function material(name, color, textureName, roughness = .95) {
  const m = new THREE.MeshPhysicalMaterial({ name, color, roughness, metalness: 0, side: THREE.DoubleSide, vertexColors: true, specularIntensity: .18, ior: 1.38 });
  if (textureName) m.userData.fabric = textureName;
  materials[name] = m;
  return m;
}
const brown = material('Upholstered frame', '#a37c66', velvet, 1);
brown.sheen=1; brown.sheenColor.set('#b5927e'); brown.sheenRoughness=.85;
const seamBrown = material('Upholstery seams', '#5e4032');
const ivory = material('Linen', '#eeeae3', linen);
const pillowMat = material('Cotton pillowcases', '#f4f1eb', 'pillow');
const seamIvory = material('Linen piping', '#e0dcd3');
const throwMat = material('Woven throw', '#dddcd9', herringbone, 1);
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
  const [sx,sy]=Array.isArray(fabricScale)?fabricScale:[fabricScale,fabricScale];
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  const transform = new THREE.Matrix4().compose(new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(transform);
  if (!buckets.has(mat)) buckets.set(mat, []);
  buckets.get(mat).push(g);
}
function box(size, pos, mat, radius = .025, rotation = [0, 0, 0], fabricScale = 4) {
  const g=new RoundedBoxGeometry(...size, 4, radius);
  if(mat===brown) {
    const axis=size.indexOf(Math.min(...size)),a=(axis+1)%3,b=(axis+2)%3;
    const p=g.getAttribute('position');
    for(let i=0;i<p.count;i++) {
      const q=[p.getX(i),p.getY(i),p.getZ(i)];
      if(Math.abs(q[axis])>size[axis]*.35)
        q[axis]+=Math.sign(q[axis])*.012*Math.max(0,1-(2*q[a]/size[a])**2)*Math.max(0,1-(2*q[b]/size[b])**2);
      p.setXYZ(i,...q);
    }
    g.computeVertexNormals();
    // Match texel density on the long rails and short headboard channels.
    const uv=g.getAttribute('uv'),n=g.getAttribute('normal');
    for(let i=0;i<p.count;i++) {
      const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
      uv.setXY(i,ax>ay&&ax>az?p.getZ(i):p.getX(i),ay>ax&&ay>az?p.getZ(i):p.getY(i));
    }
  }
  add(g,mat,pos,rotation,fabricScale);
}
function tube(points, radius, mat, closed = false, segments = points.length * 2) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  add(new THREE.TubeGeometry(curve, segments, radius, 4, closed), mat);
}

// Low plinth, continuous padded rails, and the tall channel-tufted headboard.
box([1.66, .11, 1.86], [0, .08, .01], dark, .018);
for (const x of [-.91, .91]) box([.17, .31, 2.06], [x, .235, .015], brown, .045);
box([1.99, .33, .18], [0, .235, 1.005], brown, .045);
box([1.99, 1.44, .14], [0, .79, -1.025], brown, .055);
const panelCount = 11, panelWidth = 1.89 / panelCount;
for (let i = 0; i < panelCount; i++) {
  const x = (i - (panelCount - 1) / 2) * panelWidth;
  const panel = new RoundedBoxGeometry(panelWidth-.002,1.385,.05,5,.016);
  const pp=panel.getAttribute('position');
  for(let k=0;k<pp.count;k++) {
    const px=pp.getX(k),py=pp.getY(k),pz=pp.getZ(k);
    const bulge=.017*Math.pow(Math.max(0,Math.cos(px/(panelWidth/2)*Math.PI/2)),.7)
      *Math.pow(Math.max(0,Math.cos(py/.697*Math.PI/2)),.15);
    if(pz>0) pp.setZ(k,pz+bulge);
  }
  panel.computeVertexNormals();
  add(panel,brown,[x,.793,-.944],[0,0,0],[.6,5]);
}
// Fine piping follows the outer upholstered edge, leaving the rear finished.

// Fitted mattress: gently rounded, with restrained ticking at the perimeter.
box([1.76, .30, 1.94], [0, .515, .015], ivory, .065, [0,0,0], 11);
box([1.77, .075, 1.95], [0, .678, .015], ivory, .035, [0,0,0], 11);
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

// Offline cloth simulation and sculpted pillow geometry preserve natural drapes.
const cloth=JSON.parse(gunzipSync(await fabricFile('bed-cloth.json.gz')));
for(const piece of cloth) {
  const g=new THREE.BufferGeometry();
  for(const [name,size] of [['position',3],['normal',3],['uv',2]])
    g.setAttribute(name,new THREE.Float32BufferAttribute(piece[name],size));
  // Bring the filled duvet down over the mattress at the foot, as in the photo.
  if(piece.name==='Duvet') {
    const p=g.getAttribute('position');
    for(let i=0;i<p.count;i++) {
      const fall=smooth((p.getZ(i)-.82)/.18)*(1-smooth((Math.abs(p.getX(i))-.72)/.25))
        *smooth((.735-p.getY(i))/.13);
      p.setY(i,p.getY(i)-.11*fall);
      p.setZ(i,p.getZ(i)+.012*fall);
    }
    g.deleteAttribute('normal');
    const smoothMesh=mergeVertices(g,.00001);
    smoothMesh.computeVertexNormals();
    add(smoothMesh,ivory);
    continue;
  }
  const mat=piece.material==='pillow'?pillowMat:piece.material==='throw'?throwMat:ivory;
  add(g,mat,[0,0,0],[0,0,0],piece.material==='throw'?[3.2,.95]:1);
}

// Merge by fabric so the viewer draws only a handful of meshes.
let triangles=0;
for(const [mat,geometries] of buckets) {
  const g=mergeVertices(mergeGeometries(geometries),.00001);
  const mesh=new THREE.Mesh(g,mat);mesh.name=mat.name;
  triangles+=g.index.count/3;scene.add(mesh);
}
// Bake contact occlusion once at build time; no ray tracing on the customer's phone.
const occluders=mergeGeometries(scene.children.map(mesh=>{
  const g=mesh.geometry.clone();
  for(const name of Object.keys(g.attributes)) if(name!=='position') g.deleteAttribute(name);
  return g;
}));
const bvh=new MeshBVH(occluders);
const ray=new THREE.Ray(), n=new THREE.Vector3(), tangent=new THREE.Vector3(), bitangent=new THREE.Vector3();
const up=new THREE.Vector3(0,1,0), right=new THREE.Vector3(1,0,0);
const samples=32;
for(const mesh of scene.children) {
  const g=mesh.geometry,p=g.getAttribute('position'),norm=g.getAttribute('normal');
  const colors=new Uint8Array(p.count*3);
  for(let i=0;i<p.count;i++) {
    n.fromBufferAttribute(norm,i).normalize();
    tangent.crossVectors(Math.abs(n.y)<.95?up:right,n).normalize();
    bitangent.crossVectors(n,tangent);
    ray.origin.fromBufferAttribute(p,i).addScaledVector(n,.0025);
    let blocked=0;
    for(let s=0;s<samples;s++) {
      const radius=Math.sqrt((s+.5)/samples),angle=s*2.399963229728653;
      ray.direction.copy(n).multiplyScalar(Math.sqrt(1-radius*radius))
        .addScaledVector(tangent,radius*Math.cos(angle)).addScaledVector(bitangent,radius*Math.sin(angle));
      const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,.24);
      if(hit) blocked+=Math.pow(1-hit.distance/.24,1.4);
    }
    const shade=clamp(1-.78*blocked/samples,.25,1);
    const value=Math.round(shade*255);colors.set([value,value,value],i*3);
  }
  g.setAttribute('color',new THREE.Uint8BufferAttribute(colors,3,true));
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
function embedImage(bytes,name,mimeType='image/jpeg') {
  const pad=(4-byteLength%4)%4;if(pad){parts.push(Buffer.alloc(pad));byteLength+=pad;}
  const bufferView=gltf.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length})-1;
  parts.push(bytes);byteLength+=bytes.length;
  const source=gltf.images.push({bufferView,mimeType,name})-1;
  return gltf.textures.push({source,sampler:0})-1;
}
for(const texture of textureDefs) {
  const base=texture.color ? embedImage(texture.color,texture.name,texture.colorMime) : undefined;
  const normal=embedImage(texture.normal,texture.name+'-normal');
  for(const mat of gltf.materials) if(mat.extras?.fabric===texture.name) {
    if(base!==undefined) mat.pbrMetallicRoughness.baseColorTexture={index:base};
    mat.normalTexture={index:normal,scale:texture.strength};
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
