# Scope: grading-chat deduction controls (file names + length)

Owner request, 2026-10-12 (direct chat): "I need that control on the grading
chat view for whether to deduct points for LENGTH and FILE NAMES."

This is the ARCHITECT artifact. A fresh loop-checker reads it before any build.
Every quantity names the command that produced it; every `file:line` was opened.
ASCII only. READ-ONLY pass: no production file was edited.

The request has two halves that are NOT the same shape, and the single most
important decision in this scope is the split between them:

- PART A (FILE NAMES) is a PORT + WIRING. The deduction already exists and the
  engine already honours an `applyNamingDeduction` option end to end; the chat
  surface simply never populates it. No engine or prompt change is needed.
- PART B (LENGTH) is a NEW grading-prompt rule plus its own toggle. Nothing in
  the tree deducts for submission length today. The rule's exact wording turns
  on an owner clarification, but the plumbing does not.

---

## 0. The leverage question (honest answer, routed to AC - not defaulted here)

These controls let an instructor FREEZE a deduction policy once per session and
have it applied identically to every student in the batch, held as a typed flag
the code carries into the prompt string regardless of what the model would
otherwise do. The in-tree class is GUARANTEED compounded with SCALE
(`docs/loop/leverage.md`): the flag -> prompt-rule mapping is deterministic and
unit-observable here (see `prompts.test.ts:280-284` for the naming analog), and
one captured flag governs N students (`gradeStudentEntries`, `engine.ts:363`).

Honest limit: a chat window CAN be told "deduct for wrong file names" by the
user typing it once. The earned advantage is that the app applies it uniformly
across the batch by construction and does not require re-typing per paste - a
real but thin claim, close to the click-cost / SCALE boundary. The two shipped
siblings (`REPO-GRADES-NAMING-DEDUCTION-TOGGLE` at 61bdf2ce;
`FEEDBACK-LENGTH-CONTROL`) made the same shape of claim. The three-way call
(redesign / accept-cost-explicitly / reject) is the AC seat's and the owner's,
never the architect's. Recorded, not decided here. The buildable removal test
is the flag-reaches-prompt assertion in section 7; the model-honours-the-rule
half is owner-walk only (no live model here - `this-repo.md` section 6),
recorded as residual R-GCDC-1.

---

## 1. Measured facts (verified in this checkout, 2026-10-12)

Line counts by `@(Get-Content <file>).Count` (PowerShell; the mandated
instrument - `this-repo.md` section 3). On these seven files `wc -l` from Git
Bash agreed exactly, so there is no trailing-newline gap here:

```
508  src/lib/grade/prompts.ts
691  src/lib/grade/engine.ts
599  src/app/components/grading-chat/GradingChatPanel.tsx
565  src/app/components/grading-chat/ChatComposer.tsx
690  src/app/components/grading-chat/useContinuousGradingRun.ts
333  src/app/api/grade-run-item/route.ts
647  src/app/components/repo-grades/repoGradesUiState.ts
```

None is near the 1000-line ceiling (`file-size-ceiling.structure.test.ts:41`,
`LIMIT = 1000`). The largest file either wave touches is `engine.ts` at 691;
PART B adds roughly 10-15 lines there and roughly 10-12 to `prompts.ts`. No
ceiling risk; still carry the ceiling canary in every gate (it is unconditional,
`this-repo.md` section 1).

### 1a. PART A - the file-name deduction already exists and the engine honours it

Verified by opening each line:

- UI (repo page): "Deduct for wrong file names" checkbox,
  `RepoGradesControls.tsx:500-514` (checkbox id `repo-grades-apply-naming-deduction`,
  `:504`; `checked={applyNamingDeduction}`, `:505`).
- Persistence: key `ta-repo-grades-apply-naming-deduction`
  (`repoGradesUiState.ts:95`), DEFAULT ON - an absent key reads true
  (`repoGradesUiState.ts:91-95` comment; `parseApplyNamingDeduction(...)` at
  `:259`; write at `:280`).
- Repo thread into the engine: `gradeRepoAction` passes
  `{ applyNamingDeduction }` to `gradeEntries` at `github-repos.ts:872`
  (option declared at `:663`).
- Option type: `GradingRunOptions.applyNamingDeduction?: boolean`,
  `engine.ts:308`.
