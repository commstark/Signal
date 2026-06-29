import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Panel {
  id: string;
  panel_date: string | null;
  panel_type: string | null;
  provider: string | null;
  lab_name: string | null;
}

interface Analyte {
  id: string;
  panel_id: string;
  name_raw: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  flag: string | null;
  notes: string | null;
}

export default async function LabUploadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect('/login');
  }

  const sb = createSupabaseAdmin();
  const { data: upload } = await sb
    .from('lab_uploads')
    .select(
      'id, created_at, original_filename, source, mime, parse_status, parse_warnings, extraction_model, extracted_at',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!upload) notFound();

  const { data: panelsData } = await sb
    .from('lab_panels')
    .select('id, panel_date, panel_type, provider, lab_name')
    .eq('upload_id', id)
    .eq('user_id', user.id)
    .order('panel_date', { ascending: false, nullsFirst: false });

  const panels = (panelsData ?? []) as Panel[];
  const panelIds = panels.map((p) => p.id);

  const analytesByPanel = new Map<string, Analyte[]>();
  if (panelIds.length) {
    const { data: analytesData } = await sb
      .from('lab_analytes')
      .select(
        'id, panel_id, name_raw, value_num, value_text, unit, ref_low, ref_high, ref_text, flag, notes',
      )
      .in('panel_id', panelIds)
      .order('name_raw', { ascending: true });
    for (const a of (analytesData ?? []) as Analyte[]) {
      const arr = analytesByPanel.get(a.panel_id) ?? [];
      arr.push(a);
      analytesByPanel.set(a.panel_id, arr);
    }
  }

  return (
    <main className="min-h-dvh pb-12">
      <header className="px-4 py-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-h2">
            {upload.original_filename ?? `${upload.source} upload`}
          </h1>
          <p className="text-small text-ink-2 font-mono">
            {formatDate(upload.created_at)} · {upload.source} ·{' '}
            <span className={statusClass(upload.parse_status)}>{upload.parse_status}</span>
            {upload.extraction_model && ` · ${upload.extraction_model}`}
          </p>
        </div>
        <Link href="/labs" className="text-small text-ink-2 hover:text-ink font-mono">
          ← Labs
        </Link>
      </header>

      {upload.parse_warnings && upload.parse_warnings.length > 0 && (
        <section className="px-4 mt-2">
          <ul className="text-micro font-mono text-ink-3 space-y-0.5">
            {upload.parse_warnings.map((w: string, i: number) => (
              <li key={i}>· {w}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="px-4 mt-6">
        {panels.length === 0 ? (
          <p className="text-body text-ink-2">
            {upload.parse_status === 'pending'
              ? 'Extraction still running.'
              : 'No panels extracted.'}
          </p>
        ) : (
          <div className="space-y-8">
            {panels.map((p) => {
              const analytes = analytesByPanel.get(p.id) ?? [];
              return (
                <div key={p.id}>
                  <div className="mb-3">
                    <h2 className="text-h3">
                      {p.lab_name ?? p.panel_type ?? 'Panel'}
                    </h2>
                    <p className="text-micro font-mono text-ink-3">
                      {p.panel_date ?? 'date unknown'}
                      {p.provider && ` · ${p.provider}`}
                      {p.panel_type && ` · ${p.panel_type}`}
                    </p>
                  </div>
                  {analytes.length === 0 ? (
                    <p className="text-small text-ink-2">No analytes.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-small">
                        <thead>
                          <tr className="text-ink-3 text-micro font-mono uppercase tracking-wide text-left">
                            <th className="py-1 pr-4">Name</th>
                            <th className="py-1 pr-4 text-right">Value</th>
                            <th className="py-1 pr-4">Unit</th>
                            <th className="py-1 pr-4">Ref range</th>
                            <th className="py-1">Flag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytes.map((a) => (
                            <tr key={a.id} className="border-t border-line">
                              <td className="py-1 pr-4">{a.name_raw}</td>
                              <td className="py-1 pr-4 text-right font-mono tabular-nums">
                                {a.value_num != null
                                  ? a.value_num
                                  : a.value_text ?? '—'}
                              </td>
                              <td className="py-1 pr-4 text-ink-2 font-mono">
                                {a.unit ?? ''}
                              </td>
                              <td className="py-1 pr-4 text-ink-2 font-mono">
                                {formatRef(a)}
                              </td>
                              <td className="py-1 font-mono">
                                {a.flag ? (
                                  <span className={flagClass(a.flag)}>{a.flag}</span>
                                ) : (
                                  ''
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function statusClass(s: string): string {
  switch (s) {
    case 'ok':
      return 'text-signal-green';
    case 'pending':
      return 'text-signal-orange';
    case 'partial':
      return 'text-yellow-600';
    case 'failed':
      return 'text-signal-red';
    default:
      return '';
  }
}

function flagClass(f: string): string {
  switch (f) {
    case 'H':
    case 'HH':
      return 'text-signal-red';
    case 'L':
    case 'LL':
      return 'text-signal-orange';
    default:
      return 'text-yellow-600';
  }
}

function formatRef(a: Analyte): string {
  if (a.ref_text) return a.ref_text;
  if (a.ref_low != null && a.ref_high != null) return `${a.ref_low}–${a.ref_high}`;
  if (a.ref_low != null) return `>${a.ref_low}`;
  if (a.ref_high != null) return `<${a.ref_high}`;
  return '';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}
