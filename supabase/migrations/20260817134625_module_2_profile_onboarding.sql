-- Module 2 — Personal Profile onboarding
alter table public.profiles alter column full_name drop not null;
alter table public.profiles
  add column university text,
  add column faculty text,
  add column academic_year text check (academic_year in ('first', 'second', 'third', 'fourth', 'fifth', 'graduate')),
  add column city text,
  add column bio text check (char_length(bio) <= 500),
  add column profile_completed_at timestamptz;

create schema if not exists private;
create or replace function private.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function private.create_profile_for_new_user() from public, anon, authenticated;

create trigger track_create_profile after insert on auth.users
for each row execute function private.create_profile_for_new_user();

insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