- Engine default: `const namingDeduction = options.applyNamingDeduction ?? true`,
  `engine.ts:374`, threaded into ALL FOUR `buildSystemPrompt` calls
  (`engine.ts:388,389,396,398`).
- `gradeEntries` (`engine.ts:634`) forwards `options` unchanged to
  `gradeStudentEntries` (`engine.ts:642`), so the chat route - which calls
  `gradeEntries` - already reaches `namingDeduction`.
- Prompt rule: `buildSystemPrompt`'s 9th param `applyNamingDeduction: boolean =
  true` (`prompts.ts:106`); `namingRule` ternary at `prompts.ts:183-185` emits
  the deduction rule when true, a suppression directive ("Do not treat file
  names ...") when false; embedded in the Rules block at `prompts.ts:214`.

CONCLUSION (PART A): the chat grade path currently passes NO
`applyNamingDeduction`, so the engine applies the default `true` - i.e. the chat
grader silently deducts for file names today. PART A therefore changes NO engine
or prompt code; it only threads a new chat-UI flag into the option that already
exists. Default MUST remain ON so today's chat behaviour is byte-identical when
the instructor does not touch the control. (Confirms the brief.)

### 1b. The chat grade path (where the option must be populated)

Traced end to end, each hop opened:

1. Setup UI: `GradingChatPanel.tsx` holds `instructions`/`rubric` and the two
   existing session-frozen controls - harshness (`:163,510`) and feedback word
   count (`:164,519`). Both persist to a `ta-` key and restore in a MOUNT EFFECT
   (not a state initializer; `:174-193`), per the hydration rule
   (MEMORY: persisted details open needs a mount effect).
2. `GradingChatPanel.tsx:297-299` calls
   `driver.beginSession({ assignmentInstructions, rubric, harshness,
   feedbackWordTarget })` ONCE, with the resolved (override-composed) values.
3. `useContinuousGradingRun.ts` `beginSession` (`:323`) captures harshness and
   feedbackWordTarget into refs (`:345-346`), frozen for the session; the refs
   are reset in `reset()` (`:645-646`).
4. Per submission, the hook builds a `GradeRunItemRequestBody` (`:552-562`) and
   CONDITIONAL-SPREADS each control ONLY when non-default (`:560-561`), so the
   wire is byte-identical when a control is left at its default. The body is
   queued and POSTed to `/api/grade-run-item`.
5. The shared client body type is defined ONCE at
   `incrementalRunPlan.ts:59` (`export interface GradeRunItemRequestBody`),
   imported by the chat hook (`useContinuousGradingRun.ts:61`), the one-upload
   hook (`useOneUploadRun.ts:38`) and the incremental hook
   (`useIncrementalGradingRun.ts:31`). harshness/feedbackWordTarget are declared
   there TYPE-ONLY at `:68-71`; `buildRunItemRequests` (`:201`) leaves them
   unset.
6. Server: `route.ts` has its OWN all-`unknown` wire interface
   `GradeRunItemRequestBody` (`:72-82`), validated/coerced by `parseRequestBody`
   (`:125-135`, defaults: harshness->"balanced" at `:190`, feedbackWordTarget
   coerced at `:193`), destructured at `:254`, and assembled into
   `options = { commentSplit, harshness, feedbackWordTarget }` at `:291` and
   `:303`, passed to `gradeEntries`.

The new flags follow this EXACT path. harshness and feedbackWordTarget are the
working template for both the wire shape and the default-safe parse.

### 1c. PART B - length deduction does not exist anywhere

Confirmed absent:

```
grep -rn "applyLengthDeduction\|lengthDeductionDirective\|lengthRule" src/   -> no hits (exit 0, empty)
grep -rni "too short\|too long\|submission length" src/lib/grade/prompts.ts  -> no hits (exit 1)
```

The ONLY "length" in `prompts.ts` is `feedbackLengthDirective` (`:248-258`) /
`FEEDBACK_WORD_TARGET_*` - that is the length of the FEEDBACK TEXT, a different
axis from the owner's "deduct for length" (which is about the SUBMISSION being
too short/long). SEE THE COLLISION WARNING in section 3. PART B is a NEW rule,
NOT a port.

### 1d. The frozen canaries that trip on a new persisted control

Two canaries fire for each new `ta-` key, and both must be bumped IN THE SAME
COMMIT as the key (the pre-push gate runs no vitest, so a drift reaches main
silently - `this-repo.md` section 1):

- `grading-chat-storage-keys.structure.test.ts:13-22` - a FROZEN exact-set
  `EXPECTED` list of 8 keys, asserted by `toEqual` at `:52-54`. It scans RAW
  source of every non-test `.ts`/`.tsx` in `src/app/components/grading-chat/`
  (`:11,24-40`), comments INCLUDED, so a key literal appearing anywhere in a
  grading-chat non-test file (even a comment) joins the set. The key regex is
  `/(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g` (`:26`), so a new key must be
  lower-case, hyphen-only.
- `GradingChatPanel.structure.test.ts:463-476` (the "RG-CLEANUP" block) pins
  the EXACT ordered list of `localStorage.getItem(...)` calls in
  `GradingChatPanel.tsx` via `toEqual` (`:471-475`), today exactly
  `[HARSHNESS_STORAGE_KEY, FEEDBACK_LENGTH_STORAGE_KEY]`. Any new persisted
  control that reads localStorage in the panel (it must, to restore in a mount
  effect) ADDS an entry to that array and reddens the test until the expected
  list is updated. This is NOT in the task brief; it is confirmed by the
  shipped `FEEDBACK-LENGTH-CONTROL` note ("the RG-CLEANUP localStorage pin
  updated to allow BOTH the harshness and feedback-length reads"). Order
  matters (the match returns source order), so the new read's position in the
  array must match where its `getItem` appears in the panel source.

---

## 2. The shape decision: which layer the user reaches, and how

This seat's recorded failure mode is shipping a feature split into layers with
no surface between them. The surface here is the GradingChatPanel setup
controls, and the thread from that surface to the model-facing effect is:

```
Checkbox in GradingChatPanel setup controls (pre-lock, disabled when sessionReady)
  -> local useState + persist to a NEW ta- key + mount-effect restore
  -> driver.beginSession({ ..., applyNamingDeduction, applyLengthDeduction })
  -> useContinuousGradingRun captures into a ref (reset() clears it)
  -> conditional-spread onto GradeRunItemRequestBody only when non-default
  -> POST /api/grade-run-item -> parseRequestBody default-safe coerce
  -> options object -> gradeEntries -> gradeStudentEntries
  -> buildSystemPrompt(... flag ...) -> the prompt rule string the model reads
```

Every hop above is a real edit for PART B. PART A omits the two engine/prompt
hops (`gradeStudentEntries` and `buildSystemPrompt` already consume
`applyNamingDeduction`); it only adds the UI -> ref -> body -> route-options
hops.

### Control type (recommendation; UX/visual seats refine placement)

A CHECKBOX for each toggle, mirroring the repo page's "Deduct for wrong file
names" checkbox (`RepoGradesControls.tsx:500-514`). Rationale: a boolean on/off
is a checkbox in this app's own grading settings; it is one click; and PART A's
copy can match the repo page verbatim so the two surfaces read identically.
Both checkboxes are session-frozen (captured at `beginSession`, like harshness),
rendered in the setup controls group, and `disabled={sessionReady}`. The UX and
visual seats own the exact layout and copy; the architecture binds only the
control TYPE and the persistence/thread shape.

---

## 3. COLLISION WARNING - "length" means two different things

`feedbackWordTarget` / `feedbackLengthDirective` / the key
`ta-grading-chat-feedback-length` all concern the LENGTH OF THE FEEDBACK the
grader writes. The owner's PART B is the LENGTH OF THE SUBMISSION (a one-line
answer to an essay prompt). These are orthogonal. The build MUST NOT wire the
new toggle into the existing feedback-length control, and the new key MUST be
named so no reader confuses them. New keys (both distinct from
`ta-grading-chat-feedback-length`):

- PART A: `ta-grading-chat-apply-naming-deduction`
  (parallels `ta-repo-grades-apply-naming-deduction`).
- PART B: `ta-grading-chat-apply-length-deduction`.

Both confirmed absent today:
`grep -rn "ta-grading-chat-apply-naming-deduction\|ta-grading-chat-apply-length-deduction" src/`
-> no hits (exit 1).

---

## 4. PART B prompt-rule shape (corrects the brief's "mirror namingRule")

The brief says to mirror `namingRule` (`prompts.ts`). Mirror its STRUCTURE (a
conditional rule gated by a boolean option, default-safe), but NOT its PLACEMENT.

`namingRule` is embedded INSIDE the base prompt (`prompts.ts:214`) and ALWAYS
emits something (the rule when on, a suppression directive when off) because the
naming rule pre-existed this toggle. PART B is default-OFF and new, so when off
it must append NOTHING and leave the prompt BYTE-IDENTICAL to today. An embedded
`${lengthRule}` that is `""` when off would leave a stray blank line in the Rules
block and break byte-identity.

The correct precedent is harshness / feedbackLength, which are TRAILING,
conditionally pushed parts (`prompts.ts:236-241`): a pure directive function
returns `""` when off and is pushed into `parts` only when truthy, so the
default prompt is unchanged. PART B follows that exactly:

- New pure function `lengthDeductionDirective(apply: boolean): string` in
  `prompts.ts`, returning the length-deduction rule string when `apply` is true
  and `""` when false. Authored without long/short dashes (the base prompt
  forbids them, `prompts.ts:230`).
- New trailing param on `buildSystemPrompt` (`applyLengthDeduction: boolean =
  false`), default FALSE.
- Pushed into `parts` after the feedback-length directive (`prompts.ts:239-240`),
  guarded by `if (directive) parts.push(directive)`.
- `GradingRunOptions.applyLengthDeduction?: boolean` added in `engine.ts`;
  `gradeStudentEntries` reads `options.applyLengthDeduction ?? false` and passes
  it as the new trailing arg to all FOUR `buildSystemPrompt` calls
  (`engine.ts:388,389,396,398`).

Default FALSE justification (confirms the brief): the naming rule was emitted
unconditionally before its toggle existed, so its toggle defaults ON to preserve
behaviour. The length rule has NEVER existed, so emitting it by default would
silently change every chat grade. An opinionated new deduction must be opt-in.

### 4a. THE OWNER FORK (recommended reading acted on now; wording swappable)

"Deduct for length" has three readings. The PLUMBING is identical for all three;
only the directive STRING differs:

- (i) too-short-only  [RECOMMENDED] - deduct when the submission is substantially
  too short for what the assignment appears to require (a one-line answer to an
  essay). Least likely to misfire; a too-long submission is rarely a rubric
  violation on its own.
- (ii) too-long-too - also deduct for excessive length / padding.
- (iii) relative to an assignment-stated length - only when the instructions
  state an explicit length and the submission misses it (mirrors how `namingRule`
  gates on "if the instructions state required file names").

RECORDED AS THE ARCHITECT'S READING, not an owner ruling: W2 ships reading (i).
Per the never-stall fork rule (`AGENTS.md` SHAPE 5), this is a startable
recommendation, so W2 builds it now with the question riding alongside; the
orchestrator files the fork as its own backlog row. Because the wording lives in
a SINGLE directive-string constant and the plumbing is fork-independent, the
owner's answer is applied by editing that one constant - no re-plumbing, no new
wave. If the owner picks (ii) or (iii), that is transcription into the constant
(and, for (iii), the constant gains an "if the instructions state a length"
clause mirroring `namingRule`), not a redesign. See residual R-GCDC-2.

---

## 5. THE POSITIONAL-PARAMETER DEBT (R-LEN-6) - a decision this scope surfaces

`FEEDBACK-LENGTH-CONTROL` filed a TRIGGERED residual R-LEN-6: "the 8th positional
param compounds the options-object debt (next buildSystemPrompt signature change
owes the refactor first)." `REPO-GRADES-NAMING-DEDUCTION-TOGGLE` then added the
9th positional param (`applyNamingDeduction`) WITHOUT paying it (its note
describes a "trailing applyNamingDeduction=true", no refactor). PART B's new
param would be the 10th positional arg on `buildSystemPrompt`.

This is a real fork, not a copy edit, and it belongs to the orchestrator/owner:

- (a) PAY THE DEBT NOW: convert `buildSystemPrompt`'s trailing scalars to an
  options object. Blast radius is EVERY `buildSystemPrompt` caller, not just the
  four engine sites - including the positional calls in
  `prompts.test.ts:269,275,281` and the harshness/praise-routing/feedback-length
  test suites. That turns a small parity feature into a shared-signature
  migration that wants its own guarded wave (a frozen prompt oracle first, then
  one caller at a time - MEMORY: guard before migration).
- (b) DEFER AGAIN: add the 10th positional param, keep W2 small, and RE-FILE
  R-LEN-6 as now twice-deferred.

ARCHITECT RECOMMENDATION: (b). These are two small parity controls; expanding
W2 into a signature migration couples an owner-facing feature to an unrelated
refactor and enlarges the change against a shared prompt builder. Defer, but the
residual MUST be re-filed (R-GCDC-4) so the debt is not silently dropped - a
third deferral is the point at which the refactor should lead its own wave.

---

## 6. The `owns` file lists

Derived from the thread in section 1b/1c and from a path-dependency sweep for
every source-text test that reads a file either wave edits:

```
# command: for each edited production file, find *.test.ts that read it by path
for p in grading-chat/GradingChatPanel.tsx grading-chat/useContinuousGradingRun.ts \
         grading-chat/ChatComposer.tsx api/grade-run-item/route.ts \
         grade/engine.ts grade/prompts.ts grading/incrementalRunPlan.ts; do
  echo "### $p"; grep -rln "$p" src --include=*.test.ts; done
```

Output (tests that read each file AS SOURCE TEXT - they must RUN in the gate even
though the wave does not own them, because a string they grep could shift):

```
### GradingChatPanel.tsx
  grading/zipUploadPreflight.wiring.test.ts
  grading-chat/chatSeamDiagnostic.wiring.test.ts
  grading-chat/GradingChatPanel.structure.test.ts
  grading-chat/video-w4.wiring.test.ts
### useContinuousGradingRun.ts
  grading-chat/GradingChatPanel.structure.test.ts
  grading-chat/video-w4.wiring.test.ts
### grade-run-item/route.ts
  api/grade-run-item/route.test.ts
  lib/grade/video-w2.wiring.test.ts
### engine.ts
  grading-results/ungradedDisclosure.test.ts
  lib/code-runner.test.ts
  lib/grade/grouping-zip-parents.wiring.test.ts
  lib/grade/rubric-provenance-producers.structure.test.ts
  lib/module-graph/runtime-import-graph.test.ts
### prompts.ts
  lib/module-graph/runtime-import-graph.test.ts
### incrementalRunPlan.ts
  lib/grade/rubric-provenance-producers.structure.test.ts
```

### Wave 1 (PART A - file names, default ON)

PRODUCTION (edited):
- `src/app/components/grading-chat/GradingChatPanel.tsx` - new key const +
  load/persist helpers + useState + mount-effect restore + change handler +
  Checkbox in setup controls + `applyNamingDeduction` arg on `beginSession`.
- `src/app/components/grading-chat/useContinuousGradingRun.ts` - `sessionParams`
  type (`:323`) gains `applyNamingDeduction?: boolean`; new ref; set in
  `beginSession`; cleared in `reset()` (`:645-646`); conditional-spread onto the
  body at `:559-562` as `...(ref.current === false ? { applyNamingDeduction:
  false } : {})` (send ONLY when the user turned it OFF, since the default is
  true).
- `src/app/components/grading/incrementalRunPlan.ts` - `GradeRunItemRequestBody`
  (`:59`) gains `readonly applyNamingDeduction?: boolean` TYPE-ONLY (comment it
  like `:68-71`); `buildRunItemRequests` leaves it unset.
- `src/app/api/grade-run-item/route.ts` - wire interface (`:72-82`) gains
  `applyNamingDeduction?: unknown`; `parseRequestBody` return type + coercion
  (`applyNamingDeduction: body.applyNamingDeduction === false ? false : true`,
  default TRUE); destructure at `:254`; add to BOTH `options` objects (`:291`,
  `:303`).

TESTS (same commit):
- `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts` -
  add `"ta-grading-chat-apply-naming-deduction"` to `EXPECTED` (`:13-22`).
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` - add the
  new `localStorage.getItem(...)` entry to the RG-CLEANUP pin array (`:471-475`)
  in source order; add a naming-control wiring describe block mirroring the
  harshness block (`:639-671`).
- `src/app/api/grade-run-item/route.test.ts` - naming parse default-safe tests
  mirroring the harshness parse block (`:255-281`): absent/invalid -> true,
  explicit `false` -> false.
- New test-author oracle for the naming wire (file named by the test seat).

### Wave 2 (PART B - length, default OFF, new rule) - SERIALIZES after Wave 1

PRODUCTION (edited): all of Wave 1's chat/route/incremental files AGAIN (second
key + second control + second ref + second conditional-spread + second wire
field), PLUS:
- `src/lib/grade/engine.ts` - `GradingRunOptions` (`:290-319`) gains
  `readonly applyLengthDeduction?: boolean`; `gradeStudentEntries` adds
  `const lengthDeduction = options.applyLengthDeduction ?? false` and the new
  trailing arg on all four `buildSystemPrompt` calls (`:388,389,396,398`).
