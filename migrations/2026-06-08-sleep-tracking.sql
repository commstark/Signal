-- Sleep is logged either by voice ("slept great", "slept 7 hours") or by
-- tapping a 5-step pill on /today (Horrible/Bad/OK/Good/Great). The pill
-- writes a normal entry + health_log row with only the sleep_* columns
-- set, so it shows up in the log audit trail just like a voice note.
--
-- sleep_score is 1..5 (qualitative band) — explicitly NOT the 1..10 scale
-- used by mood/energy/concentration. The 5-step UI is what the user
-- asked for; collapsing it to 1..10 would force a guess that doesn't
-- exist. Keep the columns separate so insight pipelines that look at
-- *_score don't accidentally treat sleep as a 1..10 axis.
alter table health_logs
  add column if not exists sleep_score      int check (sleep_score between 1 and 5),
  add column if not exists sleep_descriptor text,
  add column if not exists sleep_hours      numeric(4,2);

create index if not exists health_logs_user_sleep_idx
  on health_logs (user_id, occurred_at desc)
  where sleep_score is not null;
