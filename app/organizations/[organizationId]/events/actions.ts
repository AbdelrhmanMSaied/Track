"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function listPath(organizationId: string) { return `/organizations/${organizationId}/events`; }
function eventPath(organizationId: string, eventId: string) { return `${listPath(organizationId)}/${eventId}`; }
function field(formData: FormData, name: string, max: number) { const value = String(formData.get(name) ?? "").trim(); return value.length <= max ? value : undefined; }
function capacity(formData: FormData) { const value = String(formData.get("capacity") ?? ""); if (value === "") return null; return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 100000 ? Number(value) : undefined; }

async function client() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  return supabase;
}

function eventFields(formData: FormData) {
  const title = field(formData, "title", 160);
  const objective = field(formData, "objective", 3000);
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const venue = field(formData, "venue", 300);
  const eventCapacity = capacity(formData);
  return { title, objective, startsAt, endsAt, venue, eventCapacity };
}

export async function createEvent(organizationId: string, formData: FormData) {
  const target = listPath(organizationId); const { title, objective, startsAt, endsAt, venue, eventCapacity } = eventFields(formData);
  if (!uuid.test(organizationId) || !title || title.length < 2 || !objective || objective.length < 2 || !localDateTime.test(startsAt) || !localDateTime.test(endsAt) || endsAt <= startsAt || venue === undefined || eventCapacity === undefined) redirect(`${target}?error=invalid-event`);
  const supabase = await client();
  const { error } = await supabase.rpc("create_event", { p_organization_id: organizationId, p_title: title, p_objective: objective, p_starts_at: startsAt, p_ends_at: endsAt, p_venue: venue || null, p_capacity: eventCapacity });
  if (error) redirect(`${target}?error=create-failed`);
  redirect(`${target}?success=created`);
}

export async function updateDraftEvent(organizationId: string, formData: FormData) {
  const eventId = String(formData.get("event_id") ?? ""); const target = eventPath(organizationId, eventId); const { title, objective, startsAt, endsAt, venue, eventCapacity } = eventFields(formData);
  if (!uuid.test(organizationId) || !uuid.test(eventId) || !title || title.length < 2 || !objective || objective.length < 2 || !localDateTime.test(startsAt) || !localDateTime.test(endsAt) || endsAt <= startsAt || venue === undefined || eventCapacity === undefined) redirect(`${listPath(organizationId)}?error=invalid-event`);
  const supabase = await client();
  const { error } = await supabase.rpc("update_draft_event", { p_organization_id: organizationId, p_event_id: eventId, p_title: title, p_objective: objective, p_starts_at: startsAt, p_ends_at: endsAt, p_venue: venue || null, p_capacity: eventCapacity });
  if (error) redirect(`${target}?error=update-failed`);
  redirect(`${target}?success=updated`);
}

export async function publishEvent(organizationId: string, formData: FormData) {
  const eventId = String(formData.get("event_id") ?? ""); const target = eventPath(organizationId, eventId);
  if (!uuid.test(organizationId) || !uuid.test(eventId)) redirect(`${listPath(organizationId)}?error=publish-failed`);
  const { error } = await (await client()).rpc("publish_event", { p_organization_id: organizationId, p_event_id: eventId });
  if (error) redirect(`${target}?error=publish-failed`); redirect(`${target}?success=published`);
}

export async function cancelEvent(organizationId: string, formData: FormData) {
  const eventId = String(formData.get("event_id") ?? ""); const target = eventPath(organizationId, eventId);
  if (!uuid.test(organizationId) || !uuid.test(eventId)) redirect(`${listPath(organizationId)}?error=cancel-failed`);
  const { error } = await (await client()).rpc("cancel_event", { p_organization_id: organizationId, p_event_id: eventId });
  if (error) redirect(`${target}?error=cancel-failed`); redirect(`${target}?success=cancelled`);
}

export async function assignEventTeamMember(organizationId: string, formData: FormData) {
  const eventId = String(formData.get("event_id") ?? ""); const memberUserId = String(formData.get("member_user_id") ?? ""); const roleTitle = field(formData, "role_title", 120); const target = eventPath(organizationId, eventId);
  if (!uuid.test(organizationId) || !uuid.test(eventId) || !uuid.test(memberUserId) || !roleTitle || roleTitle.length < 2) redirect(`${target}?error=invalid-team`);
  const { error } = await (await client()).rpc("assign_event_team_member", { p_organization_id: organizationId, p_event_id: eventId, p_member_user_id: memberUserId, p_role_title: roleTitle });
  if (error) redirect(`${target}?error=team-failed`); redirect(`${target}?success=team-updated`);
}

export async function removeEventTeamMember(organizationId: string, formData: FormData) {
  const eventId = String(formData.get("event_id") ?? ""); const membershipId = String(formData.get("membership_id") ?? ""); const target = eventPath(organizationId, eventId);
  if (!uuid.test(organizationId) || !uuid.test(eventId) || !uuid.test(membershipId)) redirect(`${target}?error=team-failed`);
  const { error } = await (await client()).rpc("remove_event_team_member", { p_organization_id: organizationId, p_event_id: eventId, p_membership_id: membershipId });
  if (error) redirect(`${target}?error=team-failed`); redirect(`${target}?success=team-updated`);
}

export async function completeEvent(organizationId: string, formData: FormData) {
  const eventId = String(formData.get("event_id") ?? ""); const ids = formData.getAll("registration_id").map(String); const statuses = formData.getAll("attendance_status").map(String); const target = eventPath(organizationId, eventId);
  if (!uuid.test(organizationId) || !uuid.test(eventId) || ids.length !== statuses.length || ids.some((id) => !uuid.test(id)) || statuses.some((status) => !["attended", "absent"].includes(status))) redirect(`${target}?error=invalid-attendance`);
  const { error } = await (await client()).rpc("complete_event", { p_organization_id: organizationId, p_event_id: eventId, p_registration_ids: ids, p_attendance_statuses: statuses });
  if (error) redirect(`${target}?error=complete-failed`); redirect(`${target}?success=completed`);
}
