// Helpers for burning captions onto video frames; pure so they can be unit tested.

export type CaptionPosition = "top" | "middle" | "bottom";

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  position?: CaptionPosition;
}

export function activeCaptionAt(cues: CaptionCue[], timeSec: number): CaptionCue | null {
  for (const cue of cues) {
    if (cue.start <= timeSec && timeSec < cue.end) {
      return cue;
    }
  }
  return null;
}

export function wrapCaptionLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  if (!text.trim()) {
    return [];
  }

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = measure(candidate);

    if (width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is wider than maxWidth, put it on its own line
        lines.push(word);
        currentLine = "";
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export interface CaptionLayoutMetrics {
  fontPx: number;
  maxTextWidth: number;
  lineHeight: number;
  bottomMargin: number;
  topMargin: number;
  padX: number;
  padY: number;
}

export function captionLayout(canvasWidth: number, canvasHeight: number): CaptionLayoutMetrics {
  const fontPx = Math.max(14, Math.round(canvasHeight * 0.045));
  const maxTextWidth = Math.round(canvasWidth * 0.88);
  const lineHeight = Math.round(fontPx * 1.35);
  const bottomMargin = Math.round(canvasHeight * 0.05);
  const topMargin = Math.round(canvasHeight * 0.05);
  const padX = Math.round(fontPx * 0.55);
  const padY = Math.round(fontPx * 0.3);

  return { fontPx, maxTextWidth, lineHeight, bottomMargin, topMargin, padX, padY };
}

export function captionBlockBaselineY(
  canvasHeight: number,
  layout: CaptionLayoutMetrics,
  lineCount: number,
  position?: CaptionPosition
): number {
  const lines = lineCount;
  if (position === "middle") {
    return Math.round(canvasHeight / 2 + (lines * layout.lineHeight) / 2);
  } else if (position === "top") {
    return Math.round(layout.topMargin + layout.padY + lines * layout.lineHeight);
  }
  // bottom (default)
  return canvasHeight - layout.bottomMargin - layout.padY;
}

export function vttLineSetting(position?: CaptionPosition): string {
  if (position === "middle") {
    return " line:50%";
  } else if (position === "top") {
    return " line:8%";
  }
  return "";
}

/**
 * Waits until a video element has metadata (readyState >= 1).
 *
 * The point of this helper is the failure path: an offscreen <video> whose src
 * cannot load fires "error" and NEVER fires "loadedmetadata", so a bare
 * `addEventListener("loadedmetadata", resolve)` leaves its promise pending for
 * the life of the page - which the user sees as a button stuck on its busy
 * label. Every caller must be able to fail loudly instead of hanging.
 */
export async function awaitVideoMetadata(video: HTMLVideoElement, timeoutMs = 20000): Promise<void> {
  if (video.readyState >= 1) return;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to load. Try re-importing it, or convert it to MP4/WebM."));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };

    const onLoaded = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("The browser could not read this video. Try re-importing it, or convert it to MP4/WebM."));
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
}

/**
 * Waits until a video element actually has a frame to draw (readyState >= 2).
 *
 * Metadata is not enough for drawImage: at HAVE_METADATA the dimensions are
 * known but no frame is decoded, so the canvas comes back blank. That bites
 * exactly once per run and invisibly - the FIRST sample, at t=0, where the seek
 * is a no-op and nothing else forces a decode - and a blank first frame is
 * worse than a failure, because it reaches the vision model as if it were real
 * content. Finite-duration sources (mp4) are the exposed case: they take the
 * early return in ensureFiniteDuration and so never seek at all.
 */
export async function awaitVideoFrameData(video: HTMLVideoElement, timeoutMs = 20000): Promise<void> {
  if (video.readyState >= 2) return;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to load. Try re-importing it, or convert it to MP4/WebM."));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("canplay", onLoaded);
      video.removeEventListener("error", onError);
    };

    const onLoaded = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("The browser could not read this video. Try re-importing it, or convert it to MP4/WebM."));
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("canplay", onLoaded);
    video.addEventListener("error", onError);
  });
}

/**
 * Seeks a video and waits for the frame to be ready to draw.
 *
 * Two cases would otherwise hang a frame-sampling loop forever: seeking to the
 * time the video is ALREADY at (browsers may fire no "seeked" at all), and a
 * seek that never completes. The first is answered directly, the second by a
 * timeout that RESOLVES - a single stuck seek should cost one duplicated frame,
 * not the whole caption run. A load error still rejects, because past that
 * point no further frame can be drawn.
 *
 * Reports "stalled" rather than swallowing the timeout, so a caller sampling
 * many points can give up once stalling proves to be the rule instead of the
 * exception. Otherwise 24 stuck seeks would still add up to a four-minute wait
 * behind an unchanging progress label.
 */
export async function seekVideoTo(video: HTMLVideoElement, timeSec: number, timeoutMs = 10000): Promise<"seeked" | "stalled"> {
  if (Math.abs(video.currentTime - timeSec) < 0.001) return "seeked";

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve("stalled");
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const onSeeked = () => {
      cleanup();
      resolve("seeked");
    };

    const onError = () => {
      cleanup();
      reject(new Error("The browser could not read this video. Try re-importing it, or convert it to MP4/WebM."));
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = timeSec;
  });
}

export async function ensureFiniteDuration(video: HTMLVideoElement): Promise<number> {
  if (typeof video.duration === "number" && video.duration > 0 && isFinite(video.duration)) {
    return video.duration;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Could not determine the video duration."));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("seeked", onSeeked);
    };

    const onDurationChange = () => {
      if (typeof video.duration === "number" && video.duration > 0 && isFinite(video.duration)) {
        cleanup();
        finalizeDuration();
      }
    };

    const onSeeked = () => {
      if (typeof video.duration === "number" && video.duration > 0 && isFinite(video.duration)) {
        cleanup();
        finalizeDuration();
      }
    };

    const finalizeDuration = async () => {
      video.currentTime = 0;
      try {
        await new Promise<void>((res) => {
          video.addEventListener("seeked", () => res(), { once: true });
          setTimeout(() => res(), 100);
        });
      } catch {
        // Best effort
      }
      resolve(video.duration);
    };

    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Number.MAX_SAFE_INTEGER;
  });
}
