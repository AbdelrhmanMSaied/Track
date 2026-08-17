import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { submitRecruitmentApplication } from "./actions";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statusLabels: Record<string, string> = { submitted: "تم استلام طلبك", screening: "طلبك قيد المراجعة", rejected: "لم يُقبل طلبك", accepted: "تم قبولك كعضو" };
type PublicCampaign = { campaign_id: string; organization_name: string; organization_university: string; title: string; description: string; closes_on: string };
type Application = { application_status: string | null; created_at: string | null; has_membership: boolean };

export default async function PublicRecruitmentCampaignPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { campaignId } = await params;
  if (!uuidPattern.test(campaignId)) notFound();

  const supabase = await createClient();
  const { data: campaignData, error: campaignError } = await supabase
    .rpc("get_public_recruitment_campaign", { p_campaign_id: campaignId })
    .maybeSingle();
  if (campaignError) throw new Error("Failed to load recruitment campaign");
  const campaign = campaignData as PublicCampaign | null;
  if (!campaign) {
    const { data: unavailable, error } = await supabase.rpc("recruitment_campaign_is_unavailable", { p_campaign_id: campaignId });
    if (error) throw new Error("Failed to load recruitment campaign");
    if (!unavailable) notFound();
    return <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12"><p className="text-sm font-semibold text-blue-700">Track</p><div><h1 className="text-3xl font-bold">هذه الحملة غير متاحة</h1><p className="mt-2 text-zinc-600">انتهى موعد التقديم أو أغلقت الحملة.</p></div><Link className="min-h-11 rounded-lg bg-blue-700 px-4 py-3 text-center font-semibold text-white" href="/">الرجوع للرئيسية</Link></main>;
  }

  const query = await searchParams;
  const { data: auth } = await supabase.auth.getClaims();
  let applicationStatus: string | null = null;
  let hasMembership = false;
  if (auth?.claims?.sub) {
    const { data: applicationData, error: applicationError } = await supabase
      .rpc("get_my_recruitment_application", { p_campaign_id: campaignId })
      .maybeSingle();
    if (applicationError) throw new Error("Failed to load application");
    const application = applicationData as Application | null;
    applicationStatus = application?.application_status ?? null;
    hasMembership = application?.has_membership ?? false;

    const { data: profile, error: profileError } = await supabase.from("profiles").select("profile_completed_at").eq("id", auth.claims.sub).maybeSingle();
    if (profileError) throw new Error("Failed to load profile");
    if (!hasMembership && !profile?.profile_completed_at) redirect(`/onboarding?next=${encodeURIComponent(`/recruitment/${campaignId}`)}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <Link className="text-sm text-zinc-600 underline" href="/">Track</Link>
      <header><p className="text-sm font-semibold text-blue-700">{campaign.organization_name}</p><h1 className="mt-2 text-3xl font-bold">{campaign.title}</h1><p className="mt-2 text-zinc-600">{campaign.organization_university} · آخر موعد {new Date(`${campaign.closes_on}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC" })}</p></header>
      <p className="whitespace-pre-wrap leading-7 text-zinc-700">{campaign.description}</p>
      {query.error === "apply-failed" && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">تعذر إرسال الطلب. ربما أصبحت عضوًا بالفعل أو أغلقت الحملة.</p>}
      {hasMembership ? <p className="rounded-lg bg-blue-50 p-4 font-semibold text-blue-800">أنت عضو بالفعل في هذه المنظمة، لذلك لا تحتاج إلى التقديم.</p> : applicationStatus ? <p className="rounded-lg bg-green-50 p-4 font-semibold text-green-800">{statusLabels[applicationStatus] ?? "تم استلام طلبك"}</p> : auth?.claims?.sub ? <form action={submitRecruitmentApplication.bind(null, campaignId)}><button className="min-h-11 w-full rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">التقديم باستخدام ملفي الشخصي</button></form> : <Link className="block min-h-11 rounded-lg bg-blue-700 px-4 py-3 text-center font-semibold text-white" href={`/auth?next=${encodeURIComponent(`/recruitment/${campaignId}`)}`}>سجّل دخولك للتقديم</Link>}
    </main>
  );
}
