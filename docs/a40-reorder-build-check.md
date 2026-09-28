# A40 REORDER half - adversarial build check

Fresh check. I did not author the diff, the test, or the rulings it cites.

Read first: `docs/DEV_LOOP.md`, `docs/loop/iteration-caps.md` (output contract),
`docs/loop/seats.md` checker questions, `docs/a40-check.md` (the SCOPE check,
682 lines by `wc -l docs/a40-check.md`) and `docs/a40-scope.md` (320 lines, same
command). `ls docs/a40-*` returns exactly `docs/a40-check.md` and
`docs/a40-scope.md`; neither covers the as-built diff, so this is not a second
artifact over the same ground.

**VERDICT: DEFECTIVE.** 2 blockers, 5 majors, 4 minors.

Two of the seven blocker/major findings land on the ORCHESTRATOR'S RULINGS
rather than on the implementer (B1, M5). One lands on a claim the brief handed
me as fact (M4).

---

## 0. What I re-derived and found SOUND - one line each

- **Write set is exactly as stated.** `git status --short` shows
  `M src/app/components/CartridgeDropPanel.tsx` and
  `?? src/app/components/CartridgeDropPanel.reorder.test.ts`; every other entry
  carries a sibling's marker.
- **The diff is a pure block move plus a three-line comment.**
  `git diff --stat -- src/app/components/CartridgeDropPanel.tsx` = `19 insertions,
  16 deletions`; the 16 removed lines are byte-identical to 16 of the 19 added,
  and the other 3 are the RULING 106 comment. No sabotage residue, so the
  `cp`-backup restore discipline held.
- **No overreach.** `RULING 106|RULING 107` over `src/**/*.{ts,tsx}` (Grep tool,
  ripgrep) matches only the two write-set files; `A40` over the same glob adds
  only `src/tools/backlog/backlog-file.structure.test.ts:60`, which is
  pre-existing and unmodified.
- **Line counts confirmed by both instruments.** `wc -l` = 603 and 94;
  `@(Get-Content <path>).Count` = 603 and 94. `git show
  HEAD:src/app/components/CartridgeDropPanel.tsx | wc -l` = 600, so +3 is right.
