import Anthropic from '@anthropic-ai/sdk';

export const HAIKU = 'claude-haiku-4-5-20251001';
export const SONNET = 'claude-sonnet-4-6';

let client: Anthropic | null = null;
export function anthropic() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return client;
}

// Per-1M-token pricing snapshot used for api_usage rows.
// Reference numbers — adjust here if Anthropic publishes changes.
const PRICE_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  [HAIKU]: { input: 1, output: 5 },
  [SONNET]: { input: 3, output: 15 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICE_PER_M_TOKENS[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
