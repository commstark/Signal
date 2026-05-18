-- 2026-05-17: Open questions — quick capture from the record screen.
--
-- The user drops questions they want to ask "later" (e.g. "did my sleep
-- improve since starting magnesium?") so we have a real corpus for
-- designing the dashboard and the in-app ask agent.
--
-- Idempotent.

create table if not exists public.open_questions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  question    text not null,
  asked_at    timestamptz not null default now(),
  answered_at timestamptz,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists open_questions_user_open_idx
  on public.open_questions (user_id, asked_at desc)
  where answered_at is null;
create index if not exists open_questions_user_all_idx
  on public.open_questions (user_id, asked_at desc);

alter table public.open_questions enable row level security;
