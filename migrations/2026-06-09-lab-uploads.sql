-- Lab uploads pipeline (PR #1 of the labs feature). This migration only
-- creates the raw-extraction storage layer: file uploads, parsed panels, and
-- per-analyte rows as printed on the document. Canonical analyte naming,
-- per-user targets, and the /labs trend UI come in later PRs — we keep
-- raw extraction and canonicalization separate so a bad mapping doesn't
-- block ingestion.

-- One row per uploaded document. The PDF / image lives in Supabase Storage
-- under bucket `lab-uploads`, path `{user_id}/{id}.{ext}`. parse_status
-- mirrors the entries vocabulary (pending | ok | partial | failed) so the
-- /labs list can reuse StatusDot.
create table if not exists lab_uploads (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references users(id) on delete cascade,
  file_path          text not null,                  -- storage key
  mime               text not null,                  -- 'application/pdf' | 'image/png' | 'image/jpeg'
  original_filename  text,
  source             text not null check (source in ('pdf', 'image')),
  extraction_model   text,
  extracted_at       timestamptz,
  parse_status       text not null default 'pending'
                       check (parse_status in ('pending', 'ok', 'partial', 'failed')),
  parse_warnings     text[] default array[]::text[],
  raw_extraction     jsonb,                          -- the LLM's full JSON return, for re-canonicalization later
  created_at         timestamptz not null default now()
);

create index if not exists lab_uploads_user_created_idx
  on lab_uploads (user_id, created_at desc);

-- One uploaded document can contain panels from multiple dates (some labs
-- print three months of trend data on one PDF). Each `lab_panels` row is
-- one (test-date, panel-type) tuple.
create table if not exists lab_panels (
  id            uuid primary key default uuid_generate_v4(),
  upload_id     uuid not null references lab_uploads(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  panel_date    date,
  panel_type    text,                                -- 'blood' | 'thyroid' | 'lipid' | 'cbc' | 'hormones' | 'micronutrients' | 'gut_microbiome' | 'dexa' | 'inbody' | 'metabolic_panel' | 'other'
  provider      text,                                -- e.g. 'Quest', 'LabCorp', 'NewAlth'
  lab_name      text,                                -- e.g. 'Comprehensive Metabolic Panel'
  created_at    timestamptz not null default now()
);

create index if not exists lab_panels_user_date_idx
  on lab_panels (user_id, panel_date desc nulls last);
create index if not exists lab_panels_upload_idx
  on lab_panels (upload_id);

-- Raw rows as printed on the document. analyte_key (canonical name) is
-- nullable on purpose — the canonicalization pass (PR #2) backfills it.
-- For now we just hold what the LLM read off the page.
create table if not exists lab_analytes (
  id            uuid primary key default uuid_generate_v4(),
  panel_id      uuid not null references lab_panels(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  analyte_key   text,                                -- canonical key, e.g. 'ferritin' — null until PR #2 canonicalization
  name_raw      text not null,                       -- as printed, e.g. 'FERRITIN, S'
  value_num     numeric(12,4),
  value_text    text,                                -- for non-numeric values: "Detected", "<5", "Positive"
  unit          text,
  ref_low       numeric(12,4),
  ref_high      numeric(12,4),
  ref_text      text,                                -- for non-numeric ranges
  flag          text,                                -- 'H' | 'L' | 'HH' | 'LL' | 'abnormal' | null
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists lab_analytes_panel_idx
  on lab_analytes (panel_id);
create index if not exists lab_analytes_user_key_idx
  on lab_analytes (user_id, analyte_key, created_at desc)
  where analyte_key is not null;

-- RLS — same pattern as the rest of the per-user tables.
alter table lab_uploads  enable row level security;
alter table lab_panels   enable row level security;
alter table lab_analytes enable row level security;

create policy lab_uploads_owner  on lab_uploads  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy lab_panels_owner   on lab_panels   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy lab_analytes_owner on lab_analytes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private bucket for the source PDFs/images. The path convention is
-- '{user_id}/{upload_id}.{ext}', enforced by the upload API.
insert into storage.buckets (id, name, public)
values ('lab-uploads', 'lab-uploads', false)
on conflict (id) do nothing;

-- Storage RLS — users can read/write only their own folder. file_owner_id
-- on storage.objects is the auth.uid() of the uploader, but the path-prefix
-- check is the safer invariant (works even when service-role uploads).
create policy lab_uploads_storage_owner_read on storage.objects
  for select using (
    bucket_id = 'lab-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy lab_uploads_storage_owner_write on storage.objects
  for insert with check (
    bucket_id = 'lab-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy lab_uploads_storage_owner_delete on storage.objects
  for delete using (
    bucket_id = 'lab-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
