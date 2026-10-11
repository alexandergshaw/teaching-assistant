import { describe, expect, it } from "vitest";
import { filterConnectedInstitutions } from "./connected-institutions";
import { connectionMapFromCheck } from "./connection-map";

describe("connectionMapFromCheck", () => {
  it("marks only canvas-configured institutions as connected", () => {
    const map = connectionMapFromCheck({
      statuses: [
        { acronym: "MCC", canvasConfigured: true },
        { acronym: "ABC", canvasConfigured: false },
      ],
    });
    expect(filterConnectedInstitutions(["MCC", "ABC", "ZZZ"], map)).toEqual(["MCC"]);
  });

  it("offers nothing when the check errored", () => {
    const map = connectionMapFromCheck({ error: "boom" });
    expect(filterConnectedInstitutions(["MCC"], map)).toEqual([]);
  });
});
