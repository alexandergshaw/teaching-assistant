// VIDEO-GRADING W2 (docs/video-grading-chat-intake-ops.md sections 3.2 and 5.2):
// the pure halves of the in-zip video member - the per-zip COUNT cap and the
// sniff-then-stage step. Kept out of extraction.ts (918 lines) and kept free
// of network and Storage imports: staging is an INJECTED function, so the
// extractor stays testable with plain fakes and the in-zip path stages
// server-side only because the ingest route hands it one.
//
// A video never carries bytes on the entry (ops O-1): the bytes are handed to
// `stageVideo` and dropped; what survives is a Storage path and a size.
import { ZIP_MAX_VIDEO_MEMBERS, ZipCapError, type PlannedZipMember } from "@/lib/zip-caps";
import { formatMB } from "@/lib/upload-budget";
import type { VideoRef } from "./types";
import { isVideoName } from "./video-grading";
import type { VideoFailureClass } from "./video-failure";
import { VIDEO_HEAD_BYTES, sniffVideoContainer, type VideoContainer } from "./video-magic";

export type StageVideoResult = { readonly storagePath: string } | { readonly failure: VideoFailureClass };

/** Stages one extracted video's bytes to private Storage (injected by the route). */
export type StageVideoFn = (bytes: Buffer, container: VideoContainer) => Promise<StageVideoResult>;

/** What survives of an accepted in-zip video: where it lives and its sniffed MIME. */
export interface VideoStaging {
  readonly videoRef: VideoRef;
  readonly mimeType: string;
}

/** The text a received video contributes to its entry. Name, size and
 * container only; never bytes. Shared by the in-zip leaf and the loose route. */
export function videoReceivedNote(baseName: string, sizeBytes: number, container: VideoContainer): string {
  return `[Video file: ${baseName}, ${formatMB(sizeBytes)}, ${container}]`;
}

export type VideoMemberResult =
  | { readonly ok: true; readonly note: string; readonly staging: VideoStaging }
  | { readonly ok: false; readonly failure: VideoFailureClass };

/**
 * Sniffs the member's bytes (the trust decision is the BYTES, never the name),
 * then stages them. One bad video is one failed file: a sniff miss is
 * `unsupported format`, a thrown or failed stage is `upload failed` (or the
 * class the stager reported, e.g. `timed out`).
 */
export async function stageVideoMember(args: {
  readonly bytes: Buffer;
  readonly extension: string;
  readonly baseName: string;
  readonly stageVideo: StageVideoFn;
}): Promise<VideoMemberResult> {
  const sniff = sniffVideoContainer(args.bytes.subarray(0, VIDEO_HEAD_BYTES), args.extension);
  if (!sniff.ok) return { ok: false, failure: "unsupported format" };
  let staged: StageVideoResult;
  try {
    staged = await args.stageVideo(args.bytes, sniff.container);
  } catch {
    return { ok: false, failure: "upload failed" };
  }
  if ("failure" in staged) return { ok: false, failure: staged.failure };
  return {
    ok: true,
    note: videoReceivedNote(args.baseName, args.bytes.length, sniff.container),
    staging: {
      videoRef: { storagePath: staged.storagePath, sizeBytes: args.bytes.length },
      mimeType: sniff.mimeType,
    },
  };
}

/**
 * The per-zip video COUNT cap (ops section 5.2). Called with ONE archive
 * level's planned members straight after the plan pass and BEFORE any member
 * is read, with the running total of every level seen so far. Returns the new
 * running total; throws a whole-archive ZipCapError `video-count` when it
 * exceeds `max`. Counts only members the extractor will treat as leaves.
 */
export function chargeVideoCount(
  planned: readonly PlannedZipMember[],
  runningTotal: number,
  chain: readonly string[],
  max: number = ZIP_MAX_VIDEO_MEMBERS
): number {
  let total = runningTotal;
  for (const member of planned) {
    if (member.kind !== "leaf" || !isVideoName(member.name)) continue;
    total += 1;
    if (total > max) {
      throw new ZipCapError({
        code: "video-count",
        entryName: member.fullName,
        chain,
        limitName: "ZIP_MAX_VIDEO_MEMBERS",
        limitValue: max,
        limitIsBytes: false,
        observed: total,
      });
    }
  }
  return total;
}
