-- Module 16 — Events Lite: internal event operations plus safe public registration.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  season_id uuid not null,
  title text not null check (title = btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g')) and char_length(title) between 2 and 160),
  objective text not null check (objective = btrim(objective) and char_length(objective) between 2 and 3000),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  venue text check (venue is null or (venue = btrim(venue) and char_length(venue) <= 300)),
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'completed', 'cancelled')),
  created_by uuid not null references auth.users (id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, season_id) references public.seasons (organization_id, id) on delete restrict,
  check ((status = 'completed' and completed_at is not null) or (status <> 'completed' and completed_at is null))
);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'registered' check (status in ('registered', 'attended', 'absent', 'cancelled')),
  registered_at timestamptz not null default now(),
  cancelled_at timestamptz,
  attendance_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id),
  unique (organization_id, id),
  foreign key (organization_id, event_id) references public.events (organization_id, id) on delete cascade,
  check (
    (status = 'registered' and cancelled_at is null and attendance_recorded_at is null)
    or (status = 'cancelled' and cancelled_at is not null and attendance_recorded_at is null)
    or (status in ('attended', 'absent') and cancelled_at is null and attendance_recorded_at is not null)
  )
);

create table public.event_team_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  membership_id uuid not null,
  role_title text not null check (role_title = btrim(regexp_replace(role_title, '[[:space:]]+', ' ', 'g')) and char_length(role_title) between 2 and 120),
  assigned_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (event_id, membership_id),
  foreign key (organization_id, event_id) references public.events (organization_id, id) on delete cascade,
  foreign key (organization_id, membership_id) references public.memberships (organization_id, id) on delete cascade
);

create index events_org_season_starts_idx on public.events (organization_id, season_id, starts_at desc);
create index event_registrations_org_user_registered_idx on public.event_registrations (organization_id, user_id, registered_at desc);
create index event_team_assignments_org_member_idx on public.event_team_assignments (organization_id, membership_id);

alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_team_assignments enable row level security;
revoke all on table public.events from public, anon, authenticated;
revoke all on table public.event_registrations from public, anon, authenticated;
revoke all on table public.event_team_assignments from public, anon, authenticated;

create or replace function public.create_event(
  p_organization_id uuid, p_title text, p_objective text,
  p_starts_at timestamp without time zone, p_ends_at timestamp without time zone,
  p_venue text, p_capacity integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_season public.seasons%rowtype;
  event_id uuid;
  normalized_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
  normalized_objective text := btrim(coalesce(p_objective, ''));
  normalized_venue text := nullif(btrim(coalesce(p_venue, '')), '');
begin
  if auth.uid() is null or char_length(normalized_title) not between 2 and 160
    or char_length(normalized_objective) not between 2 and 3000
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_starts_at at time zone 'Africa/Cairo' <= now()
    or char_length(coalesce(normalized_venue, '')) > 300 or (p_capacity is not null and p_capacity <= 0) then
    raise exception 'Invalid event data';
  end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (select 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'board', 'head')) then raise exception 'Not authorized'; end if;
  select * into active_season from public.seasons where organization_id = p_organization_id and status = 'active' for key share;
  if not found then raise exception 'No active season'; end if;
  insert into public.events (organization_id, season_id, title, objective, starts_at, ends_at, venue, capacity, created_by)
  values (p_organization_id, active_season.id, normalized_title, normalized_objective, p_starts_at at time zone 'Africa/Cairo', p_ends_at at time zone 'Africa/Cairo', normalized_venue, p_capacity, auth.uid()) returning id into event_id;
  return event_id;
end;
$$;

