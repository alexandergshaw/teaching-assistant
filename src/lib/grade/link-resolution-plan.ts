/**
 * BULK-ZIP BW3: the pure per-type verdict for a submitted link. String logic
 * only - no fetch, no Buffer, no server-only imports - so it is unit-testable
 * and importable anywhere. It decides ONLY whether a URL is worth a fetch and
 * through which allowlisted resolver; the resolver itself (resolveEntryLinks in
 * ./extraction) owns the fetch and the post-fetch checks.
 *
 * "drive-file" is a URL-SHAPE verdict only: a drive.google.com/file/d/<id> may
 * secretly be a zip archive, which this leaf cannot know. That case is caught
 * by the post-fetch single-entry guard in resolveEntryLinks.
 */
import { parseSubmissionGithubUrl } from "../submission-repo";
import { parseGoogleDriveUrl } from "../google-drive-url";
import { normalizeSubmittedRepoUrl } from "./canvas-link-submission";

export type LinkResolutionAction = "github" | "drive-doc" | "drive-file" | "flag";

export interface LinkResolutionPlan {
  readonly action: LinkResolutionAction;
  /** Present on every "flag" verdict: why the link will not be fetched. */
  readonly reason?: string;
}

export function planLinkResolution(url: string): LinkResolutionPlan {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return { action: "flag", reason: "no link was provided" };

  if (!("error" in parseSubmissionGithubUrl(normalizeSubmittedRepoUrl(trimmed)))) {
    return { action: "github" };
  }

  const drive = parseGoogleDriveUrl(trimmed);
  if (drive) {
    if (drive.kind === "folder") {
      return { action: "flag", reason: "a Google Drive folder cannot be graded as one submission" };
    }
    if (drive.kind === "native-doc") {
      if (drive.docType !== "document") {
        return { action: "flag", reason: "Google Sheets and Slides links are not supported" };
      }
      return { action: "drive-doc" };
    }
    return { action: "drive-file" };
  }

  return { action: "flag", reason: "automatic fetch is not supported for this host" };
}
