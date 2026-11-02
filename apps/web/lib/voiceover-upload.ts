// Keep multipart overhead below Vercel's 4.5 MB function payload ceiling.
export const MAX_VOICEOVER_BYTES = 4 * 1024 * 1024;
export const MAX_VOICEOVER_BODY_BYTES = MAX_VOICEOVER_BYTES + 64 * 1024;
const EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/webm': 'webm',
};
export class UploadError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export function voiceoverExtension(file: File): string {
  if (file.size === 0 || file.size > MAX_VOICEOVER_BYTES) throw new UploadError('Audio must contain data and be at most 4 MiB', 413);
  const type = file.type.toLowerCase();
  const extension = Object.hasOwn(EXTENSIONS, type) ? EXTENSIONS[type] : undefined;
  if (!extension) throw new UploadError('Use an MP3, WAV, M4A, OGG, FLAC or WebM audio file', 415);
  return extension;
}
export async function readVoiceoverForm(request: Request): Promise<FormData> {
  const oversized = () => new UploadError('Voiceover upload is too large', 413);
  if (Number(request.headers.get('content-length')) > MAX_VOICEOVER_BODY_BYTES) throw oversized();
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) {
    throw new UploadError('multipart form body required', 400);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError('multipart form body required', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_VOICEOVER_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw oversized();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
  } catch { throw new UploadError('multipart form body required', 400); }
}
