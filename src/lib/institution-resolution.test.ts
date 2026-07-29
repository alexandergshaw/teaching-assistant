import { describe, it, expect } from "vitest";
import {
  resolveInstitution,
  requireInstitution,
  describeInstitutionResolutionFailure,
} from "./institution-resolution";

describe("resolveInstitution", () => {
  it("rung 1: an explicit bound value wins over everything else", () => {
    expect(
      resolveInstitution({
        bound: "AAA",
        tile: "BBB",
        active: "CCC",
        configured: ["DDD"],
      })
    ).toBe("AAA");
  });

  it("rung 2: the tile's institution beats the header when nothing is bound", () => {
    expect(
      resolveInstitution({
        bound: null,
        tile: "BBB",
        active: "CCC",
        configured: ["DDD"],
      })
    ).toBe("BBB");
  });

  it("rung 3: the header's active institution beats the single-configured fallback", () => {
    expect(
      resolveInstitution({
        bound: null,
        tile: null,
        active: "CCC",
        configured: ["DDD"],
      })
    ).toBe("CCC");
  });

  it("rung 4: the single configured institution fires when nothing else resolves", () => {
    expect(
      resolveInstitution({
        bound: null,
        tile: null,
        active: null,
        configured: ["DDD"],
      })
    ).toBe("DDD");
  });

  it("rung 4 never fires when two or more institutions are configured (ambiguous)", () => {
    expect(
      resolveInstitution({
        bound: null,
        tile: null,
        active: null,
        configured: ["DDD", "EEE"],
      })
    ).toBe("");
  });

  it("rung 4 never fires when zero institutions are configured", () => {
    expect(
      resolveInstitution({
        bound: null,
        tile: null,
        active: null,
        configured: [],
      })
    ).toBe("");
  });

  it("dedupes the configured list before checking for exactly one (same acronym twice still resolves)", () => {
    expect(
      resolveInstitution({
        bound: null,
        tile: null,
        active: null,
        configured: ["ddd", "DDD"],
      })
    ).toBe("DDD");
  });

  it("returns '' when every rung is empty", () => {
    expect(resolveInstitution({})).toBe("");
    expect(
      resolveInstitution({ bound: "", tile: "", active: "", configured: [] })
    ).toBe("");
  });

  it("trims and uppercases whichever rung wins", () => {
    expect(resolveInstitution({ bound: "  mcc  " })).toBe("MCC");
    expect(resolveInstitution({ tile: " mcc " })).toBe("MCC");
    expect(resolveInstitution({ active: " mcc " })).toBe("MCC");
    expect(resolveInstitution({ configured: [" mcc "] })).toBe("MCC");
  });

  it("skips a blank/whitespace-only rung and falls through to the next one", () => {
    expect(
      resolveInstitution({ bound: "   ", tile: "  ", active: "CCC", configured: ["DDD"] })
    ).toBe("CCC");
  });
});

describe("requireInstitution", () => {
  it("returns the resolved acronym when the ladder succeeds", () => {
    expect(requireInstitution({ active: "MCC" })).toBe("MCC");
  });

  it("throws a message naming every ladder option when nothing resolves", () => {
    expect(() => requireInstitution({})).toThrow(describeInstitutionResolutionFailure());
  });

  it("the failure message names binding, the course tile, the header, and configuration", () => {
    const message = describeInstitutionResolutionFailure();
    expect(message.toLowerCase()).toContain("bind an institution");
    expect(message.toLowerCase()).toContain("course tile");
    expect(message.toLowerCase()).toContain("header");
    expect(message.toLowerCase()).toContain("configure");
    // Never the old bare message this replaces.
    expect(message).not.toBe("An institution acronym is required.");
  });
});
