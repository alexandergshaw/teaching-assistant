// Pure classification of an already-visible runtime field list (see
// workflow-field-visibility.ts's isFieldVisible - this module never
// re-checks visibility itself, it only classifies fields the caller has
// already filtered to "currently shown") into a PRIMARY tier (rendered
// inline, no click or scroll needed) and a SECONDARY tier (grouped into
// named tabs, reached with at most one click). Built for the WorkflowPanel
// run-form overhaul: RunFormFields.tsx is the only caller.
//
// Why position + a small "bonus" allowance, not a hardcoded field-key list:
// this module classifies EVERY workflow's run form (WorkflowPanel.tsx
// renders every workflow, not just Course Build), so it cannot special-case
// one workflow's fieldKeys. Two structural signals it CAN generically read
// off RuntimeField, without any workflow-specific knowledge:
//  - `required` - a field the run cannot proceed without must never be
//    hidden behind a click (this is the whole reason the old required/
//    optional split existed).
//  - `visibleWhen` (workflow-field-visibility.ts) - the only place this
//    carries a real value across the app today is course-schedule-from-
//    source's own per-source input (repo/cartridge/syllabus/lmsCourse,
//    steps.course-schedule-from-source.ts), each visible only once its
//    controlling field (itself required, hence already primary) picks the
//    matching source. A field surviving the caller's visibility filter
//    WHILE still carrying `visibleWhen` is, by construction, "the field the
//    instructor just unlocked by answering the question right above it" -
//    for any workflow that uses this pattern, not just course-build.
// Required and gated fields are therefore always primary, uncapped.
//
// That alone would leave course-build's own "which modules"/"which
// outputs" selectors - both optional, neither gated - buried behind a
// click despite being controls that decide what a run builds. Neither
// field carries a structural marker meaning "this narrows the build," and
// this module deliberately does not invent one keyed to a fieldKey. What
// both DO have, structurally, is position: course-build's own preset
// (presets/course-build.ts) splices its two scope-selector steps in "right
// after the schedule is built" - its own words - specifically so an
// instructor narrowing a run sees them as part of the same early decision,
// not an afterthought. Every other optional field in that workflow
// (context, source material, the course project seed, templates, LMS-
// posting toggles) sits later, addressing finer detail once the shape of
// the run is already decided.
//
// So the second, capped signal is: take the first few VISIBLE, non-
// required, non-gated fields, in declaration order, that are also
// "compact" (their control does not blow up the page - see isCompactField
// below), and promote them into primary too, up to `bonusCap`. This is
// about ALL workflows, not course-build specifically - "the choices the
// workflow author put first, that also render as a quick control rather
// than an essay box" is a reasonable general proxy for "decisions that
// shape what a run does," and it happens to land on modules/outputs for
// course-build because that preset's own step order already puts them
// there (see above) - nothing here references "modules" or "outputs" by
// name. A workflow whose optional fields are all tall (nothing but longtext
// boxes) simply gets no bonus fields and defers all of them.
import type { RuntimeField } from "@/lib/workflows/types";
import { usesMultiSelect } from "@/lib/multi-select-value";

export interface FieldPartition {
  primary: RuntimeField[];
  secondary: RuntimeField[];
}

// Field types whose control (RuntimeFieldInput.tsx) renders as a multi-row
// textarea (`.field textarea`, page.module.css - min-height 220px) UNLESS
// the field also uses the compact multi-select control (usesMultiSelect,
// checked first in RuntimeFieldInput.tsx, ahead of any type branch) - e.g.
// course-build's own "outputs" (longtext + multi + options) renders as a
// compact chip picker, not a textarea, despite its longtext type.
const TALL_FIELD_TYPES = new Set(["longtext", "concepts"]);

function isCompactField(field: RuntimeField): boolean {
  if (usesMultiSelect(field)) return true;
  return !TALL_FIELD_TYPES.has(field.type);
}

/** How many non-required, non-gated fields the "bonus" pass may promote
 * into the primary tier (see this file's header comment). Small enough that
 * a 22-field workflow's primary tier still reads as "a handful of early
 * decisions," not a second full form. */
export const DEFAULT_BONUS_CAP = 4;

/**
 * Split an already-visible field list into a PRIMARY tier (required fields,
 * currently-gated fields, and up to `bonusCap` early compact optional
 * fields) and a SECONDARY tier (everything else). Order within each tier
 * matches the input order (which mirrors workflow step order, per
 * collectRuntimeFields in workflows/types.ts).
 */
export function partitionVisibleFields(
  visibleFields: RuntimeField[],
  bonusCap: number = DEFAULT_BONUS_CAP
): FieldPartition {
  const primary: RuntimeField[] = [];
  const secondary: RuntimeField[] = [];
  let bonusUsed = 0;

  for (const field of visibleFields) {
    if (field.required || field.visibleWhen) {
      primary.push(field);
      continue;
    }
    if (bonusUsed < bonusCap && isCompactField(field)) {
      primary.push(field);
      bonusUsed++;
    } else {
      secondary.push(field);
    }
  }

  return { primary, secondary };
}

export type SecondaryGroupId = "details" | "templates" | "posting";

export interface SecondaryGroup {
  id: SecondaryGroupId;
  label: string;
  fields: RuntimeField[];
}

/**
 * Group the SECONDARY tier into named tabs (RunFormFields.tsx), again by
 * generic `type`, never by fieldKey:
 *  - "posting": boolean fields - the LMS/Canvas post-or-not toggles a
 *    workflow with an optional posting step tends to declare several of.
 *  - "templates": any field whose type names a template picker (the deck/
 *    assignment/test/class-session template types all end in "Template").
 *  - "details": everything else (free text, longtext, pickers with no
 *    other home).
 * A group with no fields is omitted entirely, in this fixed order
 * (details, templates, posting) - a workflow with no boolean fields gets no
 * "Posting" tab at all, so a small workflow never shows an empty tab.
 */
export function groupSecondaryFields(fields: RuntimeField[]): SecondaryGroup[] {
  const posting = fields.filter((f) => f.type === "boolean");
  const templates = fields.filter((f) => f.type !== "boolean" && /template/i.test(f.type));
  const details = fields.filter((f) => f.type !== "boolean" && !/template/i.test(f.type));

  const groups: SecondaryGroup[] = [];
  if (details.length > 0) groups.push({ id: "details", label: "Details", fields: details });
  if (templates.length > 0) groups.push({ id: "templates", label: "Templates", fields: templates });
  if (posting.length > 0) groups.push({ id: "posting", label: "Posting", fields: posting });
  return groups;
}
