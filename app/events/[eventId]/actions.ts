"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const path = (eventId: string) => `/events/${eventId}`;

async function client(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect(`/auth?next=${encodeURIComponent(path(eventId))}`);
  return supabase;
}

export async function registerForEvent(eventId: string) {
  if (!uuid.test(eventId)) redirect("/");
  const { error } = await (await client(eventId)).rpc("register_for_event", { p_event_id: eventId });
  if (error) redirect(`${path(eventId)}?error=register-failed`);
  redirect(`${path(eventId)}?success=registered`);
}

export async function cancelMyEventRegistration(eventId: string) {
  if (!uuid.test(eventId)) redirect("/");
  const { error } = await (await client(eventId)).rpc("cancel_my_event_registration", { p_event_id: eventId });
  if (error) redirect(`${path(eventId)}?error=cancel-failed`);
  redirect(`${path(eventId)}?success=cancelled`);
}
