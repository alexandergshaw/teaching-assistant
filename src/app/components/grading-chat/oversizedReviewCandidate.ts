import { GRADING_ZIP_MAX_BYTES } from "@/lib/grade/grading-zip-transport";
/** Only a single oversized ZIP is routed to the bounded review flow. */
export function oversizedReviewCandidate(files: readonly File[]): File | null {
  const file = files.length === 1 ? files[0] : undefined;
  return file && /\.zip$/i.test(file.name) && Number.isSafeInteger(file.size) && file.size > GRADING_ZIP_MAX_BYTES ? file : null;
}
