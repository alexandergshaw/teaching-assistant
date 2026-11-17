/** Select only when the index uniquely accounts for every member. Index text is
 * untrusted; the original index and older file paths must remain in provenance. */
export function latestBrightspaceAttempt(paths: readonly string[], rows: readonly { readonly stem: string; readonly submitted: string }[]): { latest: string[]; earlier: string[] } | null {
  const parse = (value: string): number | null => {
    const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4}) (\d{3,4}) (AM|PM)$/i.exec(value.trim());
    if (!match) return null;
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(match[1].toLowerCase()), day = Number(match[2]), year = Number(match[3]);
    const clock = match[4].padStart(4, "0"), hour = Number(clock.slice(0, 2)), minute = Number(clock.slice(2));
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const date = new Date(Date.UTC(year, month, day, hour % 12 + (match[5].toUpperCase() === "PM" ? 12 : 0), minute));
    if (month === 10 && date.getUTCDay() === 0 && day <= 7 && hour === 1 && match[5].toUpperCase() === "AM") return null;
    return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date.getTime() : null;
  };
  if (!paths.length || !rows.length) return null;
  const times = new Map<string, number>();
  for (const row of rows) {
    const time = parse(row.submitted), stem = row.stem.trim();
    if (!stem || time === null || (times.has(stem) && times.get(stem) !== time)) return null;
    times.set(stem, time);
  }
  const identified = paths.map((path) => ({ path, stem: path.replace(/\.[^./]+$/, "") }));
  if (identified.some(({ stem }) => !times.has(stem)) || [...times.keys()].some((stem) => !identified.some((item) => item.stem === stem))) return null;
  // Brightspace records file upload times, not an authoritative attempt ID.
  // Different timestamps can be files from one submission, so never discard
  // an older file solely because a newer file appears in the same group.
  if (new Set(identified.map(({ stem }) => times.get(stem)!)).size > 1) return null;
  const newest = Math.max(...identified.map(({ stem }) => times.get(stem)!));
  if (new Set(identified.filter(({ stem }) => times.get(stem) === newest).map(({ stem }) => stem)).size > 1) return null;
  return { latest: identified.filter(({ stem }) => times.get(stem) === newest).map(({ path }) => path), earlier: identified.filter(({ stem }) => times.get(stem) !== newest).map(({ path }) => path) };
}
