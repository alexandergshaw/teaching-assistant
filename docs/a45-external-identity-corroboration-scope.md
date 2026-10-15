# A45 architecture scope - corroborate student identity from OUTSIDE the zip file paths

Backlog row `A45` (`docs/BACKLOG.md`, section "### A45", read 2026-10-11).
SECURITY/CORRECTNESS sensitive: a wrong design SILENTLY blends two students'
work onto one graded row. This is the ARCHITECTURE pass - it DECIDES shape
(identity source, corroboration predicate, seam, surface, oracle strategy,
waves). It is a NEW activity, distinct from the earlier `docs/a45-scope.md`
(a `loop-seat` scope+AC pass that explicitly DEFERRED these forks "to the
architect pass"); it is therefore round 1 of the architect activity, and a
fresh `loop-checker` gates it before any build wave consumes it. Section 10
is the disposition table against that prior document.

This pass is READ-ONLY. Write set: `docs/a45-external-identity-corroboration-scope.md`
only. No production or test file was edited; every `src/` citation below was
opened and read in this pass, and every quantity names the command that
produced it. Section 12 is the write-set proof.

The owner standing instruction for this row is GO-WITH-RECOMMENDED: each fork
below is RECOMMENDED and the waves are cut to build on the recommendation, with
the one genuine product cost (adding a course picker to the upload surface)
recorded as a residual the owner can veto in one message rather than a gate.

### Revision R1 (round 1 of the architect activity - what changed and why)

A fresh `loop-checker` raised ONE blocker; this revision fixes it and the two
minor cites it attached, and nothing else (the identity-source reasoning, the
exact-matcher choice, the non-bypassable refuse path, AC-5 degrade,
surface-is-a-layer/W3, the stale-cite corrections and the disposition table were
all checked SOUND and are untouched):

- **B1 - predicate bound to the wrong OBJECT (FIXED, section 4.3).** The
  predicate matched `matchNameAgainstRoster(G.display, ...)`, but for an
  amnesty-eligible foldered collision `G.display` is the compound `relDir/stem`
  ("AlvarezMaria/Homework"), never a student name (`a44Fold`, `utils.ts:237`;
  frozen oracle `collisionRefusal.test.ts:164-166`). Since the matcher is exact
  after canonicalization (`grading-roster-match.ts:121-128`), that display can
  never equal a roster name, so amnesty was UNREACHABLE and AC-3 (folder-resubmit
  no-false-refusal) could not hold alongside AC-1. Section 4.3 is rebound to the
  group's FOLDER (`a44DecodeKey(key)[0]`, already computed at
  `collisionRefusal.ts:75`), with the multi-folder case stated and resolved.
- **Oracle vacuity (FIXED, section 6, AC-POS).** AC-1/AC-2 as written pass for
  any "refuse every foldered collision" implementation, so they did not prove
  corroboration picks the RIGHT student. A positive/negative corroboration pair
  (toggle only the roster, same zip) is added; a refuse-all mutant fails its
  positive row, and the removal test is restated against that pair's observed
  single-group value, not only the aggregate count.
- **N1 (FIXED, section 5.2).** `extraction.ts:334` was mis-attributed to
  `extractStudentEntries` (:284); it is inside `ingestZipEntries` (:300).
- **N2 (DISPROVEN, NOT applied).** The blocker asked to change the
  `distinctFolders` cite from ":43,56" to ":43,57". Measured:
  `grep -n distinctFolders src/lib/grade/collisionRefusal.ts` -> decl at `:43`,
  `.add` at `:56` (`:57` is the closing brace). The existing ":43,56" is
  correct; the proposed ":57" is wrong, so it is left as-is per the
  measure-do-not-recall rule.

---

## 0. Measurement discipline and the instruments used

- Line counts are `@(Get-Content <file>).Count` (PowerShell), the mandated
  gate instrument - `Measure-Object -Line` disagrees by 15-138 lines in this
  repo and must never be used (`docs/loop/this-repo.md` section 3). Where a
  count is from `wc -l` (Bash) it is labelled; `wc -l` agrees with
  `@(Get-Content).Count` on files with a trailing newline.
- Multi-file test runs are spelled `npm run test:paths <p1> <p2> ...`, never a
  raw multi-path `vitest run`, which silently drops unmatched paths and exits 0
  (`docs/loop/this-repo.md` section 1; `docs/loop/traps-spec.md`).
- No component is rendered by any test in this repo; every markup/interaction
  claim is a READING claim, stated as such (`docs/loop/this-repo.md` section 6).

Measured file sizes, `foreach ($f in @(...)) { "{0}`t{1}" -f @(Get-Content $f).Count, $f }`
(2026-10-11):

```
152  src/lib/grade/collisionRefusal.ts
688  src/lib/grade/engine.ts
964  src/lib/grade/extraction.ts
586  src/lib/grade/utils.ts
984  src/app/actions/grading.ts
619  src/app/components/GradingTab.tsx
```

`wc -l src/lib/grade/collisionRefusal.test.ts` -> `355`. The two files that
make the 1000-line ceiling a LIVE hazard for this row are `grading.ts` (984)
and `extraction.ts` (964); see section 8's per-wave ceiling checks.

---

## 1. The row's cited numbers are stale against the tree - carried, not re-corrected

The row text cites "2159 sets, 79.1%" and a "14.5% baseline" / "6.4%". The
frozen literals actually in the suite, from
`grep -n "2254\|19936\|287\|19990" src/lib/grade/collisionRefusal.test.ts`:

```
336:  it("mixed-perstudent-plus-shared-dropbox: unsound-and-allowed is exactly 2254 of 19936 sets", ...
342:    expect(sets).toBe(19936);
343:    expect(unsoundAllows).toBe(2254);
346:  it("nested-shared-dropbox-subdirs: unsound-and-allowed is exactly 287 of 19990 sets", ...
352:    expect(sets).toBe(19990);
353:    expect(unsoundAllows).toBe(287);
```

