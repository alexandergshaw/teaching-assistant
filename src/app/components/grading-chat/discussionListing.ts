import type { PastedSubmission } from "./pastedSubmissions";

// Dates are required: ordinary prose that merely says someone posted is not
// enough evidence to identify the author of a submission.
const DATE = String.raw`(?:\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b|today\b|yesterday\b)`;
const INLINE = new RegExp(String.raw`^(.{2,100}?)\s+(?:posted|wrote)\s+(?:on\s+)?(${DATE}.*)$`, "i");
const TIMESTAMP = new RegExp(String.raw`^(?:posted|wrote)\s+(?:on\s+)?(${DATE}.*)$`, "i");
const NAVIGATION = /^(?:last\s+(?:post|reply)|repl(?:y|ies)|unread|views?|profile|discussion|topic)\b/i;
const SIGNAL = /\b(?:unread|last\s+(?:post|reply)|repl(?:y|ies)|views?|discussion)\b/i;
const ONLY_FURNITURE = /^(?:unread(?:\s+posts?)?|(?:\d+\s+)?(?:repl(?:y|ies)|views?|unread)|last\s+(?:post|reply)\b.*|view\s+profile|profile|(?:week\s+\d+\s+)?discussion(?:\s+(?:topic|board))?)$/i;

function plausibleAuthor(value: string): boolean {
  const name = value.trim();
  return name.length >= 2 && name.length <= 100 && !NAVIGATION.test(name) && !/[\d:<>]/.test(name) && /\p{L}/u.test(name);
}

export interface DiscussionListingResult { detected: boolean; rows: PastedSubmission[] }

/** Header and recognizable controls are not evidence of a student's response. */
export function hasDiscussionResponseContent(content: string): boolean {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  return lines.some((line, index) => {
    const value = line.trim();
    return !!value && !INLINE.test(value) && !TIMESTAMP.test(value) && !TIMESTAMP.test((lines[index + 1] ?? "").trim()) && !ONLY_FURNITURE.test(value) && !/^---+$/.test(value);
  });
}

/**
 * Split only recognizable author+posted-date headers. Each nonempty line stays
 * in a reviewable row, including unrecognized preamble and navigation. The user
 * can correct names and remove interface text before any grading is dispatched.
 */
export function parseDiscussionListing(text: string): DiscussionListingResult {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const headers: { index: number; student: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const inline = line.match(INLINE);
    if (inline && plausibleAuthor(inline[1])) headers.push({ index: i, student: inline[1].trim() });
    else if (TIMESTAMP.test(line) && i > 0 && plausibleAuthor(lines[i - 1])) headers.push({ index: i - 1, student: lines[i - 1].trim() });
  }
  const detected = headers.length > 0 || (SIGNAL.test(normalized) && /\b(?:posted|wrote|unread)\b/i.test(normalized));
  if (!detected) return { detected: false, rows: [] };
  if (headers.length === 0) return { detected: true, rows: normalized.trim() ? [{ student: "", content: normalized.trim() }] : [] };
  const rows: PastedSubmission[] = [];
  const preamble = lines.slice(0, headers[0].index).join("\n").trim();
  if (preamble) rows.push({ student: "", content: preamble });
  headers.forEach((header, index) => {
    const end = headers[index + 1]?.index ?? lines.length;
    rows.push({ student: header.student, content: lines.slice(header.index, end).join("\n").trim() });
  });
  return { detected: true, rows };
}
