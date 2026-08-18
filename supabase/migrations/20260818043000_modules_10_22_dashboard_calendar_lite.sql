-- Modules 10 + 22 — bounded, read-only calendar and role-aware dashboards.
-- No new tables: existing task, meeting, attendance, and event records remain the source of truth.

create or replace function public.get_my_dashboard(
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cairo_today date := (now() at time zone 'Africa/Cairo')::date;
  dashboard_items jsonb;
  open_tasks bigint;
  overdue_tasks bigint;
  undated_tasks bigint;
begin
  if auth.uid() is null
    or p_starts_on is null
    or p_ends_on is null
    or p_ends_on < p_starts_on
    or p_ends_on > p_starts_on + 92 then
    raise exception 'Invalid dashboard date range';
  end if;

  select
    count(*) filter (where t.status not in ('done', 'cancelled')),
    count(*) filter (where t.status not in ('done', 'cancelled') and t.due_on < cairo_today),
    count(*) filter (where t.status not in ('done', 'cancelled') and t.due_on is null)
  into open_tasks, overdue_tasks, undated_tasks
  from public.tasks as t
  join public.memberships as member
    on member.organization_id = t.organization_id
   and member.id = t.assignee_membership_id
   and member.user_id = auth.uid()
   and member.status = 'active'
  join public.seasons as season
    on season.organization_id = t.organization_id
   and season.id = t.season_id
   and season.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', item.kind, 'item_id', item.item_id, 'organization_id', item.organization_id,
    'organization_name', item.organization_name, 'title', item.title, 'due_on', item.due_on,
    'starts_at', item.starts_at, 'ends_at', item.ends_at, 'href', item.href
  ) order by item.sorts_at, item.kind, item.item_id), '[]'::jsonb)
  into dashboard_items
  from (
    select 'task'::text as kind, t.id as item_id, t.organization_id, o.name as organization_name,
      t.title, t.due_on::text as due_on, null::timestamptz as starts_at, null::timestamptz as ends_at,
      format('/organizations/%s/tasks?mine=1', t.organization_id) as href,
      t.due_on::timestamptz as sorts_at
    from public.tasks as t
    join public.organizations as o on o.id = t.organization_id
    join public.memberships as member
      on member.organization_id = t.organization_id and member.id = t.assignee_membership_id
      and member.user_id = auth.uid() and member.status = 'active'
    join public.seasons as season
      on season.organization_id = t.organization_id and season.id = t.season_id and season.status = 'active'
    where t.status not in ('done', 'cancelled')
      and t.due_on between p_starts_on and p_ends_on

    union all

    select 'meeting', meeting.id, meeting.organization_id, o.name, meeting.title,
      null, meeting.starts_at, null,
      format('/organizations/%s/meetings', meeting.organization_id), meeting.starts_at
    from public.meetings as meeting
    join public.organizations as o on o.id = meeting.organization_id
    join public.meeting_attendance as attendance
      on attendance.organization_id = meeting.organization_id and attendance.meeting_id = meeting.id
    join public.memberships as member
      on member.organization_id = meeting.organization_id and member.id = attendance.membership_id
      and member.user_id = auth.uid() and member.status = 'active'
    join public.seasons as season
      on season.organization_id = meeting.organization_id and season.id = meeting.season_id and season.status = 'active'
    where meeting.status = 'scheduled'
      and meeting.starts_at >= (p_starts_on::timestamp at time zone 'Africa/Cairo')
      and meeting.starts_at < ((p_ends_on + 1)::timestamp at time zone 'Africa/Cairo')

    union all

    select 'event', event.id, event.organization_id, o.name, event.title,
      null, event.starts_at, event.ends_at,
      format('/events/%s', event.id), event.starts_at
    from public.events as event
    join public.organizations as o on o.id = event.organization_id
    join public.event_registrations as registration
      on registration.organization_id = event.organization_id and registration.event_id = event.id
      and registration.user_id = auth.uid() and registration.status = 'registered'
    join public.seasons as season
      on season.organization_id = event.organization_id and season.id = event.season_id and season.status = 'active'
    where event.status = 'published'
      and event.starts_at >= (p_starts_on::timestamp at time zone 'Africa/Cairo')
      and event.starts_at < ((p_ends_on + 1)::timestamp at time zone 'Africa/Cairo')
    order by 10, 1, 2
    limit 100
  ) as item;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'open_tasks', open_tasks,
      'overdue_tasks', overdue_tasks,
      'undated_tasks', undated_tasks
    ),
    'items', dashboard_items
  );
