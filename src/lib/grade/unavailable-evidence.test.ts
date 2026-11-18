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
    expect(notebookNeedsVisualReview('{"nbformat":4,"nbformat_minor":5,"cells":[{"cell_type":"code","source":[],"outputs":[{"output_type":"display_data","data":{"image/png":"..."}}]}]}')).toBe(true);
    expect(notebookNeedsVisualReview('{"nbformat":4,"nbformat_minor":5,"cells":[{"cell_type":"code","source":[],"outputs":[{"output_type":"execute_result","data":{"text/plain":"42"}}]}]}')).toBe(false);
    expect(notebookNeedsVisualReview("not json")).toBe(true);
  });
  it.each([
    { nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "unknown", source: "content" }] },
    { nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "code", outputs: [] }] },
    { nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "markdown" }] },
    { nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "code", source: "print(1)" }] },
    { nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "markdown", source: "hello", outputs: [] }] },
    { nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "markdown", source: ["hello", 7] }] },
    { nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "code", source: [], outputs: [{ data: { "text/plain": "42" } }] }] },
  ])("holds structurally invalid notebook cells: %j", (notebook) => {
    expect(notebookNeedsVisualReview(JSON.stringify(notebook))).toBe(true);
  });
  it.each([{ cells: [] }, { nbformat: 4, cells: [] }, { nbformat: 5, nbformat_minor: 0, cells: [] }, { nbformat: 4, nbformat_minor: -1, cells: [] }, { nbformat: 4, nbformat_minor: "5", cells: [] }, { nbformat: 4, nbformat_minor: 1.5, cells: [] }])("holds unsupported notebook headers: %j", (notebook) => {
    expect(notebookNeedsVisualReview(JSON.stringify(notebook))).toBe(true);
  });
  it("accepts a supported notebook header with no visual outputs", () => {
    expect(notebookNeedsVisualReview(JSON.stringify({ nbformat: 4, nbformat_minor: 0, cells: [] }))).toBe(false);
  });
});
