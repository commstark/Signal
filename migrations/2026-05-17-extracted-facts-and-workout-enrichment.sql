-- 2026-05-17: Hybrid extraction layer + workout enrichment
--
-- Goals:
--  1. entries.extracted_facts (jsonb) captures the LLM's full structured
--     extraction even when a canonical insert fails — no data lost.
--  2. entries.parse_warnings (text[]) and parse_status make partial-parse
--     state visible in the UI instead of looking "fully logged".
--  3. workout_exercises gets exercise_type so cardio / isometric /
--     conditioning are distinguishable from strength.
--  4. workout_sets gains duration_s / distance_m / count so dead hangs,
--     skipping, runs, etc. don't have to pretend to be "reps and weight".
--  5. Backfill intervention_id on workout_exercises / supplement_logs
--     (missing from the live DB due to earlier schema drift).
--
-- Idempotent — safe to re-run.

alter table public.entries
  add column if not exists extracted_facts jsonb,
  add column if not exists parse_warnings text[],
  add column if not exists parse_status text;

alter table public.workout_exercises
  add column if not exists intervention_id uuid,
  add column if not exists exercise_type text;

alter table public.supplement_logs
  add column if not exists intervention_id uuid;

alter table public.workout_sets
  add column if not exists duration_s numeric(7,2),
  add column if not exists distance_m numeric(7,2),
  add column if not exists count int;

-- Force PostgREST to pick the new columns up immediately.
notify pgrst, 'reload schema';
