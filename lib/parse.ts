import { anthropic, HAIKU, estimateCostUsd } from './anthropic';
import { extractJson } from './json';
import { INTENT_SYSTEM, intentUserPrompt, type Intent } from './prompts/intent';
import { HEALTH_LOG_SYSTEM, healthLogUserPrompt } from './prompts/parse-health';
import { WORKOUT_LOG_SYSTEM, workoutLogUserPrompt } from './prompts/parse-workout';
import { SUPPLEMENT_LOG_SYSTEM, supplementLogUserPrompt } from './prompts/parse-supplement';
import { INTERVENTION_SYSTEM, interventionUserPrompt } from './prompts/parse-intervention';

export interface ParseUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface IntentResult {
  intent: Intent;
  reasoning: string;
  usage: ParseUsage;
}

interface CallOpts {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}

async function callHaiku<T>(opts: CallOpts): Promise<{ value: T; usage: ParseUsage }> {
  const model = opts.model ?? HAIKU;
  const response = await anthropic().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });

  const text = response.content
    .map((c) => (c.type === 'text' ? c.text : ''))
    .join('\n');

  const value = extractJson<T>(text);
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  return {
    value,
    usage: {
      model,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(model, inputTokens, outputTokens),
    },
  };
}

export async function classifyIntent(transcript: string): Promise<IntentResult> {
  const { value, usage } = await callHaiku<{ intent: Intent; reasoning: string }>({
    system: INTENT_SYSTEM,
    user: intentUserPrompt(transcript),
    maxTokens: 128,
  });
  return { intent: value.intent, reasoning: value.reasoning, usage };
}

export async function parseHealthLog(transcript: string, occurredAtIso: string) {
  return callHaiku({
    system: HEALTH_LOG_SYSTEM,
    user: healthLogUserPrompt(transcript, occurredAtIso),
    maxTokens: 1024,
  });
}

export async function parseWorkoutLog(transcript: string, occurredAtIso: string) {
  return callHaiku({
    system: WORKOUT_LOG_SYSTEM,
    user: workoutLogUserPrompt(transcript, occurredAtIso),
    // Long sessions with many exercises/sets blow past 1k tokens of JSON.
    maxTokens: 4096,
  });
}

export async function parseSupplementLog(
  transcript: string,
  stack: Array<{ id: string; name: string; dose: string | null; timing: string | null; stack_group: string | null }>,
) {
  return callHaiku({
    system: SUPPLEMENT_LOG_SYSTEM,
    user: supplementLogUserPrompt(transcript, stack),
    maxTokens: 1024,
  });
}

export async function parseIntervention(transcript: string, direction: 'start' | 'stop') {
  return callHaiku({
    system: INTERVENTION_SYSTEM,
    user: interventionUserPrompt(transcript, direction),
    maxTokens: 512,
  });
}
