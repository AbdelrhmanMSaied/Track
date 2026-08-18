import Link from "next/link";
import { redirect } from "next/navigation";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { acceptOrganizationInvite } from "./actions";

const errors: Record<string, string> = {
  "invalid-invite": "رابط الدعوة غير صالح أو انتهت صلاحيته أو استُخدم بالفعل.",
};

export default async function InvitePage({ params, searchParams }: PageProps<"/invites/[token]">) {
  const { token } = await params;
  const query = await searchParams;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const invitePath = `/invites/${token}`;
  if (!auth?.claims?.sub) redirect(`/auth?next=${encodeURIComponent(invitePath)}`);

  if (query.share === "1") {
    const inviteUrl = `${getSiteUrl()}${invitePath}`;
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
        <div><p className="text-sm font-semibold text-blue-700">Track</p><h1 className="mt-2 text-3xl font-bold">رابط الدعوة جاهز</h1><p className="mt-2 text-zinc-600">انسخه الآن؛ لن نعرض التوكن داخل لوحة المنظمة.</p></div>
        <a className="break-all rounded-lg bg-green-50 p-4 text-sm text-green-800 underline" href={inviteUrl}>{inviteUrl}</a>
        <Link className="text-sm text-zinc-600 underline" href="/dashboard">الرجوع للوحة التحكم</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div><p className="text-sm font-semibold text-blue-700">Track</p><h1 className="mt-2 text-3xl font-bold">انضم إلى المنظمة</h1><p className="mt-2 text-zinc-600">استخدم رابط الدعوة للانضمام كعضو.</p></div>
      {typeof query.error === "string" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[query.error] ?? "حدث خطأ. حاول مجددًا."}</p>}
      <form action={acceptOrganizationInvite.bind(null, token)}><button className="w-full rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">قبول الدعوة</button></form>
    </main>
  );
}
