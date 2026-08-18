"use server";

import { redirect } from "next/navigation";
import { getSafeNextPath } from "@/lib/auth-next";
import { parseProfileForm } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(formData: FormData) {
  const next = getSafeNextPath(formData.get("next"));
  const values = parseProfileForm(formData);
  if (!values) redirect(`/onboarding?error=invalid-input${next ? `&next=${encodeURIComponent(next)}` : ""}`);

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (authError || !userId) redirect(`/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`);

  const now = new Date().toISOString();
  const { error } = await supabase.from("profiles").upsert({ id: userId, ...values, profile_completed_at: now, updated_at: now }).select("id").single();
  if (error) redirect(`/onboarding?error=save-failed${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  redirect(next || "/dashboard");
}
