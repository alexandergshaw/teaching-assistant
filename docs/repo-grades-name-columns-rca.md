# Repo Grades: why the First / Last name columns are blank - RCA and fix scope

Seat: root-cause analysis + scope (`loop-seat`). Authored docs only; no production
or test code was written. Measured at HEAD `ab6d9d83` (the working tree carries
unrelated uncommitted edits to `docs/a29-*.md`, `docs/css-orphans.md` and
`docs/repo-grades-search-sticky-scope.md`; none of the files this RCA reads or
probes is among them - `git status --short`).

Owner report (2026-10-04): "those first and last names aren't actually
populating in the cols." The shipped columns (`c6754034`) render, and the owner
sees them blank. The owner's observation is taken as true and this document
explains it.

Every quantity below names the command that produced it. Anything I did not
run is labelled "read" (read from the file at the cited line) or "not
determined".

---

## 0. Verdict

**CAUSE (A): EXPECTED-BLANK. The columns are fed only by a repo-to-student
BINDING, and in practice most rows never get one. There is no wiring defect
(B) between the binding and the cell.**

The sharper statement the owner needs, because "unbound" alone does not say
why the binder fails to bind repos the app itself created:

1. The name cells are a pure function of two binding fields,
   `row.binding.student` and `row.binding.studentSortable`
   (`RepoGradesGrid.tsx:543`, `repoGradeStudentName.ts:114-127`). When both are
   absent the function returns `source: "none"` and both cells render empty
   (`repoGradeStudentName.ts:125`, `RepoGradesGrid.tsx:584,586`).
2. The binder only sets those two fields for a row it could MATCH to a student
   (a stored row, or exactly one tier hit - `repo-student-bindings.ts:231,267,274`).
   For "unbound" it sets `student: null` (`:267`, `:244` when no stored name).
3. The binder's matching tiers cannot match the repos this app creates, in the
   common configurations (section 3, measured by probe P1-P4):
   - tier 1 compares a stored row's `username` only, never a stored row's
     NAME (`repo-student-bindings.ts:159-175`, comparison at `:167`);
   - tiers 2 and 3 read the LIVE CANVAS roster only (`:178-199`), and that
     roster is `[]` unless the course tile has an institution AND a Canvas URL
     containing `/courses/<digits>` (`useRepoGradesData.ts:321-324,356-357`);
   - provisioning (`setupStudentRepoAction`, `src/app/actions/github.ts:172-217`)
     never writes a `studentRepos` row for the repo it creates (neither caller,
     `useStudentRepoInvitations.ts:564` and `steps.github.ts:270`, persists
     one - read), so no stored full-name match (rule a, `:207-211`) exists
     either.
4. Net: a course with repos scanned and no Canvas roster loaded (or with a
   roster whose spelling or name order differs from the repo name) renders
   every First/Last cell blank. That is N3's "never fabricate" rule
   (`docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md:60-61`)
   working as designed, on a feature whose only name source is a binding most
   rows never reach.

The prior verify (`a04a174e`) was right that bound rows populate and wrong to
treat "blank for unbound rows" as a footnote: it is the dominant case, and the
owner's literal request ("auto detect from repo names") was never delivered for
it. (`a04a174e` is not resolvable in this checkout -
`git log --all --oneline | grep a04a174e` returns nothing; its content is
quoted in `docs/BACKLOG.md:190` only. I rely on the BACKLOG text, not the
commit.)

### The one-look owner discriminator (cheap, decisive)

Open the Repo Grades table and look at the **Binding** column of a row whose
First/Last cells are blank:

- Binding says **Unbound** or **Ambiguous - N matches** -> cause (A) confirmed.
- Binding says **Suggested** or **Confirmed** and shows a student name while
  First/Last are blank -> that would be a real defect (B). I could not
  construct such a row (probe P5 below, and a full read of the path in section
  2), so I expect this does not happen; but it is the check that would
  falsify this RCA.

---

## 1. What I opened

| Object | Where | Why |
|---|---|---|
| derivation | `src/app/components/repo-grades/repoGradeStudentName.ts:1-140` | the function that turns binding fields into cell text |
| cell call site | `RepoGradesGrid.tsx:534-599` | where the cells read the function |
| sort call site | `repoGradesRows.ts:437-458` | same function, same two fields |
| binder | `src/lib/repo-student-bindings.ts:1-289` | which states set `student`/`studentSortable` |
| roster source | `useRepoGradesData.ts:280-359,393-444,647-675` | where `roster` comes from and when it is `[]` |
| model builder | `repoGradesRows.ts:195-218`, `index.tsx:194` | how `roster` + `effectiveStudentRepos` reach the binder |
| roster overlay | `rosterUsernameOverlay.ts:86-157` | what the hand-typed roster text contributes |
| naming transform | `src/lib/student-repo-names.ts:14-31`, `github.ts:172-217` | how this app names repos, and whether it records a binding |
| Canvas roster | `src/app/actions/canvas-inbox.ts:103-113`, `src/lib/canvas/listings.ts:285-315` | what a roster entry carries |
| Binding cell | `RepoBindingControl.tsx:46-76,130-176` | what the instructor sees beside the blank cells |
| pins on the call text | `repoGrades.wiring.linking.test.ts:230-243`, `repoGradesSliceB.guards.test.ts:22-91` | what a fix must not break |
| prior scope | `docs/repo-grades-name-columns-scope.md` (400 lines, read in full from section 1) | the Z spec this RCA revises |

