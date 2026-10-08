# Scope: a search bar that filters the chat grading table

Owner request (direct chat, 2026-10-07, verbatim): "the grading table that gets
generated on the chat grading page needs to be filterable via search bar".

HEAD at authoring: `c4137a72`. This is a SCOPE + WAVE PLAN. No production code is
written here. Every quantity names the command that produced it.

---

## 0. The surface, measured

The chat grading page is `GradingChatPanel.tsx`
(`src/app/components/grading-chat/GradingChatPanel.tsx`, 360 lines by
`@(Get-Content src/app/components/grading-chat/GradingChatPanel.tsx).Count`). It
mounts `GradingResults` at `:320-329` to render the growing matrix of graded
rows (`driver.run`), gated on `hasRows` (`:235`, `driver.run.results.length > 0`).

`GradingResults` lives at `src/app/components/GradingResults.tsx` (918 lines by
`@(Get-Content src/app/components/GradingResults.tsx).Count` - this matches the
brief's 918). It is `forwardRef` (`:191`), renders the results `<table>` at
`:626`, maps rows in the `<tbody>` at `:636`.

### A measured correction to the brief: GradingResults has FOUR mounts, not seven

The brief states GradingResults is mounted by seven components. Measured against
the tree, `<GradingResults` (the JSX mount) appears in exactly **four** files:

```
# grep -n "<GradingResults" src/app/**/*.tsx
GithubGradingPanel.tsx:852
GradingTab.tsx:570
grading-chat/GradingChatPanel.tsx:320   <- the target (chat)
LiveFeedPanel.tsx:433
```

The brief's other four named files do NOT mount the component:

- `DraftedGradesTab.tsx` - the only hit is a comment at `:45` ("helpers Repo
  Grades and GradingResults.tsx use").
- `course-intel/CourseIntelHistory.tsx` - comment only, `:137`.
- `grading-recording/GradingRecordingPanel.tsx` - comments only (`:150`,
  `:846`, `:849`); it mounts `ClassTrendsPanel`, not `GradingResults`.
- `repo-grades/RepoGradesGrid.tsx` - comment only, `:199`.

(Commands: the `<GradingResults` grep above, plus `grep -n GradingResults` on
each of the four files; all opened.)

**Consequence for this scope:** the "stays byte-identical" obligation covers
**three** non-chat mounts - `GradingTab.tsx:570`, `GithubGradingPanel.tsx:852`,
`LiveFeedPanel.tsx:433` - not six. Everything below is written to that measured
number. If a later reader finds a fifth mount, the opt-in default (section 2)
still protects it, but the disposition list must be re-counted.

### The seam that makes this feature cheap

`GradingResults` already separates DISPLAY from SEMANTICS, and the search rides
entirely on the display half:

| What | Reads from | Line |
|---|---|---|
| the `<tbody>` rows (DISPLAY) | `sortedResults` | `:636` (mapped), `:517` (`useResultsSort(run)`) |
| bulk/post count + payload | `run.results` directly (`gradableResults`) | `:312-318`, `:336-346` |
| CSV export | `buildCsvContent(run, edits)` | `:538` |
| class-trends panel | `toClassTrendsEntry(run, ...)` | `:615` |
| "latest result" card (chat) | `selectLatestResult(driver.run)` | `GradingChatPanel.tsx:337` |
| code-output modal lookup | `run.results.find(...)` | `:850` |

`sortedResults` comes from `useResultsSort(run)` (`src/app/components/grading-results/useResultsSort.ts:41`,
`sortGradeRows(run.results, sortState)`). It is the ONLY thing the table body
maps, and NOTHING that computes scores, postable sets, CSV, or trends reads it.
So filtering the displayed rows is isolated from every number by construction -
this is the whole reason option (a) below is clean and option (b) is not.

---

## 1. Chosen opt-in mechanism: (a), an opt-in prop on GradingResults

**Decision: option (a).** Add one optional, default-off prop to `GradingResults`
that, when set, renders a search bar above the table and filters only the
DISPLAYED rows. Default (prop absent) -> every existing mount renders
byte-identical to today.

Concretely:

- New prop `searchable?: boolean` on `GradingResultsProps` (optional;
  `filterPlaceholder?: string` optional, for the input label - recommended
  default placeholder baked in, see section 4).
- An unconditional `const [filterQuery, setFilterQuery] = useState("")` (a
  conditional hook is illegal; the state is declared for every mount but is `""`
  and unused when `!searchable`).
- `const visibleResults = searchable ? filterGradeRowsForTable(sortedResults, filterQuery) : sortedResults;`
- The `<tbody>` maps `visibleResults` instead of `sortedResults` (`:636`).
- The search bar JSX and the filtered-empty `<tr>` are each gated on
  `searchable`.

### Why the three non-chat mounts stay byte-identical - the mechanism, not the assertion

1. **Their mount sites do not change.** `GradingTab.tsx:570`,
   `GithubGradingPanel.tsx:852`, `LiveFeedPanel.tsx:433` are not edited; they do
   not pass `searchable`, so `searchable` is `undefined` (falsy) at those mounts.
2. **With `searchable` falsy, `visibleResults === sortedResults` by reference.**
   The ternary takes the `: sortedResults` branch - the identical array object
   the `<tbody>` maps today. Same rows, same order, same React keys
   (`${result.student}-matrix`, `:647`).
3. **The two new JSX regions are gated.** The search bar and the filtered-empty
   row both sit behind `searchable &&`, so they emit nothing for a falsy prop.
4. **The added `useState` changes no output.** It holds `""` and is read only
   inside the `searchable` branch. React tolerates one more hook on the instance;
   the rendered DOM is unchanged.

So the non-chat mounts are byte-identical in BEHAVIOUR and in RENDERED OUTPUT.
This is machine-checkable as a source pin (section 7): the mount sites in those
three files contain no `searchable` token, and the filter application is a
reference passthrough when the prop is off.

### Why NOT (b) - filter the run upstream in the panel

Rejected. A `GradingRun` carries `results` AND the ordering AND the postable
math downstream reads off it. If `GradingChatPanel` passed a filtered `run` to
`GradingResults`, every consumer in the seam table above would desync at once:

- `gradableResults`/`postableResults` (`:312-346`) would count and post only the
  filtered subset - a search that happens to be typed would silently change what
  "Post N grade(s)" posts.
- `buildCsvContent(run, edits)` (`:538`) would export only the filtered subset.
- `toClassTrendsEntry(run, ...)` (`:615`) would compute class trends over the
  filtered subset - trends must be whole-class, so this is a correctness defect,
  not a nicety.
- `RubricProvenance`/`GeneratedRubricCard` (`GradingChatPanel.tsx:318-319`) and
  `selectLatestResult(driver.run)` (`:337`) read `driver.run` separately - a
  filtered run passed only to `GradingResults` would make these DISAGREE with the
  table, and a filtered run passed to all of them would corrupt "latest result".

The brief already flags this; the measured seam confirms it. Lean against (b)
stands: it desyncs the postable/gradable/score/trends derivations.

### Why NOT (c) - a wrapper component for the chat mount

Rejected as non-viable, not merely inferior. The search must filter the rows
that `GradingResults` renders in its OWN `<tbody>`. A wrapper around
`GradingResults` cannot reach into that `<tbody>`; its only lever is the `run`
prop it passes down - which is option (b) and its desync - or it duplicates the
entire results table, which abandons the shared component. (c) therefore
collapses into (a) or (b). (a) wins.

---

## 2. The pure filter predicate and the match fields

### DELIBERATE DUPLICATION, not a cross-directory import (orchestrator ruling A)

The repo has the exact operation generic and unit-tested already -
`filterRowsByQuery<T>(rows, query, haystack)` at
`src/app/components/recording/discussion-table-view.ts:141-148` - and the
recording grading table reuses it cross-folder
(`grading-recording/grading-rows.ts:90-91`, importing from
`../recording/discussion-table-view`). It is tempting to do the same here. It is
also WRONG for this file, and the reason is the grading-results client-bundle
closure:

- `discussion-table-view.ts` is NOT a free-standing leaf. It imports
  `./discussion-capture` and `@/lib/person-name` at `:28-29` (opened). So a
  `gradeRowFilter.ts` that imported `filterRowsByQuery` from it would pull
  `discussion-capture` + `person-name` into the grading-results runtime-import
  closure.
- That closure is WALKED by a guard - `walkRuntimeGraph(roots, OPTIONS)` over
  `directoryRoots(grading-results/)` in
  `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:146-156`
  (opened). `gradeRowFilter.ts` is a new file in that directory, so it becomes a
  walked root automatically. A cross-directory import would EXTEND that closure
  into `recording/` leaves that have never been proven client-safe under this
  directory's policy - an unverified, unnecessary bundle-edge risk.

**Ruling: duplicate a trivial generic rather than extend the closure.**
`gradeRowFilter.ts` carries its OWN ~8-line substring-filter predicate and its
OWN local `normalizeForMatch`-equivalent, importing NOTHING across directories -
only the `GradeRow` TYPE (a type-only import, which `scanRuntimeEdges` erases to
zero runtime edges; proven by the type-only canary at
`gradingResultsHelpersWiring.test.ts:230`). This guarantees no closure extension
into `recording/`, removes the `walkRuntimeGraph` risk entirely, and keeps the
new file's imports to only what grading-results already allows. The duplicated
predicate is ~8 lines of pure generic code over a cross-directory client-closure
extension - the cheap side of that trade, and the house "refactors disarm tests"
lesson is about the OPPOSITE move (sharing across tables that do not exist yet).

### The new leaf (REQUIRED, testable)

New file `src/app/components/grading-results/gradeRowFilter.ts` - zero
cross-directory imports, one type-only import:

```
import type { GradeRow } from "./gradingResultsHelpers";

// Local substring-filter predicate. DELIBERATELY not imported from
// recording/discussion-table-view - see "DELIBERATE DUPLICATION" above. The
// normalize mirrors recording's normalizeForMatch (discussion-capture.ts:
// 237-244) so match semantics are identical: lowercase, drop apostrophes,
// fold every other non-alphanumeric to a space, collapse runs, trim.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The match-field haystack, built locally (mirrors GRADING_ROW_HAYSTACK's
// per-row-type shape so the oracle is a frozen tuple pin).
export const GRADE_ROW_HAYSTACK = (row: GradeRow): string[] => [
  row.student,
  row.totalScore,
  row.overallComment,
  row.strengths,
  row.improvements,
  row.resubmitNotice,
];

export function filterGradeRowsForTable(
  rows: ReadonlyArray<GradeRow>,
  query: string,
): GradeRow[] {
  const normalizedQuery = normalizeForMatch(query);
  // Empty/whitespace query returns the input array BY REFERENCE - not a copy -
  // so a downstream memo sees the identical array when nothing is filtered.
  if (!normalizedQuery) {
    return rows as GradeRow[];
  }
  return rows.filter((row) =>
    GRADE_ROW_HAYSTACK(row).some((field) => normalizeForMatch(field).includes(normalizedQuery)),
  );
}
```

The local `normalizeForMatch` is a deliberate ~6-line duplicate of
`discussion-capture.ts:237-244` (opened and transcribed), chosen for the same
reason as the predicate: importing it from `discussion-capture` would re-open
the exact cross-directory closure extension this ruling closes. The
empty-returns-by-reference contract is the same one `filterRowsByQuery:143-145`
guarantees, restated locally.

`GradeRow` is `GradingRun["results"][number]`
(`gradingResultsHelpers.ts:55-56`); its fields are from `GradeResult`
(`src/lib/grade/types.ts`): `student:218`, `overallComment:223`,
`strengths:230`, `improvements:236`, `resubmitNotice:241`, `totalScore:243`.
All opened and confirmed. The `’` escape is written as the literal curly
apostrophe in source (the Write tool materialises `\uXXXX` escapes to the
literal character - MEMORY), matching `discussion-capture.ts:240`.

### Match fields - RECOMMENDED reading

**Recommended: student name + the three feedback fields + overallComment +
totalScore, matched case-insensitively (and punctuation-insensitively, via the
reused `normalizeForMatch`), against the GradeRow RESULT values.** This covers
the owner's literal ask (find a student by name) and the useful adjacent
searches (find everyone whose feedback mentions "late", everyone who scored
"10"). It mirrors `GRADING_ROW_HAYSTACK`'s shape (a per-row-type accessor) so
the oracle is a frozen tuple pin.

### Fork F1 (match the RESULT text vs the EDITED text) - recommended reading stated

The displayed feedback/score is the instructor's `edit` (`edits[student] ??
defaultRowEdit(result)`, `:638`), not the result's own fields. The haystack
above matches the RESULT fields, so if an instructor EDITS a row's feedback and
then searches for the new text, it will not match.

- **Recommended reading:** match the RESULT fields (haystack above), keep the
  predicate pure over `GradeRow`, and record the edited-text gap as an owner-walk
  residual (R2). Rationale: (1) the owner's stated need is student-name search,
  and the student name is never edited; (2) the recording precedent
  (`GRADING_ROW_HAYSTACK`, `grading-row.ts`) deliberately matches identity +
  submission text, NOT the editable feedback, for the same reason; (3) a pure
  `GradeRow -> string[]` accessor is a frozen-tuple oracle, whereas threading the
  live `edits` map into the predicate makes it impure and couples filtering to
  edit state.
- **The other way:** pass `edits` into the predicate so the match tracks what is
  on screen. Costs purity and a harder oracle; buys match-on-edited-feedback.
  Only worth it if the owner reports the gap matters.

This fork does not block the build: the recommended reading is the one the wave
plan builds, with R2 filed.

---

## 3. Filtered-empty vs table-empty

`GradingResults` is only ever mounted when `results.length > 0` (its own prop
doc, `:111`, "callers gate on results.length"; the chat caller gates on `hasRows`
at `GradingChatPanel.tsx:316`). So a true "table-empty" state inside
`GradingResults` does not exist and is not in scope.

The NEW state is **filtered-but-underlying-nonempty**: `searchable` on,
`filterQuery` non-empty, `visibleResults.length === 0`, `sortedResults.length >
0`. Render a single `<tr>` spanning the table's columns with a distinct message
and a Clear control, mirroring the two precedents:

- `grading-recording/GradingTable.tsx:297-305` - `No submissions match
  "{filterText}"` in a `colSpan` cell with a Clear button.
- `recording/DiscussionReplyTable.tsx` - the same filtered-empty-distinct-from-
  table-empty idiom (the file that originated it).

Recommended copy: `No rows match "{query}".` plus a `Clear` button that calls
`setFilterQuery("")`. The colspan is the live column count:
`2 + run.rubricAreaNames.length + 2` (student, files, N rubric areas, total,
feedback) - compute it from `run.rubricAreaNames.length`, do not hardcode, since
rubric area count varies per run (see the header row, `:628-632`, and the body
cells `:762`). Also show a "Showing N of M" hint when a filter is active, as
`GradingTable.tsx:224-231` does, reading `visibleResults.length` and
`sortedResults.length`.

---

## 4. Where the search renders, and the ceiling / extraction math

### Placement

The search bar renders INSIDE `GradingResults`, immediately above the
`<div className={styles.matrixWrap}>` table wrapper (`:625`), gated on
`searchable`. Because `GradingResults` is mounted within the chat page, this
satisfies "above the table, within the chat page" while keeping the chat mount a
one-token addition (`searchable`) and keeping the filter state co-located with
the rows it filters.

Fork F2 (place the bar / own the state in the PANEL instead): lift `filterQuery`
to `GradingChatPanel` and pass `searchQuery`/`onSearchChange` down. Recommended
reading: NO - keep it self-contained in `GradingResults`. Lifting spreads the
feature across two files and adds two props for no benefit; the self-contained
form makes the three non-chat mounts provably unaffected by one gated branch.

### Control styling - reuse, no new CSS class

Reuse the recording precedent's exact control shape
(`GradingTable.tsx:200-221`): a MUI `TextField type="search" size="small"` inside
a `styles.adaptRow`, with a trailing `IconButton` "Clear search" adornment using
the shared `CloseIcon` (`recording/discussion-icons`) and the `controls.fieldMd`
width class (`recording/RecordingControls.module.css`). No new `*.module.css`
rule is introduced, so the CSS-orphan ratchet (scans all `*.module.css`, exact
`toBe(118)`) is untouched. The "Showing N of M" hint reuses `styles.fieldHint`
and `styles.linkButton`, as `GradingTable.tsx:224-231` does.

Note: `GradingResults.tsx` and `grading-chat/` are OUTSIDE the button-variant
scan (`SECTION_4_DIRS`, `ui/buttonVariant.test.ts:105-114` - it covers
`recording`, `grading-recording`, `module-deck-capture`, `caption-studio`,
`slide-studio`, `ui`, `message-replies`, plus `RecordingTab.tsx`). So no
FROZEN_PRIMARY_SITES entry is affected. Independent of that, the UI standard
holds: the search bar uses a `TextField` + an `IconButton`/text Clear, never a
`variant="contained"` primary.

### CORRECTION: a directory-enumeration canary DOES exist over grading-results/ (orchestrator ruling B)

An earlier reading of this scope treated the grading-chat `ta-` key canary
(section 5) as the only directory-enumeration canary in play. That is wrong, and
the correction is load-bearing because the one NEW production file
(`gradeRowFilter.ts`) lands in `grading-results/`, NOT `grading-chat/`:

`src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` is a
frozen-roots / directory-enumeration canary over `grading-results/` (opened). It:

- maintains a hand-written `CLIENT_FILES` literal (`:103-126`);
- asserts the directory's own `readdirSync` of non-test `.ts/.tsx` files EQUALS
  the `./` half of that literal (`:235-244`, the completeness sweep that
  `FilesCell.tsx`/`ungradedDisclosure.ts` once slipped past);
- asserts `directoryRoots(GRADING_RESULTS_DIR)` EQUALS the same `./` half
  (`:128-134`);
- walks `walkRuntimeGraph(roots, OPTIONS)` over those roots (`:146-156`).

So adding `gradeRowFilter.ts` to `grading-results/` turns BOTH enumeration
assertions red UNLESS `./gradeRowFilter.ts` is added to the `CLIENT_FILES`
literal (`:103-126`) IN THE SAME COMMIT. This is handled: the file is added to
`CLIENT_FILES` and `gradingResultsHelpersWiring.test.ts` joins the Wave 1 write
set (section 8). The new `gradeRowFilter.test.ts` is a `.test.ts` and is excluded
from both enumerations (the `!n.endsWith(".test.ts")` filter at `:239`, `:255`),
so it needs no `CLIENT_FILES` entry.

**The `walkRuntimeGraph` closure stays trivially clean.** Per ruling A,
`gradeRowFilter.ts` imports NOTHING across directories - only the `GradeRow`
TYPE from `./gradingResultsHelpers` (a type-only import, which `scanRuntimeEdges`
erases to zero runtime edges - canary at `:230`, `import type` -> `edges === []`).
As a walked root it therefore contributes no runtime edge, no new reachable
module, and no `use server` directive (the `Fix 4` root check at `:207-217`
stays green). The grading-results client-bundle closure is unchanged by this
feature - `gradeRowFilter.ts` is a pure client-safe leaf whose only dependency is
a type. (Contrast the rejected import of `filterRowsByQuery`, which WOULD have
extended the closure into `recording/discussion-table-view` ->
`discussion-capture` + `person-name`; section 2 states why that is rejected.)

### Ceiling math (option a, inline)

`GradingResults.tsx` is **918** lines (`@(Get-Content).Count`). The global
ceiling is `LIMIT = 1000` (`src/file-size-ceiling.structure.test.ts:41`), scanned
repo-wide. `GradingResults.tsx` is NOT in `ALLOWED_OVERAGE`
(`:75-...` - checked; entries are test files >1000 and a pinned `GradingTab.tsx`,
not this file), so it is bound only by the global 1000 and may grow up to it.

Estimated additions for option (a), inline:

| Addition | ~lines |
|---|---|
| `searchable?`/`filterPlaceholder?` props + doc | 7 |
| destructure the two props | 2 |
| `import { filterGradeRowsForTable }` | 1 |
| `useState("")` for `filterQuery` | 1 |
| `visibleResults` ternary | 1 |
| search-bar JSX (TextField + Clear adornment, gated) | ~16 |
| "Showing N of M" hint (gated) | ~6 |
| filtered-empty `<tr>` (gated) | ~8 |
| change `sortedResults` -> `visibleResults` in the map | 0 net |

Total ~42 lines. **918 + ~42 = ~960**, under 1000 with ~40 lines of headroom.

**Decision: inline, NO extraction of the search bar.** The addition fits, and
the search bar is pure presentation with no testable logic (nothing renders
under vitest), so a `.tsx` leaf would buy only line budget while adding a file
and a bundle edge. The pure PREDICATE already lives in its own leaf
(`gradeRowFilter.ts`, section 2) because that is the part with testable logic.

**Hard guard for the implementer (not optional):** after the edit, measure
`@(Get-Content src/app/components/GradingResults.tsx).Count`. If it exceeds
**980**, extract the search-bar JSX into a presentational leaf
`src/app/components/grading-results/GradeResultsSearchBar.tsx` IN THE SAME WAVE
(the filtered-empty `<tr>` stays inline - it is colspan/table-coupled). This
keeps the file off the wall even if the real addition runs larger than the
estimate. Either way, the wave gate runs `file-size-ceiling.structure.test.ts`.

---

## 5. Persist the filter text? NO.

**Decision: do not persist. Transient view state.**

- The chat session itself is explicitly NOT saved: `CHAT_SESSION_NOT_SAVED_DISCLOSURE`
  (`GradingChatPanel.tsx:49-50`) and RES-GC-11 - "a reload, tab close, or crash
  loses every accumulated row". Restoring a filter across a reload that has just
  destroyed every row it filtered is meaningless and actively misleading.
- A `ta-` key would trip the grading-chat key canary
  (`grading-chat/grading-chat-storage-keys.structure.test.ts`, exact-set
  `readdirSync` over the directory, pinned set at `:14-18`). Not persisting adds
  no key and leaves that canary untouched. (Moot if the state lives in
  `GradingResults.tsx`, outside that directory - but recorded so the decision is
  explicit either way.)

This is the one place in tension with the standing "persist-UI-control-state"
rule (every new textbox persists). The rule is about control values that are
user PREFERENCES; a search filter is transient navigation over a session that is
itself non-durable. Recommended reading: NO-persist, for the two reasons above.
If the owner wants it sticky, it becomes a `ta-grading-chat-*` key and the
canary's set + N bump in the same commit (fork F3, recommended reading = NO).

---

## 6. Machine-checkable vs owner-walk split

Nothing renders under vitest, so the FELT filtering (typing narrows the visible
rows on screen) is an OWNER WALK. These are machine-checkable:

**Pure predicate oracle** (`gradeRowFilter.test.ts`, the test seat owns the
exact construction):
- `GRADE_ROW_HAYSTACK` returns the exact frozen tuple
  `[student, totalScore, overallComment, strengths, improvements, resubmitNotice]`
  in that order (an exact `toEqual` tuple pin, mirroring
  `grading-rows.test.ts`'s pin on `GRADING_ROW_HAYSTACK`).
- `filterGradeRowsForTable` matches case-insensitively and
  punctuation-insensitively on each field; a query matching only `student`
  returns that row; a query matching only `strengths` returns that row; a query
  matching nothing returns `[]`; an empty/whitespace query returns the input
  array BY REFERENCE (the local predicate's own empty-query branch, mirroring
  the `filterRowsByQuery:143-145` contract - assert `result === rows`).
- The axes (which fields match) must come from a DIFFERENT source than the
  haystack definition, per the test-seat rule, so the "field X matches" cases
  are enumerated independently of the tuple pin. The case/punctuation-insensitive
  cases pin the local `normalizeForMatch` behaviour from independently chosen
  inputs, not from the function's own source spelling.

**Opt-in wiring pins** (source-text, in a structure/wiring test):
- In `GradingResults.tsx`: the `<tbody>` maps `visibleResults`; `visibleResults`
  is `searchable ? filterGradeRowsForTable(...) : sortedResults`; the search bar
  JSX and filtered-empty row are each under a `searchable` guard.
- In `GradingChatPanel.tsx`: the `<GradingResults` mount carries `searchable`
  (truthy).

**Non-chat-mount-unchanged pins** (source-text):
- `GradingTab.tsx`, `GithubGradingPanel.tsx`, `LiveFeedPanel.tsx`: the
  `<GradingResults ...>` mount slice contains NO `searchable` token. (A
  `.not.toContain("searchable")` over each mount slice, extracted the way
  `GradingChatPanel.structure.test.ts`'s `resultsMountSlice` does.)

**Owner walk (record as residuals, no buildable test here):**
- Typing in the box narrows the on-screen rows; clearing restores them.
- The filtered-empty message appears when a non-empty query matches nothing and
  disappears on Clear.
- Posting / CSV / trends are unaffected while a filter is active (the seam makes
  this true by construction; the VISIBLE proof is an owner walk).

---

## 7. `owns` file list

Derived with:

```
# edited + new (the write set):
src/app/components/GradingResults.tsx
src/app/components/grading-chat/GradingChatPanel.tsx
src/app/components/grading-results/gradeRowFilter.ts                (NEW)
src/app/components/grading-results/gradeRowFilter.test.ts           (NEW)
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts  (EDITED: add ./gradeRowFilter.ts to CLIENT_FILES)

# files that READ the edited files AS SOURCE TEXT (a change can turn them red):
# command: grep -rln "GradingResults\|searchable\|gradeRowFilter\|filterGradeRowsForTable" \
#          src --include=*.test.ts
```

Source-text tests that read the edited files and MUST be run in the wave gate
and the verify (a string one of them owns but does not expect can go red):

- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` - reads
  `GradingChatPanel.tsx`; its mount-slice assertions use `toContain`/`toMatch`
  (additive `searchable` is safe) and `:142-143` is anchored to `canvasUrl =`
  (a `searchable`/`filterPlaceholder` prop will not match it). Must stay green.
- `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts`
  - exact `ta-` key set over the directory; stays green iff no key is added
  (section 5).
- The grading-results guard set that reads `GradingResults.tsx` / its helpers:
  `grading-results/gradingResultsExtraction.wiring.test.ts`,
  `grading-results/gradingResultsDisplayHelpers.test.ts`,
  `grading-results/sortGradeRows.test.ts`.
- `grading-results/gradingResultsHelpersWiring.test.ts` - NOT merely read: it is
  the directory-enumeration canary (section 4 correction). It must be EDITED this
  commit to add `./gradeRowFilter.ts` to its `CLIENT_FILES` literal (`:103-126`),
  or its `readdirSync` completeness sweep (`:235-244`) and its
  `directoryRoots(...)` equality (`:128-134`) both go red on the new file. It is
  therefore in the Wave 1 write set (section 8), not just the run-list.
- `src/file-size-ceiling.structure.test.ts` - always, repo-wide (section 4).
- `src/lib/no-emojis.test.ts` and `src/source-bytes.structure.test.ts` - always,
  they scan every new/edited source file.

Multi-path runs use the wrapper, never a raw multi-path `vitest`:

```
npm run test:paths src/app/components/grading-results/gradeRowFilter.test.ts src/app/components/grading-chat/GradingChatPanel.structure.test.ts src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts src/app/components/grading-results/gradingResultsDisplayHelpers.test.ts src/app/components/grading-results/sortGradeRows.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Note for the test file: `strip-comments-agreement.structure.test.ts` enumerates
every `*.test.ts` that MENTIONS the comment-strip helper literal. The new
`gradeRowFilter.test.ts` must NOT use that literal (do not hand-roll a
comment-stripper); if comment stripping is needed, name it `withoutLineComments`
per that gate.

---

## 8. Wave plan

One wave. The pure export and its SOLE caller land together, so nothing ships
dead (the repo's "assignment must include the wiring file" rule).

**Wave 1 (single, independently pushable). Write set:**

1. `src/app/components/grading-results/gradeRowFilter.ts` (NEW) - the pure
   `GRADE_ROW_HAYSTACK` + `filterGradeRowsForTable` + a LOCAL
   `normalizeForMatch`, importing ONLY the `GradeRow` type from
   `./gradingResultsHelpers` (type-only). NO import from
   `../recording/discussion-table-view` - section 2, ruling A: that import would
   extend the grading-results client-bundle closure.
2. `src/app/components/GradingResults.tsx` - the opt-in prop, the `useState`, the
   `visibleResults` derivation (THE CALLER of `filterGradeRowsForTable`), the
   gated search bar, the "Showing N of M" hint, the filtered-empty `<tr>`, and
   the `<tbody>` map change.
3. `src/app/components/grading-chat/GradingChatPanel.tsx` - add `searchable`
   (and the placeholder, if non-empty) to the `<GradingResults` mount at
   `:320-329`. This is the one byte that turns the feature on for the chat page.
4. `src/app/components/grading-results/gradeRowFilter.test.ts` (NEW) - the oracle
   (test seat authors the exact assertions; implementer writes from the notes).
5. `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`
   (EDITED, SAME COMMIT) - add `"./gradeRowFilter.ts"` to the `CLIENT_FILES`
   literal (`:103-126`). This is the ONLY edit to this file. Without it the
   directory-enumeration assertions (`:128-134`, `:235-244`) go red on the new
   file (section 4 correction). The file's `walkRuntimeGraph` roots and all other
   assertions are untouched, and the closure they walk stays clean because
   `gradeRowFilter.ts` adds no runtime edge (type-only import).

The new export (1) and its caller (2) are in the same wave - the export is not
dead for a single commit. The opt-in consumer (3) is in the same wave - the prop
is not a no-op for a single commit. The directory canary (5) is updated in the
same commit the new file lands, per the repo's "gate must include directory
canary" rule. No type-only exception is claimed for the production export.

**Wave gate:** `git status --short` against exactly this write set (plus a check
that no `.claude/worktrees` copy was edited - `Glob` returns the worktree copy
first); `npx tsc --noEmit`; `npm run lint` (no NEW warning in the written files);
the `npm run test:paths` line in section 7; and the measured
`@(Get-Content src/app/components/GradingResults.tsx).Count <= 1000` guard
(extract per section 4 if `> 980`).

Disjointness: this item touches `GradingResults.tsx` (a file three other mounts
read at runtime), two files under `grading-results/` (the new
`gradeRowFilter.ts`/`gradeRowFilter.test.ts` AND the directory canary
`gradingResultsHelpersWiring.test.ts`, whose `CLIENT_FILES` literal it edits),
and `grading-chat/`. It must NOT run concurrently with any item whose write set
or runtime-read set includes `GradingResults.tsx`, `grading-results/`, or
`grading-chat/` - the shared edit to `gradingResultsHelpersWiring.test.ts`'s
`CLIENT_FILES` literal makes a concurrent grading-results file-add a direct write
collision, not merely a read-set overlap.

---

## 9. Residual register

Each entry has an owner, an instrument, and the step that measures it. Anything
here that is not also in `docs/BACKLOG.md` does not exist - the orchestrator
files these at disposal.

| ID | Residual | Owner | Instrument | Measured at |
|---|---|---|---|---|
| R1 | Felt filtering (typing narrows on-screen rows; Clear restores) | owner | live app walk on the chat grading page | owner walk (no component renders under vitest) |
| R2 | Fork F1: search matches the RESULT feedback, not the instructor's EDITED feedback (a row whose feedback was edited will not match the new text) | owner | live app walk: edit a row, search the new text | owner walk; revisit only if the owner reports it matters |
| R3 | Filtered-empty message and "Showing N of M" appear/clear correctly on screen | owner | live app walk | owner walk |
| R4 | Posting / CSV / class-trends are unaffected while a filter is active (true by construction via the seam; VISIBLE proof is a walk) | owner | live app walk: filter, then Post/Export/open Trends | owner walk |
| R5 | Fork F3: if the owner wants the filter sticky, add a `ta-grading-chat-*` key and bump the key canary's set + N same-commit | owner decision | `grading-chat-storage-keys.structure.test.ts` | only if the owner reverses the NO-persist decision |

---

## 10. Leverage note for the Acceptance-criteria seat

This changes a user-reachable capability (a filter on the generated table), so
the AC seat owes a leverage call. Measured reading: the advantage is
**click-cost / attention only** - finding one student in a growing
continuous-grading table without manually scanning it. Per
`docs/loop/leverage.md`, click-cost is real but NOT a categorical advantage over
a chat, and LIVE-LOOP/click-cost advantages have NO buildable removal test in
this repo because no component renders. Recommended disposal: **"Accept the cost
explicitly"** - state in the criteria that the advantage is click-cost, and
record the removal test as an owner-walk residual (R1). The AC seat makes the
final call; this is the recommended reading, not a ruling.
