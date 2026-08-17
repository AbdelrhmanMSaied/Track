-- Modules 2, 3 and 32 — private claims, explicit assignment provenance, owner verification.
alter table public.membership_assignments
  add constraint membership_assignments_organization_membership_id_id_key unique (organization_id, membership_id, id);

create table public.career_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  experience_type text not null check (experience_type in ('student_activity','volunteering','event_role','internship','job','freelance','project','training','course','bootcamp','competition','award','leadership','certificate','workshop','conference')),
  organization_name text not null check (organization_name = btrim(regexp_replace(organization_name, '[[:space:]]+', ' ', 'g')) and char_length(organization_name) between 2 and 160),
  role_title text not null check (role_title = btrim(regexp_replace(role_title, '[[:space:]]+', ' ', 'g')) and char_length(role_title) between 2 and 160),
  starts_on date not null, ends_on date,
  summary text check (summary is null or (summary = btrim(summary) and char_length(summary) <= 3000)),
  evidence_url text check (evidence_url is null or (char_length(evidence_url) <= 2048 and evidence_url ~* '^https://')),
  verification_state text not null default 'self_reported' check (verification_state in ('self_reported','evidence_provided','organization_verified')),
  visibility text not null default 'private' check (visibility = 'private'),
  source_organization_id uuid, source_membership_id uuid, source_membership_assignment_id uuid,
  source_organization_name text, source_department_name text, source_position text, source_starts_on date, source_ends_on date,
  organization_verified_at timestamptz, organization_verified_by uuid references auth.users (id) on delete restrict,
  organization_verified_organization_id uuid references public.organizations (id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check ((verification_state = 'organization_verified' and organization_verified_at is not null and organization_verified_by is not null and organization_verified_organization_id is not null) or (verification_state <> 'organization_verified' and organization_verified_at is null and organization_verified_by is null and organization_verified_organization_id is null)),
  check ((source_organization_id is null and source_membership_id is null and source_membership_assignment_id is null and source_organization_name is null and source_department_name is null and source_position is null and source_starts_on is null and source_ends_on is null) or (source_organization_id is not null and source_membership_id is not null and source_membership_assignment_id is not null and source_organization_name is not null and source_position is not null and source_starts_on is not null)),
  constraint career_experiences_source_assignment_tenant_fk
    foreign key (source_organization_id, source_membership_id, source_membership_assignment_id)
    references public.membership_assignments (organization_id, membership_id, id) on delete restrict
);

