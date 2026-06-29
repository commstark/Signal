import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { extractLabDocument } from '@/lib/labs/extract';
import { writeLabExtraction } from '@/lib/labs/write';
import { recordUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Vercel hobby/pro request body limit is 4.5 MB by default. Lab PDFs are
// typically 200kB-3MB; if a user uploads something larger we surface a
// clear error rather than failing the multipart parse.
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function extFromMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

// POST /api/labs/upload (multipart form, field name 'file')
//
// Flow:
//   1. Upload file to private bucket `lab-uploads` under {user_id}/{upload_id}.{ext}
//   2. Create lab_uploads row with parse_status='pending'
//   3. Call Claude Sonnet to extract (PDF document blocks / image vision)
//   4. Write lab_panels + lab_analytes rows
//   5. Mark parse_status='ok' (or 'partial' / 'failed' on the way)
//
// Inline — typical extraction takes 5-15s, well inside maxDuration.
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file required (multipart field "file")' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file exceeds ${MAX_BYTES} bytes` },
      { status: 413 },
    );
  }
  const mime = file.type || 'application/pdf';
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `unsupported mime: ${mime}. Allowed: PDF, PNG, JPEG, WebP.` },
      { status: 400 },
    );
  }
  const source = mime === 'application/pdf' ? 'pdf' : 'image';
  const filename = file instanceof File ? file.name : undefined;

  const admin = createSupabaseAdmin();

  // 1. Insert lab_uploads with pending status to claim an ID. file_path
  //    references the storage key we're about to write.
  const ext = extFromMime(mime);
  const { data: upload, error: uErr } = await admin
    .from('lab_uploads')
    .insert({
      user_id: user.id,
      file_path: '',                    // backfilled below once we know the id
      mime,
      original_filename: filename ?? null,
      source,
      parse_status: 'pending',
    })
    .select('id')
    .single();
  if (uErr || !upload) {
    return NextResponse.json(
      { error: `lab_uploads insert: ${uErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }
  const uploadId = upload.id as string;
  const storageKey = `${user.id}/${uploadId}.${ext}`;

  // 2. Upload to storage. If this fails, mark the row failed and bail.
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: sErr } = await admin.storage
    .from('lab-uploads')
    .upload(storageKey, buf, { contentType: mime, upsert: false });
  if (sErr) {
    await admin
      .from('lab_uploads')
      .update({
        parse_status: 'failed',
        parse_warnings: [`storage upload failed: ${sErr.message}`],
      })
      .eq('id', uploadId);
    return NextResponse.json(
      { error: `storage upload: ${sErr.message}`, upload_id: uploadId },
      { status: 500 },
    );
  }
  await admin.from('lab_uploads').update({ file_path: storageKey }).eq('id', uploadId);

  // 3. Extract.
  const base64 = buf.toString('base64');
  let extraction;
  let usage;
  try {
    const res = await extractLabDocument({ base64, mime, source, filename });
    extraction = res.extraction;
    usage = res.usage;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('labs extract failed', err);
    await admin
      .from('lab_uploads')
      .update({
        parse_status: 'failed',
        parse_warnings: [`extraction failed: ${msg}`],
      })
      .eq('id', uploadId);
    return NextResponse.json(
      { error: `extraction: ${msg}`, upload_id: uploadId },
      { status: 502 },
    );
  }

  await recordUsage({
    userId: user.id,
    service: 'anthropic',
    model: usage.model,
    endpoint: 'labs-extract',
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.costUsd,
  });

  // 4. Write panels + analytes.
  const writeResult = await writeLabExtraction({
    userId: user.id,
    uploadId,
    extraction,
  });

  // 5. Final status.
  const warnings = [
    ...(extraction.warnings ?? []),
    ...writeResult.warnings,
  ];
  const parseStatus: 'ok' | 'partial' | 'failed' =
    writeResult.panels_written === 0
      ? 'failed'
      : writeResult.warnings.length > 0
      ? 'partial'
      : 'ok';

  await admin
    .from('lab_uploads')
    .update({
      parse_status: parseStatus,
      parse_warnings: warnings,
      raw_extraction: extraction,
      extraction_model: usage.model,
      extracted_at: new Date().toISOString(),
    })
    .eq('id', uploadId);

  return NextResponse.json({
    ok: parseStatus !== 'failed',
    upload_id: uploadId,
    parse_status: parseStatus,
    panels_written: writeResult.panels_written,
    analytes_written: writeResult.analytes_written,
    confidence: extraction.confidence,
    warnings,
  });
}
