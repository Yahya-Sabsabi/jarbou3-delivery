-- Preserve documents uploaded during initial driver onboarding in the review queue.
insert into public.drivers_verification (
  user_id, personal_photo_path, id_photo_path, status, activation_code_hash, activated_at
)
select
  request.auth_user_id,
  request.personal_photo_path,
  request.identity_photo_path,
  'pending'::public.driver_verification_status,
  null,
  null
from public.account_verification_requests request
join public.users account on account.id = request.auth_user_id
where request.requested_role = 'driver'
  and request.status = 'verified'
  and account.role = 'driver'
  and request.personal_photo_path is not null
  and request.identity_photo_path is not null
on conflict (user_id) do nothing;
