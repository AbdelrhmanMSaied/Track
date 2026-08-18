"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function acceptOrganizationInvite(token: string) {
  const path = `/invites/${encodeURIComponent(token)}`;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) redirect(`${path}?error=invalid-invite`);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");

  const { data: organizationId, error } = await supabase.rpc("accept_organization_invite", {
    p_token_hash: createHash("sha256").update(token).digest("hex"),
  });
  if (error || !organizationId) redirect(`${path}?error=invalid-invite`);
  redirect(`/organizations/${organizationId}`);
}
