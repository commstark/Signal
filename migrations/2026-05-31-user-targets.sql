-- Per-user daily targets + ceilings used to drive the /today tile fills.
-- JSONB so additions don't need new migrations. Defaults are baked in
-- lib/targets.ts; this column only stores user-set overrides.

alter table users
  add column if not exists targets jsonb not null default '{}'::jsonb;
