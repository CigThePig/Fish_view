import assert from 'node:assert/strict';
import test from 'node:test';
import { createShowcaseState, showcaseSubjects, showcaseTarget } from '../src/dev/behavior-showcase.js';
import { tick } from '../src/sim/tick.js';
import { hashSeed } from '../src/sim/prng.js';
import { createAquariumState } from '../src/sim/state.js';
import { advanceAquariumHistory } from '../src/sim/aquarium-history.js';
import { surfaceSafeY } from '../src/sim/fish-motion.js';

test('surface visits reach the surface, probe, and physically descend before completion',()=>{
 for(const label of ['visible-intention-lab','phase76-surface-a','phase76-surface-b']){
  let state=createShowcaseState({scenario:'surface-investigate',seed:hashSeed(label)});
  const index=showcaseSubjects(state,'surface-investigate')[0].index;
  const phases=[];let probeY=null, exit=null;
  for(let step=0;step<360;step++){
   const f=state.individuals[index];
   if(f.activity.current!=='surface-investigate'){exit=f;break;}
   const target=showcaseTarget(state,'surface-investigate');
   if(phases.at(-1)!==target.choreographyPhase){
    phases.push(target.choreographyPhase);
    if(target.choreographyPhase==='probe'){
     probeY=f.y;
     assert.ok(Math.abs(f.y-surfaceSafeY(f,state,f.x))<1.3,label+' probed before arrival');
    }
   }
   state=tick(state,.1);
  }
  assert.deepEqual(phases,['ascend','probe','descend'],label);
  assert.ok(exit,label+' did not finish');
  assert.equal(exit.activity.current,'open-water-wander',label);
  assert.ok(exit.y>probeY+1.2,label+' did not visibly leave the surface');
 }
});

test('mutual companions travel together and visibly separate before selecting another activity',()=>{
 let state=createShowcaseState({scenario:'companion-cruise'});
 const initial=showcaseSubjects(state,'companion-cruise').map(s=>s.fish);
 const phases=new Set();let pairAt20=null,ending=null;
 for(let step=0;step<400;step++){
  const pair=showcaseSubjects(state,'companion-cruise').map(s=>s.fish);
  if(step===200)pairAt20=pair;
  if(pair[0].activity.current!=='companion-cruise'){ending=pair;break;}
  phases.add(showcaseTarget(state,'companion-cruise').choreographyPhase);
  state=tick(state,.1);
 }
 assert.ok(pairAt20);
 for(let i=0;i<2;i++)assert.ok(pairAt20[i].x>initial[i].x+3,'formation stalled');
 assert.ok(Math.abs(pairAt20[0].x-pairAt20[1].x)<1.5,'company became rear-offset follow');
 assert.ok(Math.abs(pairAt20[0].y-pairAt20[1].y)>2,'bodies lost separate slots');
 assert.ok(phases.has('separate'));
 assert.ok(ending);
 assert.equal(ending[0].activity.current,'school-follow');
 assert.ok(Math.hypot(ending[0].x-ending[1].x,ending[0].y-ending[1].y)>
  Math.hypot(pairAt20[0].x-pairAt20[1].x,pairAt20[0].y-pairAt20[1].y)+.5,'pair never separated');
});


test('the production scheduler selects a reachable surface trip and completes its sentence',()=>{
 let state=advanceAquariumHistory(createAquariumState({seed:2,wallClockHours:12}),180);
 let index=-1;const stages=new Set();let entered=false,completed=false;
 for(let step=0;step<400;step++){
  state=tick(state,.25);
  if(index<0)index=state.individuals.findIndex(f=>f.activity.current==='surface-investigate');
  if(index<0)continue;
  const fish=state.individuals[index];
  if(fish.activity.current!=='surface-investigate'){completed=true;break;}
  if(!entered){
   assert.ok(Math.abs(fish.activity.targetX-fish.x)<3.5,'surface trip became a cross-tank commute');
   entered=true;
  }
  stages.add(fish.activity.surfaceStage??0);
 }
 assert.ok(entered && completed);
 assert.deepEqual([...stages],[0,1,2],'natural trip timed out before probing and descending');
});
