// TDD for Slice A, U9.36/U9.37 (docs/repo-grades-ux-overhaul-acceptance-criteria.md).
// WRITTEN BEFORE THE IMPLEMENTATION EXISTS. These tests currently fail
// because ./repoGradesBindingConfirm has not been written. The implementer
// makes them pass without changing what they assert; if one of them is
// wrong, report it rather than editing it.
//
// THE DEFECT THESE PIN, stated once so the implementation cannot drift from
// the reason it exists:
//
// The course-table roster link pushes rows with `canvasUserId: null` by
// construction (rosterUsernameOverlay.ts:144-147). Those repos then derive a
// SINGLE binding candidate whose `canvasUserId` is the empty string, which
// makes the row "suggested" - so the grid offers "Confirm binding", and
// LinkUsernamesPanel offers "Confirm all N suggested bindings".
//
// Confirming one writes a stored binding with `canvasUserId: ""`. On the very
// next render `repo-student-bindings.ts` re-derives that row as UNBOUND,
// because a present-but-non-numeric id is not a confirmed binding. The row
// loses both its suggestion and its confirm button and ends FURTHER from
// postable than before the click. The batch path does this to every such row
// at once.
//
// That is the instructor's exact current state: an exported log reading
// "matched 0, added 11, 11 without a Canvas user id". Eleven rows, one click
// from going backwards.
//
// THE ORACLE IS FROZEN HERE ON PURPOSE. "Confirmable" means the id survives a
// round trip through the binding deriver as a CONFIRMED row, and the only
// ids that do are non-empty runs of digits. This test states that rule as a
// literal, rather than importing the deriver's own predicate, so that a later
// change to the deriver cannot make these assertions vacuously agree with it
// (see the standing lesson about consolidations turning tests tautological).
import { describe, expect, it } from "vitest";
import {
  describeBlockedConfirmations,
  isConfirmableCandidate,
  partitionConfirmableBindings,
  type ConfirmableBindingRow,
} from "./repoGradesBindingConfirm";

/** The frozen oracle: what the binding deriver will accept as confirmed. */
function oracleAcceptsAsConfirmed(canvasUserId: string): boolean {
  return /^\d+$/.test(canvasUserId.trim());
}

function suggestedRow(repo: string, canvasUserId: string, name = "Ada Lovelace"): ConfirmableBindingRow {
  return { repo, candidate: { canvasUserId, name } };
}

describe("isConfirmableCandidate", () => {
  it("rejects the empty id every roster-linked row carries", () => {
    expect(isConfirmableCandidate({ canvasUserId: "", name: "Ada Lovelace" })).toBe(false);
  });

  it("rejects a whitespace-only id", () => {
    expect(isConfirmableCandidate({ canvasUserId: "   ", name: "Ada Lovelace" })).toBe(false);
  });

  it("accepts a numeric Canvas user id", () => {
    expect(isConfirmableCandidate({ canvasUserId: "90210", name: "Ada Lovelace" })).toBe(true);
  });

  it("accepts a numeric id with surrounding whitespace, matching the deriver's own trim", () => {
    expect(isConfirmableCandidate({ canvasUserId: " 90210 ", name: "Ada Lovelace" })).toBe(true);
  });

  it("rejects a non-numeric id, including one that merely starts with digits", () => {
    expect(isConfirmableCandidate({ canvasUserId: "12a", name: "Ada Lovelace" })).toBe(false);
    expect(isConfirmableCandidate({ canvasUserId: "ada", name: "Ada Lovelace" })).toBe(false);
  });

  it("rejects a missing candidate rather than throwing", () => {
    expect(isConfirmableCandidate(undefined)).toBe(false);
    expect(isConfirmableCandidate(null)).toBe(false);
  });

  it("agrees with the frozen oracle across a spread of ids", () => {
    const ids = ["", " ", "0", "7", "90210", " 90210 ", "12a", "a12", "ada", "-1", "1.5", "1 2"];
    for (const id of ids) {
      expect(isConfirmableCandidate({ canvasUserId: id, name: "x" })).toBe(oracleAcceptsAsConfirmed(id));
    }
  });
});

