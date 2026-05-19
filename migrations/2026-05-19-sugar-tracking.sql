-- 2026-05-19: Sugar tracking columns.
--
-- health_logs already has added_sugars_g. Adds total sugar_g there so
-- the dashboard tile aggregates the whole sugar load (natural + added),
-- not just added. food_log_items gains both columns so per-item
-- attribution matches the existing protein/calories/fiber/water pattern.
--
-- Idempotent.

alter table public.health_logs
  add column if not exists sugar_g numeric(6,2);

alter table public.food_log_items
  add column if not exists sugar_g numeric(6,2);

alter table public.food_log_items
  add column if not exists added_sugars_g numeric(6,2);
