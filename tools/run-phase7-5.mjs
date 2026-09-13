import { readFile, writeFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const sourcePath = "tools/apply-phase7-5.mjs";
let source = await readFile(sourcePath, "utf8");

// Correct two patch-builder regexes before executing the one-shot script. The
// first typo escaped the closing parenthesis twice; the second needed to stop at
// the end of naturalCompletion rather than at its first inner block.
source = source.replace(
  String.raw`\{ shelter: true \}\\);[\s\S]*?\n    \}, settled`,
  String.raw`\{ shelter: true \}\);[\s\S]*?\n    \}, settled`,
);
source = source.replace(
  String.raw`/function naturalCompletion\(fish, activity, target, dwell\) \{[\s\S]*?\n\}/,`,
  String.raw`/function naturalCompletion\(fish, activity, target, dwell\) \{[\s\S]*?\n\}\n\n(?=\/\*\*)/,`,
);

const temporary = "/tmp/apply-phase7-5-fixed.mjs";
await writeFile(temporary, source);
await import(`${pathToFileURL(temporary).href}?run=${Date.now()}`);
await rm("tools/run-phase7-5.mjs", { force: true });
