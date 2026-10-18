import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** `locale` comes from useDateLocale() / getDateLocale() so dates follow the user's language. */
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }, locale = "en-GB") {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso));
}

export function formatDateTime(iso: string, locale = "en-GB") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));
}

export function daysFromToday(isoDate: string, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((new Date(isoDate + "T00:00:00Z").getTime() - today) / 86_400_000);
}

export function dueText(days: number) {
  if (days === 0) return "Due today";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}