So the mixed-per-student-plus-shared-dropbox hole is **2254 of 19936**, and a
SECOND accepted-unsound shape produced by the same amnesty line,
`nested-shared-dropbox-subdirs`, is **287 of 19990** - not named in the row's
instrument text at all. The earlier `docs/a45-scope.md` section 1 already filed
this as RES-A45-1 and traced it to the round-1 generator never being committed;
this pass CONFIRMS the values by re-running the frozen tests (section 6, AC-4)
and adopts the measured numbers. The "6.4%"/"14.5%" false-refusal targets have
NO frozen literal in the tree (`grep -n "folder-resubmit" ...` returns only the
`SOUND_SHAPES` membership at `:293`); section 6 (AC-3) anchors that half to a
within-run comparison, never a percentage. RES-A45-1 is carried to section 11.

---

## 2. The hole, exactly, and the ONE branch corroboration must reach

`decideCollisionRefusal` (`src/lib/grade/collisionRefusal.ts:38-90`, read in
full this pass). The amnesty branch:

```
75:    const decoded = a44DecodeKey(key);
76:    const hasFolder = decoded !== null && decoded.length === 2;
77:    if (hasFolder && distinctFolders.size >= 2) {
78:      continue; // RULING 87's refined amnesty ...
```

`distinctFolders` (`:43,56`) counts distinct folders across the WHOLE run, not
per colliding group. On a zip shaped as per-student folders PLUS one shared
folder, the shared folder is itself one of the `>= 2` folders, so a real
cross-student collision INSIDE that shared folder passes `hasFolder &&
distinctFolders.size >= 2` and is granted amnesty (`status: "ok"` ->
`groupSubmissionsByStudent` merges it into one row). That is the 2254/19936
silent blend.

Structural fact that fixes the entire corroboration design: a colliding group
is folder-homogeneous AND display-homogeneous BY CONSTRUCTION. The group is
keyed by `parsed.studentKey` (`:59-63`), RULE K guarantees equal keys decode to
equal `[dir, stem]`, and `group.display` is the single `parsed.studentDisplay`
shared by all members (`:63`). **So corroborating a colliding group against a
known-student list yields exactly ONE match result for the whole group** - the
group cannot, from its own single FOLDER (the corroboration object chosen in
section 4.3), resolve to two distinct students. Section 4's predicate is built
on this fact; section 4.3 reconciles it with the row's "distinct students"
phrasing.

The refusal union is a `default`-less exhaustive `switch`
(`describeCollisionRefusal`, `:141-152`; doc comment `:134-139`): any new
`status` member added to `CollisionRefusalDecision` without a matching `case`
fails `npx tsc --noEmit`. Whatever variant section 4 adds inherits this guard
for free (AC-6).

---

## 3. DECISION 1 - identity source and how the two unsynced fields reconcile

### 3.1 The three sources, re-confirmed against the tree

- **`course.roster`** - free text, parsed by `parseRosterNames`
  (`src/app/components/grading-recording/grading-course-roster.ts`, 42 lines;
  used by the recording surface at `GradingRecordingPanel.tsx:99,519`). Output
  is a flat list of DISPLAY NAMES ("Maria Alvarez"-shaped), discarding anything
  after a `|`.
- **`course.studentRepos[]`** - structured; `.student` is a display NAME,
  `.username` is a GitHub handle (`roster-text-vs-studentRepos` memory,
  re-verified by the fields the recording binder reads). The two name-bearing
  fields (`course.roster` text and `studentRepos[].student`) are the unsynced
  pair the brief names.
- **Live Canvas roster** (`listCourseRosterAction`) - requires a network call;
  `vitest.setup.ts` throws on real fetch and there is no `.env`
  (`docs/loop/this-repo.md` section 6). OUT: unreachable and unverifiable here.

### 3.2 RECOMMENDATION: corroborate against NAMES, union of both name fields, de-duplicated. NOT usernames.

The earlier `docs/a45-scope.md` section 4.2 leaned toward
`studentRepos[].username` first (its "option (c)"), reasoning from the
repo-to-student BINDER's Tier-1 rule. **That binds the requirement to the wrong
object for THIS path, and this pass overrides it with evidence:**

1. The thing being corroborated is a colliding group's `studentDisplay`
   (`collisionRefusal.ts:63`) - a NAME-shaped or generic token off the file
   stem/folder, never a GitHub handle. The row's own oracle models this: the
   generator's ground-truth owners are NAME-shaped (`STUDENTS`,
   `src/lib/grade/submissionShapeGenerator.ts:26-42` - "AlvarezMaria",
   "BrownTom", ...), not usernames.
2. The manual zip-upload path (`gradeAction`, section 5) grades instructor
   uploads (Canvas bulk downloads, hand-assembled zips) whose folder/file names
   encode student NAMES, not repo handles. GitHub-repo grading is a separate
   path (`repo-grades.ts`), not this one.
3. The SIBLING grading surface already in the tree corroborates NAMES: the
   recording panel feeds `parseRosterNames(selectedCourse.roster)` into
   `matchNameAgainstRoster` (`GradingRecordingPanel.tsx:99,290,374,519`). A45
   should match that object, not import the repo-binder's.

