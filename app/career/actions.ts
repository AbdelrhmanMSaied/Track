"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const experienceTypes = new Set(["student_activity", "volunteering", "event_role", "internship", "job", "freelance", "project", "training", "course", "bootcamp", "competition", "award", "leadership", "certificate", "workshop", "conference"]);

function text(value: FormDataEntryValue | null, max: number) {
  const normalized = String(value ?? "").trim();
  return normalized.length <= max ? normalized : null;
}

function date(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "");
  return normalized === "" || datePattern.test(normalized) ? normalized || null : undefined;
}

function validUrl(value: string) {
  return value === "" || /^https:\/\/\S+$/.test(value);
}

async function client() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/auth");
  return supabase;
}

function values(formData: FormData) {
  const role = text(formData.get("role_title"), 160);
  const organizationName = text(formData.get("organization_name"), 160);
  const experienceType = String(formData.get("experience_type") ?? "");
  const responsibilities = text(formData.get("responsibilities"), 3000);
  const startsOn = date(formData.get("starts_on"));
  const endsOn = date(formData.get("ends_on"));
  const evidenceUrl = text(formData.get("evidence_url"), 2048);
  if (!role || role.length < 2 || !organizationName || organizationName.length < 2 || !experienceTypes.has(experienceType) || responsibilities === null || startsOn === undefined || !startsOn || endsOn === undefined || (endsOn && endsOn < startsOn) || evidenceUrl === null || !validUrl(evidenceUrl)) return null;
  return { role, organizationName, experienceType, responsibilities: responsibilities || null, startsOn, endsOn, evidenceUrl: evidenceUrl || null };
}

export async function createCareerExperience(formData: FormData) {
  const input = values(formData);
  if (!input) redirect("/career?error=invalid-experience");
  const supabase = await client();
  const { error } = await supabase.rpc("create_career_experience", {
    p_type: input.experienceType, p_organization: input.organizationName, p_role: input.role,
    p_summary: input.responsibilities, p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_evidence_url: input.evidenceUrl,
  });
  if (error) redirect("/career?error=create-failed");
  redirect("/career?success=created");
}

export async function updateCareerExperience(formData: FormData) {
  const experienceId = String(formData.get("experience_id") ?? "");
  const input = values(formData);
  if (!uuidPattern.test(experienceId) || !input) redirect("/career?error=invalid-experience");
  const supabase = await client();
  const { error } = await supabase.rpc("update_career_experience", {
    p_id: experienceId, p_type: input.experienceType, p_organization: input.organizationName, p_role: input.role,
    p_summary: input.responsibilities, p_starts_on: input.startsOn, p_ends_on: input.endsOn, p_evidence_url: input.evidenceUrl,
  });
  if (error) redirect("/career?error=update-failed");
  redirect("/career?success=updated");
}

export async function deleteCareerExperience(formData: FormData) {
  const experienceId = String(formData.get("experience_id") ?? "");
  if (!uuidPattern.test(experienceId)) redirect("/career?error=invalid-experience");
  const supabase = await client();
  const { error } = await supabase.rpc("delete_career_experience", { p_id: experienceId });
  if (error) redirect("/career?error=delete-failed");
  redirect("/career?success=deleted");
}

export async function createCareerExperienceFromAssignment(formData: FormData) {
  const assignmentId = String(formData.get("assignment_id") ?? "");
  const summary = text(formData.get("summary"), 3000);
  const evidenceUrl = text(formData.get("evidence_url"), 2048);
  if (!uuidPattern.test(assignmentId) || summary === null || evidenceUrl === null || !validUrl(evidenceUrl)) redirect("/career?error=invalid-experience");
  const supabase = await client();
  const { error } = await supabase.rpc("create_career_experience_from_assignment", { p_assignment_id: assignmentId, p_summary: summary || null, p_evidence_url: evidenceUrl || null });
  if (error) redirect("/career?error=create-failed");
  redirect("/career?success=created");
}

export async function requestOrganizationVerification(formData: FormData) {
  const experienceId = String(formData.get("experience_id") ?? "");
  if (!uuidPattern.test(experienceId)) redirect("/career?error=invalid-verification");
  const supabase = await client();
  const { error } = await supabase.rpc("request_organization_verification", { p_experience_id: experienceId });
  if (error) redirect("/career?error=request-failed");
  redirect("/career?success=requested");
}

export async function cancelOrganizationVerification(formData: FormData) {
  const experienceId = String(formData.get("experience_id") ?? "");
  if (!uuidPattern.test(experienceId)) redirect("/career?error=invalid-verification");
  const supabase = await client();
  const { error } = await supabase.rpc("cancel_organization_verification_request", { p_experience_id: experienceId });
  if (error) redirect("/career?error=request-failed");
  redirect("/career?success=cancelled");
}
