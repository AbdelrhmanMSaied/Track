import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reviewOrganizationVerification } from "./actions";

const errors: Record<string, string> = { "invalid-review": "راجع قرار المراجعة.", "review-failed": "تعذر حفظ قرار المراجعة. ربما تمت مراجعة الطلب بالفعل." };
const types: Record<string, string> = { student_activity: "نشاط طلابي", volunteering: "تطوع", event_role: "دور في فعالية", internship: "تدريب", job: "وظيفة", freelance: "عمل حر", project: "مشروع", training: "تدريب مهني", course: "دورة", bootcamp: "معسكر تدريبي", competition: "مسابقة", award: "جائزة", leadership: "قيادة", certificate: "شهادة", workshop: "ورشة", conference: "مؤتمر" };
function date(value: string) { return new Date(`${value}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC" }); }
function host(url: string) { try { return new URL(url).hostname; } catch { return "رابط خارجي"; } }

type Snapshot = { role_title: string; experience_type: string; summary: string | null; evidence_url: string | null; starts_on: string; ends_on: string | null; source_organization_name: string; source_department_name: string | null; source_position: string; source_starts_on: string; source_ends_on: string | null; };
type Request = { request_id: string; requester_name: string; claim_snapshot: Snapshot; requested_at: string; };

export default async function VerificationsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");
  const [organizationResult, membershipResult, requestsResult] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
    supabase.from("memberships").select("role, status").eq("organization_id", organizationId).eq("user_id", auth.claims.sub).maybeSingle(),
    supabase.rpc("list_organization_verification_requests", { p_organization_id: organizationId }),
  ]);
  if (organizationResult.error || membershipResult.error || requestsResult.error) throw new Error("Failed to load verification requests");
  if (!organizationResult.data || membershipResult.data?.status !== "active" || membershipResult.data.role !== "owner") notFound();
  const requests = (requestsResult.data as Request[] | null) ?? [];

  return <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
    <Link className="text-sm text-zinc-600 underline" href={`/organizations/${organizationId}`}>الرجوع للمنظمة</Link>
    <header><p className="text-sm font-semibold text-blue-700">Organization Verification</p><h1 className="mt-2 text-3xl font-bold">طلبات توثيق الخبرات</h1><p className="mt-2 text-zinc-600">{organizationResult.data.name} · راجع التعيين والطلب قبل اعتماد الخبرة.</p></header>
    {query.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[String(query.error)] ?? "حدث خطأ. حاول مجددًا."}</p>}
    {query.success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">تم حفظ قرار المراجعة.</p>}
    <section className="grid gap-4">{requests.length ? requests.map((request) => { const claim = request.claim_snapshot; return <article key={request.request_id} className="grid gap-4 rounded-xl border border-zinc-200 p-5"><div><h2 className="font-semibold">{claim.role_title}</h2><p className="mt-2 text-sm text-zinc-600">{request.requester_name} · {types[claim.experience_type] ?? "خبرة"} · {date(claim.starts_on)} — {claim.ends_on ? date(claim.ends_on) : "مستمر"}</p>{claim.summary && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{claim.summary}</p>}{claim.evidence_url && <a className="mt-3 block break-all text-sm text-blue-700 underline" href={claim.evidence_url} target="_blank" rel="noreferrer">فتح الدليل ({host(claim.evidence_url)})</a>}</div><div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700"><p className="font-semibold">سجل التعيين الذي اختاره العضو</p><p className="mt-1">{claim.source_organization_name} · {claim.source_position} · {claim.source_department_name}</p><p className="mt-1 text-zinc-600">{date(claim.source_starts_on)} — {claim.source_ends_on ? date(claim.source_ends_on) : "مستمر"}</p></div><form action={reviewOrganizationVerification.bind(null, organizationId)} className="flex flex-wrap gap-3 border-t border-zinc-200 pt-4"><input type="hidden" name="request_id" value={request.request_id} /><button name="decision" value="approved" className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">اعتماد التوثيق</button><button name="decision" value="rejected" className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700">رفض الطلب</button></form></article>; }) : <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">لا توجد طلبات توثيق حتى الآن.</p>}</section>
  </main>;
}
