import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The module is TS with no build step available in CI here, so exercise the
// rule table directly by transpiling the one function's shape: strip types.
const src = readFileSync(new URL("../job-error.ts", import.meta.url), "utf8");
const js = src
  .replace(/^type Rule[\s\S]*?\n\n/m, "")
  .replace(/: Rule\[\]/, "")
  .replace(/export function publicJobError\(raw: string \| null \| undefined\): string/,
           "export function publicJobError(raw)")
  .replace(/^export /gm, "");
const { publicJobError } = await import(
  "data:text/javascript," + encodeURIComponent(js + "\nexport { publicJobError };"));

// The exact strings that were leaking on the live homepage, 2026-08-31.
const LEAKED = [
  "Missing credential: channel secret or env GOOGLE_CLIENT_ID",
  "Missing credential: channel secret or env PEXELS_API_KEY",
  "No voice reference (channel.defaults.voiceRefUrl or STOCK_VOICE_REF_URL)",
  "model returned no text content (empty or refused response)",
  "Unexpected end of JSON input",
];

// Tokens that must never reach a public surface, whatever the input.
const FORBIDDEN = [
  "GOOGLE_CLIENT_ID", "PEXELS_API_KEY", "STOCK_VOICE_REF_URL",
  "voiceRefUrl", "channel.defaults", "env ", "credential",
];

test("no leaked string survives sanitisation", () => {
  for (const raw of LEAKED) {
    const out = publicJobError(raw);
    for (const bad of FORBIDDEN) {
      assert.ok(!out.includes(bad), `"${bad}" leaked through for: ${raw}`);
    }
  }
});

test("an unrecognised error does not echo its input", () => {
  const raw = "postgres://user:hunter2@10.0.0.5:5432/prod timed out at /var/task/x.js:88";
  const out = publicJobError(raw);
  assert.equal(out, "This step timed out. Try again.");
  assert.ok(!out.includes("hunter2") && !out.includes("/var/task"));
});

test("a totally unknown error falls back to the generic message", () => {
  assert.equal(publicJobError("kaboom 0xdeadbeef /etc/passwd"), "This render failed.");
});

test("null and empty are handled", () => {
  assert.equal(publicJobError(null), "This render failed.");
  assert.equal(publicJobError(""), "This render failed.");
});

test("no input can ever be echoed verbatim", () => {
  const probes = [...LEAKED, "x", "a".repeat(500), "<script>alert(1)</script>", "SECRET_KEY=abc"];
  for (const raw of probes) {
    assert.notEqual(publicJobError(raw), raw, `echoed verbatim: ${raw}`);
  }
});
