"use server";

// Chunk D of the Modules-view backlog (docs/carry-module-pattern-forward-
// acceptance-criteria.md) - agent 1C's slice, G1 plus D6/D7/D8/D9. Nothing in
// the app composes a module's per-item reads into "here is module X's
// shape"; this file is that composition, as a read-only "use server" action.
// It produces the READ shape that a later wave composes with the (not-yet-
// written) pattern-inference and deadline-transposition libs and the write
// paths in moduleContentActions.ts - this file must not, and does not,
// import either of those two modules, which do not exist on disk yet.
//
// D8 (THE DEFECT THIS FILE EXISTS TO PREVENT): `getGradable`
// (src/lib/canvas-modules/gradables.ts:13-45) reads exactly four fields -
// title, description, rubricId, submissionTypes. It does NOT read
// points_possible, due_at, or published, all three of which the carry-
// forward feature promises to reproduce. Those three come from
// `mapModuleItem` (src/lib/canvas-modules/mappers.ts:6-23), which `listModules`
// already returns for free as part of the module tree - no extra Canvas call.
// Every gradable item below is built by COMBINING the module-item fields
// (title/position/indent/published/dueAt/pointsPossible, all from
// `mapModuleItem`) with the gradable detail fields (description/rubricId/
// submissionTypes, from `getGradable`) precisely so a template read can never
// be assembled from `getGradable` alone and silently zero every carried
// item's points.
//
// D7 (DISCLOSURE IS PER KIND, NOT ONE FLAT LIST): the write path
// `addContentToModuleDetailed` (moduleContentActions.ts) actually uses is
// `createGradable`, which writes none of six fields (unlock_at, lock_at,
// allowed_attempts, assignment_group_id, allowed_extensions, peer_reviews)
// for any kind, and additionally cannot write submission_types at all for
// Quizzes or Discussions, and never sends points_possible for Quizzes
// (Canvas computes a classic quiz's total from its questions - see the
// comment on `createGradable`). So "not carried" is not a UI preference for
// those cases, it is a hard limit of the write path this app has wired for
// that kind. `NOT_CARRIED_BY_KIND` below states this per kind, per field,
// with the reason, so the caller (the proposal UI, wave 2) can tell an
// instructor exactly what will not carry for THIS item's kind rather than a
// single flattened warning that overstates or understates it for any given
// kind.
//
// D6 (SIX, NOT EIGHT - AND TWO OF THE EIGHT ARE READABLE, JUST NOT FROM
// HERE): `grading_type` and `omit_from_final_grade` are genuinely readable
// today, via `listAssignmentBriefsWithDue`
// (src/lib/canvas/auto-zero.ts:174-220), consumed by src/app/actions/
// grading.ts. That function was read as part of this brief and deliberately
// NOT wired in here: its signature takes `(baseUrl, token, institution,
// courseId)` directly rather than the `(courseUrl, code)` + `resolveCourse`
// shape every other read in this file uses, and it lists and paginates EVERY
// assignment in the course to find the handful that live in one module -
// a whole-course fetch to recover two fields for a subset of items in a
// single-module read. That is reported as a follow-up (see this file's
// report) rather than duplicated or awkwardly re-plumbed here. The six
// genuinely write-only-with-no-reader-anywhere fields are unlock_at, lock_at,
// allowed_attempts, assignment_group_id, allowed_extensions, peer_reviews.
//
// D9 (OUR OWN FEATURE IS THE TRAP): a graded discussion's checkpoints
// structure (chunk A, docs/REGRESSION.md entry 328) is written via GraphQL
// (src/lib/canvas-modules/graded-discussion.ts) and nothing in `src` reads
// any of it back - there is no REST field and no GraphQL query for it
// anywhere in this codebase today. Adding a GraphQL read here would be new
// capability beyond this file's brief (G1's read composition), so this file
// takes the DISCLOSURE branch D9 explicitly allows as an alternative to
// detection: every Discussion-kind item is marked `checkpointsUnknown: true`,
// so a template built from a checkpointed intro discussion cannot be carried
// forward silently as a plain discussion without the caller seeing that this
// reader could not rule out a checkpoint split. This is disclosure, not
// detection - see this file's report for why detection was not attempted.
//
// STEP-10 REVIEW, C7 (NO DISCUSSION CAN EVER BE CARRIED - SAY SO PLAINLY):
// `checkpointsUnknown = item.type === "Discussion"` above is UNCONDITIONAL -
// there is no code path anywhere in `src` that can ever produce `false` for a
// Discussion, so "carry this module forward" means "everything except
// discussions", permanently, for every course, until a checkpoint read
// exists. `@/lib/module-template-shape.ts`'s `DISCUSSION_CHECKPOINTS_
// UNREADABLE_REASON` states that honestly: the limitation is OURS (we
// cannot read the structure back), not
// a property of any given discussion ("this discussion MAY have a split"
// wording is what this constant replaces - see this file's report for where
// that wording still lives, outside this file's ownership). Consequently
// FOUR code paths across this feature are DEAD IN PRODUCTION, exercised only
// by their own unit tests, because nothing can ever reach the "not
// checkpointed" branch:
//   1. `refused-checkpoint-unknown` in carry-module-pattern.ts's apply
//      action always fires for every Discussion; its sibling "carries
//      normally" branch (checkpointsUnknown: false) is unreachable from this
//      reader and is exercised only by that file's own unit test.
//   2. `"Discussion"` in carry-module-pattern.ts's `GENERATABLE_KINDS` set -
//      the LLM body generator is never actually invoked for a Discussion in
//      production, only in tests that construct a TemplateItem by hand with
//      checkpointsUnknown: false.
//   3. The Discussion arm of `applyGradableViaDetailed`
//      (carry-module-pattern.ts) - the write call itself never runs for a
//      real Discussion for the same reason.
//   4. `DISCUSSION_WRITE_GAPS` below - computed, attached to every Discussion
//      TemplateItem's `notCarried`, and never seen by an instructor, because
//      every Discussion is refused before that disclosure would matter.
// Do not delete any of the four: each becomes live production code the
// moment a checkpoint read is added, and deleting them now would mean
// rebuilding exactly this shape later. The point of recording this here is
// so a future reader does not mistake "covered by a green test" for
// "reachable from a real course".
//
// STEP-10 REVIEW, C6 (`published` IS CARRIED FOR ASSIGNMENTS ONLY):
// `TemplateItem.published` (from `mapModuleItem` - D8) is read successfully
// for every kind, but the WRITE side only honours it for Assignments -
// `createCourseAssignmentAction` (src/app/actions/canvas-modules.ts) accepts
// a `published` field and `carry-module-pattern.ts`'s `applyAssignment`
// passes `sourceItem.published` straight through. Every other kind this
// reader discloses fields for is written via `addContentToModuleDetailed`
// (moduleContentActions.ts), whose `AddContentOpts` has no `published`
// member at all, so the new item lands at Canvas's own default publish state
// regardless of the template's value. `PUBLISHED_NOT_CARRIED_EXCEPT_
// ASSIGNMENT` below discloses this per kind (Quiz, Discussion, Page, File,
// SubHeader), matching D7's own per-kind discipline - it was previously
// disclosed nowhere, for any kind.
//
// STEP-10 REVIEW, C10 (a constant's name and comment both used to contradict
// its contents): what is now split into `WRITE_ONLY_NO_READER` (six fields)
// and `READABLE_ELSEWHERE_BUT_NOT_HERE` (two fields) used to be one constant,
// `NOT_READ_ANYWHERE`, named and documented as six fields while actually
// holding eight - `grading_type` and `omit_from_final_grade` ARE read
// elsewhere (`src/lib/canvas/auto-zero.ts`'s `listAssignmentBriefsWithDue`,
// consumed by `grading.ts`), for the different reason D6's own comment
// (still below, on `READABLE_ELSEWHERE_BUT_NOT_HERE`) explains. The
// disclosure shown to the instructor was always correct either way; only the
// constant's name and doc comment lied to the next developer reading this
// file. Split so the two reasons stay distinct.
//
// D11 (export-sourced gating) is explicitly out of this file's scope (D6/D7/
// D8/D9 only, per the brief) and is not implemented here; see the report.

