// N15 wave 3: browser-only canvas downscale. NOT testable under node vitest
// (no canvas); every decision lives in imageDownscalePlan.ts. Returns null when
// canvas/decode is unavailable so the caller falls through to its refusal.

import { maxFileBytesForWireBudget } from "@/lib/upload-budget";
import {
  downscaleSchedule,
  downscaledFileName,
  scaledDimensions,
  targetBudgetBytes,
} from "./imageDownscalePlan";

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

export async function downscaleImageToBudget(file: File): Promise<File | null> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const target = targetBudgetBytes(maxFileBytesForWireBudget());
    for (const step of downscaleSchedule()) {
      const { width, height } = scaledDimensions(bitmap.width, bitmap.height, step.maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await encodeJpeg(canvas, step.quality);
      if (blob && blob.size <= target) {
        return new File([blob], downscaledFileName(file.name), { type: "image/jpeg" });
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}
