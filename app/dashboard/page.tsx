import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { addDays, cairoToday, type DashboardData } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";

const typeLabels: Record<string, string> = { task: "مهمة", meeting: "اجتماع", event: "فعالية" };
const roleLabels: Record<string, string> = { owner: "المالك", board: "مجلس الإدارة", head: "رئيس قسم", member: "عضو" };
function formatItemDate(item: DashboardData["items"][number]) {
  const value = item.due_on ?? item.starts_at;
  if (!value) return "";
  return item.due_on
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC" })
    : new Date(value).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" });
}

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

  const [membershipsResult, dashboardResult] = await Promise.all([
    supabase
    .from("memberships")
    .select("organization_id, role")
    .order("joined_at"),
    supabase.rpc("get_my_dashboard", { p_starts_on: cairoToday(), p_ends_on: addDays(cairoToday(), 7) }),
  ]);
  if (membershipsResult.error || dashboardResult.error) throw new Error("Failed to load dashboard");
  const memberships = membershipsResult.data;
  const dashboard = dashboardResult.data as DashboardData;
  const { data: organizations } = memberships?.length
    ? await supabase.from("organizations").select("id, name, university").in("id", memberships.map(({ organization_id }) => organization_id))
    : { data: [] };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <p className="text-sm font-semibold text-blue-700">Track</p>
      <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">مرحبًا {profile.full_name}</h1><div className="flex flex-wrap gap-3 text-sm font-semibold text-blue-700"><Link className="inline-flex min-h-11 items-center" href="/calendar">التقويم</Link><Link className="inline-flex min-h-11 items-center" href="/career">جواز المسار</Link><Link className="inline-flex min-h-11 items-center" href="/profile/edit">تعديل الملف الشخصي</Link></div></div>
      <section className="grid gap-3 rounded-xl border border-zinc-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">مهامي</h2><p className="mt-1 text-sm text-zinc-600">ملخص مهامك النشطة، ثم القادم هذا الأسبوع.</p></div><Link className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-blue-700" href="/calendar">كل التقويم</Link></div>
        <div className="grid gap-2 sm:grid-cols-3"><p className="rounded-lg bg-zinc-50 p-3 text-sm">مهام مفتوحة: {dashboard.summary.open_tasks}</p><p className="rounded-lg bg-zinc-50 p-3 text-sm">متأخرة: {dashboard.summary.overdue_tasks}</p><p className="rounded-lg bg-zinc-50 p-3 text-sm">بلا موعد: {dashboard.summary.undated_tasks}</p></div>
        {dashboard.items.slice(0, 5).length ? <div className="grid gap-2">{dashboard.items.slice(0, 5).map((item) => <Link key={`${item.kind}-${item.item_id}`} href={item.href} className="rounded-lg bg-zinc-50 p-3 hover:bg-zinc-100"><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-zinc-600">{typeLabels[item.kind]} · {item.organization_name} · {formatItemDate(item)}</p></Link>)}</div> : <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">لا توجد مواعيد أو مهام خلال الأسبوع القادم.</p>}
      </section>
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">منظماتك</h2><Link className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" href="/organizations/new">منظمة جديدة</Link></div>
        {organizations?.length ? organizations.map((organization) => (
          <div key={organization.id} className="rounded-xl border border-zinc-200 p-4"><Link href={`/organizations/${organization.id}`} className="block hover:text-blue-700"><p className="font-semibold">{organization.name}</p><p className="mt-1 text-sm text-zinc-600">{organization.university} · {roleLabels[memberships?.find(({ organization_id }) => organization_id === organization.id)?.role ?? ""] ?? "عضو"}</p></Link><Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline" href={`/organizations/${organization.id}/dashboard`}>لوحة المنظمة</Link></div>
        )) : <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">لم تنضم لأي منظمة بعد.</p>}
      </section>
      <form action={signOut}><button className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 font-semibold">تسجيل الخروج</button></form>
    </main>
  );
}
