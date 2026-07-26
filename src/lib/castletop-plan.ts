import { sanitizeFileNamePart } from "@/lib/workflows/file-names";

export interface CastletopItem {
  /** Assignment / activity label. */
  assignment: string;
  /** Estimated minutes. */
  minutes: number;
  /** Points, when the source exposes them. */
  points?: number | null;
}

export interface CastletopReadingItem {
  assignment: string;
  /** Pages to read (col B). Omit for a non-reading pre-class row. */
  qty?: number | null;
  /** Reading rate in pages per hour (col D). */
  rate?: number | null;
}

export interface CastletopWeek {
  label: string;
  preClass: CastletopReadingItem[];
  inClass: CastletopItem[];
  afterClass: CastletopItem[];
}

export interface CastletopPlan {
  /** A1 title line. */
  title: string;
  /** Worksheet name (the term label). */
  sheetName: string;
  /** Divisor written into K3. */
  contactMinutes: number;
  /** Content rows per week block (excludes the total row). */
  blockRows: number;
  weeks: CastletopWeek[];
}

export interface BuildCastletopPlanOptions {
  courseCode?: string | null;
  courseName: string;
  instructor?: string | null;
  term?: string | null;
  weeks: number;
  contactMinutes?: number;
  readingRate?: number;
  pagesPerChapter?: number;
  classSessionMinutes?: number;
  topicsByWeek?: Map<number, string>;
  itemsByWeek?: Map<number, CastletopItem[]>;
}

/**
 * Sanitize a worksheet name for Excel: strip illegal chars, collapse
 * whitespace, truncate to 31 chars. Returns "" for blank/null input.
 */
export function sanitizeSheetName(raw: string | null | undefined): string {
  if (!raw) return "";
  // Strip Excel-illegal chars [ ] : * ? / \ and control chars
  let sanitized = raw.replace(/[\x00-\x1f\[\]:*?/\\]/g, "");
  // Collapse whitespace runs to one space, trim
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  // Truncate to 31 chars (Excel's hard limit)
  return sanitized.substring(0, 31);
}

export function buildCastletopPlan(o: BuildCastletopPlanOptions): CastletopPlan {
  // Build title from courseCode and courseName
  const titleParts: string[] = [];
  if (o.courseCode) titleParts.push(o.courseCode);
  titleParts.push(o.courseName);
  let title = titleParts.join(" ");
  if (o.instructor) title += `, ${o.instructor}`;

  // Sheet name
  const sheetName = sanitizeSheetName(o.term) || "Schedule";

  // Contact minutes: default 50, guard against <= 0 or non-finite
  let contactMinutes = o.contactMinutes ?? 50;
  if (!Number.isFinite(contactMinutes) || contactMinutes <= 0) {
    contactMinutes = 50;
  }

  // Defaults
  const readingRate = o.readingRate ?? 19;
  const pagesPerChapter = o.pagesPerChapter ?? 30;
  const classSessionMinutes = o.classSessionMinutes ?? 120;

  // Build weeks
  const weeks: CastletopWeek[] = [];
  for (let w = 1; w <= o.weeks; w++) {
    const topic = o.topicsByWeek?.get(w);
    const preClass: CastletopReadingItem[] = [];

    // Add topic row if it exists
    if (topic) {
      preClass.push({ assignment: topic });
    }

    // Always add the reading row
    preClass.push({
      assignment: "Read Chapter",
      qty: pagesPerChapter,
      rate: readingRate,
    });

    const inClass: CastletopItem[] = [
      {
        assignment: "Class: Face to Face, Live Streaming, or Recording",
        minutes: classSessionMinutes,
      },
    ];

    const afterClass = o.itemsByWeek?.get(w) ?? [];

    weeks.push({
      label: `Week ${w}`,
      preClass,
      inClass,
      afterClass,
    });
  }

  // Calculate blockRows: at least 10, or the longest of the three lists across all weeks
  let blockRows = 10;
  for (const wk of weeks) {
    blockRows = Math.max(
      blockRows,
      wk.preClass.length,
      wk.inClass.length,
      wk.afterClass.length
    );
  }

  return {
    title,
    sheetName,
    contactMinutes,
    blockRows,
    weeks,
  };
}

