// VIDEO-GRADING W2 (docs/video-grading-chat-intake-ops.md section 5): the video
// caps, single-sourced. Every quantity has ONE definition; where it is the same
// quantity as a zip cap it is defined BY IMPORT so the two cannot drift.
// Client-safe: imports only the zip-caps constants leaf.
import { ZIP_MAX_MEMBER_DECLARED_BYTES } from "@/lib/zip-caps";

export { VIDEO_HEAD_BYTES } from "./video-magic";

/**
 * The largest accepted single video, on all three paths (loose, loose-multi,
 * in-zip). The SAME quantity as the per-member zip cap, so it is imported, not
 * restated (ops D2). A size is refused iff `size > VIDEO_MAX_BYTES`.
 */
export const VIDEO_MAX_BYTES = ZIP_MAX_MEMBER_DECLARED_BYTES;

/**
 * Loose videos staged and not yet graded or failed in one session (ops D5,
 * section 5.3). Keeps the worst queue wait far under the orphan-sweep
 * threshold. Counts the videos ALREADY pending: a submit is refused when the
 * count has reached this value.
 */
export const VIDEO_MAX_PENDING_STAGED = 6;
