# A41 scope, round 1 adversarial check

Checks `docs/a41-scope.md` (936 lines by `@(Get-Content docs/a41-scope.md).Count`
and `wc -l`, committed at `a4312b4`). Fresh checker; did not author it.

## 0. How every number below was produced

**(a) Reading, against the CURRENT tree.** Four of the cited files are under
concurrent edit by sibling agents right now (`git status --short` shows
`src/app/actions/grading.ts`, `src/lib/grade/engine.ts`, `src/lib/grade.ts`,
`src/lib/grade/types.ts`, `src/app/components/GradingTab.tsx` modified). Every
citation reported below was re-opened this pass; where a figure moved I say
whether it is DRIFT (the tree moved) or an ERROR (it never held).

**(b) Executing the real parser over a SCRATCHPAD COPY.** No production file was
mutated - this repo bans concurrent sabotage-verify. `src/lib/grade/utils.ts`,
`constants.ts` and `types.ts` were copied to the scratchpad and driven with
`node --experimental-strip-types` (node `v22.14.0`, `node --version`). The copy
differs from the real file in exactly one line, same diff the scope recorded:

```
$ diff --strip-trailing-cr src/lib/grade/utils.ts <scratchpad>/g/utils.ts
3c3
< import { getMimeType } from "./constants";
---
> import { getMimeType } from "./constants.ts";
diff exit=1
```

Positive canary for that instrument: `grep -n "lms-generation.test.ts"
src/file-size-ceiling.structure.test.ts` exits **0** and the same grep for the
scope's own four-name pattern exits **1**, so an exit-1 from that family is a
real absence. Exit codes were read from the command, never through a pipe.

Line counts: `@(Get-Content <file>).Count` in PowerShell, cross-checked with
`wc -l`. `Measure-Object -Line` was not used as a measurement (it is quoted once,
in m1, only to show a disagreement).

**Instrument hygiene check the brief asked for:** no gate or instrument in the
scope runs two or more test paths through a raw `vitest`/`npm test`. Section 6.1,
section 10's gate run and RES-A41-1 all use `npm run test:paths --`. Clean.

---

## VERDICT: BUILDABLE IN PART

**5 blockers, 7 majors, 7 minors.**

The mechanism half of this document is right and independently reproducible. The
REMEDY half rests on a caller measurement that does not survive re-measurement,
a headline statistic that counts the repo's own required behaviour as the harm,
a primary instrument that cannot go green on one branch of the fork it escalates,
and a candidate sentence that violates the document's own copy constraint.

---

## BLOCKERS

### B1. The remedy-killing measurement is wrong: two of the five callers cannot reach this parser, and the step type holding two more is classified ALWAYS INTERACTIVE

**Class: a census that counts callers of the entry point instead of callers that
reach the defect, then prices a remedy off the larger number.** NEW.

Citation: `docs/a41-scope.md:283-301`, the five-caller table, and its conclusion
at `:294-301`: "there are FIVE callers not two, and FOUR of the five have no
human present at the moment of grading. A remedy built on asking the instructor
to confirm something is structurally unavailable on four fifths of the call
sites."

The count of five `gradeAction` invocation sites is CORRECT. I reproduce it:

```
$ grep -rn "gradeAction" src/ | grep -v "\.test\."      # 16 lines
  src/app/page.tsx:63  useActionState(gradeAction, ...)
  src/lib/workflows/registry/steps.grading-cartridge.ts:108
  src/lib/workflows/registry/steps.grading-run.ts:481
  src/lib/workflows/registry/steps.grading-run.ts:549
  src/lib/workflows/registry/steps.grading-draft-flow.ts:271
$ grep -rn "gradeActionZZZ" src/ ; echo $?   # negative canary, exit 1
```

Everything the table then says about those five is wrong in two ways.

**(i) Two of the five never reach `groupSubmissionsByStudent`.** `gradeAction`
opens with `if (canvasUrl) { ... }` at `src/app/actions/grading.ts:740` (read as
`:739` earlier in this pass, re-verified at `:740` after sibling commit `2b5b4c7`
landed mid-check - the file is still 941 lines and every other address here is
unmoved), and that
whole block returns before the zip branch. Measured:

- `steps.grading-run.ts:476` sets `formData.set("canvasUrl", row.canvasUrl ?? "")`
  and sets no `studentSubmissions`; its loop at `:429-430` is
  `for (const row of plan) { if (row.offline) continue; }`, i.e. LMS rows only.
- `steps.grading-draft-flow.ts:262` does the same (`canvasUrl` only, no zip).

The scope's own section 2.3 already states that the Canvas branch takes identity
from `work.student` at `src/lib/grade/extraction.ts:290` and is "not exposed"
(`:309-312`). Its table at `:290-292` nevertheless assigns I1 and I3 the branches
"`embedded` -> `:854`; `gemini` -> `:907`". Those two statements cannot both
hold. **The set actually exposed to the collapse is three: A (`page.tsx:63`), H
(`steps.grading-cartridge.ts:108`) and I2 (`steps.grading-run.ts:549`, the only
workflow site that sets `studentSubmissions`).**

