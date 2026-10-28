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
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries, mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {PNG} from 'pngjs';
import {MeshBVH} from 'three-mesh-bvh';
import {createHannaOrganicPillows} from './hanna-pillows.mjs';

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

function fabric(name,color,key,roughness=.99){
  const m=new THREE.MeshPhysicalMaterial({name,color,roughness,metalness:0,side:THREE.DoubleSide,vertexColors:true,
    specularIntensity:.10,ior:1.34,sheen:.24,sheenRoughness:1,sheenColor:color});
  m.userData={fabric:key};return m;
}
const velvet=fabric('Ivory velour',0xf1eee6,'velvet');
const mattressMat=fabric('White mattress ticking',0xf0f0e9,'cotton');
const pillowMat=fabric('White linen pillows',0xf5f4ec,'pillow');
const taupeMat=fabric('Warm grey small pillow',0xaaa69b,'pillow');
const quiltMat=fabric('Warm grey quilt',0x99988c,'cotton');
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
  const uv=g.attributes.uv;if(uv)for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*uvScale,uv.getY(i)*uvScale);
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
function box(parent,size,pos,mat,r=.02,rot=[0,0,0],scale=1){
  const g=new RoundedBoxGeometry(...size,mat===velvet?7:3,Math.min(r,...size.map(v=>v/2)));
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
        const fade=Math.sin(Math.PI*clamp(x/size[0]+.5))*Math.sin(Math.PI*clamp(y/size[1]+.5));
        const footPanel=size[0]>1.5&&size[1]<.6&&size[2]<.3;
        const padding=footPanel&&n.getZ(i)>.6?.007*Math.max(0,fade)**.8*(.9+.1*Math.sin(4*x+3*y)):0;
        const warp=padding+fade*(.00065*Math.sin(12*x+4*y)+.00045*Math.cos(19*y-7*x)+.0003*Math.sin(29*x+17*y));
        p.setXYZ(i,x+n.getX(i)*warp,y+n.getY(i)*warp,z+n.getZ(i)*warp);
      }
    }
    // Reconcile geometric normals across duplicated UV vertices. Computing
    // each expanded triangle separately would turn the upholstery into facets.
    if(mat===velvet)smoothPositionNormals(g);
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

