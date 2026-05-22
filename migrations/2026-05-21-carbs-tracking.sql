-- 2026-05-21: Carb tracking columns.
--
-- carbs_g is total carbohydrate (the parent number; sugar is a subset).
-- Mirrors the sugar columns: entry-level on health_logs, per-item on
-- food_log_items.
--
-- Idempotent.

alter table public.health_logs
  add column if not exists carbs_g numeric(6,2);

alter table public.food_log_items
  add column if not exists carbs_g numeric(6,2);
