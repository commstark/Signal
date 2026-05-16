-- Signal — Supabase schema
-- Run this in the Supabase SQL editor on a fresh project.
-- Single-user app, but designed with user_id columns so multi-user is a small lift later.

-- =====================================================================
-- Extensions
-- =====================================================================
create extension if not exists "uuid-ossp";
-- Note: vector extension intentionally not enabled. Add when semantic search is built.

-- =====================================================================
-- Users (profile data; id matches Supabase auth.users.id)
-- =====================================================================
-- A trigger (defined below) auto-inserts a row here whenever a new
-- auth.users row is created via magic-link sign-in. profile_md and
-- timezone can be edited from Settings later.
create table if not exists users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique,
  timezone    text not null default 'America/Los_Angeles',
  profile_md  text,                                         -- free-text health background (markdown), fed into Sonnet as cached context
  created_at  timestamptz not null default now()
);

-- Auto-create a public.users row whenever someone signs in for the first time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
-- Entries — every voice note becomes one row here
-- =====================================================================
create table if not exists entries (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references users(id) on delete cascade,
  occurred_at       timestamptz not null default now(),   -- when the user recorded it (PST)
  audio_url         text,                                  -- Supabase Storage path; nullable after 30d auto-delete
  audio_duration_s  numeric(6,2),
  transcript        text not null,                         -- raw Whisper output, kept forever; user-editable
  transcript_edited boolean not null default false,        -- true if user corrected the Whisper output
  intent            text not null,                         -- 'health_log' | 'workout_log' | 'supplement_log' | 'intervention_start' | 'intervention_stop' | 'free_note' | 'mixed'
  parse_model       text,                                  -- e.g. 'claude-haiku-4-5'
  parse_cost_usd    numeric(8,5),
  created_at        timestamptz not null default now()
);

create index entries_user_occurred_idx on entries (user_id, occurred_at desc);
create index entries_intent_idx        on entries (user_id, intent, occurred_at desc);

-- =====================================================================
-- Health log facts — structured nutrition/mood/energy per entry
-- =====================================================================
create table if not exists health_logs (
  id                  uuid primary key default uuid_generate_v4(),
  entry_id            uuid not null references entries(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  occurred_at         timestamptz not null,

  -- link to active intervention if any (FK added after interventions table is defined; see end of file)
  intervention_id     uuid,

  -- nutrition (focused subset — protein is the headline; calories secondary, low-precision)
  protein_g             numeric(6,2),
  calories_kcal         numeric(7,1),
  fiber_g               numeric(6,2),
  added_sugars_g        numeric(6,2),
  saturated_fat_present boolean,
  carb_timing           text,                                -- 'morning' | 'midday' | 'evening' | 'late_night'
  ultra_processed       boolean,
  nutrition_confidence  text,                                -- 'high' | 'medium' | 'low'

  -- subjective markers (scores are null unless explicitly stated in the transcript)
  mood_score          int check (mood_score between 1 and 10),
  mood_descriptor     text,
  energy_score        int check (energy_score between 1 and 10),
  energy_descriptor   text,
  concentration_score int check (concentration_score between 1 and 10),
  fullness            text,                                -- 'hungry' | 'satisfied' | 'full' | 'stuffed'

  -- symptoms
  symptoms            text[],                              -- ['headache', 'brain_fog', ...]

  -- catch-all
  water_oz            numeric(5,1),
  free_text_notes     text,

  created_at          timestamptz not null default now()
);

create index health_logs_user_occurred_idx on health_logs (user_id, occurred_at desc);
create index health_logs_intervention_idx on health_logs (intervention_id) where intervention_id is not null;

-- Normalized food items so pattern hunting can query "how often did Jon eat beans"
-- without jsonb gymnastics.
create table if not exists food_log_items (
  id              uuid primary key default uuid_generate_v4(),
  health_log_id   uuid not null references health_logs(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  name            text not null,                           -- 'bean salad over rice'
  canonical_tag   text,                                    -- 'beans', 'rice', 'olive_oil', 'fermented' — lowercase, snake_case
  portion         text,                                    -- 'large bowl', '1 cup', '15 ml'
  notes           text,
  occurred_at     timestamptz not null,
  created_at      timestamptz not null default now()
);

create index food_log_items_user_tag_idx       on food_log_items (user_id, canonical_tag, occurred_at desc);
create index food_log_items_health_log_idx     on food_log_items (health_log_id);

-- =====================================================================
-- Workouts — sessions, exercises, sets
-- =====================================================================
create table if not exists workout_sessions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references users(id) on delete cascade,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  session_notes text,
  created_at    timestamptz not null default now()
);

create index workout_sessions_user_started_idx on workout_sessions (user_id, started_at desc);

create table if not exists workout_exercises (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references workout_sessions(id) on delete cascade,
  entry_id        uuid references entries(id) on delete set null,  -- which voice note logged this
  user_id         uuid not null references users(id) on delete cascade,
  intervention_id uuid,                                              -- FK added at end of file
  exercise_name   text not null,                                    -- 'barbell bench press'
  muscle_group    text,                                              -- 'chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full_body'
  occurred_at     timestamptz not null,
  notes           text,
  created_at      timestamptz not null default now()
);

create index workout_exercises_user_occurred_idx on workout_exercises (user_id, occurred_at desc);
create index workout_exercises_muscle_idx        on workout_exercises (user_id, muscle_group, occurred_at desc);
create index workout_exercises_intervention_idx  on workout_exercises (intervention_id) where intervention_id is not null;

create table if not exists workout_sets (
  id            uuid primary key default uuid_generate_v4(),
  exercise_id   uuid not null references workout_exercises(id) on delete cascade,
  set_number    int not null,
  weight_lb     numeric(6,2),
  reps          int,
  rpe           numeric(3,1),                            -- rate of perceived exertion 1-10
  notes         text,
  created_at    timestamptz not null default now()
);

create index workout_sets_exercise_idx on workout_sets (exercise_id, set_number);

-- =====================================================================
-- Supplements — known stack + daily adherence
-- =====================================================================
create table if not exists supplements (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  name         text not null,                          -- 'Vitamin D3', 'Inositol'
  brand        text,                                    -- 'CanPrev', 'AOR'
  dose         text,                                    -- '2500 IU', '500mg'
  timing       text,                                    -- 'morning' | 'lunch' | 'evening' | 'night' | 'with_meals'
  is_stack     boolean not null default true,           -- false if it's an experimental one-off
  stack_group  text,                                    -- 'morning_stack', 'sleep_stack', etc.
  active       boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now()
);

create index supplements_user_active_idx on supplements (user_id, active, timing);

create table if not exists supplement_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  entry_id        uuid references entries(id) on delete set null,
  supplement_id   uuid references supplements(id) on delete set null,
  intervention_id uuid,                                  -- FK added at end of file
  supplement_name text not null,                       -- denormalized for resilience
  occurred_at     timestamptz not null,
  taken           boolean not null default true,        -- false if explicitly skipped
  notes           text,
  created_at      timestamptz not null default now()
);

