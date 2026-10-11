import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canSubmitLmsSelection,
  parseLmsPickerSelection,
  selectLmsAssignment,
  selectLmsCourse,
  selectLmsInstitution,
  valueIfPresent,
  type LmsPickerSelection,
} from "./lmsPickerState";

// Source-text reachability pins for the "From LMS" composer segment (no component
// renders in this repo, so these prove the control is wired, not that it renders),
// plus the pure cascade rules.
function withoutLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
const DIR = "src/app/components/grading-chat/";
const composer = withoutLineComments(readFileSync(DIR + "ChatComposer.tsx", "utf-8"));
const hook = withoutLineComments(readFileSync(DIR + "useLmsSubmissionPicker.ts", "utf-8"));
const action = withoutLineComments(readFileSync("src/app/actions/grading-chat-intake.ts", "utf-8"));

describe("ChatComposer - From LMS segment: every reachability hop", () => {
  it("InputMode includes lms", () => {
    expect(composer).toMatch(/type InputMode = [^;]*"lms"/);
  });

  it("loadInputMode admits a stored lms (the silent-revert hop)", () => {
    expect(composer).toMatch(/stored === "lms"/);
  });

  it("the SegmentedToggle has the From LMS option", () => {
    expect(composer).toContain('{ value: "lms", label: "From LMS" }');
  });

  it("a mode lms render block exists", () => {
    expect(composer).toContain('mode === "lms" && (');
  });

  it("the submit builds the url server-side, then reaches the existing onSubmitUrl", () => {
    const build = composer.indexOf("await buildLmsAssignmentUrlAction(");
    const submit = composer.indexOf("onSubmitUrl(built.url");
    expect(build).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(build);
    expect(composer).toContain("useLmsSubmissionPicker()");
  });
});

describe("ChatComposer - per-field indication reaches all three selects", () => {
  const block = composer.slice(composer.indexOf('mode === "lms" && ('));
  const call = (src: string, label: string): string => {
    const i = src.indexOf(label);
    expect(i).toBeGreaterThan(-1);
    return src.slice(i, i + 400);
  };

  it("each field is fed lmsFieldIndication with its OWN error source", () => {
    expect(block.match(/lmsFieldIndication\(/g)?.length).toBe(3);
    expect(call(block, "const instInd = lmsFieldIndication(")).toContain("error: lms.errors.institutions");
    expect(call(block, "const courseInd = lmsFieldIndication(")).toContain("error: lms.errors.courses");
    expect(call(block, "const assignmentInd = lmsFieldIndication(")).toContain("error: lms.errors.assignments");
  });

  it("each select reads disabled, error and helperText from its indication", () => {
    for (const ind of ["instInd", "courseInd", "assignmentInd"]) {
      expect(block).toContain(`disabled={${ind}.disabled}`);
      expect(block).toContain(`error={${ind}.error}`);
      expect(block).toContain(`helperText={${ind}.helperText}`);
    }
  });

  it("the bottom alert renders only lmsError, not the merged lms.error", () => {
    expect(block).not.toMatch(/lms\.error\b/);
  });
});

describe("buildLmsAssignmentUrlAction and the hook sources", () => {
  it("the action is an owner-guarded named async export that builds the assignment path", () => {
    expect(action).toMatch(/export async function buildLmsAssignmentUrlAction\([\s\S]*?\{\s*await requireAppOwner\(\);/);
    expect(action).toContain("/courses/${course}/assignments/${assignment}");
  });

  it("the hook maps the institutions action's acronyms field", () => {
    expect(hook).toMatch(/r\.acronyms/);
    expect(hook).not.toMatch(/r\.institutions/);
  });
});

describe("From LMS picker cascade (pure)", () => {
  const full: LmsPickerSelection = { institution: "MCC", courseId: "1", assignmentId: "2" };

  it("changing the institution clears course and assignment", () => {
    expect(selectLmsInstitution(full, "MPCC")).toEqual({ institution: "MPCC", courseId: "", assignmentId: "" });
  });

  it("changing the course clears the assignment only", () => {
    expect(selectLmsCourse(full, "9")).toEqual({ institution: "MCC", courseId: "9", assignmentId: "" });
  });

  it("re-selecting the same institution or course keeps the rest", () => {
    expect(selectLmsInstitution(full, "MCC")).toBe(full);
    expect(selectLmsCourse(full, "1")).toBe(full);
  });

  it("changing the assignment changes only the assignment", () => {
    expect(selectLmsAssignment(full, "3")).toEqual({ ...full, assignmentId: "3" });
  });

  it("canSubmit is the three-field AND", () => {
    expect(canSubmitLmsSelection(full)).toBe(true);
    expect(canSubmitLmsSelection({ ...full, assignmentId: "" })).toBe(false);
    expect(canSubmitLmsSelection({ ...full, courseId: "" })).toBe(false);
    expect(canSubmitLmsSelection({ ...full, institution: "" })).toBe(false);
  });

  it("valueIfPresent blanks a value with no option", () => {
    expect(valueIfPresent("a", ["a", "b"])).toBe("a");
    expect(valueIfPresent("z", ["a", "b"])).toBe("");
  });

  it("parse degrades malformed storage to empty", () => {
    expect(parseLmsPickerSelection(null)).toEqual({ institution: "", courseId: "", assignmentId: "" });
    expect(parseLmsPickerSelection("{nope")).toEqual({ institution: "", courseId: "", assignmentId: "" });
    expect(parseLmsPickerSelection(JSON.stringify(full))).toEqual(full);
    expect(parseLmsPickerSelection(JSON.stringify({ institution: 5 })).institution).toBe("");
  });
});
