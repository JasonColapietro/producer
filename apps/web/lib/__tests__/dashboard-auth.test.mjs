import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const { checkDashboardAuth, isPublicPath } = await loadTs(new URL("../dashboard-auth.ts", import.meta.url));

const basic = (user, pass) => "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

test("no secret configured -> missing-secret (fail closed)", () => {
  assert.equal(checkDashboardAuth(null, undefined), "missing-secret");
  assert.equal(checkDashboardAuth(basic("a", "x"), ""), "missing-secret");
});

test("no header -> unauthorized", () => {
  assert.equal(checkDashboardAuth(null, "s3cret"), "unauthorized");
});

test("wrong password -> unauthorized", () => {
  assert.equal(checkDashboardAuth(basic("any", "wrong"), "s3cret"), "unauthorized");
  assert.equal(checkDashboardAuth("Bearer s3cret", "s3cret"), "unauthorized");
});

test("right password with any user -> ok", () => {
  assert.equal(checkDashboardAuth(basic("any", "s3cret"), "s3cret"), "ok");
  assert.equal(checkDashboardAuth(basic("", "s3cret"), "s3cret"), "ok");
});

test("public paths are exactly the crawl files, cron, oauth callback and assets", () => {
  for (const p of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/api/cron/tick", "/api/youtube/callback", "/_next/static/chunks/a.js", "/favicon.ico", "/opengraph-image"]) {
    assert.equal(isPublicPath(p), true, p);
  }
  for (const p of ["/", "/plans", "/job/abc", "/api/voiceover", "/api/youtube/connect", "/robots.txt.bak"]) {
    assert.equal(isPublicPath(p), false, p);
  }
});
