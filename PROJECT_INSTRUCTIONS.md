# Signal — Personal Health Intelligence

> A voice-first health tracking and intelligence PWA. Single user (Jon). Built for the iOS home screen, deployed on Vercel, backed by Supabase, powered by Claude.

-----

## What this is

Signal is a personal health operating system. The core loop:

1. **Capture** — Double-tap the back of the iPhone, talk for 5-30 seconds, done.
1. **Parse** — Whisper transcribes, Claude extracts structured data (food, mood, energy, symptoms, workouts, supplements, activities).
1. **Store** — Raw transcripts + structured data + interventions go into Supabase.
1. **Learn** — Weekly Sonnet reflection surfaces patterns. Intervention before/after diffs on day 14 and 28.
1. **Export** — One-tap “Ask AI” bundles relevant data + a structured prompt and copies to clipboard or deep-links to Claude/ChatGPT. The conversation happens there, not in our app.
1. **Review** — Visual dashboard for daily totals, weekly trends, intervention status, bloodwork.

The differentiator vs other trackers: voice-first capture, intervention-based n=1 analysis, and exportable context for any LLM.

-----

## Who it’s for

Jon. Just Jon. Single-user app. Auth via Supabase magic-link to Jon’s email. Multi-user can come later if it matters.

Jon’s context that should inform defaults:

- Vancouver, PST timezone
- Active BJJ practitioner with a healing biceps strain
- Insulin sensitivity work in progress (A1c trending up, HOMA-IR 4.12)
- Daily supplement stack already defined (see Known Stack section)
- AI-native builder, comfortable with Claude Code, prefers minimal UI

-----

## Tech stack

- **Frontend:** Next.js 14+ (App Router), React, Tailwind
- **PWA:** Manifest + service worker, optimized for iOS home-screen install. Offline capture queue (IndexedDB) with background sync.
- **Backend:** Next.js API routes (no separate backend)
- **Database:** Supabase (Postgres + Storage for audio files)
- **Auth:** Supabase magic-link to Jon’s email
- **Transcription:** OpenAI Whisper API
- **LLM:** Anthropic API
  - `claude-haiku-4-5-20251001` for parsing, intent classification, day-end digests
  - `claude-sonnet-4-6` for weekly reflection, bloodwork expectations, intervention reports
- **TTS:** Deferred to post-v1. Voice replies are not in v1 scope.
- **Hosting:** Vercel
- **Deployment:** GitHub → Vercel auto-deploy

-----

## Core principles

1. **Voice-first, dashboard-second.** The dashboard is for review. Most days, the app stays closed — back tap, talk, done.
1. **Raw + structured both stored.** Never discard the original transcript. Structured data is for queries; raw text is for review and re-parsing.
1. **Pattern over preaching.** Surface what’s happening, not what’s “supposed to” happen. No moralizing about food, alcohol, sleep, or anything else.
1. **Don’t rebuild what subscriptions already do.** Open-ended LLM conversations live in Claude/ChatGPT via the Ask AI export. Our job is to make the data trivially exportable, not to host the chat.
1. **Cost-conscious.** Haiku where it works, Sonnet where it matters. Cache. Pre-digest daily before weekly summarization. Batch when not time-critical.
1. **Tone: matter-of-fact.** No filler, no praise, no engagement bait, no motivational closers. Less is more.

-----

## The capture flow

### Entry points

1. **Back tap → Shortcut → PWA at `/capture?mode=auto`**
- Auto-focus the record button on page load
- Single tap starts recording (Safari/iOS mic permission requires one user gesture)
- Auto-stop after 60 seconds of silence, or manual tap to stop
- Offline-safe: if no network, audio + transcript-stub queue in IndexedDB and upload when connectivity returns (service worker background sync)
1. **Workout mode: Back tap (different shortcut) → `/workout`**
- Big tap-to-record button per set. No wake word, no continuous listening (unreliable on iOS Safari).
- Screen wake lock active during session
1. **Manual: open PWA from home screen → record button on dashboard**

### Pipeline

