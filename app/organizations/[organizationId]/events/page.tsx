import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEvent } from "./actions";

const errors: Record<string, string> = {
  "invalid-event": "راجع بيانات الفعالية.", "create-failed": "تعذر إنشاء الفعالية. تحتاج موسمًا نشطًا وصلاحية إدارة.",
};
const success: Record<string, string> = { created: "تم حفظ المسودة." };
const statusLabels: Record<string, string> = { draft: "مسودة", published: "منشورة", completed: "مكتملة", cancelled: "ملغاة" };

type Event = { event_id: string; season_id: string; season_name: string; season_status: string; title: string; objective: string | null; starts_at: string; ends_at: string; venue: string | null; capacity: number | null; status: string; registration_count: number | null; my_team_role: string | null };

function formatDateTime(value: string) { return new Date(value).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }); }
function cairoInputNow() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T"); }

export default async function EventsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId } = await params; const query = await searchParams;
  const supabase = await createClient(); const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");
  const userId = String(auth.claims.sub);
  const [organizationResult, membershipResult, seasonsResult, eventsResult] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
    supabase.from("memberships").select("role, status").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    supabase.from("seasons").select("id, name, status").eq("organization_id", organizationId).order("starts_on", { ascending: false }),
    supabase.rpc("list_events", { p_organization_id: organizationId }),
  ]);
  if (organizationResult.error || membershipResult.error || seasonsResult.error || eventsResult.error) throw new Error("Failed to load events");
  if (!organizationResult.data || membershipResult.data?.status !== "active") notFound();
  const manager = ["owner", "board", "head"].includes(membershipResult.data.role);
  const activeSeason = seasonsResult.data?.find((season) => season.status === "active");
  const events = (eventsResult.data as Event[] | null) ?? [];
  const groups = [{ title: "فعاليات الموسم النشط", items: events.filter((event) => event.season_status === "active") }, { title: "الأرشيف", items: events.filter((event) => event.season_status !== "active") }];

  return <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
    <Link className="text-sm text-zinc-600 underline" href={`/organizations/${organizationId}`}>الرجوع للمنظمة</Link>
    <header><p className="text-sm font-semibold text-blue-700">Module 16</p><h1 className="mt-2 text-3xl font-bold">الفعاليات والفرق</h1><p className="mt-2 text-zinc-600">{organizationResult.data.name} · التوقيت بتوقيت القاهرة.</p></header>
    {query.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[String(query.error)] ?? "حدث خطأ. حاول مجددًا."}</p>}
    {query.success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success[String(query.success)] ?? "تم الحفظ."}</p>}

    {manager && <section className="grid gap-4 rounded-xl border border-zinc-200 p-5"><div><h2 className="text-xl font-semibold">فعالية جديدة</h2><p className="mt-1 text-sm text-zinc-600">{activeSeason ? `ستُربط بموسم ${activeSeason.name} كمسودة خاصة.` : "فعّل موسمًا أولًا لإنشاء فعالية."}</p></div>{activeSeason && <details><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">إنشاء فعالية</summary><form action={createEvent.bind(null, organizationId)} className="mt-4 grid gap-3"><EventFields /><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حفظ المسودة</button></form></details>}</section>}

    <section className="grid gap-6">{groups.map(({ title, items }) => <div key={title} className="grid gap-4"><h2 className="text-xl font-semibold">{title}</h2>{items.length ? items.map((event) => <Link key={event.event_id} href={`/organizations/${organizationId}/events/${event.event_id}`} className="rounded-xl border border-zinc-200 p-5 hover:bg-zinc-50"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{event.title}</h3><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">{statusLabels[event.status]}</span></div><p className="mt-2 text-sm text-zinc-600">{formatDateTime(event.starts_at)} — {formatDateTime(event.ends_at)} · {event.venue || "مكان غير محدد"} · {event.season_name}</p>{manager && event.objective && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{event.objective}</p>}{manager && <p className="mt-3 text-sm text-zinc-600">تسجيلات نشطة: {event.registration_count ?? 0}{event.capacity ? ` من ${event.capacity}` : ""}</p>}{!manager && event.my_team_role && <p className="mt-3 text-sm font-semibold text-blue-700">دوري في الفريق: {event.my_team_role}</p>}</Link>) : <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">لا توجد فعاليات في هذا القسم.</p>}</div>)}</section>
  </main>;
}

function EventFields() {
  const min = cairoInputNow();
  return <><label className="grid gap-1 text-sm font-medium">العنوان<input name="title" minLength={2} maxLength={160} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">الهدف<textarea name="objective" minLength={2} maxLength={3000} rows={4} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">يبدأ<input type="datetime-local" name="starts_at" min={min} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">ينتهي<input type="datetime-local" name="ends_at" min={min} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">المكان (اختياري)<input name="venue" maxLength={300} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">السعة (اختياري)<input name="capacity" type="number" min="1" max="100000" className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label></div></>;
}
