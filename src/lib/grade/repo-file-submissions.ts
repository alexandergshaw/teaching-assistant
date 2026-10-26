import type { SubmittedFileInfo } from "./types";
export function repoFilesToSubmittedFiles(files: readonly { path: string; text: string; truncated?: boolean }[]): SubmittedFileInfo[] {
  return files.map((file) => {
    const base = file.path.split("/").pop() ?? file.path;
    const dot = base.lastIndexOf(".");
    return { name: file.path, extension: dot <= 0 || dot === base.length - 1 ? "" : base.slice(dot + 1).toLowerCase(), previewContent: file.text, previewTruncated: file.truncated ?? false, mimeType: "text/plain" };
  });
}