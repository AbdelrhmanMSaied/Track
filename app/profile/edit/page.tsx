import { redirect } from "next/navigation";
import { PROFILE_TEXT_MAX_LENGTH } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "../actions";

export default async function EditProfilePage({ searchParams }: PageProps<"/profile/edit">) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || !userId) redirect("/auth");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, university, faculty, academic_year, city, bio, profile_completed_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error("Failed to load profile");
  if (!profile?.profile_completed_at) redirect("/onboarding");

  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <div><p className="text-sm font-semibold text-blue-700">Track</p><h1 className="mt-2 text-3xl font-bold">تعديل الملف الشخصي</h1><p className="mt-2 text-zinc-600">حدّث بياناتك الأساسية.</p></div>
      {params.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">راجع البيانات وحاول مرة أخرى.</p>}
      {params.success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">تم حفظ التعديلات.</p>}
      <form action={updateProfile} className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium">الاسم الكامل<input name="full_name" defaultValue={profile.full_name} minLength={2} maxLength={120} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">الجامعة<input name="university" defaultValue={profile.university} minLength={2} maxLength={PROFILE_TEXT_MAX_LENGTH} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">الكلية<input name="faculty" defaultValue={profile.faculty} minLength={2} maxLength={PROFILE_TEXT_MAX_LENGTH} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">السنة الدراسية<select name="academic_year" defaultValue={profile.academic_year} required className="rounded-lg border border-zinc-300 bg-white px-3 py-2"><option value="">اختر</option><option value="first">الأولى</option><option value="second">الثانية</option><option value="third">الثالثة</option><option value="fourth">الرابعة</option><option value="fifth">الخامسة</option><option value="graduate">خريج</option></select></label>
        <label className="grid gap-1 text-sm font-medium">المدينة<input name="city" defaultValue={profile.city} minLength={2} maxLength={PROFILE_TEXT_MAX_LENGTH} required className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="grid gap-1 text-sm font-medium">نبذة قصيرة <span className="font-normal text-zinc-500">(اختياري)</span><textarea name="bio" defaultValue={profile.bio ?? ""} maxLength={500} rows={4} className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <button className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white">حفظ التعديلات</button>
      </form>
    </main>
  );
}
