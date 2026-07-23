// Pure file-naming convention for workflow-produced files.
//
// No server/browser API imports - this module is safe to use from client
// step definitions, headless server runs, and unit tests alike.
//
// Convention: "<Course code or short name> - <Artifact> - <Qualifier> -
// <YYYY-MM-DD>.<ext>", with any part omitted when it is not available. Parts
// are joined with " - "; the extension is always appended last and is never
// truncated by the length cap.

const ILLEGAL_CHARS = /[<>:"/\\|?*]/g;

// Strips ASCII control characters without a regex control-character range
// (character-code check instead, so no eslint no-control-regex exception is
// needed).
function stripControlChars(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) out += ch;
  }
  return out;
}

/** Strips characters illegal on Windows/macOS, collapses whitespace and
 * underscores to single spaces, trims, and trims trailing dots. */
export function sanitizeFileNamePart(s: string): string {
  return stripControlChars(s)
    .replace(ILLEGAL_CHARS, "")
    .replace(/[_\s]+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .trim();
}

const COURSE_LABEL_MAX = 24;

/** Shortens a course name to at most `max` characters, breaking only at a
 * word boundary (never mid-word). */
function shortenAtWordBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const shortened = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return shortened.trim();
}

export interface CourseLike {
  courseCode?: string | null;
  name?: string | null;
}

/** Prefers a non-empty, trimmed courseCode; otherwise a word-boundary
 * shortened course name capped at ~24 chars; "" when neither exists. */
export function courseFileLabel(course: CourseLike | null | undefined): string {
  if (!course) return "";
  const code = sanitizeFileNamePart(course.courseCode ?? "");
  if (code) return code;
  const name = sanitizeFileNamePart(course.name ?? "");
  if (!name) return "";
  return shortenAtWordBoundary(name, COURSE_LABEL_MAX);
}

export interface BuildWorkflowFileNameOptions {
  course?: CourseLike | null;
  artifact: string;
  qualifier?: string | null;
  /** ISO YYYY-MM-DD string. Never an epoch timestamp. */
  date?: string | null;
  ext: string;
}

const MAX_TOTAL_LENGTH = 100;

/** Builds a professional, descriptive workflow file name from the present
 * parts, joined with " - ", in the order:
 * <course label> - <artifact> - <qualifier> - <date>.<ext>
 *
 * Deterministic and pure: the same inputs always produce the same name. The
 * total length (including extension) is capped at 100 chars; when over, the
 * qualifier is truncated at a word boundary first - the extension is never
 * touched. */
export function buildWorkflowFileName(options: BuildWorkflowFileNameOptions): string {
  const courseLabel = courseFileLabel(options.course);
  const artifact = sanitizeFileNamePart(options.artifact);
  let qualifier = sanitizeFileNamePart(options.qualifier ?? "");
  const date = sanitizeFileNamePart(options.date ?? "");
  const ext = options.ext.replace(/^\.+/, "").trim();

  const buildParts = () =>
    [courseLabel, artifact, qualifier, date].filter((p) => p.length > 0);

  let name = `${buildParts().join(" - ")}.${ext}`;

  if (name.length > MAX_TOTAL_LENGTH && qualifier) {
    // Truncate the qualifier (word boundary) until the whole name fits, or
    // until there is nothing left to trim from it.
    const suffixParts = [artifact, date].filter((p) => p.length > 0);
    const fixedLength =
      (courseLabel ? courseLabel.length + 3 : 0) + // "<course> - "
      suffixParts.reduce((sum, p) => sum + p.length + 3, 0) + // "<part> - "
      1 + // "."
      ext.length;
    const budget = Math.max(0, MAX_TOTAL_LENGTH - fixedLength);
    qualifier = shortenAtWordBoundary(qualifier, budget);
    name = `${buildParts().join(" - ")}.${ext}`;
  }

  return name;
}
