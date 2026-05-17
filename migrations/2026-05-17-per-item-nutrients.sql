-- 2026-05-17: Per-item nutrient attribution on food_log_items
--
-- Goal: the dashboard breakdown drawer ("what made up today's 80g protein?")
-- shows one row per food item with that item's contribution, instead of
-- showing the entry's joined item names next to the entry's aggregate total.
-- Required so e.g. fiber shows "psyllium husk 5g" rather than "protein shake".
--
-- Idempotent.

alter table public.food_log_items
  add column if not exists protein_g     numeric(6,2),
  add column if not exists calories_kcal numeric(7,1),
  add column if not exists fiber_g       numeric(6,2),
  add column if not exists water_ml      numeric(7,1);
