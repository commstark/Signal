-- 2026-05-17: Personas for the /ask copy-prompt feature.
--
-- Each persona is a system prompt the user can pick when assembling a
-- context bundle to paste into ChatGPT/Claude. DB-backed so personas can
-- be edited / added later from a UI without a deploy.
--
-- Idempotent.

create table if not exists public.personas (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  name          text not null,                -- "Dr. Andrew Huberman"
  slug          text not null,                -- "huberman" — stable handle for seeding
  description   text,                         -- short label for the dropdown
  system_prompt text not null,
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists personas_user_active_idx
  on public.personas (user_id, active, sort_order);

alter table public.personas enable row level security;