---

## 2. The real data population, traced

### 2.1 Which binding states set the two fields (read, with probe confirmation in 2.3)

| Binding state | How it arises (file:line) | `student` | `studentSortable` | Cells |
|---|---|---|---|---|
| confirmed, stored name non-blank | stored row matches repo full name, numeric id (`repo-student-bindings.ts:211-237`) | stored name | absent (`:234` spreads only for the fallback entry) | filled; split by last-word rule, marked "(derived)" |
| confirmed, stored name blank, id in live roster | `:226,:231,:234` | roster `name` | roster `sortableName` if non-blank | filled from Canvas (best case) |
| confirmed, stored name blank, no matching live roster entry | `:226` -> `fallbackEntry` null, `:231` | **null** | absent | **blank**; Binding cell reads "Unnamed student" (`RepoBindingControl.tsx:51`) |
| unbound via stored row with non-numeric id | `:239-246` | stored name or null | absent | filled if a stored name exists |
| suggested | exactly one tier hit (`:258-259,:267,:274`) | candidate name | candidate `sortableName` (Canvas only) | filled |
| ambiguous | 2+ hits at the winning tier (`:259,:267`) | **null** | absent | **blank**; Binding cell lists the candidates |
| unbound | no stored row, no tier hit (`:258,:267`) | **null** | absent | **blank** |

So a row is blank in exactly four situations: unbound, ambiguous, confirmed
with a blank stored name and no live roster entry, or (not reachable by any
state above) a stored name that is itself blank.

### 2.2 Where `roster` comes from, and when it is empty

- `useRepoGradesData.ts:321-324`: `rosterKey` is non-null only when the course
  tile has a non-blank `institution` AND `parseCanvasCourseId(canvasUrl)`
  returns a value.
- `:327-354`: only then is `listCourseRosterAction` called; `:356-357`
  `roster = rosterMatches ? data : []`. With no key the roster is `[]` forever,
  with no error (`rosterError` is also null - the silent shape).
- `:346` maps `{ id, name, loginId, sortableName }` from
  `CanvasRosterEntry` (`listings.ts:278-283`; students only,
  `enrollment_type[]=student`, `:288`). The threading itself is correct:
  `sortableName` is not dropped.
- This is the SAME gate that the code already records as the cause of an
  earlier owner report, "the assignments drop down on the repo grade view
  doesn't actually populate" (`useRepoGradesData.ts:397-412`, U4.19d). The
  assignments load is gated on the identical key (`:366`). A course tile that
  reproduces that earlier report also has no roster and therefore no names. I
  could not read the owner's course tile (no live database - `docs/loop/this-repo.md`
  section 6), so whether it is the gate or the tier mismatch below is **not
  determined** from here; the Binding-column look above decides it.

### 2.3 Measured probes (the evidence for the verdict)

Instrument: the three production files that compute a row's name, copied
unmodified into the scratchpad with ONE edit (the `@/lib/student-repo-names`
import rewritten to a relative path in the copy of `repo-student-bindings.ts`),
then run with `node --experimental-strip-types probe.ts` (node v22.14.0).
Files copied: `src/lib/student-repo-names.ts`, `src/lib/repo-student-bindings.ts`,
`src/app/components/repo-grades/repoGradeStudentName.ts` - none is modified in
the working tree (`git status --short`). Probe script and outputs were run in
the session scratchpad, not committed. Each probe feeds
`suggestRepoStudentBindings(repos, roster, stored, "cs101-hw1")` and then
`deriveRepoGradeStudentName(b.student, b.studentSortable)`, exactly the two
calls `index.tsx:194` + `RepoGradesGrid.tsx:543` make.

Repo names were produced by the app's own naming transform
(`studentRepoName("cs101-hw1", <student>, <username>)`, `student-repo-names.ts:27-31`):
`acme/cs101-hw1-ruiz-ana` (student "Ruiz, Ana"), `acme/cs101-hw1-jo-smith`
(student "Jo Smith"), `acme/cs101-hw1-cchen` (blank student, username `cchen`).

