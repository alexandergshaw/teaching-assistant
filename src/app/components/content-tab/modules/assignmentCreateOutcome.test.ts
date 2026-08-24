import { describe, it, expect } from "vitest";
import { describeAssignmentCreateOutcome } from "./assignmentCreateOutcome";

// Chunk D step-11 regression coverage: createCourseAssignmentAction
// (canvas-modules.ts) now returns a SUCCESS-SHAPED object on a module-link
// failure - `{ id, name, htmlUrl, addedToModule: false, linkError }` - with
// no `error` key. Every caller that only tested `"error" in result` used to
// report a plain success for that case. These are the tests that would have
// caught it: the invariant is that `describeAssignmentCreateOutcome` NEVER
// returns `kind: "success"` when the link failed, and the assignment's id
// always appears in the text so a human can find the orphan in Canvas.
describe("describeAssignmentCreateOutcome", () => {
  it("reports a plain error when nothing was created (the { error } shape)", () => {
    const outcome = describeAssignmentCreateOutcome({ error: "Canvas rejected the request." }, () => "unreachable");
    expect(outcome).toEqual({ kind: "error", text: "Canvas rejected the request." });
  });

  it("reports success when the assignment was created and linked", () => {
    const outcome = describeAssignmentCreateOutcome(
      { id: 42, name: "Essay 1", htmlUrl: "https://x/42", addedToModule: true },
      (r) => `Created "${r.name}" in Module 1.`
    );
    expect(outcome).toEqual({ kind: "success", text: 'Created "Essay 1" in Module 1.' });
  });

  it("reports success, never an orphan note, when no module was requested at all (addedToModule:false with no linkError)", () => {
    // createCourseAssignmentAction returns exactly this shape when the
    // caller passes moduleId: null - addedToModule stays false because no
    // link was ever attempted, not because one failed. linkError is the only
    // reliable signal that a link was tried and failed (see this file's own
    // header comment) - addedToModule alone must never trigger the orphan
    // path, or every "no module selected" create would wrongly read as a
    // failure.
    const outcome = describeAssignmentCreateOutcome(
      { id: 43, name: "Essay 2", htmlUrl: "https://x/43", addedToModule: false },
      (r) => `Created "${r.name}"${r.addedToModule ? " and added it to the module" : ""}.`
    );
    expect(outcome).toEqual({ kind: "success", text: 'Created "Essay 2".' });
  });

  it("THE REGRESSION: reports an error (never success) when the assignment was created but the module link failed, and names the orphan's id", () => {
    const outcome = describeAssignmentCreateOutcome(
      { id: 44, name: "Essay 3", htmlUrl: "https://x/44", addedToModule: false, linkError: "Module not found" },
      (r) => `Created "${r.name}" in Module 2.`
    );
    expect(outcome.kind).toBe("error");
    expect(outcome.text).toContain("44");
    expect(outcome.text).toContain("Module not found");
    expect(outcome.text).toContain("Essay 3");
  });

  it("falls back to a generic message when linkError is set but empty-ish (still never success)", () => {
    const outcome = describeAssignmentCreateOutcome(
      { id: 45, name: "Essay 4", htmlUrl: "https://x/45", addedToModule: false, linkError: "" },
      () => "unreachable"
    );
    // linkError === "" is still `!== undefined`, so this is still the orphan
    // path, not success - an empty string is a real (if unhelpful) error
    // message, never treated as "no link was attempted".
    expect(outcome.kind).toBe("error");
    expect(outcome.text).toContain("45");
  });
});
