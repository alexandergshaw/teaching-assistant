import type { SubmittedFileInfo } from "./types";
export function repoFilesToSubmittedFiles(files: readonly { path: string; text: string; truncated?: boolean }[]): SubmittedFileInfo[] {
  return files.map((file) => {
    const dot = file.path.lastIndexOf(".");
    return { name: file.path, extension: dot < 0 || dot === file.path.length - 1 ? "" : file.path.slice(dot + 1).toLowerCase(), previewContent: file.text, previewTruncated: file.truncated ?? false, mimeType: "text/plain" };
  });
}