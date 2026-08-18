-- Module 15 — Meetings & Attendance Lite: frozen active-member roster and manager-recorded attendance.
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  season_id uuid not null,
  meeting_type text not null check (meeting_type in ('board', 'department', 'committee', 'project', 'emergency')),
  title text not null check (
    title = btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g'))
    and char_length(title) between 2 and 160
  ),
  starts_at timestamptz not null,
  location text check (location is null or (location = btrim(location) and char_length(location) <= 300)),
  agenda text check (agenda is null or (agenda = btrim(agenda) and char_length(agenda) <= 3000)),
  minutes text check (minutes is null or (minutes = btrim(minutes) and char_length(minutes) <= 6000)),
  decisions text check (decisions is null or (decisions = btrim(decisions) and char_length(decisions) <= 6000)),
  reference_url text check (reference_url is null or (char_length(reference_url) <= 2048 and reference_url ~ '^https://')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_by uuid not null references auth.users (id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, season_id)
    references public.seasons (organization_id, id) on delete restrict,
  check ((status = 'completed') = (completed_at is not null))
);

create table public.meeting_attendance (
  organization_id uuid not null,
  meeting_id uuid not null,
  membership_id uuid not null,
  status text check (status in ('present', 'absent', 'excused')),
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (meeting_id, membership_id),
  foreign key (organization_id, meeting_id)
    references public.meetings (organization_id, id) on delete cascade,
  foreign key (organization_id, membership_id)
    references public.memberships (organization_id, id) on delete restrict,
  check ((status is null) = (marked_at is null))
);

create index meetings_org_season_starts_idx on public.meetings (organization_id, season_id, starts_at desc);
create index meeting_attendance_org_membership_idx on public.meeting_attendance (organization_id, membership_id);

alter table public.meetings enable row level security;
alter table public.meeting_attendance enable row level security;
revoke all on table public.meetings from public, anon, authenticated;
revoke all on table public.meeting_attendance from public, anon, authenticated;

alter table public.tasks add column meeting_id uuid;
alter table public.tasks add constraint tasks_organization_meeting_id_fkey
  foreign key (organization_id, meeting_id)
  references public.meetings (organization_id, id) on delete set null (meeting_id);
create index tasks_org_meeting_idx on public.tasks (organization_id, meeting_id) where meeting_id is not null;

create or replace function public.create_meeting(
  p_organization_id uuid,
  p_meeting_type text,
  p_title text,
  p_starts_at timestamp without time zone,
  p_location text,
  p_agenda text,
  p_reference_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_season public.seasons%rowtype;
  meeting_id uuid;
  normalized_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
  normalized_location text := nullif(btrim(coalesce(p_location, '')), '');
  normalized_agenda text := nullif(btrim(coalesce(p_agenda, '')), '');
  normalized_url text := nullif(btrim(coalesce(p_reference_url, '')), '');
begin
  if auth.uid() is null
    or p_meeting_type not in ('board', 'department', 'committee', 'project', 'emergency')
    or char_length(normalized_title) not between 2 and 160
    or p_starts_at is null
    or char_length(coalesce(normalized_location, '')) > 300
    or char_length(coalesce(normalized_agenda, '')) > 3000
    or (normalized_url is not null and (char_length(normalized_url) > 2048 or normalized_url !~ '^https://')) then
    raise exception 'Invalid meeting data';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'board', 'head')
  ) then raise exception 'Not authorized'; end if;

  select * into active_season from public.seasons
  where organization_id = p_organization_id and status = 'active'
  for key share;
  if not found then raise exception 'No active season'; end if;

  insert into public.meetings (
    organization_id, season_id, meeting_type, title, starts_at, location, agenda, reference_url, created_by
  ) values (
    p_organization_id, active_season.id, p_meeting_type, normalized_title, p_starts_at at time zone 'Africa/Cairo',
    normalized_location, normalized_agenda, normalized_url, auth.uid()
  ) returning id into meeting_id;

  insert into public.meeting_attendance (organization_id, meeting_id, membership_id)
  select p_organization_id, meeting_id, id
  from public.memberships
  where organization_id = p_organization_id and status = 'active';

  return meeting_id;
end;
$$;

