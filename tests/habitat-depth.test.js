import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { createAquariumState, restorePersistentState, serializePersistentState } from '../src/sim/state.js';
import { advanceAquariumHistory } from '../src/sim/aquarium-history.js';
import { groundY, plantDepth, plantGroundY, woodDepth } from '../src/sim/habitat-depth.js';
import { livingWorldRecords } from '../src/sim/living-world.js';
import { individualVisualDepth } from '../src/sim/fish-motion.js';
import { render } from '../src/render/render.js';
import { CanvasSceneRenderer } from '../src/render/canvas-renderer.js';
import { addGlyphObject, createSceneBuilder, finalizeScene } from '../src/render/scene.js';
import { worldLayer } from '../src/render/depth.js';

// These assertions describe the visible relationship, rather than reserving a
// particular layer number for each type of creature.
test('roots occupy the floor area, including different depths within one species', () => {
  {

    const state=advanceAquariumHistory(createAquariumState({seed:83}),730);
    const roots=state.plants.map(p=>plantGroundY(state,p));
    assert.ok(Math.max(...roots)-Math.min(...roots)>1.5,'roots collapsed onto a line');
    assert.ok(new Set(state.plants.map(p=>Math.floor(plantDepth(p)*4))).size===4);
    const same=Array.from({length:16},(_,seed)=>({...state.plants[0],seed}));
    assert.ok(Math.max(...same.map(p=>plantDepth(p)))-Math.min(...same.map(p=>plantDepth(p)))>0.4,
      'species still determines distance');
    const restored=restorePersistentState(createAquariumState({seed:83}),serializePersistentState(state));
    assert.deepEqual(restored.plants.map(p=>plantGroundY(restored,p)),roots,'restore moved the roots');
  }
});

test('fish, plants and small residents sort by their shared distance', () => {
  const state=advanceAquariumHistory(createAquariumState({seed:83}),730);
  const scene=render(state), distances=new Map();
  state.individuals.forEach((f,i)=>distances.set(`individual:${i}:${f.seed}`,individualVisualDepth(f,i,state)));
  state.plants.forEach((p,i)=>distances.set(`plant:${i}:${p.seed}`,plantDepth(p)));
  livingWorldRecords(state).forEach(r=>distances.set(`living:${r.id}`,r.depth));
  const ordered=scene.objects.filter(o=>distances.has(o.id));
  for(let i=1;i<ordered.length;i++) {
    assert.ok(distances.get(ordered[i].id)+0.001>=distances.get(ordered[i-1].id),
      `${ordered[i-1].id} incorrectly behind ${ordered[i].id}`);
  }
  const snail=ordered.find(o=>o.id==='living:snail:0');
  assert.ok(ordered.some(o=>o.id.startsWith('individual:')&&o.layer>snail.layer));
  assert.ok(ordered.some(o=>o.id.startsWith('individual:')&&o.layer<snail.layer));
  const wood=scene.objects.find(o=>o.id==='wood:0:8');
  const frond=scene.objects.find(o=>o.id==='epiphyte:0');
  assert.ok(Math.abs(frond.layer-wood.layer)<0.01,'attached frond lives on another plane');
  assert.equal(wood.layer,worldLayer(woodDepth(0)));
});

test('snail feet follow the same projected floor at every point of their route', () => {
  const base=advanceAquariumHistory(createAquariumState({seed:83}),730);
  for(const elapsedRealSeconds of [0,100,500,1000]) {
    const state={...base,elapsedRealSeconds};
    const snails=livingWorldRecords(state).filter(r=>r.kind==='snail');
    for(const r of snails)assert.ok(Math.abs(r.y+0.16-groundY(state,r.x,r.depth))<1e-10);
    const far={...snails[0],depth:0.1},near={...snails[0],depth:0.9};
    assert.ok(groundY(state,near.x,near.depth)>groundY(state,far.x,far.depth)+1.5);
  }
});

test('a depth crossing repaints overlapping ink even if screen positions stay still', () => {
  const canvas=createCanvas(800,480),renderer=new CanvasSceneRenderer(canvas);
  function sceneAt(depth) {
    const scene=render({...createAquariumState({seed:83}),school:[],individuals:[],plants:[]});
    const builder=createSceneBuilder(scene);
    for(const [id,z,color] of [['snail',0.5,'#ff0000'],['fish',depth,'#00ff00']]) {
      addGlyphObject(builder,{id,layer:worldLayer(z),glyphs:[],fill:[{x:100,y:100,width:20,height:20,color}]});
    }
    return finalizeScene(builder);
  }
  renderer.draw(sceneAt(0.49));
  assert.deepEqual([...canvas.getContext('2d').getImageData(105,105,1,1).data],[255,0,0,255]);
  const damage=renderer.draw(sceneAt(0.51));
  assert.equal(damage.full,false);
  assert.deepEqual([...canvas.getContext('2d').getImageData(105,105,1,1).data],[0,255,0,255]);
});
