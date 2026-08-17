-- Module 12 — member invite links and a privacy-safe member directory
create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '72 hours'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz,
  check ((accepted_at is null) = (accepted_by is null)),
  check (not (accepted_at is not null and revoked_at is not null)),
  check (accepted_at is null or accepted_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at),
  check (expires_at = created_at + interval '72 hours')
);

create index organization_invites_organization_id_idx on public.organization_invites (organization_id);

alter table public.organization_invites enable row level security;

revoke all on table public.organization_invites from public, anon, authenticated;
grant select (id, organization_id, created_by, created_at, expires_at, accepted_at, accepted_by, revoked_at) on public.organization_invites to authenticated;
grant insert (organization_id, token_hash) on public.organization_invites to authenticated;
grant update (revoked_at) on public.organization_invites to authenticated;

create policy "Owners read organization invites" on public.organization_invites for select to authenticated
using (exists (
  select 1 from public.memberships
  where memberships.organization_id = organization_invites.organization_id
    and memberships.user_id = (select auth.uid())
    and memberships.role = 'owner'
    and memberships.status = 'active'
));

create policy "Owners create organization invites" on public.organization_invites for insert to authenticated
with check (
  created_by = (select auth.uid())
  and accepted_at is null
  and accepted_by is null
  and revoked_at is null
  and exists (
    select 1 from public.memberships
    where memberships.organization_id = organization_invites.organization_id
      and memberships.user_id = (select auth.uid())
      and memberships.role = 'owner'
      and memberships.status = 'active'
  )
);

create policy "Owners revoke unused organization invites" on public.organization_invites for update to authenticated
using (
  accepted_at is null
  and revoked_at is null
  and exists (
    select 1 from public.memberships
    where memberships.organization_id = organization_invites.organization_id
      and memberships.user_id = (select auth.uid())
      and memberships.role = 'owner'
      and memberships.status = 'active'
  )
)
with check (
  accepted_at is null
  and revoked_at is not null
  and exists (
    select 1 from public.memberships
    where memberships.organization_id = organization_invites.organization_id
      and memberships.user_id = (select auth.uid())
      and memberships.role = 'owner'
      and memberships.status = 'active'
  )
);

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

  if not found then
    raise exception 'Invalid invitation';
  end if;

  if invitation.revoked_at is not null then
    raise exception 'Invalid invitation';
  end if;

  if invitation.accepted_at is not null then
    if invitation.accepted_by = auth.uid() then return invitation.organization_id; end if;
    raise exception 'Invalid invitation';
  end if;

  if invitation.expires_at <= now() then
    raise exception 'Invalid invitation';
  end if;

  select * into member
  from public.memberships
  where organization_id = invitation.organization_id
    and user_id = auth.uid()
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
  where organization_id = invitation.organization_id
    and user_id = auth.uid()
  for update;

  if member.status in ('suspended', 'alumni') then
    raise exception 'This membership cannot accept invitations';
  end if;

  update public.organization_invites set accepted_at = now(), accepted_by = auth.uid() where id = invitation.id;

  return invitation.organization_id;
end;
$$;

create or replace function public.list_member_directory(p_organization_id uuid)
returns table (user_id uuid, display_name text, role text, joined_at timestamptz)
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
  select memberships.user_id, coalesce(profiles.full_name, 'عضو'), memberships.role, memberships.joined_at
  from public.memberships
  left join public.profiles on profiles.id = memberships.user_id
  where memberships.organization_id = p_organization_id
    and memberships.status = 'active'
  order by coalesce(profiles.full_name, 'عضو'), memberships.joined_at;
end;
$$;

revoke all on function public.accept_organization_invite(text) from public, anon;
grant execute on function public.accept_organization_invite(text) to authenticated;
revoke all on function public.list_member_directory(uuid) from public, anon;
grant execute on function public.list_member_directory(uuid) to authenticated;
