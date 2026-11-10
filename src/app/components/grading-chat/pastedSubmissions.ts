export interface PastedSubmission { student: string; content: string }
const HEADING = /^\s*(?:\d+[.)]\s*)?(?:student|student name|name)\s*:\s*(\S.*?)\s*$/i;

export function isPastedDiscussionListing(text: string): boolean {
  const listing = parseDiscussionListing(text);
  if (!listing.detected) return false;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const startsExplicit = HEADING.test(lines.find((line) => line.trim()) ?? "");
  if (startsExplicit) return false;
  if (listing.rows.some((row) => row.student)) return true;
  return false;
}

export function hasSubmissionContent(content: string): boolean {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  return (HEADING.test(lines[0] ?? "") ? lines.slice(1).join("\n") : content).trim().length > 0;
}

/** Recognize explicit student headings only; never guess from prose. */
export function parsePastedSubmissions(text: string): PastedSubmission[] {
  const discussion = parseDiscussionListing(text);
  if (isPastedDiscussionListing(text)) return discussion.rows;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const result: PastedSubmission[] = [];
  const headingCount = lines.filter((line) => HEADING.test(line)).length;
  if (headingCount) {
    let current: PastedSubmission = { student: "", content: "" };
    for (const line of lines) {
      const heading = line.match(HEADING);
      if (heading) {
        if (current.content.trim()) result.push(current);
        current = { student: heading[1], content: line };
      } else {
        current.content += `${current.content ? "\n" : ""}${line}`;
      }
    }
    if (current.content.trim()) result.push(current);
    return result;
  }
  const normalized = text.replace(/\r\n?/g, "\n");
  const separators = [...normalized.matchAll(/^[ \t]*---+[ \t]*$/gm)];
  if (!separators.length) return discussion.detected && !headingCount ? [{ student: "", content: normalized }] : [];
  const parts: string[] = [];
  let start = 0;
  for (const separator of separators) {
    const end = separator.index! + separator[0].length;
    parts.push(normalized.slice(start, end));
    start = end;
  }
  parts.push(normalized.slice(start));
  if (parts.some((part) => !part.replace(/^[ \t]*---+[ \t]*$/gm, "").trim())) return [];
  return parts.map((content) => ({ student: "", content }));
}
import { parseDiscussionListing } from "./discussionListing";
