"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(["submitted", "screening", "rejected"]);

function path(organizationId: string, campaignId: string) {
  return `/organizations/${organizationId}/recruitment/${campaignId}`;
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  return supabase;
}

export async function setRecruitmentApplicationStatus(organizationId: string, campaignId: string, formData: FormData) {
  const applicationId = String(formData.get("application_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const target = path(organizationId, campaignId);
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(campaignId) || !uuidPattern.test(applicationId) || !statuses.has(status)) redirect(`${target}?error=invalid-status`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("set_recruitment_application_status", {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_application_id: applicationId,
    p_status: status,
  });
  if (error) redirect(`${target}?error=status-failed`);
  redirect(target);
}

export async function acceptRecruitmentApplication(organizationId: string, campaignId: string, formData: FormData) {
  const applicationId = String(formData.get("application_id") ?? "");
  const target = path(organizationId, campaignId);
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(campaignId) || !uuidPattern.test(applicationId)) redirect(`${target}?error=accept-failed`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("accept_recruitment_application", {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_application_id: applicationId,
  });
  if (error) redirect(`${target}?error=accept-failed`);
  redirect(target);
}

export async function closeRecruitmentCampaign(organizationId: string, campaignId: string) {
  const target = path(organizationId, campaignId);
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(campaignId)) redirect("/dashboard");
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("close_recruitment_campaign", {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
  });
  if (error) redirect(`${target}?error=close-failed`);
  redirect(target);
}