describe("partitionConfirmableBindings", () => {
  it("blocks every row when the whole batch came from the course-table roster link", () => {
    // The instructor's actual state: 11 suggested rows, no Canvas ids.
    const rows = Array.from({ length: 11 }, (_, i) => suggestedRow(`org/repo-${i}`, ""));
    const result = partitionConfirmableBindings(rows);

    expect(result.confirmable).toHaveLength(0);
    expect(result.blocked).toHaveLength(11);
  });

  it("never lets a row with an empty id reach the confirmable list", () => {
    // This is the whole point: anything in `confirmable` gets sent to the
    // binding write, and an empty id there degrades the row to unbound.
    const rows = [suggestedRow("org/a", ""), suggestedRow("org/b", "90210"), suggestedRow("org/c", "  ")];
    const result = partitionConfirmableBindings(rows);

    for (const entry of result.confirmable) {
      expect(oracleAcceptsAsConfirmed(entry.candidate.canvasUserId)).toBe(true);
    }
  });

  it("splits a mixed batch by the oracle, losing no row from the total", () => {
    const rows = [
      suggestedRow("org/a", ""),
      suggestedRow("org/b", "90210"),
      suggestedRow("org/c", "12a"),
      suggestedRow("org/d", " 41 "),
    ];
    const result = partitionConfirmableBindings(rows);

    expect(result.confirmable.map((entry) => entry.repo)).toEqual(["org/b", "org/d"]);
    expect(result.blocked.map((entry) => entry.repo)).toEqual(["org/a", "org/c"]);
    expect(result.confirmable.length + result.blocked.length).toBe(rows.length);
  });

  it("blocks a row whose candidate is missing entirely rather than dropping it silently", () => {
    const rows: ConfirmableBindingRow[] = [{ repo: "org/a", candidate: undefined }];
    const result = partitionConfirmableBindings(rows);

    expect(result.confirmable).toHaveLength(0);
    expect(result.blocked.map((entry) => entry.repo)).toEqual(["org/a"]);
  });

  it("gives every blocked row a non-empty reason", () => {
    const rows = [suggestedRow("org/a", ""), suggestedRow("org/b", "12a"), { repo: "org/c", candidate: undefined }];
    const result = partitionConfirmableBindings(rows);

    expect(result.blocked).toHaveLength(3);
    for (const entry of result.blocked) {
      expect(entry.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("distinguishes 'no Canvas id' from 'no candidate at all' in its reasons", () => {
    const result = partitionConfirmableBindings([
      suggestedRow("org/a", ""),
      { repo: "org/c", candidate: undefined },
    ]);
    const reasons = result.blocked.map((entry) => entry.reason);

    expect(new Set(reasons).size).toBe(2);
  });

  it("preserves input order within each list", () => {
    const rows = [suggestedRow("org/z", "1"), suggestedRow("org/a", "2"), suggestedRow("org/m", "")];
    const result = partitionConfirmableBindings(rows);

    expect(result.confirmable.map((entry) => entry.repo)).toEqual(["org/z", "org/a"]);
  });

  it("handles an empty batch without inventing entries", () => {
    const result = partitionConfirmableBindings([]);
    expect(result.confirmable).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
  });
});

describe("describeBlockedConfirmations", () => {
  it("says nothing when nothing was blocked", () => {
    expect(describeBlockedConfirmations([])).toBe("");
  });

  it("names the count, so a batch confirm can never silently drop rows", () => {
    const blocked = [
      { repo: "org/a", candidate: undefined, reason: "no candidate" },
      { repo: "org/b", candidate: { canvasUserId: "", name: "x" }, reason: "no Canvas user id" },
    ];
    const sentence = describeBlockedConfirmations(blocked);

    expect(sentence).toContain("2");
    expect(sentence.trim().length).toBeGreaterThan(0);
  });

  it("mentions the Canvas user id as the missing thing, so the instructor knows what to fix", () => {
    const blocked = [{ repo: "org/b", candidate: { canvasUserId: "", name: "x" }, reason: "no Canvas user id" }];
    expect(describeBlockedConfirmations(blocked).toLowerCase()).toContain("canvas");
  });
});
