-- Module 16 follow-up: keep internal event objectives manager-only.
create or replace function public.list_events(p_organization_id uuid)
returns table (
  event_id uuid, season_id uuid, season_name text, season_status text, title text, objective text,
  starts_at timestamptz, ends_at timestamptz, venue text, capacity integer, status text,
  created_by_name text, created_at timestamptz, updated_at timestamptz, completed_at timestamptz,
  registration_count bigint, my_team_role text
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
  select id, role in ('owner', 'board', 'head')
  into viewer_membership_id, viewer_is_manager
  from public.memberships
  where organization_id = p_organization_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not authorized'; end if;

  return query
  select
    e.id, e.season_id, s.name, s.status, e.title,
    case when viewer_is_manager then e.objective else null end,
    e.starts_at, e.ends_at, e.venue, e.capacity, e.status,
    coalesce(creator.full_name, 'عضو'), e.created_at, e.updated_at, e.completed_at,
    case when viewer_is_manager then registrations.count else null end, mine.role_title
  from public.events as e
  join public.seasons as s on s.organization_id = e.organization_id and s.id = e.season_id
  left join public.profiles as creator on creator.id = e.created_by
  left join public.event_team_assignments as mine
    on mine.organization_id = e.organization_id and mine.event_id = e.id and mine.membership_id = viewer_membership_id
  left join lateral (
    select count(*) from public.event_registrations as registration
    where registration.organization_id = e.organization_id and registration.event_id = e.id and registration.status = 'registered'
  ) as registrations on viewer_is_manager
  where e.organization_id = p_organization_id and (viewer_is_manager or e.status <> 'draft')
  order by (s.status = 'active') desc, e.starts_at desc;
end;
$$;

revoke all on function public.list_events(uuid) from public, anon;
grant execute on function public.list_events(uuid) to authenticated;