Reconciling the desync: assemble the known list as
`dedupe( parseRosterNames(course.roster) UNION course.studentRepos.map(r => r.student) )`.
A student present in EITHER field is known. De-duplication is MANDATORY, not
cosmetic: `matchNameAgainstRoster`'s own contract
(`grading-roster-match.ts:20-28`) requires one entry per DISTINCT student, or a
normal overlapping roster reports every student as `ambiguous`. The union is
the safe direction (it can only ADD known students, reducing false refusals; it
never introduces false corroboration because matching stays exact - section 4).
`studentRepos[].username` is deliberately NOT a corroboration key here; if the
external-provider zip path ever grows the same hole it is a different row
(A41's R1, owner-only).

---

## 4. DECISION 2 - the corroboration rule and the exact refusal predicate

### 4.1 RECOMMENDATION: reuse `matchNameAgainstRoster` UNCHANGED - exact after canonicalization, NOT fuzzy

`matchNameAgainstRoster(readName, rosterNames)`
(`src/app/components/grading-recording/grading-roster-match.ts:108-129`, read
in full) returns `"matched"` (exactly one roster name canonicalizes equal),
`"ambiguous"` (two or more), `"unmatched"` (zero), `"no-roster"`
(null/undefined/empty list). `canonicalizeNameForMatch` (`:68-86`) folds case,
whitespace runs, and a `"Last, First"` comma form - and DELIBERATELY does not
do order-independent token-set comparison (doc comment `:59-66`), because a
subset/token-set match would let a single token match a multi-token name.

That strictness is exactly what makes it SOUND for a safety predicate. A looser
comparator (token-subset, fuzzy) risks FALSE corroboration - declaring a
two-student blend to be "one known student" - which is strictly WORSE than
today, because it re-opens the silent blend under a corroboration disguise. For
a predicate whose failure mode is "two students' work on one grade," soundness
dominates the false-refusal quality bar. Recommend exact-after-canonicalization,
reused verbatim.

### 4.2 The measured name-shape gap, and why it stays a residual rather than a looser matcher

The generator's owners are concatenated no-space ("AlvarezMaria"); an ordinary
roster is "Maria Alvarez". `canonicalizeNameForMatch` lowercases and collapses
whitespace but does not bridge concatenation or word order, so "alvarezmaria"
!= "maria alvarez". This is real (the earlier scope's section 4.2 flagged it;
the generator owners at `submissionShapeGenerator.ts:26-42` confirm it). Two
facts bound its impact and keep it OUT of the soundness wave:

1. A file already NAMED in the four-part Canvas convention
   (`studentname_date_time_filename`) matches `matchStudentFileConvention` and
   never reaches stem fallback (A41 row text; `parseSubmissionFileName`,
   `utils.ts:287-319` - `reachedStemFallback`). The collisions this row is
   about come from files that do NOT follow it - generic tokens like "essay",
   "final". A generic token matches no roster in ANY shape, so it REFUSES
   (sound) and that is not a false refusal (two generic-named files in one
   shared folder genuinely cannot be told apart from paths).
2. A looser matcher to bridge concatenation would have to be a FULL-STRING,
   whitespace-removed, both-name-orders comparison (never a token subset) to
   stay sound. That is a distinct, measurable follow-up (RES-A45-5), not part
   of the sound core, because adding comparator cleverness to the soundness
   wave is exactly where a false-corroboration regression would hide.

### 4.3 The exact predicate (NO / ONE / MULTIPLE / no-list) - bound to the FOLDER, not `G.display`

Add optional `knownStudents?: readonly string[]` to `decideCollisionRefusal`.
For each colliding group `G` (as today, `collisionRefusal.ts:71-87`), the
corroboration object is **the group's container-relative FOLDER, NOT its
display.** `G.display` is the wrong object: under RULE D the display of an
amnesty-eligible foldered collision is the compound `relDir/stem` (`a44Fold`,
`utils.ts:237`: `studentDisplay = \`${relDir}/${id.studentDisplay}\``; the frozen
oracle shows display `"AlvarezMaria/Homework"`, `collisionRefusal.test.ts:164-166`).
Because `matchNameAgainstRoster` is EXACT after canonicalization
(`grading-roster-match.ts:121-128`), `matchNameAgainstRoster(G.display, ...)`
can never equal a roster name, so EVERY foldered collision would refuse - amnesty
becomes unreachable, AC-1/AC-2 pass vacuously (all refused), and AC-3 fails
(a legitimate single-student folder-resubmission now refuses). The predicate must
bind to the folder.

The folder is already in hand in the predicate: `const decoded = a44DecodeKey(key)`
is computed at `collisionRefusal.ts:75`, and `decoded[0]` is the group's
container-relative directory, lower-cased by the key fold (`utils.ts:236`:
`a44Encode([relDir.toLowerCase(), id.studentKey])`). Let
`m = matchNameAgainstRoster(decoded[0], knownStudents)`; the lower-casing is
immaterial because `matchNameAgainstRoster` canonicalizes BOTH sides
(`grading-roster-match.ts:122-123`). (The case-preserving `folderForCopy`,
`collisionRefusal.ts:110-113`, is reserved for the refusal COPY and is
UNCHANGED - the match needs no second derivation.) Amnesty (do NOT refuse) is
granted IFF BOTH:

- (i) A44's existing path condition holds: `hasFolder && distinctFolders.size >= 2`
  (`:76-77`), AND
- (ii) `m.nameMatch === "matched"` (the group's FOLDER corroborates to EXACTLY
  ONE known student - the only state consistent with the files being that one
  student's multiple legitimate submissions inside their own folder).

Otherwise REFUSE. Per-outcome (all on `decoded[0]`, the folder):

- **ONE match (`"matched"`)** -> folder corroborated -> amnesty permitted (subject to i).
- **ZERO (`"unmatched"`)** -> folder names no known student -> REFUSE.
- **MULTIPLE (`"ambiguous"`)** -> folder canonicalizes equal to two+ roster
  entries (only if two distinct students genuinely share a name after the
  section-3.2 de-dup) -> cannot tell which -> REFUSE.
- **no-list (`"no-roster"`: `knownStudents` undefined/empty)** -> corroboration
  UNAVAILABLE -> fall back to A44's path-only decision `(i)` ALONE, i.e.
  byte-for-byte today's behavior (AC-5). An absent roster is our gap, not the
  student's (`grading-roster-match.ts:93-97`): the new evidence is strictly
  ADDITIVE, so a course with no roster is exactly as protected, and exactly as
  exposed to the legacy hole, as before A45 - never worse.

**The multi-folder question, stated and resolved.** A general sound rule for a
group spanning several folders would be: EVERY distinct folder in the group must
corroborate to a known student, and ANY unmatched folder forces REFUSE - because
a blend is by definition two different students' folders, so one matched folder
cannot vouch for files sitting under a different one. Under the CURRENT key fold
that case cannot arise: by RULE K (`collisionRefusal.ts:6-13`) equal identity
keys decode to equal `[dir, stem]`, so a colliding group is folder-HOMOGENEOUS -
all its members share ONE `relDir`, because the directory is part of the key
(`utils.ts:236`). The general rule therefore DEGENERATES here to the single
check in (ii): the group's one folder must match exactly one known student. The
general rule is stated explicitly so a future relaxation of RULE K inherits the
sound reading (refuse on any unmatched folder) rather than silently amnestying a
cross-folder blend. Note `distinctFolders.size >= 2` (`:43,56,77`) is a RUN-wide
gate - distinct folders across the whole fallback-reaching population, condition
(i) - and is NOT the group's folder count; it is untouched.

**Verified against the two shapes this must separate (the pair B1 proved the
`G.display` binding could not satisfy together):**

- (a) `mixed-perstudent-plus-shared-dropbox` (the 2254/19936 blend): the
  colliding group lives in the SHARED folder, so `decoded[0]` is that folder
  (e.g. "dropbox"/"shared"), which corroborates to NO roster student ->
  `"unmatched"` -> REFUSE. The silent blend is closed, soundly.
- (b) `folder-resubmit` (AC-3): the colliding group lives in the student's OWN
  folder, so with the complete list `decoded[0]` (e.g. "alvarezmaria") ->
  `"matched"` -> amnesty. No false-refusal regression, because the degrade
  (no-list) path also amnestied this group, so AC-3's `post <= pre` holds.

**Squaring this with the row's "corroborated to DISTINCT known students"
phrasing** (a shape call this seat must make, not leave ambiguous): by RULE K a
single colliding group shares one FOLDER and so can corroborate to at most ONE
student - the literal per-group "two distinct students" test could only ever
FAIL, which is "refuse every collision" = the amnesty-less 24.0%-false-refusal
variant the iteration cap already rejected. "Distinct students land on distinct
rows" is already guaranteed across the run by DISTINCT KEYS. The sound,
non-degenerate per-group reading is (ii): merge only when the FOLDER proves a
SINGLE known student; anything else refuses. "Never blend two distinct students"
then holds because a real two-student blend sits in a SHARED folder whose name
corroborates to no single student (unmatched -> refuse), and two students in
their OWN distinct folders never collide onto one key in the first place
(distinct `relDir` -> distinct key).

New decision variant: add `{ status: "uncorroborated-shared-folder"; group }`
to `CollisionRefusalDecision`, distinct from today's two, so the refusal copy
can say "a roster was available but these files did not corroborate" - a
different instructor message than "no other student folders." The exhaustive
`switch` (`:145-151`) forces `describeCollisionRefusal` to handle it (AC-6).
Accepted edge: a run whose shared folder is named exactly after a single known
student (e.g. a folder "Smith" holding two different Smiths' same-stemmed files
with one "Smith" on the roster) could amnesty that blend; this is the ceiling of
what NAMES/FOLDERS can prove and is no worse than A44 - recorded as RES-A45-8.

---

## 5. DECISION 3 - where it sits, the seam, and the SURFACE (the layer the user reaches)

### 5.1 It stays INSIDE `collisionRefusal.ts`

The predicate is a refinement of the amnesty branch and the module already owns
the decision union and its exhaustive-switch guarantee. Not a new module; a new
optional parameter plus one new variant. The pure assembly/parse of the name
list goes in a NEW tiny leaf (section 5.3) to keep `grading.ts` under the
ceiling and to make assembly unit-testable with no render.

### 5.2 The seam, from the two REAL call sites (the backlog's cites are stale)

`grep -rn "decideCollisionRefusal" src/lib/grade/engine.ts src/lib/grade/extraction.ts src/app/actions/grading.ts`
(run this pass) returns exactly two call sites, NOT the three the A45 row's
history names (engine.ts no longer calls it):

```
src/lib/grade/extraction.ts:334:  const collisionMessage = describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents);
src/app/actions/grading.ts:939:   const collisionMessage = describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents);
```

The list must reach a THIRD argument at EVERY site reachable from the manual
zip upload. The implementer re-derives this set with the same grep at build
time and treats the two above as a FLOOR, not the set (`docs/loop/traps-spec.md`:
an enumeration is a floor). The carriers:

- `grading.ts:939` is inside `gradeAction` (`:715`), which reads `FormData`
  (`:719-740`). It reads a new field directly, parses it via the leaf (5.3),
  and passes the list as the third argument at `:939`. No new exported
  signature: `gradeAction`'s `"use server"` shape (pinned by `useActionState`
  at `page.tsx`) is unchanged, exactly as `runDeadlineMs` was threaded through
  `FormData` for the same reason (`grading.ts:729-740`).
- `extraction.ts:334` is inside `ingestZipEntries` (`extraction.ts:300`), NOT
  `extractStudentEntries` (`:284`) - that function only forwards its options to
  `ingestZipEntries` at `:288`. `ingestZipEntries`'s own doc comment (`:292-294`)
  states it is the shared chain that both `extractStudentEntries` AND the
  engine's `gradeSubmissions` run (confirmed: the engine calls
  `ingestZipEntries(zipBuffer, { inferFileNamesWith: provider })` at
  `engine.ts:597`). Threading the list to the `:334` call therefore means: add
  `knownStudents?: readonly string[]` to `ingestZipEntries`'s options bag
  (`:302-316`), forward it to the `decideCollisionRefusal` call at `:334`, and
  forward it from BOTH callers - `extractStudentEntries` (add it to its own bag
  at `:286` and pass through at `:288`) and the engine's `gradeSubmissions`
  (`engine.ts:597`) - for each path reachable from the manual zip upload.
  Whether the engine path is reachable from the upload is settled by the
  build-time reachability trace, not guessed here. The two
  `describeCollisionRefusal(decideCollisionRefusal(...))` sites above
  (`extraction.ts:334`, `grading.ts:939`) are a FLOOR, not the set.

