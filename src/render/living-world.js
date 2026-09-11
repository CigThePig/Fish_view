import { driftwoodPath, habitatState, livingWorldRecords } from '../sim/living-world.js';
import { groundY, meadowDepth, woodDepth } from '../sim/habitat-depth.js';
import { impulseFlowAt } from '../sim/interaction-events.js';
import { worldLayer, laneForDepth } from './depth.js';
import { sample01, sampleRange } from '../sim/prng.js';
import { mixColor } from './palette.js?v=horizontal-20260909';
import { addGlyphObject, positionedGlyph } from './scene.js?v=horizontal-20260909';

// How far a speck of dust is carried by water that is moving. A little more
// than a tuft, because a speck is smaller than anything else in the tank.
const DUST_FLOW_CELLS = 2.6;

export function drawLivingWorld(builder, state, palette, metrics) {
  const habitat = habitatState(state);
  const glyph = (char, x, y, color, sx = 0.7, sy = sx) => positionedGlyph(metrics,
    { char, worldX: x, worldY: y, fg: color, scaleX: sx, scaleY: sy });
  const wood = mixColor('#597568', '#2d2317', palette.night);
  const woodShade = mixColor('#304c45', '#201a12', palette.night);
  const moss = mixColor(palette.plants.midground[1], palette.plants.foreground[2], habitat.patina);
  for (let trunk = 0; trunk < 2; trunk++) {
    const points = driftwoodPath(state, trunk);
    // Small objects let moss and nearby fish repaint only a piece of the log.
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const char = i < 7 ? (trunk ? '\\' : '/') : i > 11 ? (trunk ? '/' : '\\') : '_';
      const glyphs = [glyph(char, p.x, p.y, wood, 0.95), glyph(char, p.x, p.y + 0.18, woodShade, 0.9)];
      if (sample01(state.seed, 12200 + trunk * 31 + i) < habitat.moss * 0.88) {
        glyphs.push(glyph(i % 3 ? '"' : 'v', p.x, p.y - 0.22, moss, 0.62));
      }
      if ((i === 5 || i === 13) && trunk === 0) {
        glyphs.push(glyph('/', p.x + 0.3, p.y - 0.48, wood, 0.8));
        glyphs.push(glyph('Y', p.x + 0.65, p.y - 0.94, wood, 0.65));
      }
      addGlyphObject(builder, { id: `wood:${trunk}:${i}`, layer: worldLayer(woodDepth(trunk)), glyphs,
        fill: i === 0 ? [] : woodSpans(points[i - 1], p, metrics, woodShade),
      });
    }
  }
  // Low rosettes expand sideways slowly; open sand remains between colonies.
  for (let patch = 0; patch < 5; patch++) {
    const root = state.cols * (0.1 + patch * 0.2);
    const count = 1 + Math.floor(habitat.meadow * 6);
    for (let i = 0; i < count; i++) {
      const slot = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? -1 : 1);
      const x = root + slot * 0.75;
      const depth = meadowDepth(state.seed, patch, i);
      const y = groundY(state, x, depth) - 0.14;
      const growth = 0.35 + habitat.meadow * 0.28;
      const glyphs = [glyph('v', x, y, moss, growth, growth),
        glyph('/', x + 0.15, y - 0.14, palette.plants.foreground[0], growth, growth)];
      if (habitat.bloom > 0.45 && i % 3 === 0 && habitat.meadow > 0.2) {
        glyphs.push(glyph('*', x, y - 0.36, mixColor('#bb9a72', '#392b1a', palette.night), 0.32));
      }
      addGlyphObject(builder, { id: `meadow:${patch}:${i}`, layer: worldLayer(depth), glyphs });
    }
  }
  // Epiphyte fans settle on old wood and keep unfurling over several years.
  // Only eight fronds exist; age changes their lengths, never the array size.
  const frondGrowth = Math.max(0, Math.min(1, ((state.totalDays ?? 0) - 240) / 1460));
  if (frondGrowth > 0) {
    const crest = driftwoodPath(state, 0)[8];
    for (let frond = 0; frond < 8; frond++) {
      const angle = -1.25 + frond / 7 * 2.5;
      const length = (0.25 + frondGrowth * 2.4) * sampleRange(state.seed, 12600 + frond, 0.65, 1.1);
      const glyphs = [];
      for (let joint = 1; joint <= 6; joint++) {
        const u = joint / 6;
        const sway = Math.sin(state.elapsedRealSeconds * 0.45 + frond * 0.8) * 0.10 * u * u;
        const x = crest.x + Math.sin(angle) * length * u * 1.35 + sway;
        const y = crest.y - Math.cos(angle) * length * u;
        glyphs.push(glyph(joint === 6 ? (habitat.bloom > 0.65 ? '*' : 'Y') : angle < -0.3 ? '\\' : angle > 0.3 ? '/' : '|',
          x, y, joint === 6 ? palette.plants.growthTip : moss, 0.5, 0.5));
      }
      addGlyphObject(builder, { id: `epiphyte:${frond}`, layer: worldLayer(woodDepth(0)) + 0.001, glyphs });
    }
  }
  const records = livingWorldRecords(state);
  for (const r of records) {
    let glyphs;
    // How much of this animal is currently put away. A snail pulls its foot
    // and its eye-stalk in; a shrimp tucks its legs under and stretches out.
    // Both are read off the record's own alarm, which came off the impulses
    // and is gone the moment the water is still again.
    const alarm = r.alarm ?? 0;
    if (r.kind === 'snail') {
      const shell = mixColor('#c39962', '#51402a', palette.night);
      glyphs = [glyph('@', r.x, r.y - 0.14, shell, 0.76, 0.57),
        glyph('_', r.x + r.facing * 0.30 * (1 - alarm * 0.7), r.y + 0.10, wood, 0.8 - alarm * 0.34, 0.5)];
      // The eye-stalk is the first thing in and the last thing out.
      if (alarm < 0.55) {
        glyphs.push(glyph('"', r.x + r.facing * 0.63 * (1 - alarm), r.y - 0.07 + r.pulse * 0.02, shell, 0.32));
      }
    } else if (r.kind === 'shrimp') {
      const color = mixColor('#c8917b', '#493323', palette.night);
      glyphs = [glyph(r.facing > 0 ? '>' : '<', r.x, r.y, color, 0.6 + alarm * 0.16, 0.45 - alarm * 0.1),
        glyph('=', r.x - r.facing * (0.44 + alarm * 0.16), r.y + 0.06, color, 0.55, 0.38),
        glyph('v', r.x - r.facing * 0.15, r.y + 0.20 - alarm * 0.12, wood, 0.37 * (1 - alarm * 0.6), 0.3),
        glyph(r.facing > 0 ? '/' : '\\', r.x + r.facing * 0.4, r.y - 0.12, color, 0.46, 0.3)];
    } else {
      const color = mixColor(palette.waterBands[2], palette.plants.growthTip, r.visibility * 0.8);
      glyphs = [glyph('"', r.x + r.pulse * 0.12, r.y - 0.15, color, 0.44),
        glyph(',', r.x, r.y + 0.04, color, 0.5)];
    }
    const haze = palette.depthLanes[laneForDepth(r.depth)].haze;
    glyphs = glyphs.map(g => ({ ...g, fg: mixColor(g.fg, palette.fog, haze) }));
    addGlyphObject(builder, { id: `living:${r.id}`, layer: worldLayer(r.depth), glyphs });
  }
  // Sparse dust catches the light in the water; slow, depth-separated drift.
  for (let i = 0; i < 10; i++) {
    const t = state.elapsedRealSeconds;
    const driftX = sampleRange(state.seed, 12300 + i, 1, state.cols - 1) + Math.sin(t * 0.08 + i) * 0.65;
    const driftY = 2 + ((sampleRange(state.seed, 12400 + i, 0, state.rows - 5) + t * 0.035) % (state.rows - 5));
    // Dust has no weight and no opinion either. Ten specks carried by a drag
    // are the cheapest picture of a current this aquarium can draw - ten glyphs
    // that already exist, moved. Sideways only, for the same reason the tufts
    // and the bubbles are: a stateless vertical offset springs back when the
    // impulse expires, and a speck rising against the current says the opposite
    // of what the current did.
    const flow = impulseFlowAt(state, driftX, driftY);
    const x = Math.max(0.4, Math.min(state.cols - 0.4, driftX + flow.x * DUST_FLOW_CELLS));
    const y = driftY;
    addGlyphObject(builder, { id: `dust:${i}`, layer: worldLayer(sampleRange(state.seed, 12500 + i, 0.05, 0.95)),
      glyphs: [glyph('.', x, y, mixColor(palette.waterBands[3], palette.ambient, 0.5), 0.45)] });
  }
  builder.metadata.livingWorld = { ...habitat, creatures: records.length };
}

function woodSpans(a, b, metrics, color) {
  const dx = (b.x - a.x) * metrics.cellWidth;
  const dy = (b.y - a.y) * metrics.cellHeight;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: Math.round(a.x * metrics.cellWidth + dx * i / steps),
    y: Math.round(a.y * metrics.cellHeight + dy * i / steps + 2),
    width: 3, height: 4, color,
  }));
}
