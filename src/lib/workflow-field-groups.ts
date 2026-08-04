// Pure classification of an already-visible runtime field list (see
// workflow-field-visibility.ts's isFieldVisible - this module never
// re-checks visibility itself, it only classifies fields the caller has
// already filtered to "currently shown") into a PRIMARY tier (rendered
// inline, no click or scroll needed) and a SECONDARY tier (grouped into
// named sections, reached with at most one click to reveal - see
// groupRunFormFields below, this file's actual export RunFormFields.tsx
// renders from). Built for the WorkflowPanel run-form overhaul:
// RunFormFields.tsx is the only caller.
//
// Second pass (labelled sections, not tabs): partitionVisibleFields and
// groupSecondaryFields below are unchanged - still the generic classifiers,
// still fully covered by their own tests - groupRunFormFields at the bottom
// of this file only adds a label ("Setup") to the primary tier and
// concatenates it with groupSecondaryFields' result in a fixed order, so
// every visible field ends up in exactly one named, ordered section instead
// of an unlabelled column plus a click-to-switch tab strip.
//
// Why position + a small "bonus" allowance, not a hardcoded field-key list:
// this module classifies EVERY workflow's run form (WorkflowPanel.tsx
// renders every workflow, not just Course Build), so it cannot special-case
// one workflow's fieldKeys. Two structural signals it CAN generically read
// off RuntimeField, without any workflow-specific knowledge:
//  - `required` - a field the run cannot proceed without must never be
//    hidden behind a click (this is the whole reason the old required/
//    optional split existed).
//  - `visibleWhen` (workflow-field-visibility.ts) - but only an EQUALS gate
//    (e.g. course-schedule-from-source's own per-source input: repo/
//    cartridge/syllabus/lmsCourse, steps.course-schedule-from-source.ts).
//    Its controlling field starts blank, so BEFORE any choice is made every
//    equals-gated field is hidden; one surviving the caller's visibility
//    filter is, by construction, "the field the instructor just unlocked by
//    answering the question right above it" - for any workflow that uses
//    this pattern, not just course-build. A CONTAINS gate (the six
//    "<family>PostToLms" toggles, steps.weekly-*.ts/steps.course-build-
//    current-events.ts) has the opposite character: isFieldVisible's own
//    "blank means all" rule (multi-select-value.ts's convention) makes it
//    visible BY DEFAULT, before the controlling multi-select has been
//    touched at all - nothing was "just unlocked," so it earns no uncapped
//    promotion. It still gets a fair shot at a bonus slot below, exactly
//    like any other optional field.
// Required and equals-gated fields are therefore always primary, uncapped.
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
import { scopeCoversType, type RuntimeField, type WorkflowScope } from "@/lib/workflows/types";
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

