// Shared filename-building helpers for this app's downloadable logs
// (src/lib/repo-grading-log.ts, src/app/components/message-replies/
// message-replies-log.ts, src/app/components/recording/discussion-replies-
// log.ts). All three modules carried a byte-identical private `slugify` and
// `fileStamp`, plus their own thin `<prefix>-<name-slug>-<YYYYMMDD-HHMMSS>.
// <ext>` filename builder around them - each file's own header explained the
// duplication as "the logs are unrelated shapes with unrelated lifetimes",
// which is true of the log RECORD types but was never true of this filename
// idiom, which was the same three times over. Lifted here once; each log
// module now imports `logFileName` and calls it with its own prefix.

/** Lowercased, non-alphanumerics collapsed to single dashes, ends trimmed. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "2026-08-24T15:04:05.123Z" -> "20260824-150405". Colons and dots are not
 * safe in a Windows filename, and the sub-second part carries no information
 * a human reading a filename wants. */
export function fileStamp(atIso: string): string {
  const match = atIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return atIso.replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-+|-+$/g, "");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/** `<prefix>-<name-slug>-<YYYYMMDD-HHMMSS>.<extension>`. A name that slugs to
 * nothing (blank, or punctuation only) drops that segment entirely rather
 * than emitting a dangling double dash, so the result is always a valid,
 * non-empty filename. */
export function logFileName(prefix: string, name: string, extension: string, atIso: string): string {
  const slug = slugify(name);
  const parts = [prefix, slug, fileStamp(atIso)].filter((part) => part !== "");
  return `${parts.join("-")}.${extension}`;
}
