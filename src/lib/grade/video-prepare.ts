// VIDEO-GRADING W2 (docs/video-grading-chat-intake-ops.md sections 3.1 and 3.3):
// the logic of POST /api/grade-submission-video, with every I/O dependency
// INJECTED (stat, head read, remove) so the fixed order is provable with fakes
// and vitest never dials out. The route wires the real Storage adapters.
//
// Order is FIXED and pinned by test: path validation (no Storage call on a bad
// path) -> size stat (over cap: refuse AND delete) -> head read -> magic-byte
// sniff (bad bytes: delete) -> entry. On success the object is NOT deleted:
// the grade request owns it. The entry carries a `videoRef`, never rawBase64
// (ops O-1).
import type { StudentSubmissionEntry } from "./types";
import { videoReceivedNote } from "./video-leaf";
import type { VideoFailureClass } from "./video-failure";
import { VIDEO_HEAD_BYTES, VIDEO_MAX_BYTES } from "./video-limits";
import { sniffVideoContainer } from "./video-magic";
import { isVideoUploadPath, videoExtensionOf } from "./video-transport";

const NAME_MAX_CHARS = 200;
const LABEL_MAX_CHARS = 500;

export interface PrepareVideoDeps {
  /** The stored object's size from Storage metadata, or null when unknown. */
  readonly statObjectSize: (storagePath: string) => Promise<number | null>;
  /** The first VIDEO_HEAD_BYTES of the object, or null when it cannot be read. */
  readonly readHead: (storagePath: string) => Promise<Uint8Array | null>;
  /** Best-effort removal; must not throw. */
  readonly remove: (storagePaths: string[]) => Promise<void>;
}

export type PrepareVideoResult =
  | { readonly ok: true; readonly entry: StudentSubmissionEntry }
  | { readonly ok: false; readonly status: number; readonly message: string; readonly failure: VideoFailureClass | null };

export const VIDEO_NOT_FOUND_MESSAGE = "That video upload could not be found. Please upload it again.";
export const VIDEO_TOO_LARGE_MESSAGE = "This video is over the size limit, so nothing was graded. Trim or compress it, then try again.";
export const VIDEO_BAD_FORMAT_MESSAGE =
  "This video could not be read as an mp4, webm or mov file, so nothing was graded.";

/** A display name safe to put in an entry: last path segment, control chars dropped, capped. */
export function sanitizeVideoName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const last = raw.split(/[\\/]/).pop() ?? "";
  let cleaned = "";
  for (const ch of last) {
    const code = ch.charCodeAt(0);
    cleaned += code < 32 || code === 127 ? "" : ch;
  }
  cleaned = cleaned.trim();
  if (cleaned.length === 0) return fallback;
  return cleaned.length > NAME_MAX_CHARS ? cleaned.slice(0, NAME_MAX_CHARS) : cleaned;
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export async function prepareLooseVideo(args: {
  readonly userId: string;
  readonly storagePath: unknown;
  readonly name?: unknown;
  readonly label?: unknown;
  readonly deps: PrepareVideoDeps;
}): Promise<PrepareVideoResult> {
  const { userId, deps } = args;
  const storagePath = args.storagePath;

  // 1. Path contract, BEFORE any Storage call.
  if (typeof storagePath !== "string" || !isVideoUploadPath(userId, storagePath)) {
    return { ok: false, status: 400, message: VIDEO_NOT_FOUND_MESSAGE, failure: null };
  }

  // 2. Size gate on the stored object. Unknown size fails closed: the cap
  // cannot be shown to hold, so the video is not accepted.
  const size = await deps.statObjectSize(storagePath);
  if (size === null) {
    return { ok: false, status: 404, message: VIDEO_NOT_FOUND_MESSAGE, failure: "upload failed" };
  }
  if (size > VIDEO_MAX_BYTES) {
    await deps.remove([storagePath]);
    return { ok: false, status: 413, message: VIDEO_TOO_LARGE_MESSAGE, failure: "too large" };
  }

  // 3. Head read + magic-byte sniff. The bytes decide; the name never does.
  const head = await deps.readHead(storagePath);
  if (head === null) {
    return { ok: false, status: 502, message: VIDEO_NOT_FOUND_MESSAGE, failure: "upload failed" };
  }
  const extension = videoExtensionOf(storagePath);
  const sniff = sniffVideoContainer(head.subarray(0, VIDEO_HEAD_BYTES), extension);
  if (!sniff.ok) {
    await deps.remove([storagePath]);
    return { ok: false, status: 415, message: VIDEO_BAD_FORMAT_MESSAGE, failure: "unsupported format" };
  }

  // 4. The entry: a ref, never bytes.
  const name = sanitizeVideoName(args.name, `video.${extension}`);
  const label = typeof args.label === "string" ? args.label.trim().slice(0, LABEL_MAX_CHARS) : "";
  const note = videoReceivedNote(name, size, sniff.container);
  return {
    ok: true,
    entry: {
      student: label.length > 0 ? label : stemOf(name),
      content: `File: ${name}\n\n${note}`,
      mergedFileCount: 1,
      submittedFiles: [
        {
          name,
          extension,
          previewContent: note,
          previewTruncated: false,
          mimeType: sniff.mimeType,
          videoRef: { storagePath, sizeBytes: size },
        },
      ],
    },
  };
}

/**
 * Reads at least `VIDEO_HEAD_BYTES` from a URL and cancels the rest. The URL is
 * minted by the route from a VALIDATED path (never client-supplied). Does not
 * rely on Range support: a server that ignores Range streams from byte 0 and
 * the body is cancelled once enough bytes are in hand. `fetchImpl` is injected.
 */
export async function readObjectHead(
  url: string,
  fetchImpl: (url: string, init: { headers: Record<string, string> }) => Promise<{
    ok: boolean;
    body: ReadableStream<Uint8Array> | null;
  }>
): Promise<Uint8Array | null> {
  try {
    const response = await fetchImpl(url, { headers: { Range: `bytes=0-${VIDEO_HEAD_BYTES - 1}` } });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let have = 0;
    while (have < VIDEO_HEAD_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        have += value.length;
      }
    }
    await reader.cancel().catch(() => undefined);
    const head = new Uint8Array(Math.min(have, VIDEO_HEAD_BYTES));
    let at = 0;
    for (const chunk of chunks) {
      const take = Math.min(chunk.length, head.length - at);
      if (take <= 0) break;
      head.set(chunk.subarray(0, take), at);
      at += take;
    }
    return head;
  } catch {
    return null;
  }
}
