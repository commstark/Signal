-- RLS hygiene for tables added in late-May 2026.
--
-- These were created via individual migrations but the RLS-enable lines
-- only ever existed in SCHEMA.sql, so the live tables were sitting in
-- the public schema with RLS off. Supabase's automated scanner flagged
-- "rls_disabled_in_public" on them.
--
-- The app reads/writes these via the service-role key from Next.js API
-- routes, which bypasses RLS by design — so flipping RLS on does not
-- affect normal operation. What it DOES block is the public anon key
-- (embedded in the client bundle) querying these tables directly via
-- the Supabase REST API.
--
-- No policies are added: anon gets denied entirely; service-role
-- continues to bypass.

alter table weekly_insights   enable row level security;
alter table insight_feedback  enable row level security;
alter table signals_chats     enable row level security;
alter table daily_overrides   enable row level security;
