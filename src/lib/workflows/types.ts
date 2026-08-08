// Workflow engine types and storage helpers.
//
// Workflows are ordered sequences of steps; each step declares inputs and outputs.
// Input values come from three sources: runtime form fields, earlier step outputs,
// or fixed values. Steps execute in order; outputs feed forward to later steps.

import { isCourseFanout } from "@/lib/workflows/fanout";
import { parseLmsModuleValue } from "@/lib/workflows/module-value";
import type { CaseStudyAssignment } from "@/lib/case-study-prompt";

/**
 * Value types supported in workflows:
 * - institution: an institution acronym (e.g., "UT", "OSU")
 * - hubCourseList: newline-joined course-tile ids
 * - uploads: runtime-only file uploads; never persisted to storage
 * - lmsModule: a module id within the course chosen by the form's hubCourse field
 * - courseList: an opaque JSON payload passed between workflow steps
 * - lookahead: a days-ahead scope value (string representation of number)
 * - moduleOffset: a modules-ahead scope value (string representation of number)
 * - concepts: newline-joined concept list for loop items; a scopeable scalar family
 * - sourcePolicy: an encoded SourcePolicy (source-policy.ts) - which material
 *   sources a lecture-building step checks, in what order, and its strategy;
 *   a scopeable scalar family, empty/absent = the default policy
 *
 * lmsModule is ALSO a scopeable scalar family (see WorkflowScope.lmsModule):
 * an encoded module-value.ts string (module-value.ts's LmsModuleValue forms),
 * so a workflow can pin "the current module" once for every lmsModule input,
 * the same way lookahead/moduleOffset/concepts/sourcePolicy do.
 */
export type WorkflowValueType =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "repo"
  | "lmsCourse"
  | "lmsCourseList"
  | "schedule"
  | "files"
  | "modules"
  | "hubCourse"
  | "org"
  | "boolean"
  | "institution"
  | "hubCourseList"
  | "uploads"
  | "lmsModule"
  | "courseList"
  | "orgList"
  | "deckTemplate"
  | "assignmentTemplate"
  | "testTemplate"
  | "classSessionTemplate"
  | "lookahead"
  | "moduleOffset"
  | "concepts"
  | "sourcePolicy";

// Value types that can carry a fixed ("preset") value in the builder, so a
// workflow can hard-set the input and run unmonitored without prompting. Beyond
// the plain scalar types, this includes the course-tile / Canvas-course / org /
// institution entity types, which the builder renders with a proper picker
// (one / several / all for the scopeable list types).
export const LITERAL_CAPABLE_TYPES: ReadonlySet<string> = new Set([
  "text",
  "longtext",
  "number",
  "date",
  "repo",
  "boolean",
  "hubCourse",
  "hubCourseList",
  "lmsCourse",
  "lmsCourseList",
  "org",
  "orgList",
  "institution",
  "deckTemplate",
  "assignmentTemplate",
  "testTemplate",
  "classSessionTemplate",
  "lookahead",
  "moduleOffset",
  "concepts",
  "sourcePolicy",
]);

// A single-item value type -> its scopeable list type. Lets a single-item
// output from an earlier step bind a scopeable ("one / several / all") list
// input: the single id/url is simply a one-element list to the consuming step.
export const SINGLE_TO_LIST_TYPE: Record<string, string> = {
  hubCourse: "hubCourseList",
  lmsCourse: "lmsCourseList",
  org: "orgList",
};

/**
 * Whether an output of `outputType` may bind an input of `inputType`: an exact
 * type match, or a single-item output feeding its scopeable list input (e.g. a
 * `hubCourse` output into a `hubCourseList` "all/several" input). The reverse
 * (a list output into a single input) is NOT allowed - a single input cannot
 * hold many values. Longtext outputs may also feed concepts inputs (both carry
 * newline-joined text).
 */
export function outputFeedsInput(outputType: string, inputType: string): boolean {
  if (outputType === inputType) return true;
  if (outputType === "longtext" && inputType === "concepts") return true;
  return SINGLE_TO_LIST_TYPE[outputType] === inputType;
}

