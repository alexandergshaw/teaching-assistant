// Direct unit coverage for graphicsGapReportLines (AC1, the graphics-gap-
// reporting choke point) - the pure function assembleLectureFiles calls to
// build its "N slide(s) ... missing a required graphic" run-report line, and
// that registry.graphics-gap-reporting.test.ts's mockAssembled also calls
// directly (see that file's own header comment) so mocking assembleLectureFiles
// wholesale there does not hide this logic.
//
// Kept as its own file, following this directory's registry-helpers.<area>
// naming (registry-helpers.assembleLectureFiles.test.ts,
// registry-helpers.parseDayTime.test.ts, ...), rather than folded into the
// assembleLectureFiles suite - this function has no pptx/docx/jszip
// dependency at all, so it needs none of that suite's mocking.

import { describe, it, expect } from "vitest";
import { graphicsGapReportLines } from "./registry-helpers";
import type { AssignmentPlan } from "@/app/actions-types";

function planWith(overrides: Partial<AssignmentPlan> = {}): AssignmentPlan {
  return {
    assignmentName: "week-01",
    slides: [],
    presentationTitle: "Week 1",
    label: "Week 1",
    moduleIntroduction: "Intro",
    assignmentInstructions: "Instructions",
    moduleObjectives: "Objectives",
    weekNumber: 1,
    introTemplateHeadings: [],
    instructionsTemplateHeadings: [],
    ...overrides,
  };
}

describe("graphicsGapReportLines", () => {
  it("returns [] for an applied course whose slides all carry their required graphic", () => {
    const plans = [
      planWith({
        slides: [
          {
            title: "Artifact: a register",
            bullets: ["b"],
            graphic: { kind: "table", headers: ["A"], rows: [["1"]] },
          },
        ],
      }),
    ];
    expect(graphicsGapReportLines(plans, "applied")).toEqual([]);
  });

  it("names a single surviving gap with singular wording", () => {
    const plans = [
      planWith({
        slides: [{ title: "Judgment Call: cost vs schedule", bullets: ["b"] }],
      }),
    ];
    const lines = graphicsGapReportLines(plans, "applied");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "1 slide is missing a required graphic (Artifact/Judgment Call/Agenda) even after the repair pass."
    );
  });

  it("sums gaps across every plan and uses plural wording for more than one", () => {
    const plans = [
      planWith({
        weekNumber: 1,
        slides: [{ title: "Artifact: a charter", bullets: ["b"] }],
      }),
      planWith({
        weekNumber: 2,
        slides: [
          { title: "Agenda: kickoff", bullets: ["b"] },
          { title: "Judgment Call: scope vs budget", bullets: ["b"] },
        ],
      }),
    ];
    const lines = graphicsGapReportLines(plans, "applied");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "3 slides are missing a required graphic (Artifact/Judgment Call/Agenda) even after the repair pass."
    );
  });

  // A coding deck stays silent about applied's OWN vocabulary - "Artifact:"
  // is not one of CODING_GRAPHIC_REQUIRED_PREFIXES (slide-graphics.ts), and
  // this slide has no preceding "Section <n>:" divider so it is not the
  // positionally-detected concept-intro slide either. This is no longer a
  // blanket no-op for `kind !== "applied"` - see the next two tests, which
  // cover the coding gap this function now DOES report.
  it("stays quiet for a coding deck's Artifact:-titled slide, which coding does not require a graphic for", () => {
    const plans = [
      planWith({
        slides: [{ title: "Artifact: a register", bullets: ["b"] }],
      }),
    ];
    expect(graphicsGapReportLines(plans, "coding")).toEqual([]);
  });

  // The case that motivated this whole fix: enforceGraphicsForApplied now
  // enforces a coding deck's OWN graphic requirement (Agenda:/Terminology:
  // plus the positionally-detected concept-intro slide), so a real coding
  // gap must surface here too - and the parenthetical must name CODING's
  // slide types, never applied's "Artifact/Judgment Call/Agenda".
  it("names coding's own slide types when a coding deck has a real graphic gap", () => {
    const plans = [
      planWith({
        slides: [{ title: "Agenda: this week's plan", bullets: ["b"] }],
      }),
    ];
    const lines = graphicsGapReportLines(plans, "coding");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "1 slide is missing a required graphic (Agenda/Terminology/concept-intro) even after the repair pass."
    );
  });

  it("sums coding gaps across plans, uses plural wording, and never names applied's slide types", () => {
    const plans = [
      planWith({
        weekNumber: 1,
        slides: [{ title: "Agenda: this week's plan", bullets: ["b"] }],
      }),
      planWith({
        weekNumber: 2,
        slides: [{ title: "Terminology: key terms", bullets: ["b"] }],
      }),
    ];
    const lines = graphicsGapReportLines(plans, "coding");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      "2 slides are missing a required graphic (Agenda/Terminology/concept-intro) even after the repair pass."
    );
    expect(lines[0]).not.toContain("Artifact");
    expect(lines[0]).not.toContain("Judgment Call");
  });

  it("returns [] for an empty plans array", () => {
    expect(graphicsGapReportLines([], "applied")).toEqual([]);
  });
});
