-- Module 11 — Seasons and departments
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (name = trim(name) and char_length(name) between 2 and 120),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  check (ends_on >= starts_on)
);
create unique index seasons_one_active_per_organization_idx on public.seasons (organization_id) where status = 'active';
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  season_id uuid not null,
  name text not null check (name = trim(name) and char_length(name) between 2 and 120),
  description text check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  foreign key (organization_id, season_id) references public.seasons (organization_id, id) on delete cascade
);
create unique index departments_unique_name_per_season_idx on public.departments (organization_id, season_id, lower(name));
create index seasons_organization_id_idx on public.seasons (organization_id);
create index departments_organization_season_idx on public.departments (organization_id, season_id);
alter table public.seasons enable row level security;
alter table public.departments enable row level security;
grant select, insert on public.seasons to authenticated;
grant update (status) on public.seasons to authenticated;
grant select, insert on public.departments to authenticated;
create policy "Members read seasons" on public.seasons for select to authenticated using (exists (
  select 1 from public.memberships where memberships.organization_id = seasons.organization_id and memberships.user_id = (select auth.uid()) and memberships.status = 'active'
));
create policy "Owners create seasons" on public.seasons for insert to authenticated with check (status = 'active' and exists (
  select 1 from public.memberships where memberships.organization_id = seasons.organization_id and memberships.user_id = (select auth.uid()) and memberships.role = 'owner' and memberships.status = 'active'
));
create policy "Owners archive active seasons" on public.seasons for update to authenticated using (status = 'active' and exists (
  select 1 from public.memberships where memberships.organization_id = seasons.organization_id and memberships.user_id = (select auth.uid()) and memberships.role = 'owner' and memberships.status = 'active'
)) with check (status = 'archived' and exists (
  select 1 from public.memberships where memberships.organization_id = seasons.organization_id and memberships.user_id = (select auth.uid()) and memberships.role = 'owner' and memberships.status = 'active'
));
create policy "Members read departments" on public.departments for select to authenticated using (exists (
  select 1 from public.memberships where memberships.organization_id = departments.organization_id and memberships.user_id = (select auth.uid()) and memberships.status = 'active'
));
create policy "Owners create departments" on public.departments for insert to authenticated with check (exists (
  select 1 from public.memberships where memberships.organization_id = departments.organization_id and memberships.user_id = (select auth.uid()) and memberships.role = 'owner' and memberships.status = 'active'
 ) and exists (
  select 1 from public.seasons where seasons.organization_id = departments.organization_id and seasons.id = departments.season_id and seasons.status = 'active'
));
drop policy "Members read their organizations" on public.organizations;
create policy "Active members read their organizations" on public.organizations for select to authenticated using (
  exists (
    select 1 from public.memberships where memberships.organization_id = organizations.id and memberships.user_id = (select auth.uid()) and memberships.status = 'active'
  ) or (
    organizations.created_by = (select auth.uid()) and not exists (
      select 1 from public.memberships where memberships.organization_id = organizations.id and memberships.user_id = (select auth.uid())
    )
  )
);
create or replace function public.activate_season(p_organization_id uuid, p_name text, p_starts_on date, p_ends_on date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare season_id uuid;
begin
  if auth.uid() is null or char_length(trim(p_name)) not between 2 and 120 or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then raise exception 'Invalid season data'; end if;
  update public.seasons set status = 'archived' where organization_id = p_organization_id and status = 'active';
  insert into public.seasons (organization_id, name, starts_on, ends_on) values (p_organization_id, trim(p_name), p_starts_on, p_ends_on) returning id into season_id;
  return season_id;
end;
$$;
revoke execute on function public.activate_season(uuid, text, date, date) from public, anon;
grant execute on function public.activate_season(uuid, text, date, date) to authenticated;