export interface GeneratedCourseFile {
  name: string;
  blob: Blob;
  mimeType: string;
  weekNumber: number;
  // Position of the file within its week's LMS module (-1 Image, -0.9 Image
  // Credit, 0 Introduction, 0.2 Significance of the Material, 0.5 Objectives,
  // 1 Slides, 2 Instructions, 3 Opener, 4 Assignment, 5 Test,
  // 5.5 Knowledge Check, 6 Weekly Announcement, 6.5 Instructor Notes,
  // 6.6 Anticipated Q&A (generate-weekly-qa, steps.course-build-qa.ts),
  // 6.7 Current Events (generate-weekly-current-events,
  // steps.course-build-current-events.ts), 7 Course Schedule Docx
  // (save-zip-to-course, steps.course-setup.storage.ts - a course-wide,
  // weekNumber-0 supplement built the same way generate-course-guides'
  // "Course Schedule" document is, so it ships in the terminal zip
  // unconditionally alongside the schedule CSV rather than only when the
  // "guides" output family is selected; see that step's KNOWN ACCEPTED
  // DUPLICATE comment for why this can legitimately coexist with the
  // guides step's own copy of the same document)); lms-populate
  // uploads in (weekNumber, sortOrder) order and Canvas appends module items
  // in upload sequence. Objectives, the Knowledge Check, and the Unsplash
  // image pair all sit at a fractional (or negative) value (rather than
  // renumbering everything else) so each sorts where it belongs without
  // touching every other producer's hardcoded integer - lms-populate
  // compares sortOrder purely numerically, so a fractional/negative value is
  // a legitimate "insert before/between" rank, not a hack.
  sortOrder: number;
  // What the file is within its week; introductions, objectives, and
  // instructions carry their source text so LMS steps can create pages
  // instead of uploading the docx. `assignment` and `test` deliberately do
  // NOT become pages - the student downloads the handout, while the
  // gradable Canvas item itself is created separately by the step that
  // generated it. `supplement` is USUALLY course-wide (the schedule CSV,
  // the grading rubric) with weekNumber 0 - but not always: the course
  // guide documents (generate-course-guides, steps.course-guides.ts), the
  // weekly announcements (generate-weekly-announcements, steps.weekly-
  // announcements.ts), and the weekly knowledge checks (generate-knowledge-
  // checks, steps.knowledge-checks.ts) are also `supplement`s, and MAY carry
  // `pageText` (for their own step to publish as an LMS page/announcement/
  // quiz) and a non-zero weekNumber (under their own week's zip folder, not
  // Course-Wide) - so neither claim holds universally for this role. What IS
  // still true for every `supplement`, always: lms-populate's
  // role switch does not recognize the value, so a supplement reaching it
  // is never mistaken for a page or a rides-the-assignment upload target -
  // it falls through to the DEFAULT upload branch instead and is clamped
  // into Module 01 (steps.lms-modules.ts's weekNumber clamp) or its own
  // week's module. This is not changed by either feature above - both
  // publish their own pages/announcements directly rather than through
  // lms-populate, specifically to avoid that clamp - it is only documented
  // here accurately rather than claimed as a protection lms-populate
  // enforces, which it does not. `image` (steps.deliverable-images.ts) is
  // the same "falls through to the default upload branch" story: an actual
  // Unsplash photo AND its companion credits .txt file (the photographer/
  // Unsplash attribution, so it survives even if the two are later moved
  // apart) both use this role, one pair per week that produced real content.
  role: "introduction" | "objectives" | "slides" | "instructions" | "opener" | "assignment" | "test" | "supplement" | "image";
  pageText?: string;
  // V3 (professional-lift audit): true for a deck whose slide generation
  // failed and fell back to the empty-slides placeholder (a single title
  // slide once buildSlidesPptx renders it) - never a real deliverable. Unset
  // (the common case) for every other file. lms-populate (steps.lms-
  // modules.ts) and the Common Cartridge builder (steps.lms-export.ts) both
  // skip a file carrying this flag rather than shipping it to the LMS as an
  // ordinary lecture.
  needsRegeneration?: boolean;
  // This week's anchor case study (AssignmentPlan.caseStudy, actions-types.ts),
  // carried forward onto every file assembleLectureFiles produces for that
  // week's plan (registry-helpers.ts) - not just one role - so whichever
  // role(s) actually ship for a given week (selectedObjectives/Decks/
  // Assignments/Openers can each independently be off) still carry it. A
  // downstream per-week generator that needs THIS week's already-assigned
  // case (e.g. generate-weekly-significance, steps.weekly-significance.ts)
  // reads it off any incoming file for that week rather than re-deriving or
  // inventing one. undefined for a file whose plan had none (an unmatched
  // week, the embedded provider, or a repo-driven plan built before a
  // whole-course case-study pass existed for that path).
  caseStudy?: CaseStudyAssignment;
}

export interface EnsuredModule {
  week: number;
  id: number;
  name: string;
}

