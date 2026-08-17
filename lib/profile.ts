export const PROFILE_TEXT_MAX_LENGTH = 160;

const academicYears = new Set(["first", "second", "third", "fourth", "fifth", "graduate"]);

export function parseProfileForm(formData: FormData) {
  const values = {
    full_name: String(formData.get("full_name") ?? "").trim(),
    university: String(formData.get("university") ?? "").trim(),
    faculty: String(formData.get("faculty") ?? "").trim(),
    academic_year: String(formData.get("academic_year") ?? ""),
    city: String(formData.get("city") ?? "").trim(),
    bio: String(formData.get("bio") ?? "").trim() || null,
  };

  const requiredText = [values.university, values.faculty, values.city];
  if (
    values.full_name.length < 2 || values.full_name.length > 120 ||
    requiredText.some((value) => value.length < 2 || value.length > PROFILE_TEXT_MAX_LENGTH) ||
    !academicYears.has(values.academic_year) || (values.bio?.length ?? 0) > 500
  ) return null;

  return values;
}
