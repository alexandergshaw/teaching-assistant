import { extForMime, stripMatchingExt } from "@/lib/recording-files";
import { triggerFileDownload } from "../course-planning/utils";
import type { Take } from "./types";

/** Download the selected take itself, never an announcement or a different take.
 * Success means the browser download was dispatched, not that it reached disk. */
export async function downloadSourceRecording(take: Pick<Take, "url" | "name" | "mimeType">): Promise<void> {
  if (!take.url) throw new Error("The source recording is no longer available.");
  let response: Response;
  try {
    response = await fetch(take.url);
  } catch {
    throw new Error("Could not retrieve the source recording. Please try again.");
  }
  if (!response.ok) throw new Error("Could not retrieve the source recording. Please try again.");
  let original: Blob;
  try {
    original = await response.blob();
  } catch {
    throw new Error("Could not retrieve the source recording. Please try again.");
  }
  if (original.size === 0) throw new Error("The source recording is empty or unavailable.");
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
  try {
    triggerFileDownload(blob, `${name}.${extension}`);
  } catch {
    throw new Error("Could not start the download. Please try again.");
  }
}