create index supplement_logs_user_occurred_idx on supplement_logs (user_id, occurred_at desc);
create index supplement_logs_intervention_idx on supplement_logs (intervention_id) where intervention_id is not null;

-- =====================================================================
-- Interventions — anything Jon changes (start/stop a supplement, food, behavior)
-- =====================================================================
create table if not exists interventions (
  id                        uuid primary key default uuid_generate_v4(),
  user_id                   uuid not null references users(id) on delete cascade,
  entry_id                  uuid references entries(id) on delete set null,
  name                      text not null,                  -- 'Inositol 500mg with breakfast'
  type                      text not null,                  -- 'supplement' | 'food' | 'behavior' | 'exercise' | 'other'
  direction                 text not null,                  -- 'start' | 'stop' | 'change'
  started_at                timestamptz not null,
  ended_at                  timestamptz,
  expected_window_days      int default 21,
  baseline_metrics_snapshot jsonb,                         -- mood/energy/fullness/etc. avg for prior 14d
  notes                     text,
  status                    text not null default 'active', -- 'active' | 'completed' | 'abandoned'
  created_at                timestamptz not null default now()
);

create index interventions_user_status_idx on interventions (user_id, status, started_at desc);

-- =====================================================================
-- Insights — what the pattern engine surfaces
-- =====================================================================
create table if not exists insights (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  kind            text not null,                          -- 'weekly_reflection' | 'pattern' | 'intervention_check' | 'pattern_alert' | 'predictive_prompt'
  title           text,
  body            text not null,
  supporting_data jsonb,                                   -- the rows/aggregations that produced it
  window_start    timestamptz,
  window_end      timestamptz,
  intervention_id uuid references interventions(id) on delete set null,
  model           text,
  cost_usd        numeric(8,5),
  surfaced_at     timestamptz not null default now(),
  user_reaction   text,                                    -- 'helpful' | 'not_helpful' | null
  created_at      timestamptz not null default now()
);

create index insights_user_surfaced_idx on insights (user_id, surfaced_at desc);
create index insights_kind_idx          on insights (user_id, kind, surfaced_at desc);

