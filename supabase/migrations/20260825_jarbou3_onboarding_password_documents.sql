-- A verified WhatsApp code opens a short password-setup session; it does not activate the account.
alter type public.account_verification_status add value if not exists 'password_pending';

alter table public.account_verification_requests
  add column if not exists personal_photo_path text,
  add column if not exists identity_photo_path text;