export interface StepInputSpec {
  key: string;
  label: string;
  type: WorkflowValueType;
  required: boolean;
  help?: string;
  /** type "uploads" only: the file picker's accept filter (defaults to LMS
   * export archives when absent). */
  accept?: string;
  /** When true, this input is derived from the step's workflow-scoped course's
   * current module - shown as "From workflow scope" and not asked at run time,
   * the same as a course-derived module input. */
  courseDerived?: boolean;
  /** When set, a "Fixed value" (literal) binding for this input is edited in the
   * builder as a select of these options instead of a free text field. */
  options?: string[];
  /** With `options`, allow selecting several (stored newline-joined). Default single. */
  multi?: boolean;
  /** Human-readable display text for entries of `options`, keyed by the raw
   * option value (the stored/submitted value never changes - this is
   * display-only). Absent, or missing an entry, falls back to the raw value
   * itself - so an input that never had labels (or gains a new option before
   * its label is written) still renders, just without the upgrade. See
   * output-selection.ts's OUTPUT_FAMILY_LABELS for the shape this feeds. */
  optionLabels?: Record<string, string>;
  /** When set, this input is shown on the run form only while another input of
   * the SAME step (visibleWhen.fieldKey) currently holds visibleWhen.equals -
   * e.g. course-schedule-from-source's per-source inputs, each visible only
   * for its own "source" choice - OR, for a multi-select ("options" + multi)
   * controlling field, currently INCLUDES visibleWhen.contains as one of its
   * newline-separated entries (matched whole-entry, never substring), with a
   * blank controlling value treated as "every entry" (a multi-select's own
   * "blank means all" convention - see output-selection.ts's
   * parseOutputSelection) so a gated field stays visible exactly as it does
   * today before the controlling field has been touched. Hiding a field this
   * way never unbinds it and never clears its stored value (switching back
   * restores it) - only whether it reaches the step at run time, and whether
   * it can block submission while required, are affected; see
   * src/lib/workflow-field-visibility.ts for the shared predicate both of
   * those checks use. */
  visibleWhen?: { fieldKey: string; equals: string } | { fieldKey: string; contains: string };
  /** When set, this input becomes required (in addition to any static
   * `required: true`, which always wins) while another input of the SAME step
   * (requiredWhen.fieldKey) currently holds requiredWhen.equals exactly - the
   * run form's Run button blocks on it and it is kept in the primary "Setup"
   * tier while the gate holds, exactly as a statically required field is.
   * Deliberately EQUALS-ONLY, unlike visibleWhen: a gate can only ADD
   * requiredness, never remove it, and visibleWhen's `contains` arm treats a
   * blank controller as "every entry" - correct for showing a field, but
   * wrong for requiring one (it would make an untouched form mandatory
   * before the instructor has chosen anything). See
   * src/lib/workflow-field-visibility.ts's isFieldRequired, the one place
   * this gate is resolved. */
  requiredWhen?: { fieldKey: string; equals: string };
  /** Overrides the SECONDARY-tier group a currently-optional, non-gated field
   * lands in (workflow-field-groups.ts's groupSecondaryFields) - checked
   * BEFORE that function's own type-based fallback (boolean -> Posting,
   * a "...Template" type -> Templates, else -> Details). Use this when the
   * type-based guess is wrong for a specific field - e.g. a boolean that
   * kicks off a background task rather than posting anything, which would
   * otherwise land in "Posting" purely because it happens to be a checkbox. */
  group?: "details" | "templates" | "posting";
}

export interface StepOutputSpec {
  key: string;
  label: string;
  type: WorkflowValueType;
}

export type InputBinding =
  | { source: "runtime"; fieldKey: string }
  | { source: "step"; stepIndex: number; outputKey: string }
  // AUTHORING-TIME convenience, resolved away by expandWorkflowDef before
  // either run engine ever sees a step binding: names the source step by its
  // WorkflowStepConfig.id instead of its position. Lowered to the equivalent
  // { source: "step"; stepIndex; outputKey } (never both fields at once - see
  // types.expand.ts's translateBinding) - a residual stepId past expansion is
  // a bug, not a supported shape. See types.expand.step-ids.test.ts.
  | { source: "step"; stepId: string; outputKey: string }
  | { source: "literal"; value: string };

/** The index a step binding points at, or undefined when it names its source by
 *  id. Only an UNEXPANDED def can carry an id: expandWorkflowDef lowers every one. */
export function stepBindingIndex(binding: InputBinding): number | undefined {
  return binding.source === "step" && "stepIndex" in binding ? binding.stepIndex : undefined;
}

