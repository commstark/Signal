-- Signal — Supabase schema
-- Run this in the Supabase SQL editor on a fresh project.
-- Single-user app, but designed with user_id columns so multi-user is a small lift later.

-- =====================================================================
-- Extensions
-- =====================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "vector";  -- for future semantic search over transcripts

-- =====================================================================
-- Users (minimal — just Jon, but parameterized for later)
-- =====================================================================
create table if not exists users (
  id          uuid primary key default uuid_generate_v4(),
  email       text unique,
  timezone    text not null default 'America/Los_Angeles',
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- Entries — every voice note becomes one row here
-- =====================================================================
create table if not exists entries (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references users(id) on delete cascade,
  occurred_at       timestamptz not null default now(),   -- when the user recorded it (PST)
  audio_url         text,                                  -- Supabase Storage path; nullable after 30d auto-delete
  audio_duration_s  numeric(6,2),
  transcript        text not null,                         -- raw Whisper output, kept forever
  intent            text not null,                         -- 'health_log' | 'workout_log' | 'supplement_log' | 'agent_question' | 'data_query' | 'intervention_start' | 'intervention_stop' | 'free_note' | 'mixed'
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

  -- nutrition (focused subset — no calorie counting)
  protein_g             numeric(6,2),
  fiber_g               numeric(6,2),
  added_sugars_g        numeric(6,2),
  saturated_fat_present boolean,
  carb_timing           text,                                -- 'morning' | 'midday' | 'evening' | 'late_night'
  ultra_processed       boolean,
  food_items            jsonb,                               -- [{name, portion, notes}]
  nutrition_confidence  text,                                -- 'high' | 'medium' | 'low'

  -- subjective markers
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
  exercise_name   text not null,                                    -- 'barbell bench press'
  muscle_group    text,                                              -- 'chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full_body'
  occurred_at     timestamptz not null,
  notes           text,
  created_at      timestamptz not null default now()
);

create index workout_exercises_user_occurred_idx on workout_exercises (user_id, occurred_at desc);
create index workout_exercises_muscle_idx        on workout_exercises (user_id, muscle_group, occurred_at desc);

create table if not exists workout_sets (
  id            uuid primary key default uuid_generate_v4(),
  exercise_id   uuid not null references workout_exercises(id) on delete cascade,
  set_number    int not null,
  weight_lb     numeric(6,2),
  weight_kg     numeric(6,2),                            -- generated for queries; UI shows lb by default
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
  supplement_name text not null,                       -- denormalized for resilience
  occurred_at     timestamptz not null,
  taken           boolean not null default true,        -- false if explicitly skipped
  notes           text,
  created_at      timestamptz not null default now()
);

create index supplement_logs_user_occurred_idx on supplement_logs (user_id, occurred_at desc);

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

-- =====================================================================
-- Agents — user-built health agents (Attia, Huberman, Arnold, etc.)
-- =====================================================================
create table if not exists agents (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references users(id) on delete cascade,
  name                text not null,                       -- display name, can be customized: "Attia (lipids)"
  public_figure       text,                                -- canonical name searched for
  focus_areas         text[],                              -- ['longevity', 'lipids']
  citation_style      text not null default 'summarize',   -- 'quote_sources' | 'summarize'
  tone                text not null default 'direct',      -- 'direct' | 'encouraging' | 'blunt'
  data_access_level   text not null default 'full',        -- 'full' | 'metrics_only' | 'none'
  off_limits_topics   text[],
  knowledge_summary   text,                                -- auto-generated description of source material
  confidence_tier     int,                                 -- 1-4
  sources_found       jsonb,                               -- [{type, title, count}]
  voice_id            text,                                -- ElevenLabs voice id (synthetic, never a clone)
  system_prompt       text,                                -- compiled at build time, regenerable
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

create index agents_user_active_idx on agents (user_id, active);

create table if not exists agent_conversations (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  agent_id    uuid not null references agents(id) on delete cascade,
  title       text,                                        -- first-message-derived
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index agent_conversations_user_updated_idx on agent_conversations (user_id, updated_at desc);

create table if not exists agent_messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references agent_conversations(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role            text not null,                            -- 'user' | 'agent'
  content         text not null,
  citations       jsonb,                                    -- [{source, snippet}]
  entry_id        uuid references entries(id) on delete set null,  -- if voice-asked
  model           text,
  cost_usd        numeric(8,5),
  reaction        text,                                     -- 'up' | 'down' | null
  created_at      timestamptz not null default now()
);

create index agent_messages_conv_idx on agent_messages (conversation_id, created_at);

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
-- Predictions — track bloodwork prediction accuracy over time
-- =====================================================================
create table if not exists bloodwork_predictions (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references users(id) on delete cascade,
  predicted_for_date  date not null,
  marker_key          text not null,
  predicted_low       numeric(10,4),
  predicted_high      numeric(10,4),
  rationale           text,
  model               text,
  cost_usd            numeric(8,5),
  actual_value        numeric(10,4),                        -- filled in after draw
  actual_draw_id      uuid references bloodwork_draws(id),
  accuracy_score      numeric(4,3),                         -- 0-1, computed after actual is set
  created_at          timestamptz not null default now()
);

create index bloodwork_predictions_user_marker_idx on bloodwork_predictions (user_id, marker_key, predicted_for_date desc);

-- =====================================================================
-- Summaries — rolling checkpoints for context management
-- =====================================================================
create table if not exists summaries (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  scope        text not null,                              -- 'daily' | 'weekly' | 'monthly'
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
  kind         text not null,                              -- 'weekly_reflection' | 'intervention_check' | 'pattern_alert' | 'predictive_prompt'
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
  service       text not null,                               -- 'whisper' | 'anthropic' | 'elevenlabs' | 'openai_tts'
  model         text,                                        -- 'claude-haiku-4-5', 'claude-sonnet-4-6', 'whisper-1'
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
-- Run AFTER inserting Jon's user row. Replace the UUID below with Jon's actual user.id.

-- insert into supplements (user_id, name, dose, timing, stack_group) values
--   ('JON_UUID', 'Vitamin D3',                            '2500-3000 IU',     'morning',    'morning_stack'),
--   ('JON_UUID', 'Boswellia',                             null,               'morning',    'morning_stack'),
--   ('JON_UUID', 'Turmeric + pepper',                     null,               'morning',    'morning_stack'),
--   ('JON_UUID', 'Fish oil',                              null,               'morning',    'morning_stack'),
--   ('JON_UUID', 'Multivitamin',                          'New Chapter mens', 'morning',    'morning_stack'),
--   ('JON_UUID', 'Ashwagandha + pepper',                  null,               'morning',    'morning_stack'),
--   ('JON_UUID', 'K2',                                    '120 mcg',          'morning',    'morning_stack'),
--   ('JON_UUID', 'Inositol',                              '500mg',            'morning',    'morning_stack'),
--   ('JON_UUID', 'Extra virgin olive oil (cold pressed)', '15 ml',            'morning',    'morning_stack'),
--   ('JON_UUID', 'Protein powder',                        null,               'with_meals', null),
--   ('JON_UUID', 'Collagen peptides',                     '9g',               'night',      'sleep_stack'),
--   ('JON_UUID', 'Vitamin C',                             '500mg',            'night',      'sleep_stack'),
--   ('JON_UUID', 'Magnesium bisglycinate',                '400mg',            'night',      'sleep_stack'),
--   ('JON_UUID', 'L-theanine',                            null,               'night',      'sleep_stack'),
--   ('JON_UUID', 'Glycine',                               null,               'night',      'sleep_stack'),
--   ('JON_UUID', 'Melatonin',                             '1mg',              'night',      'sleep_stack');

-- =====================================================================
-- RLS — simple gate. Single user, but enable for safety in case multi-user later.
-- =====================================================================
alter table users                  enable row level security;
alter table entries                enable row level security;
alter table health_logs            enable row level security;
alter table workout_sessions       enable row level security;
alter table workout_exercises      enable row level security;
alter table workout_sets           enable row level security;
alter table supplements            enable row level security;
alter table supplement_logs        enable row level security;
alter table interventions          enable row level security;
alter table insights               enable row level security;
alter table agents                 enable row level security;
alter table agent_conversations    enable row level security;
alter table agent_messages         enable row level security;
alter table bloodwork_draws        enable row level security;
alter table bloodwork_markers      enable row level security;
alter table bloodwork_predictions  enable row level security;
alter table summaries              enable row level security;
alter table notifications          enable row level security;
alter table push_subscriptions     enable row level security;
alter table api_usage              enable row level security;

-- Permissive policy for the single-user case. Replace with auth.uid() checks when going multi-user.
-- For now: rely on service-role key from Next.js API routes, no anonymous access.

-- =====================================================================
-- Storage buckets
-- =====================================================================
-- In Supabase dashboard, create these buckets:
--   audio       (private, 30-day lifecycle policy for auto-delete)
--   bloodwork   (private, no lifecycle)
