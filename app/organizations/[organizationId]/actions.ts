"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  return supabase;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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

export async function createOrganizationInvite(organizationId: string) {
  const path = `/organizations/${organizationId}`;
  const supabase = await authenticatedClient();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await supabase.from("organization_invites").insert({ organization_id: organizationId, token_hash: tokenHash });
  if (error) redirect(`${path}?error=create-invite-failed`);

  redirect(`/invites/${token}?share=1`);
}

export async function revokeOrganizationInvite(organizationId: string, formData: FormData) {
  const inviteId = String(formData.get("invite_id") ?? "");
  const path = `/organizations/${organizationId}`;
  if (!uuidPattern.test(inviteId)) redirect(`${path}?error=revoke-invite-failed`);
  const supabase = await authenticatedClient();
  const { data, error } = await supabase
    .from("organization_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`${path}?error=revoke-invite-failed`);
  redirect(path);
}

export async function assignMemberAssignment(organizationId: string, formData: FormData) {
  const userId = String(formData.get("user_id") ?? "");
  const departmentId = String(formData.get("department_id") ?? "");
  const position = String(formData.get("position") ?? "").replace(/\s+/g, " ").trim();
  const startsOn = String(formData.get("starts_on") ?? "");
  const path = `/organizations/${organizationId}`;
  if (!uuidPattern.test(userId) || !uuidPattern.test(departmentId) || position.length < 2 || position.length > 120 || !datePattern.test(startsOn)) redirect(`${path}?error=invalid-assignment`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("assign_member_assignment", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_department_id: departmentId,
    p_position: position,
    p_starts_on: startsOn,
  });
  if (error) redirect(`${path}?error=assign-member-failed`);
  redirect(path);
}

export async function clearMemberAssignment(organizationId: string, formData: FormData) {
  const userId = String(formData.get("user_id") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "");
  const path = `/organizations/${organizationId}`;
  if (!uuidPattern.test(userId) || !datePattern.test(endsOn)) redirect(`${path}?error=invalid-assignment`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("clear_member_assignment", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_ends_on: endsOn,
  });
  if (error) redirect(`${path}?error=clear-member-failed`);
  redirect(path);
}

// Module 13 — owner creates a campaign tied to the active season.
export async function createRecruitmentCampaign(organizationId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim();
  const description = String(formData.get("description") ?? "").trim();
  const closesOn = String(formData.get("closes_on") ?? "");
  const path = `/organizations/${organizationId}`;
  if (!uuidPattern.test(organizationId) || title.length < 2 || title.length > 160 || description.length < 20 || description.length > 3000 || !datePattern.test(closesOn)) {
    redirect(`${path}?error=invalid-recruitment-campaign`);
  }

  const supabase = await authenticatedClient();
  const { data: campaignId, error } = await supabase.rpc("create_recruitment_campaign", {
    p_organization_id: organizationId,
    p_title: title,
    p_description: description,
    p_closes_on: closesOn,
  });
  if (error || !campaignId) redirect(`${path}?error=create-recruitment-campaign-failed`);
  redirect(`${path}/recruitment/${campaignId}`);
}
