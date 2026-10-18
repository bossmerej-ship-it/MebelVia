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
// Broad contrasting yarns keep the herringbone readable at hero scale.
const wovenColor = new PNG({width:512,height:512});
for(let y=0;y<512;y++) for(let x=0;x<512;x++) {
  const direction=Math.floor(x/32)%2?1:-1;
  const strand=((x+direction*y+1024)%16)/16;
  const light=Math.pow(.5+.5*Math.cos(strand*Math.PI*2),1.4);
  const cross=(x%3===0||y%3===0)?-.05:0;
  const value=clamp(38+174*light+20*(noise()-.5)+cross*255,0,255);
  const i=(y*512+x)*4;
  wovenColor.data.set([value,value,value,255],i);
}
textureDefs.push(
  { name: velvet, normal: await fabricFile('velvet-normal.jpg'), strength: .55 },
  { name: linen, normal: await fabricFile('cotton-normal.jpg'), strength: .28 },
  { name: herringbone, color: PNG.sync.write(wovenColor), colorMime:'image/png', normal: await fabricFile('herringbone-normal.jpg'), strength: .7 }
);

function material(name, color, textureName, roughness = .95) {
  const m = new THREE.MeshPhysicalMaterial({ name, color, roughness, metalness: 0, side: THREE.DoubleSide, vertexColors: true, specularIntensity: .18, ior: 1.38 });
  if (textureName) m.userData.fabric = textureName;
  materials[name] = m;
  return m;
}
const brown = material('Upholstered frame', '#76503e', velvet, .92);
const seamBrown = material('Upholstery seams', '#5e4032');
const ivory = material('Linen', '#eeeae3', linen);
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
function box(size, pos, mat, radius = .025, rotation = [0, 0, 0], fabricScale = 8) {
  add(new RoundedBoxGeometry(...size, 3, radius), mat, pos, rotation, fabricScale);
}
function tube(points, radius, mat, closed = false, segments = points.length * 2) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  add(new THREE.TubeGeometry(curve, segments, radius, 4, closed), mat);
}

// Low plinth, continuous padded rails, and the tall channel-tufted headboard.
box([1.66, .11, 1.86], [0, .08, .01], dark, .018);
for (const x of [-.91, .91]) box([.17, .31, 2.06], [x, .235, .015], brown, .025);
box([1.99, .33, .18], [0, .235, 1.005], brown, .025);
box([1.99, 1.44, .14], [0, .79, -1.025], brown, .035);
const panelCount = 11, panelWidth = 1.89 / panelCount;
for (let i = 0; i < panelCount; i++) {
  const x = (i - (panelCount - 1) / 2) * panelWidth;
  box([panelWidth - .004, 1.385, .041], [x, .793, -.944], brown, .011, [0,0,0], 5);
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

// Sewn pillows: smooth central loft, a narrow flange, and local tension creases.
const gauss = x => Math.exp(-x*x);
function pillow(w,d,loft,pos,rotation,phase) {
  function shape(u,v,side=1) {
    const a=2*u-1,b=2*v-1;
    const core=Math.max(0,(1-Math.pow(Math.abs(a)/.94,3.2))*(1-Math.pow(Math.abs(b)/.92,3.2)));
    const puff=Math.abs(a)<.94&&Math.abs(b)<.92 ? Math.pow(core,.58) : 0;
    let creases=0;
    for(let k=0;k<5;k++) {
      const c=-.71+k*.34+.055*Math.sin(k*3+phase);
      const along=a-c-(b>.0?1:-1)*(.08+.025*k)*(1-Math.abs(b));
      const taper=gauss((Math.abs(b)-.76)/.25)*Math.pow(Math.max(0,1-Math.abs(b)),.25);
      creases+=(.011*gauss((along-.035)/.055)-.018*gauss(along/.026))*taper;
    }
    creases+=.007*gauss((a+.55+b*.35)/.06)*gauss((b+.10)/.5);
    const edge=.003*Math.sin(a*9+phase)*Math.sin(b*5);
    return [a*w/2*(1-.035*Math.pow(Math.abs(b),10)),side*(.005+loft*puff+creases+edge),b*d/2*(1-.035*Math.pow(Math.abs(a),10))];
  }
  add(surface((u,v)=>shape(u,v),64,44),ivory,pos,rotation,3);
  add(surface((u,v)=>shape(u,1-v,-.58),24,18),ivory,pos,rotation,3);
  const transform=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation));
  transform.setPosition(...pos);
  const points=[];
  for(let i=0;i<80;i++) {
    const side=Math.floor(i/20),t=(i%20)/20;
    const uv=side===0?[t,0]:side===1?[1,t]:side===2?[1-t,1]:[0,1-t];
    const p=shape(...uv);p[1]=0;
    points.push(new THREE.Vector3(...p).applyMatrix4(transform).toArray());
  }
  tube(points,.0015,seamIvory,true,100);
}
pillow(.82,.51,.15,[-.43,.84,-.72],[.68,.04,-.035],.2);
pillow(.82,.51,.15,[.43,.845,-.73],[.65,-.04,.04],1.7);
pillow(.79,.50,.14,[-.43,.80,-.40],[.26,-.085,-.055],2.8);
pillow(.79,.50,.14,[.42,.80,-.40],[.30,.07,.025],4.1);

