/**
 * Helpers for aligning course schedules with source materials (textbooks, course modules).
 * Provides tolerant TOC parsing, chapter-week balance validation, and integration planning.
 */

import type { ScheduleWeekPlan } from "@/app/actions-types";

/** Represents a chapter parsed from source material table of contents. */
export interface ParsedChapter {
  number: string; // e.g., "1", "3.2", "Chapter 1"
  title: string;
  depth: number; // 0 for top-level, 1+ for subsections
  subsectionCount: number; // count of subsections under this chapter
}

/**
 * Parse a table of contents from source material text.
 * Supports common formats: "Chapter N: Title", "N. Title", "Unit N - Title", etc.
 * Returns a list of chapters with depth and subsection counts.
 */
export function parseTocChapters(tocText: string): ParsedChapter[] {
  if (!tocText?.trim()) return [];

  const lines = tocText.split("\n");
  const chapters: ParsedChapter[] = [];
  let lastTopLevelIndex = -1;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and non-chapter lines
    if (!line || line.length < 2) continue;

    // Check indentation to determine depth (subsections are indented)
    const indent = rawLine.length - rawLine.trimStart().length;
    const isIndented = indent > 0;

    // Try parsing: "Chapter N: Title" or "Chapter N - Title"
    let match = line.match(/^(?:chapter|unit|part|module|section)\s+([0-9.]+)\s*[-:]\s*(.+)/i);
    if (match) {
      const [, number, title] = match;
      if (isIndented && lastTopLevelIndex >= 0) {
        // Indented -> subsection
        chapters[lastTopLevelIndex].subsectionCount += 1;
      } else {
        // Top-level chapter
        const ch: ParsedChapter = {
          number: String(number),
          title: title.trim(),
          depth: 0,
          subsectionCount: 0,
        };
        chapters.push(ch);
        lastTopLevelIndex = chapters.length - 1;
      }
      continue;
    }

    // Try parsing: "N. Title"
    match = line.match(/^([0-9.]+)\.\s+(.+)/);
    if (match) {
      const [, number, title] = match;
      const numberStr = String(number);
      // Heuristic: if indented OR has multiple dots, treat as subsection; otherwise as chapter
      const depth = isIndented || numberStr.includes(".") ? 1 : 0;

      if (depth === 1 && lastTopLevelIndex >= 0) {
        chapters[lastTopLevelIndex].subsectionCount += 1;
      } else {
        const ch: ParsedChapter = {
          number: numberStr,
          title: title.trim(),
          depth: 0,
          subsectionCount: 0,
        };
        chapters.push(ch);
        lastTopLevelIndex = chapters.length - 1;
      }
      continue;
    }

    // Try parsing: "- Title" or "* Title" (subsection hint)
    if ((line.startsWith("-") || line.startsWith("*")) && line.length > 2) {
      if (isIndented || lastTopLevelIndex >= 0) {
        if (lastTopLevelIndex >= 0 && chapters[lastTopLevelIndex]) {
          chapters[lastTopLevelIndex].subsectionCount += 1;
        }
      }
    }
  }

  return chapters;
}

/**
 * Analyze the balance between chapters in source material and weeks in the schedule.
 * Returns counts and summary of any misalignments.
 */
export interface SourceScheduleBalance {
  chaptersInToc: number;
  chaptersCovered: number;
  weeksInSchedule: number;
  nonContentWeeks: number; // review, exam, project weeks
  contentWeeks: number;
  spans: number; // count of week ranges covering chapters
  anomalies: string[]; // unmatched chapters or week descriptions
}

/**
 * Validate alignment of source material chapters with schedule weeks.
 * Extracts chapter mentions from week summaries and compares against TOC.
 */
