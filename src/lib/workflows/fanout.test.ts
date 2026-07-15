import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  listConfiguredInstitutionsAction: vi.fn(),
}));

import { isInstitutionFanout, scopeForInstitution, resolveFanoutInstitutions } from "./fanout";
import { listConfiguredInstitutionsAction } from "@/app/actions";

describe("isInstitutionFanout", () => {
  it("is true only when the scope targets every institution", () => {
    expect(isInstitutionFanout({ institution: "*" })).toBe(true);
    expect(isInstitutionFanout({ institution: " * " })).toBe(true);
    expect(isInstitutionFanout({ institution: "MCC" })).toBe(false);
    expect(isInstitutionFanout({})).toBe(false);
    expect(isInstitutionFanout(undefined)).toBe(false);
    expect(isInstitutionFanout({ hubCourse: "*" })).toBe(false);
  });
});

describe("scopeForInstitution", () => {
  it("pins the institution and preserves the other scope families", () => {
    expect(scopeForInstitution({ institution: "*", hubCourse: "a\nb", org: "x" }, "MCC")).toEqual({
      institution: "MCC",
      hubCourse: "a\nb",
      org: "x",
    });
  });
});

describe("resolveFanoutInstitutions", () => {
  it("returns the configured acronym list", async () => {
    vi.mocked(listConfiguredInstitutionsAction).mockResolvedValue({ acronyms: ["AAA", "BBB"] });
    expect(await resolveFanoutInstitutions()).toEqual({ list: ["AAA", "BBB"] });
  });

  it("propagates an enumeration error instead of returning an empty list", async () => {
    vi.mocked(listConfiguredInstitutionsAction).mockResolvedValue({ error: "no access" });
    expect(await resolveFanoutInstitutions()).toEqual({ error: "no access" });
  });
});