import { requireOwner } from "@/lib/supabase/auth";
import { listModules, getGradable, getPage } from "@/lib/canvas-modules";
import type { GradableKind } from "@/lib/canvas-modules";

const GRADABLE_KINDS: readonly string[] = ["Assignment", "Quiz", "Discussion"];

function isGradableKind(type: string): type is GradableKind {
  return GRADABLE_KINDS.includes(type);
}

/** One field this reader cannot carry forward for a given kind, and why -
 * see this file's header (D6/D7) for the two distinct reasons a field ends
 * up here: never read anywhere in this codebase yet, or read but the write
 * path this app uses for that kind cannot accept it. */
export interface NotCarriedField {
  field: string;
  reason: string;
}

// The six fields D6 confirms are genuinely WRITE-ONLY WITH NO READER
// ANYWHERE in this codebase today. Identical for every gradable kind, since
// none of `getGradable`, `mapModuleItem`, or any other read in `src` fetches
// them for Assignments, Quizzes, or Discussions. (Step-10 review, C10: this
// used to be two fields short of the constant it was merged into - see
// `READABLE_ELSEWHERE_BUT_NOT_HERE` below for the other two and why they are
// kept separate.)
const WRITE_ONLY_NO_READER: readonly NotCarriedField[] = [
  { field: "unlock_at", reason: "Writable but not read by any Canvas-modules path this reader reuses." },
  { field: "lock_at", reason: "Writable but not read by any Canvas-modules path this reader reuses." },
  { field: "allowed_attempts", reason: "Writable but not read by any Canvas-modules path this reader reuses." },
  { field: "assignment_group_id", reason: "Writable but not read by any Canvas-modules path this reader reuses." },
  { field: "allowed_extensions", reason: "Writable but not read by any Canvas-modules path this reader reuses." },
  { field: "peer_reviews", reason: "Writable but not read by any Canvas-modules path this reader reuses." },
];