create or replace function public.update_scheduled_meeting(
  p_organization_id uuid,
  p_meeting_id uuid,
  p_meeting_type text,
  p_title text,
  p_starts_at timestamp without time zone,
  p_location text,
  p_agenda text,
  p_minutes text,
  p_decisions text,
  p_reference_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_row public.meetings%rowtype;
  normalized_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
  normalized_location text := nullif(btrim(coalesce(p_location, '')), '');
  normalized_agenda text := nullif(btrim(coalesce(p_agenda, '')), '');
  normalized_minutes text := nullif(btrim(coalesce(p_minutes, '')), '');
  normalized_decisions text := nullif(btrim(coalesce(p_decisions, '')), '');
  normalized_url text := nullif(btrim(coalesce(p_reference_url, '')), '');
begin
  if auth.uid() is null
    or p_meeting_type not in ('board', 'department', 'committee', 'project', 'emergency')
    or char_length(normalized_title) not between 2 and 160
    or p_starts_at is null
    or char_length(coalesce(normalized_location, '')) > 300
    or char_length(coalesce(normalized_agenda, '')) > 3000
    or char_length(coalesce(normalized_minutes, '')) > 6000
    or char_length(coalesce(normalized_decisions, '')) > 6000
    or (normalized_url is not null and (char_length(normalized_url) > 2048 or normalized_url !~ '^https://')) then
    raise exception 'Invalid meeting data';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'board', 'head')
  ) then raise exception 'Not authorized'; end if;

  select * into meeting_row from public.meetings
  where organization_id = p_organization_id and id = p_meeting_id
  for update;
  if not found then raise exception 'Meeting not found'; end if;
  if meeting_row.status <> 'scheduled' then raise exception 'Only scheduled meetings can be edited'; end if;
  if not exists (
    select 1 from public.seasons
    where organization_id = p_organization_id and id = meeting_row.season_id and status = 'active'
  ) then raise exception 'Meeting season is archived'; end if;

  update public.meetings
  set meeting_type = p_meeting_type, title = normalized_title, starts_at = p_starts_at at time zone 'Africa/Cairo',
      location = normalized_location, agenda = normalized_agenda, minutes = normalized_minutes,
      decisions = normalized_decisions, reference_url = normalized_url, updated_at = now()
  where id = meeting_row.id;
end;
$$;

create or replace function public.complete_meeting(
  p_organization_id uuid,
  p_meeting_id uuid,
  p_membership_ids uuid[],
  p_statuses text[],
  p_minutes text,
  p_decisions text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_row public.meetings%rowtype;
  roster_count integer;
  provided_count integer := coalesce(cardinality(p_membership_ids), 0);
  normalized_minutes text := nullif(btrim(coalesce(p_minutes, '')), '');
  normalized_decisions text := nullif(btrim(coalesce(p_decisions, '')), '');
begin
  if auth.uid() is null
    or char_length(coalesce(normalized_minutes, '')) > 6000
    or char_length(coalesce(normalized_decisions, '')) > 6000
    or provided_count = 0
    or provided_count <> coalesce(cardinality(p_statuses), 0)
    or exists (select 1 from unnest(p_statuses) as value where value is null or value not in ('present', 'absent', 'excused'))
    or (select count(distinct value) from unnest(p_membership_ids) as value) <> provided_count then
    raise exception 'Invalid attendance data';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'board', 'head')
  ) then raise exception 'Not authorized'; end if;

  select * into meeting_row from public.meetings
  where organization_id = p_organization_id and id = p_meeting_id
  for update;
  if not found then raise exception 'Meeting not found'; end if;
  if meeting_row.status <> 'scheduled' then raise exception 'Meeting is not scheduled'; end if;
  if not exists (
    select 1 from public.seasons
    where organization_id = p_organization_id and id = meeting_row.season_id and status = 'active'
  ) then raise exception 'Meeting season is archived'; end if;

  select count(*) into roster_count from public.meeting_attendance
  where organization_id = p_organization_id and meeting_id = p_meeting_id;
  if roster_count <> provided_count
    or exists (
      (select membership_id from public.meeting_attendance where organization_id = p_organization_id and meeting_id = p_meeting_id)
      except
      (select value from unnest(p_membership_ids) as value)
    ) then
    raise exception 'Attendance must cover the frozen meeting roster exactly';
  end if;

  update public.meeting_attendance as attendance
  set status = submitted.status, marked_at = now()
  from unnest(p_membership_ids, p_statuses) as submitted(membership_id, status)
  where attendance.organization_id = p_organization_id
    and attendance.meeting_id = p_meeting_id
    and attendance.membership_id = submitted.membership_id;

  update public.meetings
  set status = 'completed', minutes = normalized_minutes, decisions = normalized_decisions,
      completed_at = now(), updated_at = now()
  where id = p_meeting_id and organization_id = p_organization_id;
