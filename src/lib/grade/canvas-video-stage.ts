import { VIDEO_EXTENSIONS } from "./constants";
import { VIDEO_HEAD_BYTES, sniffVideoContainer } from "./video-magic";
import { VIDEO_MAX_BYTES, VIDEO_MAX_PENDING_STAGED } from "./video-limits";
import { isVideoUploadPath, videoExtensionOf } from "./video-transport";
import type { VideoStaging } from "./video-leaf";

type CanvasVideo = { name: string; mimeType: string; base64: string };
type Dependencies = {
  allocate: (extension: string) => string;
  upload: (path: string, bytes: Buffer, mimeType: string) => Promise<boolean>;
  remove: (paths: string[]) => Promise<void>;
};
type StageResult =
  | { ok: true; files: Map<number, VideoStaging>; paths: string[] }
  | { ok: false; name: string; reason: string; cleanupFailed: boolean; uncertainPaths?: string[]; unremovedPaths?: string[] };

/** Prepare all Canvas videos for one student atomically; callers own returned paths. */
export async function stageCanvasVideos(userId: string, files: readonly CanvasVideo[], deps: Dependencies): Promise<StageResult> {
  const selected = files.flatMap((file, index) => {
    const ext = videoExtensionOf(file.name);
    return VIDEO_EXTENSIONS.has(ext) || file.mimeType.trim().toLowerCase().startsWith("video/") ? [{ file, index, ext }] : [];
  });
  if (selected.length > VIDEO_MAX_PENDING_STAGED) return { ok: false, name: selected[0].file.name, reason: "too many videos", cleanupFailed: false };
  const staged = new Map<number, VideoStaging>();
  const allocated: string[] = [];
  const uncertain: string[] = [];
  for (const { file, index, ext } of selected) {
    let reason = "unsupported video format";
    const encoded = file.base64;
    const valid = encoded.length > 0 && encoded.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded);
    const bytes = valid && encoded.length <= 4 * Math.ceil(VIDEO_MAX_BYTES / 3) ? Buffer.from(encoded, "base64") : null;
    if (bytes && bytes.length <= VIDEO_MAX_BYTES && bytes.toString("base64") === encoded) {
      const sniff = sniffVideoContainer(bytes.subarray(0, VIDEO_HEAD_BYTES), ext);
      if (sniff.ok) {
        const suffix = sniff.container === "quicktime" ? "mov" : sniff.container;
        let path = "";
        try { path = deps.allocate(suffix); } catch { /* Clean up any earlier uploads below. */ }
        if (isVideoUploadPath(userId, path) && !allocated.includes(path)) {
          allocated.push(path);
          try {
            if (await deps.upload(path, bytes, sniff.mimeType)) {
              staged.set(index, { videoRef: { storagePath: path, sizeBytes: bytes.length }, mimeType: sniff.mimeType });
              continue;
            }
          } catch { /* An uncertain upload must also be cleaned up. */ }
          uncertain.push(path);
          reason = "video upload failed";
        } else reason = "invalid storage allocation";
      }
    } else if (encoded.length > 4 * Math.ceil(VIDEO_MAX_BYTES / 3) || (bytes && bytes.length > VIDEO_MAX_BYTES)) reason = "video exceeds size limit";
    let cleanupFailed = false;
    try { if (allocated.length) await deps.remove(allocated); } catch { cleanupFailed = true; }
    return { ok: false, name: file.name, reason, cleanupFailed: cleanupFailed || uncertain.length > 0, ...(uncertain.length ? { uncertainPaths: uncertain } : {}), ...(cleanupFailed ? { unremovedPaths: allocated } : {}) };
  }
  return { ok: true, files: staged, paths: allocated };
}
