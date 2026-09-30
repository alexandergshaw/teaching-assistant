import { describe, expect, it } from "vitest";
import type { ChecklistFinding, ChecklistResult } from "./checklists";
import { mergeChecklistResults, mergeWithDeterministicChecklist } from "./review-merge";
import type { Checklist, ChecklistDeckInput } from "./checklists";

function finding(overrides: Partial<ChecklistFinding> = {}): ChecklistFinding {
  return {
    checklistId: "info-flow",
    itemId: "vocab-without-a-model",
    message: "default message",
    ...overrides,
  };
}

function result(overrides: Partial<ChecklistResult> = {}): ChecklistResult {
  return {
    checklistVersion: "info-flow-checklist-v1",
    findings: [],
    ranItemIds: [],
    ...overrides,
  };
}

describe("mergeChecklistResults", () => {
  it("orders merged findings deterministic-then-llm", () => {
    const det = result({
      findings: [
        finding({ itemId: "vocab-without-a-model", message: "det-1" }),
        finding({ itemId: "standalone-reconstructable", message: "det-2" }),
      ],
      ranItemIds: ["vocab-without-a-model", "standalone-reconstructable"],
    });
    const llm = result({
      findings: [
        finding({ itemId: "main-point-obvious", message: "llm-1" }),
        finding({ itemId: "where-to-look-first", message: "llm-2" }),
      ],
      ranItemIds: ["main-point-obvious", "where-to-look-first"],
    });

    const merged = mergeChecklistResults(det, llm);

    expect(merged.findings.map((f) => f.message)).toEqual(["det-1", "det-2", "llm-1", "llm-2"]);
  });

  it("collapses a byte-identical duplicate finding to one", () => {
    const shared = finding({
      checklistId: "info-flow",
      itemId: "vocab-without-a-model",
      slideIndex: 2,
      message: "Term X has no definition row.",
    });
    const det = result({ findings: [shared], ranItemIds: ["vocab-without-a-model"] });
    const llm = result({ findings: [{ ...shared }], ranItemIds: ["vocab-without-a-model"] });

    const merged = mergeChecklistResults(det, llm);

    expect(merged.findings).toHaveLength(1);
    expect(merged.findings[0]).toEqual(shared);
  });

  it("keeps distinct findings on the same itemId from both sources", () => {
    const det = result({
      findings: [finding({ itemId: "vocab-without-a-model", slideIndex: 1, message: "det message" })],
      ranItemIds: ["vocab-without-a-model"],
    });
    const llm = result({
      findings: [finding({ itemId: "vocab-without-a-model", slideIndex: 1, message: "llm message" })],
      ranItemIds: ["vocab-without-a-model"],
    });

    const merged = mergeChecklistResults(det, llm);

    expect(merged.findings).toHaveLength(2);
    expect(merged.findings.map((f) => f.message)).toEqual(["det message", "llm message"]);
  });

  it("unions ranItemIds so items covered by either pass are all reported covered (non-vacuous)", () => {
    const det = result({ ranItemIds: ["a", "b"] });
    const llm = result({ ranItemIds: ["c", "d"] });

    const merged = mergeChecklistResults(det, llm);

    expect(merged.ranItemIds).toEqual(["a", "b", "c", "d"]);

    // Non-vacuous: prove that dropping one source's ranItemIds would leave
    // an item falsely uncovered - i.e. the union is doing real work, not
    // just echoing one side.
    const detOnly = mergeChecklistResults(det, result());
    expect(detOnly.ranItemIds).not.toContain("c");
    expect(detOnly.ranItemIds).not.toContain("d");

    const llmOnly = mergeChecklistResults(result(), llm);
    expect(llmOnly.ranItemIds).not.toContain("a");
    expect(llmOnly.ranItemIds).not.toContain("b");
  });

  it("dedupes ranItemIds when both sources ran the same item", () => {
    const det = result({ ranItemIds: ["a", "b"] });
    const llm = result({ ranItemIds: ["b", "c"] });

    const merged = mergeChecklistResults(det, llm);

    expect(merged.ranItemIds).toEqual(["a", "b", "c"]);
  });

  it("prefers the deterministic checklistVersion on mismatch without throwing, and notes it", () => {
    const det = result({ checklistVersion: "info-flow-checklist-v1" });
    const llm = result({ checklistVersion: "info-flow-checklist-v2" });

    expect(() => mergeChecklistResults(det, llm)).not.toThrow();

    const merged = mergeChecklistResults(det, llm);

    expect(merged.checklistVersion).toBe("info-flow-checklist-v1");
    expect(
      merged.findings.some(
        (f) =>
          f.checklistId === "review-merge" &&
          f.itemId === "checklist-version-mismatch" &&
          f.message.includes("info-flow-checklist-v1") &&
          f.message.includes("info-flow-checklist-v2")
      )
    ).toBe(true);
  });

  it("does not add a mismatch note when versions agree", () => {
    const det = result({ checklistVersion: "info-flow-checklist-v1" });
    const llm = result({ checklistVersion: "info-flow-checklist-v1" });

    const merged = mergeChecklistResults(det, llm);

    expect(merged.findings.some((f) => f.checklistId === "review-merge")).toBe(false);
  });

  it("returns empty findings and an empty ranItemIds union for empty inputs", () => {
    const merged = mergeChecklistResults(result(), result());

    expect(merged.findings).toEqual([]);
    expect(merged.ranItemIds).toEqual([]);
    expect(merged.checklistVersion).toBe("info-flow-checklist-v1");
  });
});

describe("mergeWithDeterministicChecklist", () => {
  const checklist: Checklist = {
    id: "info-flow",
    version: "info-flow-checklist-v1",
    items: [
      { id: "vocab-without-a-model", text: "vocab?", mode: "deterministic" },
      { id: "main-point-obvious", text: "main point?", mode: "llm" },
    ],
  };

  it("runs the deterministic pass and merges it with a given llm result", () => {
    const deck: ChecklistDeckInput = {
      slides: [
        { title: "Title", bullets: [] },
        {
          title: "Terms",
          bullets: ["b"],
          terms: [{ term: "API", definition: "" }],
        },
      ],
    };
    const llm = result({
      findings: [finding({ itemId: "main-point-obvious", message: "unclear" })],
      ranItemIds: ["main-point-obvious"],
    });

    const merged = mergeWithDeterministicChecklist(checklist, deck, llm);

    expect(merged.ranItemIds).toEqual(["vocab-without-a-model", "main-point-obvious"]);
    expect(merged.findings.some((f) => f.itemId === "vocab-without-a-model")).toBe(true);
    expect(merged.findings.some((f) => f.itemId === "main-point-obvious" && f.message === "unclear")).toBe(
      true
    );
  });
});
