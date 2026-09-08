import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

export function auditOptions(defaults) {
  const options = { ...defaults };
  for (const argument of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    if (!match || !Object.hasOwn(options, match[1])) {
      throw new Error(`Expected --name=value; supported options: ${Object.keys(options).join(", ")}`);
    }
    options[match[1]] = match[2];
  }
  for (const key of ["seconds", "dt", "timeScale", "days", "frames", "cases"]) {
    if (!(key in options)) continue;
    options[key] = Number(options[key]);
    if (!Number.isFinite(options[key]) || options[key] < (key === "days" ? 0 : Number.MIN_VALUE)) {
      throw new Error(`--${key} must be ${key === "days" ? "nonnegative" : "positive"} and finite`);
    }
  }
  if (options.dt > 0.25) throw new Error("--dt must be <= 0.25, the production tick limit");
  for (const key of ["frames", "cases"]) {
    if (key in options && !Number.isSafeInteger(options[key])) throw new Error(`--${key} must be an integer`);
  }
  if ("seeds" in options) {
    options.seeds = String(options.seeds).split(",").map(Number);
    if (!options.seeds.length || options.seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)) {
      throw new Error("--seeds must contain comma-separated uint32 seeds");
    }
  }
  return options;
}

// Allows the same measuring stick to inspect a clean baseline worktree.
export function importFrom(root, file) {
  return import(pathToFileURL(path.resolve(root, file)).href);
}

export async function writeAudit(directory, name, report) {
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, `${name}.json`);
  await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${filename}`);
}
