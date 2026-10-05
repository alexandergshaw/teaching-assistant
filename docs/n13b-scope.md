# N13b scope / recon: the subset call-out is SHIPPED; what remains is a fork and residuals

Row: `docs/backlog.yml`, `- id: 'N13b'` (extracted this pass with a YAML parse,
not a line grep, because the note is one multi-KB single-quoted scalar). Read in
full this pass.

**This document REPLACES the previous `docs/n13b-scope.md` (the original
pre-build scope dated 2026-09-23, recoverable from git), because the premise that
version and the dispatch brief were written under - "N13b is unbuilt; scope the
build" - is false against the tree as of 2026-10-05. N13b's three parts (a) a
subset classification, (b) per-student attribution, (c) two outputs with a
name-safety boundary are all SHIPPED and reachable. This is a RECON + residual
scope, not a build scope. The disposition table in section 2 maps every prior
requirement to its shipped commit or its surviving residual; a fresh
`loop-checker` should verify that mapping against the tree before any build is
dispatched, because the correct build here is almost nothing.**

Every quantity names the command that produced it. Every code claim is a
`file:line` opened this pass.

---

## 0. The conflict with the dispatch brief, stated plainly and measured

The brief says: "THE MEASURED DEFECT (confirm against the tree): classifyDirection
(src/lib/grade/class-trends.ts:178-196) reads 'consistently' LITERALLY ... so
4-of-9 missing an area ... renders NO clause. On any realistically mixed class the
modal output is just the opening sentence and nothing else." And: "A fresh
loop-checker reads it before any build."

Both halves are stale, and I must not adopt the brief's premise silently
(architecture-seat rule: refuse a ruling you can disprove).

- **`classifyDirection` is at `class-trends.ts:274-295`, not `:178-196`** (`grep
  -n "classifyDirection" src/lib/grade/class-trends.ts` -> `274`, `475`). The
  `:178-196` citation matches neither the current tree nor the current AC doc
  (which cites `:184-205`); it is the line range from an earlier revision. The
  thresholds are `HIGH_PERCENT_THRESHOLD = 70` (`:114`) and
  `LOW_PERCENT_THRESHOLD = 60` (`:115`).
- **The literal "consistently" reading is STILL present and is CORRECT to leave
  as-is.** `classifyDirection` (`:286` `allHigh`, `:290` `allLow`) still returns
  `high`/`low` only when every percent value is on one side of the line, and
  `mixed` otherwise. The owner's own ruling (row note; AC doc `:17-20`) is that
  the subset call-out is **additive** to this signal, never a replacement. So the
  defect the brief describes was real and has been FIXED by a different, additive
  mechanism, not by changing `classifyDirection`.
- **"The modal output is the opening sentence and nothing else" is no longer
  true.** `composeClassTrendsDraft` now emits a third clause shape -
  `renderSubsetClause` (`class-trends-draft.ts:102-108`) - and adds it to
  `bodyLines` (`:233`) regardless of `areaFullyCovered`. On a class where 3+
  distinct students missed points on one area, the draft now has content and
  `status: "ok"` (`:240-242, :269`). The 4-of-9 case the owner named renders a
  clause today.

**Conclusion: there is no build to dispatch for N13b's core.** What remains is
one OWNER FORK (section 5) and a short residual register (section 7), one entry of
which is a genuine, small, buildable gap (the AC-4 disclosure, R-N13b-2).

