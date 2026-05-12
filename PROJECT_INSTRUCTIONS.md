# Signal — Personal Health Intelligence

> A voice-first health tracking and intelligence PWA. Single user (Jon). Built for the iOS home screen, deployed on Vercel, backed by Supabase, powered by Claude.

-----

## What this is

Signal is a personal health operating system. The core loop:

1. **Capture** — Double-tap the back of the iPhone, talk for 5-30 seconds, done.
1. **Parse** — Whisper transcribes, Claude extracts structured data (food, mood, energy, symptoms, workouts, supplements, activities).
1. **Store** — Raw transcripts + structured data + interventions go into Supabase.
1. **Learn** — Weekly pattern hunting surfaces non-obvious correlations across domains.
1. **Coach** — Custom user-built agents (Huberman, Attia, Arnold, etc.) answer questions using both their published work and Jon’s data.
1. **Speak** — Voice responses through earbuds during workouts. Visual dashboard for review.

The differentiator vs other trackers: the agent builder, cross-domain pattern hunting, and intervention-based n=1 analysis.

-----

## Who it’s for

Jon. Just Jon. Single-user app, no auth needed beyond a basic gate. Multi-user can come later if it matters.

Jon’s context that should inform defaults:

- Vancouver, PST timezone
- Active BJJ practitioner with a healing biceps strain
- Insulin sensitivity work in progress (A1c trending up, HOMA-IR 4.12)
- Daily supplement stack already defined (see Known Stack section)
- AI-native builder, comfortable with Claude Code, prefers minimal UI

-----

## Tech stack

- **Frontend:** Next.js 14+ (App Router), React, Tailwind
- **PWA:** Manifest + service worker, optimized for iOS home-screen install
- **Backend:** Next.js API routes (no separate backend)
- **Database:** Supabase (Postgres + Storage for audio files)
- **Auth:** Single magic-link login or simple passcode gate (it’s just Jon)
- **Transcription:** OpenAI Whisper API
- **LLM:** Anthropic API
  - `claude-haiku-4-5` for parsing, intent classification, confirmations
  - `claude-sonnet-4-6` for insights, agent conversations, pattern hunting
- **TTS:** ElevenLabs (paid voices) or OpenAI TTS (cheaper). Browser TTS as fallback.
- **Hosting:** Vercel
- **Deployment:** GitHub → Vercel auto-deploy

-----

## Core principles

1. **Voice-first, dashboard-second.** The dashboard is for review. Most days, the app stays closed — back tap, talk, done.
1. **Raw + structured both stored.** Never discard the original transcript. Structured data is for queries; raw text is for review and re-parsing.
1. **Pattern over preaching.** Surface what’s happening, not what’s “supposed to” happen. No moralizing about food, alcohol, sleep, or anything else.
1. **Cite or label as inferred.** Every agent recommendation includes a source. When inferring beyond their published work, say so.
1. **Cost-conscious.** Haiku where it works, Sonnet where it matters. Cache. Summarize old data.
1. **Tone: matter-of-fact.** No filler, no praise, no engagement bait, no motivational closers. Less is more.

-----

## The capture flow

### Entry points

1. **Back tap → Shortcut → PWA at `/capture?mode=auto`**
- Auto-focus the record button on page load
- Single tap starts recording (Safari/iOS mic permission requires one user gesture)
- Auto-stop after 60 seconds of silence, or manual tap to stop
1. **Workout mode: Back tap (different shortcut) → `/workout`**
- Continuous listening with optional wake word (“Hey Signal”)
- Stays open during session, screen wake lock active
- Voice responses through earbuds for next-set recommendations
1. **Manual: open PWA from home screen → record button on dashboard**

### Pipeline

```
[User taps record]
  → MediaRecorder captures audio (webm or mp4)
  → POST audio blob to /api/transcribe
    → Whisper transcribes
    → Returns transcript
  → POST transcript to /api/parse
    → Haiku classifies intent (see Intent Routing)
    → Haiku/Sonnet extracts structured data based on intent
    → Stores: { raw_transcript, intent, structured_data, agent_target?, timestamp_pst }
  → If agent_question: route to /api/agent/[name]
    → Sonnet generates response with agent's knowledge base + user's relevant data
    → Streams response
    → POST response to /api/tts (if voice mode)
    → Plays audio
  → UI shows transcript + structured fields + any agent reply
```

### Intent routing

Every voice note gets classified into one of these intents:

```typescript
type Intent =
  | 'health_log'        // food, mood, energy, symptoms, water
  | 'workout_log'       // exercise, sets, reps, weight
  | 'supplement_log'    // took/skipped specific items
  | 'agent_question'    // "ask [name]..."
  | 'data_query'        // "what did I do last week"
  | 'intervention_start' // "starting inositol today"
  | 'intervention_stop'  // "stopping ashwagandha"
  | 'free_note'         // general journal
  | 'mixed'             // multiple of the above in one note
```

Classification prompt should be cheap (Haiku) and run first. The full parse then uses an intent-specific schema.

### Response modes

- **Silent:** for health/supplement logs, UI confirmation only. No voice.
- **Short voice confirm:** for workout logs. Format: “set 2, bench 135 for 8.” No filler words.
- **Full voice response:** for agent questions and data queries. Constraint: answer the question, stop. No preamble (“Great question…”), no closer (“Let me know if…”), no motivation, no “that’s how you grow” type lines.

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

Jon does NOT want calorie counting. He DOES want:

- **Protein grams** (running daily total)
- **Fiber grams** (running daily total)
- **Added sugars** (running daily total)
- **Carb timing** (when carbs were eaten, not how much)
- **Saturated fat presence/absence** (binary per meal)
- **Specific items he cares about:** olive oil intake, fermented foods, beans, ultra-processed food count

Each food item passes through a lightweight nutrition estimator. Use a simple LLM call with a few-shot prompt; don’t integrate with USDA or paid nutrition APIs (overkill). Confidence levels matter — show them.

-----

## The insights engine

This is the actual product. Three layers:

### 1. Pattern surfacing (weekly)

Every Sunday at 9pm PST, generate the **Weekly Reflection**:

- Sonnet receives the last 7 days of structured data + raw notes (summarized if too large)
- Prompt: find 3-5 non-obvious patterns
- Output format: observational, never prescriptive
- Examples:
  - “Morning energy: 7.4 avg on inositol-with-breakfast days, 6.1 on inositol-with-lunch days. n=12.”
  - “BJJ session quality 8+ followed bean-heavy lunches the day prior, 3 of 3 instances. Small n.”
  - “Headache mentions: 4 this week vs 0 last week. All on days with logged screen time past 10pm.”

Stored in `insights` table. Surfaced on dashboard. Push notification sent.

### 2. Intervention tracking

Each intervention row triggers an automated before/after comparison:

- **Day 14 check-in:** “You started inositol 14 days ago. Want a snapshot?” → On tap, shows comparison of relevant metrics (energy, fullness, headaches) for the 14 days before vs 14 days after.
- **Day 28 review:** Full report with stat-significance caveats (small n, but here’s what the data shows).
- **Manual deep-dive:** Tap any intervention to see all metric deltas across the window.

### 3. Cross-domain pattern hunting

Run nightly on Sonnet with a low temperature. Looks for unexpected correlations:

- Garden activity → BJJ performance
- Late screen time → next-day energy
- Specific foods → mood next morning
- Workout intensity → sleep quality
- Supplement timing variations → any downstream metric

Surfaces findings in a “Patterns” dashboard tab. Each finding shows the underlying data so Jon can sanity-check it.

### 4. Bloodwork prediction (the experimental feature)

When Jon uploads bloodwork (PDF) or schedules new labs:

- Compare logged habits across the prior 90 days to baseline
- Sonnet predicts directional changes in: A1c, HOMA-IR, lipid panel, Vit D
- Show ranges, not point estimates: “A1c likely 5.7-5.9, leaning lower based on consistent fiber intake and reduced late-night snacking vs last quarter”
- Track prediction accuracy over time — does the system get better?

-----

## The agent system

### Agent data model

```sql
agents (
  id uuid,
  name text,                    -- "Peter Attia" or "Arnold (chest workouts)"
  public_figure text,           -- "Peter Attia"
  focus_areas text[],           -- ["longevity", "lipids", "Zone 2"]
  citation_style text,          -- "quote_sources" | "summarize"
  tone text,                    -- "direct" | "encouraging" | "blunt"
  data_access_level text,       -- "full" | "metrics_only" | "none"
  off_limits_topics text[],
  knowledge_summary text,       -- auto-generated description
  confidence_tier int,          -- 1-4 (see below)
  voice_id text,                -- ElevenLabs voice id (NOT a clone)
  created_at timestamptz
)
```

### Confidence tiers

When user adds an agent, the system evaluates available public material:

- **Tier 1 (high):** 100+ hrs recorded content, multiple books, established public expert. Agent is highly reliable.
- **Tier 2 (medium):** Some published work, interviews. Agent works with caveats.
- **Tier 3 (low):** Minimal public material. Falls back to general medical knowledge labeled with the person’s name. User confirmed they want this.
- **Tier 4 (unavailable):** No verified public material. Agent cannot be built.

