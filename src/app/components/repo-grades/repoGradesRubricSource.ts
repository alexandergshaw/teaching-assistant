// Repo Grades view - the rubric picker's five-source model
// (docs/repo-grades-rubric-picker-acceptance-criteria.md). Today this page
// grades against ONE free-text rubric string typed into a textarea
// (RepoGradesControls.tsx's `repo-grades-rubric`, persisted globally under
// `ta-repo-grades-rubric`) and passed verbatim to `gradeRepoAction`. The
// instructor already has the real rubric in two places this page can reach
// without an extra request - the course's live Canvas rubric list
// (`listRubrics`, src/lib/canvas-modules/rubrics.ts) and the course row's
// stored export (`ExportCourseContent.rubrics`, a `CartridgeRubric[]`) - plus
// the mapped assignment's own attached rubric and the textarea itself. This
// module owns every PURE decision behind offering those five as one
// `<select>`: option assembly (AC item 2), fixed ordering (AC item 3), value
// namespacing so a live id and an export title can share one persisted
// string without colliding (AC items 19/46/47), parsing a persisted choice
// back without trusting it (AC items 21/46), degrading a stale choice with a
// stated reason rather than silently changing what the instructor picked (AC
// item 21), and the empty-state reasons a short or absent list must give (AC
// items 22/23/44/52).
//
// THE CANONICAL PRECEDENT: repoGradesAssignmentSources.ts already solved the
// identical live-or-export duality for this page's ASSIGNMENT picker, and
// every convention below is carried over from it deliberately rather than
// reinvented - locally-declared structural input types instead of importing
// the concrete source types (RULE 0 below), a namespacing prefix private to
// this module with exactly one parser that knows it (RULE 2), a parser that
// never trusts stored input (RULE 5), and an honesty rule encoded as a FIELD
// on the option (`mayNotResolve`) rather than re-derived from `source` by
// each caller (RULE 1).
//
// What this module deliberately does NOT do:
// - No rubric TEXT rendering. `RubricDetail` (live, camelCase) and
//   `CartridgeRubric` (export, `{title, criteria}`) are structurally
//   different from Canvas's raw snake_case rubric shape `formatRubric`
//   (src/lib/canvas/metadata.ts:52) renders, and `formatRubric` itself
//   cannot be imported client-side at all (metadata.ts:5 reaches
//   canvas-core, which reads Canvas tokens from env - forbidden here). That
//   renderer is a sibling module's job. This file only ever handles a
//   rubric's TITLE (for option labels and export identity) - never its
//   criteria.
// - No I/O, no clock, no randomness. Every export below is a pure function
//   of its arguments; loading the live/export lists and caching a per-column
//   resolved assignment rubric belong to the client hook that calls this
//   module.
// - No per-repo override, no writing back to Canvas. Out of scope per the
//   acceptance criteria's R9.

// RULE 0 (structural input types): declared locally rather than importing
// `CanvasRubric` (src/lib/canvas-modules/types.ts:211-219) or
// `CartridgeRubric` (src/lib/cartridge-import-shared.ts:103-106) so this
// module stays decoupled from both type chains and easy to unit test with
// plain fixtures - the same reasoning repoGradesAssignmentSources.ts's own
// `RepoGradeExportAssignmentInput`/`RepoGradeLiveAssignmentInput` give.

/**
 * The subset of `CanvasRubric` (src/lib/canvas-modules/types.ts:211-219)
 * this module needs. `source` is required, not cosmetic: `getRubric` is
 * COURSE-scoped and 404s on an account-level rubric's id
 * (canvas-modules/types.ts:214-218's own doc comment), so an "account"
 * rubric can be LISTED here but may fail to resolve when a caller later
 * tries to read its criteria - see `mayNotResolve` on `RepoGradeRubricOption`
 * below, which is how that honesty rule is carried rather than re-derived.
 */
export interface RepoGradeLiveRubricInput {
  id: number;
  title: string;
  source: "course" | "account";
}

/**
 * The subset of `CartridgeRubric` (src/lib/cartridge-import-shared.ts:103-106)
 * this module needs. `CartridgeRubric` has NO id field at all, so `title` is
 * the only handle available for identity - see the export-identity RULE
 * below `buildRepoGradeRubricOptions`.
 */