// Uneven, local folds instead of evenly spaced sine waves across the whole bed.
// Each tuple is a crease starting point, direction, length, width and depth.
const folds=[
  [-.75,-.32,.93,.36,.61,.034,.022],[-.36,-.45,.40,.92,.52,.028,.017],
  [.12,-.43,-.34,.94,.47,.026,.018],[.68,-.30,-.65,.76,.69,.030,.025],
  [-.82,.38,.98,-.20,.63,.024,.021],[.84,.19,-.91,.42,.58,.025,.024],
  [-.78,.82,.76,-.64,.60,.030,.026],[.80,.81,-.83,-.55,.54,.027,.021],
  [.22,.97,-.35,-.94,.46,.025,.016],[-.22,.40,.60,.80,.38,.021,.010]
];
function foldHeight(x,z) {
  let h=.008*Math.sin(x*4.5+z*3.1)+.007*Math.cos(z*6.4-x*2.3);
  for(const [cx,cz,dx,dz,len,width,depth] of folds) {
    const along=(x-cx)*dx+(z-cz)*dz;
    const across=(x-cx)*dz-(z-cz)*dx;
    const taper=gauss((along-len*.3)/(len*.48));
    const w=width*(1+.6*clamp(along/len,0,1));
    h+=depth*taper*(1.1*gauss((across-w*1.4)/(w*1.7))-.8*gauss(across/(w*.6)));
  }
  return h;
}
function duvetAt(u,v) {
  const a=(u-.5)*2.39,b=-.43+v*1.63;
  const ox=Math.max(0,Math.abs(a)-.83),oz=Math.max(0,b-.88);
  const sx=Math.sign(a),corner=smooth(ox/.18)*smooth(oz/.18);
  const x=sx*(Math.min(Math.abs(a),.83)+.15*(1-Math.exp(-ox/.055)));
  const z=Math.min(b,.88)+.20*(1-Math.exp(-oz/.055));
  const drop=Math.max(ox*.78,oz*.72)+corner*.015;
  const edgeFold=(.018*Math.sin(b*19+a*2)+.008*Math.sin(b*37+1.4))*smooth(ox/.18);
  const footFold=(.012*Math.sin(a*24+1)+.006*Math.sin(a*43))*smooth(oz/.18);
  const puff=.027*gauss(a/.7)*gauss((b-.28)/.7);
  return [x+sx*edgeFold,.708+puff-drop+foldHeight(a,b)+edgeFold*.25+footFold*.3,z+footFold];
}
add(surface(duvetAt,128,100),ivory,[0,0,0],[0,0,0],7);
for(const u of [0,1]) tube(Array.from({length:70},(_,i)=>duvetAt(u,i/69)),.002,seamIvory,false,90);
tube(Array.from({length:90},(_,i)=>duvetAt(i/89,1)),.002,seamIvory,false,110);
// A turned-back duvet top has an actual curved lip and thickness.
add(surface((u,v)=>{
  const p=duvetAt(u,.015+v*.18);
  p[1]+=.012+.026*Math.sin(Math.PI*v)+.004*Math.sin(u*17)*Math.sin(Math.PI*v);
  return p;
},100,24),ivory,[0,0,0],[0,0,0],6);

// A diagonally laid woven runner with a quiet central fold, falling over the left side.
function throwAt(u,v) {
  const du=.018+u*.91;
  const dv=.37+v*.29+u*.14;
  const p=duvetAt(du,dv);
  const ridge=.014*gauss((v-.38-u*.12)/.10)-.005*gauss((v-.22)/.055);
  p[1]+=.017+ridge+.004*Math.sin(u*19+v*5)*Math.sin(v*Math.PI);
  p[0]+=Math.sign(p[0])*.012*smooth((Math.abs(p[0])-.80)/.1);
  return p;
}
add(surface(throwAt,112,48),throwMat,[0,0,0],[0,0,0],[2.8,.7]);
for(const v of [0,1]) tube(Array.from({length:90},(_,i)=>throwAt(i/89,v)),.0018,fringeMat,false,110);
// Short threads at the cut ends, aligned to the drape instead of a decorative comb.
for(const u of [0,1]) for(let i=0;i<48;i++) {
  const p=throwAt(u,i/47);
  tube([p,[p[0]+(u?1:-1)*.006,p[1]-.010,p[2]],[p[0]+(u?1:-1)*.008,p[1]-.020,p[2]+(noise()-.5)*.006]],.00065,fringeMat,false,3);
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
      const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,.42);
      if(hit) blocked+=Math.pow(1-hit.distance/.42,1.4);
    }
    const shade=clamp(1-.87*blocked/samples,.22,1);
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