```
[User taps record]
  → MediaRecorder captures audio (webm or mp4)
  → If offline: queue blob in IndexedDB, return early; SW will sync later
  → POST audio blob to /api/transcribe
    → Whisper transcribes
    → Returns transcript
  → POST transcript to /api/parse
    → Haiku classifies intent (see Intent Routing)
    → Haiku extracts structured data based on intent
    → Stores: { raw_transcript, intent, structured_data, timestamp_pst }
  → UI shows transcript + structured fields
  → Transcript is tap-to-edit; editing re-fires /api/parse on save
```

### Intent routing

Every voice note gets classified into one of these intents:

```typescript
type Intent =
  | 'health_log'         // food, mood, energy, symptoms, water
  | 'workout_log'        // exercise, sets, reps, weight
  | 'supplement_log'     // took/skipped specific items
  | 'intervention_start' // "starting inositol today"
  | 'intervention_stop'  // "stopping ashwagandha"
  | 'free_note'          // general journal
  | 'mixed'              // multiple of the above in one note
```

**Parser guardrails (mandatory in the prompt):**

- Numeric scores (mood 1-10, energy 1-10, concentration 1-10, RPE 1-10) are filled **only** when explicitly stated or unambiguously implied. Otherwise the field is `null`. Descriptors are always captured.
- Confidence on nutrition estimates is mandatory (`high` | `medium` | `low`). If the food description is vague (“lunch was fine”), confidence is `low` and macros may be null.
- Never invent supplement doses or names not in the user’s known stack — flag novel items as candidate interventions instead.

Classification prompt should be cheap (Haiku) and run first. The full parse then uses an intent-specific schema.

### Response modes

- **Silent:** for all logs, UI confirmation only. Number tick-up on the relevant totals on the dashboard.
- **Save behavior:** entries auto-save when the user taps `stop` (not on a timer). They can edit the transcript afterward; saving the edit re-fires the parse.

**Global tone rule for all generated output (voice and text):** Direct. No filler. No praise. No engagement bait. No closing lines designed to prolong interaction. State the thing, stop.

-----

## What gets parsed

### Health log schema

```json
{
  "food_items": [
    { "name": "bean salad over rice", "portion": "large bowl", "time_relative": "lunch" }
  ],
  "estimated_nutrition": {
    "calories_kcal": 520,
    "protein_g": 25,
    "fiber_g": 12,
    "added_sugars_g": 0,
    "saturated_fat_present": false,
    "carb_timing": "midday",
    "ultra_processed": false,
    "confidence": "medium"
  },
  "water_oz": null,
  "mood": { "score": 7, "descriptor": "good" },
  "fullness": "satisfied",
  "energy": { "score": 6, "descriptor": "steady" },
  "concentration": { "score": 7, "descriptor": "focused" },
  "symptoms": [],
  "free_text_notes": "olive oil shot before lunch"
}
```

### Workout log schema

```json
{
  "session_id": "auto-grouped if within 90min of last workout log",
  "exercise": "barbell bench press",
  "muscle_group": "chest",
  "sets": [
    { "weight_lb": 135, "reps": 8, "notes": "easy", "rpe": 6 },
    { "weight_lb": 155, "reps": 6, "notes": "moderate", "rpe": 7 }
  ],
  "session_notes": "warmup felt good, no biceps pain"
}
```

### Supplement log

Match against `known_stack` table (see Schema). User says “took morning stack” → logs all 7 items as taken. User says “skipped ashwagandha” → marks one as skipped. User says “added 500mg inositol with breakfast” → flags as intervention if not in stack yet.

### Intervention tracking

When intent is `intervention_start` or `intervention_stop`:

- Create row in `interventions` table
- Capture: name, type (supplement, food, behavior), expected_window_days (default 21), baseline_metrics_snapshot
- Trigger an automated “intervention report” notification at day 14 and day 28

### Nutrition — the focused approach

Track these:

- **Protein grams** (running daily total — the headline number)
- **Calories** (running daily total — secondary, low-precision, show with confidence)
- **Fiber grams** (running daily total)
- **Added sugars** (running daily total)
- **Carb timing** (when carbs were eaten, not how much)
- **Saturated fat presence/absence** (binary per meal)
- **Specific items he cares about:** olive oil intake, fermented foods, beans, ultra-processed food count

