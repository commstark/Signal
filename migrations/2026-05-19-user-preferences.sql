-- 2026-05-19: Per-user calibrations / preferences.
--
-- Storage for user-specific numeric overrides that the parsers consult.
-- Example: "for me, a serving of meat is half a pound" stores
--   key='meat_serving_g', value_num=227, unit='g'.
--
-- key is a stable string (snake_case). value_num holds the structured
-- number for prompt injection; value_text covers free-form prefs that
-- aren't numeric. One row per (user_id, key).
--
-- Idempotent.

create table if not exists public.user_preferences (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  key         text not null,                       -- 'meat_serving_g', 'protein_shake_g', 'cup_volume_ml'
  value_num   numeric,                             -- structured value used by prompts
  value_text  text,                                -- free-form context if not numeric
  unit        text,                                -- 'g', 'ml', 'kcal' — display hint
  notes       text,                                -- the user's original wording
  source      text not null default 'voice',       -- 'voice' | 'manual' | 'seed'
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists user_preferences_user_idx
  on public.user_preferences (user_id);

alter table public.user_preferences enable row level security;
