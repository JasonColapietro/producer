import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { mintOAuthState, verifyOAuthState, OAUTH_STATE_TTL_SECONDS } = await loadTs(
  new URL("../oauth-state.ts", import.meta.url),
);

const CH = "3f2c1b0a-9d8e-4f7a-b6c5-d4e3f2a1b0c9";
const SECRET = "dashboard-secret";
const T0 = 1_788_000_000_000;

test("round trip returns the bound channel id", () => {
  const state = mintOAuthState(CH, SECRET, T0);
  assert.equal(verifyOAuthState(state, SECRET, T0 + 1000), CH);
});

test("no secret -> mint throws and verify never passes (fail closed)", () => {
  assert.throws(() => mintOAuthState(CH, undefined, T0));
  assert.throws(() => mintOAuthState(CH, "", T0));
  const state = mintOAuthState(CH, SECRET, T0);
  assert.equal(verifyOAuthState(state, undefined, T0), null);
  assert.equal(verifyOAuthState(state, "", T0), null);
});

test("expired state -> null", () => {
  const state = mintOAuthState(CH, SECRET, T0);
  assert.equal(verifyOAuthState(state, SECRET, T0 + OAUTH_STATE_TTL_SECONDS * 1000), null);
  assert.equal(verifyOAuthState(state, SECRET, T0 + OAUTH_STATE_TTL_SECONDS * 1000 - 1), CH);
});

test("wrong secret -> null", () => {
  const state = mintOAuthState(CH, SECRET, T0);
  assert.equal(verifyOAuthState(state, "other", T0), null);
});

test("tampered channel id or expiry -> null", () => {
  const [, exp, sig] = mintOAuthState(CH, SECRET, T0).split(".");
  const other = "00000000-0000-4000-8000-000000000000";
  assert.equal(verifyOAuthState(`${other}.${exp}.${sig}`, SECRET, T0), null);
  assert.equal(verifyOAuthState(`${CH}.${Number(exp) + 999999}.${sig}`, SECRET, T0), null);
});

test("malformed or attacker-chosen state -> null", () => {
  for (const s of [null, "", CH, `${CH}.123`, `${CH}.abc.sig`, `${CH}.123.`, `a.b.c.d`, `${CH}.${"9".repeat(13)}.x`]) {
    assert.equal(verifyOAuthState(s, SECRET, T0), null, JSON.stringify(s));
  }
});

test("a channel id containing the separator cannot be minted", () => {
  assert.throws(() => mintOAuthState("a.b", SECRET, T0));
  assert.throws(() => mintOAuthState("", SECRET, T0));
});
