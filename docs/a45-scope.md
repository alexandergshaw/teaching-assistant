# A45 scope + acceptance criteria - corroborate student identity from outside the zip file paths

Backlog row `A45` (`docs/backlog.yml:751-762`, `grep -n "id: 'A45'" docs/backlog.yml`).
State at filing: `unscoped`. `owns: []`, `verify: null`, `blocked_by: []`
(`docs/backlog.yml:756-758`). This is round 1 of this document. There is no
prior `docs/a45-*` artifact to restructure, so the disposition table
`iteration-caps.md` requires for a restructuring round does not apply here -
stated explicitly rather than omitted silently. Seat: `loop-seat` (dispatched
as the AC/scope pass for this row). Scoping/AC only: no production code, no
test code written. Every file this document cites was opened; every count
was produced by a command shown below or already executed and quoted from
`docs/a44-test-notes.md`/the real test file, never recalled.

Write set for this pass: `docs/a45-scope.md` only. `git status --short` at
the end of this pass is the evidence; it is quoted in Section 10.

## 0. What the row actually says, restated with its own citations

`docs/backlog.yml:755` (the row's title/body): A44's folder-aware refusal
(`decideCollisionRefusal`, `src/lib/grade/collisionRefusal.ts`) grants amnesty
from refusal to a folder-homogeneous colliding group whenever the run shows
two or more distinct folders overall - and on a zip shaped like
per-student folders **plus one shared folder**, that amnesty condition is
satisfied by the shared folder too, so a real collision **inside** the shared
folder is silently allowed. The row states this at **2159 of 19927 (10.8%)**
sets on the shape it calls `mixed-...-shared-dropbox`, and states the one
further attempt the iteration cap allowed (requiring amnesty's folder count
to be `>= 2` distinct folders **each carrying a collision**, not just `>= 2`
folders in the run) is sound but raises the `folder-resubmit` conservative
(false-)refusal rate to 24.0%, worse than a stated 14.5% pre-A44 baseline
(`docs/backlog.yml:755`). The row's `instrument` field
(`docs/backlog.yml:759`) states the pass condition as: the frozen unsound
count on that shape must fall from **2159** toward 0, "with the conservative
false-refusal rate on the resubmit shape staying at or below the **6.4%**
A44 achieves - both numbers reported together."

**Section 1 below measures that these two numbers (2159 and 6.4%) do not
match what is in the tree today.** This is reported as a finding, not
silently corrected - the row's own text is quoted above so the discrepancy
is checkable against it.

## 1. Measured correction: the row's cited numbers are stale relative to the code in the tree

### 1.1 The frozen literal in the suite is 2254 of 19936, not 2159 of 19927

```
$ grep -n "2254\|19936" src/lib/grade/collisionRefusal.test.ts
336:  it("mixed-perstudent-plus-shared-dropbox: unsound-and-allowed is exactly 2254 of 19936 sets", () => {
343:    expect(unsoundAllows).toBe(2254);
```

Executed just now (`npm run test:paths -- src/lib/grade/collisionRefusal.test.ts
src/lib/grade/identityInvariants.test.ts src/lib/grade/utils.test.ts`, full
output below in Section 8) reproduces this: `mixed-perstudent-plus-shared-dropbox:
unsound-and-allowed is exactly 2254 of 19936 sets` passes, green, today,
2026-09-29.

`docs/a44-test-notes.md:873` explains the discrepancy in its own words: round
1's `2159 of 19927 (10.8%)` came from a generator that was never committed to
the tree; the republished, in-tree generator
(`src/lib/grade/submissionShapeGenerator.ts`, `DEFAULT_SEED = 20260927`,
`DEFAULT_SWEEP_N = 20000` at `:75-76`) measures **2254 of 19936 (11.3%)** on
the same named shape, "and the difference is the GENERATOR, not RULE K"
(`docs/a44-test-notes.md:873`). `docs/a44-test-notes.md:2107` (residual
RES-A44T-8) states the accepted number as **2254 of 19936 (11.3%)** as well.
The row's `instrument` field (`docs/backlog.yml:759`) was written quoting the
withdrawn round-1 number, not the frozen literal that actually ships in
`collisionRefusal.test.ts`.

The **second** accepted-unsound shape, `nested-shared-dropbox-subdirs`, is
frozen at **287 of 19990** (`collisionRefusal.test.ts:346-354`, confirmed
green just now) and is not mentioned in the row's `instrument` field at all,
even though it is produced by the exact same amnesty branch
(`collisionRefusal.ts:76-80` - see Section 2) and is listed as an accepted
unsoundness in the same residual (`docs/a44-test-notes.md:2107`).

### 1.2 The false-refusal side has no frozen literal in the tree at all - "6.4%" is not reproducible

```
$ grep -n "1255\|19972\|folder-resubmit" src/lib/grade/collisionRefusal.test.ts
293:    "folder-resubmit",
```

`"folder-resubmit"` appears in `collisionRefusal.test.ts` exactly once, as a
member of `SOUND_SHAPES` (`:283-298`), which is asserted through the
`it.each` at `:304-308` - "zero fallback-caused blends are ever ALLOWED".
That is a **soundness** property (no true blend is ever silently accepted on
this shape), not the false-refusal **rate** the row's instrument names.
There is no test anywhere in `src/lib/grade/*.test.ts` that computes or
freezes a conservative/false-refusal count for `folder-resubmit` (confirmed:
the only other hits for `folder-resubmit` in the whole `src/lib/grade`
directory are the shape-name registration in
`submissionShapeGenerator.ts:93,223` and its inclusion in
`identityInvariants.test.ts:608,656` for a different invariant family).

`docs/a44-test-notes.md:1159-1188` (its own "R3") explains why: round 1's
`2891 (14.5%)` pre-A44 baseline "came from its own scratchpad" and "its
definition is not reproduced in any artifact handed to this pass in enough
detail to implement" (`:1179-1181`). The test notes measured the **post-A44**
half directly: **1255 of 19972 (6.3%)**, not 6.4%, and state R3 "cannot be a
frozen pair; it is a within-run inequality" and that "asserting the RATE" is
a "forbidden spelling" because "rates hide a changed denominator" (`:1184`).
No executable assertion of even that within-run inequality exists in
`collisionRefusal.test.ts` today - it is documented in the test notes but was
never turned into a test.

**So the row's own pass condition ("staying at or below the 6.4% A44
achieves") names a number that is neither the code's frozen value (there is
none) nor the test notes' own measured value (6.3%, and explicitly not a
literal to freeze).** Section 5's AC anchors this half of the row to the
within-run comparison method the test notes already worked out, using
whatever count the SAME generated population produces on both sides in the
same run, and explicitly rejects "6.4%" as a target.

