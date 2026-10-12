// PURE classifier for the repo-grades "was the work merged to the target
// branch" check. No network: it maps facts gradeRepoAction already has (was the
// graded target branch gradable, and what the no-submission branch scan said)
// to one typed outcome. The surface between detection and everything
// downstream is a typed field, never a substring read out of a reason string.
import type { BranchScanResult } from "./repo-grade-branch-scan";

export type BranchMergeStatus = "merged" | "not-merged" | "no-submission" | "unknown";

export interface BranchMergeCheck {
  status: BranchMergeStatus;
  /** The EFFECTIVE graded ref: the instructor's typed target when one was set,
   * else the repository's default branch (surfaced by the branch scan). Empty
   * only when the default branch could not be resolved at all. */
  targetBranch: string;
  /** True when the instructor typed the target; false when `targetBranch` is the
   * default branch the grade fell back to. Drives the note wording only. */
  targetWasExplicit: boolean;
  /** Set only when status === "not-merged": the OTHER branch the work was found on. */
  foundOnBranch?: string;
  /** Set only when status === "unknown": the honest reason the check could not complete. */
  undeterminedReason?: string;
}

/** Total 4-way classification. `scan` is null when the scan did not
 * run (the graded ref's tree could not be read). `targetBranch` is the effective
 * graded ref name; `targetWasExplicit` says whether the instructor typed it. */
export function classifyBranchMergeCheck(args: {
  targetBranch: string;
  targetWasExplicit: boolean;
  gradedTargetHadSubmission: boolean;
  scan: BranchScanResult | null;
}): BranchMergeCheck {
  const { targetBranch, targetWasExplicit, gradedTargetHadSubmission, scan } = args;
  if (scan === null) return { status: "merged", targetBranch, targetWasExplicit };
  switch (scan.kind) {
    case "found":
      // Another branch carries folder work the graded ref lacks - on BOTH the
      // empty-target and the non-empty-target path.
      return { status: "not-merged", targetBranch, targetWasExplicit, foundOnBranch: scan.branch };
    case "not-found":
      return gradedTargetHadSubmission
        ? { status: "merged", targetBranch, targetWasExplicit }
        : { status: "no-submission", targetBranch, targetWasExplicit };
    case "undetermined":
      // With a submission on the target the primary fact is certain, so scan
      // uncertainty does not downgrade it to "unknown" (scope RES-2).
      return gradedTargetHadSubmission
        ? { status: "merged", targetBranch, targetWasExplicit }
        : { status: "unknown", targetBranch, targetWasExplicit, undeterminedReason: scan.reason };
  }
}

/** How the graded ref is named in a note: "the branch you set as the target"
 * only when the instructor really typed one, else "the default branch". */
function describeGradedRef(check: BranchMergeCheck): string {
  if (!check.targetBranch) return "the graded branch";
  return check.targetWasExplicit
    ? `"${check.targetBranch}" (the target branch you set)`
    : `the default branch "${check.targetBranch}"`;
}

/** Non-accusatory instructor-visible note per state. "merged" adds none. The
 * not-merged and no-submission copy are DISTINCT sentences. */
export function describeBranchMergeNote(check: BranchMergeCheck): string | null {
  const ref = describeGradedRef(check);
  switch (check.status) {
    case "not-merged":
      return `The work exists on the branch "${check.foundOnBranch ?? ""}", which was never merged into ${ref}. Merging or re-pointing it to ${check.targetBranch ? `"${check.targetBranch}"` : ref} would let it be graded.`;
    case "no-submission":
      return `No submission was found on ${ref} or on any other branch of this repository that was checked.`;
    case "unknown":
      return `Other branches of this repository could not be checked against ${ref} (${check.undeterminedReason ?? "unknown reason"}), so it is possible the work exists there unseen.`;
    case "merged":
      return null;
  }
}
