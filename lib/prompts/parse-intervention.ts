export const INTERVENTION_SYSTEM = `You extract structured intervention data from a voice note where the user is starting or stopping something.

Return JSON only. Schema:
{
  "name": string,                  // e.g. "Inositol 500mg with breakfast"
  "type": "supplement" | "food" | "behavior" | "exercise" | "other",
  "direction": "start" | "stop" | "change",
  "expected_window_days": number,  // default 21 if unspecified
  "notes": string | null
}

Rules:
1. The name should be the most useful display string: include dose + timing if stated.
2. type: "supplement" for pills/powders, "food" for dietary changes ("cutting added sugar"),
   "behavior" for lifestyle ("no screens after 10pm"), "exercise" for routine changes.
3. direction follows the user's verb: "starting/adding/trying" -> start; "stopping/quitting/off" -> stop;
   "switching from X to Y" -> change.
4. expected_window_days: if user says "trying for a month" use 30; "two weeks" use 14; default 21.
5. Use null for unknowns, not guesses.`;

export function interventionUserPrompt(transcript: string, direction: 'start' | 'stop'): string {
  return `Transcript:\n"""${transcript}"""\n\nIntent direction: ${direction}\n\nReturn JSON only.`;
}
