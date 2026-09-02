import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { isCronAuthorized } = await loadTs(new URL("../cron-auth.ts", import.meta.url));

test("no secret configured -> never authorized (fail closed)", () => {
  assert.equal(isCronAuthorized(null, undefined), false);
  assert.equal(isCronAuthorized("Bearer s", undefined), false);
  assert.equal(isCronAuthorized("Bearer s", ""), false);
});

test("secret set, header missing or wrong -> false", () => {
  assert.equal(isCronAuthorized(null, "s"), false);
  assert.equal(isCronAuthorized("Bearer wrong", "s"), false);
  assert.equal(isCronAuthorized("s", "s"), false);
});

test("secret set and matched -> true", () => {
  assert.equal(isCronAuthorized("Bearer s", "s"), true);
});
