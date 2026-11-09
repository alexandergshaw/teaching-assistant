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
