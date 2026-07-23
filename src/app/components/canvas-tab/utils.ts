const COURSE_URL_KEY = "ta-canvas-course-url";

// Format a Canvas ISO timestamp for display; blank when absent.
function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Format a Date as the local wall-clock value a datetime-local input expects
// ("YYYY-MM-DDTHH:mm"). Used for the scheduled-announcement field's min/value.
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Curated time zones for the optional scheduling override. "" means the
// account's configured zone (the default — no override is applied).
const SCHEDULING_TIME_ZONES: Array<{ value: string; label: string }> = [
  { value: "", label: "Account default" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "UTC", label: "UTC" },
];

// Up to two initials from a display name, for inbox avatars.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export { COURSE_URL_KEY, formatWhen, toDatetimeLocalValue, SCHEDULING_TIME_ZONES, initials };