// D6's other two fields: genuinely READABLE, just not by anything THIS file
// reuses - a different reason from the six above, which is exactly why C10
// (step-10 review) split this into its own constant instead of leaving it
// merged into WRITE_ONLY_NO_READER under a name ("not read anywhere") that
// stopped being true for these two the moment D6 was written.
const READABLE_ELSEWHERE_BUT_NOT_HERE: readonly NotCarriedField[] = [
  {
    field: "grading_type",
    reason:
      "Readable via src/lib/canvas/auto-zero.ts's listAssignmentBriefsWithDue, but that call takes a different " +
      "context shape (baseUrl/token/institution, not courseUrl) and pages every assignment in the course to " +
      "recover two fields for a subset of one module - reported as a follow-up rather than wired in here.",
  },
  {
    field: "omit_from_final_grade",
    reason: "Same follow-up as grading_type above - see that field's reason.",
  },
];

// Step-10 review, C6: `published` IS read successfully for every kind (via
// mapModuleItem - D8), but only the Assignment write path
// (createCourseAssignmentAction, which accepts `published` - see
// carry-module-pattern.ts's applyAssignment) can honour it on creation.
// Every other kind here is written through addContentToModuleDetailed
// instead, whose AddContentOpts has no `published` member, so the new item
// lands at Canvas's own default publish state regardless of this item's
// published value. Not merged into WRITE_ONLY_NO_READER: the defect here is
// purely on the WRITE side for these kinds, never on the read side.
const PUBLISHED_NOT_CARRIED_EXCEPT_ASSIGNMENT: NotCarriedField = {
  field: "published",
  reason:
    "Read successfully from this item, but only the Assignment write path (createCourseAssignmentAction) can " +
    "set publish state on creation. This kind is written through addContentToModuleDetailed instead, whose " +
    "AddContentOpts has no published member, so the new item lands at Canvas's own default publish state " +
    "regardless of this item's published value here.",
};

// Per-kind gaps in the WRITE path this app has wired, on top of the shared
// list above - D7. Assignments have none beyond the shared list: the richer
// write path (createCourseAssignmentAction / createAssignment) can carry
// points_possible, due_at, and submission_types.
const QUIZ_WRITE_GAPS: readonly NotCarriedField[] = [
  {
    field: "points_possible",
    reason: "Canvas computes a classic quiz's total from its questions; createGradable's Quiz branch never sends points_possible.",
  },
  { field: "submission_types", reason: "Quizzes have no submission_types concept - nothing to carry." },
];
const DISCUSSION_WRITE_GAPS: readonly NotCarriedField[] = [
  { field: "submission_types", reason: "Discussions have no submission_types concept - nothing to carry." },
];

