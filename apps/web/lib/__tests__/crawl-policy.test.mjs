import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

// producer.suedeai.ai serves an operator dashboard behind a fail-closed auth
// gate: 503 while DASHBOARD_SECRET is unset, 401 once it is set. Neither state
// is indexable, so the host must never advertise itself as crawlable.
const robotsMod = await loadTs(new URL("../../app/robots.ts", import.meta.url));
const sitemapMod = await loadTs(new URL("../../app/sitemap.ts", import.meta.url));
const { LOCKED_RESPONSE_HEADERS } = await loadTs(new URL("../dashboard-auth.ts", import.meta.url));

const asArray = (v) => (Array.isArray(v) ? v : [v]);

test("robots disallows the whole host", () => {
  const r = robotsMod.default();
  const rules = asArray(r.rules);
  assert.equal(rules.length, 1, "one rule group only");
  assert.equal(rules[0].userAgent, "*");
  assert.deepEqual(asArray(rules[0].disallow), ["/"]);
  assert.equal(rules[0].allow, undefined, "an Allow line would re-open the host");
});

test("robots advertises no sitemap", () => {
  const r = robotsMod.default();
  assert.equal(r.sitemap, undefined, "a Sitemap line advertises a locked host");
});

test("sitemap lists nothing while the dashboard is locked", () => {
  assert.deepEqual(sitemapMod.default(), []);
});

test("the locked 503 tells crawlers when to retry and is never cached", () => {
  assert.equal(LOCKED_RESPONSE_HEADERS["cache-control"], "no-store");
  const retry = Number(LOCKED_RESPONSE_HEADERS["retry-after"]);
  assert.ok(Number.isInteger(retry) && retry > 0, "retry-after must be a positive integer of seconds");
});

test("the locked headers cannot be mutated by a later caller", () => {
  assert.ok(Object.isFrozen(LOCKED_RESPONSE_HEADERS));
  assert.throws(() => {
    "use strict";
    LOCKED_RESPONSE_HEADERS["x-injected"] = "leaked";
  }, TypeError);
  assert.equal(LOCKED_RESPONSE_HEADERS["x-injected"], undefined);
});
