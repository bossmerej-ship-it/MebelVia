import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';

// Hanna's three cases in the closed bed's world axes: +z faces the visitor.
// The builder moves all of these meshes into the existing UpperAssembly.
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const bell=(x,w)=>Math.exp(-((x/w)**2));
const softMax=(x,min,k=.002)=>min+k*Math.log1p(Math.exp((x-min)/k));

function casingFolds(seed){
  // Unequal fans entering from compressed hems, with no repeating full-face wave.
  const folds=[];
  for(const [edge,at,direction] of [
    ['left',-.61,1],['left',.52,-1],['right',-.44,-1],['right',.66,1],
    ['bottom',-.55,1],['bottom',.46,-1],['top',-.62,1],['top',.38,-1]
  ])for(let finger=0;finger<3;finger++){
    const n=folds.length;
    folds.push({edge,at:at+(finger-1)*(.065+.014*Math.sin(seed+n)),
      slope:direction*(.10+.09*finger)+.08*Math.sin(seed+n*2.1),
      reach:.45+.27*(.5+.5*Math.sin(seed+n*1.7)),
      width:.026+.015*(.5+.5*Math.cos(seed+n*.9)),
      depth:.011+.009*(.5+.5*Math.sin(seed+n*2.6))});
  }
  return folds;
}

function organicField(source){
  const vertices=[],indices=[],keys=new Map();
  for(let i=0;i<source.position.length;i+=3){
    const p=source.position.slice(i,i+3),key=p.map(x=>Math.round(x*1e5)).join(',');
    if(!keys.has(key)){keys.set(key,vertices.length);vertices.push(p);}
    indices.push(keys.get(key));
  }
  const adjacent=vertices.map(()=>new Set());
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3);adjacent[a].add(b).add(c);adjacent[b].add(a).add(c);adjacent[c].add(a).add(b);}
  for(let pass=0;pass<12;pass++)for(const factor of [.43,-.45]){
    const next=vertices.map((p,i)=>p.map((value,axis)=>value+factor*([...adjacent[i]].reduce((sum,j)=>sum+vertices[j][axis],0)/adjacent[i].size-value)));
    vertices.forEach((p,i)=>{vertices[i]=next[i];});
  }
  const min=[0,1,2].map(a=>Math.min(...vertices.map(p=>p[a]))),max=[0,1,2].map(a=>Math.max(...vertices.map(p=>p[a])));
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flatMap(p=>p.map((value,a)=>2*(value-(min[a]+max[a])/2)/(max[a]-min[a]))),3));geometry.setIndex(indices);
  const bvh=new MeshBVH(geometry),ray=new THREE.Ray();
  return {
    depth(u,v,side){ray.origin.set(u,v,side*3);ray.direction.set(0,0,-side);const hit=bvh.raycastFirst(ray,THREE.DoubleSide);return hit?side*(3-hit.distance):null;},
    outline(angle,canonicalRadius){ray.origin.set(0,0,0);ray.direction.set(Math.cos(angle),Math.sin(angle),0);const hit=bvh.raycastFirst(ray,THREE.DoubleSide);return hit?clamp(hit.distance/canonicalRadius,.88,1.09):1;}
  };
}

