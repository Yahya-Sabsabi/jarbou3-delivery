create table if not exists public.admin_site_settings (
  singleton boolean primary key default true check (singleton),
  password_hash text,
  password_set_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.admin_site_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.admin_site_settings enable row level security;
revoke all on table public.admin_site_settings from anon, authenticated;
