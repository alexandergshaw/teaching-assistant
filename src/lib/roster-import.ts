// Parses a pasted student list (R6, RosterCell.tsx's "Import list" path) into
// draft roster rows. Pure, no I/O, no React - the review step that shows
// "Found N students, M with a GitHub username. Z lines could not be read"
// before anything is written needs this to be independently testable, and
// vitest here is node-env and collects only src/**/*.test.ts anyway (nothing
// rendered is ever exercised by a test).
//
// Three accepted per-line shapes, tried in this order: `Name<TAB>handle`,
// `Name | handle` (the LAST `|`, matching rosterToRows' own convention so a
// pasted pipe-form list round-trips through the same rules the roster editor
// already uses), and `Name, handle` (the first comma). The comma form is
// genuinely ambiguous with this same tool's OWN "Last, First" name
// convention (RosterCell's placeholder is literally "Smith, John") - a line
// with no real handle at all, like "Smith, John", parses as student "Smith",
// handle "John" here, since "John" is syntactically a valid GitHub username
// and nothing in the pasted text can distinguish the two cases. This is a
// known, reported limitation, not a defect: the review step shows every
// parsed row before anything is written to the draft, so a wrongly-split
// name is visible (and correctable, e.g. by using the pipe form for a
// name-only row) before Save.
import { extractGithubHandle } from "./github-usernames";

export interface RosterImportRow {
  student: string;
  username: string;
}

export interface RosterImportResult {
  rows: RosterImportRow[];
  studentsWithUsername: number;
  unparsedLines: string[];
}

interface SplitLine {
  student: string;
  usernameRaw: string;
}

function splitLine(line: string): SplitLine | null {
  const tabIdx = line.indexOf("\t");
  if (tabIdx !== -1) {
    return { student: line.slice(0, tabIdx).trim(), usernameRaw: line.slice(tabIdx + 1).trim() };
  }
  const pipeIdx = line.lastIndexOf("|");
  if (pipeIdx !== -1) {
    return { student: line.slice(0, pipeIdx).trim(), usernameRaw: line.slice(pipeIdx + 1).trim() };
  }
  const commaCount = (line.match(/,/g) ?? []).length;
  if (commaCount === 1) {
    const idx = line.indexOf(",");
    const left = line.slice(0, idx).trim();
    const right = line.slice(idx + 1).trim();
    if (left && right) return { student: left, usernameRaw: right };
  }
  return null;
}

/**
 * Parses one student per line. A line with no recognized delimiter at all is
 * still a usable row (a name with no GitHub username yet). A line WITH a
 * delimiter is unparsed only when the student half is empty, or the
 * username half fails `extractGithubHandle` (spaces, an unusable character,
 * or empty after a delimiter that implied one was coming).
 */
export function parseRosterImportText(text: string): RosterImportResult {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: RosterImportRow[] = [];
  const unparsedLines: string[] = [];
  let studentsWithUsername = 0;

  for (const line of lines) {
    const split = splitLine(line);
    if (!split) {
      rows.push({ student: line, username: "" });
      continue;
    }
    if (!split.student) {
      unparsedLines.push(line);
      continue;
    }
    if (!split.usernameRaw) {
      rows.push({ student: split.student, username: "" });
      continue;
    }
    const { handle, ok } = extractGithubHandle(split.usernameRaw);
    if (!ok) {
      unparsedLines.push(line);
      continue;
    }
    rows.push({ student: split.student, username: handle });
    studentsWithUsername += 1;
  }

  return { rows, studentsWithUsername, unparsedLines };
}

/** The Review-step summary line - "Found 28 students, 24 with a GitHub
 * username. 2 lines could not be read: <line 1>; <line 2>" - shown before
 * anything is written to the draft (R6). */
export function formatRosterImportSummary(result: RosterImportResult): string {
  const studentWord = result.rows.length === 1 ? "student" : "students";
  const base = `Found ${result.rows.length} ${studentWord}, ${result.studentsWithUsername} with a GitHub username.`;
  if (result.unparsedLines.length === 0) return base;
  const lineWord = result.unparsedLines.length === 1 ? "line" : "lines";
  return `${base} ${result.unparsedLines.length} ${lineWord} could not be read: ${result.unparsedLines.join("; ")}`;
}
