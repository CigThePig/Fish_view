// Production renderer evidence, at the panel's native resolutions. --root can
// point at a baseline checkout for a like-for-like comparison.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { auditOptions, importFrom } from './audit-options.mjs';
const options = auditOptions({ root: '.', seeds: '83', output: '.audit-output/depth', compare: '' });
const { createAquariumState } = await importFrom(options.root, 'src/sim/state.js');
const { advanceAquariumHistory } = await importFrom(options.root, 'src/sim/aquarium-history.js');
const { tick } = await importFrom(options.root, 'src/sim/tick.js');
const { render } = await importFrom(options.root, 'src/render/render.js');
const { CanvasSceneRenderer } = await importFrom(options.root, 'src/render/canvas-renderer.js');
const { livingWorldRecords } = await importFrom(options.root, 'src/sim/living-world.js');
const { spreadDepth } = await importFrom(options.root, 'src/sim/depth.js');
await mkdir(options.output, { recursive: true });
const frames=[];
function capture(state, name) {
  const scene=render(state), canvas=createCanvas(scene.width,scene.height);
  new CanvasSceneRenderer(canvas).draw(scene);
  frames.push({name,canvas});return canvas;
}
for (const orientation of ['landscape','portrait']) {
  for (const [days,hour] of [[0,12],[180,12],[730,12],[730,22]]) {
    let state=advanceAquariumHistory(createAquariumState({seed:options.seeds[0],orientation}),days);
    state={...state,timeOfDayHours:hour};
    for(let i=0;i<350;i++)state=tick(state,.1);
    capture(state,`${orientation}-${days}-${hour}`);
  }
}
// The same snail and plant, with an adult held at either end of the depth
// axis. This deliberately forces a crossing; the ordinary scenes above are
// unforced. Sprite shape is held constant so only distance changes its size.
let base=advanceAquariumHistory(createAquariumState({seed:options.seeds[0]}),730);
base={...base,timeOfDayHours:12,elapsedRealSeconds:35};
const snail=livingWorldRecords(base).find(r=>r.kind==='snail');
const roster=base.individuals.map((f,i)=>({f,i,d:spreadDepth(base.seed,f.seed,i,base.individuals.length,35)})).sort((a,b)=>a.d-b.d);
const { spriteForFish }=await importFrom(options.root,'src/sim/fish-growth.js');
const art=spriteForFish(base.individuals[3]);
const plant=base.plants.find(p=>p.layer==='midground');
for(const [label,entry] of [['far',roster[0]],['near',roster.at(-1)]]) {
  const fish={...entry.f,...art,x:snail.x,y:snail.y-0.35,
    visual:{...entry.f.visual,pitch:0,turnProgress:1,facing:1,targetFacing:1}};
  const state={...base,plants:[{...plant,x:snail.x+1.8}],school:[],individuals:[fish]};
  const canvas=capture(state,`crossing-${label}`);
  const crop=createCanvas(400,240),ctx=crop.getContext('2d');ctx.imageSmoothingEnabled=false;
  const x=Math.max(0,Math.min(600,snail.x*800/66-100));
  ctx.drawImage(canvas,x,360,200,120,0,0,400,240);
  frames.push({name:`crossing-${label}-detail`,canvas:crop});
}
for(const {name,canvas} of frames)await writeFile(`${options.output}/${name}.png`,canvas.toBuffer('image/png'));
console.log(`Saved ${frames.length} native scenes and crossing details to ${options.output}`);

if(options.compare) {
  for(const [name,cases] of [
    ['landscape-comparison',['landscape-0-12','landscape-180-12','landscape-730-22']],
    ['portrait-comparison',['portrait-730-12']],
    ['crossings-comparison',['crossing-far-detail','crossing-near-detail']],
  ]) {
    const width=frames.find(f=>f.name===cases[0]).canvas.width;
    const height=frames.find(f=>f.name===cases[0]).canvas.height;
    const sheet=createCanvas(width*2,(height+34)*cases.length),ctx=sheet.getContext('2d');
    ctx.fillStyle='#101e25';ctx.fillRect(0,0,sheet.width,sheet.height);
    for(let row=0;row<cases.length;row++) {
      const key=cases[row], y=row*(height+34);
      const before=await loadImage(`${options.compare}/${key}.png`);
      const after=frames.find(f=>f.name===key).canvas;
      for(const [column,canvas,label] of [[0,before,'Before'],[1,after,'After']]) {
        ctx.fillStyle='#ceded7';ctx.font='16px sans-serif';
        ctx.fillText(`${label} / ${key}`,column*width+12,y+23);
        ctx.drawImage(canvas,column*width,y+34);
      }
    }
    await writeFile(`${options.output}/${name}.png`,sheet.toBuffer('image/png'));
  }
}
