// N15 wave 3: the pure preflight + routing leaf behind GradingPictureField.
// No React, no server imports - the transcribe step is injected so this file
// stays executable under vitest. The return type is deliberately text /
// error / rejection only (never a GradingRun shape).

import { checkFileWireBudget, maxFileBytesForWireBudget } from "@/lib/upload-budget";
import { readFileBase64 } from "@/lib/courses-tab-helpers";
import { downscaleImageToBudget } from "./downscaleImageToBudget";
import { shouldAttemptDownscale } from "./imageDownscalePlan";
import type { RubricPictureKind } from "@/lib/grade/rubric-picture-prompt";

export type PictureIngestResult =
  | { text: string }
  | { error: string }
  | { rejected: string };

export type TranscribeFn = (
  base64: string,
  kind: RubricPictureKind
) => Promise<{ text: string } | { error: string }>;

/** The minimal File surface the preflight needs (a real File satisfies it). */
export interface PictureFileLike {
  name: string;
  size: number;
  type: string;
}

/** Returns null to accept the file, or a remediation-guiding message. */
export function describePictureRejection(
  file: PictureFileLike,
  kind: RubricPictureKind
): string | null {
  if (!file.type.startsWith("image/")) {
    return `The ${kind} picture must be an image file (PNG, JPEG or WebP). "${file.name}" is not an image - take a screenshot of the page instead, or paste the text directly into the field.`;
  }
  const budget = checkFileWireBudget(file.size, `The ${kind} picture "${file.name}"`);
  if (!budget.ok) {
    return `${budget.error} Use a smaller image: take a screenshot of just the ${kind} instead of a full-size photo, or reduce the photo's resolution, then try again.`;
  }
  return null;
}

/**
 * Preflights the file, converts it to base64 and transcribes it. A rejected
 * file never reaches the reader or the transcribe call.
 */
export async function ingestGradingPicture(
  file: File,
  kind: RubricPictureKind,
  transcribe: TranscribeFn,
  readBase64: (file: File) => Promise<string> = readFileBase64,
  downscale: (file: File) => Promise<File | null> = downscaleImageToBudget
): Promise<PictureIngestResult> {
  let working = file;
  if (shouldAttemptDownscale(file.type, file.size, maxFileBytesForWireBudget())) {
    // null (no canvas / decode failed) keeps the original, which then hits the
    // existing oversize refusal below. A downscale error never escapes.
    const smaller = await downscale(file).catch(() => null);
    if (smaller && smaller.size < file.size) working = smaller;
  }
  const rejected = describePictureRejection(working, kind);
  if (rejected) return { rejected };
  let base64: string;
  try {
    base64 = await readBase64(working);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the image file." };
  }
  return transcribe(base64, kind);
}
