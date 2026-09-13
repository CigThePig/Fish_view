import { readFile, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const sourcePath = "tools/apply-phase7-5.mjs";
let source = await readFile(sourcePath, "utf8");

// Correct patch-builder quoting/regexes before executing the one-shot script.
source = source.replace(
  String.raw`\{ shelter: true \}\\);[\s\S]*?\n    \}, settled`,
  String.raw`\{ shelter: true \}\);[\s\S]*?\n    \}, settled`,
);
source = source.replace(
  String.raw`/function naturalCompletion\(fish, activity, target, dwell\) \{[\s\S]*?\n\}/,`,
  String.raw`/function naturalCompletion\(fish, activity, target, dwell\) \{[\s\S]*?\n\}\n\n(?=\/\*\*)/,`,
);

// The generated regression test intentionally contains template literals of
// its own. Escape those for the patch-builder's outer template without touching
// the builder's normal `${...}` diagnostics elsewhere.
const vocabularyStart = source.indexOf('const vocabularyTest = `');
const vocabularyEndMarker = '`;\nawait writeFile("tests/phase7-plant-vocabulary.test.js", vocabularyTest);';
const vocabularyEnd = source.indexOf(vocabularyEndMarker, vocabularyStart);
if (vocabularyStart < 0 || vocabularyEnd < 0) throw new Error("vocabulary test template not found");
let vocabulary = source.slice(vocabularyStart, vocabularyEnd);
vocabulary = vocabulary
  .replaceAll('\\\\`', '\\`')
  .replaceAll('${label}', '\\${label}')
  .replaceAll('${activity}', '\\${activity}');
source = source.slice(0, vocabularyStart) + vocabulary + source.slice(vocabularyEnd);

const temporary = "/tmp/apply-phase7-5-fixed.mjs";
await writeFile(temporary, source);
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);
await rm("tools/run-phase7-5.mjs", { force: true });
