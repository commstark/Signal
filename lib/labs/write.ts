import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { LabExtraction } from './types';

const VALID_PANEL_TYPES = new Set([
  'blood',
  'lipid',
  'thyroid',
  'cbc',
  'metabolic_panel',
  'hormones',
  'micronutrients',
  'inflammation',
  'gut_microbiome',
  'dexa',
  'inbody',
  'other',
]);

const VALID_FLAGS = new Set(['H', 'L', 'HH', 'LL', 'abnormal']);

function clampDate(s: string | null): string | null {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function clampNumeric(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export interface WriteLabResult {
  panels_written: number;
  analytes_written: number;
  warnings: string[];
}

// Idempotency: callers either write into a fresh upload (no prior panels)
// or re-extract an existing upload — for re-extract, deleting the prior
// panel rows is the caller's job before invoking this. We keep this
// function single-purpose: insert what extraction returned.
export async function writeLabExtraction(args: {
  userId: string;
  uploadId: string;
  extraction: LabExtraction;
}): Promise<WriteLabResult> {
  const sb = createSupabaseAdmin();
  const warnings: string[] = [];
  let panelsWritten = 0;
  let analytesWritten = 0;

  for (const p of args.extraction.panels ?? []) {
    const panelType =
      p.panel_type && VALID_PANEL_TYPES.has(p.panel_type) ? p.panel_type : null;

    const { data: panel, error: pErr } = await sb
      .from('lab_panels')
      .insert({
        upload_id: args.uploadId,
        user_id: args.userId,
        panel_date: clampDate(p.panel_date),
        panel_type: panelType,
        provider: p.provider ?? null,
        lab_name: p.lab_name ?? null,
      })
      .select('id')
      .single();

    if (pErr || !panel) {
      warnings.push(`lab_panels insert failed: ${pErr?.message ?? 'unknown'}`);
      continue;
    }
    panelsWritten += 1;

    const rows = (p.analytes ?? [])
      .filter((a) => typeof a.name_raw === 'string' && a.name_raw.trim())
      .map((a) => ({
        panel_id: panel.id,
        user_id: args.userId,
        name_raw: a.name_raw.trim(),
        value_num: clampNumeric(a.value_num),
        value_text: a.value_text ?? null,
        unit: a.unit ?? null,
        ref_low: clampNumeric(a.ref_low),
        ref_high: clampNumeric(a.ref_high),
        ref_text: a.ref_text ?? null,
        flag: a.flag && VALID_FLAGS.has(a.flag) ? a.flag : null,
        notes: a.notes ?? null,
      }));

    if (rows.length === 0) continue;
    const { error: aErr } = await sb.from('lab_analytes').insert(rows);
    if (aErr) {
      warnings.push(`lab_analytes insert failed: ${aErr.message}`);
      continue;
    }
    analytesWritten += rows.length;
  }

  return { panels_written: panelsWritten, analytes_written: analytesWritten, warnings };
}