export interface WorkflowStepConfig {
  /** Optional authoring-time name for this step, unique within its OWN def
   * (own steps only - an include-workflow step's absorbed steps live in the
   * SOURCE workflow's own id namespace, never this one). Lets a `{source:
   * "step", stepId, outputKey}` binding or a runIf gate name this step
   * instead of its array position; expandWorkflowDef lowers such a
   * reference to the step's EXPANDED index before either run engine sees
   * it, and an include's remap/bindOverrides keys may use it too (as an id
   * PREFIX naming a step of the INCLUDED workflow - see WorkflowStepConfig's
   * `include` field). Never itself read by the run engines. A duplicate id
   * within the same def is tolerated by expandWorkflowDef unless actually
   * referenced (see its "AC E2 - an unresolvable id is LOUD" tests); the
   * build-time validator (validate-workflow-def.ts) reports every duplicate
   * unconditionally via its "duplicate-step-id" code. */
  id?: string;
  // A registry step type, or the special value "include-workflow": the step
  // is replaced at run time by another workflow's CURRENT steps (dynamic -
  // later edits to the source workflow apply wherever it is included). See
  // expandWorkflowDef.
  type: string;
  bindings: Record<string, InputBinding>;
  // Present only when type === "include-workflow". skipSteps lists which of
  // the SOURCE workflow's own top-level steps to drop. Each entry is EITHER
  // a NUMBER - the step's positional INDEX, exactly as before: used as-is,
  // and an out-of-range entry stays SILENTLY ignored, because a stored
  // custom workflow can contain a stale index and must keep expanding - OR a
  // STRING, which is ALWAYS a step id, resolved against the SOURCE
  // workflow's own top-level steps: the SAME namespace, and the SAME
  // resolution, `resolveIncludeKeyPrefix` (types.expand.ts) already uses for
  // remap/bindOverrides key prefixes below. This is deliberately UNLIKE
  // those key prefixes, where every prefix is a string so a numeric-looking
  // one has to be sniffed as an index for backward compatibility - here the
  // array is typed `(number | string)[]`, so the TYPE ITSELF carries the
  // distinction and a string is never sniffed: even a numeric-looking string
  // like "1" is an id named "1", not index 1. An unresolvable or ambiguous
  // id THROWS, naming the id, this including workflow, and the included one
  // - accepted deliberately even though expandWorkflowDef runs on every
  // render of the workflow list: skipSteps names a step in a workflow the
  // including author does not own, so renaming that step makes the include
  // throw for every includer, where today it would silently stop applying.
  // A silently-wrong DROP - the very hazard ids exist to close: inserting a
  // step into the included workflow at or below a numeric skipSteps entry
  // silently drops a DIFFERENT step than the one the preset author meant,
  // with no compile error and no runtime error - is worse than a loud
  // failure. Ids in skipSteps are a CODE-PRESET authoring feature only: the
  // builder itself never writes a string here (see toggleSkipStep,
  // include-mirror.ts) - it always writes a plain index - so nothing
  // user-authored ever puts an id into stored data, and an older build
  // reading a stored row back never encounters an id form it would
  // misinterpret as "nothing to skip".
  //
  // remap keys are "<skippedStepIndex>.<outputKey>" in the SOURCE workflow's
  // coordinates;
  // values are bindings in the INCLUDING workflow's coordinates ("step"
  // stepIndex values refer to the including workflow's own earlier steps).
  // bindOverrides keys are "<sourceTopIndex>.<inputKey>" - unlike remap,
  // whose keys name OUTPUT keys of DROPPED steps, bindOverrides targets the
  // INPUT keys of KEPT steps; values are bindings in the INCLUDING
  // workflow's coordinates, translated the same way remap values are.
  // Both keys' "<...>" prefix may be the SOURCE workflow's own top-level
  // step's `id` instead of its index - a prefix that parses as an integer is
  // always read as an index (backward compatibility); any other prefix is
  // looked up among the SOURCE workflow's OWN top-level steps only (never
  // recursively into a nested include's absorbed steps, which live in a
  // different workflow's id namespace) and, per expandWithTopIndices's
  // matching rule, an id naming an include-workflow step of the source fans
  // out to every step THAT step absorbs, exactly like the equivalent index
  // does today. An unresolvable id prefix throws, naming it.
  include?: {
    workflowId: string;
    skipSteps: (number | string)[];
    remap: Record<string, InputBinding>;
    bindOverrides?: Record<string, InputBinding>;
  };
  /** Optional gate: the step runs only when the bound boolean resolves to
   * `expected`. Bound to an earlier step's boolean output (source "step"), or a
   * literal/runtime boolean. Undefined = always run. */
  runIf?: { binding: InputBinding; expected: boolean };
}

