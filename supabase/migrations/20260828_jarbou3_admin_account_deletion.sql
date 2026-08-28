-- Deletes are privacy-preserving account tombstones: operational and financial
-- references retain their UUID integrity, while login and personal identifiers are removed.
alter table public.users
  add column if not exists deleted_at timestamptz;

create index if not exists users_active_directory_idx
  on public.users (role, created_at desc)
  where deleted_at is null;
