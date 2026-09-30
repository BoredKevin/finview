/**
 * Date Range & Formatting Utilities for Financial Views
 */

export type DateRange = "30D" | "90D" | "1Y" | "ALL";

/**
 * Returns the start timestamp for a given date range filter relative to now.
 */
export function getStartDateForRange(range: DateRange, referenceDate = new Date()): number | null {
  const ref = referenceDate.getTime();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  switch (range) {
    case "30D":
      return ref - 30 * ONE_DAY;
    case "90D":
      return ref - 90 * ONE_DAY;
    case "1Y":
      return ref - 365 * ONE_DAY;
    case "ALL":
    default:
      return null;
  }
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into a localized readable date.
 */
export function formatDisplayDate(isoDate: string, locale = "id-ID"): string {
  if (!isoDate) return "";
  try {
    const [year, month, day] = isoDate.split("-").map((s) => parseInt(s, 10));
    if (!year || !month || !day) return isoDate;
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return isoDate;
  }
}

/**
 * Formats a timestamp into human-readable relative time (e.g. "Just now", "2 hours ago").
 */
export function formatRelativeTime(timestamp: number): string {
  const elapsed = Math.floor((Date.now() - timestamp) / 1000);
  if (elapsed < 60) return "Just now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
  if (elapsed < 2592000) return `${Math.floor(elapsed / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
