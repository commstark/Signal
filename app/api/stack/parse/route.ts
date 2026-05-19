import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { parseStack } from '@/lib/parse';
import { recordUsage } from '@/lib/usage';
import type { StackParsed } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json().catch(() => null)) as { transcript?: string } | null;
  const transcript = body?.transcript?.trim();
  if (!transcript) {
    return NextResponse.json({ error: 'transcript required' }, { status: 400 });
  }

  try {
    const { value, usage } = await parseStack(transcript);
    await recordUsage({
      userId: user.id,
      service: 'anthropic',
      model: usage.model,
      endpoint: 'parse-stack',
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
    });
    const parsed = value as StackParsed;
    return NextResponse.json({ items: parsed.items ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'parse failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
