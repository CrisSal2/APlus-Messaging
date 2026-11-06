-- 001_hardening.sql
-- Run once in the Supabase SQL editor. Idempotent where possible.
-- Review the "dedupe" notes first: the unique indexes fail if duplicates exist.

-- Tenant scoping: boards are owned by a Monday.com account
alter table boards add column if not exists monday_account_id text;
alter table users  add column if not exists monday_user_id    text;
alter table users  add column if not exists monday_account_id text;

-- Emails are compared case-insensitively. Lowercase existing rows first.
-- (If two rows differ only by case, merge/delete one before running.)
update users set email = lower(btrim(email)) where email is not null and email <> lower(btrim(email));
update invites set email = lower(btrim(email)) where email <> lower(btrim(email));

create unique index if not exists users_email_lower_key
  on users (lower(email)) where email is not null;
create unique index if not exists users_monday_user_id_key
  on users (monday_user_id) where monday_user_id is not null;
create unique index if not exists boards_monday_board_id_key
  on boards (monday_board_id);
create unique index if not exists board_participants_board_user_key
  on board_participants (board_id, user_id);
create unique index if not exists invites_token_key
  on invites (token);

-- Helpful indexes for polling and lookups
create index if not exists messages_board_created_idx
  on messages (board_id, created_at);

-- Defense in depth: the backend uses the service-role key (bypasses RLS).
-- Enabling RLS with no policies blocks direct access via the anon/public key.
alter table users               enable row level security;
alter table boards              enable row level security;
alter table board_participants  enable row level security;
alter table invites             enable row level security;
alter table messages            enable row level security;

-- Legacy boards (monday_account_id is null) are claimed on next sync by an
-- existing coordinator of that board; see boardRoutes.js.
