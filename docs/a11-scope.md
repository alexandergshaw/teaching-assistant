# A11 scope: snapshot grading ships an empty Strengths box

Round 3. Author: `loop-seat` (Sonnet). Written 2026-09-20 against a clean tree
at `d70f7a7`.

**This round's process fix.** Rounds 1 and 2 existed only as agent text, so
neither check could audit a disposition table and the round-2 checker said it
could not discharge its own entry gate. This round is a file. Everything below
is auditable by opening the paths it cites.

**What I could not read.** The round-1 and round-2 artifacts are not on disk
(`Get-ChildItem -Recurse -Filter "*a11*"` returns three unrelated files, none
of them a scope document; `docs/` has no `*a11*` file at all). My disposition
table therefore maps the round-2 requirements **as they are reconstructed from
the check findings and Rulings A-H recorded in `docs/backlog.yml` row A11**, not
from the round-2 text itself. Where a prior requirement is only implied by a
ruling that overturned it, the table says so. A checker should treat that
column as my reconstruction and not as a quotation.

**Method.** Every quantity below names the command that produced it. Every
enumeration is derived with an instrument and treated as a floor, cross-checked
with a second instrument where one exists. `npx tsc --noEmit` was NOT run (it
races on `tsconfig.tsbuildinfo`; `this-repo.md` section 2 gives it one caller,
the wave gate).

---

## 1. Disposition table

Every round-2 requirement, and every ruling taken since, mapped to
kept / revised / withdrawn / handed over. Ids in the right-hand column are this
round's requirement ids (section 5).

| # | Prior requirement (round 2, as reconstructed) | Disposition | Where it lands |
|---|---|---|---|
| P1 | Resplit the fix so `prompts.ts` is not edited; put the praise-routing change in `snapshot-grade-prompt.ts` as appended clauses | **WITHDRAWN** by Ruling E. Reason: `buildSnapshotGradeSystemPrompt` embeds `buildSystemPrompt`'s output verbatim at `snapshot-grade-prompt.ts:105` and appends after it, so the composed prompt still contains `:69`, `:90`, `:96`, `:99`, `:100` word for word. Enforcer it protected: none - no test pinned the resplit | Replaced by R1/R2/R3 |
| P2 | Reject editing `prompts.ts` outright because it breaks the other two callers | **KEPT, as the reason for the defaulted parameter.** The breakage is real and measured (section 3.3) | R1 doc comment; R10 byte-identity oracle |
| P3 | A duplicate-detection arm on the notice, with a 40-character containment floor | **WITHDRAWN** by Ruling F. Reason: `"Great work overall."` is 19 characters (`"Great work overall.".Length` in PowerShell returns `19`), under the floor, so the duplication ships silently; and a paraphrase defeats normalised containment at any floor. Enforcer it protected: none - the arm was never built | Removed. Recorded in the residual register as an owner measurement question (RES-4) |
| P4 | `strengthsNotice` is optional on the row | **REVISED to REQUIRED** by Ruling G, on the argument stated ten lines from where the field goes (`snapshot-row.ts:127-136`: an optional field makes the wire enumeration and the read-side default decorative) | R5 |
| P5 | Three guards over the notice, none covering delivery | **REVISED.** Delivery is pinned end to end - parse, compose, wire out, wire in - with the render explicitly excluded and named as an owner observation | R4, R5, R7, R11, R12, RES-1 |
| P6 | Ruling D's third pin: "`applyAssessmentResult`'s second argument is BUILT FROM the mapper's result" | **KEPT, and satisfied by construction rather than by assertion.** The whole call moves into a `.ts` leaf (`applySnapshotGradeResult`), so there is no seam between a mapper output and a call site for a hook to mangle. The hook's ability to call `applyAssessmentResult` directly is closed by a negative source-text pin | R5, R12 |
| P7 | The proposed e2e assertion `applyAssessmentResult(base, mapperOutput)` | **WITHDRAWN.** Two defects, both named by Ruling G: it does not typecheck (`AssessmentResultInput` requires `totalScore`, `assessment-row.ts:131-134`), and it has the test author writing the call site it claims to test. Replaced by an oracle that calls the production function and builds its input with the production parser | R11 |
| P8 | Verify condition "exactly 18 Test Files" | **WITHDRAWN as a machine condition** by Ruling H. `closure-runner.ts:31` matches only the `Tests` line (`const TESTS_SUMMARY_RE = /Tests\s+([^\n\r]+?)\s*\(\d+\)/`) and `runVerify` requires exit 0 plus one pass, so the machine gate is "some test under that path passed". Restated as a human check with a measured baseline | Section 7.2 |
| P9 | "Single path by construction" - no outside-directory enforcer | **WITHDRAWN as false** by Ruling H, measured in section 4.2: `copy-feedback.test.ts:272-276` reads `SnapshotResultCard.tsx` by path, and `file-size-ceiling.structure.test.ts` walks the whole tree | Section 7.3 wave-gate obligations |
| P10 | Counter-clause ranges over four loci | **REVISED to range over a derived table of twelve**, of which six are praise-routing, three are pairwise-structure lines and one is a two-field enumeration | R2, section 3.2 |
| P11 | Ruling A: distinguish absent from empty at the parse boundary and surface it | **KEPT in substance, REVISED in mechanism.** The parse boundary is still where the raw-JSON fact is captured (`strengthsMissing`, set by `parseSnapshotGradeResponse`), but absent and blank are deliberately collapsed into one notice. Reason: Ruling F's own argument - a distinction no consumer reads is decorative. **This is a judgement I made; it is flagged for the checker, not hidden** | R4, and section 8 note J-1 |
| P12 | Ruling G: the notice attaches in the hook's own merged literal (`useSnapshotGrade.ts:268-277`) | **REVISED in mechanism, KEPT in requirement.** It attaches one file down, in `snapshot-row.ts`'s `applySnapshotGradeResult`, which the hook spreads. Reason: the hook is a `useCallback` and cannot be unit-tested at all (`useSnapshotGrade.wiring.test.ts:1-13` records the measured `TypeError`), so attaching in the leaf converts the attachment from a source-text claim into an executing oracle. Delivery path is unchanged. **Flagged for the checker; the alternative is one line and is in the register as RES-5** | R5, R6, R11 |
| P13 | Ruling C: assert snapshot copy output with a non-empty strengths | **KEPT and extended** - the assertion also pins the ORDER, which Ruling H says nobody had ruled on | R9, R11 |
| P14 | Ruling D carry: `snapshot-grade-prompt.test.ts` is inert in both directions | **KEPT as restated by the ruling.** Re-measured here: 28 `expect(`, 16 `it(`, 139 lines. No assertion pins `CITATION_AND_REPORTING_CONTRACT`'s field SET or the composition array's membership, so adding or forgetting a strengths bullet is invisible to it | Section 4.1; closed by R13 |
| P15 | `useSnapshotGrade.wiring.test.ts` joins owns (Ruling D) | **KEPT.** Re-measured with a canary: 0 references each to `strengths`, `improvements`, `overallComment`, `applyAssessmentResult`; canary `buildIdByGlobalIndex` returns 4 | Owns, R12 |
| P16 | `prompts.ts` joins owns (Ruling E) | **KEPT, with a scheduling obligation attached.** `src/lib/grade/` is named as a sibling seat's area for A8-R; the two must not run in the same wave | Owns, section 9 |
| P17 | Corrections carried by Ruling H (`:96` lowercase, `snapshot-parse.ts:139` cites `:43` not `:66`, "`:68` is the opening brace") | **KEPT and verified.** All three confirmed by reading | R3, R4, section 3.2 |

