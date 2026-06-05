import OpenAI from 'openai';

let client: OpenAI | null = null;
export function openai() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return client;
}

const WHISPER_PRICE_PER_MIN = 0.006;

export function whisperCostUsd(audioSeconds: number): number {
  return (audioSeconds / 60) * WHISPER_PRICE_PER_MIN;
}

export class WhisperError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function transcribeAudio(
  blob: Blob,
  filename = 'audio.webm',
): Promise<{ text: string; durationSeconds: number | null }> {
  const file = new File([blob], filename, { type: blob.type || 'audio/webm' });
  // One retry on transient failures (rate-limit blips, transient 5xx).
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await openai().audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
      });
      return {
        text: result.text,
        durationSeconds:
          'duration' in result ? (result as { duration: number }).duration : null,
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const isTransient = status === 429 || (typeof status === 'number' && status >= 500);
      if (!isTransient || attempt === 1) break;
      // Short backoff before retrying.
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  // Normalize what we throw so the route can surface a useful message
  // instead of letting OpenAI's raw error become a generic 500.
  const e = lastErr as { status?: number; code?: string; message?: string } | null;
  const status = e?.status ?? 500;
  const code =
    e?.code ??
    (status === 429
      ? 'rate_limit'
      : status === 401
      ? 'invalid_api_key'
      : status === 413
      ? 'audio_too_large'
      : 'whisper_error');
  const message =
    e?.message ??
    (code === 'rate_limit'
      ? 'OpenAI Whisper rate limit hit. Wait a minute and try again.'
      : code === 'invalid_api_key'
      ? 'OpenAI API key rejected. Check OPENAI_API_KEY in Vercel.'
      : code === 'audio_too_large'
      ? 'Recording exceeds Whisper 25MB limit. Shorter clip.'
      : 'Transcription failed.');
  throw new WhisperError(message, status, code);
}