create or replace function public.update_draft_event(
  p_organization_id uuid, p_event_id uuid, p_title text, p_objective text,
  p_starts_at timestamp without time zone, p_ends_at timestamp without time zone,
  p_venue text, p_capacity integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events%rowtype;
  normalized_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
  normalized_objective text := btrim(coalesce(p_objective, ''));
  normalized_venue text := nullif(btrim(coalesce(p_venue, '')), '');
begin
  if auth.uid() is null or char_length(normalized_title) not between 2 and 160
    or char_length(normalized_objective) not between 2 and 3000
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_starts_at at time zone 'Africa/Cairo' <= now()
    or char_length(coalesce(normalized_venue, '')) > 300 or (p_capacity is not null and p_capacity <= 0) then raise exception 'Invalid event data'; end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (select 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'board', 'head')) then raise exception 'Not authorized'; end if;
  select * into event_row from public.events where organization_id = p_organization_id and id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if event_row.status <> 'draft' then raise exception 'Only draft events can be edited'; end if;
  if not exists (select 1 from public.seasons where organization_id = p_organization_id and id = event_row.season_id and status = 'active') then raise exception 'Event season is archived'; end if;
  update public.events set title = normalized_title, objective = normalized_objective,
    starts_at = p_starts_at at time zone 'Africa/Cairo', ends_at = p_ends_at at time zone 'Africa/Cairo',
    venue = normalized_venue, capacity = p_capacity, updated_at = now() where id = event_row.id;
end;
$$;

create or replace function public.publish_event(p_organization_id uuid, p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (select 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'board', 'head')) then raise exception 'Not authorized'; end if;
  select * into event_row from public.events where organization_id = p_organization_id and id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if event_row.status <> 'draft' or event_row.starts_at <= now() then raise exception 'Only future draft events can be published'; end if;
  if not exists (select 1 from public.seasons where organization_id = p_organization_id and id = event_row.season_id and status = 'active') then raise exception 'Event season is archived'; end if;
  update public.events set status = 'published', updated_at = now() where id = event_row.id;
end;
$$;

create or replace function public.cancel_event(p_organization_id uuid, p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (select 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'board', 'head')) then raise exception 'Not authorized'; end if;
  select * into event_row from public.events where organization_id = p_organization_id and id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if event_row.status not in ('draft', 'published') or event_row.starts_at <= now() then raise exception 'Only future draft or published events can be cancelled'; end if;
  if not exists (select 1 from public.seasons where organization_id = p_organization_id and id = event_row.season_id and status = 'active') then raise exception 'Event season is archived'; end if;
  update public.events set status = 'cancelled', updated_at = now() where id = event_row.id;
end;
$$;

create or replace function public.assign_event_team_member(p_organization_id uuid, p_event_id uuid, p_member_user_id uuid, p_role_title text)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype; target_membership_id uuid; normalized_role text := btrim(regexp_replace(coalesce(p_role_title, ''), '[[:space:]]+', ' ', 'g'));
begin
  if auth.uid() is null or char_length(normalized_role) not between 2 and 120 then raise exception 'Invalid team role'; end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (select 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'board', 'head')) then raise exception 'Not authorized'; end if;
  select * into event_row from public.events where organization_id = p_organization_id and id = p_event_id for update;
  if not found or event_row.status in ('completed', 'cancelled') then raise exception 'Event is unavailable'; end if;
  if not exists (select 1 from public.seasons where organization_id = p_organization_id and id = event_row.season_id and status = 'active') then raise exception 'Event season is archived'; end if;
  select id into target_membership_id from public.memberships where organization_id = p_organization_id and user_id = p_member_user_id and status = 'active' for key share;
  if not found then raise exception 'Team member must be active in this organization'; end if;
  insert into public.event_team_assignments (organization_id, event_id, membership_id, role_title, assigned_by)
  values (p_organization_id, p_event_id, target_membership_id, normalized_role, auth.uid())
  on conflict (event_id, membership_id) do update set role_title = excluded.role_title, assigned_by = excluded.assigned_by, created_at = now();
end;
$$;

create or replace function public.remove_event_team_member(p_organization_id uuid, p_event_id uuid, p_membership_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (select 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'board', 'head')) then raise exception 'Not authorized'; end if;
  select * into event_row from public.events where organization_id = p_organization_id and id = p_event_id for update;
  if not found or event_row.status in ('completed', 'cancelled') then raise exception 'Event is unavailable'; end if;
  if not exists (select 1 from public.seasons where organization_id = p_organization_id and id = event_row.season_id and status = 'active') then raise exception 'Event season is archived'; end if;
  delete from public.event_team_assignments where organization_id = p_organization_id and event_id = p_event_id and membership_id = p_membership_id;
  if not found then raise exception 'Team assignment not found'; end if;
