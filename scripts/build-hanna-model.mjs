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
  const m=new THREE.MeshPhysicalMaterial({name,color,roughness,metalness:0,side:THREE.DoubleSide,vertexColors:true,
    specularIntensity:.18,ior:1.38,sheen:.55,sheenRoughness:.9,sheenColor:0xffffff});
  m.userData={fabric:key};return m;
}
const velvet=fabric('Ivory velour',0xf1eee6,'velvet');
const mattressMat=fabric('White mattress ticking',0xf0f0e9,'cotton');
const pillowMat=fabric('White linen pillows',0xf5f4ec,'pillow');
const taupeMat=fabric('Warm grey small pillow',0xaaa69b,'pillow');
const quiltMat=fabric('Warm grey quilt',0xaaa99a,'cotton');
const reverseMat=fabric('Folded quilt reverse',0xbab9a9,'cotton');
const stripeMat=fabric('Ivory charcoal striped throw',0xffffff,'stripe');
const seamMat=fabric('Fine grey upholstered piping',0x797b76,null);
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
  const uv=g.attributes.uv;if(uv)for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*uvScale,uv.getY(i)*uvScale);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(1,1,1)));
  if(!buckets.has(parent))buckets.set(parent,new Map());const bin=buckets.get(parent);
  if(!bin.has(mat))bin.set(mat,[]);bin.get(mat).push(g);
}
function box(parent,size,pos,mat,r=.02,rot=[0,0,0],scale=1){
  const g=new RoundedBoxGeometry(...size,3,Math.min(r,...size.map(v=>v/2)));
  // Physical textile coordinates keep the grain tiny and consistent across pieces.
  if(mat.userData.fabric&&mat.userData.fabric!=='stripe'){
    const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++){
      const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
      uv.setXY(i,nx>ny&&nx>nz?p.getZ(i):p.getX(i),ny>nx&&ny>nz?p.getZ(i):p.getY(i));
    }
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
box(fixed,[1.88,1.08,.125],[0,.56,-1.105],velvet,.085,[0,0,0],4);
tube(fixed,roundedLoop(0,.56,-1.172,1.855,1.055,.075),.0024,seamMat,true,150);
tube(fixed,roundedLoop(0,.56,-1.040,1.855,1.055,.075),.0022,seamMat,true,150);
for(const x of [-.875,.875])box(fixed,[.15,.415,2.10],[x,.2275,.02],velvet,.04,[0,0,0],4);
box(fixed,[1.90,.415,.16],[0,.2275,1.08],velvet,.04,[0,0,0],4);
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

function surface(fn,nx,nz,shade=()=>1){
  const positions=[],uvs=[],colors=[],indices=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const u=i/nx,v=j/nz;positions.push(...fn(u,v));uvs.push(u,v);const ao=shade(u,v);colors.push(ao,ao,ao);
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

// New Hanna quilt geometry. Drape follows the wide mattress and the photographed
// sewn border; it is not the duvet mesh from the separate Violetta model.
function quiltPoint(u,v){
  const across=(u-.5)*2,side=clamp((Math.abs(across)-.78)/.22),a=side*Math.PI/2;
  let x=Math.sign(across)*(.78*Math.min(Math.abs(across)/.78,1)+.205*Math.sin(a));
  let z=-.25+v*1.39;
  const end=clamp((z-.96)/.18),b=end*Math.PI/2;
  if(end>0)z=.96+.145*Math.sin(b);
  // A corner hangs to one hem depth, rather than adding the two edge drops.
  let y=.663-.345*(1-Math.cos(a))-.126*(1-Math.cos(b))*Math.cos(a)**2;
  const top=Math.cos(a)*Math.cos(b);
  y+=top*(.014*Math.sin(7*x+2*z)+.010*Math.sin(11*z-3*x)+.007*Math.cos(17*x+7*z));
  y+=.004*Math.sin(54*x+17*z)*Math.sin(31*z+5*x)*( .35+.65*side );
  y-=.004*Math.exp(-Math.pow(Math.sin((x+.07)*Math.PI/.40)/.085,2))*top;
  const border=Math.exp(-Math.pow((v-.89)/.009,2));y-=.009*border;
  x+=Math.sign(x)*.006*Math.sin(27*z+3*x)*side;z+=.005*Math.sin(34*x)*end;
  return [x,y,z];
}
const quilt=surface((u,v)=>toUpper(quiltPoint(u,v)),110,100,(u,v)=>.96+.04*Math.sin(u*Math.PI)*Math.sin(v*Math.PI));
add(upper,quilt,quiltMat,[0,0,0],[0,0,0],4);
for(const side of [0,1])tube(upper,Array.from({length:80},(_,j)=>toUpper(quiltPoint(side,j/79))),.0023,quiltMat,false,100);
tube(upper,Array.from({length:100},(_,i)=>toUpper(quiltPoint(i/99,1))),.0023,quiltMat,false,130);
// The loose turned top edge has a broad soft roll with a slightly uneven silhouette.
const fold=surface((u,v)=>{
  const p=quiltPoint(u,.02+v*.20),x=p[0];p[2]=-.27+v*.31+.018*Math.sin(5*x);
  p[1]+=.017+.045*Math.sin(v*Math.PI)+.009*Math.sin(15*x+8*v)*Math.sin(v*Math.PI);return toUpper(p);
},96,32);
add(upper,fold,reverseMat,[0,0,0],[0,0,0],4);

// Thin striped throw, loosely bunched over the quilt and longer at the left edge.
function throwPoint(u,v){
  const side=clamp((Math.abs((u-.5)*2)-.77)/.23),sgn=u<.5?-1:1,a=side*Math.PI/2;
  const x=sgn*(Math.min(Math.abs((u-.5)*2),.77)+.23*Math.sin(a));
  const z=.13+v*.49+.09*Math.sin(u*6+.7)+.04*Math.sin(u*21)*(v-.5);
  const lengthDrop=.26+(.17*(1-smooth((u-.04)/.2)));
  let y=.714-lengthDrop*(1-Math.cos(a));
  const flat=Math.cos(a);
  y+=flat*(.019*Math.sin(19*u+3*v)*Math.sin(Math.PI*v)+.020*Math.sin(33*u+5*v)*Math.sin(Math.PI*v)**2);
  y+=.012*Math.sin(10*v+8*u)*flat+.005*Math.sin(57*u+9*v);
  // Extra relaxed fold at the far edge; no stacked or detached strips.
  y+=.021*Math.exp(-(((v-.88)/.09)**2))*( .65+.35*Math.sin(18*u) );
  return [x,y,z];
}
add(upper,surface((u,v)=>toUpper(throwPoint(u,v)),170,58),stripeMat);
for(const v of [0,1])tube(upper,Array.from({length:125},(_,i)=>toUpper(throwPoint(i/124,v))),.0013,whiteSeam,false,150);

// The CC0 pillow mesh is reshaped and posed for Hanna; only this reusable textile
// geometry is shared with the old build. All bed, bedding and cloth above are new.
const pillowSource=JSON.parse(gunzipSync(await readFile(resolve(root,'scripts/materials/bed-cloth.json.gz')))).filter(p=>p.material==='pillow');
function pillow(piece,targetSize,targetCentre,material){
  const g=new THREE.BufferGeometry();
  for(const [name,n] of [['position',3],['normal',3],['uv',2]])g.setAttribute(name,new THREE.Float32BufferAttribute(piece[name],n));
  g.computeBoundingBox();const bounds=g.boundingBox,size=bounds.getSize(new THREE.Vector3()),centre=bounds.getCenter(new THREE.Vector3());
  g.translate(-centre.x,-centre.y,-centre.z);g.scale(...targetSize.map((v,k)=>v/size.getComponent(k)));
  const smoothed=mergeVertices(g,.00001);smoothed.computeVertexNormals();
  add(upper,smoothed,material,toUpper(targetCentre),[0,0,0],2.5);
}
pillow(pillowSource[0],[.77,.415,.300],[-.405,.824,-.718],pillowMat);
pillow(pillowSource[1],[.77,.415,.300],[.405,.826,-.714],pillowMat);
pillow(pillowSource[2],[.57,.30,.255],[.012,.793,-.478],taupeMat);
// White bolster ends are visible behind the large pillows in the source profile.
for(const x of [-.40,.40]){
  const g=new THREE.CapsuleGeometry(.083,.56,5,16);g.rotateZ(Math.PI/2);
  add(upper,g,pillowMat,toUpper([x,.706,-.865]),[0,0,0],3);
}

// Merge per material and rigid parent. These groups remain separate for animation.
let triangles=0,drawCalls=0;
for(const [parent,bin] of buckets)for(const [mat,geometries] of bin){
  const g=mergeVertices(mergeGeometries(geometries),.00001);const mesh=new THREE.Mesh(g,mat);
  mesh.name=parent.name+'_'+mat.name.replaceAll(' ','_');parent.add(mesh);triangles+=g.index.count/3;drawCalls++;
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
      const stripe=(x/size*25)%1;
      if(stripe>.39&&stripe<.50)value=106+noise*8;
      else if((stripe>.35&&stripe<.37)||(stripe>.52&&stripe<.54))value=151+noise*6;
      else value=246+noise*3;
    }
    const offset=(y*size+x)*4;png.data[offset]=clamp(Math.round(value),0,255);png.data[offset+1]=clamp(Math.round(value),0,255);png.data[offset+2]=clamp(Math.round(value-.7),0,255);png.data[offset+3]=255;
  }return PNG.sync.write(png);
}
const textile=texturePng('weave'),stripe=texturePng('stripe');
const textureDefs=[
  {name:'velvet',normal:'velvet-normal.jpg',strength:.10,color:textile},
  {name:'cotton',normal:'cotton-normal.jpg',strength:.13,color:textile},
  {name:'pillow',normal:'pillow-normal.jpg',strength:.14,color:textile},
  {name:'stripe',normal:'cotton-normal.jpg',strength:.10,color:stripe},
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
  const baseKey=texture.name==='stripe'?'stripe':'weave';
  if(!embedded.has(baseKey))embedded.set(baseKey,embedImage(texture.color,baseKey+'-color','image/png'));
  if(!embedded.has(texture.normal))embedded.set(texture.normal,embedImage(await readFile(resolve(root,'scripts/materials',texture.normal)),texture.name+'-normal','image/jpeg'));
  const base=embedded.get(baseKey),normal=embedded.get(texture.normal);
  for(const m of gltf.materials)if(m.extras?.fabric===texture.name){m.pbrMetallicRoughness.baseColorTexture={index:base};m.normalTexture={index:normal,scale:texture.strength};}
}
gltf.buffers[0].byteLength=byteLength;
const json=Buffer.from(JSON.stringify(gltf)),jsonPad=Buffer.alloc((4-json.length%4)%4,0x20),body=Buffer.concat(parts),bodyPad=Buffer.alloc((4-body.length%4)%4);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+jsonPad.length+8+body.length+bodyPad.length,8);header.writeUInt32LE(json.length+jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(body.length+bodyPad.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const result=Buffer.concat([header,json,jsonPad,binHeader,body,bodyPad]);
await writeFile(resolve(out,'hanna.glb'),result);
const bounds=b=>({min:b.min.toArray(),max:b.max.toArray(),size:b.getSize(new THREE.Vector3()).toArray()});
console.log(JSON.stringify({model:'dist/assets/models/hanna.glb',bytes:result.length,triangles,drawCalls,animation:'Lift',duration:1,boundsClosed:bounds(frameBounds[0]),boundsOpen:bounds(frameBounds[1]),movingBoundsClosed:bounds(movingBounds[0]),movingBoundsOpen:bounds(movingBounds[1]),validation:scene.userData.validation,recommendedCamera:{orbit:'18deg 65deg 6.5m',target:'0m 0.85m 0m',fieldOfView:'30deg'}},null,2));