Each food item passes through a lightweight nutrition estimator. Use a simple LLM call with a few-shot prompt; don’t integrate with USDA or paid nutrition APIs (overkill). Confidence levels matter — show them. Calories from voice descriptions are inherently rough (±20-30%); render with the confidence tag, never as a precise figure.

-----

## The insights engine

Two layers. There is no standalone nightly job — cross-domain hunting is folded into the weekly reflection so we get the signal without 30x the cron noise.

### 1. Weekly reflection (intra-week patterns + cross-domain over history)

Every **Friday at 9pm PST**, run the **Weekly Reflection**:

- Sonnet receives the **raw** last 7 days: full transcripts + structured rows (health_logs, food_log_items, workout sessions/exercises/sets, supplement_logs, interventions). No pre-compression — Sonnet does its own compression on the fly, in service of the analysis.
- Sonnet also receives a **structured aggregate of the last 8-12 weeks**, queried directly from the database (not LLM-summarized). This preserves event-level detail with dates — food tags by date, symptoms by date, workout quality by date, supplement adherence by week, daily mood/energy averages, intervention events. This is the cross-domain input. Event-level retention is what lets `n` grow cumulatively for cross-domain findings.
- For human context, the last 2-3 weekly narrative recaps from `summaries` are also included.
- An **active interventions block** (~200 tokens of fresh JSON) tells Sonnet what's currently being trialed and the day-count.
- A **user background block** is prompt-cached: `users.profile_md` plus extracted text from `medical_documents`. Can be 5K-30K tokens. Costs ~$0.05-0.15/run uncached on Sonnet, less with cache hits.

**Two halves of the analysis:**

1. **Intra-week patterns** — what stood out in the last 7 days vs recent baseline? `n` = events in the 7-day window. Examples: "headache mentions: 4 this week vs 0 prior 6 weeks, n=4."
2. **Cross-domain correlations across history** — patterns that span weeks and link domains that aren't usually tracked together. `n` = events accumulated across the 8-12 week window. Examples: "BJJ session quality 8+ followed bean-heavy lunches the day prior, 4 of 5 instances over 10 weeks, n=5."

**Hard rules applied to every finding:**

- Must declare n explicitly.
- If n < 5, automatically tagged `confidence=low_n`. UI shows a `low n` badge.
- Each finding cites the underlying rows so Jon can sanity-check.
- Observational only, never prescriptive. No "you should."
- Max 3 intra-week findings + 2 cross-domain findings per run. Empty arrays are valid output if nothing surfaces.

Stored in `insights` table: one row per finding (`kind='pattern'`) plus one summary row (`kind='weekly_reflection'`). Surfaced on dashboard. Optional push notification.

After the Sonnet run, a Haiku call writes a **dense human-readable weekly recap** to `summaries(scope='weekly')`. No token cap — make it as informative as needed (probably 1500-2500 tokens). This summary is for Jon to read on the dashboard, **not** for next week's cross-domain pass (we use structured queries for that, so per-event detail is never lost).

### 2. Intervention tracking

Each intervention row triggers an automated before/after diff:

- **Day 14 check-in:** snapshot of relevant metrics (energy, fullness, mood, symptom counts) for the 14 days before vs 14 days after.
- **Day 28 review:** wider window, same shape. Includes a single-paragraph Sonnet commentary with explicit n + “small sample” caveat.
- **Manual deep-dive:** tap any intervention to see all metric deltas across the window.
- Logs (`health_logs`, `supplement_logs`, `workout_exercises`) carry a nullable `intervention_id` so the diff queries are simple.

### 3. Bloodwork expectations (replaces prediction)

The use case: Jon’s last A1c was 5.7. He changed his diet and started inositol. **What does success look like at the next draw?**

- Before a planned draw: one Sonnet call receives last 90 days of logs + active interventions + the previous draw’s markers.
- Output: per-marker expected range + a one-line rationale per range (“fiber average up 40% and added sugar down → A1c likely 5.4-5.6”).
- Stored as `bloodwork_expectations` rows (one per marker per planned draw).
- After actual results are uploaded, the row is scored hit/miss/direction-correct. Track this over time to see if the model is calibrated.
- This is not a generic prediction model — it’s a “what should I be hoping to see, given what I changed.”

-----

