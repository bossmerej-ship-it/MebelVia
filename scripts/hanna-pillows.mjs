import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';

// Three soft pillows in the closed bed's world axes: x across the bed, y up,
// +z towards the foot. The caller attaches all returned meshes to UpperAssembly.
// UVs are in metres, so the caller can use the same fine cloth scale as the bed.
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const gaussian = (x, width) => Math.exp(-((x / width) ** 2));

function makePillow({name, material, size, centre, seed, lean}) {
  const [width, height, depth] = size;
  const a = width / 2, b = height / 2, c = depth / 2;
  const around = 160, rings = 36;
  const positions = [], uvs = [], indices = [];
  const seam = [];
  const faceMaps = [];

  // A few unequal compression folds enter from the hem. Their amplitude is
  // millimetres and fades into the filled middle, instead of a repeating wave.
  const folds = [
    {edge:'left', at:-.58, slope:.34, reach:.56, width:.052, amp:.0128},
    {edge:'left', at:.29, slope:-.24, reach:.43, width:.063, amp:.0102},
    {edge:'right', at:-.31, slope:.37, reach:.50, width:.057, amp:.0120},
    {edge:'right', at:.61, slope:-.43, reach:.37, width:.047, amp:.0090},
    {edge:'top', at:-.59, slope:.24, reach:.55, width:.051, amp:.0115},
    {edge:'top', at:.35, slope:-.19, reach:.44, width:.059, amp:.0087},
    {edge:'bottom', at:-.27, slope:.35, reach:.59, width:.061, amp:.0128},
    {edge:'bottom', at:.64, slope:-.28, reach:.43, width:.048, amp:.0102}
  ];
  function wrinkle(u, v) {
    let out = 0;
    for (let index = 0; index < folds.length; index++) {
      const f = folds[index];
      const d = f.edge === 'left' ? u + 1 : f.edge === 'right' ? 1 - u : f.edge === 'top' ? 1 - v : v + 1;
      const along = f.edge === 'left' || f.edge === 'right' ? v : u;
      const line = f.at + .035 * Math.sin(seed + index * 1.93) + f.slope * d + .11 * d * d;
      const width = f.width + .018 * d;
      const profile = gaussian(along - line, width) - .42 * gaussian(along - line - width * 1.45, width * 1.5);
      out += f.amp * profile * Math.exp(-d / f.reach) * (1 - Math.exp(-d * 22));
    }
    return out;
  }

  function point(radial, angle, side) {
    const ct = Math.cos(angle), st = Math.sin(angle);
    // Smooth superellipse outline with gently rounded rectangular corners.
    // Radial parameterisation avoids diagonal seams from a deformed box mesh.
    const denominator = (Math.abs(ct) ** 7 + Math.abs(st) ** 7) ** (1 / 7);
    const u = radial * ct / denominator, v = radial * st / denominator;
    let x = a * u;
    let y = b * v;
    const filling = Math.sqrt(Math.max(0, 1 - radial ** 3.4));
    const broad = 1 + .025 * Math.sin(2.5 * u + seed) * Math.cos(1.8 * v - .6 * seed)
      + .012 * Math.sin(4.1 * v + seed * .7) * Math.cos(3.3 * u);
    // Unequal broad areas of stuffing and a relaxed central face keep this a
    // pillowcase around filling, rather than a uniformly inflated block.
    const stuffing = .009 * gaussian(u+.43,.47)*gaussian(v-.27,.56)
      + .006 * gaussian(u-.39,.52)*gaussian(v+.30,.48)
      - .010 * gaussian(u-.04,.65)*gaussian(v+.02,.62);
    const cornerPinch = .011 * gaussian(Math.abs(u)-.77,.18)*gaussian(Math.abs(v)-.76,.20)
      * (1+.27*Math.sin(seed+2.3*u-1.7*v));
    let z = side * (c * filling * broad + (stuffing-cornerPinch)*filling
      + wrinkle(u,v) * Math.min(1,filling*5) * (side > 0 ? 1 : .42));
    // Quiet asymmetry in the casing, without conspicuous tilts or square tips.
    x += .0025 * (1 - v * v) * Math.sin(2.1 * v + seed);
    y += .0028 * u * Math.sin(seed) + .002 * (u*u-.4) * v;
    const edgeRelaxation = (.0075*gaussian(u+.61+.05*Math.sin(seed),.22)
      - .006*gaussian(u-.44+.07*Math.cos(seed),.26)) * radial**3;
    y += edgeRelaxation*v;
    x += .004*gaussian(v+.32,.40)*u*radial**3*Math.sin(seed+.8);
    // Lean back naturally while retaining the original pillow footprint.
    z -= lean * y;
    const worldY = centre[1] + y;
    // Soft compression against the ticking; the lower edge cannot hang above
    // the mattress or continue through it. Smooth softplus avoids a hard kink.
    const supportY = .634;
    const compressedY = supportY + .003 * Math.log1p(Math.exp((worldY-supportY)/.003));
    return [centre[0]+x, compressedY, centre[2]+z];
  }
  function addVertex(p, uv) {
    const index = positions.length / 3;
    positions.push(...p);uvs.push(...uv);
    return index;
  }
  const outerIndices = [];
  for (const side of [1,-1]) {
    const map = [];
    const centreVertex = addVertex(point(0,0,side),[a,b]);
    map.push([centreVertex]);
    for (let ring = 1; ring <= rings; ring++) {
      const radial = Math.sin(ring / rings * Math.PI / 2);
      const row = [];
      for (let index = 0; index < around; index++) {
        const angle = index / around * TAU;
        const p = point(radial,angle,side);
        if (ring === rings && side < 0) row.push(outerIndices[index]);
        else {
          const vertex = addVertex(p,[p[0]-centre[0]+a,p[1]-centre[1]+b]);
          row.push(vertex);
          if (ring === rings) {outerIndices.push(vertex);seam.push(new THREE.Vector3(...p));}
        }
      }
      map.push(row);
      for (let index = 0; index < around; index++) {
        const next = (index+1)%around;
        const triangles = ring === 1
          ? [[centreVertex,row[index],row[next]]]
          : [[map[ring-1][index],row[index],row[next]],[map[ring-1][index],row[next],map[ring-1][next]]];
        for (const triangle of triangles) indices.push(...(side > 0 ? triangle : triangle.toReversed()));
      }
    }
    faceMaps.push(map);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.name = name;

  // A slim fabric welt, in the same fabric rather than a dark drawn contour.
  const curve = new THREE.CatmullRomCurve3(seam,true,'centripetal');
  const seamGeometry = new THREE.TubeGeometry(curve,192,.0009,5,true);
  const seamUv = seamGeometry.getAttribute('uv');
  const perimeter = curve.getLength();
  for (let i=0;i<seamUv.count;i++) seamUv.setXY(i,seamUv.getX(i)*perimeter,seamUv.getY(i)*.0057);
  seamGeometry.name = name+'Seam';
  return [{name,material,geometry},{name:name+'Seam',material,geometry:seamGeometry}];
}

export function createHannaPillows() {
  return [
    ...makePillow({name:'HannaWhitePillowLeft', material:'white', size:[.77,.415,.300], centre:[-.405,.824,-.710], seed:1.35, lean:.17}),
    ...makePillow({name:'HannaWhitePillowRight',material:'white', size:[.77,.415,.300], centre:[.405,.826,-.708], seed:3.1, lean:.19}),
    ...makePillow({name:'HannaTaupePillow', material:'taupe', size:[.57,.30,.255], centre:[.012,.784,-.429], seed:2.2, lean:.08})
  ];
}

// Alternative based on the original CC0 cloth mesh. Weld only position data,
// soften its sharp local ridges without shrinking the large organic folds, then
// recompute normals across former UV seams. Fine weave uses new physical UVs;
// the original baked crease normal map must not be applied a second time.
export function createHannaOrganicPillows() {
  const cache = JSON.parse(gunzipSync(readFileSync(new URL('./materials/bed-cloth.json.gz',import.meta.url))));
  const sources = cache.filter(piece => piece.material === 'pillow');
  const settings = [
    {name:'HannaOrganicWhiteLeft',material:'white',size:[.77,.415,.300],centre:[-.405,.824,-.710]},
    {name:'HannaOrganicWhiteRight',material:'white',size:[.77,.415,.300],centre:[.405,.826,-.708]},
    {name:'HannaOrganicTaupe',material:'taupe',size:[.57,.30,.255],centre:[.012,.784,-.4632]}
  ];
  const pieces = [];
  for (const [pieceIndex, setting] of settings.entries()) {
    const source = sources[pieceIndex];
    const vertices = [], indices = [], unique = new Map();
    for (let offset=0;offset<source.position.length;offset+=3) {
      const p = source.position.slice(offset,offset+3);
      const key = p.map(value => Math.round(value*100000)).join(',');
      let index = unique.get(key);
      if (index === undefined) {index=vertices.length;vertices.push(p);unique.set(key,index);}
      indices.push(index);
    }
    const neighbours = vertices.map(() => new Set());
    for (let i=0;i<indices.length;i+=3) {
      const [a,b,c] = indices.slice(i,i+3);
      neighbours[a].add(b).add(c);neighbours[b].add(a).add(c);neighbours[c].add(a).add(b);
    }
    const adjacency = neighbours.map(set => [...set]);
    function laplacian(factor) {
      const next = vertices.map((p,index) => {
        const adjacent = adjacency[index];
        if (!adjacent.length) return p.slice();
        const average = [0,0,0];
        for (const neighbour of adjacent) for (let axis=0;axis<3;axis++) average[axis]+=vertices[neighbour][axis]/adjacent.length;
        return p.map((value,axis) => value + factor*(average[axis]-value));
      });
      for (let i=0;i<vertices.length;i++) vertices[i]=next[i];
    }
    // Alternating positive/negative passes remove sharp creases while retaining
    // the photographed cloth's uneven volume and relaxed corners.
    for(let pass=0;pass<(pieceIndex===2?18:14);pass++){laplacian(.43);laplacian(-.45);}
    const min = [Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const p of vertices)for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],p[axis]);max[axis]=Math.max(max[axis],p[axis]);}
    const positions=[],uvs=[];
    for(const p of vertices){
      let [u,v,w]=p.map((value,axis) => 2*(value-(min[axis]+max[axis])/2)/(max[axis]-min[axis]));
      // Relax the empty case corners around the filling. The original cloth
      // remains the shape owner; this removes only its long, pointed tips.
      const originalU=u, originalV=v;
      u*=1-.065*Math.abs(v)**6;
      v*=1-.050*Math.abs(originalU)**6;
      // In the photo the white cases rest broadly against the head, rather
      // than having a diagonal hard top edge from a skewed stock pillow.
      if(pieceIndex<2)v+=.047*originalU*clamp((originalV-.12)/.65);
      const rho=(Math.abs(u)**6+Math.abs(v)**6)**(1/6);
      const filling=Math.sqrt(Math.max(0,1-Math.min(1,rho)**3.8));
      const front=clamp((w-.05)/.35);
      const worldX=setting.centre[0]+u*setting.size[0]/2;
      // Keep the existing inner contact patch behind the taupe pillow fixed.
      // Outer white faces and the taupe front can relax towards their filling.
      const freeFace=pieceIndex===2?1:clamp((Math.abs(worldX)-.30)/.13);
      w+=.19*front*freeFace*(filling-w);
      // Small, unequal compression creases enter from the side/bottom hem.
      // Their thin valleys have broad soft shoulders and die into the middle.
      const seed=[1.1,2.8,4.3][pieceIndex];
      const sideDistance=1-Math.abs(u),bottomDistance=v+1;
      const sideLine=.28+.20*sideDistance+.035*Math.sin(seed+3*sideDistance);
      const sideFold=(gaussian(v-sideLine,.070)-.46*gaussian(v-sideLine-.105,.12))
        *Math.exp(-sideDistance/.34)*(1-Math.exp(-sideDistance*20));
      const bottomLine=-.31+.32*bottomDistance+.06*Math.sin(seed+bottomDistance*4);
      const bottomFold=(gaussian(u-bottomLine,.065)-.40*gaussian(u-bottomLine-.095,.11))
        *Math.exp(-bottomDistance/.40)*(1-Math.exp(-bottomDistance*22));
      const millimetres=pieceIndex===2?.0032:.0027;
      w+=2*millimetres/setting.size[2]*front*freeFace*(sideFold+bottomFold);
      w=clamp(w,-1,1);
      const scaled=[u,v,w].map((value,axis)=>value*setting.size[axis]/2+setting.centre[axis]);
      // A smooth flattened support patch, rather than visible floating tips or
      // lower vertices passing into the mattress surface.
      const supportY=.634;
      scaled[1]=supportY+.003*Math.log1p(Math.exp((scaled[1]-supportY)/.003));
      positions.push(...scaled);
      uvs.push(scaled[0]-setting.centre[0]+setting.size[0]/2,scaled[1]-setting.centre[1]+setting.size[1]/2);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();
    geometry.name=setting.name;
    pieces.push({name:setting.name,material:setting.material,geometry});

    // Trace a real closed section through the organic casing, so the welt
    // follows its relaxed outline instead of drawing a rectangular tube over it.
    const segments=[], pointByKey=new Map(), links=new Map();
    const keyOf=p=>p.map(value=>Math.round(value*100000)).join(',');
    for(let index=0;index<indices.length;index+=3){
      const triangle=indices.slice(index,index+3).map(vertex=>positions.slice(vertex*3,vertex*3+3));
      const cuts=[];
      for(let edge=0;edge<3;edge++){
        const a=triangle[edge],b=triangle[(edge+1)%3];
        const da=a[2]-setting.centre[2],db=b[2]-setting.centre[2];
        if(da*db<0){const t=da/(da-db);cuts.push(a.map((value,axis)=>value+t*(b[axis]-value)));}
      }
      if(cuts.length===2)segments.push(cuts);
    }
    for(const [a,b] of segments){
      const ka=keyOf(a),kb=keyOf(b);if(ka===kb)continue;
      pointByKey.set(ka,a);pointByKey.set(kb,b);
      if(!links.has(ka))links.set(ka,new Set());if(!links.has(kb))links.set(kb,new Set());
      links.get(ka).add(kb);links.get(kb).add(ka);
    }
    const visited=new Set(),loops=[];
    for(const first of links.keys()){
      if(visited.has(first))continue;
      const loop=[];let previous=null,current=first;
      while(current&&!visited.has(current)){
        visited.add(current);loop.push(new THREE.Vector3(...pointByKey.get(current)));
        const next=[...links.get(current)].find(key=>key!==previous&&!visited.has(key));
        previous=current;current=next;
      }
      if(loop.length>20)loops.push(loop);
    }
    const outline=loops.sort((a,b)=>b.length-a.length)[0];
    if(outline){
      const curve=new THREE.CatmullRomCurve3(outline,true,'centripetal');
      const welt=new THREE.TubeGeometry(curve,240,.00075,5,true);
      const uv=welt.getAttribute('uv');
      for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*curve.getLength(),uv.getY(i)*.0047);
      welt.name=setting.name+'FineSeam';
      pieces.push({name:welt.name,material:setting.material,geometry:welt});
    }
  }
  return pieces;
}
