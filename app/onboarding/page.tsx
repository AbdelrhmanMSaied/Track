import { redirect } from "next/navigation";
import { PROFILE_TEXT_MAX_LENGTH } from "@/lib/profile";
import { getSafeNextPath } from "@/lib/auth-next";
import { createClient } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const params = await searchParams;
  const next = getSafeNextPath(typeof params.next === "string" ? params.next : null);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/auth");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("profile_completed_at").eq("id", userId).maybeSingle();
  if (profileError) throw new Error("Failed to load profile");
  if (profile?.profile_completed_at) redirect(next || "/dashboard");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <div><p className="text-sm font-semibold text-blue-700">خطوة واحدة</p><h1 className="mt-2 text-3xl font-bold">كمّل ملفك الأساسي</h1><p className="mt-2 text-zinc-600">هذه البيانات خاصة بك ويمكن تعديلها لاحقًا.</p></div>
      {params.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">راجع البيانات وحاول مرة أخرى.</p>}
      <form action={saveProfile} className="grid gap-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="grid gap-1 text-sm font-medium">الاسم الكامل<input name="full_name" minLength={2} maxLength={120} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">الجامعة<input name="university" minLength={2} maxLength={PROFILE_TEXT_MAX_LENGTH} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">الكلية<input name="faculty" minLength={2} maxLength={PROFILE_TEXT_MAX_LENGTH} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">السنة الدراسية<select name="academic_year" required className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2"><option value="">اختر</option><option value="first">الأولى</option><option value="second">الثانية</option><option value="third">الثالثة</option><option value="fourth">الرابعة</option><option value="fifth">الخامسة</option><option value="graduate">خريج</option></select></label>
        <label className="grid gap-1 text-sm font-medium">المدينة<input name="city" minLength={2} maxLength={PROFILE_TEXT_MAX_LENGTH} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">نبذة قصيرة <span className="font-normal text-zinc-500">(اختياري)</span><textarea name="bio" maxLength={500} rows={4} className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <button className="min-h-11 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white">حفظ والمتابعة</button>
      </form>
    </main>
  );
}