## Ask AI — export to any LLM

Replacing the in-app agent system. Rationale: building a credible “Attia-style coach with citations” requires indexing his books, podcasts, and papers — that’s a separate product. We don’t need to host the conversation; we need to make our data trivially exportable into a chat that already exists in Claude or ChatGPT.

### What it does

A persistent **Ask AI** button on the dashboard, capture page, intervention detail, and bloodwork pages. Tapping opens a sheet:

1. **Prompt template selector** (one of):
   - **General reflection** — “Here’s my last 7 days of health data. Tell me what stands out.”
   - **Intervention check** — “I started [intervention] [N] days ago. Here’s the before/after diff. What does this suggest?”
   - **Pre-bloodwork** — “My last labs showed [X]. I’ve changed [Y]. What should I expect at the next draw?”
   - **Workout question** — “Here’s my last 4 weeks of lifts for [muscle group]. What should I do next session?”
   - **Free-form** — bring your own question, we attach the data.
2. **Data scope selector** — last 7 days / last 30 days / since intervention X / custom range.
3. **Generated preview** — the assembled prompt is shown verbatim so the user can edit before sending.
4. **Actions:**
   - **Copy** — to clipboard, paste anywhere.
   - **Open in Claude** — opens claude.ai with the prompt prefilled in a new chat (if the deep-link supports prefill; otherwise it opens claude.ai and the prompt is already in the clipboard).
   - **Open in ChatGPT** — same, for chatgpt.com.

### Data format in the export

Structured JSON inside the prompt so the receiving LLM can parse it. Example:

```
You are helping me understand my health data. Be matter-of-fact, no filler.

# My background
- 40s, BJJ practitioner, healing biceps strain
- Working on insulin sensitivity (last A1c 5.7, HOMA-IR 4.12)

# Active interventions
- Inositol 500mg with breakfast, day 12 of 21

# Last 7 days
{ "daily_digests": [ ... ] }

# Question
What stands out?
```

### Why this is better than in-app agents

- Zero in-app LLM cost for open-ended conversation (user pays their Claude/ChatGPT subscription).
- Zero knowledge-base maintenance.
- Users get the latest, smartest model automatically.
- No voice-cloning ethics minefield.
- A days-long build instead of a months-long one.

-----

## The dashboard

### Layout

**Top bar:** date, quick actions (record button, today’s snapshot)

**Main sections (single column on mobile, two column on desktop):**

1. **Today** — what’s been logged so far, running totals (protein g headline, calories secondary, fiber g, water oz, energy avg)
1. **This Week** — sparkline of mood/energy, supplement adherence %, workout summary
1. **Active interventions** — what’s running, day count
1. **Latest insights** — last 3 surfaced patterns, tap to expand
1. **Bloodwork** — last result snapshot, trend arrows, link to expectations for next draw
1. **Ask AI** button — persistent, opens the export sheet

### Visual direction

See `DESIGN.md` for full spec. Quick principles:

- Cal.com structure with health personality
- Warm off-white background (`#FAF8F5`), black primary buttons, square edges, no gradients
- Big numbers, small labels
- Dark mode default-on (for late-night logging)
- Typography: Inter for body, JetBrains Mono for numbers
- Sparklines and small charts, no big infographics
- Recording state: full-screen red pulse, can’t miss it

-----

## Notifications

iOS PWA push notifications work after home-screen install + permission grant. Web Push API server-side, fired via Vercel cron jobs.

### Notification types

1. **Weekly Reflection** — Friday 9pm PST, summary of patterns
1. **Intervention check-in** — Day 14 and Day 28 of any active intervention
1. **Pattern alert** — when a hard threshold is crossed (e.g., “3 headaches in 3 days, first time in 6 weeks”). Triggered by deterministic rules, not by an LLM hunch.

### What NOT to send

- Daily check-ins (“how are you feeling today?”) — too generic, becomes noise
- Streaks or gamification
- Recap summaries — nobody reads them
- Generic medical advice
- Predictive nudges (“Friday afternoon = poor sleep, want to wind down?”) — violates the no-preaching rule

### iOS PWA reliability caveat