function makeSoftCase(setting,whiteSupport){
  const {name,material,size,centre,seed}=setting;
  const [a,b,c]=size.map(x=>x/2),around=144,rings=25,folds=casingFolds(seed);
  const positions=[],uvs=[],indices=[],rim=[],outer=[];
  function point(radial,angle,side){
    const ct=Math.cos(angle),st=Math.sin(angle);
    const denominator=(Math.abs(ct)**10+Math.abs(st)**10)**(1/10);
    const u=radial*ct/denominator,v=radial*st/denominator;
    // A broad supported body ends in a narrow, empty fabric flange.
    let x=a*u,y=b*v;
    const edge=radial**4;
    const loose=1+.50*(setting.organic.outline(angle,1/denominator)-1)*edge;
    x*=loose;y*=loose;
    x+=edge*u*(.009*bell(v+.42,.23)-.006*bell(v-.56,.18));
    y+=edge*(.014*bell(u+.60,.16)-.009*bell(u-.15,.21)+.010*bell(u-.72,.18))
      +.003*u*Math.sin(seed);
    const filledRadius=clamp(radial/.955);
    const filling=(1-filledRadius**2.7)**.53;
    const broad=.012*bell(u+.38,.44)*bell(v-.20,.56)
      +.009*bell(u-.42,.38)*bell(v+.29,.43)
      -.010*bell(u-.05,.53)*bell(v+.07,.37);
    let creases=0;
    for(const f of folds){
      const d=f.edge==='left'?u+1:f.edge==='right'?1-u:f.edge==='top'?1-v:v+1;
      const along=f.edge==='left'||f.edge==='right'?v:u;
      const centreLine=f.at+f.slope*d+.13*d*d;
      const width=f.width+.035*d;
      const cross=-bell(along-centreLine,width)+.40*bell(along-centreLine-width*1.5,width*1.7);
      creases+=f.depth*cross*Math.exp(-d/f.reach)*(1-Math.exp(-d*42));
    }
    const flange=.0035*Math.sin(angle*3+seed)*edge;
    const casingThickness=.0006*Math.sqrt(Math.max(0,1-radial**24));
    const oldDepth=setting.organic.depth(u*loose,v*loose,side);
    const organic=oldDepth===null?0:clamp(.32*c*(oldDepth-side*.96*filling),-.012,.012)*clamp((1-radial)/.16);
    const diagonal=-.011*bell(u+.60*v+.30,.048)*bell(v-.26,.47)+.007*bell(u+.60*v+.23,.10)*bell(v-.25,.51);
    let z=side*(c*.96*filling+broad*filling+creases*filling*(side>0?1:.45)+diagonal*filling+casingThickness)+organic+flange;
    // Gentle lean keeps the upper edge relaxed without a tilted, hard sculpt.
    z-=setting.lean*y;
    const world=[centre[0]+x,softMax(centre[1]+y,.634,.003),centre[2]+z];
    if(whiteSupport){
      const support=whiteSupport(world[0],world[1]);
      if(support!==null)world[2]=softMax(world[2],support+.0016,.0016);
    }
    return world;
  }
  function vertex(p){const index=positions.length/3;positions.push(...p);uvs.push(p[0]-centre[0]+a,p[1]-centre[1]+b);return index;}
  for(const side of [1,-1]){
    const centreVertex=vertex(point(0,0,side));let previous;
    for(let ring=1;ring<=rings;ring++){
      const radial=Math.sin(ring/rings*Math.PI/2),row=[];
      for(let i=0;i<around;i++){
        const p=point(radial,i/around*TAU,side);
        if(ring===rings&&side<0)row.push(outer[i]);
        else {row.push(vertex(p));if(ring===rings){outer.push(row[i]);rim.push(new THREE.Vector3(...p));}}
      }
      for(let i=0;i<around;i++){
        const j=(i+1)%around;
        const faces=ring===1?[[centreVertex,row[i],row[j]]]:[[previous[i],row[i],row[j]],[previous[i],row[j],previous[j]]];
        for(const face of faces)indices.push(...(side>0?face:face.toReversed()));
      }
      previous=row;
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.name=name;
  // The case has a thin relaxed flange, without a separate raised cord that
  // would bake a dark rigid outline around the pillow.
  return [{name,material,geometry}];
}

export function createHannaOrganicPillows(){
  // Dimensions and arrangement follow the supplied Hanna photograph. Replace
  // the old sculpt's empty pointed corners and saddle by filled cloth cases.
  const source=JSON.parse(gunzipSync(readFileSync(new URL('./materials/bed-cloth.json.gz',import.meta.url)))).filter(piece=>piece.material==='pillow');
  const organic=source.slice(0,3).map(organicField);
  const whites=[
    {name:'HannaSoftWhiteLeft',material:'white',size:[.77,.415,.300],centre:[-.405,.824,-.710],seed:1.35,lean:.08},
    {name:'HannaSoftWhiteRight',material:'white',size:[.77,.415,.300],centre:[.405,.826,-.708],seed:3.1,lean:.07}
  ].flatMap((setting,i)=>makeSoftCase({...setting,organic:organic[i]}));
  const supports=whites.filter(piece=>!piece.name.endsWith('SoftHem')).map(piece=>new MeshBVH(piece.geometry));
  const frontPlane=Math.max(...whites.map(piece=>piece.geometry.boundingBox.max.z));
  const ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,0,-1));
  function whiteSupport(x,y){
    ray.origin.set(x,y,.10);let z=null;
    for(const bvh of supports){const hit=bvh.raycastFirst(ray,THREE.DoubleSide);if(hit)z=Math.max(z??-Infinity,.10-hit.distance);}
    // The hidden rear of the small case compresses against a broad support
    // plane; it cannot bridge into either white case between contact samples.
    return Math.max(z??-Infinity,frontPlane);
  }
  const taupe=makeSoftCase({name:'HannaSoftTaupe',material:'taupe',size:[.57,.30,.255],centre:[.012,.784,-.498],seed:2.2,lean:.025,organic:organic[2]},whiteSupport);
  return [...whites,...taupe];
}

export const createHannaPillows=createHannaOrganicPillows;
