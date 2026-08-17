import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cancelOrganizationVerification, createCareerExperience, createCareerExperienceFromAssignment, deleteCareerExperience, requestOrganizationVerification, updateCareerExperience } from "./actions";

const errors: Record<string, string> = {
  "invalid-experience": "راجع بيانات التجربة وتواريخها.", "create-failed": "تعذر حفظ التجربة.", "update-failed": "لا يمكن تعديل تجربة موثقة من المنظمة.", "delete-failed": "لا يمكن حذف تجربة موثقة من المنظمة.",
  "invalid-verification": "اختر تعيينًا صحيحًا من سجلك.", "request-failed": "تعذر إرسال طلب التحقق. قد يكون قيد المراجعة بالفعل.",
};
const success: Record<string, string> = { created: "تمت إضافة التجربة.", updated: "تم حفظ التعديل.", deleted: "تم حذف التجربة.", requested: "تم إرسال طلب التحقق للمنظمة.", cancelled: "تم إلغاء طلب التحقق." };
const typeLabels: Record<string, string> = { student_activity: "نشاط طلابي", volunteering: "تطوع", event_role: "دور في فعالية", internship: "تدريب", job: "وظيفة", freelance: "عمل حر", project: "مشروع", training: "تدريب مهني", course: "دورة", bootcamp: "معسكر تدريبي", competition: "مسابقة", award: "جائزة", leadership: "قيادة", certificate: "شهادة", workshop: "ورشة", conference: "مؤتمر" };
const stateLabels: Record<string, string> = { self_reported: "إفادة ذاتية", evidence_provided: "دليل مرفق", organization_verified: "موثقة من المنظمة" };
const requestLabels: Record<string, string> = { pending: "قيد المراجعة", approved: "تم التوثيق", rejected: "لم تُعتمد" };

