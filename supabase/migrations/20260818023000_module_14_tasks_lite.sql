-- Module 14 — Tasks Lite: one active-season task workflow with immutable history.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  season_id uuid not null,
  department_id uuid,
  title text not null check (
    title = btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g'))
    and char_length(title) between 2 and 160
  ),
  description text check (description is null or (description = btrim(description) and char_length(description) <= 3000)),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  due_on date,
  assignee_membership_id uuid,
  created_by uuid not null references auth.users (id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, season_id)
    references public.seasons (organization_id, id) on delete restrict,
  foreign key (organization_id, season_id, department_id)
    references public.departments (organization_id, season_id, id) on delete restrict,
  foreign key (organization_id, assignee_membership_id)
    references public.memberships (organization_id, id) on delete set null (assignee_membership_id),
  check (
    (status = 'done' and progress = 100 and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  )
);

create table public.task_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  event_type text not null check (event_type in ('created', 'updated', 'status_changed', 'assignee_changed')),
  from_status text check (from_status is null or from_status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  to_status text check (to_status is null or to_status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  from_assignee_membership_id uuid,
  to_assignee_membership_id uuid,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (organization_id, task_id)
    references public.tasks (organization_id, id) on delete cascade,
  foreign key (organization_id, from_assignee_membership_id)
    references public.memberships (organization_id, id) on delete set null (from_assignee_membership_id),
  foreign key (organization_id, to_assignee_membership_id)
    references public.memberships (organization_id, id) on delete set null (to_assignee_membership_id)
);

create index tasks_org_status_due_idx on public.tasks (organization_id, status, due_on);
create index tasks_org_assignee_due_idx on public.tasks (organization_id, assignee_membership_id, due_on);
create index task_history_task_created_idx on public.task_history (task_id, created_at desc);

alter table public.tasks enable row level security;
alter table public.task_history enable row level security;
revoke all on table public.tasks from public, anon, authenticated;
revoke all on table public.task_history from public, anon, authenticated;

create or replace function public.create_task(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_due_on date,
  p_department_id uuid,
  p_assignee_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_season public.seasons%rowtype;
  assignee_membership_id uuid;
  normalized_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
  task_id uuid;
begin
  if auth.uid() is null
    or char_length(normalized_title) not between 2 and 160
    or char_length(coalesce(normalized_description, '')) > 3000
    or p_priority is null or p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid task data';
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

  if p_department_id is not null and not exists (
    select 1 from public.departments
    where organization_id = p_organization_id and season_id = active_season.id and id = p_department_id
  ) then raise exception 'Department not found in the active season'; end if;

  if p_assignee_user_id is not null then
    select id into assignee_membership_id from public.memberships
    where organization_id = p_organization_id and user_id = p_assignee_user_id and status = 'active'
    for key share;
    if not found then raise exception 'Assignee must be an active member'; end if;
  end if;

  insert into public.tasks (
    organization_id, season_id, department_id, title, description, priority, due_on, assignee_membership_id, created_by
  ) values (
    p_organization_id, active_season.id, p_department_id, normalized_title, normalized_description, p_priority, p_due_on, assignee_membership_id, auth.uid()
  ) returning id into task_id;

  insert into public.task_history (
    organization_id, task_id, actor_user_id, event_type, to_status, to_assignee_membership_id, changed_fields
  ) values (
    p_organization_id, task_id, auth.uid(), 'created', 'todo', assignee_membership_id,
    array['title', 'description', 'priority', 'due_on', 'department', 'assignee']
  );

  return task_id;
end;
$$;

create or replace function public.list_tasks(
  p_organization_id uuid,
  p_status text default null,
  p_assigned_to_me boolean default false
)
returns table (
  task_id uuid,
  season_id uuid,
  department_id uuid,
  department_name text,
  title text,
  description text,
  priority text,
  status text,
  progress smallint,
  due_on date,
  assignee_user_id uuid,
  assignee_name text,
  assignee_membership_id uuid,
  creator_name text,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
  if p_status is not null and p_status not in ('todo', 'in_progress', 'blocked', 'done', 'cancelled') then
    raise exception 'Invalid status filter';
  end if;

  select id, role in ('owner', 'board', 'head') into viewer_membership_id, viewer_is_manager from public.memberships
  where organization_id = p_organization_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not authorized'; end if;

  return query
  select
    t.id, t.season_id, t.department_id, d.name, t.title, t.description, t.priority, t.status, t.progress, t.due_on,
    assignee.user_id, coalesce(assignee_profile.full_name, 'عضو'), t.assignee_membership_id,
    coalesce(creator_profile.full_name, 'عضو'), t.completed_at, t.created_at, t.updated_at
  from public.tasks as t
  join public.seasons as season
    on season.organization_id = t.organization_id and season.id = t.season_id and season.status = 'active'
  left join public.departments as d
    on d.organization_id = t.organization_id and d.season_id = t.season_id and d.id = t.department_id
  left join public.memberships as assignee
    on assignee.organization_id = t.organization_id and assignee.id = t.assignee_membership_id
  left join public.profiles as assignee_profile on assignee_profile.id = assignee.user_id
  left join public.profiles as creator_profile on creator_profile.id = t.created_by
  where t.organization_id = p_organization_id
    and (p_status is null or t.status = p_status)
    and (
      t.assignee_membership_id = viewer_membership_id
      or (viewer_is_manager and not p_assigned_to_me)
    )
  order by (t.status in ('done', 'cancelled')), t.due_on nulls last, t.created_at desc;
end;
$$;

create or replace function public.update_task(
  p_organization_id uuid,
  p_task_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_due_on date,
  p_department_id uuid,
  p_assignee_user_id uuid,
  p_status text,
  p_progress smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_task public.tasks%rowtype;
  assignee_membership_id uuid;
  normalized_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
  normalized_description text := nullif(btrim(coalesce(p_description, '')), '');
  next_progress smallint;
  next_completed_at timestamptz;
  changed text[];
  history_event text;
begin
  if auth.uid() is null
    or char_length(normalized_title) not between 2 and 160
    or char_length(coalesce(normalized_description, '')) > 3000
    or p_priority is null or p_priority not in ('low', 'medium', 'high', 'urgent')
    or p_status is null or p_status not in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')
    or p_progress is null or p_progress not between 0 and 100 then
    raise exception 'Invalid task data';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'board', 'head')
  ) then raise exception 'Not authorized'; end if;

  select * into current_task from public.tasks
  where id = p_task_id and organization_id = p_organization_id
  for update;
  if not found then raise exception 'Task not found'; end if;
  if not exists (
    select 1 from public.seasons
    where organization_id = p_organization_id and id = current_task.season_id and status = 'active'
  ) then raise exception 'Task season is archived'; end if;

  if p_department_id is not null and not exists (
    select 1 from public.departments
    where organization_id = p_organization_id and season_id = current_task.season_id and id = p_department_id
  ) then raise exception 'Department not found in task season'; end if;

  if p_assignee_user_id is not null then
    select id into assignee_membership_id from public.memberships
    where organization_id = p_organization_id and user_id = p_assignee_user_id and status = 'active'
    for key share;
    if not found then raise exception 'Assignee must be an active member'; end if;
  end if;

  next_progress := case when p_status = 'done' then 100 else p_progress end;
  next_completed_at := case when p_status = 'done' then coalesce(current_task.completed_at, now()) else null end;
  changed := array_remove(array[
    case when current_task.title is distinct from normalized_title then 'title' end,
    case when current_task.description is distinct from normalized_description then 'description' end,
    case when current_task.priority is distinct from p_priority then 'priority' end,
    case when current_task.due_on is distinct from p_due_on then 'due_on' end,
    case when current_task.department_id is distinct from p_department_id then 'department' end,
    case when current_task.assignee_membership_id is distinct from assignee_membership_id then 'assignee' end,
    case when current_task.status is distinct from p_status then 'status' end,
    case when current_task.progress is distinct from next_progress then 'progress' end
  ], null);
  if coalesce(array_length(changed, 1), 0) = 0 then return; end if;
  history_event := case
    when current_task.status is distinct from p_status then 'status_changed'
    when current_task.assignee_membership_id is distinct from assignee_membership_id then 'assignee_changed'
    else 'updated'
  end;

  update public.tasks
  set title = normalized_title, description = normalized_description, priority = p_priority, due_on = p_due_on,
      department_id = p_department_id, assignee_membership_id = assignee_membership_id,
      status = p_status, progress = next_progress, completed_at = next_completed_at, updated_at = now()
  where id = current_task.id;

  insert into public.task_history (
    organization_id, task_id, actor_user_id, event_type, from_status, to_status,
    from_assignee_membership_id, to_assignee_membership_id, changed_fields
  ) values (
    p_organization_id, current_task.id, auth.uid(), history_event, current_task.status, p_status,
    current_task.assignee_membership_id, assignee_membership_id, changed
  );
end;
$$;

create or replace function public.update_my_task_progress(
  p_organization_id uuid,
  p_task_id uuid,
  p_status text,
  p_progress smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_membership_id uuid;
  current_task public.tasks%rowtype;
  next_progress smallint;
  next_completed_at timestamptz;
  changed text[];
begin
  if auth.uid() is null
    or p_status is null or p_status not in ('todo', 'in_progress', 'blocked', 'done')
    or p_progress is null or p_progress not between 0 and 100 then
    raise exception 'Invalid task update';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  select id into viewer_membership_id from public.memberships
  where organization_id = p_organization_id and user_id = auth.uid() and status = 'active'
  for key share;
  if not found then raise exception 'Not authorized'; end if;

  select * into current_task from public.tasks
  where id = p_task_id and organization_id = p_organization_id
  for update;
  if not found or current_task.assignee_membership_id is distinct from viewer_membership_id then
    raise exception 'Task is not assigned to you';
  end if;
  if not exists (
    select 1 from public.seasons
    where organization_id = p_organization_id and id = current_task.season_id and status = 'active'
  ) then raise exception 'Task season is archived'; end if;
  if current_task.status in ('done', 'cancelled') then
    raise exception 'Completed or cancelled tasks must be reopened by a manager';
  end if;

  next_progress := case when p_status = 'done' then 100 else p_progress end;
  next_completed_at := case when p_status = 'done' then coalesce(current_task.completed_at, now()) else null end;
  changed := array_remove(array[
    case when current_task.status is distinct from p_status then 'status' end,
    case when current_task.progress is distinct from next_progress then 'progress' end
  ], null);
  if coalesce(array_length(changed, 1), 0) = 0 then return; end if;

  update public.tasks
  set status = p_status, progress = next_progress, completed_at = next_completed_at, updated_at = now()
  where id = current_task.id;

  insert into public.task_history (
    organization_id, task_id, actor_user_id, event_type, from_status, to_status,
    from_assignee_membership_id, to_assignee_membership_id, changed_fields
  ) values (
    p_organization_id, current_task.id, auth.uid(),
    case when current_task.status is distinct from p_status then 'status_changed' else 'updated' end,
    current_task.status, p_status, current_task.assignee_membership_id, current_task.assignee_membership_id, changed
  );
end;
$$;

create or replace function public.list_task_history(p_organization_id uuid, p_task_id uuid)
returns table (
  event_type text,
  actor_name text,
  from_status text,
  to_status text,
  from_assignee_name text,
  to_assignee_name text,
  changed_fields text[],
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_membership public.memberships%rowtype;
  task_assignee_membership_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select * into viewer_membership from public.memberships
  where organization_id = p_organization_id and user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Not authorized'; end if;

  select assignee_membership_id into task_assignee_membership_id from public.tasks
  where id = p_task_id and organization_id = p_organization_id;
  if not found then raise exception 'Task not found'; end if;
  if viewer_membership.role not in ('owner', 'board', 'head')
    and task_assignee_membership_id is distinct from viewer_membership.id then
    raise exception 'Not authorized';
  end if;

  return query
  select
    h.event_type, coalesce(actor_profile.full_name, 'عضو'), h.from_status, h.to_status,
    coalesce(from_profile.full_name, 'غير مكلّف'), coalesce(to_profile.full_name, 'غير مكلّف'),
    h.changed_fields, h.created_at
  from public.task_history as h
  left join public.profiles as actor_profile on actor_profile.id = h.actor_user_id
  left join public.memberships as from_member
    on from_member.organization_id = h.organization_id and from_member.id = h.from_assignee_membership_id
  left join public.profiles as from_profile on from_profile.id = from_member.user_id
  left join public.memberships as to_member
    on to_member.organization_id = h.organization_id and to_member.id = h.to_assignee_membership_id
  left join public.profiles as to_profile on to_profile.id = to_member.user_id
  where h.organization_id = p_organization_id and h.task_id = p_task_id
  order by h.created_at desc;
end;
$$;

revoke all on function public.create_task(uuid, text, text, text, date, uuid, uuid) from public, anon;
grant execute on function public.create_task(uuid, text, text, text, date, uuid, uuid) to authenticated;
revoke all on function public.list_tasks(uuid, text, boolean) from public, anon;
grant execute on function public.list_tasks(uuid, text, boolean) to authenticated;
revoke all on function public.update_task(uuid, uuid, text, text, text, date, uuid, uuid, text, smallint) from public, anon;
grant execute on function public.update_task(uuid, uuid, text, text, text, date, uuid, uuid, text, smallint) to authenticated;
revoke all on function public.update_my_task_progress(uuid, uuid, text, smallint) from public, anon;
grant execute on function public.update_my_task_progress(uuid, uuid, text, smallint) to authenticated;
revoke all on function public.list_task_history(uuid, uuid) from public, anon;
grant execute on function public.list_task_history(uuid, uuid) to authenticated;
