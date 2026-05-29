import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getPersonasForUser } from '@/lib/personas';
import { AskForm } from '@/components/AskForm';

export const dynamic = 'force-dynamic';

export default async function AskPage() {
  const user = await requireUser();
  const personas = await getPersonasForUser(user.id);

  return (
    <main className="min-h-dvh pb-8">
      <header className="px-4 py-4 flex items-baseline justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-ink-2 hover:text-ink" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-h2">Ask</h1>
            <p className="text-small text-ink-2">
              Copy a prompt with your data into ChatGPT / Claude.
            </p>
          </div>
        </div>
        <Link href="/today" className="text-small text-ink-2 hover:text-ink font-mono">
          Today
        </Link>
      </header>

      <section className="px-4 max-w-2xl mx-auto">
        <AskForm personas={personas} />
      </section>
    </main>
  );
}
