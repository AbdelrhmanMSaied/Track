import { addDays, currentMonth, monthBounds, type CalendarItem, type DashboardData } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";

const encoder = new TextEncoder();
function escaped(value: string) { return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[\\,;]/g, "\\$&").replace(/\r\n?|\n/g, "\\n"); }
function fold(line: string) {
  const chunks: string[] = [];
  let chunk = "";
  let length = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (chunk && length + size > 75) { chunks.push(chunk); chunk = ` ${character}`; length = size + 1; }
    else { chunk += character; length += size; }
  }
  return chunks.length ? [...chunks, chunk].join("\r\n") : chunk;
}
function utc(value: string) { return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function day(value: string) { return value.replaceAll("-", ""); }
function event(item: CalendarItem, stamp: string) {
  const lines = ["BEGIN:VEVENT", `UID:${item.kind}-${item.item_id}@track`, `DTSTAMP:${stamp}`, `SUMMARY:${escaped(item.title)}`, `DESCRIPTION:${escaped(`${item.kind} — ${item.organization_name ?? "Track"}`)}`];
  if (item.due_on) {
    lines.push(`DTSTART;VALUE=DATE:${day(item.due_on)}`, `DTEND;VALUE=DATE:${day(addDays(item.due_on, 1))}`);
  } else if (item.starts_at) {
    lines.push(`DTSTART:${utc(item.starts_at)}`);
    if (item.ends_at) lines.push(`DTEND:${utc(item.ends_at)}`);
  }
  lines.push(`URL:${escaped(new URL(item.href, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString())}`, "END:VEVENT");
  return lines;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const months = url.searchParams.getAll("month");
  const requestedMonth = months.length ? months.length === 1 ? months[0] : "" : currentMonth();
  const selectedMonth = monthBounds(requestedMonth);
  if (!selectedMonth) return new Response("Invalid month", { status: 400 });
  const startsOn = selectedMonth.startsOn;
  const endsOn = selectedMonth.endsOn;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return new Response("Authentication required", { status: 401 });
  const { data, error } = await supabase.rpc("get_my_dashboard", { p_starts_on: startsOn, p_ends_on: endsOn });
  if (error) return new Response("Calendar unavailable", { status: 500 });
  const calendar = data as DashboardData;
  const stamp = utc(new Date().toISOString());
  const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Track//Calendar//AR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...calendar.items.flatMap((item) => event(item, stamp)), "END:VCALENDAR", ""].map(fold).join("\r\n");
  return new Response(content, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename=track-${requestedMonth}.ics`, "Cache-Control": "private, no-store" } });
}