### 1.3 Recommendation on the discrepancy (not a decision)

Recommend: this scope's AC (Section 5) is written against the measured
values above (2254 / 19936, 287 / 19990, and the within-run `folder-resubmit`
comparison), not against the row's stale 2159/6.4%. This is filed as
**RES-A45-1** in the residual register (Section 7) rather than silently
edited into `docs/backlog.yml`, because rewriting another artifact's stated
numbers is outside this document's write set.

## 2. The A44 amnesty branch - exact condition, and where corroboration plugs in

`src/lib/grade/collisionRefusal.ts:38-90` is `decideCollisionRefusal`. Read
in full for this pass. The load-bearing lines:

```
43:  const distinctFolders = new Set<string>();
...
54:    const decoded = a44DecodeKey(parsed.studentKey);
55:    if (decoded && decoded.length === 2) {
56:      distinctFolders.add(decoded[0]);
57:    }
...
75:    const decoded = a44DecodeKey(key);
76:    const hasFolder = decoded !== null && decoded.length === 2;
77:    if (hasFolder && distinctFolders.size >= 2) {
78:      continue; // RULING 87's refined amnesty: the run gate is open and this
79:      // group's own folder makes it distinguishable from any other student's.
80:    }
```

`distinctFolders` (`:43,56`) is populated from **every** file in the run that
reaches stem fallback and decodes to a `[dir, stem]` key - it counts folders
across the whole run, not per colliding group. The amnesty test at `:77` is:
this colliding group has *a* folder (`hasFolder`), and the run as a whole has
`>= 2` distinct folders *somewhere*. It does not require that the group's
**own** folder be one of two or more folders that **each** carry a
collision, and it does not require the group's own folder to be
distinguishable from *other members of the same group*. On the
"per-student-folders-plus-one-shared-folder" shape, the shared folder itself
is one of the `>= 2` distinct folders the run gate counts, so a real
cross-student collision **inside** that one shared folder passes `hasFolder
&& distinctFolders.size >= 2` and is granted amnesty - it is never
distinguished from the per-student folders elsewhere in the same run, which
is exactly the measured 2254/19936 hole in Section 1.

