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

function stripCommentsTopLevel(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const hookSource = stripCommentsTopLevel(readFileSync(HOOK_PATH, "utf8"));

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

// ── Busy-key collision: startDate/weeks share one key across LMS+import ─────
//
// handleLmsStartDate and handleImportStartDate both key off `${c.id}:startDate`
// (same for the two weeks handlers, `${c.id}:weeks`) - identical to how the
// existing CSV/rubric/syllabus pairs already share one busy key across their
// own LMS/import handlers (e.g. handleLmsCsv and handleImportCsv both use
// `${c.id}:csv`). This is not a defect introduced by wiring these four up:
// there is exactly one boolean per field either way, so both buttons must
// read the same shared flag - a scheme that tried to show two independent
// spinners would still collide at this hook layer. These tests pin that the
// SAME literal key is used on both sides of each pair, so CourseRow.tsx's
// `busy("startDate")` / `busy("weeks")` checks are provably correct instead
// of merely assumed.
describe("handleLmsStartDate/handleImportStartDate and handleLmsWeeks/handleImportWeeks share one busy key per field", () => {
  it("both startDate handlers key off `${c.id}:startDate`", () => {
    const importStart = hookSource.indexOf("const handleImportStartDate = useCallback(");
    const importEnd = hookSource.indexOf("}, [getCourseCartridge, saveCourseFromImport, setBusyKey, setError]);", importStart);
    const importBody = hookSource.slice(importStart, importEnd);
    const lmsStart = hookSource.indexOf("const handleLmsStartDate = useCallback(");
    const lmsEnd = hookSource.indexOf("}, [onCourseUpdated, setBusyKey, setError]);", lmsStart);
    const lmsBody = hookSource.slice(lmsStart, lmsEnd);

    expect(importStart, "handleImportStartDate not found").toBeGreaterThan(-1);
    expect(lmsStart, "handleLmsStartDate not found").toBeGreaterThan(-1);
    expect(importBody).toMatch(/`\$\{c\.id\}:startDate`/);
    expect(lmsBody).toMatch(/`\$\{c\.id\}:startDate`/);
  });

  it("both weeks handlers key off `${c.id}:weeks`", () => {
    const importStart = hookSource.indexOf("const handleImportWeeks = useCallback(");
    const importEnd = hookSource.indexOf("}, [getCourseCartridge, saveCourseFromImport, setBusyKey, setError]);", importStart);
    const importBody = hookSource.slice(importStart, importEnd);
    const lmsStart = hookSource.indexOf("const handleLmsWeeks = useCallback(");
    const lmsEnd = hookSource.indexOf("}, [onCourseUpdated, setBusyKey, setError]);", lmsStart);
    const lmsBody = hookSource.slice(lmsStart, lmsEnd);

    expect(importStart, "handleImportWeeks not found").toBeGreaterThan(-1);
    expect(lmsStart, "handleLmsWeeks not found").toBeGreaterThan(-1);
    expect(importBody).toMatch(/`\$\{c\.id\}:weeks`/);
    expect(lmsBody).toMatch(/`\$\{c\.id\}:weeks`/);
  });
});

// ── Reachability: the four scalar handlers must keep a real UI call site ────
//
// docs/REGRESSION.md recorded these as "implemented, exported and
// unreachable - zero call sites. Start date and Weeks render as plain
// editable cells with no From-LMS affordance." CourseRow.tsx now calls each
// one from the startDate/weeks cells' EditableCell `actions` slot (the same
// slot the textbook/description cells already use for their own single
// action button). This guards the actual defect being fixed - a handler
// losing its only consumer again - without pinning the exact JSX shape
// around the call (this repo has twice been burned by source-text
// assertions that over-specified and forced contorted implementations): the
// fact pinned is only "the handler is invoked, with the row's course, from
// inside an onClick attribute", not any particular button markup.
describe("handleLmsStartDate/handleLmsWeeks/handleImportStartDate/handleImportWeeks are wired to real controls in CourseRow.tsx", () => {
  const rowSource = stripComments(
    readFileSync(join(process.cwd(), "src/app/components/courses/CourseRow.tsx"), "utf8")
  );

  it.each([
    "handleLmsStartDate",
    "handleLmsWeeks",
    "handleImportStartDate",
    "handleImportWeeks",
  ])("%s is invoked with the row's course from inside an onClick attribute", (handlerName) => {
    // Deliberately unpinned: whether the call is wrapped in `void`, whether
    // stopPropagation runs first, whether it's the only statement - none of
    // that is the fact being guarded. Only "onClick={...imports.<name>(course)...}".
    const onClickWithHandler = new RegExp(`onClick=\\{[^}]*imports\\.${handlerName}\\(course\\)[^}]*\\}`);
    expect(onClickWithHandler.test(rowSource), `${handlerName} has no onClick call site in CourseRow.tsx`).toBe(true);
  });

  it("each button is gated by the row's real canLms/canImport flags, never hardcoded disabled/hidden", () => {
    // Cheap guard against "technically wired, but behind a control that can
    // never render or enable" - `lms`/`importable` are CourseRow's own
    // `imports.canLms(course)`/`imports.canImport(course)` results, not a
    // stray `false` standing in for them. Uses a plain character window
    // (not a `[^}]*`-bounded regex) preceding each call site, because the
    // handler call sits inside its own `onClick={...}` attribute - any
    // regex that cannot cross a `}` never reaches past that attribute's own
    // closing brace and would silently check nothing (caught by sabotage:
    // an earlier `[^}]*` version of this test stayed green even after the
    // gate was hardcoded to `{false &&`).
    const gateFor: Record<string, string> = {
      handleLmsStartDate: "lms",
      handleLmsWeeks: "lms",
      handleImportStartDate: "importable",
      handleImportWeeks: "importable",
    };
    for (const [handlerName, gateVar] of Object.entries(gateFor)) {
      const idx = rowSource.indexOf(`imports.${handlerName}(course)`);
      expect(idx, `${handlerName} call site not found`).toBeGreaterThan(-1);
      const preceding = rowSource.slice(Math.max(0, idx - 400), idx);
      expect(preceding, `${handlerName}'s nearest gate is not "{${gateVar} &&"`).toMatch(
        new RegExp(`\\{${gateVar} &&`)
      );
      expect(preceding, `${handlerName} is gated by a hardcoded {false &&`).not.toMatch(/\{false &&/);
    }
  });
});
