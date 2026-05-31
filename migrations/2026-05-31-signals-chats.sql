-- Q&A history for /signals. One row per question. answer_text holds the
-- final narrated answer; chart_specs holds zero-or-more chart specs that
-- the client renders inline. evidence is a bag of tool-result snippets
-- the model leaned on, so a future "show how" expand can prove the
-- numbers came from real data, not hallucination.

create table if not exists signals_chats (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  question        text not null,
  answer_text     text,
  chart_specs     jsonb not null default '[]'::jsonb,
  evidence        jsonb not null default '[]'::jsonb,
  tool_calls      int not null default 0,
  input_tokens    int not null default 0,
  output_tokens   int not null default 0,
  cost_usd        numeric(8,5) not null default 0,
  duration_ms     int,
  status          text not null default 'ok' check (status in ('ok', 'failed')),
  created_at      timestamptz not null default now()
);

create index if not exists signals_chats_user_created_idx
  on signals_chats(user_id, created_at desc);