iOS push for PWAs is real but flaky. Treat push as a best-effort layer; the source of truth remains the dashboard. Insights are surfaced in-app the next time Jon opens it regardless of whether the push delivered.

### Settings

Per-notification-type toggle. Quiet hours configurable. All off by default; opt in.

-----

## Known stack (Jon’s current supplements)

Pre-populate this in the `supplements` table:

**Morning:**

- Vitamin D3 (2500-3000 IU)
- Boswellia
- Turmeric with black pepper
- Fish oil
- New Chapter men’s multivitamin
- Ashwagandha with black pepper
- K2 (120 mcg)
- Inositol powder (CanPrev or AOR), 500mg — current intervention
- Cold-pressed extra virgin olive oil, 15 ml

**With meals:**

- Protein powder

**Night:**

- Collagen peptides (9g)
- Vitamin C 500mg
- Magnesium bisglycinate 400mg
- L-theanine + glycine
- Melatonin 1mg

Voice command “took morning stack” logs all morning items in one go.

-----

## Cost controls

### Model selection

- **Haiku** (`claude-haiku-4-5-20251001`) for: intent classification, parsing voice notes, supplement matching
- **Sonnet** (`claude-sonnet-4-6`) for: weekly reflection, intervention reports, bloodwork expectations
- **Never Opus** for this app

### Architecture for low cost

1. **Anthropic prompt caching** for the system prompt + Jon's static background block on the weekly reflection — ~90% discount on cached input tokens.
2. **Anthropic batch API** for the weekly reflection and bloodwork expectations (neither is time-critical) — 50% discount.
3. **No nightly Sonnet job.** Cross-domain hunting runs once a week, folded into the weekly reflection. Patterns are weekly only.
4. **No daily digest pre-compression.** Tested: digest path saved ~5-10¢/month versus sending raw data to Sonnet. Sonnet's on-the-fly compression with full context beats Haiku's pre-compression. Send raw.
5. **One Haiku call per week** generates a ~500-token summary that feeds next week's cross-domain pass. Cheap, and the only compression worth keeping.
6. **No in-app open-ended chat.** Ask AI export routes that workload to Jon's own Claude/ChatGPT subscription, so it costs us $0.
7. **TTS deferred** to post-v1.

### Storage

- Audio files: 30-day lifecycle on Supabase Storage, then auto-deleted
- Transcripts: kept forever (small)

### Estimated monthly cost (post-simplification)

- Whisper: ~$1
- Haiku (intent + per-intent parsing): ~$1-2
- Sonnet (weekly reflection + occasional bloodwork expectations + intervention reports): ~$1-3 with caching and batch discounts
- **Total: $3-6/month** at moderate daily use

-----

## Build phases

### Phase 1 — Capture loop (ship first)

- Next.js + Tailwind scaffold with design tokens
- Supabase schema applied; Jon’s user row + known stack seeded
- Supabase magic-link auth
- `/capture` route: record → Whisper → Haiku parse → store
- Transcript tap-to-edit; saving an edit re-fires the parse
- Save on stop only (no autosave timer)
- Offline queue (IndexedDB + service worker background sync)
- Dashboard `/` showing today’s totals + today’s log (reverse chronological)
- PWA manifest + service worker
- Back tap shortcut documented in README

**Definition of done:** back tap → talk → release → structured data on the dashboard inside 10 seconds online; queued and synced when offline.

### Phase 2 — Insights + interventions + Ask AI

- Weekly Sonnet reflection cron (Friday 9pm PST, batch API, raw last 7 days + structured 8-12 week aggregate + active interventions + cached user background block from `users.profile_md` + `medical_documents`) — finds intra-week patterns AND cross-domain correlations across history. Hard `low_n` tagging for n<5.
- Haiku weekly recap writer (no token cap) — writes a human-readable summary to `summaries(scope='weekly')` for dashboard review. Not used as cross-domain input; cross-domain pulls from structured tables directly so event-level detail is never lost.
- Settings: paste a markdown health profile (`users.profile_md`), upload medical documents (PDFs → `medical_documents.extracted_text`)
- Intervention day 14 / day 28 diff views (in-app)
- `Ask AI` export sheet with templates, scope selector, copy + deep links
- Insights dashboard surfaces

### Phase 3 — Workout mode + bloodwork

