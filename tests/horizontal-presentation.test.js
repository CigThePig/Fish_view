import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DISPLAY } from '../src/sim/config.js';
import { aquariumPoint, DeveloperGesture } from '../src/platform/aquarium-input.js';
import { createAquariumState, serializePersistentState } from '../src/sim/state.js';
import { loadPersistedState, savePersistedState, clearPersistedState } from '../src/platform/storage.js';

test('canonical configuration, state and markup cannot select another world', async () => {
  assert.deepEqual(DISPLAY, { cols: 66, rows: 20, pixelWidth: 800, pixelHeight: 480 });
  const canonical = createAquariumState({seed: 83});
  for (const orientation of ['portrait','landscape','compare']) {
    assert.deepEqual(createAquariumState({seed: 83, orientation}), canonical);
  }
  assert.ok(!('orientation' in canonical));
  assert.ok(!('orientation' in serializePersistentState(canonical)));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<canvas\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /portrait-canvas|data-mode|debug-toggle|figcaption/);
  const beforePanel = html.split('<aside')[0];
  assert.doesNotMatch(beforePanel, /<button|<nav/);
});

test('pointer mapping and hotspot follow the displayed aquarium at every scale', () => {
  for (const [width,height] of [[800,480],[1280,720],[1920,1080],[844,390],[390,844],[360,800]]) {
    const scale = Math.min(width/800,height/480);
    const rect = {width:800*scale,height:480*scale,left:(width-800*scale)/2,top:(height-480*scale)/2};
    for (const [x,y] of [[0,0],[0.2,0.7],[0.5,0.5],[1,1]]) {
      const point = aquariumPoint({clientX:rect.left+x*rect.width,clientY:rect.top+y*rect.height},rect);
      assert.ok(Math.abs(point.x-x*66)<1e-10);
      assert.ok(Math.abs(point.y-y*20)<1e-10);
    }
    assert.equal(aquariumPoint({clientX:rect.left+rect.width-10,clientY:rect.top+10},rect).hotspot,true);
    assert.equal(aquariumPoint({clientX:rect.left+rect.width+1,clientY:rect.top+10},rect).hotspot,false);
    assert.equal(aquariumPoint({clientX:rect.left+rect.width-10,clientY:rect.top-1},rect).hotspot,false);
  }
});

test('triple taps use a rolling three-second window and reset after recognition or outside input', () => {
  const g = new DeveloperGesture();
  assert.equal(g.tap(true,0),false);
  assert.equal(g.tap(true,1000),false);
  assert.equal(g.tap(true,3000),true);
  assert.equal(g.tap(true,3100),false);
  g.reset();
  assert.equal(g.tap(true,4000),false);
  assert.equal(g.tap(true,6500),false);
  assert.equal(g.tap(true,7100),false); // First tap expired, second remains.
  assert.equal(g.tap(true,7200),true);
  g.tap(true,8000); g.tap(true,8100); g.tap(false,8200);
  assert.equal(g.tap(true,8300),false);
});

function storage(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const data = new Map();
  const api = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:api});
  t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
  return {data,api};
}
test('landscape migration preserves biology, catches up once, and removes duplicate saves after writing', t => {
  const {data} = storage(t);
  const base = createAquariumState({seed:83});
  const old = serializePersistentState(base);
  old.orientation = 'landscape'; old.individuals[0].history.touches = 7;
  data.set('fish-view:phase-0:83:landscape',JSON.stringify({savedAtMs:1000,state:old}));
  data.set('fish-view:phase-0:83:portrait',JSON.stringify({savedAtMs:1000,state:{...old,orientation:'portrait'}}));
  const now = 1000+86400000;
  const restored = loadPersistedState(base,now);
  assert.equal(restored.individuals[0].history.touches,7);
  assert.equal(restored.totalDays,1);
  assert.deepEqual([...data.keys()],['fish-view:aquarium:83']);
  assert.equal(loadPersistedState(base,now).totalDays,1);
  assert.ok(!('orientation' in JSON.parse(data.values().next().value).state));
  clearPersistedState(restored);
  assert.equal(data.size,0);
});
test('portrait is never imported and a failed canonical write preserves the old landscape save', t => {
  const {data,api} = storage(t);
  const base = createAquariumState({seed:83});
  const saved = serializePersistentState(base);
  data.set('fish-view:phase-0:83:portrait',JSON.stringify({savedAtMs:0,state:{...saved,orientation:'portrait'}}));
  assert.strictEqual(loadPersistedState(base,1000),base);
  data.set('fish-view:phase-0:83:landscape',JSON.stringify({savedAtMs:0,state:{...saved,orientation:'landscape'}}));
  api.setItem = ()=>{throw new Error('quota');};
  assert.notStrictEqual(loadPersistedState(base,1000),base);
  assert.equal(data.size,2);
  assert.equal(savePersistedState(base),false);
  clearPersistedState(base);
  assert.equal(data.size,0);
});
test('a canonical save takes precedence over an obsolete landscape save', t => {
  const {data} = storage(t);
  const base = createAquariumState({seed:83});
  savePersistedState(base,1000);
  data.set('fish-view:phase-0:83:landscape',JSON.stringify({savedAtMs:0,state:{...serializePersistentState(base),orientation:'landscape',totalDays:90}}));
  assert.equal(loadPersistedState(base,1000).totalDays,0);
});

test('Pages gives every stylesheet and module a new shared asset namespace', async t => {
  const { mkdtemp, rm, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { buildPages } = await import('../tools/build-pages.mjs');
  const output = await mkdtemp(path.join(tmpdir(), 'fish-pages-'));
  t.after(() => rm(output, {recursive:true,force:true}));
  const built = await buildPages({output});
  for (const page of ['index.html','plants.html','sprites.html','behaviors.html']) {
    const html = await readFile(path.join(output,page),'utf8');
    const urls = [...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js))"/g)].map(match=>match[1]);
    assert.ok(urls.length>=2);
    for(const url of urls) {
      assert.ok(url.startsWith(`${built.assets}/`));
      assert.ok((await readFile(path.join(output,url))).length>0);
    }
    assert.doesNotMatch(html,/true-rotation-20260902|living-skeletal-plants-20260830/);
  }
  const src = path.join(output,built.assets,'src');
  for(const file of (await readdir(src,{recursive:true})).filter(file=>file.endsWith('.js'))) {
    const code = await readFile(path.join(src,file),'utf8');
    for(const match of code.matchAll(/(?:from\s+|import\s*\()\s*["'](\.[^"']+\.js)(?:\?[^"']*)?["']/g)) {
      const dependency = path.resolve(path.dirname(path.join(src,file)),match[1]);
      assert.ok(dependency.startsWith(src+path.sep));
      assert.ok((await readFile(dependency)).length>0);
    }
  }
});
