import { describe, expect, it } from "vitest";
import { hasUnreviewedNotebook, notebookNeedsVisualReview, reportsUnavailableEvidence, runtimeDependencyUnavailable } from "./unavailable-evidence";

describe("unavailable grading evidence", () => {
  it("recognizes a sandbox missing a Python package without suppressing a code error", () => {
    const run = { language: "python", files: ["main.py"], ran: false, exitCode: 1, stdout: "", stderr: "ModuleNotFoundError: No module named 'numpy'" };
    expect(runtimeDependencyUnavailable(run)).toBe(true);
    expect(runtimeDependencyUnavailable({ ...run, stderr: "NameError: name 'numpy' is not defined" })).toBe(false);
  });
  it("holds a present notebook when content could not be reviewed", () => {
    const inventory = { source: "a/b", scope: { kind: "repository" as const, path: null }, enumerationComplete: true, files: [{ path: "work.ipynb", content: "unsupported" as const }] };
    expect(hasUnreviewedNotebook([inventory])).toBe(true);
    expect(hasUnreviewedNotebook([{ ...inventory, files: [{ path: "work.ipynb", content: "read" }] }])).toBe(false);
    expect(hasUnreviewedNotebook([{ ...inventory, enumerationComplete: false, files: [] }])).toBe(true);
  });
  it.each([
    "The provided environment was missing dependencies and the visualization could not be verified.",
    "The missing dependencies in the provided environment prevented the notebook from running.",
    "The evaluation environment lacks numpy and pandas.",
    "I could not access the notebook to verify the frontier.",
    "The lack of evaluator visibility of notebook and data reduced this score.",
    "optimization_engine.ipynb file was not available for content inspection",
    "the notebook itself and the data/ directory were not fully visible in the scope for evaluation",
  ])("recognizes evaluator limitations: %s", (text) => expect(reportsUnavailableEvidence(text)).toBe(true));
  it("does not treat a specific student source defect as an evaluator failure", () => {
    expect(reportsUnavailableEvidence("The submitted algorithm does not compare both objectives.")).toBe(false);
  });
  it("does not treat visual notebook output as inspected text", () => {
    expect(notebookNeedsVisualReview('{"cells":[{"cell_type":"code","outputs":[{"data":{"image/png":"..."}}]}]}')).toBe(true);
    expect(notebookNeedsVisualReview('{"cells":[{"cell_type":"code","outputs":[{"data":{"text/plain":"42"}}]}]}')).toBe(false);
    expect(notebookNeedsVisualReview("not json")).toBe(true);
  });
});
