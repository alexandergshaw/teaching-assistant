import { describe, expect, it } from "vitest";
import { legacyPptDesignView } from "./ppt-view-migration";
import { isManualViewType, isPresentationsView } from "../app/components/manual/manual-rail";

describe("legacyPptDesignView", () => {
  it("maps the retired ppt-design value to presentations + ppt-design", () => {
    expect(legacyPptDesignView("ppt-design")).toEqual({
      manualView: "presentations",
      presentationsView: "ppt-design",
    });
  });

  it("returns a target that passes the live guards", () => {
    const r = legacyPptDesignView("ppt-design");
    expect(r).not.toBeNull();
    expect(isManualViewType(r?.manualView)).toBe(true);
    expect(isPresentationsView(r?.presentationsView)).toBe(true);
  });

  it("returns null for every other value", () => {
    for (const v of ["presentations", "pipeline", "", "slide-deck", "PPT-DESIGN", "repo-grades"]) {
      expect(legacyPptDesignView(v)).toBeNull();
    }
    expect(legacyPptDesignView(null)).toBeNull();
    expect(legacyPptDesignView(undefined)).toBeNull();
  });
});