export function validateScheduleAlignment(
  schedule: ScheduleWeekPlan[],
  chapters: ParsedChapter[]
): SourceScheduleBalance {
  const chapterNumbers = new Set(chapters.map((c) => c.number));
  const anomalies: string[] = [];

  // Extract chapter numbers mentioned in week summaries
  const mentionedChapters = new Set<string>();
  const nonContentWeekIndices = new Set<number>();

  for (const week of schedule) {
    const summary = (week.summary || "").toLowerCase();

    // Detect non-content weeks
    if (
      summary.includes("review") ||
      summary.includes("exam") ||
      summary.includes("test") ||
      summary.includes("project") ||
      summary.includes("presentation") ||
      summary.includes("final")
    ) {
      nonContentWeekIndices.add(week.week);
    }

    // Extract chapter mentions: "Chapter X", "X.Y", etc.
    const matches = (week.summary || "").matchAll(/(?:chapter|unit|module)\s+([0-9.]+)/gi);
    for (const match of matches) {
      mentionedChapters.add(String(match[1]));
    }
  }

  // Check for unmatched TOC chapters
  for (const chapter of chapters) {
    if (!mentionedChapters.has(chapter.number)) {
      anomalies.push(`TOC chapter ${chapter.number} not covered in schedule`);
    }
  }

  // Check for schedule week mentions to chapters not in TOC
  for (const weekNum of mentionedChapters) {
    if (!chapterNumbers.has(weekNum)) {
      anomalies.push(`Schedule references chapter ${weekNum} not in source TOC`);
    }
  }

  // Count distinct chapter spans (continuous ranges of weeks covering different chapters)
  let spans = 0;
  let lastChapter = "";
  for (const week of schedule) {
    const summary = (week.summary || "").toLowerCase();
    const match = summary.match(/chapter\s+([0-9.]+)/i);
    const chapter = match ? String(match[1]) : "";
    if (chapter && chapter !== lastChapter && !nonContentWeekIndices.has(week.week)) {
      spans++;
    }
    if (chapter) lastChapter = chapter;
  }

  const contentWeeks = schedule.length - nonContentWeekIndices.size;

  return {
    chaptersInToc: chapters.length,
    chaptersCovered: mentionedChapters.size,
    weeksInSchedule: schedule.length,
    nonContentWeeks: nonContentWeekIndices.size,
    contentWeeks,
    spans: Math.max(spans, 1),
    anomalies,
  };
}

/**
 * Format a balance summary for display in step results.
 */
export function formatBalanceSummary(balance: SourceScheduleBalance): string {
  const lines: string[] = [
    `Chapters: ${balance.chaptersCovered}/${balance.chaptersInToc} covered across ${balance.contentWeeks} content weeks`,
    `Schedule structure: ${balance.spans} chapter span(s), ${balance.nonContentWeeks} non-content week(s)`,
  ];

  if (balance.anomalies.length > 0) {
    lines.push(`Anomalies: ${balance.anomalies.join("; ")}`);
  }

  return lines.join(" | ");
}

/**
 * Given a schedule and source material, plan which weeks should create LMS items.
 * Returns a list of weeks to create items for, keyed by source chapter/module reference.
 */
export interface WeekItemPlan {
  week: number;
  topic: string;
  summary: string;
  chapterRef: string | null; // "Chapter X" or null for non-content weeks
  isNonContent: boolean; // true for review/exam/project weeks
}

export function planWeekItems(schedule: ScheduleWeekPlan[]): WeekItemPlan[] {
  return schedule.map((week) => {
    const summary = (week.summary || "").toLowerCase();
    const isNonContent =
      summary.includes("review") ||
      summary.includes("exam") ||
      summary.includes("test") ||
      summary.includes("project") ||
      summary.includes("presentation") ||
      summary.includes("final");

    let chapterRef: string | null = null;
    if (!isNonContent) {
      const match = (week.summary || "").match(/(?:chapter|unit|module)\s+([0-9.]+)/i);
      chapterRef = match ? `Chapter ${match[1]}` : null;
    }

    return {
      week: week.week,
      topic: week.topic || "",
      summary: week.summary || "",
      chapterRef,
      isNonContent,
    };
  });
}

/**
 * A week counts as review/exam/project (non-content) by the same wording
 * heuristic planWeekItems uses for the LMS-integration step, so the two stay
 * consistent about which weeks introduce no new chapter.
 */
export function isNonContentWeekText(...texts: Array<string | undefined>): boolean {
  const combined = texts.filter(Boolean).join(" ").toLowerCase();
  return (
    combined.includes("review") ||
    combined.includes("exam") ||
    combined.includes("test") ||
    combined.includes("project") ||
    combined.includes("presentation") ||
    combined.includes("final")
  );
}

/**
 * Summarize the source-material chapters mentioned in every week BEFORE
 * weekNumber, so a review/exam/project week's materials can ground in what
 * was already covered instead of fabricating a new chapter's content.
 */
export function describeCoveredChapters(schedule: ScheduleWeekPlan[], weekNumber: number): string {
  const chapters = new Set<string>();
  for (const w of schedule) {
    if (w.week >= weekNumber) continue;
    for (const m of (w.summary || "").matchAll(/(?:chapter|unit|module)\s+([0-9.]+)/gi)) {
      chapters.add(String(m[1]));
    }
  }
  return [...chapters]
    .sort((a, b) => Number(a) - Number(b))
    .map((n) => `Chapter ${n}`)
    .join(", ");
}
