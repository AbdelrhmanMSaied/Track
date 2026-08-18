"use server";

import { redirect } from "next/navigation";
import { parseProfileForm } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const values = parseProfileForm(formData);
  if (!values) redirect("/profile/edit?error=invalid-input");

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (authError || !userId) redirect("/auth");

  const { error } = await supabase.from("profiles").update({ ...values, updated_at: new Date().toISOString() }).eq("id", userId).select("id").single();
  if (error) redirect("/profile/edit?error=save-failed");
  redirect("/profile/edit?success=updated");
}
