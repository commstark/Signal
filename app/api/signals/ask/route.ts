import { NextRequest, NextResponse } from 'next/server';
import type { Anthropic } from '@anthropic-ai/sdk';
import { requireUser } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { anthropic, SONNET, estimateCostUsd } from '@/lib/anthropic';
import { recordUsage } from '@/lib/usage';
import {
  tool_query_metric,
  tool_compute_correlation,
  tool_list_recent_logs,
  tool_pull_intervention_window,
  tool_make_chart,
} from '@/lib/signals/tools';
import type { ChartSpec, RenderedChartData } from '@/lib/signals/spec';
import { METRIC_VALUES } from '@/lib/signals/spec';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TOOL_ROUNDS = 6;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'query_metric',
    description:
      'Pull a daily series of one metric over a window. Use this for any "how has X looked" or "what is X" question. Returns dates+values plus mean/sd/min/max.',
    input_schema: {
      type: 'object' as const,
      properties: {
        metric: { type: 'string' as const, enum: METRIC_VALUES as unknown as string[] },
        window_days: { type: 'integer' as const, enum: [7, 30, 60, 90] },
        lag_days: { type: 'integer' as const, minimum: 0, maximum: 7 },
      },
      required: ['metric', 'window_days'],
    },
  },
  {
    name: 'compute_correlation',
    description:
      'Pair two metrics and compute Pearson r. Optional lag on the second metric — lag_days: 1 = "does metric_a predict next-day metric_b?". Returns r, direction, and paired points.',
    input_schema: {
      type: 'object' as const,
      properties: {
        metric_a: { type: 'string' as const, enum: METRIC_VALUES as unknown as string[] },
        metric_b: { type: 'string' as const, enum: METRIC_VALUES as unknown as string[] },
        window_days: { type: 'integer' as const, enum: [7, 30, 60, 90] },
        lag_days: { type: 'integer' as const, minimum: 0, maximum: 7 },
      },
      required: ['metric_a', 'metric_b', 'window_days'],
    },
  },
  {
    name: 'list_recent_logs',
    description:
      'Pull the last N entries (raw transcripts) optionally filtered by intent. Use when the user asks "what did I have/log/say about X" or to fact-check a number.',
    input_schema: {
      type: 'object' as const,
      properties: {
        window_days: { type: 'integer' as const, enum: [7, 30, 60, 90] },
        intent: {
          type: 'string' as const,
          enum: ['health_log', 'workout_log', 'supplement_log', 'mixed'],
        },
        limit: { type: 'integer' as const, minimum: 1, maximum: 50 },
      },
      required: ['window_days'],
    },
  },
  {
    name: 'pull_intervention_window',
    description:
      'Pre vs post comparison around an intervention start_date. Returns pre/post means + sd + n + delta + pct_change for an outcome metric.',
    input_schema: {
      type: 'object' as const,
      properties: {
        intervention_name: { type: 'string' as const },
        outcome: { type: 'string' as const, enum: METRIC_VALUES as unknown as string[] },
        window_days: { type: 'integer' as const, minimum: 7, maximum: 60 },
      },
      required: ['intervention_name', 'outcome'],
    },
  },
  {
    name: 'make_chart',
    description:
      'Emit a chart spec for the client to render under your answer. Use for any visualization the user asked for or that would clearly aid the answer. ONLY call this when the user wants a visual; do not draw a chart for every question. Returns { ok: true } — keep narrating after.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kind: { type: 'string' as const, enum: ['line', 'bar', 'scatter', 'group_compare'] },
        title: { type: 'string' as const },
        caption: { type: 'string' as const },
        x: {
          type: 'object' as const,
          properties: {
            metric: { type: 'string' as const, enum: METRIC_VALUES as unknown as string[] },
            label: { type: 'string' as const },
          },
          required: ['metric'],
        },
        y: {
          type: 'object' as const,
          properties: {
            metric: { type: 'string' as const, enum: METRIC_VALUES as unknown as string[] },
            label: { type: 'string' as const },
          },
          required: ['metric'],
        },
        group_by: {
          type: 'string' as const,
          enum: ['day_of_week', 'workout_day', 'muscle_group', 'workout_type', 'intervention_phase'],
        },
        window_days: { type: 'integer' as const, enum: [7, 30, 60, 90] },
        lag_days: { type: 'integer' as const, minimum: 0, maximum: 7 },
        intervention_markers: { type: 'boolean' as const },
      },
      required: ['kind', 'title', 'x', 'y', 'window_days'],
    },
  },
];

