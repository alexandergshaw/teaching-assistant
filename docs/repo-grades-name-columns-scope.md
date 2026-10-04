# RG-NAME-COLUMNS - scope + acceptance criteria

Owner request, 2026-10-04, verbatim: "I also need the ability to auto detect
student first/last names from repo names and pull them into their own cols in
the repo table" and (same chat) "and then i need to be able to sort by those
cols."

This is the data + architecture + AC recon for that row. Recon + AC only - no
production or test code authored here. Author: architecture seat (Opus). A
fresh `loop-checker` reads this before any consumer does.

---

## 0. THE REFRAME THAT GOVERNS EVERYTHING BELOW: this feature already shipped

Brief from the tree, not the doc. Measured, not recalled:

- **Two sortable First name / Last name columns already exist, are wired, and
  are reachable.** `src/app/components/repo-grades/RepoGradesGrid.tsx:497-498`
  renders `<SortableColumnHeader field="firstName" ... />` and
  `field="lastName"`; the body cells are at `:584` (`{nameParts.firstName}`) and
  `:586` (`{repoGradeLastNameCellText(nameParts)}`), fed by
  `deriveRepoGradeStudentName(row.binding.student, row.binding.studentSortable)`
  at `RepoGradesGrid.tsx:543`.
- **Both columns are sortable** via clickable headers (`aria-sort`,
  `toggleRepoGradeSort`) AND via the Sort `<select>`
  (`RepoGradesControls.tsx:480-483`: "First name (A to Z/Z to A)", "Last name
  ..."). Sort state is a single `RepoGradeSortField`
  (`repoGradesRows.ts:275`) - exactly ONE active sort key at a time, so there
  is no second conflicting sort to reconcile.
- **Sort preference already persists.** `ta-repo-grades-sort`
  (`repoGradesUiState.ts:23`, read at `:224`, written at `:242`) is already in
  the 18-key frozen canary (`repoGradesStorageKeys.structure.test.ts`, keys
  listed there include `"ta-repo-grades-sort"`).
- **It is committed, not a working-tree draft.** `git log --oneline -n 1 --
  src/app/components/repo-grades/repoGradeStudentName.ts` -> `c6754034 feat:
  name columns and sortable headers, and stop grading on code we broke`. `git
  status --short` shows only unrelated `docs/` files dirty.
- The design that produced it is `docs/repo-grades-name-columns-and-sorting-
  acceptance-criteria.md` (N1-N7), requested 2026-08-26 and clarified "these
  names should be populated from the roster in the courses table that are
  associated to repos".

Commands for the quantities above:
- Line counts: `@(Get-Content <path>).Count` (PowerShell) -> `index.tsx` **960**,
  `repoGradesRows.ts` **520**, `repoGradeStudentName.ts` **140**,
  `RepoGradesGrid.tsx` **641**, `RepoGradesControls.tsx` **681**.
- Storage keys: `Select-String repoGradesStorageKeys.structure.test.ts` ->
  **18** frozen `ta-repo-grades-*` keys, `ta-repo-grades-sort` present.

### Two measurement conflicts in the RG-NAME-COLUMNS backlog row, disproved here

Per "refuse a ruling you can disprove" - the backlog row (`docs/BACKLOG.md`,
RG-NAME-COLUMNS) carries two stale facts. I measured both; I do not adopt either
silently:

1. The row says `deriveRepoGradeStudentName` is at `repoGradesRows.ts:443-457`.
   **It is not.** Opening `repoGradesRows.ts:443-457` shows the `case
   "firstName"` / `case "lastName"` branches of `sortFieldValue` - the SORT key,
   which *calls* the derivation. The derivation itself is
   `deriveRepoGradeStudentName` at `repoGradeStudentName.ts:114-127` (a module
   that did not exist when the row's address was written).
2. The row says "RepoGradeRow model (`repoGradesRows.ts:103-128`)". The
   interface is at `repoGradesRows.ts:112-128` (the `103-128` span opens inside
   the `RepoGradeColumn` interface's preceding comment block). Minor, noted for
   the checker so a cite-check does not flag it as mine.

**Consequence for the loop (owner's call, not mine): this row is at least 90%
already delivered.** What remains unbuilt is exactly the one thing the shipped
design deliberately refused - see the fork in section 2.

---

## 1. The key fork the owner's new wording opens (recommend + proceed, do not gate)

The 2026-08-26 request said "populated from the roster"; the 2026-10-04 request
says "from repo names". The shipped feature resolved this one way; the new words
point at the other. Three readings:

| Reading | Source of the name text | Status in the tree |
|---|---|---|
| **X** | PARSE first/last from the raw repo-name slug | **not built, and deliberately refused** |
| **Y** | JOIN the real first/last from the roster binding (`binding.student` / `binding.studentSortable`) | **SHIPPED** (`c6754034`) |
| **Z** | roster-JOIN first (Y); repo-name PARSE (X) only as a fallback when there is no roster name | **Y half shipped; parse half not built** |

### Why X alone is wrong here, measured against the real naming transform

A repo name is `owner/` + optional `repoSlug(prefix)-` + `repoSlug(student OR
username)` (`src/lib/student-repo-names.ts:27-31`;
`setupStudentRepoAction`, the step that creates these, is cited at
`repo-student-bindings.ts:22-24`). `repoSlug` (`student-repo-names.ts:17-19`)
lowercases, collapses every non-`[a-z0-9]` run to a single hyphen, and trims
hyphens. So the student segment:

- has lost all capitalization (`"Jo Smith"` -> `jo-smith`);
- carries NO reliable first/last signal - the real fixtures in
  `src/lib/repo-student-bindings.test.ts` include `prefix-aanderson-gh` (a
  GitHub username with a `-gh` suffix, not a human name), `prefix-cchen` (a
  single opaque token), `prefix-jdoe` (`acme-course/module-jdoe` in
  `repoGradesRows.test.ts`), alongside `prefix-dave-diaz` and `prefix-jo-smith`
  (which *happen* to look like first-last). Nothing in the slug distinguishes a
  username from a hyphenated human name;
- was built from `student` **OR** `username` (`studentRepoName` falls back to
  username, then to the literal `"student"`), so the segment is frequently not a
  name at all.

This is why the shipped design (`...-name-columns-and-sorting-...md` N3, "the
anti-fabrication rule... this is the one that matters") reads names from the
roster binding and shows **blank** for a repo with no roster match (N3 item 8:
"empty name cells... never a fabricated or guessed name"). X would reverse that
deliberate rule and show guessed tokens.

### Is a usable roster reachable here? YES.

The name text the columns render comes from `row.binding.student` /
`row.binding.studentSortable`, which the binder (`repo-student-bindings.ts`)
populates from the Canvas roster entry a repo resolves to - including Canvas's
own `sortableName` ("Last, First"), the authoritative split
(`repo-student-bindings.ts:97-104`, threaded at `:184,:198,:234,:274`). The
binder keys off the repo name (rule b inverts `repoSlug`;
`repo-student-bindings.ts:119-129`), so **Y already "auto-detects from the repo
name" - it uses the repo name as the join key and then shows the accurate
roster name instead of a lossy slug parse.** Per `docs/loop/leverage.md`'s
"roster reachable" test: the roster is reachable, so the brief's "then X"
escape does not fire.

### RECOMMENDATION: Z, where the Y half is already shipped and the ONLY new work is a flagged parse FALLBACK for rows that are blank today.

Recommended and proceeded-on as MY reading (not an owner ruling):

- Keep the shipped roster-join (Y) as the authoritative source, unchanged.
- Add a repo-name PARSE path that fires **only** when the roster yields no name
  (today: `binding.student` null -> `source: "none"` -> blank cell, for
  `unbound` and `ambiguous` rows).
- The parse must **degrade to blank, never to a garbage token** (section 2's
  oracle freezes this), and must mark any name it does produce as a
  low-confidence guess from the repo handle, reusing the existing `"derived"`
  marker channel (`repoGradeStudentName.ts:33,86-89`), so the instructor is
  never shown a username-shaped token as if it were a confirmed name.
- It is **one shared derivation**, not a second one (section 2).

### THE FORK FOR THE OWNER (flagged, not gated)

This genuinely needs an owner decision because the parse fallback **reverses a
deliberate shipped anti-fabrication rule** (N3 item 8). Shaped so every answer
ends the activity:

- **(Y-confirm)** The shipped roster-join columns are what you meant - repos map
  to roster students by their repo name and the real first/last names sort.
  Nothing to build; close the row against `c6754034`. *(My secondary
  recommendation if you have not yet seen the shipped columns - open the Repo
  Grades table and sort by First/Last name first.)*
- **(Z)** Also parse a guessed name from the repo slug for rows with no roster
  match (today blank), clearly flagged as a guess and blank when the slug is not
  name-shaped. *(My primary recommendation - honors "from repo names" for the
  blank rows while keeping Y authoritative. Section 2-4 specify it.)*
- **(X)** Replace the roster source with raw slug parsing. *(Not recommended -
  strictly less accurate, and it discards Canvas's real "Last, First" split.)*

Cost of being wrong: Z builds a ~1-module fallback whose value is marginal (it
only ever fills `unbound`/`ambiguous` rows, and only when the slug looks like a
name); if the owner meant Y-confirm, that module is wasted but small and
self-contained. X would regress a shipped correctness property for every row.

The remainder of this document specifies **Z** so it is buildable and checkable
if the owner takes it; if the owner takes Y-confirm, sections 2-5 are withdrawn
and the row closes against `c6754034`.

---

## 2. The derivation (Z): ONE pure function, one source of truth

### Signature and placement

Do NOT create a second name derivation - `docs/loop/leverage.md`-class drift
(cell and sort reading different sources) is exactly what N5 item 16 and
`repoGradesSliceB.guards.test.ts` already guard. Two equivalent shapes; I
recommend the first:

**Recommended - extend the existing single derivation in
`repoGradeStudentName.ts`** (140 lines; stays the one module the columns, the
sort, AND RG-SEARCH-STICKY's planned name search all import):

```
// new leaf helper in repoGradeStudentName.ts (or a sibling pure file it imports)
parseStudentNameFromRepo(
  repo: string,            // the repo full name, e.g. "org/prefix-jo-smith"
  orgPrefix: string | undefined,
): RepoGradeStudentNameParts   // same shape the module already returns

// the existing entry point gains the fallback, same return type, same callers:
deriveRepoGradeStudentName(
  student: string | null | undefined,
  sortableName?: string | null,
  repoFallback?: { repo: string; orgPrefix: string | undefined },
): RepoGradeStudentNameParts
```

`deriveRepoGradeStudentName` keeps today's behaviour when `student` /
`sortableName` yield a name; it calls `parseStudentNameFromRepo` **only** when
the current logic would return `source: "none"` and a `repoFallback` was passed.
`parseStudentNameFromRepo` reuses `deriveHandle`'s logic
(`repo-student-bindings.ts:119-129`) to strip `owner/` and the orgPrefix, then
the module's own `deriveFromDisplayName` token rules
(`repoGradeStudentName.ts:70-97`) - so the slug is run through the SAME split
the roster names use, with the name-shape guard below layered on top.

**Alternative** - a standalone `parseStudentNameFromRepo(repoName, rosterEntry?)`
leaf exactly as the backlog row names it, with the grid cell / sort key choosing
roster-vs-parse at the call site. Rejected as the default because it moves the
roster-vs-parse decision OUT of the one guarded module and into two call sites,
which is the divergence N5 item 16 exists to prevent.

### The name-shape guard (why Z does not become X's garbage)

A slug token is shown as a name only if it is name-shaped; otherwise the cell
degrades to blank. The rule, frozen by the oracle:

- A segment containing a digit anywhere, or whose final hyphen-token is a known
  handle suffix (`gh`, `git`, or length <= 2 and not a known name) -> treat as a
  username -> **blank** (`source: "none"`), never a guessed split.
- A single lowercase token with no hyphen -> username-shaped -> **blank** (this
  is the key departure from the roster path's single-token rule, which shows
  the token as a first name: a lone slug token like `cchen` is far more likely a
  username than a human first name).
- Two or more hyphen tokens, all alphabetic, none a handle-suffix -> a guessed
  split: last token = last name, the rest = first name, `source: "derived"`,
  with the existing correction hint - and marked as a guess in the cell.

Blanks remain blank for BOTH the cell and the sort (sort treats `firstName ===
""` / `lastName === ""` as `empty`, already handled at
`repoGradesRows.ts:448,457`).

### FROZEN-LITERAL oracle for `parseStudentNameFromRepo` (orgPrefix "prefix" unless noted)

Every input below is a REAL convention from `repo-student-bindings.test.ts` /
`repoGradesRows.test.ts`, not invented. This is the machine-checkable AC -
nothing renders under vitest, so this table IS the spec the implementer's tests
pin, and a reference implementation must score it green before hand-off
(`seats.md` Test seat, practice 1).

| repo | handle after strip | firstName | lastName | source | why |
|---|---|---|---|---|---|
| `org/prefix-dave-diaz` | `dave-diaz` | `dave` | `diaz` | `derived` (guess) | 2 alpha tokens, neither a handle-suffix |
| `org/prefix-jo-smith` | `jo-smith` | `jo` | `smith` | `derived` (guess) | 2 alpha tokens |
| `org/prefix-aanderson-gh` | `aanderson-gh` | `""` | `""` | `none` | final token `gh` is a handle-suffix -> username |
| `org/prefix-cchen` | `cchen` | `""` | `""` | `none` | single lowercase token -> username-shaped |
| `acme-course/module-jdoe` (prefix `module`) | `jdoe` | `""` | `""` | `none` | single token -> username-shaped |
| `org/alice-repo` (no prefix) | `alice-repo` | `""` | `""` | `none` | final token `repo` is not a surname; recommend a stop-word list incl. `repo` -> blank, NOT `alice`/`repo` |
| `org/van-der-berg-ana` | `van-der-berg-ana` | `van der berg` | `ana` | `derived` (guess) | last-word rule; wrong for multi-part surnames, hence shown as a guess with the correction hint |
| `org/` (empty handle) | `""` | `""` | `""` | `none` | nothing to parse - no crash |

The `van-der-berg-ana` row is included on purpose: it shows the last-word rule
guessing WRONG (it should be "Ana van der Berg"), which is why every parse
result is marked `derived`/guess and the correction hint points the instructor
at the roster. This is the honesty the owner's "auto detect" must not silently
drop. If the owner wants a different handle-suffix / stop-word set, that is a
one-line change to the frozen list, recorded as a residual, not a redesign.

**Leverage (required question, answered honestly).** Trigger fired: this is a
`derived`/fallback data increment, not a new capability class. There is **no
earned leverage claim for the Z delta** - the parse fallback only fills cells
that are blank today, with a guessed, clearly-flagged name; it is not CORPUS,
CAPTURE, SCALE, ATTRIBUTION or GUARANTEED (`docs/loop/leverage.md`). The shipped
Y feature's real leverage (the app maps a repo to a roster student by
construction and sorts a class by surname, which a chat cannot do from a repo
URL) was already banked by `c6754034`. Recorded, per the rule, as "no claim to
make" for this delta - not dressed up as one.

---

## 3. The two columns (already built - delta only)

No new columns. `RepoGradesGrid.tsx:497-498` already renders First name / Last
name headers; `:584,:586` render the cells. Column order today, left to right
(`:493-499`): Repo, First name, Last name, Binding, then the dynamic per-folder
score columns. Names sit immediately right of Repo and left of Binding - leftmost
identity cluster, minimal horizontal scroll, which is the correct placement and
needs no change. They are always-on (no toggle), consistent with every other
non-folder column.

Z's only visible delta: a currently-blank First/Last cell on an
`unbound`/`ambiguous` row MAY now show a guessed name with the existing
`derived` marker (`repoGradeStudentName.ts:33`), when `parseStudentNameFromRepo`
returns a name-shaped split. No new header, no new column, no layout change.

Interaction with the sticky working-header and search (RG-SEARCH-STICKY): that
scope's feature 1 searches firstName/lastName and is specified to share THIS
derivation. Because Z keeps one derivation, the search automatically sees the
same parsed fallback the columns show - no separate wiring. **Ordering flag:**
RG-SEARCH-STICKY's search reads the derivation, so if Z ships, the search
inherits the parsed-fallback names; if Z does NOT ship, the search sees today's
blanks. Either is coherent; it only matters that the two land in a known order.
Recommend RG-NAME-COLUMNS (Z) lands BEFORE or is explicitly deferred relative to
RG-SEARCH-STICKY so that scope's oracle knows whether blank or parsed names are
expected for unbound rows. They share `repoGradeStudentName.ts`,
`RepoGradesGrid.tsx`, `repoGradesRows.ts` - **sequence disjoint in time**, never
concurrent.

---

## 4. Sort (already built - no delta needed for Z)

All sort machinery the owner asked for is shipped and needs nothing for Z:

- Pure comparator: `sortRepoGradeRows` (`repoGradesRows.ts:494-520`) - copies the
  input (never mutates), `empty` sorts last in BOTH directions
  (`:506-512`), ties break on repo name direction-aware (`:516`) so the order is
  fully deterministic (stable-by-construction). firstName/lastName read the
  shared derivation (`:443-458`).
- Click-to-sort headers with `aria-sort` and asc/desc toggle
  (`toggleRepoGradeSort`, `repoGradesRows.ts:346-356`; headers
  `RepoGradesGrid.tsx:132-136,497-498`) - fewest-clicks pattern, one click to
  sort, one more to reverse.
- The Sort `<select>` (`RepoGradesControls.tsx:467-490`) and the header clicks
  drive ONE `RepoGradeSortState` (`repoGradesRows.ts:278-288`), so the two
  controls can never disagree (N5 item 15, closed by
  `repoGradeSortSelectValue` / `parseRepoGradeSortSelectValue`,
  `repoGradesRows.ts:407-426`).
- Persistence: `ta-repo-grades-sort`, already in the 18-key canary; stale folder
  sorts degrade via `resolveRepoGradeSort` (`repoGradesRows.ts:332-336`).

Because Z adds no sort field and no new blank semantics (parsed blanks are the
same `empty` the sort already handles), **the sort needs zero changes.** The
only test obligation is that the comparator's existing blanks-last oracle still
holds when some blanks are now "parse produced nothing" rather than "roster
produced nothing" - same `empty: true`, same branch, so the existing
`repoGradesRows.test.ts` coverage already exercises it; one added fixture row
(a parsed-blank unbound row) makes that explicit.

---

## 5. Canary obligations and wave split

### Canaries (for Z; the recommended fold keeps all but one UNCHANGED)

Per `gate-must-include-directory-canary`:

- **R-2 frozen-roots** (`repoGradesFeedbackAndFiles.wiring.test.ts`, currently
  **35** per the A7 ship notes; the directory's basename canary): **no bump** if
  the parse folds into the existing `repoGradeStudentName.ts`. IF the
  implementer instead adds a new `parseStudentNameFromRepo.ts` leaf, the gate
  MUST include R-2 and bump **35 -> 36 in the same commit**, browser-safe (the
  leaf is a pure, import-free-of-React module). Recommend the fold to avoid the
  bump and keep one guarded module.
- **css-orphan ratchet** (**118**): **no change** - Z reuses the existing
  `derived`-marker styling; no new class. If the implementer adds a distinct
  class for the parsed-from-repo marker, ratchet **118 -> 119** same commit and
  reference it.
- **storage-key canary** (`repoGradesStorageKeys.structure.test.ts`, **18**):
  **no change** - sort already persists via `ta-repo-grades-sort`; Z adds no
  key.
- **1000-line ceiling** (`src/file-size-ceiling.structure.test.ts:30`,
  LIMIT 1000): `index.tsx` is **960** (`@(Get-Content index.tsx).Count`), 40
  headroom. Z threads `row.repo` (already on `RepoGradeRow`) and `orgPrefix`
  (already in `useRepoGradesData` / passed to `buildRepoGradeGridModel`,
  `repoGradesRows.ts:203-208`) into the cell and sort call sites - net index.tsx
  growth near zero. Re-measure with `@(Get-Content).Count` at the wave gate
  regardless; keep any growth to threading only.

### Wave split

Z is small and single-surface. **One wave.** The derivation leaf + its frozen
oracle test + the two call-site threads (grid cell, sort key) all land together,
because the parse is dead unless both call sites pass `repoFallback`
(assignment-must-include-the-wiring-file: the wave MUST include
`RepoGradesGrid.tsx` and `repoGradesRows.ts`, the files that CALL the new
fallback, or it ships dead with every gate green). No second wave - the sort is
already done.

If the owner takes **Y-confirm** instead of Z, there is NO wave: close the row
against `c6754034` and record the stale-cite corrections (section 0) as a
one-line backlog fix.

---

## 6. Residual register

Each entry: owner, instrument, measuring step. A residual not in
`docs/BACKLOG.md` does not exist, so these are to be filed on the RG-NAME-COLUMNS
row at disposal.

| id | residual | owner | instrument | step |
|---|---|---|---|---|
| R-NC-1 | The X/Y/Z fork (Y-confirm vs Z vs X) is an owner product decision; this scope proceeds on Z but must not be built until the owner answers, since Z reverses shipped N3 item 8. | owner | the fork in section 1 | owner answer in chat; until then the row is "scoped, owner-forked" |
| R-NC-2 | Backlog RG-NAME-COLUMNS row carries two stale `file:line` cites (section 0). | agent | `Read repoGradesRows.ts:443-457` (sort, not derivation) | one-line backlog edit at next reconcile |
| R-NC-3 | The name-shape guard's handle-suffix set (`gh`, `git`) and stop-word set (`repo`) are a heuristic; real orgs may use other suffixes. | owner | the frozen oracle (section 2) | owner may extend the lists; one-line change, no redesign |
| R-NC-4 | Whether the visible table actually shows parsed names / sorts correctly cannot be verified here - no component renders under vitest (`docs/loop/this-repo.md` section 6). | owner | browser | owner opens Repo Grades, sorts by First/Last, inspects an unbound row |
| R-NC-5 | Ordering of RG-NAME-COLUMNS (Z) relative to RG-SEARCH-STICKY feature 1, which shares `repoGradeStudentName.ts` (section 3). | orchestrator | file-set disjointness (`parallel-disjointness.md`) | sequence disjoint in time; decide which lands first |

---

## 7. What I could not determine

- Whether the owner has SEEN the shipped columns. The request reads as a
  first-time ask, but the columns are live in `c6754034`. This is the single
  most important thing for the owner to resolve (R-NC-1 / the fork).
- Whether any real org in use names repos with a convention the oracle's
  handle-suffix heuristic mis-reads. Only the test fixtures are available here;
  no live org data. Recorded as R-NC-3, not invented away.
