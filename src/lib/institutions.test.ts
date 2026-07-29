import { describe, it, expect } from "vitest";
import { validateNewInstitutionAcronym } from "./institutions";

// Pure-logic tests for the shared "add institution" validation rule (AC7).
// Reused by TopBar.tsx's Settings dropdown and KnowledgeTab.tsx's inline
// picker - see the docstring on validateNewInstitutionAcronym in
// institutions.ts. React rendering for either call site is intentionally
// out of scope here.

describe("validateNewInstitutionAcronym", () => {
  it("rejects a blank string", () => {
    expect(validateNewInstitutionAcronym("", [])).toEqual({ ok: false, reason: "blank" });
  });

  it("rejects a whitespace-only string", () => {
    expect(validateNewInstitutionAcronym("   ", ["MCC"])).toEqual({ ok: false, reason: "blank" });
  });

  it("uppercases a lowercase acronym on success", () => {
    expect(validateNewInstitutionAcronym("mpcc", ["MCC"])).toEqual({ ok: true, code: "MPCC" });
  });

  it("trims and uppercases a mixed-case acronym with surrounding whitespace", () => {
    expect(validateNewInstitutionAcronym("  MiXeD  ", [])).toEqual({ ok: true, code: "MIXED" });
  });

  it("accepts a valid new acronym against a non-empty existing list", () => {
    expect(validateNewInstitutionAcronym("NEW", ["MCC", "MPCC"])).toEqual({ ok: true, code: "NEW" });
  });

  it("rejects an exact-case duplicate", () => {
    expect(validateNewInstitutionAcronym("MCC", ["MCC", "MPCC"])).toEqual({
      ok: false,
      reason: "duplicate",
      code: "MCC",
    });
  });

  it("rejects a duplicate in different casing (lowercase input, uppercase existing)", () => {
    expect(validateNewInstitutionAcronym("mcc", ["MCC"])).toEqual({
      ok: false,
      reason: "duplicate",
      code: "MCC",
    });
  });

  it("rejects a duplicate when the existing entry itself is not normalized", () => {
    // existing[] is not guaranteed pre-normalized by every caller - the check
    // must normalize both sides, not just the incoming raw value.
    expect(validateNewInstitutionAcronym("MCC", [" mcc "])).toEqual({
      ok: false,
      reason: "duplicate",
      code: "MCC",
    });
  });

  it("accepts an acronym that only differs by case from a non-duplicate entry", () => {
    expect(validateNewInstitutionAcronym("MCCX", ["MCC"])).toEqual({ ok: true, code: "MCCX" });
  });
});