-- Agent tables intentionally removed: open-ended chat happens in Claude/ChatGPT
-- via the Ask AI export. We don't store agents, conversations, or messages.

-- =====================================================================
-- Medical documents — uploaded health-history files (PDFs, images, notes)
-- Extracted text is concatenated into the user's background block.
-- =====================================================================
create table if not exists medical_documents (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  title           text not null,                                -- "2025 December NiaHealth panel"
  kind            text,                                          -- 'bloodwork' | 'doctors_note' | 'genetic' | 'prescription' | 'family_history' | 'other'
  pdf_url         text,                                          -- Supabase Storage path in 'bloodwork' or 'medical' bucket
  extracted_text  text,                                          -- OCR'd / parsed contents
  doc_date        date,                                          -- date the document represents (not upload date)
  notes           text,
  created_at      timestamptz not null default now()
);

create index medical_documents_user_idx on medical_documents (user_id, doc_date desc);

-- =====================================================================
-- Bloodwork — lab results over time
-- =====================================================================
create table if not exists bloodwork_draws (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  drawn_at     timestamptz not null,
  lab          text,                                       -- 'NiaHealth'
  pdf_url      text,
  notes        text,
  created_at   timestamptz not null default now()
);

create index bloodwork_draws_user_drawn_idx on bloodwork_draws (user_id, drawn_at desc);

