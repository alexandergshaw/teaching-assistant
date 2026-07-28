import { describe, it, expect } from "vitest";
import {
  buildAssignmentChecklistSections,
  hasRenderableChecklist,
  resolveFallbackChecklistInput,
  applyDerivedChecklist,
} from "./grading-draft-checklist";
import type { GradingDraftPayload } from "./grading-drafts";
import type { GradingRunEntry } from "./grade";

function makeResult(student: string) {
  return {
    student,
    overallComment: "Good work",
    rubricAreas: [{ area: "Correctness", score: "9/10", comment: "Nice" }],
    totalScore: "9/10",
    feedback: "",
    mergedFileCount: 1,
    submittedFiles: [],
  };
}

function makeEntry(overrides: Partial<GradingRunEntry> = {}): GradingRunEntry {
  return {
    courseName: "CS 101",
    assignmentName: "Homework 3: Binary Search Tree",
    canvasUrl: "https://canvas.example.com/courses/1/assignments/2",
    run: {
      results: [makeResult("Alice")],
      rubricAreaNames: ["Correctness", "Style"],
      fullCreditChecklist: [],
    },
    ...overrides,
  };
}

describe("buildAssignmentChecklistSections", () => {
  it("returns exactly one section per assignment even when several students share it", () => {
    const payload: GradingDraftPayload = {
      runs: [
        makeEntry({
          run: {
            results: [makeResult("Alice"), makeResult("Bob"), makeResult("Cara")],
            rubricAreaNames: ["Correctness"],
            fullCreditChecklist: ["Implements insert and search", "Handles duplicate keys", "Includes tests"],
          },
        }),
      ],
    };

    const sections = buildAssignmentChecklistSections(payload);

    // The failure mode this guards against: grouping by result instead of by
    // run would produce one section per student (3), not one per assignment.
    expect(sections).toHaveLength(1);
    expect(sections[0].studentCount).toBe(3);
    expect(sections[0].checklist).toEqual([
      "Implements insert and search",
      "Handles duplicate keys",
      "Includes tests",
    ]);
  });

  it("marks a run with a persisted checklist as not needing derivation", () => {
    const payload: GradingDraftPayload = {
      runs: [
        makeEntry({
          run: {
            results: [makeResult("Alice")],
            rubricAreaNames: ["Correctness"],
            fullCreditChecklist: ["Item one", "Item two", "Item three"],
          },
        }),
      ],
    };

    const [section] = buildAssignmentChecklistSections(payload);
    expect(section.needsDerivation).toBe(false);
    expect(section.checklist).toHaveLength(3);
  });

  it("marks a run with an empty checklist as needing derivation", () => {
    const payload: GradingDraftPayload = {
      runs: [makeEntry({ run: { results: [makeResult("Alice")], rubricAreaNames: [], fullCreditChecklist: [] } })],
    };

    const [section] = buildAssignmentChecklistSections(payload);
    expect(section.needsDerivation).toBe(true);
    expect(section.checklist).toEqual([]);
  });

  it("produces one section per run for multiple assignments in one draft", () => {
    const payload: GradingDraftPayload = {
      runs: [
        makeEntry({ assignmentName: "Homework 1", run: { results: [makeResult("Alice")], rubricAreaNames: [], fullCreditChecklist: [] } }),
        makeEntry({ assignmentName: "Homework 2", run: { results: [makeResult("Bob"), makeResult("Cara")], rubricAreaNames: [], fullCreditChecklist: ["x"] } }),
      ],
    };

    const sections = buildAssignmentChecklistSections(payload);
    expect(sections).toHaveLength(2);
    expect(sections[0].runIndex).toBe(0);
    expect(sections[1].runIndex).toBe(1);
    expect(sections[0].assignmentName).toBe("Homework 1");
    expect(sections[1].assignmentName).toBe("Homework 2");
  });

  it("carries the sample answer through when present", () => {
    const payload: GradingDraftPayload = {
      runs: [
        makeEntry({
          run: {
            results: [makeResult("Alice")],
            rubricAreaNames: [],
            fullCreditChecklist: ["Item"],
            sampleAnswer: "A full-credit reference solution.",
          },
        }),
      ],
    };

    const [section] = buildAssignmentChecklistSections(payload);
    expect(section.sampleAnswer).toBe("A full-credit reference solution.");
  });
});

describe("hasRenderableChecklist", () => {
  it("is false for an empty checklist", () => {
    expect(hasRenderableChecklist([])).toBe(false);
  });

  it("is true when at least one item is present", () => {
    expect(hasRenderableChecklist(["one item"])).toBe(true);
  });
});

describe("resolveFallbackChecklistInput", () => {
  it("uses the assignment name as instructions and joins rubric area names", () => {
    const entry = makeEntry({
      assignmentName: "Homework 3: Binary Search Tree",
      run: { results: [], rubricAreaNames: ["Correctness", "Style"], fullCreditChecklist: [] },
    });

    const result = resolveFallbackChecklistInput(entry);
    expect(result).toEqual({
      instructions: "Homework 3: Binary Search Tree",
      rubric: "Correctness\nStyle",
    });
  });

  it("returns null when there is no assignment name to derive from", () => {
    const entry = makeEntry({ assignmentName: "  " });
    expect(resolveFallbackChecklistInput(entry)).toBeNull();
  });
});

describe("applyDerivedChecklist", () => {
  it("sets the checklist on the targeted run", () => {
    const payload: GradingDraftPayload = { runs: [makeEntry()] };
    const updated = applyDerivedChecklist(payload, 0, ["A", "B", "C"]);
    expect(updated.runs[0].run.fullCreditChecklist).toEqual(["A", "B", "C"]);
  });

  it("does not mutate the input payload", () => {
    const payload: GradingDraftPayload = { runs: [makeEntry()] };
    applyDerivedChecklist(payload, 0, ["A", "B", "C"]);
    expect(payload.runs[0].run.fullCreditChecklist).toEqual([]);
  });

  it("leaves other runs untouched", () => {
    const payload: GradingDraftPayload = {
      runs: [makeEntry({ assignmentName: "Homework 1" }), makeEntry({ assignmentName: "Homework 2" })],
    };
    const updated = applyDerivedChecklist(payload, 1, ["A"]);
    expect(updated.runs[0].run.fullCreditChecklist).toEqual([]);
    expect(updated.runs[1].run.fullCreditChecklist).toEqual(["A"]);
  });

  it("a subsequent read of a cached checklist no longer needs derivation - proves reopening the page cannot re-derive it", () => {
    const payload: GradingDraftPayload = { runs: [makeEntry()] };
    const cached = applyDerivedChecklist(payload, 0, ["A", "B", "C"]);
    const [section] = buildAssignmentChecklistSections(cached);
    expect(section.needsDerivation).toBe(false);
  });
});