The brief also asks me to recommend a subset-threshold value as an owner fork.
That is moot: the owner already set it (`SUBSET_MIN_STUDENTS = 3`,
`class-trends.ts:142`; owner verbatim in the row and AC doc `:15-16`, "three or
more students"). I do not re-litigate it.

---

## 1. As-built architecture (recon the checker verifies)

Traced end to end, shipped commits confirmed with `git log --oneline -1 <hash>`:

- **Wave 1 `e1befd23`** `feat(n13b): wave 1 - name-filter the class-trends
  class-addressed draft (closes a live leak)`.
- **Wave 2 `9a7b13a1`** `feat(n13b): wave 2 - 3+ distinct-student subset callout
  + instructor named list (option X)`.

### Layer A - the counted subset (`src/lib/grade/class-trends.ts`, 552 lines; `wc -l` = 552, `@(Get-Content).Count` = 552, agree)

- `SubsetIdentity` (`:132-138`): a three-variant seam - `per-result` (Canvas
  family default; one graded result is one student), `resolved` (a future roster
  channel), `unavailable` (repo family today; subset suppressed).
- `SUBSET_MIN_STUDENTS = 3` (`:142`), owner-set absolute count.
- `AreaTrend.missedSubset` (`:187`): `{ studentCount; denominator;
  unknownExcludedCount } | null`. NUMBERS ONLY, no identity - so a name cannot
  reach the class draft through this field by construction.
- `AreaAttribution` / `ClassTrendsReport.instructorAttribution` (`:194-199,
  :237-241`): the NAMED per-area list, instructor-facing only.
- `isSubsetTrend` (`:204-206`): the ONLY place `>= SUBSET_MIN_STUDENTS` is
  evaluated.
- The count (`:481-509`): over `subsetByKey` (distinct identity), counting a
  parsed `percent` score `< 100` as "missed" (`:491`); `raw-number`/`unscored`
  are added to `unknownExcludedCount` and excluded from both terms (`:495-499`).
- `describeDeduction` (`:376-379`): `<= 5` off reads "a trivial deduction", else
  "N% off" - the instructor-list size qualifier (AC-5).
- `classifyDirection` (`:274-295`): UNCHANGED high/low/mixed signal, additive.

### Layer C - the class-addressed draft (`src/lib/grade/class-trends-draft.ts`, 270 lines; both counters agree)

- `composeClassTrendsDraft`'s first param is `Omit<ClassTrendsReport,
  "instructorAttribution">` (`:162-163`): a read of the named field in the
  class-addressed render domain is a COMPILE ERROR, not a discipline.
- `renderSubsetClause` (`:102-108`): "Worth a closer look: {area} - {studentCount}
  of {denominator} students missed points on this area." States its OWN
  denominator (`missedSubset.denominator`), NOT `report.totalResults` (AC-7).
- Subset clauses are **not** filtered through `areaFullyCovered` (`:219-227`,
  AC-6) but ARE passed through the same phrase/identifier filters as every clause.
- Name-leak guards (Wave 1): `carriesKnownIdentifier` (`:129-135`) and
  `containsForbiddenCompletenessPhrase` applied to `assignmentName` (`:178-193`),
  each clause (`:207-212, :222-227, :231`), and the whole assembled markdown
  (`:251-267`).
- Worth-sending gate: `status: "empty"` iff `bodyLines.length === 0` (`:240-242`);
  otherwise `status: "ok"`. The subset clause participating in `bodyLines` is the
  mechanism that makes a mixed class "worth sending."

### Surface (the reachability layer - the surface IS a layer, and it is wired)

- `ClassTrendsPanel.tsx` (233 lines) takes an `identity?: SubsetIdentity` prop
  (`:88, :101`), computes `computeClassTrends(entry, identity)` (`:106`), and
  mounts BOTH outputs: `ClassTrendsStudentListPanel` (`:171-174`, the named
  instructor list) and `ClassTrendsDraftPanel` (`:224-228`, the class draft).
- `ClassTrendsStudentListPanel.tsx` (121 lines): instructor-only named list,
  reads `instructorAttribution` never `.student`, with a distinct
  `unavailableReason` state for the repo surface (`:67-73`).
- **5 mount surfaces** (`grep -rln '<ClassTrendsPanel' src/app --include=*.tsx`):
  `DraftedGradesTab.tsx`, `grading-recording/GradingRecordingPanel.tsx`,
  `GradingResults.tsx`, `repo-grades/index.tsx`,
  `snapshot-grading/SnapshotGradingPanel.tsx`. All mount the shared
  `ClassTrendsPanel`, so both outputs reach all five without per-surface wiring.
- Repo surface passes `{ kind: "unavailable", reason:
  REPO_TRENDS_SUBSET_UNAVAILABLE_REASON }` (`repo-grades/index.tsx:902`;
  constant at `classTrendsFolderEntry.ts:128-130`), so the subset is SUPPRESSED
  there rather than naming repos as students (this is option X).

### Guards shipped (the instruments a checker can re-run)

- `classTrendsDraft.not-postable.test.ts` (256 lines): `FORBIDDEN_PATH_PREFIXES`
  now 5 entries incl. `lib/llm`, `lib/gemini` (`:58`); roots list EXPLICITLY
  includes `ClassTrendsStudentListPanel.tsx` (`:231`) with test W2-16 (`:249`)
  asserting the leaf is a member of roots (AC-10/AC-12 enforcer; the instructor
  leaf cannot reach a posting or model capability).
- `classTrends.wiring.test.ts` (315 lines), `classTrendsDraft.wiring.test.ts`,
  `repoGradesClassTrends.wiring.test.ts`: source-text mount/shape pins (AC-12).
- `class-trends.test.ts`, `class-trends-draft.test.ts`: layer A/C unit coverage
  (AC-1..AC-9).

---

## 2. Disposition of the PRIOR scope and the AC criteria

Restructuring a prior version requires this table; the id column is re-derived
last. "Kept" = shipped and still holds; "handed over" = passed to a named later
obligation; "withdrawn" = no longer applies, with reason.

### Prior `n13b-scope.md` waves

| Prior item | Disposition | Evidence |
|---|---|---|
| Wave 1 (layer A subset shape, attribution-carrying) | KEPT - shipped | `9a7b13a1`; `class-trends.ts:132-206, :481-540` |
| Wave 2 (layer C clause + per-student output + name-safety) | KEPT - shipped | `e1befd23` (name filter) + `9a7b13a1`; `class-trends-draft.ts:102-108, :162-163`; `ClassTrendsStudentListPanel.tsx` |
| Wave 3 (four surfaces verified against real entries) | KEPT - shipped, and WIDER than scoped (5 surfaces, not 4) | `grep -rln '<ClassTrendsPanel'` = 5 |
| Prior R1 (reconcile names with 3 name-exclusion enforcers) | KEPT - discharged by the type-level split | `composeClassTrendsDraft` param `Omit<...,instructorAttribution>` (`:162-163`); leaf reads `instructorAttribution` not `.student` |
| Prior R2 (owner confirm AC-4/AC-5) | HANDED OVER -> R-N13b-1 | non-gating owner confirmation; code implements the recommendation |
| Prior R3 (AC-11/RES-W3-4 + repo count identity basis) | HANDED OVER -> R-N13b-3 + the X/Y fork (section 5) | neutralized under option X by suppression; only binds under option Y |
| Prior R4 (confirm no-model enforcer content) | KEPT - discharged | `not-postable.test.ts:58` bans `lib/llm`/`lib/gemini`; sabotage proof per `leverage.md:160-167` |
| Prior R5 (repo: repo-name vs roster-student) | = RES-W3-4, HANDED OVER -> R-N13b-3 | `github-repos.ts:619` (`student: label?.trim() || digest.fullName`) |
| Prior R6 (layer B per-student naming) | WITHDRAWN as out-of-scope; layer B stays anonymised by design | `class-trends-insight.ts` anonymiser; no owner request to change it |

### AC criteria (`docs/n13b-acceptance-criteria.md`)

| AC | Disposition | Shipped enforcer / evidence |
|---|---|---|
| AC-1 counted per-area distinct-student count | KEPT | `class-trends.ts:481-502`; `class-trends.test.ts` |
| AC-2 threshold `>= 3` distinct students | KEPT | `isSubsetTrend` (`:204-206`), `SUBSET_MIN_STUDENTS` (`:142`) |
| AC-3 "missed points" = any deduction, additive | KEPT | count on `value < 100` (`:491`); `classifyDirection` unchanged (`:274-295`) |
| AC-4 unparseable/scale-less = UNKNOWN, excluded, **disclosed** | PARTIAL - count side KEPT, DISCLOSURE NOT RENDERED -> R-N13b-2 | `unknownExcludedCount` computed (`:502`) but rendered NOWHERE (`grep unknownExcludedCount src --include=*.tsx` = 0 non-test hits) |
| AC-5 trivial deduction counts, reads trivial | KEPT | `value < 100` counts; `describeDeduction` (`:376-379`) labels it |
| AC-6 subset clause NOT gated on full coverage | KEPT | `class-trends-draft.ts:219-227` |
| AC-7 clause states its own denominator | KEPT | `renderSubsetClause` uses `missedSubset.denominator` (`:106-107`) |
| AC-8 two outputs; no name on class text | KEPT | type-level `Omit` (`:162-163`) + name filters + `not-postable` canary |
| AC-9 named list = counted set | KEPT | `instructorAttribution` built from the same `missedStudents` (`:503-508`) |
| AC-10 no model generation | KEPT | `not-postable.test.ts:58` |
| AC-11 repo attribution shows roster student | HANDED OVER -> X/Y fork; under X the subset is suppressed on repo surface so no wrong name is shown | `repo-grades/index.tsx:902` passes `unavailable` |
| AC-12 both outputs reachable | KEPT - 5 surfaces | `grep -rln '<ClassTrendsPanel'` |
| OV-1/OV-2 owner screen walk | OPEN - owner only | no component renders under vitest (`this-repo.md` s6) |

---

## 3. Remaining acceptance criteria (only for work not yet shipped)

Each names the OBJECT, the INSTRUMENT, and the DIRECTION of failure. Only
R-N13b-2 is machine-checkable and buildable by an agent; the rest are owner
decisions or owner-only walks.

**V-AC-A (R-N13b-2, buildable) - the count of unknown-scale scores excluded from
a subset is disclosed to the instructor.** AC-4's recommendation says the clause
"discloses their presence"; today `unknownExcludedCount` is computed and carried
but surfaced in no rendered text, so a subset of "3 of 5" computed while 4 other
students had unscored work reads as if those 4 were fine.
- Object: the instructor-facing per-student panel's rendered text for an area with
  `missedSubset.unknownExcludedCount > 0`, versus the presence of a disclosure of
  that count.
- Instrument: a unit test over a pure formatter (e.g. a `buildStudentListText`
  successor, or a new pure helper in `class-trends.ts`) fed an `AreaAttribution` +
  its `missedSubset`; OR a source-text assertion in
  `ClassTrendsStudentListPanel`'s wiring suite. NOT a render test (none exist
  here).
- Direction: RED if, for an area with `unknownExcludedCount > 0`, the formatter's
  output contains no mention of the excluded/unknown-scale count.
- NOTE: whether this is wanted at all, and on which surface (instructor list only,
  or also the class clause), is an owner/architect call - this V-AC fires only if
  the owner confirms AC-4's disclosure half is desired (R-N13b-1 covers that
  confirmation). Do not build it before that answer.

**V-AC-B (the X/Y fork, owner-gated) - Repo Grades names roster students, or
continues to suppress.** See section 5. No criterion is buildable until the owner
picks X or Y.
- If option Y: Object = the named attribution for a bound repo row, versus the
  roster student in `RepoGradeRow.binding`. Instrument = unit test over the repo
  attribution mapping with a bound and an unbound row. Direction = RED if a bound
  repo row's attribution shows the repo label / `digest.fullName` instead of the
  bound roster student, OR if two repos bound to one roster student count as two
  toward `SUBSET_MIN_STUDENTS`.
- If option X (recommended): no new criterion; the existing suppression
  (`repo-grades/index.tsx:902`, `unavailable`) stands, and AC-11 is withdrawn as
  moot on that surface.

---

## 4. Architecture of the remaining work

**Under option X (recommended): no architecture change.** Everything is shipped.
R-N13b-1 is a yes/no owner confirmation; R-N13b-2, if the owner wants it, is a
localized change to ONE pure formatter plus its test - no seam moves, no new
layer, no identity threading.

**R-N13b-2 shape, if built.** The disclosure is a presentation concern over data
that already exists (`missedSubset.unknownExcludedCount`). It belongs where the
instructor list text is built - `ClassTrendsStudentListPanel.tsx`'s
`buildStudentListText` (`:27-34`) and its `<li>` render (`:99-104`). Because that
component already receives only `AreaAttribution` (names), and
`unknownExcludedCount` lives on `AreaTrend.missedSubset` (numbers), surfacing it
requires EITHER (a) extending `AreaAttribution` to carry the per-area
`unknownExcludedCount` (a numbers-only field, no identity, so the class/instructor
boundary is untouched), OR (b) passing the relevant `AreaTrend[]` subset to the
panel. Option (a) is the smaller change and keeps the panel's single-prop shape.
This is a design choice for the build's own architect pass IF R-N13b-1 returns
"yes"; it is recorded here, not decided, because building it before the owner
confirms the disclosure is wanted would ship an unrequested surface change.

**Under option Y: the ~5-file repo roster-identity channel.** This is a real
build and it is NOT scoped here because it is owner-gated and the recommendation
is against it. The row already records its shape: "~5 files through the
concurrency-sensitive bulk worker." If the owner picks Y, it gets its own scope
pass (new activity, new two-round budget), threading `RepoGradeRow.binding`
(`repoGradesRows.ts:119`) into a `resolved` `SubsetIdentity` (`class-trends.ts:135`,
the seam already exists for exactly this) so the repo surface can switch from
`unavailable` to `resolved` and both the COUNT and the NAME use the roster
student. The `resolved` variant's `keyOf` must dedup two repos owned by one
roster student to one key (AC-1/AC-7 identity-basis requirement).

---

## 5. The fork: Repo Grades subset identity (OWNER-GATED, recommend X)

This is the only genuine open decision in N13b. It is already owner-gated in the
row ("WAVE 3 ... remains OWNER-GATED on the X/Y fork"), so per SHAPE-5 I record
the recommendation and the cost of each side; I do not gate on it, and there is
no build to start under the recommended side.

- **Option X (RECOMMENDED, and already shipped as the default):** on Repo Grades,
  the subset identity is `unavailable`; the subset count and named list are
  suppressed and the panel shows the reason
  (`REPO_TRENDS_SUBSET_UNAVAILABLE_REASON`,
  `classTrendsFolderEntry.ts:128-130`). Canvas-family surfaces are unaffected.
  - Cost of being wrong: an instructor grading repos sees "per-student trends are
    not available here" instead of a subset call-out on the one surface where
    repo-to-student binding is ambiguous. The feature's whole value still ships on
    the four Canvas-family surfaces. Cost = zero new code; the feature is complete.
- **Option Y:** build the repo roster-identity channel (~5 files, through the
  concurrency-sensitive bulk worker) so Repo Grades counts and names roster
  students via `RepoGradeRow.binding`.
  - Cost of being wrong: ~5 files of new code touching the concurrency-sensitive
    bulk worker (the row flags this), for a subset call-out on one surface; plus
    the AC-1/AC-7 risk that an unbound or multiply-bound repo miscounts toward the
    `>= 3` threshold if the dedup is imperfect - a wrong NAME to an instructor is
    exactly the misattribution class `leverage.md` ATTRIBUTION exists to forbid.

**Recommendation: X.** The feature delivers the owner's request (see a mixed-class
subset, name the students to contact) on every Canvas-family surface today;
option Y adds surface area and an attribution-correctness risk to extend it to one
more surface whose identity join does not exist yet. The question rides to the
owner; nothing is blocked, because under X nothing further ships.

---

## 6. Wave plan (for the remainder only)

Under option X with R-N13b-1 answered "no" (no disclosure wanted): **there is no
wave. N13b is complete; move its backlog state to `verification` and record the
residuals below.**

If R-N13b-1 returns "yes, surface the excluded-unknown count": **one wave, one
build, independently gateable and pushable.**

- **Wave R2** (`owns`: the two files below plus their tests)
  - `src/app/components/drafted-grades/ClassTrendsStudentListPanel.tsx` (the
    renderer - the CALLER that surfaces the count)
  - `src/lib/grade/class-trends.ts` ONLY IF option (a) of section 4 is chosen
    (extend `AreaAttribution`); otherwise untouched
  - tests: `src/lib/grade/class-trends.test.ts`,
    `src/app/components/drafted-grades/classTrends.wiring.test.ts`

Gate for Wave R2 (multi-path form, one path per argument - never a raw
multi-path `vitest`):

```
npm run test:paths -- \
  src/lib/grade/class-trends.test.ts \
  src/lib/grade/class-trends-draft.test.ts \
  src/app/components/drafted-grades/classTrends.wiring.test.ts \
  src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/lib/no-emojis.test.ts \
  src/source-bytes.structure.test.ts \
  src/tools/strip-comments-agreement.structure.test.ts
```

- `file-size-ceiling.structure.test.ts` runs UNCONDITIONALLY (repo-wide 1000-line
  ceiling; the two touched files are 121 and 552 lines, far under).
- `no-emojis.test.ts`, `source-bytes.structure.test.ts`, and
  `strip-comments-agreement.structure.test.ts` are the content-triggered corpus
  canaries that fire when `src/**` text changes - included because Wave R2 edits
  `src/**` (per the gate-must-include-directory-canary rule).
- `not-postable.test.ts` is included because it walks the import graph from
  `ClassTrendsStudentListPanel.tsx` (a canary-3 root, `:231`); any edit to that
  leaf must re-prove it reaches no posting/model capability.

Option Y, if chosen by the owner, is a SEPARATE scope pass (new activity), not a
wave of this one.

## 6a. `owns` file set (command + pasted output)

The N13b file family, from `git ls-files 'src/lib/grade/class-trends*'
'src/app/components/drafted-grades/classTrends*'
'src/app/components/drafted-grades/ClassTrends*'
'src/app/components/repo-grades/classTrends*'
'src/app/components/repo-grades/repoGradesClassTrends*'
'src/app/components/grading-results/classTrends*'
'src/app/components/grading-recording/classTrends*'`:

```
src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx
src/app/components/drafted-grades/ClassTrendsPanel.tsx
src/app/components/drafted-grades/ClassTrendsStudentListPanel.tsx
src/app/components/drafted-grades/classTrends.wiring.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts
src/app/components/drafted-grades/classTrendsDraftState.test.ts
src/app/components/drafted-grades/classTrendsDraftState.ts
src/app/components/grading-recording/classTrendsRunCohort.test.ts
src/app/components/grading-recording/classTrendsRunCohort.ts
src/app/components/grading-results/classTrendsEntry.test.ts
src/app/components/grading-results/classTrendsEntry.ts
src/app/components/repo-grades/classTrendsFolderEntry.test.ts
src/app/components/repo-grades/classTrendsFolderEntry.ts
src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts
src/lib/grade/class-trends-draft.test.ts
src/lib/grade/class-trends-draft.ts
src/lib/grade/class-trends-insight.test.ts
src/lib/grade/class-trends-insight.ts
src/lib/grade/class-trends.test.ts
src/lib/grade/class-trends.ts
```

Files that read the above AS SOURCE TEXT and will go red on a mismatched change
(the `.wiring.test.ts`, `.not-postable.test.ts`, and `.structure.test.ts` files
above and these repo-wide canaries): `src/file-size-ceiling.structure.test.ts`,
`src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`,
`src/tools/strip-comments-agreement.structure.test.ts`. Wave R2's `owns` is the
narrow subset in section 6; the full family is listed so the checker can confirm
no sibling is silently a source-text reader of an edited file.

---

## 7. Residual register (owner + instrument + step)

A residual missing any of owner / instrument / step is a deletion. Each below is
owed a `docs/BACKLOG.md` entry under N13b by the orchestrator at disposal; a
residual that lives only here does not exist (`iteration-caps.md`).

| id | What is not settled | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-N13b-1 | Owner confirmation of AC-4/AC-5 recommendations: (a) unknown-scale scores excluded + DISCLOSED, (b) any deduction > 0 counts. Code already implements (a)-count and (b); the DISCLOSURE half of (a) is unbuilt (R-N13b-2). Non-gating. | repo owner | AC doc `:200-239`; `class-trends.ts:491-499, :376-379` | One batched non-gating question at hand-off; "yes to disclosure" triggers R-N13b-2, "no" closes it |
| R-N13b-2 | The excluded unknown-scale count is computed (`class-trends.ts:502`) but rendered nowhere, so a subset reads as if excluded students were fine (AC-4 "disclose" half). | N13b architect + implementer (only if R-N13b-1 says yes) | `grep -rn unknownExcludedCount src --include=*.tsx` returns 0; V-AC-A in section 3 | Wave R2 (section 6) builds it; the unit/wiring test is the instrument |
| R-N13b-3 | The X/Y fork: Repo Grades subset identity. Under X (recommended, shipped) suppressed; under Y, roster-identity channel (~5 files). AC-11 / RES-W3-4 bind only under Y. | repo owner (fork), then architect (if Y) | `repo-grades/index.tsx:902` (`unavailable`); `github-repos.ts:619`; `repoGradesRows.ts:119` (`binding`); `SubsetIdentity.resolved` seam (`class-trends.ts:135`) | Owner answers X/Y; if Y, a new scope pass (new activity) |
| R-N13b-4 | Backlog bookkeeping: the N13b row's `state: unscoped` and `owns: []` contradict its own note, which records Wave 1 + Wave 2 shipped. State should be `verification` and `owns` populated from section 6a. | orchestrator | `docs/backlog.yml` N13b `state`/`owns` fields vs the shipped commits `e1befd23`, `9a7b13a1` | Orchestrator reconciles the row at the next push |

---

## 8. What this environment cannot verify (said plainly)

Per `docs/loop/this-repo.md` section 6 - no `.env`, no network under vitest, and
NO COMPONENT IS RENDERED BY ANY TEST:

- OV-1 / OV-2: that the shipped class draft and instructor list read as this
  app's voice, are visually distinct, and name no student on screen. Every claim
  in section 1 about the panels is a SOURCE-READING claim, not a rendering claim.
  Owner walk only.
- Whether the owner, seeing the shipped 4-of-9 subset call-out on a real run,
  agrees it is now "worth sending." The code makes a mixed class produce a clause;
  whether that clause satisfies the owner's intent is the one thing only the owner
  can confirm, and it is the honest close of this item (OV-1).
- The option-Y concurrency behaviour through the bulk worker (the row flags it as
  concurrency-sensitive) cannot be exercised here.

## 9. Gates run by THIS scoping pass

Read-only recon; the tree was only read (`git ls-files`, `grep`, `wc -l`,
`@(Get-Content).Count`, `git log`, `Read`). The only write is this file,
`docs/n13b-scope.md`. No `src/**` file was opened for write, so no code gate
applies to this pass. Sizes were measured with BOTH counters and agreed on every
file cited (`class-trends.ts` 552/552, `class-trends-draft.ts` 270/270,
`ClassTrendsPanel.tsx` 233/233, `ClassTrendsStudentListPanel.tsx` 121/121).
