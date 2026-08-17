import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTask, updateMyTaskProgress, updateTask } from "./actions";

const errors: Record<string, string> = {
  "invalid-task": "راجع بيانات المهمة.",
  "create-failed": "تعذر إنشاء المهمة. تحتاج موسمًا نشطًا وصلاحية إدارة.",
  "update-failed": "تعذر حفظ التعديل. تأكد من صلاحياتك وبيانات المهمة.",
  "invalid-progress": "راجع الحالة ونسبة الإنجاز.",
  "progress-failed": "تعذر تحديث التقدم. هذه المهمة يجب أن تكون مكلّفة لك.",
};
const statusLabels: Record<string, string> = { todo: "جديدة", in_progress: "قيد التنفيذ", blocked: "متوقفة", done: "مكتملة", cancelled: "ملغاة" };
const priorityLabels: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };
const eventLabels: Record<string, string> = { created: "إنشاء", updated: "تعديل", status_changed: "تغيير حالة", assignee_changed: "تغيير مكلّف" };
const fieldLabels: Record<string, string> = { title: "العنوان", description: "الوصف", priority: "الأولوية", due_on: "الموعد", department: "القسم", assignee: "المكلّف", status: "الحالة", progress: "التقدم" };
const statuses = new Set(Object.keys(statusLabels));

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("ar-EG", { timeZone: "UTC" });
}

type Task = {
  task_id: string; season_id: string; department_id: string | null; department_name: string | null;
  title: string; description: string | null; priority: string; status: string; progress: number; due_on: string | null;
  assignee_user_id: string | null; assignee_name: string | null; assignee_membership_id: string | null;
  creator_name: string; completed_at: string | null; created_at: string; updated_at: string;
};
type History = {
  event_type: string; actor_name: string; from_status: string | null; to_status: string | null;
  from_assignee_name: string | null; to_assignee_name: string | null; changed_fields: string[]; created_at: string;
};

