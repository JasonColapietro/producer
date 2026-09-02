import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Load a dependency-free TS module for node:test by transpiling it with the
// repo's own TypeScript, so tests never drift from what tsc compiles.
export async function loadTs(url) {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const src = readFileSync(url, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
}
