import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { writeStack } from '@/lib/writers';

export const runtime = 'nodejs';

interface CommitBody {
  items?: Array<{
    name?: string;
    dose?: string | null;
    timing?: string | null;
    stack_group?: string | null;
  }>;
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json().catch(() => null)) as CommitBody | null;
  const raw = Array.isArray(body?.items) ? body!.items : [];
  const items = raw
    .map((r) => ({
      name: typeof r?.name === 'string' ? r.name.trim() : '',
      dose: typeof r?.dose === 'string' && r.dose.trim() ? r.dose.trim() : null,
      timing: typeof r?.timing === 'string' && r.timing.trim() ? r.timing.trim() : null,
      stack_group:
        typeof r?.stack_group === 'string' && r.stack_group.trim() ? r.stack_group.trim() : null,
    }))
    .filter((r) => r.name.length > 0);

  if (items.length === 0) {
    return NextResponse.json({ error: 'no valid items' }, { status: 400 });
  }

  const result = await writeStack({ userId: user.id, items });
  return NextResponse.json(result);
}
