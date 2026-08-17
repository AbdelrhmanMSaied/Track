import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, profile_completed_at")
    .eq("id", data.claims.sub)
    .maybeSingle();
  if (!profile?.profile_completed_at) redirect("/onboarding");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .order("joined_at");
  const { data: organizations } = memberships?.length
    ? await supabase.from("organizations").select("id, name, university").in("id", memberships.map(({ organization_id }) => organization_id))
    : { data: [] };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <p className="text-sm font-semibold text-blue-700">Track</p>
      <div className="flex items-center justify-between gap-4"><h1 className="text-3xl font-bold">مرحبًا {profile.full_name}</h1><Link href="/profile/edit" className="text-sm font-semibold text-blue-700">تعديل الملف الشخصي</Link></div>
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">منظماتك</h2><Link className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" href="/organizations/new">منظمة جديدة</Link></div>
        {organizations?.length ? organizations.map((organization) => (
          <Link key={organization.id} href={`/organizations/${organization.id}`} className="rounded-xl border border-zinc-200 p-4 hover:border-blue-300">
            <p className="font-semibold">{organization.name}</p><p className="mt-1 text-sm text-zinc-600">{organization.university} · {memberships?.find(({ organization_id }) => organization_id === organization.id)?.role}</p>
          </Link>
        )) : <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">لم تنضم لأي منظمة بعد.</p>}
      </section>
      <form action={signOut}><button className="rounded-lg border border-zinc-300 px-4 py-2 font-semibold">تسجيل الخروج</button></form>
    </main>
  );
}
