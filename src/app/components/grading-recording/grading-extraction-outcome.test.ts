import { describe, it, expect } from "vitest";
import { describeExtractionOutcome, isDangerNotice } from "./grading-extraction-outcome";

describe("describeExtractionOutcome (R1a's three distinguishable outcomes, plus 'added')", () => {
  it("outcome 3 - a hard error - returns exactly one 'error' notice with the verbatim message", () => {
    expect(describeExtractionOutcome({ error: "The model returned no submissions and did not confirm..." }, 0)).toEqual([
      { kind: "error", text: "The model returned no submissions and did not confirm..." },
    ]);
  });

  it("outcome 1 - confirmedEmpty - returns exactly one 'confirmed-empty' notice, distinct from a hard error", () => {
    const notices = describeExtractionOutcome({ submissions: [], confirmedEmpty: true, skippedUnnamed: 0 }, 0);
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe("confirmed-empty");
  });

  it("outcome 2 - skippedUnnamed > 0 - returns a 'skipped-unnamed' notice naming the count", () => {
    const notices = describeExtractionOutcome({ submissions: [], confirmedEmpty: false, skippedUnnamed: 2 }, 0);
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe("skipped-unnamed");
    expect(notices[0].text).toContain("2 submissions");
  });

  it("singular wording for exactly one skipped", () => {
    const notices = describeExtractionOutcome({ submissions: [], confirmedEmpty: false, skippedUnnamed: 1 }, 0);
    expect(notices[0].text).toContain("1 submission ");
    expect(notices[0].text).not.toContain("1 submissions");
  });

  it("an ordinary success with new submissions and nothing skipped returns exactly one 'added' notice", () => {
    const notices = describeExtractionOutcome({ submissions: [], confirmedEmpty: false, skippedUnnamed: 0 }, 3);
    expect(notices).toEqual([{ kind: "added", text: "3 new submissions found." }]);
  });

  it("a batch that both skips an unnamed submission AND adds new ones returns BOTH notices - not just the first", () => {
    const notices = describeExtractionOutcome({ submissions: [], confirmedEmpty: false, skippedUnnamed: 1 }, 2);
    expect(notices.map((n) => n.kind)).toEqual(["skipped-unnamed", "added"]);
  });

  it("nothing added, nothing skipped, not confirmed-empty (mid-batch, still scrolling) returns no notices at all", () => {
    expect(describeExtractionOutcome({ submissions: [], confirmedEmpty: false, skippedUnnamed: 0 }, 0)).toEqual([]);
  });
});

describe("isDangerNotice - R1a: an unreadable run must never look like a quiet success", () => {
  it("error and skipped-unnamed are danger notices", () => {
    expect(isDangerNotice("error")).toBe(true);
    expect(isDangerNotice("skipped-unnamed")).toBe(true);
  });

  it("confirmed-empty and added are NOT danger notices - both are real, honest outcomes", () => {
    expect(isDangerNotice("confirmed-empty")).toBe(false);
    expect(isDangerNotice("added")).toBe(false);
  });
});