- `src/lib/grade/prompts.ts` - `buildSystemPrompt` trailing param
  `applyLengthDeduction: boolean = false`; new pure
  `lengthDeductionDirective(apply)` returning the rule or `""`; pushed into
  `parts` after the feedback-length directive (`:239-241`).

Conditional-spread direction for PART B (opposite of PART A, because default is
FALSE): `...(ref.current ? { applyLengthDeduction: true } : {})` - send ONLY
when ON. Route coercion: `applyLengthDeduction: body.applyLengthDeduction ===
true` (default FALSE).

TESTS (same commit):
- storage-keys canary - add `"ta-grading-chat-apply-length-deduction"` to
  `EXPECTED`.
- `GradingChatPanel.structure.test.ts` - second `localStorage.getItem` entry +
  length-control wiring block.
- `route.test.ts` - length parse default-safe (absent/invalid/`"true"`/anything
  non-boolean-true -> false; explicit `true` -> true).
- New `prompts` test (test-author): the length rule is PRESENT when the arg is
  true, and `buildSystemPrompt(..., /*applyLengthDeduction*/ false)` is
  BYTE-IDENTICAL to the default call (mirror `prompts.test.ts:280-284`).
- `incrementalRunPlan` type-only assertion (the incremental path never sets the
  field), mirroring the feedback-length precedent.

