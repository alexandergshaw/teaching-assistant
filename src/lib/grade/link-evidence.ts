import type { StudentSubmissionEntry, SubmittedFileInfo } from "./types";

export const MAX_ENTRY_CONTENT_CHARS = 2_000_000;

function clampEntryContent(entry: StudentSubmissionEntry): StudentSubmissionEntry {
  if (entry.content.length <= MAX_ENTRY_CONTENT_CHARS) return entry;
  return { ...entry, content: entry.content.slice(0, MAX_ENTRY_CONTENT_CHARS) };
}

export function withLinkNote(entry: StudentSubmissionEntry, linkFetch: "failed" | "flagged", repoReadNote: string): StudentSubmissionEntry {
  return clampEntryContent({ ...entry, content: `${entry.content}\n\n---\n\nNote: ${repoReadNote}`, repoReadNote, linkFetch });
}

export function withFoldedContent(entry: StudentSubmissionEntry, contentPart: string, files: SubmittedFileInfo[], extra: Partial<StudentSubmissionEntry>): StudentSubmissionEntry {
  return clampEntryContent({ ...entry, ...extra, content: `${entry.content}\n\n---\n\n${contentPart}`, submittedFiles: [...entry.submittedFiles, ...files], repoReadNote: null, linkFetch: "ok" });
}

type LinkIssue = { readonly status: "failed" | "flagged"; readonly note: string };

/** Preserve the strongest incomplete status when several repository links belong to one entry. */
export function inlineRepositoryIssue(repos: readonly { gradedRepo: string | null; repoReadNote: string | null }[]): LinkIssue | null {
  const issues = repos.filter((repo): repo is { gradedRepo: string | null; repoReadNote: string } => repo.repoReadNote !== null);
  if (!issues.length) return null;
  const notes = issues.slice(0, 3).map((issue) => issue.repoReadNote.slice(0, 500));
  if (issues.length > 3) notes.push(`And ${issues.length - 3} more repository link(s) need review.`);
  return { status: issues.some((issue) => issue.gradedRepo === null) ? "failed" : "flagged", note: notes.join(" ") };
}

/** Report unreadable files, unstaged videos and nested-link problems together. */
export function linkedArchiveIssue(unreadable: number, videos: number, nested: readonly StudentSubmissionEntry[]): LinkIssue | null {
  const notes: string[] = [];
  if (unreadable) notes.push(`The linked Drive archive could not be fully read (${unreadable} file(s) unreadable).`);
  if (videos) notes.push(unreadable || nested.length !== 1 ? `${videos} video file(s) were not available for grading.` : `The linked Drive archive contains ${videos} video file(s) that were not available for grading.`);
  const nestedIssues = nested.filter((entry) => entry.linkFetch === "failed" || entry.linkFetch === "flagged");
  for (const entry of nestedIssues.slice(0, 3)) notes.push((entry.repoReadNote ?? "A link inside the archive could not be fully read.").slice(0, 500));
  if (nestedIssues.length > 3) notes.push(`And ${nestedIssues.length - 3} more archive link(s) need review.`);
  if (!notes.length) return null;
  return { status: unreadable > 0 || nestedIssues.some((entry) => entry.linkFetch === "failed") ? "failed" : "flagged", note: notes.join(" ") };
}
