"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function reviewOrganizationVerification(organizationId: string, formData: FormData) {
  const requestId = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const target = `/organizations/${organizationId}/verifications`;
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(requestId) || !["approved", "rejected"].includes(decision)) redirect(`${target}?error=invalid-review`);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  const { error } = await supabase.rpc("review_organization_verification", { p_organization_id: organizationId, p_request_id: requestId, p_decision: decision });
  if (error) redirect(`${target}?error=review-failed`);
  redirect(`${target}?success=reviewed`);
}
