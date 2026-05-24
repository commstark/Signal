# Signal — session notes for Claude

## Pending setup tasks
- **Install Supabase MCP server.** From your laptop:
  ```
  npx -y @supabase/mcp-server-supabase --access-token <PAT> --project-ref ignnedeffcygciarskua
  ```
  Then add to Claude Code settings.json and restart. This gives Claude direct read/write access to the DB so we stop pasting SQL back and forth.
- **Custom SMTP in Supabase** (Resend) to kill the magic-link rate limit.
- **Drop unused legacy tables** when convenient: `agents`, `agent_conversations`, `agent_messages`, `bloodwork_predictions`.

## Open design discussions
- **Workout schema upgrade for cross-analysis.** Current `exercises[]` + `sets[]` shape loses signal for cardio (skipping), isometric holds (dead hangs), incidents (pulled muscle / cut short). Proposed additions: `exercise_type` enum (strength | cardio | conditioning | mobility | isometric), `duration_s` / `distance_m` / `count` on sets, `incident` on session, denormalized `volume_lb` per session per muscle_group.

## UI principles
- **Teach the app through small, ambient visuals — not manuals or walls of text.** Prefer showing state over telling. Status dots, inline example prompts, micro-affordances, empty-state hints. The user should learn how the app works by using it and watching it respond, never by reading instructions. (This is a standing goal — see global core memory.)
- **Parse-status vocabulary** (one set of colors everywhere, via `components/StatusDot.tsx`): orange + pulse = working (transcribing/parsing/`pending`), green = done (`ok`/saved), amber = `partial`, red = `failed`, grey = idle/queued. Used on the recording screen (`app/page.tsx`) and `/today`.
- `parse_status` on `entries` (`pending | ok | partial | failed`) is **implemented** and surfaced via the dot vocabulary above, so orphan entries (transcript saved, structured write failed) no longer look "logged". `/today` polls (`PendingRefresher`) so a `pending` dot flips orange→green on its own.

## Production URL
https://signal-seven-rose.vercel.app — back-tap / Action Button Shortcut should open the bare URL (no `?mode=auto`; redundant).
