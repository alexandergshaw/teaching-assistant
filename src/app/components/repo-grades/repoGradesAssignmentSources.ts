// Repo Grades view - the assignment picker's live-or-export duality. The
// picker used to be fed only by listCourseAssignmentsAction (the LIVE Canvas
// assignment list); the instructor's requirement is that it also offer
// assignment-like items out of the course's SAVED EXPORT, which carries
// course CONTENT only (ExportCourseContent - {courseName, modules, pages,
// rubrics, announcements}, src/lib/lms-export-source/types.ts:46) and no
// students at all - expected and fine, since an export never carries a
// Canvas gradebook to post into.
//
// This follows the exact live/export precedent already in this repo
// (useLmsAssignmentPull.ts's pullSource toggle, exportAssignmentOptions from
// src/lib/lms-export-source/export-assignments.ts) rather than inventing a
// second shape. Pure, no I/O - mirrors this folder's existing split between
// "decide" (here, repoGradesAssignmentMapping.ts, repoGradesRows.ts) and
// "render" (RepoGradesGrid.tsx / index.tsx), which is required rather than
// stylistic because vitest here is node-env and collects only
// src/**/*.test.ts: nothing rendered in a .tsx file is ever exercised by a
// real test, so the merge/labelling/parsing decisions that matter for
// correctness live in this module instead.

/**
 * The subset of exportAssignmentOptions's ExportAssignmentOption
 * (src/lib/lms-export-source/export-assignments.ts) this module actually
 * needs: `key` (the stable, list-unique identity a `<select>` uses as its
 * option value) and `itemTitle` (the module item's own title - deliberately
 * not `moduleTitle`, since disambiguating by module is a display nicety this
 * module does not need in order to build a unique, correctly-labelled
 * option). Declared locally rather than importing ExportAssignmentOption
 * itself so this module stays decoupled from the cartridge-import type chain
 * and easy to unit test with plain fixtures.
 */
export interface RepoGradeExportAssignmentInput {
  key: string;
  itemTitle: string;
}

/** The subset of CanvasAssignmentBrief (src/lib/canvas/listings.ts) this module needs. */
export interface RepoGradeLiveAssignmentInput {
  id: string;
  name: string;
}

/** One choosable assignment, from either source. */
export interface RepoGradeAssignmentOption {
  /** Live: the Canvas assignment id. Export: the export option's own key,
   * prefixed so it can never collide with a numeric Canvas id. */
  value: string;
  label: string;
  source: "live" | "export";
  /** The Canvas assignment id when this option can actually be posted to -
   * live options only. Null for every export option. */
  canvasAssignmentId: string | null;
}

// RULE 2 (value namespacing): a live option's `value` is left as the bare
// Canvas assignment id, unprefixed, so an already-persisted mapping (which
// stores exactly that bare id - repoGradesAssignmentMapping.ts's
// RepoGradeAssignmentMap) keeps working unchanged after this feature ships.
// An export option's `value` gets this prefix instead, so the two can share
// one <select> and one persisted field without a numeric export key (e.g.
// "0:1", exportAssignmentOptions's moduleIndex:itemIndex composite) ever
// being mistaken for a live Canvas id. This constant, and the split below in
// parseRepoGradeAssignmentValue, are the ONLY code that knows the prefix.
const EXPORT_VALUE_PREFIX = "export:";

/**
 * Merges a course's live Canvas assignments and its export's assignment-like
 * items into one option list for a single picker.
 *
 * RULE 3 (ordering): live options first, in the order given, then export
 * options, in the order given. Stable and predictable beats clever - the
 * instructor scans this list, and a source-interleaved or re-sorted order
 * would make the same course look different across reloads for no reason
 * tied to the data.
 *
 * RULE 6: pure - never mutates `input.live` or `input.export`, no clock, no
 * randomness; the same input always produces the same output.
 */
export function buildRepoGradeAssignmentOptions(input: {
  live: readonly RepoGradeLiveAssignmentInput[];
  export: readonly RepoGradeExportAssignmentInput[];
}): RepoGradeAssignmentOption[] {
  const liveOptions: RepoGradeAssignmentOption[] = input.live.map((assignment) => ({
    value: assignment.id,
    label: assignment.name,
    source: "live",
    // RULE 1: a live option's Canvas identity IS a real Canvas assignment id
    // - this is the one case where a post can actually happen.
    canvasAssignmentId: assignment.id,
  }));
  const exportOptions: RepoGradeAssignmentOption[] = input.export.map((item) => ({
    value: EXPORT_VALUE_PREFIX + item.key,
    // RULE 4: the label says "from export" explicitly rather than leaving
    // the instructor to infer the source from context - the two lists are
    // merged into one <select>, so nothing else on screen marks the switch.
    label: `${item.itemTitle} (from export)`,
    source: "export",
    // RULE 1: an export carries no Canvas assignment identity at all
    // (src/lib/lms-export-source/types.ts:23-44's posture: never fabricate
    // Canvas identity an export does not carry) - null, unconditionally, is
    // the only honest value here. A caller gating a "post to gradebook"
    // control asks isPostableAssignmentOption below rather than re-deriving
    // this rule from `source` itself.
    canvasAssignmentId: null,
  }));
  return [...liveOptions, ...exportOptions];
}

/**
 * Splits a stored option value back into its source and id, for restoring a
 * persisted choice without trusting the stored string.
 *
 * RULE 5: never trusts its input, matching the "never trust stored data"
 * posture parseAssignmentMapByCourse (repoGradesUiState.ts) already takes -
 * an empty string, a bare prefix with no id after it, or a live-side value
 * that is empty/whitespace-only all return `null` rather than a
 * half-populated result.
 */
export function parseRepoGradeAssignmentValue(value: string): { source: "live" | "export"; id: string } | null {
  if (value.startsWith(EXPORT_VALUE_PREFIX)) {
    const id = value.slice(EXPORT_VALUE_PREFIX.length);
    // A bare "export:" with nothing after it is malformed, not "export id
    // is the empty string" - there is no such export option.
    return id ? { source: "export", id } : null;
  }
  const trimmed = value.trim();
  return trimmed ? { source: "live", id: trimmed } : null;
}

/**
 * True when this option can be the target of a Canvas grade post.
 *
 * RULE 1: reads straight off `canvasAssignmentId` - the single field RULE 1
 * requires to make "an export option is not postable" unmissable - rather
 * than re-checking `source`, so this stays correct even if a future source
 * is added that also carries no Canvas identity.
 */
export function isPostableAssignmentOption(option: RepoGradeAssignmentOption | null): boolean {
  if (!option) return false;
  return option.canvasAssignmentId !== null;
}
