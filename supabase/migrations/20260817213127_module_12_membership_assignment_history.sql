-- Module 12 — membership assignment history for the active organization season
alter table public.memberships
  add constraint memberships_organization_id_id_key unique (organization_id, id);

alter table public.departments
  add constraint departments_organization_id_season_id_id_key unique (organization_id, season_id, id);

create extension if not exists btree_gist;

create table public.membership_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id uuid not null,
  season_id uuid not null,
  department_id uuid not null,
  position text not null check (
    position = btrim(regexp_replace(position, '[[:space:]]+', ' ', 'g'))
    and char_length(position) between 2 and 120
  ),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  unique (organization_id, id),
  foreign key (organization_id, membership_id)
    references public.memberships (organization_id, id) on delete cascade,
  foreign key (organization_id, season_id)
    references public.seasons (organization_id, id) on delete cascade,
  foreign key (organization_id, season_id, department_id)
    references public.departments (organization_id, season_id, id) on delete restrict
);

create unique index membership_assignments_one_open_per_member_season_idx
  on public.membership_assignments (organization_id, membership_id, season_id)
  where ends_on is null;
create index membership_assignments_directory_idx
  on public.membership_assignments (organization_id, season_id, membership_id)
  where ends_on is null;

alter table public.membership_assignments
  add constraint membership_assignments_no_overlapping_effective_ranges
  exclude using gist (
    organization_id with =,
    membership_id with =,
    season_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  );

create or replace function public.enforce_assignment_within_season()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assignment_season public.seasons%rowtype;
begin
  select * into assignment_season
  from public.seasons
  where organization_id = new.organization_id and id = new.season_id
  for key share;
  if not found
    or new.starts_on < assignment_season.starts_on
    or new.starts_on > assignment_season.ends_on
    or (new.ends_on is not null and new.ends_on > assignment_season.ends_on) then
    raise exception 'Assignment dates must be within its season';
  end if;

  return new;
end;
$$;

create trigger membership_assignments_enforce_season_dates
before insert or update of organization_id, season_id, starts_on, ends_on
on public.membership_assignments
for each row execute function public.enforce_assignment_within_season();

revoke all on function public.enforce_assignment_within_season() from public, anon, authenticated;

alter table public.membership_assignments enable row level security;
revoke all on table public.membership_assignments from public, anon, authenticated;

-- Membership mutations are limited to audited flows: organization creation,
-- invite acceptance, and later recruitment. Direct Data API writes bypass history.
revoke insert, update, delete on table public.memberships from authenticated;
drop policy if exists "Creators add organization memberships" on public.memberships;
drop policy if exists "Creators update organization memberships" on public.memberships;
drop policy if exists "Creators delete organization memberships" on public.memberships;

-- Organization bootstrap needs to create its owner membership after the direct
-- membership write path above is removed.
revoke insert on table public.organizations from authenticated;
drop policy if exists "Users create organizations" on public.organizations;
revoke update, delete on table public.organizations from authenticated;
drop policy if exists "Creators update their organizations" on public.organizations;
drop policy if exists "Creators delete their organizations" on public.organizations;