**This is the one branch corroboration must reach.** A known-student list
lets the amnesty test move from "does *a* folder exist and are there `>= 2`
folders in the run" to "does the group's own folder segment (or the
colliding files' own name tokens) actually corroborate against a *specific*,
*distinct* known student for each colliding member" - which is evidence the
file paths alone cannot supply, exactly as the row states.
`folderForCopy` (`:110-113`) already recovers the group's raw,
case-preserving folder text via `a44ContainerRelativeDir` for display
purposes only; that is the same raw text a corroboration check would need,
not the lower-cased decoded key (the file's own doc comment at `:104-106`
warns against confusing the two).

`describeCollisionRefusal` (`:141-152`) is a `default`-less exhaustive
`switch` over `CollisionRefusalDecision["status"]` - a new decision variant
added without a case here fails `npx tsc --noEmit` (the file's own doc
comment, `:134-139`, and confirmed structurally true: TypeScript's
exhaustiveness checking on a discriminated union with no `default` clause
rejects an unhandled member at compile time). Whatever shape the
corroboration decision takes (Section 4), this guarantee is inherited for
free as long as it stays inside `CollisionRefusalDecision`.

## 3. Known-student-list sources: what exists, which is authoritative, and what is reachable where `decideCollisionRefusal` runs today

### 3.1 Three sources exist in the tree; none is read by the zip grading path

**(a) `course.roster` - free text, names only.**
`src/lib/supabase/courses.types.ts:74` (`Course.roster: string | null`) and
`:267` (the update-input mirror). It is parsed by
`parseRosterNames` (`src/app/components/grading-recording/grading-course-roster.ts:30-42`):
splits on newlines, takes the text before a trailing `|` on each line (so a
line may optionally carry `Name | githubusername`, per that file's own header
comment at `:6-8`), trims, de-duplicates. Output is a flat list of **display
names** ("Maria Alvarez"-shaped), not usernames.

**(b) `course.studentRepos[].username` - GitHub usernames, structured.**
`CourseStudentRepo` (`src/lib/supabase/courses.types.ts:53-59`) has
`student: string`, `canvasUserId: string | null`, `repo: string`,
`username?: string | null`, `email?: string | null`. This is the field the
existing repo-to-student binder (`src/lib/repo-student-bindings.ts`) reads:
`tierStoredUsername` (`:159-175`) matches a derived repo handle against
`row.username` case-insensitively - this is Tier 1 of that binder's rule
order (module header, `:25-30`). Roster-derived matching (`loginId`, then
`repoSlug(name)`) is Tier 2/3, consulted only if Tier 1 finds nothing
(`:249-259`). **`studentRepos[].username` is therefore the authoritative
GitHub-identity field in this codebase** - matching the "roster text vs
studentRepos" fact this task was briefed with. `course.roster`'s own
optional `Name | username` convention (grading-course-roster.ts:6-8) is a
second, unsynced place a username-shaped hint could live, and nothing in
`repo-student-bindings.ts` reads that half of a roster line at all
(`parseRosterNames` explicitly discards everything after the `|`,
`grading-course-roster.ts:36-38`) - confirming the two fields the task's
brief warned about, and confirming which one the binder actually reads.

**(c) Canvas's own live user list - `listCourseRosterAction`.**
`src/app/actions/canvas-inbox.ts:103`, returning `CanvasRosterEntry[]`
(`src/lib/canvas/listings.ts:278`, built by `listCourseRoster` at `:286`).
Requires a live network call keyed on `institution` + `courseId`. Existing
consumers: `AddCourseForm.tsx:189`, `useCourseImportActions.ts:333`,
`useRepoGradesData.ts:333`, several workflow steps
(`steps.course-setup.rosters.ts:201,320`) - **none of them is the grading
zip-upload path.** Per this repo's own documented constraint (`AGENTS.md`
"Feature work" card and the standing memory that `vitest.setup.ts` throws on
any real fetch), this source is unreachable under this checkout's test
harness and unreachable without a live institution/courseId/token at grading
time.

### 3.2 Reachability at the point `decideCollisionRefusal` actually runs: none of the three, today

Every call site was opened:

- `src/lib/grade/engine.ts:365-371` - `gradeSubmissions(zipBuffer,
  assignmentInstructions, rubric, provider, options: GradingRunOptions =
  {})`. `GradingRunOptions` (`engine.ts:138-145`) has exactly one field,
  `deadlineMs`. Calls `decideCollisionRefusal(submissions, zipParents)` at
  `:384` - two arguments, no course/roster/list of any kind.
- `src/lib/grade/extraction.ts:154-175` - `extractStudentEntries(zipBuffer,
  options?: { readonly inferFileNamesWith?: LlmProvider })`. Calls
  `decideCollisionRefusal(submissions, zipParents)` at `:167` - same two
  arguments.
