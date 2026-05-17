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
- **`parse_status` column on `entries`** (`ok | partial | failed`) so orphan entries (transcript saved, structured write failed) are visible in the UI instead of looking "logged".

## Production URL
https://signal-seven-rose.vercel.app — back-tap / Action Button Shortcut should open the bare URL (no `?mode=auto`; redundant).
