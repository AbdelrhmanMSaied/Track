import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assignMemberAssignment, clearMemberAssignment, createDepartment, createOrganizationInvite, createRecruitmentCampaign, createSeason, revokeOrganizationInvite } from "./actions";

const errors: Record<string, string> = {
  "invalid-season": "راجع اسم وتواريخ الموسم.",
  "create-season-failed": "تعذر إنشاء الموسم. تأكد من صلاحياتك وحاول مجددًا.",
  "invalid-department": "راجع بيانات القسم.",
  "create-department-failed": "تعذر إنشاء القسم. قد يكون الاسم مستخدمًا في هذا الموسم.",
  "create-invite-failed": "تعذر إنشاء رابط الدعوة. تأكد من صلاحياتك وحاول مجددًا.",
  "revoke-invite-failed": "تعذر إلغاء رابط الدعوة.",
  "invalid-assignment": "راجع القسم والمسمى وتاريخ التعيين.",
  "assign-member-failed": "تعذر حفظ تعيين العضو. تأكد من الموسم النشط وتاريخ التغيير.",
  "clear-member-failed": "تعذر إنهاء تعيين العضو. تحقق من تاريخ الانتهاء.",
  "invalid-recruitment-campaign": "راجع عنوان الحملة ووصفها وموعد الإغلاق.",
  "create-recruitment-campaign-failed": "تعذر إنشاء الحملة. تحتاج موسمًا نشطًا وصلاحية مالك.",
};

const roleLabels: Record<string, string> = { owner: "المالك", board: "مجلس الإدارة", head: "رئيس قسم", member: "عضو" };

function dayAfter(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC" });
}

