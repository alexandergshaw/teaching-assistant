// Pure geometry helpers for the Loom-style webcam bubble (AC9, AC10). Kept out
// of the draw loop so the math is unit-testable without a canvas: a NaN or
// zero dimension reaching drawImage throws inside the frame ticker and
// silently ends compositing mid-recording (trap 10), so every function here
// guards its inputs and returns an inert, all-zero result instead of NaN.

export interface BubbleRect {
  x: number;
  y: number;
  size: number;
}

export interface BubbleCrop {
  sx: number;
  sy: number;
  sSide: number;
}

// Fraction of canvas width the bubble diameter/side occupies. "md" (0.22) is
// today's rectangle width, kept unchanged so an existing user sees no size
// change when the shape switches to circle (AC11).
export const BUBBLE_SIZE_FRACTIONS: Readonly<Record<"sm" | "md" | "lg", number>> = {
  sm: 0.16,
  md: 0.22,
  lg: 0.30,
};

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

// The bubble's on-canvas box for a given corner. Diameter/side is
// round(canvasW * sizeFraction) per AC9; the corner margin reuses the
// existing 2%-of-canvas-width inset the rectangular PiP block already used.
export function bubbleRect(
  canvasW: number,
  canvasH: number,
  corner: "br" | "bl" | "tr" | "tl",
  sizeFraction: number,
): BubbleRect {
  if (!isPositiveFinite(canvasW) || !isPositiveFinite(canvasH) || !isPositiveFinite(sizeFraction)) {
    return { x: 0, y: 0, size: 0 };
  }

  const size = Math.round(canvasW * sizeFraction);
  const margin = Math.round(canvasW * 0.02);

  let x = margin;
  let y = margin;
  if (corner === "br") {
    x = canvasW - size - margin;
    y = canvasH - size - margin;
  } else if (corner === "bl") {
    x = margin;
    y = canvasH - size - margin;
  } else if (corner === "tr") {
    x = canvasW - size - margin;
    y = margin;
  } else if (corner === "tl") {
    x = margin;
    y = margin;
  }

  return { x, y, size };
}

// The largest centred square of the source video, so a circular (or square)
// clip never squashes a non-square frame (AC9). Returns an all-zero crop for
// any non-finite or non-positive dimension; the caller (drawWebcamBubble)
// must skip the draw in that case rather than pass it to drawImage.
export function coverCrop(videoW: number, videoH: number): BubbleCrop {
  if (!isPositiveFinite(videoW) || !isPositiveFinite(videoH)) {
    return { sx: 0, sy: 0, sSide: 0 };
  }

  const sSide = Math.min(videoW, videoH);
  const sx = Math.round((videoW - sSide) / 2);
  const sy = Math.round((videoH - sSide) / 2);

  return { sx, sy, sSide };
}
