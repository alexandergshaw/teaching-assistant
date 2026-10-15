# Scope: clean up the Repo Grades results table (header + remove First name / Last name / Binding)

READ-ONLY scope. No production file is edited by this document. ASCII only
(instrument: `LC_ALL=C grep -c '[^ -~]' docs/repo-grades-table-header-cleanup-scope.md`, expect 0).

Owner requests, 2026-10-12, verbatim:
1. "the repo grading table header needs to be cleaned up."
2. (added) "the overall grading table for repos needs to be cleaned up. i don't use first name, last name, or binding columns. the remaining content needs to get minimal and professional."

Authored by the UX/scoping seat; a `loop-checker` reads it before any build. Every
`file:line` below was opened in this session; every quantity names its command.

---

## 0. Routing verdict (the question the brief asked first)

**NOT covered by an existing doc. Open this as a NEW follow-on scope that builds on the shipped state.**

The three prior scopes were all BUILT; they are history, not open work:

| Prior doc | What it covered | Shipped as (ancestor of HEAD, `git merge-base --is-ancestor <sha> HEAD` printed ancestor for all three) | What it leaves open for this scope |
|---|---|---|---|
| `docs/repo-grades-header-setup-visual-pass-scope.md` | (A) sticky working-header vertical compaction, (B) Run-setup accordion facelift, (C) delete the duplicate sticky run bar | `726ceb17` (deleted `RepoGradesRunBar.tsx`, compacted `.stickyWorkingHeader`, added `.disclosureSummary`) | A-fork-2 "relocate the folder picker's branch hint" was DEFERRED (section 2 lever 4 of that doc); A-fork-1 (drop visible Search / Target-branch captions) was taken and is revisited in CH-A2 below because its premise is wrong for Target branch. It never touched the table columns or the body cells. |
| `docs/repo-grades-module-picker-header-scope.md` | move the folder picker into the sticky working header | `b22e257d` | Left the picker's hint paragraphs inside the sticky header (they are still there, `RepoGradesFolderPicker.tsx:54-64`). |
| `docs/repo-grades-status-prominence-scope.md` | add the grading progress banner to the sticky header | `d230ffcb` | Nothing; it is one of the header slots this scope must keep. |

None of them touched the `<thead>`/`<tbody>` COLUMN SET, the Sort control, or the
per-row cells. Request 2 is entirely new ground.

---

## 1. Measured facts (every quantity names its command)

Line counts, `@(Get-Content <file>).Count` in PowerShell (the mandated instrument; `wc -l` was NOT used for any
figure below because the repo records that line counters disagree):

| File | Lines | Ceiling note |
|---|---|---|
| `src/app/components/repo-grades/RepoGradesGrid.tsx` | 651 | far below 1000 |
| `src/app/components/repo-grades/RepoGradesControls.tsx` | 637 | shrinks under this scope |
| `src/app/components/repo-grades/index.tsx` | 875 | 125 headroom; this scope removes a little, adds ~4 |
| `src/app/components/repo-grades/RepoGradesStickyHeader.tsx` | 84 | |
| `src/app/components/repo-grades/RepoGradesFolderPicker.tsx` | 67 | |
| `src/app/components/repo-grades/repoGradesRows.ts` | 520 | |
| `src/app/components/repo-grades/repoGradeStudentName.ts` | 140 | |
| `src/app/components/repo-grades/RepoBindingControl.tsx` | 207 | |
| `src/app/components/repo-grades/repo-grades.module.css` | **994** | **limit 1000** (`src/file-size-ceiling.structure.test.ts:41`, `const LIMIT = 1000`); headroom **6** |
| `repoGrades.wiring.test.ts` | 896 | near; edits here must be net-negative |
| `repoGradesRows.test.ts` / `repoGradesSliceB.guards.test.ts` / `repoGradeStudentName.test.ts` / `repoGrades.wiring.linking.test.ts` / `repoGradesWaveASticky.structure.test.ts` | 487 / 118 / 117 / 277 / 275 | |

The CSS file is the only tight one (headroom 6). Section 6 shows this scope is CSS-net-negative by
construction, and the ceiling test is the gate (AC-14).

`git status --short src` at authoring time showed staged changes under `src/app/components/grading-chat/` and
`src/lib/grade/constants.ts` and `src/app/api/classify-recording/route.test.ts` (another item). NONE of them is
under `src/app/components/repo-grades/`; no collision with this scope's write set (section 6).

---

## 2. What is on screen today (from the markup, not speculation)

No component renders under vitest here (`docs/loop/this-repo.md` section 6), so everything below is read from source.

### 2a. The table's column set today

`RepoGradesGrid.tsx:497-541` (`<thead>`): one `<tr>` with
1. `Select` (`:499-501`, a `<th className={styles.selectHeader}>` holding `<span className={pageStyles.fieldHint}>Select</span>`)
2. `Repo` (`:502`, `SortableColumnHeader field="repo"`)
3. **`First name`** (`:506`, `SortableColumnHeader field="firstName"`)
4. **`Last name`** (`:507`, `SortableColumnHeader field="lastName"`)
5. **`Binding`** (`:508`, `SortableColumnHeader field="binding"`)
6. one `<th>` per folder column (`:509-539`), each wrapping `ColumnHeaderControls` (defined `:275-447`).

