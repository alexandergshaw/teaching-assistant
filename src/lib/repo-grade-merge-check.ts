// PURE classifier for the repo-grades "was the work merged to the target
// branch" check. No network: it maps facts gradeRepoAction already has (was the
// graded target branch gradable, and what the no-submission branch scan said)
// to one typed outcome. The surface between detection and everything
// downstream is a typed field, never a substring read out of a reason string.
import type { BranchScanResult } from "./repo-grade-branch-scan";

export type BranchMergeStatus = "merged" | "not-merged" | "no-submission" | "unknown";

export interface BranchMergeCheck {
  status: BranchMergeStatus;
  /** The instructor's designated target branch, echoed for the comment/diagnostic. */
  targetBranch: string;
  /** Set only when status === "not-merged": the OTHER branch the work was found on. */
  foundOnBranch?: string;
  /** Set only when status === "unknown": the honest reason the check could not complete. */
  undeterminedReason?: string;
}

/** Total 4-way classification. `scan` is null when the target had a
 * submission (the scan never ran). */
export function classifyBranchMergeCheck(args: {
  targetBranch: string;
  gradedTargetHadSubmission: boolean;
  scan: BranchScanResult | null;
}): BranchMergeCheck {
  const { targetBranch, gradedTargetHadSubmission, scan } = args;
  if (gradedTargetHadSubmission || scan === null) return { status: "merged", targetBranch };
  switch (scan.kind) {
    case "found":
      return { status: "not-merged", targetBranch, foundOnBranch: scan.branch };
    case "not-found":
      return { status: "no-submission", targetBranch };
    case "undetermined":
      return { status: "unknown", targetBranch, undeterminedReason: scan.reason };
  }
}

/** Non-accusatory instructor-visible note per state. "merged" adds none. The
 * not-merged and no-submission copy are DISTINCT sentences. */
export function describeBranchMergeNote(check: BranchMergeCheck): string | null {
  switch (check.status) {
    case "not-merged":
      return `The work exists on the branch "${check.foundOnBranch ?? ""}", which was never merged into "${check.targetBranch}" (the branch you set as the target). Merging or re-pointing it to "${check.targetBranch}" would let it be graded.`;
    case "no-submission":
      return `No branch of this repository has submitted work for "${check.targetBranch}" (the branch you set as the target) - nothing was found on the target or any other branch checked.`;
    case "unknown":
      return `Other branches of this repository could not be checked against the target "${check.targetBranch}" (${check.undeterminedReason ?? "unknown reason"}), so it is possible the work exists there unseen.`;
    case "merged":
      return null;
  }
}
