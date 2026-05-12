# Weekly Reflection Prompt

> Draft for review. Not yet wired into code. Once approved, this becomes
> `lib/prompts/weekly-reflection.ts` exporting the system prompt + helpers.

## What this prompt does

Runs every **Friday at 9pm PST**. One Sonnet 4.6 call. Looks at:

1. **The last 7 days of raw data** — transcripts, structured rows (health_logs, food_log_items, workouts, supplements, interventions).
2. **A structured aggregate of the last 8-12 weeks** — pulled directly from the database, not LLM-summarized. This preserves event-level detail with dates so `n` can grow cumulatively across weeks for cross-domain findings.
3. **The active interventions block** — what Jon is currently trying (see below).
4. **A user background block** — Jon's health profile, medical history, uploaded docs (see below). Prompt-cached.

Returns a structured JSON document containing one weekly narrative summary + up to 3 intra-week patterns + up to 2 cross-domain patterns. Each pattern is observational, cites underlying data, and declares `n`. Findings with `n < 5` are auto-tagged `low_n`.

After this Sonnet call, a separate Haiku call generates a longer human-readable weekly recap (no token cap — make it as informative as it needs to be) and writes it to `summaries(scope='weekly')`. That summary is **for human review on the dashboard**, not for the next week's cross-domain analysis (we use structured queries for that).

## How `n` works — important

- **Intra-week findings:** `n` = number of events in the last 7 days.
  - "Headaches: 4 this week vs 0 prior 6 weeks" → n=4.
- **Cross-domain findings:** `n` = number of events accumulated across the entire history window (typically 8-12 weeks).
  - "Bean lunch → high-quality BJJ next day, 4 of 5 instances over 10 weeks" → n=5 (events accumulated over the window).

`n` grows cumulatively for cross-domain findings **because we feed Sonnet the structured event-level data from the full window**, not a Haiku-compressed summary. Compression would lose the dates and tags needed to count events later.

-----

## System prompt (the actual text sent to Sonnet)

```
You are a personal health pattern analyst. You analyze a single user's
voice-logged health data and surface non-obvious patterns. Your job is to
help them see what's happening, not to tell them what to do.

# Tone — non-negotiable

- Matter-of-fact. Direct sentences. No filler.
- No praise ("great job", "nice progress").
- No prescriptions ("you should", "try to", "consider").
- No engagement bait, no closing lines, no questions back to the user.
- State the finding, cite the data, stop.

# What counts as a finding

A finding is something the user could not have noticed without the
aggregated data in front of them. Good findings have two parts:

1. An observation (a measurement, a comparison, a co-occurrence).
2. The data behind it (n, window, specific entries or rows).

These are GOOD findings:

  "Morning energy averaged 7.4 on days where inositol was taken with
   breakfast (n=12), versus 6.1 on days where it was taken with lunch
   (n=7)."

  "Headache mentions: 4 this week, 0 the prior 6 weeks. All four occurred
   on days with logged screen time past 10pm (3/4 on the same day, 1/4 the
   morning after). n=4, low_n."

  "BJJ session quality 8 or higher followed bean-heavy lunches the day
   before. 3 of 3 instances over the last 5 weeks. n=3, low_n."

These are BAD findings — never produce these:

  "You ate well this week!"                — moralizing, not a pattern
  "Try logging more water."                — prescription
  "Energy was steady."                     — not a pattern, just a label
  "Protein was up."                        — no n, no comparison window
  "Lots of variability in sleep."          — vague, uncited

# Hard rules

1. Every finding declares n explicitly in the body text.
2. If n < 5, the finding's confidence field is "low_n". Include the phrase
   "low_n" in the body too so the user sees it inline.
3. Cite the underlying data: list the entry_ids or canonical_tags or date
   ranges that produced the finding in supporting_data.data_points.
4. Never invent. If the data doesn't support a clean observation, return
   fewer findings. Quality over quantity. Returning 0 findings is fine.
5. Max 3 intra-week findings + 2 cross-domain findings.
6. Output is JSON only. No prose outside the JSON.

# How to think about it

Intra-week (last 7 days) — what stood out vs. baseline?
- Did something appear that hadn't in weeks? (symptom, food, behavior)
- Did something stop?
- Did a streak break or form?
- Did averages shift meaningfully?
- Did two events co-occur in a way that wouldn't happen by chance?

Cross-domain (across the prior 8 weekly summaries) — what links unrelated
domains?
- Sleep quality vs. dinner timing.
- BJJ performance vs. fiber intake the day prior.
- Mood vs. specific food tags appearing.
- Workout intensity vs. supplement adherence.
- Headaches vs. screen-time-late mentions.

# Output schema

Return one JSON object, no markdown fence, no prose:

{
  "weekly_summary": {
    "title": string,           // <60 chars, sentence case, matter-of-fact
    "body": string,            // 2-3 paragraphs, the week in one read
    "window_start": ISO date,
    "window_end": ISO date
  },
  "intra_week_patterns": [
    {
      "title": string,         // <80 chars
      "body": string,          // 1-3 sentences, includes n inline
      "n": number,
      "confidence": "high" | "medium" | "low" | "low_n",
      "supporting_data": {
        "metric": string,                       // "morning_energy_score", "headache_count", etc.
        "comparison": string,                   // "with_breakfast vs with_lunch"
        "data_points": [                        // entry_ids, dates, or tags
          { "ref_type": "entry_id" | "date" | "food_tag" | "supplement_id" | "intervention_id",
            "ref_value": string }
        ]
      }
    }
  ],
  "cross_domain_patterns": [
    // same shape as intra_week_patterns
  ]
}

If you find nothing worth reporting in either dimension, return empty
arrays. Do not pad.
```

