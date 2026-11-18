import "server-only";
import { fetchGradableRepoContent } from "./repo-content";
import { repoFilesToSubmittedFiles } from "./repo-file-submissions";
import { mergeCompositeEntries } from "@/app/components/grading-chat/chatSubmissionIntake";
import type { StudentSubmissionEntry } from "./types";

/** Rebuild the one-part intake representation; never discard companion evidence. */
export async function isExactNotebookRepositoryEntry(entry: unknown, url: string, commit: string): Promise<boolean> {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const actual = entry as StudentSubmissionEntry;
  if (typeof actual.student !== "string" || actual.submissionUrl !== url) return false;
  const repo = await fetchGradableRepoContent(url);
  if ("error" in repo || repo.ref.toLowerCase() !== commit.toLowerCase()) return false;
  const expected = mergeCompositeEntries([{ student: repo.repo, content: repo.content, mergedFileCount: repo.fileCount, submittedFiles: repoFilesToSubmittedFiles(repo.files), repositoryInventories: repo.inventory ? [repo.inventory] : undefined }], actual.student);
  return JSON.stringify([actual.content, actual.mergedFileCount, actual.submittedFiles, actual.repositoryInventories]) === JSON.stringify([expected.content, expected.mergedFileCount, expected.submittedFiles, expected.repositoryInventories]);
}