const SYSTEM_PROMPT = `You answer questions about one user's personal health-tracking data.

CONTRACT
- NEVER state a number that didn't come back from a tool call. If you don't have the data, say so and stop. Don't invent.
- Prefer concrete and specific over hedge-y and general. "On the 12 leg-day days in the last 60d your mood averaged 7.2; on the 18 upper-body days it averaged 5.8." beats "Leg days seem to be better."
- One number per claim with its n. If n < 8, caveat ("only 4 days of data, treat as directional").
- Call tools to get any data you cite. The user can audit your tool calls.
- Emit make_chart when a chart would clearly help, but not for every question. If the answer is one sentence and a chart wouldn't add anything, skip it.
- Keep answers short. Usually 2-4 sentences + one chart if relevant.
- If the question is too vague ("how am I doing?"), ask back with 2-3 concrete clarifications instead of guessing.
- If a tool returns "not enough data", say so plainly. Don't pad.
- Never refer to "the user" — the user IS the reader. Use "you / your".`;

interface ReqBody {
  question: string;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  const body = (await req.json()) as ReqBody;
  const question = (body.question ?? '').trim();
  if (!question) {
    return NextResponse.json({ error: 'question required' }, { status: 400 });
  }

  const started = Date.now();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
  const chartSpecs: ChartSpec[] = [];
  const renderedCharts: RenderedChartData[] = [];
  const evidence: Array<{ tool: string; input: unknown; output: unknown }> = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCalls = 0;
  let answerText = '';
  let status: 'ok' | 'failed' = 'ok';

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic().messages.create({
        model: SONNET,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const toolUseBlocks = response.content.filter(
        (b): b is Extract<Anthropic.ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      const textBlocks = response.content.filter(
        (b): b is Extract<Anthropic.ContentBlock, { type: 'text' }> => b.type === 'text',
      );
      // Concatenate any text emitted this round; the LAST round's text is the
      // final answer, but mid-rounds may also include narration which we
      // overwrite below.
      const roundText = textBlocks.map((b) => b.text).join('\n').trim();
      if (roundText) answerText = roundText;

      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        break;
      }

      // Run all tool calls this round in parallel.
      const toolResults: ToolResultBlock[] = await Promise.all(
        toolUseBlocks.map(async (block) => {
          toolCalls += 1;
          try {
            const result = await runTool(
              user.id,
              block.name,
              block.input as Record<string, unknown>,
            );
            // For make_chart, capture the spec + rendered data and return
            // a minimal ack to the model.
            if (block.name === 'make_chart') {
              const rendered = result as RenderedChartData;
              chartSpecs.push(rendered.spec);
              renderedCharts.push(rendered);
              evidence.push({ tool: block.name, input: block.input, output: { ok: true, n: rendered.points.length } });
              return {
                type: 'tool_result' as const,
                tool_use_id: block.id,
                content: JSON.stringify({ ok: true }),
              };
            }
            evidence.push({ tool: block.name, input: block.input, output: result });
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'tool error';
            evidence.push({ tool: block.name, input: block.input, output: { error: msg } });
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: JSON.stringify({ error: msg }),
              is_error: true,
            };
          }
        }),
      );

      // Append the assistant turn and the tool results so the next round
      // sees the full conversation.
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    // Cost + usage.
    const costUsd = estimateCostUsd(SONNET, inputTokens, outputTokens);
    await recordUsage({
      userId: user.id,
      service: 'anthropic',
      model: SONNET,
      endpoint: 'signals-ask',
      inputTokens,
      outputTokens,
      costUsd,
    });

    // Persist the conversation.
    const sb = createSupabaseAdmin();
    const { data: row } = await sb
      .from('signals_chats')
      .insert({
        user_id: user.id,
        question,
        answer_text: answerText,
        chart_specs: chartSpecs,
        evidence,
        tool_calls: toolCalls,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        duration_ms: Date.now() - started,
        status,
      })
      .select('id, created_at')
      .single();

    return NextResponse.json({
      id: row?.id,
      created_at: row?.created_at,
      answer: answerText,
      charts: renderedCharts,
      cost_usd: costUsd,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    console.error('signals ask error', err);
    status = 'failed';
    const sb = createSupabaseAdmin();
    await sb.from('signals_chats').insert({
      user_id: user.id,
      question,
      answer_text: err instanceof Error ? err.message : 'failed',
      chart_specs: [],
      evidence,
      tool_calls: toolCalls,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: estimateCostUsd(SONNET, inputTokens, outputTokens),
      duration_ms: Date.now() - started,
      status,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed' },
      { status: 500 },
    );
  }
}

async function runTool(userId: string, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'query_metric':
      return tool_query_metric(userId, input as unknown as Parameters<typeof tool_query_metric>[1]);
    case 'compute_correlation':
      return tool_compute_correlation(
        userId,
        input as unknown as Parameters<typeof tool_compute_correlation>[1],
      );
    case 'list_recent_logs':
      return tool_list_recent_logs(
        userId,
        input as unknown as Parameters<typeof tool_list_recent_logs>[1],
      );
    case 'pull_intervention_window':
      return tool_pull_intervention_window(
        userId,
        input as unknown as Parameters<typeof tool_pull_intervention_window>[1],
      );
    case 'make_chart':
      return tool_make_chart(userId, input as unknown as ChartSpec);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
