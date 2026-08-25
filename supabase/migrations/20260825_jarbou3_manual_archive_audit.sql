create table public.manual_archive_events (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.manual_archives(id) on delete cascade,
  action text not null check (action in ('generated', 'downloaded', 'purge_started', 'purged')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index manual_archive_events_archive_created_idx on public.manual_archive_events (archive_id, created_at desc);

alter table public.manual_archive_events enable row level security;
