"use client";

export default function RecruitmentCampaignError({ reset }: { reset: () => void }) {
  return <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-6 py-12"><h1 className="text-2xl font-bold">تعذر تحميل الحملة</h1><p className="text-zinc-600">تحقق من اتصالك ثم حاول مرة أخرى.</p><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" onClick={reset}>إعادة المحاولة</button></main>;
}
