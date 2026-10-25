import { awaitVideoMetadata, awaitVideoFrameData, ensureFiniteDuration, seekVideoTo } from "@/lib/caption-burn";
import { EXTRACT_BATCH_WIRE_BUDGET, FRAME_JPEG_QUALITY, resolveTargetWidth } from "../recording/discussion-capture";
import { VIDEO_LOCAL_WAIT_MS, VideoReadError, videoWait } from "./walkthrough-video-limits";

export interface VideoReader {
  duration(signal: AbortSignal): Promise<number>;
  frame(time: number, signal: AbortSignal): Promise<string>;
  dispose(): void;
}

export function createVideoReader(blob: Blob): VideoReader {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  let disposed = false;
  return {
    async duration(signal) {
      await videoWait(() => awaitVideoMetadata(video, VIDEO_LOCAL_WAIT_MS), signal, VIDEO_LOCAL_WAIT_MS, "metadata-timeout");
      return videoWait(() => ensureFiniteDuration(video, signal), signal, VIDEO_LOCAL_WAIT_MS, "metadata-timeout");
    },
    async frame(time, signal) {
      if (disposed) throw new VideoReadError("cancelled");
      const seek = await videoWait(() => seekVideoTo(video, time), signal, VIDEO_LOCAL_WAIT_MS, "seek-timeout");
      if (seek !== "seeked") throw new VideoReadError("seek-stalled");
      await videoWait(() => awaitVideoFrameData(video, VIDEO_LOCAL_WAIT_MS), signal, VIDEO_LOCAL_WAIT_MS, "frame-timeout");
      if (!video.videoWidth || !video.videoHeight) throw new VideoReadError("unreadable-frame");
      canvas.width = resolveTargetWidth(video.videoWidth);
      canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
      const context = canvas.getContext("2d");
      if (!context) throw new VideoReadError("unreadable-frame");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      let base64 = canvas.toDataURL("image/jpeg", FRAME_JPEG_QUALITY).split(",")[1] ?? "";
      if (base64.length > EXTRACT_BATCH_WIRE_BUDGET) base64 = canvas.toDataURL("image/jpeg", FRAME_JPEG_QUALITY / 2).split(",")[1] ?? "";
      if (!base64 || base64.length > EXTRACT_BATCH_WIRE_BUDGET) throw new VideoReadError("frame-wire-limit");
      return base64;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      video.pause();
      // Existing bounded primitives remove their listeners on error as well as success.
      video.dispatchEvent(new Event("error"));
      video.removeAttribute("src");
      video.load();
      canvas.width = canvas.height = 0;
      URL.revokeObjectURL(url);
    },
  };
}
