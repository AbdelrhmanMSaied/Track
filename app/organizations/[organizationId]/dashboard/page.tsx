import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addDays, cairoToday, type CalendarItem } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";

type OrganizationDashboard = { role: string; metrics: Record<string, number | null | { open_campaigns: number; applications: number }>; upcoming: CalendarItem[] };
const roleLabels: Record<string, string> = { owner: "المالك", board: "مجلس الإدارة", head: "رئيس قسم", member: "عضو" };
const itemLabels: Record<string, string> = { task: "مهمة", meeting: "اجتماع", event: "فعالية" };
const metricLabels: Record<string, string> = { active_members: "أعضاء نشطون", open_tasks: "مهام مفتوحة", overdue_tasks: "مهام متأخرة", unassigned_tasks: "مهام بلا مكلّف", scheduled_meetings: "إجمالي الاجتماعات المجدولة بالموسم", scheduled_events: "إجمالي الفعاليات المنشورة بالموسم", completed_meeting_attendance: "سجلات حضور مكتملة بالموسم", my_open_tasks: "مهامي المفتوحة", my_overdue_tasks: "مهامي المتأخرة", my_scheduled_meetings: "اجتماعاتي المجدولة", my_registered_events: "فعالياتي المسجلة" };
function date(item: CalendarItem) { const value = item.due_on ?? item.starts_at; return value ? (item.due_on ? new Date(`${value}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC" }) : new Date(value).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" })) : ""; }

export default async function OrganizationDashboardPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");
  const today = cairoToday();
  const [{ data: organization, error: organizationError }, { data, error }] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
    supabase.rpc("get_organization_dashboard", { p_organization_id: organizationId, p_starts_on: today, p_ends_on: addDays(today, 30) }),
  ]);
  if (organizationError || error) throw new Error("Failed to load organization dashboard");
  if (!organization || !data) notFound();
  const dashboard = data as OrganizationDashboard;
  const metrics = Object.entries(dashboard.metrics).filter(([key, value]) => key !== "organization" && key !== "recruitment" && value !== null) as Array<[string, number]>;
  const recruitment = dashboard.metrics.recruitment as { open_campaigns: number; applications: number } | null;
  return <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
    <Link className="text-sm text-zinc-600 underline" href={`/organizations/${organizationId}`}>الرجوع للمنظمة</Link>
    <header><p className="text-sm font-semibold text-blue-700">Module 22</p><h1 className="mt-2 text-3xl font-bold">لوحة المنظمة</h1><p className="mt-2 text-zinc-600">{organization.name} · {roleLabels[dashboard.role] ?? dashboard.role}</p></header>
    <section className="grid gap-3 sm:grid-cols-2">{metrics.map(([key, value]) => <div key={key} className="rounded-xl border border-zinc-200 p-4"><p className="text-sm text-zinc-600">{metricLabels[key] ?? key}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</section>
    {recruitment && <section className="rounded-xl border border-zinc-200 p-5"><h2 className="text-xl font-semibold">التوظيف</h2><p className="mt-2 text-zinc-600">حملات مفتوحة: {recruitment.open_campaigns} · طلبات: {recruitment.applications}</p></section>}
    <section className="grid gap-3"><h2 className="text-xl font-semibold">القادم</h2>{dashboard.upcoming.length ? dashboard.upcoming.map((item) => <Link key={`${item.kind}-${item.item_id}`} href={item.href} className="rounded-xl border border-zinc-200 p-4 hover:bg-zinc-50"><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-zinc-600">{itemLabels[item.kind]} · {date(item)}</p></Link>) : <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">لا يوجد شيء قادم خلال 30 يومًا.</p>}</section>
  </main>;
}
