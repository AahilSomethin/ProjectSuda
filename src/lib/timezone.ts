/** Maldives (UTC+05:00). Falls back to IANA `Indian/Maldives` when `Asia/Male` is unavailable. */
export const DEFAULT_TIME_ZONE = "Asia/Male";
const FALLBACK_TIME_ZONE = "Indian/Maldives";

function resolveTimeZone(): string {
  for (const zone of [DEFAULT_TIME_ZONE, FALLBACK_TIME_ZONE]) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      return zone;
    } catch {
      // try next
    }
  }
  return FALLBACK_TIME_ZONE;
}

const ACTIVE_TIME_ZONE = resolveTimeZone();

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MALDIVES_OFFSET_MS = 5 * 60 * 60 * 1000;

function maldivesFormatter(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ACTIVE_TIME_ZONE,
    ...options,
  });
}

function maldivesDateFromUtc(date: Date): { year: number; month: number; day: number } {
  const shifted = new Date(date.getTime() + MALDIVES_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function getMaldivesDateParts(
  date: Date = new Date(),
): { year: number; month: number; day: number } {
  try {
    const parts = maldivesFormatter({
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
    const month = Number(parts.find((p) => p.type === "month")?.value ?? 0);
    const day = Number(parts.find((p) => p.type === "day")?.value ?? 0);
    if (year && month && day) {
      return { year, month, day };
    }
  } catch {
    // fall through
  }
  return maldivesDateFromUtc(date);
}

export function getMaldivesTodayString(date: Date = new Date()): string {
  const { year, month, day } = getMaldivesDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDueDateOnly(value: string): Date | null {
  if (!DATE_ONLY_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseTimestamp(value: string): Date | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

export function isTodayInMaldives(
  value: string,
  now: Date = new Date(),
): boolean {
  if (DATE_ONLY_RE.test(value)) {
    return value === getMaldivesTodayString(now);
  }
  const date = parseTimestamp(value);
  if (!date) return false;
  return getMaldivesTodayString(date) === getMaldivesTodayString(now);
}

export function isTomorrowInMaldives(
  value: string,
  now: Date = new Date(),
): boolean {
  const { year, month, day } = getMaldivesDateParts(now);
  const tomorrowUtc = Date.UTC(year, month - 1, day + 1);
  const tomorrowStr = getMaldivesTodayString(new Date(tomorrowUtc));

  if (DATE_ONLY_RE.test(value)) {
    return value === tomorrowStr;
  }
  const date = parseTimestamp(value);
  if (!date) return false;
  return getMaldivesTodayString(date) === tomorrowStr;
}

export function isOverdueInMaldives(
  value: string,
  now: Date = new Date(),
): boolean {
  if (DATE_ONLY_RE.test(value)) {
    return value < getMaldivesTodayString(now);
  }
  const date = parseTimestamp(value);
  if (!date) return false;
  return getMaldivesTodayString(date) < getMaldivesTodayString(now);
}

export function formatMaldivesTime(value: string | Date): string {
  const date = typeof value === "string" ? parseTimestamp(value) : value;
  if (!date) return "";
  return maldivesFormatter({
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatMaldivesDate(value: string | Date): string {
  const date =
    typeof value === "string"
      ? DATE_ONLY_RE.test(value)
        ? parseDueDateOnly(value)
        : parseTimestamp(value)
      : value;
  if (!date) return typeof value === "string" ? value : "";
  return maldivesFormatter({
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export type MaldivesGreeting = "morning" | "afternoon" | "evening" | "night";

export function getGreetingForMaldivesTime(
  now: Date = new Date(),
): MaldivesGreeting {
  const { year, month, day } = getMaldivesDateParts(now);
  const hour = Math.floor(
    (now.getTime() + MALDIVES_OFFSET_MS - Date.UTC(year, month - 1, day)) /
      (60 * 60 * 1000),
  );

  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function getGreetingTitle(now: Date = new Date()): string {
  const greeting = getGreetingForMaldivesTime(now);
  const label = greeting.charAt(0).toUpperCase() + greeting.slice(1);
  return `${label} Briefing`;
}

export function formatDueLabelInMaldivesTime(
  dueDate?: string | null,
  now: Date = new Date(),
): string {
  if (!dueDate?.trim()) return "";

  if (isOverdueInMaldives(dueDate, now)) return "overdue";
  if (isTodayInMaldives(dueDate, now)) {
    if (DATE_ONLY_RE.test(dueDate)) return "due today";
    const time = formatMaldivesTime(dueDate);
    return time ? `due at ${time}` : "due today";
  }
  if (isTomorrowInMaldives(dueDate, now)) return "due tomorrow";

  if (DATE_ONLY_RE.test(dueDate)) {
    return `due ${formatMaldivesDate(dueDate)}`;
  }

  const time = formatMaldivesTime(dueDate);
  const date = formatMaldivesDate(dueDate);
  return time ? `due ${date} at ${time}` : `due ${date}`;
}
