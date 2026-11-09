export interface PastedSubmission { student: string; content: string }
const HEADING = /^\s*(?:\d+[.)]\s*)?(?:student|student name|name)\s*:\s*(\S.*?)\s*$/i;

export function isPastedDiscussionListing(text: string): boolean {
  const listing = parseDiscussionListing(text);
  if (!listing.detected) return false;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const startsExplicit = HEADING.test(lines.find((line) => line.trim()) ?? "");
  if (startsExplicit) return false;
  if (listing.rows.some((row) => row.student)) return true;
  const hasSeparators = /^\s*---+\s*$/m.test(text);
  return !hasSeparators;
}

export function hasSubmissionContent(content: string): boolean {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  return (HEADING.test(lines[0] ?? "") ? lines.slice(1).join("\n") : content).trim().length > 0;
}

/** Recognize explicit student headings only; never guess from prose. */
export function parsePastedSubmissions(text: string): PastedSubmission[] {
  if (isPastedDiscussionListing(text)) return parseDiscussionListing(text).rows;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const result: PastedSubmission[] = [];
  let current: PastedSubmission | undefined;
  for (const line of lines) {
    const heading = line.match(HEADING);
    if (heading) {
      current = { student: heading[1], content: line };
      result.push(current);
    } else if (current) current.content += `${current.content ? "\n" : ""}${line}`;
    else if (line.trim()) {
      const parts = text.split(/^\s*---+\s*$/m);
      return parts.length > 1 && parts.every((part) => part.trim()) ? parts.map((part) => ({ student: "", content: part.trim() })) : [];
    }
  }
  return result.length > 1 ? result.map((row) => ({ ...row, content: row.content.trim() })) : [];
}
import { parseDiscussionListing } from "./discussionListing";
