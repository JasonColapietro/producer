import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// The llms.txt route imports ../site, which loadTs cannot resolve from a data:
// URL. Transpile site.ts to its own data URL and rewrite the route's specifier
// to point at it, so this exercises the real GET handler and the real body
// rather than asserting against a copy of the string.
async function loadRoute() {
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } };
  const toDataUrl = (src) =>
    "data:text/javascript;base64," + Buffer.from(ts.transpileModule(src, opts).outputText).toString("base64");

  const siteUrl = toDataUrl(readFileSync(new URL("../../app/site.ts", import.meta.url), "utf8"));
  const routeSrc = readFileSync(new URL("../../app/llms.txt/route.ts", import.meta.url), "utf8")
    .replace('from "../site"', `from "${siteUrl}"`);
  return import(toDataUrl(routeSrc));
}

const { GET } = await loadRoute();
const body = await (await GET()).text();

test("llms.txt says the dashboard is locked and not open to visitors", () => {
  assert.match(body, /Locked right now; the dashboard is not open to visitors\./);
});

test("llms.txt tells an assistant not to send anyone to the dashboard", () => {
  assert.match(body, /operator login/);
  assert.match(body, /do not tell anyone they can open, try, sign up for, or demo it/);
});

// The host answers 503 while DASHBOARD_SECRET is unset and 401 once it is set.
// Neither is open access, so the file must not describe it as reachable
// without saying, in the same breath, that it is gated.
test("no sentence claims the host is available without also saying it is locked", () => {
  const claimsAvailability = /\bThis host:[^\n]*/.exec(body);
  assert.ok(claimsAvailability, "the host line should still exist");
  assert.match(claimsAvailability[0], /not open to visitors/);
});

test("llms.txt still identifies the product and its owner", () => {
  assert.match(body, /# Suede Cinema/);
  assert.match(body, /Suede Labs AI/);
  assert.match(body, /producer\.suedeai\.ai/);
});
