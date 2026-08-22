alter table public.account_recovery_requests
  add column if not exists reset_token_hash text,
  add column if not exists reset_token_expires_at timestamptz,
  add column if not exists verified_at timestamptz;