`RepoGradesGrid.tsx:542-646` (`<tbody>`), one `<tr>` per `bodyRows` row, cells in the matching order:
1. checkbox `<td>` (`:568-575`)
2. repo `<td>` (`:576-592`): link or plain text plus `row.folderError`
3. **first-name `<td>` (`:593`)**: `{nameParts.firstName}`
4. **last-name `<td>` (`:594-608`)**: `repoGradeLastNameCellText(nameParts)` plus a `(derived)` mark when `nameParts.source === "derived"` (`:602-607`, class `nameDerivedMark`)
5. **binding `<td>` (`:609-611`)**: `<RepoBindingControl row roster onAcceptBinding />`
6. one `<td>` per folder column (`:612-642`): `RepoGradeCellControl` or `CellStatus`

The per-row name derivation feeding cells 3 and 4 is `const nameParts = deriveRepoGradeStudentName(...)` at `:552`.

### 2b. The sticky working header today (the strip above the table)

`RepoGradesStickyHeader.tsx:63-79` renders, inside `.stickyWorkingHeader` in this order: `statusBanner`, `folderControl`,
`rescanControl`, `gradeSetControl`, `targetBranchControl`, then the built-in Search `<label className={styles.headerField}>`.
CSS: `repo-grades.module.css:31-43` (`display:flex; flex-wrap:wrap; align-items:center; gap: var(--space-1) var(--space-3); padding: var(--space-2) var(--space-3)`).

### 2c. Findings (each cited; each is something a user sees)

- **F1 - Inconsistent captions across header fields.** Folder (`RepoGradesFolderPicker.tsx:32-34`) and Grade set
  (`RepoGradesGradeSetTypeahead.tsx:39`) carry a visible `.headerInputLabel` caption; Search
  (`RepoGradesStickyHeader.tsx:69-78`) and Target branch (`index.tsx:808-822`) carry none. Two captioned, two bare, plus a bare Refresh link-button.
- **F2 - The mix produces a staggered baseline.** `.stickyWorkingHeader` uses `align-items: center` (css `:39`).
  A captioned `.headerField` is a column flex (`:62-68`) one caption line (xs, `:74-79`) + 2px gap taller than a bare one, so
  centring leaves the bare inputs' tops visibly lower than the captioned ones. Derived from the CSS; the pixel size is
  unmeasured (nothing renders here) and is an owner-walk item (RES-3).
- **F3 - Target branch is the one field whose caption removal is a usability regression.** `726ceb17`'s A-fork-1 rested on
  "their placeholders already self-describe". That holds for Search (`placeholder="Search repo, student or binding"`,
  `RepoGradesStickyHeader.tsx:74`) but NOT for Target branch: its placeholder is `"Optional, e.g. main"` (`index.tsx:814`),
  which does not say what the field is, and once the user types, no visible text names it. The accessible name
  (`aria-label="Target branch (merged to)"`, `index.tsx:813`) is invisible to a sighted user.
- **F4 - A sentence is pinned in the sticky strip.** `RepoGradesFolderPicker.tsx:54-56` renders
  "Links open the branch recorded when the repos were scanned." (59 characters; `python3 len()` printed 59) whenever a
  specific folder is selected, using `pageStyles.fieldHint` which is `font-size: var(--font-size-md)` (`src/app/page.module.css:258-262`).
  Inside a 320px field (`.headerField { flex: 0 1 320px }`, css `:62-68`) that sentence wraps (estimated 2 lines; unmeasured).
  Plus the empty-scan hint (`:57-59`) and the `role="alert"` drop notice (`:60-64`). The strip height is what the thead sticks below
  (`--rg-working-header-h`, `RepoGradesStickyHeader.tsx:50-52`), so this is permanent pinned height. The deferred lever 4 of the prior doc.
- **F5 - Search placeholder promises columns that will not exist.** "Search repo, student or binding"
  (`RepoGradesStickyHeader.tsx:74`). After the three columns are removed, "binding" is not a visible concept in the table.
- **F6 - The folder-column header cell is a 5-to-6 item stack and the tallest thing in the pinned region.**
  `ColumnHeaderControls` (`RepoGradesGrid.tsx:380-445`): sort button with the folder name in `font-size: var(--font-size-lg)`
  (`.columnHeaderFolder`, css `:379-381`), Canvas-assignment `<select>` (`:391-402`), rubric note `<span class=postReason>` (`:411`),
  an OPTIONAL code-scoring sentence (`:416-421`), Grade button (`:422-433`), Post button (`:434-444`), stacked by
  `.columnHeader { display:flex; flex-direction:column }` (css `:369-377`). Sibling header cells are a single small button.
  `.grid thead th { vertical-align: bottom }` (css `:201`) pins the sibling labels beside the Post button rather than beside the folder name.
  This `<thead>` row is itself sticky (`position: sticky; top: var(--rg-working-header-h)`, css `:194-203`).
- **F7 - Header weight inconsistency.** The `Select` header is a `fieldHint` span (md, `--text-secondary`, weight 400,
  `page.module.css:258-262`) while every other header is weight 600 (`.grid thead th`, css `:194-203`).
- **F8 - Three columns the owner does not use dominate the row.** First name, Last name, Binding. The Binding cell is the heaviest
  non-score cell: up to a badge, a detail line, a candidate list or a roster `<select>` + button (`RepoBindingControl.tsx:46-206`).
  `.bindingCell { min-width: 220px }` (css `:226-232`).
