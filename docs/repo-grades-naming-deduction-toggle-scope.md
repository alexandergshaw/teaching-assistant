# Repo-grades naming-deduction toggle - scope + acceptance criteria

Owner request, 2026-10-11, verbatim: "give me a control on the repo page that
dictates whether naming deductions for wrong file names are applied."

Architect seat. Read-only pass; no production code written. A `loop-checker`
reads this before any build. Every quantity below names the command that
produced it; every `file:line` was opened.

This is a NEW item; there is no prior version of this scope, so there is no
disposition table (nothing to keep/hand-over/withdraw).

---

## 0. What the "naming deduction for wrong file names" actually is (located)

It is a MODEL-FACING PROMPT RULE, not a code-computed deduction. There is no
TypeScript that subtracts points for a filename; the deduction is an
instruction the grading model is told to apply.

The rule, always emitted today, verbatim at `src/lib/grade/prompts.ts:207`
(opened; it is one bullet in the "Rules:" block of `buildSystemPrompt`'s
`basePrompt`):

> - If the assignment instructions state required file names for the submission
> (for example, an exact filename each required file must use), compare each
> required name against the SUBMITTED FILES list provided with the submission,
> using exact, case-sensitive matching. A required file that is missing from
> that list, or present only under a different name, is an explicit rubric
> violation for the relevant rubric area, not ambiguity and not a speculative
> issue - deduct for it accordingly and name the missing or misnamed file in
> overallComment. If the assignment instructions state no required file names,
> this rule does not apply and must not be used as grounds for any deduction.

Facts established by opening the code:

- **It is unconditional today.** The bullet is a literal inside `basePrompt`
  (`prompts.ts:179-227`); `buildSystemPrompt` takes no flag that can omit it.
  Confirmed: `buildSystemPrompt`'s signature is 8 positional params ending at
  `feedbackWordTarget` (`prompts.ts:57-103`), none gating this bullet.
- **It is a self-gating rule.** Its last sentence already makes it inert when
  the assignment states no required file names. So the toggle is only
  behaviourally meaningful for assignments that DO state required names - the
  OFF directive must therefore suppress the deduction EVEN when required names
  are stated (that is the clause the toggle has to countermand).
- **It is reached by the repo page.** `src/lib/grade/rubric.ts:5,443`
  re-exports `buildSystemPrompt` from `./prompts`; `src/lib/grade/engine.ts:29`
  imports it from `./rubric` and calls it in `gradeStudentEntries` at
  `engine.ts:367,368,375,377`. The repo page reaches this via
  `gradeRepoAction` -> `gradeEntries` -> `gradeStudentEntries` (traced in
  section 2).
- **The LLM path is the ONLY path with this mechanism.** The embedded
  deterministic engine has NO filename/naming deduction. Evidence:
  `grep -rin "file ?name|naming|deduct|penal|convention|rename|mismatch"
  src/lib/embedded-grader` returns only rubric-tier deduction wording
  (`rubric.ts:835-837`), a `rubricFileName` input param
  (`index.ts:51,64`), and the "Code runs" criterion (`index.ts:166,195`) -
  nothing compares submitted names to required names. So on the embedded
  provider the toggle is INERT by construction (section 6 treats this).
- **The SUBMITTED FILES data block is separate** and is NOT part of
  `buildSystemPrompt`'s output: `buildSubmittedFileNamesBlock`
  (`prompts.ts:356-369`) is appended to the submission text at the call sites,
  not to the system prompt. The toggle gates the RULE at `:207` only, never the
  file-list block (the block still lets the model cite exact filenames in
  feedback, `prompts.ts:203,218`). This is a deliberate scope boundary, not an
  omission.

Conclusion: the feature EXISTS today (the owner's "whether ... are applied"
reading is correct); it is a prompt rule, always on. The feature is "gate that
rule behind a persisted, default-on toggle on the repo page", NOT "add the
deduction". No escalation to the owner on existence is needed.

---

## 1. Leverage claim (GUARANTEED)

The repo grader already runs ONE pinned rubric over N student repos (SCALE,
`engine.ts:358-387`: `limitedEntries` looped, criteria extracted once at
`:362`). This toggle adds a code-held GUARANTEED property on top of that batch:
when OFF, the file-name deduction INSTRUCTION is removed from the composed
system prompt for EVERY repo in the run, by construction - `buildSystemPrompt`
omits `prompts.ts:207` and emits an explicit suppression directive in its
place, and `gradeStudentEntries` builds the prompt once and reuses it for the
whole batch. The instructor gets a batch-wide guarantee that no student lost
points for a filename across the entire run, held by the code that assembles
the prompt, not by the instructor remembering to say it each time.

