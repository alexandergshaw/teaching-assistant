import { describe, it, expect } from "vitest";
import {
  CURRENT_EVENTS_POINTS,
  CURRENT_EVENTS_RECENCY_WINDOW,
  CURRENT_EVENTS_LENGTH_TARGET,
  moduleTopicFromName,
  currentEventsAssignmentTitle,
  describeCurrentEventsDeadline,
  buildCurrentEventsRequirementsBlock,
  describeCurrentEventsOutcome,
  type CurrentEventsOutcomeCounts,
} from "./current-events-assignment";

// Finding 1 (step 10c review): every consumer of CURRENT_EVENTS_RECENCY_WINDOW
// concatenates it directly after the word "development" (this file's own
// requirements block, and both the embedded scaffold and the model prompt in
// current-events-assignment-generator.ts) with no connecting word of its
// own - so the constant itself is the ONLY place a leading preposition can
// come from. A render-based assertion that reads
// `${CURRENT_EVENTS_RECENCY_WINDOW}` out of the constant and interpolates it
// into the SAME template the production code uses is tautological (it would
// pass no matter what the constant said, since both sides come from one
// import) - this test pins the actual structural requirement directly
// instead: the fact, not the spelling, per docs/DEV_LOOP.md step 9's rule.
// Sabotage: reverted CURRENT_EVENTS_RECENCY_WINDOW to "the last 30 days" (no
// leading preposition, its shape before the step-10c fix) - this test
// failed. Restored, green again.
describe("CURRENT_EVENTS_RECENCY_WINDOW", () => {
  it("supplies its own leading time preposition, since every consumer concatenates it directly after a noun with no connector of its own", () => {
    expect(CURRENT_EVENTS_RECENCY_WINDOW).toMatch(/^(?:in|since|from|during|over|throughout)\b/i);
  });
});

describe("moduleTopicFromName", () => {
  it("strips a colon-separated leading Module label", () => {
    expect(moduleTopicFromName("Module 07: Loops")).toBe("Loops");
  });

  it("strips a hyphen-separated leading Week label", () => {
    expect(moduleTopicFromName("Week 3 - Recursion")).toBe("Recursion");
  });

  it("leaves a name with a non-module/week leading word unchanged", () => {
    expect(moduleTopicFromName("Unit 2 Arrays")).toBe("Unit 2 Arrays");
  });

  it("leaves a name with no label at all unchanged", () => {
    expect(moduleTopicFromName("Loops and Recursion")).toBe("Loops and Recursion");
  });

  it("falls back to the trimmed original when the name is only the label", () => {
    expect(moduleTopicFromName("Module 07")).toBe("Module 07");
  });

  it("trims surrounding whitespace", () => {
    expect(moduleTopicFromName("  Module 07: Loops  ")).toBe("Loops");
  });
});

describe("currentEventsAssignmentTitle", () => {
  it("is deterministic - same input always produces the same output", () => {
    const a = currentEventsAssignmentTitle("Module 07: Loops");
    const b = currentEventsAssignmentTitle("Module 07: Loops");
    expect(a).toBe(b);
  });

  it("composes the topic with the fixed suffix, as the idempotency key AC pins", () => {
    expect(currentEventsAssignmentTitle("Module 07: Loops")).toBe("Loops - Current Events Research");
  });

  it("is stable across repeated calls for a name with no label", () => {
    expect(currentEventsAssignmentTitle("Capstone Project")).toBe(
      currentEventsAssignmentTitle("Capstone Project")
    );
    expect(currentEventsAssignmentTitle("Capstone Project")).toBe("Capstone Project - Current Events Research");
  });
});

