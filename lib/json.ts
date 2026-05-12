// Robust JSON extraction from an LLM response. Handles bare JSON,
// fenced code blocks, and stray prose around a JSON object.
export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim();

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) {
    return JSON.parse(fenced[1]) as T;
  }

  const firstBrace = trimmed.search(/[\[{]/);
  if (firstBrace >= 0) {
    const sliced = trimmed.slice(firstBrace);
    try {
      return JSON.parse(sliced) as T;
    } catch {
      // Try to locate the matching closing brace.
      const lastBrace = Math.max(sliced.lastIndexOf('}'), sliced.lastIndexOf(']'));
      if (lastBrace > 0) {
        return JSON.parse(sliced.slice(0, lastBrace + 1)) as T;
      }
    }
  }

  return JSON.parse(trimmed) as T;
}
