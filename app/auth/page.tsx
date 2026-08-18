import { signIn, signInWithGoogle, signUp } from "./actions";
import { getSafeNextPath } from "@/lib/auth-next";

const messages: Record<string, string> = {
  "invalid-input": "اكتب بريدًا صحيحًا وكلمة مرور من 8 أحرف على الأقل.",
  "invalid-credentials": "البريد أو كلمة المرور غير صحيحة.",
  "signup-failed": "تعذر إنشاء الحساب.",
  "oauth-failed": "تعذر تسجيل الدخول عبر Google.",
  "callback-failed": "تعذر إكمال تسجيل الدخول.",
  "missing-origin": "إعداد رابط الموقع ناقص.",
};

export default async function AuthPage({ searchParams }: PageProps<"/auth">) {
  const params = await searchParams;
  const next = getSafeNextPath(typeof params.next === "string" ? params.next : null) ?? "";
  const error = typeof params.error === "string" ? messages[params.error] : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div><p className="text-sm font-semibold text-blue-700">Track</p><h1 className="mt-2 text-3xl font-bold">حسابك المهني يبدأ هنا</h1><p className="mt-2 text-zinc-600">حساب واحد لكل أنشطتك وفرصك.</p></div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {params.message === "check-email" && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">راجع بريدك لتأكيد الحساب.</p>}
      <form className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <label className="grid gap-1 text-sm font-medium">البريد الإلكتروني<input className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" name="email" type="email" autoComplete="email" required /></label>
        <label className="grid gap-1 text-sm font-medium">كلمة المرور<input className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" name="password" type="password" minLength={8} autoComplete="current-password" required /></label>
        <div className="grid grid-cols-2 gap-3"><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" formAction={signIn}>دخول</button><button className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 font-semibold" formAction={signUp}>حساب جديد</button></div>
      </form>
      <form action={signInWithGoogle}><input type="hidden" name="next" value={next} /><button className="min-h-11 w-full rounded-lg border border-zinc-300 px-4 py-2 font-semibold">المتابعة عبر Google</button></form>
    </main>
  );
}