---

## 2. The defect, measured

The Strengths box on the snapshot grading surface is not occasionally empty.
Nothing can ever fill it from a grade.

1. `src/app/components/assessment-shared/AssessmentFeedbackFields.tsx:141-150`
   renders an editable `TextField label="Strengths"`; the binding is
   `value={feedback.strengths}` at `:143` and the writer is
   `onEditField(rowId, "strengths", ...)` at `:144`.
2. `src/app/components/snapshot-grading/useSnapshotGrade.ts:264` passes
   `strengths: ""` - a hardcoded empty literal - into `applyAssessmentResult`,
   alongside `improvements: result.answer.improvements` (`:265`) and
   `overallComment: result.answer.overallComment` (`:266`).
3. `src/app/components/snapshot-grading/snapshot-parse.ts:145-152` declares
   `SnapshotGradeAnswer` with exactly two prose fields, `overallComment` and
   `improvements`; `:222-223` parses only those two. There is no `strengths`
   key because `src/lib/grade/prompts.ts:67-77` never asks for one.

So the praise is in `overallComment` by construction. The box is not dead: it is
instructor-editable and round-tripped through `ta-snap-table`
(`snapshot-row-serialization.ts:72` write, `:146` read, `:226` return).

**Command for the "only occurrence" claim** (`Select-String` over every file in
`src/app/components/snapshot-grading`, pattern `strengths`): 18 hits, of which
the only non-test, non-serialization hits are `snapshot-row.ts:155`
(`createEmptySnapshotRow`'s legitimately empty row) and `useSnapshotGrade.ts:264`.

**Blocking status.** `blocked_by: ['A10']` is **discharged**. `grep -c "id: 'A10'"
docs/backlog.yml` returns `0`; A10 closed at `f83e2d3`
(`git show --stat --oneline f83e2d3`: `copy-feedback.test.ts`, `grading-row.ts`,
`backlog-file.structure.test.ts`, plus three docs). A10 touched neither
`assessment-row.ts` nor anything under `snapshot-grading/`.

---

## 3. The prompt change

### 3.1 The fork, and why the third option

Two horns, both measured:

- **Append a counter-clause in `snapshot-grade-prompt.ts`.** Defeated.
  `buildSnapshotGradeSystemPrompt` places `base` (the full `buildSystemPrompt`
  output) at position 5 of a 9-element join array (`snapshot-grade-prompt.ts:99-110`),
  so the composed prompt contains every praise-routing sentence verbatim, and
  the strongest one (`:69`) is inside the JSON shape the model copies.
- **Edit `prompts.ts` outright.** Breaks two callers. Exactly three production
  callers exist (`grep -rn "buildSystemPrompt" src | grep -v "\.test\."`, then
  discarding the re-export lines `rubric.ts:442`, `grade.ts:6` and the comment
  hits):
  - `src/lib/grade/engine.ts:197` - unattended Canvas bulk. Three arguments, so
    the default. Its parser never reads a `strengths` key, so praise moved out
    of `overallComment` would simply vanish from Canvas feedback.
  - `src/app/components/grading-recording/grading-feedback-prompt.ts:78` -
    the recording surface. Three arguments, so the default. Its composer does
    `const strengths = parsed.overallComment;` at `:150`, so praise moved out of
    `overallComment` would fill **that surface's** Strengths box with deduction
    text. Every gate would stay green.
  - `src/app/components/snapshot-grading/snapshot-grade-prompt.ts:94` - four
    arguments, `"every"`.

**Ruling E's third option, which is this design.** `buildSystemPrompt` already
carries a defaulted per-caller parameter for exactly this shape:
`scoringInstructionMode: "some" | "every" = "some"` at `prompts.ts:42`, whose
doc comment at `:31-41` states the pattern in as many words - snapshot grading
is the only caller that passes the non-default; the other two keep today's
behaviour unchanged.

### 3.2 The locus table, derived with two instruments

**Instrument 1** (`Select-String -Path src/lib/grade/prompts.ts -Pattern
'overallComment'`): 12 lines - 69, 83, 87, 89, 90, 91, 93, 94, 96, 99, 100, 106.

**Instrument 2** (`Select-String -Path src/lib/grade/prompts.ts -Pattern
'strength|praise|complim|positive|went well|did well'`): 6 lines - 69, 90, 93,
96, 99, 100.

Instrument 2's set is a strict subset of instrument 1's and independently
confirms the praise classification. **Neither instrument alone is sufficient:**
instrument 2 misses `:92`, `:94`, `:95` (pairwise structure, no praise
vocabulary) and `:106` (two-field enumeration). The working set is the union.
The table below is a floor, not a proof of completeness - an implementer must
re-derive it against the tree at build time and report what it missed.

Ruling H said "at least FIVE loci, arguably six". The derived set is **six
praise-routing loci** (69, 90, 93, 96, 99, 100). `:93` was in neither the
round-1 nor round-2 list and is unambiguously praise-routing.

| Line | What it says today (abridged) | Class | Obligation under the non-default branch |
|---|---|---|---|
| 69 | schema value: `"what the student did well, and for each deduction the rubric area and specific reason"` | **Praise + deduction routing, inside the JSON shape** | **SHAPE EXTENSION**, not a narrowing - the object at `:68-77` has no `strengths` key at all, so one is added. Narrow `:69`'s own description to deductions only. Key order in the emitted shape: `strengths`, `overallComment`, `improvements`, `rubricResults`, so the model drafts in the order the student reads (section 6). Note `:68` is the opening brace, not a rule |
| 83 | "For every deduction, in overallComment explicitly name the affected rubric area..." | Deduction routing | **UNCHANGED.** Deductions stay in `overallComment` under both branches |
| 87 | "...name the missing or misnamed file in overallComment" | Deduction routing | **UNCHANGED** |
| 89 | "...name the specific missing behavior in overallComment" | Deduction routing | **UNCHANGED** |
| 90 | "In overallComment, summarize strengths and, for each deduction, the rubric area and specific reason..." | **Praise routing** | **REWRITE.** Praise goes to `strengths`; `overallComment` carries deductions only; the existing exclusion of advice from `overallComment` is kept |
| 91 | "...same warm, direct, second-person style as overallComment" | Style anchor | **UNCHANGED** - routes nothing |
| 92 | "CRITICAL - these fields ... SEPARATE, side-by-side boxes ... must not repeat material from the other" | **Pairwise by construction** | **EXTEND to three fields.** "the other" becomes "any of the others" |
| 93 | "'improvements' must NOT open with a compliment ... any restatement of praise already given in overallComment" | **Praise routing** | **REWRITE** - the praise is now in `strengths` |
| 94 | "Do not repeat the same observation ... in both fields. If you have already said the code is clean in overallComment..." | **Pairwise** | **EXTEND to three**; the worked example moves to `strengths` |
| 95 | "...no pronoun whose subject was only introduced in the other field" | **Pairwise** | **EXTEND to three** |
| 96 | "Praising work in overallComment and then advising in improvements is the intended division." | **Praise routing** | **REWRITE** to a three-way division. **The spelling is lowercase `intended division`** - a pin copying an uppercase spelling false-reds |
| 99 | "Maintain at least a 2:1 positive-to-negative ratio in overallComment..." | **Praise routing - HIGHEST RISK** | **REWRITE, and it is not a substitution.** Once `overallComment` carries only deductions, a 2:1 positive ratio *inside* `overallComment` is unsatisfiable, and the only way a model can satisfy it is to put praise back into `overallComment` - reintroducing the exact defect. The ratio must be restated at the whole-feedback level, anchored to `strengths` for positives. Leaving `:99` alone does not merely "buy nothing"; it actively reverses the fix |
| 100 | "In 'improvements', warmth means framing the ADVICE encouragingly ..., not complimenting work that overallComment has already praised" | **Praise routing** | **REWRITE** - `strengths` has already praised |
| 106 | "Do not mention resubmission, regrading, or late penalties in overallComment or improvements" | **Two-field enumeration a third prose field escapes** | **EXTEND to three.** Load-bearing: A10's fix landed today at `f83e2d3` and the recording surface composes its own `RESUBMIT_NOTICE`, so the model must remain barred from authoring resubmission language in any prose field |

Wording is the implementer's; the tests pin facts and ordering, never spelling
(`traps-tests.md`: source-text tests over-specify, twice measured).

### 3.3 What already pins the default branch, measured

`grep -rn "summarize strengths\|intended division\|positive-to-negative\|what the
student did well\|overallComment or improvements" src --include=*.test.ts`
returns exactly **two** assertions in the whole suite, both in
`src/lib/grade/prompts.test.ts`:

- `:102` `expect(prompt).toMatch(/2:1 positive-to-negative ratio/i);`
- `:157` `const overallCommentSummaryIndex = prompt.indexOf("In overallComment,
  summarize strengths");` - inside an ORDERING assertion at `:151-163`.

Both call `buildSystemPrompt("Instructions.", "Rubric.")`, i.e. the default
branch. **Two substring checks over a ~7 KB string are not a byte-identity
proof**, which is why R10 exists.

`p11-containment-snapshot.test.ts` is insensitive to this text:
`grep -c "Grade generously by default"` over it returns `0`, and its 13
`expect(` calls pin only the framing header, the precedence clause, ordering
against a hostile transcript, and the two `instructionLikeContent` fields.
Checked-safe.

---

## 4. The enforcer sweep

An enumeration is a floor. A by-name grep misses directory walkers, so both
were run.

### 4.1 By-name / by-path readers

`grep -rn "SnapshotResultCard" src --include=*.test.ts` returns
`copy-feedback.test.ts:272,273`. My first sweep - `Select-String` filtered to
lines containing `readFileSync|readFile\(|resolve\(|join\(` - **missed it**,
because the read goes through a helper (`readStripped`, defined at
`copy-feedback.test.ts:253-259`). That miss is recorded here as evidence that a
single-pattern sweep is not a set.

| Enforcer | Reads | What it pins | A11 impact |
|---|---|---|---|
| `src/app/components/grading-recording/copy-feedback.test.ts:272-276` | `SnapshotResultCard.tsx` by path, with a `source.length > 1000` floor at `:257` | `/joinCopyText=\{\s*joinAssessmentFeedback\s*\}/` present and `"joinFeedback"` absent | **Must stay green.** Outside-directory, sibling seat's file. Wave-gate obligation W-1 |
| `copy-feedback.test.ts:289-292` | `AssessmentFeedbackFields.tsx` | does not CALL `joinAssessmentFeedback(`; contains `joinCopyText(feedback)` | Unaffected - A11 does not edit that file |
| `snapshot-grading.structure.test.ts` (811 lines) | the whole `snapshot-grading` directory plus 6 named files | ta-snap-* exact key set (`:184`), frozen call-site counts (`:517-556`), reachability chains | Unaffected by A11's edits. **Constraint:** add no `ta-snap-` string and no new call of `handleGrade(`/`snapshotGradeAction(` |
| `snapshot-autofire.structure.test.ts` (418 lines) | the whole directory | `:141` "the extracted grade hook contains no useEffect at all"; `:158` no `useEffect` anywhere in the directory calls the three actions | **Constraint C-1: `useSnapshotGrade.ts` must not gain a `useEffect`** |
| `snapshot-role-setrole-callsites.structure.test.ts` (71 lines) | the whole directory | `setRole` call-site counts | Unaffected |
| `assessment-shared.structure.test.ts` (53 lines) | every `.ts`/`.tsx` in `assessment-shared/`, `source.includes(word)` at `:50`, **comments count** | forbidden words include `"shot"` and `"snapshot"` (`:30-31`) | **Constraint C-2, and it is the trap of this item:** R9 edits `assessment-row.ts`'s doc comment, and that comment may not name the surface. Any word containing `shot` (screenshot, snapshot) fails it |
| `src/file-size-ceiling.structure.test.ts` | the whole of `src/`, `LIMIT = 1000` at `:30`, no `ALLOWED_OVERAGE` entry for any file here (`grep -i "snapshot\|assessment\|prompts"` returns nothing) | 1000 lines | **W-2.** Headroom measured below |
| `src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts`, `src/lib/use-server-exports.test.ts`, `src/lib/canvas-client-boundary.test.ts`, `src/lib/client-state-sweep.registry.test.ts` | the whole of `src/` | bytes, emoji, `"use server"` exports, client boundary, state keys | Swept. No planned edit trips them. `snapshot-grade.ts` keeps `SnapshotGradeAnswer` as a **type** import (`:25`) and `SnapshotGradeActionResult` at `:28` is not exported, so no `"use server"` type re-export is created |
| `src/app/components/ui/confirmArmButtons.test.ts:186-197` | every `.tsx` under `src/app/components` | zero `onBlur` beside a consequence `aria-describedby` | Swept clear - R8 adds a `<p>`, no `onBlur` |
| `src/app/bulkBarCss.test.ts` | every source file under `src` | dead-CSS | Swept clear - R8 reuses the existing `styles.fieldHint` class |
| `assessment-row-store.test.ts:168-185` | nothing on disk | an exact ten-key set over a **fixture codec local to that file**, not the snapshot codec | **Checked-safe, and this closes an item the backlog row left owed.** It trips only if `AssessmentFeedback` itself gains a field; A11 adds no field there |

### 4.2 Line counts, all by `@(Get-Content <file>).Count`

| File | Lines | Headroom to 1000 |
|---|---|---|
| `SnapshotGradingPanel.tsx` | **970** | **30** - and A11 plans no edit to it |
| `snapshot-row.ts` | 530 | 470 |
| `snapshot-row.test.ts` | 628 | 372 |
| `snapshot-row-serialization.test.ts` | 456 | 544 |
| `prompts.ts` | 311 | 689 |
| `useSnapshotGrade.ts` | 316 | 684 |
| `useSnapshotGrade.wiring.test.ts` | 243 | 757 |
| `snapshot-row-serialization.ts` | 243 | 757 |
| `snapshot-parse.ts` | 235 | 765 |
| `prompts.test.ts` | 235 | 765 |
| `SnapshotResultCard.tsx` | 213 | 787 |
| `AssessmentFeedbackFields.tsx` | 198 | 802 |
| `assessment-row.ts` | 182 | 818 |
| `assessment-row.test.ts` | 177 | 823 |
| `snapshot-grade-prompt.test.ts` | 139 | 861 |
| `snapshot-grade-prompt.ts` | 111 | 889 |

Suite shape, re-measured (`this-repo.md` says measure these rather than quote
them): `*.wiring.test.ts` = **72**, `*.structure.test.ts` = **19**
(`@(Get-ChildItem -Recurse -Path src -Filter ...).Count`).

### 4.3 What tsc will and will NOT catch

Adding a **required** `strengthsNotice: string` to `SnapshotAssessmentRow`
reddens tsc at four sites, all of which are typed object literals:

1. `snapshot-row.ts:147-164` `createEmptySnapshotRow(...): SnapshotAssessmentRow`
2. `useSnapshotGrade.ts:268` `const merged: SnapshotAssessmentRow = {`
3. `snapshot-row.test.ts:33` `function makeFullRow(...): SnapshotAssessmentRow`
4. `snapshot-row-serialization.test.ts:21` `function makeFullRow(...): SnapshotAssessmentRow`

It will **NOT** catch the codec. `snapshot-row-serialization.ts:45-53` says so
in its own header, and the mechanism is the two escape-hatch casts: `:59`
`const r = row as unknown as SnapshotAssessmentRow` and `:236`
`} as unknown as NoPostableIdentity<SnapshotAssessmentRow>`. A field added to
the type and never written or read by the codec typechecks cleanly.

**What does catch it** are two executing, construction-based oracles already in
the tree:

- `snapshot-row-serialization.test.ts:60-92` - "writes the full 16-key literal";
  the comparison at `:91` is `expect(Object.keys(result).sort()).toEqual([...16
  names...].sort())`. Adding the field to `toWire` without bumping the list is
  RED; bumping the list without adding it to `toWire` is RED. Both directions.
- `snapshot-row-serialization.test.ts:343-387` - field-degradation coverage. At
  `:374` `actualKeysToDegrade` is computed as `Object.keys(fromWire-output)`
  minus a hardcoded `excluded` set, and compared at `:386` against
  `tableCoveredFields`. Adding the field to `fromWire` forces an entry in
  `tableCoveredFields` **and** a row in the `it.each` degrade table at `:388-396`.
  This is coverage by construction, not by enumeration.

Nothing anywhere pins the **render**. `grep -rn "imageFallbackNote" src
--include=*.test.ts` returns 12 hits, all wire-layer or fixture; `evidenceDropped`
returns 19, likewise. `SnapshotResultCard` appears in exactly one test file and
only for the `joinCopyText` binding. So Ruling G is right that the precedent it
leans on is itself unguarded, and R8 is an owner observation, not a test.

---

## 5. Requirements

### R1 - `buildSystemPrompt` gains a defaulted praise-routing parameter

`src/lib/grade/prompts.ts`. Fifth parameter, defaulted, in the shape of
`scoringInstructionMode` at `:42`:

```
praiseRouting: "in-overall-comment" | "separate-strengths" = "in-overall-comment"
```

A doc comment in the style of `:31-41` naming: the single non-default caller
(`snapshot-grade-prompt.ts:94`); the two default callers (`engine.ts:197`,
`grading-recording/grading-feedback-prompt.ts:78`); and **why** they must keep
the default, citing `grading-feedback-prompt.ts:150`
(`const strengths = parsed.overallComment`) by file and line.

**Mechanism: inline ternaries at each locus inside the existing template
literal, whose default arm is today's exact bytes.** Not an array rebuild of
the Rules list - that risks byte drift on the default branch, which is the one
thing this design must not do.

### R2 - the rewrite ranges over the whole locus table

Every row of the section 3.2 table is either rewritten under the non-default
branch or explicitly left unchanged with its stated reason. The pass condition
(section 7.1, PC-2) ranges over the table, not over a sample. `:99` is
called out as the highest-risk row for the reason given there.

### R3 - the snapshot caller opts in, and two stale comments are corrected

`src/app/components/snapshot-grading/snapshot-grade-prompt.ts`:

- `:94` becomes `buildSystemPrompt(assignmentText, rubricText, criteria, "every",
  "separate-strengths")`.
- `:16-24`'s header currently asserts that `buildSystemPrompt` "is NEVER edited
  by this feature". After R1 that is false and must be corrected, or the file
  teaches the next agent something untrue.
- Pre-existing, in the same block: `:19` cites the generosity sentence as
  `prompts.ts:70`. It is `prompts.ts:84`. Fix it while there.
- `CITATION_AND_REPORTING_CONTRACT` (`:65-68`) must **not** also declare a
  `strengths` field. The key is added once, inside `buildSystemPrompt`'s own
  shape.

### R4 - the parser learns the field, at the parse boundary

`src/app/components/snapshot-grading/snapshot-parse.ts`:

- `SnapshotGradeAnswer` (`:145-152`) gains `strengths: string` and
  `strengthsMissing: boolean`.
- `parseSnapshotGradeResponse`: add `strengths?: unknown` to the destructure
  type at `:172-180`; return
  `strengths: typeof parsed.strengths === "string" ? parsed.strengths : ""` and
  `strengthsMissing: typeof parsed.strengths !== "string" || parsed.strengths.trim() === ""`.
- Pre-existing correction: `:139` cites `snapshot-grade-prompt.ts:43` for the
  `shotIndex: 0` contract. It is `:66` (the `rubricAreaEvidence` bullet inside
  `CITATION_AND_REPORTING_CONTRACT`); `:43` is a sentence about H1-D.

`strengthsMissing` is the only place the raw-JSON fact is observable - after
parsing, "absent" and "blank" are indistinguishable. Both fire the same notice
(judgement J-1, section 8).

### R5 - the row type, the notice, and the composition move into the leaf

`src/app/components/snapshot-grading/snapshot-row.ts`:

- `SnapshotAssessmentRow` (`:117-137`) gains **`strengthsNotice: string`,
  REQUIRED**, `""` when there is no notice. The doc comment restates
  `evidenceDropped`'s own argument at `:127-136` - an optional field makes the
  wire enumeration and the read-side default decorative - and states that this
  is a durable post-reload notice for the same reason.
- `createEmptySnapshotRow` (`:147-164`) sets `strengthsNotice: ""`.
- New exported constant `STRENGTHS_MISSING_NOTICE`.
- New exported function
  `applySnapshotGradeResult(base: SnapshotAssessmentRow, answer:
  SnapshotGradeAnswer, totalScore: string): SnapshotAssessmentRow`, which
  builds the full `AssessmentResultInput` (including `totalScore`), calls
  `applyAssessmentResult`, and sets `strengthsNotice`.

**The invariant this construction buys, and it is the point of R5:** the notice
and the `strengths` field are written together or not at all. On a
`userEdited` row `applyAssessmentResult` holds the four scored fields back
(`assessment-row.ts:151-153`), so `applySnapshotGradeResult` must leave
`base.strengthsNotice` untouched in that arm - otherwise the notice could
describe a field it did not write. This makes the banned state
unrepresentable rather than asserted absent, and it is directly testable.
(`state`/`error` are deliberately not gated that way - see
`assessment-row.ts:138-145` for the existing rationale, which this follows.)

This is the mechanism that discharges Ruling D's third pin: there is no
intermediate "mapper result" for a hook to reassign, because the hook never
sees one.

### R6 - the hook stops hardcoding, and stops reaching for the shared mutator

`src/app/components/snapshot-grading/useSnapshotGrade.ts`:

- Delete the `applyAssessmentResult` import at `:19` and the call at `:261-267`.
- Call `applySnapshotGradeResult(base, result.answer, totalScore)` in its place.
- `merged` at `:268-277` spreads the returned row, so `strengthsNotice` arrives
  by spread and the literal gains no new line.
- **Constraint C-1:** no `useEffect` may be added to this file
  (`snapshot-autofire.structure.test.ts:141`).

The deleted import is enforced by lint: an unused import is an eslint error, and
the baseline is 4 warnings / 0 errors (`this-repo.md` section 1).

### R7 - the codec carries it both ways

`src/app/components/snapshot-grading/snapshot-row-serialization.ts`: add
`strengthsNotice: r.strengthsNotice` to `toWire`'s literal (`:63-109`) and
`const strengthsNotice = typeof r.strengthsNotice === "string" ? r.strengthsNotice : "";`
plus the field in `fromWire`'s return (`:219-236`). Default `""` - the
under-claiming direction, matching `evidenceDropped`'s reasoning at `:213-216`
rather than `userEdited`'s deliberate exception at `:131-144`.

Update the enumeration comment at `:34-43`, which currently says "seven
snapshot-specific fields" and lists them.

Update both oracles in `snapshot-row-serialization.test.ts` in the **same
commit**: the 16-key list at `:60-92` becomes 17, `tableCoveredFields` at
`:377-385` gains the field, and the `it.each` at `:388-396` gains
`["strengthsNotice", 42, ""]`. Add one preserving round-trip case in the
`:425` describe block's idiom.

### R8 - the card renders it (NOT testable here)

`src/app/components/snapshot-grading/SnapshotResultCard.tsx`: immediately after
`:123` (`{row.imageFallbackNote && <p className={styles.fieldHint}>...}`) and
before the `instructionLikeContent` alert at `:124`, render

```
{row.strengthsNotice && <p className={styles.fieldHint}>{row.strengthsNotice}</p>}
```

Inside the `hasResult` gate (`:77`, `:92`), in the same block as the read
report, so it sits **above** the score (`AssessmentScoreField` is at `:133`) -
matching `snapshot-row.ts:114-116`'s stated rule that a caveat is named above
the score, never buried.

`styles.fieldHint` rather than `role="alert"`: this is a degraded-output note,
the same class as `imageFallbackNote`, not an alarm like
`instructionLikeContent` (`:124-130`) or `evidenceDropped` (`:141-146`).

**vitest collects only `src/**/*.test.ts` (`vitest.config.ts`), so no `.tsx` is
rendered by anything. This requirement cannot be tested. It is an owner
observation, RES-1.** Measured above: nothing pins the render of
`imageFallbackNote` or `evidenceDropped` either, so this is the directory's
existing standard, not a new gap.

Constraint: the file must keep `joinCopyText={joinAssessmentFeedback}` and must
not acquire the substring `joinFeedback` (`copy-feedback.test.ts:272-276`).

### R9 - the copy order (section 6 has the ruling and the reasons)

`src/app/components/assessment-shared/assessment-row.ts:108-110`:
`joinAssessmentFeedback` reorders to
`[row.strengths, row.overallComment, row.improvements]`.

- Its doc comment at `:99-107` names the old order and must be updated.
  **Constraint C-2: that comment may not contain `shot`, `snapshot`, `roster`,
  `nameMatch`, `rosterCandidates`, `submissionTimeStatus` or `submittedAt`**
  (`assessment-shared.structure.test.ts:24-32`, raw `includes` at `:50`,
  comments count). Justify the order by what each field now carries, never by
  naming a surface.
- `assessment-row.test.ts:42-49` must be updated in the same commit. Today's
  literal, recorded here so a checker can diff it:
  `"Strong thesis.\n\nCite more sources.\n\nGreat work overall."` The `it` title
  at `:42` also names the old order. The two other cases (`:52-55`, `:57-60`)
  are order-independent and must stay byte-identical.
- **Safety fact, measured:** `grep -rn "joinAssessmentFeedback" src` returns 16
  hits, of which exactly **one** is a production call site -
  `SnapshotResultCard.tsx:194`. (`:20` is its import; `assessment-row.ts:108` is
  the declaration; the remaining 13 are in two test files.) So the reorder
  reaches one surface. Wave-gate obligation W-3 re-runs this grep.

### R10 - freeze the default-branch oracle BEFORE editing `prompts.ts`

New file `src/lib/grade/prompts-praise-routing.test.ts`.

**Wave 1 (must land and pass before any `prompts.ts` edit):** three frozen
full-output string literals for the default branch, captured from the
unmodified function, each asserted with `toBe`:

- `buildSystemPrompt("Instructions.", "Rubric.")`
- `buildSystemPrompt("Instructions.", "Rubric.", [{name:"Thesis",points:20},{name:"Grammar",points:10}])`
- `buildSystemPrompt("Instructions.", "Rubric.", [{name:"Thesis",points:20},{name:"Grammar",points:null}], "every")`

Plus a **control** asserting each frozen literal is non-empty and that the three
differ from one another, so a vacuous capture cannot pass.

This is `traps-tests.md`'s "freeze the oracle before the migration, not after",
and it is the only instrument that makes "byte-identical for the other two
callers" a measured claim. The two existing assertions (`prompts.test.ts:102`,
`:157`) are substring checks and do not constitute byte-identity.

