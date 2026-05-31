-- Per-day exclusions so vacation / illness / known-broken days don't
-- drag your adherence and insight numbers down. One row per (user, date).
-- A row with excluded=true means "drop this day from any adherence or
-- insight denominator." reason is freeform (vacation, eye injury, etc).

create table if not exists daily_overrides (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  date        date not null,
  excluded    boolean not null default true,
  reason      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_overrides_user_date_idx
  on daily_overrides(user_id, date);
