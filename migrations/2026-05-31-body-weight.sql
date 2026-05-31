-- Body weight is a fact used to resolve per-bodyweight target ratios
-- (e.g., "1g of protein per pound of bodyweight"). Stored at user level
-- so it can be updated independently of the targets blob.

alter table users
  add column if not exists body_weight_lb numeric(5,1);