What the user does instead today, in a chat: pastes each submission and must
re-type "do not deduct for filenames" on every single paste, with nothing
holding that instruction constant across submissions and no way to flip it back
on for the next assignment without retyping. The app holds the choice as a
persisted per-view flag and applies it identically to every entry.

Earned, not inherited: no sibling repo-grades control gives this - it is a new
branch in `buildSystemPrompt` that would have to be deleted for the guarantee
to become false.

Removal test (owned by the Test seat; stated here so the claim is checkable):
the gate test's OFF-direction assertion (`not.toContain` the deduction rule)
goes RED the moment the gating conditional is deleted and the rule is emitted
unconditionally again. Named precisely in section 5, instrument I1.

Honest limit: this claim's user-visible EFFECT (the model's actual score) is
NOT observable in this repo's test environment - no network, no model call. The
instrument proves the PROMPT changes, which is the mechanism; the score change
is owner-walk-only. This is the same class of limit `leverage.md` records for
removal tests over prompt-shaped mechanisms.

---

## 2. The gate, traced end to end (reachability)

The toggle value flows: control -> `uiState` -> persist -> both grading hooks
-> `gradeRepoAction` -> `gradeEntries` options -> `gradeStudentEntries` ->
`buildSystemPrompt` -> the conditional emit of `prompts.ts:207`.

Every hop opened:

1. **Control + state.** A new `uiState.applyNamingDeduction` boolean, default
   true, persisted under a new `ta-` key (section 3). Rendered as a checkbox in
   `RepoGradesControls`, exactly mirroring `runCodeScoring`
   (`RepoGradesControls.tsx:481-490`, inside the "Grading settings" disclosure
   at `:446`), wired from `index.tsx` the same way `runCodeScoring` is
   (`index.tsx:634-635` renders it; `index.tsx:571` passes it into the hook).

2. **Into the grading hook.** `useRepoGradesGradingActions`
   (`useRepoGradesGradingActions.ts`) receives `applyNamingDeduction: boolean`
   as a new param (sibling to `runCodeScoring` at `:104,159`), and passes it as
   `gradeRepoAction`'s new 9th positional arg in `handleGradeCell`
   (`:269-278`, the call currently ends at `runCodeScoring`).

3. **Into the bulk hook.** `useRepoGradesBulkGrade`
   (`useRepoGradesBulkGrade.ts`) receives `applyNamingDeduction: boolean` as a
   new param (sibling to `runCodeScoring` at `:90,197`), and passes it as
   `gradeRepoAction`'s 9th arg in `gradeOneTarget` (`:264-273`, same call
   shape).

4. **Through the action.** `gradeRepoAction`
   (`src/app/actions/github-repos.ts:652-660`) gets a new 9th param
   `applyNamingDeduction?: boolean` (after `runCode`). The LLM branch at
   `github-repos.ts:839` - currently `gradeEntries([entry], instructions,
   effectiveRubric, provider)` (4 args) - becomes `gradeEntries([entry],
   instructions, effectiveRubric, provider, null, { applyNamingDeduction })`.
   The embedded branch (`:812-831`) is NOT changed (no mechanism there; section
   6).

5. **Through the engine options.** `GradingRunOptions`
   (`engine.ts:280-299`) gets a new optional field
   `readonly applyNamingDeduction?: boolean`. `gradeStudentEntries`
   (`engine.ts:343-352`) destructures it at `:353` and passes the RESOLVED
   boolean `applyNamingDeduction ?? true` to all FOUR `buildSystemPrompt`
   calls: `:367, :368, :375, :377`. `?? true` is load-bearing: every OTHER
   engine caller (`gradeSubmissions:595`, `gradeEntries:618`,
   `gradeCanvasUrl:659`) passes no such option, so `undefined -> true ->` the
   rule is emitted, byte-identical to today.

6. **The emit decision.** `buildSystemPrompt` gets a new 9th positional param
   `applyNamingDeduction: boolean = true` (after `feedbackWordTarget` at
   `prompts.ts:102`). When `true`: emit `prompts.ts:207` exactly as today (the
   default branch is byte-identical). When `false`: emit the SUPPRESSION
   DIRECTIVE instead of `:207` (section 4). All three existing call sites in
   `engine.ts` already listed above pass it; every other caller
   (grading-recording path, snapshot path) relies on the `= true` default and
   stays byte-identical.

