// Frozen oracle for classifyBranchMergeCheck (scope section 6.3). Hand-written
// literals; scan fixtures use the real BranchScanResult shape.
import { describe, expect, it } from "vitest";
import type { BranchScanResult } from "./repo-grade-branch-scan";
import { classifyBranchMergeCheck, describeBranchMergeNote, type BranchMergeCheck } from "./repo-grade-merge-check";

interface Row {
  in: { targetBranch: string; gradedTargetHadSubmission: boolean; scan: BranchScanResult | null };
  out: BranchMergeCheck;
}

const rows: Row[] = [
  { in: { targetBranch: "main", gradedTargetHadSubmission: true, scan: null }, out: { status: "merged", targetBranch: "main" } },
  {
    in: { targetBranch: "main", gradedTargetHadSubmission: false, scan: { kind: "found", branch: "feature-x", branchesChecked: 1, branchesSkipped: 0 } },
    out: { status: "not-merged", targetBranch: "main", foundOnBranch: "feature-x" },
  },
  {
    in: { targetBranch: "main", gradedTargetHadSubmission: false, scan: { kind: "not-found", branchesChecked: 2, branchesSkipped: 0 } },
    out: { status: "no-submission", targetBranch: "main" },
  },
  {
    in: { targetBranch: "main", gradedTargetHadSubmission: false, scan: { kind: "undetermined", reason: "a rate limit was hit", branchesChecked: 1, branchesSkipped: 0 } },
    out: { status: "unknown", targetBranch: "main", undeterminedReason: "a rate limit was hit" },
  },
];

describe("classifyBranchMergeCheck frozen oracle", () => {
  it.each(rows.map((r) => [r.out.status, r] as const))("%s", (_name, row) => {
    expect(classifyBranchMergeCheck(row.in)).toEqual(row.out);
  });

  it("a submission on the target short-circuits even if a scan is present", () => {
    expect(
      classifyBranchMergeCheck({
        targetBranch: "main",
        gradedTargetHadSubmission: true,
        scan: { kind: "found", branch: "x", branchesChecked: 1, branchesSkipped: 0 },
      }).status
    ).toBe("merged");
  });

  it("not-merged and no-submission are distinct states; without a found scan no branch is named (AC-9)", () => {
    const withBranch = rows[1].in;
    const without = rows[2].in;
    expect(classifyBranchMergeCheck(withBranch).status).not.toBe(classifyBranchMergeCheck(without).status);
    expect(classifyBranchMergeCheck(without).foundOnBranch).toBeUndefined();
  });
});

describe("describeBranchMergeNote", () => {
  const notes = rows.map((r) => describeBranchMergeNote(r.out));
  it("merged adds no note; the other three differ pairwise", () => {
    expect(notes[0]).toBeNull();
    expect(new Set(notes.slice(1)).size).toBe(3);
  });
  it("not-merged names the found-on branch and the target; no-submission names the target", () => {
    expect(notes[1]).toContain('"feature-x"');
    expect(notes[1]).toContain('"main"');
    expect(notes[2]).toContain('"main"');
    expect(notes[2]).not.toContain("feature-x");
  });
  it("is non-accusatory", () => {
    for (const n of notes) {
      for (const word of ["cheat", "plagiar", "dishonest", "lied", "fault", "blame"]) {
        expect((n ?? "").toLowerCase()).not.toContain(word);
      }
    }
  });
});
