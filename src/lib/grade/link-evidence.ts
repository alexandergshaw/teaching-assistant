import type { StudentSubmissionEntry, SubmittedFileInfo } from "./types";

export const MAX_ENTRY_CONTENT_CHARS = 2_000_000;

function clampEntryContent(entry: StudentSubmissionEntry): StudentSubmissionEntry {
  if (entry.content.length <= MAX_ENTRY_CONTENT_CHARS) return entry;
  return { ...entry, content: entry.content.slice(0, MAX_ENTRY_CONTENT_CHARS),
    linkFetch: entry.linkFetch === "failed" ? "failed" : "flagged",
    repoReadNote: [entry.repoReadNote, "Linked submission content exceeded the intake limit and was truncated."].filter(Boolean).join(" ") };
}

export function withLinkNote(entry: StudentSubmissionEntry, linkFetch: "failed" | "flagged", repoReadNote: string): StudentSubmissionEntry {
  return clampEntryContent({ ...entry, content: `${entry.content}\n\n---\n\nNote: ${repoReadNote}`, repoReadNote, linkFetch });
}

export function withFoldedContent(entry: StudentSubmissionEntry, contentPart: string, files: SubmittedFileInfo[], extra: Partial<StudentSubmissionEntry>): StudentSubmissionEntry {
  return clampEntryContent({ ...entry, ...extra, content: `${entry.content}\n\n---\n\n${contentPart}`, submittedFiles: [...entry.submittedFiles, ...files], repoReadNote: null, linkFetch: "ok" });
}

export type LinkIssue = { readonly status: "failed" | "flagged"; readonly note: string };

export function mergeLinkIssues(issues: readonly LinkIssue[]): LinkIssue | null {
  if (!issues.length) return null;
  const prioritized = [...issues.filter((issue) => issue.status === "failed"), ...issues.filter((issue) => issue.status === "flagged")];
  const notes = prioritized.slice(0, 3).map((issue) => issue.note.slice(0, 500));
  if (issues.length > 3) notes.push(`And ${issues.length - 3} more submission link(s) need review.`);
  return { status: issues.some((issue) => issue.status === "failed") ? "failed" : "flagged", note: notes.join(" ") };
}

/** Preserve the strongest incomplete status when several repository links belong to one entry. */
export function inlineRepositoryIssue(repos: readonly { gradedRepo: string | null; repoReadNote: string | null }[]): LinkIssue | null {
  const issues = repos.filter((repo): repo is { gradedRepo: string | null; repoReadNote: string } => repo.repoReadNote !== null);
  if (!issues.length) return null;
  const prioritized = [...issues.filter((issue) => issue.gradedRepo === null), ...issues.filter((issue) => issue.gradedRepo !== null)];
  const notes = prioritized.slice(0, 3).map((issue) => issue.repoReadNote.slice(0, 500));
  if (issues.length > 3) notes.push(`And ${issues.length - 3} more repository link(s) need review.`);
  return { status: issues.some((issue) => issue.gradedRepo === null) ? "failed" : "flagged", note: notes.join(" ") };
}

/** Report unreadable files, unstaged videos and nested-link problems together. */
export function linkedArchiveIssue(unreadable: number, videos: number, nested: readonly StudentSubmissionEntry[], unsupported = 0): LinkIssue | null {
  const notes: string[] = [];
  if (unreadable) notes.push(`The linked Drive archive could not be fully read (${unreadable} file(s) unreadable).`);
  if (unsupported) notes.push(`The linked Drive archive contains ${unsupported} file(s) with unsupported types.`);
  if (videos) notes.push(unreadable || nested.length !== 1 ? `${videos} video file(s) were not available for grading.` : `The linked Drive archive contains ${videos} video file(s) that were not available for grading.`);
  const nestedIssues = nested.filter((entry) => entry.linkFetch === "failed" || entry.linkFetch === "flagged");
  const prioritized = [...nestedIssues.filter((entry) => entry.linkFetch === "failed"), ...nestedIssues.filter((entry) => entry.linkFetch === "flagged")];
  for (const entry of prioritized.slice(0, 3)) notes.push((entry.repoReadNote ?? "A link inside the archive could not be fully read.").slice(0, 500));
  if (nestedIssues.length > 3) notes.push(`And ${nestedIssues.length - 3} more archive link(s) need review.`);
  if (!notes.length) return null;
  return { status: unreadable > 0 || nestedIssues.some((entry) => entry.linkFetch === "failed") ? "failed" : "flagged", note: notes.join(" ") };
}
