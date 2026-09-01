// Tests for draftPostArming.ts (B2, ux-audit-grading.md). vitest here is
// node-env and renders no component - this pins the DECISION (which fields
// disarm, and that the reused isConfirmArmed only ever matches its own
// exact signature), not any markup.
import { describe, it, expect } from "vitest";
import { draftPostArmSignature, isConfirmArmed, type DraftPostArmFields } from "./draftPostArming";

function fields(overrides: Partial<DraftPostArmFields> = {}): DraftPostArmFields {
  return {
    draftId: "draft-1",
    gradeCount: 12,
    sort: "newest",
    search: "",
    courseFilter: "all",
    ...overrides,
  };
}

describe("draftPostArmSignature - B2: the arming signature changes when the filter/search/sort changes", () => {
  it("the same fields produce the same signature", () => {
    expect(draftPostArmSignature(fields())).toBe(draftPostArmSignature(fields()));
  });

  it("changing the search box changes the signature (a search change disarms)", () => {
    expect(draftPostArmSignature(fields())).not.toBe(draftPostArmSignature(fields({ search: "Alvarez" })));
  });

  it("changing the course filter changes the signature (a filter change disarms)", () => {
    expect(draftPostArmSignature(fields())).not.toBe(
      draftPostArmSignature(fields({ courseFilter: "CS 101" }))
    );
  });

  it("changing the sort order changes the signature (a sort change disarms)", () => {
    expect(draftPostArmSignature(fields())).not.toBe(draftPostArmSignature(fields({ sort: "oldest" })));
  });

  it("changing the grade count changes the signature", () => {
    expect(draftPostArmSignature(fields())).not.toBe(draftPostArmSignature(fields({ gradeCount: 13 })));
  });

  it("a different draft id changes the signature even when every other field matches", () => {
    expect(draftPostArmSignature(fields())).not.toBe(draftPostArmSignature(fields({ draftId: "draft-2" })));
  });

  // SABOTAGE-CHECK ANCHOR: this is the exact hazard postConfirmArming.ts's
  // own header comment documents for why an ORDERED signature is required
  // here instead of confirmArming.ts's sorting selectionSignature - two
  // different field combinations must never collide onto the same
  // signature merely because their values could be sorted into the same
  // order. Swapping the search value into the sort field's position (and
  // vice versa) must NOT reproduce the original signature.
  it("swapping which field carries which value never collides onto the same signature", () => {
    const a = draftPostArmSignature(fields({ sort: "5", search: "newest" }));
    const b = draftPostArmSignature(fields({ sort: "newest", search: "5" }));
    expect(a).not.toBe(b);
  });
});

describe("isConfirmArmed (reused verbatim) - only the exact signature it was armed for counts as armed", () => {
  it("armed when the current signature matches the stored one", () => {
    const sig = draftPostArmSignature(fields());
    expect(isConfirmArmed(sig, sig)).toBe(true);
  });

  it("not armed when nothing has been armed yet (null)", () => {
    expect(isConfirmArmed(null, draftPostArmSignature(fields()))).toBe(false);
  });

  it("not armed once the current signature no longer matches the armed one", () => {
    const armedFor = draftPostArmSignature(fields());
    const current = draftPostArmSignature(fields({ search: "Chen" }));
    expect(isConfirmArmed(armedFor, current)).toBe(false);
  });

  // SABOTAGE-CHECK ANCHOR: temporarily hardcoding isConfirmArmed's body to
  // `return armedFor !== null;` (i.e. ignoring whether the current signature
  // still matches - the exact pre-fix "armed forever until this ONE draft
  // posts" bug) was verified to make "not armed once the current signature
  // no longer matches the armed one" FAIL (it would return true instead of
  // false). Reverted after confirming the failure - see this implementer's
  // final report for the full log.
});
