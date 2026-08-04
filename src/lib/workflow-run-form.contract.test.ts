// TDD for CHUNK B of the Course Build cleanup, written from the acceptance criteria
// BEFORE the implementation existed. These tests currently FAIL.
// Make them pass without changing what they assert.
//
// The UX problem, measured against the real preset: Course Build's run form shows 25-26
// fields and validates exactly TWO of them. Its single most consequential control,
// "Outputs to generate", renders 13 raw camelCase identifiers (assignments, objectives,
// openers, decks, guides, announcements, knowledgeChecks, significance, instructorNotes,
// codebase, startHere, qa, currentEvents) underneath a 1,163-character paragraph - while
// OUTPUT_FAMILY_LABELS, which already holds the human-readable strings, is never used as
// option labels at all.
//
// Everything here is a pure-module test. vitest runs environment:"node" with no jsdom and
// no testing-library in this repo, so React components cannot be rendered - see
// docs/REGRESSION.md entry 168. The rendering-side criteria (accessible names via
// htmlFor/id) are covered by a separate structural test, not this file.
import { describe, it, expect } from "vitest";
import { collectRuntimeFields, expandWorkflowDef, type RuntimeField } from "@/lib/workflows/types";
import { COURSE_BUILD } from "@/lib/workflows/presets/course-build";
import { getPresetDef } from "@/lib/workflows/presets";
import { getStepDefinition } from "@/lib/workflows/registry";
import { isFieldVisible } from "@/lib/workflow-field-visibility";
import { validateRunForm } from "@/app/components/workflows/validate-run-form";
import { partitionVisibleFields, groupSecondaryFields } from "@/lib/workflow-field-groups";
import { OUTPUT_FAMILIES, OUTPUT_FAMILY_LABELS } from "@/lib/output-selection";

function courseBuildFields(): RuntimeField[] {
  const expanded = expandWorkflowDef(COURSE_BUILD, getPresetDef);
  return collectRuntimeFields(
    { ...COURSE_BUILD, steps: expanded.steps },
    (type) => getStepDefinition(type)?.inputs
  );
}

const field = (fields: RuntimeField[], key: string) => fields.find((f) => f.fieldKey === key);

describe("AC B1 - options carry human labels, and the stored value format is unchanged", () => {
  it("the outputs field offers a label for every output family", () => {
    const outputs = field(courseBuildFields(), "outputs");
    expect(outputs).toBeDefined();
    // The raw keys stay the submitted values - this is a persistence format.
    expect(outputs!.options).toEqual([...OUTPUT_FAMILIES]);
    // ...but every one of them now has a display label.
    for (const family of OUTPUT_FAMILIES) {
      expect(outputs!.optionLabels?.[family]).toBe(OUTPUT_FAMILY_LABELS[family]);
    }
  });

  it("no option label is missing OR merely the raw key - that is the whole defect", () => {
    const outputs = field(courseBuildFields(), "outputs");
    // Assert PRESENCE first. Without this the filter below is vacuous: with no
    // optionLabels at all, `optionLabels?.[f] === f` is false for every family and
    // the test passes while the defect is fully intact.
    expect(outputs!.optionLabels).toBeDefined();
    const bad = OUTPUT_FAMILIES.filter((f) => {
      const label = outputs!.optionLabels?.[f];
      return !label || label === f;
    });
    expect(bad).toEqual([]);
  });

  it("the seven course-structure sources are labelled too", () => {
    const source = field(courseBuildFields(), "source");
    expect(source!.options).toHaveLength(7);
    for (const opt of source!.options ?? []) {
      const label = source!.optionLabels?.[opt];
      expect(label, `source option ${opt} has no label`).toBeTruthy();
      expect(label).not.toBe(opt);
    }
  });
});

describe("AC B3 - the form validates what it asks", () => {
  // Today only `hubCourse` and `source` are required, so an instructor can choose
  // "an uploaded course cartridge", attach nothing, press Run, and fail at step 1.
  it("choosing the cartridge source makes the cartridge upload required", () => {
    const fields = courseBuildFields();
    const values = { hubCourse: "c1", source: "course-cartridge" };
    const error = validateRunForm(fields, values, {});
    expect(error).toBeTruthy();
    expect(error).toMatch(/cartridge/i);
  });

  it("choosing the syllabus source makes the syllabus upload required", () => {
    const fields = courseBuildFields();
    const error = validateRunForm(fields, { hubCourse: "c1", source: "syllabus-document" }, {});
    expect(error).toBeTruthy();
    expect(error).toMatch(/syllabus/i);
  });

  // The other half of the contract, and the reason this is safe: a gated field that is
  // NOT currently shown must never block Run. Entry 176 AC2 depends on this.
  it("a source whose gated field is hidden does not block Run", () => {
    const fields = courseBuildFields();
    const error = validateRunForm(fields, { hubCourse: "c1", source: "course-description" }, {});
    expect(error).toBeNull();
  });

  it("supplying the file clears the error", () => {
    const fields = courseBuildFields();
    const uploads = { cartridge: [new File(["x"], "course.imscc")] };
    const error = validateRunForm(fields, { hubCourse: "c1", source: "course-cartridge" }, uploads);
    expect(error).toBeNull();
  });
});

