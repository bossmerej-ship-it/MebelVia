/**
 * Hanna / Sensor Flit: original visual reconstruction from the supplied photograph
 * and manufacturer product photographs. The user confirmed the private-label name.
 * Mattress 160 × 200 cm, headboard 110 cm, recess 7 cm, floor gap 2 cm.
 * Other shell dimensions and linkage geometry are photographic estimates, not CAD.
 * Run: node scripts/build-hanna-model.mjs
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries, mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {PNG} from 'pngjs';
import {MeshBVH} from 'three-mesh-bvh';
import {createHannaOrganicPillows} from './hanna-pillows.mjs';
import {finishHannaClothPieces} from './hanna-cloth-finish.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,'dist/assets/models');
await mkdir(out,{recursive:true});
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const scene=new THREE.Scene();scene.name='Hanna';
const fixed=new THREE.Group();fixed.name='FixedFrame';scene.add(fixed);
const upper=new THREE.Group();upper.name='UpperAssembly';scene.add(upper);
const mechanism=new THREE.Group();mechanism.name='LiftMechanism';scene.add(mechanism);
const buckets=new Map();

function fabric(name,color,key,roughness=.96){
  // GLTFExporter writes sheenColor directly; a separate .sheen multiplier is
  // not retained. Put the intended low fibre sheen into the exported colour.
  const sheen=key==='velvet'?.18:key==='stripe'?.07:.10;
  const m=new THREE.MeshPhysicalMaterial({name,color,roughness,metalness:0,side:THREE.DoubleSide,vertexColors:true,
    specularIntensity:.18,ior:1.46,sheen:1,sheenRoughness:1,sheenColor:new THREE.Color(color).multiplyScalar(sheen)});
  m.userData={fabric:key};return m;
}
const velvet=fabric('Ivory velour',0xffffff,'velvet');
const mattressMat=fabric('White mattress ticking',0xf8f8f2,'cotton');
const pillowMat=fabric('White linen pillows',0xfafaf5,'pillow');
const taupeMat=fabric('Warm grey small pillow',0xaaa69f,'pillow');
const quiltMat=fabric('Warm grey quilt',0xdcdcd8,'quilt');
const reverseMat=fabric('Folded quilt reverse',0xaaa798,'cotton');
const stripeMat=fabric('Ivory charcoal striped throw',0xffffff,'stripe');
const seamMat=fabric('Fine grey upholstered piping',0x9e9f95,null);
const whiteSeam=fabric('Mattress edge stitching',0xd8d9cf,null);
const wood=new THREE.MeshStandardMaterial({name:'Birch laminated slats',color:0xc5ad83,roughness:.72});
const inner=new THREE.MeshStandardMaterial({name:'Light storage lining',color:0xe0dfd7,roughness:.92});
const floorMat=new THREE.MeshStandardMaterial({name:'Storage bottom',color:0xc8c8bf,roughness:.95});
const steel=new THREE.MeshStandardMaterial({name:'Powder coated steel',color:0x363c3e,roughness:.58,metalness:.35});
const armMat=new THREE.MeshStandardMaterial({name:'Lift arms graphite steel',color:0x60676a,roughness:.47,metalness:.55});
const black=new THREE.MeshStandardMaterial({name:'Gas strut black enamel',color:0x121517,roughness:.35,metalness:.55});
const chrome=new THREE.MeshStandardMaterial({name:'Piston and pivot steel',color:0xb4b7b7,roughness:.23,metalness:.85});

function add(parent,geo,mat,pos=[0,0,0],rot=[0,0,0],uvScale=1){
  let g=geo.index?geo.toNonIndexed():geo;g.clearGroups();
  if(!g.getAttribute('color'))g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(1),3));
  // The measured textiles cover about 30 cm per tile. Coordinates on each
  // fabric piece are metres, so this scale is shared across their surfaces.
  const textileScale=mat.userData.fabric&&mat.userData.fabric!=='stripe'?1/.30:uvScale;
  const uv=g.attributes.uv;if(uv)for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*textileScale,uv.getY(i)*textileScale);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(1,1,1)));
  if(!buckets.has(parent))buckets.set(parent,new Map());const bin=buckets.get(parent);
  if(!bin.has(mat))bin.set(mat,[]);bin.get(mat).push(g);
}
function smoothPositionNormals(geometry){
  const p=geometry.attributes.position,n=geometry.attributes.normal,keys=[],sums=new Map();
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(value=>Math.round(value*1e5)).join(',');
    keys.push(key);if(!sums.has(key))sums.set(key,new THREE.Vector3());
  }
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    normal.crossVectors(b.sub(a),c.sub(a));
    for(let j=0;j<3;j++)sums.get(keys[i+j]).add(normal);
  }
  for(let i=0;i<p.count;i++){
    const smooth=sums.get(keys[i]);
    if(smooth.lengthSq()>1e-15){smooth.normalize();n.setXYZ(i,smooth.x,smooth.y,smooth.z);}
  }
}
function subdivideUpholsteryFaces(geometry){
  // RoundedBoxGeometry spends its subdivisions on the bevels. Its broad faces
  // are still long triangles, so padding needs a few interior vertices too.
  const source=geometry.index?geometry.toNonIndexed():geometry;
  const attributes=['position','normal','uv'],output=Object.fromEntries(attributes.map(key=>[key,[]]));
  const vertex=i=>Object.fromEntries(attributes.map(key=>[key,Array.from({length:source.attributes[key].itemSize},(_,j)=>source.attributes[key].array[i*source.attributes[key].itemSize+j])]));
  const midpoint=(a,b)=>Object.fromEntries(attributes.map(key=>[key,a[key].map((v,j)=>(v+b[key][j])/2)]));
  function split(a,b,c,depth=0){
    const longest=Math.max(...[[a,b],[b,c],[c,a]].map(([v,w])=>v.position.reduce((sum,x,j)=>sum+(x-w.position[j])**2,0)));
    if(longest>.12**2&&depth<6&&[a,b,c].every(v=>v.normal[2]>.999)){
      const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
      split(a,ab,ca,depth+1);split(ab,b,bc,depth+1);split(ca,bc,c,depth+1);split(ab,bc,ca,depth+1);
    }else for(const v of [a,b,c])for(const key of attributes)output[key].push(...v[key]);
  }
  for(let i=0;i<source.attributes.position.count;i+=3)split(vertex(i),vertex(i+1),vertex(i+2));
  const result=new THREE.BufferGeometry();
  for(const key of attributes)result.setAttribute(key,new THREE.Float32BufferAttribute(output[key],key==='uv'?2:3));
  return result;
}
function box(parent,size,pos,mat,r=.02,rot=[0,0,0],scale=1){
  const radius=Math.min(r,...size.map(v=>v/2));
  let g=new RoundedBoxGeometry(...size,mat===velvet?7:3,radius);
  const fittedTicking=mat===mattressMat&&size[1]>.1;
  if(mat===velvet||fittedTicking)g=subdivideUpholsteryFaces(g);
  // Physical textile coordinates keep the grain tiny and consistent across pieces.
  if(mat.userData.fabric&&mat.userData.fabric!=='stripe'){
    const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++){
      const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
      uv.setXY(i,nx>ny&&nx>nz?p.getZ(i):p.getX(i),ny>nx&&ny>nz?p.getZ(i):p.getY(i));
      if(mat===velvet){
        // Sub-millimetre padding variation breaks a perfectly moulded surface.
        // It fades at the perimeter so the photographed silhouette is retained.
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        const fade=Math.sin(Math.PI*clamp(x/Math.max(.001,size[0]-2*radius)+.5))*Math.sin(Math.PI*clamp(y/Math.max(.001,size[1]-2*radius)+.5));
        const footPanel=size[0]>1.5&&size[1]<.6&&size[2]<.3;
        const headPanel=size[0]>1.5&&size[1]>.8;
        const padding=n.getZ(i)>.6&&(footPanel||headPanel)?(footPanel?.010:.006)*Math.max(0,fade)**.8*(.9+.1*Math.sin(4*x+3*y)):0;
        const warp=padding+fade*(.00065*Math.sin(12*x+4*y)+.00045*Math.cos(19*y-7*x)+.0003*Math.sin(29*x+17*y));
        p.setXYZ(i,x+n.getX(i)*warp,y+n.getY(i)*warp,z+n.getZ(i)*warp);
      }else if(fittedTicking&&n.getZ(i)>.5){
        // A fitted fabric face has shallow, unequal tension gathers; it is
        // not the perfectly planar front of a solid foam or plastic block.
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        const bell=(value,centre,width)=>Math.exp(-(((value-centre)/width)**2));
        const fade=Math.sin(Math.PI*clamp(x/(size[0]-2*radius)+.5))*Math.sin(Math.PI*clamp(y/(size[1]-2*radius)+.5));
        const pull=.0018*bell(x+.7*y,-.60,.035)*bell(y,.018,.08)
          +.0013*bell(x-.4*y,.57,.048)*bell(y,-.005,.075);
        const crown=.004+.0028*bell(x,-.27,.30)*bell(y,.014,.085)+.0018*bell(x,.38,.22)*bell(y,-.018,.08);
        const warp=Math.max(0,fade)*(crown-pull)*smooth((n.getZ(i)-.5)/.5);
        p.setXYZ(i,x+n.getX(i)*warp,y+n.getY(i)*warp,z+n.getZ(i)*warp);
      }
    }
    // Reconcile geometric normals across duplicated UV vertices. Computing
    // each expanded triangle separately would turn the upholstery into facets.
    if(mat===velvet||fittedTicking)smoothPositionNormals(g);
  }
  add(parent,g,mat,pos,rot,scale);
}
function tube(parent,points,r,mat,closed=false,segments=points.length*5){
  add(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed,'centripetal'),segments,r,5,closed),mat);
}
function roundedLoop(cx,cy,z,w,h,r){
  const points=[];for(const [x,y,start] of [[cx+w/2-r,cy+h/2-r,0],[cx-w/2+r,cy+h/2-r,90],[cx-w/2+r,cy-h/2+r,180],[cx+w/2-r,cy-h/2+r,270]]){
    for(let i=0;i<=5;i++){const a=(start+i*18)*Math.PI/180;points.push([x+r*Math.cos(a),y+r*Math.sin(a),z]);}
  }return points;
}

// The source bed has flat, softly rounded upholstery and a very fine perimeter welt.
box(fixed,[1.88,1.08,.125],[0,.56,-1.105],velvet,.085,[0,0,0],8);
tube(fixed,roundedLoop(0,.56,-1.172,1.855,1.055,.075),.0017,seamMat,true,150);
tube(fixed,roundedLoop(0,.56,-1.040,1.855,1.055,.075),.0016,seamMat,true,150);
for(const x of [-.875,.875])box(fixed,[.15,.415,2.10],[x,.2275,.02],velvet,.04,[0,0,0],8);
box(fixed,[1.90,.415,.16],[0,.2275,1.08],velvet,.04,[0,0,0],8);
// Recessed small feet give the specified 2 cm floor clearance without a floating frame.
for(const x of [-.74,.74])for(const z of [-.88,.87])box(fixed,[.09,.032,.10],[x,.016,z],black,.008);
box(fixed,[1.58,.035,1.96],[0,.072,0],floorMat,.004);
for(const x of [-.794,.794])box(fixed,[.024,.27,1.96],[x,.227,0],inner,.004);
for(const z of [-.98,.98])box(fixed,[1.59,.27,.024],[0,.227,z],inner,.004);
box(fixed,[.028,.23,1.94],[0,.19,0],inner,.004);
// Bottom-board joints and ventilation notches remain subtle in the open storage box.
for(const z of [-.32,.33])box(fixed,[1.55,.003,.008],[0,.091,z],floorMat,.001);

// Four-bar kinematics. B and C are bearings on the moving platform. Both arm
// lengths are invariant; the small forward motion keeps bedding clear of the head.
const linkage={originZ:-.85,closedY:.35,A:[.30,.17],D:[1.095,.255],coupler:.375,maxAngleDegrees:40};
linkage.shortLength=Math.hypot(linkage.A[0],linkage.closedY-linkage.A[1]);
linkage.longLength=Math.hypot(linkage.coupler-linkage.D[0],linkage.closedY-linkage.D[1]);
function pose(t){
  const theta=t*linkage.maxAngleDegrees*Math.PI/180;
  const [ax,ay]=linkage.A,[dx,dy]=linkage.D,l=linkage.coupler;
  const ex=dx-l*Math.cos(theta),ey=dy-l*Math.sin(theta),vx=ex-ax,vy=ey-ay,d=Math.hypot(vx,vy);
  const a=(linkage.shortLength**2-linkage.longLength**2+d*d)/(2*d),h=Math.sqrt(Math.max(0,linkage.shortLength**2-a*a));
  // The upper/rear intersection is continuous on this 0–40 degree interval.
  const bx=ax+a*vx/d-h*vy/d,by=ay+a*vy/d+h*vx/d;
  return {theta,B:[bx,by],C:[bx+l*Math.cos(theta),by+l*Math.sin(theta)],position:new THREE.Vector3(0,by,linkage.originZ+bx),quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-theta)};
}
const closed=pose(0);
if(Math.hypot(closed.B[0],closed.B[1]-.35)>1e-8)throw new Error('Incorrect four-bar assembly branch');
upper.position.copy(closed.position);upper.quaternion.copy(closed.quaternion);
function toUpper(p){return [p[0],p[1]-.35,p[2]+.85];}
function upperBox(size,p,mat,r=.02,rot=[0,0,0],scale=1){box(upper,size,toUpper(p),mat,r,rot,scale);}

// Slatted mattress platform. The underside remains readable as one rigid assembly.
for(const x of [-.775,.775])upperBox([.035,.035,1.96],[x,.35,0],steel,.009);
for(const z of [-.965,.965])upperBox([1.57,.035,.035],[0,.35,z],steel,.009);
upperBox([.035,.04,1.94],[0,.35,0],steel,.008);
for(let j=0;j<15;j++){
  const z=-.89+j*1.78/14;
  for(const s of [-1,1]){
    // Slight crown across each bent birch slat, rather than a filled solid slab.
    const g=new RoundedBoxGeometry(.705,.014,.065,1,.0035),p=g.attributes.position;
    for(let k=0;k<p.count;k++)p.setY(k,p.getY(k)+.008*Math.sin((p.getX(k)/.705+.5)*Math.PI));
    g.computeVertexNormals();add(upper,g,wood,toUpper([s*.3875,.348,z]));
    for(const x of [s*.038,s*.748])upperBox([.045,.027,.076],[x,.358,z],black,.006);
  }
}
upperBox([1.6,.245,2],[0,.4875,0],mattressMat,.045,[0,0,0],5);
// A shallow rounded top pad gives a fitted ticking edge, not an extra floating layer.
upperBox([1.60,.045,2],[0,.610,0],mattressMat,.021,[0,0,0],5);
for(const y of [.405,.587])tube(upper,roundedLoop(0,0,y,1.598,1.998,.065).map(([x,z,height])=>toUpper([x,height,z])),.002,whiteSeam,true,150);
// Fabric pull handle at the foot of the slatted base.
tube(upper,[[-.07,.367,.98],[-.07,.353,1.035],[.07,.353,1.035],[.07,.367,.98]].map(toUpper),.007,black,false,32);

// Offline cloth simulation settles the loose fabric against the mattress.
// Cache coordinates are the closed bed's world axes; all textile meshes then
// attach to the unchanged rigid platform for the existing lift animation.
const cloth=finishHannaClothPieces(JSON.parse(gunzipSync(await readFile(resolve(root,'scripts/materials/hanna-cloth.json.gz')))));
function remapSeam(value,source,target){
  for(let i=1;i<source.length;i++)if(value<=source[i])return THREE.MathUtils.lerp(target[i-1],target[i],clamp((value-source[i-1])/(source[i]-source[i-1])));
  return 1;
}
for(const piece of cloth){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(piece.position,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(piece.normal,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(piece.uv,2));
  if(piece.material==='quilt'){
    const colourUv=[];
    for(let i=0;i<piece.uv.length;i+=2){
      colourUv.push(remapSeam(piece.uv[i]/2.23,[0,.14,.275,.415,.56,.71,.855,1],[0,.147,.286,.43,.57,.715,.854,1]),
        remapSeam(piece.uv[i+1]/1.36,[0,.34,.615,.935,1],[0,.35,.66,.91,1]));
    }
    // A dedicated map follows the sewn cells; the weave/roughness retains its
    // separate, physically sized coordinates rather than stretching with it.
    g.setAttribute('uv1',new THREE.Float32BufferAttribute(colourUv,2));
  }
  g.translate(0,-.35,.85);
  const material=piece.material==='stripe'?stripeMat:piece.material==='reverse'?reverseMat:quiltMat;
  add(upper,g,material,[0,0,0],[0,0,0],piece.material==='stripe'?1:8);
}

for(const piece of createHannaOrganicPillows()){
  const material=piece.material==='taupe'?taupeMat:piece.material==='seam'?whiteSeam:pillowMat;
  piece.geometry.translate(0,-.35,.85);
  add(upper,piece.geometry,material,[0,0,0],[0,0,0],8);
}

// Merge per material and rigid parent. These groups remain separate for animation.
let triangles=0,drawCalls=0;
for(const [parent,bin] of buckets)for(const [mat,geometries] of bin){
  const g=mergeVertices(mergeGeometries(geometries),.00001);const mesh=new THREE.Mesh(g,mat);
  mesh.name=parent.name+'_'+mat.name.replaceAll(' ','_');parent.add(mesh);triangles+=g.index.count/3;drawCalls++;
}

// Soft contact occlusion is baked inside each rigid group separately. Pillow /
// quilt contacts follow the platform, while the fixed shell never retains an
// obsolete shadow from the lifted mattress. No runtime ray tracing is required.
for(const parent of [fixed,upper]){
  const occluders=mergeGeometries(parent.children.map(mesh=>{
    const g=mesh.geometry.clone();
    for(const name of Object.keys(g.attributes))if(name!=='position')g.deleteAttribute(name);
    return g;
  }));
  const bvh=new MeshBVH(occluders),ray=new THREE.Ray();
  const n=new THREE.Vector3(),tangent=new THREE.Vector3(),bitangent=new THREE.Vector3();
  const up=new THREE.Vector3(0,1,0),right=new THREE.Vector3(1,0,0),count=24;
  const range=parent===upper?.16:.12,strength=parent===upper?.58:.40;
  for(const mesh of parent.children){
    const g=mesh.geometry,p=g.attributes.position,norm=g.attributes.normal,colors=new Uint8Array(p.count*3);
    for(let i=0;i<p.count;i++){
      n.fromBufferAttribute(norm,i).normalize();
      tangent.crossVectors(Math.abs(n.y)<.95?up:right,n).normalize();bitangent.crossVectors(n,tangent);
      ray.origin.fromBufferAttribute(p,i).addScaledVector(n,.0015);
      let blocked=0;
      for(let s=0;s<count;s++){
        const radius=Math.sqrt((s+.5)/count),angle=s*2.399963229728653;
        ray.direction.copy(n).multiplyScalar(Math.sqrt(1-radius*radius)).addScaledVector(tangent,radius*Math.cos(angle)).addScaledVector(bitangent,radius*Math.sin(angle));
        const hit=bvh.raycastFirst(ray,THREE.DoubleSide,0,range);
        if(hit)blocked+=Math.pow(1-hit.distance/range,1.5);
      }
      let shade=clamp(1-strength*blocked/count,.48,1);
      if(mesh.material===velvet){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        // Directional velvet nap: a restrained 2–3% luminance change, with no
        // gritty noise or dark patches. Geometry keeps its original silhouette.
        const weave=.50*Math.sin(11*x+8*y+1.4*Math.sin(5*y+z))+.30*Math.sin(17*x-9*y+Math.sin(4*x+2*z))+.20*Math.sin(31*x+23*y+.7*z);
        shade*=.974+.025*weave;
      }
      const value=Math.round(shade*255);
      colors.set([value,value,value],i*3);
    }
    g.setAttribute('color',new THREE.Uint8BufferAttribute(colors,3,true));
  }
  occluders.dispose();
}

const movers=[];
function orientedPart(name,length,radius,mat,shape='cylinder'){
  const geo=shape==='bar'?new RoundedBoxGeometry(.013,length,.030,2,.005):new THREE.CylinderGeometry(radius,radius,length,12);
  const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mechanism.add(mesh);movers.push(mesh);triangles+=(geo.index?.count??geo.attributes.position.count)/3;drawCalls++;return mesh;
}
function placeBetween(mesh,a,b){
  const dir=new THREE.Vector3().subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
}
const rigs=[];
for(const [side,x] of [['Left',-.747],['Right',.747]]){
  const short=orientedPart('LiftArm'+side+'Short',linkage.shortLength,.01,armMat,'bar');
  const long=orientedPart('LiftArm'+side+'Long',linkage.longLength,.01,armMat,'bar');
  const gasBody=orientedPart('GasBody'+side,.48,.014,black);
  const gasRod=orientedPart('GasRod'+side,.60,.0065,chrome);
  const bolts=[];
  for(const label of ['A','B','C','D','GasFixed','GasMoving']){
    const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.017,.017,.022,12),chrome);bolt.name='Pivot'+side+label;
    bolt.rotation.z=Math.PI/2;mechanism.add(bolt);movers.push(bolt);bolts.push(bolt);drawCalls++;
  }
  rigs.push({x,side,short,long,gasBody,gasRod,bolts});
  // Mounting plate on the fixed inner rail, separate from moving arms.
  const plate=new THREE.Mesh(new RoundedBoxGeometry(.016,.16,.84,2,.008),armMat);
  plate.name='FixedMount'+side;plate.position.set(x,.25,-.15);mechanism.add(plate);drawCalls++;
}
function worldPoint(p,local){return new THREE.Vector3(...local).applyQuaternion(p.quaternion).add(p.position);}
function setPose(t){
  const p=pose(t);upper.position.copy(p.position);upper.quaternion.copy(p.quaternion);
  for(const r of rigs){
    const A=new THREE.Vector3(r.x,linkage.A[1],linkage.originZ+linkage.A[0]);
    const D=new THREE.Vector3(r.x,linkage.D[1],linkage.originZ+linkage.D[0]);
    const B=worldPoint(p,[r.x,0,0]),C=worldPoint(p,[r.x,0,linkage.coupler]);
    placeBetween(r.short,A,B);placeBetween(r.long,D,C);
    const G=new THREE.Vector3(r.x-.022*Math.sign(r.x),.135,.55);
    const H=worldPoint(p,[G.x,-.015,.72]);
    const direction=H.clone().sub(G).normalize();
    placeBetween(r.gasBody,G,G.clone().addScaledVector(direction,.48));
    placeBetween(r.gasRod,H.clone().addScaledVector(direction,-.60),H);
    [A,B,C,D,G,H].forEach((point,i)=>r.bolts[i].position.copy(point));
  }scene.updateMatrixWorld(true);return p;
}
const animated=[upper,...movers],samples=81,times=[],values=new Map(animated.map(n=>[n,{p:[],q:[]} ]));
let maxArmError=0,minHeadClearance=Infinity,minFloor=Infinity,minGasOverlap=Infinity,maxGasOverlap=0;
const frameBounds=[],movingBounds=[];
function preciseBounds(object){
  const bounds=new THREE.Box3(),v=new THREE.Vector3();
  object.traverse(node=>{if(node.isMesh){const p=node.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld);bounds.expandByPoint(v);}}});return bounds;
}
for(let i=0;i<samples;i++){
  const t=i/(samples-1),p=setPose(t);times.push(t);
  for(const n of animated){const v=values.get(n);v.p.push(...n.position.toArray());v.q.push(...n.quaternion.toArray());}
  maxArmError=Math.max(maxArmError,Math.abs(Math.hypot(p.B[0]-linkage.A[0],p.B[1]-linkage.A[1])-linkage.shortLength),Math.abs(Math.hypot(p.C[0]-linkage.D[0],p.C[1]-linkage.D[1])-linkage.longLength));
  const mb=preciseBounds(upper);minHeadClearance=Math.min(minHeadClearance,mb.min.z-(-1.0425));minFloor=Math.min(minFloor,mb.min.y);
  for(const r of rigs){const G=new THREE.Vector3(r.x-.022*Math.sign(r.x),.135,.55),H=worldPoint(p,[G.x,-.015,.72]);const overlap=1.08-G.distanceTo(H);minGasOverlap=Math.min(minGasOverlap,overlap);maxGasOverlap=Math.max(maxGasOverlap,overlap);}
  if(i===0||i===samples-1){frameBounds.push(preciseBounds(scene));movingBounds.push(mb);}
}
if(maxArmError>1e-7)throw new Error('Lift arm length changed');
if(minHeadClearance<.002)throw new Error('Moving bedding enters the headboard');
if(minGasOverlap<.025)throw new Error('Gas spring pulls apart');
const tracks=[];
for(const n of animated){const v=values.get(n);tracks.push(new THREE.VectorKeyframeTrack(n.name+'.position',times,v.p));tracks.push(new THREE.QuaternionKeyframeTrack(n.name+'.quaternion',times,v.q));}
const animation=new THREE.AnimationClip('Lift',1,tracks);setPose(0);
scene.userData={
  model:'Hanna / Sensor Flit',units:'metres',provenance:{product:'https://sensorsleep.ru/product/krovat-flit',privateLabelIdentity:'User confirmed Hanna is the same factory model sold with a different name',reference:'User supplied Hanna front photograph; Sensor front, side and top photographs',specification:{mattress:[1.6,2],headboardHeight:1.1,mattressRecess:.07,floorClearance:.02},limitations:'Original photographic reconstruction, not manufacturer CAD. Outer dimensions and linkage mount positions are inferred. Mechanism is a physically constrained illustrative four-bar based on Sensor mechanism reference photos.'},
  mechanism:{...linkage,coordinates:'[z,y] in the side plane; originZ adds to all linkage z values',movingNode:'UpperAssembly',fixedNode:'FixedFrame',sideX:[-.747,.747],fixedGas:[.135,.55],movingGasLocal:[-.015,.72],gasBodyLength:.48,gasRodLength:.60,clip:'Lift',duration:1},
  validation:{samples,maxArmLengthError:maxArmError,minMovingBoundsHeadClearance:minHeadClearance,minMovingY:minFloor,minGasOverlap,maxGasOverlap},
};

// A small embedded color weave plus normal maps gives clean fabric at any size.
function texturePng(kind){
  const size=kind==='stripe'?1024:256,png=new PNG({width:size,height:size});
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const h=Math.sin(x*12.9898+y*78.233)*43758.5453,noise=(h-Math.floor(h)-.5);
    let value=247+noise*3+(x%2?1:-1)+(y%2?.5:-.5);
    if(kind==='stripe'){
      const stripe=(x/size*40)%1;
      if(stripe>.39&&stripe<.50)value=80+noise*8;
      else if((stripe>.35&&stripe<.37)||(stripe>.52&&stripe<.54))value=130+noise*6;
      else value=246+noise*3;
    }
    const offset=(y*size+x)*4;png.data[offset]=clamp(Math.round(value),0,255);png.data[offset+1]=clamp(Math.round(value),0,255);png.data[offset+2]=clamp(Math.round(value-.7),0,255);png.data[offset+3]=255;
  }return PNG.sync.write(png);
}
const textile=texturePng('weave'),stripe=texturePng('stripe');
const textureDefs=[
  {name:'velvet',normal:'velvet-normal.jpg',rough:'velvet-rough.jpg',strength:.16,color:await readFile(resolve(root,'scripts/materials/hanna-ivory-velour-albedo-v2.jpg')),mime:'image/jpeg'},
  {name:'quilt',normal:'cotton-normal.jpg',rough:'cotton-rough.jpg',strength:.24,color:await readFile(resolve(root,'scripts/materials/hanna-grey-quilt-albedo.jpg')),mime:'image/jpeg'},
  {name:'cotton',normal:'cotton-normal.jpg',rough:'cotton-rough.jpg',strength:.24,color:textile},
  {name:'pillow',normal:'cotton-normal.jpg',rough:'cotton-rough.jpg',strength:.22,color:textile},
  {name:'stripe',normal:'cotton-normal.jpg',rough:'cotton-rough.jpg',strength:.22,color:stripe},
];
const binary=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true,animations:[animation]}));
const jsonLength=binary.readUInt32LE(12),gltf=JSON.parse(binary.subarray(20,20+jsonLength).toString());
const parts=[binary.subarray(20+jsonLength+8)];let byteLength=parts[0].length;
gltf.images=[];gltf.textures=[];gltf.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
function embedImage(bytes,name,mimeType){
  const pad=(4-byteLength%4)%4;if(pad){parts.push(Buffer.alloc(pad));byteLength+=pad;}
  const bufferView=gltf.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length})-1;parts.push(bytes);byteLength+=bytes.length;
  const source=gltf.images.push({bufferView,mimeType,name})-1;return gltf.textures.push({source,sampler:0})-1;
}
const embedded=new Map();
for(const texture of textureDefs){
  const baseKey=texture.name==='velvet'?'ivory-velour':texture.name==='quilt'?'grey-quilt':texture.name==='stripe'?'stripe':'weave';
  if(!embedded.has(baseKey))embedded.set(baseKey,embedImage(texture.color,baseKey+'-color',texture.mime??'image/png'));
  if(!embedded.has(texture.normal))embedded.set(texture.normal,embedImage(await readFile(resolve(root,'scripts/materials',texture.normal)),texture.name+'-normal','image/jpeg'));
  if(!embedded.has(texture.rough))embedded.set(texture.rough,embedImage(await readFile(resolve(root,'scripts/materials',texture.rough)),texture.name+'-roughness','image/jpeg'));
  const base=embedded.get(baseKey),normal=embedded.get(texture.normal),rough=embedded.get(texture.rough);
  for(const m of gltf.materials)if(m.extras?.fabric===texture.name){
    m.pbrMetallicRoughness.baseColorTexture={index:base};m.normalTexture={index:normal,scale:texture.strength};
    if(texture.name==='quilt')m.pbrMetallicRoughness.baseColorTexture.texCoord=1;
    m.pbrMetallicRoughness.metallicRoughnessTexture={index:rough};
    if(texture.name==='velvet'){
      // The colour scan covers 60 cm; the measured normal/roughness covers 30 cm.
      m.pbrMetallicRoughness.baseColorTexture.extensions={KHR_texture_transform:{scale:[.5,.5]}};
    }
    if(texture.name==='stripe'){
      // Keep the photographic stripe spacing while the linen weave stays tiny.
      m.normalTexture.extensions={KHR_texture_transform:{scale:[7.5,1.6]}};
      m.pbrMetallicRoughness.metallicRoughnessTexture.extensions={KHR_texture_transform:{scale:[7.5,1.6]}};
    }
    if(texture.name==='velvet'||texture.name==='stripe'){
      gltf.extensionsUsed??=[];if(!gltf.extensionsUsed.includes('KHR_texture_transform'))gltf.extensionsUsed.push('KHR_texture_transform');
    }
  }
}
gltf.buffers[0].byteLength=byteLength;
const json=Buffer.from(JSON.stringify(gltf)),jsonPad=Buffer.alloc((4-json.length%4)%4,0x20),body=Buffer.concat(parts),bodyPad=Buffer.alloc((4-body.length%4)%4);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+jsonPad.length+8+body.length+bodyPad.length,8);header.writeUInt32LE(json.length+jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(body.length+bodyPad.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const result=Buffer.concat([header,json,jsonPad,binHeader,body,bodyPad]);
await writeFile(resolve(out,'hanna.glb'),result);
const bounds=b=>({min:b.min.toArray(),max:b.max.toArray(),size:b.getSize(new THREE.Vector3()).toArray()});
console.log(JSON.stringify({model:'dist/assets/models/hanna.glb',bytes:result.length,triangles,drawCalls,animation:'Lift',duration:1,boundsClosed:bounds(frameBounds[0]),boundsOpen:bounds(frameBounds[1]),movingBoundsClosed:bounds(movingBounds[0]),movingBoundsOpen:bounds(movingBounds[1]),validation:scene.userData.validation,recommendedCamera:{orbit:'0deg 85deg 5.2m',target:'0m 0.94m 0m',fieldOfView:'30deg'}},null,2));
