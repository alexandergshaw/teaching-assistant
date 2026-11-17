import { getFileExtension } from "../office-extract";
import { extractCanvasSubmittedUrl } from "./canvas-link-submission";

/** Rewrite Canvas link pages without fetching and retain their original URLs. */
export function deferLinkSubmissions(submissions: Record<string, string>): Map<string, string> {
  const urlByPath = new Map<string, string>();
  for (const path of Object.keys(submissions)) {
    const extension = getFileExtension(path);
    if (extension !== "html" && extension !== "htm") continue;
    const url = extractCanvasSubmittedUrl(submissions[path]);
    if (!url) continue;
    urlByPath.set(path, url);
    submissions[path] = `Submitted link: ${url}`;
  }
  return urlByPath;
}