// "sourcePolicy" is excluded outright, never by its rendered height alone:
// SourcePolicyEditor.tsx's control is five checkboxes plus per-row Up/Down
// buttons plus a strategy select plus a reset link - a short field by
// TALL_FIELD_TYPES' own height-based test (it is not longtext/concepts), but
// not a "quick, one-glance decision" by any other measure either. Without
// this exclusion it silently ate the last of the primary tier's bonus slots
// (see partitionVisibleFields below) purely because nothing else disqualified
// it.
function isCompactField(field: RuntimeField): boolean {
  if (field.type === "sourcePolicy") return false;
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
    // Only an EQUALS gate is an "unlocked" field (see this file's header
    // comment) - branch on the gate's SHAPE, the same discriminant
    // isFieldVisible (workflow-field-visibility.ts) itself uses ("contains"
    // in gate), never on fieldKey. A `contains` gate is satisfied by a blank
    // controller, so a field carrying one is visible by default, not because
    // an instructor made a choice - it falls through to the ordinary
    // required/compact-bonus path below like any other optional field.
    const isUnlockedGate = field.visibleWhen && !("contains" in field.visibleWhen);
    if (field.required || isUnlockedGate) {
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

// A visible field's SECTION, not just its tier - the labelled-sections pass
// (RunFormFields.tsx no longer has an unlabelled primary column plus tabs;
// every visible field now sits under a legend). "essentials" is the primary
// tier under a name ("Setup") an instructor would recognize as "the
// decisions that shape what this run does," not a code-facing word like
// "primary" or "gated." The other three ids/labels are unchanged from
// SecondaryGroupId/SecondaryGroup on purpose - groupRunFormFields below is
// additive over the existing partitionVisibleFields/groupSecondaryFields
// split, not a replacement of either.
export type FieldSectionId = "essentials" | SecondaryGroupId;

export interface FieldSection {
  id: FieldSectionId;
  label: string;
  fields: RuntimeField[];
}

const ESSENTIALS_LABEL = "Setup";

// C2 (docs/HANDOFF.md CHUNK C): a field the workflow-level "this workflow is
// for" scope already covers must never render on the run form - asking for
// it is worse than useless, since useWorkflowRun.ts/server-runner.ts ignore
// whatever value is submitted and use the scope value instead (both runners
// re-derive coverage independently via this SAME scopeCoversType predicate -
// see their own comments at the scopeCoversType call sites).
//
// collectRuntimeFields (workflows/types.ts) already drops a scope-covered
// field before it ever reaches this module - verified directly against the
// real course-build preset, across single-course, multi-course/"*", and
// institution-"*" scopes, with zero fields surviving a
// `fields.filter(f => scopeCoversType(scope, f.type))` pass. So today this
// filter never removes anything collectRuntimeFields did not already remove.
// It exists anyway as the SAME "belt and suspenders" idiom this file's
// RunFormFields.tsx caller already uses for the AC4 stranded-field safety
// net: a second, independent guarantee at the DISPLAY boundary, built from
// the one shared scopeCoversType predicate (never a second copy of the
// coverage rule), so the run form and the run engine cannot silently drift
// apart if collectRuntimeFields' own exclusion is ever narrowed by a future
// change upstream.
export function dropScopeCoveredFields(
  fields: RuntimeField[],
  scope: WorkflowScope | undefined
): RuntimeField[] {
  if (!scope) return fields;
  return fields.filter((field) => !scopeCoversType(scope, field.type));
}

/**
 * Split an already-visible field list into ORDERED, LABELLED sections
 * (RunFormFields.tsx's only caller): "Setup" first (whatever
 * partitionVisibleFields classifies as primary - required fields, this
 * run's currently-gated per-source field, and a handful of early compact
 * decisions - see that function's own header comment for exactly which and
 * why), then "Details"/"Templates"/"Posting" in that fixed order for
 * whatever it classifies as secondary (groupSecondaryFields, unchanged).
 *
 * Every visible field lands in exactly one section (partitionVisibleFields
 * already guarantees every field is primary XOR secondary, and
 * groupSecondaryFields already guarantees every secondary field lands in
 * exactly one of its three groups) - this function only adds the "Setup"
 * label on top and orders the result. A section with no fields is omitted
 * entirely (same rule groupSecondaryFields already applied to Details/
 * Templates/Posting, extended to Setup) - a small workflow whose few fields
 * all fit in the primary tier renders ONE section, never four near-empty
 * ones.
 *
 * `scope`, when given, is applied FIRST via dropScopeCoveredFields (see that
 * function's own comment) - a field the workflow scope already covers is
 * removed before tiering/grouping even runs, so it can never occupy a
 * "Setup" slot (including a bonus slot) or a secondary group.
 */
export function groupRunFormFields(
  visibleFields: RuntimeField[],
  bonusCap: number = DEFAULT_BONUS_CAP,
  scope?: WorkflowScope
): FieldSection[] {
  const scoped = dropScopeCoveredFields(visibleFields, scope);
  const { primary, secondary } = partitionVisibleFields(scoped, bonusCap);
  const sections: FieldSection[] = [];
  if (primary.length > 0) {
    sections.push({ id: "essentials", label: ESSENTIALS_LABEL, fields: primary });
  }
  sections.push(...groupSecondaryFields(secondary));
  return sections;
}

/**
 * Which SECONDARY group a field belongs in. `field.group` (StepInputSpec.
 * group, types.ts), when a step author set it, wins outright - it exists
 * specifically for a field whose TYPE-based guess below would be wrong (a
 * boolean that kicks off a background task, say, rather than posting
 * anything to an LMS - see steps.visualizer.ts's "dispatch" input). Only
 * once no explicit hint is present does this fall back to the generic,
 * fieldKey-blind guess: boolean -> Posting, a "...Template" type ->
 * Templates, everything else -> Details.
 */
function classifySecondaryField(field: RuntimeField): SecondaryGroupId {
  if (field.group) return field.group;
  if (field.type === "boolean") return "posting";
  if (/template/i.test(field.type)) return "templates";
  return "details";
}

/**
 * Group the SECONDARY tier into named sections (RunFormFields.tsx, via
 * groupRunFormFields above). Membership is decided per field by
 * classifySecondaryField above - an explicit `group` hint first, then the
 * generic type-based fallback (never by fieldKey). A group with no fields is
 * omitted entirely, in this fixed order (details, templates, posting) - a
 * workflow with no boolean fields gets no "Posting" section at all, so a
 * small workflow never shows an empty one.
 */
export function groupSecondaryFields(fields: RuntimeField[]): SecondaryGroup[] {
  const details = fields.filter((f) => classifySecondaryField(f) === "details");
  const templates = fields.filter((f) => classifySecondaryField(f) === "templates");
  const posting = fields.filter((f) => classifySecondaryField(f) === "posting");

  const groups: SecondaryGroup[] = [];
  if (details.length > 0) groups.push({ id: "details", label: "Details", fields: details });
  if (templates.length > 0) groups.push({ id: "templates", label: "Templates", fields: templates });
  if (posting.length > 0) groups.push({ id: "posting", label: "Posting", fields: posting });
  return groups;
}