end;
$$;

create or replace function public.register_for_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype; registration_row public.event_registrations%rowtype; registration_count integer; event_organization_id uuid; registration_exists boolean;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and profile_completed_at is not null) then raise exception 'Complete your profile first'; end if;
  select organization_id into event_organization_id from public.events where id = p_event_id;
  if not found then raise exception 'Event is unavailable'; end if;
  perform 1 from public.organizations where id = event_organization_id for update;
  select * into event_row from public.events where id = p_event_id for update;
  if not found or event_row.status <> 'published' or event_row.starts_at <= now() or not exists (select 1 from public.seasons where organization_id = event_row.organization_id and id = event_row.season_id and status = 'active') then raise exception 'Event is unavailable'; end if;
  select * into registration_row from public.event_registrations where event_id = p_event_id and user_id = auth.uid() for update;
  registration_exists := found;
  if found and registration_row.status <> 'cancelled' then raise exception 'Already registered'; end if;
  select count(*) into registration_count from public.event_registrations where event_id = p_event_id and status = 'registered';
  if event_row.capacity is not null and registration_count >= event_row.capacity then raise exception 'Event is full'; end if;
  if registration_exists then
    update public.event_registrations set status = 'registered', registered_at = now(), cancelled_at = null, attendance_recorded_at = null, updated_at = now() where id = registration_row.id;
  else
    insert into public.event_registrations (organization_id, event_id, user_id) values (event_row.organization_id, p_event_id, auth.uid());
  end if;
end;
$$;

create or replace function public.cancel_my_event_registration(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype; event_organization_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select organization_id into event_organization_id from public.events where id = p_event_id;
  if not found then raise exception 'Registration cannot be cancelled'; end if;
  perform 1 from public.organizations where id = event_organization_id for update;
  select * into event_row from public.events where id = p_event_id for update;
  if not found or event_row.status <> 'published' or event_row.starts_at <= now() then raise exception 'Registration cannot be cancelled'; end if;
  update public.event_registrations set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where event_id = p_event_id and user_id = auth.uid() and status = 'registered';
  if not found then raise exception 'Active registration not found'; end if;
end;
$$;

create or replace function public.complete_event(p_organization_id uuid, p_event_id uuid, p_registration_ids uuid[], p_attendance_statuses text[])
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events%rowtype; roster_count integer; provided_count integer := coalesce(cardinality(p_registration_ids), 0);
begin
  if auth.uid() is null or provided_count <> coalesce(cardinality(p_attendance_statuses), 0)
    or exists (select 1 from unnest(p_attendance_statuses) as value where value is null or value not in ('attended', 'absent'))
    or (select count(distinct value) from unnest(p_registration_ids) as value) <> provided_count then raise exception 'Invalid attendance data'; end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (select 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'board', 'head')) then raise exception 'Not authorized'; end if;
  select * into event_row from public.events where organization_id = p_organization_id and id = p_event_id for update;
  if not found or event_row.status <> 'published' or event_row.ends_at > now() then raise exception 'Only ended published events can be completed'; end if;
  if not exists (select 1 from public.seasons where organization_id = p_organization_id and id = event_row.season_id and status = 'active') then raise exception 'Event season is archived'; end if;
  select count(*) into roster_count from public.event_registrations where organization_id = p_organization_id and event_id = p_event_id and status = 'registered';
  if roster_count <> provided_count or exists (
    (select id from public.event_registrations where organization_id = p_organization_id and event_id = p_event_id and status = 'registered')
    except (select value from unnest(p_registration_ids) as value)
  ) then raise exception 'Attendance must cover the current registration roster exactly'; end if;
  update public.event_registrations as registration set status = submitted.status, attendance_recorded_at = now(), updated_at = now()
  from unnest(p_registration_ids, p_attendance_statuses) as submitted(id, status)
  where registration.id = submitted.id and registration.organization_id = p_organization_id and registration.event_id = p_event_id;
  update public.events set status = 'completed', completed_at = now(), updated_at = now() where id = p_event_id and organization_id = p_organization_id;