function notCarriedFor(kind: GradableKind): NotCarriedField[] {
  const shared = [...WRITE_ONLY_NO_READER, ...READABLE_ELSEWHERE_BUT_NOT_HERE];
  // C6: `published` carries for Assignments (createCourseAssignmentAction
  // accepts it), so Assignment's list stops at the shared fields - adding it
  // here would be false for the one kind that actually gets it.
  if (kind === "Assignment") return shared;
  if (kind === "Quiz") return [...shared, ...QUIZ_WRITE_GAPS, PUBLISHED_NOT_CARRIED_EXCEPT_ASSIGNMENT];
  // Discussion (see this file's header, C7): computed here per D7's
  // discipline, but DEAD IN PRODUCTION - every Discussion is refused before
  // an instructor ever sees this list, because checkpointsUnknown is
  // unconditional. Kept correct anyway, for the moment a checkpoint read
  // exists and this becomes reachable.
  return [...shared, ...DISCUSSION_WRITE_GAPS, PUBLISHED_NOT_CARRIED_EXCEPT_ASSIGNMENT];
}

/** One module item, read as a template - the module-tree fields (D8's
 * `mapModuleItem` half) merged with the gradable detail fields (D8's
 * `getGradable` half) when this kind has any, plus a page body when this is
 * a Page item. `notCarried` and `checkpointsUnknown` are D7/D9's per-kind
 * disclosures - see this file's header. */
export interface TemplateItem {
  id: number;
  title: string;
  /** Page, Assignment, Quiz, Discussion, File, SubHeader, ExternalUrl, ExternalTool - see CanvasModuleItem. */
  type: string;
  position: number;
  indent: number;
  published: boolean;
  pageUrl: string | null;
  contentId: number | null;
  /** Raw ISO instant from mapModuleItem, untransposed - decomposing and
   * recomposing this against a target module's own week is the sibling
   * transposition module's job (AC4/D5), not this reader's. */
  dueAt: string | null;
  /** From mapModuleItem - see D8's header comment for why this must never
   * come from getGradable alone. */
  pointsPossible: number | null;
  /** HTML body for a Page item (from getPage); the gradable description/
   * message for Assignment/Quiz/Discussion (from getGradable); null for
   * File/SubHeader/ExternalUrl/ExternalTool items, which carry no body. */
  description: string | null;
  /** Present only for Assignment items with an associated rubric - carries
   * forward by ASSOCIATION (bulkAssociateRubric), never by cloning (AC3). */
  rubricId?: number;
  /** Non-empty only for Assignment items - getGradable already returns [] for
   * Quiz/Discussion, matching D7's "no submission_types concept" for those kinds. */
  submissionTypes: string[];
  /** Fields this item's kind cannot carry through the write path this app
   * actually uses, each with why - see D6/D7 and this file's header. For
   * Page/File/SubHeader this holds only the C6 `published` disclosure (see
   * `PUBLISHED_NOT_CARRIED_EXCEPT_ASSIGNMENT`); empty only for
   * ExternalUrl/ExternalTool, which this feature never writes at all (see
   * carry-module-pattern.ts's "unsupported-kind" outcome), so there is
   * nothing to disclose one field of. */
  notCarried: NotCarriedField[];
  /** D9: true only for Discussion-kind items, and - as of this reader -
   * ALWAYS true for every Discussion-kind item, with no code path that can
   * ever produce false in production (see this file's header, C7). This is
   * not a hedge about any particular discussion; it is an unconditional
   * statement of THIS APP's own limitation: there is no REST or GraphQL read
   * for a discussion's checkpoint structure anywhere in this codebase, so
   * this reader cannot rule a checkpoint split out for ANY discussion, ever.
   * The caller must treat every discussion as "we cannot see whether this
   * has a checkpoint split", never as "probably does not". See
   * `@/lib/module-template-shape.ts`'s `DISCUSSION_CHECKPOINTS_UNREADABLE_
   * REASON` for the instructor-facing wording this fact should produce.
   * Disclosure, not detection - see this file's report for why detection
   * was not attempted. */
  checkpointsUnknown: boolean;
}

