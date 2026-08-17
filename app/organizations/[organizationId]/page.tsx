import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationPage({ params }: PageProps<"/organizations/[organizationId]">) {
  const { organizationId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, description, university")
    .eq("id", organizationId)
    .maybeSingle();
  if (!organization) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", auth.claims.sub)
    .maybeSingle();
  if (!membership) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <Link className="text-sm text-zinc-600 underline" href="/dashboard">كل المنظمات</Link>
      <div><p className="text-sm font-semibold text-blue-700">{membership.role}</p><h1 className="mt-2 text-3xl font-bold">{organization.name}</h1><p className="mt-2 text-zinc-600">{organization.university}</p></div>
      {organization.description && <p className="max-w-2xl leading-7 text-zinc-700">{organization.description}</p>}
      <section className="rounded-xl border border-zinc-200 p-6"><h2 className="font-semibold">Workspace جاهز</h2><p className="mt-2 text-sm text-zinc-600">الأعضاء والأقسام والمواسم تأتي في الخطوات القادمة.</p></section>
    </main>
  );
}