export default async function TasksPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organizationId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/auth");
  const userId = String(auth.claims.sub);
  const requestedStatus = typeof query.status === "string" && statuses.has(query.status) ? query.status : null;
  const mine = query.mine === "1";

  const [organizationResult, membershipResult, seasonsResult, departmentsResult, directoryResult, tasksResult] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("id", organizationId).maybeSingle(),
    supabase.from("memberships").select("role, status").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    supabase.from("seasons").select("id, name, status").eq("organization_id", organizationId).order("starts_on", { ascending: false }),
    supabase.from("departments").select("id, season_id, name").eq("organization_id", organizationId).order("name"),
    supabase.rpc("list_member_directory_details", { p_organization_id: organizationId }),
    supabase.rpc("list_tasks", { p_organization_id: organizationId, p_status: requestedStatus, p_assigned_to_me: mine }),
  ]);
  if (organizationResult.error || membershipResult.error || seasonsResult.error || departmentsResult.error || directoryResult.error || tasksResult.error) throw new Error("Failed to load tasks");
  if (!organizationResult.data || !membershipResult.data || membershipResult.data.status !== "active") notFound();

  const manager = ["owner", "board", "head"].includes(membershipResult.data.role);
  const activeSeason = seasonsResult.data?.find((season) => season.status === "active");
  const departments = departmentsResult.data ?? [];
  const activeDepartments = departments.filter((department) => department.season_id === activeSeason?.id);
  const members = (directoryResult.data as Array<{ user_id: string; display_name: string }> | null) ?? [];
  const tasks = (tasksResult.data as Task[] | null) ?? [];
  const visibleHistoryTasks = tasks.filter((task) => manager || task.assignee_user_id === userId);
  const historyResults = await Promise.all(visibleHistoryTasks.map(async (task) => ({ taskId: task.task_id, result: await supabase.rpc("list_task_history", { p_organization_id: organizationId, p_task_id: task.task_id }) })));
  if (historyResults.some(({ result }) => result.error)) throw new Error("Failed to load task history");
  const historyByTask = new Map(historyResults.map(({ taskId, result }) => [taskId, (result.data as History[] | null) ?? []]));

  const filterHref = (status?: string, onlyMine = mine) => {
    const values = new URLSearchParams();
    if (status) values.set("status", status);
    if (onlyMine) values.set("mine", "1");
    const string = values.toString();
    return `${`/organizations/${organizationId}/tasks`}${string ? `?${string}` : ""}`;
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <Link className="text-sm text-zinc-600 underline" href={`/organizations/${organizationId}`}>الرجوع للمنظمة</Link>
      <header><p className="text-sm font-semibold text-blue-700">Module 14</p><h1 className="mt-2 text-3xl font-bold">المهام</h1><p className="mt-2 text-zinc-600">{organizationResult.data.name}</p></header>
      {query.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[String(query.error)] ?? "حدث خطأ. حاول مجددًا."}</p>}

      {manager ? <nav className="flex flex-wrap gap-2 text-sm" aria-label="تصفية المهام">
        <Link aria-current={!requestedStatus && !mine ? "page" : undefined} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" href={filterHref(undefined, false)}>الكل</Link>
        <Link aria-current={!requestedStatus && mine ? "page" : undefined} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" href={filterHref(undefined, true)}>لي</Link>
        {["todo", "in_progress", "blocked", "done"].map((status) => <Link key={status} aria-current={requestedStatus === status ? "page" : undefined} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" href={filterHref(status)}>{statusLabels[status]}</Link>)}
      </nav> : <p className="text-sm text-zinc-600">تظهر لك المهام المكلّفة بك فقط.</p>}

      {manager && <section className="grid gap-4 rounded-xl border border-zinc-200 p-5">
        <div><h2 className="text-xl font-semibold">مهمة جديدة</h2><p className="mt-1 text-sm text-zinc-600">{activeSeason ? `ستُربط بموسم ${activeSeason.name}.` : "فعّل موسمًا أولًا لإنشاء مهمة."}</p></div>
        {activeSeason && <details><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">إنشاء مهمة</summary><form action={createTask.bind(null, organizationId)} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">العنوان<input name="title" minLength={2} maxLength={160} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <label className="grid gap-1 text-sm font-medium">الوصف (اختياري)<textarea name="description" maxLength={3000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">الأولوية<select name="priority" defaultValue="medium" className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">الموعد (اختياري)<input type="date" name="due_on" className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">القسم (اختياري)<select name="department_id" defaultValue="" className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2"><option value="">على مستوى المنظمة</option>{activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">المكلّف (اختياري)<select name="assignee_user_id" defaultValue="" className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2"><option value="">غير مكلّف</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}</select></label></div>
          <button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حفظ المهمة</button>
        </form></details>}
      </section>}

      <section className="grid gap-4"><h2 className="text-xl font-semibold">{!manager || mine ? "مهامي" : requestedStatus ? statusLabels[requestedStatus] : "كل المهام"}</h2>{tasks.length ? tasks.map((task) => {
        const taskDepartments = departments.filter((department) => department.season_id === task.season_id);
        const isAssignee = task.assignee_user_id === userId;
        const history = historyByTask.get(task.task_id) ?? [];
        return <article key={task.task_id} className="grid gap-4 rounded-xl border border-zinc-200 p-5">
          <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{task.title}</h3><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">{statusLabels[task.status]}</span><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">{priorityLabels[task.priority]}</span></div>{task.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{task.description}</p>}<p className="mt-3 text-sm text-zinc-600">{task.department_name ?? "على مستوى المنظمة"} · {task.assignee_name ?? "غير مكلّف"} · {task.due_on ? `موعد ${formatDate(task.due_on)}` : "بلا موعد"}</p><p className="mt-1 text-sm text-zinc-600">التقدم: {task.progress}%</p></div>
          {isAssignee && !manager && !["done", "cancelled"].includes(task.status) && <form action={updateMyTaskProgress.bind(null, organizationId)} className="grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-3"><input type="hidden" name="task_id" value={task.task_id} /><label className="grid gap-1 text-sm font-medium">الحالة<select name="status" defaultValue={task.status} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2">{["todo", "in_progress", "blocked", "done"].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">التقدم<input name="progress" type="number" min="0" max="100" defaultValue={task.progress} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><button className="min-h-11 self-end rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">تحديث تقدمي</button></form>}
          {manager && <details className="border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">تعديل المهمة</summary><form action={updateTask.bind(null, organizationId)} className="mt-4 grid gap-3"><input type="hidden" name="task_id" value={task.task_id} /><label className="grid gap-1 text-sm font-medium">العنوان<input name="title" defaultValue={task.title} minLength={2} maxLength={160} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">الوصف (اختياري)<textarea name="description" defaultValue={task.description ?? ""} maxLength={3000} rows={3} className="rounded-lg border border-zinc-300 px-3 py-2" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">الأولوية<select name="priority" defaultValue={task.priority} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">الموعد<input type="date" name="due_on" defaultValue={task.due_on ?? ""} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">القسم<select name="department_id" defaultValue={task.department_id ?? ""} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2"><option value="">على مستوى المنظمة</option>{taskDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">المكلّف<select name="assignee_user_id" defaultValue={task.assignee_user_id ?? ""} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2"><option value="">غير مكلّف</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}</select></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">الحالة<select name="status" defaultValue={task.status} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">التقدم<input name="progress" type="number" min="0" max="100" defaultValue={task.progress} required className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2" /></label></div><button className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">حفظ التعديل</button></form></details>}
          {(manager || isAssignee) && <details className="border-t border-zinc-200 pt-3"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-blue-700">سجل المهمة ({history.length})</summary>{history.length ? <ul className="mt-3 grid gap-2 text-sm">{history.map((entry, index) => <li key={`${entry.created_at}-${index}`} className="rounded-lg bg-zinc-50 p-3"><p className="font-medium">{eventLabels[entry.event_type] ?? entry.event_type} · {entry.actor_name}</p><p className="mt-1 text-zinc-600">{entry.changed_fields.map((field) => fieldLabels[field] ?? field).join("، ") || "بدون تغييرات"}</p><p className="mt-1 text-zinc-600">{new Date(entry.created_at).toLocaleString("ar-EG")}</p></li>)}</ul> : <p className="mt-3 text-sm text-zinc-600">لا يوجد سجل بعد.</p>}</details>}
        </article>;
      }) : <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-zinc-600">{mine ? "لا توجد مهام مكلّفة لك." : "لا توجد مهام بعد."}</p>}</section>
    </main>
  );
}
