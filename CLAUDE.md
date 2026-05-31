# Signal — session notes for Claude

## Pending setup tasks
- **Supabase MCP server is installed and working** (project-ref `ignnedeffcygciarskua`). Claude has direct read/write DB access — no more pasting SQL back and forth.
- **Custom SMTP in Supabase** (Resend) to kill the magic-link rate limit.
- **Drop unused legacy tables** when convenient: `agents`, `agent_conversations`, `agent_messages`, `bloodwork_predictions`.

## Open design discussions
- **Workout schema upgrade for cross-analysis.** Current `exercises[]` + `sets[]` shape loses signal for cardio (skipping), isometric holds (dead hangs), incidents (pulled muscle / cut short). Proposed additions: `exercise_type` enum (strength | cardio | conditioning | mobility | isometric), `duration_s` / `distance_m` / `count` on sets, `incident` on session, denormalized `volume_lb` per session per muscle_group.

## UI principles
- **Teach the app through small, ambient visuals — not manuals or walls of text.** Prefer showing state over telling. Status dots, inline example prompts, micro-affordances, empty-state hints. The user should learn how the app works by using it and watching it respond, never by reading instructions. (This is a standing goal — see global core memory.)
- **Parse-status vocabulary** (one set of colors everywhere, via `components/StatusDot.tsx`): orange + pulse = working (transcribing/parsing/`pending`), green = done (`ok`/saved), amber = `partial`, red = `failed`, grey = idle/queued. Used on the recording screen (`app/page.tsx`) and `/today`.
- `parse_status` on `entries` (`pending | ok | partial | failed`) is **implemented** and surfaced via the dot vocabulary above, so orphan entries (transcript saved, structured write failed) no longer look "logged". `/today` polls (`PendingRefresher`) so a `pending` dot flips orange→green on its own.

## Weekly insights pipeline
- **Cron**: Vercel scheduled `GET /api/insights/weekly` (`vercel.json`, Saturday 5am UTC = Friday 9pm PST). Auth via `Authorization: Bearer ${CRON_SECRET}`.
- **Engine**: `lib/insights/` — `aggregate.ts` (data pull) → `candidates.ts` (4 deterministic kinds: correlation / group_compare / intervention_window / adherence_outcome, all threshold-filtered) → `narrate.ts` (Sonnet 4.6, ranks by SURPRISE, NEVER invents stats) → `run.ts` (orchestrator, supersedes prior week's actives, fans out push).
- **Tables**: `weekly_insights` (kind, headline, why_it_matters, caveats, metrics, evidence) + `insight_feedback` (up/down/wrong; folded back into next week's prompt as personalization).
- **Eval**: `npx tsx evals/insights/run-eval.ts` — runs the narrator against 3 synthetic fixtures, scores via a judge prompt on 5 axes (correctness, surprise, actionability, calibration, non_redundancy). Pass = 4+/5 on every axis. Run before merging prompt changes.
- **Manual trigger**: `POST /api/insights/run-now` (auth: any logged-in user; bounded to their own user_id).
- **UI**: `components/InsightsSection.tsx` on `/today` (above workouts). Each card has up/down/wrong feedback + "Show how" expandable with the deterministic math.

## Push notifications
- **Web Push API** via the `web-push` library. Service worker (`public/sw.js`) handles `push` + `notificationclick` events. Subscription opt-in from `/today`.
- **Required env vars**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto). Generate with `npx web-push generate-vapid-keys`.
- **Also required**: `CRON_SECRET` (any random string; `openssl rand -base64 32`).
- iOS only delivers PWA push *after* the user adds Signal to home screen and grants notification permission — first-time experience needs both.

## Production URL
https://signal-seven-rose.vercel.app — back-tap / Action Button Shortcut should open the bare URL (no `?mode=auto`; redundant).
