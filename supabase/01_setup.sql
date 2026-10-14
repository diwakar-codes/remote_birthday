-- =====================================================================
-- Remote Birthday - database + storage setup
-- Run once in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =====================================================================

-- 1) Celebrations table ------------------------------------------------
create table if not exists public.celebrations (
  id                text primary key,
  birthday_name     text not null check (char_length(birthday_name) between 1 and 60),
  god_name          text not null check (char_length(god_name) between 1 and 40),
  custom_message    text check (custom_message is null or char_length(custom_message) <= 300),
  photo_paths       text[] not null check (array_length(photo_paths, 1) = 4),
  audio_path        text,
  surprise_path     text,                -- optional image revealed inside the cake
  manage_token_hash text not null,
  status            text not null default 'pending' check (status in ('pending', 'ready')),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '1 hour')
);

-- Safe to re-run: adds the column to a table created by an older version of this file.
alter table public.celebrations add column if not exists surprise_path text;

create index if not exists celebrations_expires_at_idx on public.celebrations (expires_at);

-- 2) Lock the table down ------------------------------------------------
-- RLS on + NO policies = the public anon key can't read or write anything.
-- Only our Vercel /api functions (using the service_role key) can touch it.
alter table public.celebrations enable row level security;
revoke all on public.celebrations from anon, authenticated;

-- 3) Private storage bucket for photos + audio --------------------------
-- private  -> files are only reachable through short-lived signed URLs
-- 10 MB    -> max size per file
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('celebrations', 'celebrations', false, 10485760, array['image/*', 'audio/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
