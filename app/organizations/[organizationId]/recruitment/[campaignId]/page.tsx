import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptRecruitmentApplication, closeRecruitmentCampaign, setRecruitmentApplicationStatus } from "./actions";

const errors: Record<string, string> = { "invalid-status": "حالة الطلب غير صالحة.", "status-failed": "تعذر تحديث حالة الطلب.", "accept-failed": "تعذر قبول المتقدم. قد يكون عضوًا بحالة غير قابلة للتفعيل.", "close-failed": "تعذر إغلاق الحملة." };
const statusLabels: Record<string, string> = { submitted: "جديد", screening: "قيد المراجعة", rejected: "مرفوض", accepted: "عضو مقبول" };

export default async function RecruitmentCampaignOwnerPage({ params, searchParams }: { params: Promise<{ organizationId: string; campaignId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId, campaignId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");

  const { data: campaigns, error: campaignsError } = await supabase.rpc("list_recruitment_campaigns", { p_organization_id: organizationId });
  if (campaignsError) notFound();
  const campaign = (campaigns as Array<{ campaign_id: string; title: string; closes_on: string; status: string; applicant_count: number }> | null)?.find((entry) => entry.campaign_id === campaignId);
  if (!campaign) notFound();
  const campaignExpired = campaign.status === "open" && campaign.closes_on < new Date().toISOString().slice(0, 10);

  const { data: applicants, error: applicantsError } = await supabase.rpc("list_recruitment_applicants", { p_organization_id: organizationId, p_campaign_id: campaignId });
  if (applicantsError) throw new Error("Failed to load recruitment applicants");
  const publicPath = `/recruitment/${campaignId}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <Link className="text-sm text-zinc-600 underline" href={`/organizations/${organizationId}`}>الرجوع للمنظمة</Link>
      <header><p className="text-sm font-semibold text-blue-700">Module 13</p><h1 className="mt-2 text-3xl font-bold">{campaign.title}</h1><p className="mt-2 text-zinc-600">{campaignExpired ? "منتهية" : campaign.status === "open" ? "مفتوحة" : "مغلقة"} · تنتهي {new Date(`${campaign.closes_on}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC" })} · {campaign.applicant_count} متقدم</p></header>
      {query.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[String(query.error)] ?? "حدث خطأ. حاول مجددًا."}</p>}
      <section className="grid gap-3 rounded-xl border border-zinc-200 p-5"><p className="font-semibold">الرابط العام</p><a className="break-all text-sm text-blue-700 underline" href={publicPath}>{publicPath}</a>{campaign.status === "open" && !campaignExpired && <form action={closeRecruitmentCampaign.bind(null, organizationId, campaignId)}><button className="min-h-11 rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700">إغلاق الحملة</button></form>}</section>
      <section className="grid gap-4"><h2 className="text-xl font-semibold">المتقدمون</h2>{(applicants as Array<{ application_id: string; full_name: string; university: string; faculty: string; academic_year: string; city: string; bio: string | null; application_status: string; applied_at: string }> | null)?.length ? (applicants as Array<{ application_id: string; full_name: string; university: string; faculty: string; academic_year: string; city: string; bio: string | null; application_status: string; applied_at: string }>).map((applicant) => <article key={applicant.application_id} className="grid gap-3 rounded-xl border border-zinc-200 p-5"><div><p className="font-semibold">{applicant.full_name}</p><p className="mt-1 text-sm text-zinc-600">{applicant.university} · {applicant.faculty} · {applicant.city}</p><p className="mt-1 text-sm text-zinc-600">{statusLabels[applicant.application_status] ?? applicant.application_status}</p>{applicant.bio && <p className="mt-3 text-sm leading-6 text-zinc-700">{applicant.bio}</p>}</div>{applicant.application_status !== "accepted" && <div className="flex flex-wrap gap-2"><form action={setRecruitmentApplicationStatus.bind(null, organizationId, campaignId)}><input type="hidden" name="application_id" value={applicant.application_id} /><input type="hidden" name="status" value="screening" /><button className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold">مراجعة</button></form><form action={setRecruitmentApplicationStatus.bind(null, organizationId, campaignId)}><input type="hidden" name="application_id" value={applicant.application_id} /><input type="hidden" name="status" value="rejected" /><button className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">رفض</button></form><form action={acceptRecruitmentApplication.bind(null, organizationId, campaignId)}><input type="hidden" name="application_id" value={applicant.application_id} /><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">قبول كعضو</button></form></div>}</article>) : <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">لا يوجد متقدمون بعد.</p>}</section>
    </main>
  );
}