**Reachability check - the surface is a layer.** The user reaches the gate
through the CHECKBOX, which flips `uiState.applyNamingDeduction`, which both
hooks read and forward as the 9th arg. A build that ships the engine/prompt
gate but does NOT wire the checkbox->hook->action argument through BOTH hooks
ships the gate dead (the exact "library + endpoint, no surface between them"
failure this repo has paid for). Instrument I2 (section 5) is the source-text
pin that the checkbox state reaches `gradeRepoAction` in BOTH call sites.

**Positional-arg shape, justified.** `buildSystemPrompt` already grew to 8
positional params by exactly this precedent (`scoringInstructionMode`,
`praiseRouting`, `axisScope`, `harshness`, `feedbackWordTarget`, each trailing
and defaulting to today). A 9th trailing param defaulting to today is the
minimal byte-identical-preserving change and matches every prior knob. An
options-object refactor of `buildSystemPrompt` is out of scope (it would touch
every caller and every pinned-arity test for no behaviour gain) - recorded as a
residual, section 8.

---

## 3. Persistence (data/storage)

New key, following the `runCodeScoring` precedent in
`src/app/components/repo-grades/repoGradesUiState.ts` but with a DEFAULT-TRUE
parser (the `useReadmeInstructions` shape at `:191-193`, NOT the default-false
`runCodeScoring` shape at `:206-208`), because the owner wants today's behaviour
preserved when the key was never written:

- Key literal: `ta-repo-grades-apply-naming-deduction` (one new `const` beside
  `RUN_CODE_SCORING_KEY` at `:90`).
- `RepoGradesUiState` gains `applyNamingDeduction: boolean`
  (`:119-152` interface).
