import { describe, expect, it } from "vitest";
import { planReviewedArchive, type ReviewArchiveAssignment, type ReviewArchiveMember } from "./archive-omission-review";

describe("instructor-reviewed archive plan", () => {
  const members: ReviewArchiveMember[] = [
    { id: "0", path: "essay.txt", readable: true },
    { id: "1", path: "essay.txt", readable: false },
    { id: "2", path: "other.txt", readable: true },
  ];
  const assignments: ReviewArchiveAssignment[] = [
    { memberId: "0", studentKey: "ada", studentLabel: "Ada" },
    { memberId: "1", studentKey: "ada", studentLabel: "Ada" },
    { memberId: "2", studentKey: "bea", studentLabel: "Bea" },
  ];

  it("blocks the entire explicitly assigned student group when any member is unreadable", () => {
    expect(planReviewedArchive(members, assignments)).toEqual({
      ok: true,
      admitted: [{ studentKey: "bea", studentLabel: "Bea", memberIds: ["2"] }],
      blocked: [{ studentKey: "ada", studentLabel: "Ada", memberIds: ["0", "1"] }],
    });
  });

  it("requires exactly one assignment for every member, even with duplicate paths", () => {
    expect(planReviewedArchive(members, assignments.slice(1)).ok).toBe(false);
    expect(planReviewedArchive(members, [assignments[0], assignments[0], assignments[2]]).ok).toBe(false);
    expect(planReviewedArchive(members, [assignments[0], assignments[1], { ...assignments[2], memberId: "unknown" }]).ok).toBe(false);
    expect(planReviewedArchive([members[0], { ...members[1], id: "0" }], assignments.slice(0, 2)).ok).toBe(false);
  });

  it("rejects ambiguous student labels or keys instead of merging identities", () => {
    expect(planReviewedArchive(members, [assignments[0], assignments[1], { ...assignments[2], studentLabel: "ADA" }]).ok).toBe(false);
    expect(planReviewedArchive(members, [assignments[0], { ...assignments[1], studentKey: "ADA" }, assignments[2]]).ok).toBe(false);
    expect(planReviewedArchive(members, [assignments[0], assignments[1], { ...assignments[2], studentLabel: "Ａｄａ" }]).ok).toBe(false);
  });

  it("fails closed for malformed members and empty reviews", () => {
    expect(planReviewedArchive([], []).ok).toBe(false);
    expect(planReviewedArchive([{ ...members[0], readable: "false" } as unknown as ReviewArchiveMember], assignments.slice(0, 1)).ok).toBe(false);
    expect(planReviewedArchive([members[0]], [{ ...assignments[0], studentLabel: " " }]).ok).toBe(false);
  });
});
