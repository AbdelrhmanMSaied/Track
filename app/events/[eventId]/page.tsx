import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cancelMyEventRegistration, registerForEvent } from "./actions";

type PublicEvent = { event_id: string; organization_name: string; title: string; starts_at: string; ends_at: string; venue: string | null; capacity: number | null; registration_count: number; is_full: boolean };
type Registration = { registration_status: string; registered_at: string };
const registrationLabels: Record<string, string> = { registered: "تم تسجيلك. نراك في الفعالية.", attended: "تم تسجيل حضورك.", absent: "سُجلت غائبًا.", cancelled: "ألغيت تسجيلك." };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDateTime(value: string) { return new Date(value).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "full", timeStyle: "short" }); }

export default async function PublicEventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { eventId } = await params; const query = await searchParams; if (!uuid.test(eventId)) notFound(); const supabase = await createClient();
  const { data: eventData, error: eventError } = await supabase.rpc("get_public_event", { p_event_id: eventId }).maybeSingle();
  if (eventError) throw new Error("Failed to load public event");
  const event = eventData as PublicEvent | null;
  if (!event) notFound();
  const { data: auth } = await supabase.auth.getClaims();
  let registration: Registration | null = null; let profileCompleted = false;
  if (auth?.claims?.sub) {
    const [registrationResult, profileResult] = await Promise.all([
      supabase.rpc("get_my_event_registration", { p_event_id: eventId }).maybeSingle(),
      supabase.from("profiles").select("profile_completed_at").eq("id", auth.claims.sub).maybeSingle(),
    ]);
    if (registrationResult.error || profileResult.error) throw new Error("Failed to load registration");
    registration = registrationResult.data as Registration | null;
    profileCompleted = Boolean(profileResult.data?.profile_completed_at);
  }
  const currentPath = `/events/${eventId}`;
  const registrationOpen = new Date(event.starts_at) > new Date();
  const activeRegistration = registration?.registration_status === "cancelled" ? null : registration;

  return <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6 py-12">
    <Link className="text-sm text-zinc-600 underline" href="/">Track</Link>
    <header><p className="text-sm font-semibold text-blue-700">{event.organization_name}</p><h1 className="mt-2 text-3xl font-bold">{event.title}</h1><p className="mt-2 text-zinc-600">{formatDateTime(event.starts_at)} — {formatDateTime(event.ends_at)}</p><p className="mt-1 text-zinc-600">{event.venue || "مكان غير محدد"}</p></header>
    <section className="rounded-xl border border-zinc-200 p-5"><p className="font-semibold">التسجيل</p><p className="mt-2 text-sm text-zinc-600">{event.capacity ? `${event.registration_count} من ${event.capacity} مسجلين` : `${event.registration_count} مسجلين`}</p>{query.error === "register-failed" && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">تعذر التسجيل. ربما امتلأت الفعالية أو انتهى وقتها.</p>}{query.error === "cancel-failed" && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">تعذر إلغاء التسجيل.</p>}{query.success === "registered" && <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">تم التسجيل.</p>}{activeRegistration ? <div className="mt-4 grid gap-3"><p className="rounded-lg bg-blue-50 p-3 font-semibold text-blue-800">{registrationLabels[activeRegistration.registration_status] ?? "تم تسجيلك."}</p>{activeRegistration.registration_status === "registered" && registrationOpen && <details><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-red-700">إلغاء التسجيل</summary><form action={cancelMyEventRegistration.bind(null, eventId)} className="mt-2"><button className="min-h-11 font-semibold text-red-700 underline">تأكيد الإلغاء</button></form></details>}</div> : !registrationOpen ? <p className="mt-4 rounded-lg bg-zinc-100 p-3 font-semibold text-zinc-700">انتهى التسجيل؛ بدأت الفعالية أو انتهت.</p> : !auth?.claims?.sub ? <Link className="mt-4 block min-h-11 rounded-lg bg-blue-700 px-4 py-3 text-center font-semibold text-white" href={`/auth?next=${encodeURIComponent(currentPath)}`}>سجّل دخولك للتسجيل</Link> : !profileCompleted ? <Link className="mt-4 block min-h-11 rounded-lg bg-blue-700 px-4 py-3 text-center font-semibold text-white" href={`/onboarding?next=${encodeURIComponent(currentPath)}`}>أكمل ملفك ثم سجّل</Link> : event.is_full ? <p className="mt-4 rounded-lg bg-zinc-100 p-3 font-semibold text-zinc-700">اكتملت السعة.</p> : <form action={registerForEvent.bind(null, eventId)} className="mt-4"><button className="min-h-11 w-full rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">سجّل في الفعالية</button></form>}</section>
  </main>;
}
