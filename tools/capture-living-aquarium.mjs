import { mkdir, writeFile } from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import { createAquariumState } from '../src/sim/state.js';
import { advanceAquariumHistory } from '../src/sim/aquarium-history.js';
import { tick } from '../src/sim/tick.js';
import { render } from '../src/render/render.js';
import { CanvasSceneRenderer } from '../src/render/canvas-renderer.js';
import { livingWorldRecords, schoolJourney } from '../src/sim/living-world.js';

const output = '.audit-output/living';
await mkdir(output, { recursive: true });
const summary = [];
for (const orientation of ['landscape', 'portrait']) {
  const tiles = [];
  for (const [days, hour] of [[0,12], [30,12], [180,12], [730,12], [1460,12], [730,22]]) {
    let state = advanceAquariumHistory(createAquariumState({ seed: 83, orientation }), days);
    state = { ...state, timeOfDayHours: hour };
    for (let i = 0; i < 350; i++) state = tick(state, 0.1);
    const scene = render(state);
    const canvas = createCanvas(scene.width, scene.height);
    const renderer = new CanvasSceneRenderer(canvas);
    renderer.draw(scene);
    const name = `${orientation}-${days}-${hour}.png`;
    await writeFile(`${output}/${name}`, canvas.toBuffer('image/png'));
    tiles.push({canvas, label: `${days} days / ${hour}:00`});
    summary.push({orientation, days, hour, glyphs: scene.glyphs.length,
      objects: scene.objects.length, living: scene.metadata.livingWorld});
  }
  const w = tiles[0].canvas.width, h = tiles[0].canvas.height;
  const sheet = createCanvas(w * 3, (h + 36) * 2);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#0b1820'; ctx.fillRect(0,0,sheet.width,sheet.height);
  for (let i=0;i<tiles.length;i++) {
    const x=(i%3)*w, y=Math.floor(i/3)*(h+36);
    ctx.fillStyle='#cddcd3';ctx.font='18px sans-serif';ctx.fillText(tiles[i].label,x+14,y+25);
    ctx.drawImage(tiles[i].canvas,x,y+36);
  }
  await writeFile(`${output}/${orientation}-ages.png`, sheet.toBuffer('image/png'));
}
// An unforced two-minute observation: does the new encounter actually happen?
for (const orientation of ['landscape','portrait']) {
  let state = createAquariumState({ seed:83, orientation });
  const activities = {}; let encounters=0; let maxStep=0;
  const centers=[];
  for(let frame=0;frame<1800;frame++) {
    const prior=state;state=tick(state,0.1);
    state.individuals.forEach((fish,i)=>{
      activities[fish.activity.current]=(activities[fish.activity.current]??0)+1;
      if(fish.activity.current==='drifting-inspect' && prior.individuals[i].activity.current!==fish.activity.current)encounters++;
    });
    state.school.forEach((fish,i)=>{maxStep=Math.max(maxStep,Math.hypot(fish.x-prior.school[i].x,fish.y-prior.school[i].y));});
    if(frame%100===0)centers.push({seconds:frame/10,x:state.school.reduce((s,f)=>s+f.x,0)/state.school.length,
      y:state.school.reduce((s,f)=>s+f.y,0)/state.school.length,split:schoolJourney(state,0).split});
  }
  summary.push({orientation, observationSeconds:180, encounters, activities, maxSchoolStep:maxStep, centers,
    creatureCount:livingWorldRecords(state).length});
}
await writeFile(`${output}/summary.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary.filter(x=>x.observationSeconds),null,2));

// Optional native-resolution motion evidence. FFmpeg is only a local authoring
// tool; neither it nor Canvas ships to the aquarium runtime.
if (process.argv.includes('--video')) {
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const encoder=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate','10',
    '-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',
    '-movflags','+faststart',`${output}/living-aquarium.mp4`],{stdio:['pipe','ignore','inherit']});
  const completed=once(encoder,'close');
  let state=advanceAquariumHistory(createAquariumState({seed:83}),180);
  for(let frame=0;frame<350;frame++)state=tick(state,.1);
  const canvas=createCanvas(800,480), renderer=new CanvasSceneRenderer(canvas);
  for(let frame=0;frame<300;frame++) {
    state=tick(state,.1);renderer.draw(render(state));
    if(!encoder.stdin.write(canvas.toBuffer('image/png')))await once(encoder.stdin,'drain');
  }
  encoder.stdin.end();
  const [code]=await completed;
  if(code!==0)throw new Error(`Video encoder exited ${code}`);
  console.log(`Video: ${output}/living-aquarium.mp4`);
}
