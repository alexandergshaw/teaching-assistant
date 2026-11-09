type Result<T> = T | { error: string };
const INVALID = "This roster contains ambiguous or unsupported rows. Edit it in Courses to preserve its existing data.";

/** Interpret the existing course roster without silently dropping username columns or duplicate names. */
export function discussionRosterNames(roster: string | null): Result<{ names: string[] }> {
  const parsed = parseRows(roster);
  return "error" in parsed ? parsed : { names: parsed.rows.map((row) => row.name) };
}

function parseRows(roster: string | null): Result<{ rows: { name: string; raw: string }[] }> {
  if (roster === null || roster === "") return { rows: [] };
  const rows: { name: string; raw: string }[] = [];
  const seen = new Set<string>();
  for (const raw of roster.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const parts = raw.split("|");
    if (parts.length > 2 || (parts.length === 2 && !parts[1].trim())) return { error: INVALID };
    const name = parts[0].trim();
    const key = name.normalize("NFKC").toLocaleLowerCase();
    if (!name || seen.has(key)) return { error: INVALID };
    seen.add(key); rows.push({ name, raw });
  }
  return { rows };
}

/** Preserve each retained row verbatim, including its GitHub username. */
export function prepareDiscussionRoster(expected: string | null, names: readonly string[]): Result<{ roster: string }> {
  const parsed = parseRows(expected);
  if ("error" in parsed) return parsed;
  if (!Array.isArray(names) || names.length > 1000) return { error: "Use at most 1,000 student names." };
  const old = new Map(parsed.rows.map((row) => [row.name, row.raw]));
  const oldNormalized = new Map(parsed.rows.map((row) => [row.name.normalize("NFKC").toLocaleLowerCase(), row.name]));
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of names) {
    if (typeof value !== "string") return { error: "Enter one valid student name per line." };
    const name = value.trim();
    const key = name.normalize("NFKC").toLocaleLowerCase();
    if (!name || name.length > 500 || /[\r\n|]/.test(name) || seen.has(key)) return { error: "Enter distinct valid student names, one per line." };
    if (oldNormalized.has(key) && oldNormalized.get(key) !== name) return { error: "Change existing name spelling in Courses to preserve linked usernames." };
    seen.add(key); next.push(old.get(name) ?? name);
  }
  if (parsed.rows.some((row) => row.raw.includes("|") && !names.includes(row.name))) return { error: "Remove or rename students with linked usernames in Courses so their existing data is not lost." };
  const roster = next.join("\n");
  if (roster.length > 200_000) return { error: "This roster is too large to save." };
  return { roster };
}
