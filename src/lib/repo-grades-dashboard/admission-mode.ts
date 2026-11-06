import "server-only";

import { repoGradeDiscoveryEnabled } from "./discovery-mode";

// Switch the account's manual and automatic entry points together, after the
// deployed ledger and transport have been verified. No browser argument sets it.
export function repoGradeAdmissionMode(): "legacy-manual" | "coordinated" | "embedded-only" | "unavailable" {
  switch (process.env.REPO_GRADE_ADMISSION_MODE) {
    case undefined:
    case "legacy-manual":
      return "legacy-manual";
    case "embedded-only":
      // Confirm only after older deployments and in-flight legacy manual runs
      // have drained. Incomplete pilot settings keep legacy manual available.
      return process.env.REPO_GRADE_EMBEDDED_CUTOVER_CONFIRMED === "true" && repoGradeDiscoveryEnabled()
        ? "embedded-only" : "legacy-manual";
    case "coordinated":
      // Old manual requests do not hold the shared reservation. Only enable
      // coordinated grading after the ledger is deployed and they have drained.
      return process.env.REPO_GRADE_COORDINATED_CUTOVER_CONFIRMED === "true" && repoGradeDiscoveryEnabled()
        ? "coordinated" : "legacy-manual";
    default:
      return "unavailable";
  }
}

export function repoGradeStartupAvailable(mode: ReturnType<typeof repoGradeAdmissionMode>): boolean {
  return (mode === "coordinated" || mode === "embedded-only") && repoGradeDiscoveryEnabled();
}

/** Enable after the worker and migration have been verified in this environment. */
export function repoGradeDurableStartupAvailable(mode = repoGradeAdmissionMode()): boolean {
  return process.env.REPO_GRADE_DURABLE_STARTUP_ENABLED === "true" && repoGradeStartupAvailable(mode);
}