create table if not exists bloodwork_markers (
  id             uuid primary key default uuid_generate_v4(),
  draw_id        uuid not null references bloodwork_draws(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  marker_key     text not null,                              -- 'a1c', 'homa_ir', 'tyg', 'vit_d', 'hdl', 'non_hdl_c', 'hs_crp', 'platelets', 'testosterone_total'
  marker_label   text not null,                              -- 'A1c'
  value          numeric(10,4),
  unit           text,                                       -- '%', 'nmol/L'
  flag           text,                                       -- 'low' | 'normal' | 'high' | 'optimal' | 'suboptimal'
  reference_low  numeric(10,4),
  reference_high numeric(10,4),
  optimal_low    numeric(10,4),
  optimal_high   numeric(10,4),
  created_at     timestamptz not null default now()
);

create index bloodwork_markers_user_marker_idx on bloodwork_markers (user_id, marker_key);

-- =====================================================================
-- Bloodwork expectations — "what should I be hoping to see at the next draw"
-- Set before a planned draw, scored after the actual upload.
-- =====================================================================
create table if not exists bloodwork_expectations (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references users(id) on delete cascade,
  expected_for_date   date not null,                        -- planned draw date
  marker_key          text not null,
  expected_low        numeric(10,4),
  expected_high       numeric(10,4),
  direction           text,                                  -- 'down' | 'up' | 'hold'
  rationale           text,                                  -- 'fiber up 40%, added sugar down -> A1c likely lower'
  model               text,
  cost_usd            numeric(8,5),
  actual_value        numeric(10,4),                        -- filled in after draw
  actual_draw_id      uuid references bloodwork_draws(id),
  outcome             text,                                  -- 'hit' | 'miss' | 'direction_correct'
  created_at          timestamptz not null default now()
);

create index bloodwork_expectations_user_marker_idx on bloodwork_expectations (user_id, marker_key, expected_for_date desc);

-- =====================================================================
-- Summaries — rolling checkpoints for context management
-- =====================================================================
create table if not exists summaries (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  scope        text not null,                              -- 'weekly' (Sonnet reflection cache). Daily/monthly may come later; we don't pre-compress daily into Haiku digests.
  period_start timestamptz not null,
  period_end   timestamptz not null,
  body         text not null,                              -- the LLM summary
  token_count  int,
  model        text,
  cost_usd     numeric(8,5),
  created_at   timestamptz not null default now()
);

create index summaries_user_scope_idx on summaries (user_id, scope, period_start desc);

-- =====================================================================
-- Notifications — for push notification tracking
-- =====================================================================
create table if not exists notifications (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  kind         text not null,                              -- 'weekly_reflection' | 'intervention_check' | 'pattern_alert'
  title        text not null,
  body         text not null,
  insight_id   uuid references insights(id) on delete set null,
  scheduled_at timestamptz,
  sent_at      timestamptz,
  opened_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_user_sent_idx on notifications (user_id, sent_at desc);

-- =====================================================================
-- Push subscriptions — Web Push API endpoints
-- =====================================================================
create table if not exists push_subscriptions (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  endpoint     text not null,
  p256dh_key   text not null,
  auth_key     text not null,
  device_label text,
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- API usage tracking — keep running tally of monthly costs
-- =====================================================================
create table if not exists api_usage (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references users(id) on delete cascade,
  service       text not null,                               -- 'whisper' | 'anthropic'
  model         text,                                        -- 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'whisper-1'
  endpoint      text,
  input_tokens  int,
  output_tokens int,
  audio_seconds numeric(8,2),
  cost_usd      numeric(8,5),
  entry_id      uuid references entries(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index api_usage_user_created_idx on api_usage (user_id, created_at desc);
create index api_usage_service_idx       on api_usage (user_id, service, created_at desc);

-- =====================================================================
-- Seed data — Jon's known supplement stack
-- =====================================================================
-- Run AFTER you've signed in via magic-link at least once (which creates
-- your auth.users row and, via the trigger above, your public.users row).
-- This block finds your user id automatically; no UUID copy/paste needed.

-- do $$
-- declare
--   me uuid;
-- begin
--   select id into me from users limit 1;
--   if me is null then
--     raise exception 'no user row found — sign in via the app first';
--   end if;
--
--   insert into supplements (user_id, name, dose, timing, stack_group) values
--     (me, 'Vitamin D3',                            '2500-3000 IU',     'morning',    'morning_stack'),
--     (me, 'Boswellia',                             null,               'morning',    'morning_stack'),
--     (me, 'Turmeric + pepper',                     null,               'morning',    'morning_stack'),
--     (me, 'Fish oil',                              null,               'morning',    'morning_stack'),
--     (me, 'Multivitamin',                          'New Chapter mens', 'morning',    'morning_stack'),
--     (me, 'Ashwagandha + pepper',                  null,               'morning',    'morning_stack'),
--     (me, 'K2',                                    '120 mcg',          'morning',    'morning_stack'),
--     (me, 'Inositol',                              '500mg',            'morning',    'morning_stack'),
--     (me, 'Extra virgin olive oil (cold pressed)', '15 ml',            'morning',    'morning_stack'),
--     (me, 'Protein powder',                        null,               'with_meals', null),
--     (me, 'Collagen peptides',                     '9g',               'night',      'sleep_stack'),
--     (me, 'Vitamin C',                             '500mg',            'night',      'sleep_stack'),
--     (me, 'Magnesium bisglycinate',                '400mg',            'night',      'sleep_stack'),
--     (me, 'L-theanine',                            null,               'night',      'sleep_stack'),
--     (me, 'Glycine',                               null,               'night',      'sleep_stack'),
--     (me, 'Melatonin',                             '1mg',              'night',      'sleep_stack');
-- end $$;

-- =====================================================================
-- Deferred foreign keys (intervention_id) — added here because health_logs,
-- supplement_logs, and workout_exercises are defined before interventions.
-- =====================================================================
alter table health_logs
  add constraint health_logs_intervention_id_fkey
  foreign key (intervention_id) references interventions(id) on delete set null;

alter table supplement_logs
  add constraint supplement_logs_intervention_id_fkey
  foreign key (intervention_id) references interventions(id) on delete set null;

alter table workout_exercises
  add constraint workout_exercises_intervention_id_fkey
  foreign key (intervention_id) references interventions(id) on delete set null;

-- =====================================================================
-- RLS — simple gate. Single user, but enable for safety in case multi-user later.
-- =====================================================================
alter table users                    enable row level security;
alter table entries                  enable row level security;
alter table health_logs              enable row level security;
alter table food_log_items           enable row level security;
alter table workout_sessions         enable row level security;
alter table workout_exercises        enable row level security;
alter table workout_sets             enable row level security;
alter table supplements              enable row level security;
alter table supplement_logs          enable row level security;
alter table interventions            enable row level security;
alter table insights                 enable row level security;
alter table medical_documents        enable row level security;
alter table bloodwork_draws          enable row level security;
alter table bloodwork_markers        enable row level security;
alter table bloodwork_expectations   enable row level security;
alter table summaries                enable row level security;
alter table notifications            enable row level security;
alter table push_subscriptions       enable row level security;
alter table api_usage                enable row level security;

-- Permissive policy for the single-user case. Replace with auth.uid() checks when going multi-user.
-- For now: rely on service-role key from Next.js API routes, no anonymous access.

-- =====================================================================
-- Storage buckets
-- =====================================================================
-- In Supabase dashboard, create these buckets:
--   audio       (private, 30-day lifecycle policy for auto-delete)
--   bloodwork   (private, no lifecycle)
--   medical     (private, no lifecycle) -- uploaded doctor's notes, genetic tests, etc.