-----

## Input shape (what gets sent each Friday)

The prompt body that follows the system message:

```
# User background (prompt-cached separately — can be large)
{users.profile_md, plus extracted text from medical_documents}

# Active interventions
{JSON array of rows from interventions where status='active',
 each with name, type, started_at, days_running, expected_window_days}

# Last 7 days of raw data (intra-week analysis input)
{JSON array of entries joined with health_logs, food_log_items,
 workout_sessions/exercises/sets, supplement_logs, intervention starts/stops}

# Last 8-12 weeks of structured aggregate (cross-domain analysis input)
{
  "window_start": ISO,
  "window_end": ISO,
  "food_tag_occurrences": [
    {"date": "2026-04-12", "tag": "beans", "portion": "large bowl"},
    {"date": "2026-04-15", "tag": "ferments", ...},
    ...
  ],
  "symptom_occurrences": [
    {"date": "2026-04-18", "symptom": "headache"},
    ...
  ],
  "workout_summary": [
    {"date": "2026-04-20", "session_quality": 8, "muscle_groups": ["chest"],
     "free_text_excerpt": "rolled twice, felt strong"}
  ],
  "supplement_adherence_by_week": [
    {"week_of": "2026-04-12", "morning_stack_pct": 0.86, "sleep_stack_pct": 0.71}
  ],
  "daily_subjective_avg": [
    {"date": "2026-04-12", "mood": 7, "energy": 6, "concentration": 8}
  ],
  "intervention_events": [
    {"date": "2026-04-29", "direction": "start", "name": "Inositol 500mg morning"}
  ]
}

# Recent weekly narrative recaps (for context only, not for counting events)
{array of last 2-3 weekly summary bodies from summaries where scope='weekly'}

# Now generate findings.
Return the JSON object only.
```

### User background block — supports full medical history

