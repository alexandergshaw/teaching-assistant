import { describe, it, expect } from "vitest";
import {
  partitionVisibleFields,
  groupSecondaryFields,
  DEFAULT_BONUS_CAP,
} from "./workflow-field-groups";
import type { RuntimeField } from "@/lib/workflows/types";

// Minimal RuntimeField builder - every test supplies only the properties it
// cares about, matching this repo's usual fixture style (see
// multi-select-value.test.ts).
function field(overrides: Partial<RuntimeField> & { fieldKey: string }): RuntimeField {
  return {
    label: overrides.fieldKey,
    type: "text",
    required: false,
    ...overrides,
  };
}

describe("partitionVisibleFields", () => {
  it("an empty field list partitions to two empty tiers", () => {
    expect(partitionVisibleFields([])).toEqual({ primary: [], secondary: [] });
  });

  it("required fields are always primary, regardless of position or count", () => {
    const fields = [
      field({ fieldKey: "a", required: true }),
      field({ fieldKey: "b", required: true }),
      field({ fieldKey: "c", required: true }),
    ];
    const { primary, secondary } = partitionVisibleFields(fields, 0);
    expect(primary.map((f) => f.fieldKey)).toEqual(["a", "b", "c"]);
    expect(secondary).toEqual([]);
  });

  it("a gated (visibleWhen) field is always primary, even with the bonus cap at 0", () => {
    const fields = [
      field({ fieldKey: "source", required: true }),
      field({ fieldKey: "repo", visibleWhen: { fieldKey: "source", equals: "codebase" } }),
    ];
    const { primary } = partitionVisibleFields(fields, 0);
    expect(primary.map((f) => f.fieldKey)).toEqual(["source", "repo"]);
  });

  it("promotes up to bonusCap early, compact, non-required, non-gated fields into primary, in order", () => {
    const fields = [
      field({ fieldKey: "tile", required: true }),
      field({ fieldKey: "modules" }), // text - compact
      field({ fieldKey: "outputs", type: "longtext", multi: true, options: ["a", "b"] }), // multi-select - compact
      field({ fieldKey: "deckTemplate", type: "deckTemplate" }), // compact
      field({ fieldKey: "sources", type: "sourcePolicy" }), // compact
      field({ fieldKey: "assignmentTemplate", type: "assignmentTemplate" }), // 5th bonus candidate - past the cap
    ];
    const { primary, secondary } = partitionVisibleFields(fields, 4);
    expect(primary.map((f) => f.fieldKey)).toEqual([
      "tile",
      "modules",
      "outputs",
      "deckTemplate",
      "sources",
    ]);
    expect(secondary.map((f) => f.fieldKey)).toEqual(["assignmentTemplate"]);
  });

  it("a tall (longtext) non-required, non-gated field is deferred to secondary and does NOT consume a bonus slot - a later compact field can still fill it", () => {
    const fields = [
      field({ fieldKey: "context", type: "longtext" }),
      field({ fieldKey: "sourceMaterial", type: "longtext" }),
      field({ fieldKey: "modules" }),
    ];
    const { primary, secondary } = partitionVisibleFields(fields, 1);
    expect(primary.map((f) => f.fieldKey)).toEqual(["modules"]);
    expect(secondary.map((f) => f.fieldKey)).toEqual(["context", "sourceMaterial"]);
  });

  it("a bonusCap of 0 promotes nothing beyond required/gated fields", () => {
    const fields = [field({ fieldKey: "tile", required: true }), field({ fieldKey: "modules" })];
    const { primary, secondary } = partitionVisibleFields(fields, 0);
    expect(primary.map((f) => f.fieldKey)).toEqual(["tile"]);
    expect(secondary.map((f) => f.fieldKey)).toEqual(["modules"]);
  });

  it("defaults bonusCap to DEFAULT_BONUS_CAP when not given", () => {
    const compactOptionalFields = Array.from({ length: DEFAULT_BONUS_CAP + 2 }, (_, i) =>
      field({ fieldKey: `f${i}` })
    );
    const { primary, secondary } = partitionVisibleFields(compactOptionalFields);
    expect(primary.length).toBe(DEFAULT_BONUS_CAP);
    expect(secondary.length).toBe(2);
  });

  it("reproduces course-build's own field order for the 'course description' source path: tile, source, context/sourceMaterial deferred, modules/outputs promoted", () => {
    // Mirrors src/lib/workflows/presets/course-build.ts's actual field
    // order for a run where no per-source gated field is visible.
    const fields = [
      field({ fieldKey: "hubCourse", label: "Course tile", type: "hubCourse", required: true }),
      field({ fieldKey: "source", label: "Course structure source", required: true }),
      field({ fieldKey: "context", label: "Additional context (optional)", type: "longtext" }),
      field({ fieldKey: "sourceMaterial", label: "Source material (optional)", type: "longtext" }),
      field({ fieldKey: "modules", label: "Modules to generate" }),
      field({
        fieldKey: "outputs",
        label: "Outputs to generate",
        type: "longtext",
        multi: true,
        options: ["assignments", "decks"],
      }),
      field({ fieldKey: "courseProject", label: "Course project", type: "longtext" }),
    ];
    const { primary, secondary } = partitionVisibleFields(fields);
    expect(primary.map((f) => f.fieldKey)).toEqual(["hubCourse", "source", "modules", "outputs"]);
    expect(secondary.map((f) => f.fieldKey)).toEqual(["context", "sourceMaterial", "courseProject"]);
  });
});