export interface RepoGradeExportRubricInput {
  title: string;
}

/** Where a rubric came from. `assignment` resolves PER COLUMN at grade time
 * (the mapped Canvas assignment's own attached rubric) - every other source
 * is one rubric for the whole page. See the acceptance-criteria doc's
 * "Vocabulary" section. */
export type RepoGradeRubricSource = "generate" | "assignment" | "live" | "export" | "manual";

/** One choosable rubric-source option, for a single `<select>` with native
 * `<optgroup>` grouping (AC item 42 - plain `<select>`, not MUI; this folder
 * has no MUI import anywhere). */
export interface RepoGradeRubricOption {
  /** The persisted/select value - always parseable back by
   * `parseRepoGradeRubricValue` below. */
  value: string;
  label: string;
  source: RepoGradeRubricSource;
  /** The `<optgroup>` label this option renders under, or `null` for a
   * standalone top-level `<option>` (`generate`/`assignment`/`manual` are
   * fixed slots, not list items, and are never grouped). Carried as a field
   * so the caller groups options without re-deriving grouping from `source`
   * itself - the same posture RULE 1 below takes for postability. */
  group: string | null;
  /** RULE 1 (honesty as a field): true only for a `live` option built from a
   * `source: "account"` input. An account-level rubric IS listed (Canvas
   * merges it into the same `listRubrics` array as course rubrics - see
   * rubrics.ts:182), but a caller resolving its criteria via `getRubric`
   * will 404. False for every other option, unconditionally - `generate`,
   * `assignment`, and `manual` have no read-a-rubric-by-id step to fail, and
   * an export option's criteria come from the export payload itself, never
   * a network call. A caller gating "this option may fail when chosen"
   * reads this field rather than re-checking `source === "account"` itself.
   */
  mayNotResolve: boolean;
}

// RULE 2 (value namespacing): three bare sentinel tokens for the three
// fixed, non-listed slots, plus a colon-suffixed prefix each for the two
// DYNAMIC lists (live, export) - mirroring repoGradesAssignmentSources.ts's
// EXPORT_VALUE_PREFIX. A sentinel can never collide with a prefixed value
// because neither prefix constant equals any sentinel and a bare Canvas
// rubric id or export title never contains a colon immediately after
// "live"/"export" by construction (the id/title is appended AFTER the
// prefix, not interpolated into it). These five constants, and the single
// parser below that knows them, are the ONLY code in this module aware of
// the encoding - every other function speaks in already-parsed values.
const GENERATE_VALUE = "generate";
const ASSIGNMENT_VALUE = "assignment";
const MANUAL_VALUE = "manual";
const LIVE_VALUE_PREFIX = "live:";
const EXPORT_VALUE_PREFIX = "export:";

const LIVE_GROUP_LABEL = "Live Canvas rubrics";
const EXPORT_GROUP_LABEL = "From your course export";

/**
 * Assembles the ordered option list for one `<select>` from a course's live
 * Canvas rubric list and its export's rubric list.
 *
 * RULE 3 (fixed order, AC item 3): `generate`, `assignment`, then live
 * options sorted by title, then export options sorted by title, then
 * `manual` - always, never re-sorted per render and never source-
 * interleaved. The instructor scans this list; a shuffled order would make
 * the same course look different across reloads for no reason tied to the
 * data.
 *
 * RULE 4 (export identity, AC item 47): `CartridgeRubric` carries no id at
 * all, so an export rubric's identity is its TITLE, with duplicate titles
 * disambiguated by a 0-based OCCURRENCE INDEX counted in the ORIGINAL
 * `input.export` order - before the title sort below reorders what is
 * DISPLAYED. This identity is therefore only as stable as the export's own
 * titles and their relative order: re-uploading an export that renames or
 * reorders same-titled rubrics changes which rubric a persisted choice
 * points at, which is exactly why `resolveStoredRepoGradeRubricChoice` below
 * treats any export choice not found in the CURRENT list as stale rather
 * than trusting the encoded position.
 *
 * RULE 3b (export label, AC item 3): an export option's label is suffixed
 * `(from export)` - the exact labelling precedent
 * `buildRepoGradeAssignmentOptions` (repoGradesAssignmentSources.ts) already
 * set for this page's assignment picker - because an export rubric is
 * offered as a course-level list with no assignment association at all
 * (AC item 11: an export must never be labelled as "this assignment's
 * rubric"), and the merged `<select>` needs that said in the label itself,
 * not only implied by the `<optgroup>` a caller may or may not render.
 *
 * RULE 6 (purity): never mutates `input.live` or `input.export` (both are
 * only read, and any local sort clones first), no clock, no randomness - the
 * same input always produces the same output.
 */
