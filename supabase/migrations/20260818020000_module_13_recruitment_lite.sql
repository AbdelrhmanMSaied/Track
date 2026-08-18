-- Module 13 — recruitment lite: public campaign, application, owner review, atomic acceptance
create table public.recruitment_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  season_id uuid not null,
  title text not null check (
    title = btrim(regexp_replace(title, '[[:space:]]+', ' ', 'g'))
    and char_length(title) between 2 and 160
  ),
  description text not null check (
    description = btrim(description)
    and char_length(description) between 20 and 3000
  ),
  closes_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, season_id)
    references public.seasons (organization_id, id) on delete cascade,
  check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  )
);

create index recruitment_campaigns_public_idx
  on public.recruitment_campaigns (season_id, closes_on)
  where status = 'open';
create index recruitment_campaigns_organization_idx
  on public.recruitment_campaigns (organization_id, created_at desc);

create table public.recruitment_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted', 'screening', 'rejected', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete restrict,
  unique (campaign_id, user_id),
  foreign key (organization_id, campaign_id)
    references public.recruitment_campaigns (organization_id, id) on delete cascade,
  check (
    (status = 'accepted' and accepted_at is not null and accepted_by is not null)
    or (status <> 'accepted' and accepted_at is null and accepted_by is null)
  )
);

create index recruitment_applications_owner_idx
  on public.recruitment_applications (organization_id, campaign_id, created_at desc);
create index recruitment_applications_user_idx
  on public.recruitment_applications (user_id, created_at desc);

alter table public.recruitment_campaigns enable row level security;
alter table public.recruitment_applications enable row level security;
revoke all on table public.recruitment_campaigns from public, anon, authenticated;
revoke all on table public.recruitment_applications from public, anon, authenticated;

create or replace function public.get_public_recruitment_campaign(p_campaign_id uuid)
returns table (
  campaign_id uuid,
  organization_name text,
  organization_university text,
  title text,
  description text,
  closes_on date
)
language sql
security definer
set search_path = ''
as $$
  select c.id, o.name, o.university, c.title, c.description, c.closes_on
  from public.recruitment_campaigns as c
  join public.seasons as s on s.organization_id = c.organization_id and s.id = c.season_id
  join public.organizations as o on o.id = c.organization_id
  where c.id = p_campaign_id
    and c.status = 'open'
    and c.closes_on >= current_date
    and s.status = 'active';
$$;

create or replace function public.recruitment_campaign_is_unavailable(p_campaign_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from public.recruitment_campaigns where id = p_campaign_id);
$$;

create or replace function public.submit_recruitment_application(p_campaign_id uuid)
returns table (application_id uuid, application_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign public.recruitment_campaigns%rowtype;
  existing_application public.recruitment_applications%rowtype;
  campaign_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select organization_id into campaign_organization_id
  from public.recruitment_campaigns
  where id = p_campaign_id;
  if not found then
    raise exception 'Campaign is not available';
  end if;

  perform 1 from public.organizations where id = campaign_organization_id for update;
  if not found then
    raise exception 'Campaign is not available';
  end if;

  select c.* into campaign
  from public.recruitment_campaigns as c
  join public.seasons as s on s.organization_id = c.organization_id and s.id = c.season_id
  where c.id = p_campaign_id
    and c.status = 'open'
    and c.closes_on >= current_date
    and s.status = 'active'
  for update of c;
  if not found then
    raise exception 'Campaign is not available';
  end if;

  select * into existing_application
  from public.recruitment_applications
  where campaign_id = p_campaign_id and user_id = auth.uid()
  for update;
  if found then
    return query select existing_application.id, existing_application.status;
    return;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and profile_completed_at is not null
  ) then
    raise exception 'Complete profile before applying';
  end if;

  if exists (
    select 1 from public.memberships
    where organization_id = campaign.organization_id and user_id = auth.uid()
  ) then
    raise exception 'Existing members cannot apply';
  end if;

  return query
  insert into public.recruitment_applications (organization_id, campaign_id, user_id)
  values (campaign.organization_id, campaign.id, auth.uid())
  returning id, status;
end;
$$;