- **F9 - The Run-setup "Grading settings" summary is a long one-liner** (`RepoGradesControls.tsx:330-337, 446`; worst case measured
  159 characters by `python3 len()` on the worst-case template). This is the Run-setup strip, not the table; recorded as out of scope (RES-5).

---

## 3. THE CRITICAL FINDING: removing Binding removes the only per-row way to bind a repo

Owner says they do not USE the Binding column. The code says the column is also the ONLY per-row way to resolve a repo whose
binding is not already confirmed. Checked, with commands:

- `grep -rln "RepoBindingControl\|onAcceptBinding\|handleAcceptBinding" src` returned: `index.tsx`, `LinkUsernamesPanel.tsx`,
  `RepoBindingControl.tsx`, `RepoGradeCellControl.tsx`, `RepoGradesGrid.tsx`, `RepoGradesStatusBanners.tsx`, `repoGradesRows.ts`,
  `useRepoGradesData.ts`, `lib/bulk-module-plan.ts`, and four tests. Only `RepoGradesGrid.tsx:610` MOUNTS `<RepoBindingControl>`; the
  others are comments or the `handleAcceptBinding` plumbing.
- The alternative bind paths are bulk and username-driven: `LinkUsernamesPanel.tsx` offers "Link" and "Confirm all N suggested binding(s)"
  (`:140, :229, :445`). Its own text says a username link only produces a SUGGESTED binding (`:327-328`), and it tells the user to bind
  the leftovers "by hand below" (`:401`) - "below" meaning the per-row control in the table. A repo with no username match, or an
  AMBIGUOUS one, can today be resolved ONLY from `RepoBindingControl` (manual roster picker, `:172-206`, ambiguous list `:130-169`).
- Posting is gated on binding: `lib/repo-grade-postability.test.ts:46` pins the reason
  `The student binding is "<state>", not confirmed - accept or resolve the binding first.`, and `RepoGradeCellControl.tsx:617` renders
  that reason. With the column deleted outright, that sentence would instruct the user to do something with no surface.

So a literal "delete the column and the component" ships an unbindable, unpostable repo with an instruction pointing at nothing - the
"surface is a layer" failure this repo has shipped before. The owner said "don't use", not "never need".

