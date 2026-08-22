create table public.driver_order_declines (
  driver_id uuid not null references public.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (driver_id, order_id)
);

create index driver_order_declines_driver_created_idx on public.driver_order_declines (driver_id, created_at desc);

alter table public.driver_order_declines enable row level security;

create policy "drivers read their own declined offers" on public.driver_order_declines
  for select using (driver_id = auth.uid());