`GradingRunOptions` (`engine.ts:290-303`) is the EXISTING precedent for a
FormData-sourced option threaded "through unauthenticated-looking layers like
FormData" with no authorization consequence (its own doc comment, `:293-295`).
A roster NAME list has the same property - the user's own course data, behind
`requireAppOwner()` (`grading.ts:743`) - so the same treatment is justified;
whether the engine path needs the field threaded through `GradingRunOptions`
too is settled by the build-time reachability trace, not guessed here.

### 5.3 The pure leaf

New `src/lib/grade/knownStudents.ts` (pure, no I/O):
`parseKnownStudentNames(raw: string | null): string[]` - split on newline, trim,
drop empties, de-duplicate by `canonicalizeNameForMatch` (so the
`matchNameAgainstRoster` contract is satisfied before the matcher sees it). The
server (`gradeAction`) calls this on the FormData field; its three-line
footprint keeps `grading.ts` off the ceiling. This leaf is also where the W2
oracle's unit test lives.

### 5.4 The SURFACE - and why it is a LAYER, not an afterthought

**This is the shape error the earlier scope correctly refused to resolve
alone.** `gradeAction` has NO `courseId` and no roster today (`grading.ts:719-740`,
read this pass - fields are `studentSubmissions`, `canvasUrl`,
`assignmentInstructions`, `rubric`, `provider`, `rubricFile`, `institution`,
`runDeadlineMs`). `GradingTab`'s only course-shaped state is a DISPLAY STRING
`gradingTarget.courseName` (`GradingTab.tsx:88-90,211`). So the pure core and
the seam, built alone, ship a feature whose list is ALWAYS empty: dead plumbing
that no-ops via the degrade path with every gate green - the exact
library-and-endpoint-with-no-surface-between-them trap this seat exists to
catch. THE SURFACE IS A LAYER and A45 includes it.