export function buildRepoGradeRubricOptions(input: {
  live: readonly RepoGradeLiveRubricInput[];
  export: readonly RepoGradeExportRubricInput[];
}): RepoGradeRubricOption[] {
  const generateOption: RepoGradeRubricOption = {
    value: GENERATE_VALUE,
    label: "Generate from the instructions",
    source: "generate",
    group: null,
    mayNotResolve: false,
  };
  const assignmentOption: RepoGradeRubricOption = {
    value: ASSIGNMENT_VALUE,
    label: "Use the mapped assignment's rubric",
    source: "assignment",
    group: null,
    mayNotResolve: false,
  };
  const manualOption: RepoGradeRubricOption = {
    value: MANUAL_VALUE,
    label: "Type my own",
    source: "manual",
    group: null,
    mayNotResolve: false,
  };

  const liveOptions: RepoGradeRubricOption[] = [...input.live]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((rubric) => ({
      value: `${LIVE_VALUE_PREFIX}${rubric.id}`,
      label: rubric.title,
      source: "live",
      group: LIVE_GROUP_LABEL,
      mayNotResolve: rubric.source === "account",
    }));

  // RULE 4: occurrence index computed on the ORIGINAL input order, before
  // the display sort below - see the doc comment above.
  const occurrenceCounts = new Map<string, number>();
  const exportWithIdentity = input.export.map((item) => {
    const occurrence = occurrenceCounts.get(item.title) ?? 0;
    occurrenceCounts.set(item.title, occurrence + 1);
    return { item, occurrence };
  });
  const exportOptions: RepoGradeRubricOption[] = exportWithIdentity
    .sort((a, b) => a.item.title.localeCompare(b.item.title))
    .map(({ item, occurrence }) => ({
      value: `${EXPORT_VALUE_PREFIX}${occurrence}:${item.title}`,
      label: `${item.title} (from export)`,
      source: "export",
      group: EXPORT_GROUP_LABEL,
      mayNotResolve: false,
    }));

  return [generateOption, assignmentOption, ...liveOptions, ...exportOptions, manualOption];
}

/** The result of successfully parsing a `<select>`/persisted rubric-source
 * value - discriminated on `source`, carrying only the identity fields that
 * source actually has. */
export type RepoGradeRubricValue =
  | { source: "generate" }
  | { source: "assignment" }
  | { source: "manual" }
  | { source: "live"; id: string }
  | { source: "export"; occurrence: number; title: string };

/**
 * Splits a `<select>` value (or a persisted string read back from storage)
 * into its source and identity, for restoring a choice without trusting the
 * stored string.
 *
 * RULE 5 (never trust stored data): matches
 * `parseRepoGradeAssignmentValue`'s posture exactly (same "never trust
 * stored data" rule `parseAssignmentMapByCourse`/`loadSelectedRepoIds`
 * already take) - an empty string, whitespace-only input, a bare prefix
 * with nothing after it, a non-numeric export occurrence index, or a
 * negative one all return `null` rather than a half-populated result. The
 * whole input is trimmed once up front so surrounding whitespace alone
 * (e.g. a value corrupted by a copy/paste round-trip) cannot masquerade as
 * a real choice.
 */
export function parseRepoGradeRubricValue(value: string): RepoGradeRubricValue | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === GENERATE_VALUE) return { source: "generate" };
  if (trimmed === ASSIGNMENT_VALUE) return { source: "assignment" };
  if (trimmed === MANUAL_VALUE) return { source: "manual" };
  if (trimmed.startsWith(LIVE_VALUE_PREFIX)) {
    const id = trimmed.slice(LIVE_VALUE_PREFIX.length);
    // A bare "live:" with nothing after it is malformed, not "id is the
    // empty string" - there is no such live option.
    return id ? { source: "live", id } : null;
  }
  if (trimmed.startsWith(EXPORT_VALUE_PREFIX)) {
    const rest = trimmed.slice(EXPORT_VALUE_PREFIX.length);
    const separatorIndex = rest.indexOf(":");
    // Title text may itself contain colons (e.g. "Lab 1: Setup"), so only
    // the FIRST colon after the prefix is the occurrence/title separator -
    // everything after it, however many colons it holds, is the title.
    if (separatorIndex < 0) return null;
    const occurrenceText = rest.slice(0, separatorIndex);
    const title = rest.slice(separatorIndex + 1);
    const occurrence = Number(occurrenceText);
    if (!Number.isInteger(occurrence) || occurrence < 0 || !title) return null;
    return { source: "export", occurrence, title };
  }
  return null;
}