**(ii) The attended/unattended split inverts.** Of the three exposed callers:

| Exposed caller | Step type | This repo's own classification |
|---|---|---|
| `page.tsx:63` | - | attended (a browser form) |
| `steps.grading-cartridge.ts:108` | `grade-cartridge-submissions` | `HEADLESS_SAFE_STEP_TYPES`, `src/lib/workflows/headless.ts:84` - genuinely unattended |
| `steps.grading-run.ts:549` | `grade-submissions` (step declared at `steps.grading-run.ts:368`) | **`ALWAYS_INTERACTIVE_STEP_TYPES`, `src/lib/workflows/headless.ts:350`** |

`headless.ts:346-350` gives the reason in its own comment: `grade-submissions`
"sets requireInput to review and approve grades before they post to the LMS", and
`grep -n "requireInput\|requireConfirmation" src/lib/workflows/registry/steps.grading-run.ts`
returns `:275`, `:301`, `:357`, `:612` - the pause machinery is already in that
file. Its zip comes from `values.submissionsZip`, declared `type: "uploads"` at
`steps.grading-run.ts:381-386`; `headless.ts:357-359` states for the sibling
`extract-pptx-slides` that an `uploads` input "needs a live uploaded File ... and
cannot be supplied by a schedule/trigger binding". So I2 cannot run unattended at
all.

**So a confirmation gate is unavailable on exactly ONE of the three exposed
callers, not four of five.** The sentence at `:299-301` - the single most
consequential claim in section 4 and the thing that makes option 2 read as
structurally dead - does not hold. Option 2's real cost is "needs a
non-interactive fallback for the cartridge drop", which is a different and much
cheaper problem.

Disposition: **fixable in the one revision.** Re-table the callers by EXPOSURE
(three) and classify attendedness from `src/lib/workflows/headless.ts`, not from
the fact that a workflow step exists. Then re-cost option 2 against that.
Sections 4.2, 5's C1, RES-A41-5 and disposition-table row 4 all inherit the wrong
number and must be re-derived. **Do not dispatch section 4 while this stands.**

---

### B2. The 53.9% figure measures a property the repo's own REQUIRED behaviour also exhibits, and its generator is not published

**Class: a quantity whose instrument binds to a proxy that the harm does not
uniquely determine - the mirror of the tautology this very item is about.** NEW.

Citation: `docs/a41-scope.md:734`, `sets where rows < files (the A41 collapse):
10777 (53.9% of sets)`, presented at `:740-744` as the executed proof that
"53.9% of those same sets collapsed".

