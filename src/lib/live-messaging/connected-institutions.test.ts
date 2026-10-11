import { describe, it, expect } from "vitest";
import {
  filterConnectedInstitutions,
  isLiveConnected,
  resolveSwitcherSelection,
  type InstitutionConnectionMap,
} from "./connected-institutions";

const connected = { kind: "connected", needsGrading: 0, unread: 0 } as const;

describe("filterConnectedInstitutions", () => {
  it("keeps only institutions whose status is connected, in input order", () => {
    const statuses: InstitutionConnectionMap = {
      MCC: connected,
      UNL: { kind: "failed", reason: "401" },
      CCC: { kind: "unknown" },
      XYZ: { kind: "not-linked" },
      ABC: connected,
    };
    expect(filterConnectedInstitutions(["UNL", "ABC", "MCC", "CCC", "XYZ"], statuses)).toEqual(["ABC", "MCC"]);
  });

  it("excludes a code with no status at all", () => {
    expect(filterConnectedInstitutions(["MCC", "NEW"], { MCC: connected })).toEqual(["MCC"]);
  });

  it("matches codes case-insensitively and dedupes", () => {
    expect(filterConnectedInstitutions(["mcc", "MCC"], { MCC: connected })).toEqual(["mcc"]);
  });

  it("returns an empty list when nothing is live", () => {
    expect(filterConnectedInstitutions(["MCC"], {})).toEqual([]);
  });
});

describe("isLiveConnected", () => {
  it("is false for unknown, needs-institution and undefined", () => {
    expect(isLiveConnected({ kind: "unknown" })).toBe(false);
    expect(isLiveConnected({ kind: "needs-institution" })).toBe(false);
    expect(isLiveConnected(undefined)).toBe(false);
    expect(isLiveConnected(connected)).toBe(true);
  });
});

describe("resolveSwitcherSelection", () => {
  it("keeps the active code when still connected", () => {
    expect(resolveSwitcherSelection("b", ["A", "B"])).toBe("B");
  });
  it("falls back to the first connected code", () => {
    expect(resolveSwitcherSelection("Z", ["A", "B"])).toBe("A");
  });
  it("returns empty when nothing is connected", () => {
    expect(resolveSwitcherSelection("A", [])).toBe("");
  });
});