**Recommended reading (acted on as the build plan; recorded as the seat's reading, not an owner ruling): READING A.**
Remove all three COLUMNS (header cell and body cell each) and keep the capability as an EXCEPTION disclosure in the Repo cell,
shown ONLY for rows whose `binding.state !== "confirmed"`:

```
<td role="cell">                         // the Repo cell
  {repo link or text}{row.folderError}
  {row.binding.state !== "confirmed" && (
    <details> <summary>Bind student</summary> <RepoBindingControl .../> </details>
  )}
</td>
```

A native `<details>` needs no state (the Grid maps rows inline, `RepoGradesGrid.tsx:543`, so a per-row `useState` is not legal there),
adds no file (frozen roots unchanged), and keeps `RepoBindingControl.tsx`, `onAcceptBinding`, `handleAcceptBinding` and their wiring
tests (`repoGrades.wiring.test.ts:176-213`) fully alive. A confirmed row - the normal case - shows nothing extra: the table the owner
sees is Select / Repo / folder columns only.

- **READING B (strict, the alternative):** remove the columns AND delete `RepoBindingControl.tsx`. Consequence list, so the owner can
  choose with eyes open: per-row manual bind and ambiguous-pick disappear; `FROZEN_REPO_GRADES_ROOTS` count 39 -> 38
  (`repoGradesFeedbackAndFiles.wiring.test.ts:307` lists the basename); `repoGrades.wiring.test.ts:42, 176-213` and
  `repoGradesSliceA.guards.test.ts:54` read the file and must be rewritten; the postability reason string
  (`lib/repo-grade-postability.test.ts:46`) must be reworded to point at the Run-setup panel; and
  `LinkUsernamesPanel.tsx:401` ("bind those repos ... below") becomes false. Cost of B if A was wanted: re-add a file. Cost of A if B was
  wanted: delete one `<details>` block and the file (a few lines plus the tests above).
- Cost summary for the owner: READING A costs ~10 lines in `RepoGradesGrid.tsx`; READING B is a larger, riskier deletion with a dangling
  instruction. See FORK-1.

---

## 4. Proposed change set

IDs are referenced by the acceptance criteria. "Pinned" means a source-text test reads the string today.

### Group T - the table body and column set (owner request 2)

- **CH-T1 Remove the First name, Last name and Binding header cells.** Delete `RepoGradesGrid.tsx:506-508`. Keep `:502` (Repo) and
  `SortableColumnHeader` (still used for Repo, `:120-144`).
- **CH-T2 Remove the matching body cells.** Delete the First-name `<td>` (`:593`), Last-name `<td>` (`:594-608`) and Binding `<td>`
  (`:609-611`), and the now-unused `const nameParts` (`:552`, comment `:544-551`) and the imports `deriveRepoGradeStudentName`,
  `repoGradeLastNameCellText` (`:47`) and `RepoBindingControl` if not re-used (READING A re-uses it in the Repo cell, so that import stays).
  Header and body must drop the SAME three cells in the same commit or the columns shear (AC-1 parity pin).
- **CH-T3 Binding exception in the Repo cell (READING A, section 3).** Add the gated `<details>` to the Repo `<td>` (`:576-592`).
- **CH-T4 No colspan / width logic to change.** Checked, section 5: no `colSpan`/`colspan` in `src/app/components/repo-grades/*.tsx`,
  no `nth-child`/`nth-of-type` in `repo-grades.module.css`, no `<colgroup>`. The narrow-width card reflow
  (`repo-grades.module.css:~640-762`) is per-element (`.grid th, .grid td { display:block }`) and is indifferent to column count.
- **CH-T5 Sort: remove the three dead sort fields.** In `repoGradesRows.ts` change `RepoGradeSortField` (`:275`) to `"repo" | "folder"`;
  drop `firstName`, `lastName`, `binding` from `REPO_GRADE_SORT_FIELD_MEMBERSHIP` (`:296-302`, a `Record<RepoGradeSortField, true>` - the
  compiler flags any miss), from `SELECT_SORT_FIELDS` (`:400`) and from the `sortFieldValue` switch (`:437-458`); delete
  `BINDING_STATE_SORT_PRIORITY` and its comment. A previously persisted sort of `firstName`/`lastName`/`binding` (`ta-repo-grades-sort`,
  `repoGradesUiState.ts:28, 251, 272`) is already handled: `parseRepoGradeSortState` (`repoGradesRows.ts:364-385`) returns
  `DEFAULT_REPO_GRADE_SORT` for any field not in `REPO_GRADE_SORT_FIELDS` (`:372`), so a stale value degrades to Repo A-Z and cannot sort
  by an invisible column (AC-6 proves it with a unit test that actually runs).
- **CH-T6 Delete the Sort `<select>`.** After CH-T5 the select would offer exactly two options (Repo A-Z / Z-A), duplicating the Repo
  header's own sort button (`RepoGradesGrid.tsx:133-141`). Remove `RepoGradesControls.tsx:404-434`, its `sort`/`onSortChange` props and the
  `repoGradeSortSelectValue`/`parseRepoGradeSortSelectValue` import (`:41`); remove the two props at `index.tsx:642-643`; delete the two
  functions from `repoGradesRows.ts` (`:~401-427`). Folder-column sort (the "custom" option) stays reachable via the column header
  button (`RepoGradesGrid.tsx:382-390`). Fallback if the owner objects: keep a 2-option select (FORK-2).
- **CH-T7 Search keeps its semantics, loses a word.** `repoGradesSearch.ts:14-15` still matches repo, student, first/last name and
  binding state; leave it untouched (behaviour-preserving; avoids rewriting `repoGradesSearch.test.ts`). Change only the placeholder at
  `RepoGradesStickyHeader.tsx:74` to `"Search repos or students"`. This still lets the instructor find a repo by a student's name even
  though names are no longer shown. Residual RES-4: matching on a value the user cannot see.
- **CH-T8 Delete the display-only name leftovers.** `repoGradeLastNameCellText` and `UNKNOWN_LAST_NAME_MARK` (`repoGradeStudentName.ts`,
  consumed only by `RepoGradesGrid.tsx:47, 595`), the `(derived)` mark's CSS `.nameDerivedMark` (`repo-grades.module.css:407-418`; only
  `RepoGradesGrid.tsx:603` uses it - `grep -rn nameDerivedMark` over the directory), and `correctionHint` ONLY IF nothing else reads it
  (the implementer re-derives; see FORK-3). `deriveRepoGradeStudentName` itself STAYS: `repoGradesSearch.ts:14` and `repoGradesRows.ts`
  (search/sort) read it.

### Group H - the header and the remaining columns' content (owner request 1 and 2)

- **CH-H1 One alignment rule for the working header.** `repo-grades.module.css:39`: `align-items: center` -> `align-items: flex-end`.
  One declaration, zero lines, fixes F2 without adding height. Pin exists only on `padding` (`repoGradesWaveASticky.structure.test.ts:251`);
  VH-10(a) forbids `overflow` on this rule (`:146-149`) and this edit adds none.
- **CH-H2 Caption Target branch.** Wrap `index.tsx:809-821` input with a caption `<span className={styles.headerInputLabel}>Target branch</span>`
  inside the existing `<label className={styles.headerField}>`; keep `aria-label="Target branch (merged to)"` (the visible text "Target branch"
  is contained in the accessible name). Search stays uncaptioned (self-describing placeholder). The pin
  `repoGradesWaveASticky.structure.test.ts:250-256` asserts `W_INDEX` does not match `/>Target branch \(merged to\)</` and contains the
  aria-label; a caption reading exactly `Target branch` satisfies both assertions, but its title text ("carries no stacked visible Search/Target-branch
  caption") becomes false and must be reworded in the same commit (FORK-4).
- **CH-H3 Move the folder picker's always-on sentence out of the sticky strip.** Delete `RepoGradesFolderPicker.tsx:48-56` (the
  "Links open ..." paragraph) and render the SAME sentence in `index.tsx` directly after the `<RepoGradesFolderHint .../>` block
  (`index.tsx:777-785`), under the same gate `model && currentSelectedFolder !== ALL_FOLDERS`, class `pageStyles.fieldHint`. The sentence
  is preserved verbatim and still gated on a specific folder. Keep the empty-scan hint and the `role="alert"` drop notice in the picker
  (the alert must sit next to the control that resets it; `RepoGradesFolderPicker.tsx:7-10`).
  Pins to update: `repoGrades.wiring.linking.test.ts:265-277` reads `folderPickerSource` for the sentence and its `selectedFolder !== ALL_FOLDERS`
  gate; retarget the read to `index.tsx` and the gate to `currentSelectedFolder !== ALL_FOLDERS`.
