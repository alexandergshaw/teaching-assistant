// Pure schedule -> Word document rendering.
//
// Extracted OUT of steps.course-guides.ts (which originally defined these)
// so it can be imported by BOTH generate-course-guides (steps.course-
// guides.ts) and save-zip-to-course (steps.course-setup.storage.ts) without
// either step file dragging in the other's dependencies. steps.course-
// guides.ts imports several `@/app/actions` server actions (listCourseHubAction,
// createPageAction, generateCourseFaqAction, and more) that steps.course-
// setup.storage.ts has no use for; importing steps.course-guides.ts directly
// from steps.course-setup.storage.ts pulled that entire surface (and its own
// transitive chain, which reaches src/lib/supabase/server.ts's
// `next/headers` import) into steps.course-setup.storage.ts's own bundle -
// breaking `next build` for any Pages Router entry point that reaches
// save-zip-to-course, since `next/headers` is an App Router-only API. This
// module has ZERO `@/app/actions` (or any other server-only) imports, so
// either step file can depend on it with no such risk.
//
// steps.course-guides.ts re-exports resolveContinuousWeeks/
// buildCourseScheduleDocx under their original names (so its own callers and
// steps.course-guides.test.ts need no changes); steps.course-setup.storage.ts
// imports directly from here instead.
import type { ScheduleWeekPlan } from "@/app/actions-types";
import { stampDocxAppProperties } from "@/lib/docx";
import { normalizeTypography } from "@/lib/text-normalize";

/** One resolved week's schedule row, or the "To be announced" placeholder for
 * a week the schedule has no entry for - continuous 1..maxWeek, never
 * dropped (Q1-AC3). */
export interface ScheduleRow {
  week: number;
  topic: string;
  summary: string;
  assignment: string;
}

// Exported (along with buildCourseScheduleDocx below) so
// steps.course-guides.test.ts can verify the "no dates" and "continuous,
// never dropped" requirements directly, without mocking the whole step.
export function resolveContinuousWeeks(schedule: ScheduleWeekPlan[], totalWeeks: number | null): ScheduleRow[] {
  const byWeek = new Map<number, ScheduleWeekPlan>();
  for (const w of schedule) byWeek.set(w.week, w);
  const maxWeek = Math.max(totalWeeks ?? 0, ...schedule.map((w) => w.week), 0);

  const rows: ScheduleRow[] = [];
  for (let week = 1; week <= maxWeek; week++) {
    const entry = byWeek.get(week);
    const topic = entry?.topic?.trim() || "To be announced";
    const summary = entry?.summary?.trim() ?? "";
    const assignment = [entry?.assignmentTitle, entry?.testName]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join("; ");
    rows.push({ week, topic, summary, assignment });
  }
  return rows;
}

// Q1-AC3: a real docx TABLE, not bullets - and NO dates or deadlines of any
// kind anywhere in this document. Built directly against the docx library
// (not buildDocxFromPlainText, which has no table path) but stamped through
// the SAME stampDocxAppProperties every other generated .docx goes through.
export async function buildCourseScheduleDocx(
  courseLabel: string,
  rows: ScheduleRow[],
  author?: string
): Promise<ArrayBuffer> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    HeadingLevel,
    BorderStyle,
    ShadingType,
  } = await import("docx");

  const FONT = "Calibri";
  const BODY = "1F2937";
  const NAVY = "1A2744";

  // AC1: this document is built directly against the `docx` library rather
  // than through buildDocxFromPlainText (./docx.ts), so it never picks up
  // that function's own normalizeTypography pass - every em/en dash and
  // curly quote in the course label and each row's own text (topic, summary,
  // assignment) would otherwise reach the shipped .docx unchanged. Normalize
  // each piece of freeform text at the point it is read, same substitutions
  // (see text-normalize.ts) every other generated document already gets.
  const normalizedLabel = normalizeTypography(courseLabel);
  const normalizedRows = rows.map((r) => ({
    ...r,
    topic: normalizeTypography(r.topic),
    summary: normalizeTypography(r.summary),
    assignment: normalizeTypography(r.assignment),
  }));

  const hasAssignmentColumn = normalizedRows.some((r) => r.assignment.trim().length > 0);
  const headerLabels = ["Week", "Topic", "Summary", ...(hasAssignmentColumn ? ["Assignment"] : [])];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerLabels.map(
      (label) =>
        new TableCell({
          shading: { fill: NAVY, type: ShadingType.CLEAR, color: "auto" },
          children: [
            new Paragraph({
              children: [new TextRun({ text: label, font: FONT, color: "FFFFFF", bold: true, size: 20 })],
            }),
          ],
        })
    ),
  });

  const bodyRows = normalizedRows.map((row) => {
    const values = [String(row.week), row.topic, row.summary, ...(hasAssignmentColumn ? [row.assignment] : [])];
    return new TableRow({
      children: values.map(
        (value) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: value, font: FONT, color: BODY, size: 20 })] })],
          })
      ),
    });
  });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });

  const doc = new Document({
    creator: author ?? "",
    lastModifiedBy: author ?? "",
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: BODY },
          paragraph: { spacing: { after: 140, line: 276 } },
        },
        title: {
          run: { font: FONT, color: NAVY, bold: true, size: 36 },
          paragraph: {
            spacing: { after: 200 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 6, color: NAVY } },
          },
        },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: `${normalizedLabel} - Course Schedule` })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Weekly topics only - no dates or deadlines. See the LMS course or syllabus for due dates.",
                font: FONT,
                color: BODY,
                italics: true,
                size: 20,
              }),
            ],
            spacing: { after: 200 },
          }),
          table,
        ],
      },
    ],
  });

  return stampDocxAppProperties(await Packer.toArrayBuffer(doc));
}