create table public.experience_verification_requests (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.career_experiences (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requester_user_id uuid not null references auth.users (id) on delete cascade,
  claim_snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(), reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete restrict,
  check ((status in ('approved','rejected') and reviewed_at is not null and reviewed_by is not null) or (status in ('pending','cancelled') and reviewed_at is null and reviewed_by is null))
);

create index career_experiences_user_timeline_idx on public.career_experiences (user_id, starts_on desc, created_at desc);
create index career_experiences_source_org_idx on public.career_experiences (source_organization_id) where source_organization_id is not null;
create unique index experience_verification_one_pending_idx on public.experience_verification_requests (experience_id) where status = 'pending';
create index experience_verification_org_queue_idx on public.experience_verification_requests (organization_id, requested_at) where status = 'pending';
alter table public.career_experiences enable row level security;
alter table public.experience_verification_requests enable row level security;
revoke all on table public.career_experiences from public, anon, authenticated;
revoke all on table public.experience_verification_requests from public, anon, authenticated;

create or replace function public.prevent_verified_career_experience_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.verification_state = 'organization_verified' and (tg_op = 'DELETE' or new is distinct from old) then raise exception 'Organization verified experiences are immutable'; end if;
  return new;
end;
$$;
create trigger career_experiences_freeze_verified before update or delete on public.career_experiences for each row execute function public.prevent_verified_career_experience_mutation();
revoke all on function public.prevent_verified_career_experience_mutation() from public, anon, authenticated;

create or replace function public.create_career_experience(p_type text,p_organization text,p_role text,p_starts_on date,p_ends_on date,p_summary text,p_evidence_url text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare id uuid; organization_text text := btrim(regexp_replace(coalesce(p_organization,''),'[[:space:]]+',' ','g')); role_text text := btrim(regexp_replace(coalesce(p_role,''),'[[:space:]]+',' ','g')); summary_text text := nullif(btrim(coalesce(p_summary,'')),''); evidence_text text := nullif(btrim(coalesce(p_evidence_url,'')),'');
begin
  if auth.uid() is null or p_type not in ('student_activity','volunteering','event_role','internship','job','freelance','project','training','course','bootcamp','competition','award','leadership','certificate','workshop','conference') or char_length(organization_text) not between 2 and 160 or char_length(role_text) not between 2 and 160 or char_length(coalesce(summary_text,'')) > 3000 or p_starts_on is null or (p_ends_on is not null and p_ends_on < p_starts_on) or (evidence_text is not null and (char_length(evidence_text) > 2048 or evidence_text !~* '^https://')) then raise exception 'Invalid career experience'; end if;
  insert into public.career_experiences (user_id,experience_type,organization_name,role_title,starts_on,ends_on,summary,evidence_url,verification_state)
  values (auth.uid(),p_type,organization_text,role_text,p_starts_on,p_ends_on,summary_text,evidence_text,case when evidence_text is null then 'self_reported' else 'evidence_provided' end) returning career_experiences.id into id;
  return id;
end;
$$;

create or replace function public.create_career_experience_from_assignment(p_assignment_id uuid,p_summary text,p_evidence_url text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare id uuid; assignment_row record; summary_text text := nullif(btrim(coalesce(p_summary,'')),''); evidence_text text := nullif(btrim(coalesce(p_evidence_url,'')),'');
begin
  if auth.uid() is null or char_length(coalesce(summary_text,'')) > 3000 or (evidence_text is not null and (char_length(evidence_text) > 2048 or evidence_text !~* '^https://')) then raise exception 'Invalid career experience'; end if;
  select a.id,a.organization_id,a.membership_id,o.name organization_name,d.name department_name,a.position,a.starts_on,a.ends_on into assignment_row
  from public.membership_assignments a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id join public.organizations o on o.id=a.organization_id join public.departments d on d.organization_id=a.organization_id and d.season_id=a.season_id and d.id=a.department_id
  where a.id=p_assignment_id and m.user_id=auth.uid() for key share of a;
  if not found then raise exception 'Assignment not found'; end if;
  insert into public.career_experiences (user_id,experience_type,organization_name,role_title,starts_on,ends_on,summary,evidence_url,verification_state,source_organization_id,source_membership_id,source_membership_assignment_id,source_organization_name,source_department_name,source_position,source_starts_on,source_ends_on)
  values (auth.uid(),'student_activity',assignment_row.organization_name,assignment_row.position,assignment_row.starts_on,assignment_row.ends_on,summary_text,evidence_text,case when evidence_text is null then 'self_reported' else 'evidence_provided' end,assignment_row.organization_id,assignment_row.membership_id,assignment_row.id,assignment_row.organization_name,assignment_row.department_name,assignment_row.position,assignment_row.starts_on,assignment_row.ends_on) returning career_experiences.id into id;
  return id;
end;
$$;

create or replace function public.update_career_experience(p_id uuid,p_type text,p_organization text,p_role text,p_starts_on date,p_ends_on date,p_summary text,p_evidence_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare organization_text text := btrim(regexp_replace(coalesce(p_organization,''),'[[:space:]]+',' ','g')); role_text text := btrim(regexp_replace(coalesce(p_role,''),'[[:space:]]+',' ','g')); summary_text text := nullif(btrim(coalesce(p_summary,'')),''); evidence_text text := nullif(btrim(coalesce(p_evidence_url,'')),'');
begin
  if auth.uid() is null or p_type not in ('student_activity','volunteering','event_role','internship','job','freelance','project','training','course','bootcamp','competition','award','leadership','certificate','workshop','conference') or char_length(organization_text) not between 2 and 160 or char_length(role_text) not between 2 and 160 or char_length(coalesce(summary_text,'')) > 3000 or p_starts_on is null or (p_ends_on is not null and p_ends_on < p_starts_on) or (evidence_text is not null and (char_length(evidence_text) > 2048 or evidence_text !~* '^https://')) then raise exception 'Invalid career experience'; end if;
  perform 1 from public.career_experiences where id=p_id and user_id=auth.uid() and verification_state <> 'organization_verified' and source_membership_assignment_id is null for update;
  if not found or exists (select 1 from public.experience_verification_requests where experience_id=p_id and status='pending') then raise exception 'Experience cannot be changed'; end if;
  update public.career_experiences set experience_type=p_type,organization_name=organization_text,role_title=role_text,starts_on=p_starts_on,ends_on=p_ends_on,summary=summary_text,evidence_url=evidence_text,verification_state=case when evidence_text is null then 'self_reported' else 'evidence_provided' end,updated_at=now() where id=p_id;
end;
$$;

create or replace function public.delete_career_experience(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  delete from public.career_experiences e where e.id=p_id and e.user_id=auth.uid() and e.verification_state <> 'organization_verified' and not exists (select 1 from public.experience_verification_requests r where r.experience_id=e.id and r.status='pending');
  if not found then raise exception 'Experience cannot be deleted'; end if;
end;
$$;

create or replace function public.list_my_career_experiences()
returns table (experience_id uuid,experience_type text,organization_name text,role_title text,starts_on date,ends_on date,summary text,evidence_url text,verification_state text,source_membership_assignment_id uuid,request_status text,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  return query select e.id,e.experience_type,e.organization_name,e.role_title,e.starts_on,e.ends_on,e.summary,e.evidence_url,e.verification_state,e.source_membership_assignment_id,(select r.status from public.experience_verification_requests r where r.experience_id=e.id order by r.requested_at desc limit 1),e.created_at,e.updated_at from public.career_experiences e where e.user_id=auth.uid() order by e.starts_on desc,e.created_at desc;
end;
$$;

create or replace function public.list_my_membership_assignments_for_career()
returns table (assignment_id uuid,organization_name text,department_name text,"position" text,starts_on date,ends_on date)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  return query select a.id,o.name,d.name,a.position,a.starts_on,a.ends_on from public.membership_assignments a join public.memberships m on m.organization_id=a.organization_id and m.id=a.membership_id join public.organizations o on o.id=a.organization_id join public.departments d on d.organization_id=a.organization_id and d.season_id=a.season_id and d.id=a.department_id where m.user_id=auth.uid() order by a.starts_on desc;
end;
$$;

create or replace function public.request_organization_verification(p_experience_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare experience_row public.career_experiences%rowtype; request_id uuid; source_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select source_organization_id into source_org_id from public.career_experiences where id=p_experience_id and user_id=auth.uid();
  if not found or source_org_id is null then raise exception 'Experience has no organization source'; end if;
  perform 1 from public.organizations where id=source_org_id for update;
  select * into experience_row from public.career_experiences where id=p_experience_id and user_id=auth.uid() and verification_state <> 'organization_verified' for update;
  if not found or experience_row.source_organization_id is null or exists(select 1 from public.experience_verification_requests where experience_id=p_experience_id and status='pending') then raise exception 'Experience cannot be verified'; end if;
  insert into public.experience_verification_requests (experience_id,organization_id,requester_user_id,claim_snapshot) values (experience_row.id,experience_row.source_organization_id,auth.uid(),jsonb_build_object('experience_type',experience_row.experience_type,'organization_name',experience_row.organization_name,'role_title',experience_row.role_title,'starts_on',experience_row.starts_on,'ends_on',experience_row.ends_on,'summary',experience_row.summary,'evidence_url',experience_row.evidence_url,'source_organization_name',experience_row.source_organization_name,'source_department_name',experience_row.source_department_name,'source_position',experience_row.source_position,'source_starts_on',experience_row.source_starts_on,'source_ends_on',experience_row.source_ends_on,'source_membership_assignment_id',experience_row.source_membership_assignment_id)) returning experience_verification_requests.id into request_id;
  return request_id;
end;
$$;

create or replace function public.cancel_organization_verification_request(p_experience_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare request_row public.experience_verification_requests%rowtype; target_organization_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select organization_id into target_organization_id from public.experience_verification_requests where experience_id=p_experience_id and requester_user_id=auth.uid() and status='pending';
  if not found then raise exception 'Pending request not found'; end if;
  perform 1 from public.organizations where id=target_organization_id for update;
  select r.* into request_row from public.experience_verification_requests r join public.career_experiences e on e.id=r.experience_id and e.user_id=auth.uid() where r.experience_id=p_experience_id and r.requester_user_id=auth.uid() and r.organization_id=target_organization_id and r.status='pending' for update of r, e;
  if not found then raise exception 'Pending request not found'; end if;
  update public.experience_verification_requests set status='cancelled' where id=request_row.id;
end;
$$;

create or replace function public.list_organization_verification_requests(p_organization_id uuid)
returns table (request_id uuid,requester_name text,claim_snapshot jsonb,requested_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.memberships where organization_id=p_organization_id and user_id=auth.uid() and role='owner' and status='active') then raise exception 'Not authorized'; end if;
  return query select r.id,coalesce(p.full_name,'عضو'),r.claim_snapshot,r.requested_at from public.experience_verification_requests r left join public.profiles p on p.id=r.requester_user_id where r.organization_id=p_organization_id and r.status='pending' order by r.requested_at;
end;
$$;

create or replace function public.review_organization_verification(p_organization_id uuid,p_request_id uuid,p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare request_row public.experience_verification_requests%rowtype;
begin
  if auth.uid() is null or p_decision not in ('approved','rejected') then raise exception 'Invalid review'; end if;
  perform 1 from public.organizations where id=p_organization_id for update;
  if not found or not exists(select 1 from public.memberships where organization_id=p_organization_id and user_id=auth.uid() and role='owner' and status='active') then raise exception 'Not authorized'; end if;
  select * into request_row from public.experience_verification_requests where id=p_request_id and organization_id=p_organization_id and status='pending' for update;
  if not found then raise exception 'Request cannot be reviewed'; end if;
  perform 1 from public.career_experiences where id=request_row.experience_id for update;
  update public.experience_verification_requests set status=p_decision,reviewed_at=now(),reviewed_by=auth.uid() where id=request_row.id;
  if p_decision='approved' then update public.career_experiences set verification_state='organization_verified',organization_verified_at=now(),organization_verified_by=auth.uid(),organization_verified_organization_id=p_organization_id,updated_at=now() where id=request_row.experience_id; end if;
end;
$$;

revoke all on function public.create_career_experience(text,text,text,date,date,text,text) from public, anon;
grant execute on function public.create_career_experience(text,text,text,date,date,text,text) to authenticated;
revoke all on function public.create_career_experience_from_assignment(uuid,text,text) from public, anon;
grant execute on function public.create_career_experience_from_assignment(uuid,text,text) to authenticated;
revoke all on function public.update_career_experience(uuid,text,text,text,date,date,text,text) from public, anon;
grant execute on function public.update_career_experience(uuid,text,text,text,date,date,text,text) to authenticated;
revoke all on function public.delete_career_experience(uuid) from public, anon;
grant execute on function public.delete_career_experience(uuid) to authenticated;
revoke all on function public.list_my_career_experiences() from public, anon;
grant execute on function public.list_my_career_experiences() to authenticated;
revoke all on function public.list_my_membership_assignments_for_career() from public, anon;
grant execute on function public.list_my_membership_assignments_for_career() to authenticated;
revoke all on function public.request_organization_verification(uuid) from public, anon;
grant execute on function public.request_organization_verification(uuid) to authenticated;
revoke all on function public.cancel_organization_verification_request(uuid) from public, anon;
grant execute on function public.cancel_organization_verification_request(uuid) to authenticated;
revoke all on function public.list_organization_verification_requests(uuid) from public, anon;
grant execute on function public.list_organization_verification_requests(uuid) to authenticated;
revoke all on function public.review_organization_verification(uuid,uuid,text) from public, anon;
grant execute on function public.review_organization_verification(uuid,uuid,text) to authenticated;
