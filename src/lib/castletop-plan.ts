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