`rows < files` is not the collapse. It is also what happens when ONE student
submits two files - which `src/lib/grade/utils.test.ts:336-351` pins as REQUIRED
behaviour ("does NOT split one student's own two date-prefixed submissions into
two rows"), and which the scope's own section 6.5 note at `:758-766` names as the
exact reason T1's fixture must be distinguished by CONTENT.

Measured control, ground truth carried per file, over the scratchpad copy of the
real function (`node --experimental-strip-types t3.ts`, 20,000 sets of 2-6 files,
15 distinct students, seeded LCG so it reproduces):

```
CONTROL (fully supported studentname_date_time_filename convention, flat):
  n=20000  rows<files = 7178 (35.9%)   TRUE cross-student collapses = 0
FOLDER SHAPE (the scope's own section 1.3 row 4 shape):
  n=20000  rows<files = 16622 (83.1%)  TRUE cross-student collapses = 16322 (81.6%)
```

**The metric fires on 35.9% of sets that contain zero instances of the defect.**
Every one of those 7,178 is a same-student multi-file merge on input the app
fully supports.

The scope's own "worst collapse" sample at `:735-737` shows the contamination in
the document itself: it lists `AlvarezMaria/Homework Draft.pdf` AND
`AlvarezMaria/Homework Final.txt` - two files under one folder, i.e. one student,
whose merge is correct.

**And the number is not reproducible from the document.** "15 realistic stems x 4
extensions x 4 directory prefixes" (`:728-729`) does not name the stems. The
figure is a property of that undisclosed list. Measured over three stem lists,
same 20,000-set harness and the same metric:

```
GEN-A  stems sharing leading runs (matches the visible sample): 73.0%
GEN-B  stems with distinct leading runs:                        34.2%
GEN-C  real Canvas convention names:                            34.2%
```

Zero uniqueness-assertion failures in all five runs, which is consistent with the
scope and with my own proof in the "confirmed sound" list - so B2 does NOT weaken
the tautology finding, which needs no generator at all.

Sections 6.4 and 6.5 therefore contradict each other: 6.5 forbids the fixture
shape that 6.4's headline statistic is mostly made of.

Disposition: **fixable in the one revision.** Either publish the stem list and
restate the figure as "sets where `rows < files`", saying in the same sentence
that this is NOT the harm and quoting the 35.9% control; or re-run it with
per-file ground truth and report the cross-student rate (81.6% on the folder
shape, 0% on the supported convention). Do not delete it silently.

---

### B3. T1, the scope's primary instrument, can never go green under fork answer X - and wave 1 is not shape-independent

**Class: an instrument whose PASS state is unreachable on one branch of an
unresolved fork (a permanently-red gate).** NEW.

Citations: T1 at `docs/a41-scope.md:754`; wave 1 at `:794-803`; the fork at
`:586-589`; RES-A41-1 at `:854`.

T1's object is "the returned entry COUNT against the number of distinct-content
input files", instrument "one `groupSubmissionsByStudent` call in
`src/lib/grade/utils.test.ts`", direction "RED when the returned count is LOWER
than the input count". I reproduce today's value: row 4's fixture gives
`filesIn=3 rowsOut=1`.

Wave 1 at `:794-796` is declared "the failing test, shape-independent. Lands
first, red, on both branches of the fork", and `:803` says "This wave is expected
to END RED".

Fork answer X at `:587-588` is a gate with "identity resolution untouched". Wave
2X's write set (`:808-812`) is a new leaf plus `src/lib/grade/extraction.ts` and
`src/lib/grade/engine.ts`; wave 3X's (`:816-820`) is `src/app/actions/grading.ts`
and `src/app/components/GradingTab.tsx`. **None of those five files can change
what `groupSubmissionsByStudent` returns.** So under X, T1 is red after wave 1,
red after wave 2X, red after wave 3X, and red forever - `npm test` never comes
back to green, which is not a shippable end state, and `iteration-caps.md`'s
"steps that execute run until clean" has nothing to run to.

RES-A41-1 inherits it: its owner is "the chunk whose write set includes
`src/lib/grade/utils.ts` or `src/app/actions/grading.ts`", and under X no wave
writes `utils.ts`, so the residual has no discharging step.

Disposition: **fixable in the one revision.** T1 must be branch-dependent and
must say so: under Y it is the row-count assertion as written; under X the
row count is UNCHANGED BY DESIGN, so the executing instrument has to be over the
new decision leaf's output (does it refuse / what numbers does it report), with
the 1-against-3 row count kept only as a documented characterisation assertion.
Wave 1 is then not shape-independent and the wave plan must stop saying it is.

---

### B4. The escalated fork does not partition the remedy space; branch Y is worded as complete when the scope's own section 4.3 says it is partial, and branch X hides the only branch that prevents the harm behind an "or"

**Class: a terminating question whose branches do not span the space, so an answer
forecloses the only remedy for cases that branch does not cover.** NEW.

Citation, the fork verbatim at `docs/a41-scope.md:586-589`:

> A41 produces either (X) a GATE - the run refuses or requires confirmation when
> the parse collides, identity resolution untouched; or (Y) a PARSER CHANGE -
> per-student folders become a first-class identity signal, no new gate. Which?

**Branch Y as worded is a complete fix; section 4.3 says it is not.** `:561-564`:
option 3 "does nothing for section 1.3 rows 2, 3, 6 and 8 (flat zips, no
folders), so it is a partial fix that could be mistaken for a complete one - the
most dangerous property any of the three has". Row 2 is A41's OWN founding
example. I reproduce it: `Homework Final.docx` + `Homework Draft.docx` ->
`filesIn=2 keys=[homework,homework] rowsOut=1`. Y's own clause "no new gate" then
forecloses the only remedy for rows 2, 3, 6 and 8. An owner reading the question
cannot see any of this.

**Branch X bundles two remedies with opposite properties.** Only REFUSE prevents
the wrong grade. CONFIRM discloses and then grades three students' work as one
submission - which is the scope's own second failure mode at `:529-530`. The
wording "refuses or requires confirmation" means the owner cannot pick the one
sub-branch that actually closes the defect.

**Consequence: there is no answer to this question that ends the activity with
the defect closed.** X-with-confirm and Y both ship a known-wrong grade. That is
exactly the shape `AGENTS.md`'s "Two rounds, then ask" forbids - "if applying the
answer seems to require re-deciding something else, that is the signal the
question was the wrong one".

Disposition: **the decision is the owner's, but the QUESTION must be re-worded in
the revision before it is asked.** Re-wording is transcription, not re-deciding:
each branch states what it closes and what it leaves live. My recommended shape
is in section "The question for the owner" below.

---

### B5. The one candidate user-facing sentence violates the scope's own C3

**Class: a sentence that is true of an internal object and false to its reader -
the mechanism behind all five false sentences this codebase has shipped.** NEW.

Citation: the candidate at `docs/a41-scope.md:648`:

> Read 14 files and grouped them into 9 submissions.