end;
$$;

create or replace function public.list_events(p_organization_id uuid)
returns table (
  event_id uuid, season_id uuid, season_name text, season_status text, title text, objective text,
  starts_at timestamptz, ends_at timestamptz, venue text, capacity integer, status text,
  created_by_name text, created_at timestamptz, updated_at timestamptz, completed_at timestamptz,
  registration_count bigint, my_team_role text
) language plpgsql security definer set search_path = '' as $$
declare viewer_membership_id uuid; viewer_is_manager boolean;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select id, role in ('owner', 'board', 'head') into viewer_membership_id, viewer_is_manager from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not authorized'; end if;
  return query select e.id, e.season_id, s.name, s.status, e.title, e.objective, e.starts_at, e.ends_at, e.venue, e.capacity, e.status,
    coalesce(creator.full_name, 'عضو'), e.created_at, e.updated_at, e.completed_at,
    case when viewer_is_manager then registrations.count else null end, mine.role_title
  from public.events e
  join public.seasons s on s.organization_id = e.organization_id and s.id = e.season_id
  left join public.profiles creator on creator.id = e.created_by
  left join public.event_team_assignments mine on mine.organization_id = e.organization_id and mine.event_id = e.id and mine.membership_id = viewer_membership_id
  left join lateral (select count(*) from public.event_registrations r where r.organization_id = e.organization_id and r.event_id = e.id and r.status = 'registered') registrations on viewer_is_manager
  where e.organization_id = p_organization_id and (viewer_is_manager or e.status <> 'draft') order by (s.status = 'active') desc, e.starts_at desc;
end;
$$;

create or replace function public.list_event_registrations(p_organization_id uuid, p_event_id uuid)
returns table (registration_id uuid, user_id uuid, display_name text, registration_status text, registered_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'board', 'head')) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.events where organization_id = p_organization_id and id = p_event_id) then raise exception 'Event not found'; end if;
  return query select r.id, r.user_id, coalesce(p.full_name, 'مستخدم'), r.status, r.registered_at from public.event_registrations r left join public.profiles p on p.id = r.user_id where r.organization_id = p_organization_id and r.event_id = p_event_id order by r.registered_at;
end;
$$;

create or replace function public.list_event_team(p_organization_id uuid, p_event_id uuid)
returns table (membership_id uuid, user_id uuid, display_name text, role_title text, assigned_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'board', 'head')) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.events where organization_id = p_organization_id and id = p_event_id) then raise exception 'Event not found'; end if;
  return query select t.membership_id, m.user_id, coalesce(p.full_name, 'عضو'), t.role_title, t.created_at from public.event_team_assignments t join public.memberships m on m.organization_id = t.organization_id and m.id = t.membership_id left join public.profiles p on p.id = m.user_id where t.organization_id = p_organization_id and t.event_id = p_event_id order by coalesce(p.full_name, 'عضو'), t.created_at;
end;
$$;

create or replace function public.get_public_event(p_event_id uuid)
returns table (event_id uuid, organization_name text, title text, starts_at timestamptz, ends_at timestamptz, venue text, capacity integer, registration_count bigint, is_full boolean)
language plpgsql security definer set search_path = '' as $$
begin
  return query select e.id, o.name, e.title, e.starts_at, e.ends_at, e.venue, e.capacity, registrations.count,
    e.capacity is not null and registrations.count >= e.capacity
  from public.events e join public.organizations o on o.id = e.organization_id
  join public.seasons s on s.organization_id = e.organization_id and s.id = e.season_id and s.status = 'active'
  join lateral (select count(*) from public.event_registrations r where r.event_id = e.id and r.status = 'registered') registrations on true
  where e.id = p_event_id and e.status = 'published';
end;
$$;