end;
$$;

create or replace function public.cancel_meeting(p_organization_id uuid, p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_row public.meetings%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'board', 'head')
  ) then raise exception 'Not authorized'; end if;
  select * into meeting_row from public.meetings
  where organization_id = p_organization_id and id = p_meeting_id
  for update;
  if not found then raise exception 'Meeting not found'; end if;
  if meeting_row.status <> 'scheduled' then raise exception 'Only scheduled meetings can be cancelled'; end if;
  if not exists (
    select 1 from public.seasons
    where organization_id = p_organization_id and id = meeting_row.season_id and status = 'active'
  ) then raise exception 'Meeting season is archived'; end if;
  update public.meetings set status = 'cancelled', updated_at = now()
  where id = meeting_row.id;
end;
$$;

create or replace function public.list_meetings(p_organization_id uuid)
returns table (
  meeting_id uuid,
  season_id uuid,
  season_name text,
  season_status text,
  meeting_type text,
  title text,
  starts_at timestamptz,
  location text,
  agenda text,
  minutes text,
  decisions text,
  reference_url text,
  status text,
  created_by_name text,
  completed_at timestamptz,
  created_at timestamptz,
  my_attendance_status text,
  roster_count bigint,
  present_count bigint,
  absent_count bigint,
  excused_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_membership_id uuid;
  viewer_is_manager boolean;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select id, role in ('owner', 'board', 'head') into viewer_membership_id, viewer_is_manager
  from public.memberships
  where organization_id = p_organization_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not authorized'; end if;

  return query
  select
    m.id, m.season_id, season.name, season.status, m.meeting_type, m.title, m.starts_at, m.location, m.agenda,
    m.minutes, m.decisions, m.reference_url, m.status,
    coalesce(creator.full_name, 'عضو'), m.completed_at, m.created_at,
    mine.status,
    case when viewer_is_manager then counts.roster_count else null end,
    case when viewer_is_manager then counts.present_count else null end,
    case when viewer_is_manager then counts.absent_count else null end,
    case when viewer_is_manager then counts.excused_count else null end
  from public.meetings as m
  join public.seasons as season on season.organization_id = m.organization_id and season.id = m.season_id
  left join public.meeting_attendance as mine
    on mine.organization_id = m.organization_id and mine.meeting_id = m.id and mine.membership_id = viewer_membership_id
  left join public.profiles as creator on creator.id = m.created_by
  left join lateral (
    select count(*) as roster_count,
      count(*) filter (where attendance.status = 'present') as present_count,
      count(*) filter (where attendance.status = 'absent') as absent_count,
      count(*) filter (where attendance.status = 'excused') as excused_count
    from public.meeting_attendance as attendance
    where attendance.organization_id = m.organization_id and attendance.meeting_id = m.id
  ) as counts on viewer_is_manager
  where m.organization_id = p_organization_id
    and (viewer_is_manager or mine.membership_id is not null)
  order by m.starts_at desc;
end;
$$;

create or replace function public.list_meeting_attendance(p_organization_id uuid, p_meeting_id uuid)
returns table (membership_id uuid, user_id uuid, display_name text, attendance_status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'board', 'head')
  ) then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.meetings where organization_id = p_organization_id and id = p_meeting_id
  ) then raise exception 'Meeting not found'; end if;
  return query
  select attendance.membership_id, member.user_id, coalesce(profile.full_name, 'عضو'), attendance.status
  from public.meeting_attendance as attendance
  join public.memberships as member
    on member.organization_id = attendance.organization_id and member.id = attendance.membership_id
  left join public.profiles as profile on profile.id = member.user_id
  where attendance.organization_id = p_organization_id and attendance.meeting_id = p_meeting_id
  order by coalesce(profile.full_name, 'عضو'), attendance.membership_id;
end;
$$;