C3 at `:630-634` rules: "No sentence may assert a student count is authoritative
... Wording must bind to the observable (files, keys, rows), not to students."

"Submissions" is not one of the three observables C3 names, and in this app's own
vocabulary a submission is one student's work: `src/app/components/GradingTab.tsx:322`
reads "Upload a zip archive of student submissions, or a single student's file",
and the returned type is `StudentSubmissionEntry`. So "9 submissions" asserts a
student count under a synonym. On the scope's own headline set the emitted string
would be "Read 3 files and grouped them into 1 submission" for three students -
false to the instructor in precisely the way C3 exists to prevent. The scope's
claim at `:651-653` that it "survives C3" is wrong on its own rule.

Second defect in the same sentence: **"Read 14 files" is not the entry count.**
`src/lib/grade/extraction.ts:83-85` silently returns on any unsupported
extension, and `:108`/`:111` divert extraction failures into
`failedSupportedFiles`, which `extractStudentEntries` (`:137-138`) discards
entirely. So the numerator is "files that yielded text", while the instructor
counts files in the zip. On a zip with three `.pages` files the sentence
under-reports and says nothing about the gap.

This is a blocker rather than a major because C4 (`:636-641`) instructs the
instrument to assert the EMITTED string. Freezing this candidate ships a sixth
false sentence with a green instrument behind it.

Disposition: **fixable in the one revision.** Withdraw the candidate, or rebind it
to `rows`/`keys` and to a numerator the code actually has (and name where the
skipped/failed files go).

---

## MAJORS

### M1. `state.warnings` is populated on four sites, not one - including the `provider === "other"` path the scope declares out of scope - and the Gemini zip branch populates none. Wave 3X names it as the renderer.

Citation: `docs/a41-scope.md:436`, "`state.warnings` is populated only on the
`embedded` branch, from `builtRubric.warnings` (`grading.ts:875`)". Measured
(`grep -n "warnings" src/app/actions/grading.ts`):

```
699:  return { run: gradingApiToRun(...), error: null, warnings };   <- provider === "other", from resp.warnings
784:            warnings: discussionRubric.warnings,                  <- Canvas discussion, embedded
804:          warnings: builtRubric.warnings.length ? ... : undefined, <- Canvas, embedded
875:        warnings: builtRubric.warnings.length ? ... : undefined,   <- zip, embedded
```

`:699` is the Deterministic Grading API path, which `:306-308` of the scope rules
out of scope. The enumeration is a floor, not the set - which is the exact ruling
the scope quotes at `:605-607` (RULING 64).

**This is the silent-green failure for this item.** Wave 3X (`:819`) names
`GradingTab.tsx` "the RENDERER: `state.error` at `:262-266`, `state.warnings` at
`:504-510`". A disclosure sentence routed through `warnings` would render on the
embedded provider and NOT on the Gemini zip path (`:905-910` returns no
`warnings` field) - the default provider, and the very path section 2.2 says
degrades silently. tsc, lint, `next build`, every structure test and 22k vitest
tests would pass, because vitest renders no component here, and the instructor on
the default provider would see nothing at all. Fixable in the revision: state
that `warnings` is embedded-only and that the Gemini branch needs its own
channel.

### M2. The one signal section 3.2 says exists rests on duplicated React keys, and 3.2 asserts as fact what RES-A41-6 records as unverified

Citation: `docs/a41-scope.md:435`, "PRESENT BUT AMBIGUOUS. It lists every
`submittedFiles[].name`, so the collapsed row DOES show three entries". Against
`:446-447` and RES-A41-6 (`:859`), which record the opposite reading - "the Files
column rendering repeated names rather than de-duplicating them" - as unverified.

The document asserts one side as a verdict and routes the other to a residual.
Worse, there is a readable fact it missed:
`src/app/components/grading-results/FilesCell.tsx:40` keys each list item
`key={`${result.student}-file-name-${file.name}`}`. On the scope's own headline
set I measured `row.student = "essay"` and
`submittedFiles = ["essay.docx","essay.docx","essay.docx"]` - so all three `<li>`
carry the byte-identical key `essay-file-name-essay.docx`. Duplicate keys are a
React reconciliation hazard, not a render guarantee. So "DOES show three entries"
is exactly the claim that cannot be made from reading, and it is load-bearing:
3.2's conclusion at `:438-442` is that this is "the only signal that exists". If
it does not render, the harm is larger than scoped. Fixable: state it as a
reading claim, cite the duplicate key, and put the duplicate key itself in
RES-A41-6's failure direction.

### M3. The absence instrument behind "no count of graded rows" is case-sensitive and misses the one place a count IS rendered; the conclusion survives only because of a gate the scope never names

