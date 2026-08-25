create table public.app_release_settings (
  singleton boolean primary key default true check (singleton),
  min_version text,
  force_update boolean not null default false,
  update_url text,
  updated_at timestamptz not null default now()
);

insert into public.app_release_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function public.set_jarbou3_release_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_release_settings_set_updated_at
before update on public.app_release_settings
for each row execute function public.set_jarbou3_release_updated_at();

alter table public.app_release_settings enable row level security;