// ---------------------------------------------------------------------------
// File naming
//
// The Castletop workbook's file name follows a DIFFERENT convention from
// buildWorkflowFileName (src/lib/workflows/file-names.ts): underscore
// separated, includes the full course name, and carries no date. This is
// deliberate and Castletop-specific - do not change file-names.ts to match
// it, since 14 other workflow steps depend on that shared convention.
// ---------------------------------------------------------------------------

export interface CastletopFileNameOptions {
  /** Instructor in file-as form, e.g. "Loring, William". */
  instructorFileAs?: string | null;
  /** Fallback when instructorFileAs is blank, e.g. "William A Loring". */
  instructor?: string | null;
  courseCode?: string | null;
  courseName?: string | null;
}

const CASTLETOP_SUFFIX = "Castletop";
const CASTLETOP_EXT = "xlsx";
const CASTLETOP_NAME_MAX_LENGTH = 150;

/**
 * Shortens a string to at most `max` characters, breaking only at a word
 * boundary (never mid-word). A local equivalent of the same-named helper in
 * workflows/file-names.ts - that helper is not exported there, and this
 * module must not modify workflows/file-names.ts (14 other workflow steps
 * depend on its convention, which is unrelated to Castletop's).
 */
function truncateAtWordBoundary(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const shortened = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return shortened.trim();
}

/**
 * Builds the Castletop workbook file name to match the user's institutional
 * convention:
 *
 *   <instructor, file-as>_<course code>_<course name>_Castletop.xlsx
 *
 * Parts are sanitized with sanitizeFileNamePart (workflows/file-names.ts) -
 * reused as-is because it already preserves commas, which the "Last, First"
 * instructor form depends on. Blank parts are omitted entirely (no doubled
 * or trailing separators); "Castletop" is always present, so the minimum
 * possible output is "Castletop.xlsx".
 *
 * Pure and deterministic - no date, no Date.now(), no randomness. Dropping
 * the date is intentional: one Castletop workbook per course per term, and
 * appendCourseCastletopFile dedupes by name so regenerating REPLACES the
 * previous file rather than accumulating dated copies.
 *
 * The total length (including extension) is capped at 150 chars; when over,
 * the course name - the longest and least identifying part - is truncated
 * at a word boundary first. The extension and the "Castletop" suffix are
 * never truncated.
 */
export function buildCastletopFileName(o: CastletopFileNameOptions): string {
  const instructorSource =
    o.instructorFileAs && o.instructorFileAs.trim() ? o.instructorFileAs : o.instructor;
  const instructorPart = sanitizeFileNamePart(instructorSource ?? "");
  const courseCodePart = sanitizeFileNamePart(o.courseCode ?? "");
  let courseNamePart = sanitizeFileNamePart(o.courseName ?? "");

  const buildName = () =>
    [instructorPart, courseCodePart, courseNamePart, CASTLETOP_SUFFIX]
      .filter((p) => p.length > 0)
      .join("_") + `.${CASTLETOP_EXT}`;

  let fileName = buildName();

  if (fileName.length > CASTLETOP_NAME_MAX_LENGTH && courseNamePart.length > 0) {
    // Every non-blank part contributes one "_" separator to its right except
    // the last part overall. otherParts excludes courseNamePart (the part
    // being resized) but always includes "Castletop", so - since
    // courseNamePart is non-blank in this branch - the total separator
    // count in the final name is exactly otherParts.length.
    const otherParts = [instructorPart, courseCodePart, CASTLETOP_SUFFIX].filter(
      (p) => p.length > 0
    );
    const fixedLength =
      otherParts.reduce((sum, p) => sum + p.length, 0) +
      otherParts.length +
      1 + // "."
      CASTLETOP_EXT.length;
    const budget = Math.max(0, CASTLETOP_NAME_MAX_LENGTH - fixedLength);
    courseNamePart = truncateAtWordBoundary(courseNamePart, budget);
    fileName = buildName();
  }

  return fileName;
}
