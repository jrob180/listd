-- Listing intake: agent does research; user confirms.
-- Run in Supabase SQL Editor. Create storage bucket "draft-photos" (public) in Dashboard.

create table if not exists sms_users (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique
);

create index if not exists sms_users_phone_number on sms_users(phone_number);

create table if not exists listing_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references sms_users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'complete', 'abandoned')),
  stage text not null default 'awaiting_photos' check (stage in (
    'awaiting_photos',
    'researching_identity',
    'confirm_identity',
    'confirm_variants',
    'confirm_condition',
    'pricing',
    'final_confirm',
    'complete'
  )),
  pending jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_drafts_user_status on listing_drafts(user_id, status);
create index if not exists listing_drafts_user_updated on listing_drafts(user_id, updated_at desc);

create table if not exists draft_messages (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references listing_drafts(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  body text not null default '',
  twilio_media_urls jsonb default '[]'::jsonb,
  storage_media_urls jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists draft_messages_draft_id on draft_messages(draft_id, created_at desc);

create table if not exists draft_photos (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references listing_drafts(id) on delete cascade,
  kind text not null default 'user' check (kind in ('user', 'reference')),
  storage_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists draft_photos_draft_id on draft_photos(draft_id);

create table if not exists draft_facts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references listing_drafts(id) on delete cascade,
  key text not null,
  value jsonb not null,
  confidence float not null default 0,
  source text not null default '',
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected')),
  evidence jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(draft_id, key)
);

create index if not exists draft_facts_draft_status on draft_facts(draft_id, status);

create table if not exists research_runs (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references listing_drafts(id) on delete cascade,
  type text not null check (type in ('vision', 'ebay')),
  query text not null default '',
  results jsonb default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'success', 'error', 'timeout')),
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists research_runs_draft_id on research_runs(draft_id, created_at desc);
