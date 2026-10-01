-- App Review remediation: user blocks and user-content reports.
-- Apply once to the project's Supabase database before deploying the updated app.

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists "Users can read their own blocks" on public.user_blocks;
create policy "Users can read their own blocks"
  on public.user_blocks for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "Users can block another account" on public.user_blocks;
create policy "Users can block another account"
  on public.user_blocks for insert to authenticated
  with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

drop policy if exists "Users can unblock their own blocks" on public.user_blocks;
create policy "Users can unblock their own blocks"
  on public.user_blocks for delete to authenticated
  using (blocker_id = auth.uid());

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null,
  reported_user_id uuid not null,
  letter_id uuid not null,
  reason text not null check (reason in ('harassment', 'inappropriate', 'unwanted', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  created_at timestamptz not null default now(),
  constraint content_reports_no_self_report check (reporter_id <> reported_user_id)
);

create index if not exists content_reports_open_created_idx
  on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;
grant insert on public.content_reports to authenticated;

drop policy if exists "Users can report content they received" on public.content_reports;
create policy "Users can report content they received"
  on public.content_reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and reporter_id <> reported_user_id
    and exists (
      select 1 from public.letters l
      where l.id = letter_id
        and l.to_id = auth.uid()
        and l.from_id = reported_user_id
    )
  );

-- Prevent delivery of new letters across a blocked relationship, even when an
-- older client version is still running.
create or replace function public.reject_letters_between_blocked_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = new.from_id and b.blocked_id = new.to_id)
       or (b.blocker_id = new.to_id and b.blocked_id = new.from_id)
  ) then
    raise exception 'This conversation is unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_letters_between_blocked_users on public.letters;
create trigger reject_letters_between_blocked_users
  before insert on public.letters
  for each row execute function public.reject_letters_between_blocked_users();

-- Also prevent a blocked pair from creating a fresh shared space.
create or replace function public.reject_spaces_between_blocked_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = new.user1_id and b.blocked_id = new.user2_id)
       or (b.blocker_id = new.user2_id and b.blocked_id = new.user1_id)
  ) then
    raise exception 'This conversation is unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_spaces_between_blocked_users on public.spaces;
create trigger reject_spaces_between_blocked_users
  before insert on public.spaces
  for each row execute function public.reject_spaces_between_blocked_users();
