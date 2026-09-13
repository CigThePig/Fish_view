import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { observeChaseShowcase } from "../src/dev/chase-observation.js";
import { hashSeed } from "../src/sim/prng.js";

const DEFAULT_OUTPUT = ".audit-output/chase-readiness";
const MATRIX_LABELS = Object.freeze([
  "phase7-chase-a",
  "phase7-chase-b",
  "phase7-chase-c",
  "phase7-chase-d",
  "phase7-chase-e",
  "phase7-chase-f",
]);

function optionValue(argumentsList, name, fallback) {
  const prefix = `${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : fallback;
}

function parseOptions(argumentsList) {
  const output = path.resolve(optionValue(argumentsList, "--output", DEFAULT_OUTPUT));
  const seedLabel = optionValue(argumentsList, "--seed", null);
  return {
    output,
    labels: seedLabel ? [seedLabel] : [...MATRIX_LABELS],
  };
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(digits));
}

function compactObservation(label, observation) {
  return {
    label,
    seed: observation.seed,
    profile: observation.profile,
    summary: Object.fromEntries(Object.entries(observation.summary).map(([key, value]) => (
      [key, typeof value === "number" ? round(value) : value]
    ))),
    timeline: observation.timeline.map((sample) => ({
      seconds: round(sample.seconds, 2),
      phase: sample.phase,
      gap: round(sample.gap),
      gapRate: round(sample.gapRate),
      verticalSeparation: round(sample.verticalSeparation),
      targetAlignment: round(sample.targetAlignment),
      headingSeparationDegrees: round(sample.headingSeparationDegrees, 2),
      evasionStrength: round(sample.evasionStrength),
      chaserSpeed: round(sample.chaser.speed),
      evaderSpeed: round(sample.evader.speed),
      chaserTurnRate: round(sample.chaser.turnRateDegreesPerSecond, 2),
      evaderTurnRate: round(sample.evader.turnRateDegreesPerSecond, 2),
    })),
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pathFor(samples, xFor, yFor) {
  return samples.map((sample, index) => `${index ? "L" : "M"}${xFor(sample).toFixed(2)},${yFor(sample).toFixed(2)}`).join(" ");
}

function svgForObservation(entry) {
  const width = 1000;
  const height = 620;
  const left = 70;
  const right = 30;
  const chartWidth = width - left - right;
  const panelHeight = 150;
  const timeline = entry.timeline;
  const duration = Math.max(0.1, timeline.at(-1)?.seconds ?? 1);
  const x = (sample) => left + sample.seconds / duration * chartWidth;
  const chart = (top, values, maxValue, label, lines) => {
    const floor = top + panelHeight;
    const y = (value) => floor - Math.max(0, Math.min(1, value / Math.max(0.0001, maxValue))) * panelHeight;
    const body = lines.map(({ key, name, dash = "" }) => (
      `<path d="${pathFor(timeline, x, (sample) => y(sample[key]))}" fill="none" stroke="currentColor" stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`
      + `<text x="${left + 8}" y="${top + 18 + lines.indexOf(lines.find((line) => line.key === key)) * 18}" font-size="12">${escapeXml(name)}</text>`
    )).join("\n");
    return `<g transform="translate(0,0)">
      <rect x="${left}" y="${top}" width="${chartWidth}" height="${panelHeight}" fill="none" stroke="currentColor" opacity="0.35"/>
      <text x="${left}" y="${top - 10}" font-size="14" font-weight="600">${escapeXml(label)}</text>
      ${body}
    </g>`;
  };
  const maxGap = Math.max(...timeline.map((sample) => sample.gap), 1);
  const maxSpeed = Math.max(...timeline.flatMap((sample) => [sample.chaserSpeed, sample.evaderSpeed]), 0.1);
  const maxTurn = Math.max(...timeline.flatMap((sample) => [sample.chaserTurnRate, sample.evaderTurnRate]), 1);
  const phaseMarks = entry.summary.phases.map((phase) => {
    const px = left + phase.seconds / duration * chartWidth;
    return `<line x1="${px}" x2="${px}" y1="56" y2="580" stroke="currentColor" opacity="0.15"/>
      <text x="${px + 4}" y="72" font-size="11">${escapeXml(phase.phase)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#081014;color:#b9d7d2;font-family:system-ui,sans-serif">
    <rect width="100%" height="100%" fill="#081014"/>
    <text x="${left}" y="30" font-size="20" font-weight="700">Playful chase telemetry · ${escapeXml(entry.label)}</text>
    <text x="${left}" y="48" font-size="12">seed ${entry.seed} · chaser ${escapeXml(entry.profile.chaser.spriteId)} · evader ${escapeXml(entry.profile.evader.spriteId)}</text>
    ${phaseMarks}
    ${chart(90, timeline, maxGap, "Pair distance (rows)", [{ key: "gap", name: "gap" }])}
    ${chart(280, timeline, maxSpeed, "Speed (rows/s)", [{ key: "chaserSpeed", name: "chaser" }, { key: "evaderSpeed", name: "evader", dash: "7 5" }])}
    ${chart(470, timeline, maxTurn, "Turn rate (deg/s)", [{ key: "chaserTurnRate", name: "chaser" }, { key: "evaderTurnRate", name: "evader", dash: "7 5" }])}
  </svg>`;
}

function markdownSummary(entries) {
  const lines = [
    "# Chase readiness telemetry",
    "",
    "This is instrumentation, not a Phase 7.2 acceptance result. It records the current forced production chase across a deterministic seed matrix so later choreography work can be compared against the same observation surface.",
    "",
    "| Label | Chaser / evader | activity traits | gap range | oscillations | peak speeds | peak turns | break | overshoot frames |",
    "| --- | --- | --- | ---: | ---: | --- | --- | --- | ---: |",
  ];
  for (const entry of entries) {
    const c = entry.profile.chaser;
    const e = entry.profile.evader;
    const s = entry.summary;
    lines.push(`| ${entry.label} | ${c.spriteId} / ${e.spriteId} | ${c.traits.activity.toFixed(2)} / ${e.traits.activity.toFixed(2)} | ${s.gapRange.toFixed(2)} | ${s.gapOscillations} | ${s.peakChaserSpeed.toFixed(2)} / ${s.peakEvaderSpeed.toFixed(2)} | ${s.peakChaserTurnRateDegreesPerSecond.toFixed(0)} / ${s.peakEvaderTurnRateDegreesPerSecond.toFixed(0)} | ${s.breakSeen ? `${s.breakSecond.toFixed(1)}s` : "no"} | ${s.overshootFrames} |`);
  }
  lines.push("", "Each SVG in this directory shows pair distance, both speeds, both turn rates, and choreography phase boundaries for one seed.", "");
  return lines.join("\n");
}

const options = parseOptions(process.argv.slice(2));
await mkdir(options.output, { recursive: true });
const observations = options.labels.map((label) => compactObservation(
  label,
  observeChaseShowcase({ seed: hashSeed(label) }),
));

await writeFile(
  path.join(options.output, "chase-readiness.json"),
  `${JSON.stringify({ version: 1, observations }, null, 2)}\n`,
);
await writeFile(path.join(options.output, "README.md"), `${markdownSummary(observations)}\n`);
for (const observation of observations) {
  await writeFile(
    path.join(options.output, `${observation.label}.svg`),
    `${svgForObservation(observation)}\n`,
  );
}

console.log(`Wrote chase readiness telemetry to ${options.output}`);
console.log(`- chase-readiness.json`);
console.log(`- README.md`);
for (const observation of observations) console.log(`- ${observation.label}.svg`);
