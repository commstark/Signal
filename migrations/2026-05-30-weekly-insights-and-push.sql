-- Weekly insights pipeline + push notifications + feedback loop.
--
-- weekly_insights: one row per insight (kind=correlation|group_compare|
--   intervention_window|adherence_outcome). metrics is the deterministic
--   math (means, n, effect size, threshold). evidence is the raw paired
--   points so the dashboard can render the dot plot / before-after strip
--   that proves the headline.
--
-- insight_feedback: thumbs up / down / "wrong" per insight. The next
--   weekly run reads recent feedback and folds it into the prompt as
--   "the user upvoted these patterns; downvoted these."
--
-- push_subscriptions: one row per (user, device). web-push expects the
--   endpoint + p256dh + auth key triplet.

create table if not exists weekly_insights (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  computed_at     timestamptz not null default now(),
  window_start    date not null,
  window_end      date not null,
  kind            text not null check (kind in (
    'correlation', 'group_compare', 'intervention_window', 'adherence_outcome'
  )),
  domains         text[] not null default '{}',
  headline        text not null,
  why_it_matters  text,
  caveats         text[] not null default '{}',
  surprise_score  numeric,
  metrics         jsonb not null,
  evidence        jsonb,
  status          text not null default 'active' check (status in (
    'active', 'dismissed', 'snoozed', 'superseded'
  )),
  created_at      timestamptz not null default now()
);

create index if not exists weekly_insights_user_computed_idx
  on weekly_insights(user_id, computed_at desc);
create index if not exists weekly_insights_user_status_idx
  on weekly_insights(user_id, status)
  where status = 'active';

create table if not exists insight_feedback (
  id              uuid primary key default uuid_generate_v4(),
  insight_id      uuid not null references weekly_insights(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  -- 'up' = useful; 'down' = not useful / obvious; 'wrong' = the stat
  -- or claim is incorrect (highest-priority signal for prompt tuning).
  verdict         text not null check (verdict in ('up', 'down', 'wrong')),
  note            text,
  created_at      timestamptz not null default now(),
  unique (insight_id, user_id)
);

create index if not exists insight_feedback_user_idx
  on insight_feedback(user_id, created_at desc);

-- push_subscriptions already exists in SCHEMA.sql with the columns
-- p256dh_key / auth_key / device_label. Add what's missing for the
-- send-and-cleanup flow: last_used_at + a unique (user_id, endpoint)
-- so we can upsert per device.
alter table push_subscriptions
  add column if not exists last_used_at timestamptz;

do $$ begin
  alter table push_subscriptions
    add constraint push_subscriptions_user_endpoint_uniq
    unique (user_id, endpoint);
exception when duplicate_object then null;
end $$;

create index if not exists push_subscriptions_user_idx
  on push_subscriptions(user_id);