- `src/app/actions/grading.ts:714-717` - `gradeAction(_prev, formData:
  FormData)`. Read the full destructuring at `:718-737`: `studentSubmissions`
  (file), `canvasUrl`, `assignmentInstructions`, `rubric`, `provider`,
  `rubricFile`, `institution`, `runDeadlineMs`. **No `courseId` field, no
  roster field, nothing course-scoped, on the zip-upload branch.** (A
  `canvasUrl` field exists, used only by the Canvas-source branch for a
  different action entirely - `parseCourseIdFromCanvasUrl` appears elsewhere
  in this file at `:143,250` for that separate Canvas-listing flow, never on
  the zip path.) Calls `decideCollisionRefusal(submissions, zipParents)` at
  `:932`, same two arguments.
- The one client caller of `gradeAction`: `src/app/page.tsx:68`
  (`useActionState(gradeAction, initialState)`). The grading form itself
  lives in `src/app/components/GradingTab.tsx`; its only course-shaped state
  is `gradingTarget: { title, courseName, key }`
  (`GradingTab.tsx:102-104,224`) - `courseName` is a **display string** for
  the banner (`:607`), not a course id, not a roster, not `studentRepos`.
  Confirmed by reading the full `gradingTarget` type and its one setter
  (`:224`, populated from a Live Feed row's `courseName` field, itself a
  label).

**Conclusion, stated plainly: the known-student list is not in scope at any
point in the zip-grading call chain today, all the way from the React form
down to `decideCollisionRefusal`'s own signature.** This confirms the row's
"THE ZIP PATH READS NONE OF THEM" claim by direct reachability trace rather
than by restating it, and it means A45 is not "plug a corroboration check
into an existing parameter" - it is new plumbing through four layers
(`gradeAction` formData -> `GradingRunOptions`/`extractStudentEntries`
options -> `gradeSubmissions`/`extractStudentEntries` -> new optional
parameter on `decideCollisionRefusal`), plus, upstream of all of that, no
confirmed source of a course selection on the grading form itself to draw
the list FROM in the first place (Section 7, RES-A45-4).

## 4. The corroboration design - recommended, not decided

### 4.1 Existing precedent in this repo: `matchNameAgainstRoster` (reuse-survey)

This repo already has a shipped, tested, pure roster-corroboration idiom -
found by grep, not assumed:

`src/app/components/grading-recording/grading-roster-match.ts` -
`matchNameAgainstRoster(readName, rosterNames)` (`:108-129`) returns one of
four outcomes: `"matched"` (exactly one roster name canonicalizes the same),
`"ambiguous"` (two or more), `"unmatched"` (zero), `"no-roster"`
(`rosterNames` null/undefined/empty - "an absent roster is our gap, not the
student's", the file's own header comment at `:94-97`, mirrored by the
"no-roster" outcome never being conflated with "unmatched"). Matching is
**exact after canonicalization** (`canonicalizeNameForMatch`, `:68-86`):
lowercase, collapse whitespace runs, and fold a `"Last, First"` comma form to
`"First Last"` - explicitly **not** fuzzy and **not** order-independent
token-set matching (the file's own doc comment at `:59-66` explains why: a
token-set comparison would let "Maria Garcia" match "Garcia Maria", which
"nobody writes names that way", and would let a single-token read name pass
a subset check).

This function is already reused twice beyond its origin feature: by
`src/lib/course-intel/offline-identity.ts:335` (`grep -n
matchNameAgainstRoster src/lib/course-intel/offline-identity.ts`, its own
header at `:19` says "REUSED, NOT REINVENTED"), and its source,
`parseRosterNames(course.roster)`, is used identically by
`src/lib/course-intel/cross-course-answer.ts:289` and
`src/app/api/course-intel/ask/route.ts:547`. **Recommendation: A45 should
reuse this exact idiom - exact-after-canonicalization, four-outcome, and the
"absent list degrades to no-op, never to a refusal" discipline - rather than
inventing a new fuzzy matcher.** This satisfies the brief's requirement that
the feature "must not make the feature depend on data that isn't always
there": `matchNameAgainstRoster`'s own `"no-roster"` outcome already is that
degrade-safely behavior, proven in production use elsewhere in this app.

### 4.2 A measured name-shape mismatch this reuse does not solve by itself