end;
$$;

create or replace function public.get_organization_dashboard(
  p_organization_id uuid,
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cairo_today date := (now() at time zone 'Africa/Cairo')::date;
  viewer_membership public.memberships%rowtype;
  is_manager boolean;
  is_owner boolean;
  dashboard_items jsonb;
begin
  if auth.uid() is null
    or p_starts_on is null
    or p_ends_on is null
    or p_ends_on < p_starts_on
    or p_ends_on > p_starts_on + 92 then
    raise exception 'Invalid dashboard date range';
  end if;

  select * into viewer_membership
  from public.memberships
  where organization_id = p_organization_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not authorized'; end if;
  is_manager := viewer_membership.role in ('owner', 'board', 'head');
  is_owner := viewer_membership.role = 'owner';

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', item.kind, 'item_id', item.item_id, 'title', item.title, 'due_on', item.due_on,
    'starts_at', item.starts_at, 'ends_at', item.ends_at, 'href', item.href
  ) order by item.sorts_at, item.kind, item.item_id), '[]'::jsonb)
  into dashboard_items
  from (
    select 'task'::text as kind, t.id as item_id, t.title, t.due_on::text as due_on,
      null::timestamptz as starts_at, null::timestamptz as ends_at,
      format('/organizations/%s/tasks%s', p_organization_id, case when is_manager then '' else '?mine=1' end) as href,
      t.due_on::timestamptz as sorts_at
    from public.tasks as t
    join public.seasons as season on season.organization_id = t.organization_id and season.id = t.season_id and season.status = 'active'
    where t.organization_id = p_organization_id and t.status not in ('done', 'cancelled')
      and t.due_on between p_starts_on and p_ends_on
      and (is_manager or t.assignee_membership_id = viewer_membership.id)

    union all

    select 'meeting', meeting.id, meeting.title, null, meeting.starts_at, null,
      format('/organizations/%s/meetings', p_organization_id), meeting.starts_at
    from public.meetings as meeting
    join public.seasons as season on season.organization_id = meeting.organization_id and season.id = meeting.season_id and season.status = 'active'
    left join public.meeting_attendance as attendance
      on attendance.organization_id = meeting.organization_id and attendance.meeting_id = meeting.id and attendance.membership_id = viewer_membership.id
    where meeting.organization_id = p_organization_id and meeting.status = 'scheduled'
      and meeting.starts_at >= (p_starts_on::timestamp at time zone 'Africa/Cairo')
      and meeting.starts_at < ((p_ends_on + 1)::timestamp at time zone 'Africa/Cairo')
      and (is_manager or attendance.membership_id is not null)

    union all

    select 'event', event.id, event.title, null, event.starts_at, event.ends_at,
      format('/events/%s', event.id), event.starts_at
    from public.events as event
    join public.seasons as season on season.organization_id = event.organization_id and season.id = event.season_id and season.status = 'active'
    left join public.event_registrations as registration
      on registration.organization_id = event.organization_id and registration.event_id = event.id
      and registration.user_id = auth.uid() and registration.status = 'registered'
    where event.organization_id = p_organization_id and event.status = 'published'
      and event.starts_at >= (p_starts_on::timestamp at time zone 'Africa/Cairo')
      and event.starts_at < ((p_ends_on + 1)::timestamp at time zone 'Africa/Cairo')
      and (is_manager or registration.id is not null)
    order by 8, 1, 2
    limit 8
  ) as item;

  if not is_manager then
    return jsonb_build_object(
      'role', viewer_membership.role,
      'metrics', jsonb_build_object(
        'my_open_tasks', (select count(*) from public.tasks t join public.seasons s on s.organization_id = t.organization_id and s.id = t.season_id and s.status = 'active' where t.organization_id = p_organization_id and t.assignee_membership_id = viewer_membership.id and t.status not in ('done', 'cancelled')),
        'my_overdue_tasks', (select count(*) from public.tasks t join public.seasons s on s.organization_id = t.organization_id and s.id = t.season_id and s.status = 'active' where t.organization_id = p_organization_id and t.assignee_membership_id = viewer_membership.id and t.status not in ('done', 'cancelled') and t.due_on < cairo_today),
        'my_scheduled_meetings', (select count(*) from public.meetings m join public.meeting_attendance a on a.organization_id = m.organization_id and a.meeting_id = m.id join public.seasons s on s.organization_id = m.organization_id and s.id = m.season_id and s.status = 'active' where m.organization_id = p_organization_id and m.status = 'scheduled' and a.membership_id = viewer_membership.id),
        'my_registered_events', (select count(*) from public.events e join public.event_registrations r on r.organization_id = e.organization_id and r.event_id = e.id and r.user_id = auth.uid() and r.status = 'registered' join public.seasons s on s.organization_id = e.organization_id and s.id = e.season_id and s.status = 'active' where e.organization_id = p_organization_id and e.status = 'published'),
        'organization', null,
        'recruitment', null
      ),
      'upcoming', dashboard_items
    );
  end if;

  return jsonb_build_object(
    'role', viewer_membership.role,
    'metrics', jsonb_build_object(
      'active_members', (select count(*) from public.memberships where organization_id = p_organization_id and status = 'active'),
      'open_tasks', (select count(*) from public.tasks t join public.seasons s on s.organization_id = t.organization_id and s.id = t.season_id and s.status = 'active' where t.organization_id = p_organization_id and t.status not in ('done', 'cancelled')),
      'overdue_tasks', (select count(*) from public.tasks t join public.seasons s on s.organization_id = t.organization_id and s.id = t.season_id and s.status = 'active' where t.organization_id = p_organization_id and t.status not in ('done', 'cancelled') and t.due_on < cairo_today),
      'unassigned_tasks', (select count(*) from public.tasks t join public.seasons s on s.organization_id = t.organization_id and s.id = t.season_id and s.status = 'active' where t.organization_id = p_organization_id and t.status not in ('done', 'cancelled') and t.assignee_membership_id is null),
      'scheduled_meetings', (select count(*) from public.meetings m join public.seasons s on s.organization_id = m.organization_id and s.id = m.season_id and s.status = 'active' where m.organization_id = p_organization_id and m.status = 'scheduled'),
      'scheduled_events', (select count(*) from public.events e join public.seasons s on s.organization_id = e.organization_id and s.id = e.season_id and s.status = 'active' where e.organization_id = p_organization_id and e.status = 'published'),
      'completed_meeting_attendance', (select count(*) from public.meeting_attendance a join public.meetings m on m.organization_id = a.organization_id and m.id = a.meeting_id join public.seasons s on s.organization_id = m.organization_id and s.id = m.season_id and s.status = 'active' where a.organization_id = p_organization_id and m.status = 'completed' and a.status is not null),
      'recruitment', case when is_owner then jsonb_build_object(
        'open_campaigns', (select count(*) from public.recruitment_campaigns c join public.seasons s on s.organization_id = c.organization_id and s.id = c.season_id and s.status = 'active' where c.organization_id = p_organization_id and c.status = 'open' and c.closes_on >= cairo_today),
        'applications', (select count(*) from public.recruitment_applications where organization_id = p_organization_id)
      ) else null end
    ),
    'upcoming', dashboard_items
  );
end;
$$;

revoke all on function public.get_my_dashboard(date, date) from public, anon;
grant execute on function public.get_my_dashboard(date, date) to authenticated;
revoke all on function public.get_organization_dashboard(uuid, date, date) from public, anon;
grant execute on function public.get_organization_dashboard(uuid, date, date) to authenticated;
