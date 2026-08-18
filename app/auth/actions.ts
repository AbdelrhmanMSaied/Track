"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSafeNextPath } from "@/lib/auth-next";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

function credentials(formData: FormData, next: string | null) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email.includes("@") || password.length < 8) redirect(authPath("/auth?error=invalid-input", next));
  return { email, password };
}

function authPath(path: string, next: string | null) {
  return next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path;
}

export async function signIn(formData: FormData) {
  const next = getSafeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(formData, next));
  if (error) redirect(authPath("/auth?error=invalid-credentials", next));
  redirect(next || "/dashboard");
}

export async function signUp(formData: FormData) {
  const next = getSafeNextPath(formData.get("next"));
  const supabase = await createClient();
  const origin = getSiteUrl((await headers()).get("origin"));
  const { data, error } = await supabase.auth.signUp({
    ...credentials(formData, next),
    options: { emailRedirectTo: `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}` },
  });
  if (error) redirect(authPath("/auth?error=signup-failed", next));
  if (data.session) redirect(next || "/dashboard");
  redirect(authPath("/auth?message=check-email", next));
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const origin = getSiteUrl((await headers()).get("origin"));
  const next = getSafeNextPath(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}` },
  });
  if (error || !data.url) redirect(authPath("/auth?error=oauth-failed", next));
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth");
}