- **RULING 106's letter is delivered.** `grep -n 'id="'
  src/app/components/CartridgeDropPanel.tsx` returns exactly six lines:
  `:392` course, `:405` assignment, `:418` points, `:431` lms, `:453` rubric,
  `:467` file. All six sit unconditionally inside one
  `<div className={styles.form}>` (`:383-477`), in the component's single
  `return` (`:370`), with no conditional wrapper, no second render path and no
  portal. So the source-index claim and the JSX claim agree here.
- **`NON_FILE_FIELD_IDS` is complete.** There is no seventh `id=` in the file, so
  the list cannot be silently missing a field.
- **The frozen six-key SET is correct.** My own inventory (`grep -n "ta-"
  src/app/components/CartridgeDropPanel.tsx`) gives exactly
  `ta-cartridge-assignment`, `-course`, `-lms`, `-lms-chosen`, `-points`,
  `-rubric` - no more, no fewer. The two `ta-` mentions in comments (`:32`,
  `:34`) are unquoted, so they do not currently produce a false member. The SET
  is right; the POPULATION is not (B1).
- **Six test paths green.** `npm run test:paths -- <6 paths>`, exit code read
  from the command (`TESTPATHS_EXIT=0`): 6 files, 51 tests, all passed. Paths:
  the new test, `rubricProvenanceLeaf.test.ts`, `file-size-ceiling.structure
  .test.ts`, `no-emojis.test.ts`, `source-bytes.structure.test.ts`,
  `page-module-css-classes.test.ts`.
- **Scope check B1's specific worry is discharged.**
  `rubricProvenanceLeaf.test.ts`'s `maxRows` assertion on the
  `id="cartridge-rubric"` TextField survives the reorder - the whole file is
  10/10.
- **The in-file mutation controls at `:85-93` are real controls, not
  descriptions.** They mutate a string copy and assert inequality, so they
  execute on every run.

---

## Blockers

### B1 - OWNER-DECISION-DISCHARGED-BY-WRONG-POPULATION (NEW)

RULING 107's canary is scoped to ONE FILE. The owner decision it discharges is
scoped to a DIRECTORY, and says so in terms the decision itself calls
non-optional.

`docs/owner-decisions-2026-09-23.md:238-245`:

> ### DECISION 9 - two new ta- keys ship with no exact-set canary
> ... **The transition rule is part of this decision and is not optional:** when
> a SIXTH key lands in that directory, the exact-set canary is written then,
> covering all of them. Without that clause this is a permanent hole rather than
> a deferral ...

"That directory" is `src/app/components/`, because that is where both files
carrying the deferral live: `CartridgeDropPanel.tsx:34-35` and
`GradingTab.tsx:55-57`, whose comments are word-for-word identical on this point
("write one when a sixth `ta-` key lands in this directory, covering all of
them").

**Measured population of that directory.** Command:

```
for f in src/app/components/*.tsx src/app/components/*.ts; do
  case "$f" in *.test.ts) continue;; esac
  [ -f "$f" ] && grep -oh '"ta-[a-z0-9-]*"' "$f"
done | sort -u | wc -l
```

Output: **75**. And that 75 is a LOWER BOUND, because my instrument shares the
canary's double-quote restriction (see M2).

So three things are wrong at once:

1. **The trigger was satisfied long before `ta-cartridge-rubric`.** The
   directory passed six keys many features ago - `RecordingTab.tsx` alone
   carries 17 by the command above. The test's own comment ("Six already exist
   in this one file", `:56-57`) silently substitutes FILE for DIRECTORY, which
   is the only reading under which "due now because a sixth key already landed"
   is true.
2. **"Covering all of them" is not satisfied.** 6 of 75. `GradingTab.tsx`'s own
   `ta-grading-rubric-memory` (`:57`) - the sibling key DECISION 9 was written
   about - remains covered by nothing.
3. **The tree now contradicts itself.** `CartridgeDropPanel.tsx:34-35` still
   reads "ships with no exact-set canary; write one when a sixth `ta-` key
   lands in this directory" - untouched by this diff - while a test named
   "RULING 107: exact-key-set canary" sits beside it. The next agent reads
   either "still owed" or "already done", and both readings are wrong.

**The repo already has the right idiom and this diff did not use it.**
`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts:213-240`
is a `readdirSync` over the directory's non-test files, with TWO population
controls the new canary has no analogue of: "finds more than 3 non-test files -
a scan over an empty or renamed directory proves nothing" (`:217-219`) and
"finds at least one `ta-snap-*` key ... - a check over nothing proves nothing"
(`:228-230`). Its header (`:125-128`) states exactly the reasoning the new
canary inverts: a neighbouring canary "scans only `src/app/components/recording/`
plus `RecordingTab.tsx`, and does NOT reach this directory - so without this
block, a persisted key landing here would be invisible to every existing gate".

**This finding is against the RULING, not the seat.** The brief states RULING 107
as the single-file scan, so the implementer built what it was told. Nothing an
implementer revision can do resolves it: either the canary is widened to the
directory (75 keys, a large frozen list, and a real cost) or DECISION 9's
trigger is renegotiated, and narrowing an owner decision is not the
orchestrator's to do.

**Not fixable by strengthening the same mechanism.** A second single-file canary
is the same instrument at the same scope.

### B2 - REORDER-PROMOTES-A-KNOWN-FALSE-STATEMENT (NEW)

The reorder moves a caption that is already known to lie into the highest-
attention position in the form, in a chunk whose entire purpose is to stop this
surface misrepresenting which rubric a run used.

Traced, not grepped (`grep -n "rubricOrigin\|setRubricOrigin"
src/app/components/CartridgeDropPanel.tsx`):

- `setRubricOrigin` is called at **exactly one site**, `:136`, inside the restore
  effect. It is never called with `null` anywhere.
- `:274` clears the field (`setRubricText("")`) on the success path. `:275`
  clears `sniffHint`. **`rubricOrigin` is not cleared there, nor on the error
  path (`:283`), nor when the instructor types over the rubric.**
- `:459` renders it: `{rubricOrigin && <p className={styles.fieldHint}>
  {rubricOrigin}</p>}`.

So after any upload that had a restored rubric, the reachable state is: **an
empty rubric box with a caption underneath asserting a rubric was restored and
naming its course and assignment.** The text is real - `docs/a40-check.md:221`
records it measured against the real module: "Rubric restored from your last
saved rubric (CS101 / HW1), saved just now." At that moment
`mergeSniffedValues` will send `sniff.rubricText || null`
(`src/lib/submission-archive-sniff.ts:74`), so the next run gets no instructor
rubric at all while the UI says one is in hand.

**What the reorder changes.** Before: that caption was the LAST element of the
form, and the file input was the FIRST, so a top-to-bottom instructor had
already fired the upload before reaching it. After: the caption at `:459` sits
immediately above the file input at `:462-476` - the last thing read before the
interaction that fires the next upload.

The caption bug pre-exists and is filed as minor m2 in `docs/a40-check.md:244-246`.
What is NEW, and what the brief did not anticipate, is that this diff PROMOTES
it. The brief's item 4 anticipated a different hazard, which does not exist as
built (M4).

**Fix is one line inside the existing write set**: `setRubricOrigin(null)`
alongside `setSniffHint(null)` at `:275`, and on the error path at `:283`. I am
not filing this as a demand for the accepted rubric-memory consequence to be
mitigated - that is M4's territory and stays a residual. I am filing that a
one-line clearing bug in the very file being edited is now positioned where it
does maximum damage, and that shipping the reorder without it makes A40 worse at
the thing A40 is for. DECISION 16's own words (`docs/BACKLOG.md:106`): what the
decision buys is "a sentence true in every reachable state".

---

## Majors

### M1 - THE EXACTLY-ONCE CLAUSE HAS NO PROVING MUTATION

The brief asks whether "occurs exactly once" closes the comment/attribute hole.
My answer: **it closes it in the dangerous direction, and nobody measured that.**

Reasoned through every channel I could find:

- `htmlFor="cartridge-file"` does not contain the substring `id="cartridge-file"`,
  so labels cannot produce a second match. Same for `aria-labelledby` and
  `aria-describedby`.
- A JSX comment or a string mentioning `id="cartridge-file"` WOULD produce a
  second match - and the exactly-once assertion then FAILS. So the clause is
  fail-closed against mentions: a mention cannot buy a false green, only a false
  red. That is the correct direction and the implementer's reasoning is sound.
- The live false-RED channel is `data-testid="cartridge-course"`, which contains
  `id="cartridge-course"` as a substring. `data-testid` is a real idiom here -
  `src/app/components/workflows/WorkflowListSidebar.tsx` uses it - so this is
  reachable, not hypothetical.

**The defect is that none of this was measured.** Three sabotages were pasted and
they probe TWO mechanisms, not three:

| Sabotage | Mechanism probed |
|---|---|
| LMS moved below the file input | index comparison, member `cartridge-lms` |
| assignment moved below the file input | index comparison, member `cartridge-assignment` |
| a seventh `ta-` key inserted | key-set equality - **already probed by the file's own control at `:85-88`**, so the external red adds nothing the suite does not already carry on every run |

The clause the ruling leans on to make a source-index test trustworthy is the
one clause with no red behind it. **Name the mutation**: add
`data-testid="cartridge-file"` to the input at `:467`, or a JSX comment
containing `id="cartridge-file"` above `:387`; confirm the "is present exactly
once" case at `:38-41` goes red, and confirm the five per-field cases stay green
so the two clauses are distinguishable. Until that red exists, the clause is a
description.

### M2 - THE KEY REGEX MISSES A CHANNEL THIS REPO ACTIVELY USES

`TA_KEY_PATTERN = /"(ta-[a-z0-9-]*)"/g` (`:59`) requires the key to be a
double-quoted literal. This repo builds `ta-` keys by template literal:

- `src/app/components/content-tab/courseItems-filters.ts:181` - ``return `ta-course-items-filters-${kindLower}`;``
- `src/app/components/content-tab/CourseItemsView.tsx:121` - ``const searchKey = `ta-course-items-search-${kindLower}`;``

Both are inside `src/app/components/`, the very directory DECISION 9 names. So a
future `` `ta-cartridge-${x}` `` in this file lands invisibly and the canary stays
green - a silent false negative in the one instrument whose entire job is to
refuse silence. The precedent regex is quote-free with a negative lookbehind
(`snapshot-grading.structure.test.ts:225`:
`/(?<![a-zA-Z])ta-snap-[a-z-]*[a-z]/g`), which catches the literal prefix inside
a template literal. Single quotes: `grep -rn "'ta-" src --include=*.ts
--include=*.tsx` excluding tests returned no lines (I am reporting the OUTPUT,
not an exit code, because that command was piped through `head` and the status
would have been `head`'s).

This is the eighth-time-on-the-instrument trap the brief names, and the fix is
the precedent's regex, not a stronger frozen list.

### M3 - SOURCE ORDER IS NOT RENDER ORDER, AND `.form` IS A FLEX CONTAINER

**This is the silent-green failure.** `src/app/page.module.css:99-103`:

```
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
```

A flex container's visual order is not its DOM order. Two one-line CSS edits
defeat RULING 106 completely with every gate green:
`flex-direction: column-reverse` on `.form`, or `order: N` on `.field`. And
`order` is a LIVE idiom in this exact stylesheet - `src/app/page.module.css:6423`,
`.ccBarLabel { order: -1 }` - so this is not a theoretical attack on a property
nobody uses.

Neither the new test nor any of the five whole-tree walkers nor
`page-module-css-classes.test.ts` reads a CSS ordering property. vitest here is
node-env and collects only `src/**/*.test.ts`, so **no component renders and no
instrument in this repo can observe the rendered order of anything.** Built
exactly as specified, this passes lint, tsc, the build's compile line, all 51
tests I ran, and every structure test - and the instructor can still see the
upload control above the fields.

I checked and there is no such CSS today, so the reorder is correct as it
stands. The defect is that the guard's pass condition does not bound the thing
it claims to protect, and the artifact does not say so - it states the reading-
claim limitation about markup and focus (`:2-10`) but not that CSS can invert
what it asserts.

### M4 - THE HAZARD THE BRIEF ASKED ME TO CONFIRM DOES NOT EXIST AS BUILT

The brief (and `docs/a40-check.md:330-334`, M3) states:

> After the reorder the rubric field sits ABOVE them [course and assignment], so
> the sequence "leave the rubric deliberately blank, then fill course and
> assignment" silently populates a field the instructor has already scrolled
> past.

**False against the as-built diff.** The order is now course (`:387`), assignment
(`:400`), points (`:413`), lms (`:426`), rubric (`:446`), file (`:462`). The
rubric is field 5 of 6 - BELOW course and assignment, exactly as before. The
scope check assumed the remedy would move the RUBRIC UP; RULING 106 instead
moved the FILE INPUT DOWN, which preserves the five fields' relative order. So
"already scrolled past" is wrong, and I am not confirming it.

**The real consequence, stated so it is not lost.** The restore effect's deps are
`[courseLabel, assignmentLabel]` (`:142`), it fires whenever either changes, and
per `docs/a40-check.md:210-224` `loadRubricMemory` falls back ACROSS scopes, so
it can populate the field with another assignment's rubric. What the reorder
changes is which fill sequence is natural: before, the natural top-to-bottom
sequence was pick-file-first, which fired the upload before any later restore
could reach the payload; now it is fill-course-and-assignment-first, so a
restored rubric IS in the payload by default.

Qualification, because the claim would be overstated without it: `courseLabel`,
`assignmentLabel`, `pointsPossible` and `lms` are seeded from localStorage in
their `useState` initializers (`:55-67`), so on any return visit the restore
effect already fires at mount under the OLD order too. The amplification is real
but it is confined to the first visit and to the case where the instructor
retypes the assignment - it is not a new capability.

**This is a stated consequence, not a blocker.** Per DECISION 16
(`docs/BACKLOG.md:106`) the disclosure half ships PRESENCE PLUS ORIGIN with a
column on `cartridge_drops`, and the B4 question of whether the fallback should
exist at all is already open with the owner and explicitly "UNCHANGED by this
decision".

- **Owner:** repo owner, on the B4 fork (should the cross-scope fallback exist).
- **Instrument:** the `rubric_origin` column shipping in A40's disclosure half,
  read off a real drop row; plus, in a browser, filling course and assignment
  for an assignment that never had a rubric and checking whether the rubric box
  populates itself.
- **Step:** the owner verification pass on the combined A40 push, and the
  disclosure half's own verify.

One upside the reorder delivers that nobody claimed: `rubricOrigin` at `:459` now
renders directly above the file input rather than at the bottom of the form, so
when it is CORRECT it is in the best possible place. That is precisely what makes
B2 urgent rather than cosmetic.

### M5 - A PRE-EXCUSED RED IS CURRENTLY GREEN (ruling-level)

The brief instructs me not to re-litigate two reds, one of them
`rubricProvenanceLeaf.test.ts`'s "RubricProvenance mounts above GradingResults",
attributed to the concurrent A39 wave-4 sibling's `GradingTab.tsx`.

Measured: `npm run test:paths -- ... src/app/components/grading-results/rubricProvenanceLeaf.test.ts ...`,
exit 0 from the command, reports `src/app/components/grading-results/rubricProvenanceLeaf.test.ts
(10 tests)` all passing, and `grep -n "mounts above"` on that file confirms the
describe exists at `:93`. So the whole file, including the excused case, is
**green as of this check**.

That is not a defect in the diff. It is a defect in a live ruling: an excusal is
being carried for a red that no longer reproduces. Either the sibling has since
satisfied it, or the original red came from a mid-flight tree state. Either way,
a standing "these two are not ours" note is how a genuine red gets waved through
later. The excusal should be retired with a re-measurement, not carried to the
push.

I found **no third red** in the six paths I ran.

---

## Minors

- **m1 - the BACKLOG A40 row's citations for this file are now wrong.**
  `docs/BACKLOG.md:106` says "the rubric textarea (:405-418, id=cartridge-rubric
  at :411) sits BELOW the file input in render order (:330-344 the file field)".
  As built: rubric `:446-460` with the id at `:453`; file field `:462-476` with
  the id at `:467`; and the ordering claim is now false, which is the point of
  the change. Owner: the orchestrator, at the push, per DEV_LOOP's "every
  quantity and quoted rule in it names the command or `file:line` that produced
  it".
- **m2 - `sniffHint` moved to the bottom of the form as a side effect of the
  block move, and it is immaterial.** It is set at `:250` and cleared at `:275`
  with only the `await saveCartridgeDrop` at `:264` between, so it renders only
  while `loading` is true and the form is disabled. I checked this specifically
  because an unnoticed relocation inside a moved block is exactly the "anything
  else quietly changed" case; it is not a finding.
- **m3 - I did not run `page-module-css-orphan-classes.test.ts`.** It writes
  `docs/css-orphans.md` unconditionally inside an `it()` (`:354` onward) and I
  was scoped to one doc. Note for whoever gates this: that file's header reads
  "Generated ... on 2026-09-28" (`grep -a -n "Generated by"
  docs/css-orphans.md`), i.e. today in UTC, so a re-run today would very likely
  be byte-identical - **a clean `git status` is NOT evidence anyone ran that
  walker.** The diff adds no `styles.X` and removes none (the moved block keeps
  `styles.field`, `styles.fileField`, `styles.fieldHint`), so scope-check B2's
  orphan hazard is not triggered by this change on reading; it is simply
  unmeasured.
- **m4 - RULING 106 and RULING 107 are not recorded anywhere.** Grep over
  `**/*.{md,ts,tsx,yml}` finds them only in the artifact under check - the test
  file and the new comment at `CartridgeDropPanel.tsx:384`. `docs/BACKLOG.md:106`
  and `docs/owner-decisions-2026-09-27.md:86` record RULING 105 and DECISION 16,
  and stop there. I therefore checked both rulings against DECISION 9's recorded
  text and against the brief's paraphrase, not against their own wording, which
  is why B1 is framed against DECISION 9. A ruling that exists only inside the
  code that implements it cannot be checked, and it will not survive to the next
  session. Re-checked at the end of this pass: `docs/ruling-108.md` appeared in
  the tree mid-check (109 lines by `grep -c ""`) and contains no match for
  `106` or `107`, so the gap is not closed by it.

---

## The feature-already-exists case, argued at its strongest

It does not hold, and the strongest version is worth stating so nobody
re-litigates it. The five fields did not already precede the input: `git show
HEAD:src/app/components/CartridgeDropPanel.tsx` has the file field first in the
form. Nor is there a pre-existing ordering guard: this is the first test that
asserts anything about this component's field order, and
`rubricProvenanceLeaf.test.ts` reads this file only for `maxRows` on one
TextField. The closest thing to "already exists" is the `rubricOrigin` caption at
`:459`, which is a real disclosure mechanism already in the tree and already
broken (B2) - which reframes the disclosure half's job as REPAIRING a caption
rather than inventing one, but does not touch the reorder's necessity.

## The weakest requirement

**RULING 106 itself.** Implemented exactly as written - all five fields above the
file input, proven by index, all green - and the filed defect survives intact for
any instructor who clicks the file input out of order. Nothing blocks the upload,
nothing warns, and `disabled={loading}` (`:396,409,422,437,457,471`) locks the
form only AFTER `setLoading(true)` at `:215`, which is after the click that
fired it. The reorder is a layout nudge; the defect is that the upload is
irreversible and silent. That is what the disclosure half has to carry, and it
means the reorder alone must never be reported as closing the A40 row.

---

## Verdict and counts

| Severity | Count |
|---|---|
| Blocker | 2 |
| Major | 5 |
| Minor | 4 |

**VERDICT: DEFECTIVE.**

| Id | Class name | NEW or REPEAT |
|---|---|---|
| B1 | OWNER-DECISION-DISCHARGED-BY-WRONG-POPULATION | **NEW** |
| B2 | REORDER-PROMOTES-A-KNOWN-FALSE-STATEMENT | **NEW** |

Neither is a repeat of a class in `docs/a40-check.md`. B1 is adjacent to that
document's FALSE-ABSENCE-INSTRUMENT class (B1/B2/M4 there) but the corrective
rule differs: those are fixed by running a wider search, this one is fixed by
re-scoping an instrument to the population an owner decision names, and widening
a grep would not have caught it. B2 is not M3 there - M3's corrective rule is
"put provenance in the disclosure"; B2's is "clear the state you set", one line,
and M3's factual premise is wrong anyway (M4).

**Stopping point: RULINGS.**

- **B1 and M5 are the orchestrator's, not the seat's.** No implementer revision
  resolves B1 - it is a choice between widening the canary to 75 keys in
  `src/app/components/` and going back to the owner about DECISION 9's trigger.
  M5 is a re-measurement of an excusal the orchestrator issued.
- **B2, M1 and M2 are ordinary implementer work** inside the existing write set
  plus the named mutation, and all three are measurable here.
- **M3 and M4 are residuals with owners, instruments and steps stated above.**

## What I did NOT check, and why

- **`npm run lint`, `npx tsc --noEmit` and `npm run build` were not re-run.**
  `tsc` has one authorised caller here and races on `tsconfig.tsbuildinfo`, and
  two implementers are live in `src/` - so any red I measured over this tree
  could not be attributed to this write set, which is the same reason the brief
  pre-excused two. The implementer's three exit codes are therefore UNVERIFIED by
  me. They are also low-risk for a pure block move of syntactically complete JSX.
- **No sabotage was executed by me.** The brief forbids two agents
  sabotage-verifying the tree at once, and the mutations M1 names would have
  meant editing `src/`. M1 states the mutation instead of running it; that is
  the gap, and it is the implementer's to close.
- **`page-module-css-orphan-classes.test.ts` was not run** - m3, with the
  reasoning and the stale-timestamp caveat.
- **Nothing about the rendered result.** No component renders under vitest here;
  field order, tab order, focus and what the instructor actually sees remain
  reading claims, and a 51-test green run proves none of them.
- **The disclosure half** - out of scope for this check and a seat is writing
  `docs/a40-disclosure-test-notes.md` concurrently.

### Attacks I ran that found nothing

Recorded so this reads as a check rather than a list of hits. I tried and failed
to break: a second render path or conditional branch around any of the five
fields; a portal or `Dialog` host that would move a field out of DOM order; a
missing sixth field absent from `NON_FILE_FIELD_IDS`; a wrong member in the
frozen key set; a `htmlFor` or ARIA attribute producing a duplicate `id="` match;
a line-number pin on this file in any of the five whole-tree walkers or in
`rubricProvenanceLeaf.test.ts` (it pins character indices, not lines, and the
`maxRows` case passes); a `tabIndex` that would divorce focus order from DOM
order; a leftover sabotage mutation in either file; and an edit outside the
declared write set.
