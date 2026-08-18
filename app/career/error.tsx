"use client";

export default function CareerError({ reset }: { reset: () => void }) {
  return <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-6 py-12"><h1 className="text-2xl font-bold">تعذر تحميل جواز المسار</h1><button onClick={reset} className="min-h-11 self-start rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حاول مجددًا</button></main>;
}