What the user reaches, and how: a course `<select>` on the grading form
(`GradingTab.tsx`, the form is at `:344`, FormData built by
`new FormData(event.currentTarget)` at `:357`, student file field at `:367`),
REUSING the sibling surface's own machinery verbatim - `useGradingCourses(active)`
(`GradingRecordingPanel.tsx:98,272`; hook at
`src/app/components/grading-recording/useGradingCourses.ts:37`, returns
`{ courses, coursesLoading, coursesError }` at `:75`) and `parseRosterNames`
(`:99`). On submit, the client assembles
`dedupe(parseRosterNames(course.roster) UNION course.studentRepos.map(r=>r.student))`
(section 3.2), newline-joins it, and puts it in the FormData field `gradeAction`
reads (5.2). The selected courseId persists under a NEW `ta-` key (e.g.
`ta-grade-zip-course`), mirroring the recording surface's `ta-rec-grade-course`
(`GradingRecordingPanel.tsx:181`), so repeat-use click cost is ZERO after first
selection (the "minimize clicks" and "persist UI control state" standing rules).
First-use cost is one selection, with a safe default of "no course selected" ->
`no-roster` -> today's behavior.

---

## 6. DECISION 4 - the frozen before/after oracle strategy

All assertions are pure-function over the committed A44 generator
(`submissionShapeGenerator.ts`, `DEFAULT_SEED = 20260927` `:75`,
`DEFAULT_SWEEP_N = 20000` `:76`, `SHAPE_NAMES` `:82`), runnable under `vitest`
with no network and no render. The counting helper `countUnsoundAllows`
(`collisionRefusal.test.ts:254-279`: `trueBlend && decision.status === "ok"`
increments `unsoundAllows` at `:277`) is DUPLICATED into A45's new test file,
never imported across test files (`no-cross-test-file-imports` memory). The
test author (not this seat) owns the generator-vs-expected-axes separation.

- **AC-1 (soundness, the row's core claim; a genuine REMOVAL test).** With a
  COMPLETE accurate known list = the generator's own ground-truth `owner`
  values over the same seed/N: `sets === 19936` AND `unsoundAllows === 0` on
  `mixed-perstudent-plus-shared-dropbox`. RED if the population moves or
  `unsoundAllows` is anything but exactly 0. (Aggregate removal check: delete
  predicate clause (ii) and `unsoundAllows` returns to 2254 - but see AC-POS for
  the single-group removal signal that proves corroboration is not vacuous.)
- **AC-2 (the second shape, same amnesty line).** Same construction on
  `nested-shared-dropbox-subdirs`: `sets === 19990` AND `unsoundAllows === 0`.
  Both shapes come from the one line `:77`, so a fix reaching only one is a
  partial fix on a shared branch.
- **AC-POS (positive/negative corroboration - the NON-VACUITY guarantee).**
  AC-1/AC-2 assert `unsoundAllows === 0` on the blend shapes, which ANY "refuse
  every foldered collision" implementation satisfies vacuously (it never allows
  anything); on their own they do not prove corroboration identifies the RIGHT
  student. This row removes the vacuity. Build ONE fixture with a single-student
  foldered collision whose FOLDER names a known student, inside a run with a
  second fallback-reaching folder so condition (i) holds - e.g.
  `AlvarezMaria/Homework Final.docx` + `AlvarezMaria/Homework Draft.docx` (these
  collide onto one key with folder "AlvarezMaria", exactly the frozen fixture at
  `collisionRefusal.test.ts:154-169`) PLUS `BrownTom/paper.docx` (a second
  fallback-reaching folder, so `distinctFolders = {alvarezmaria, browntom}`, size
  2). Toggle ONLY the roster, same zip:
  - **POSITIVE:** roster CONTAINS "AlvarezMaria" -> the AlvarezMaria group's
    decision is `{ status: "ok" }` (amnesty GRANTED). A refuse-all mutant returns
    a refusal here -> RED. This is the row AC-1/AC-2 lacked.
  - **NEGATIVE:** roster is non-empty but OMITS "AlvarezMaria" (e.g.
    `["CarterLee", "DiazRosa"]`) -> the same group's decision is
    `{ status: "uncorroborated-shared-folder" }` (REFUSED). A today's-path-only /
    allow-all mutant grants amnesty here -> RED.
  The pair pins "the decision depends on whether the FOLDER corroborates," which
  neither a refuse-all nor an allow-all mutant can satisfy for BOTH rows.
  **Removal test (restated, single-group):** delete predicate clause (ii) and
  amnesty follows from (i) alone regardless of the roster; AC-POS's NEGATIVE row
  flips from `"uncorroborated-shared-folder"` to `{ status: "ok" }` - a named
  single-group decision CHANGING VALUE, the strongest removal signal (an
  aggregate-count change alone could be a population artifact). The positive row
  is unchanged by the deletion (it was already `ok`), which is why the NEGATIVE
  member is the one that carries the removal signal.