describe("AC B6 - a toggle for an output you did not select is not shown", () => {
  it("isFieldVisible supports a `contains` gate for multi-select values", () => {
    const gated = { visibleWhen: { fieldKey: "outputs", contains: "guides" } } as Parameters<
      typeof isFieldVisible
    >[0];
    expect(isFieldVisible(gated, { outputs: "guides\ndecks" })).toBe(true);
    expect(isFieldVisible(gated, { outputs: "decks\nassignments" })).toBe(false);
  });

  it("blank outputs means ALL, so every gated toggle stays visible - identical to today", () => {
    const gated = { visibleWhen: { fieldKey: "outputs", contains: "guides" } } as Parameters<
      typeof isFieldVisible
    >[0];
    expect(isFieldVisible(gated, { outputs: "" })).toBe(true);
    expect(isFieldVisible(gated, {})).toBe(true);
  });

  it("a `contains` gate never matches a mere substring of another family", () => {
    // "instructorNotes" must not satisfy a gate for "notes", and "qa" must not be
    // satisfied by "qaSomething". Matching is per whole newline-separated entry.
    const gated = { visibleWhen: { fieldKey: "outputs", contains: "qa" } } as Parameters<
      typeof isFieldVisible
    >[0];
    expect(isFieldVisible(gated, { outputs: "instructorNotes" })).toBe(false);
    expect(isFieldVisible(gated, { outputs: "qa" })).toBe(true);
  });

  // DEFERRED, deliberately. Applying these gates means declaring `visibleWhen` on the
  // per-step input specs, which live in five step files a concurrent refactor currently
  // owns (steps.weekly-announcements / knowledge-checks / weekly-significance /
  // instructor-notes / course-build-current-events). Two agents must never edit one file.
  // The OPERATOR is delivered and tested here; the six declarations follow once those
  // files are free. Tracked in the AC as B6-part-2.
});

describe("AC B7 - two grouping defects", () => {
  // SourcePolicyEditor is five checkboxes plus per-row Up/Down plus a strategy select
  // plus a reset link. It is not "compact", and it currently consumes the last of the
  // four Setup bonus slots purely because isCompactField only excludes longtext/concepts.
  it("a sourcePolicy field never consumes a primary-tier bonus slot", () => {
    const fields: RuntimeField[] = [
      { fieldKey: "a", label: "A", type: "text", required: false },
      { fieldKey: "sources", label: "Material sources", type: "sourcePolicy", required: false },
      { fieldKey: "b", label: "B", type: "text", required: false },
    ];
    const { primary, secondary } = partitionVisibleFields(fields, 2);
    expect(primary.map((f) => f.fieldKey)).toEqual(["a", "b"]);
    expect(secondary.map((f) => f.fieldKey)).toContain("sources");
  });

  // Opening a GitHub Copilot coding task is not "Posting". It lands there today only
  // because groupSecondaryFields buckets every boolean into Posting.
  it("an explicit group hint beats the type fallback", () => {
    const fields: RuntimeField[] = [
      { fieldKey: "dispatchVisualizerGaps", label: "Dispatch Copilot task for gaps", type: "boolean", required: false, group: "details" },
      { fieldKey: "guidesPostToLms", label: "Post guide pages to the LMS", type: "boolean", required: false },
    ];
    const groups = groupSecondaryFields(fields);
    const details = groups.find((g) => g.id === "details");
    const posting = groups.find((g) => g.id === "posting");
    expect(details?.fields.map((f) => f.fieldKey)).toEqual(["dispatchVisualizerGaps"]);
    expect(posting?.fields.map((f) => f.fieldKey)).toEqual(["guidesPostToLms"]);
  });

  it("without a hint, booleans still go to Posting - unchanged behavior", () => {
    const fields: RuntimeField[] = [
      { fieldKey: "x", label: "X", type: "boolean", required: false },
    ];
    expect(groupSecondaryFields(fields).find((g) => g.id === "posting")?.fields).toHaveLength(1);
  });
});
