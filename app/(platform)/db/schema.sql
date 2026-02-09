-- Run this in Supabase SQL Editor. Minimal schema for SMS listing flow.

create table if not exists sms_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  stage text not null default 'idle',
  item_name text,
  condition text,
  photo_urls jsonb default '[]'::jsonb,
  -- Structured AI state used to build the marketplace listing (title, price, attributes, etc.)
  listing_state jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sms_conversations_phone_number on sms_conversations(phone_number);