Tier evaluation is itself a Sonnet call when building the agent. Returns: `tier`, `reasoning`, `sample_sources_found`.

### Agent build flow (conversational)

1. User taps “Add Agent” on dashboard
1. Right panel slides in with chat-style builder interface
1. System: “Who would you like to chat with?”
1. User: types or speaks a name
1. System: searches for public material, returns tier + summary
1. System: asks focus, citation style, tone, data access, off-limits
1. System: generates `knowledge_summary` (e.g., “This agent draws from Attia’s published work: Outlive (2023), 280+ Drive podcast episodes, his blog, and peer-reviewed papers on lipids and longevity.”)
1. User confirms or refines
1. Agent saved, available in agent panel list

### Talking to agents — UI

**Desktop layout:**

- Main dashboard fills screen
- Tap agent name in sidebar → right panel slides over, ~40% width
- Tap a second agent → second panel opens to the left of the first (split right side)
- Up to 3 panels visible simultaneously on desktop
- Each panel: name + tier badge at top, conversation history middle, input at bottom with placeholder “Ask [name]…”
- Minimize button collapses panel to a vertical tab on right edge
- Close button removes from active panels (conversation persists)

**Mobile layout:**

- Single panel slides up from bottom, full screen
- Tab strip at top to switch between active agents
- Swipe down to dismiss
- “Compare” button opens a stacked view: one question, multiple agents answer

### Voice routing to agents

When intent classifier returns `agent_question`:

- Extract target agent name from transcript
- Match against user’s saved agents (fuzzy match — “ask Arnold” matches “Arnold Schwarzenegger”)
- If no match: ask user via voice “I don’t have an Arnold agent yet — want to build one?”
- If match: load agent, generate response, TTS, play audio

### Voice ethics — IMPORTANT

- Agents use **synthetic voices that fit the persona**, not voice clones.
- UI must always show: “Arnold-style perspective · AI voice”
- No claim that Arnold (or any real person) actually said what the agent says.
- Citation is required for specific protocols/recommendations.

### “Ask all” feature

In any agent panel, button to fan question out to all active agents. Returns stacked responses with side-by-side comparison. User can mark answers 👍 / 👎 which feeds back into agent tuning.

-----

## The dashboard

### Layout

**Top bar:** date, quick actions (record button, today’s snapshot)

**Main sections (single column on mobile, two column on desktop):**

1. **Today** — what’s been logged so far, running totals (protein g, fiber g, water oz, energy avg)
1. **This Week** — sparkline of mood/energy, supplement adherence %, workout summary
1. **Active interventions** — what’s running, day count, “any signal yet?” preview
1. **Latest insights** — last 3 surfaced patterns, tap to expand
1. **Agents** — list of your saved agents, tap to open panel
1. **Bloodwork** — last result snapshot, trend arrows, next-lab predictor

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

1. **Weekly Reflection** — Sunday 9pm PST, summary of patterns
1. **Intervention check-in** — Day 14 and Day 28 of any active intervention
1. **Pattern alert** — when something unusual emerges mid-week (“3 headaches in 3 days, first time in 6 weeks”)
1. **Predictive prompt** — based on learned patterns (“Friday afternoon historically = poor sleep, want to set wind-down?”)
1. **Agent disagreement** — when active agents would disagree on a logged behavior

### What NOT to send

- Daily check-ins (“how are you feeling today?”) — too generic, becomes noise
- Streaks or gamification
- Recap summaries — nobody reads them
- Generic medical advice

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

**Throughout day:**

- Vitamin C 500mg (split AM/PM)

**With meals:**

- Collagen peptides (9g) + protein powder
- Inositol powder (CanPrev or AOR) — current intervention, breakfast or lunch

**Night:**

- Magnesium glycinate
- L-theanine + glycine
- Melatonin 1mg

Voice command “took morning stack” logs all morning items in one go.

-----

## Cost controls

### Model selection

- **Haiku** for: intent classification, parsing voice notes, supplement matching, short confirmations
- **Sonnet** for: agent conversations, weekly insights, cross-domain pattern hunting, bloodwork prediction
- **Never Opus** unless explicitly testing — costs don’t justify it for this use case

### Context management

- Daily summary checkpoint: at end of day, Sonnet summarizes the day into ~200 tokens
- Weekly summary checkpoint: at end of week, summarizes the week into ~500 tokens
- Monthly summary checkpoint: ~1000 tokens
- Agent conversations load: last 7 days raw + last 4 weekly summaries + relevant interventions, not full history

