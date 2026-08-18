-- Module 1 — Global Identity & Authentication
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  headline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'board', 'head', 'member')),
  status text not null default 'active' check (status in ('active', 'alumni', 'suspended')),
  joined_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_organization_id_idx on public.memberships (organization_id);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;

create policy "Users read their profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users create their profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users update their profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Members read their organizations" on public.organizations for select to authenticated
using (
  (select auth.uid()) = created_by
  or exists (
    select 1 from public.memberships
    where memberships.organization_id = organizations.id
      and memberships.user_id = (select auth.uid())
  )
);
create policy "Users create organizations" on public.organizations for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "Creators update their organizations" on public.organizations for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "Creators delete their organizations" on public.organizations for delete to authenticated using ((select auth.uid()) = created_by);

create policy "Users read their memberships" on public.memberships for select to authenticated using ((select auth.uid()) = user_id);
create policy "Creators add organization memberships" on public.memberships for insert to authenticated
with check (exists (select 1 from public.organizations where organizations.id = memberships.organization_id and organizations.created_by = (select auth.uid())));
create policy "Creators update organization memberships" on public.memberships for update to authenticated
using (exists (select 1 from public.organizations where organizations.id = memberships.organization_id and organizations.created_by = (select auth.uid())))
with check (exists (select 1 from public.organizations where organizations.id = memberships.organization_id and organizations.created_by = (select auth.uid())));
create policy "Creators delete organization memberships" on public.memberships for delete to authenticated
using (exists (select 1 from public.organizations where organizations.id = memberships.organization_id and organizations.created_by = (select auth.uid())));