- **CH-H4 Header-row polish on the remaining columns.**
  (a) `Select` header: drop the `fieldHint` span styling so it matches the other headers (F7), or visually hide it with the existing
  `.srOnly` recipe (`repo-grades.module.css:338-340`); the checkbox cells already carry `aria-label="Select <repo>"` (`:571`). RECOMMEND visually
  hidden (a bare "Select" over a checkbox column is clutter; the accessible column name survives).
  (b) `.grid thead th { vertical-align: bottom }` -> `top` (css `:201`) so the sibling labels sit on the same line as the folder name, not
  beside the Post button (F6). One word.
  (c) Remove `font-size: var(--font-size-lg)` from `.columnHeaderFolder` (css `:379-381`) so the folder name matches the other header labels
  (type scale consistency). Delete the rule if empty.
  (d) Put Grade and Post side by side: wrap `RepoGradesGrid.tsx:422-444` in one `<div className={styles.columnHeaderActions}>` (flex row,
  `gap: var(--space-1)`, `flex-wrap: wrap`) - removes one stacked row from the sticky thead. ~4 CSS lines (CSS budget, section 6).
  (e) Leave in place, deliberately: the assignment `<select>` (read by the post path; the prior pass proved this, `docs/repo-grades-header-setup-visual-pass-scope.md` section 4),
  the rubric note (AC item 44 pre-click disclosure) and the code-scoring sentence (`:416-421`, Task B, pinned by
  `repoGradesCodeExecution.wiring.test.ts:379-382`). The code-scoring sentence repeats per folder column when code scoring is on; collapsing
  it to one place is RES-2, not this pass.

Out of this pass (residual register, section 8): the per-cell content of `RepoGradeCellControl.tsx` (651 lines), the Run-setup summary string
(F9), the Refresh button style.

---

## 5. Downstream-dependence check (owner requirement 3) - what was checked and what it showed

| Concern | Command / evidence | Result |
|---|---|---|
| colSpan / column-count assumptions | `grep -n "colSpan\|colspan" src/app/components/repo-grades/*.tsx` | no output: none |
| CSS positional selectors | `grep -n "nth-child\|nth-of-type" repo-grades.module.css` (only `first-child`/`last-child`/`min-width` lines printed; the only `:last-child` uses are row-level `.grid tbody tr:last-child`) | none depend on column index |
| Keyboard navigation of the grid | `grep -n "onKeyDown\|keydown\|tabIndex" RepoGradesGrid.tsx` | no output: no grid key handler to break |
| CSV / table export | `grep -n "csv\|Csv\|CSV" index.tsx RepoGradesGrid.tsx` (only comment hits for "export" in rubric/assignment export names); `grep -rn "Blob(\|download" src/app/components/repo-grades/*.tsx *.ts` hit only `repoGradesResultsStore.ts` (localStorage `writeBlob`) and one `navigator.clipboard.writeText` for per-cell feedback copy (`RepoGradeCellControl.tsx:258`) | no table-level export; nothing reads First/Last/Binding cell text |
| Persisted results | `repoGradesResultsStore.ts` persists per (repo, folder) cell edits | not keyed by column index or the removed columns |
| Persisted sort | `repoGradesUiState.ts:28, 251, 272` + `repoGradesRows.ts:364-385` | stale `firstName`/`lastName`/`binding` degrades to default; the storage KEY `ta-repo-grades-sort` is KEPT (frozen in `repoGradesStorageKeys.structure.test.ts:40`) |
| Search | `repoGradesSearch.ts:14-15` | reads `deriveRepoGradeStudentName` and `binding.state`, not the rendered cells; unaffected |
| `aria-sort` / header association | `RepoGradesGrid.tsx:133, 513-517` | per-`th`; removing three `th`s leaves the rest intact; the card reflow keeps `role="columnheader"` association per its own comment (css `~:625-640`) |
| Sort `<select>` consumers | `grep -rn "repoGradeSortSelectValue\|parseRepoGradeSortSelectValue\|repo-grades-sort" src` | only `RepoGradesControls.tsx` (production) and tests: `repoGradesRows.test.ts:18-19, 458-487`, `repoGrades.wiring.test.ts:824` |
| Tests that read the removed material as source text (the OWNS set; a FLOOR - the implementer must re-derive) | `grep -rl -F` over `src` for `firstName`, `lastName`, `First name`, `RepoBindingControl`, `SortableColumnHeader`, `deriveRepoGradeStudentName`, `repoGradeLastNameCellText`, `nameDerivedMark`, `BINDING_STATE_SORT_PRIORITY`, `Needs attention first` | repo-grades hits: `repoGradesRows.test.ts` (19 lines match `firstName\|lastName\|binding:`, `grep -c`), `repoGradeStudentName.test.ts`, `repoGradesSliceB.guards.test.ts` (lines 75-92: "name cells and the sort key read the SAME derivation"), `repoGrades.wiring.test.ts` (`:42, :176-213` binding wiring; `:824` sort id), `repoGrades.wiring.linking.test.ts` (`deriveRepoGradeStudentName`; `:265-277` hint), `repoGradesSliceA.guards.test.ts:54`, `repoGradesFeedbackAndFiles.wiring.test.ts:307` (frozen roots), `repoGradesSearch.test.ts` (unaffected) |

