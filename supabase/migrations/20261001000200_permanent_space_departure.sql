-- A departed relationship can never be re-opened with the same profile code.
-- The record is intentionally permanent; letters already in the database stay intact.
create table if not exists public.space_departures (
  space_id uuid not null references public.spaces(id) on delete cascade,
  departed_by uuid not null references auth.users(id) on delete cascade,
  departed_at timestamptz not null default now(),
  primary key (space_id, departed_by)
);

alter table public.space_departures enable row level security;
revoke all on public.space_departures from anon;
grant select, insert on public.space_departures to authenticated;

drop policy if exists "Participants can read space departures" on public.space_departures;
create policy "Participants can read space departures"
  on public.space_departures for select to authenticated
  using (exists (
    select 1 from public.spaces s
    where s.id = space_id and auth.uid() in (s.user1_id, s.user2_id)
  ));

drop policy if exists "Participants can permanently leave a space" on public.space_departures;
create policy "Participants can permanently leave a space"
  on public.space_departures for insert to authenticated
  with check (departed_by = auth.uid() and exists (
    select 1 from public.spaces s
    where s.id = space_id and auth.uid() in (s.user1_id, s.user2_id)
  ));

create or replace function public.reject_letters_for_departed_spaces()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.spaces s
    join public.space_departures d on d.space_id = s.id
    where (s.user1_id = new.from_id and s.user2_id = new.to_id)
       or (s.user1_id = new.to_id and s.user2_id = new.from_id)
  ) then
    raise exception 'This space has been left and cannot receive new letters.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_letters_for_departed_spaces on public.letters;
create trigger reject_letters_for_departed_spaces
  before insert on public.letters
  for each row execute function public.reject_letters_for_departed_spaces();

create or replace function public.reject_spaces_after_departure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.spaces s
    join public.space_departures d on d.space_id = s.id
    where (s.user1_id = new.user1_id and s.user2_id = new.user2_id)
       or (s.user1_id = new.user2_id and s.user2_id = new.user1_id)
  ) then
    raise exception 'This space was permanently left and cannot be recreated.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_spaces_after_departure on public.spaces;
create trigger reject_spaces_after_departure
  before insert on public.spaces
  for each row execute function public.reject_spaces_after_departure();
