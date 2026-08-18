import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addDays, currentMonth, itemDate, monthBounds, type DashboardData } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";

const labels: Record<string, string> = { task: "مهمة", meeting: "اجتماع", event: "فعالية" };
function displayDate(value: string) { return new Date(`${value}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC", dateStyle: "full" }); }
function displayTime(value: string | null) { return value ? new Date(value).toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo", timeStyle: "short" }) : "طوال اليوم"; }

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const requestedMonth = query.month === undefined ? currentMonth() : typeof query.month === "string" ? query.month : "";
  const bounds = monthBounds(requestedMonth);
  if (!bounds) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");
  const { data, error } = await supabase.rpc("get_my_dashboard", { p_starts_on: bounds.startsOn, p_ends_on: bounds.endsOn });
  if (error) throw new Error("Failed to load calendar");
  const calendar = data as DashboardData;
  const byDay = new Map<string, DashboardData["items"]>();
  for (const item of calendar.items) { const day = itemDate(item); if (day) byDay.set(day, [...(byDay.get(day) ?? []), item]); }
  const previous = addDays(bounds.startsOn, -1).slice(0, 7);
  const next = addDays(bounds.endsOn, 1).slice(0, 7);

  return <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
    <Link className="text-sm text-zinc-600 underline" href="/dashboard">الرئيسية</Link>
    <header><p className="text-sm font-semibold text-blue-700">Module 10</p><h1 className="mt-2 text-3xl font-bold">تقويمي</h1><p className="mt-2 text-zinc-600">المواعيد بتوقيت القاهرة.</p></header>
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="الشهر"><Link className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 font-semibold" href={`/calendar?month=${previous}`}>الشهر السابق</Link><p className="font-semibold">{new Date(`${requestedMonth}-01T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC", month: "long", year: "numeric" })}</p><Link className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 font-semibold" href={`/calendar?month=${next}`}>الشهر التالي</Link></nav>
    <div className="flex flex-wrap gap-3"><a className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" href={`/calendar.ics?month=${requestedMonth}`}>تنزيل iCal</a><p className="self-center text-sm text-zinc-600">حتى 93 يومًا لكل عرض.</p></div>
    <section className="grid gap-4">{[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => <div key={day} className="grid gap-2"><h2 className="font-semibold">{displayDate(day)}</h2>{items.map((item) => <Link key={`${item.kind}-${item.item_id}`} href={item.href} className="rounded-xl border border-zinc-200 p-4 hover:bg-zinc-50"><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-zinc-600">{labels[item.kind]} · {item.organization_name} · {displayTime(item.starts_at)}</p></Link>)}</div>)}</section>
    {!byDay.size && <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">لا توجد مواعيد أو مهام خلال هذا الشهر.</p>}
  </main>;
}