create or replace function public.get_my_recruitment_application(p_campaign_id uuid)
returns table (application_status text, created_at timestamptz, has_membership boolean)
language sql
security definer
set search_path = ''
as $$
  select a.status, a.created_at, exists (
    select 1 from public.memberships as m
    where m.organization_id = c.organization_id and m.user_id = auth.uid()
  )
  from public.recruitment_campaigns as c
  left join public.recruitment_applications as a
    on a.campaign_id = c.id and a.user_id = auth.uid()
  where c.id = p_campaign_id;
$$;

create or replace function public.create_recruitment_campaign(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_closes_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_season public.seasons%rowtype;
  campaign_id uuid;
  normalized_title text := btrim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
  normalized_description text := btrim(coalesce(p_description, ''));
begin
  if auth.uid() is null
    or char_length(normalized_title) not between 2 and 160
    or char_length(normalized_description) not between 20 and 3000
    or p_closes_on is null then
    raise exception 'Invalid campaign data';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  select * into active_season
  from public.seasons
  where organization_id = p_organization_id and status = 'active'
  for update;
  if not found or p_closes_on < current_date or p_closes_on > active_season.ends_on then
    raise exception 'Campaign deadline must be within active season';
  end if;

  insert into public.recruitment_campaigns (
    organization_id, season_id, title, description, closes_on, created_by
  ) values (
    p_organization_id, active_season.id, normalized_title, normalized_description, p_closes_on, auth.uid()
  ) returning id into campaign_id;

  return campaign_id;
end;
$$;

create or replace function public.list_recruitment_campaigns(p_organization_id uuid)
returns table (
  campaign_id uuid,
  title text,
  closes_on date,
  status text,
  applicant_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select c.id, c.title, c.closes_on, c.status, count(a.id)
  from public.recruitment_campaigns as c
  left join public.recruitment_applications as a on a.campaign_id = c.id
  where c.organization_id = p_organization_id
  group by c.id
  order by c.created_at desc;
end;
$$;

create or replace function public.list_recruitment_applicants(p_organization_id uuid, p_campaign_id uuid)
returns table (
  application_id uuid,
  user_id uuid,
  full_name text,
  university text,
  faculty text,
  academic_year text,
  city text,
  bio text,
  application_status text,
  applied_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select a.id, a.user_id, p.full_name, p.university, p.faculty, p.academic_year, p.city, p.bio, a.status, a.created_at
  from public.recruitment_applications as a
  join public.profiles as p on p.id = a.user_id
  where a.organization_id = p_organization_id and a.campaign_id = p_campaign_id
  order by a.created_at desc;
end;
$$;

create or replace function public.set_recruitment_application_status(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_application_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_status not in ('submitted', 'screening', 'rejected') then
    raise exception 'Invalid application status';
  end if;

  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  update public.recruitment_applications
  set status = p_status, updated_at = now()
  where id = p_application_id
    and organization_id = p_organization_id
    and campaign_id = p_campaign_id
    and status <> 'accepted';
  if not found then
    raise exception 'Application cannot be updated';
  end if;
end;
$$;

create or replace function public.close_recruitment_campaign(p_organization_id uuid, p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  update public.recruitment_campaigns
  set status = 'closed', closed_at = now()
  where id = p_campaign_id and organization_id = p_organization_id and status = 'open';
  if not found then
    raise exception 'Campaign cannot be closed';
  end if;
end;
$$;

create or replace function public.accept_recruitment_application(p_organization_id uuid, p_campaign_id uuid, p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.recruitment_applications%rowtype;
  member public.memberships%rowtype;
  membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then
    raise exception 'Organization not found';
  end if;

  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id and user_id = auth.uid()
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  select * into application
  from public.recruitment_applications
  where id = p_application_id
    and organization_id = p_organization_id
    and campaign_id = p_campaign_id
  for update;
  if not found or application.status = 'rejected' then
    raise exception 'Application cannot be accepted';
  end if;

  select * into member
  from public.memberships
  where organization_id = p_organization_id and user_id = application.user_id
  for update;
  if found and member.status in ('alumni', 'suspended') then
    raise exception 'This membership cannot be activated';
  end if;

  if not found then
    insert into public.memberships (organization_id, user_id, role, status)
    values (p_organization_id, application.user_id, 'member', 'active')
    on conflict (organization_id, user_id) do nothing;

    select * into member
    from public.memberships
    where organization_id = p_organization_id and user_id = application.user_id
    for update;
    if member.status <> 'active' then
      raise exception 'This membership cannot be activated';
    end if;
  end if;

  update public.recruitment_applications
  set status = 'accepted', accepted_at = coalesce(accepted_at, now()),
      accepted_by = coalesce(accepted_by, auth.uid()), updated_at = now()
  where id = application.id;

  return member.id;
end;
$$;

-- Invite acceptance shares the organization lock used by recruitment submit/accept.
create or replace function public.accept_organization_invite(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.organization_invites%rowtype;
  member public.memberships%rowtype;
begin
  if auth.uid() is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation';
  end if;

  select * into invitation
  from public.organization_invites
  where token_hash = p_token_hash
  for update;
  if not found or invitation.revoked_at is not null or invitation.expires_at <= now() then
    raise exception 'Invalid invitation';
  end if;

  if invitation.accepted_at is not null then
    if invitation.accepted_by = auth.uid() then return invitation.organization_id; end if;
    raise exception 'Invalid invitation';
  end if;

  perform 1 from public.organizations where id = invitation.organization_id for update;
  if not found then
    raise exception 'Invalid invitation';
  end if;

  select * into member
  from public.memberships
  where organization_id = invitation.organization_id and user_id = auth.uid()
  for update;
  if found and member.status in ('suspended', 'alumni') then
    raise exception 'This membership cannot accept invitations';
  end if;

  if found and member.status = 'active' then
    update public.organization_invites set accepted_at = now(), accepted_by = auth.uid() where id = invitation.id;
    return invitation.organization_id;
  end if;

  insert into public.memberships (organization_id, user_id, role, status)
  values (invitation.organization_id, auth.uid(), 'member', 'active')
  on conflict (organization_id, user_id) do nothing;

  select * into member
  from public.memberships
  where organization_id = invitation.organization_id and user_id = auth.uid()
  for update;
  if member.status in ('suspended', 'alumni') then
    raise exception 'This membership cannot accept invitations';
  end if;

  update public.organization_invites set accepted_at = now(), accepted_by = auth.uid() where id = invitation.id;
  return invitation.organization_id;
end;
$$;

-- Season transition ends the public intake tied to the archived season.
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

    update public.recruitment_campaigns
    set status = 'closed', closed_at = now()
    where organization_id = p_organization_id
      and season_id = prior_season.id
      and status = 'open';

    update public.seasons set status = 'archived' where id = prior_season.id;
  end if;

  insert into public.seasons (organization_id, name, starts_on, ends_on, status)
  values (p_organization_id, btrim(p_name), p_starts_on, p_ends_on, 'active')
  returning id into new_season_id;

  return new_season_id;
end;
$$;

revoke all on function public.get_public_recruitment_campaign(uuid) from public;
grant execute on function public.get_public_recruitment_campaign(uuid) to anon, authenticated;
revoke all on function public.recruitment_campaign_is_unavailable(uuid) from public;
grant execute on function public.recruitment_campaign_is_unavailable(uuid) to anon, authenticated;
revoke all on function public.submit_recruitment_application(uuid) from public, anon;
grant execute on function public.submit_recruitment_application(uuid) to authenticated;
revoke all on function public.get_my_recruitment_application(uuid) from public, anon;
grant execute on function public.get_my_recruitment_application(uuid) to authenticated;
revoke all on function public.create_recruitment_campaign(uuid, text, text, date) from public, anon;
grant execute on function public.create_recruitment_campaign(uuid, text, text, date) to authenticated;
revoke all on function public.list_recruitment_campaigns(uuid) from public, anon;
grant execute on function public.list_recruitment_campaigns(uuid) to authenticated;
revoke all on function public.list_recruitment_applicants(uuid, uuid) from public, anon;
grant execute on function public.list_recruitment_applicants(uuid, uuid) to authenticated;
revoke all on function public.set_recruitment_application_status(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.set_recruitment_application_status(uuid, uuid, uuid, text) to authenticated;
revoke all on function public.close_recruitment_campaign(uuid, uuid) from public, anon;
grant execute on function public.close_recruitment_campaign(uuid, uuid) to authenticated;
revoke all on function public.accept_recruitment_application(uuid, uuid, uuid) from public, anon;
grant execute on function public.accept_recruitment_application(uuid, uuid, uuid) to authenticated;
