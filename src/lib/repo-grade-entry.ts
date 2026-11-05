import "server-only";

import type { StudentSubmissionEntry, SubmittedFileInfo } from "@/lib/grade/types";

type RepoFile = { path: string; content: string; truncated: boolean };
type RepoDigest = { fullName: string; text: string; fileCount: number; files: RepoFile[] };

/** Convert a repository digest into an entry for either grading engine. */
export function repoDigestToEmbeddedEntry(digest: RepoDigest, label?: string): StudentSubmissionEntry {
  const submittedFiles: SubmittedFileInfo[] = digest.files.map((file) => {
    const name = file.path.split("/").pop() || file.path;
    const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    return {
      name: file.path,
      extension,
      previewContent: file.content,
      // Carry the truncation computed by ingestRepo through to the preview.
      previewTruncated: file.truncated,
      mimeType: "text/plain",
    };
  });
  return {
    student: label?.trim() || digest.fullName,
    content: digest.text,
    mergedFileCount: digest.fileCount,
    submittedFiles,
  };
}