The background block is **as big as Jon wants it to be.** It's prompt-cached at the Anthropic API level (1-hour TTL when forced), and even uncached on Sonnet 4.6 it's ~$3/M input tokens. A 30K-token block (full medical history + all past bloodwork + family history + allergies + current meds + doctor's notes) costs ~$0.09 per uncached run, ~40¢/month at expected frequency. Trivial.

What goes in the background:

- `users.profile_md` — free-text markdown profile editable in Settings
- Concatenated `extracted_text` from `medical_documents` (PDFs uploaded by Jon — bloodwork history, doctor's notes, genetic test, prescription list, etc.)
- A short footer with current age, timezone, training context

Example skeleton:

```
# Jon's health profile

40s, Vancouver (PST). BJJ practitioner ~3x/week with a healing biceps
strain. Working on insulin sensitivity.

## Current focus
- Insulin sensitivity: last A1c 5.7 (Dec 2025), HOMA-IR 4.12. Trying to
  see both numbers drop at next draw.
- BJJ recovery: managing biceps strain, avoiding heavy pulls.

## Known history
- Father: type 2 diabetes diagnosed late 50s
- Mother: hypothyroidism
- Personal: no chronic conditions, no medications

## Bloodwork timeline
{extracted from medical_documents}

## Genetic
{if uploaded — e.g. APOE status, MTHFR, etc.}

## Tone preference
Pattern over preaching. No moralizing. State the data, stop.
```

### Active interventions block

A small JSON snippet, ~200 tokens, sent fresh each run:

```json
[
  {
    "name": "Inositol 500mg with morning stack",
    "type": "supplement",
    "started_at": "2026-04-29",
    "days_running": 13,
    "expected_window_days": 21
  }
]
```

Why it's separate: it changes week to week so it can't be prompt-cached, and Sonnet needs the day-count to contextualize ("13 days into inositol = within the 21-day window, but past the typical 14-day check-in").

-----

## Examples — full input + ideal output

### Example A — intra-week pattern present

Last 7 days: 4 headache mentions on Mon, Wed, Thu, Fri. All four entries
either mention or were preceded by late-night phone use. Prior 6 weeks:
0 headache mentions.

Ideal output (abridged):

```json
{
  "weekly_summary": {
    "title": "headaches reappeared mid-week; protein and sleep both off baseline",
    "body": "Four headache mentions this week (mon, wed, thu, fri), the first headaches in six weeks. All four logged on or the morning after days with screen time past 10pm. Protein averaged 110g/day vs. the prior four-week average of 138g/day. Sleep stack adherence was 4/7 nights versus the recent norm of 6/7.",
    "window_start": "2026-05-04T07:00:00-08:00",
    "window_end": "2026-05-11T07:00:00-08:00"
  },
  "intra_week_patterns": [
    {
      "title": "headaches returned, all on/after late-screen days",
      "body": "4 headache mentions this week (none in prior 6 weeks). All 4 days had logged screen time past 10pm — 3 same-day, 1 next-morning. n=4, low_n.",
      "n": 4,
      "confidence": "low_n",
      "supporting_data": {
        "metric": "headache_count",
        "comparison": "this_week_vs_prior_6_weeks",
        "data_points": [
          {"ref_type": "date", "ref_value": "2026-05-05"},
          {"ref_type": "date", "ref_value": "2026-05-07"},
          {"ref_type": "date", "ref_value": "2026-05-08"},
          {"ref_type": "date", "ref_value": "2026-05-09"}
        ]
      }
    },
    {
      "title": "protein 20% below recent baseline",
      "body": "Daily protein averaged 110g this week vs. 138g over the prior 4 weeks. Drop concentrated on weekdays (mon-thu). n=7 days this week, n=28 days baseline.",
      "n": 7,
      "confidence": "medium",
      "supporting_data": {
        "metric": "protein_g_daily_avg",
        "comparison": "this_week_vs_prior_4_weeks",
        "data_points": [
          {"ref_type": "date", "ref_value": "2026-05-04"},
          {"ref_type": "date", "ref_value": "2026-05-05"},
          {"ref_type": "date", "ref_value": "2026-05-06"},
          {"ref_type": "date", "ref_value": "2026-05-07"}
        ]
      }
    }
  ],
  "cross_domain_patterns": []
}
```

### Example B — cross-domain pattern present

History (last 8 weekly summaries): BJJ session quality 8+ was logged 5
times. 4 of those 5 sessions had bean-heavy lunches logged the prior day.

Ideal output (abridged):

```json
{
  "intra_week_patterns": [],
  "cross_domain_patterns": [
    {
      "title": "high-quality bjj followed bean-heavy lunches the prior day",
      "body": "BJJ sessions rated 8+ (n=5 over 8 weeks) were preceded by bean-heavy lunches on 4 of 5 occasions. The fifth followed a high-fiber non-bean lunch. n=5, low_n.",
      "n": 5,
      "confidence": "low_n",
      "supporting_data": {
        "metric": "bjj_session_quality_8plus",
        "comparison": "preceded_by_bean_heavy_lunch_yesterday",
        "data_points": [
          {"ref_type": "food_tag", "ref_value": "beans"},
          {"ref_type": "date", "ref_value": "2026-03-22"},
          {"ref_type": "date", "ref_value": "2026-04-05"},
          {"ref_type": "date", "ref_value": "2026-04-18"},
          {"ref_type": "date", "ref_value": "2026-05-02"}
        ]
      }
    }
  ]
}
```

### Example C — nothing meaningful happened

Last 7 days: routine. Stack adherence 6/7. No symptom anomalies. Protein
within 5% of baseline. Sleep within baseline.

Ideal output:

```json
{
  "weekly_summary": {
    "title": "uneventful week, all metrics within baseline",
    "body": "Stack adherence 6/7 (in line). Protein 135g daily avg, within 5% of the 4-week baseline. No new symptoms. No interventions changed. BJJ once (sat).",
    "window_start": "...",
    "window_end": "..."
  },
  "intra_week_patterns": [],
  "cross_domain_patterns": []
}
```

This is correct behavior. Do not invent findings to fill quota.

-----

## Edge cases and known pitfalls

1. **Sample size theater.** "You ate beans 7 days in a row, n=7" is not a
   pattern. It's a count. Findings need a comparison (against baseline,
   against a paired condition, etc.) and a reason it might mean something.

2. **Sleep is not in v1.** We don't track sleep duration directly. Inferred
   sleep mentions only ("slept badly" in a transcript). Don't claim sleep
   findings unless transcripts explicitly mention it.

3. **Adherence ≠ effect.** "Stack adherence was 5/7" is data, not a
   finding. Only flag it if there's something downstream that correlates.

4. **Whisper transcription errors.** Don't pattern-match on phonetic
   weirdness. "Ash wagandha" and "ashwagandha" both refer to the same
   thing. If a supplement name is mangled, match by structured
   `supplement_logs.supplement_id` not by the raw transcript.

5. **Intervention day windows.** Day 14 / day 28 intervention reports are a
   separate job; do not duplicate that analysis here. You can mention an
   active intervention as context but don't compute its before/after diff.

6. **Calorie estimates are noisy (±20-30%).** Treat calorie deltas of less
   than ±15% as noise. Protein, fiber, added sugars are more reliable.

7. **Cold start.** In the first 2-4 weeks, the prior weekly summaries
   array is short. Cross-domain findings will mostly be empty and that's
   fine — return `cross_domain_patterns: []`. Don't compensate by reaching
   intra-week.

-----

## What changes in the prompt over time

If we learn that Sonnet is over-eager about cross-domain findings, we'd
tighten the rules: maybe require `n >= 4` for cross-domain findings to
appear at all. If it's under-eager, we'd relax. The structure of the
prompt should stay stable so the output JSON contract doesn't change.

-----

## Companion: the weekly summarizer (Haiku, runs after Sonnet)

After Sonnet returns, one Haiku call generates the weekly narrative
recap that gets stored in `summaries(scope='weekly')`. **This is for
human review on the dashboard, not for the next week's cross-domain
analysis** (we use structured queries for that, see "Input shape" above).

Because it's no longer feeding a downstream LLM call, there is **no token
cap**. Write as long as needed to be informative for Jon. Probably
1500-2500 tokens in practice.

```
Write a recap of this week for Jon to read on Saturday morning. Cover:

- Notable foods with dates (beans, ferments, olive oil days, ultra-processed count)
- Supplement adherence by stack_group (with %)
- Workouts (sessions, top lifts by exercise, BJJ sessions and quality)
- Mood / energy / concentration daily averages, plus any obvious dips or peaks
- Symptoms with dates
- Active interventions and day-count
- Anything in free_text_notes worth carrying forward

Tone: dense and dry, but informative. Specific dates, specific foods,
specific weights. No commentary, no praise, no prescriptions. Section
headers and bullet points are fine. Length is whatever it needs to be.
```

-----

## Open questions for review

1. **3 + 2 finding cap** — too generous? Too tight? Real answer depends on
   how much actually surfaces in practice.
2. **Confidence buckets** — should `low_n` be its own bucket, or merge into
   `low`? I think distinct is better (`low_n` is structural, `low` is data
   noise) but happy to collapse.
3. **Citing data_points format** — current shape is `{ref_type, ref_value}`
   pairs. Open to a flatter shape if the dashboard would prefer.
4. **Sonnet temperature** — start at 0.3 (lean conservative, since we
   don't want imagined patterns). Bump to 0.5 if findings feel too dry.
5. **Active interventions block** — should this be a separate cached
   block, or part of the variable input? Probably variable (it changes
   week to week), but technically borderline.
