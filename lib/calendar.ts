export type CalendarItem = {
  kind: "task" | "meeting" | "event";
  item_id: string;
  organization_id?: string;
  organization_name?: string;
  title: string;
  due_on: string | null;
  starts_at: string | null;
  ends_at: string | null;
  href: string;
};

export type DashboardData = {
  summary: { open_tasks: number; overdue_tasks: number; undated_tasks: number };
  items: CalendarItem[];
};

function fromParts(parts: Intl.DateTimeFormatPart[]) {
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function cairoToday() {
  return fromParts(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()));
}

export function cairoDate(value: string) {
  return fromParts(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)));
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, value] = month.split("-").map(Number);
  const startsOn = `${month}-01`;
  const endsOn = new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
  return { startsOn, endsOn };
}

export function currentMonth() { return cairoToday().slice(0, 7); }

export function itemDate(item: CalendarItem) { return item.due_on ?? (item.starts_at ? cairoDate(item.starts_at) : ""); }
