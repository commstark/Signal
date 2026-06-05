import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { transcribeAudio, whisperCostUsd, WhisperError } from '@/lib/whisper';
import { recordUsage } from '@/lib/usage';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const form = await req.formData();
  const file = form.get('audio');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'audio blob required' }, { status: 400 });
  }

  let text: string;
  let durationSeconds: number | null;
  try {
    const out = await transcribeAudio(file);
    text = out.text;
    durationSeconds = out.durationSeconds;
  } catch (err) {
    if (err instanceof WhisperError) {
      console.error(
        `whisper failed: status=${err.status} code=${err.code} msg=${err.message}`,
      );
      // Surface the real reason to the client so the orange dot label
      // says e.g. "rate limit" instead of just "500".
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error('whisper unknown error', err);
    return NextResponse.json({ error: 'Transcription failed.' }, { status: 502 });
  }

  const audioSeconds = durationSeconds ?? estimateDurationFromBytes(file.size);
  const costUsd = whisperCostUsd(audioSeconds);

  // Upload the raw audio for 30-day retention.
  const admin = createSupabaseAdmin();
  const audioKey = `${user.id}/${Date.now()}.${extFromMime(file.type)}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from('audio')
    .upload(audioKey, buf, { contentType: file.type || 'audio/webm', upsert: false });
  if (uploadErr) {
    console.error('audio upload failed', uploadErr);
  }

  await recordUsage({
    userId: user.id,
    service: 'whisper',
    model: 'whisper-1',
    audioSeconds,
    costUsd,
  });

  return NextResponse.json({
    transcript: text,
    audio_url: uploadErr ? null : audioKey,
    audio_duration_s: audioSeconds,
  });
}

function extFromMime(mime: string): string {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

// Fallback only — Whisper verbose_json normally returns duration.
function estimateDurationFromBytes(bytes: number): number {
  // ~24kbps opus at 16k mono is the typical iOS Safari MediaRecorder default
  return bytes / (24_000 / 8);
}