The generator this row's own instrument runs against uses concatenated,
no-separator, no-space fixture names: `STUDENTS` in
`src/lib/grade/submissionShapeGenerator.ts:26-42` -
`"AlvarezMaria"`, `"BrownTom"`, `"ChenLi"`, etc. These are exactly the shape
`decideCollisionRefusal`'s own stem-fallback parser produces as
`studentDisplay`: `leafStemFallback` (`src/lib/grade/utils.ts:121-126`)
extracts the leading run of `/^([A-Za-z0-9]+)/` from a file's base name -
one alphanumeric token, unseparated.

`canonicalizeNameForMatch` (Section 4.1) would compare that token against a
roster name written the ordinary way a human types a roster, e.g.
`"Maria Alvarez"`. Lowercased and whitespace-collapsed, these are
`"alvarezmaria"` and `"maria alvarez"` - **not equal**, and
`canonicalizeNameForMatch`'s own doc comment (`:59-66`) says it deliberately
does not do token-set/order-independent comparison, precisely the operation
that would be needed to bridge them. This repo's other existing
normalizer, `repoSlug` (`src/lib/student-repo-names.ts:17-19`, lowercase +
collapse non-alphanumeric runs to a single hyphen), produces
`"maria-alvarez"` - still order-preserving, still not equal to
`"alvarezmaria"`.

