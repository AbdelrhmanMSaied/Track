import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeNextPath } from "@/lib/auth-next";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeNextPath(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next || "/dashboard", url.origin));
  }
  const errorPath = `/auth?error=callback-failed${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return NextResponse.redirect(new URL(errorPath, url.origin));
}
