import assert from 'node:assert/strict';
import test from 'node:test';
import { createAquariumState, serializePersistentState, restorePersistentState, advanceOffline } from '../src/sim/state.js';
import { advanceAquariumHistory } from '../src/sim/aquarium-history.js';
import { habitatState, livingWorldRecords } from '../src/sim/living-world.js';
import { tick } from '../src/sim/tick.js';
import { render } from '../src/render/render.js';
import { isSupportedGlyph } from '../src/art/bitmap-font.js';
import { resolveActivityTarget, ACTIVITIES, createActivityState } from '../src/sim/fish-activities.js';
import { stockedAquarium } from './support/aquarium.js';

const living = (scene) => scene.objects.filter((o) => /^(living:|wood:|meadow:|dust:|epiphyte:)/.test(o.id));

test('the living habitat stays bounded and supported from day one to twenty years', () => {
  for (const orientation of ['landscape','portrait']) for (const days of [0,45,180,730,1825,7300]) {
    const state=advanceAquariumHistory(createAquariumState({orientation,seed:83}),days);
    const records=livingWorldRecords(state);
    assert.ok(records.length>=4 && records.length<=7);
    assert.equal(new Set(records.map(r=>r.id)).size,records.length);
    for(const r of records) {
      assert.ok(r.x>0 && r.x<state.cols && r.y>0 && r.y<state.rows);
    }
    const scene=render(state), objects=living(scene);
    assert.ok(objects.length<=100);
    const glyphs=objects.flatMap(o=>scene.glyphs.slice(o.glyphStart,o.glyphStart+o.glyphCount));
    assert.ok(glyphs.length<=270,`living glyph budget: ${glyphs.length}`);
    assert.ok(glyphs.every(g=>isSupportedGlyph(g.char)));
  }
});

test('offline time and restore retain the same habitat without adding save fields', () => {
  const base=createAquariumState({seed:83});
  const live=advanceAquariumHistory(base,300);
  const offline=advanceOffline(base,300*86400);
  const restored=restorePersistentState(base,serializePersistentState(live));
  assert.deepEqual(habitatState(live),habitatState(offline));
  assert.deepEqual(habitatState(live),habitatState(restored));
  assert.deepEqual(livingWorldRecords(live),livingWorldRecords(restored));
  assert.deepEqual(Object.keys(serializePersistentState(live)), Object.keys(serializePersistentState(base)));
  assert.ok(serializePersistentState(live).individuals.every(fish => !Object.hasOwn(fish, 'activity')));
  assert.ok(habitatState(advanceAquariumHistory(base,1460)).patina>habitatState(live).patina);
});

test('resident movement is continuous and slower than the fish', () => {
  for(const orientation of ['landscape','portrait']) {
    const base=advanceAquariumHistory(createAquariumState({seed:83,orientation}),180);
    let previous=livingWorldRecords(base);
    for(let frame=1;frame<=1200;frame++) {
      const records=livingWorldRecords({...base,elapsedRealSeconds:frame*0.1});
      for(const r of records.filter(r=>r.kind!=='tuft')) {
        const p=previous.find(p=>p.id===r.id);
        assert.ok(Math.hypot(r.x-p.x,r.y-p.y)<0.11,`${r.id} jumped`);
      }
      previous=records;
    }
  }
});

test('a disappearing tuft releases its fish and cannot be followed after recycling', () => {
  const state=stockedAquarium({seed:83});
  const fish=state.individuals[3];
  const tuft=livingWorldRecords(state).find(r=>r.kind==='tuft' && r.visibility>0.8);
  assert.ok(tuft);
  const activity={...createActivityState(ACTIVITIES.driftingInspect),targetId:tuft.id,targetType:'tuft'};
  assert.ok(resolveActivityTarget(fish,3,state,activity));
  assert.equal(resolveActivityTarget(fish,3,{...state,elapsedRealSeconds:120},activity),null);
});

test('ordinary watching produces new encounters and a traveling school in both orientations', () => {
  for(const orientation of ['landscape','portrait']) {
    let state=stockedAquarium({seed:83,orientation});
    let inspections=0, nearInspections=0, minX=Infinity,maxX=-Infinity;
    for(let frame=0;frame<1800;frame++) {
      const previous=state;state=tick(state,0.1);
      for(let i=0;i<state.school.length;i++) {
        const a=previous.school[i], b=state.school[i];
        assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<=state.settings.schoolSpeed*0.1+1e-8);
      }
      for(const fish of state.individuals) if(fish.activity.current===ACTIVITIES.driftingInspect) {
        inspections++;
        if(resolveActivityTarget(fish,state.individuals.indexOf(fish),state,fish.activity)?.choreographyPhase==='inspect')nearInspections++;
      }
      const center=state.school.reduce((sum,f)=>sum+f.x,0)/state.school.length;
      if(frame>300){ minX=Math.min(minX,center);maxX=Math.max(maxX,center); }
    }
    assert.ok(inspections>30,`${orientation}: no spontaneous encounter`);
    assert.ok(nearInspections>10,`${orientation}: fish never reached the tuft`);
    assert.ok(maxX-minX>state.cols*0.15,`${orientation}: school stayed in one place`);
  }
});
