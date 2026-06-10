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
- **Morning push** (8am local) is a sleep nudge: drops the user on `/today#sleep` so one tap on the pill (horrible/bad/ok/good/great) records sleep without recording a voice note. Evening push is a catch-up reminder for the same tile.

## Sleep tracking
- 5-step qualitative scale (NOT 1-10): 1=horrible, 2=bad, 3=ok, 4=good, 5=great. Columns on `health_logs`: `sleep_score int (1-5)`, `sleep_descriptor text`, `sleep_hours numeric(4,2)`.
- Two entry paths: tap-to-log via `SleepTile` on `/today` → `POST /api/sleep/log` writes an entry + health_log row, and voice (`lib/prompts/parse-health.ts` 1a maps "horrible/bad/ok/good/great" + synonyms to 1-5).
- /today displays the LATEST sleep_score for the day so re-tapping a different band corrects the reading; older rows stay in the log audit trail.
- Mood tile is removed from /today (user isn't logging mood). `mood_score` column + parser still exist for any insights logic that references it.

## Labs pipeline (in progress)
- **Goal**: upload lab PDFs / screenshots (blood, NewAlth, DEXA, body comp), Claude extracts every analyte, /labs shows trends, weekly insights cross-references diet/sleep/supplements against marker movement.
- **Optimal-range source**: Huberman guests' published frameworks — Attia's Outlive targets for blood, Galpin lab for DEXA/composition, Norton for protein, Lustig for sugar/metabolic. Each target row cites the source.
- **Recommendation tone**: specific protocol suggestions (dose + duration + recheck window). Beta users get a single-line "not medical advice" disclaimer on every card.
- **PR #1 (this one — raw ingestion, no canonicalization)**:
  - **Tables**: `lab_uploads` (file + parse_status), `lab_panels` (one per (date, panel_type)), `lab_analytes` (rows as printed; `analyte_key` left null for PR #2 canonicalization). Migration `2026-06-09-lab-uploads.sql` — apply manually in Supabase, includes private bucket `lab-uploads` + storage RLS.
  - **API**: `POST /api/labs/upload` (multipart, max 10MB, PDF/PNG/JPEG/WebP). Inline — uploads to storage, calls Sonnet 4.6, writes panels + analytes, returns `{upload_id, parse_status, panels_written, analytes_written, confidence, warnings}`.
  - **Engine**: `lib/labs/extract.ts` (PDF document blocks for PDFs, image blocks for screenshots). Prompt is faithful transcription — no canonicalization, no unit conversion, no interpretation.
  - **UI**: `/labs` (upload zone + uploads list with parse_status), `/labs/[id]` (per-panel analyte table).
- **PR #2 (next — canonicalization + targets)**: `analyte_catalog` (canonical keys + display names + default units), `analyte_targets` (per-key optimal_low/high + Huberman-guest citation + user override rows), trend sparklines on /labs.
- **PR #3 (final — recommendations)**: `lab_marker_change` insight kind in `lib/insights/candidates.ts`; protocol-suggestion cards on /today.

## Production URL
https://signal-seven-rose.vercel.app — back-tap / Action Button Shortcut should open the bare URL (no `?mode=auto`; redundant).
