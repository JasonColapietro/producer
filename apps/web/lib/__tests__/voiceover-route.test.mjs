import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadTs } from './load-ts.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const auth = await loadTs(new URL('../dashboard-auth.ts', import.meta.url));
const upload = await loadTs(new URL('../voiceover-upload.ts', import.meta.url));
const source = readFileSync(new URL('../../app/api/voiceover/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function handler() {
  let databaseCalls = 0;
  const uploads = [];
  const db = () => {
    databaseCalls++;
    return {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'job-1', status: 'needs_voiceover' }] }) }) }),
      insert: () => ({ values: async () => undefined }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    };
  };
  const imports = {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@producer/core/web': { db, schema: { jobs: { id: 'id' }, assets: {} } },
    'drizzle-orm': { eq: () => true },
    '@vercel/blob': { put: async (path, file) => { uploads.push({ path, file }); return { url: 'https://blob.example/audio.mp3' }; } },
    '@/lib/dashboard-auth': auth,
    '@/lib/voiceover-upload': upload,
  };
  const exports = {};
  new Function('require', 'exports', compiled)(name => {
    assert.ok(name in imports, `unexpected real dependency: ${name}`);
    return imports[name];
  }, exports);
  return { post: exports.POST, uploads, databaseCalls: () => databaseCalls };
}
const url = 'https://producer.suedeai.ai/api/voiceover';
const basic = 'Basic ' + Buffer.from('owner:unit-secret').toString('base64');
test('voiceover route checks authentication and origin before reading bytes or touching storage', async () => {
  const previous = process.env.DASHBOARD_SECRET;
  process.env.DASHBOARD_SECRET = 'unit-secret';
  try {
    for (const [headers, status] of [[{}, 401], [{ authorization: basic, origin: 'https://attacker.example' }, 403]]) {
      const h = handler();
      const request = new Request(url, { method: 'POST', headers, body: 'not multipart' });
      const response = await h.post(request);
      assert.equal(response.status, status);
      assert.equal(request.bodyUsed, false);
      assert.equal(h.databaseCalls(), 0);
      assert.equal(h.uploads.length, 0);
    }
  } finally { previous === undefined ? delete process.env.DASHBOARD_SECRET : process.env.DASHBOARD_SECRET = previous; }
});
test('authenticated valid audio retains the existing upload and queue behavior', async () => {
  const oldSecret = process.env.DASHBOARD_SECRET, oldToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.DASHBOARD_SECRET = 'unit-secret'; process.env.BLOB_READ_WRITE_TOKEN = 'unit-token';
  try {
    const form = new FormData(); form.set('id', 'job-1'); form.set('audio', new File(['audio'], 'clip.html', { type: 'audio/mpeg' }));
    const h = handler();
    const response = await h.post(new Request(url, { method: 'POST', headers: { authorization: basic, origin: new URL(url).origin }, body: form }));
    assert.equal(response.status, 200);
    assert.equal(h.uploads[0].path, 'job-1/voiceover.mp3');
    assert.equal(h.databaseCalls(), 3);
  } finally {
    oldSecret === undefined ? delete process.env.DASHBOARD_SECRET : process.env.DASHBOARD_SECRET = oldSecret;
    oldToken === undefined ? delete process.env.BLOB_READ_WRITE_TOKEN : process.env.BLOB_READ_WRITE_TOKEN = oldToken;
  }
});

test('inherited MIME names are rejected before database or blob access', async () => {
  const previous = process.env.DASHBOARD_SECRET;
  process.env.DASHBOARD_SECRET = 'unit-secret';
  try {
    for (const type of ['constructor', '__proto__']) {
      const form = new FormData(); form.set('id', 'job-1'); form.set('audio', new File(['audio'], 'clip.mp3', { type }));
      const h = handler();
      const response = await h.post(new Request(url, { method: 'POST', headers: { authorization: basic }, body: form }));
      assert.equal(response.status, 415);
      assert.equal(h.databaseCalls(), 0);
      assert.equal(h.uploads.length, 0);
    }
  } finally { previous === undefined ? delete process.env.DASHBOARD_SECRET : process.env.DASHBOARD_SECRET = previous; }
});