What was NOT determinable: whether anything outside `src/` (docs-driven scripts, e2e) reads the removed columns. This environment has no
rendered component and no browser; no e2e directory was searched beyond `src`. Owner/orchestrator residual RES-6.

---

## 6. Write set, ceiling, sequencing

Production (all under `src/app/components/repo-grades/`):
- `RepoGradesGrid.tsx` (651): CH-T1, T2, T3, H4(a)(d). Net expected negative (about -30 lines: three `td`s and `nameParts` out, ~10 in).
- `RepoGradesControls.tsx` (637): CH-T6. Net about -35 lines (the Sort block `:404-434`, props, import).
- `index.tsx` (875): CH-T6 (drop two props), CH-H2 (+4 lines caption), CH-H3 (+4 lines sentence). Net about +5; far under 1000.
- `repoGradesRows.ts` (520): CH-T5, T6. Net negative.
- `repoGradeStudentName.ts` (140): CH-T8. Net negative.
- `RepoGradesFolderPicker.tsx` (67): CH-H3. Net -9.
- `RepoGradesStickyHeader.tsx` (84): CH-T7 placeholder only.
- `repo-grades.module.css` (994, headroom 6): CH-H1 (0), H4(b) (0), H4(c) (-3 or rule deleted), H4(d) (+4), T8 (`.nameDerivedMark` -12 including its comment). Expected net about -11, landing near 983. READING A keeps all `.binding*` / `.candidate*` / `.unboundPicker` CSS (RepoBindingControl is still mounted). If READING B is chosen, those rules also become deletable. The gate is the ceiling test (AC-14), re-measured with `@(Get-Content ...).Count` after the edit; do NOT trust this estimate.

Tests (edited in the same commits as the code they pin): `repoGradesRows.test.ts`, `repoGradeStudentName.test.ts`,
`repoGradesSliceB.guards.test.ts`, `repoGrades.wiring.test.ts`, `repoGrades.wiring.linking.test.ts`,
`repoGradesWaveASticky.structure.test.ts`. `repoGrades.wiring.test.ts` is at 896 lines: edits there must be net-negative (the sort-id loop
entry at `:824` is removed; nothing large is added).

Adds NO new file => `FROZEN_REPO_GRADES_ROOTS` (39) is unchanged under READING A; it drops to 38 only under READING B.
No `ta-` storage key added or removed (`repoGradesStorageKeys.structure.test.ts` stays unchanged).
`docs/css-orphans.md` is regenerated by `page-module-css-orphan-classes.test.ts`; it is already modified in the working tree
(`git status --short` showed ` M docs/css-orphans.md` at session start, pre-existing): the implementer must not hand-edit it, and must commit only
the regeneration their own edits cause (stage explicit paths, never `git add -A`).

Collisions: from the backlog (`python3` parse of `docs/backlog.yml` rows whose `owns` mention `repo-grades`), the rows owning these files are
all SHIPPED history (`REPO-GRADES-NAMING-DEDUCTION-TOGGLE`, `REPO-PAGE-OVERHAUL`, `REPO-GRADES-BRANCH-MERGE-CHECK`, `REPO-GRADES-MODULE-PICKER-HEADER`,
`REPO-GRADES-STATUS-PROMINENCE`, `RG-GRADEALL-CONFIRM`: all appear in `git log -- src/app/components/repo-grades`). The `status` field did not
print in my parse, so I am NOT asserting "no open row owns these files"; the orchestrator must confirm with `git status --short` against
this write set at dispatch. One wave, one implementer (the edits share `RepoGradesGrid.tsx`, the CSS, and `index.tsx`); two commits are fine
(1: Group T; 2: Group H) in that order, because T frees CSS budget before H adds `columnHeaderActions`.

---

## 7. Acceptance criteria

No component is rendered by any test here: AC-15 is an owner walk; the rest are source-text / unit instruments. Each names the object,
the instrument, and the direction of failure. Wrapper for multi-file runs per `docs/loop/this-repo.md`: `npm run test:paths <p1> <p2> ...`.

- **AC-1 Column parity, three removed.** Object: `RepoGradesGrid.tsx` source, comment-stripped. Instrument: new source-text pin in
  `repoGradesWaveASticky.structure.test.ts` (or `repoGradesSliceB.guards.test.ts`): the `<thead>` contains no `field="firstName"`,
  `field="lastName"`, `field="binding"` and no `label="First name"`, `"Last name"`, `"Binding"`; the per-row `<tr>` contains no
  `nameParts.firstName` and no `repoGradeLastNameCellText`; fixed `<td>` count in the row (before `columns.map`) equals fixed `<th>` count in the head
  (2 each: select, repo). Direction: RED if any of the three header or body cells survives, or if only one side was removed (shear).
- **AC-2 Binding capability survives (READING A only).** Object: `RepoGradesGrid.tsx`. Instrument: source-text pin that `<RepoBindingControl` is
  still mounted, inside a `<details>`, gated on `row.binding.state !== "confirmed"`, and that it is NOT mounted in its own `<td>`; plus the
  existing `repoGrades.wiring.test.ts:176-213` binding wiring tests pass UNCHANGED. Direction: RED if the control is deleted (a silent capability loss)
  or mounted unconditionally (confirmed rows would regain the heavy cell).