describe("groupSecondaryFields", () => {
  it("an empty field list yields no groups", () => {
    expect(groupSecondaryFields([])).toEqual([]);
  });

  it("boolean fields group into 'posting'", () => {
    const fields = [
      field({ fieldKey: "guidesPostToLms", type: "boolean" }),
      field({ fieldKey: "announcementsPostToLms", type: "boolean" }),
    ];
    const groups = groupSecondaryFields(fields);
    expect(groups).toEqual([
      { id: "posting", label: "Posting", fields: fields },
    ]);
  });

  it("fields whose type names a template picker group into 'templates', case-insensitively", () => {
    const fields = [
      field({ fieldKey: "deckTemplate", type: "deckTemplate" }),
      field({ fieldKey: "assignmentTemplate", type: "assignmentTemplate" }),
    ];
    const groups = groupSecondaryFields(fields);
    expect(groups).toEqual([{ id: "templates", label: "Templates", fields }]);
  });

  it("everything else groups into 'details'", () => {
    const fields = [
      field({ fieldKey: "instructor" }),
      field({ fieldKey: "sourceUrl" }),
      field({ fieldKey: "courseProject", type: "longtext" }),
    ];
    const groups = groupSecondaryFields(fields);
    expect(groups).toEqual([{ id: "details", label: "Details", fields }]);
  });

  it("groups are returned in a fixed order (details, templates, posting) and omit any group with no fields", () => {
    const details = field({ fieldKey: "instructor" });
    const templates = field({ fieldKey: "deckTemplate", type: "deckTemplate" });
    const posting = field({ fieldKey: "guidesPostToLms", type: "boolean" });
    const groups = groupSecondaryFields([posting, templates, details]);
    expect(groups.map((g) => g.id)).toEqual(["details", "templates", "posting"]);
  });

  it("a workflow with only boolean fields produces exactly one group ('posting'), never empty 'details'/'templates' tabs", () => {
    const fields = [field({ fieldKey: "postToCanvas", type: "boolean" })];
    const groups = groupSecondaryFields(fields);
    expect(groups.length).toBe(1);
    expect(groups[0].id).toBe("posting");
  });

  it("course-build's own secondary tier (course-description path) splits 5/3/4 across details/templates/posting", () => {
    const fields = [
      field({ fieldKey: "courseProject", type: "longtext" }),
      field({ fieldKey: "assignmentTemplate", type: "assignmentTemplate" }),
      field({ fieldKey: "testTemplate", type: "testTemplate" }),
      field({ fieldKey: "instructor" }),
      field({ fieldKey: "guidesPostToLms", type: "boolean" }),
      field({ fieldKey: "announcementsPostToLms", type: "boolean" }),
      field({ fieldKey: "knowledgeChecksPostToLms", type: "boolean" }),
      field({ fieldKey: "sourceUrl" }),
      field({ fieldKey: "classSessionTemplate", type: "classSessionTemplate" }),
      field({ fieldKey: "classSessionPostToCanvas", type: "boolean" }),
    ];
    const groups = groupSecondaryFields(fields);
    const byId = new Map(groups.map((g) => [g.id, g.fields.length]));
    expect(byId.get("details")).toBe(3); // courseProject, instructor, sourceUrl
    expect(byId.get("templates")).toBe(3); // assignmentTemplate, testTemplate, classSessionTemplate
    expect(byId.get("posting")).toBe(4); // guidesPostToLms, announcementsPostToLms, knowledgeChecksPostToLms, classSessionPostToCanvas
  });
});
