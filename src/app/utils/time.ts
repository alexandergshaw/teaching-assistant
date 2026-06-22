/**
 * Compact relative time: "just now", "5m ago", "3h ago", "in 2d", falling back
 * to an absolute date beyond a week. Handles past (e.g. message time) and future
 * (e.g. an assignment due date). Blank for missing/invalid input.
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "";

  const diff = Date.now() - ms; // positive = in the past
  const future = diff < 0;
  const sec = Math.round(Math.abs(diff) / 1000);

  if (sec < 45) return "just now";

  let value: string;
  const min = Math.round(sec / 60);
  if (min < 60) {
    value = `${min}m`;
  } else {
    const hr = Math.round(min / 60);
    if (hr < 24) {
      value = `${hr}h`;
    } else {
      const day = Math.round(hr / 24);
      if (day < 7) {
        value = `${day}d`;
      } else {
        return date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }
  }

  return future ? `in ${value}` : `${value} ago`;
}
