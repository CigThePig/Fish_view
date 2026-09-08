import { driftwoodPath, habitatState, livingWorldRecords } from '../sim/living-world.js';
import { substrateSurfaceY } from '../sim/environment.js';
import { sample01, sampleRange } from '../sim/prng.js';
import { mixColor } from './palette.js?v=visual-depth-20260830';
import { addGlyphObject, positionedGlyph } from './scene.js?v=true-rotation-20260902';

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
      addGlyphObject(builder, { id: `wood:${trunk}:${i}`, layer: 23, glyphs,
        fill: i === 0 ? [] : [{
          x: Math.round(Math.min(points[i - 1].x, p.x) * metrics.cellWidth),
          y: Math.round((Math.min(points[i - 1].y, p.y) + 0.1) * metrics.cellHeight),
          width: Math.ceil(Math.abs(p.x - points[i - 1].x) * metrics.cellWidth) + 1,
          height: Math.ceil((Math.abs(p.y - points[i - 1].y) + 0.23) * metrics.cellHeight),
          color: woodShade,
        }],
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
      const y = substrateSurfaceY(state, x) - 0.14;
      const growth = 0.35 + habitat.meadow * 0.28;
      const glyphs = [glyph('v', x, y, moss, growth, growth),
        glyph('/', x + 0.15, y - 0.14, palette.plants.foreground[0], growth, growth)];
      if (habitat.bloom > 0.45 && i % 3 === 0 && habitat.meadow > 0.2) {
        glyphs.push(glyph('*', x, y - 0.36, mixColor('#bb9a72', '#392b1a', palette.night), 0.32));
      }
      addGlyphObject(builder, { id: `meadow:${patch}:${i}`, layer: 51, glyphs });
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
      addGlyphObject(builder, { id: `epiphyte:${frond}`, layer: 24, glyphs });
    }
  }
  const records = livingWorldRecords(state);
  for (const r of records) {
    let glyphs;
    if (r.kind === 'snail') {
      const shell = mixColor('#c39962', '#51402a', palette.night);
      glyphs = [glyph('@', r.x, r.y - 0.14, shell, 0.76, 0.57),
        glyph('_', r.x + r.facing * 0.30, r.y + 0.10, wood, 0.8, 0.5),
        glyph('"', r.x + r.facing * 0.63, r.y - 0.07 + r.pulse * 0.02, shell, 0.32)];
    } else if (r.kind === 'shrimp') {
      const color = mixColor('#c8917b', '#493323', palette.night);
      glyphs = [glyph(r.facing > 0 ? '>' : '<', r.x, r.y, color, 0.6, 0.45),
        glyph('=', r.x - r.facing * 0.44, r.y + 0.06, color, 0.55, 0.38),
        glyph('v', r.x - r.facing * 0.15, r.y + 0.20, wood, 0.37, 0.3),
        glyph(r.facing > 0 ? '/' : '\\', r.x + r.facing * 0.4, r.y - 0.12, color, 0.46, 0.3)];
    } else {
      const color = mixColor(palette.waterBands[2], palette.plants.growthTip, r.visibility * 0.8);
      glyphs = [glyph('"', r.x + r.pulse * 0.12, r.y - 0.15, color, 0.44),
        glyph(',', r.x, r.y + 0.04, color, 0.5)];
    }
    addGlyphObject(builder, { id: `living:${r.id}`, layer: r.kind === 'tuft' ? 26 : 59, glyphs });
  }
  // Sparse dust catches the light in the water; slow, depth-separated drift.
  for (let i = 0; i < 10; i++) {
    const t = state.elapsedRealSeconds;
    const x = sampleRange(state.seed, 12300 + i, 1, state.cols - 1) + Math.sin(t * 0.08 + i) * 0.65;
    const y = 2 + ((sampleRange(state.seed, 12400 + i, 0, state.rows - 5) + t * 0.035) % (state.rows - 5));
    addGlyphObject(builder, { id: `dust:${i}`, layer: 21 + (i % 2) * 5,
      glyphs: [glyph('.', x, y, mixColor(palette.waterBands[3], palette.ambient, 0.5), 0.45)] });
  }
  builder.metadata.livingWorld = { ...habitat, creatures: records.length };
}