### Disjointness / ordering

Waves 1 and 2 BOTH edit `GradingChatPanel.tsx`, `useContinuousGradingRun.ts`,
`incrementalRunPlan.ts`, `route.ts`, `grading-chat-storage-keys.structure.test.ts`
and `GradingChatPanel.structure.test.ts`. The file sets INTERSECT, so the waves
are NOT parallel-disjoint and MUST run sequentially (W1, then regenerate the W2
brief against the as-built W1 tree). This matches the brief's smallest-first
order. No concurrent sibling may edit any grading-chat or grade-run-item file
during either wave (the grading-chat surface is also owned by the open
`GRADER-WORKFLOW-OVERHAUL` row - check the queue before dispatch).

---

## 7. Pass conditions (object | instrument | direction of failure)

All are source-text or pure-function checks; nothing renders under vitest, and
there is no live model, so "the model actually deducts" is owner-walk only
(R-GCDC-1). Every gate command that names two or more test files uses
`npm run test:paths -- <p1> <p2> ...` (a raw multi-path `vitest` silently drops
unmatched args - `this-repo.md` section 1).

PART A:
- Object: the chat request body built in `useContinuousGradingRun.ts`.
  Instrument: a wiring test reading the driver source. Direction: RED if the
  driver does not conditional-spread `applyNamingDeduction` (send only when
  false), OR puts an unconditional `applyNamingDeduction` key on the body (which
  would break default-wire byte-identity, mirroring the harshness canary at
  `GradingChatPanel.structure.test.ts:665-670`).
