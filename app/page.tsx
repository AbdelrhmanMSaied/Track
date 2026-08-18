import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <p className="text-sm font-semibold text-blue-700">Track</p>
      <h1 className="max-w-xl text-4xl font-bold leading-tight">هويتك المهنية، وفرصك، وأنشطتك في مكان واحد.</h1>
      <p className="max-w-xl text-lg text-zinc-600">نبني الآن أساس الحساب العالمي الآمن قبل توسيع المنصة.</p>
      <Link className="w-fit rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white" href="/auth">ابدأ الآن</Link>
    </main>
  );
}