// The honest, instructor-facing wording for the C7 refusal above lives in
// @/lib/module-template-shape.ts's DISCUSSION_CHECKPOINTS_UNREADABLE_REASON,
// NOT here: this file carries "use server", and such a module may export
// nothing but async functions and type-only exports (src/lib/use-server-
// exports.test.ts enforces this by scanning real source - it caught this
// constant here as a build error that neither tsc nor a unit test would
// otherwise see). See that file's own header for the full precedent
// (src/lib/knowledge-check-shape.ts is the pattern it follows).

/** One item this reader could not read, kept separate from `items` so a
 * single Canvas failure never drops the rest of the template - the same
 * per-item-failure discipline `ModuleContentResult` / `describeOrphans`
 * (moduleContentActions.ts) already apply to writes, carried over to reads. */
export interface TemplateItemFailure {
  itemId: number;
  title: string;
  type: string;
  reason: string;
}

/** One module, read as a template: its ordered items (each already merged
 * per D8, disclosed per D7/D9) plus any items that failed to read. Nothing
 * here is written to Canvas - this action is read-only end to end (AC1's
 * PROPOSE step). */
export interface ModuleTemplate {
  moduleId: number;
  moduleName: string;
  items: TemplateItem[];
  failures: TemplateItemFailure[];
}

/**
 * Read one module as a template: its ordered items, each merged from the
 * module tree (position/indent/published/dueAt/pointsPossible - D8) and, for
 * gradable kinds, the gradable detail (description/rubricId/submissionTypes)
 * and for Page kinds, the page body. A single item's Canvas failure is
 * reported in `failures` and never drops the rest of the module (AC6).
 *
 * This performs exactly one `listModules` call (which itself fetches every
 * module's items, since Canvas has no narrower "one module's items" list
 * call already wired in this codebase) plus one extra read per gradable or
 * Page item in the target module - no calls for other modules' items beyond
 * what `listModules` already had to make to find this one.
 */
export async function readModuleTemplateAction(
  courseUrl: string,
  moduleId: number,
  acronym?: string
): Promise<{ template: ModuleTemplate } | { error: string }> {
  try {
    await requireOwner();
    const modules = await listModules(courseUrl, acronym);
    const target = modules.find((m) => m.id === moduleId);
    if (!target) {
      return { error: "Could not find that module in this course." };
    }

    const items: TemplateItem[] = [];
    const failures: TemplateItemFailure[] = [];

    for (const item of target.items) {
      try {
        let description: string | null = null;
        let rubricId: number | undefined;
        let submissionTypes: string[] = [];
        let notCarried: NotCarriedField[] = [];
        let checkpointsUnknown = false;

        if (isGradableKind(item.type) && typeof item.contentId === "number") {
          const detail = await getGradable(courseUrl, item.type, item.contentId, acronym);
          description = detail.description || null;
          rubricId = detail.rubricId;
          submissionTypes = detail.submissionTypes;
          notCarried = notCarriedFor(item.type);
          checkpointsUnknown = item.type === "Discussion";
        } else if (item.type === "Page" && item.pageUrl) {
          const page = await getPage(courseUrl, item.pageUrl, acronym);
          description = page.body || null;
          // C6 (step-10 review): Page goes through addContentToModuleDetailed,
          // whose AddContentOpts cannot set published either.
          notCarried = [PUBLISHED_NOT_CARRIED_EXCEPT_ASSIGNMENT];
        } else if (item.type === "File" || item.type === "SubHeader") {
          // C6 (step-10 review): same write path, same gap - neither kind
          // needs a body read (File is carried by reference, SubHeader has
          // none), but both still lose `published` on write.
          notCarried = [PUBLISHED_NOT_CARRIED_EXCEPT_ASSIGNMENT];
        }

        items.push({
          id: item.id,
          title: item.title,
          type: item.type,
          position: item.position,
          indent: item.indent,
          published: item.published,
          pageUrl: item.pageUrl,
          contentId: item.contentId,
          dueAt: item.dueAt,
          pointsPossible: item.pointsPossible,
          description,
          rubricId,
          submissionTypes,
          notCarried,
          checkpointsUnknown,
        });
      } catch (err) {
        failures.push({
          itemId: item.id,
          title: item.title,
          type: item.type,
          reason: err instanceof Error ? err.message : "Could not read this item.",
        });
      }
    }

    return {
      template: {
        moduleId: target.id,
        moduleName: target.name,
        items,
        failures,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the module." };
  }
}