- Object: the route options reaching `gradeEntries`. Instrument:
  `route.test.ts` driving `parseRequestBody`. Direction: RED if an absent/invalid
  `applyNamingDeduction` does not resolve to `true`, or an explicit `false` does
  not reach the engine options as `false`.
- Object: the persisted key set. Instrument: the storage-keys canary. Direction:
  RED unless `EXPECTED` contains exactly the 8 existing keys plus the one new
  naming key.
- Object: the panel's localStorage reads. Instrument: the RG-CLEANUP pin.
  Direction: RED unless the getItem array lists the new naming read in source
  order.

PART B (all of PART A's shape for the length flag, PLUS):
- Object: the composed system prompt. Instrument: a pure `prompts` test.
  Direction: RED if `buildSystemPrompt(..., true)` for length does NOT contain
  the length-rule anchor, OR if `buildSystemPrompt(..., false)` is NOT
  byte-identical to the default (`.toBe(...)`), OR if the default call contains
  the length anchor (the removal test: deleting the directive push or flipping
  the default to true changes an observed value).
- Object: `gradeStudentEntries`' default. Instrument: an engine/prompt wiring or
  oracle test. Direction: RED if the engine passes anything other than `false`
  for an unset `applyLengthDeduction`.

Both waves also carry, unconditionally, the FULL structural gate -
`file-size-ceiling.structure.test.ts`, `source-bytes.structure.test.ts`,
`no-emojis.test.ts`, `strip-comments-agreement.structure.test.ts` - plus the
path-dependent source-text tests listed in section 6 (notably
`route.videoseam.test.ts`, `route.videoref.test.ts`, `video-w2.wiring.test.ts`,
`video-w4.wiring.test.ts`, `chatSeamDiagnostic.wiring.test.ts`,
`zipUploadPreflight.wiring.test.ts`, `rubric-provenance-producers.structure.test.ts`,
`runtime-import-graph.test.ts`, `grouping-zip-parents.wiring.test.ts`,
`ungradedDisclosure.test.ts`, `code-runner.test.ts`), and then a FULL `npm test`
sweep before the wave is called done. The grading effect itself (does the model
deduct) is NOT unit-verifiable here and is owner-walk (R-GCDC-1).

---

## 8. Residual register (owner | instrument | step)

Each residual must land in `docs/BACKLOG.md` (as rows under the grading-chat /
GRADER-WORKFLOW area) or it does not exist (`DEV_LOOP.md` step 0). Listed here so
the AC and plan seats carry them forward.

- R-GCDC-1 - the model actually honours each rule (file-name deduction when ON,
  length deduction when ON). OWNER: owner. INSTRUMENT: owner walk against the
  live model (no live model here - `this-repo.md` section 6). STEP: post-ship
  owner walk. NOT faked green. Matches the two sibling controls, both of which
  shipped the model-honours half as an owner walk.
- R-GCDC-2 - the PART B length-rule WORDING fork (too-short-only [shipped] vs
  too-long-too vs assignment-stated). OWNER: owner (product decision).
  INSTRUMENT: the single `lengthDeductionDirective` string constant (swappable
  with no re-plumbing). STEP: owner answer -> transcription edit to the constant
  in the same file, no new wave. Filed as its own fork row by the orchestrator
  (SHAPE 5); W2 ships reading (i) now.
- R-GCDC-3 - diagnostics representation. The chat path records setup diagnostics
  (`recordGradingDiagnosticEntry` with `operation: "override_setup_fields"`,
  observed in `GradingChatPanel.structure.test.ts:334-341`), so a setup/session
  diagnostic stamping the two flags (no student text) is feasible and
  unit-checkable via a wiring test - NOT a render. OWNER: AC seat decides whether
  it is a required criterion. INSTRUMENT: a wiring test on the diagnostic call.
  STEP: AC round. PRECEDENT: both `REPO-GRADES-NAMING-DEDUCTION-TOGGLE` and
  `FEEDBACK-LENGTH-CONTROL` shipped NO diagnostic for the analogous control and
  justified the absence; a justified NONE is the likely outcome, but it must be
  STATED, not assumed (`DEV_LOOP.md` diagnostics rule).
- R-GCDC-4 - R-LEN-6 (buildSystemPrompt positional-param debt) is twice-deferred
  after PART B adds the 10th positional param. OWNER: the orchestrator/owner (see
  section 5 fork). INSTRUMENT: a frozen prompt oracle before any signature
  migration (MEMORY: guard before migration). STEP: the next
  `buildSystemPrompt` signature change leads with the options-object refactor as
  its own guarded wave. This residual is a DELETION if omitted from the backlog -
  it is re-filed, not dropped.

---

## 9. What this scope does NOT settle (honest limits)

- Exact on-screen placement, copy, and whether a checkbox or a segmented toggle
  reads best next to harshness - UX and visual seats (Wave 3), not this pass.
- Whether the length rule should ever be ON by default for some assignment type
  - out of scope; default FALSE for everyone until the owner says otherwise.
- The R-LEN-6 pay-now-vs-defer fork (section 5) - orchestrator/owner.
- Whether the model's deductions are correct/useful - owner walk only
  (R-GCDC-1); this environment cannot exercise a real model.