create or replace function public.create_organization(
  p_name text,
  p_description text,
  p_university text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_name is null
    or p_university is null
    or char_length(btrim(p_name)) not between 2 and 160
    or char_length(btrim(p_university)) not between 2 and 160
    or char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'Invalid organization data';
  end if;

  insert into public.organizations (name, description, university, created_by)
  values (btrim(p_name), nullif(btrim(p_description), ''), btrim(p_university), auth.uid())
  returning id into organization_id;

  insert into public.memberships (organization_id, user_id, role, status)
  values (organization_id, auth.uid(), 'owner', 'active');

  return organization_id;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;

-- A season transition is the only write path for seasons so archive/history
-- updates cannot be split across client requests.
revoke insert, update on table public.seasons from authenticated;
drop policy if exists "Owners create seasons" on public.seasons;
drop policy if exists "Owners archive active seasons" on public.seasons;

create or replace function public.activate_season(
  p_organization_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_season_id uuid;
  prior_season public.seasons%rowtype;
begin
  if auth.uid() is null
    or p_name is null
    or char_length(btrim(p_name)) not between 2 and 120
    or p_starts_on is null
    or p_ends_on is null
    or p_ends_on < p_starts_on then
    raise exception 'Invalid season data';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  perform 1
  from public.memberships
  where organization_id = p_organization_id
    and user_id = auth.uid()
    and role = 'owner'
    and status = 'active'
  for key share;
  if not found then
    raise exception 'Not authorized';
  end if;

  select * into prior_season
  from public.seasons
  where organization_id = p_organization_id and status = 'active'
  for update;

  if found then
    if p_starts_on <= prior_season.starts_on then
      raise exception 'The new season must start after the active season starts';
    end if;

    if exists (
      select 1 from public.membership_assignments
      where organization_id = p_organization_id
        and season_id = prior_season.id
        and starts_on >= p_starts_on
    ) then
      raise exception 'Close future assignments before starting this season';
    end if;

    update public.membership_assignments
    set ends_on = least(p_starts_on - 1, prior_season.ends_on)
    where organization_id = p_organization_id
      and season_id = prior_season.id
      and (ends_on is null or ends_on >= p_starts_on);

    update public.seasons set status = 'archived' where id = prior_season.id;
  end if;

  insert into public.seasons (organization_id, name, starts_on, ends_on, status)
  values (p_organization_id, btrim(p_name), p_starts_on, p_ends_on, 'active')
  returning id into new_season_id;

  return new_season_id;
end;
$$;

revoke all on function public.activate_season(uuid, text, date, date) from public, anon;
grant execute on function public.activate_season(uuid, text, date, date) to authenticated;

create or replace function public.assign_member_assignment(
  p_organization_id uuid,
  p_user_id uuid,
  p_department_id uuid,
  p_position text,
  p_starts_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_membership public.memberships%rowtype;
  active_season public.seasons%rowtype;
  current_assignment public.membership_assignments%rowtype;
  next_assignment public.membership_assignments%rowtype;
  assignment_id uuid;
  assignment_ends_on date;
  normalized_position text;
begin
  normalized_position := btrim(regexp_replace(coalesce(p_position, ''), '[[:space:]]+', ' ', 'g'));
  if auth.uid() is null
    or p_starts_on is null
    or char_length(normalized_position) not between 2 and 120 then
    raise exception 'Invalid assignment data';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  perform 1
  from public.memberships
  where organization_id = p_organization_id
    and user_id = auth.uid()
    and role = 'owner'
    and status = 'active'
  for key share;
  if not found then
    raise exception 'Not authorized';
  end if;

  select * into target_membership
  from public.memberships
  where organization_id = p_organization_id
    and user_id = p_user_id
    and status = 'active'
  for update;
  if not found then
    raise exception 'Member not found';
  end if;

  select * into active_season
  from public.seasons
  where organization_id = p_organization_id and status = 'active'
  for update;
  if not found then
    raise exception 'No active season';
  end if;

  if p_starts_on < active_season.starts_on or p_starts_on > active_season.ends_on then
    raise exception 'Assignment date is outside the active season';
  end if;

  perform 1
  from public.departments
  where organization_id = p_organization_id
    and season_id = active_season.id
    and id = p_department_id
  for key share;
  if not found then
    raise exception 'Department not found in the active season';
  end if;

  select * into current_assignment
  from public.membership_assignments
  where organization_id = p_organization_id
    and membership_id = target_membership.id
    and season_id = active_season.id
    and starts_on <= p_starts_on
    and (ends_on is null or ends_on >= p_starts_on)
  for update;

  if found then
    if p_starts_on <= current_assignment.starts_on then
      raise exception 'The reassignment date must follow the current assignment';
    end if;

    update public.membership_assignments
    set ends_on = p_starts_on - 1
    where id = current_assignment.id;
  end if;

  select * into next_assignment
  from public.membership_assignments
  where organization_id = p_organization_id
    and membership_id = target_membership.id
    and season_id = active_season.id
    and starts_on > p_starts_on
  order by starts_on
  limit 1
  for update;

  if found then
    assignment_ends_on := next_assignment.starts_on - 1;
  end if;

  insert into public.membership_assignments (
    organization_id, membership_id, season_id, department_id, position, starts_on, ends_on
  ) values (
    p_organization_id, target_membership.id, active_season.id, p_department_id, normalized_position, p_starts_on, assignment_ends_on
  ) returning id into assignment_id;

  return assignment_id;
end;
$$;

create or replace function public.clear_member_assignment(
  p_organization_id uuid,
  p_user_id uuid,
  p_ends_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_membership public.memberships%rowtype;
  active_season public.seasons%rowtype;
  current_assignment public.membership_assignments%rowtype;
begin
  if auth.uid() is null or p_ends_on is null then
    raise exception 'Invalid assignment data';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  perform 1
  from public.memberships
  where organization_id = p_organization_id
    and user_id = auth.uid()
    and role = 'owner'
    and status = 'active'
  for key share;
  if not found then
    raise exception 'Not authorized';
  end if;

  select * into target_membership
  from public.memberships
  where organization_id = p_organization_id
    and user_id = p_user_id
    and status = 'active'
  for update;
  if not found then
    raise exception 'Member not found';
  end if;

  select * into active_season
  from public.seasons
  where organization_id = p_organization_id and status = 'active'
  for update;
  if not found then
    raise exception 'No active season';
  end if;

  if p_ends_on < active_season.starts_on or p_ends_on > active_season.ends_on then
    raise exception 'Assignment date is outside the active season';
  end if;

  select * into current_assignment
  from public.membership_assignments
  where organization_id = p_organization_id
    and membership_id = target_membership.id
    and season_id = active_season.id
    and starts_on <= p_ends_on
    and (ends_on is null or ends_on >= p_ends_on)
  for update;

  if not found then
    return;
  end if;

  update public.membership_assignments
  set ends_on = p_ends_on
  where id = current_assignment.id;
end;
$$;

create or replace function public.list_member_directory_details(p_organization_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role text,
  joined_at timestamptz,
  assignment_id uuid,
  department_id uuid,
  department_name text,
  "position" text,
  assignment_starts_on date,
  assignment_ends_on date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    m.user_id,
    coalesce(p.full_name, 'عضو'),
    m.role,
    m.joined_at,
    a.id,
    a.department_id,
    d.name,
    a.position,
    a.starts_on,
    a.ends_on
  from public.memberships as m
  left join public.profiles as p on p.id = m.user_id
  left join public.seasons as s
    on s.organization_id = m.organization_id and s.status = 'active'
  left join public.membership_assignments as a
    on a.organization_id = m.organization_id
    and a.membership_id = m.id
    and a.season_id = s.id
    and a.starts_on <= current_date
    and (a.ends_on is null or a.ends_on >= current_date)
  left join public.departments as d
    on d.organization_id = a.organization_id
    and d.season_id = a.season_id
    and d.id = a.department_id
  where m.organization_id = p_organization_id and m.status = 'active'
  order by coalesce(p.full_name, 'عضو'), m.joined_at;
end;
$$;

create or replace function public.list_member_assignment_history(p_organization_id uuid)
returns table (
  user_id uuid,
  membership_id uuid,
  season_id uuid,
  season_name text,
  department_id uuid,
  department_name text,
  "position" text,
  starts_on date,
  ends_on date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;

  select m.role = 'owner' into viewer_is_owner
  from public.memberships as m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
    and m.status = 'active';
  if not found then
    raise exception 'Not authorized';
  end if;

  return query
  select
    m.user_id,
    a.membership_id,
    a.season_id,
    s.name,
    a.department_id,
    d.name,
    a.position,
    a.starts_on,
    a.ends_on
  from public.membership_assignments as a
  join public.memberships as m
    on m.organization_id = a.organization_id and m.id = a.membership_id
  join public.seasons as s
    on s.organization_id = a.organization_id and s.id = a.season_id
  join public.departments as d
    on d.organization_id = a.organization_id
    and d.season_id = a.season_id
    and d.id = a.department_id
  where a.organization_id = p_organization_id
    and m.status = 'active'
    and (viewer_is_owner or m.user_id = auth.uid())
  order by m.user_id, a.starts_on desc;
end;
$$;

revoke all on function public.assign_member_assignment(uuid, uuid, uuid, text, date) from public, anon;
grant execute on function public.assign_member_assignment(uuid, uuid, uuid, text, date) to authenticated;
revoke all on function public.clear_member_assignment(uuid, uuid, date) from public, anon;
grant execute on function public.clear_member_assignment(uuid, uuid, date) to authenticated;
revoke all on function public.list_member_directory_details(uuid) from public, anon;
grant execute on function public.list_member_directory_details(uuid) to authenticated;
revoke all on function public.list_member_assignment_history(uuid) from public, anon;
grant execute on function public.list_member_assignment_history(uuid) to authenticated;