- **AC-3 (false-refusal, within-run, NEVER a percentage).** On `folder-resubmit`:
  generate once, run BOTH the no-list decision and the complete-list decision
  over the SAME sets in the SAME process, compare the two conservative-refusal
  COUNTS directly; RED unless `post <= pre`. No "6.4%"/"14.5%" literal (section 1;
  the earlier scope established this and `docs/a44-test-notes.md`'s R3: rates
  hide a changed denominator).
- **AC-1-ordinary (the fix the row's own note demands).** Repeat AC-1 with an
  ORDINARY-FORM roster (the generator owners reflowed to "First Last", or a
  name map) so the oracle does not "pass with a comparator that fails on an
  ordinary-form roster." Under exact matching this will REFUSE the concatenated
  tokens; the test MEASURES and REPORTS the resulting conservative-refusal
  count so the sound/false-refusal tension (section 4.2) is quantified honestly
  rather than hidden. Whether that count is acceptable is a REDUCE fork for the
  owner (RES-A45-6), not a reason to loosen the matcher.
- **AC-5 (degrade-safe).** List absent/`undefined`/empty: structural `toEqual`
  to today's decision across all 17 `SHAPE_NAMES` in the sweep and the frozen
  fixtures, proving the new evidence is strictly additive.
- **AC-6 (type safety).** `npx tsc --noEmit` RED if `CollisionRefusalDecision`
  gains `"uncorroborated-shared-folder"` and `describeCollisionRefusal`
  (`:145-151`) is not given its `case` in the same change; the implementer must
  NOT add a `default:` clause, which would defeat the guard.
- **AC-4 (no regression).** The existing suite stays green:
  `npm run test:paths src/lib/grade/collisionRefusal.test.ts src/lib/grade/identityInvariants.test.ts src/lib/grade/utils.test.ts`
  (the earlier scope ran this at 172 passing; re-run as the pre-A45 baseline and
  require no drop).

---

## 7. DECISION 5 - leverage claim and removal test

Class: **ATTRIBUTION** (`docs/loop/leverage.md`). A named grade reaches the
right student BY CONSTRUCTION: the app checks each colliding submission group
against the course's own known-student list and REFUSES to blend two students
whose shared folder the file paths alone cannot disambiguate - evidence a chat
cannot hold, because in a chat the human pasting submissions IS the (unverifiable)
attribution mechanism and nothing downstream can detect that A's grade came from
B's work. EARNED, not inherited: it requires the new list source, the predicate,
and the surface that feeds them; no comparable module gets this for free.

Removal test = AC-POS + AC-1 (buildable, unlike LIVE-LOOP): delete predicate
clause (ii) and AC-POS's NEGATIVE row flips from
`{ status: "uncorroborated-shared-folder" }` (refuse) to `{ status: "ok" }` - a
named single-group decision changing value - while AC-1's aggregate
`unsoundAllows` on the complete-list run goes from 0 back to 2254. This is a
removal test, not a "chat could not do it" test, because an observed decision
value changes on the deletion.

Diagnostics representation (DEV_LOOP owner rule, 2026-10-11) is an AC/UX-seat
obligation, not this seat's: the new `"uncorroborated-shared-folder"` refusal
must surface through the SAME channel A44's refusals use
(`describeCollisionRefusal` message; `chatSeamDiagnostic.ts` already names
`collisionRefusal.ts` as a refusal path) and name the failure it makes visible.
Handed to the AC seat as RES-A45-7.

---

## 8. Waves - smallest-sound-first, each with write set, oracle, ceiling check

The soundness wave is FIRST. W1 is sound and degrade-safe in isolation; W2+W3
deliver reachability. W1 MUST NOT be the terminal state - shipped alone it is
inert dead plumbing (section 5.4). If the owner defers the surface, W1 may ship
dark (inert by construction via AC-5, no flag needed), but the row does not
close until W3 lands.

### Wave 1 - sound core (pure function)

- **Write set:** `src/lib/grade/collisionRefusal.ts` (optional 3rd param
  `knownStudents`, predicate clause (ii), new `"uncorroborated-shared-folder"`
  variant + its `case`); NEW `src/lib/grade/collisionRefusal.corroboration.test.ts`
  (AC-1, AC-2, AC-POS, AC-1-ordinary, AC-3, AC-5, duplicated `countUnsoundAllows`).
- **New export / caller:** no NEW export - an added optional parameter whose
  existing two callers (section 5.2) still compile unchanged; so this wave adds
  no dead code (the "wave must include the caller" rule is satisfied by the
  unchanged existing callers).
- **Oracle:** AC-1, AC-2, AC-POS, AC-1-ordinary, AC-3, AC-5, AC-6 (tsc), AC-4 (the 172).
- **Ceiling:** `collisionRefusal.ts` 152 + ~45 -> well under 1000. New test file
  starts fresh; if AC tests push it high, keep it its own file (do not append to
  the 355-line frozen-literal `collisionRefusal.test.ts`).
- **Canaries in the gate:** `src/file-size-ceiling.structure.test.ts` (always),
  `src/lib/grade/collisionRefusal.wiring.test.ts` (reads `collisionRefusal.ts`
  as source text - the "never calls the LLM" wiring), `npx tsc --noEmit`.

### Wave 2 - the seam (list reaches every gate)

- **Write set:** NEW `src/lib/grade/knownStudents.ts` (+ `knownStudents.test.ts`);
  `src/app/actions/grading.ts` (read the new FormData field, parse via the leaf,
  pass at `:939`); `src/lib/grade/extraction.ts` (add `knownStudents` to the
  options bag, forward to `:334`); plus the upload-path caller of
  `extractStudentEntries` that forwards it, identified by the build-time
  reachability trace.
- **Caller rule:** every new export ships with its caller in the same wave -
  `knownStudents.ts`'s `parseKnownStudentNames` is called by `grading.ts` in
  this wave.
- **Oracle:** unit test of `parseKnownStudentNames` (trim/dedupe/empty); a
  source-text WIRING test that the FormData field reaches the `:939` gate and
  `extractStudentEntries` forwards its option to `:334` (no render needed); the
  reachability trace re-run of the section-5.2 grep, output pasted in the build
  report, proving no gate was missed.
- **Ceiling (LIVE HAZARD):** `grading.ts` is 984 and `extraction.ts` is 964 by
  `@(Get-Content).Count`. W2's additions to each MUST stay to a few lines (the
  leaf exists precisely to hold the logic); if either would cross 1000, extract
  rather than inflate. Re-measure both with `@(Get-Content).Count` in the wave
  gate, and include `src/file-size-ceiling.structure.test.ts`.
