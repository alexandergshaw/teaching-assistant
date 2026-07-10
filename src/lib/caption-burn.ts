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
