"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const priorities = new Set(["low", "medium", "high", "urgent"]);
const managerStatuses = new Set(["todo", "in_progress", "blocked", "done", "cancelled"]);
const memberStatuses = new Set(["todo", "in_progress", "blocked", "done"]);

function path(organizationId: string) {
  return `/organizations/${organizationId}/tasks`;
}

function nullableId(value: FormDataEntryValue | null) {
  const id = String(value ?? "");
  return id === "" ? null : uuidPattern.test(id) ? id : undefined;
}

function nullableDate(value: FormDataEntryValue | null) {
  const date = String(value ?? "");
  return date === "" ? null : datePattern.test(date) ? date : undefined;
}

function progress(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? ""));
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  return supabase;
}

export async function createTask(organizationId: string, formData: FormData) {
  const target = path(organizationId);
  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "");
  const dueOn = nullableDate(formData.get("due_on"));
  const departmentId = nullableId(formData.get("department_id"));
  const assigneeUserId = nullableId(formData.get("assignee_user_id"));
  if (!uuidPattern.test(organizationId) || title.length < 2 || title.length > 160 || description.length > 3000 || !priorities.has(priority) || dueOn === undefined || departmentId === undefined || assigneeUserId === undefined) {
    redirect(`${target}?error=invalid-task`);
  }
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("create_task", {
    p_organization_id: organizationId,
    p_title: title,
    p_description: description || null,
    p_priority: priority,
    p_due_on: dueOn,
    p_department_id: departmentId,
    p_assignee_user_id: assigneeUserId,
  });
  if (error) redirect(`${target}?error=create-failed`);
  redirect(target);
}

export async function updateTask(organizationId: string, formData: FormData) {
  const target = path(organizationId);
  const taskId = String(formData.get("task_id") ?? "");
  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "");
  const dueOn = nullableDate(formData.get("due_on"));
  const departmentId = nullableId(formData.get("department_id"));
  const assigneeUserId = nullableId(formData.get("assignee_user_id"));
  const status = String(formData.get("status") ?? "");
  const taskProgress = progress(formData.get("progress"));
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(taskId) || title.length < 2 || title.length > 160 || description.length > 3000 || !priorities.has(priority) || !managerStatuses.has(status) || dueOn === undefined || departmentId === undefined || assigneeUserId === undefined || taskProgress === undefined) {
    redirect(`${target}?error=invalid-task`);
  }
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("update_task", {
    p_organization_id: organizationId,
    p_task_id: taskId,
    p_title: title,
    p_description: description || null,
    p_priority: priority,
    p_due_on: dueOn,
    p_department_id: departmentId,
    p_assignee_user_id: assigneeUserId,
    p_status: status,
    p_progress: taskProgress,
  });
  if (error) redirect(`${target}?error=update-failed`);
  redirect(target);
}

export async function updateMyTaskProgress(organizationId: string, formData: FormData) {
  const target = path(organizationId);
  const taskId = String(formData.get("task_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const taskProgress = progress(formData.get("progress"));
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(taskId) || !memberStatuses.has(status) || taskProgress === undefined) {
    redirect(`${target}?error=invalid-progress`);
  }
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("update_my_task_progress", {
    p_organization_id: organizationId,
    p_task_id: taskId,
    p_status: status,
    p_progress: taskProgress,
  });
  if (error) redirect(`${target}?error=progress-failed`);
  redirect(target);
}
