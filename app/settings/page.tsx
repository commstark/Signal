import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <main className="min-h-dvh p-4 max-w-xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-small text-ink-2 hover:text-ink">
          ← back
        </Link>
        <h1 className="text-h1 mt-2">settings</h1>
      </header>

      <dl className="space-y-4">
        <Row label="account">{user.email}</Row>
        <Row label="timezone">America/Los_Angeles</Row>
        <Row label="units">lb</Row>
        <Row label="version">0.1.0</Row>
      </dl>

      <p className="text-small text-ink-3 mt-10 font-mono">
        more settings arrive in phase 4.
      </p>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline border-b border-line pb-3">
      <dt className="text-small text-ink-2">{label}</dt>
      <dd className="text-body font-mono">{children}</dd>
    </div>
  );
}
