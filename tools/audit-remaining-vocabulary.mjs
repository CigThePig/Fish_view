// Phase 7.6 observation only: production tick, no utility or activity overrides.
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createAquariumState, applyTouch, applyContact, applyRelease, serializePersistentState } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { advanceAquariumHistory } from '../src/sim/aquarium-history.js';
import { hashSeed } from '../src/sim/prng.js';
import { withGlassFamiliarity } from '../src/sim/viewer-relationship.js';
import { tickVoluntaryGlassVisit } from '../src/sim/glass-visits.js';
import { resolveActivityTarget } from '../src/sim/fish-activities.js';
import { createBubbleWorldRecords } from '../src/sim/bubbles.js';
import { createShowcaseState, SHOWCASE_SCENARIOS, showcaseSubjects } from '../src/dev/behavior-showcase.js';
const output = process.argv.find(s=>s.startsWith('--output='))?.slice(9) ?? '.audit-output/remaining-vocabulary';
const seconds = Number(process.argv.find(s=>s.startsWith('--seconds='))?.slice(10) ?? 1800);
if (!Number.isFinite(seconds) || seconds < 60 || seconds > 7200) throw new Error("--seconds must be 60–7200");
await mkdir(output, {recursive:true});
const dt=.25;
const wanted=new Set(['companion-cruise','surface-investigate','drifting-inspect','arrival-enter','glass-visit']);
function summary(state, index) {
 const f=state.individuals[index];
 const target=resolveActivityTarget(f,index,state,f.activity,{bubbles:createBubbleWorldRecords(state)});
 const glass=tickVoluntaryGlassVisit(f,index,state,target,0).target;
 return {t:+state.elapsedRealSeconds.toFixed(2),activity:f.activity.current,age:f.activity.ageRealSeconds,
 phase:glass?.glassVisitPhase ?? target?.choreographyPhase, x:f.x,y:f.y,vx:f.vx,vy:f.vy,pitch:f.visual?.pitch,
 targetX:glass?.x,targetY:glass?.y,targetId:f.activity.targetId,
 partner:state.individuals.find(p=>p.seed===f.activity.targetId)?.seed ?? null};
}
// Longer than the ordinary lab loops: include the end and normal recovery.
const forced=[];
for(const scenario of SHOWCASE_SCENARIOS){
 let s=createShowcaseState({scenario:scenario.id}); const index=showcaseSubjects(s,scenario.id)[0].index;
 const frames=[];
 for(let t=0;t<=45;t+=dt){frames.push(summary(s,index));s=tick(s,dt);}
 forced.push({activity:scenario.id,seed:s.seed,index,frames});
}
await writeFile(`${output}/forced.json`,JSON.stringify(forced,null,2));
let state=createAquariumState({seed:0x6e5a11,wallClockHours:12,settings:{timeScale:604800}});
const examples={};
// Save a genuinely born fry during live history progression, before maturation.
for(let t=0;t<175*86400/604800;t+=dt){
 const previous=state; state=tick(state,Math.min(dt,175*86400/604800-t));
 if(state.individuals.length>previous.individuals.length && !examples['arrival-enter']) {
  const index=previous.individuals.length;
  examples['arrival-enter']={state:{...state,settings:{...state.settings,timeScale:1}},index};
 }
}
state={...state,settings:{...state.settings,timeScale:3600}};
for(let t=0;t<120;t+=dt) state=tick(state,dt);
// Familiarity is the sole controlled input; drives, geometry and activities
// remain the continuously matured production state. Phase 6 proves learning.
state={...state,settings:{...state.settings,timeScale:1},individuals:state.individuals.map(f=>withGlassFamiliarity(f,.9))};
const counts={}; const episodes={};
for(let t=0;t<seconds;t+=dt){
 const previous=state; state=tick(state,dt);
 for(let i=0;i<state.individuals.length;i++){
  const f=state.individuals[i], old=previous.individuals[i];
  const name=f.viewerRelationship?.glassVisit ? 'glass-visit' : f.activity.current;
  counts[name]=(counts[name]??0)+dt;
  const oldName=old?.viewerRelationship?.glassVisit ? 'glass-visit' : old?.activity.current;
  if(name!==oldName || f.activity.ageRealSeconds<old.activity.ageRealSeconds){
   episodes[name]=(episodes[name]??0)+1;
   if(wanted.has(name) && !examples[name]) examples[name]={state,index:i};
  }
 }
}
// A younger aquarium supplies the exploratory drives missing in the tired
// six-month cast. History resolves real roster arrivals; nothing chooses their
// activities for them. Observe another ten minutes at ordinary live speed.
let young = advanceAquariumHistory(createAquariumState({seed:hashSeed('visible-intention-lab'),wallClockHours:12}), 56);
for(let t=0;t<600;t+=dt){
 const previous=young;young=tick(young,dt);
 for(let i=0;i<young.individuals.length;i++){
  const f=young.individuals[i],old=previous.individuals[i];
  if(f.activity.current!==old.activity.current || f.activity.ageRealSeconds<old.activity.ageRealSeconds){
   episodes[f.activity.current]=(episodes[f.activity.current]??0)+1;
   if(wanted.has(f.activity.current) && !examples[f.activity.current]) examples[f.activity.current]={state:young,index:i};
  }
 }
}
// The surface-oriented cast was found by a deterministic seed search (1, 2).
// Keep the resulting ordinary startup case, not a hand-selected activity.
let surfaceWorld=advanceAquariumHistory(createAquariumState({seed:2,wallClockHours:12}),180);
for(let t=0;t<180;t+=dt){
 surfaceWorld=tick(surfaceWorld,dt);
 const index=surfaceWorld.individuals.findIndex(f=>f.activity.current==='surface-investigate');
 if(index>=0){
  examples['surface-investigate']={state:surfaceWorld,index};
  episodes['surface-investigate']=(episodes['surface-investigate']??0)+1;
  break;
 }
}
// Real held contact, with the same call order as the app. No assigned roles.
const personState=state;
const personFish=state.individuals.find(f=>['cruise','school-follow','open-water-wander'].includes(f.activity.current))??state.individuals[0];
const point={x:personFish.x+2,y:personFish.y};
examples['human-hold']={state:personState,index:state.individuals.indexOf(personFish),point};
const records=[];
for(const [name,example] of Object.entries(examples)){
 await writeFile(`${output}/${name}-state.json`,JSON.stringify(example));
 let s=example.state;
 if(example.point) s=applyTouch(s,example.point.x,example.point.y);
 const frames=[];
 for(let t=0;t<=60;t+=dt){
  frames.push(summary(s,example.index));
  if(example.point && t<20)s=applyContact(s,example.point.x,example.point.y,t+dt);
  if(example.point && t===20)s=applyRelease(s);
  s=tick(s,dt);
 }
 records.push({name,index:example.index,fishSeed:example.state.individuals[example.index].seed,frames});
}
await writeFile(`${output}/natural.json`,JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),seconds,youngSeconds:600,counts,episodes,saveBytes:JSON.stringify(serializePersistentState(state)).length,records},null,2));
console.log(JSON.stringify({seconds,episodes,examples:Object.keys(examples)}));