- `defaultUiState()` sets `applyNamingDeduction: true` (`:154-170`).
- A `parseApplyNamingDeduction(raw)` returning `raw === null ? true : raw ===
  "1"` (verbatim shape of `parseUseReadmeInstructions`, `:191-193`), so an
  absent key reads TRUE (today's behaviour) and only an explicit stored OFF
  ("") reads false.
- `loadRepoGradesUiState` reads it (`:226-240`); `persistRepoGradesUiState`
  writes `state.applyNamingDeduction ? "1" : ""` (`:243-264`), the exact shape
  `README_INSTRUCTIONS_KEY` uses at `:253`.

**FROZEN_KEYS canary, same commit (gate-must-include-directory-canary).**
`src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts`
`FROZEN_KEYS` array (`:19-39`) grows from 19 to 20 entries (add
`"ta-repo-grades-apply-naming-deduction"`, sorted - CORRECTED by check
a95d2d96: after the shared `ta-repo-grades-` prefix, `apply-...` (0x70 'p')
sorts BEFORE `assignment-map` (0x73 's'), so the new key lands at POSITION 1,
first in the array - NOT between assignment-map and bulk-selection-only.
collectKeys returns `.sort()`ed output and K1 does `toEqual(FROZEN_KEYS)`, so a
mis-placed entry reddens K1 at the owned gate), AND the K1 assertion
comment literal "exactly the frozen 19" (`:42`) becomes "20". Both in the SAME
commit as the new key, or `K1` reddens main uncaught. (The `grep -c
"ta-repo-grades-"` count on that test file is 21, not 19:
19 array entries + the K3 injected-canary string + the K4 reference to
`link-open`. The authoritative count is the ARRAY length, which the test prints
as "the frozen 19".)

Nothing deletes this data except the client-state sweep (per
`CELLS_KEY`'s note at `:94-96`, the sweep governs repo-grades keys); this is a
plain per-view boolean, no migration, no Supabase, no size concern (one char).

---

## 4. The OFF directive (the gated-deduction decision) + frozen oracle

When `applyNamingDeduction === false`, `buildSystemPrompt` MUST NOT emit the
`:207` rule, and MUST emit in its place a directive that countermands the
rule's self-gating clause (which otherwise still lets a model deduct when
required names ARE stated). Proposed directive text (no long/short dashes, no
emojis, house voice - the base prompt forbids dashes in feedback but this is a
grading instruction, still authored dash-free for consistency):

> - Do not treat file names, file naming, or naming conventions as a basis for
> any deduction. Even if the assignment instructions state required file names,
> a file submitted under a different name than requested is NOT a rubric
> violation for this run; evaluate only the content of what was submitted
> against each rubric area, and never deduct, or note a deduction, for a
> filename mismatch.

**Frozen oracle for the decision** (the Test seat builds the executable form;
this is the authored expected-value table the oracle is checked against). The
observable is the STRING returned by `buildSystemPrompt`, over the two toggle
states crossed with whether the rubric states a filename requirement (the
latter is irrelevant to the prompt text, since the rule is emitted
unconditionally within the prompt and only the MODEL applies the self-gate -
included to prove the prompt text does not vary on it):

| applyNamingDeduction | prompt contains deduction rule anchor | prompt contains suppression anchor |
|---|---|---|
| `true` (default / omitted) | YES | NO |
| `false` | NO | YES |

- deduction rule anchor = `"required file names for the submission"`
  (unique within `buildSystemPrompt` output - `grep -n` confirms the only other
  `prompts.ts` occurrences, `:331` and `:372`, are in `buildSubmittedFileNamesBlock`
  and `buildFileNameConventionPrompt`, neither part of `buildSystemPrompt`).
- suppression anchor = `"Do not treat file names"` (new, unique).

This oracle is byte-level, deterministic, needs no network and no model call -
it is fully buildable here.

---

## 5. Machine-checkable instruments

All run under `npm run test:paths -- <p1> <p2> ...` when more than one path
(never a raw multi-path `vitest`, which silently drops unmatched paths -
memory: test-paths-wrapper).

**I1 - PURE gate test (the deduction is gated by the toggle).** New
`describe` block in the EXISTING `src/lib/grade/prompts.test.ts` (it already
pins the default-ON rule at `:97-109`, which stays green because the default
arg is unchanged). Object under comparison: the return of `buildSystemPrompt`
with identical first-8 args, differing only in the 9th. Instrument: Vitest
string assertions. Direction of failure:
- ON (`buildSystemPrompt(instr, rubric, [], ... , undefined /*default*/)` and
  explicit `true`): `expect(prompt).toContain("required file names for the
  submission")` and `expect(prompt).not.toContain("Do not treat file names")`.
- OFF (explicit `false` in the 9th position):
  `expect(prompt).not.toContain("required file names for the submission")` and
  `expect(prompt).toContain("Do not treat file names")`.
This IS the removal test for the leverage claim: delete the conditional (always
emit `:207`) and the OFF `not.toContain` + `toContain(suppression)` both go RED.
**Anchor must be the FULL phrase `"required file names for the submission"`,
never the loose `/required file name/i` the existing test uses at
`prompts.test.ts:102`** - the OFF suppression directive legitimately contains
the words "required file names" (section 4: "Even if the assignment instructions
state required file names..."), so a loose anchor would match BOTH branches and
the OFF assertion would be a tautology (memory: anchor-must-be-unique). The full
phrase appears only in the `:207` rule. Do NOT import any helper from another
`*.test.ts` (memory: no-cross-test-file-imports). Mutation that each assertion catches, for the
checker: inverting the conditional, or defaulting the param to `false`, flips
the ON branch red; deleting the suppression emit flips the OFF branch red.

**I2 - source-text pin: the toggle reaches the gate in BOTH grading paths.**
Precedent: `src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts`
already does exactly this for `runCodeScoring` (it reads the two hooks as source
and asserts `runCodeScoring` reaches `gradeRepoAction`). Extend THAT file (or a
sibling in its pattern) to assert, reading
`useRepoGradesGradingActions.ts` and `useRepoGradesBulkGrade.ts` as source
text, that each file's `gradeRepoAction(` call carries the
`applyNamingDeduction` argument, and that `index.tsx` passes
`applyNamingDeduction` into BOTH hook calls. Object: the source bytes of those
three files. Instrument: `readFileSync` + substring/regex (the idiom those
files already use). Direction of failure: a build that wires the engine/prompt
gate but forgets either hook's argument, or the `index.tsx` wiring, reddens I2
- catching the "ships dead" reachability failure. Pin the FACT (the argument is
threaded), not an exact arity or spelling (memory: source-text-tests-overspecify,
and the `repoGradesRubricPicker.wiring.test.ts` lesson at
`useRepoGradesGradingActions.ts:256-264` where an arity pin forced a worse
implementation).

**I2 EXISTING-ASSERTION UPDATE (REQUIRED, added by check a95d2d96).** The 9th
arg reddens two EXISTING assertions in `repoGradesCodeExecution.wiring.test.ts`
that pin `runCodeScoring` as the last/8th arg - the Wave U edit MUST loosen BOTH
in the same change, not merely append new assertions:
- `:413` `expect(args).toHaveLength(8)` on the per-cell `gradingActionsSource`
  call becomes 9 - update to 9 (or loosen to `toBeGreaterThanOrEqual(9)`).
- `:441` the regex `/gradeRepoAction\(\s*target\.repo,...,\s*runCodeScoring\s*\)/`
  on `bulkGradeSource` no longer matches once `, applyNamingDeduction` is
  appended - loosen the trailing `runCodeScoring\s*\)` so it tolerates a further
  trailing arg.
(`repoGradesRubricPicker.wiring.test.ts`, listed ADOPTED, does NOT break - its
`toHaveLength(8)` at `:337` reads a synthetic string and its real-source checks
are `>=7` / positional `args[6]`; no change there. Still re-run it.)

**I3 - ta- key round-trip.** `src/app/components/repo-grades/repoGradesUiState.test.ts`
(the existing load/persist round-trip suite) gains a case: persist
`{ applyNamingDeduction: false }`, reload, expect `false`; and that an ABSENT
key loads as `true` (the default-preservation property). Object: the state
round-tripped through a stubbed `localStorage`. Instrument: Vitest. Direction:
a parser that defaults false, or a persist that writes the wrong marker,
reddens it.

**I4 - FROZEN_KEYS canary.** `repoGradesStorageKeys.structure.test.ts` K1
(`:42`) must equal the new 20-key array. Object: the key literals scanned from
`repoGradesUiState.ts`. Instrument: the exact-set comparison already in the
file. Direction: adding the key WITHOUT updating `FROZEN_KEYS` reddens K1;
updating `FROZEN_KEYS` WITHOUT adding the key also reddens it. This is the
required directory canary bump.

**I5 - diagnostics summary pin (section 7).** Source-text pin on
`RepoGradesControls.tsx`'s `settingsSummary` template (`:329-334`) that it names
the naming-deduction state token, mirroring how it already names "Code scoring:
on/off". Object: the component source. Instrument: `readFileSync` + substring.
Direction: a summary that omits the naming state reddens it.

**NOT buildable here (owner-walk only), stated:** the model's ACTUAL score
change when the toggle flips. No component renders under vitest and the network
is blocked (`vitest.setup.ts` throws on real fetch; memory:
tests-are-network-blocked), so the end-to-end "a repo with a misnamed file
scores higher with the toggle off" is OWNER-VERIFIED in the real app, recorded
as a residual with an owner and a step (section 8). Do NOT propose a
render-based or live-model criterion.

---

## 6. The embedded-provider boundary (stated, not a defect)

On `provider === "embedded"` (`github-repos.ts:812-831`) the toggle is INERT:
the embedded engine has no naming-deduction mechanism (section 0 evidence), so
"off" already matches reality there and "on" adds nothing there. This is
SYMMETRIC with the shipped `runCodeScoring`, whose summary says "Code scoring:
on (changes scores)" yet only affects the embedded engine (the LLM path always
runs code) - a flag shown in the summary regardless of which engine it governs
is the accepted house pattern. The control therefore stays a single global
boolean (not per-provider); the embedded branch of `gradeRepoAction` is not
touched. A criterion requiring the toggle to change embedded-engine scores
would be unsatisfiable by construction and must not be written.

---

## 7. Diagnostics representation (DEV_LOOP b907ff8e) - decision

**Decision: NO new session-diagnostic-log entry. YES to a grading-settings
summary readout. Both justified.**

- The session diagnostic log records grade actions through
  `timeGradingAction("grade_repo", ...)` (`gradingActionSeam.ts:106-117`), and
  a recorded entry carries ONLY `{ at, operation, outcome, durationMs, error? }`
  where `error` is a fixed SHAPE-derived class string, never config
  (`gradingActionSeam.ts:54-95`; `session-diagnostic-log.ts:44-49` -
  "every operation instrumented here is an API/infrastructure call succeeding
  or failing", no grading knob of ANY kind recorded, not harshness, not
  `runCodeScoring`). The toggle adds NO new failure mode and NO new operation -
  `grade_repo` still succeeds/fails/times identically. Adding a config field to
  that log would be a new KIND of data it has never carried and would set a
  precedent to log every grading knob. So this surface carries none, and that
  absence is STATED and justified here, per the rule's own allowance for "no
  new failure mode".
- The feature is instead made OBSERVABLE through the run's own on-screen config
  readout: `RepoGradesControls.tsx`'s `settingsSummary` (`:329-334`) already
  names each grading flag's state ("Code scoring: on (changes scores)"). The
  naming toggle appends its state there (e.g. "File-name deductions: on/off"),
  so an instructor confronted with a surprising grade can see from the run
  surface whether file-name deductions were applied - the "failure it makes
  visible" being a grade whose filename-deduction behaviour would otherwise be
  unexplainable. Instrument I5 pins this.

This is an acceptance criterion (AC-7), re-judged at Verify against the built
diff like any other.

---

## 8. Write set, waves, collision + serialization map

### Owns - production files (command + pasted output)

Command: `for f in <paths>; do printf "%6d  %s\n" "$(wc -l < "$f")" "$f"; done`
(git-bash, from repo root, 2026-10-11):

```
   501  src/lib/grade/prompts.ts
   667  src/lib/grade/engine.ts
   881  src/app/actions/github-repos.ts
   590  src/app/components/repo-grades/repoGradesUiState.ts
   620  src/app/components/repo-grades/RepoGradesControls.tsx
   836  src/app/components/repo-grades/index.tsx
   624  src/app/components/repo-grades/useRepoGradesGradingActions.ts
   441  src/app/components/repo-grades/useRepoGradesBulkGrade.ts
```

1000-line ceiling: the largest edited file is `github-repos.ts` at 881; each
file grows by at most ~4 lines, so none approaches 1000. `index.tsx` (836)
gains ~3 lines (one hook arg + two control props). I do NOT edit
`repo-grades.module.css` (970, near ceiling) - the control reuses the existing
`FormControlLabel`/`Checkbox` MUI pattern (`RepoGradesControls.tsx:37-38,
481-490`), adding no CSS. (Ceiling re-measure at build time with
`@(Get-Content <file>).Count`, the project idiom, not `wc -l` - the two can
differ by the trailing-newline count; the margins here are large enough that
the discrepancy cannot cross 1000.)

### Owns - test files (that read the edited files AS SOURCE TEXT, so a correct change can redden them)

Command: `grep -rln "readFileSync" src/app/components/repo-grades src/lib/grade`
filtered to those naming an edited file, plus
`grep -rln "gradeRepoAction" src/app/components/repo-grades/*.test.ts`
(git-bash, 2026-10-11). The ones this change actually touches or risks:

- `src/lib/grade/prompts.test.ts` - OWNED, extend with I1 (default-ON case at
  `:97-109` stays green).
- `src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts` -
  OWNED, extend with I2 (it is the `runCodeScoring` threading precedent).
- `src/app/components/repo-grades/repoGradesUiState.test.ts` - OWNED, extend
  with I3.
- `src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts` -
  OWNED, bump per I4 (same commit as the key).
- ADOPTED (read `gradeRepoAction` and may pin its argument SHAPE - must be
  re-run, and updated only if they pin an exact arity):
  `repoGrades.wiring.test.ts`, `repoGradesBulkGrade.test.ts`,
  `useRepoGradesBulkGrade.test.ts`, `useRepoGradesBulkGrade.lifecycle.test.ts`,
  `repoGradesRubricPicker.wiring.test.ts`, `repoGradesFolderSelection.test.ts`.
  The build must open each and confirm whether it asserts a fixed
  `gradeRepoAction` arg count; if so, update the FACT it protects, never freeze
  a now-wrong arity (the lesson already recorded at
  `useRepoGradesGradingActions.ts:256-264`).
- CHECKED-SAFE: `engine.test.ts`, `engine` callers' tests - the new
  `GradingRunOptions` field is optional and defaults to today, so existing
  engine tests that pass no option are byte-identical. Re-run to confirm.

### Collision map (heavy repo-grades concurrency)

Measured, `git status --short` at session start:
- MODIFIED, uncommitted RIGHT NOW (in-flight repo-grades work -
  module-picker/status-prominence per the backlog):
  `RepoGradesControls.tsx`, `RepoGradesStickyHeader.tsx`, `index.tsx`,
  `repoGrades.wiring.linking.test.ts`, `repoGrades.wiring.test.ts`,
  `repoGradesFeedbackAndFiles.wiring.test.ts`; untracked `RepoGradesFolderPicker.tsx`.
- NOT modified (measured, `git status --short` on each returned empty):
  `src/app/actions/github-repos.ts`, `src/lib/grade/prompts.ts`,
  `src/lib/grade/engine.ts`.

Write-set intersection with the live in-flight set: my UI wave edits
`index.tsx` and `RepoGradesControls.tsx`, BOTH currently dirty -> COLLISION.
I do NOT edit `RepoGradesStickyHeader.tsx` (the control goes in
`RepoGradesControls`'s Grading-settings disclosure beside its siblings -
section 2 - not the sticky header), which removes one collision the scope
anticipated.

### Two waves, serialized at the UI boundary

**Wave L (LOGIC + GATE) - SERIALIZES after branch-merge Wave 1 (CORRECTED by
check a95d2d96, round 1).** Files: `src/lib/grade/prompts.ts`,
`src/lib/grade/engine.ts`, `src/app/actions/github-repos.ts`,
`src/lib/grade/prompts.test.ts`. The scope's original "may run now / dirty set
empty" claim was STALE: `github-repos.ts` held the uncommitted branch-merge-check
Wave 1 work. That work COMMITTED at `41cde1e3`, so `github-repos.ts` is clean
again AND is now 913 lines (not 881) - re-measure every `github-repos.ts` line
cite with `@(Get-Content).Count` at build (the 9th param goes after `runCode` in
the ~:654 signature; the LLM `gradeEntries` call is ~:871; embedded branch ~:844;
913+~4 < 1000). RE-MEASURE GATE (same as Wave U): before dispatch, `git status
--short` must show `github-repos.ts`, `prompts.ts`, `engine.ts`, `prompts.test.ts`
all clean, AND no OTHER concurrently-dispatched BUILD may be running (all builds
serialize on the shared tsc / full-test+sabotage resource, not just on file
overlap). This wave adds the 9th param to `buildSystemPrompt`, the
`GradingRunOptions` field + engine threading, the `gradeRepoAction` 9th param +
options pass-through, and I1. It is self-contained and green on its own (the
default keeps every caller byte-identical), and it creates the argument slot the
UI wave fills.

**Wave U (UI + STATE + WIRING) - MUST serialize after Wave L AND after the
in-flight repo-grades waves land.** Files: `repoGradesUiState.ts`,
`repoGradesStorageKeys.structure.test.ts`, `RepoGradesControls.tsx`,
`index.tsx`, `useRepoGradesGradingActions.ts`, `useRepoGradesBulkGrade.ts`,
`repoGradesCodeExecution.wiring.test.ts`, `repoGradesUiState.test.ts`. This wave
edits `index.tsx` and `RepoGradesControls.tsx` (currently dirty) and threads the
9th arg into both hooks - it CANNOT begin until (a) Wave L has landed the
`gradeRepoAction` 9th param, else the hook calls will not type-check, and (b)
the in-flight module-picker/status-prominence edits to `index.tsx` /
`RepoGradesControls.tsx` have committed, else Wave U reverts a sibling's work
(memory: wave-gate-git-status, no-git-stash-under-concurrency).

At Wave U dispatch time, re-measure the intersection and paste it (empty is the
only pass):
`git status --short` -> if `index.tsx` or `RepoGradesControls.tsx` or either
hook is still dirty, Wave U waits. Also run, over the proposed Wave U file list
vs the live tree, the standard `sort | uniq -d` path intersection against any
OTHER concurrently-dispatched item.

Not trivially revertible: the new `ta-` key is a persisted-shape change (an
instructor who toggles OFF, reloads, and the key is later removed reverts to
default ON - acceptable, stated). The `buildSystemPrompt` signature change and
the `GradingRunOptions` change are shared-function changes - that is why Wave L
is isolated and gated on its own full green before Wave U builds on it.

---

## 9. ACCEPTANCE CRITERIA

Written from the owner's words. Each names the object, the instrument, and the
direction of failure. "The model actually scores differently" is owner-walk
(AC-6); every other criterion is machine-checkable here.

- **AC-1 (persist + default ON).** `uiState.applyNamingDeduction` persists
  across reload under `ta-repo-grades-apply-naming-deduction`, and an account
  that never touched the control loads `true` (today's behaviour preserved).
  Instrument: I3 + I4. Fails if: the parser defaults false, the key is absent
  from `FROZEN_KEYS`, or the round-trip loses the value.

- **AC-2 (OFF suppresses the deduction instruction).** With the toggle OFF,
  `buildSystemPrompt` does NOT emit the `prompts.ts:207` rule and DOES emit the
  suppression directive (section 4), for the prompt used by every repo in the
  run. Instrument: I1 (OFF direction). Fails if: the rule still appears, or the
  suppression directive is absent, when the 9th arg is `false`.

- **AC-3 (ON unchanged).** With the toggle ON (or the arg omitted),
  `buildSystemPrompt`'s output is byte-identical to today - the `:207` rule
  present, no suppression directive. Instrument: I1 (ON direction) + the
  pre-existing `prompts.test.ts:97-109,172` staying green. Fails if: the default
  path differs from today in any byte.

- **AC-4 (the gate is reachable - not dead).** The checkbox state threads
  through `uiState` into BOTH grading paths as `gradeRepoAction`'s
  `applyNamingDeduction` argument, and through `gradeEntries`/
  `gradeStudentEntries` into `buildSystemPrompt`. Instrument: I2
  (source-text, both hooks + `index.tsx`). Fails if: either hook omits the
  argument, or `index.tsx` omits either hook prop - i.e. the feature would ship
  with a control that changes nothing.

- **AC-5 (control placement + house pattern).** A labelled checkbox in the
  "Grading settings" disclosure of `RepoGradesControls`, default CHECKED,
  rendered with the same `FormControlLabel`/`Checkbox` pattern as "Score code
  execution" (`RepoGradesControls.tsx:481-490`), no new CSS, no emoji, house
  voice. Instrument: source-text pin on `RepoGradesControls.tsx` for the new
  `FormControlLabel`/`checked`/`onChange` triplet + the no-emoji suite
  (`src/lib/no-emojis.test.ts`, do not hand-roll). Fails if: the control is
  absent, defaults unchecked, or introduces a non-ASCII char.

- **AC-6 (user-visible effect - OWNER-WALK).** In the real app, a repo whose
  submission uses a wrong file name against an assignment that states a required
  name: with the toggle ON the model deducts and names the misnamed file; with
  it OFF the model does not deduct for the filename. NOT verifiable here (no
  render, no model, no network). Owner: repo owner. Step: owner grades one such
  repo twice (toggle on, then off) in the live app and confirms the score/
  comment differ only on the filename deduction. Recorded as a residual
  (section 10).

- **AC-7 (diagnostics representation).** The grading-settings summary line
  (`RepoGradesControls.tsx:329-334`) names the naming-deduction state, so the
  run surface shows whether file-name deductions were applied; NO session-
  diagnostic-log entry is added (justified, section 7). Instrument: I5. Fails
  if: the summary omits the state.

- **AC-8 (embedded boundary stated).** The toggle does not alter the embedded
  engine (no mechanism there); the control stays a single global boolean. No
  criterion requires an embedded-score change. Instrument: section 6 reasoning
  + the embedded branch of `gradeRepoAction` appearing unchanged in the diff.
  Fails if: a build adds embedded-path naming logic not asked for.

---

## 10. Residual register

Each has an owner, an instrument, and the step that measures it. A residual not
in `docs/BACKLOG.md` does not exist - the orchestrator files these at disposal.

- **R1 (owner-walk, AC-6).** Owner: repo owner. Instrument: manual two-pass
  grade in the live app (toggle on vs off) on a repo with a misnamed required
  file. Step: owner runs it post-deploy. Reason it is a residual not a gate:
  no component renders and the network is blocked here, so the score effect is
  unobservable in CI. NOT a deletion - it is the one genuinely owner-only part.

- **R2 (options-object refactor of `buildSystemPrompt`).** Owner: next feature
  that adds a 10th `buildSystemPrompt` knob. Instrument: the param-count of
  `buildSystemPrompt` in `prompts.ts`. Step: when a 10th positional param would
  be added, convert the trailing knobs to an options object in that chunk. This
  is a debt a ruling creates (section 2), not a deletion - recorded so it is
  owed, not silently dropped.

- **R3 (SUBMITTED FILES block framing under OFF).** Owner: this item's Verify
  pass. Instrument: read `buildSubmittedFileNamesBlock`'s header text
  (`prompts.ts:366`, "check any stated filename requirements") against the OFF
  behaviour. Step: Verify confirms leaving the block intact under OFF is
  harmless (the block's primary job - letting the model cite exact filenames in
  feedback - survives); if the owner later wants the block's filename-
  requirement framing softened under OFF too, that is a follow-up, not this
  item. Deliberate scope boundary (section 0), recorded so it is not mistaken
  for an oversight.
