import type { SubmitOutcome } from "./useContinuousGradingRun";

/** Called only when upload failed before the storage ingest was dispatched. */
export function zipUploadFallback(reason: string, eligible: boolean, current: () => boolean, body: () => Promise<SubmitOutcome>): Promise<SubmitOutcome> {
  return eligible && current() ? body() : Promise.resolve({ kind: "refused", reason });
}