create or replace function public.get_my_event_registration(p_event_id uuid)
returns table (registration_status text, registered_at timestamptz)
language sql security definer set search_path = '' as $$
  select status, registered_at from public.event_registrations where event_id = p_event_id and user_id = auth.uid();
$$;

-- Season rollover preserves completed/cancelled events but blocks unresolved work.
create or replace function public.activate_season(p_organization_id uuid, p_name text, p_starts_on date, p_ends_on date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_season_id uuid; prior_season public.seasons%rowtype;
begin
  if auth.uid() is null or p_name is null or char_length(btrim(p_name)) not between 2 and 120 or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then raise exception 'Invalid season data'; end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  perform 1 from public.memberships where organization_id = p_organization_id and user_id = auth.uid() and role = 'owner' and status = 'active' for key share;
  if not found then raise exception 'Not authorized'; end if;
  select * into prior_season from public.seasons where organization_id = p_organization_id and status = 'active' for update;
  if found then
    if p_starts_on <= prior_season.starts_on then raise exception 'The new season must start after the active season starts'; end if;
    if exists (select 1 from public.membership_assignments where organization_id = p_organization_id and season_id = prior_season.id and starts_on >= p_starts_on) then raise exception 'Close future assignments before starting this season'; end if;
    if exists (select 1 from public.meetings where organization_id = p_organization_id and season_id = prior_season.id and status = 'scheduled') then raise exception 'Complete or cancel scheduled meetings before starting this season'; end if;
    if exists (select 1 from public.events where organization_id = p_organization_id and season_id = prior_season.id and status in ('draft', 'published')) then raise exception 'Complete or cancel unresolved events before starting this season'; end if;
    update public.membership_assignments set ends_on = least(p_starts_on - 1, prior_season.ends_on) where organization_id = p_organization_id and season_id = prior_season.id and (ends_on is null or ends_on >= p_starts_on);
    update public.recruitment_campaigns set status = 'closed', closed_at = now() where organization_id = p_organization_id and season_id = prior_season.id and status = 'open';
    update public.seasons set status = 'archived' where id = prior_season.id;
  end if;
  insert into public.seasons (organization_id, name, starts_on, ends_on, status) values (p_organization_id, btrim(p_name), p_starts_on, p_ends_on, 'active') returning id into new_season_id;
  return new_season_id;
end;
$$;

revoke all on function public.create_event(uuid, text, text, timestamp without time zone, timestamp without time zone, text, integer) from public, anon;
grant execute on function public.create_event(uuid, text, text, timestamp without time zone, timestamp without time zone, text, integer) to authenticated;
revoke all on function public.update_draft_event(uuid, uuid, text, text, timestamp without time zone, timestamp without time zone, text, integer) from public, anon;
grant execute on function public.update_draft_event(uuid, uuid, text, text, timestamp without time zone, timestamp without time zone, text, integer) to authenticated;
revoke all on function public.publish_event(uuid, uuid), public.cancel_event(uuid, uuid), public.assign_event_team_member(uuid, uuid, uuid, text), public.remove_event_team_member(uuid, uuid, uuid), public.complete_event(uuid, uuid, uuid[], text[]), public.list_events(uuid), public.list_event_registrations(uuid, uuid), public.list_event_team(uuid, uuid) from public, anon;
grant execute on function public.publish_event(uuid, uuid), public.cancel_event(uuid, uuid), public.assign_event_team_member(uuid, uuid, uuid, text), public.remove_event_team_member(uuid, uuid, uuid), public.complete_event(uuid, uuid, uuid[], text[]), public.list_events(uuid), public.list_event_registrations(uuid, uuid), public.list_event_team(uuid, uuid) to authenticated;
revoke all on function public.register_for_event(uuid), public.cancel_my_event_registration(uuid), public.get_my_event_registration(uuid) from public, anon;
grant execute on function public.register_for_event(uuid), public.cancel_my_event_registration(uuid), public.get_my_event_registration(uuid) to authenticated;
revoke all on function public.get_public_event(uuid) from public;
grant execute on function public.get_public_event(uuid) to anon, authenticated;
