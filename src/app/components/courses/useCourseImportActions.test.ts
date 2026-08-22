// useCourseImportActions.ts is a React hook (useCallback/useRef) and this
// vitest setup is node-env with no renderer (see useRubrics.test.ts's own
// header comment for the established precedent) - so it cannot be exercised
// directly. `pickRubricToPull` is the one decision handleLmsRubric ("Pull
// rubric from LMS") makes about a listRubricsAction result, pulled into a
// plain, exported function for exactly that reason. This file pins finding 5
// (docs/rubric-source-module-column-route-handler-acceptance-criteria.md):
// a partial rubric load must proceed with whatever loaded rather than
// aborting, and the rubric handed to the course-scoped getRubricAction must
// always be course-level, never account-level.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { pickRubricToPull } from "./useCourseImportActions";
import type { CanvasRubric } from "@/lib/canvas-modules";

const HOOK_PATH = join(process.cwd(), "src/app/components/courses/useCourseImportActions.ts");

const courseRubric: CanvasRubric = { id: 1, title: "Essay Rubric", source: "course" };
const secondCourseRubric: CanvasRubric = { id: 2, title: "Lab Rubric", source: "course" };
const accountRubric: CanvasRubric = { id: 9, title: "Shared Dept Rubric", source: "account" };

describe("pickRubricToPull", () => {
  it("picks the sole course-level rubric on a clean load", () => {
    const result = pickRubricToPull({ rubrics: [courseRubric] });
    expect(result).toEqual({ rubricId: 1 });
  });

  it("picks a course-level rubric even when account-level rubrics are listed first", () => {
    const result = pickRubricToPull({ rubrics: [accountRubric, courseRubric] });
    expect(result).toEqual({ rubricId: 1 });
  });

  it("picks the FIRST course-level rubric when several are present, same as before this change", () => {
    const result = pickRubricToPull({ rubrics: [courseRubric, secondCourseRubric] });
    expect(result).toEqual({ rubricId: 1 });
  });

  it("errors with the original no-rubrics message when the course genuinely has none", () => {
    const result = pickRubricToPull({ rubrics: [] });
    expect(result).toEqual({ error: "The LMS course has no rubrics." });
  });

  it("the bare failure shape (no owner session, bad course URL/institution) is a real error", () => {
    const result = pickRubricToPull({ error: "Not authorized." });
    expect(result).toEqual({ error: "Not authorized." });
  });

  it("PROCEEDS on a partial load: rubrics loaded from one source are used even though `error` is set", () => {
    // This is the case a bare `"error" in lr` check used to abort on -
    // finding 5's core bug. An unrelated account-endpoint hiccup must not
    // turn a working import into a hard error when a course rubric loaded.
    const result = pickRubricToPull({
      rubrics: [courseRubric],
      error: "Could not load account-level rubrics (HTTP 500).",
    });
    expect(result).toEqual({ rubricId: 1 });
  });

  it("an account-only course (course-level list empty, only account rubrics visible) is handled honestly, never handed to the course-scoped call", () => {
    // getRubricAction addresses /courses/:id/rubrics/:id - handing it an
    // account rubric's id would 404. rubrics[0] here IS an account rubric
    // (there being no course-level ones), so blindly taking it would be
    // exactly the R2 hazard finding 5 flags.
    const result = pickRubricToPull({ rubrics: [accountRubric] });
    expect(result).toEqual({
      error:
        "The LMS course has no course-level rubrics to pull (only account-level rubrics are visible, and this action only reads course-level ones).",
    });
  });

  it("a partial load with ONLY account rubrics surviving still reports the account-only message, not the partial-load error", () => {
    const result = pickRubricToPull({
      rubrics: [accountRubric],
      error: "Could not load this course's rubrics (HTTP 500).",
    });
    expect(result).toEqual({
      error:
        "The LMS course has no course-level rubrics to pull (only account-level rubrics are visible, and this action only reads course-level ones).",
    });
  });
});

// ── Wiring: handleLmsRubric actually uses pickRubricToPull (source text) ────

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("handleLmsRubric threads listRubricsAction's result through pickRubricToPull", () => {
  const hookSource = stripComments(readFileSync(HOOK_PATH, "utf8"));

  it("calls pickRubricToPull with the listRubricsAction result, rather than narrowing on `\"error\" in lr` directly", () => {
    const start = hookSource.indexOf("const handleLmsRubric = useCallback(");
    expect(start, "handleLmsRubric not found").toBeGreaterThan(-1);
    const end = hookSource.indexOf("}, [onCourseUpdated, setBusyKey, setError]);", start);
    const body = hookSource.slice(start, end);
    expect(body).toMatch(/pickRubricToPull\(lr\)/);
    expect(body).not.toMatch(/"error" in lr/);
  });

  it("passes the picked rubricId (never rubrics[0] directly) to getRubricAction", () => {
    const start = hookSource.indexOf("const handleLmsRubric = useCallback(");
    const end = hookSource.indexOf("}, [onCourseUpdated, setBusyKey, setError]);", start);
    const body = hookSource.slice(start, end);
    expect(body).toMatch(/getRubricAction\([^)]*picked\.rubricId/);
    expect(body).not.toMatch(/rubrics\[0\]/);
  });
});