**Neither existing normalizer in this codebase bridges a concatenated
name-derived folder/stem token against an ordinarily-typed roster name.**
This is a real, measured design gap, not a hypothetical one - it directly
affects whether a corroboration check reaches 0 unsound on this row's own
frozen generator shapes (Section 1.1's 2254/287), since the generator's own
fixture names are in the concatenated form. Recommendation, not a decision:
either (a) extend the comparison with an additional, order-independent
alphanumeric-token-set match used specifically for this corroboration path
(comparing the *set* of lowercase alphanumeric runs on each side, which
would match `"alvarezmaria"` against tokens `{"maria","alvarez"}` derived
from `"Maria Alvarez"`), clearly documented as looser than
`matchNameAgainstRoster`'s own strict discipline and reserved for this one
call site; or (b) run corroboration only against `studentRepos[].username`
(GitHub handles), which are far more likely to already appear verbatim or
near-verbatim inside a folder name in this app's own GitHub-repo-derived
zips (`studentRepoName`, `student-repo-names.ts:27-31`, is the exact
transform that produced those names in the first place); or (c) both, with
(b) tried first as the stronger, purpose-built signal and (a) as a fallback.
This scope recommends **(c)**, because it reuses two already-existing,
already-authoritative sources instead of relying on one imperfect string
heuristic alone, but this is the architect pass's call, not this one's.

### 4.3 Where the list should be threaded from (recommended, not decided)

Recommend threading an optional `knownStudents?: readonly string[]` (or a
small `{ names: readonly string[]; usernames: readonly string[] }` shape, if
4.2's option (c) is taken) through the same seam `GradingRunOptions` already
is: `gradeAction` reads a new, currently-absent form field, builds the list,
and passes it into `gradeSubmissions`'s `options` and
`extractStudentEntries`'s `options`, which forward it to
`decideCollisionRefusal`'s new third parameter. This is the smallest change
consistent with today's structure (Section 3.2) and requires no change to
`decideCollisionRefusal`'s existing two-argument callers other than adding
the new optional argument - it can default to `undefined`, which by 4.1's
reuse of `matchNameAgainstRoster`'s discipline must degrade to exactly
today's decision (AC-5, Section 5).

**This still leaves RES-A45-4 (Section 7) open: nothing traced in Section
3.2 shows the grading form has a course selected at all**, so "thread the
list from the course" presupposes a course is already known at that point,
which this pass did not find evidence of. The architect pass must settle
that before wiring the list through, or the list will always be empty in
practice and the whole feature will silently no-op via the degrade path -
correct, but pointless.

## 5. Acceptance criteria

Each criterion names the object under comparison, the instrument that
produces the numbers, and the direction that fails it. AC-1 through AC-6 are
**machine-checkable** (pure-function tests over generated/fixture data,
runnable under `vitest`, no network, no rendering). AC-7's checkability
depends on the match-strategy choice (Section 4.2/4.3), which this scope
recommends but does not decide.

**AC-1 (the row's core soundness claim, corrected to the real frozen value).**
Object: the accepted-unsound count on the `mixed-perstudent-plus-shared-dropbox`
shape. Instrument: extend the frozen-literal test at
`collisionRefusal.test.ts:329-344` (or an adjacent one) to call the
corroboration-aware `decideCollisionRefusal` with a **complete, accurate**
known-student list (the generator's own declared `owner` values, Section
4.2's upper bound) over the same `DEFAULT_SWEEP_N`/`DEFAULT_SEED` population
(`submissionShapeGenerator.ts:75-76`), asserting `sets === 19936` (population
unchanged) and `unsoundAllows === 0` (not merely "less than 2254" - a
complete roster is the case the row's own harm scenario needs solved, and
"toward 0" without a numeric floor is not a falsifiable target). Direction:
RED if `sets` moves (population drift, comparing two different
distributions) or `unsoundAllows` is anything other than exactly `0` under a
complete roster.

**AC-2 (the second accepted-unsound shape, same branch, not named in the row's instrument text).**
Object: the accepted-unsound count on `nested-shared-dropbox-subdirs`
(currently frozen at 287 of 19990, `collisionRefusal.test.ts:346-354`).
Instrument: the same construction as AC-1, over this shape. Direction: RED
unless it also reaches exactly `0` under a complete roster - both frozen
counts are produced by the identical amnesty line (`collisionRefusal.ts:77`,
Section 2), so a fix that only reaches one and leaves the other unmeasured
is an inconsistent partial fix on a single shared branch, not two
independent fixes.

**AC-3 (the row's false-refusal / conservative-count guard, corrected to a within-run comparison).**
Object: the conservative (false-)refusal count on the `folder-resubmit`
shape, pre-corroboration vs. post-corroboration. Instrument: a **new** test
(none exists today, Section 1.2), built the same way
`docs/a44-test-notes.md`'s own "R3" (`:1159-1188`) specifies: generate the
`folder-resubmit` shape once, run BOTH the current (no-list) decision and the
corroboration-aware decision (with a complete roster) over the SAME sets in
the SAME process, and compare the two refusal counts directly - never a
percentage (test notes `:1184`, "rates hide a changed denominator"), and
never the row's uncited "6.4%" (Section 1.2). Direction: RED when the
post-corroboration conservative-refusal count is not **less than or equal
to** the pre-corroboration count - corroboration is only allowed to
**reduce or hold** false refusals on this shape, never increase them, since
increasing them is exactly how the one prior attempt in this row's own
history failed its own pass condition (`docs/backlog.yml:755`, the
24.0%-vs-14.5% failure).

**AC-4 (behavior preservation - A44's existing guarantees must not regress).**
Object: every existing soundness/invariant/fixture assertion A44 already
shipped. Instrument, run and confirmed green just now, 2026-09-29, at the
exact per-file lines the wrapper reports:

```
$ npm run test:paths -- src/lib/grade/collisionRefusal.test.ts src/lib/grade/identityInvariants.test.ts src/lib/grade/utils.test.ts
...
COVERED src/lib/grade/collisionRefusal.test.ts files=1 passed=37
COVERED src/lib/grade/identityInvariants.test.ts files=1 passed=107
COVERED src/lib/grade/utils.test.ts files=1 passed=28
Test Files  3 passed (3)
     Tests  172 passed (172)
```

This is the pre-A45 baseline (172 passing, 0 failing). Direction: RED on any
of these 172 dropping from pass to fail, or any of the three files failing
to load, once A45's mechanism lands - the multi-file check MUST be run this
way (the `test:paths` wrapper, one argument per file), never as a raw
`vitest run <path> <path>` (`docs/loop/traps-spec.md`'s multi-path trap: a
raw multi-path `vitest run` silently drops unmatched paths and can exit 0).

**AC-5 (graceful degradation - the feature must not depend on data that is not always there).**
Object: `decideCollisionRefusal`'s decision when the new known-student-list
parameter is omitted, `undefined`, or an empty list. Instrument: a test
asserting the decision is identical (structural `toEqual`, covering `status`,
`group.key`, `group.display`, `group.paths`) to today's decision, on every
one of the 27 hand-written frozen fixtures in `docs/a44-test-notes.md`
section 1.3 and across all 17 shapes in the generator sweep
(`submissionShapeGenerator.ts:82-100`'s `SHAPE_NAMES`), when the new
parameter is absent. Direction: RED on any divergence - matching
`matchNameAgainstRoster`'s own "no-roster is our gap, not the student's"
discipline (Section 4.1) means the new evidence is strictly additive: never
present means never influences the decision, so a course with no roster
loaded is exactly as protected (and exactly as exposed to the amnesty hole)
as before this row ships, never worse.

**AC-6 (type-safety of the decision union is preserved).**
Object: `describeCollisionRefusal`'s exhaustive `switch`
(`collisionRefusal.ts:141-152`), which has no `default` clause. Instrument:
`npx tsc --noEmit` (this repo's existing type gate). Direction: RED
(compile error) if `CollisionRefusalDecision` gains a new `status` member
(Section 7, RES-A45-7) and `describeCollisionRefusal` is not given a
matching `case` in the same change - this is already a structural guarantee
in the file today (`:134-139`'s own doc comment); AC-6 only requires that
whoever implements A45 does not work around it (e.g. by adding a `default:`
clause, which would silently defeat it).

**AC-7 (the match-strategy's own correctness, once chosen - depends on Section 4.2/4.3's fork).**
Object: whichever comparator the architect pass picks between Section 4.2's
options (a)/(b)/(c). Instrument: hand-written fixture-level positive and
negative controls (not the generator sweep, which cannot express "two
different students whose names share a token" without a change to the
generator itself) - at minimum one true-positive proving the comparator
bridges the measured Section 4.2 shape gap (a concatenated folder/stem token
against an ordinarily-typed roster name), and one true-negative proving it
does not collapse two distinct known students onto the same corroboration
match. Direction: RED if the chosen comparator fails the positive control
(the row's own stated problem stays unsolved) or the negative control (a new
false-corroboration hazard, worse than doing nothing, since it would let a
real cross-student blend look corroborated instead of merely unnoticed).
This criterion cannot be made more concrete than this without deciding
Section 4.2's fork, which this document defers to the architect pass by
design (task instruction: "recommend, do not decide").

## 6. Machine-checkable vs. reading/OV, stated once so it is not re-litigated per criterion

**Machine-checkable, pure-function, no network, no rendering:** AC-1, AC-2,
AC-3, AC-4, AC-5, AC-6, and AC-7 once its comparator is chosen. All run under
this repo's existing `vitest`/`tsc` gates, over generated or frozen fixture
data, matching the discipline `docs/a44-test-notes.md` already established
for this exact row's oracle family.

**Reading / owner-verification only, not executable in this checkout:**

- Whether real instructors' zips actually take the
  `mixed-perstudent-plus-shared-dropbox` shape, or any shape, at any measured
  frequency - inherited unchanged from `docs/a44-test-notes.md:2102`'s
  RES-A44T-2 ("every rate is a property of the published generator, not of
  real uploads... no live uploads, no analytics, no network under vitest").
  The same non-instrument applies identically to A45's shapes.
- Whether a course's roster/studentRepos/Canvas list is realistically
  populated and selected at the moment an instructor uploads a grading zip -
  no live database, no rendered component, confirmed structurally absent
  from the current call chain (Section 3.2) but not verifiable as a lived
  instructor workflow from this checkout.
- The exact instructor-facing copy for a new "shared folder, could not
  corroborate" refusal variant, if one is added (Section 7, RES-A45-7) - a
  UX pass, deliberately kept separate from the pure identity logic per the
  task's own instruction.
- Any UI wiring that would actually populate the new optional field on
  `gradeAction`'s `FormData` from a real course selection - nothing renders
  under this repo's `vitest` (`AGENTS.md`), so this is buildable and
  type-checkable but not visually or interactively verifiable here.

## 7. Residual register

| id | What is not proven now | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A45-1 | The row's own `instrument` field (`docs/backlog.yml:759`) cites 2159/6.4%, measured in Section 1 to not match the tree (2254/19936 frozen; no 6.4% literal exists, only an unfrozen 6.3% within-run measurement). | The orchestrator, since it is the row's own stated pass condition | `collisionRefusal.test.ts:336-354` (already executed, Section 1.1/8) | Restate `docs/backlog.yml`'s instrument field to the measured values in the same commit that accepts this scope, or rule explicitly that the stale numbers stand as historical record only. |
| RES-A45-2 | Real-world shape frequency: whether actual instructor zips exercise the mixed-per-student-plus-shared-folder shape at any rate at all. | The repo owner | None available in this checkout (no live uploads, no analytics, no network under vitest) - identical non-instrument to RES-A44T-2 | Owner-only backlog escalation, not an agent task; mirrors `docs/a44-test-notes.md:2102` exactly. |
| RES-A45-3 | Which known-student-list source(s) to consult and in what precedence: `course.roster` names, `studentRepos[].username`, live Canvas roster, or a combination (Section 4.2/4.3). | The orchestrator (a product fork on evidence sources, not an implementer decision - mirrors how RES-A44T-8 routed the amnesty-acceptance fork to the orchestrator) | This scope's Section 3/4 survey (already executed) | A ruling before the architect/wave-plan pass for A45; this scope's recommended reading (Section 4.2 option (c)) is given so the next activity is not blocked on the ruling, per "Two rounds, then ask." |
| RES-A45-4 | Whether a course is ever actually selected/known at the point `gradeAction` runs on the zip-upload branch - Section 3.2 traced the call chain down to `page.tsx`/`GradingTab.tsx` and found only a display-string `courseName`, no course id, no roster, no `studentRepos`. | The architect pass for A45 | Reading `GradingTab.tsx`/`page.tsx` (partially executed here, Section 3.2); a fuller trace of every place `gradingTarget`/course selection could originate | Before designing the wiring in Section 4.3 - if no course is ever selected on this surface, threading a list through is dead plumbing, and the real fix may be adding course selection to the upload surface, which is an interaction-cost question this row does not currently account for. |
| RES-A45-5 | The match-strategy algorithm itself (Section 4.2's fork between exact-canonicalized, alphanumeric-token-set, or username-based matching). | The architect pass for A45 | AC-7 (Section 5), once an algorithm is chosen | Architect pass for A45; this scope's recommended reading is Section 4.2 option (c) (username first, alphanumeric-token-set fallback), not a decision. |
| RES-A45-6 | The row's inherited claim (`docs/backlog.yml:761`) of "43 sites across three files" for the display-keyed census - not independently re-derived in this pass, since A45's own subject is the refusal decision, not the display fan-out. | Whoever authors A45's wave plan | A fresh grep re-derivation before relying on the count (this pass did not attempt one; a partial sanity grep on `.student` across `src/lib/grade`/`grading-results`/`grading*.ts` returned 37 hits on a narrower pattern, which neither confirms nor refutes 43 on the row's own broader pattern) | Before any wave that changes what `result.student`/display shows as a consequence of a new corroboration-driven decision variant. |
| RES-A45-7 | Whether `CollisionRefusalDecision` needs a genuinely new `status` (e.g. distinguishing "shared folder, corroboration available but failed" from today's two variants) and what its instructor-facing copy says. | Architect + UX pass for A45 | `describeCollisionRefusal`'s exhaustive switch (`collisionRefusal.ts:141-152`), AC-6 | Architect pass, kept separate from the pure identity logic (Section 6) per this task's own instruction. |

## 8. Full instrument output backing Section 1 and AC-4

```
$ npm run test:paths -- src/lib/grade/collisionRefusal.test.ts src/lib/grade/identityInvariants.test.ts src/lib/grade/utils.test.ts

 RUN  v4.1.9 C:/Users/alexa/OneDrive/Documents/Projects/teaching-assistant

 (Y) src/lib/grade/utils.test.ts (28 tests) 34ms
 (Y) src/lib/grade/collisionRefusal.test.ts (37 tests) 4345ms
     (Y) mixed-perstudent-plus-shared-dropbox: unsound-and-allowed is exactly 2254 of 19936 sets  690ms
     (Y) nested-shared-dropbox-subdirs: unsound-and-allowed is exactly 287 of 19990 sets  831ms
 (Y) src/lib/grade/identityInvariants.test.ts (107 tests) 14862ms

 Test Files  3 passed (3)
      Tests  172 passed (172)
   Start at  14:08:12
   Duration  15.21s

COVERED src/lib/grade/collisionRefusal.test.ts files=1 passed=37
COVERED src/lib/grade/identityInvariants.test.ts files=1 passed=107
COVERED src/lib/grade/utils.test.ts files=1 passed=28
```

(Pass marks normalized to `(Y)` above only because the source terminal glyph
is a Unicode check mark, not an emoji or arrow, and this document is scanned
by `src/lib/no-emojis.test.ts`/`src/source-bytes.structure.test.ts`; the
counts, names and durations are transcribed exactly as produced.)

## 9. What this scope explicitly does not do

No wave plan, no oracle beyond citing the ones AC-1 through AC-7 point at, no
write set, no sabotage protocol - those belong to the wave-plan and
test-author seats respectively, per this task's own instructions and this
project's seat boundaries. No production or test code was written or
modified. No file outside `docs/a45-scope.md` was changed.

## 10. Write-set proof

```
$ git status --short
```

Expected and required to show only `docs/a45-scope.md` (new/modified) plus
whatever this pass's own read-only survey commands left behind in untracked
scratch state, if any - none were created; every command above was read-only
(`grep`, `npm run test:paths --`, file reads). No `src/` file was opened for
editing at any point in this pass; every `src/` citation above is a read.
