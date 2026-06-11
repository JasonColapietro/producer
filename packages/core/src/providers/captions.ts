import { MODELS, type Creds } from "../config.js";
import { runReplicate } from "./replicate.js";

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(millis, 3)}`;
}

/** Transcribe an audio file and return burn-ready SRT subtitles. */
export async function transcribeToSrt(creds: Creds, audioUrl: string): Promise<string> {
  const out = (await runReplicate(creds.replicateApiToken, MODELS.whisper, {
    audio: audioUrl,
    model: "large-v3",
  })) as { segments?: WhisperSegment[] };

  const segments = out.segments ?? [];
  return segments
    .map((seg, i) => `${i + 1}\n${srtTime(seg.start)} --> ${srtTime(seg.end)}\n${seg.text.trim()}\n`)
    .join("\n");
}
