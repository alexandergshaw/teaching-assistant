import { describe, it, expect, vi } from "vitest";
import {
  describeInstitutionRemoval,
  nextInstitutionsAfterRemoval,
  confirmAndRemoveInstitution,
  type InstitutionDeletionImpact,
} from "./institution-removal";

// Pure-logic + orchestration tests for the shared "remove institution" flow
// (AC7 of the "delete institutions" feature - see docs/REGRESSION.md's entry
// for it). React rendering for either call site (TopBar.tsx's Settings
// dropdown, KnowledgeTab.tsx's own picker) is intentionally out of scope
// here - see institutions.test.ts for the sibling "add" rule's equivalent
// coverage.

function impact(pageCount: number, tileCount: number): InstitutionDeletionImpact {
  return { pageCount, tileCount };
}

describe("describeInstitutionRemoval", () => {
  it("states zero references plainly when neither pages nor tiles exist", () => {
    const message = describeInstitutionRemoval("MCC", impact(0, 0));
    expect(message).toContain("MCC has no knowledge base pages or course tiles filed under it");
  });

  it("names only the page count when there are zero tiles", () => {
    // Only the blast-radius sentence (the first paragraph) is scoped to what's
    // actually present - the rest of the message is generic "how removal
    // works" copy that mentions both nouns regardless of count (checked below
    // in the AC2 test), so the "not present" assertion is scoped to that
    // sentence alone rather than the whole message.
    const blastRadius = describeInstitutionRemoval("MCC", impact(3, 0)).split("\n\n")[0];
    expect(blastRadius).toBe("MCC has 3 knowledge base pages filed under it.");
    expect(blastRadius).not.toContain("course tile");
  });

  it("names only the tile count when there are zero pages", () => {
    const blastRadius = describeInstitutionRemoval("MCC", impact(0, 5)).split("\n\n")[0];
    expect(blastRadius).toBe("MCC has 5 course tiles filed under it.");
    expect(blastRadius).not.toContain("knowledge base page");
  });

  it("names both counts when neither is zero", () => {
    const message = describeInstitutionRemoval("MCC", impact(3, 5));
    expect(message).toContain("MCC has 3 knowledge base pages and 5 course tiles filed under it.");
  });

  it("uses singular wording for a count of exactly 1", () => {
    const message = describeInstitutionRemoval("MCC", impact(1, 1));
    expect(message).toContain("1 knowledge base page and 1 course tile filed under it.");
  });

  it("always states that removal only hides records rather than deleting them (AC2)", () => {
    const withData = describeInstitutionRemoval("MCC", impact(2, 1));
    const withoutData = describeInstitutionRemoval("MCC", impact(0, 0));
    for (const message of [withData, withoutData]) {
      expect(message).toContain("does NOT delete anything from the database");
      expect(message).toContain('Re-adding "MCC" later makes them visible again');
    }
  });

  it("asks the actual confirmation question naming the acronym", () => {
    const message = describeInstitutionRemoval("MPCC", impact(0, 0));
    expect(message).toContain("Remove MPCC from this list?");
  });
});

describe("nextInstitutionsAfterRemoval", () => {
  it("removes the exact match and leaves the rest untouched", () => {
    expect(nextInstitutionsAfterRemoval("MCC", ["MCC", "MPCC"])).toEqual(["MPCC"]);
  });

  it("matches case-insensitively, mirroring validateNewInstitutionAcronym's normalization", () => {
    expect(nextInstitutionsAfterRemoval("mcc", ["MCC", "MPCC"])).toEqual(["MPCC"]);
  });

  it("is a no-op when the code is not present", () => {
    expect(nextInstitutionsAfterRemoval("ZZZ", ["MCC", "MPCC"])).toEqual(["MCC", "MPCC"]);
  });

  it("can empty the list entirely", () => {
    expect(nextInstitutionsAfterRemoval("MCC", ["MCC"])).toEqual([]);
  });
});