| Probe | Roster / stored | Repo -> state -> first / last / source |
|---|---|---|
| P1 | no Canvas roster, nothing stored | ruiz-ana: unbound -> "" / "" / none; jo-smith: unbound -> "" / "" / none; cchen: unbound -> "" / "" / none. **All three blank.** |
| P2 | no Canvas roster; hand-typed Roster tile text folded in via the overlay (rows `{student, username, repo: ""}` as `rosterUsernameOverlay.ts:150` produces) | ruiz-ana: unbound (blank); jo-smith: unbound (blank) even though a stored row named "Jo Smith" exists; cchen: suggested -> Carol / Chen / explicit. **Only the repo named from the USERNAME populates**, because tier 1 compares `username`, never the name (`:167`). |
| P3 | Canvas roster connected (loginId = school SSO id, as is typical); nothing stored | jo-smith: suggested -> Jo / Smith / canvas (tier 3, repoSlug(roster name) equals the handle); ruiz-ana: unbound (Roster-tile spelling "Ruiz, Ana" slugs to `ruiz-ana`; Canvas display name "Ana Ruiz" slugs to `ana-ruiz`); cchen: unbound (SSO id is not the GitHub handle). **One of three populates.** |
| P4 | Canvas roster connected; repos named by GitHub username (`cs101-hw1-aruiz99`, `cs101-hw1-josmith-gh`) | both unbound -> blank. Tier 2 compares Canvas `loginId`, which is the school login, not the GitHub name. |
| P5 | (negative control for cause B) every row above that reached suggested/confirmed shows a filled name, sortable-split ("canvas") or explicit-split | No row was bound-with-a-name and blank. The derivation, the cell, and the sort key all agree. |

Reading P1-P5 together: names appear exactly when the binder matches. The
binder matches the app's own repos only when (a) a Canvas roster is loaded AND
the repo was named from the student's name spelled identically to Canvas, or
(b) the repo was named from the username AND that username is stored on a row.
The Roster tile's own placeholder is `"Smith, John"` (`RosterCell.tsx:195,471`), which
produces a last-first slug that tier 3 can never equal to a Canvas first-last
display name (P3, ruiz-ana).

### 2.4 Why (B) is ruled out (read, plus P5)

- Threading: `useRepoGradesData.ts:346` -> `roster` -> `index.tsx:194`
  `buildRepoGradeGridModel(scan.repos, roster, effectiveStudentRepos, orgPrefix)`
  -> `repoGradesRows.ts:210` `suggestRepoStudentBindings` -> `binding` on the
  row (`:178-186`) -> the cell. `mergeRepoGradeLiveScores` spreads `...row`
  (`repoGradesCellEdits.ts:262`) so `binding` survives the cell-edit merge.
- Cell: `RepoGradesGrid.tsx:584` renders `nameParts.firstName`; `:586` renders
  `repoGradeLastNameCellText(nameParts)`. No CSS hides them: the only
  `display: none` in `repo-grades.module.css` is `.cellColumnLabel` (`:415`),
  which is the per-cell folder label, not a name cell
  (`grep -n "display: *none" repo-grades.module.css`).
- Headers are unconditional (`RepoGradesGrid.tsx:497-498`).
- Residual doubt I cannot remove here: no component renders under vitest
  (`docs/loop/this-repo.md` section 6), so "the cell shows the string on
  screen" is read, not observed.

---

## 3. Ranked causes of blank rows (most to least evidenced)

Each is a way to land in section 2.1's blank rows. Which one applies to the
owner's course is **not determined**; the Binding column (and the roster
picker reading "No roster loaded", `RepoBindingControl.tsx:103,184`) tells.

| # | Cause | Evidence | Fixed by Z (parse)? | Fixed by W (matcher)? |
|---|---|---|---|---|
| H1 | No Canvas roster loaded: tile lacks institution, or Canvas URL lacks `/courses/<digits>` | `useRepoGradesData.ts:321-324,356-357,424-432`; same gate as the earlier owner-reported assignments bug (`:397-412`) | partly (guess from slug) | no (no names to match against; the hand-typed Roster text still helps) |
| H2 | Roster loaded, repo spelled/ordered differently from Canvas display name | P3 (ruiz-ana), `student-repo-names.ts:27-31` | partly | yes, if W also matches inverted/hand-typed names |
| H3 | Hand-typed Roster text exists, repos named by name-slug, matcher never compares names | P2 (jo-smith, ruiz-ana), `repo-student-bindings.ts:159-175` | partly | yes - this is the tier that is missing |
| H4 | Repos named from GitHub usernames, never linked | P4, `:178-185` | partly (usernames are mostly not name-shaped, guess usually blanks) | no, needs the username link |

---

## 4. The fix - scope

### 4.1 Forks (recommend and proceed; none gates the work)

**F1 - how to populate (the one that matters).** The owner's request was "auto
detect first/last names from repo names". Two ways to honour it:

- **Z (recommended, and the owner's literal ask): a display-only parse from the
  repo name as a FALLBACK, with a mandatory visible best-guess flag.** Roster
  names always win; the parse only fills rows that are blank today.
- **W (more accurate; a separate activity): widen the binder** so a repo whose
  handle equals `repoSlug(<stored or hand-typed roster name>)` or the slug of
  its inversion becomes a "suggested" binding with the TRUE roster name. It
  fixes H2 and H3 with no guessing. It is not in this wave because it changes
  what the binder classifies as "suggested", and "suggested" rows feed the
  batch confirm (`index.tsx:211-224`), which writes a binding that a grade
  posts against (`repo-student-bindings.ts:1-7`: a wrong binding posts to the
  wrong gradebook with no undo). That is a posting-safety decision, not a
  display one.

I started on Z (this document is its scope). I am recording this as MY
reading acted on, not an owner ruling. Cost of being wrong if the owner
prefers W only: the Z module is small, display-only, self-contained, and
deletable; nothing else depends on it except the Grid cell and the sort key.
Cost of being wrong the other way (Z only, owner wanted accurate names): the
columns fill with flagged guesses that are wrong for last-first spelled repos
(section 4.4 row `smith-john`) - the flag contains the damage, W removes it.

Terminating question to the owner (every answer ends this activity): "Z ships
as scoped. Do you also want W scoped as its own separate activity (yes: it is
filed and scoped; no: it is recorded as declined)?"

**F2 - do guesses sort and get searched?** Recommended: YES, they participate
in the sort and in RG-SEARCH-STICKY's name search, because the owner asked to
sort by these columns and a column that sorts blanks-last for half the rows is
what they just reported as "not populating". The flag is visible on every
guessed cell so the sort is never silently authoritative. Alternative: treat a
guess as `empty` (sorts last). Cost of being wrong: a wrong-order guess sorts
under the wrong key - flagged, not hidden. This is a one-line difference in the
`empty` computation at `repoGradesRows.ts:448,457`.

**F3 - marker style.** Recommended: text marker reusing `.nameDerivedMark`
(`repo-grades.module.css:267`), no new class, so the css-orphan ratchet does
not move. Alternative: a distinct class (ratchet 118 -> 119 in the same
commit). Cost of being wrong: cosmetic.

### 4.2 This reverses a shipped rule - stated explicitly

N3 item 8 (`docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md:60-61`)
says a repo with no roster match shows empty name cells, "never a fabricated or
guessed name". Z deliberately reverses that for rows that have a repo name but
no roster match, in exchange for the owner's request. The reversal is
acceptable ONLY under the safety contract below; without it the feature must
not ship.

### 4.3 SAFETY CONTRACT (mandatory; each item has an enforcer)

| # | Obligation | Enforcer | Pass condition |
|---|---|---|---|
| S1 | A parsed name is VISIBLY FLAGGED as a best guess, distinct from a roster-confirmed name AND from the existing "(derived)" marker. Text, not colour alone. Rendered on BOTH the First-name and Last-name cell (the existing "(derived)" marker is on the Last-name cell only, `RepoGradesGrid.tsx:593-598`; a guess affects both). | structure pin on `RepoGradesGrid.tsx` (reading) + OWNER visual check (nothing renders under vitest) | object: the Grid source; instrument: source-text assertion that a branch keyed on the new `source` value emits a marker string in the first-name `<td>` and the last-name `<td>`; direction: RED if either cell lacks the branch. Owner step: open a row with an unbound binding and a name-shaped slug and see the marker. |
| S2 | A roster name ALWAYS wins. The parse never runs when `student` or `studentSortable` yields any name. | frozen-literal oracle (4.4) | object: `parseStudentNameFromRepo` output; instrument: expected-value table with a roster entry present; direction: RED if the return's `source` is `guess` when a roster entry is non-blank. |
| S3 | A guess never reaches a binding, a post, a run plan, a confirm, or a grade target. It is display and sort/search only. | structure pin: the files that import `repoGradeStudentName` are exactly {`RepoGradesGrid.tsx`, `repoGradesRows.ts`} today (`grep -rn "repoGradeStudentName" src --include=*.ts --include=*.tsx`, non-test hits: Grid, Rows) and the guard asserts that `repoGradesPosting.ts`, `repoGradesRunPlan.ts`, `repoGradesBindingConfirm.ts`, `useRepoGradesGradingActions.ts`, `repoGradesBulkGrade.ts` do NOT import it | object: those five files' source; instrument: import-presence read; direction: RED if any imports it. |
| S4 | When in doubt the function returns blank. A token that looks like a username, a number, a suffix, or a non-name word never becomes a name. | frozen oracle blank rows | object: the none rows in 4.4; direction: RED if any returns a non-empty name. |
| S5 | RG-SEARCH-STICKY feature 3 (the typeahead that drives the GRADING SET) must key the set on `row.repo`, never on a guessed name; a search/typeahead hit on a guessed name must still show the S1 marker in the result row. This is an obligation on that item, recorded here so it is not discovered later. | RG-SEARCH-STICKY test notes | owner: that item's AC seat; step: its AC round. |
| S6 | The marker's tooltip tells the instructor how to replace the guess: bind the repo to a roster student. | read in the Grid | object: the title text; instrument: source read; direction: RED if the title text does not name binding. |

### 4.4 The derivation: ONE shared pure function

**Single source of truth.** Extend `repoGradeStudentName.ts` (140 lines,
`@(Get-Content).Count`), the module whose two call sites are already pinned to
share it (`repoGradesSliceB.guards.test.ts:75-84`). Do not create a second
derivation, and do not put the roster-vs-parse decision at the two call sites
(that is exactly the divergence N5 item 16 exists to prevent).

Signature (the owner's name, with the input corrected to what is cheap and
already correct):

```
parseStudentNameFromRepo(
  handle: string | null | undefined,           // row.binding.derivedHandle
  rosterEntry?: { student?: string | null; studentSortable?: string | null } | null
): { firstName: string; lastName: string;
     source: "roster" | "guess" | "none";
     detail: RepoGradeStudentNameSource;        // the existing none/canvas/explicit/derived/single, for the existing marker and hint
     correctionHint: string | null }
```

- **Why the input is the binder's `derivedHandle`, not the raw repo name.**
  `RepoBindingSuggestion.derivedHandle` is already the repo name with `owner/`
  and the configured prefix stripped by the binder's own rule b
  (`repo-student-bindings.ts:87,119-129,250,269`). `deriveHandle` is private
  (`:119`) and the Grid has no `orgPrefix` prop (`grep -n orgPrefix
  RepoGradesGrid.tsx` returns nothing), so using the binder's value means
  zero prop threading, zero export change, and no `index.tsx` growth (960
  lines, `@(Get-Content index.tsx).Count`, stays untouched), and the prefix is
  stripped in exactly one place. It is null only for rule-a rows (`:233,:244`),
  i.e. rows that matched a stored full name; those stay as they are today (a
  confirmed row with a blank name and no roster entry stays blank). That is a
  deliberate, stated limit, not a gap I missed: no handle was derived for
  them, so there is nothing honest to parse.
- **`rosterEntry`** is the binding's two name fields. If either yields a name,
  the function delegates to the existing `deriveRepoGradeStudentName` and
  returns `source: "roster"`, with `detail` carrying today's
  canvas/explicit/derived/single so the existing "(derived)" behaviour is
  byte-identical (S2).
- **Call sites** (the wiring files; both must pass `row.binding.derivedHandle`
  or the parse ships dead with every gate green): `RepoGradesGrid.tsx:543` and
  `repoGradesRows.ts:447,451`. Keep `deriveRepoGradeStudentName` exported and
  unchanged in behaviour (its 117-line test file stays green); the new function
  wraps it.
- **Pure, no React, no I/O**, browser-safe (the Grid imports this module
  client-side; it must not import a server-only module).

**Rules (proposed; the lists are my proposal, not measured, owner-extensible):**

1. roster entry yields a name -> delegate, `source: "roster"` (S2).
2. handle null/blank -> `none`.
3. tokens = `handle.split(/[-_.\s]+/)`, empties dropped.
4. fewer than 2 or more than 3 tokens -> `none` (a long slug is a sentence, not a
   name; a lone token is far more likely a username than a first name - the
   deliberate departure from the roster path's single-token rule,
   `repoGradeStudentName.ts:92-94`).
5. any token containing a digit, any token of length 1, or any token in the
   FROZEN non-name list -> `none`. Proposed list: `gh git github repo student
   template starter solution solutions test tests demo example project
   assignment homework lab hw week module main final midterm exam quiz code`
   (`gh` and `repo` are fixture-sourced, below; the rest are my proposal).
6. otherwise `guess`: last token = last name, the rest joined by a space =
   first name, each token title-cased (the slug is lower-case,
   `repoSlug` lowercases, `student-repo-names.ts:17-19`; the title-casing is
   part of the one derivation so the cell and the sort key read identical
   strings). `correctionHint` names the repo handle and says to bind it.

**FROZEN-LITERAL ORACLE (the machine-checkable acceptance criterion).** Inputs
are the `handle` the binder produces. Provenance column says where each input
is real; I did not invent any row in the first two groups. The expected values
are written by hand from the rules above, not computed by running the function.

Group F: fixture-sourced handles (`src/lib/repo-student-bindings.test.ts`,
`repoGradesRows.test.ts`; repo names confirmed by
`grep -rhoE '"[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+"'` over those files):

| handle (repo, prefix) | first | last | source | why |
|---|---|---|---|---|
| `dave-diaz` (`org/prefix-dave-diaz`, `prefix`) | Dave | Diaz | guess | 2 alpha tokens |
| `jo-smith` (`org/prefix-jo-smith`, `prefix`) | Jo | Smith | guess | 2 alpha tokens |
| `aanderson-gh` (`org/prefix-aanderson-gh`) | "" | "" | none | `gh` is a handle suffix |
| `cchen` (`org/prefix-cchen`) | "" | "" | none | single token |
| `jdoe` (`acme-course/module-jdoe`, `module`) | "" | "" | none | single token |
| `alice-repo` (`org/alice-repo`, no prefix) | "" | "" | none | `repo` is non-name |
| `mth201-fchen` (`org/mth201-fchen`, prefix `cs101`, prefix not stripped) | "" | "" | none | digit |
| `ecarter`, `ddiaz`, `nomatch` | "" | "" | none | single token |

Group A: handles produced by this app's own naming transform
(`student-repo-names.test.ts:54-75`, `studentRepoName`):

| handle | first | last | source | why |
|---|---|---|---|---|
| `smith-john` (from student "Smith, John", `:54,:58`) | Smith | John | guess | **KNOWN-WRONG ORDER**: the app's own placeholder convention is last-first, and the slug cannot say so. This row exists to prove the flag is the only protection. |
| `jo-smith` (from student "Jo Smith") | Jo | Smith | guess | first-last spelling; identical shape to the row above |
| `student` (literal fallback, `:69-70`) | "" | "" | none | non-name word |
| `o-brien-nunez` (from "O'Brien-Nunez", `student-repo-names.test.ts:34`) | "" | "" | none | token of length 1 |
| `scar` (from "Oscar" with the accent, `:35`) | "" | "" | none | single token; the slug dropped a letter |
| `` (empty, from `org/`) | "" | "" | none | nothing to parse; no throw |

Group P: probe rows, NOT fixture-sourced (labelled so; owner may substitute real
examples - residual R-3):

| handle | first | last | source | why |
|---|---|---|---|---|
| `ana-maria-ruiz` | Ana Maria | Ruiz | guess | 3 tokens, last-word rule |
| `week-1-intro` | "" | "" | none | digit |
| `course-template` | "" | "" | none | non-name word |
| `jo-smith-gh` | "" | "" | none | username-style suffix |
| `van-der-berg-ana` | "" | "" | none | 4 tokens exceeds the cap (this REVERSES the prior scope's oracle, which guessed it) |

Group R (roster precedence, S2): `rosterEntry = {student: "Ana Ruiz",
studentSortable: "Ruiz, Ana"}` with handle `jo-smith` returns Ana / Ruiz /
`roster` (detail `canvas`), NOT Jo / Smith. A second row with `rosterEntry =
{student: null, studentSortable: null}` and handle `jo-smith` returns the guess.
A reference implementation must score the whole table green before hand-off
(`docs/loop/seats.md` Test seat practice 1); I did NOT build one in this seat,
so satisfiability is **not proven** (residual R-1).

**Acceptance (machine), each with object, instrument, direction:**

- AC-Z1 object: `parseStudentNameFromRepo` over the oracle table; instrument:
  the frozen-literal table in `repoGradeStudentName.test.ts` run through
  `npm run test:paths -- src/app/components/repo-grades/repoGradeStudentName.test.ts`
  (one file; the per-argument wrapper line is quoted at the gate, see 4.6);
  direction: RED on any row whose first/last/source differs.
- AC-Z2 object: the Grid and the sort key; instrument: an extended
  `repoGradesSliceB.guards.test.ts` reading both files for a call that passes
  `row.binding.derivedHandle` (with the existing canary pattern at `:43-73`);
  direction: RED if either call site omits the handle (the dead-fallback shape).
- AC-Z3 object: sort order; instrument: a `repoGradesRows.test.ts` fixture with
  one roster row, one guess row and one none row; direction: RED if the none row
  does not sort last in both directions, or the guess row does not sort by the
  derived key (F2 recommended reading).
- AC-Z4 = S3 (no import into posting/plan/confirm).
- AC-Z5 (OWNER, not machine): open Repo Grades on the course that showed blank
  columns; rows with a name-shaped slug and no roster match show the name with
  the marker on both cells; rows with a roster binding show the real name with
  no guess marker; sort by First and by Last behaves.

### 4.5 Canary and ceiling obligations (measured)

| Canary | Current | Does this wave move it? | Instrument |
|---|---|---|---|
| R-2 frozen roots | 35 non-test `.ts`/`.tsx` in `repo-grades/` | **No**, because the parse folds into the existing `repoGradeStudentName.ts`. `repoGradesFeedbackAndFiles.wiring.test.ts:348` names the 35. | `ls src/app/components/repo-grades/*.ts src/app/components/repo-grades/*.tsx \| grep -v test \| wc -l` returned 35 |
| R-2 ORDERING with Wave A | Wave A (`docs/repo-grades-wave-a-sticky-shell-test-notes.md:31,364`) takes it 35 -> 36 for the sticky header leaf | Independent of this wave if the fold is kept. If an implementer instead adds a NEW leaf file, the bump is whatever the live literal is at the time (36 -> 37 if Wave A landed first, 35 -> 36 if not) in the SAME commit, and the test title at `:348` is edited too. Recommendation: do not add a leaf. | read the literal at `:348` at wave time, never the number in this document |
| css-orphan ratchet | 118 (`docs/css-orphans.md:19`, also at `git show HEAD:docs/css-orphans.md`; the working-copy file is modified by another agent) | **No** with F3 recommended (reuse `.nameDerivedMark`). 118 -> 119 same commit if a distinct class is chosen. | `Select-String 'Total:'` on `git show HEAD:docs/css-orphans.md` |
| storage-key canary (`repoGradesStorageKeys.structure.test.ts`) | 18 | No, no new persisted state | read |
| 1000-line ceiling (`src/file-size-ceiling.structure.test.ts:41`) | `RepoGradesGrid.tsx` 641, `repoGradesRows.ts` 520, `repoGradeStudentName.ts` 140, `index.tsx` 960 | No file approaches it; `index.tsx` is not touched | `@(Get-Content <file>).Count` (PowerShell) |
| grading-chat | n/a | n/a, this is the Repo Grades view | - |

### 4.6 Wave shape, collisions, and the pins that WILL go red

One wave, because the parse is dead unless both call sites pass the handle.
Write set (the wave must include the files that CALL the new export):

- `src/app/components/repo-grades/repoGradeStudentName.ts` (new function, new
  `"guess"` handling)
- `src/app/components/repo-grades/RepoGradesGrid.tsx` (cell call + S1 marker on
  both cells)
- `src/app/components/repo-grades/repoGradesRows.ts` (two sort-key calls,
  `:447,:451`, and the `empty` computation per F2)
- tests: `repoGradeStudentName.test.ts`, `repoGradesRows.test.ts`,
  `repoGradesSliceB.guards.test.ts` (S3 + AC-Z2), and
  `repoGrades.wiring.linking.test.ts` (see below)

**A pin that goes red by construction:** `repoGrades.wiring.linking.test.ts:231-232`
uses the EXACT call text
`const nameParts = deriveRepoGradeStudentName(row.binding.student, row.binding.studentSortable);`
as the START ANCHOR of a window (`:236-241`) whose canary at `:243-245` throws
if the anchor is missing. Any change to that line breaks the anchor, and with
it every test in that `describe`. The wave owns updating the anchor string in
the same commit; that is transcription of the new call text, not a loosening,
and the window's end anchor (`:233`) and the `buildRepoGradeRowLinkHref`
assertion at `:253` stay as they are. `repoGradesSliceB.guards.test.ts:75-84`
uses `usesSharedFunction` (import plus a `deriveRepoGradeStudentName(` call), so
it stays green only if the Grid and rows still CALL that name; if the wiring
switches to calling `parseStudentNameFromRepo` directly, those two assertions
and their canary at `:43-73` need the new symbol name in the same commit.
Recommendation: keep `deriveRepoGradeStudentName` as the called name (add a
third optional argument for the handle) so only the text anchor changes.

**Collision (sequence disjoint in time, never concurrent):**
`RepoGradesGrid.tsx`, `repoGradesRows.ts` and `repoGradeStudentName.ts` are
shared with RG-SEARCH-STICKY Waves A/B/C and A7. Recommended order: Wave A
(sticky shell, edits Grid/index/css) first, THEN this wave, THEN
RG-SEARCH-STICKY feature 1 (name search), so the search's oracle knows
guessed names are present (the prior scope's R-NC-5 ordering flag stands and
this fixes the order). Sequence them; do not run two against `RepoGradesGrid.tsx`
together (`docs/loop/parallel-disjointness.md`).

**Verification gate for the wave (form quoted, not run - no code exists yet):**

`npm run test:paths src/app/components/repo-grades/repoGradeStudentName.test.ts src/app/components/repo-grades/repoGradesRows.test.ts src/app/components/repo-grades/repoGradesSliceB.guards.test.ts src/app/components/repo-grades/repoGrades.wiring.linking.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`

(the wrapper's per-argument lines must be quoted in the verify report; a raw
multi-path `vitest` run is not acceptable evidence,
`package.json:21`). Plus `npx tsc --noEmit` (single caller) and the repo's lint
gate per `docs/loop/this-repo.md`. Leverage claim: none to make - the Z delta
fills cells that are blank today with a flagged guess; it is not an earned
class (`docs/loop/leverage.md`), recorded as the fired trigger rather than
dressed up.

---

## 5. Disposition of the prior scope's Z spec (`docs/repo-grades-name-columns-scope.md`)

| Prior requirement | Disposition |
|---|---|
| One shared derivation in `repoGradeStudentName.ts`, no second function (`:175-212`) | KEPT, now stated as a contract (4.4) |
| Signature takes `(repo, orgPrefix)` and re-derives the handle (`:186-189,:202-204`, "reuses deriveHandle's logic") | CHANGED: takes the binder's `derivedHandle`. `deriveHandle` is a private function (`repo-student-bindings.ts:119`); duplicating it re-implements prefix stripping, and the Grid has no `orgPrefix` prop. Reason: zero threading, one stripper. |
| Name-shape guard: digit/handle suffix/single token -> blank (`:219-225`) | KEPT, extended with a token-length rule, a 2-3 token window and a non-name list |
| Oracle row `van-der-berg-ana` -> guess (`:250`) | WITHDRAWN: 4 tokens now exceed the cap and return `none`. Reason: a 4-token slug is more likely a sentence than a name, and the multi-part-surname case is unfixable from a slug anyway. The corrective channel is binding to a roster student. |
| Oracle rows use only first-last fixtures | CHANGED: adds the app's OWN last-first convention (`smith-john`) as a KNOWN-WRONG row; the prior oracle never exercised the placeholder spelling the Roster tile advertises |
| Reuse the existing "(derived)" marker for the guess (`:137-139`) | CHANGED: a distinct text marker. The "(derived)" marker means "split of a roster name by the last-word rule" - a much more trustworthy provenance than "guessed from a repo slug"; sharing one marker would let an instructor read a slug guess as a roster split. |
| Marker on the Last-name cell only (existing idiom) | CHANGED: both cells (S1) |
| "Z only fills unbound/ambiguous rows" | KEPT, and made precise: rows with a non-null `derivedHandle` and no roster name |
| R-2 no bump if folded; css-orphan no change; storage 18; ceiling | KEPT (4.5), re-measured |
| R-NC-1..R-NC-5 residuals | R-NC-1 (fork) is superseded by F1 above and answered by its terminating question; R-NC-3 (heuristic lists) is carried as R-2 below; R-NC-4 carried as AC-Z5 and R-4; R-NC-5 (ordering) closed by 4.6 |
| Sort needs no change (`:302-329`) | KEPT with one stated exception: the `empty` expression follows F2 |

---

## 6. Residual register

Every entry has an owner, an instrument and a step. None is filed in
`docs/BACKLOG.md` by me: the instructions for this seat restrict the commit to
this one file, and `docs/BACKLOG.md` is a shared file other agents may be
writing. The orchestrator owns filing them.

| id | residual | owner | instrument | step |
|---|---|---|---|---|
| R-1 | The frozen oracle's satisfiability is unproven: no reference implementation was built in this seat. | test-author seat for the wave | a throwaway reference implementation run green against the Group F/A/P/R tables in an isolated tree | the wave's test-notes round, before the implementer starts |
| R-2 | The non-name word list and the 2-3 token window are my proposal, not measured against any real org's repo names (only test fixtures are available here). | owner | the frozen oracle's Group P rows; owner supplies 3-5 real repo names from their org | owner reply, then a one-line oracle edit at the test-notes round |
| R-3 | Group P rows are not fixture-sourced. | owner / test-author | replace with real names if the owner provides them | test-notes round |
| R-4 | Whether the marker actually appears on both cells, and whether blank rows now fill, cannot be observed here: no component renders under vitest (`docs/loop/this-repo.md` section 6). | owner | the browser, on the course that showed blank columns | AC-Z5, after the wave ships |
| R-5 | Which of H1-H4 applies to the owner's course is undetermined (no live database, no read of the tile). | owner | the Binding column of a blank row, the roster picker text ("No roster loaded"), and the tile's institution + Canvas URL fields | one look, now - it also tells whether W is worth scoping |
| R-6 | W (binder widening so a name-slug of a stored/hand-typed roster name matches the handle, including comma-inverted names) fixes H2/H3 accurately but changes "suggested" classification and the batch-confirm set; not scoped here. | owner decides; then the AC seat | a new scope doc + `repo-student-bindings.test.ts` frozen cases; posting-safety review | only if the owner answers F1's terminating question "yes" |
| R-7 | RG-SEARCH-STICKY feature 3 must key the grading set on `row.repo`, not on a name (S5). | RG-SEARCH-STICKY AC seat | that item's AC document | its AC round |
| R-8 | A guess of the wrong name order (last-first repo, e.g. `smith-john`) will sort under the wrong key when F2 recommended is taken. | owner | the flagged cell + the oracle's KNOWN-WRONG row | accepted by F2; revisited only if W ships |
| R-9 | Confirmed rows with a blank stored name and no live roster entry (`derivedHandle` null) stay blank. | orchestrator | one more row in the oracle if the owner wants a handle derived for rule-a rows | owner call; not in this wave |
| R-10 | `a04a174e` (the prior verify commit) is not resolvable in this checkout; the verify claim is read only from `docs/BACKLOG.md:190`. | orchestrator | `git log --all --oneline \| grep a04a174e` (empty here) | reconcile the hash at the next backlog pass |

---

## 7. What I could not determine

- The owner's actual course configuration (institution, Canvas URL, whether
  Canvas credentials are valid, whether `course.roster` text exists). This
  environment has no live database or Canvas access
  (`docs/loop/this-repo.md` section 6). The verdict (A) rests on the code path
  and on probes P1-P5 over fixtures I constructed from the app's own naming
  transform; the Binding-column look in section 0 is what confirms it against
  the owner's data.
- Whether any real org in use names repos in a way the proposed rules
  mis-read (R-2).
- How the page looks on screen (R-4).
