-- Module 2 — Profile integrity at the trust boundary
alter table public.profiles
  add constraint profiles_full_name_normalized check (
    full_name is null or (full_name = trim(full_name) and char_length(full_name) between 2 and 120)
  ),
  add constraint profiles_university_normalized check (
    university is null or (university = trim(university) and char_length(university) between 2 and 160)
  ),
  add constraint profiles_faculty_normalized check (
    faculty is null or (faculty = trim(faculty) and char_length(faculty) between 2 and 160)
  ),
  add constraint profiles_city_normalized check (
    city is null or (city = trim(city) and char_length(city) between 2 and 160)
  ),
  add constraint profiles_completion_requires_core_fields check (
    profile_completed_at is null or (
      full_name is not null and university is not null and faculty is not null
      and academic_year is not null and city is not null
    )
  );
