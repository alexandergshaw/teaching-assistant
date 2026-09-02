// The announcement's companion image (owner's ask: "a simple, everyday image
// that is relevant"). Split out of useTakeAnnouncement.ts, which was
// approaching recording-split.structure.test.ts's 1000-line ceiling on this
// directory - see that file's own header for the running account of what has
// already moved out of it and why.
//
// Same shape as takeAnnouncementTranscription.ts's own split: useTakeAnnouncement.ts
// still OWNS every piece of state this pipeline touches (imageState,
// imageBase64, imageMimeType, imageError, the log array, the
// auto-generation-attempted ref) - this module only takes those setters and
// current values in explicitly, through an AnnouncementImageDeps object built
// fresh at each call site, rather than closing over the hook's scope. That
// keeps this file a plain leaf with no React state of its own, importable
// from useTakeAnnouncement.ts with no hook-identity or stale-closure concerns.
//
// Never persisted (not localStorage, not the message draft payload) - the
// "no base64 image in localStorage" constraint this feature was built under
// (see upload-budget.ts's own header on wire-size discipline; the reply-table
// persistence's quota-failure path already proves far smaller payloads can
// blow a localStorage quota). The image lives only as long as the hook is
// mounted for a given take; closing the panel and reopening it re-generates
// rather than restoring - a deliberate simplification, not an oversight.
//
// The image DOES post, as of the wave that added it: useTakeAnnouncement.ts's
// own commitPost() passes a "ready" image to createAnnouncementAction's
// optional image argument - this module has no involvement in posting itself,
// only in producing (or discarding, or downloading) the image that posting
// may later pick up.
//
// downloadImage below is the image's other real destination: posting to
// Canvas never carries the image as a standalone attachment, so the
// instructor can download it here and attach it themselves wherever they are
// posting.

import type { AnnouncementLogImageAttempt } from "./announcement-log";
import { generateAnnouncementImageAction } from "@/app/actions/announcement-image";
import { buildAnnouncementImagePrompt } from "@/lib/take-announcement";
import { announcementImageFileName } from "./announcement-image-filename";
import { triggerFileDownload } from "../course-planning/utils";

export interface AnnouncementImageDeps {
  subject: string;
  body: string;
  imageBase64: string | null;
  imageMimeType: string | null;
  setImageState: (state: "idle" | "generating" | "ready" | "failed") => void;
  setImageBase64: (v: string | null) => void;
  setImageMimeType: (v: string | null) => void;
  setImageError: (v: string | null) => void;
  setLogImageAttempts: (
    update: (prev: AnnouncementLogImageAttempt[]) => AnnouncementLogImageAttempt[]
  ) => void;
  autoImageAttemptedRef: React.MutableRefObject<boolean>;
}

/**
 * Calls generateAnnouncementImageAction with a prompt built from the CURRENT
 * subject/body (buildAnnouncementImagePrompt, src/lib/take-announcement.ts) -
 * always the announcement actually on screen, whether that came from the
 * auto-drafted text, a regenerate, or the instructor's own edits to the
 * Subject/Message fields. Never throws (announcement-image.ts's own
 * discipline); every failure lands in imageError with a specific message, and
 * the drafted announcement text itself is completely untouched either way.
 */
export async function generateImage(deps: AnnouncementImageDeps): Promise<void> {
  deps.setImageState("generating");
  deps.setImageError(null);
  const prompt = buildAnnouncementImagePrompt(deps.subject, deps.body);
  const result = await generateAnnouncementImageAction(prompt);
  if ("error" in result) {
    deps.setLogImageAttempts((prev) => [...prev, { at: new Date().toISOString(), outcome: "failed", error: result.error }]);
    deps.setImageState("failed");
    deps.setImageError(result.error);
    deps.setImageBase64(null);
    deps.setImageMimeType(null);
    return;
  }
  deps.setLogImageAttempts((prev) => [...prev, { at: new Date().toISOString(), outcome: "generated", error: "" }]);
  deps.setImageState("ready");
  deps.setImageBase64(result.base64);
  deps.setImageMimeType(result.mimeType);
}

/** Explicit "Regenerate image" control (TakeAnnouncementPanel.tsx) - replaces
 * whatever image is currently shown (ready, failed, or none) with a fresh
 * attempt against the CURRENT subject/body. Marks the auto-attempt ref used
 * so useTakeAnnouncement.ts's review-stage effect never fires a second,
 * redundant attempt on top of this explicit one. */
export function regenerateImage(deps: AnnouncementImageDeps): void {
  deps.autoImageAttemptedRef.current = true;
  void generateImage(deps);
}

/** Explicit "Remove image" control - clears the image companion without
 * touching subject/body or re-attempting generation. The instructor can still
 * post (or save to drafts) with no image at all; this is the control that
 * makes that a real choice rather than only a byproduct of a failure. */
export function discardImage(deps: AnnouncementImageDeps): void {
  deps.autoImageAttemptedRef.current = true;
  deps.setLogImageAttempts((prev) => [...prev, { at: new Date().toISOString(), outcome: "discarded", error: "" }]);
  deps.setImageState("idle");
  deps.setImageBase64(null);
  deps.setImageMimeType(null);
  deps.setImageError(null);
}

/** "Download image" control (TakeAnnouncementPanel.tsx) - the image's only
 * real destination described in this file's own header: posting to Canvas
 * never carries it as a standalone attachment, so the instructor downloads it
 * here and attaches it themselves wherever they are posting. Decodes the
 * base64 the same way this repo's other client-side downloads already do
 * (Uint8Array.from(atob(...), c => c.charCodeAt(0)) - see e.g.
 * FinalizedSyllabusLibrary.tsx's downloadDocx) into a Blob, names it via
 * announcementImageFileName (a pure leaf, unit-tested with frozen literals),
 * and hands both to triggerFileDownload - never a hand-rolled
 * createObjectURL/anchor/click/revoke dance. A no-op when there is no ready
 * image (imageBase64/imageMimeType null) - TakeAnnouncementPanel.tsx only
 * ever renders the control that calls this inside the "ready" branch, so that
 * should never happen in practice; the guard is defense in depth, not the
 * primary gate. */
export function downloadImage(deps: AnnouncementImageDeps): void {
  if (!deps.imageBase64 || !deps.imageMimeType) return;
  const bytes = Uint8Array.from(atob(deps.imageBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: deps.imageMimeType });
  triggerFileDownload(blob, announcementImageFileName(deps.subject, deps.imageMimeType));
}