export default async function OrganizationPage({ params, searchParams }: PageProps<"/organizations/[organizationId]">) {
  const { organizationId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");
  const userId = String(auth.claims.sub);

  const [organizationResult, membershipResult, seasonsResult] = await Promise.all([
    supabase.from("organizations").select("id, name, description, university").eq("id", organizationId).maybeSingle(),
    supabase.from("memberships").select("role, status").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    supabase.from("seasons").select("id, name, starts_on, ends_on, status").eq("organization_id", organizationId).order("starts_on", { ascending: false }),
  ]);
  if (organizationResult.error || membershipResult.error || seasonsResult.error) throw new Error("Failed to load organization workspace");
  const organization = organizationResult.data;
  const membership = membershipResult.data;
  const seasons = seasonsResult.data;
  if (!organization || !membership || membership.status !== "active") notFound();

  const activeSeason = seasons?.find(({ status }) => status === "active");
  const archivedSeasons = seasons?.filter(({ status }) => status === "archived") ?? [];
  const departmentsResult = activeSeason
    ? await supabase.from("departments").select("id, name, description").eq("organization_id", organizationId).eq("season_id", activeSeason.id).order("name")
    : { data: [], error: null };
  if (departmentsResult.error) throw new Error("Failed to load departments");
  const departments = departmentsResult.data;
  const isOwner = membership.role === "owner";
  const [directoryResult, historyResult, invitesResult, campaignsResult] = await Promise.all([
    supabase.rpc("list_member_directory_details", { p_organization_id: organizationId }),
    supabase.rpc("list_member_assignment_history", { p_organization_id: organizationId }),
    isOwner
      ? supabase.from("organization_invites").select("id, expires_at, accepted_at, revoked_at").eq("organization_id", organizationId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    isOwner
      ? supabase.rpc("list_recruitment_campaigns", { p_organization_id: organizationId })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (directoryResult.error || historyResult.error || invitesResult.error || campaignsResult.error) throw new Error("Failed to load organization members");
  const directory = directoryResult.data as Array<{ user_id: string; display_name: string; role: string; joined_at: string; assignment_id: string | null; department_id: string | null; department_name: string | null; position: string | null; assignment_starts_on: string | null; assignment_ends_on: string | null }> | null;
  const history = historyResult.data as Array<{ user_id: string; membership_id: string; season_id: string; season_name: string; department_id: string; department_name: string; position: string; starts_on: string; ends_on: string | null }> | null;
  const historyByMember = new Map<string, NonNullable<typeof history>>();
  for (const entry of history ?? []) historyByMember.set(entry.user_id, [...(historyByMember.get(entry.user_id) ?? []), entry]);
  const invites = invitesResult.data;
  const campaigns = campaignsResult.data as Array<{ campaign_id: string; title: string; closes_on: string; status: string; applicant_count: number }> | null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <Link className="text-sm text-zinc-600 underline" href="/dashboard">كل المنظمات</Link>
      <header><p className="text-sm font-semibold text-blue-700">{roleLabels[membership.role] ?? membership.role}</p><h1 className="mt-2 text-3xl font-bold">{organization.name}</h1><p className="mt-2 text-zinc-600">{organization.university}</p>{organization.description && <p className="mt-4 max-w-2xl leading-7 text-zinc-700">{organization.description}</p>}</header>
      <div className="flex flex-wrap gap-3"><Link className="min-h-11 self-start rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-blue-700" href={`/organizations/${organizationId}/tasks`}>المهام</Link><Link className="min-h-11 self-start rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-blue-700" href={`/organizations/${organizationId}/meetings`}>الاجتماعات</Link><Link className="min-h-11 self-start rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-blue-700" href={`/organizations/${organizationId}/events`}>الفعاليات</Link>{isOwner && <Link className="min-h-11 self-start rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-blue-700" href={`/organizations/${organizationId}/verifications`}>طلبات التوثيق</Link>}</div>
      {query.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[String(query.error)] ?? "حدث خطأ. حاول مجددًا."}</p>}

      <section className="grid gap-4 rounded-xl border border-zinc-200 p-6">
        <div><h2 className="text-xl font-semibold">الموسم الحالي</h2>{activeSeason ? <p className="mt-2 text-zinc-600">{activeSeason.name} · {activeSeason.starts_on} — {activeSeason.ends_on}</p> : <p className="mt-2 text-zinc-600">لا يوجد موسم نشط بعد.</p>}</div>
        {isOwner && <form action={createSeason.bind(null, organizationId)} className="grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium">اسم الموسم<input name="name" minLength={2} maxLength={120} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium">يبدأ في<input type="date" name="starts_on" required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium">ينتهي في<input type="date" name="ends_on" required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white sm:col-span-3">تفعيل موسم جديد</button>
        </form>}
      </section>

      {isOwner && <section className="grid gap-4 rounded-xl border border-zinc-200 p-6">
        <div><h2 className="text-xl font-semibold">التوظيف</h2><p className="mt-1 text-sm text-zinc-600">أنشئ رابطًا عامًا؛ الطلب يستخدم الملف الشخصي الموجود بالفعل.</p></div>
        {activeSeason ? <form action={createRecruitmentCampaign.bind(null, organizationId)} className="grid gap-3 border-t border-zinc-200 pt-4">
          <label className="grid gap-1 text-sm font-medium">عنوان الحملة<input name="title" minLength={2} maxLength={160} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium">وصف الحملة<textarea name="description" minLength={20} maxLength={3000} rows={4} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium">آخر موعد للتقديم<input type="date" name="closes_on" min={new Date().toISOString().slice(0, 10)} max={activeSeason.ends_on} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">إنشاء حملة توظيف</button>
        </form> : <p className="text-sm text-zinc-600">فعّل موسمًا أولًا لإنشاء حملة توظيف.</p>}
        {campaigns?.length ? <div className="grid gap-3">{campaigns.map((campaign) => {
          const expired = campaign.status === "open" && campaign.closes_on < new Date().toISOString().slice(0, 10);
          return <Link key={campaign.campaign_id} href={`/organizations/${organizationId}/recruitment/${campaign.campaign_id}`} className="rounded-lg bg-zinc-50 p-4 hover:bg-zinc-100"><p className="font-semibold">{campaign.title}</p><p className="mt-1 text-sm text-zinc-600">{expired ? "منتهية" : campaign.status === "open" ? "مفتوحة" : "مغلقة"} · تنتهي {formatDate(campaign.closes_on)} · {campaign.applicant_count} متقدم</p></Link>;
        })}</div> : <p className="text-sm text-zinc-600">لا توجد حملات توظيف بعد.</p>}
      </section>}

      <section className="grid gap-3"><h2 className="text-xl font-semibold">المواسم المؤرشفة</h2>{archivedSeasons.length ? archivedSeasons.map((season) => <div key={season.id} className="rounded-xl border border-zinc-200 p-4"><p className="font-semibold">{season.name}</p><p className="mt-1 text-sm text-zinc-600">{season.starts_on} — {season.ends_on}</p></div>) : <p className="text-sm text-zinc-600">لا توجد مواسم مؤرشفة.</p>}</section>

      <section className="grid gap-4 rounded-xl border border-zinc-200 p-6">
        <div><h2 className="text-xl font-semibold">أقسام الموسم الحالي</h2><p className="mt-1 text-sm text-zinc-600">{activeSeason?.name ?? "فعّل موسمًا أولًا لإضافة الأقسام."}</p></div>
        {departments?.length ? departments.map((department) => <div key={department.id} className="rounded-lg bg-zinc-50 p-4"><p className="font-semibold">{department.name}</p>{department.description && <p className="mt-1 text-sm text-zinc-600">{department.description}</p>}</div>) : activeSeason && <p className="text-sm text-zinc-600">لا توجد أقسام في هذا الموسم.</p>}
        {isOwner && activeSeason && <form action={createDepartment.bind(null, organizationId)} className="grid gap-3 border-t border-zinc-200 pt-4">
          <input type="hidden" name="season_id" value={activeSeason.id} />
          <label className="grid gap-1 text-sm font-medium">اسم القسم<input name="name" minLength={2} maxLength={120} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium">وصف مختصر<textarea name="description" maxLength={500} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">إضافة القسم</button>
        </form>}
      </section>

      <section className="grid gap-4 rounded-xl border border-zinc-200 p-6">
        <div><h2 className="text-xl font-semibold">الأعضاء</h2><p className="mt-1 text-sm text-zinc-600">الأعضاء النشطون في المنظمة.</p></div>
        {directory?.length ? directory.map((member) => {
          const memberHistory = historyByMember.get(member.user_id) ?? [];
          const today = new Date().toISOString().slice(0, 10);
          const upcomingAssignment = memberHistory
            .filter((entry) => entry.season_id === activeSeason?.id && entry.starts_on > today)
            .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0];
          const reassignMin = member.assignment_starts_on && activeSeason
            ? (dayAfter(member.assignment_starts_on) > activeSeason.starts_on ? dayAfter(member.assignment_starts_on) : activeSeason.starts_on)
            : activeSeason?.starts_on;
          const canReassign = !activeSeason || !reassignMin || reassignMin <= activeSeason.ends_on;
          return <div key={member.user_id} className="grid gap-3 rounded-lg bg-zinc-50 p-4">
            <div>
              <p className="font-semibold">{member.display_name}</p>
              <p className="mt-1 text-sm text-zinc-600">{roleLabels[member.role] ?? member.role} · انضم في {new Date(member.joined_at).toLocaleDateString("ar-EG")}</p>
              <p className="mt-1 text-sm text-zinc-600">{member.position && member.department_name && member.assignment_starts_on ? `${member.position} · ${member.department_name} · منذ ${formatDate(member.assignment_starts_on)}` : "غير مكلّف حاليًا في الموسم"}</p>
              {upcomingAssignment && <p className="mt-1 text-sm font-medium text-blue-700">التعيين القادم: {upcomingAssignment.position} · {upcomingAssignment.department_name} · يبدأ {formatDate(upcomingAssignment.starts_on)}</p>}
            </div>
            {(isOwner || member.user_id === userId) && <details className="border-t border-zinc-200 pt-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue-700">سجل التعيينات ({memberHistory.length})</summary>
              {memberHistory.length ? <ul className="mt-3 grid gap-2 text-sm text-zinc-700">{memberHistory.map((entry) => {
                const isUpcoming = entry.starts_on > today;
                return <li key={`${entry.membership_id}-${entry.starts_on}`} className="rounded-lg border border-zinc-200 bg-white p-3">{entry.position} · {entry.department_name} · {entry.season_name}<span className="mt-1 block text-zinc-600">{formatDate(entry.starts_on)} — {entry.ends_on ? formatDate(entry.ends_on) : isUpcoming ? "قادم" : "مستمر"}</span></li>;
              })}</ul> : <p className="mt-3 text-sm text-zinc-600">لا يوجد سجل تعيينات بعد.</p>}
            </details>}
            {isOwner && activeSeason && upcomingAssignment && <p className="border-t border-zinc-200 pt-3 text-sm text-zinc-600">يوجد تعيين قادم بالفعل. إنهاءه أو تعديله سيكون ضمن إدارة الجدولة لاحقًا.</p>}
            {isOwner && activeSeason && !upcomingAssignment && <details className="border-t border-zinc-200 pt-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-blue-700">{member.assignment_id ? "نقل أو تغيير التعيين" : "تعيين عضو"}</summary>
              {canReassign ? <form action={assignMemberAssignment.bind(null, organizationId)} className="mt-3 grid gap-3"><input type="hidden" name="user_id" value={member.user_id} /><label className="grid gap-1 text-sm font-medium">القسم<select name="department_id" defaultValue={member.department_id ?? ""} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2"><option value="" disabled>اختر القسم</option>{departments?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">المسمى<input name="position" defaultValue={member.position ?? ""} minLength={2} maxLength={120} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">تاريخ سريان التعيين<input type="date" name="starts_on" min={reassignMin} max={activeSeason.ends_on} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حفظ التعيين</button></form> : <p className="mt-3 text-sm text-zinc-600">لا يمكن تغيير هذا التعيين داخل تاريخ الموسم المتبقي.</p>}
              {member.assignment_id && <details className="mt-3 border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-red-700">إنهاء التعيين</summary><form action={clearMemberAssignment.bind(null, organizationId)} className="mt-3 grid gap-3"><input type="hidden" name="user_id" value={member.user_id} /><label className="grid gap-1 text-sm font-medium">تاريخ إنهاء التعيين<input type="date" name="ends_on" min={member.assignment_starts_on ?? activeSeason.starts_on} max={member.assignment_ends_on ?? activeSeason.ends_on} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><button className="min-h-11 justify-self-start text-sm font-semibold text-red-700 underline">تأكيد إنهاء التعيين</button></form></details>}
            </details>}
          </div>;
        }) : <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">لا يوجد أعضاء نشطون في المنظمة بعد.</p>}
      </section>

      {isOwner && <section className="grid gap-4 rounded-xl border border-zinc-200 p-6">
        <div><h2 className="text-xl font-semibold">دعوات الأعضاء</h2><p className="mt-1 text-sm text-zinc-600">كل رابط صالح لمدة 72 ساعة ويُستخدم مرة واحدة.</p></div>
        <form action={createOrganizationInvite.bind(null, organizationId)}><button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">إنشاء رابط دعوة</button></form>
        {invites?.length ? <div className="grid gap-3">{invites.map((invite) => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 p-4"><p className="text-sm text-zinc-600">ينتهي في {new Date(invite.expires_at).toLocaleString("ar-EG")}{invite.accepted_at ? " · مستخدم" : invite.revoked_at ? " · ملغي" : " · صالح"}</p>{!invite.accepted_at && !invite.revoked_at && <form action={revokeOrganizationInvite.bind(null, organizationId)}><input type="hidden" name="invite_id" value={invite.id} /><button className="text-sm font-semibold text-red-700 underline">إلغاء</button></form>}</div>)}</div> : <p className="text-sm text-zinc-600">لا توجد دعوات بعد.</p>}
      </section>}
    </main>
  );
}
