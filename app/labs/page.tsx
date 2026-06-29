import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { LabUploadForm } from '@/components/LabUploadForm';

export const dynamic = 'force-dynamic';

interface UploadRow {
  id: string;
  created_at: string;
  original_filename: string | null;
  source: string;
  parse_status: 'pending' | 'ok' | 'partial' | 'failed';
  parse_warnings: string[] | null;
  panel_count: number;
  analyte_count: number;
}

export default async function LabsPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect('/login');
  }

  const sb = createSupabaseAdmin();
  const { data: uploadsData } = await sb
    .from('lab_uploads')
    .select('id, created_at, original_filename, source, parse_status, parse_warnings')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const uploads = (uploadsData ?? []) as Omit<UploadRow, 'panel_count' | 'analyte_count'>[];
  const uploadIds = uploads.map((u) => u.id);

  // Per-upload panel + analyte counts in two cheap aggregates so the list
  // can show "3 panels · 87 analytes" without N+1 queries.
  const panelCounts = new Map<string, number>();
  const analyteCountsByPanel = new Map<string, number>();
  let panels: Array<{ id: string; upload_id: string }> = [];
  if (uploadIds.length) {
    const { data: panelRows } = await sb
      .from('lab_panels')
      .select('id, upload_id')
      .in('upload_id', uploadIds);
    panels = (panelRows ?? []) as Array<{ id: string; upload_id: string }>;
    for (const p of panels) {
      panelCounts.set(p.upload_id, (panelCounts.get(p.upload_id) ?? 0) + 1);
    }
    const panelIds = panels.map((p) => p.id);
    if (panelIds.length) {
      const { data: analyteRows } = await sb
        .from('lab_analytes')
        .select('panel_id')
        .in('panel_id', panelIds);
      for (const a of (analyteRows ?? []) as Array<{ panel_id: string }>) {
        analyteCountsByPanel.set(a.panel_id, (analyteCountsByPanel.get(a.panel_id) ?? 0) + 1);
      }
    }
  }

  const rows: UploadRow[] = uploads.map((u) => {
    const panelIds = panels.filter((p) => p.upload_id === u.id).map((p) => p.id);
    const analyteCount = panelIds.reduce(
      (acc, id) => acc + (analyteCountsByPanel.get(id) ?? 0),
      0,
    );
    return {
      ...u,
      panel_count: panelCounts.get(u.id) ?? 0,
      analyte_count: analyteCount,
    };
  });

  return (
    <main className="min-h-dvh pb-12">
      <header className="px-4 py-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-h2">Labs</h1>
          <p className="text-small text-ink-2 font-mono">
            Upload a PDF or screenshot · Sonnet extracts every analyte
          </p>
        </div>
        <div className="flex items-baseline gap-4">
          <Link href="/today" className="text-small text-ink-2 hover:text-ink font-mono">
            Today
          </Link>
          <Link href="/settings" className="text-small text-ink-2 hover:text-ink font-mono">
            Settings
          </Link>
        </div>
      </header>

      <section className="px-4 mt-2">
        <LabUploadForm />
      </section>

      <section className="px-4 mt-8">
        <h2 className="text-h3 mb-3">Uploads</h2>
        {rows.length === 0 ? (
          <p className="text-body text-ink-2">
            Nothing yet. Upload a blood panel, NewAlth report, or DEXA scan above.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="border border-line rounded-xl p-4 bg-surface shadow-soft-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-body truncate">
                      {r.original_filename ?? `${r.source} upload`}
                    </div>
                    <div className="text-micro font-mono text-ink-3">
                      {formatDate(r.created_at)} · {r.source}
                    </div>
                  </div>
                  <div className="text-micro font-mono text-right shrink-0">
                    <div className={statusClass(r.parse_status)}>
                      {r.parse_status}
                    </div>
                    {r.parse_status !== 'failed' && r.parse_status !== 'pending' && (
                      <div className="text-ink-3 mt-0.5">
                        {r.panel_count} panel{r.panel_count === 1 ? '' : 's'} ·{' '}
                        {r.analyte_count} analyte{r.analyte_count === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                </div>
                {r.parse_warnings && r.parse_warnings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {r.parse_warnings.map((w, i) => (
                      <li key={i} className="text-micro font-mono text-ink-3">
                        · {w}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2">
                  <Link
                    href={`/labs/${r.id}`}
                    className="text-micro font-mono text-ink-2 hover:text-ink underline underline-offset-2"
                  >
                    View extraction →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function statusClass(s: UploadRow['parse_status']): string {
  switch (s) {
    case 'ok':
      return 'text-signal-green';
    case 'pending':
      return 'text-signal-orange';
    case 'partial':
      return 'text-yellow-600';
    case 'failed':
      return 'text-signal-red';
  }
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
