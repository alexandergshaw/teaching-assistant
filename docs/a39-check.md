# A39 architecture: adversarial check, round 1 of at most two

Subject: `docs/a39-architecture.md` at commit c74f276. I did not author it.
Inputs re-read: `AGENTS.md`, `docs/DEV_LOOP.md`, `docs/loop/this-repo.md`,
`docs/loop/iteration-caps.md`, `docs/loop/traps-spec.md`,
`docs/a39-census.md`, `docs/a39-research.md`, `docs/a17-discovery.md`,
`docs/owner-decisions-2026-09-23.md`.

Every quantity below names the command that produced it. All commands were run
from the repo root on 2026-09-23; PowerShell is marked, everything else is the
Bash tool. No absence grep is piped through `head`, and each is paired with a
canary run through the same instrument in the same call.

**VERDICT: NOT BUILDABLE AS WRITTEN. 7 blockers, 7 major, 15 minor.**

---

## 0. What I confirmed sound, in one place, so the rest is signal

These were attacked and held. I am not padding them out.

- **Census correction 1 is CORRECT, and a census verdict bullet falls.**
  `sed -n '125,133p' src/lib/canvas-credentials.ts`: `:130` is inside
  `resolveOwnerEnvCredential`, the owner-only env fallback, exactly as the
  architecture says. `resolveCanvasCredential` is declared at `:189` and
  returns the CALLER'S OWN stored credential at `:193-196` before any role
  check; the owner branch is `:220-225`. `sed -n '191,200p'
  src/app/account/integrations/LmsCredentialSection.tsx` shows
  `saveLmsCredentialAction` called at `:196`; it is declared at
  `src/app/account/integrations/lms-actions.ts:259` and gated by
  `requireUser()` at `:266`, not `requireOwner`, with that file's own header
  at `:18-22` stating the choice. **Census section 6 verdict bullet 3
  (`docs/a39-census.md:569-572`, "gated on a credential the instructor cannot
  set") is FALSE for the Canvas half.** Say it plainly: the architecture is
  right and the census is wrong here.
- **All three citation corrections in section 0.1 are correct.**
  `engine.ts:206` is a comment and the `for` is at `:207`; `:277` is the guard
  and `await sleep(...)` is at `:278`; `GradingTab.tsx:365` is the Gemini-error
  paragraph and the results gate is `:426`.
- **The mutation and the divergence argument in section 5.1 are exactly
  right.** `awk 'NR==371||NR==373' src/lib/grade/engine.ts` returns
  `result.overallComment = ...` and `result.rubricAreas = reconciled`. The
  canonical-from-richest fallback is at `:337-344`; the block is `:332-393`;
  the single return is `:395-399`. I traced the second-pass divergence by hand:
  strays are deleted from `rubricAreas` and appended to `overallComment` on
  pass 1, so a stray that becomes canonical on pass 2 yields a blank column
  plus the text in `overallComment`, and today's single-pass whole-run output
  has neither. Correct, and correctly argued.
- **The arithmetic holds.** `DEFAULT_INTER_REQUEST_DELAY_MS = 1200` at
  `src/lib/gemini.ts:67`; the sleep guard `i < limitedEntries.length - 1` at
  `engine.ts:277` means N-1 sleeps; 1.2 * 39 = 46.8. `DEFAULT_MAX_SUBMISSIONS
  = 40` at `gemini.ts:32`.
- **Every line count in table 1.10 is right.** PowerShell
  `foreach ($f in $files) { "{0}`t{1}" -f @(Get-Content $f).Count, $f }` over
  all 21 files reproduces all 21 figures exactly, including 990 and 970 on the
  two panels. `wc -l` from Bash agrees (990, 970). `(Get-Content $f |
  Measure-Object -Line).Lines` gives **947** and **908** - gaps of 43 and 62,
  not the 42 this repo's cards quote for a different file. The 127-line census
  gap (652 / 652 / 525) also reproduces.
- **Both canary claims in 1.9 are right, including the self-correction.**
  `grading-rows.test.ts:678-687` holds the seven-key exact set, `:719-725` the
  second list, regex `/ta-rec-grade-[a-z-]*/g` at `:678`.
  `snapshot-grading.structure.test.ts:195` is the test whose NAME reads
  "U10 keeps shot bytes and rubric/assignment text out of localStorage";
  regex at `:188`; the read+write wiring assertions at `:211-224`.
  `recording-split.structure.test.ts:81` is `fs.readdirSync(recordingDir)`,
  non-recursive. **The per-surface-key argument is correct**: a shared
  `ta-rubric-memory` matches neither directory regex.
- **The a17 citations are accurate** - 5.1's five names, 5.2's 79-of-82 with
  `AiChatWindow.tsx` / `CopilotChatPanel.tsx` / `ModuleDeckSettings.tsx`, and
  5.4's quote, all verbatim at `docs/a17-discovery.md:489-564`.
- **RES-A39-11 is real end to end.** `TEXT_EXTENSIONS` at
  `src/lib/office-extract.ts:13` contains `"xml"` at `:18`; `leafStemFallback`
  at `src/lib/grade/utils.ts:121-126` takes the leading alphanumeric run;
  `matchStudentFileConvention` requires four parts at `:95-97`.
- **Section 7's deferral finding is right.** `ContentTab.tsx:772` renders the
  grading view and the `!loaded` gate is at `:778`. The
  `account/integrations` grep returns 7 lines (`| wc -l` = 7), of which
  `TopBar.tsx:435` is the only followable link.
- **1.7 and 1.3's absence greps are right.** `ClassTrendsPanel` reaches
  `requestInsight` (`:93`) only from `onClick` at `:159,:173,:196`, never an
  effect. `grep -rn "getReader()\|TextDecoderStream" src --include=*.ts
  --include=*.tsx` exits 1 with no output; the EventSource hits are
  workflow-triggers' own `getEventSource`, unrelated.

Everything below is what broke.

---

## BLOCKERS

### BLOCKER 1 - FALSE ABSENCE, at the leverage claim's load-bearing evidence, contradicted by the same document two sections earlier

Class: **false absence** (NEW).

Section 3, CLAIM 1, "EARNED, not inherited":

> `grep -rn "rubricUsed\|rubricFingerprint" src` returns nothing today (canary:
> `grep -rn "rubricAreaNames" src` returns 47 lines through the same
> instrument), so no comparable module has this for free.

Re-measured with the document's own command:

```
grep -rn "rubricUsed\|rubricFingerprint" src | wc -l   -> 30
grep -rn "rubricAreaNames" src | wc -l                 -> 140
grep -rn "rubricUsedZZZNoSuchThing" src                -> exit 1, no output (canary)
```

**30 lines across 6 files, not nothing.** Among them:
`src/app/components/repo-grades/useRepoGradesBulkGrade.ts:118`
(`rubricUsed: string | null`), `:272`, `:402`, and
`src/lib/research/rubric-bank.ts:28` (`export function rubricFingerprint`).

Both of those are lines **this same document cites elsewhere**: section 5.2
extracts `rubricFingerprint` from `rubric-bank.ts:28-30`, and section 2.2's
naming contract pins the new label to `useRepoGradesBulkGrade.ts:89`'s existing
`Rubric used: ...` string. The document simultaneously asserts the grep returns
nothing and quotes what it returns. The canary figure is also wrong by a factor
of three (47 against 140), which means the canary was not run either.

This is not cosmetic. "EARNED, not inherited" is the entire argument that
CLAIM 1 is leverage rather than something the tree already has, and
`leverage.md` requires that argument. The claim may still survive on the
narrower ground that no run OBJECT carries the pair - but that is a different
sentence and it has to be written and measured.

### BLOCKER 2 - the provenance the leverage claim rests on is dropped by a persistence layer that is in no wave's write set

Class: **an enumeration treated as the set** (NEW).

Section 6.4 names exactly one parser to protect
(`src/lib/github-grading-run-store.ts:282-289`) and makes both new fields
optional for that reason. W2-4's pass condition names only
`github-grading-run-store.test.ts`.

There is a second parser of the same type:

```
awk 'NR>=161&&NR<=178' src/lib/grading-drafts.ts
```

`coerceGradingRun` rebuilds the object field by field and returns exactly
`{results, rubricAreaNames, fullCreditChecklist, speedGraderUrl, sampleAnswer}`.
It will **silently drop `rubricUsed` and `rubricFingerprint`**. `grading-drafts.ts`
appears in NO wave's write set - wave 2 lists only `src/lib/grading-drafts.test.ts`
as "owned".

CLAIM 1's stated user cost is "the instructor cannot answer 'which rubric
produced this grade' for a grade a student is appealing". An appeal arrives
after the tab is closed. On the paths this design persists a rubric for (A, H,
F, G) nothing stores the run at all, and on the drafts path the provenance is
guaranteed to be lost. The claim is about a durable record; the design makes an
in-memory one.

`traps-spec.md:32-34`: "The orchestrator's enumeration is a FLOOR, never the
set." This is that, and the missing member is the one that makes the claim
false.

### BLOCKER 3 - W2-7's placement assertion passes by construction, and contradicts section 6.4

Class: **a check whose assertion cannot fail** (NEW).

W2-7: "OBJECT: the stripped source of `GradingTab.tsx` ... that the 'Rubric
used' literal's index is less than the index of `<GradingResults`."

Section 6.4: "`src/app/components/grading-results/RubricProvenance.tsx`, a leaf
mounted by `GradingResults.tsx` in 6 lines". Wave 2's table repeats it:
`GradingResults.tsx` is "THE CALLER of that leaf".

So the literal is in `RubricProvenance.tsx`, and it is mounted from inside
`GradingResults.tsx`. It never appears in `GradingTab.tsx`. `indexOf` returns
`-1`, and `-1 < indexOf("<GradingResults")` is true for every possible source.
**The assertion is satisfied by the literal's absence.**

It is also a direct contradiction of section 2.2's PLACEMENT CONTRACT, which is
stated in bold: "the progress line, the Stop grading control and the Rubric used
line all render ABOVE the results region in DOM order". A component mounted by
`GradingResults` is inside the results region, not above it. This is the exact
shape `traps-spec.md:76-96` records - a ruling and a data structure in different
sections, each individually defensible.

W4-8 has the weaker half of the same defect: its index comparison is stated with
no presence assertion, so an absent `Stop grading` literal also passes. Its
spelling clause partially covers it; W2-7's has nothing.

### BLOCKER 4 - the seam's dispatch is unspecified, and as written it double-spends on a second press

Class: **a contract stated as a constraint instead of a mechanism** (NEW).

Measured wiring: `src/app/page.tsx:63` is
`const [state, formAction, pending] = useActionState(gradeAction, initialState)`.
`GradingTab.tsx:228` is `<form className={styles.form} action={formAction}>`.
`grep -n "formAction" src/app/components/GradingTab.tsx` returns `:29`, `:52`,
`:148`, `:228` - one call inside `handleAutoGrade`'s transition, one `action=`
binding.

Section 4.4 rules: "the `<form>` at `:228` keeps its single `action={formAction}`
and its single call inside `handleAutoGrade`'s transition, and the incremental
run is started from the SAME submit, intercepted in the hook."

Three things are wrong with this as a design:

1. **Nothing suppresses the existing dispatch.** With `action={formAction}`
   live, submitting the form invokes `gradeAction` - the whole-run, N-model-call
   path. If the hook also starts the pool, the run is graded twice and paid for
   twice. The document never says how the old dispatch is prevented, and A5
   (`formAction(` exactly once, `autoGradeTransition.wiring.test.ts:159-162`) is
   what backed it into this corner. Its escape - "if wave 4 finds it cannot
   honour either, the test changes in the SAME wave" - is a hedge, not a shape,
   and shape is this seat's entire output.
2. **`prepareGradingRunAction(formData)` needs the FormData at submit time**,
   which with `action=` is React's to hand to the server action, not the
   client's. Reaching it requires `onSubmit` + `preventDefault` + `new
   FormData(...)`, which is incompatible with keeping `action={formAction}`
   live. Unspecified.
3. **Press twice.** `pending` comes from `useActionState` (`page.tsx:63`) and
   drives `disabled={pending || ...}` on Start Review (`GradingTab.tsx:347`).
   An incremental run started outside `useActionState` leaves `pending` false,
   so the button is NOT disabled during the run. The `useRef` lock in 4.2 stops
   a second POOL; it does not stop a second FORM SUBMIT, which starts a full
   blocking whole-run grade on top of the pool already running. The brief asked
   what happens when the user presses grade twice; the answer as designed is
   "both paths run".

### BLOCKER 5 - the per-item Server Action has no declarable ceiling, and the document's own cited source says exactly that

Class: **a candidate table with a false dichotomy** (NEW).

Section 4.1's whole survival argument is "every call is one model call, so the
platform clock resets on each". The reset is real. **The clock's length is never
established**, and the document quotes the source that says it cannot be:

```
sed -n '44,62p' src/app/api/course-intel/ask/route.ts
```

> Next honours `maxDuration` only at the PAGE level, and src/app/page.tsx - the
> page this feature is reached from - is a client component that declares none.
> So every Server Action reachable from it is capped by whatever the platform's
> unconfigured default happens to grant, never an explicit, confirmed ceiling.
> Three routes in this repo already moved off Server Actions for exactly this.

Section 1.2 cites this file - for the half that says 60s is Hobby's hard cap,
and not for the half that says a Server Action reached from `page.tsx` has no
confirmed ceiling at all and that this repo's established remedy is to MOVE OFF
Server Actions. So the design replaces one invocation with an undeclarable
ceiling by N invocations each with the SAME undeclarable ceiling, and calls that
survival.

The 4.1 table makes "Route Handler + `maxDuration = 60`" and "client pool over a
per-item action" mutually exclusive rows. They are not. **A client pool over a
per-item ROUTE HANDLER at `maxDuration = 60` is the only candidate with both a
reset clock and a confirmed ceiling**, and it is never considered. If one model
call can exceed the unconfigured default, every item fails, the `.catch` turns
each into a `grading-failed` row, and the run reports N failures as a completed
run - green on every gate.

This cannot be settled in this checkout. See "For the owner" below.

### BLOCKER 6 - the pending row renders a sentence that is false, in an editable box, and can be persisted there

Class: **reuse of copy whose meaning does not transfer** (NEW).

Section 4.4: "THE ROW NOT YET REACHED ... It is `UngradedResult` with
`{ kind: "not-attempted", stoppedBy: "run-deadline" }` ... whose copy already
exists ... No new discriminant, no new copy sheet ... This is the largest reuse
in the design".

The copy:

```
awk 'NR==195' src/lib/grade/types.ts
  "run-deadline": "Not graded: this run's time budget ran out before this submission was started.",
```

For a row that is merely queued behind three workers, that sentence is false.
During a live incremental run of 40, up to 39 rows would simultaneously assert
the run's time budget ran out.

It gets worse on contact with the existing pipeline:

- `awk 'NR>=148&&NR<=156' src/lib/grade/engine.ts` - `buildUngradedRow` sets
  `const strengths = outcome.message` at `:153` and composes it into
  `overallComment` at `:154`. Per `docs/backlog.yml`'s A13 note, `strengths`
  renders in an EDITABLE textarea on `GradingResults`.
- `awk 'NR>=50&&NR<=54' src/app/components/grading-results/ungradedDisclosure.ts`
  records that a stale seed written into
  `ta-grading-results-edits:${canvasUrl}` "crosses to the other, keyed by bare
  student name" - so the false sentence can be stranded in a persisted edit and
  outlive the run that produced it. That file already carries a four-entry
  `RETIRED_NOT_ATTEMPTED_MESSAGES` allowlist (`:55-60`) built to clean up the
  last time this happened.

This is A31/A13's "the false instruction is already on screen" defect
reproduced inside the fix for the thing A39 is about - the same class the
document's own section 2.1 builds its argument from. A pending row needs its own
discriminant, or a client-side placeholder that is not an `UngradedResult` at
all. The claimed reuse is the defect.

### BLOCKER 7 - wave 3 cannot satisfy W3-3, because 6.3 puts the storage calls where neither canary can see them

Class: **a construction that makes its own pass condition unsatisfiable** (NEW).

Section 6.2 places the store at `src/lib/grade/rubric-memory.ts`. Section 6.3:
"load/save live in the pure leaf, modelled on `repoGradesUiState.ts:192-205`".

Both canaries require the read AND write calls to be in the SURFACE'S OWN
directory text:

- `awk 'NR>=697&&NR<=732' src/app/components/grading-recording/grading-rows.test.ts`
  - `isWired` tests `combined`, which is `grading-recording/` joined with
  `assessment-shared/` only, and `:718-731` runs it per key.
- `awk 'NR>=209&&NR<=224' src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`
  - `strippedCombinedSource` is built at `:184-186` from
  `fs.readdirSync(SNAPSHOT_GRADING_DIR)` non-test files only.

`src/lib/grade/` is in neither haystack. So `ta-rec-grade-rubric`,
`ta-snap-rubric` and `ta-snap-assignment` fail `isWired` / the `:216`-style
assertion, and W3-3's own second direction of failure fires ("equally RED if a
key is added to an expected set that no source file actually reads and writes").

The repo already hit this and solved it once, differently:
`snapshot-grading.structure.test.ts:141-174` is a bespoke cross-directory block
written specifically because `ta-snap-table`'s real calls live in
`assessment-shared/`. The design neither plans that block nor notices that the
model it cites (`repoGradesUiState.ts`) is a leaf in the SAME directory as the
surface it serves, which is exactly why it works there.

Note the interaction with DECISION 3: "the relevant exact-key-set canary tests
must be bumped in the same commit" is not satisfiable under 6.3's placement.

---

## MAJOR

### MAJOR 1 - the fold mechanism in 2.1 is misstated, and the real instance is on a file wave 2 writes and does not fix

`awk 'NR>=291&&NR<=356' src/app/components/GradingTab.tsx` confirms
`minRows={10}` with no `maxRows` at `:295-306` and `:311-322`, and the Start
Review button at `:343-356`. But `minRows` is a MINIMUM: **both fields are
already ten rows tall today when empty.** The document's stated mechanism - "a
restored rubric and a restored description mean those two textareas arrive
NON-EMPTY and already ten rows tall, pushing the only control that starts a run
further down than it is today" - is false for any restored value of ten rows or
fewer. The remedy (`maxRows`) is still correct; the argument for its urgency on
this surface is not.

Meanwhile the real instance is one file over, on a surface wave 2 writes:

```
awk 'NR>=405&&NR<=458' src/app/components/CartridgeDropPanel.tsx
```

`multiline minRows={4} fullWidth` at `:407-416` with **no `maxRows`**, and a
`Button` reading "Turn on auto-grading" at `:451-458`, BELOW it. Wave 2
persists a rubric into that field (deleting `setRubricText("")` at `:220`), so
content this design adds pushes a control this design did not add further down.

Section 2.2's contract is worded "No control **this design adds** may sit below
unbounded content" - which exempts exactly this case. RES-A39-18 names the file,
says waves 2 and 3 "must check, not assume", and then scopes the fix out
("capping a third file's textarea is in scope only if that wave already writes
it" - wave 2 DOES write it). The ceiling table budgets `CartridgeDropPanel.tsx`
+14 for the memory and nothing for a cap. So the residual contradicts the wave
plan it is filed against, and the only instrument (W2-7) reads a different file.

### MAJOR 2 - W4-1's stated direction of failure is wider than any instrument named for it, and the frozen oracle is written by the wave it guards

```
grep -c "rubricAreas\|canonical\|rubricAreaNames" src/lib/grade/engine.test.ts   -> 0
grep -c "gradeSubmissions\|gradeEntries\|gradeCanvasUrl\|gradeStudentEntries" src/lib/grade/engine.test.ts -> 16   (canary: the instrument fires on this file)
grep -c "rubricAreas\|canonical\|rubricAreaNames" src/lib/grade/engine.ungraded.test.ts -> 20
```

So `engine.test.ts` asserts nothing at all about the fields the refactor
rewrites. `engine.ungraded.test.ts` does touch them, but
`grep -n "rubricAreas\|rubricAreaNames" src/lib/grade/engine.ungraded.test.ts`
shows only structural relations - `toHaveLength(run.rubricAreaNames.length)`
(`:120`), `score` is `""` (`:106,:121`), `toEqual([])` (`:166`),
`map(a => a.area)).toEqual(run.rubricAreaNames)` (`:241`). **Nothing asserts
the stray-folding into `overallComment` (`:371`), the normalized-match renaming
(`:362`), or the ORDER of reconciled areas.** W4-1 declares "RED on any change
to a reconciled row's `rubricAreas` names or order, or to `overallComment`" and
names those two files as the instrument. They cannot deliver it.

The second half compounds it. 5.1 requires "a frozen-literal oracle in
`reconcile.test.ts` - a literal fixture, never a comparison against the old
implementation". Taken literally, the literal is authored by the same wave that
writes the new function, which is a restatement, not an oracle. This repo's own
`guard-before-migration` discipline is to freeze the oracle of the RESOLVED
output from TODAY'S implementation first and prove it catches the worst failure
mode. The document never says to capture it before the change.

### MAJOR 3 - the Canvas scope is specified in 6.2 and built by no wave, and the field it would fill is read-only

6.2's scope table gives B/C Canvas a key shape (`canvas:<normalized url>`) and
its evidence. The per-surface key table eight lines later lists five keys and
**B/C is not among them**; 6.5 confirms "five new keys"; no wave writes it. A
requirement is stated and then dropped with no residual.

If it is intended to ride inside `ta-grading-rubric-memory`, two measured facts
make that unsafe and unaddressed:

- `GradingTab.tsx:317` is
  `slotProps={{ input: { readOnly: source === "canvas" } }}` - on the Canvas
  path the rubric field is READ-ONLY, so a restored value is one the instructor
  cannot correct.
- `GradingTab.tsx:308` is `{(source === "zip" || rubric.trim()) && (` - the
  rubric field does not render on Canvas unless `rubric` is non-empty. Restoring
  memory MATERIALISES a ten-row field that is not on screen today, which is the
  push-down MAJOR 1 describes, on the path the document did not check.
- No rule is given for precedence between a stored rubric and the one the Canvas
  retrieve writes.

### MAJOR 4 - research M2's third and load-bearing direction of failure is dropped

`awk 'NR>=782&&NR<=789' docs/a39-research.md` - M2's pass condition has three
clauses, and the third is "or if the applied rubric's identity is not visible on
the surface without opening anything". M2's objection paragraph
(`:777-781`, quoted verbatim by 6.3) says the move "is only safe WITH the
visible label".

W2-1 carries clauses one and two and drops clause three. W2-2 requires
`describeRubricOrigin` only in the CROSS-SCOPE fallback case. **In the common
case - scope matches, rubric auto-restores - no pass condition in the document
requires the origin label to render at all.** The design adopts the move whose
own source calls it unsafe without the label, and drops the condition that
checks the label.

### MAJOR 5 - DECISION 3's canary consequence is discharged for 3 of 5 keys, and the residual covering the other 2 starts red

DECISION 3: "Every new control persists under a `ta-` prefixed key, and the
relevant exact-key-set canary tests must be bumped in the same commit."

1.9 and 6.2 record honestly that `ta-grading-rubric-memory` and
`ta-cartridge-rubric` have no canary and that this design does not invent one.
That honesty is good. But RES-A39-13's DIRECTION OF FAILURE is "a new persisted
key landing in a directory with no canary and nobody noticing, **which is
today's state for these two**" and its STEP is "escalate with wave 2". A
residual whose instrument is already red at filing time and whose step is
"escalate" measures nothing; `iteration-caps.md`'s anti-gaming rule calls a
residual missing a real step a deletion. Two-fifths of a named owner-decision
consequence is being discharged by deferral. This is a (b) reduce, not a (c)
residual - see "For the owner".

### MAJOR 6 - the 1.2s inter-request spacer is deleted silently, and the deletion has no direction of failure

Under the design, `gradeRunItemAction` calls `gradeEntries` with a
single-element array, so `engine.ts:277`'s `i < limitedEntries.length - 1` is
never true and **the sleep never fires**. Concurrency simultaneously rises from
1 to `INCREMENTAL_CONCURRENCY = 3`.

The document uses the sleep as arithmetic against the alternatives (46.8s) and
never asks what it is for. The sibling it ports from says:

```
awk 'NR>=24&&NR<=25' src/app/components/repo-grades/useRepoGradesBulkGrade.ts
  // every target at once would multiply the GitHub-ingest and model rate-limit
awk 'NR>=192&&NR<=193' src/app/components/repo-grades/useRepoGradesBulkGrade.ts
  // multiply exactly the GitHub- and model-rate-limit pressure
```

So the bound exists because of model rate-limit pressure, and the design removes
the other half of the same control without a sentence. **DIRECTION OF FAILURE,
which the document owes and does not state: a run of 40 in which every item
returns a provider rate-limit error, each isolated by the `.catch` into an
ordinary `grading-failed` row, and the run reported as complete.** That is
strictly worse than today's all-or-nothing, which at least fails visibly, and it
is the exact objection the brief raised about partial failure the instructor
cannot see.

### MAJOR 7 - residual id collision with the census

Census residual register (`docs/a39-census.md:629-637`) and this document's
register use the SAME ids for DIFFERENT residuals:

| id | census means | architecture means |
|---|---|---|
| RES-A39-4 | zip filename convention mis-groups | wave 4 is the fifth writer of `run-deadline` |
| RES-A39-5 | no declared `maxDuration` | the 10 MB per-request budget |
| RES-A39-6 | rubric bank unreachable on default provider | time-to-first-row unmeasurable |
| RES-A39-7 | F/G per-submission cost unmeasured | rubric bank unreachable |

Section 9 does this knowingly and says the id column "was re-derived last".
Both documents are in the repo, and `DEV_LOOP.md` step 0 requires these ids to
reach `docs/BACKLOG.md`, where a citation of "RES-A39-5" is now ambiguous.
Renumber with a distinct prefix, or keep the census ids fixed.

---

## MINOR

Citation and quantity errors. Each was produced by opening the line or running
the command shown. None changes a conclusion; all of them are entry-gate misses
in a document that opens by promising every quantity names its command.

1. `grep -rn "maxDuration" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l` returns **56**, not the 57 in 1.2. Canary `maxDurationNoSuchThing` exits 1.
2. `grep -rn "rubricAreaNames" src | wc -l` returns **140**, not the 47 in section 3.
3. `grep -n "LIMIT" src/file-size-ceiling.structure.test.ts` puts `const LIMIT = 1000` at **`:41`**, not `:39`. Cited as `:39` twice (5.3 and 1.10). `:140` is right.
4. `awk 'NR==45' src/lib/client-state-sweep.ts` is `DEVICE_PREFERENCE_KEYS`; `:46` is blank. Cited as `:46` three times (1.4, 6.5, RES-A39-15).
5. `awk 'NR==31' src/lib/grade/extraction.ts` is blank. `JSZip` is imported at `:1` and `loadAsync` used at `:73` and `:117`. 4.3 cites `extraction.ts:31`.
6. There is no section 7.4 in `docs/a39-research.md` (`grep -n "^### " docs/a39-research.md` shows 7.1 only). The quoted sentence "should never be scheduled ahead of M1 or M2" is in M4's bullet at `:828`. Cited as "research 7.4" in sections 2 and 8.
7. "six of seven costed paths" (sections 0 and 2) is not the census's figure. `docs/a39-census.md:364`: "Six of the nine costed rows cross over at N = 5 or below". It is presented in section 0 inside quotation marks as the census's claim.
8. The zip file input spans `:234-239`; section 2 cites `:236-239` while 6.2 cites `:234-239` for the same element.
9. 2.2's naming table cites `CartridgeDropPanel.tsx:411` for the word "Rubric"; `:411` is `id="cartridge-rubric"` and the label is `:406`.
10. The path-A key is spelled `ta-grading-rubric` in 1.9's third row and `ta-grading-rubric-memory` in 6.2 and RES-A39-13. A persisted key literal should have one spelling.
11. Table 1.10's column is headed "Headroom to 1001" but holds `1000 - count`.
12. Wave 3's ceiling row says "extraction FIRST, then +10" with "Est. after: target <= 940" and gate `-le 940`. W3-1 resolves it to the 3a gate, so the post-3b counts are ~950 and ~954 - real, fine, and ungated. State the post-feature gate.
13. `SnapshotGradingPanel.tsx`'s policy comment is `:143-147` (`:142` is blank); cited `:142-147`. The instructor-instructions discriminator is `:150-157`; cited `:147-157`.
14. `snapshot-grading.structure.test.ts`'s U10 sentence runs to `:132`; 1.9 cites the block as `:125-131`, which cuts it mid-sentence. W3-2's grep would catch the remainder, so this self-corrects.
15. `buildUngradedRow`'s `strengths = outcome.message` is at `engine.ts:153`, not `:152` (inherited from A13's note).

---

## The specific silent-green failure

All seven blockers ship with `npx tsc --noEmit` silent, `npm run lint` at four
warnings, `npm run build` printing its compile line, and all 20,200 tests green.
Concretely, the run that gets built:

The instructor presses Start Review on a zip of 40. `action={formAction}`
dispatches the whole-run action AND the hook starts the pool (B4), so the model
is called eighty times. The pool's three workers fire with no inter-request
spacing (M6); the provider rate-limits; every `.catch` maps each rejection to an
ordinary failed row, so the table fills with 40 `grading-failed` rows and the
run reports complete. Rows that had not started render "Not graded: this run's
time budget ran out before this submission was started." (B6) in an editable
box, and that sentence is seeded into `ta-grading-results-edits`. The instructor
presses Start Review again because nothing disabled it, and the whole thing runs
a second time. Meanwhile the "Rubric used" line is somewhere inside
`GradingResults` and W2-7 is green because the literal it looks for is in a
different file (B3).

**No gate in this repo observes any part of that**, because nothing renders,
nothing exercises a Server Action against a real platform, and the only
placement instrument reads the wrong file.

I also checked the specific hazard the brief names: **no gate or instrument in
the artifact runs a raw multi-path `vitest`.** W2-6, W3-3 and W4-1 all use
`npm run test:paths --`; the single-path conditions use `npx vitest run <one
path>`, which is legitimate per `this-repo.md:38-41`. This is done correctly
throughout.

---

## The feature-already-exists case, argued at its strongest

It is strong for seam 1 and it reframes wave 4.

`src/app/components/repo-grades/useRepoGradesBulkGrade.ts` (489 lines,
`@(Get-Content).Count`, PowerShell) already ships, on path E, every structural
element wave 4 proposes: a client-side pool over a shared cursor
(`:466-478`), a per-item Server Action (`:282-291`), per-target failure
isolation via `.catch` (`:291`), a `useRef` run lock released in `finally`
(`:216,228,234-247`), `{done, total}` progress (`:218`), per-cell results as
they arrive (`:273,:322`), and a shared rubric pinned before the pool opens
(`:405-424,:446-460`). It also already persists a rubric
(`repoGradesUiState.ts:54,:199`) and already emits the exact provenance string
the naming contract adopts (`useRepoGradesBulkGrade.ts:89`, `Rubric used: ...`).

So wave 4 is not an invention, it is a PORT - the document says as much
("ported structurally") - and wave 2's leverage claim is a generalisation of
something path E already does. The honest reframe the document does not draw:
**the app already delivers incremental grading with a pinned rubric and a
rubric-used receipt, on a surface the owner is not using.** Under
`traps-spec.md:69-73` that makes the first question reachability, not
construction - which is precisely the axis section 2.1 establishes and then does
not apply to its own findings. That does not kill wave 4 (path E is GitHub-only,
and the zip path genuinely lacks it), but it changes the risk profile: a port of
a tested, adversarially-reviewed hook is a much smaller thing than what sections
4.2-4.6 describe, and it argues for copying `useRepoGradesBulkGrade`'s SHAPE
including the parts the design quietly dropped (the pinned-rubric prologue is
kept; the rate-limit spacing is not - M6).

---

## The weakest requirement

**W2-1.** "DIRECTION OF FAILURE: RED if the first is greater than zero."

Implemented exactly as written, the cheapest way to make that condition green is
what 6.2 already rules: on path A, before a file is chosen, restore "the
LAST-USED entry". So an instructor opens Grading, a rubric from a different
assignment is already in the field, they upload this week's zip, press Start
Review, and 40 submissions are graded against the wrong rubric. Every gate is
green and W2-1 is green, because it measures interactions, not correctness.

The only thing standing between that and a wrong grade is the origin label - and
MAJOR 4 shows no pass condition requires the label to render in the common case,
and RES-A39-17 admits (correctly) that no instrument in this repo could see it
if it did. This is research M2's own named failure mode - "silent and produces
wrong grades that look right" - reintroduced by the design that quotes it.

The fix is available and cheap: make the pass condition range over the PAIR, as
W2-2 already does for the cross-scope case. That is a construction, not another
assertion.

---

## The residual register, audited

No restructuring table was owed (the census is a measurement artifact, and
section 9 says so correctly). All 18 ids are accounted for: RES-A39-1 is
discharged by DECISION 3 in section 9, and 2-18 are in the register. Most are
genuinely five-field and several are good - RES-A39-8 (the four browser-only
intake traps, with "never merged into a wave whose other pass conditions are
suite-checkable, because it would borrow their green") and RES-A39-17 are both
better than this repo's average. Three do not hold:

- **RES-A39-13** - direction of failure is "today's state", so it starts red and
  can never transition. See MAJOR 5.
- **RES-A39-15** - the OBJECT is "what survives on a shared device between
  sessions of the same signed-in user"; the DIRECTION OF FAILURE is "any of the
  five keys being ADDED to `DEVICE_PREFERENCE_KEYS`", which is a different and
  opposite concern (surviving a sign-OUT). The residual's actual risk has no
  stated direction. It is an escalation wearing a residual's five fields.
- **RES-A39-18** - its owner is the very waves being planned, its step is "in
  waves 2 and 3", and its remedy is scoped out by its own last clause even
  though those waves write the files. See MAJOR 1.

Ordering: the register runs 2..15, 17, 18, 16. Cosmetic.

One process note that is not the seat's fault but is owed: section 11 says each
residual "is owed an entry" in `docs/BACKLOG.md` "by whoever lands the next A39
chunk". `DEV_LOOP.md`'s step 0 and its "Record disposals as they happen" clause
say the append happens AT DISPOSAL, and that a residual living only in a
document is "a deletion with extra steps". Eighteen residuals across two A39
documents are currently in that state.

---

## What the extraction admission buys, and what it does not

Section 10 admits: "I did not read either panel line by line, and naming an
extraction target I have not read would be the thing this repo's traps card
warns against." That admission is correct and the SHAPE constraint plus the lint
trap make it more than a shrug. I verified the trap is real and correctly cited:
`docs/loop/this-repo.md:85-100` is exactly the
`preserve-manual-memoization` account, it names
`handleNextStudentConfirm`, and it names the shipped workaround. The document
correctly promotes `npm run lint` to a wave-3 gate with the 4-warning baseline
(`this-repo.md:78-83`).

I also checked feasibility rather than taking it on trust:
`grep -n "^  return (\|useCallback\|useEffect" src/app/components/grading-recording/GradingRecordingPanel.tsx`
puts `return (` at `:694`, so roughly 500 lines of hooks precede ~296 lines of
JSX, with `runExtraction` (`:453`) and `handleGradeAll` (`:563`) as large
candidates. A 50-line `.ts` extraction is plausible. So the admission is
ACCEPTABLE - but with one caveat the document should carry: this repo's own
`modulesview-at-ceiling` memory records that a dedicated agent sized an
extraction against the 1000 limit rather than the feature's additions and still
left the file bigger. The 940 target is stated without any measured basis, and
the `+10` / `+14` feature estimates are unmeasured too. Say that the 3a target
is provisional and that the wave re-derives it from what it can actually move.

---

## Verdict and counts

**NOT BUILDABLE AS WRITTEN.**

- BLOCKER: 7
- MAJOR: 7
- MINOR: 15

### Blocker classification

| # | Class | NEW / REPEAT |
|---|---|---|
| 1 | false absence (a grep asserted without being run, contradicted by the same document's own citations) | **NEW** |
| 2 | an enumeration treated as the set (one persisted-run parser named, two exist; the second is in no write set) | **NEW** |
| 3 | a check whose assertion cannot fail (index comparison against a literal that is in another file), compounded by a ruling contradicted by a later section | **NEW** |
| 4 | a contract stated as a constraint instead of a mechanism (the dispatch seam), producing a double-spend and an undisabled control | **NEW** |
| 5 | a candidate table with a false dichotomy (Route Handler vs client pool treated as exclusive; the survival argument rests on an unestablished platform default the cited source says cannot be declared) | **NEW** |
| 6 | reuse of copy whose meaning does not transfer (a pending row asserting the run's time budget ran out, in an editable and persistable box) | **NEW** |
| 7 | a construction that makes its own pass condition unsatisfiable (storage leaf placed outside both canaries' scan scope) | **NEW** |

No blocker is a repeat: this is round 1 and the census/research rounds are
different artifacts. I have not relabelled anything to buy a round; blockers 3
and 7 are distinct mechanisms (a vacuous assertion versus an unsatisfiable one)
and take different corrective rules.

### Stopping point

**Rulings and design.** Not measurement - every quantity I needed was
measurable in this checkout, and I re-measured rather than inheriting.

Blockers 1, 2, 3, 6 and 7 and all seven majors are ordinary design revisions the
seat can make in one round. Blocker 4 (the dispatch mechanism) needs a ruling on
whether `autoGradeTransition.wiring.test.ts`'s A5 may be changed, which is the
orchestrator's to make and which the document currently defers into the wave.

### What must go to the owner rather than into round 2

Under `AGENTS.md`'s "Two rounds, then ask", these cannot be settled by any
further round in this checkout:

1. **BLOCKER 5 - the Server Action ceiling.** What `src/app/page.tsx`'s Server
   Actions actually get on this Hobby deployment is a production fact. Either
   the owner measures it, or the design switches the per-item call to a Route
   Handler with `maxDuration = 60` (which this repo has done four times and
   written the rule down for). Recommendation: switch to the Route Handler and
   keep the client pool; it costs nothing the design claims and removes the
   unknown. Ask the owner only if they want to preserve the Server Action.
2. **MAJOR 5 - DECISION 3's canary consequence for two of five keys.** Accepting
   `ta-grading-rubric-memory` and `ta-cartridge-rubric` with no exact-key-set
   canary is a scope call the owner made the decision that created. Cost of
   leaving it: two persisted keys that no gate will ever notice drifting.
   Alternative: scope a root-level canary as its own row. This is
   `iteration-caps.md` disposal (b), not (c).
3. **RES-A39-15** - a rubric lingering on the device for a signed-in session is
   the cost DECISION 3 buys, and only the owner can say it is acceptable now
   that it is visible. The document says this correctly; it just needs to be
   asked once.
4. **The reframe.** Given that path E already ships the pool, the pinned rubric
   and the "Rubric used" receipt, is wave 4 a build or a port, and is the real
   A39 remedy reachability rather than construction? That is a scope judgement
   with the owner's context, not a fact the tree settles.

---

## Gates run over this file

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Exit code read from a file, never a pipe
(`... > gate.txt 2>&1; echo $? > exit.txt; cat exit.txt`): **0**.

```
Test Files  2 passed (2)
Tests  21 passed (21)
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
```

`git status --short` at the end of this check:

```
 M docs/css-orphans.md
?? docs/a39-check.md
```

**My write set is `docs/a39-check.md` and nothing else.** `docs/css-orphans.md`
was already modified at session start and I did not touch it. Mid-check a
concurrent agent briefly showed `docs/BACKLOG.md`, `docs/a24-scope.md`,
`docs/a32-scope.md`, `docs/backlog.yml` and two `src/tools/backlog/` files as
modified; those are that agent's, they have since landed, and none is in my file
list. I opened `docs/backlog.yml` read-only, to verify RES-A39-4's A31
quotation.

ASCII check on this file: `LC_ALL=C grep -c '[^ -~\t]' docs/a39-check.md`
returns 0 and exits 1. Canary through the same instrument:
`LC_ALL=C grep -c '[^ -~\t]' docs/REGRESSION.md` returns 9, so the scan fires.
