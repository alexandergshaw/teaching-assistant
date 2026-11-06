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
      // Disabled until known-safe failures and interrupted batch outcomes have
      // independently verified recovery semantics.
      return "unavailable";
    default:
      return "unavailable";
  }
}