- **AC-3 No dangling instruction.** Object: `lib/repo-grade-postability.test.ts:46` reason string and `LinkUsernamesPanel.tsx:401` "below". Instrument:
  READING A: those files are NOT in the write set and their tests pass unchanged (the "Bind student" disclosure is the "below"). Direction: RED
  if either is edited without a surface for the instruction.
- **AC-4 Sort field set is exactly `repo` and `folder`.** Object: `RepoGradeSortField` and `REPO_GRADE_SORT_FIELD_MEMBERSHIP`. Instrument: `npx tsc --noEmit`
  (exit 0; the `Record<RepoGradeSortField, true>` literal makes a missed key a type error) plus a unit test in `repoGradesRows.test.ts`
  asserting `Object.keys` membership. Direction: tsc nonzero or test RED if a removed field lingers or a new one is missing.
- **AC-5 No dead sort options in the UI.** Object: `RepoGradesControls.tsx` source. Instrument: source-text pin: no `firstName:`, `lastName:`,
  `binding:` and no "Needs attention first". Direction: RED if the Sort control still offers a removed column. (Under FORK-2 keep-select, assert exactly
  the two Repo options.)
- **AC-6 Stale persisted sort degrades, executably.** Object: `parseRepoGradeSortState`. Instrument: unit test (this runs under vitest) with inputs
  `'{"field":"firstName","direction":"asc"}'`, `'{"field":"lastName","direction":"desc"}'`, `'{"field":"binding","direction":"asc"}'`, each `toEqual(DEFAULT_REPO_GRADE_SORT)`;
  prove the test can fail by mutating `REPO_GRADE_SORT_FIELD_MEMBERSHIP` back to include `firstName` (sabotage pass) and seeing RED. Direction: RED if a stale
  value yields a sort on an invisible column.
- **AC-7 Search behaviour unchanged.** Object: `repoGradesSearch.ts` and `repoGradesSearch.test.ts`. Instrument: that test passes with NO edit to either file.
  Direction: RED means the scope leaked into search.
- **AC-8 Search placeholder.** Object: `RepoGradesStickyHeader.tsx`. Instrument: source-text pin `placeholder="Search repos or students"` and
  `aria-label="Search repositories"` retained (`repoGradesWaveASticky.structure.test.ts:254`). Direction: RED if "binding" remains in the placeholder or the aria-label is lost.
- **AC-9 One alignment rule.** Object: the `.stickyWorkingHeader` rule block. Instrument: `ruleBlock(CSS, ".stickyWorkingHeader")` matches `align-items:\s*flex-end`,
  padding pin (`:251`) and VH-10(a) no-`overflow` pin (`:146-149`) still green. Direction: RED if `center` returns, or an `overflow` appears.
- **AC-10 Target branch is captioned and still named.** Object: `index.tsx` target-branch node. Instrument: source-text pin: the `<label className={styles.headerField}>` contains a
  `styles.headerInputLabel` span with text `Target branch` AND `aria-label="Target branch (merged to)"`; the VISUAL-A test (`:250-256`) is reworded, not deleted.
  Direction: RED if the field has no visible text naming it.
- **AC-11 Hint sentence relocated verbatim and still gated.** Object: `index.tsx` and `RepoGradesFolderPicker.tsx`. Instrument: pin that the exact sentence
  "Links open the branch recorded when the repos were scanned." is absent from the picker and present in `index.tsx` within a `currentSelectedFolder !== ALL_FOLDERS` gate;
  `RepoGradesControls.tsx` still does not contain it (`repoGrades.wiring.linking.test.ts:268`). Direction: RED if the sentence is deleted (not moved), un-gated (false in the
  ALL_FOLDERS view), or still in the picker.
- **AC-12 Header-row polish.** Object: `repo-grades.module.css` and `RepoGradesGrid.tsx`. Instrument: pins: `.grid thead th` has `vertical-align: top`; `.columnHeaderFolder` carries no
  `font-size`; Grade and Post `<Button>`s share one wrapper element carrying `columnHeaderActions`; the assignment `<select>` (`aria-label` "Canvas assignment for the ... column"),
  rubric `postReason`, and both Buttons' handlers (`onGradeColumn`, `onPostColumn`) are unchanged. Direction: RED if the load-bearing select or either handler is dropped (the
  prior pass's exact trap).
- **AC-13 Sticky mechanism untouched.** Object: W-A1..A5, W-A9, VH-10 in `repoGradesWaveASticky.structure.test.ts`. Instrument: that file passes with only the CH-H2/H3
  edits to its VISUAL-A / wiring pins. Direction: RED if `--rg-working-header-h` publication or any sticky declaration changes.
- **AC-14 Ceilings and house rules.** Object: `repo-grades.module.css`, all touched files. Instrument: `src/file-size-ceiling.structure.test.ts` (CSS must be <= 1000;
  expected near 983, measured post-edit with `@(Get-Content).Count`), `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`,
  `repoGradesFeedbackAndFiles.wiring.test.ts` (roots 39 under READING A), `repoGradesStorageKeys.structure.test.ts` (unchanged), `npx tsc --noEmit`, `npm run lint`
  (no NEW warning in written files). Direction: any red; a new ASCII-violating character, a CSS file > 1000, or an unlisted root file.
