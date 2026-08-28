-- A discount without recipients remains public. Rows in this table make it private to those customers.
create table if not exists public.discount_code_recipients (
  discount_code_id uuid not null references public.discount_codes(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (discount_code_id, customer_id)
);

create index if not exists discount_code_recipients_customer_idx
  on public.discount_code_recipients (customer_id, discount_code_id);

alter table public.discount_code_recipients enable row level security;
