import "server-only";

// Switch the account's manual and automatic entry points together, after the
// deployed ledger and transport have been verified. No browser argument sets it.
export function repoGradeAdmissionMode(): "legacy-manual" | "coordinated" | "unavailable" {
  switch (process.env.REPO_GRADE_ADMISSION_MODE) {
    case undefined:
    case "legacy-manual":
      return "legacy-manual";
    case "coordinated":
      // Disabled until known-safe failures and interrupted batch outcomes have
      // independently verified recovery semantics.
      return "unavailable";
    default:
      return "unavailable";
  }
}
