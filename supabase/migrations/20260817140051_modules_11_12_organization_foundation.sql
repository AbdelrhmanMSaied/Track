-- Modules 11 & 12 — Organization and Membership foundation
alter table public.organizations
  add column description text check (char_length(description) <= 1000),
  add column university text;

create or replace function public.create_organization(
  p_name text,
  p_description text,
  p_university text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if char_length(trim(p_name)) not between 2 and 160
    or char_length(trim(p_university)) not between 2 and 160
    or char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'Invalid organization data';
  end if;

  insert into public.organizations (name, description, university, created_by)
  values (trim(p_name), nullif(trim(p_description), ''), trim(p_university), auth.uid())
  returning id into organization_id;

  insert into public.memberships (organization_id, user_id, role)
  values (organization_id, auth.uid(), 'owner');

  return organization_id;
end;
$$;

revoke execute on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;
