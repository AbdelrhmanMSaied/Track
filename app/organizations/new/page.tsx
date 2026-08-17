import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createOrganization } from "./actions";

export default async function NewOrganizationPage({ searchParams }: PageProps<"/organizations/new">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <div><p className="text-sm font-semibold text-blue-700">Module 11</p><h1 className="mt-2 text-3xl font-bold">أنشئ منظمتك</h1><p className="mt-2 text-zinc-600">ستصبح المالك الأول للـworkspace.</p></div>
      {params.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">راجع البيانات وحاول مرة أخرى.</p>}
      <form action={createOrganization} className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium">اسم المنظمة<input name="name" minLength={2} maxLength={160} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">الجامعة<input name="university" minLength={2} maxLength={160} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">وصف مختصر<textarea name="description" maxLength={1000} rows={5} className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <button className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white">إنشاء المنظمة</button>
      </form>
      <Link className="text-sm text-zinc-600 underline" href="/dashboard">الرجوع للوحة التحكم</Link>
    </main>
  );
}
