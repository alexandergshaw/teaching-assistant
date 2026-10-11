import { describe, expect, it } from "vitest";
import {
  LMS_ASSIGNMENT_COPY,
  LMS_COURSE_COPY,
  LMS_INSTITUTION_COPY,
  lmsFieldIndication,
  type LmsFieldIndicationInput,
} from "./lmsPickerState";

const COPIES = [
  { name: "Institution", copy: LMS_INSTITUTION_COPY, loading: "Loading institutions...", empty: "No connected institutions", prompt: "" },
  { name: "Course", copy: LMS_COURSE_COPY, loading: "Loading courses...", empty: "No active courses for this institution", prompt: "Select an institution first" },
  { name: "Assignment", copy: LMS_ASSIGNMENT_COPY, loading: "Loading assignments...", empty: "No assignments for this course", prompt: "Select a course first" },
] as const;

function input(copy: (typeof COPIES)[number]["copy"], over: Partial<LmsFieldIndicationInput>): LmsFieldIndicationInput {
  return { globallyDisabled: false, parentSelected: true, loading: false, error: null, optionCount: 2, ...copy, ...over };
}

describe("lmsFieldIndication decision table", () => {
  for (const f of COPIES) {
    describe(f.name, () => {
      it("copy is frozen", () => {
        expect(f.copy.loadingText).toBe(f.loading);
        expect(f.copy.emptyOkText).toBe(f.empty);
        expect(f.copy.promptBeforeParent).toBe(f.prompt);
      });
      it("globally disabled", () => {
        expect(lmsFieldIndication(input(f.copy, { globallyDisabled: true }))).toEqual({ disabled: true, error: false, helperText: "" });
      });
      it("pre-parent", () => {
        expect(lmsFieldIndication(input(f.copy, { parentSelected: false }))).toEqual({ disabled: true, error: false, helperText: f.prompt });
      });
      it("loading", () => {
        expect(lmsFieldIndication(input(f.copy, { loading: true }))).toEqual({ disabled: true, error: false, helperText: f.loading });
      });
      it("error", () => {
        expect(lmsFieldIndication(input(f.copy, { error: "boom", optionCount: 0 }))).toEqual({ disabled: true, error: true, helperText: "boom" });
      });
      it("empty-ok", () => {
        expect(lmsFieldIndication(input(f.copy, { optionCount: 0 }))).toEqual({ disabled: true, error: false, helperText: f.empty });
      });
      it("populated", () => {
        expect(lmsFieldIndication(input(f.copy, {}))).toEqual({ disabled: false, error: false, helperText: "" });
      });
    });
  }
});

describe("never openable but empty", () => {
  it("optionCount 0 is always disabled; populated clean path is enabled", () => {
    let checked = 0;
    for (const globallyDisabled of [true, false])
      for (const parentSelected of [true, false])
        for (const loading of [true, false])
          for (const error of [null, "e"])
            for (const optionCount of [0, 1, 3]) {
              const r = lmsFieldIndication(input(LMS_COURSE_COPY, { globallyDisabled, parentSelected, loading, error, optionCount }));
              if (optionCount === 0) expect(r.disabled).toBe(true);
              if (optionCount > 0 && !loading && !error && parentSelected && !globallyDisabled) expect(r.disabled).toBe(false);
              checked++;
            }
    expect(checked).toBe(48);
  });
});
