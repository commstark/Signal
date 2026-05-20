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
    Trigger CONDITIONS (ALL must hold):
      a. The literal word "shake" appears in the transcript (also accept
         "smoothie" or "blend" if it clearly refers to a protein drink).
      b. The context is the user reporting they DRANK / HAD / MADE one.
      c. The transcript is logging supplement intake (intent supplement_log
         or mixed) — not a generic food log that happens to mention shake.
    Bare "protein" is NOT a trigger. Things that LOOK like protein but
    are food, NOT shakes, MUST be ignored by this rule:
      - "protein wrap" / "protein tortilla"
      - "protein bar" / "protein cookie" / "protein cereal"
      - "protein pancake" / "protein oats"
      - "protein powder" used in baking (e.g. "added protein powder to
        my pancakes")
    When all trigger conditions hold, the user habitually co-takes
    EXACTLY these three at the same time:
      - the protein shake itself (if it's in the stack as a supplement)
      - collagen peptides (or "collagen")
      - psyllium husk (or "psyllium")
    Emit one log per matched item, taken=true, with notes "inferred
    from protein shake mention".
    Do NOT auto-log other day_stack items (creatine, vitamin C, etc.)
    unless the user explicitly says they took them.
    EXCEPT: if the user explicitly says they skipped one of the three
    (e.g. "had a shake but skipped psyllium today"), log that item as
    taken=false instead.

11. WHEN UNSURE, DON'T LOG. If the transcript is ambiguous about whether
    the user took anything (e.g. you found 'protein' but not 'shake'),
    return logs: []. Auto-logging items the user didn't take is worse
    than missing some they did — they can re-record more clearly.`;

export function supplementLogUserPrompt(
  transcript: string,
  stack: Array<{ id: string; name: string; dose: string | null; timing: string | null; stack_group: string | null }>,
  calibrations?: {
    [key: string]: { value_num: number | null; value_text: string | null; unit: string | null; notes: string | null };
  },
): string {
  const calibBlock = renderCalibrations(calibrations);
  return `${calibBlock}Transcript:\n"""${transcript}"""\n\nKnown stack:\n${JSON.stringify(stack, null, 2)}\n\nReturn JSON only.`;
}

function renderCalibrations(
  calibrations?: {
    [key: string]: { value_num: number | null; value_text: string | null; unit: string | null; notes: string | null };
  },
): string {
  if (!calibrations) return '';
  const entries = Object.entries(calibrations);
  if (entries.length === 0) return '';
  const lines = entries
    .map(([key, v]) => {
      const label = v.notes?.trim() || key;
      if (v.value_num != null) return `  ${label} = ${v.value_num}${v.unit ? ' ' + v.unit : ''}`;
      if (v.value_text) return `  ${label} = ${v.value_text}`;
      return null;
    })
    .filter((l): l is string => l !== null);
  if (lines.length === 0) return '';
  return `USER CALIBRATIONS (per-user dose overrides — apply when the stack item matches):\n${lines.join('\n')}\n\n`;
}
