import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cancelMeeting, completeMeeting, createMeeting, createMeetingTask, updateScheduledMeeting } from "./actions";

const errors: Record<string, string> = {
  "invalid-meeting": "راجع بيانات الاجتماع.", "create-failed": "تعذر إنشاء الاجتماع. تحتاج موسمًا نشطًا وصلاحية إدارة.", "update-failed": "تعذر حفظ التعديل. لا يمكن تعديل اجتماع مكتمل أو مؤرشف.",
  "invalid-attendance": "اختر حالة لكل عضو في القائمة.", "complete-failed": "تعذر إتمام الاجتماع. راجع قائمة الحضور وصلاحياتك.", "cancel-failed": "تعذر إلغاء الاجتماع.",
  "invalid-task": "راجع بيانات المهمة.", "task-failed": "تعذر إنشاء مهمة من الاجتماع.",
};
const success: Record<string, string> = { created: "تم إنشاء الاجتماع وسجل الحضور.", updated: "تم حفظ التعديل.", completed: "تم حفظ الحضور وإتمام الاجتماع.", cancelled: "تم إلغاء الاجتماع.", "task-created": "تم إنشاء المهمة وربطها بالاجتماع." };
const typeLabels: Record<string, string> = { board: "مجلس", department: "قسم", committee: "لجنة", project: "مشروع", emergency: "طارئ" };
const statusLabels: Record<string, string> = { scheduled: "مجدول", completed: "مكتمل", cancelled: "ملغي" };
const attendanceLabels: Record<string, string> = { present: "حاضر", absent: "غائب", excused: "بعذر" };
const priorityLabels: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };

function formatDateTime(value: string) { return new Date(value).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }); }
function inputDateTime(value: string) { return new Date(value).toLocaleString("sv-SE", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(" ", "T"); }
function host(url: string) { try { return new URL(url).hostname; } catch { return "رابط خارجي"; } }

type Meeting = {
  meeting_id: string; season_id: string; season_name: string; season_status: string; meeting_type: string; title: string; starts_at: string; location: string | null; agenda: string | null; minutes: string | null; decisions: string | null; reference_url: string | null; status: string;
  created_by_name: string; completed_at: string | null; created_at: string; my_attendance_status: string | null; roster_count: number | null; present_count: number | null; absent_count: number | null; excused_count: number | null;
};
type Attendance = { membership_id: string; user_id: string; display_name: string; attendance_status: string | null };
type Member = { user_id: string; display_name: string };

function MeetingFields({ meeting }: { meeting?: Meeting }) {
  return <>
    <label className="grid gap-1 text-sm font-medium">النوع<select name="meeting_type" defaultValue={meeting?.meeting_type ?? "board"} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium">العنوان<input name="title" defaultValue={meeting?.title ?? ""} minLength={2} maxLength={160} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
    <label className="grid gap-1 text-sm font-medium">الموعد<input type="datetime-local" name="starts_at" defaultValue={meeting ? inputDateTime(meeting.starts_at) : ""} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
    <label className="grid gap-1 text-sm font-medium">المكان (اختياري)<input name="location" defaultValue={meeting?.location ?? ""} maxLength={300} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
    <label className="grid gap-1 text-sm font-medium">الأجندة (اختياري)<textarea name="agenda" defaultValue={meeting?.agenda ?? ""} maxLength={3000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
    <label className="grid gap-1 text-sm font-medium">رابط مرجعي HTTPS (اختياري)<input type="url" name="reference_url" defaultValue={meeting?.reference_url ?? ""} maxLength={2048} pattern="https://.*" placeholder="https://..." className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
  </>;
}

export default async function MeetingsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");
  const userId = String(auth.claims.sub);
  const [organizationResult, membershipResult, seasonsResult, meetingsResult] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
    supabase.from("memberships").select("role, status").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    supabase.from("seasons").select("id, name, status").eq("organization_id", organizationId).order("starts_on", { ascending: false }),
    supabase.rpc("list_meetings", { p_organization_id: organizationId }),
  ]);
  if (organizationResult.error || membershipResult.error || seasonsResult.error || meetingsResult.error) throw new Error("Failed to load meetings");
  if (!organizationResult.data || membershipResult.data?.status !== "active") notFound();
  const manager = ["owner", "board", "head"].includes(membershipResult.data.role);
  const activeSeason = seasonsResult.data?.find((season) => season.status === "active");
  const meetings = (meetingsResult.data as Meeting[] | null) ?? [];
  const directoryResult = manager ? await supabase.rpc("list_member_directory_details", { p_organization_id: organizationId }) : { data: null, error: null };
  if (directoryResult.error) throw new Error("Failed to load meeting directory");
  const members = (directoryResult.data as Member[] | null) ?? [];
  const attendanceResults = manager ? await Promise.all(meetings.map(async (meeting) => ({ meetingId: meeting.meeting_id, result: await supabase.rpc("list_meeting_attendance", { p_organization_id: organizationId, p_meeting_id: meeting.meeting_id }) }))) : [];
  if (attendanceResults.some(({ result }) => result.error)) throw new Error("Failed to load attendance");
  const attendanceByMeeting = new Map(attendanceResults.map(({ meetingId, result }) => [meetingId, (result.data as Attendance[] | null) ?? []]));
  const meetingGroups = [
    { title: "اجتماعات الموسم النشط", items: meetings.filter((meeting) => meeting.season_status === "active") },
    { title: "الأرشيف", items: meetings.filter((meeting) => meeting.season_status !== "active") },
  ];

  return <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
    <Link className="text-sm text-zinc-600 underline" href={`/organizations/${organizationId}`}>الرجوع للمنظمة</Link>
    <header><p className="text-sm font-semibold text-blue-700">Module 15</p><h1 className="mt-2 text-3xl font-bold">الاجتماعات والحضور</h1><p className="mt-2 text-zinc-600">{organizationResult.data.name} · الحضور يسجله المدير فقط من القائمة المثبتة عند إنشاء الاجتماع.</p></header>
    {query.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[String(query.error)] ?? "حدث خطأ. حاول مجددًا."}</p>}
    {query.success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success[String(query.success)] ?? "تم الحفظ."}</p>}

    {manager && <section className="grid gap-4 rounded-xl border border-zinc-200 p-5"><div><h2 className="text-xl font-semibold">اجتماع جديد</h2><p className="mt-1 text-sm text-zinc-600">{activeSeason ? `سيُربط بموسم ${activeSeason.name} ويأخذ نسخة من كل الأعضاء النشطين.` : "فعّل موسمًا أولًا لإنشاء اجتماع."}</p></div>{activeSeason && <details><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">إنشاء اجتماع</summary><form action={createMeeting.bind(null, organizationId)} className="mt-4 grid gap-3"><MeetingFields /><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حفظ الاجتماع</button></form></details>}</section>}

    <section className="grid gap-6">{meetingGroups.map(({ title, items }) => <div key={title} className="grid gap-4"><h2 className="text-xl font-semibold">{title}</h2>{items.length ? items.map((meeting) => {
      const attendance = attendanceByMeeting.get(meeting.meeting_id) ?? [];
      return <article key={meeting.meeting_id} className="grid gap-4 rounded-xl border border-zinc-200 p-5">
        <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{meeting.title}</h3><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">{typeLabels[meeting.meeting_type]}</span><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">{statusLabels[meeting.status]}</span></div><p className="mt-2 text-sm text-zinc-600">{formatDateTime(meeting.starts_at)} · {meeting.location || "مكان غير محدد"} · {meeting.season_name} · أنشأه {meeting.created_by_name}</p>{meeting.agenda && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{meeting.agenda}</p>}{meeting.reference_url && <a className="mt-3 block break-all text-sm text-blue-700 underline" href={meeting.reference_url} target="_blank" rel="noreferrer">فتح المرجع ({host(meeting.reference_url)})</a>}{manager && meeting.roster_count !== null && <p className="mt-3 text-sm text-zinc-600">القائمة: {meeting.roster_count} · حاضر {meeting.present_count ?? 0} · غائب {meeting.absent_count ?? 0} · بعذر {meeting.excused_count ?? 0}</p>}{!manager && <p className="mt-3 text-sm text-zinc-600">حضوري: {meeting.my_attendance_status ? attendanceLabels[meeting.my_attendance_status] : "لم يُسجل بعد"}</p>}</div>
        {(meeting.minutes || meeting.decisions) && <div className="rounded-lg bg-zinc-50 p-4 text-sm">{meeting.minutes && <><p className="font-semibold">المحضر</p><p className="mt-2 whitespace-pre-wrap leading-6 text-zinc-700">{meeting.minutes}</p></>}{meeting.decisions && <><p className={meeting.minutes ? "mt-3 font-semibold" : "font-semibold"}>القرارات</p><p className="mt-2 whitespace-pre-wrap leading-6 text-zinc-700">{meeting.decisions}</p></>}</div>}
        {manager && meeting.season_status === "active" && meeting.status === "scheduled" && <details className="border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">تعديل الاجتماع أو تسجيل الحضور</summary><form action={updateScheduledMeeting.bind(null, organizationId)} className="mt-4 grid gap-3"><input type="hidden" name="meeting_id" value={meeting.meeting_id} /><MeetingFields meeting={meeting} /><label className="grid gap-1 text-sm font-medium">محضر مبدئي (اختياري)<textarea name="minutes" defaultValue={meeting.minutes ?? ""} maxLength={6000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">قرارات مبدئية (اختياري)<textarea name="decisions" defaultValue={meeting.decisions ?? ""} maxLength={6000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حفظ التعديل</button></form><details className="mt-3 border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">إتمام وتسجيل الحضور</summary><form action={completeMeeting.bind(null, organizationId)} className="mt-4 grid gap-3"><input type="hidden" name="meeting_id" value={meeting.meeting_id} /><p className="text-sm text-zinc-600">يلزم اختيار حالة لكل عضو من القائمة المثبتة.</p>{attendance.map((entry) => <label key={entry.membership_id} className="grid gap-1 text-sm font-medium sm:grid-cols-2 sm:items-center"><span>{entry.display_name}</span><input type="hidden" name="membership_id" value={entry.membership_id} /><select name="attendance_status" required defaultValue="" className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2"><option value="" disabled>اختر الحضور</option>{Object.entries(attendanceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}<label className="grid gap-1 text-sm font-medium">المحضر (اختياري)<textarea name="minutes" defaultValue={meeting.minutes ?? ""} maxLength={6000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">القرارات (اختياري)<textarea name="decisions" defaultValue={meeting.decisions ?? ""} maxLength={6000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">إتمام الاجتماع</button></form></details><details className="mt-3 border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-red-700">إلغاء الاجتماع</summary><form action={cancelMeeting.bind(null, organizationId)} className="mt-3"><input type="hidden" name="meeting_id" value={meeting.meeting_id} /><button className="min-h-11 font-semibold text-red-700 underline">تأكيد الإلغاء</button></form></details></details>}
        {manager && meeting.season_status === "active" && meeting.status !== "cancelled" && <details className="border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">إنشاء مهمة من الاجتماع</summary><form action={createMeetingTask.bind(null, organizationId)} className="mt-4 grid gap-3"><input type="hidden" name="meeting_id" value={meeting.meeting_id} /><label className="grid gap-1 text-sm font-medium">العنوان<input name="title" minLength={2} maxLength={160} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">الوصف (اختياري)<textarea name="description" maxLength={3000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">الأولوية<select name="priority" defaultValue="medium" className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">الموعد (اختياري)<input type="date" name="due_on" className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label></div><label className="grid gap-1 text-sm font-medium">المكلّف (اختياري)<select name="assignee_user_id" defaultValue="" className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2"><option value="">غير مكلّف</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}</select></label><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حفظ المهمة</button></form><Link className="mt-3 block min-h-11 text-sm font-semibold text-blue-700 underline" href={`/organizations/${organizationId}/tasks`}>فتح المهام</Link></details>}
      </article>;
    }) : <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">لا توجد اجتماعات في هذا القسم.</p>}</div>)}</section>
  </main>;
}
