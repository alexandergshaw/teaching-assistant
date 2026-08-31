// THE one webcam-bubble compositor (AC17): both the live screen-source
// preview/recording pipeline (useCanvasPipeline) and the walkthrough pipeline
// import this so the bubble looks identical in both places rather than
// drifting apart as two copies.

import { bubbleRect, coverCrop } from "./bubble-geometry";

export interface BubbleDrawOptions {
  shape: "circle" | "rounded";
  corner: "br" | "bl" | "tr" | "tl";
  sizeFraction: number;
  mirror: boolean;
}

type RoundRectCtx = CanvasRenderingContext2D & {
  roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
};

function tracePath(ctx: CanvasRenderingContext2D, shape: "circle" | "rounded", x: number, y: number, size: number) {
  ctx.beginPath();
  if (shape === "circle") {
    const r = size / 2;
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  } else {
    const rc = ctx as RoundRectCtx;
    const radius = Math.round(size * 0.18);
    if (rc.roundRect) {
      rc.roundRect(x, y, size, size, radius);
    } else {
      ctx.rect(x, y, size, size);
    }
  }
}

// Draws the circular (or rounded-square) webcam bubble into `ctx` at the
// corner/size the caller asks for. A cover-fit crop keeps a non-square video
// from looking squashed inside the clip (AC9). Guards against every input
// that would otherwise reach drawImage as NaN or zero and throw, silently
// ending the whole frame ticker (trap 10): an unready video, and a crop or
// rect that comes back all-zero from bubble-geometry's own guards.
export function drawWebcamBubble(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvasW: number,
  canvasH: number,
  opts: BubbleDrawOptions,
): void {
  if (video.readyState < 2) return;

  const crop = coverCrop(video.videoWidth, video.videoHeight);
  if (crop.sSide <= 0) return;

  const rect = bubbleRect(canvasW, canvasH, opts.corner, opts.sizeFraction);
  if (rect.size <= 0) return;

  const { x, y, size } = rect;

  ctx.save();
  try {
    // B3/AC12: a shadow paints OUTSIDE the shape it is cast from, so it must
    // be painted BEFORE any clip to that same shape is in force - clipping
    // first (the previous bug) removes 100% of it, since the clip region
    // has no outside for the shadow to occupy. Fill the path once, while
    // the shadow is active and nothing is clipped, to cast it; the fill
    // color itself is irrelevant, because the video drawn below completely
    // covers the identical path.
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 12;
    tracePath(ctx, opts.shape, x, y, size);
    ctx.fillStyle = "#000";
    ctx.fill();

    // Reset before drawing anything else - inside this same save/restore
    // pair - or every later element composited this frame inherits it.
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    ctx.save();
    tracePath(ctx, opts.shape, x, y, size);
    ctx.clip();
    if (opts.mirror) {
      ctx.translate(x + size, y);
      ctx.scale(-1, 1);
      ctx.drawImage(video, crop.sx, crop.sy, crop.sSide, crop.sSide, 0, 0, size, size);
    } else {
      ctx.drawImage(video, crop.sx, crop.sy, crop.sSide, crop.sSide, x, y, size, size);
    }
    ctx.restore();

    // White ring border, unchanged from the original rectangular PiP block.
    tracePath(ctx, opts.shape, x, y, size);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
  } finally {
    ctx.restore();
  }
}