Citation: `docs/a41-scope.md:433`, "`grep -rn "results.length"
src/app/components/*.tsx src/app/components/grading-results/*.tsx` returns 11
lines; on the zip surface they are only GATES". Measured now:

```
$ grep -rn  "results.length" ... | wc -l    ->  10
$ grep -rni "results.length" ... | wc -l    ->  19
```

The nine it misses are all `gradableResults.length` / `postableResults.length`
(capital R), and they include
`src/app/components/GradingResults.tsx:547`, which renders
`Post ${gradableResults.length} grade(s) to Canvas` - a rendered count on the
results surface, plus `:313` and `:342` and `:403`.

The scope's CONCLUSION still holds, and I verified why rather than assuming: that
button is gated on `canvasGradable`, defined at `GradingResults.tsx:306` as
`gradableResults.length > 0`, and `gradableResults` requires a Canvas
`userId`, so on the zip path it is 0 and nothing renders. **The scope is right
for a reason it never states, by an instrument that provably cannot see the
counter-example.** RES-A41-6's own failure direction ("FAILS if a signal exists
that section 3.2 says is absent") is what this would have tripped. Fixable:
re-derive with `-i`, and cite `:306` as the actual reason.

### M4. The fork's revertibility asymmetry rests on a mechanism that does not exist

Citation: `docs/a41-scope.md:833-839`, "any change to `parseSubmissionFileName`'s
priority order (wave 2Y) alters identity for every past run's re-render".

Nothing re-parses a stored run. Measured:
`grep -rn "parseSubmissionFileName\|inferStudentPrefix" src/ --include=*.ts
--include=*.tsx | grep -v "\.test\." | grep -v "grade/utils.ts"` returns three
hits and all three are COMMENTS (`code-run-selection.ts:12`,
`grade/prompts.ts:226`, `grade/single-file-entry.ts:50`). A saved run carries its
already-resolved `student` strings; no re-render re-derives them.

The real mechanism is different and the scope should state it, because the owner
is being asked to decide on this asymmetry: a display-string change means a NEW
run's rows no longer match edits stored under the old strings, and
`gradingResultsHelpers.ts:619-635` (`loadPersistedEdits`) iterates the seeded
CURRENT-run students and takes `parsedRecord[student]`, so a non-matching entry
silently degrades to the seeded fallback - its own comment at `:614-618` says
that drop is deliberate. The asymmetry's direction survives; its stated cause
does not. Fixable in the revision.

### M5. The disposition table claims "WITHDRAWN: none" while silently changing RES-A41-1's owner and dropping A41's step tripwire

Citation: `docs/a41-scope.md:883`, "| Nothing | **WITHDRAWN: none.** No prior
requirement was dropped by this pass. |", audited against the A41 row
(`docs/backlog.yml:625`, the `note` field's tail).

A41's row says: "OWNER: the chunk whose write set includes grade/utils.ts or
GradingTab.tsx ... STEP: the first A39-family implementation chunk that touches
ingestion, **no later than the next change to groupSubmissionsByStudent or
matchStudentFileConvention**."

RES-A41-1 (`:854`) says: owner "the chunk whose write set includes
`src/lib/grade/utils.ts` or `src/app/actions/grading.ts`"; step "Wave 1, before
any remedy wave."

Two unrecorded changes. `GradingTab.tsx` was replaced by `grading.ts` in the
owner, so a chunk writing `GradingTab.tsx` alone no longer owes the instrument.
And the "no later than the next change to `groupSubmissionsByStudent` or
`matchStudentFileConvention`" tripwire - the clause that makes the residual fire
when somebody ELSE touches the function - is gone entirely. Neither appears in
the table, and the table's last row asserts nothing was dropped.
`iteration-caps.md`'s entry gate 3 requires every prior requirement mapped to
kept / handed over / withdrawn. Fixable in the revision: restore the tripwire or
withdraw it explicitly with a reason.

### M6. ORCHESTRATOR RULING: this scope carries a test-notes artifact and a wave plan, both assigned by `DEV_LOOP.md` to deliberately elevated seats, authored by `loop-seat`

`docs/DEV_LOOP.md:50` elevates `loop-test-author` ("the seat that decides WHAT IS
MEASURED AND HOW IT FAILS") and `:48` `loop-plan`, and `:54-61` gives the reason:
"a weak instrument does not fail loudly, it passes, and every downstream step
inherits a green signal that means nothing", and a checker "catches it after the
artifact is written".

`docs/a41-scope.md` section 6.5-6.6 (`:746-777`) IS test notes with oracles and a
sabotage protocol. Section 7.1 (`:783-844`) IS a wave plan with per-wave write
sets. Section 2.5 (`:342-385`) is a reuse survey. All three were produced by
`loop-seat` (declared at `:8`) inside one document, with no architect and no
test-author pass in front of them.

B2 and B3 are exactly the two failure modes that elevation exists to prevent: a
measurement bound to the wrong object, and an instrument whose pass state is
unreachable. This is a ruling, not a seat defect - no revision of the scope
changes who authored it. Disposition: **orchestrator ruling.** Either relocate
6.5-6.6 to `loop-test-author` and 7.1 to `loop-plan` as their own artifacts with
their own rounds, or keep them here and check them as those seats' artifacts.
Section 1-3 and 6.1-6.4 are dispatchable either way.

### M7. The "5 of 8" sniffer disagreement reproduces, but only 1 of the 5 rows supports the conclusion it is used to carry

Citations: `docs/a41-scope.md:360-376`. I reproduced the table exactly against the
real `src/lib/grade/utils.ts` and the regex copied verbatim from
`src/lib/submission-archive-sniff.ts:98`:

```
janedoe_2024-01-01_120000_report.docx   sniffRegex=false parserConvention=true  DISAGREE
janedoe_20240101_120000_report.docx     true  true  agree
CS101_Fall_2026_submissions.zip         false true  DISAGREE   (parser keys "cs101")
my_essay_final_draft.docx               false true  DISAGREE   (parser keys "my")
Homework Final.docx                     false false agree
smith_1001_0_report.docx                true  true  agree
a_b_c_d                                 false true  DISAGREE   (parser keys "a")
week_one_two_three.pdf                  false true  DISAGREE   (parser keys "week")
disagreements: 5 of 8
```

The count is right. But the conclusion at `:371-376` - "Any remedy that predicts
the parser's behaviour by calling the sniffer would tell the instructor their
correct zip is malformed" - is supported by row 1 ONLY. In rows 3, 4, 7 and 8 the
disagreement runs the other way: the parser's loose four-part check over-accepts
and the sniffer is arguably right. Using "5 of 8" to carry a one-row argument is
the same shape as B2. Fixable: split the table by direction and say 1 of 8
supports the false-sentence risk. (Worth noting in passing, though A41 rules it
out of scope: `my_essay_final_draft.docx` keying to `my` means any two files
named `my_*_*_*` collapse through the CONVENTION branch, not the fallback.)

---

## MINORS

- **m1. The only quantity the document states about itself does not reproduce.**
  `:56-58` says `@(Get-Content docs/a41-scope.md).Count` and
  `wc -l < docs/a41-scope.md` "both returned 894 before the corrections in 2.1
  were applied". The committed file is **936** by both, and 754 by
  `(Get-Content ... | Measure-Object -Line).Lines`. The 2.1 corrections are a
  two-line citation shift and cannot account for +42.
- **m2. The ALLOWED_OVERAGE canary points the wrong way.** `:790-791` uses
  "the same grep for `grading.tsZZZ` also exits 1" as the canary. A nonsense
  string exiting 1 proves nothing about detection. I supplied the missing
  positive canary (`grep -n "lms-generation.test.ts"
  src/file-size-ceiling.structure.test.ts` exits 0) and the absence HOLDS: none
  of the four named files has an overage entry, and `LIMIT = 1000` is at `:41`.
- **m3. Section 10's fourth "could not determine" is determinable in one
  command.** `:924-926` says a sixth `gradeAction` caller outside `src/` would
  not appear. A repo-wide search finds `gradeAction` in 26 files, all under
  `docs/`, `src/` and `memory/`; the only other top-level directories are
  `public/` and `supabase/` (`ls -d */`), neither of which contains it. **There
  is no sixth caller.** Close the item rather than listing it as unknown.
- **m4. DRIFT, not error, on four counts** (siblings are editing these files):
  `grep -rn "groupSubmissionsByStudent" src/` now returns 54, not 56 (`:210-214`);
  the `results.length` grep returns 10, not 11 (`:433`); `grep -rln
  "mergedFileCount" src/` returns 49 files, not 50 (`:434`); the `<form>` opens
  at `GradingTab.tsx:296`, not `:294` (`:288`). The scope told consumers to
  re-grep, which is the right instruction.
- **m5. Section 6.6's universal is false as literally written.** `:774-777` says
  "For the uniqueness assertion at `:373` there is NO such mutation inside
  `groupSubmissionsByStudent`". Measured on that test's own fixture: setting the
  returned `student` to a constant gives 1 unique display of 4 rows, so `:373`
  fails. The claim is true only for mutations of the MERGE, which is what the
  paragraph means; as written it overstates and it is the paragraph that defines
  the test author's protocol. One-clause fix.
- **m6. "read by 50 `.ts` files" overstates what `grep -rln` measures** (`:434`).
  That count includes the identifier's own definition site and its test files;
  it is not a count of readers.
- **m7. Section 2.5's table compares the sniffer's REGEX, not the sniffer.**
  `countCanvasPattern` (`submission-archive-sniff.ts:97-102`) is gated by the
  majority rule at `:176` (`canvasCount > files.length / 2`), so a per-name
  "sniffer says Canvas" column is not the sniffer's output. The disagreement
  finding survives; the label should say `canvasPattern`.

---

## CONFIRMED SOUND - do not re-litigate

Each verified independently this pass, with the command named.

1. **The headline finding is CORRECT and reproduces exactly.** All nine rows of
   section 1.3 and the whole of section 1.4 came back byte-identical from the
   scratchpad copy, including row 4: `AlvarezMaria/essay.docx`,
   `BrownTom/essay.docx`, `ChenLi/essay.docx` -> `rows: 1`,
   `row.student: "essay"`, `row.mergedFileCount: 3`,
   `Files column: ["essay.docx","essay.docx","essay.docx"]`, and the three
   students' text concatenated into one `content`. The mechanism is confirmed by
   reading too: `getBaseFileName` (`utils.ts:34-38`) strips the directory before
   the regex at `:123` runs, and `extraction.ts:95`/`:106` write
   `zipParents[fullName]` only `if (zipChain.length > 0)` while `zipChain` grows
   only at `:74` on a nested `.zip`. `extraction.ts:41-46`'s own comment says
   exactly this: "a folder inside the single top-level zip has no key here at
   all". **One condition worth stating in the revision, and the scope does state
   it at `:536-540`:** the folder shape collapses only when the per-student
   filenames also share a leading alphanumeric run. Folders never HELP; they only
   fail to rescue.
2. **The tautology claim is CORRECT, and it does not need the 20,000-set run.**
   `key === display.toLowerCase()` at all six return sites of
   `parseSubmissionFileName` (`utils.ts:193-194`, `:116-117` via
   `identityFromConventionMatch`, `:221`, `:234-235`, `:247`, `:256` via
   `leafStemFallback` `:125`). `grouped` is a `Map` on `inferred.key` (`:301`,
   `:305`, `:308`), so two distinct keys cannot produce one display, and
   `expect(new Set(students).size).toBe(students.length)` at
   `utils.test.ts:373` is guaranteed by construction. Zero failures in 100,000
   generated sets across five distributions, consistent with this.
3. **Section 6.1 reproduces exactly.**
   `npm run test:paths -- src/lib/grade/utils.test.ts
   src/lib/grade/extraction.test.ts src/lib/grade/single-file-entry.test.ts
   src/lib/grade/grouping-zip-parents.wiring.test.ts` gives
   `COVERED ... 28 / 9 / 15 / 7`, `Test Files 4 passed (4)`,
   `Tests 59 passed (59)`, exit 0, with the defect live.
4. **Section 6.3's absence claim holds.** I read all 390 lines of
   `utils.test.ts`: the only grouping-fixture key that reaches step 6 with an
   empty chain is `"src/otherfile.py"` at `:366`, and it has nothing to collide
   with. No fixture anywhere in the file has two distinct-content files both
   reaching step 6.
5. **Section 2.2's degradation claim reproduces.** `{byRaw: new Map(), byBase:
   new Map()}` and `undefined` both give 1 row on A41's two-file example, and
   every `return fallback` / `return empty` site is where the scope says it is
   (`rubric.ts:218-220`, `:233-235`, `:238-240`, `:141-143`, `:154-156`,
   `:171-173`, `:175-177`; +-1 on two of the seven).
6. **Section 2.4's single-file-entry verdict is right.**
   `studentLabelFromFileName` at `single-file-entry.ts:57-63` takes the whole
   trimmed stem; the doc comment naming this defect is at `:47-56`; the guard at
   `single-file-entry.test.ts:71-76` asserts `"Jordan Lee - reflection"`.
7. **Citations spot-checked well past twelve, and the great majority are
   accurate on the CURRENT tree despite the concurrent edits:** `utils.ts` 393
   lines and every address in 1.1; `extraction.ts:134-139` and 300 lines;
   `engine.ts:416`, `:425`, `:431`, `:432` and 517 lines; `grade.ts:14`;
   `grading.ts:707`, `:823`, `:846`, `:848`, `:853`, `:854`, `:875`, `:892`,
   `:893`, `:895`, `:907` and 941 lines, i.e. 59 lines of headroom under the
   1000-line ceiling as stated; `GradingTab.tsx:240`, `:262-266`, `:311-324`,
   `:322`, `:455`, `:458`, `:504-510`, `:513` and 566 lines;
   `gradingResultsHelpers.ts:287`, `:503`, `:632`; `submission-archive-sniff.ts:98`,
   `:176`, `:277`, `:307-310`, `:358-378`; `CartridgeDropPanel.tsx:221`;
   `submission-zip-intake.ts` 158 lines; `utils.test.ts` all nine `describe`
   addresses in 6.2; `file-size-ceiling.structure.test.ts:41`;
   `a31-rulings.md:18` (RULING 1), `a32-build-rulings.md:19-36` (RULING 64,
   including the "enumeration is a FLOOR" sentence), `BACKLOG.md:51` (A38),
   `BACKLOG.md:86` (A34, the retired-literal reason); `a39-census.md:171-173`
   (COLD = 6, WARM = 4), `:331-333` (WARM = 3, "cheapest path in the app"),
   `:579` (the 25% / 33% rank row); `seats.md:73-75` (no leverage claim on a bug
   fix). Section 9's four corrections to the A41 row are all correct.
8. **Feature-already-exists: the strongest version is weak.** The nearest thing
   is `src/lib/submission-archive-sniff.ts`, and section 2.5 is right that it is
   not reusable as-is; its one production caller is `CartridgeDropPanel.tsx:221`
   and the Upload ZIP surface does not sniff. Nothing in the tree detects or
   discloses an identity collision. Not a reframe.
9. **Gate run.** `npm run test:paths -- src/lib/no-emojis.test.ts
   src/source-bytes.structure.test.ts` -> `COVERED` both, 21 tests, exit 0.

---

## WHAT IS DISPATCHABLE AS IT STANDS

- **Sections 0, 1, 2.1, 2.2, 2.4, 2.5, 3.1, 6.1-6.4, 8, 9.** The mechanism, the
  executed collapse table, the Gemini-degradation reading, the
  single-file-entry verdict, the reuse verdict, and the tautology finding are
  sound and independently reproduced. An architect pass may build on these now.
- **Section 3.2** with M2 and M3 applied - its conclusion holds, its evidence
  needs the two corrections.

## WHAT MUST NOT BE DISPATCHED

- **Section 2.3 and all of section 4** until B1 lands. Every cost in 4.1/4.2 and
  constraint C1 is computed off "four of five unattended".
- **Section 5's candidate sentence** (B5) - it must not reach a test author.
- **Sections 6.5, 6.6 and 7.1** (B3, M5, M6) - T1 is unsatisfiable under X and
  wave 1 is not shape-independent.
- **RES-A41-1, RES-A41-5, RES-A41-9** as written. RES-A41-9 is sound in substance
  but its instrument must be re-run: disjointness against the siblings changes
  hourly and `src/app/components/GradingTab.tsx` is now modified too, which
  section 0.1 does not list.

## STOPPING POINT

**Rulings and measurement.**

- *Rulings:* M6 (T1-T3 and the wave plan were authored by `loop-seat` in place of
  two deliberately elevated seats) and the decision to let a scope carry a wave
  plan at all. No revision of the scope resolves these; only a routing decision
  does.
- *Measurement:* B2 needs a ground-truth generator, published, before any number
  in 6.4 is quotable.
- Everything else in B1, B3, B5 and M1-M5, M7 is fixable in the single available
  revision.
- *Not remaining:* design. The design space is adequately characterised once B1
  restores the real caller exposure.

---

## THE QUESTION FOR THE OWNER

To be asked only AFTER the revision re-words it - and every branch below ends the
activity, which the current wording (B4) does not.

> A zip with per-student folders, or with files named after the assignment,
> silently grades several students as one. Measured: three students each
> submitting `essay.docx` in their own folder produce ONE graded row named
> `essay`, holding all three students' text, one score, one feedback body, under
> a key that stored edits and the CSV export cannot be split apart afterwards.
> Three code paths can hit it; two of the three have an instructor present.
>
> Pick ONE. Each is complete as described; nothing below is left for a later
> decision.
>
> **(1) REFUSE.** The run stops, with no grade produced, when two files resolve
> to the same student. Costs 0 extra clicks on a good zip. Closes every measured
> case. Its price: a zip containing one stray `README.txt` that happens to
> collide is refused wholesale, and the instructor must rename files outside the
> app. Trivially revertible.
>
> **(2) DISCLOSE AND PROCEED.** The run shows the parsed roster and its counts,
> asks the instructor to confirm, and grades whatever they confirm. Costs +1 act
> on the Upload ZIP path (4 -> 5 warm acts, +25%, the same weight the census
> assigned to the top-ranked thing worth REMOVING). Does NOT close the defect:
> an instructor who confirms without reading still gets the wrong grade. The one
> unattended caller (the cartridge drop, `steps.grading-cartridge.ts:108`) needs
> a non-interactive fallback, and I recommend making that fallback a refusal.
> Trivially revertible.
>
> **(3) READ THE FOLDERS.** Per-student folders become a real identity signal,
> so the folder case is fixed with no gate and no extra clicks. Leaves the
> FLAT-zip cases live and unremedied - including A41's own founding example,
> `Homework Final.docx` plus `Homework Draft.docx` collapsing onto `Homework` -
> and after shipping it the reason to keep looking is gone. Not trivially
> revertible: while it is live, instructor edits save under new display strings,
> and a revert silently drops them.
>
> **My recommendation: (1), with (3) filed as a separate follow-up row.** Refusal
> is the only option that closes the harm on every measured shape and on every
> caller, attended or not, and it is the cheapest to build and to undo. The cost
> of being wrong is an instructor blocked on a zip that would have graded
> correctly - visible, complainable, and one revert away. The cost of being
> wrong about (2) or (3) is a wrong grade that nobody sees.
