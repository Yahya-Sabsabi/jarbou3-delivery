begin;
alter table public.jarbou3_places alter column created_by drop not null;
commit;
