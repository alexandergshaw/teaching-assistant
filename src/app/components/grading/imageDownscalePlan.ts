// N15 wave 3: the pure decision logic behind the picture downscale. No DOM,
// no canvas - the browser leaf (downscaleImageToBudget.ts) executes the plan.

/** Encoded size is only knowable after encoding, so aim below the hard budget. */
export const DOWNSCALE_SAFETY_MARGIN = 0.9;

/** Longest-edge caps (px), largest first. */
export const DOWNSCALE_EDGE_CAPS: readonly number[] = [2200, 1600, 1200];

/** JPEG qualities, highest first. */
export const DOWNSCALE_QUALITIES: readonly number[] = [0.82, 0.7, 0.6];

export interface DownscaleStep {
  maxEdge: number;
  quality: number;
}

/** True only for an image that is over the budget. Non-images never qualify. */
export function shouldAttemptDownscale(
  fileType: string,
  fileBytes: number,
  budgetBytes: number
): boolean {
  return fileType.startsWith("image/") && fileBytes > budgetBytes;
}

/** The byte target an encode must beat: the budget with the safety margin. */
export function targetBudgetBytes(budgetBytes: number): number {
  return Math.floor(budgetBytes * DOWNSCALE_SAFETY_MARGIN);
}

/** Ordered attempts: each edge cap with each quality, gentlest first. */
export function downscaleSchedule(): DownscaleStep[] {
  const steps: DownscaleStep[] = [];
  for (const maxEdge of DOWNSCALE_EDGE_CAPS) {
    for (const quality of DOWNSCALE_QUALITIES) steps.push({ maxEdge, quality });
  }
  return steps;
}

/**
 * Output dimensions that fit the longest edge within maxEdge, preserving the
 * aspect ratio. Never upscales; never returns a zero edge.
 */
export function scaledDimensions(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest <= 0) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** The renamed file name for the JPEG re-encode ("photo.heic" -> "photo.jpg"). */
export function downscaledFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.jpg`;
}