/**
 * A saved override of a single step of a CODE PRESET, at the step INDEX the
 * preset had it at when the edit was made. Only the fields that actually
 * differ from the preset's own step are recorded - never a full snapshot -
 * so a later preset edit to anything NOT overridden (a brand-new input on
 * this same step, for instance) still reaches an instructor who has
 * customized other parts of it. See preset-overrides.ts.
 */
export interface WorkflowStepOverrideDelta {
  /** The step type recorded at this index when the override was saved. At
   * resolve time, if the CURRENT preset's step at this index no longer has
   * this type (the preset inserted/removed/reordered steps upstream), the
   * WHOLE entry is skipped rather than applied to a step it was never
   * written for - the same "skip silently on a miss" contract
   * include-workflow's own remap/bindOverrides already use (see
   * expandWorkflowDef, types.expand.ts). */
  expectedType: string;
  /** Only the input keys whose binding differs from the preset step's own
   * binding for that key. */
  bindings?: Record<string, InputBinding>;
  /** Present only when the runIf gate itself was changed from the preset
   * step's own gate; `null` means the user explicitly cleared a gate the
   * preset sets (as opposed to never having touched it). */
  runIf?: { binding: InputBinding; expected: boolean } | null;
  /** Present only when an include-workflow step's target changed; replaces
   * the preset step's own `include` wholesale - it is already a small,
   * complete object every time the builder writes it, so a field-level diff
   * would not save anything worth the complexity. */
  include?: WorkflowStepConfig["include"];
}

/**
 * A saved override of a whole CODE PRESET, keyed by the preset's own id (see
 * preset-overrides.ts / allWorkflows in presets.ts) - not a separate
 * duplicate identity. Resolved against the CURRENT code preset every time
 * the workflow list is built, so a preset that later gains a step, or a step
 * that gains a new input, reaches an already-customized instructor
 * automatically (docs/REGRESSION.md #153 explains why this replaced the old
 * copy-on-edit model).
 *
 * `diverged` becomes true the moment an edit changes step SHAPE (steps
 * added, removed, reordered, or an include-workflow step's target changed) -
 * once that happens a positional per-step delta can no longer be trusted to
 * land on the right step if the preset's own shape changes too, so the
 * WorkflowDef's `steps` field becomes the frozen, authoritative full step
 * list (structurally identical to the old "(copy)" behavior) - but stored
 * under the SAME id as the preset, one identity rather than two, and
 * surfaced plainly in the UI (WorkflowDef.presetOverride.diverged) instead
 * of silently.
 */
export interface PresetOverrideDelta {
  /** Overridden name/description; absent = use the preset's own current value. */
  name?: string;
  description?: string;
  diverged: boolean;
  /** Meaningful only while `diverged` is false; ignored once true (the full
   * step list takes over as the source of truth). Keyed by step index. */
  stepOverrides?: Record<number, WorkflowStepOverrideDelta>;
}

/**
 * Workflow-level targets: what institution / course tiles / Canvas courses /
 * GitHub orgs the WHOLE workflow is for, and how far ahead steps should look.
 * Set once (before the steps), scope fills every matching entity input and
 * lookahead inputs the workflow's steps ask for - so the run form stops asking
 * for them and a scheduled/triggered/webhook run has its targets without any
 * prompt. Each entity value is in the standard entity format: a single
 * id/url/acronym, a newline-joined list, or "*" for all (list-capable families
 * only). The lookahead value is a scalar days count (never "*" or a list).
 * The moduleOffset value is a scalar modules-ahead count (never "*" or a list).
 * The concepts value is a scalar newline-joined concept list (never "*" or a list).
 * The sourcePolicy value is a scalar encoded SourcePolicy (never "*" or a list).
 * The lmsModule value is a scalar encoded module-value.ts string (never "*" or a list).
 * An unset family (empty/absent) leaves those inputs asking as before.
 */
export interface WorkflowScope {
  institution?: string;
  hubCourse?: string;
  lmsCourse?: string;
  org?: string;
  lookahead?: string;
  moduleOffset?: string;
  concepts?: string;
  sourcePolicy?: string;
  lmsModule?: string;
}

export interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  preset?: boolean;
  steps: WorkflowStepConfig[];
  /** Workflow-level entity targets applied to matching step inputs. */
  scope?: WorkflowScope;
  /** Optional category for preset workflows. */
  category?: "grading" | "course-setup" | "content" | "communication";
  /** RAW form, present only on a def as STORED (see workflow-defs.ts's
   * mapWorkflowDef) when `id` equals a code preset's id: the delta to
   * resolve against that preset. This is the INPUT to
   * preset-overrides.ts's resolvePresetOverride; allWorkflows (presets.ts)
   * strips it once consumed, so it never appears on a def used for running,
   * building, or scheduling - see `presetOverride` below for that. */
  presetOverrideDelta?: PresetOverrideDelta;
  /** RESOLVED form, present only on the output of allWorkflows for a preset
   * that has a saved override for the current user. Lets the UI show
   * "this preset has been customized" / "this workflow has diverged from
   * its preset" (AC3) without re-diffing. Absent = an unmodified preset, or
   * a plain custom workflow with no ties to any preset. */
  presetOverride?: { diverged: boolean };
}

/** The workflow-scope family a value type belongs to, or null when the type is
 * not a scopeable entity or scalar. The single and list variants of entities
 * share a family. "lookahead", "moduleOffset", and "concepts" are scalar families. */
export function scopeFamilyForType(type: string): keyof WorkflowScope | null {
  switch (type) {
    case "institution":
      return "institution";
    case "hubCourse":
    case "hubCourseList":
      return "hubCourse";
    case "lmsCourse":
    case "lmsCourseList":
      return "lmsCourse";
    case "org":
    case "orgList":
      return "org";
    case "lookahead":
      return "lookahead";
    case "moduleOffset":
      return "moduleOffset";
    case "concepts":
      return "concepts";
    case "sourcePolicy":
      return "sourcePolicy";
    case "lmsModule":
      return "lmsModule";
    default:
      return null;
  }
}

/** The course-derived module PICKER type. A `lmsModule` input is filled
 * indirectly by scope: when its step's course is workflow-scoped, the step
 * derives the module from that course. (The opaque `modules` payload type is
 * NOT included - it is produced by a prior step, not derived from the course.) */
export function isModuleType(type: string): boolean {
  return type === "lmsModule";
}

/** The single-item (non-list) entity value types. */
function isSingleEntityType(type: string): boolean {
  return type === "institution" || type === "hubCourse" || type === "lmsCourse" || type === "org";
}

/** Whether the workflow scope can actually fill this input - i.e. the input no
 * longer needs to be asked at run time. Defined via applyWorkflowScope so a
 * family set to "*" (all) covers a LIST input but NOT a single input (which
 * cannot express "all"), keeping that single input in the run form. */
export function scopeCoversType(scope: WorkflowScope | undefined, type: string): boolean {
  // Institution "*" (all) is filled per-iteration by institution fan-out, so it
  // covers an institution input (which is therefore not asked at run time).
  if (type === "institution" && (scope?.institution ?? "").trim() === "*") return true;
  // A single hubCourse input is covered when the scope fans out over course tiles
  // (via "*" or 2+ newline-separated ids), because fan-out pins a concrete tile
  // per iteration. Single concrete course ids still cover it via applyWorkflowScope.
  if (type === "hubCourse" && isCourseFanout(scope)) return true;
  return applyWorkflowScope(type, "", scope).trim().length > 0;
}

/**
 * The effective value for an entity input given the run-form value and the
 * workflow scope. A non-empty run-form value always wins (a per-run override);
 * otherwise the scope value is coerced to the input's arity: a list input takes
 * the scope value as-is (the engine later expands "*"); a single input takes
 * the first concrete item, and never "*" (which a single input cannot express).
 * Scalar families (lookahead, moduleOffset, concepts, sourcePolicy, lmsModule) are returned as-is from scope, with "*" rejected.
 */
export function applyWorkflowScope(
  type: string,
  runtimeValue: string,
  scope: WorkflowScope | undefined
): string {
  if (runtimeValue.trim()) return runtimeValue;
  const family = scopeFamilyForType(type);
  if (!family || !scope) return runtimeValue;
  const scopeVal = (scope[family] ?? "").trim();
  if (!scopeVal) return runtimeValue;
  if (
    family === "lookahead" ||
    family === "moduleOffset" ||
    family === "concepts" ||
    family === "sourcePolicy" ||
    family === "lmsModule"
  ) {
    return scopeVal === "*" ? runtimeValue : scopeVal;
  }
  if (isSingleEntityType(type)) {
    if (scopeVal === "*") return runtimeValue;
    return scopeVal.split("\n").map((s) => s.trim()).filter(Boolean)[0] ?? "";
  }
  return scopeVal;
}

/** A short human summary of a workflow's scope for the run view, or "" when no
 * family is set. */