- **AC-15 Owner walk (not machine-checkable here).** In single-folder and all-folders views, light and dark theme, desktop and <700px: table shows Select, Repo, and folder
  column(s) only; header fields share a baseline; Target branch is readable by sight; the sticky strip + thead take visibly less height than before; an unconfirmed
  repo shows a "Bind student" disclosure that works; a confirmed repo shows none. Object: rendered view. Instrument: owner walk only. Recorded as RES-3.

Leverage claim: NONE owed. This is removal and presentational tightening, not a new capability (`DEV_LOOP.md` "Criteria"); trigger recorded.
Diagnostics representation: NONE owed, stated and justified. No new data path and no new failure mode: `onAcceptBinding`, grading and posting are
untouched and still report through their existing seams (`timeGradingAction`, per `docs/repo-grades-status-prominence-scope.md` section 6).

Seats that must run after this scope's check: Visual/aesthetic and Accessibility (header row, `<details>` summary, hidden Select label, `columnHeaderActions`), User experience
(removal and the binding exception). Security/Data/Reliability triage OUT: no new egress, no persisted-shape change (stale sort already degrades), no new failure mode.

---

## 8. Forks (recommended reading acted on; the owner redirects if wrong)

- **FORK-1 Binding: keep an exception affordance, or delete the capability?** RECOMMEND READING A (section 3). Building A now. Cost if the owner wanted B:
  delete one `<details>` block, `RepoBindingControl.tsx` and its tests, bump the frozen-root canary 39 -> 38, reword the postability reason. Cost if B were built and
  the owner wanted A: re-create a 207-line component and four tests. A is the cheaper one to be wrong about.
- **FORK-2 Sort select.** RECOMMEND delete (CH-T6): 2 options duplicate the Repo header button. Cost if wrong: restore a 2-option select (about 12 lines).
- **FORK-3 `correctionHint` / `source` in `repoGradeStudentName.ts`.** After the `(derived)` mark goes, `correctionHint` has no reader. RECOMMEND the implementer greps and deletes
  only what has zero readers, keeping `deriveRepoGradeStudentName`'s return shape if search or a test reads `source`. Cost if wrong: dead fields (harmless) or one restore.
- **FORK-4 Target-branch caption vs prior A-fork-1.** RECOMMEND caption Target branch only (F3). Cost if wrong: remove one `<span>`; reword the VISUAL-A pin back.
- **FORK-5 Which "header" the owner meant.** Request 1 alone is ambiguous between the sticky working header (Group H1-H3) and the `<thead>` (Group H4). Request 2 resolves it to
  "the whole table"; this scope covers both tiers, so no answer is needed. Recorded so the owner can see the reading taken.

---

## 9. Residual register

Per `DEV_LOOP.md` a residual not in `docs/BACKLOG.md` does not exist; the orchestrator files these at disposal. Each has an owner, an instrument and a step.

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-1 | FORK-1: binding exception (A) vs delete (B). Building A. | Repo owner | owner walk of an unbound/ambiguous repo in the built view | after build; owner redirects if B |
| RES-2 | The code-scoring disclosure sentence repeats on every folder column header when code scoring is on (`RepoGradesGrid.tsx:416-421`). Collapse to one place needs the pin at `repoGradesCodeExecution.wiring.test.ts:379-382` rewritten and a product call on pre-post visibility. | Orchestrator to file a row | source-text pin on the single remaining location | a later scope |
| RES-3 | All visual claims (baseline stagger, header height, `<details>` look, hidden Select label, dark theme, <700px) | Repo owner | owner walk (AC-15) | post-ship |
| RES-4 | Search matches student name / binding state the table no longer displays (user can get a hit with no visible reason). Behaviour kept deliberately (CH-T7). | Repo owner | owner judgement; if wanted, `repoGradesSearch.test.ts` rewrite | owner's next batched decision |
| RES-5 | Run-setup "Grading settings - <159-char summary>" line (F9) and the Refresh link-button style are not table items; not changed here. | Orchestrator to file a row if wanted | `@(Get-Content RepoGradesControls.tsx)` summary string length | later scope |
| RES-6 | Whether anything outside `src/` (scripts, e2e) reads the removed columns was not searched. | Implementer | `grep -rn "First name\|Last name\|repo-grades" <repo root excluding node_modules, .next, src>` at build start | before the first edit |
| RES-7 | Per-cell content tightening in `RepoGradeCellControl.tsx` (651 lines: score, three feedback boxes, rubric breakdown, code-run panel, Grade / Post / Browse files actions). The owner's "tighten what each remaining cell shows" is only partly met here (the header and name/binding cells); deeper cell trimming has many pins and no render to judge. | UX seat, then owner | read the cell control per `seats.md` UX brief; pin count via `grep -l` | its own scope, after this ships |
| RES-8 | Pixel quantities (strip height before/after, wrapped line counts) are unmeasured: no render exists here. | Repo owner | owner walk / DevTools | post-ship |

---

## 10. What I could not determine

- Any rendered appearance (AC-15, RES-3, RES-8). No component renders under vitest and this environment has no browser run against the live app.
- The `status` of the backlog rows that own these files (my parse printed `?`); only the git history was used to call them shipped.
- Whether non-`src` tooling reads the removed columns (RES-6).
- Whether the owner wants the per-row bind capability at all (FORK-1); acted on READING A as the lower-regret reading.

No restructuring of a prior version of this document occurred, so no disposition table is owed. The three prior scopes were not edited.