- `/workout` route: tap-to-record per set, screen wake lock, session grouping (same-day or 90-min window)
- `/bloodwork`: PDF upload → confirm extracted values → save
- Bloodwork expectations: Sonnet call per planned draw → expected ranges; scored after actual upload

### Phase 4 — Notifications + settings + polish

- Web Push subscription + Vercel cron-triggered sends
- Settings page (notification toggles, quiet hours, export, data wipe)
- Markdown export
- Performance pass

**Phases 5-6 are reserved for things that emerge from daily use. Don’t pre-commit to them.**

-----

## Repo structure

```
signal/
├── PROJECT_INSTRUCTIONS.md  (this file)
├── DESIGN.md                (visual spec)
├── README.md                (setup, deploy, where things are)
├── SCHEMA.sql               (Supabase tables)
├── package.json
├── next.config.js
├── tailwind.config.js
├── app/
│   ├── layout.tsx
│   ├── page.tsx              (dashboard)
│   ├── capture/page.tsx
│   ├── workout/page.tsx
│   ├── insights/page.tsx
│   ├── bloodwork/page.tsx
│   ├── settings/page.tsx
│   └── api/
│       ├── transcribe/route.ts
│       ├── parse/route.ts
│       ├── export/route.ts            (assembles Ask AI prompt)
│       ├── insights/weekly/route.ts   (Friday cron, Sonnet -> Haiku recap)
│       ├── medical/upload/route.ts    (PDF -> extracted_text)
│       └── bloodwork/expect/route.ts
├── lib/
│   ├── supabase.ts
│   ├── anthropic.ts
│   ├── whisper.ts
│   ├── export.ts                       (prompt templates for Ask AI)
│   ├── offline-queue.ts                (IndexedDB queue helpers)
│   └── prompts/
│       ├── intent.ts
│       ├── parse-health.ts
│       ├── parse-workout.ts
│       ├── parse-supplement.ts
│       ├── parse-intervention.ts
│       ├── weekly-reflection.ts
│       └── bloodwork-expectations.ts
├── components/
│   ├── RecordButton.tsx
│   ├── TranscriptEditor.tsx
│   ├── AskAISheet.tsx
│   ├── InsightCard.tsx
│   └── ...
└── public/
    ├── manifest.json
    ├── sw.js                           (service worker: PWA + offline sync)
    └── icons/
```

-----

## What we explicitly are NOT building (yet)

- Multi-user / accounts beyond Jon
- Native iOS app
- Wearable integration (Apple Health, Whoop, Oura)
- Social/sharing features
- Full macro breakdown beyond protein / fiber / added sugars / calories
- In-app open-ended LLM chat (replaced by Ask AI export to user’s own Claude/ChatGPT)
- Persona agents (Attia, Huberman, Arnold) — defer indefinitely; revisit only after a credible knowledge-base sourcing story
- Voice cloning of real people — never
- Nightly cross-domain pattern hunting (insufficient n; would hallucinate)
- TTS / voice replies in v1
- Wake words and continuous listening (unreliable on iOS Safari)
- Apple Watch companion
- Streaks, gamification, scoring, predictive nudges

These can be revisited once core loop is solid and Jon is using it daily.

-----

## Open questions to resolve during build

1. Bloodwork PDF parsing reliability (NiaHealth format) — may need a manual-confirm step.
2. Does Claude.ai support a `?q=` deep-link for new chats? If not, Ask AI falls back to clipboard-only with a one-tap “Open Claude.ai” link.
3. Service-worker background sync support on iOS Safari is partial — confirm the offline queue actually flushes on next foreground if SW sync isn’t available.

-----

## Handoff to Claude Code

When ready to build, paste this file + `DESIGN.md` + `SCHEMA.sql` into the Claude Code working directory, then prompt:

> Read PROJECT_INSTRUCTIONS.md, DESIGN.md, and SCHEMA.sql. Build Phase 1 (capture loop) end-to-end. Use the file structure described. Set up the Supabase client, scaffold the routes, build the `/capture` page with record → Whisper → parse → store, and make a minimal dashboard showing today’s entries. Ask me before installing anything unusual.

Then iterate from there.

-----

*Last updated: May 2026.*
