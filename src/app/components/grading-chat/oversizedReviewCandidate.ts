import { GRADING_ZIP_MAX_BYTES } from "@/lib/grade/grading-zip-transport";
/** Only a single oversized ZIP is routed to the bounded review flow. */
export function oversizedReviewCandidate(files: readonly File[]): File | null {
  const file = files.length === 1 ? files[0] : undefined;
  return file && /\.zip$/i.test(file.name) && Number.isSafeInteger(file.size) && file.size > GRADING_ZIP_MAX_BYTES ? file : null;
}

/** This lane cannot currently split or recover a single student's archive. */
export function singleStudentOversizedRefusal(files: readonly File[]): string | null {
  if (!files.some((file) => oversizedReviewCandidate([file]))) return null;
  return `A single-student ZIP over ${GRADING_ZIP_MAX_BYTES / (1024 * 1024)} MiB cannot yet be uploaded or reviewed in this workflow. Nothing was uploaded or graded.`;
}