### Caching

- Agent knowledge bases cached server-side (don’t reload Attia’s framework summary every chat)
- Use Anthropic’s prompt caching for repeated context blocks
- Audio files: keep 30 days, then delete; transcripts kept forever

### Estimated monthly cost (Jon’s expected usage)

- Whisper: ~$1/month
- Haiku parsing: ~$1-2/month
- Sonnet (agents, insights, predictions): ~$10-20/month
- TTS (ElevenLabs starter or OpenAI TTS): ~$5/month
- **Total: $15-25/month** in API fees (separate from Claude Max subscription, which doesn’t cover API)

-----

## Build phases

### Phase 1 — Capture loop (ship first)

- Next.js + Tailwind scaffold
- Supabase schema (entries, structured_data, supplements, known_stack)
- `/capture` route with record → Whisper → Haiku parse → store
- Basic dashboard showing today’s entries
- Back tap shortcut documented in README
- PWA manifest + home-screen install instructions

**Definition of done:** Jon can back-tap, talk, and see structured data on the dashboard within 10 seconds.

### Phase 2 — Workout mode + voice responses

- `/workout` route with continuous-listening UI
- Workout-specific schema and session grouping
- Sonnet workout coaching responses
- ElevenLabs/OpenAI TTS integration
- Wake word optional (Web Speech API in workout mode only)

### Phase 3 — Agents

- Agent builder conversational UI
- Agent panel system (right-side overlay, multi-agent support)
- Voice routing to agents (“ask Arnold…”)
- Confidence tier evaluation
- “Ask all” feature

### Phase 4 — Insights engine

- Weekly Reflection cron job
- Intervention tracking + Day 14/28 reports
- Cross-domain pattern hunting nightly job
- Insights dashboard tab

### Phase 5 — Bloodwork + predictions

- PDF upload + parse (NiaHealth format first)
- Bloodwork vault with trends
- Predictive model for next labs
- Track prediction accuracy

### Phase 6 — Polish

- Push notifications (Web Push API)
- Settings page
- Export to markdown / Obsidian sync
- Performance optimization, offline support

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
│   ├── agents/page.tsx
│   ├── insights/page.tsx
│   ├── bloodwork/page.tsx
│   └── api/
│       ├── transcribe/route.ts
│       ├── parse/route.ts
│       ├── agent/[name]/route.ts
│       ├── tts/route.ts
│       ├── insights/weekly/route.ts
│       └── cron/patterns/route.ts
├── lib/
│   ├── supabase.ts
│   ├── anthropic.ts
│   ├── whisper.ts
│   ├── tts.ts
│   ├── prompts/
│   │   ├── intent.ts
│   │   ├── parse-health.ts
│   │   ├── parse-workout.ts
│   │   ├── weekly-reflection.ts
│   │   └── agent-template.ts
│   └── agents/
│       └── builder.ts
├── components/
│   ├── RecordButton.tsx
│   ├── AgentPanel.tsx
│   ├── InsightCard.tsx
│   └── ...
└── public/
    ├── manifest.json
    └── icons/
```

-----

## What we explicitly are NOT building (yet)

- Multi-user / accounts beyond Jon
- Native iOS app
- Wearable integration (Apple Health, Whoop, Oura)
- Social/sharing features
- Calorie counting or full macro breakdown
- Voice cloning of real people
- Apple Watch companion
- Streaks, gamification, or scoring

These can be revisited once core loop is solid and Jon is using it daily.

-----

## Open questions to resolve during build

1. Magic link vs simple passcode for the auth gate? (Just Jon, so probably passcode.)
1. Should voice notes auto-delete from Supabase Storage after 30 days, or keep until manually deleted?
1. ElevenLabs vs OpenAI TTS for agent voices — quick A/B test in Phase 2.
1. Wake word library: built-in Web Speech API vs a tiny on-device model — test in Phase 2.
1. Bloodwork PDF parsing reliability — may need fallback to manual entry confirmation.

-----

## Handoff to Claude Code

When ready to build, paste this file + `DESIGN.md` + `SCHEMA.sql` into the Claude Code working directory, then prompt:

> Read PROJECT_INSTRUCTIONS.md, DESIGN.md, and SCHEMA.sql. Build Phase 1 (capture loop) end-to-end. Use the file structure described. Set up the Supabase client, scaffold the routes, build the `/capture` page with record → Whisper → parse → store, and make a minimal dashboard showing today’s entries. Ask me before installing anything unusual.

Then iterate from there.

-----

*Last updated: May 2026.*
