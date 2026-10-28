import fs from 'node:fs';
// Neutral broad key, soft fill and overhead light, baked to a small Radiance
// environment map. The page keeps its white background independently of it.
const w=512,h=256,bytes=Buffer.alloc(w*h*4);
const norm=(x,y,z)=>{const l=Math.hypot(x,y,z);return [x/l,y/l,z/l];};
const lights=[{d:norm(-.9,1.25,1.6),power:3.3,width:.40},{d:norm(1,1.0,1.4),power:.9,width:.62},{d:norm(0,2,-.3),power:.60,width:.80}];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const az=((x+.5)/w-.5)*Math.PI*2,el=(.5-(y+.5)/h)*Math.PI;
 const d=[Math.cos(el)*Math.cos(az),Math.sin(el),Math.cos(el)*Math.sin(az)];
 let l=.30+.08*Math.max(0,d[1]);
 for(const light of lights){const angle=Math.acos(Math.max(-1,Math.min(1,d.reduce((sum,v,i)=>sum+v*light.d[i],0))));l+=light.power*Math.exp(-((angle/light.width)**4));}
 l*=d[1]<-.1?.72:1;
 const e=Math.ceil(Math.log2(Math.max(l,1e-32))),scale=256/2**e,o=(y*w+x)*4;
 bytes[o]=Math.min(255,Math.round(l*scale));bytes[o+1]=bytes[o];bytes[o+2]=bytes[o];bytes[o+3]=e+128;
}
fs.writeFileSync(new URL('../dist/assets/models/hanna-softbox.hdr',import.meta.url),Buffer.concat([Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y '+h+' +X '+w+'\n'),bytes]));