**Wave 2:** add the non-default-branch assertions (R13's sibling at the
`buildSystemPrompt` level), ranging over the section 3.2 table.

Authoring hazards for the implementer, both from this repo's record: the frozen
text contains the em dash at `prompts.ts:103`, which must be pasted as the
character, never as a `\u` escape (Write/Edit materialize escapes as literal
characters - `src/source-bytes.structure.test.ts` owns the consequence); and no
`/s` regex flag anywhere (TS1501 under this `tsconfig`, hit twice in one day).

### R11 - the end-to-end composed-row oracle

In `src/app/components/snapshot-grading/snapshot-row.test.ts` (which already
imports `createEmptySnapshotRow`, `applyAssessmentResult`, `snapshotRowCodec`).

**Fixtures are built from the emitted shape**, not hand-written: each case
starts from a raw model JSON string and goes through the production parser
`parseSnapshotGradeResponse` (imported from `snapshot-parse.ts`, a `.ts` leaf -
never from another `*.test.ts`).

Three cases, each running raw JSON -> parser -> `applySnapshotGradeResult` ->
`joinAssessmentFeedback`:

| Case | Raw JSON `strengths` | Asserts |
|---|---|---|
| present | a non-empty string | `row.strengths` is that string; `row.strengthsNotice === ""`; the join is exactly three blocks in the R9 order |
| absent | key omitted | `row.strengths === ""`; `row.strengthsNotice === STRENGTHS_MISSING_NOTICE`; the join is exactly two blocks, byte-identical to today's shape |
| blank | `"   "` | identical to the absent case |