/** The outcome of resolving a persisted rubric-source choice against the
 * CURRENT option list. */
export interface RepoGradeRubricChoice {
  /** Always a value present in the option list this was resolved against,
   * or the `generate` sentinel when the stored choice could not be
   * honoured. */
  value: string;
  source: RepoGradeRubricSource;
  /** Non-null only when a well-formed `live`/`export` choice named a rubric
   * that is no longer in the current option list (AC item 21) - the reason
   * to show the instructor. Null for a fresh course (nothing was ever
   * stored), for the three fixed sentinel sources (they are never "stale" -
   * they do not reference a dynamic list), and for a choice that is still
   * listed.
   */
  degradedReason: string | null;
}

const GENERATED_FALLBACK: Omit<RepoGradeRubricChoice, "degradedReason"> = {
  value: GENERATE_VALUE,
  source: "generate",
};

/**
 * Resolves a persisted rubric-source value against the course's CURRENT
 * option list, degrading to `generate` with a stated reason when the stored
 * choice can no longer be honoured (AC items 21, 46) rather than silently
 * keeping a stale rubric or crashing.
 *
 * Two distinct "falls back to generate" paths, deliberately NOT collapsed
 * into one: an empty/missing/unparseable stored value degrades SILENTLY
 * (`degradedReason: null`) because nothing valid was ever chosen - that is
 * indistinguishable from a fresh course and reporting a "reason" for it
 * would be inventing history. A well-formed `live`/`export` reference that
 * is no longer in `options` (the export was replaced, the Canvas rubric was
 * deleted - RULE 4's own stability note above) degrades WITH a reason,
 * because the instructor DID pick something and that pick silently
 * disappearing is exactly the failure mode AC item 21 exists to prevent.
 *
 * `generate`/`assignment`/`manual` are never checked against `options` at
 * all - they are the three fixed slots `buildRepoGradeRubricOptions` always
 * includes, not list items that can go stale.
 */
export function resolveStoredRepoGradeRubricChoice(
  storedValue: string | null | undefined,
  options: readonly RepoGradeRubricOption[]
): RepoGradeRubricChoice {
  if (!storedValue) return { ...GENERATED_FALLBACK, degradedReason: null };

  const parsed = parseRepoGradeRubricValue(storedValue);
  if (!parsed) return { ...GENERATED_FALLBACK, degradedReason: null };

  if (parsed.source === "generate" || parsed.source === "assignment" || parsed.source === "manual") {
    return { value: storedValue, source: parsed.source, degradedReason: null };
  }

  const stillListed = options.some((option) => option.value === storedValue);
  if (stillListed) {
    return { value: storedValue, source: parsed.source, degradedReason: null };
  }

  const reason =
    parsed.source === "live"
      ? "The Canvas rubric you had chosen is no longer available on this course (it may have been deleted, or your access to it changed) - showing \"Generate from the instructions\" instead."
      : "The export rubric you had chosen is no longer in this course's saved export (the export may have been replaced) - showing \"Generate from the instructions\" instead.";
  return { ...GENERATED_FALLBACK, degradedReason: reason };
}

/** Why a live or export rubric list is short or absent - distinguishes the
 * four causes AC items 22/23/44/52 require rather than leaving the
 * instructor to read one unexplained empty `<optgroup>`. */
export type RepoGradeRubricEmptyReason = "not-connected" | "no-export" | "load-failed" | "empty";