- **Canaries:** if W2 adds a new grading action test that module-mocks auth, it
  must be registered in `src/app/actions/wholesale-auth-mock-population.structure.test.ts`
  (which already lists `grading.collisionRefusal.test.ts`, section 9) in the
  SAME commit, or that exact-set canary reddens. If `knownStudents.ts` trips a
  frozen-roots enumeration over `src/lib/grade` (candidates in section 9), bump
  that list and its N in the same commit (`gate-must-include-directory-canary`
  memory).

### Wave 3 - the surface (the layer the user reaches)

- **Write set:** `src/app/components/GradingTab.tsx` (course `<select>` via
  `useGradingCourses`, persisted `ta-grade-zip-course`, assemble + inject the
  newline-joined known-student field into the form's FormData). This file holds
  BOTH the form and the FormData construction (`:344,357`), so it is the
  wiring file - no second file is needed for the client wiring; the build-time
  trace confirms whether `page.tsx` also participates.
- **Oracle:** source-text/wiring test that the select is present, persists under
  the `ta-` key, and the FormData carries the assembled field; a removal/degrade
  reading-check that "no course selected" sends no field (-> `no-roster` ->
  today's behavior). The visual/interaction/keyboard correctness of the picker
  is a READING claim here and an owner walk in the real browser (no component
  renders; `docs/loop/this-repo.md` section 6) - RES-A45-7.
- **Ceiling:** `GradingTab.tsx` 619 + ~30 -> under 1000; re-measure.
- **Canaries:** the new `ta-grade-zip-course` key MUST be added to
  `src/app/components/componentStorageKeys.structure.test.ts` (the storage-key
  exact-set canary, section 9) in the SAME commit, or it reddens. Include the
  file-size canary.

---

## 9. The `owns` file list, derived by command (includes source-text readers)

Files this row EDITS (sections 5, 8): `src/lib/grade/collisionRefusal.ts`,
`src/lib/grade/knownStudents.ts` (new), `src/app/actions/grading.ts`,
`src/lib/grade/extraction.ts`, `src/app/components/GradingTab.tsx`, and the new
test files.

Files that READ an edited file AS SOURCE TEXT and can therefore go red without
being "owned" - derived by
`grep -rln "collisionRefusal\|extraction\.ts\|GradingTab\|knownStudents\|studentSubmissions\|ta-grade\|ta-rec-grade\|grading\.collisionRefusal" src --include="*.structure.test.ts" --include="*.wiring.test.ts"`
(run this pass; output pasted, trimmed to the ones that bear on this row):

```
src/app/actions/wholesale-auth-mock-population.structure.test.ts   <- lists grading.collisionRefusal.test.ts (:206); register any new auth-mocking grading test
src/app/components/componentStorageKeys.structure.test.ts          <- storage-key exact set; MUST gain ta-grade-zip-course (W3)
src/app/components/grading/zipUploadPreflight.wiring.test.ts        <- names the grading zip path
src/lib/grade/collisionRefusal.wiring.test.ts                       <- reads collisionRefusal.ts source ("never calls the LLM")
src/lib/grade/extraction.zip-caps.wiring.test.ts                    <- reads extraction.ts source
src/lib/grade/grouping-zip-parents.wiring.test.ts                   <- reads the grouping/zipParents path
src/file-size-ceiling.structure.test.ts                            <- 1000-line ceiling, every wave
```

Frozen-roots enumerations over `src/lib/grade` that a NEW file
(`knownStudents.ts`) could trip, from
`grep -rln "lib/grade\|grade/collisionRefusal\|grade/extraction" src --include="*.structure.test.ts"`:

```
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/lib/grade/rubric-provenance-producers.structure.test.ts
src/tools/strip-comments-agreement.structure.test.ts
src/tools/vitest-paths/gate-commands.structure.test.ts
```

The implementer opens each and confirms whether `knownStudents.ts` must be
added to a frozen list; bump the list and its N in the SAME commit if so. This
list is a FLOOR - re-run the greps at build time.

---

## 10. Disposition of the prior `docs/a45-scope.md` (restructuring audit)

The id column is re-derived LAST. The prior document's AC-1..AC-7 and
RES-A45-1..7 map as follows:

| Prior item | Disposition | Where it lands here |
|---|---|---|
| Prior AC-1 (soundness, complete list) | KEPT, hardened | AC-1 + AC-1-ordinary (section 6); adds the ordinary-form case the prior AC-1's own note demanded |
| Prior AC-2 (second shape) | KEPT | AC-2 |
| Prior AC-3 (false-refusal, within-run) | KEPT | AC-3 |
| Prior AC-4 (the 172 no-regression) | KEPT | AC-4 |
| Prior AC-5 (degrade-safe) | KEPT | AC-5 |
| Prior AC-6 (tsc exhaustive switch) | KEPT | AC-6 |
| Prior AC-7 ("once the comparator is chosen") | DECIDED | section 4.1 chooses exact-after-canonicalization; AC-7's positive/negative controls are realized explicitly as AC-POS (section 6), with AC-1-ordinary quantifying the concatenation gap |
| Prior RES-A45-1 (stale row numbers) | KEPT (carried) | section 1 + RES-A45-1 |
| Prior RES-A45-2 (real-world shape frequency) | KEPT | RES-A45-2 |
| Prior RES-A45-3 (which source) | DECIDED | section 3.2: NAMES, union of both name fields, de-duplicated (overrides the prior username lean, with evidence) |
| Prior RES-A45-4 (is a course ever selected here) | DECIDED | section 5.4: add the course picker (reuse the recording surface); residual is now only the interaction-cost owner veto (RES-A45-6) and the owner walk (RES-A45-7) |
| Prior RES-A45-5 (match algorithm) | DECIDED, with a follow-up | section 4.1 exact; the concatenation-bridging looser comparator becomes RES-A45-5 (a measured follow-up, not the sound core) |
| Prior RES-A45-6 (the "43 sites" display census) | KEPT | RES-A45-3 below (re-derive before any display-fan-out change) |
| Prior RES-A45-7 (new status + its copy) | DECIDED (status) + HANDED to UX (copy) | section 4.3 adds `"uncorroborated-shared-folder"`; copy + diagnostics rep is RES-A45-7 |

No prior requirement is WITHDRAWN silently; every one is kept, decided, or
handed over above.

---

## 11. Residual register (each: owner, instrument, step). To be FILED in docs/BACKLOG.md by the orchestrator.

This pass is read-only and does not edit the backlog; a residual not in
`docs/BACKLOG.md` does not exist, so the orchestrator must file these at
disposal.

| id | What is not proven now | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A45-1 | Row's instrument cites 2159/79.1%/6.4%/14.5%; tree has 2254/19936 and 287/19990 frozen, and NO false-refusal literal. | Orchestrator | `collisionRefusal.test.ts:336,346` (section 1, AC-4) | Restate the row's instrument to the measured values, or mark the stale ones historical, in the commit that accepts this scope. |
| RES-A45-2 | Whether real instructor zips take these shapes at any rate. | Repo owner | None here (no uploads, no analytics, no network under vitest) | Owner escalation; mirrors `docs/a44-test-notes.md` RES-A44T-2. |
| RES-A45-3 | The "43 sites / three files" display-keyed census is not re-derived this pass. | A45 wave author | A fresh grep before any display-fan-out change | Before any wave that changes what the results table shows from a new decision variant. |
| RES-A45-5 | A concatenation-bridging looser comparator (full-string, whitespace-removed, both name orders) for Canvas-style concatenated tokens vs ordinary rosters. | A later A45 wave (architect) | A sound-preserving fixture oracle with a false-corroboration negative control | AFTER the sound core, only if AC-1-ordinary's measured refusal count (section 6) is judged too high by the owner. |
| RES-A45-6 | Whether adding a course picker + first-use selection to the upload flow is acceptable interaction cost, and whether AC-1-ordinary's false-refusal count is acceptable. | Repo owner | AC-1-ordinary count (section 6); click count (section 5.4: 0 repeat, 1 first-use) | A one-message owner veto riding alongside the build (go-with-recommended: built on "add the picker" unless vetoed). |
| RES-A45-7 | Exact instructor-facing copy for `"uncorroborated-shared-folder"`, its diagnostics representation, and the picker's visual/keyboard correctness. | AC + UX seat; owner for the browser walk | Reading claims + owner walk (no render here) | AC/UX pass for A45; owner walk after W3. |
| RES-A45-8 | A degenerate roster (single-token surname listed once) could amnesty a two-"Smith" blend - the ceiling of what names prove. | Repo owner | Documented edge; no instrument beyond the predicate's `matched`=exactly-one | Accepted edge, no worse than A44; recorded, not fixed. |

---

## 12. What cannot be verified in this environment, and the write-set proof

Cannot be verified here (stated, not worked around): real model output (no
keys), real DB/RLS (no `.env`), the picker rendered or its keyboard behavior (no
component renders), and whether a course's roster is realistically populated at
upload time (no live data). None of these is a precondition of the pure-function
oracle (section 6), which is the load-bearing evidence for the row's claim.

Write-set proof - `git status --short` at the end of this pass is required to
show only this one new file, `docs/a45-external-identity-corroboration-scope.md`,
plus the pre-existing untracked docs listed in the session's opening git status.
No `src/` file was opened for editing; every `src/` citation above is a read.
