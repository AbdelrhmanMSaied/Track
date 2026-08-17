"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const academicYears = new Set(["first", "second", "third", "fourth", "fifth", "graduate"]);

export async function saveProfile(formData: FormData) {
  const values = {
    full_name: String(formData.get("full_name") ?? "").trim(),
    university: String(formData.get("university") ?? "").trim(),
    faculty: String(formData.get("faculty") ?? "").trim(),
    academic_year: String(formData.get("academic_year") ?? ""),
    city: String(formData.get("city") ?? "").trim(),
    bio: String(formData.get("bio") ?? "").trim() || null,
  };
  if (values.full_name.length < 2 || values.full_name.length > 120 || !values.university || !values.faculty || !values.city || !academicYears.has(values.academic_year) || (values.bio?.length ?? 0) > 500) {
    redirect("/onboarding?error=invalid-input");
  }

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (authError || !userId) redirect("/auth");

  const now = new Date().toISOString();
  const { error } = await supabase.from("profiles").upsert({ id: userId, ...values, profile_completed_at: now, updated_at: now });
  if (error) redirect("/onboarding?error=save-failed");
  redirect("/dashboard");
}
