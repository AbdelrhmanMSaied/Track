"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function submitRecruitmentApplication(campaignId: string) {
  const path = `/recruitment/${campaignId}`;
  if (!uuidPattern.test(campaignId)) redirect("/");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect(`/auth?next=${encodeURIComponent(path)}`);

  const { data: profile } = await supabase.from("profiles").select("profile_completed_at").eq("id", auth.claims.sub).maybeSingle();
  if (!profile?.profile_completed_at) redirect(`/onboarding?next=${encodeURIComponent(path)}`);

  const { error } = await supabase.rpc("submit_recruitment_application", { p_campaign_id: campaignId });
  if (error) redirect(`${path}?error=apply-failed`);
  redirect(`${path}?applied=1`);
}
