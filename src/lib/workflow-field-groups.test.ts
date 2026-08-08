import { describe, it, expect } from "vitest";
import {
  partitionVisibleFields,
  groupSecondaryFields,
  groupRunFormFields,
  dropScopeCoveredFields,
  DEFAULT_BONUS_CAP,
} from "./workflow-field-groups";
import type { RuntimeField } from "@/lib/workflows/types";
import { resolveFieldRequirements } from "@/lib/workflow-field-visibility";

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
      // sourcePolicy is EXCLUDED from "compact" outright (never consumes a
      // bonus slot), regardless of position - SourcePolicyEditor is five
      // checkboxes plus per-row Up/Down plus a strategy select plus a reset
      // link, not a quick one-glance decision. See the dedicated test below.
      field({ fieldKey: "sources", type: "sourcePolicy" }),
      field({ fieldKey: "assignmentTemplate", type: "assignmentTemplate" }), // 5th bonus candidate - fits, since "sources" freed its slot
    ];
    const { primary, secondary } = partitionVisibleFields(fields, 4);
    expect(primary.map((f) => f.fieldKey)).toEqual([
      "tile",
      "modules",
      "outputs",
      "deckTemplate",
      "assignmentTemplate",
    ]);
    expect(secondary.map((f) => f.fieldKey)).toEqual(["sources"]);
  });

  it("a sourcePolicy field is excluded from the compact bonus pass outright, freeing its slot for the next compact field", () => {
    const fields = [
      field({ fieldKey: "a", required: false }),
      field({ fieldKey: "sources", type: "sourcePolicy" }),
      field({ fieldKey: "b", required: false }),
    ];
    const { primary, secondary } = partitionVisibleFields(fields, 2);
    expect(primary.map((f) => f.fieldKey)).toEqual(["a", "b"]);
    expect(secondary.map((f) => f.fieldKey)).toEqual(["sources"]);
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

describe("dropScopeCoveredFields", () => {
  // C2 (docs/HANDOFF.md CHUNK C): a field the workflow-level scope already
  // covers must never render on the run form. collectRuntimeFields
  // (workflows/types.ts) already drops these before this module ever sees
  // them - these tests exercise this module's OWN independent guarantee
  // (built from the same scopeCoversType predicate, never a second copy of
  // the coverage rule), the same "belt and suspenders" idiom RunFormFields
  // already uses for its AC4 stranded-field safety net.

  it("returns the field list unchanged when there is no scope", () => {
    const fields = [field({ fieldKey: "hubCourse", type: "hubCourse" }), field({ fieldKey: "topic" })];
    expect(dropScopeCoveredFields(fields, undefined)).toEqual(fields);
  });

  it("drops a single entity field the scope concretely targets", () => {
    const fields = [field({ fieldKey: "hubCourse", type: "hubCourse" }), field({ fieldKey: "topic" })];
    const result = dropScopeCoveredFields(fields, { hubCourse: "tile1" });
    expect(result.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("drops a single hubCourse field when the scope fans out ('*' or 2+ courses)", () => {
    const fields = [field({ fieldKey: "hubCourse", type: "hubCourse" })];
    expect(dropScopeCoveredFields(fields, { hubCourse: "*" })).toEqual([]);
    expect(dropScopeCoveredFields(fields, { hubCourse: "a\nb" })).toEqual([]);
  });

  it("drops an institution field when the scope targets all institutions", () => {
    const fields = [field({ fieldKey: "institution", type: "institution" })];
    expect(dropScopeCoveredFields(fields, { institution: "*" })).toEqual([]);
  });

  it("keeps a field whose type the scope does not cover (family mismatch)", () => {
    const fields = [field({ fieldKey: "org", type: "org" })];
    expect(dropScopeCoveredFields(fields, { hubCourse: "tile1" })).toEqual(fields);
  });

  it("keeps a scalar-family field when the scope value is '*' - scalars cannot express 'all', so the field still asks (a per-run override)", () => {
    const fields = [field({ fieldKey: "concepts", type: "concepts" })];
    expect(dropScopeCoveredFields(fields, { concepts: "*" })).toEqual(fields);
  });

  it("drops a scalar-family field (lookahead) the scope concretely sets", () => {
    const fields = [field({ fieldKey: "lookahead", type: "lookahead" })];
    expect(dropScopeCoveredFields(fields, { lookahead: "14" })).toEqual([]);
  });

  it("non-entity, non-scalar types (text, longtext, boolean) are never dropped by any scope", () => {
    const fields = [
      field({ fieldKey: "instructor", type: "text" }),
      field({ fieldKey: "context", type: "longtext" }),
      field({ fieldKey: "guidesPostToLms", type: "boolean" }),
    ];
    const scope = { institution: "*", hubCourse: "*", lmsCourse: "x", org: "*", lookahead: "7", concepts: "A" };
    expect(dropScopeCoveredFields(fields, scope)).toEqual(fields);
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

describe("groupRunFormFields", () => {
  it("an empty field list produces no sections", () => {
    expect(groupRunFormFields([])).toEqual([]);
  });

  it("every visible field lands in exactly one section - no orphans, no duplicates", () => {
    const fields = [
      field({ fieldKey: "hubCourse", required: true }),
      field({ fieldKey: "source", required: true }),
      field({ fieldKey: "repo", visibleWhen: { fieldKey: "source", equals: "codebase" } }),
      field({ fieldKey: "modules" }),
      field({ fieldKey: "outputs", type: "longtext", multi: true, options: ["a", "b"] }),
      field({ fieldKey: "context", type: "longtext" }),
      field({ fieldKey: "sourceMaterial", type: "longtext" }),
      field({ fieldKey: "deckTemplate", type: "deckTemplate" }),
      field({ fieldKey: "guidesPostToLms", type: "boolean" }),
    ];
    const sections = groupRunFormFields(fields);
    const seen: string[] = [];
    for (const section of sections) {
      for (const f of section.fields) seen.push(f.fieldKey);
    }
    // Same fieldKeys as the input, each exactly once - order across sections
    // does not matter for this check, only membership/multiplicity.
    expect(seen.sort()).toEqual(fields.map((f) => f.fieldKey).sort());
    expect(new Set(seen).size).toBe(fields.length);
  });

  it("the gating group ('essentials') is first whenever it is non-empty", () => {
    // bonusCap 0 isolates this check to the required/gated field alone - the
    // bonus-promotion mechanism itself is partitionVisibleFields' own
    // concern and is already covered by that function's tests.
    const fields = [
      field({ fieldKey: "courseProject", type: "longtext" }), // details
      field({ fieldKey: "assignmentTemplate", type: "assignmentTemplate" }), // templates
      field({ fieldKey: "guidesPostToLms", type: "boolean" }), // posting
      field({ fieldKey: "hubCourse", required: true }), // essentials, despite sitting last in input order
    ];
    const sections = groupRunFormFields(fields, 0);
    expect(sections[0].id).toBe("essentials");
    expect(sections[0].fields.map((f) => f.fieldKey)).toEqual(["hubCourse"]);
    expect(sections.map((s) => s.id)).toEqual(["essentials", "details", "templates", "posting"]);
  });

  it("essentials carries a real, instructor-facing label, not a code-facing tier name", () => {
    const sections = groupRunFormFields([field({ fieldKey: "hubCourse", required: true })]);
    expect(sections[0].label).toBe("Setup");
  });

  it("a small workflow (3 fields: 2 required, 1 optional-but-compact) collapses to ONE section - no empty Details/Templates/Posting sections render", () => {
    // Mirrors presets/communication.ts's DRAFT_AND_POST_ANNOUNCEMENT: a
    // required longtext ("What should it say?"), a required lmsCourse
    // ("LMS course"), and an optional date ("Schedule for") - the smallest
    // real multi-field workflow in this codebase's own presets.
    const fields = [
      field({ fieldKey: "instruction", label: "What should it say?", type: "longtext", required: true }),
      field({ fieldKey: "course", label: "LMS course", type: "lmsCourse", required: true }),
      field({ fieldKey: "postAt", label: "Schedule for", type: "date" }),
    ];
    const sections = groupRunFormFields(fields);
    expect(sections.length).toBe(1);
    expect(sections[0].id).toBe("essentials");
    expect(sections[0].fields.map((f) => f.fieldKey)).toEqual(["instruction", "course", "postAt"]);
  });

  it("a workflow with no primary-tier fields (bonusCap 0, everything optional and tall) omits 'essentials' entirely rather than rendering it empty", () => {
    const fields = [
      field({ fieldKey: "context", type: "longtext" }),
      field({ fieldKey: "sourceMaterial", type: "longtext" }),
    ];
    const sections = groupRunFormFields(fields, 0);
    expect(sections.map((s) => s.id)).toEqual(["details"]);
    expect(sections[0].fields.map((f) => f.fieldKey)).toEqual(["context", "sourceMaterial"]);
  });

  it("ordering is stable: repeated calls on the same input produce the same section/field order", () => {
    const fields = [
      field({ fieldKey: "hubCourse", required: true }),
      field({ fieldKey: "sourceUrl" }),
      field({ fieldKey: "deckTemplate", type: "deckTemplate" }),
      field({ fieldKey: "guidesPostToLms", type: "boolean" }),
      field({ fieldKey: "modules" }),
    ];
    const first = groupRunFormFields(fields);
    const second = groupRunFormFields(fields);
    expect(second).toEqual(first);
    // And within each section, field order matches the original input order
    // (mirrors workflow step order, per collectRuntimeFields).
    for (const section of first) {
      const positions = section.fields.map((f) => fields.findIndex((orig) => orig.fieldKey === f.fieldKey));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("course-build's own field set (course-description path) yields essentials, details, templates, posting in that fixed order", () => {
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
      field({ fieldKey: "assignmentTemplate", type: "assignmentTemplate" }),
      field({ fieldKey: "guidesPostToLms", type: "boolean" }),
    ];
    // bonusCap 2: exactly modules + outputs (the real course-build preset's
    // own two scope selectors - see partitionVisibleFields' header comment),
    // so the later compact optional fields (assignmentTemplate,
    // guidesPostToLms) correctly defer to their own sections instead of
    // also being swept into essentials by unused bonus slots.
    const sections = groupRunFormFields(fields, 2);
    expect(sections.map((s) => s.id)).toEqual(["essentials", "details", "templates", "posting"]);
    expect(sections[0].fields.map((f) => f.fieldKey)).toEqual(["hubCourse", "source", "modules", "outputs"]);
  });

  // C2: the scope parameter, threaded from WorkflowPanel.tsx via
  // RunFormFields.tsx.
  it("without a scope argument, behavior is unchanged (backward compatible)", () => {
    const fields = [field({ fieldKey: "hubCourse", type: "hubCourse", required: true }), field({ fieldKey: "topic" })];
    expect(groupRunFormFields(fields)).toEqual(groupRunFormFields(fields, undefined, undefined));
  });

  it("a scope-covered required field is removed from 'essentials' instead of being asked for", () => {
    const fields = [
      field({ fieldKey: "hubCourse", type: "hubCourse", required: true }),
      field({ fieldKey: "topic", required: true }),
    ];
    const sections = groupRunFormFields(fields, DEFAULT_BONUS_CAP, { hubCourse: "tile1" });
    expect(sections).toHaveLength(1);
    expect(sections[0].fields.map((f) => f.fieldKey)).toEqual(["topic"]);
  });

  it("a scope-covered field never occupies a bonus slot, leaving room for the next compact optional field", () => {
    const fields = [
      field({ fieldKey: "hubCourse", type: "hubCourse" }), // optional, compact, would-be bonus #1
      field({ fieldKey: "modules" }), // optional, compact, would-be bonus #2
    ];
    const sections = groupRunFormFields(fields, 1, { hubCourse: "tile1" });
    // hubCourse is dropped entirely (scope-covered) BEFORE bonus promotion
    // runs, so the single bonus slot goes to "modules" instead of being
    // consumed (and wasted) on a field that was about to be removed anyway.
    expect(sections[0].fields.map((f) => f.fieldKey)).toEqual(["modules"]);
  });

  it("when scope covers every field, the run form renders no sections at all", () => {
    const fields = [field({ fieldKey: "hubCourse", type: "hubCourse", required: true })];
    const sections = groupRunFormFields(fields, DEFAULT_BONUS_CAP, { hubCourse: "tile1" });
    expect(sections).toEqual([]);
  });

  it("a scope that does not cover any field's type changes nothing", () => {
    const fields = [field({ fieldKey: "org", type: "org", required: true }), field({ fieldKey: "topic" })];
    const withoutScope = groupRunFormFields(fields);
    const withUnrelatedScope = groupRunFormFields(fields, DEFAULT_BONUS_CAP, { hubCourse: "tile1" });
    expect(withUnrelatedScope).toEqual(withoutScope);
  });
});

// ── conditionally-required fields keep their Setup slot ───────────────────
// docs/conditional-required-inputs-acceptance-criteria.md AC3 item 9. Written
// BEFORE the implementation, and deliberately calling the EXISTING functions
// with no new argument: requiredness is resolved one line above the
// groupRunFormFields call in RunFormFields.tsx, so this module needs no change at all to
// honor a gate. These tests exist to prove that claim, and to catch anyone
// who later "fixes" it by threading values down here.
describe("a field resolved to required is treated as required", () => {
  // Built THROUGH the resolver, not by hand-setting `required` - otherwise
  // these tests pass whether or not resolveFieldRequirements works, and prove
  // only that this module is unchanged rather than that the feature reaches it.
  const conditional = (mode: string) =>
    resolveFieldRequirements(
      [
        field({
          fieldKey: "message",
          label: "Message",
          type: "longtext",
          required: false,
          requiredWhen: { fieldKey: "draftFrom", equals: "template" },
        }),
      ],
      { draftFrom: mode }
    )[0];

  it("lands in the primary tier, uncapped, once resolved required", () => {
    // Five compact optional fields ahead of it exhaust DEFAULT_BONUS_CAP, so a
    // field promoted only by a bonus slot could not reach primary here. A
    // longtext could never take a bonus slot anyway - which is exactly why the
    // motivating field fell out of Setup when it was relaxed to optional.
    const fields = [
      field({ fieldKey: "a" }),
      field({ fieldKey: "b" }),
      field({ fieldKey: "c" }),
      field({ fieldKey: "d" }),
      field({ fieldKey: "e" }),
      conditional("template"),
    ];

    const { primary, secondary } = partitionVisibleFields(fields);

    expect(primary.map((f) => f.fieldKey)).toContain("message");
    expect(secondary.map((f) => f.fieldKey)).not.toContain("message");
  });

  it("defers to Details while it is resolved optional", () => {
    const fields = [
      field({ fieldKey: "a" }),
      field({ fieldKey: "b" }),
      field({ fieldKey: "c" }),
      field({ fieldKey: "d" }),
      field({ fieldKey: "e" }),
      conditional(""),
    ];

    const { primary, secondary } = partitionVisibleFields(fields);

    expect(primary.map((f) => f.fieldKey)).not.toContain("message");
    expect(secondary.map((f) => f.fieldKey)).toContain("message");
  });

  it("carrying a requiredWhen gate never itself promotes a field, the way an equals visibleWhen does", () => {
    // isUnlockedGate is about visibleWhen only. A requiredWhen gate that is not
    // currently satisfied must leave the field competing like any other
    // optional one - otherwise every conditionally-required field would sit in
    // Setup permanently, in both modes.
    const sections = groupRunFormFields([conditional("")]);

    expect(sections.find((s) => s.id === "essentials")).toBeUndefined();
    expect(sections.find((s) => s.id === "details")?.fields.map((f) => f.fieldKey)).toEqual(["message"]);
  });
});