/**
 * Describes why the LIVE rubric list is empty, or `null` when it is not (the
 * caller has nothing to explain and should just render the options).
 *
 * RULE 7 (priority when several causes could apply at once, AC item 24):
 * unavailability (`hasConnection: false`) is checked BEFORE `error` -
 * matching `interpretRubricsResult`'s (useRubrics.ts:39) own "narrow on the
 * success key, never the bare error key" posture, a bug already fixed once
 * on another surface (CourseItemsView.tsx:284-294). A partially-loaded list
 * (`listRubrics` returns `{rubrics, error}` when course-level succeeded and
 * account-level failed, or vice versa - AC item 24) still has `items.length
 * > 0`, so it returns `null` here and the caller renders what DID load; the
 * `error` is a separate concern for the caller's own note channel, not this
 * function's business once there is something to show.
 */
export function describeRepoGradeLiveRubricEmptiness(state: {
  hasConnection: boolean;
  error: string | null;
  items: readonly RepoGradeLiveRubricInput[];
}): { reason: RepoGradeRubricEmptyReason; text: string } | null {
  if (state.items.length > 0) return null;
  if (!state.hasConnection) {
    return {
      reason: "not-connected",
      text: "This course has no live LMS connection, so there are no live Canvas rubrics to offer.",
    };
  }
  if (state.error) {
    return { reason: "load-failed", text: `This course's Canvas rubrics could not be loaded: ${state.error}` };
  }
  return { reason: "empty", text: "This course has no rubrics in Canvas yet." };
}

/**
 * Describes why the EXPORT rubric list is empty, or `null` when it is not.
 * Same priority rule as `describeRepoGradeLiveRubricEmptiness` (RULE 7).
 */
export function describeRepoGradeExportRubricEmptiness(state: {
  hasExport: boolean;
  error: string | null;
  items: readonly RepoGradeExportRubricInput[];
}): { reason: RepoGradeRubricEmptyReason; text: string } | null {
  if (state.items.length > 0) return null;
  if (!state.hasExport) {
    return {
      reason: "no-export",
      text: "This course row has no stored export, so there are no export rubrics to offer.",
    };
  }
  if (state.error) {
    return { reason: "load-failed", text: `This course's export could not be loaded: ${state.error}` };
  }
  return { reason: "empty", text: "This course's stored export has no rubrics in it." };
}

/**
 * A pure, one-line description of which rubric a given COLUMN will actually
 * be graded against - the text `ColumnHeaderControls` (RepoGradesGrid.tsx)
 * renders directly above the irreversible Post button (AC item 44), for
 * EVERY source, since `assignment` is the only source whose effective
 * rubric can differ column to column (every other source is one rubric for
 * the whole page - see the `RepoGradeRubricSource` doc comment above). Reads
 * only its arguments - never fetches, never touches the per-column resolved-
 * rubric cache itself, so rendering it can never trigger a network call.
 *
 * The two `assignment` strings and the `export` suffix are AC item 44's own
 * required wording, verbatim - this is the exact text shown before an
 * irreversible action, so the wording is load-bearing, not decorative.
 */
export function describeRepoGradeColumnRubric(input: {
  source: RepoGradeRubricSource;
  /** The chosen rubric's own TITLE - only read for `live`/`export`. This is
   * deliberately NOT the matching `RepoGradeRubricOption.label`: an export
   * option's `label` already carries the `(from export)` suffix
   * `buildRepoGradeRubricOptions` puts there for the `<select>` (RULE 3b
   * above), and this function appends that same suffix itself for the
   * `export` case below - passing the full option label here would double
   * it to "Title (from export) (from export)". Pass the rubric's title
   * alone (a live option's `label` IS its bare title already, so it is safe
   * to pass unchanged for `live`). */
  chosenLabel: string | null;
  /** Only read for `assignment`: whether this column has a mapped Canvas
   * assignment id (`RepoGradeColumn.assignmentId`). */
  columnHasMappedAssignment: boolean;
}): string {
  switch (input.source) {
    case "generate":
      return "Rubric: generated from the instructions when you grade";
    case "manual":
      return "Rubric: your typed text";
    case "assignment":
      return input.columnHasMappedAssignment
        ? "Rubric: this assignment's own, read when you grade"
        : "Rubric: no assignment mapped - one will be generated";
    case "live":
      return `Rubric: ${input.chosenLabel ?? "the chosen Canvas rubric"}`;
    case "export":
      return `Rubric: ${input.chosenLabel ?? "the chosen export rubric"} (from export)`;
  }
}
