"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const meetingTypes = new Set(["board", "department", "committee", "project", "emergency"]);
const priorities = new Set(["low", "medium", "high", "urgent"]);
const attendanceStatuses = new Set(["present", "absent", "excused"]);
const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function path(organizationId: string) { return `/organizations/${organizationId}/meetings`; }
function text(formData: FormData, name: string, max: number) { const value = String(formData.get(name) ?? "").trim(); return value.length <= max ? value : undefined; }
function optionalUrl(formData: FormData) { const value = String(formData.get("reference_url") ?? "").trim(); return value === "" || (value.length <= 2048 && /^https:\/\//.test(value)) ? value : undefined; }
function optionalId(formData: FormData, name: string) { const value = String(formData.get(name) ?? ""); return value === "" ? null : uuidPattern.test(value) ? value : undefined; }

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  return supabase;
}

export async function createMeeting(organizationId: string, formData: FormData) {
  const target = path(organizationId);
  const meetingType = String(formData.get("meeting_type") ?? "");
  const title = text(formData, "title", 160);
  const startsAt = String(formData.get("starts_at") ?? "");
  const location = text(formData, "location", 300);
  const agenda = text(formData, "agenda", 3000);
  const referenceUrl = optionalUrl(formData);
  if (!uuidPattern.test(organizationId) || !meetingTypes.has(meetingType) || !title || title.length < 2 || !localDateTimePattern.test(startsAt) || location === undefined || agenda === undefined || referenceUrl === undefined) redirect(`${target}?error=invalid-meeting`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("create_meeting", { p_organization_id: organizationId, p_meeting_type: meetingType, p_title: title, p_starts_at: startsAt, p_location: location || null, p_agenda: agenda || null, p_reference_url: referenceUrl || null });
  if (error) redirect(`${target}?error=create-failed`);
  redirect(`${target}?success=created`);
}

export async function updateScheduledMeeting(organizationId: string, formData: FormData) {
  const target = path(organizationId);
  const meetingId = String(formData.get("meeting_id") ?? "");
  const meetingType = String(formData.get("meeting_type") ?? "");
  const title = text(formData, "title", 160);
  const startsAt = String(formData.get("starts_at") ?? "");
  const location = text(formData, "location", 300);
  const agenda = text(formData, "agenda", 3000);
  const minutes = text(formData, "minutes", 6000);
  const decisions = text(formData, "decisions", 6000);
  const referenceUrl = optionalUrl(formData);
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(meetingId) || !meetingTypes.has(meetingType) || !title || title.length < 2 || !localDateTimePattern.test(startsAt) || location === undefined || agenda === undefined || minutes === undefined || decisions === undefined || referenceUrl === undefined) redirect(`${target}?error=invalid-meeting`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("update_scheduled_meeting", { p_organization_id: organizationId, p_meeting_id: meetingId, p_meeting_type: meetingType, p_title: title, p_starts_at: startsAt, p_location: location || null, p_agenda: agenda || null, p_minutes: minutes || null, p_decisions: decisions || null, p_reference_url: referenceUrl || null });
  if (error) redirect(`${target}?error=update-failed`);
  redirect(`${target}?success=updated`);
}

export async function completeMeeting(organizationId: string, formData: FormData) {
  const target = path(organizationId);
  const meetingId = String(formData.get("meeting_id") ?? "");
  const membershipIds = formData.getAll("membership_id").map(String);
  const statuses = formData.getAll("attendance_status").map(String);
  const minutes = text(formData, "minutes", 6000);
  const decisions = text(formData, "decisions", 6000);
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(meetingId) || !membershipIds.length || membershipIds.length !== statuses.length || membershipIds.some((id) => !uuidPattern.test(id)) || statuses.some((status) => !attendanceStatuses.has(status)) || minutes === undefined || decisions === undefined) redirect(`${target}?error=invalid-attendance`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("complete_meeting", { p_organization_id: organizationId, p_meeting_id: meetingId, p_membership_ids: membershipIds, p_statuses: statuses, p_minutes: minutes || null, p_decisions: decisions || null });
  if (error) redirect(`${target}?error=complete-failed`);
  redirect(`${target}?success=completed`);
}

export async function cancelMeeting(organizationId: string, formData: FormData) {
  const target = path(organizationId);
  const meetingId = String(formData.get("meeting_id") ?? "");
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(meetingId)) redirect(`${target}?error=cancel-failed`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("cancel_meeting", { p_organization_id: organizationId, p_meeting_id: meetingId });
  if (error) redirect(`${target}?error=cancel-failed`);
  redirect(`${target}?success=cancelled`);
}

export async function createMeetingTask(organizationId: string, formData: FormData) {
  const target = path(organizationId);
  const meetingId = String(formData.get("meeting_id") ?? "");
  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim();
  const description = text(formData, "description", 3000);
  const priority = String(formData.get("priority") ?? "");
  const dueOn = String(formData.get("due_on") ?? "");
  const assigneeUserId = optionalId(formData, "assignee_user_id");
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(meetingId) || title.length < 2 || title.length > 160 || description === undefined || !priorities.has(priority) || (dueOn !== "" && !datePattern.test(dueOn)) || assigneeUserId === undefined) redirect(`${target}?error=invalid-task`);
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("create_meeting_task", { p_organization_id: organizationId, p_meeting_id: meetingId, p_title: title, p_description: description || null, p_priority: priority, p_due_on: dueOn || null, p_assignee_user_id: assigneeUserId });
  if (error) redirect(`${target}?error=task-failed`);
  redirect(`${target}?success=task-created`);
}
