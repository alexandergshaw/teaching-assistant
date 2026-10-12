// Frozen oracle for classifyBranchMergeCheck (scope section 6.3). Hand-written
// literals; scan fixtures use the real BranchScanResult shape.
import { describe, expect, it } from "vitest";
import type { BranchScanResult } from "./repo-grade-branch-scan";
import { classifyBranchMergeCheck, describeBranchMergeNote, type BranchMergeCheck } from "./repo-grade-merge-check";

interface Row {
  in: { targetBranch: string; targetWasExplicit: boolean; gradedTargetHadSubmission: boolean; scan: BranchScanResult | null };
  out: BranchMergeCheck;
}

const rows: Row[] = [
  { in: { targetBranch: "main", targetWasExplicit: true, gradedTargetHadSubmission: true, scan: null }, out: { status: "merged", targetBranch: "main", targetWasExplicit: true } },
  {
    in: { targetBranch: "main", targetWasExplicit: true, gradedTargetHadSubmission: false, scan: { kind: "found", branch: "feature-x", gradedBranch: "main", branchesChecked: 1, branchesSkipped: 0 } },
    out: { status: "not-merged", targetBranch: "main", targetWasExplicit: true, foundOnBranch: "feature-x" },
  },
  {
    in: { targetBranch: "main", targetWasExplicit: true, gradedTargetHadSubmission: false, scan: { kind: "not-found", gradedBranch: "main", branchesChecked: 2, branchesSkipped: 0 } },
    out: { status: "no-submission", targetBranch: "main", targetWasExplicit: true },
  },
  {
    in: { targetBranch: "main", targetWasExplicit: true, gradedTargetHadSubmission: false, scan: { kind: "undetermined", reason: "a rate limit was hit", gradedBranch: "main", branchesChecked: 1, branchesSkipped: 0 } },
    out: { status: "unknown", targetBranch: "main", targetWasExplicit: true, undeterminedReason: "a rate limit was hit" },
  },
  // Submission present on the target AND a real scan ran (the success-path hoist).
  {
    in: { targetBranch: "main", targetWasExplicit: true, gradedTargetHadSubmission: true, scan: { kind: "found", branch: "old-draft", gradedBranch: "main", branchesChecked: 1, branchesSkipped: 0 } },
    out: { status: "not-merged", targetBranch: "main", targetWasExplicit: true, foundOnBranch: "old-draft" },
  },
  {
    in: { targetBranch: "main", targetWasExplicit: true, gradedTargetHadSubmission: true, scan: { kind: "not-found", gradedBranch: "main", branchesChecked: 2, branchesSkipped: 0 } },
    out: { status: "merged", targetBranch: "main", targetWasExplicit: true },
  },
  {
    in: { targetBranch: "main", targetWasExplicit: true, gradedTargetHadSubmission: true, scan: { kind: "undetermined", reason: "a rate limit was hit", gradedBranch: "main", branchesChecked: 1, branchesSkipped: 0 } },
    out: { status: "merged", targetBranch: "main", targetWasExplicit: true },
  },
];

describe("classifyBranchMergeCheck frozen oracle", () => {
  it.each(rows.map((r, i) => [`${i}: ${r.out.status}`, r] as const))("%s", (_name, row) => {
    expect(classifyBranchMergeCheck(row.in)).toEqual(row.out);
  });

  it("a submission on the target no longer short-circuits a found scan: it is not-merged (the fix)", () => {
    expect(
      classifyBranchMergeCheck({
        targetBranch: "main",
        targetWasExplicit: true,
        gradedTargetHadSubmission: true,
        scan: { kind: "found", branch: "x", gradedBranch: "main", branchesChecked: 1, branchesSkipped: 0 },
      }).status
    ).toBe("not-merged");
  });

  it("not-merged and no-submission are distinct states; without a found scan no branch is named (AC-9)", () => {
    const withBranch = rows[1].in;
    const without = rows[2].in;
    expect(classifyBranchMergeCheck(withBranch).status).not.toBe(classifyBranchMergeCheck(without).status);
    expect(classifyBranchMergeCheck(without).foundOnBranch).toBeUndefined();
  });
});

describe("describeBranchMergeNote", () => {
  const notes = rows.slice(0, 4).map((r) => describeBranchMergeNote(r.out));
  it("merged adds no note; the other three differ pairwise", () => {
    expect(notes[0]).toBeNull();
    expect(new Set(notes.slice(1)).size).toBe(3);
  });
  it("explicit target: frozen wording names the typed target", () => {
    expect(notes[1]).toBe(
      'The work exists on the branch "feature-x", which was never merged into "main" (the target branch you set). Merging or re-pointing it to "main" would let it be graded.'
    );
    expect(notes[2]).toBe('No submission was found on "main" (the target branch you set) or on any other branch of this repository that was checked.');
    expect(notes[2]).not.toContain("feature-x");
    expect(notes[3]).toBe(
      'Other branches of this repository could not be checked against "main" (the target branch you set) (a rate limit was hit), so it is possible the work exists there unseen.'
    );
  });
  it("no typed target (AC7): frozen wording names the DEFAULT branch and never claims a target was set", () => {
    const noTarget = (status: BranchMergeCheck["status"]): BranchMergeCheck => ({
      status,
      targetBranch: "main",
      targetWasExplicit: false,
      ...(status === "not-merged" ? { foundOnBranch: "module-08" } : {}),
      ...(status === "unknown" ? { undeterminedReason: "a rate limit was hit" } : {}),
    });
    expect(describeBranchMergeNote(noTarget("not-merged"))).toBe(
      'The work exists on the branch "module-08", which was never merged into the default branch "main". Merging or re-pointing it to "main" would let it be graded.'
    );
    expect(describeBranchMergeNote(noTarget("no-submission"))).toBe(
      'No submission was found on the default branch "main" or on any other branch of this repository that was checked.'
    );
    expect(describeBranchMergeNote(noTarget("unknown"))).toBe(
      'Other branches of this repository could not be checked against the default branch "main" (a rate limit was hit), so it is possible the work exists there unseen.'
    );
    for (const st of ["not-merged", "no-submission", "unknown"] as const) {
      expect(describeBranchMergeNote(noTarget(st))).not.toContain("you set");
    }
  });
  it("is non-accusatory", () => {
    for (const n of notes) {
      for (const word of ["cheat", "plagiar", "dishonest", "lied", "fault", "blame"]) {
        expect((n ?? "").toLowerCase()).not.toContain(word);
      }
    }
  });
});
