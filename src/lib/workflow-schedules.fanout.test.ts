import { describe, it, expect } from "vitest";
import { parseFanoutProgress } from "./workflow-schedules";

describe("parseFanoutProgress", () => {
  it("returns null for non-objects and objects without a runToken", () => {
    expect(parseFanoutProgress(null)).toBeNull();
    expect(parseFanoutProgress(undefined)).toBeNull();
    expect(parseFanoutProgress("x")).toBeNull();
    expect(parseFanoutProgress([])).toBeNull();
    expect(parseFanoutProgress({})).toBeNull();
    expect(parseFanoutProgress({ runToken: "" })).toBeNull();
  });

  it("parses a full checkpoint", () => {
    expect(
      parseFanoutProgress({
        runToken: "tok",
        occurrenceRunAt: "2026-08-16T00:00:00.000Z",
        resumeNextRunAt: "2026-08-17T00:00:00.000Z",
        doneInstitutions: ["AAA", "BBB"],
        attempts: 3,
        anyError: true,
      })
    ).toEqual({
      runToken: "tok",
      occurrenceRunAt: "2026-08-16T00:00:00.000Z",
      resumeNextRunAt: "2026-08-17T00:00:00.000Z",
      doneInstitutions: ["AAA", "BBB"],
      attempts: 3,
      anyError: true,
    });
  });

  it("defaults missing/mistyped fields and filters non-string institutions", () => {
    expect(
      parseFanoutProgress({
        runToken: "tok",
        doneInstitutions: ["AAA", 5, null, "CCC"],
      })
    ).toEqual({
      runToken: "tok",
      occurrenceRunAt: "",
      resumeNextRunAt: null,
      doneInstitutions: ["AAA", "CCC"],
      attempts: 0,
      anyError: false,
    });
  });
});
