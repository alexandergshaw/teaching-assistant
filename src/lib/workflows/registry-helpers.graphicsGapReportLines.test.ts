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

  // A coding deck must stay silent even if a slide happens to carry a title
  // that would be graphic-required in an applied course -
  // enforceGraphicsForApplied is a no-op for `kind !== "applied"` by
  // construction, and this function must inherit that exactly, never
  // reinterpret the vocabulary on its own.
  it("is a no-op for a coding course, even with Artifact:-prefixed titles and no graphic", () => {
    const plans = [
      planWith({
        slides: [{ title: "Artifact: a register", bullets: ["b"] }],
      }),
    ];
    expect(graphicsGapReportLines(plans, "coding")).toEqual([]);
  });

  it("returns [] for an empty plans array", () => {
    expect(graphicsGapReportLines([], "applied")).toEqual([]);
  });
});