describe("describeCurrentEventsDeadline", () => {
  it("returns empty string for a null due date", () => {
    expect(describeCurrentEventsDeadline(null)).toBe("");
  });

  it("formats a concrete local date without touching UTC conversion", () => {
    // 23:59 local time, September 10 2026 is a Thursday.
    const due = new Date(2026, 8, 10, 23, 59, 0, 0);
    expect(describeCurrentEventsDeadline(due)).toBe("Thursday, September 10, 2026 at 11:59 PM");
  });

  it("formats midnight (12 AM) and noon (12 PM) correctly", () => {
    const midnight = new Date(2026, 0, 5, 0, 0, 0, 0); // Jan 5 2026 is a Monday
    const noon = new Date(2026, 0, 5, 12, 0, 0, 0);
    expect(describeCurrentEventsDeadline(midnight)).toBe("Monday, January 5, 2026 at 12:00 AM");
    expect(describeCurrentEventsDeadline(noon)).toBe("Monday, January 5, 2026 at 12:00 PM");
  });
});

describe("buildCurrentEventsRequirementsBlock", () => {
  const base = {
    deadlineText: "Thursday, September 10, 2026 at 11:59 PM",
    pointsPossible: CURRENT_EVENTS_POINTS,
    recencyWindow: CURRENT_EVENTS_RECENCY_WINDOW,
    lengthTarget: CURRENT_EVENTS_LENGTH_TARGET,
  };

  it("states all four facts when a deadline is present", () => {
    const block = buildCurrentEventsRequirementsBlock(base);
    expect(block).toContain(base.deadlineText);
    expect(block).toContain(String(CURRENT_EVENTS_POINTS));
    expect(block).toContain(CURRENT_EVENTS_RECENCY_WINDOW);
    expect(block).toContain(CURRENT_EVENTS_LENGTH_TARGET);
  });

  it("contains no angle brackets, so descriptionToHtml's pass-through branch can never fire on it", () => {
    const block = buildCurrentEventsRequirementsBlock(base);
    expect(block).not.toMatch(/[<>]/);
  });

  it("omits the due-date sentence entirely when deadlineText is empty, rather than saying 'due null'", () => {
    const block = buildCurrentEventsRequirementsBlock({ ...base, deadlineText: "" });
    expect(block).not.toMatch(/is due/i);
    expect(block).not.toMatch(/null/i);
    // The other three facts must still be present.
    expect(block).toContain(String(CURRENT_EVENTS_POINTS));
    expect(block).toContain(CURRENT_EVENTS_RECENCY_WINDOW);
    expect(block).toContain(CURRENT_EVENTS_LENGTH_TARGET);
  });

  // Finding 1 (step 10c review): this must run against the PRODUCTION
  // constant, never a hand-written grammatical fixture - a fixture like "in
  // the last 30 days" would pass even if CURRENT_EVENTS_RECENCY_WINDOW
  // itself had no leading preposition, which is exactly the bug this test
  // exists to catch (it shipped once: the constant was "the last 30 days"
  // with no "in", and this exact sentence rendered as "Use a news item or
  // development the last 30 days."). Sabotage: reverted
  // CURRENT_EVENTS_RECENCY_WINDOW to "the last 30 days" (no leading "in") -
  // this test failed because the rendered sentence read "development the
  // last 30 days." Restored, green again.
  it("renders the recency sentence grammatically using the real CURRENT_EVENTS_RECENCY_WINDOW constant", () => {
    const block = buildCurrentEventsRequirementsBlock(base);
    expect(block).toContain(`Use a news item or development ${CURRENT_EVENTS_RECENCY_WINDOW}.`);
  });
});