export function describeWorkflowScope(scope: WorkflowScope | undefined): string {
  if (!scope) return "";
  const count = (v?: string) => (v ?? "").split("\n").map((s) => s.trim()).filter(Boolean).length;
  const parts: string[] = [];
  if (scope.institution?.trim()) {
    parts.push(scope.institution.trim() === "*" ? "all institutions" : `institution ${scope.institution.trim()}`);
  }
  if (scope.hubCourse?.trim()) {
    parts.push(scope.hubCourse.trim() === "*" ? "all course tiles" : `${count(scope.hubCourse)} course tile(s)`);
  }
  if (scope.lmsCourse?.trim()) {
    parts.push(scope.lmsCourse.trim() === "*" ? "all Canvas courses" : `${count(scope.lmsCourse)} Canvas course(s)`);
  }
  if (scope.org?.trim()) {
    parts.push(scope.org.trim() === "*" ? "all organizations" : `${count(scope.org)} organization(s)`);
  }
  if (scope.lookahead?.trim()) {
    const days = parseInt(scope.lookahead.trim(), 10);
    if (!isNaN(days)) {
      parts.push(`looking ${days} day(s) ahead`);
    }
  }
  if (scope.moduleOffset?.trim()) {
    const modules = parseInt(scope.moduleOffset.trim(), 10);
    if (!isNaN(modules) && modules > 0) {
      parts.push(`${modules} module(s) ahead`);
    }
  }
  if (scope.concepts?.trim()) {
    parts.push(`${count(scope.concepts)} concept(s) targeted`);
  }
  if (scope.sourcePolicy?.trim()) {
    parts.push("a custom material-source policy");
  }
  if (scope.lmsModule?.trim()) {
    parts.push("a fixed current module");
  }
  return parts.join(", ");
}

/** A short human summary of what the workflow scope fills a given input TYPE
 * with, or "" when the scope does not cover this input. Mirrors the arity rules
 * of applyWorkflowScope: a single input covered by a concrete value shows that
 * value; a list input shows "all ..." for "*" or a count otherwise; scalar
 * families (lookahead, moduleOffset, concepts) show their numeric values or counts. */
export function describeScopeForType(scope: WorkflowScope | undefined, type: string): string {
  const effective = applyWorkflowScope(type, "", scope).trim();
  if (!effective) return "";
  const family = scopeFamilyForType(type);
  if (!family) return "";
  if (family === "lookahead") return `${effective} day(s) ahead`;
  if (family === "moduleOffset") return `${effective} module(s) ahead`;
  if (family === "concepts") {
    const conceptCount = effective.split("\n").map((s) => s.trim()).filter(Boolean).length;
    return `${conceptCount} concept(s) targeted`;
  }
  if (family === "sourcePolicy") return "custom material-source policy";
  if (family === "lmsModule") {
    const name = parseLmsModuleValue(effective).name;
    return name ? `module "${name}"` : "a fixed current module";
  }
  if (isSingleEntityType(type)) return effective;
  const labels: Record<Exclude<keyof WorkflowScope, "institution" | "lookahead" | "moduleOffset" | "concepts" | "sourcePolicy" | "lmsModule">, [string, string]> = {
    hubCourse: ["all course tiles", "course tile(s)"],
    lmsCourse: ["all Canvas courses", "Canvas course(s)"],
    org: ["all organizations", "organization(s)"],
  };
  const pair = labels[family as Exclude<keyof WorkflowScope, "institution" | "lookahead" | "moduleOffset" | "concepts" | "sourcePolicy" | "lmsModule">];
  if (!pair) return effective;
  if (effective === "*") return pair[0];
  const count = effective.split("\n").map((s) => s.trim()).filter(Boolean).length;
  return `${count} ${pair[1]}`;
}

export interface RuntimeField {
  fieldKey: string;
  label: string;
  type: WorkflowValueType;
  required: boolean;
  help?: string;
  /** type "uploads" only: the file picker's accept filter. */
  accept?: string;
  /** Carried through from StepInputSpec.options so the RUN form can offer the
   * same fixed choices the builder does. Without this an options-bearing input
   * degrades to a free text box at run time, where a typo silently becomes an
   * unrecognized value. */
  options?: string[];
  /** Carried through from StepInputSpec.multi (types.ts) - true when the run
   * form should let the instructor pick several of `options`, stored
   * newline-joined (e.g. course-build's "outputs" field,
   * steps.course-build-scope.ts). Absent/false = a single choice. */
  multi?: boolean;
  /** Carried through from StepInputSpec.optionLabels (types.ts) - see that
   * field's own comment. Display-only; the submitted value is always the raw
   * entry in `options`. */
  optionLabels?: Record<string, string>;
  /** Carried through from StepInputSpec.visibleWhen (types.ts) - see that
   * field's own comment for what hiding a field does and does not do. */
  visibleWhen?: { fieldKey: string; equals: string } | { fieldKey: string; contains: string };
  /** Carried through from StepInputSpec.requiredWhen (types.ts) - see that
   * field's own comment. */
  requiredWhen?: { fieldKey: string; equals: string };
  /** Carried through from StepInputSpec.group (types.ts) - see that field's
   * own comment. */
  group?: "details" | "templates" | "posting";
}

