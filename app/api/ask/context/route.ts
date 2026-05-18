import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { buildContextMarkdown, type AskWindow } from '@/lib/ask-context';

export const runtime = 'nodejs';

const WINDOWS: AskWindow[] = ['today', '7d', '30d'];

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json().catch(() => null)) as { window?: string } | null;
  const window = body?.window as AskWindow | undefined;
  if (!window || !WINDOWS.includes(window)) {
    return NextResponse.json({ error: 'window must be today | 7d | 30d' }, { status: 400 });
  }

  const md = await buildContextMarkdown(user.id, window);
  return NextResponse.json({ window, markdown: md });
}
