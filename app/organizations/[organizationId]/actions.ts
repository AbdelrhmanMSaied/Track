"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  return supabase;
}

export async function createSeason(organizationId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "");
  const path = `/organizations/${organizationId}`;
  if (name.length < 2 || name.length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn) redirect(`${path}?error=invalid-season`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("activate_season", { p_organization_id: organizationId, p_name: name, p_starts_on: startsOn, p_ends_on: endsOn });
  if (error) redirect(`${path}?error=create-season-failed`);
  redirect(path);
}

export async function createDepartment(organizationId: string, formData: FormData) {
  const seasonId = String(formData.get("season_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const path = `/organizations/${organizationId}`;
  if (!seasonId || name.length < 2 || name.length > 120 || description.length > 500) redirect(`${path}?error=invalid-department`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.from("departments").insert({ organization_id: organizationId, season_id: seasonId, name, description: description || null });
  if (error) redirect(`${path}?error=create-department-failed`);
  redirect(path);
}