/**
 * Walk workflow steps in order; for each input whose binding is runtime,
 * collect a RuntimeField. First occurrence of a fieldKey wins; skip duplicates.
 */
export function collectRuntimeFields(
  def: WorkflowDef,
  stepInputs: (type: string) => StepInputSpec[] | undefined
): RuntimeField[] {
  const seen = new Set<string>();
  const fields: RuntimeField[] = [];

  for (const step of def.steps) {
    const specs = stepInputs(step.type);
    if (!specs) continue;

    // Does this step have a course input the workflow scope targets (one /
    // several / all)? If so, a module input in the same step is the "current
    // module" of that scoped course - the step derives it, so it is not asked.
    const stepCourseScoped = specs.some((s) => {
      const fam = scopeFamilyForType(s.type);
      if (fam !== "hubCourse" && fam !== "lmsCourse") return false;
      const listType = fam === "hubCourse" ? "hubCourseList" : "lmsCourseList";
      return scopeCoversType(def.scope, listType);
    });

    for (const spec of specs) {
      const binding = step.bindings[spec.key];
      if (binding && binding.source === "runtime") {
        // A field the workflow scope already targets is not asked at run time -
        // the scope fills it (see applyWorkflowScope in the runners).
        if (scopeCoversType(def.scope, spec.type)) continue;
        // A module input whose step's course is scoped is derived from that
        // course, so it is not asked either.
        if ((isModuleType(spec.type) || spec.courseDerived) && stepCourseScoped) continue;
        const fieldKey = binding.fieldKey;
        if (!seen.has(fieldKey)) {
          seen.add(fieldKey);
          fields.push({
            fieldKey,
            label: spec.label,
            type: spec.type,
            required: spec.required,
            help: spec.help,
            accept: spec.accept,
            options: spec.options,
            multi: spec.multi,
            optionLabels: spec.optionLabels,
            visibleWhen: spec.visibleWhen,
            requiredWhen: spec.requiredWhen,
            group: spec.group,
          });
        }
      }
    }
  }

  return fields;
}

// Workflow step expansion (include-workflow resolution) - split out to
// types.expand.ts (that file was over the 1000-line cap - see
// docs/REGRESSION.md's line-count discipline); re-exported here under its
// original name so every existing import site keeps resolving unchanged.
export { expandWorkflowDef } from "@/lib/workflows/types.expand";

// Schedule <-> CSV conversion - split out to types.schedule-csv.ts (same
// line-count reason); re-exported here under their original names.
export { scheduleToCsv, csvToSchedule } from "@/lib/workflows/types.schedule-csv";

/**
 * Replace the entry with `next.id` in `defs`, or append it when no entry has
 * that id yet. Used for every "save an edited workflow" path (scope changes,
 * WorkflowBuilder edits): a plain `.map` (the old behavior) silently drops
 * the edit whenever `next.id` is not already present - which now happens on
 * purpose the FIRST time a preset is customized (its id has never appeared
 * in the custom list before), so the plain-map assumption no longer holds.
 */
export function upsertWorkflowDefById(
  defs: WorkflowDef[],
  next: WorkflowDef
): WorkflowDef[] {
  return defs.some((w) => w.id === next.id)
    ? defs.map((w) => (w.id === next.id ? next : w))
    : [...defs, next];
}

// Storage helpers (guard typeof window === "undefined" for SSR safety)

const WORKFLOWS_KEY = "ta-workflows";

export function loadCustomWorkflows(): WorkflowDef[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(WORKFLOWS_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as WorkflowDef[];
  } catch {
    return [];
  }
}

export function saveCustomWorkflows(defs: WorkflowDef[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(defs));
  } catch {
    // Silently fail if localStorage is unavailable.
  }
}

// Per-user, per-workflow overlay of disabled TOP-LEVEL step indices (see
// expandWorkflowDef's topIndices) - split out to types.expand.ts alongside
// expandWorkflowDef itself (same line-count reason as the other splits in
// this file); re-exported here under their original names.
export { parseDisabledSteps, loadDisabledSteps, saveDisabledSteps } from "@/lib/workflows/types.expand";
