import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createDepartment, createOrganizationInvite, createSeason, revokeOrganizationInvite } from "./actions";

const errors: Record<string, string> = {
  "invalid-season": "راجع اسم وتواريخ الموسم.",
  "create-season-failed": "تعذر إنشاء الموسم. تأكد من صلاحياتك وحاول مجددًا.",
  "invalid-department": "راجع بيانات القسم.",
  "create-department-failed": "تعذر إنشاء القسم. قد يكون الاسم مستخدمًا في هذا الموسم.",
  "create-invite-failed": "تعذر إنشاء رابط الدعوة. تأكد من صلاحياتك وحاول مجددًا.",
  "revoke-invite-failed": "تعذر إلغاء رابط الدعوة.",
};

export default async function OrganizationPage({ params, searchParams }: PageProps<"/organizations/[organizationId]">) {
  const { organizationId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");

  const [organizationResult, membershipResult, seasonsResult] = await Promise.all([
    supabase.from("organizations").select("id, name, description, university").eq("id", organizationId).maybeSingle(),
    supabase.from("memberships").select("role, status").eq("organization_id", organizationId).eq("user_id", auth.claims.sub).maybeSingle(),
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
  const [directoryResult, invitesResult] = await Promise.all([
    supabase.rpc("list_member_directory", { p_organization_id: organizationId }),
    isOwner
      ? supabase.from("organization_invites").select("id, expires_at, accepted_at, revoked_at").eq("organization_id", organizationId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (directoryResult.error || invitesResult.error) throw new Error("Failed to load organization members");
  const directory = directoryResult.data as Array<{ user_id: string; display_name: string; role: string; joined_at: string }> | null;
  const invites = invitesResult.data;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <Link className="text-sm text-zinc-600 underline" href="/dashboard">كل المنظمات</Link>
      <header><p className="text-sm font-semibold text-blue-700">{membership.role}</p><h1 className="mt-2 text-3xl font-bold">{organization.name}</h1><p className="mt-2 text-zinc-600">{organization.university}</p>{organization.description && <p className="mt-4 max-w-2xl leading-7 text-zinc-700">{organization.description}</p>}</header>
      {query.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[String(query.error)] ?? "حدث خطأ. حاول مجددًا."}</p>}

      <section className="grid gap-4 rounded-xl border border-zinc-200 p-6">
        <div><h2 className="text-xl font-semibold">الموسم الحالي</h2>{activeSeason ? <p className="mt-2 text-zinc-600">{activeSeason.name} · {activeSeason.starts_on} — {activeSeason.ends_on}</p> : <p className="mt-2 text-zinc-600">لا يوجد موسم نشط بعد.</p>}</div>
        {isOwner && <form action={createSeason.bind(null, organizationId)} className="grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium">اسم الموسم<input name="name" minLength={2} maxLength={120} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium">يبدأ في<input type="date" name="starts_on" required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium">ينتهي في<input type="date" name="ends_on" required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white sm:col-span-3">تفعيل موسم جديد</button>
        </form>}
      </section>

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
        {directory?.map((member) => <div key={member.user_id} className="rounded-lg bg-zinc-50 p-4"><p className="font-semibold">{member.display_name}</p><p className="mt-1 text-sm text-zinc-600">{member.role} · انضم في {new Date(member.joined_at).toLocaleDateString("ar-EG")}</p></div>)}
      </section>

      {isOwner && <section className="grid gap-4 rounded-xl border border-zinc-200 p-6">
        <div><h2 className="text-xl font-semibold">دعوات الأعضاء</h2><p className="mt-1 text-sm text-zinc-600">كل رابط صالح لمدة 72 ساعة ويُستخدم مرة واحدة.</p></div>
        <form action={createOrganizationInvite.bind(null, organizationId)}><button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">إنشاء رابط دعوة</button></form>
        {invites?.length ? <div className="grid gap-3">{invites.map((invite) => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 p-4"><p className="text-sm text-zinc-600">ينتهي في {new Date(invite.expires_at).toLocaleString("ar-EG")}{invite.accepted_at ? " · مستخدم" : invite.revoked_at ? " · ملغي" : " · صالح"}</p>{!invite.accepted_at && !invite.revoked_at && <form action={revokeOrganizationInvite.bind(null, organizationId)}><input type="hidden" name="invite_id" value={invite.id} /><button className="text-sm font-semibold text-red-700 underline">إلغاء</button></form>}</div>)}</div> : <p className="text-sm text-zinc-600">لا توجد دعوات بعد.</p>}
      </section>}
    </main>
  );
}
