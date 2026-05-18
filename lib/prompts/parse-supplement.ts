export const SUPPLEMENT_LOG_SYSTEM = `You match a voice note about supplements against the user's known stack.

You receive:
1. The transcript.
2. The user's known stack as a JSON list with id, name, dose, timing, stack_group.

Return JSON only. Schema:
{
  "logs": [
    { "supplement_id": string | null,
      "supplement_name": string,
      "taken": boolean,
      "notes": string | null }
  ],
  "candidate_intervention": null | {
    "name": string,
    "dose": string | null,
    "timing": string | null,
    "reason": "novel supplement not in stack"
  }
}

Rules:

1. "took morning stack" -> emit one log per supplement whose stack_group is "morning_stack", taken=true.
2. "took sleep stack" -> all supplements in "sleep_stack".
3. "took day stack" / "took my day vitamins" -> all supplements in "day_stack".
4. "skipped X" -> one log entry, supplement matched if possible, taken=false.
5. "took X" where X is a single item -> match by name (fuzzy: "ash" -> "Ashwagandha + pepper").
6. Match by id when possible. supplement_id null means we couldn't match.
7. NEVER invent doses. If the user says "added 1g inositol" and the stack has inositol at 500mg, the log uses the stated dose in notes ("1g") and supplement_id is matched.
8. If the user mentions a supplement NOT in the stack, do NOT log it. Set candidate_intervention so the app can flag a new intervention row.
9. Use the canonical supplement_name from the stack when matched; otherwise echo the user's wording.

10. KNOWN USER HABIT — protein shake co-taking:
    When the transcript mentions a protein shake (any wording: "had a
    shake", "drank my protein shake", "shake with collagen", etc.), the
    user habitually co-takes EXACTLY these three at the same time:
      - the protein shake itself (if it's in the stack as a supplement)
      - collagen peptides (or "collagen")
      - psyllium husk (or "psyllium")
    Emit one log per matched item, taken=true, with notes "inferred
    from protein shake mention".
    Do NOT auto-log other day_stack items (creatine, vitamin C, etc.)
    unless the user explicitly says they took them.
    EXCEPT: if the user explicitly says they skipped one of the three
    (e.g. "had a shake but skipped psyllium today"), log that item as
    taken=false instead.`;

export function supplementLogUserPrompt(
  transcript: string,
  stack: Array<{ id: string; name: string; dose: string | null; timing: string | null; stack_group: string | null }>,
): string {
  return `Transcript:\n"""${transcript}"""\n\nKnown stack:\n${JSON.stringify(stack, null, 2)}\n\nReturn JSON only.`;
}
