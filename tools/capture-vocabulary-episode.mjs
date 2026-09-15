// Render an observed runtime state through the same renderer as the showcase.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createCanvas, GifEncoder } from '@napi-rs/canvas';
import { CanvasSceneRenderer } from '../src/render/canvas-renderer.js';
import { render } from '../src/render/render.js';
import { tick } from '../src/sim/tick.js';
import { applyTouch, applyContact, applyRelease } from '../src/sim/state.js';
import { createShowcaseState, showcaseSubjects } from '../src/dev/behavior-showcase.js';
const arg=(name,fallback)=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const scenario=arg('scenario','cruise'), input=arg('input',null), output=arg('output','.audit-output/episode');
const duration=Number(arg('seconds','40')), times=arg('times','0,4,8,12,20,35').split(',').map(Number);
if(!Number.isFinite(duration)||duration<1||duration>90||times.length!==6||times.some(t=>!Number.isFinite(t)||t<0||t>duration))throw Error('Provide duration 1–90 and six times within it');
const example=input?JSON.parse(await readFile(input,'utf8')):{state:createShowcaseState({scenario})};
let state=example.state;
const index=example.index??showcaseSubjects(state,scenario)[0].index;
const source=createCanvas(800,480), renderer=new CanvasSceneRenderer(source);
const small=createCanvas(400,240),ctx=small.getContext('2d');ctx.imageSmoothingEnabled=false;
const sheet=createCanvas(1200,480),sc=sheet.getContext('2d');sc.imageSmoothingEnabled=false;
const gif=new GifEncoder(400,240,{repeat:0,quality:15});
const snapshots=[];let next=0;
if(example.point)state=applyTouch(state,example.point.x,example.point.y);
const dt=.2;
for(let step=0;step<=Math.ceil(duration/dt);step++){
 const t=step*dt;renderer.draw(render(state));ctx.drawImage(source,0,0,400,240);
 const pixels=ctx.getImageData(0,0,400,240).data;
 gif.addFrame(new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength),400,240,{delay:200});
 while(next<times.length && t+dt/2>=times[next]){
  sc.drawImage(small,(next%3)*400,Math.floor(next/3)*240);
  const f=state.individuals[index]; snapshots.push({seconds:t,index,fishSeed:f.seed,x:f.x,y:f.y,activity:f.activity.current,phase:f.activity.surfaceStage??null,visit:f.viewerRelationship?.glassVisit??null});next++;
 }
 if(example.point && t<20)state=applyContact(state,example.point.x,example.point.y,t+dt);
 if(example.point && step===100)state=applyRelease(state);
 state=tick(state,dt);
}
await mkdir(output,{recursive:true});
await writeFile(`${output}/episode.gif`,gif.finish());
await writeFile(`${output}/contact-sheet.png`,sheet.toBuffer('image/png'));
await writeFile(`${output}/manifest.json`,JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),input,scenario:input?null:scenario,duration,snapshots},null,2));
console.log(output);
