"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const university = String(formData.get("university") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (name.length < 2 || name.length > 160 || university.length < 2 || university.length > 160 || description.length > 1000) {
    redirect("/organizations/new?error=invalid-input");
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");

  const { data: organizationId, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_description: description,
    p_university: university,
  });

  if (error || !organizationId) redirect("/organizations/new?error=create-failed");
  redirect(`/organizations/${organizationId}`);
}