function surface(fn,nx,nz,shade=()=>1){
  const positions=[],uvs=[],colors=[],indices=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const u=i/nx,v=j/nz;positions.push(...fn(u,v));uvs.push(u,v);const ao=shade(u,v);colors.push(ao,ao,ao);
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

const bell=(x,centre,width)=>Math.exp(-(((x-centre)/width)**2));
// A continuous padded surface, with a separate underside and rounded stitched
// perimeter. Thickness follows the surface normal even on the hanging sides.
function paddedSurface(fn,nx,nz,thickness,uvMeters=[1,1]){
  const base=surface(fn,nx,nz),p=base.attributes.position,n=base.attributes.normal;
  const top=base.clone(),bottom=base.clone();
  for(let i=0;i<p.count;i++){
    for(const [g,sign] of [[top,1],[bottom,-1]]){
      g.attributes.position.setXYZ(i,p.getX(i)+sign*n.getX(i)*thickness/2,p.getY(i)+sign*n.getY(i)*thickness/2,p.getZ(i)+sign*n.getZ(i)*thickness/2);
      g.attributes.uv.setXY(i,g.attributes.uv.getX(i)*uvMeters[0],g.attributes.uv.getY(i)*uvMeters[1]);
    }
  }
  for(let i=0;i<bottom.index.count;i+=3){const a=bottom.index.getX(i);bottom.index.setX(i,bottom.index.getX(i+2));bottom.index.setX(i+2,a);}
  top.computeVertexNormals();bottom.computeVertexNormals();
  const ring=[];
  for(let i=0;i<=nx;i++)ring.push(i);
  for(let j=1;j<=nz;j++)ring.push(j*(nx+1)+nx);
  for(let i=nx-1;i>=0;i--)ring.push(nz*(nx+1)+i);
  for(let j=nz-1;j>0;j--)ring.push(j*(nx+1));
  const rolled=surface((u,v)=>{
    const a=ring[Math.floor(u*ring.length)%ring.length],b=ring[(Math.floor(u*ring.length)+1)%ring.length];
    const mix=(u*ring.length)%1,point=new THREE.Vector3().fromBufferAttribute(p,a).lerp(new THREE.Vector3().fromBufferAttribute(p,b),mix);
    const normal=new THREE.Vector3().fromBufferAttribute(n,a).lerp(new THREE.Vector3().fromBufferAttribute(n,b),mix).normalize();
    const tangent=new THREE.Vector3().fromBufferAttribute(p,b).sub(new THREE.Vector3().fromBufferAttribute(p,a)).normalize();
    const outward=new THREE.Vector3().crossVectors(normal,tangent).normalize();
    return point.addScaledVector(normal,Math.cos(v*Math.PI)*thickness/2).addScaledVector(outward,Math.sin(v*Math.PI)*thickness/2).toArray();
  },ring.length,6);
  return mergeGeometries([top,bottom,rolled]);
}

// Hanna's quilt is supported by the mattress, with softly filled channels,
// a broad sewn foot border and irregular gravity folds down the side edges.
function quiltPoint(u,v){
  const across=(u-.5)*2,side=clamp((Math.abs(across)-.78)/.22),a=side*Math.PI/2;
  let x=Math.sign(across)*(.78*Math.min(Math.abs(across)/.78,1)+.205*Math.sin(a));
  let z=-.25+v*1.39;
  const end=clamp((z-.96)/.18),b=end*Math.PI/2;
  if(end>0)z=.96+.145*Math.sin(b);
  let y=.664-.345*(1-Math.cos(a))-.126*(1-Math.cos(b))*Math.cos(a)**2;
  const top=Math.cos(a)*Math.cos(b);
  const billow=.012*bell(x,-.52,.32)*bell(z,.47,.75)+.017*bell(x,-.09,.35)*bell(z,.74,.52)+.011*bell(x,.38,.33)*bell(z,.45,.68);
  // Unequal stitched bays have restrained loft, with a few diagonal folds
  // crossing them. They read as filled cloth rather than three inflated rolls.
  const seams=[-.66,-.43,-.17,.09,.34,.61];
  let loft=0;
  for(const [centre,width,height] of [[-.76,.11,.010],[-.54,.12,.015],[-.30,.14,.012],[-.04,.13,.018],[.22,.13,.014],[.48,.14,.011],[.74,.11,.014]]){
    loft+=height*.6*bell(x+.012*Math.sin(z*4+centre*7),centre,width)*(.38+.62*bell(z,.56,.21));
  }
  const fold=.010*bell(x+.19*z,-.25,.075)*bell(z,.57,.41)-.005*bell(x-.13*z,.10,.033)*bell(z,.64,.29)+.008*bell(x+.23*z,.66,.065)*bell(z,.40,.32);
  y+=top*(billow+loft+fold);
  for(const [i,line] of seams.entries()){
    y-=top*.0038*bell(x,line+.007*Math.sin(z*5+i),.012+i%2*.004);
  }
  y-=top*.0055*bell(z,.70+.008*Math.sin(5*x),.016);
  const border=bell(v,.905,.012);
  y-=.013*border*Math.cos(b);z-=.013*border*Math.sin(b);
  // The filled front border bulges out along its own normal, not only upwards.
  // Three unequal bays and two relaxed gathers remain readable from the foot.
  const frontFill=.008*bell(x,-.76,.11)+.011*bell(x,-.54,.12)+.008*bell(x,-.30,.14)+.013*bell(x,-.04,.13)+.010*bell(x,.22,.13)+.009*bell(x,.48,.14)+.011*bell(x,.74,.11);
  z+=Math.sin(b)*Math.cos(a)**2*frontFill;
  // Small compression folds taper away from the stitched border. The folded
  // front is displaced along its normal so the detail survives the low camera.
  for(const [i,line] of seams.entries()){
    const d=x-line-(v-.92)*(i%2?.18:-.13),gather=bell(v,.956,.076);
    const crease=-.009*bell(d,0,.014)+.006*bell(d,.025,.025);
    z+=Math.sin(b)*gather*crease;
    y+=Math.cos(b)*gather*crease;
  }
  const relaxed=.007*bell(x,-.59,.13)-.005*bell(x,-.22,.10)+.009*bell(x,.18,.16)-.006*bell(x,.55,.12);
  y+=bell(v,.986,.035)*relaxed*1.8;
  const shortGathers=[[-.77,.012,.009],[-.60,.017,.012],[-.47,.011,.008],[-.34,.020,.011],[-.21,.013,.010],[-.07,.017,.013],[.06,.010,.008],[.19,.016,.011],[.31,.012,.010],[.44,.021,.012],[.57,.013,.009],[.70,.018,.011],[.81,.011,.008]];
  for(const [i,[at,width,depth]] of shortGathers.entries()){
    const crease=bell(x+(v-.96)*(i%2?.23:-.18),at,width);
    z-=depth*crease*bell(v,.957+(i%3-1)*.012,.035)*Math.cos(a)**2;
  }
  const sideFold=.014*bell(z,.34,.14)-.009*bell(z,.50,.06)+.018*bell(z,.79,.18)-.006*bell(z,.93,.05);
  y+=side*sideFold*Math.sin(a);
  x+=Math.sign(x)*side*(.010*bell(z,.44,.19)-.005*bell(z,.71,.09)+.012*bell(z,.94,.15));
  return [x,y,z];
}
const quilt=paddedSurface((u,v)=>toUpper(quiltPoint(u,v)),144,96,.025,[2.25,1.40]);
add(upper,quilt,quiltMat,[0,0,0],[0,0,0],8);
for(const side of [0,1])tube(upper,Array.from({length:80},(_,j)=>toUpper(quiltPoint(side,j/79))),.0012,quiltMat,false,100);
tube(upper,Array.from({length:100},(_,i)=>toUpper(quiltPoint(i/99,1))),.0013,quiltMat,false,130);
// A tiny stitched horizontal border lies on the outside of the padded surface.
// Offsetting along the local normal keeps it visible on the rounded front roll.
function quiltOutside(u,v){
  const p=new THREE.Vector3(...quiltPoint(u,v)),du=new THREE.Vector3(...quiltPoint(Math.min(1,u+.0001),v)).sub(new THREE.Vector3(...quiltPoint(Math.max(0,u-.0001),v))),dv=new THREE.Vector3(...quiltPoint(u,v+.0001)).sub(new THREE.Vector3(...quiltPoint(u,v-.0001)));
  return toUpper(p.addScaledVector(dv.cross(du).normalize(),.013).toArray());
}
tube(upper,Array.from({length:145},(_,i)=>quiltOutside(.05+.90*i/144,.905)),.00085,quiltMat,false,180);
// The loose turned top edge has a broad soft roll with a slightly uneven silhouette.
const fold=paddedSurface((u,v)=>{
  const p=quiltPoint(u,.02+v*.20),x=p[0];p[2]=-.27+v*.31+.018*Math.sin(5*x);
  p[1]+=.018+.035*Math.sin(v*Math.PI)+.007*Math.sin(9*x+3*v)*Math.sin(v*Math.PI);return toUpper(p);
},96,28,.014,[2.2,.32]);
add(upper,fold,reverseMat,[0,0,0],[0,0,0],8);

// Thin striped throw, loosely bunched over the quilt and longer at the left edge.
function throwPoint(u,v){
  const side=clamp((Math.abs((u-.5)*2)-.77)/.23),sgn=u<.5?-1:1,a=side*Math.PI/2;
  const left=1-smooth((u-.02)/.30);
  const x=sgn*(Math.min(Math.abs((u-.5)*2),.77)+(.23+.045*left)*Math.sin(a));
  const z=-.03+v*.47+.045*Math.sin(u*6+.7)+.025*Math.sin(u*15+1)*(v-.5)+left*(.70+.18*v);
  const lengthDrop=.26+(.17*(1-smooth((u-.04)/.2)));
  // Linen settles onto the quilt. Only the gathered upper edge rises off its
  // support; the cloth does not bridge the mattress as an independent plane.
  const support=quiltPoint((Math.min(Math.abs(x),.77)*sgn+1)/2,clamp((z+.25)/1.39));
  let y=support[1]+.027+.037*bell(v,.05,.24)-lengthDrop*(1-Math.cos(a));
  const flat=Math.cos(a);
  const gathers=[ [.14,.020,.021,.045],[.24,.014,.013,-.033],[.325,.028,.026,.065],[.405,.016,.017,-.04],[.478,.023,.034,.08],[.55,.013,.019,-.035],[.635,.030,.026,-.06],[.735,.018,.021,.038],[.82,.023,.014,-.03] ];
  for(const [at,width,height,drift] of gathers){
    const centre=at+drift*(v-.45)+.008*Math.sin(v*4+at*12);
    const ridge=bell(u,centre,width)-.32*bell(u,centre+width*1.5,width*.65);
    y+=flat*height*ridge*(.40+.60*bell(v,.45+at*.25,.39));
  }
  y+=flat*.027*bell(u+.09*(v-.4),.485,.045)*bell(v,.34,.22);
  y+=flat*.008*bell(v,.94,.05)*(.35+bell(u,.32,.09)+.65*bell(u,.73,.12));
  // Two broad gravity folds in the long left end, with gently curled edges.
  y+=left*Math.sin(a)*(.020*bell(v,.27,.16)-.010*bell(v,.48,.08)+.015*bell(v,.75,.22));
  if(Math.abs(x)<.981&&z<1.10&&z>-.25){
    // Follow the quilt's curved shoulder as well as its top. This prevents a
    // long diagonal linen end cutting through the filled blanket underneath.
    const qAcross=Math.abs(x)<=.78?Math.abs(x):.78+.22*Math.asin(clamp((Math.abs(x)-.78)/.205))/(Math.PI/2);
    const qZ=z<=.96?z:.96+.18*Math.asin(clamp((z-.96)/.145))/(Math.PI/2);
    const beneath=quiltPoint((1+sgn*qAcross)/2,clamp((qZ+.25)/1.39));
    const supportY=beneath[1]+.023;
    y=supportY+.003*Math.log1p(Math.exp((y-supportY)/.003));
  }
  return [x,y,z];
}
add(upper,paddedSurface((u,v)=>toUpper(throwPoint(u,v)),160,56,.005),stripeMat);
for(const v of [0,1])tube(upper,Array.from({length:125},(_,i)=>toUpper(throwPoint(i/124,v))),.0013,whiteSeam,false,150);

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
  {name:'velvet',normal:'velvet-normal.jpg',strength:.065,color:textile},
  {name:'cotton',normal:'cotton-normal.jpg',strength:.075,color:textile},
  {name:'pillow',normal:'cotton-normal.jpg',strength:.055,color:textile},
  {name:'stripe',normal:'cotton-normal.jpg',strength:.06,color:stripe},
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
  for(const m of gltf.materials)if(m.extras?.fabric===texture.name){
    m.pbrMetallicRoughness.baseColorTexture={index:base};m.normalTexture={index:normal,scale:texture.strength};
    if(texture.name==='stripe'){
      // Keep the photographic stripe spacing while the linen weave stays tiny.
      m.normalTexture.extensions={KHR_texture_transform:{scale:[17,4]}};
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
console.log(JSON.stringify({model:'dist/assets/models/hanna.glb',bytes:result.length,triangles,drawCalls,animation:'Lift',duration:1,boundsClosed:bounds(frameBounds[0]),boundsOpen:bounds(frameBounds[1]),movingBoundsClosed:bounds(movingBounds[0]),movingBoundsOpen:bounds(movingBounds[1]),validation:scene.userData.validation,recommendedCamera:{orbit:'0deg 85deg 6m',target:'0m 0.85m 0m',fieldOfView:'30deg'}},null,2));