create or replace function public.create_meeting_task(
  p_organization_id uuid,
  p_meeting_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_due_on date,
  p_assignee_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_row public.meetings%rowtype;
  task_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'board', 'head')
  ) then raise exception 'Not authorized'; end if;
  select * into meeting_row from public.meetings
  where organization_id = p_organization_id and id = p_meeting_id
  for update;
  if not found then raise exception 'Meeting not found'; end if;
  if meeting_row.status = 'cancelled' then raise exception 'Cancelled meetings cannot create tasks'; end if;
  if not exists (
    select 1 from public.seasons
    where organization_id = p_organization_id and id = meeting_row.season_id and status = 'active'
  ) then raise exception 'Meeting season is archived'; end if;

  task_id := public.create_task(
    p_organization_id, p_title, p_description, p_priority, p_due_on, null, p_assignee_user_id
  );
  update public.tasks set meeting_id = p_meeting_id, updated_at = now()
  where organization_id = p_organization_id and id = task_id;
  insert into public.task_history (organization_id, task_id, actor_user_id, event_type, changed_fields)
  values (p_organization_id, task_id, auth.uid(), 'updated', array['meeting']);
  return task_id;
end;
$$;

-- Season rollover must preserve meeting attendance and block unresolved scheduled meetings.
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
  if not found then raise exception 'Organization not found'; end if;
  perform 1 from public.memberships
  where organization_id = p_organization_id and user_id = auth.uid()
    and role = 'owner' and status = 'active'
  for key share;
  if not found then raise exception 'Not authorized'; end if;
  select * into prior_season from public.seasons
  where organization_id = p_organization_id and status = 'active'
  for update;
  if found then
    if p_starts_on <= prior_season.starts_on then
      raise exception 'The new season must start after the active season starts';
    end if;
    if exists (
      select 1 from public.membership_assignments
      where organization_id = p_organization_id and season_id = prior_season.id and starts_on >= p_starts_on
    ) then raise exception 'Close future assignments before starting this season'; end if;
    if exists (
      select 1 from public.meetings
      where organization_id = p_organization_id and season_id = prior_season.id and status = 'scheduled'
    ) then raise exception 'Complete or cancel scheduled meetings before starting this season'; end if;
    update public.membership_assignments
    set ends_on = least(p_starts_on - 1, prior_season.ends_on)
    where organization_id = p_organization_id and season_id = prior_season.id
      and (ends_on is null or ends_on >= p_starts_on);
    update public.recruitment_campaigns
    set status = 'closed', closed_at = now()
    where organization_id = p_organization_id and season_id = prior_season.id and status = 'open';
    update public.seasons set status = 'archived' where id = prior_season.id;
  end if;
  insert into public.seasons (organization_id, name, starts_on, ends_on, status)
  values (p_organization_id, btrim(p_name), p_starts_on, p_ends_on, 'active')
  returning id into new_season_id;
  return new_season_id;
end;
$$;

revoke all on function public.create_meeting(uuid, text, text, timestamp without time zone, text, text, text) from public, anon;
grant execute on function public.create_meeting(uuid, text, text, timestamp without time zone, text, text, text) to authenticated;
revoke all on function public.update_scheduled_meeting(uuid, uuid, text, text, timestamp without time zone, text, text, text, text, text) from public, anon;
grant execute on function public.update_scheduled_meeting(uuid, uuid, text, text, timestamp without time zone, text, text, text, text, text) to authenticated;
revoke all on function public.complete_meeting(uuid, uuid, uuid[], text[], text, text) from public, anon;
grant execute on function public.complete_meeting(uuid, uuid, uuid[], text[], text, text) to authenticated;
revoke all on function public.cancel_meeting(uuid, uuid) from public, anon;
grant execute on function public.cancel_meeting(uuid, uuid) to authenticated;
revoke all on function public.list_meetings(uuid) from public, anon;
grant execute on function public.list_meetings(uuid) to authenticated;
revoke all on function public.list_meeting_attendance(uuid, uuid) from public, anon;
grant execute on function public.list_meeting_attendance(uuid, uuid) to authenticated;
revoke all on function public.create_meeting_task(uuid, uuid, text, text, text, date, uuid) from public, anon;
grant execute on function public.create_meeting_task(uuid, uuid, text, text, text, date, uuid) to authenticated;
