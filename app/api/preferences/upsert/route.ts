import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { writePreferences } from '@/lib/writers';

export const runtime = 'nodejs';

interface Body {
  items?: Array<{
    key?: string;
    value_num?: number | null;
    value_text?: string | null;
    unit?: string | null;
    notes?: string | null;
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

  const body = (await req.json().catch(() => null)) as Body | null;
  const raw = Array.isArray(body?.items) ? body!.items : [];
  const items = raw
    .map((r) => ({
      key: typeof r?.key === 'string' ? r.key.trim() : '',
      value_num: typeof r?.value_num === 'number' ? r.value_num : null,
      value_text: typeof r?.value_text === 'string' && r.value_text.trim() ? r.value_text.trim() : null,
      unit: typeof r?.unit === 'string' && r.unit.trim() ? r.unit.trim() : null,
      notes: typeof r?.notes === 'string' ? r.notes : '',
    }))
    .filter((r) => r.key.length > 0);

  if (items.length === 0) {
    return NextResponse.json({ error: 'no valid items' }, { status: 400 });
  }

  const result = await writePreferences({
    userId: user.id,
    parsed: { items },
    source: 'manual',
  });
  return NextResponse.json(result);
}