describe("confirmAndRemoveInstitution", () => {
  const existing = ["MCC", "MPCC"];

  it("returns not-found without calling fetchImpact/confirm/write for an unregistered code", async () => {
    const fetchImpact = vi.fn();
    const confirm = vi.fn();
    const write = vi.fn();

    const result = await confirmAndRemoveInstitution("ZZZ", existing, { fetchImpact, confirm, write });

    expect(result).toEqual({ removed: false, reason: "not-found" });
    expect(fetchImpact).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("cancels via the unsaved-edits guard before ever fetching impact counts (AC6)", async () => {
    const fetchImpact = vi.fn();
    const confirm = vi.fn();
    const write = vi.fn();
    const guardUnsavedEdits = vi.fn(() => false);

    const result = await confirmAndRemoveInstitution("MCC", existing, {
      fetchImpact,
      confirm,
      write,
      guardUnsavedEdits,
    });

    expect(result).toEqual({ removed: false, reason: "cancelled" });
    expect(guardUnsavedEdits).toHaveBeenCalledTimes(1);
    expect(fetchImpact).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("proceeds when the unsaved-edits guard allows it", async () => {
    const fetchImpact = vi.fn(async () => ({ impact: impact(0, 0) }));
    const confirm = vi.fn(() => true);
    const write = vi.fn();
    const guardUnsavedEdits = vi.fn(() => true);

    const result = await confirmAndRemoveInstitution("MCC", existing, {
      fetchImpact,
      confirm,
      write,
      guardUnsavedEdits,
    });

    expect(result).toEqual({ removed: true });
  });

  it("surfaces a fetch error without confirming or writing (fail closed - AC1)", async () => {
    const fetchImpact = vi.fn(async () => ({ error: "Could not reach the database." }));
    const confirm = vi.fn();
    const write = vi.fn();

    const result = await confirmAndRemoveInstitution("MCC", existing, { fetchImpact, confirm, write });

    expect(result).toEqual({ removed: false, reason: "error", message: "Could not reach the database." });
    expect(confirm).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("passes the real impact counts into the confirmation message shown to confirm()", async () => {
    const fetchImpact = vi.fn(async () => ({ impact: impact(3, 5) }));
    const confirm = vi.fn(() => true);
    const write = vi.fn();

    await confirmAndRemoveInstitution("MCC", existing, { fetchImpact, confirm, write });

    expect(fetchImpact).toHaveBeenCalledWith("MCC");
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("MCC has 3 knowledge base pages and 5 course tiles filed under it.")
    );
  });

  it("cancels and never writes when the blast-radius confirmation is declined", async () => {
    const fetchImpact = vi.fn(async () => ({ impact: impact(3, 5) }));
    const confirm = vi.fn(() => false);
    const write = vi.fn();

    const result = await confirmAndRemoveInstitution("MCC", existing, { fetchImpact, confirm, write });

    expect(result).toEqual({ removed: false, reason: "cancelled" });
    expect(write).not.toHaveBeenCalled();
  });

  it("writes the filtered registry exactly once on acceptance, and touches nothing else (AC3's no-DB-delete guarantee)", async () => {
    const fetchImpact = vi.fn(async () => ({ impact: impact(3, 5) }));
    const confirm = vi.fn(() => true);
    const write = vi.fn();

    const result = await confirmAndRemoveInstitution("MCC", existing, { fetchImpact, confirm, write });

    expect(result).toEqual({ removed: true });
    // Exactly one read (fetchImpact) and one write (the local registry) -
    // confirmAndRemoveInstitution has no parameter through which a caller
    // could even ask it to delete a database row, so this call sequence is
    // the complete set of side effects removal can ever perform.
    expect(fetchImpact).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(["MPCC"]);
  });

  it("matches the existing-registry check case-insensitively", async () => {
    const fetchImpact = vi.fn(async () => ({ impact: impact(0, 0) }));
    const confirm = vi.fn(() => true);
    const write = vi.fn();

    const result = await confirmAndRemoveInstitution("mcc", existing, { fetchImpact, confirm, write });

    expect(result).toEqual({ removed: true });
    expect(write).toHaveBeenCalledWith(["MPCC"]);
  });
});