describe("describeCurrentEventsOutcome", () => {
  const emptyCounts: CurrentEventsOutcomeCounts = {
    created: 0,
    skippedExisting: 0,
    generationFailed: [],
    canvasFailed: [],
    noDeadline: [],
  };

  it("is a success with no failure text when everything was created", () => {
    const result = describeCurrentEventsOutcome({ ...emptyCounts, created: 4 }, "");
    expect(result.kind).toBe("success");
    expect(result.text).toContain("4 created");
    expect(result.text).not.toMatch(/failed/i);
  });

  it("is a success on a re-run that is entirely skips", () => {
    const result = describeCurrentEventsOutcome({ ...emptyCounts, created: 0, skippedExisting: 5 }, "");
    expect(result.kind).toBe("success");
    expect(result.text).toContain("0 created");
    expect(result.text).toContain("5 already existed and were skipped");
  });

  it("distinguishes a generation failure from a Canvas failure - different sentences for different problems", () => {
    const result = describeCurrentEventsOutcome(
      { ...emptyCounts, created: 2, generationFailed: ["Module 3"], canvasFailed: ["Module 6"] },
      ""
    );
    expect(result.kind).toBe("error");
    expect(result.text).toMatch(/generation failed for Module 3/);
    expect(result.text).toMatch(/Canvas did not finish creating the assignment for Module 6/);
    // The two sentences must not be interchangeable/collapsed into each other.
    expect(result.text).not.toMatch(/Canvas did not finish creating the assignment for Module 3/);
    expect(result.text).not.toMatch(/generation failed for Module 6/);
  });

  // Finding 4 (step 10c review): a module in canvasFailed can be either an
  // outright Canvas failure OR an "orphaned" result (assignment created,
  // only the module link failed) - useCurrentEventsAssignments.ts counts
  // both the same way, on purpose. The WORDING must stay true for both, so
  // it must never claim Canvas "rejected" anything - that is false for the
  // orphan case, where Canvas did create the object. Sabotage: reverted the
  // canvasFailed line to `Canvas rejected the assignment for ${...}` - this
  // test failed on the `not.toMatch(/rejected/i)` assertion. Restored, green
  // again.
  it("never claims Canvas 'rejected' the assignment, since canvasFailed also covers orphaned (created-but-unlinked) results", () => {
    const result = describeCurrentEventsOutcome(
      { ...emptyCounts, created: 1, canvasFailed: ["Module 6"] },
      ""
    );
    expect(result.text).not.toMatch(/rejected/i);
    expect(result.text).toMatch(/Canvas did not finish creating the assignment for Module 6/);
  });

  it("renders all three no-deadline reasons distinguishably", () => {
    const result = describeCurrentEventsOutcome(
      {
        ...emptyCounts,
        created: 1,
        noDeadline: [
          { moduleName: "Module 1", reason: "no-course-row" },
          { moduleName: "Module 2", reason: "no-course-start-date" },
          { moduleName: "Module 3", reason: "no-week-number" },
        ],
      },
      ""
    );
    expect(result.text).toMatch(/Module 1 \(the course could not be loaded\)/);
    expect(result.text).toMatch(/Module 2 \(this course has no start date\)/);
    expect(result.text).toMatch(/Module 3 \(the module name carries no week number\)/);
  });

  it("appends a non-empty orphans clause verbatim, last, and marks the outcome as an error", () => {
    const clause = " 2 created but not linked - find them in Canvas: assignment \"Foo\" (id 1); assignment \"Bar\" (id 2).";
    const result = describeCurrentEventsOutcome({ ...emptyCounts, created: 3 }, clause);
    expect(result.text.endsWith(clause)).toBe(true);
    expect(result.kind).toBe("error");
  });

  // Finding 5 (step 10c review): the original version of this test called
  // describeCurrentEventsOutcome twice with IDENTICAL arguments and asserted
  // the two results were equal - a pure function returns the same output for
  // the same input by construction, so that assertion could never fail.
  // Pinned instead: the exact text produced when orphansClause is "", so a
  // future change that appends anything for the empty case (even a stray
  // space) is caught. Sabotage: changed the source to
  // `text += orphansClause + " ";` (an unconditional trailing space) - this
  // test failed on the exact-match assertion. Restored, green again.
  it("appends nothing extra when the orphans clause is empty", () => {
    const result = describeCurrentEventsOutcome({ ...emptyCounts, created: 3 }, "");
    expect(result.text).toBe("Current events assignments: 3 created.");
    expect(result.text.endsWith(".")).toBe(true);
  });
});