Plus a fourth case for R5's invariant: a `userEdited` base row leaves both
`strengths` and `strengthsNotice` untouched.

This is the oracle the backlog row has demanded since round 1 ("any build of
path (a) needs an oracle that composes a snapshot row end to end") and it
discharges Ruling C's copy assertion in the same construction.

### R12 - the negative source-text pins on the hook

In `src/app/components/snapshot-grading/useSnapshotGrade.wiring.test.ts`, reusing
the CR-tolerant unanchored `stripComments` already at `:44-50` (split on
`/\r?\n/`, `line.replace(/\/\/.*$/, "")`) and its canary at `:58-69`. **Do not
add a fourth copy of that helper.**

- `expect(stripped).not.toMatch(/strengths\s*:\s*""/)` - no empty-string
  strengths literal anywhere in the hook.
- `expect(stripped).not.toContain("applyAssessmentResult(")` - the hook no
  longer calls the shared mutator directly; the only route is the leaf.
- `expect(stripped).toMatch(/applySnapshotGradeResult\(/)`, plus an ordering
  assertion that its index is greater than `const totalScore =`'s and less than
  `const merged`'s. Whitespace-tolerant; pin the fact and the ordering, never
  the spacing (`copy-feedback.test.ts:262-265` records why).

### R13 - the composed snapshot prompt is pinned end to end

In `src/app/components/snapshot-grading/snapshot-grade-prompt.test.ts`, in the
idiom of the existing `:123-138` block (which exists precisely so a dropped
argument in `snapshot-grade-prompt.ts`'s own call is caught even when
`prompts.test.ts` stays green):

- the composed prompt contains a `"strengths"` key in the JSON shape;
- the composed prompt does **NOT** contain `"In overallComment, summarize
  strengths"`, and does **not** contain `"is the intended division"` (lowercase,
  per Ruling H's correction). These two negatives are the direct test of Ruling
  E's complaint - they fail on the round-1 appendix design and pass only on a
  rewrite at source.

---

## 6. The copy order - ruling and reasons

Nobody had ruled on this. `joinAssessmentFeedback` (`assessment-row.ts:108-110`)
orders `[strengths, improvements, overallComment]`. After A11 those three carry:
praise, coaching, and the deduction reasons. So today's order would make the
snapshot copy read **praise, then advice, then the reasons the advice came
from** - and end on the deductions.

**Recommendation: `[strengths, overallComment, improvements]`.** Praise, then
what was deducted and why, then the advice derived from it.

Two reasons, and unusually they point the same way, which is why this fork has a
real discriminator:

1. **Causal order.** Advice that precedes its own justification reads backwards.
   The deduction reasons are what the coaching is for.
2. **Tone.** The current order ends the student-facing copy on the list of
   things they lost points for. The recommended order ends on forward-looking
   advice. `prompts.ts:99`'s 2:1 ratio rule exists because tone is a stated
   product value here.

The proposed round-2 assertion "three blocks, praise first" passes on both
orders and therefore settles nothing; R11 pins the full three-block string.

**If the owner overrules,** they are deciding that keeping today's byte order -
no churn in `assessment-row.test.ts:49`, no reorder risk if a second production
caller of `joinAssessmentFeedback` ever appears - is worth a copy whose advice
precedes its reasons and whose last paragraph is the deduction list. That is a
legitimate call; it is just not the default. Cost of overruling: one line in
R9 and one expected string in R11.

---

## 7. Verify, and the gates outside it

### 7.1 Pass conditions

Each names the object under comparison, the instrument producing each quantity,
and the direction of failure.

| id | Object | Instrument | RED when |
|---|---|---|---|
| PC-1 | `buildSystemPrompt`'s output on the DEFAULT branch, for three fixed input tuples | `prompts-praise-routing.test.ts`'s frozen literals, `toBe` | one byte differs from the frozen capture, in either direction |
| PC-2 | Every row of the section 3.2 locus table, in the composed **non-default** prompt | `prompts-praise-routing.test.ts` non-default assertions, one per rewritten row | any rewritten row's fact is absent, OR any default-branch praise string survives into the non-default output |
| PC-3 | The composed snapshot prompt end to end | `snapshot-grade-prompt.test.ts` (R13) | it lacks the `"strengths"` key, OR it still contains `"In overallComment, summarize strengths"` or `"is the intended division"` |
| PC-4 | `parseSnapshotGradeResponse`'s output for present / absent / blank `strengths` | `snapshot-parse.test.ts` unit cases | `strengths` is not the parsed string, OR `strengthsMissing` is false for absent or blank, OR true for present |
| PC-5 | A composed snapshot row: raw JSON -> parser -> `applySnapshotGradeResult` -> `joinAssessmentFeedback` | `snapshot-row.test.ts` (R11) | the join is not exactly three blocks in the order `strengths`, `overallComment`, `improvements` when strengths is present; or not exactly two blocks when absent; or `strengthsNotice` does not match the arm |
| PC-6 | R5's write-together invariant on a `userEdited` base row | `snapshot-row.test.ts` (R11 case 4) | `strengths` is held back but `strengthsNotice` is written, or vice versa |
| PC-7 | `toWire`'s emitted key set | `snapshot-row-serialization.test.ts:60-92`, `Object.keys(result).sort()` vs the literal list | the sets differ - fires whether the field is added to `toWire` without the list, or to the list without `toWire` |
| PC-8 | `fromWire`'s output key set vs the degradation coverage table | `snapshot-row-serialization.test.ts:374-386`, `Object.keys(full)` minus `excluded` vs `tableCoveredFields` | a field reaches `fromWire`'s output with no degradation case behind it |
| PC-9 | `useSnapshotGrade.ts` as comment-stripped text | `useSnapshotGrade.wiring.test.ts` (R12) | it contains a `strengths: ""` literal, OR calls `applyAssessmentResult(`, OR does not call `applySnapshotGradeResult(` in the right position |
| PC-10 | `SnapshotResultCard.tsx` as comment-stripped text | `copy-feedback.test.ts:272-276` (existing, outside the owns set) | the `joinCopyText={joinAssessmentFeedback}` binding is lost, or `joinFeedback` appears |
| PC-11 | Every file under `src/` | `src/file-size-ceiling.structure.test.ts`, `countLines` | any touched file exceeds 1000 lines |

### 7.2 The machine verify

```
npx vitest run src/app/components/snapshot-grading src/app/components/assessment-shared src/lib/grade/prompts.test.ts src/lib/grade/prompts-praise-routing.test.ts
```

Run through `closure-runner.ts`'s `runVerify`, which requires exit 0 **and** a
nonzero `N passed` in the `Tests` summary line (`:31`, `:37-42`).

**This command does not prove file-level completeness, and no vitest invocation
can.** `TESTS_SUMMARY_RE` matches only the `Tests` line, never `Test Files`, so
any "exactly N test files" condition is unenforceable by the machine - it would
pass on "some test under that path passed", already true many hundreds of times
before a line is written. **Stated as a HUMAN check instead, with the measured
baseline:**

- `src/app/components/snapshot-grading` has **17** `*.test.ts` files today
  (`@(Get-ChildItem ... -Filter "*.test.ts").Count`) and **24** non-test
  `.ts`/`.tsx` files. A11 adds **no** test file here; every new assertion goes
  into an existing file. Expected after: **17 / 24**, unchanged.
- `src/app/components/assessment-shared` has **3** `*.test.ts` files. Expected
  after: **3**, unchanged.
- `src/lib/grade` gains exactly **one** new test file,
  `prompts-praise-routing.test.ts`.

### 7.3 Wave-gate obligations (outside the verify path)

| id | Obligation | Why it is not in verify |
|---|---|---|
| W-1 | `npx vitest run src/app/components/grading-recording/copy-feedback.test.ts` stays green | It lives in the sibling seat's directory and reads `SnapshotResultCard.tsx` by path. A by-name sweep of A11's own directories does not surface it |
| W-2 | `npx vitest run src/file-size-ceiling.structure.test.ts` stays green | Repo-wide walker. `SnapshotGradingPanel.tsx` sits at 970/1000 - thirty lines - and A11 plans no edit to it, so the obligation is "prove it stayed untouched" |
| W-3 | Re-run `grep -rn "joinAssessmentFeedback" src` and confirm exactly one production call site (`SnapshotResultCard.tsx:194`) before R9's reorder lands | The count can change under a concurrent item; the reorder is only safe at one |
| W-4 | `git status --short` against the owns list, and a check that no `.claude/worktrees` copy was edited | Standing rule. A worktree copy exists at `friendly-meninsky-8032bc` and `Glob` returns it first |
| W-5 | Full `npm test`, `npm run lint` (baseline 4 warnings / 0 errors), `npx tsc --noEmit` (single caller), and `npm run build` grepped for the `Compiled successfully` line | The standard gates; the build is the only one that catches `"use server"` and module-boundary defects |

---

## 8. Owns, and what is deliberately not owned

**Owns** (exact paths):

```
src/lib/grade/prompts.ts
src/lib/grade/prompts.test.ts
src/lib/grade/prompts-praise-routing.test.ts                      (NEW)
src/app/components/snapshot-grading/snapshot-grade-prompt.ts
src/app/components/snapshot-grading/snapshot-grade-prompt.test.ts
src/app/components/snapshot-grading/snapshot-parse.ts
src/app/components/snapshot-grading/snapshot-parse.test.ts
src/app/components/snapshot-grading/snapshot-row.ts
src/app/components/snapshot-grading/snapshot-row.test.ts
src/app/components/snapshot-grading/snapshot-row-serialization.ts
src/app/components/snapshot-grading/snapshot-row-serialization.test.ts
src/app/components/snapshot-grading/useSnapshotGrade.ts
src/app/components/snapshot-grading/useSnapshotGrade.wiring.test.ts
src/app/components/snapshot-grading/SnapshotResultCard.tsx
src/app/components/assessment-shared/assessment-row.ts
src/app/components/assessment-shared/assessment-row.test.ts
```

Sixteen files. `prompts.test.ts` is owned only because R10's wave-2 assertions
may need its ordering test at `:151-163` left alone with a comment pointing at
the new file - no assertion there changes.

**Explicitly NOT owned, and read-only:**

- everything under `src/app/components/grading-recording/` - the sibling seat's
  area, and the home of `copy-feedback.test.ts` (W-1) and
  `grading-feedback-prompt.ts` (a default-branch caller A11 must not disturb);
- `src/lib/grade/engine.ts` - the other default-branch caller;
- `SnapshotGradingPanel.tsx` - 970/1000, no reason to touch it;
- `AssessmentFeedbackFields.tsx` - the Strengths field already exists and is
  already bound; A11 fills it, it does not change it;
- `src/app/actions/snapshot-grade.ts` - `SnapshotGradeAnswer` crosses it as a
  **type** import at `:25` and `SnapshotGradeActionResult` at `:28` is not
  exported, so new fields flow through with no edit.

**Judgements I made that a checker should attack first:**

- **J-1.** Collapsing absent and blank into one notice (P11). Ruling A said
  distinguish them; Ruling F's argument against uninformative signals applies
  equally to a distinction no consumer reads. If the checker disagrees, the fix
  is one extra notice string and one extra arm in `applySnapshotGradeResult`.
- **J-2.** Attaching the notice in the leaf rather than the hook's merged
  literal (P12). Ruling G named the hook. My reason is that the hook is
  untestable and the leaf is not. If the checker disagrees, see RES-5.
- **J-3.** The copy order (section 6). This is a product recommendation, not a
  measurement.
- **J-4.** `styles.fieldHint` rather than `role="alert"` for the notice (R8).
  An unverifiable reading claim either way.

---

## 9. Sequencing and collision

**A10 is closed** (`grep -c "id: 'A10'" docs/backlog.yml` returns `0`; commit
`f83e2d3`), so A11's `blocked_by` is discharged.

**A live collision remains.** A sibling seat is scoping **A8-R** in
`src/app/components/grading-recording/` and **`src/lib/grade/`**. Ruling E puts
`src/lib/grade/prompts.ts` into A11's owns. `parallel-disjointness.md`'s test is
intersection of file sets, and this one is non-empty at the directory level.

**Obligation:** A11 and A8-R must not run in the same wave until `sort | uniq -d`
over their two final owns lists is proved empty at the exact-path level. If
A8-R's owns list contains `prompts.ts`, `rubric.ts` or `engine.ts`, A11 waits -
or A8-R does, but not both at once. This is an orchestrator decision, not one
this artifact can take.

Suggested internal wave split for A11 itself, forced by R10's freeze-first
order:

- **Wave 1:** `prompts-praise-routing.test.ts` only, three frozen default-branch
  literals plus the control, against an unmodified `prompts.ts`. Must pass.
  Then a sabotage (below) must make it fail, then be restored.
- **Wave 2:** R1-R9, R11-R13, and R10's non-default assertions.

---

## 10. Sabotage table

Every assertion gets a named mutation, the file that goes red, and a
both-directions procedure. **Restore from a `cp` backup, never
`git checkout --`** - on an uncommitted file that reverts to the index and
destroys the wave's work.

| Target | Mutation (of the IMPLEMENTATION, never the test) | File that goes RED | Both directions |
|---|---|---|---|
| PC-1 frozen oracle | change one character in `prompts.ts:90` ("summarize" -> "summarise") | `prompts-praise-routing.test.ts` | restore, re-run, green. **Also run the no-op control:** reformat whitespace inside a comment in `prompts.ts` and confirm the oracle stays green |
| PC-2 locus coverage | delete the ternary at `:99` only (leave the other loci rewritten) | `prompts-praise-routing.test.ts`, the `:99` row | restore, green. This is the highest-risk locus and must be sabotaged individually, not as part of a bulk revert |
| PC-3 composed prompt | change `snapshot-grade-prompt.ts:94` back to four arguments | `snapshot-grade-prompt.test.ts` (R13) | restore, green |
| PC-3, appendix defeat | keep the four-argument call and instead append a praise-routing clause to `CITATION_AND_REPORTING_CONTRACT` | `snapshot-grade-prompt.test.ts`'s two negatives must **still** be RED | this is the round-1 design; if it goes green the pin is worthless |
| PC-4 parser | return `strengthsMissing: false` unconditionally | `snapshot-parse.test.ts` absent and blank cases | restore, green |
| PC-5 e2e | in `applySnapshotGradeResult`, set `strengths: ""` instead of `answer.strengths` | `snapshot-row.test.ts` present case | restore, green |
| PC-5 order | revert `joinAssessmentFeedback` to `[strengths, improvements, overallComment]` | `snapshot-row.test.ts` present case **and** `assessment-row.test.ts:49` | restore, green |
| PC-6 invariant | in the `userEdited` arm, write the notice anyway | `snapshot-row.test.ts` case 4 | restore, green |
| PC-7 wire out | delete `strengthsNotice` from `toWire`'s literal | `snapshot-row-serialization.test.ts:60-92` | restore, green. Reverse: add it to the key list but not to `toWire` - also RED |
| PC-8 wire in | delete `strengthsNotice` from `fromWire`'s return | `snapshot-row-serialization.test.ts:374-386` | restore, green |
| PC-9 hook | reinstate `strengths: ""` inside `applySnapshotGradeResult` (i.e. the Ruling D defeat: the empty literal moves into the new function) | `snapshot-row.test.ts` present case - **not** the wiring pin | this is the point of having both: the source-text pin alone does not catch it |
| PC-9 hook, second | make the hook call `applyAssessmentResult` directly again | `useSnapshotGrade.wiring.test.ts` (R12) | restore, green |
| R5 dead-ship | add `strengthsNotice` to the type but never set it anywhere | tsc at the four typed literals in section 4.3 | restore, green |

Two sabotages that must **NOT** go red, as controls: adding a comment to
`useSnapshotGrade.ts` (the stripComments canary already covers the mechanism),
and adding an unrelated field to a fixture's `overrides`.

---

## 11. Residual register

Every entry names an owner, an instrument, and the step that will measure it. An
entry missing any of the three is a deletion and is not listed as a residual.

| id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RES-1 | **The Strengths box, the notice, and the three-block copy are never rendered by any test.** `vitest.config.ts` includes only `src/**/*.test.ts`; no `.tsx` is collected and no component is rendered anywhere in this repo | Repo owner | Eyes on a fresh snapshot grade in the running app, with a real model response | Post-merge owner check. This was this row's own stated first check and it still stands |
| RES-2 | **No model output can be exercised here.** `GEMINI_API_KEY` and the rest are owner-set in Vercel; `vitest.setup.ts` throws on any unmocked `fetch`. Whether the rewritten prompt actually makes the model emit a separable `strengths` block is unverifiable in this checkout | Repo owner | One real snapshot grade against the deployed app | Same owner check as RES-1. **If the model ignores the split, the notice fires and says so - that is the point of R5** |
| RES-3 | **The wire round-trip is proven by tests, not by tsc.** `snapshot-row-serialization.ts:45-53` documents the two `as unknown as` casts that defeat structural checking | Implementer, then verify | `snapshot-row-serialization.test.ts` PC-7 and PC-8, both construction-based | The wave's own test run; nothing is deferred |
| RES-4 | **Duplication between `strengths` and `overallComment` is not detected.** Ruling F withdrew the containment arm; a paraphrase defeats normalised containment at any floor, and `"Great work overall."` is 19 characters, under any plausible one | Repo owner | A count over N real graded rows of how often the two boxes say the same thing | A separate backlog item if the owner sees it happen. **Not built here, and deliberately not signalled - a silent check that cannot fire reads as "not duplicated" and is worse than no check** |
| RES-5 | **Alternative placement for the notice attachment** (judgement J-2): attach in `useSnapshotGrade.ts:268-277`'s merged literal, as Ruling G's text named, instead of in the leaf | Checker or orchestrator | One line moved; the wiring pin at R12 changes from "calls `applySnapshotGradeResult`" to "the merged literal contains `strengthsNotice:`" | The round-3 check. If the checker rules for the hook, the cost is that the attachment becomes a source-text claim rather than an executing oracle |
| RES-6 | **Wave-1 / wave-2 ordering for R10 is a discipline, not a gate.** Nothing mechanically prevents an implementer from writing the frozen literals by running the already-modified function, which would make PC-1 self-confirming | Verify agent | `git log --oneline -- src/lib/grade/prompts-praise-routing.test.ts src/lib/grade/prompts.ts` must show the test file's first commit is strictly earlier than the `prompts.ts` edit | Verify step, before reading anything else |
| RES-7 | **A8-R collision on `src/lib/grade/`** (section 9) | Orchestrator | `sort \| uniq -d` over the two final owns lists at exact-path level | Before either item is dispatched |

---

## 12. What this environment could not verify at all

Stated rather than worked around, per `this-repo.md` section 6:

- No component is rendered by any test, so every claim in R8 and every claim
  about how the empty box or the new notice reads to an instructor is a reading
  claim.
- No API keys, so no claim about what the rewritten prompt actually elicits.
- No live database and no `.env`, so nothing about real `ta-snap-table`
  persistence behaviour beyond the codec's own unit oracles.
- `npx tsc --noEmit` was not run by this seat (single-caller rule), so every
  "tsc will redden here" claim in section 4.3 is derived from reading the type
  annotations at the four cited literals, not from an executed typecheck. The
  wave gate must confirm it.
