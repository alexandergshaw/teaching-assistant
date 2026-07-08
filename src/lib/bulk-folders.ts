/**
 * Expand a folder-name pattern into a numbered sequence for bulk creation.
 * `{n}` in the pattern is replaced by the running number; if the pattern has no
 * `{n}`, the number is appended after a space (so "Module" -> "Module 1"). The
 * count is capped at 100 and each name is trimmed of surrounding slashes.
 */
export function buildBulkFolderNames(pattern: string, start: number, count: number): string[] {
  const base = pattern.trim();
  if (!base || !Number.isFinite(start) || !Number.isFinite(count) || count < 1) return [];
  const names: string[] = [];
  for (let i = 0; i < Math.min(count, 100); i += 1) {
    const n = start + i;
    const num = String(n).padStart(2, "0");
    const raw = base.includes("{n}") ? base.replace(/\{n\}/g, num) : `${base} ${num}`;
    const name = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (name) names.push(name);
  }
  return names;
}
