import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GradeResult } from "@/lib/grade/types";
import { VersionedResultDetails } from "./VersionedResultDetails";

const result: GradeResult = { student: "Ada", totalScore: "4/5", strengths: "", improvements: "", resubmitNotice: "", overallComment: "", feedback: "", rubricAreas: [{ area: "Correctness", score: "4/5", comment: "Good work" }], mergedFileCount: 0, submittedFiles: [] };

describe("versioned result details", () => {
  it("renders the original score, feedback and version without edit or posting controls", () => {
    const html = renderToStaticMarkup(createElement(VersionedResultDetails, { row: { sourceIndex: 0, resultRevision: 1, setupVersion: 2, result, areas: result.rubricAreas } }));
    expect(html).toContain("Original grading; setup version 2");
    expect(html).toContain("Correctness");
    expect(html).toContain("4/5");
    expect(html).toContain("Good work");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });
  it("discloses unknown provenance", () => {
    const html = renderToStaticMarkup(createElement(VersionedResultDetails, { row: { sourceIndex: 0, resultRevision: 1, setupVersion: null, result, areas: [] } }));
    expect(html).toContain("Original grading; setup version unknown");
  });
});
