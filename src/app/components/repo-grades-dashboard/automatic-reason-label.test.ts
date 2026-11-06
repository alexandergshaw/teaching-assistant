import { expect, it } from "vitest";
import { automaticReasonLabel } from "@/lib/repo-grades-dashboard/automatic-reason-label";

it.each([
  ["missing-instruction-evidence", "no usable pinned assignment README"],
  ["conflicting-instructions", "READMEs disagree"],
  ["readme-target-budget-exceeded", "too many repository READMEs"],
  ["incomplete-inventory", "could not verify all repository branches"],
  ["profile-unavailable", "This record has no more specific reason"],
  ["explicit-retry-required", "Use Retry rubric preparation"],
  ["prior-attempt", "Check the repository grading history"],
  ["digest-truncated", "limit for collecting repository files"],
  ["file-fetch-failed", "read or verify every required submission file"],
  ["grading-input-truncated", "grading model's input limit"],
  ["grading-source-rate-limited", "GitHub rate-limited the worker"],
  ["unsupported-submission", "files the repository grader cannot read"],
])("explains %s with a specific message", (reason, expected) => {
  expect(automaticReasonLabel(reason)).toContain(expected);
});

it.each(["conflicting-instructions", "missing-instruction-evidence", "readme-target-budget-exceeded"])(
  "explains how to switch from READMEs to shared instructions for %s", (reason) => {
    expect(automaticReasonLabel(reason)).toContain(
      'clear "Keep saved README instruction mode", enter shared assignment instructions, and save.',
    );
  },
);

it.each(["Private assignment path and instructions", "constructor", "__proto__", null])(
  "does not display an unrecognized stored reason", (reason) => {
    expect(automaticReasonLabel(reason)).toBe("The worker did not provide a recognized reason.");
  },
);
