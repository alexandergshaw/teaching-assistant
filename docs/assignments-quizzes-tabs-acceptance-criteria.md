# Assignments and Quizzes tabs, as siblings of Modules

Two new views alongside Modules in the LMS rail: a flat, checkable list of
every assignment in the course, and the same for every quiz. Checking rows
drives the bulk operations that already exist, the same way the Modules view's
item selection does.

## What this is (and what it is not)

A flat table of Canvas objects with checkboxes driving REAL bulk operations -
not a personal "have I done this yet" progress checklist. Every piece of
machinery this needs already exists in that shape (`BulkItem`, `BulkKind`,
`listBulkItemsAction`, `bulkUpdateAction`, `bulkDeleteAction`,
`gateOperation`), and nothing anywhere in this repo persists a per-object
personal tick. If a progress checklist is what was wanted, this is the wrong
document and none of it applies.

## What already exists (reuse survey - vetted, do not rebuild)

| Need | Existing code | Where |
| --- | --- | --- |
| **Listing all assignments AND all quizzes** | `listBulkItemsAction(courseUrl, kind, acronym)` -> `BulkItem[]` of `{id, title, published, dueAt, pointsPossible}`, fully paginated via the RFC-5988 Link header | `src/app/actions/canvas-files-bulk.ts:165-176`, `src/lib/canvas-modules/bulk.ts:8-63` |
| The kind vocabulary | `BulkKind = "Assignment" \| "Quiz" \| "Discussion" \| "Page"` | `src/lib/canvas-modules/types.ts:153` |
| **The whole view template** - flat rows, checkboxes, select-all, search, bulk bar, own load/error/empty state, own reload | `FilesView` | `src/app/components/content-tab/FilesView.tsx` |
| Flat-list selection (NOT the module tree's) | `useKbSelection`'s shape: a flat `Set<string>` with `toggle`/`selectAllVisible`/`clear` and a pure prune-against-current-list | `src/app/components/knowledge/useKbSelection.ts` |
| Bulk bar CSS | `styles.bulkBar` / `.bulkBarHead` / `.bulkCount` / `.bulkRow` / `.bulkLabel` / `.bulkField` | `src/app/page.module.css:4805-4857` |
| Due dates (content-id keyed, no module needed) | `setModuleDueDatesAction(courseUrl, [{type, contentId, dueAt}], acronym)` | `src/lib/canvas-modules/due-dates.ts:6-47` |
| Points and submission type | `bulkUpdateAction(courseUrl, kind, ids, fields, acronym)` | `src/lib/canvas-modules/bulk.ts:98-125` |
| Rubrics | `bulkAssociateRubricAction(courseUrl, rubricId, assignmentIds, acronym)` | existing |
| Description | `updateGradableAction(courseUrl, kind, contentId, fields, acronym)` | existing |
| Delete | `bulkDeleteAction(courseUrl, kind, ids, acronym)` | existing |
| Source gating | `gateOperation(ctx, subject)` | `src/app/components/content-tab/contentSourceGating.ts` |

**Six of the eight bulk operation families are already content-id keyed and
work with no module context at all**: due dates, points, rubrics, submission
type, description, delete. Publish/unpublish is module-item-keyed in today's
UI wiring, but `bulkUpdateRequest` already supports `assignment[published]` /
`quiz[published]` directly (`bulk.ts:67-95`) - that path exists and has simply
never been called. Move and remove-from-module are excluded: they have no
meaning for a module-independent list.

## Decisions

**D1. New Quizzes are detected and routed (instructor's call).** Canvas has
two quiz systems. Classic Quizzes come from `/courses/:id/quizzes`. New
Quizzes are LTI-backed and appear ONLY in `/courses/:id/assignments`. This
codebase currently has zero notion of the distinction - no match anywhere in
`src/` for `quiz_lti`, `is_quiz_assignment` or `new_quizzes`, and the bulk
assignment fetch does not even request `submission_types`
(`RawBulkAssignment`, `src/lib/canvas-modules/raw-types.ts:92-98`).

Therefore: the assignment fetch is widened to carry the field that identifies
an LTI-backed quiz, a New Quiz is shown in the **Quizzes** tab (labelled as a
New Quiz, since the operations available to it differ), and it is **excluded
from the Assignments tab**. Without this, a New Quiz would be missing from
Quizzes entirely and would sit in Assignments offering operations that do not
apply to it.

**D2. Two views, one shared implementation.** Both tabs are the same flat
checkable list over `BulkItem[]`, differing only in kind, in which bulk
operations are offered, and in the New Quiz handling. One parameterized
view, two thin call sites - not two copies, and not one view with a pile of
`if (kind === ...)` branches in its render.

**D3. Selection is independent of the Modules view.** An assignment that also
appears in a module is a different row in a different list; ticking it here
does not tick it there. `useModuleSelection` is deliberately NOT reused: its
keys are `"live:<moduleId>:<itemId>"` and its pruning walks a `CanvasModule[]`
tree, so a flat list would have to fabricate module ids - which `utils.ts:128-133`
explicitly warns against, because a synthetic id can collide with a real one.

**D4. Export-sourced courses are gated off, whole-view.** A stored course
export contains a module tree and announcements - it has no assignments or
quizzes list at all. The honest behaviour is `FilesView`'s: gate the view with
a stated reason, never an empty table that implies the course has none.

**D5. Move and remove-from-module are not offered** (see the reuse table).

## Fixed contracts (three file sets are built concurrently against these)

### Contract 1 - the data layer (set A)

`BulkItem` (`src/lib/canvas-modules/types.ts`) gains one optional field, so
every existing consumer is unaffected:

```ts
export interface BulkItem {
  id: string;
  title: string;
  published: boolean;
  dueAt: string | null;
  pointsPossible: number | null;
  /** True when this assignment row is an LTI-backed New Quiz (D1). Absent
   *  for every other kind and for Classic Quizzes. */
  isNewQuiz?: boolean;
}
```

New pure classifier, its own leaf so the rule is unit-testable without a
Canvas call:

```ts
// src/lib/canvas-modules/new-quiz.ts (NEW)
/** Structural subset of a raw Canvas assignment this rule reads. */
export interface NewQuizSignals {
  submissionTypes?: readonly string[];
  isQuizAssignment?: boolean;
  quizId?: number | null;
}

/** Whether a raw assignment row is a New Quiz. CONSERVATIVE: returns false
 *  whenever the signals are absent or ambiguous - mislabelling an ordinary
 *  assignment as a quiz is worse than leaving a New Quiz unlabelled. */
export function isNewQuizAssignment(signals: NewQuizSignals): boolean;
```

`listBulkItemsAction(courseUrl, kind, acronym)` keeps its signature. For
`kind === "Assignment"` it now requests the fields the rule needs and
EXCLUDES rows the rule identifies as New Quizzes (C3); for `kind === "Quiz"`
it returns Classic quizzes AND the excluded New Quizzes, each flagged
`isNewQuiz: true` (C2).

### Contract 2 - the view (set C)

```ts
// src/app/components/content-tab/CourseItemsView.tsx (NEW)
export interface CourseItemsViewProps {
  courseUrl: string;
  acronym?: string;
  /** Which kind this instance lists. */
  kind: "Assignment" | "Quiz";
  sourceContext: ContentSourceContext;
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void;
}
export function CourseItemsView(props: CourseItemsViewProps): JSX.Element;
```

One parameterized view, two call sites (D2). It fetches its own data and owns
its own loading/error/empty state, exactly as `FilesView` does.

```ts
// src/app/components/content-tab/useFlatItemSelection.ts (NEW)
export interface UseFlatItemSelectionReturn {
  selected: Set<string>;
  toggle: (id: string) => void;
  selectAllVisible: (visibleIds: readonly string[]) => void;
  clear: () => void;
  allVisibleSelected: (visibleIds: readonly string[]) => boolean;
}
/** Flat-list selection, modelled on useKbSelection - NOT useModuleSelection,
 *  whose keys require a moduleId a flat list does not have (D3). Prunes
 *  itself against the current list so a vanished row cannot linger. */
export function useFlatItemSelection(currentIds: readonly string[]): UseFlatItemSelectionReturn;
```

### Contract 3 - registration (set B)

Set B owns every registration point AND the `ContentTab` render branch that
mounts `<CourseItemsView>`. It codes against Contract 2's props exactly. The
two new `ContentView` ids are `"assignments"` and `"quizzes"`, and their
destination ids are `"lms-assignments"` / `"lms-quizzes"` so they match the
existing `` `lms-${contentView}` `` derivation.

## Acceptance criteria

### A. The views

**A1.** Two new content views exist, reachable from the LMS rail as siblings
of Modules, labelled `Assignments` and `Quizzes`.

**A2.** Each lists EVERY object of its kind in the course, paginated
completely - a course with more than one page of assignments shows all of
them. Loading, error and empty states reuse the shared classes every sibling
view already uses.

**A3.** Each row shows at least: title, published state, due date and points,
and a checkbox. Rows are searchable by title with the same substring filter
the sibling views use.

**A4.** Select-all applies to the CURRENTLY VISIBLE (filtered) rows, and
toggling it leaves any hidden selection untouched - the rule the Modules view
already follows.

**A5.** The selection prunes itself against the current list: a row that no
longer exists after a reload drops out of the selection rather than lingering
as a phantom id.

**A6.** The bulk bar appears only once something is selected, states the count
and offers Clear - the established shell.

### B. Bulk operations

**B1.** The offered operations are: publish/unpublish, due dates, points,
rubrics (assignments only), submission type (assignments only), description,
and delete. Each reuses the existing action named in the reuse table - no new
Canvas API code.

**B2.** Publish/unpublish goes through `bulkUpdateAction`'s existing
`assignment[published]` / `quiz[published]` support, NOT through the
module-item API. This path exists but has never been exercised by the UI, so
it gets a test that proves the request shape.

**B3.** Operations that do not apply to a kind are not offered for it
(rubrics and submission type are assignment-only), and are not merely
disabled without explanation.

**B4.** Delete is confirmed before it runs, using the existing two-click
arming idiom (`confirmArming.ts`), with the button itself changing to show the
armed state - not only a note.

**B5.** Per-item failure is isolated and reported: one failing row does not
abort the rest, and the summary names what succeeded and what did not.

**B6.** After any operation that changed Canvas, the list reloads so it shows
the new state.

### C. New Quizzes (D1)

**C1.** The assignment fetch carries the field that identifies an LTI-backed
quiz. Confirm the actual field against the Canvas API before relying on it -
`submission_types` containing `external_tool` is necessary but not sufficient
on its own to call something a New Quiz, so the criteria are stated in the
implementation and justified there.

**C2.** A New Quiz appears in the Quizzes tab, visibly labelled as a New Quiz.

**C3.** A New Quiz does NOT appear in the Assignments tab.

**C4.** Operations that cannot apply to a New Quiz are not offered for it.

**C5.** The Classic and New lists cannot double-count: they come from
different endpoints, and a test pins that an item appears in exactly one tab.

### D. Registration (the ship-dead risks)

Every one of these must be updated, and the ones without a compile-time or
test-time guard are called out because missing them fails SILENTLY:

**D1r.** `ContentView` gains both ids (`content-tab/constants.ts:3`).

**D2r.** `LMS_VIEW_PRESENCE` (`manual-rail.ts:18-25`) - TypeScript fails the
build if missed. Good.

**D3r.** The `destinations` LMS group (`manual-rail.ts:41-48`) -
`validateLmsViewsCompleteness` fails the suite if missed. Good.

**D4r.** `ContentTab`'s `courseTab` boolean (`ContentTab.tsx:667`) - a
HARDCODED view list. A view omitted here silently loses the shared course
picker, reload control and loading states. No guard exists.

**D5r.** `ContentTab`'s render branch (`ContentTab.tsx:827-903`).

**D6r. THE SHARPEST ONE.** `useAppNavigation.ts:138` restores the last-used
view from localStorage through a HARDCODED string-literal list that is NOT
derived from `LMS_VIEWS` and does NOT call `normalizeContentView` (the URL
branch two lines above it does). A view missing from this list means a user
whose last tab was Assignments silently lands on Modules on their next visit -
no error, no warning. This exact bug class has already happened once in this
file's history. Add the ids AND add a test that derives the accepted set from
`LMS_VIEWS` so it cannot recur.

**D7r.** `contentSourceGating`'s `GatedSubject` gains what these views need
(or reuses `"items"`), so D4's whole-view gate has a real reason string.

### E. Tests

**E1.** Pagination is proven: a mocked multi-page Link-header response yields
every item, not just the first page.

**E2.** D6r's restore guard is tested against `LMS_VIEWS` so a future view
cannot be silently dropped from it.

**E3.** The New Quiz routing is tested in all three directions: it appears in
Quizzes, it does not appear in Assignments, and it is labelled.

**E4.** `bulkUpdateAction`'s never-before-used published path is tested for
its request shape (B2).

**E5.** Selection pruning is tested against a list that shrank.

**E6.** Tests pin facts and ordering, never prose spelling, and every new test
is verified able to fail.

## Open question deferred to implementation

The exact Canvas field combination that identifies a New Quiz must be
confirmed against the live API shape rather than assumed from
`submission_types` alone. If it cannot be established confidently, the
implementation must say so and fall back to labelling nothing rather than
mislabelling assignments - a wrong label is worse than no label.

## Sequencing

Chunk 5. Starts after the visualizer chunk and the Learning Resources
real-links revision are pushed. No file overlap with either.
