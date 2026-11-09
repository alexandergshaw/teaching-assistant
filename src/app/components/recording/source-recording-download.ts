import { extForMime, stripMatchingExt } from "@/lib/recording-files";
import { triggerFileDownload } from "../course-planning/utils";
import type { Take } from "./types";
import { mediaCategory, recordTakeDiagnostic } from "./take-announcement-diagnostics";

/** Download the selected take itself, never an announcement or a different take.
 * Success means the browser download was dispatched, not that it reached disk. */
export async function downloadSourceRecording(take: Pick<Take, "url" | "name" | "mimeType">): Promise<void> {
  const started = Date.now();
  const category = mediaCategory(take.mimeType || "");
  let original: Blob;
  try {
    if (!take.url) throw new Error("missing");
    const response = await fetch(take.url);
    if (!response.ok) throw new Error("Unavailable");
    original = await response.blob();
    if (original.size === 0) throw new Error("empty");
    recordTakeDiagnostic("source_response", true, started, { mediaCategory: category });
  } catch (error) {
    recordTakeDiagnostic("source_response", false, started, { mediaCategory: category });
    if (error instanceof Error && error.message === "missing") throw new Error("The source recording is no longer available.");
    if (error instanceof Error && error.message === "empty") throw new Error("The source recording is empty or unavailable.");
    throw new Error("Could not retrieve the source recording. Please try again.");
  }
  const responseType = original.type.toLowerCase();
  const mimeType = responseType && responseType !== "application/octet-stream"
    ? original.type : take.mimeType || "application/octet-stream";
  const blob = original.type === mimeType ? original : new Blob([original], { type: mimeType });
  const normalizedMime = mimeType.toLowerCase().split(";")[0].trim();
  const extension = normalizedMime === "audio/ogg" || normalizedMime === "video/ogg" ? "ogg"
    : normalizedMime === "audio/webm" || normalizedMime === "video/webm" ? "webm"
    : /^(audio|video)\/(mpeg|wav|x-wav|mp4|quicktime|x-matroska)$/.test(normalizedMime) ? extForMime(normalizedMime)
    : "bin";
  const name = stripMatchingExt(take.name.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, "_"), extension) || "recording";
  const dispatchStarted = Date.now();
  try {
    triggerFileDownload(blob, `${name}.${extension}`);
    recordTakeDiagnostic("download_dispatch", true, dispatchStarted, { mediaCategory: category });
  } catch {
    recordTakeDiagnostic("download_dispatch", false, dispatchStarted, { mediaCategory: category });
    throw new Error("Could not start the download. Please try again.");
  }
}
