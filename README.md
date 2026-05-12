# Signal

Voice-first personal health intelligence. Back tap → talk → done.

Single user. iOS PWA. Vercel + Supabase + Anthropic + Whisper.

-----

## What it does

- Capture health, food, mood, energy, symptoms, supplements, and workouts by voice
- Parse free-form speech into structured data
- Surface weekly patterns and cross-domain correlations
- Track interventions (start/stop a supplement, change a habit) with before/after analysis
- Talk to user-built health agents (Attia, Huberman, Arnold, anyone with enough public material)
- Predict next bloodwork before drawing labs
- Voice-respond hands-free during workouts

Read `PROJECT_INSTRUCTIONS.md` for the full spec.
Read `DESIGN.md` for the visual system.
Read `SCHEMA.sql` for the data model.

-----

## Setup

### Prerequisites

- Node 20+
- Supabase project
- Anthropic API key (Console, not subscription — see PROJECT_INSTRUCTIONS for why)
- OpenAI API key (for Whisper, and optionally TTS)
- Optional: ElevenLabs API key (for agent voices)
- Vercel account
- iPhone with iOS 17+ for back tap + PWA install

### Local setup

```bash
git clone https://github.com/commstark/signal.git
cd signal
npm install
cp .env.example .env.local
# Fill in env vars
npm run dev
```

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=

NEXT_PUBLIC_APP_URL=http://localhost:3000

# Web Push (generate with `npx web-push generate-vapid-keys`)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:jon@example.com

# Simple gate (single user)
SIGNAL_PASSCODE=
```

### Supabase setup

1. Create a new Supabase project
1. Open the SQL editor, paste contents of `SCHEMA.sql`, run
1. Create two storage buckets in the dashboard: `audio` (with 30-day lifecycle) and `bloodwork` (no lifecycle), both private
1. Grab the URL, anon key, and service role key into `.env.local`
1. Insert Jon’s user row manually:

```sql
insert into users (email, timezone) values ('jon@example.com', 'America/Los_Angeles') returning id;
```

1. Take the returned UUID, uncomment the seed block at the bottom of `SCHEMA.sql`, replace `JON_UUID`, and run

### Vercel deploy

```bash
vercel link
vercel env pull
vercel --prod
```

Set all env vars in the Vercel dashboard. Auto-deploy on push to `main`.

-----

## iPhone setup (the part that makes it good)

### 1. Install as PWA

- Visit your deployed URL in Safari on iPhone
- Share → Add to Home Screen
- Open from home screen icon (not Safari) — this enables push notifications and full-screen mode

### 2. Allow notifications

- First open: tap allow when prompted
- Settings → Signal → Notifications: all on, or selective per type

### 3. Build the Shortcut

- Open Shortcuts app → `+` → Add Action
- Action: `Open URLs`
- URL: `https://your-deployed-url.com/capture?mode=auto`
- Name the shortcut “Signal Record”
- Tap the shortcut header → Add to Home Screen (optional but useful)

### 4. Wire up Back Tap

- Settings → Accessibility → Touch → Back Tap
- Double Tap → Signal Record
- (Optional) Triple Tap → a second shortcut pointing to `/workout` for workout mode

### 5. Test

- Lock phone
- Double-tap the back
- Phone unlocks (Face ID), Signal opens to capture page, record button is pulsing
- One tap → recording starts
- Talk
- Tap stop → transcribes → parses → stored

-----

## Build phases

See `PROJECT_INSTRUCTIONS.md` for full phase details.

- **Phase 1** — Capture loop (record → Whisper → parse → store → dashboard)
- **Phase 2** — Workout mode + voice responses
- **Phase 3** — Agent builder + agent panels
- **Phase 4** — Insights engine + intervention tracking
- **Phase 5** — Bloodwork upload + predictions
- **Phase 6** — Notifications, settings, polish

Ship Phase 1 first. Don’t build later phases until Phase 1 is in daily use.

-----

## File map

```
PROJECT_INSTRUCTIONS.md   master spec — read this first
DESIGN.md                 visual system, components, screens
SCHEMA.sql                Supabase schema
README.md                 this file

app/                      Next.js App Router
  page.tsx                  dashboard
  capture/                  voice capture
  workout/                  workout mode
  agents/                   agent list + builder
  insights/                 patterns + interventions
  bloodwork/                lab vault + predictor
  api/                      route handlers (transcribe, parse, agent, tts, crons)

lib/                      core utilities
  supabase.ts               client init
  anthropic.ts              Claude client + helpers
  whisper.ts                Whisper transcription
  tts.ts                    TTS provider abstraction
  prompts/                  prompt templates per intent + agent
  agents/                   agent builder logic, tier evaluation

components/               React components
public/                   manifest, icons, service worker
```

-----

## Costs

Expected ~$15-25/month in API fees at moderate daily use. Breakdown in `PROJECT_INSTRUCTIONS.md` under “Cost controls.”

Claude Max subscription does NOT cover the API. The app uses Console API keys, billed separately.

-----

## Privacy

- All data lives in Jon’s Supabase project
- Audio files auto-delete after 30 days; transcripts kept forever
- No third-party analytics
- No data leaves the stack except for: Anthropic (parsing + insights + agents), OpenAI (Whisper), ElevenLabs/OpenAI (TTS)
- Each API call is logged in `api_usage` for transparency and cost tracking

-----

## Status

- [ ] Phase 1 — capture loop
- [ ] Phase 2 — workout mode
- [ ] Phase 3 — agents
- [ ] Phase 4 — insights
- [ ] Phase 5 — bloodwork
- [ ] Phase 6 — polish

-----

## Handoff to Claude Code

```
Read PROJECT_INSTRUCTIONS.md, DESIGN.md, and SCHEMA.sql.
Build Phase 1 end to end. Use the file structure in the README.
Ask before installing anything unusual.
```
