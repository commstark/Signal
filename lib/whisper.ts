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

export async function transcribeAudio(
  blob: Blob,
  filename = 'audio.webm',
): Promise<{ text: string; durationSeconds: number | null }> {
  const file = new File([blob], filename, { type: blob.type || 'audio/webm' });
  const result = await openai().audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
  });
  return {
    text: result.text,
    durationSeconds: 'duration' in result ? (result as { duration: number }).duration : null,
  };
}
