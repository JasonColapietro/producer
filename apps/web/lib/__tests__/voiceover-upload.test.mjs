import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { readVoiceoverForm, voiceoverExtension, MAX_VOICEOVER_BODY_BYTES } = await loadTs(new URL('../voiceover-upload.ts', import.meta.url));
const { isSameOriginMutation } = await loadTs(new URL('../dashboard-auth.ts', import.meta.url));

test('valid audio upload keeps a safe extension independent of filename', async () => {
  const form = new FormData();
  form.set('id', 'job-1');
  form.set('audio', new File(['audio'], 'arbitrary.html', { type: 'audio/mpeg' }));
  const parsed = await readVoiceoverForm(new Request('https://producer.suedeai.ai/api/voiceover', { method: 'POST', body: form }));
  assert.equal(voiceoverExtension(parsed.get('audio')), 'mp3');
});
test('rejects non-audio and empty files', () => {
  for (const type of ['constructor', '__proto__']) {
    assert.throws(() => voiceoverExtension(new File(['audio'], 'clip.mp3', { type })), { status: 415 });
  }
  assert.throws(() => voiceoverExtension(new File(['html'], 'a.html', { type: 'text/html' })), { status: 415 });
  assert.throws(() => voiceoverExtension(new File([], 'a.wav', { type: 'audio/wav' })), { status: 413 });
});
test('rejects actual streamed bytes despite a false length before multipart parsing', async () => {
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
  const request = new Request('https://producer.suedeai.ai/api/voiceover', { method: 'POST', duplex: 'half', body, headers: { 'content-type': 'multipart/form-data; boundary=test', 'content-length': '1' } });
  await assert.rejects(readVoiceoverForm(request), { status: 413 });
  assert.equal(cancelled, true);
});
test('rejects an oversized declaration before reading', async () => {
  const request = new Request('https://producer.suedeai.ai/api/voiceover', { method: 'POST', body: 'x', headers: { 'content-length': String(MAX_VOICEOVER_BODY_BYTES + 1) } });
  await assert.rejects(readVoiceoverForm(request), { status: 413 });
});
test('same-origin browser writes and authenticated CLI clients are allowed; cross-site writes are not', () => {
  const req = headers => new Request('https://producer.suedeai.ai/api/voiceover', { method: 'POST', headers });
  assert.equal(isSameOriginMutation(req({ origin: 'https://producer.suedeai.ai' })), true);
  assert.equal(isSameOriginMutation(req({})), true);
  assert.equal(isSameOriginMutation(req({ origin: 'https://attacker.example' })), false);
  assert.equal(isSameOriginMutation(req({ origin: 'null' })), false);
  assert.equal(isSameOriginMutation(req({ 'sec-fetch-site': 'cross-site' })), false);
});