function formatDate(date: string) { return new Date(`${date}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC" }); }
function host(url: string) { try { return new URL(url).hostname; } catch { return "رابط خارجي"; } }

type Experience = { experience_id: string; role_title: string; organization_name: string; experience_type: string; summary: string | null; starts_on: string; ends_on: string | null; evidence_url: string | null; verification_state: string; source_membership_assignment_id: string | null; request_status: string | null; };
type Assignment = { assignment_id: string; organization_name: string; department_name: string; position: string; starts_on: string; ends_on: string | null; };

function ExperienceFields({ experience }: { experience?: Experience }) {
  return <>
    <label className="grid gap-1 text-sm font-medium">الدور أو عنوان التجربة<input name="role_title" defaultValue={experience?.role_title ?? ""} minLength={2} maxLength={160} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
    <label className="grid gap-1 text-sm font-medium">المنظمة أو الجهة<input name="organization_name" defaultValue={experience?.organization_name ?? ""} minLength={2} maxLength={160} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
    <label className="grid gap-1 text-sm font-medium">نوع التجربة<select name="experience_type" defaultValue={experience?.experience_type ?? "student_activity"} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">بدأت في<input type="date" name="starts_on" defaultValue={experience?.starts_on ?? ""} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">انتهت في (اختياري)<input type="date" name="ends_on" defaultValue={experience?.ends_on ?? ""} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label></div>
    <label className="grid gap-1 text-sm font-medium">المسؤوليات أو الأثر (اختياري)<textarea name="responsibilities" defaultValue={experience?.summary ?? ""} maxLength={3000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
    <label className="grid gap-1 text-sm font-medium">رابط دليل واحد HTTPS (اختياري)<input type="url" name="evidence_url" defaultValue={experience?.evidence_url ?? ""} maxLength={2048} pattern="https://.*" placeholder="https://..." className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
  </>;
}

export default async function CareerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");
  const [{ data: profile }, experiencesResult, assignmentsResult] = await Promise.all([
    supabase.from("profiles").select("profile_completed_at").eq("id", auth.claims.sub).maybeSingle(),
    supabase.rpc("list_my_career_experiences"), supabase.rpc("list_my_membership_assignments_for_career"),
  ]);
  if (!profile?.profile_completed_at) redirect("/onboarding");
  if (experiencesResult.error || assignmentsResult.error) throw new Error("Failed to load career passport");
  const experiences = (experiencesResult.data as Experience[] | null) ?? [];
  const assignments = (assignmentsResult.data as Assignment[] | null) ?? [];

  return <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
    <Link className="text-sm text-zinc-600 underline" href="/dashboard">لوحة التحكم</Link>
    <header><p className="text-sm font-semibold text-blue-700">Career Passport</p><h1 className="mt-2 text-3xl font-bold">جواز المسار</h1><p className="mt-2 text-zinc-600">سجل شخصي خاص بك. لا يظهر للمنظمات إلا ما تطلب توثيقه صراحة.</p></header>
    {query.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[String(query.error)] ?? "حدث خطأ. حاول مجددًا."}</p>}
    {query.success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success[String(query.success)] ?? "تم الحفظ."}</p>}

    <section className="rounded-xl border border-zinc-200 p-5"><h2 className="text-xl font-semibold">تجربة جديدة</h2><p className="mt-1 text-sm text-zinc-600">أضف خبرة سابقة أو حالية. تبقى خاصة بك؛ التوثيق يتطلب تجربة منشأة من سجل تعيينك.</p><details className="mt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">إضافة تجربة يدوية</summary><form action={createCareerExperience} className="mt-4 grid gap-3"><ExperienceFields /><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حفظ التجربة</button></form></details>{assignments.length ? <details className="mt-3 border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">إضافة من سجل منظماتي</summary><form action={createCareerExperienceFromAssignment} className="mt-3 grid gap-3"><label className="grid gap-1 text-sm font-medium">التعيين<select name="assignment_id" defaultValue="" required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2"><option value="" disabled>اختر التعيين</option>{assignments.map((assignment) => <option key={assignment.assignment_id} value={assignment.assignment_id}>{assignment.organization_name} · {assignment.position} · {assignment.department_name} · {formatDate(assignment.starts_on)}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">ملخص (اختياري)<textarea name="summary" maxLength={3000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">رابط دليل واحد HTTPS (اختياري)<input type="url" name="evidence_url" maxLength={2048} pattern="https://.*" placeholder="https://..." className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">إضافة التجربة</button></form></details> : null}</section>

    <section className="grid gap-4"><h2 className="text-xl font-semibold">تجاربي</h2>{experiences.length ? experiences.map((experience) => <article key={experience.experience_id} className="grid gap-4 rounded-xl border border-zinc-200 p-5"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{experience.role_title}</h3><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">{stateLabels[experience.verification_state] ?? "غير محددة"}</span>{experience.request_status && <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{requestLabels[experience.request_status] ?? "حالة غير معروفة"}</span>}</div><p className="mt-2 text-sm text-zinc-600">{experience.organization_name} · {typeLabels[experience.experience_type] ?? "خبرة"} · {formatDate(experience.starts_on)} — {experience.ends_on ? formatDate(experience.ends_on) : "مستمر"}</p>{experience.summary && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{experience.summary}</p>}{experience.evidence_url && <a className="mt-3 block break-all text-sm text-blue-700 underline" href={experience.evidence_url} target="_blank" rel="noreferrer">فتح الدليل ({host(experience.evidence_url)})</a>}</div>
      {experience.verification_state !== "organization_verified" && !experience.source_membership_assignment_id && experience.request_status !== "pending" && <details className="border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">تعديل التجربة</summary><form action={updateCareerExperience} className="mt-4 grid gap-3"><input type="hidden" name="experience_id" value={experience.experience_id} /><ExperienceFields experience={experience} /><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حفظ التعديل</button></form></details>}
      {experience.verification_state !== "organization_verified" && experience.source_membership_assignment_id && experience.request_status !== "pending" && <form action={requestOrganizationVerification} className="border-t border-zinc-200 pt-3"><input type="hidden" name="experience_id" value={experience.experience_id} /><button className="min-h-11 font-semibold text-blue-700 underline">طلب توثيق من المنظمة</button></form>}
      {experience.request_status === "pending" && <form action={cancelOrganizationVerification} className="border-t border-zinc-200 pt-3"><input type="hidden" name="experience_id" value={experience.experience_id} /><button className="min-h-11 font-semibold text-red-700 underline">إلغاء طلب التوثيق</button></form>}
      {experience.verification_state !== "organization_verified" && experience.request_status !== "pending" && <details className="border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-red-700">حذف التجربة</summary><form action={deleteCareerExperience} className="mt-3"><input type="hidden" name="experience_id" value={experience.experience_id} /><button className="min-h-11 text-sm font-semibold text-red-700 underline">تأكيد الحذف</button></form></details>}
    </article>) : <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">لا توجد تجارب بعد. أضف أول تجربة لتبدأ سجلّك.</p>}</section>
  </main>;
}
