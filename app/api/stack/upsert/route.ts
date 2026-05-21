import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

interface Body {
  id?: string;
  name?: string;
  dose?: string | null;
  timing?: string | null;
  stack_group?: string | null;
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
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const patch = {
    name,
    dose: typeof body?.dose === 'string' && body.dose.trim() ? body.dose.trim() : null,
    timing: typeof body?.timing === 'string' && body.timing.trim() ? body.timing.trim() : null,
    stack_group:
      typeof body?.stack_group === 'string' && body.stack_group.trim()
        ? body.stack_group.trim()
        : null,
  };

  const admin = createSupabaseAdmin();

  if (body?.id) {
    const { error } = await admin
      .from('supplements')
      .update(patch)
      .eq('id', body.id)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, mode: 'update' });
  }

  // Dedupe on name (case-insensitive) before inserting — manual "+ add"
  // shouldn't create a duplicate row when the user re-adds an existing
  // supplement.
  const { data: existing, error: lookupErr } = await admin
    .from('supplements')
    .select('id')
    .eq('user_id', user.id)
    .ilike('name', name)
    .limit(1);
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (existing && existing[0]) {
    const { error } = await admin
      .from('supplements')
      .update({ ...patch, active: true })
      .eq('id', existing[0].id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, mode: 'update', deduped: true });
  }

  const { error } = await admin.from('supplements').insert({
    user_id: user.id,
    ...patch,
    is_stack: true,
    active: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mode: 'insert' });
}
