import { performance } from 'node:perf_hooks';
import { createCanvas } from '@napi-rs/canvas';
import { auditOptions, importFrom, writeAudit } from './audit-options.mjs';

const options = auditOptions({ root: '.', seeds: '5,83,147', frames: 120, output: '.audit-output/living' });
const { createAquariumState } = await importFrom(options.root, 'src/sim/state.js');
const { advanceAquariumHistory } = await importFrom(options.root, 'src/sim/aquarium-history.js');
const { tick } = await importFrom(options.root, 'src/sim/tick.js');
const { render } = await importFrom(options.root, 'src/render/render.js');
const { CanvasSceneRenderer } = await importFrom(options.root, 'src/render/canvas-renderer.js');
const results=[];
for(const orientation of ['landscape','portrait']) for(const days of [0,730]) {
  let damage=0, maxDamage=0, full=0, glyphs=0, objects=0, milliseconds=0, frames=0;
  for(const seed of options.seeds) {
    let state=advanceAquariumHistory(createAquariumState({orientation,seed}),days);
    const renderer=new CanvasSceneRenderer(createCanvas(1,1));
    for(let frame=0;frame<options.frames+40;frame++) {
      const start=performance.now();state=tick(state,.1);const scene=render(state);
      const result=renderer.draw(scene);
      if(frame<40)continue;
      milliseconds+=performance.now()-start;
      damage+=result.damagedPercent;maxDamage=Math.max(maxDamage,result.damagedPercent);
      full+=Number(result.full);glyphs+=scene.glyphs.length;objects+=scene.objects.length;frames++;
    }
  }
  results.push({orientation,days,frames,averageDamagePercent:damage/frames,maxDamagePercent:maxDamage,
    fullRedraws:full,averageGlyphs:glyphs/frames,averageObjects:objects/frames,
    desktopFrameMilliseconds:milliseconds/frames});
}
await writeAudit(options.output, 'living-budget', {options,results});
console.log(JSON.stringify(results,null,2));
