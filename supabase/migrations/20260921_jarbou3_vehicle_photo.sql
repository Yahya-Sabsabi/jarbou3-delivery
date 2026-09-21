-- Require and preserve the driver's motorcycle/bike photo through onboarding and verification.
alter table public.account_verification_requests
  add column if not exists vehicle_photo_path text;

alter table public.drivers_verification
  add column if not exists vehicle_photo_path text;
