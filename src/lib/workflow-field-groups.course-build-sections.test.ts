// Regression guard for the defect entry 176's own AC6 predicted: the
// existing "course-build's own field set" tests in workflow-field-groups.
// test.ts and workflow-run-form.contract.test.ts either hand-build a fixture
// or pass `bonusCap: 2` (not the production default of 4), so NOTHING in
// this repo pinned Course Build's REAL run-form section composition at the
// REAL production cap - which is exactly why a `contains` gate silently
// riding partitionVisibleFields' `field.visibleWhen` promotion (meant only
// for `equals` gates - see workflow-field-groups.ts's header comment and
// isFieldVisible's own "contains" branch, workflow-field-visibility.ts) went
// unnoticed: it swept all six "<family>PostToLms" toggles into "Setup"
// uncapped, leaving "Posting" - the section that exists FOR those toggles -
// holding just one field (classSessionPostToCanvas, which has no
// `visibleWhen` at all).
//
// This test drives the REAL COURSE_BUILD preset end to end - expandWorkflowDef
// -> collectRuntimeFields -> isFieldVisible(f, {}) (an untouched run form,
// nothing typed yet) -> groupRunFormFields at the production default cap
// (no bonusCap argument) - and pins the exact section/field list, in order,
// so a future change to field order, gating, or the promotion rule itself
// must consciously update this test rather than silently drift.
import { describe, it, expect } from "vitest";
import { collectRuntimeFields, expandWorkflowDef, type RuntimeField } from "@/lib/workflows/types";
import { COURSE_BUILD } from "@/lib/workflows/presets/course-build";
import { getPresetDef } from "@/lib/workflows/presets";
import { getStepDefinition } from "@/lib/workflows/registry";
import { isFieldVisible } from "@/lib/workflow-field-visibility";
import { groupRunFormFields } from "@/lib/workflow-field-groups";

// Mirrors workflow-run-form.contract.test.ts's and registry/output-family-
// gating.test.ts's own courseBuildFields() helper - expand the real preset,
// collect its runtime fields through the real step registry, rather than a
// hand-built fixture that could silently drift from the shipped preset.
function courseBuildFields(): RuntimeField[] {
  const expanded = expandWorkflowDef(COURSE_BUILD, getPresetDef);
  return collectRuntimeFields(
    { ...COURSE_BUILD, steps: expanded.steps },
    (type) => getStepDefinition(type)?.inputs
  );
}

describe("Course Build's real run-form sections, at the production default bonus cap", () => {
  it("pins each section's exact field list, in order, for an untouched run form (values = {})", () => {
    const fields = courseBuildFields().filter((f) => isFieldVisible(f, {}));
    const sections = groupRunFormFields(fields);

    expect(sections.map((s) => s.id)).toEqual(["essentials", "details", "templates", "posting"]);

    const byId = new Map(sections.map((s) => [s.id, s.fields.map((f) => f.fieldKey)]));

    // Setup: the two required fields, then the bonus-promoted compact
    // optionals in declaration order (modules, outputs, deckTemplate,
    // recentWindow) - the four-slot cap exactly consumed, none of it by a
    // `contains`-gated posting toggle.
    expect(byId.get("essentials")).toEqual([
      "hubCourse",
      "source",
      "modules",
      "outputs",
      "deckTemplate",
      "recentWindow",
    ]);

    // Details: everything else non-template, non-boolean - including
    // "sources" (sourcePolicy, deliberately excluded from "compact", so it
    // never competes for a bonus slot - see isCompactField's own comment).
    expect(byId.get("details")).toEqual([
      "context",
      "sourceMaterial",
      "courseProject",
      "sources",
      "instructor",
      "sourceUrl",
      "classSessionProjectMode",
      "classSessionProjectDescription",
      "dispatchVisualizerGaps",
    ]);

    expect(byId.get("templates")).toEqual(["assignmentTemplate", "testTemplate", "classSessionTemplate"]);

    // Posting: all SIX `contains`-gated "<family>PostToLms" toggles, plus
    // classSessionPostToCanvas (no gate at all) - this is the section the
    // defect emptied out to one field by promoting the six into "essentials"
    // instead.
    expect(byId.get("posting")).toEqual([
      "currentEventsPostToLms",
      "guidesPostToLms",
      "announcementsPostToLms",
      "knowledgeChecksPostToLms",
      "significancePostToLms",
      "instructorNotesPostToLms",
      "classSessionPostToCanvas",
    ]);
  });

  it("none of the six contains-gated postToLms toggles land in Setup", () => {
    const fields = courseBuildFields().filter((f) => isFieldVisible(f, {}));
    const sections = groupRunFormFields(fields);
    const essentials = sections.find((s) => s.id === "essentials")!;
    const gatedPostingKeys = [
      "currentEventsPostToLms",
      "guidesPostToLms",
      "announcementsPostToLms",
      "knowledgeChecksPostToLms",
      "significancePostToLms",
      "instructorNotesPostToLms",
    ];
    for (const key of gatedPostingKeys) {
      expect(essentials.fields.map((f) => f.fieldKey)).not.toContain(key);
    }
  });
});
