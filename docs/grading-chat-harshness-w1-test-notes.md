# GRADING-CHAT-HARSHNESS - Wave 1 test notes (prompt SEAM only, no UI)

Measurement seat. Decides WHAT IS MEASURED and HOW IT FAILS for the harshness
prompt seam. The implementer writes the tests from these notes; a fresh
`loop-checker` reads them first. Every `file:line` below was opened at HEAD
`f18406ae`; every argument list was read from the source, not recalled.

This document CLOSES the loop-checker blocker on
`docs/grading-chat-controls-scope.md` section 4: there are FOUR
`buildSystemPrompt` call sites in `engine.ts`, not three, and two of them pass
fewer than six positional args, so reaching the new trailing slot 7 forces
filling intervening default slots - a wrong-but-VALID fill there is a
silent-green drift on the real grading path that `tsc` does not catch and the
existing frozen oracle (`prompts-praise-routing.test.ts`) does not exercise,
because that oracle calls `buildSystemPrompt` directly and never runs the
engine's composed call. The instrument that closes it is Oracle E below.

House rules in force: no emojis anywhere; any comment-stripping helper a test
needs is named `withoutLineComments`, NEVER `stripComments`; multi-path runs use
`npm run test:paths`; LF line endings; NO `\uXXXX` escapes authored by hand
(the Write/Edit tools materialize them as the literal character, and
`src/source-bytes.structure.test.ts` + `src/lib/no-emojis.test.ts` gate the
whole file) - so none of the new assertions compare against a hand-typed
em/en dash; fixtures match the shape the code actually emits.

---

## 0. The seam as it exists at HEAD (verified, not recalled)

- `buildSystemPrompt` is defined at `src/lib/grade/prompts.ts:56-92` with these
  parameters and their CURRENT effective defaults:
  - `assignmentInstructions: string` (slot 1, no default)
  - `rubric: string` (slot 2, no default)
  - `criteria: RubricCriterion[] = []` (slot 3)
  - `scoringInstructionMode: "some" | "every" = "some"` (slot 4, `:71`)
  - `praiseRouting: "in-overall-comment" | "separate-strengths" = "in-overall-comment"` (slot 5, `:86`)
  - `axisScope: AxisScope = "all"` (slot 6, `:91`)
  - A 7th trailing optional `harshness: GradeHarshness = "balanced"` is ADDED by
    this wave.
- The return composes the axis-scoped prompt at `prompts.ts:217`:
  `return axisScope === "all" ? basePrompt : \`${basePrompt}\n\n${axisScopeDirective(axisScope)}\`;`
  The harshness directive appends LAST, AFTER that:
  `const withAxis = axisScope === "all" ? basePrompt : \`${basePrompt}\n\n${axisScopeDirective(axisScope)}\`;`
  `const h = harshnessDirectiveForLevel(harshness);`
  `return h ? \`${withAxis}\n\n${h}\` : withAxis;`
  So `"balanced"`/`undefined` -> `h === ""` -> `withAxis` is returned
  unchanged = byte-identical to today.
- The engine composes the prompt INTERNALLY and hands it to the model through
  `callLlm` imported from `../llm` (`engine.ts:7`). `scoreAxis` (`engine.ts:58`)
  builds the user part at `engine.ts:96` as
  `\`${systemPrompt}\n\nStudent: ${studentName}${fileListBlock}\n\nSubmission:\n...\``
  and calls `callLlm({ contents: [{ role: "user", parts }], ... }, provider)`
  (`engine.ts:103-109`). `provider` is a STRING TAG
  (`LlmProvider = "gemini" | "other" | "embedded"`, `src/lib/llm.ts:22`), NOT an
  injectable object - so the composed prompt is reachable here ONLY by mocking
  `callLlm` and reading the request it received. `engine.test.ts:13-15,30-35,75`
  already proves this pattern runs under the vitest network block.
- `GradingRunOptions` (`engine.ts:278-288`) is destructured at `engine.ts:342`:
  `const { deadlineMs, commentSplit } = options;` - this wave adds `harshness`
  to that destructure and to the interface (beside `commentSplit?`, `:287`).

### The FOUR engine call sites and their EXACT post-edit argument lists

Read at `engine.ts:352-367`. The site the scope called ":355-357" is a TERNARY
holding TWO distinct calls. Current -> post-edit (intervening default slots
filled EXPLICITLY with their CURRENT effective defaults so today's behaviour is
reproduced byte-for-byte; the added value is always the destructured `harshness`
except where a literal is required):

1. **`engine.ts:356` (commentSplit=true branch of the ternary) - CURRENTLY 5 ARGS:**
   - current: `buildSystemPrompt(assignmentInstructions, rubric, criteria, "some", "separate-strengths")`
   - slot 6 `axisScope` is defaulted (omitted) -> an intervening fill IS required.
   - **post-edit:** `buildSystemPrompt(assignmentInstructions, rubric, criteria, "some", "separate-strengths", "all", harshness)`
   - the explicit `"all"` reproduces today's omitted slot-6 default. DANGEROUS (fill required).

2. **`engine.ts:357` (default branch of the ternary) - CURRENTLY 3 ARGS. THIS IS TODAY'S DEFAULT GRADING CALL ("today's call byte for byte", comment `engine.ts:352-357`):**
   - current: `buildSystemPrompt(assignmentInstructions, rubric, criteria)`
   - slots 4, 5, 6 are ALL defaulted -> THREE intervening fills required.
   - **post-edit:** `buildSystemPrompt(assignmentInstructions, rubric, criteria, "some", "in-overall-comment", "all", harshness)`
   - `"some"`, `"in-overall-comment"`, `"all"` reproduce today's three omitted defaults. MOST DANGEROUS - this is the named blocker site.

3. **`engine.ts:364` - CURRENTLY 6 ARGS:**
   - current: `buildSystemPrompt(assignmentInstructions, rubric, initialCriteria, axisMode, axisRouting, "initial-post-only")`
   - all intervening slots already explicit -> NO intervening fill; only the trailing arg is appended.
   - **post-edit:** `buildSystemPrompt(assignmentInstructions, rubric, initialCriteria, axisMode, axisRouting, "initial-post-only", harshness)`

4. **`engine.ts:366` - CURRENTLY 6 ARGS:**
   - current: `buildSystemPrompt(assignmentInstructions, rubric, replyCriteria, axisMode, axisRouting, "reply-only")`
   - **post-edit:** `buildSystemPrompt(assignmentInstructions, rubric, replyCriteria, axisMode, axisRouting, "reply-only", harshness)`

Sites 1 and 2 require filling intervening default slots; sites 3 and 4 only
append the trailing arg. The blocker lives in sites 1 and 2; the primary
byte-identity oracle (E1, E2) targets them. Sites 3 and 4 get a lighter
instrument (E3) because their only post-edit risk is passing a wrong trailing
value, not a wrong intervening fill.

---

## 1. Oracle E - THE ENGINE DEFAULT-PATH BYTE-IDENTITY ORACLE (the blocker closer)

### Why this instrument and not the scope's AC3-2

The scope's AC3-2 asserts
`buildSystemPrompt("Instructions.","Rubric.",[],"some","in-overall-comment","all","balanced").toBe(DEFAULT_NO_CRITERIA)`.
That is a `buildSystemPrompt`-LEVEL check. It proves the FUNCTION is byte-stable
when called with the right tuple. It does NOT read the tuple the ENGINE actually
passes, so it cannot catch a wrong intervening fill at `engine.ts:357`. Keep
AC3-2 (Oracle 3 below) - it is a good function-level pin - but it is NOT the
blocker closer. Oracle E is.

### What it drives and how it isolates the prompt (runs under the network block)

New file: `src/lib/grade/harshness-engine-default.wiring.test.ts`.

Replicate `engine.test.ts`'s three mock blocks VERBATIM (duplicated, never
imported from `engine.test.ts` - a cross-`*.test.ts` import re-runs that file's
describe blocks):

- `vi.mock("../gemini", ...)` returning small deterministic caps
  (`getGeminiInterRequestDelayMs: () => 0`, `getGeminiMaxCharsPerSubmission:
  () => 20000`, `getGeminiMaxOutputTokens: () => 700`, `getGeminiMaxSubmissions:
  () => 5`). Use a char cap large enough that the tiny fixture content is NOT
  truncated (truncation would change the appended suffix, not the systemPrompt,
  but keep it clean).
- `vi.mock("../llm", () => ({ callLlm: vi.fn() }))`.
- `vi.mock("../code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }))`
  - mandatory: without it the real runner reaches the network on any runnable
    file and the test dies on the vitest timeout before asserting
    (`engine.test.ts:17-28`).

Then: `import { callLlm } from "../llm"; import { gradeEntries } from "./engine";`
`const mockCallLlm = vi.mocked(callLlm);` and in `beforeEach` set
`mockCallLlm.mockResolvedValue({ ok: true, text: OK_RESPONSE_TEXT })` with a
valid grading-JSON `OK_RESPONSE_TEXT` (copy the one at `engine.test.ts:47-51`),
so the engine completes a graded row and `callLlm` is actually invoked.

Isolate the systemPrompt from the captured request:

```
const sent = mockCallLlm.mock.calls[N][0].contents[0].parts[0];
if (!("text" in sent)) throw new Error("expected a text part");
const captured = sent.text;
```

The engine appends `"\n\nStudent: " + studentName + ...` after the systemPrompt
(`engine.ts:96`). Pin byte-identity WITHOUT slicing (a `slice` on a missing
anchor silently widens; forbidden):

```
expect(captured.startsWith(FROZEN + "\n\nStudent: ")).toBe(true);
```

`startsWith(FROZEN + "\n\nStudent: ")` anchors BOTH ends: `captured` must equal
`FROZEN` immediately followed by the known separator. If the engine wrongly
appends anything before the separator (e.g. a harshness directive under
balanced, or a drifted prompt from a wrong fill), the byte right after `FROZEN`
is no longer `\n\nStudent: ` and the assertion goes RED. Do NOT reduce this to
`captured.includes(FROZEN)` (a prefix match misses trailing drift) or to a
`slice`/`indexOf` pair.

### How the FROZEN literal is captured so it reflects TODAY, not the post-edit code

The expected value is a FROZEN LITERAL duplicated into the test file. It is NOT
`buildSystemPrompt(...)` evaluated at test time (that would be a self-comparison
that a consolidating refactor turns into a tautology - traps-tests.md). Capture
procedure, run on the CLEAN HEAD tree BEFORE any edit to `prompts.ts`/`engine.ts`
(this is the TDD red-test authoring step, which precedes the production edit):

1. Confirm `git status --short` shows `src/lib/grade/prompts.ts` and
   `src/lib/grade/engine.ts` unmodified.
2. Run a throwaway capture that drives the SAME mocked-engine harness above and
   prints `mockCallLlm.mock.calls[N][0].contents[0].parts[0].text`, then take
   the substring up to (not including) the first `"\n\nStudent: "`. That printed
   string is the frozen literal - paste it into the test as a `const`.
3. Because the literal is captured from the HEAD engine itself, TODAY'S code
   passes Oracle E by construction, and the edit (which appends `""` under
   balanced) must reproduce it. This is the satisfiability proof for E
   (see section 6): no separate reference implementation is needed because the
   shipped HEAD code IS the reference, and `prompts-praise-routing.test.ts` is
   green today.

### The three E cases

Drive `gradeEntries([entry], "Instructions.", RUBRIC, "gemini", null, OPTIONS)`
where `entry` is `{ student: "Jane Doe", content: "short", mergedFileCount: 1,
submittedFiles: [] }` (no `discussionAxes`, so the single-axis path runs and
`singleAxisPrompt` is used - `engine.ts:425-435`).

- **E1 - site `engine.ts:357`, DEFAULT.** `OPTIONS = {}` (no `harshness`, no
  `commentSplit`). `callLlm` is called once (`N = 0`). Assert
  `captured.startsWith(FROZEN_DEFAULT + "\n\nStudent: ")`.
  - Choose `RUBRIC` so `extractRubricCriteria(RUBRIC)` returns `[]` (confirm at
    HEAD by calling it; `"Rubric."` is the candidate). When it does, `FROZEN_DEFAULT`
    equals the existing `DEFAULT_NO_CRITERIA` in `prompts-praise-routing.test.ts:20`
    - a human cross-check the implementer may eyeball, but must NOT import. If
    `extractRubricCriteria(RUBRIC)` is non-empty, the captured literal simply
    differs and is still valid; the authoritative expected value is the HEAD
    engine capture, not the other file's constant.
  - This case goes RED on the NAMED blocker mutation (see sabotage S-E1).

- **E2 - site `engine.ts:356`, commentSplit.** `OPTIONS = { commentSplit: true }`.
  Same single-axis entry. Assert
  `captured.startsWith(FROZEN_SEPARATE_STRENGTHS + "\n\nStudent: ")`, where
  `FROZEN_SEPARATE_STRENGTHS` is captured from the HEAD engine with
  `commentSplit:true` (the separate-strengths prompt is not frozen in full
  anywhere today, so this literal is NEW and captured by the same procedure).
  - Goes RED on a wrong intervening fill at :356 (sabotage S-E2).

- **E3 - sites `engine.ts:364`/`:366`, two-axis DEFAULT.** Drive one entry whose
  `discussionAxes` is set and whose rubric yields at least one `reply`-axis
  criterion, with `OPTIONS = {}`, so `gradeDiscussionAxes` runs and BOTH the
  initial-axis and reply-axis prompts are composed and sent (two `callLlm`
  calls). For each captured prompt assert:
  - `expect(captured.includes(STRICT_HARSHNESS_DIRECTIVE)).toBe(false)` and
    `expect(captured.includes(LENIENT_HARSHNESS_DIRECTIVE)).toBe(false)` - under
    balanced, NO directive is appended at either axis site.
  - `expect(captured.includes("<the initial-post-only / reply-only axis directive snippet>")).toBe(true)`
    - the axis directive (from `axisScopeDirective`, `prompts.ts:223+`) is still
    present, proving the trailing-arg addition did not disturb slot 6. Pin a
    short, stable SNIPPET of that directive (the implementer reads the exact
    text from `axisScopeDirective` at HEAD), the FACT and not a giant literal,
    because E3's risk is only a wrong trailing value, not an intervening fill.
  - Setting up `discussionAxes` + reply criteria is heavier; if the implementer
    finds the two-axis fixture disproportionate, E3 MAY be reduced to a
    single assertion per site that neither directive text appears - but the
    axis-directive-present assertion is preferred because it also proves slot 6
    survived. State in the build report which form was used.

### Why E runs here and a live call does not

`callLlm` internally reaches `fetch`, which `vitest.setup.ts` throws on. Mocking
`callLlm` (the production seam the engine actually uses) both avoids the network
and captures the exact composed prompt - this is driving the production path,
not working around a gate (seats.md practice 3). Mock `callLlm`/`canvasFetch`,
never `fetch` (a live 401 once made a sabotage pass - traps-tests.md).

---

## 2. Oracle 2 - THE DIRECTIVE PURITY ORACLE (`harshnessDirectiveForLevel`)

New file: `src/lib/grade/prompts-harshness.test.ts` (or a new describe in
`prompts.test.ts`). Frozen table. The two directive literals are DUPLICATED into
the test as `const`s and asserted with `.toBe()`; they are NOT imported from
`prompts.ts` (importing the const and asserting the function returns it is a
self-comparison tautology - the test must freeze the literal independently so a
change to the production const goes RED).

### The pinned directive TEXT (owned by this seat)

These are plain text, instructor voice, REGISTER-of-strictness only; they do not
touch the JSON shape or the plain-text rules; no emojis; and - deliberately - no
long/short dashes, consistent with the base prompt's own ban at `prompts.ts:212`
(authored dash-free so no `\uXXXX` escape is ever written).

`STRICT_HARSHNESS_DIRECTIVE`:
```
Grade strictly. Hold the submission to the full requirements of each rubric area, and deduct for every shortfall you can point to in the submission. Do not round up or give the benefit of the doubt when a requirement is only partly met. Still cite the specific reason for each deduction, and never invent a problem the submission does not actually have.
```

`LENIENT_HARSHNESS_DIRECTIVE`:
```
Grade leniently. Give the benefit of the doubt wherever a rubric area is substantially met, treat minor or cosmetic issues as not worth a deduction, and award full points for an area unless there is a clear, evidenced shortfall. Do not award points for work that is genuinely missing.
```

### The table (each row a case)

- `harshnessDirectiveForLevel("lenient")` -> `LENIENT_HARSHNESS_DIRECTIVE`
- `harshnessDirectiveForLevel("strict")` -> `STRICT_HARSHNESS_DIRECTIVE`
- `harshnessDirectiveForLevel("balanced")` -> `""`
- `harshnessDirectiveForLevel(undefined)` -> `""`
- `harshnessDirectiveForLevel("sideways" as GradeHarshness)` -> `""` (pins the
  defensive final branch against a mutation that throws on an unrecognised value;
  the single tolerated `as` cast, because the type otherwise forbids the input)
- control: `expect(STRICT_HARSHNESS_DIRECTIVE).not.toBe(LENIENT_HARSHNESS_DIRECTIVE)`,
  both `.length > 0`, and neither equals `""`.

---

## 3. Oracle 3 - PRESERVE AND EXTEND the existing frozen oracle

`src/lib/grade/prompts-praise-routing.test.ts:28-50` stays GREEN unchanged: its
three `.toBe()` calls omit the 7th arg, so `harshness` defaults to `"balanced"`,
`h === ""`, and the output is byte-identical. It must be EXTENDED, never broken.
Add to that file (duplicating the `STRICT`/`LENIENT` literals, or `import`ing
them from `prompts-harshness.test.ts` is forbidden - duplicate):

- **AC3-2 (fully-specified default equals omitted default):**
  `expect(buildSystemPrompt("Instructions.","Rubric.",[],"some","in-overall-comment","all","balanced")).toBe(DEFAULT_NO_CRITERIA)`.
  Fails on a single byte of drift when every slot including balanced is explicit.
- **AC3-3 (a non-default level is composed and appended LAST, `axisScope="all"`):**
  `expect(buildSystemPrompt("Instructions.","Rubric.",[],"some","in-overall-comment","all","strict")).toBe(DEFAULT_NO_CRITERIA + "\n\n" + STRICT_HARSHNESS_DIRECTIVE)`
  and the symmetric `"lenient"` case with `LENIENT`. Pins the exact `\n\n`
  separator and that the directive is at the very end.
- **AC3-3b (ordering: axis directive precedes harshness when `axisScope != "all"`):**
  with `axisScope="initial-post-only"`, `harshness="strict"`:
  `expect(out.endsWith("\n\n" + STRICT_HARSHNESS_DIRECTIVE)).toBe(true)` AND
  `expect(out.indexOf(AXIS_SNIPPET)).toBeGreaterThan(-1)` AND
  `expect(out.indexOf(AXIS_SNIPPET)).toBeLessThan(out.indexOf(STRICT_HARSHNESS_DIRECTIVE))`.
  Proves the harshness directive follows the axis directive, not the reverse.
  Do NOT express the expected as `buildSystemPrompt(...,"initial-post-only","balanced") + "\n\n" + STRICT`
  (that is a self-reference); use the endsWith + ordering assertions instead.

---

## 4. Oracle 4 - THE WIRE ORACLES

### 4a. Route default-safe parse (`src/app/api/grade-run-item/route.ts`)

`route.test.ts` mocks `gradeEntries` entirely (`route.test.ts:175-177`), so it
measures what the ROUTE passes, not the engine - correct for a wire oracle.
Current POST passes `{ commentSplit }` to `gradeEntries` at `route.ts:191`; this
wave changes the parse to validate `harshness` default-safe exactly as
`commentSplit` is validated (`route.ts:135`) and passes `{ commentSplit, harshness }`.
`gradeEntries(entries, instructions, rubric, provider, pointsPossible, options)`
so `options` is positional arg index 5: assert on
`mockGradeEntries.mock.calls[0][5].harshness`.

- **W-ROUTE-1 (valid passes through):** POST a valid body with `harshness: "strict"`
  (add it to a clone of the existing `VALID_BODY`); assert the route returns 200-path
  and `mockGradeEntries.mock.calls[0][5].harshness === "strict"`. Repeat `"lenient"`.
- **W-ROUTE-2 (absent -> balanced):** POST `VALID_BODY` with NO `harshness` key;
  assert `...calls[0][5].harshness === "balanced"`. (Also confirms the existing
  `VALID_BODY` still parses - adopt + re-run.)
- **W-ROUTE-3 (invalid -> balanced, the DISCRIMINATING default-safety case):**
  POST with `harshness: "savage"`, then separately `harshness: 7`, then
  `harshness: null`; each must yield `...calls[0][5].harshness === "balanced"`.
  This is the case that discriminates a default-safe parse from a naive
  pass-through (`body.harshness as GradeHarshness`), which W-ROUTE-2 alone would
  NOT catch (a pass-through of an absent field also yields `undefined`, not a
  non-balanced value).

Add `harshness?: unknown` to the route-local `GradeRunItemRequestBody`
(`route.ts:58-66`) and the field to `parseRequestBody`'s return + destructure.

### 4b. incrementalRunPlan optional-unset preservation

`incrementalRunPlan.ts` `GradeRunItemRequestBody` (`:58-66`) gains
`readonly harshness?: GradeHarshness;` beside `commentSplit?` (`:66`).
`buildRunItemRequests` (`:150-158`) does NOT set it - exactly as it already
omits `commentSplit`.

- **W-INC-1 (adopt, stays green):** `incrementalRunPlan.test.ts:112`'s
  full-object `toEqual` on `requests[0]` must remain GREEN - re-run it.
- **W-INC-2 (pin "unset like commentSplit" - REQUIRED, because `toEqual` alone
  does not discriminate):** add
  `expect("harshness" in requests[0]).toBe(false)` and
  `expect("commentSplit" in requests[0]).toBe(false)`. Vitest `toEqual` IGNORES
  an `undefined`-valued key, so an accidental `harshness: plan.harshness`
  (undefined at runtime) would pass W-INC-1 silently; the `in` assertion is the
  instrument that actually catches it. State this explicitly in the build so the
  checker sees why `toEqual` is not sufficient here.

Note: `GradeHarshness` is a type-only addition to `incrementalRunPlan.ts`
(no runtime code), so this file needs no caller-in-wave - call it out as a
type-only change at the wave gate or the gate reads it as an escape.

---

## 5. Oracle 5 - THE DRIVER/BODY WIRING (WAVE 3 instrument, NOT Wave 1)

Recorded here so Wave 1 does not accidentally try to measure it. In Wave 3 the
driver (`useContinuousGradingRun.ts`) builds each request body with a CONDITIONAL
spread so the DEFAULT wire is byte-identical:
`...(harshnessRef.current !== "balanced" ? { harshness: harshnessRef.current } : {})`.
Its instruments are the SCALE removal test (AC3-6: `beginSession({harshness:"strict"})`
then two `submit`s, assert both bodies carry `harshness:"strict"`; remove the
capture/freeze so a per-submit read lets them diverge -> RED) and the default-wire
byte-identity (a balanced session puts NO `harshness` key on the body). These are
Wave 3's `useContinuousGradingRun.lifecycle.test.ts` additions. Wave 1 ships
nothing on this path; do not assert it here.

---

## 6. Satisfiability (the red tests ARE satisfiable)

No separate isolated reference tree was stood up, and here is why that is sound
rather than a shortcut: every red oracle's expected value is either (a) a literal
CAPTURED FROM THE HEAD ENGINE/function itself (Oracle E's `FROZEN_*`, Oracle 3's
`DEFAULT_NO_CRITERIA` which is green today), so the SHIPPED code is the reference
and passes by construction once the edit appends `""` under balanced; or (b) a
literal this seat AUTHORS (Oracle 2's directive strings), which the trivial
`harshnessDirectiveForLevel` body returns verbatim. The reference implementation
is exactly the four post-edit argument lists in section 0 plus the
`harshnessDirectiveForLevel`/two-const definitions in the scope section 4.1;
applying them makes E1/E2/E3/2/3/4 green and leaves the existing suite green.
If the implementer finds any oracle UNSATISFIABLE while building (most likely
E3's two-axis fixture, or `extractRubricCriteria(RUBRIC)` not returning `[]`),
that is a finding to report, not an assertion to drop.

---

## 7. SABOTAGE DESIGN (one per oracle; each must go RED then GREEN on restore)

The implementer applies each mutation to the PRODUCTION code (never the test),
watches the named oracle fail, then restores from a cp-backup (never
`git checkout --` on an uncommitted file - that reverts to the index and
destroys the chunk's work). Each row states whether it discriminates and in
which direction.

| # | Oracle | Mutation (in production code) | Expected RED | Discriminates? |
|---|---|---|---|---|
| S-E1 | E1 (engine :357, the BLOCKER) | At `engine.ts:357` change the filled slot-5 from `"in-overall-comment"` to `"separate-strengths"` (a wrong-but-VALID value) | E1 RED: captured prompt gains the `"strengths"` JSON key + rewritten loci, so `startsWith(FROZEN_DEFAULT + sep)` is false. `tsc` STAYS GREEN (valid union member). `prompts-praise-routing.test.ts:28-50` stays green (it never runs the engine) - proving E1 is the ONLY thing that catches this. | YES - RED only when broken; this is the blocker-closing proof. |
| S-E1b | E1 | At `engine.ts:357` change the filled slot-6 from `"all"` to `"initial-post-only"` | E1 RED: the axis directive is appended, so the byte after `FROZEN_DEFAULT` is not `\n\nStudent:`. | YES. |
| S-E2 | E2 (engine :356) | At `engine.ts:356` change the filled slot-6 from `"all"` to `"reply-only"` | E2 RED (axis directive appended to the separate-strengths prompt). | YES. |
| S-E3 | E3 (engine :364/:366) | At `engine.ts:364` hardcode the trailing arg to `"strict"` instead of `harshness` | E3 RED: the initial-axis captured prompt now `includes(STRICT_HARSHNESS_DIRECTIVE)`. | YES - catches a non-balanced hardcode at a 6-arg site. |
| S-2a | 2 (purity) | In `harshnessDirectiveForLevel`, swap the two returns (`"lenient"` returns `STRICT`, `"strict"` returns `LENIENT`) | Oracle 2 RED on BOTH the lenient and strict rows | YES - strong discriminator; balanced/undefined rows stay green, proving it is not red-in-both-directions. |
| S-2b | 2 (purity) | Append one word to the `STRICT_HARSHNESS_DIRECTIVE` const | Oracle 2 RED on the strict row (also AC3-3 strict + E3 if strict used) | YES. |
| S-2c | 2 (purity) | Make the final branch `throw` instead of `return ""` | Oracle 2 RED on the `"sideways" as GradeHarshness` row (and undefined) | YES - pins the defensive branch. |
| S-3 | 3 (AC3-3) | In `prompts.ts` return, change the separator from `\`${withAxis}\n\n${h}\`` to `\`${withAxis}\n${h}\`` | AC3-3 RED (expected uses `"\n\n" + STRICT`) | YES - pins the exact separator. |
| S-3b | 3 (AC3-3b ordering) | In `prompts.ts`, compose harshness BEFORE the axis directive (append axis after `h`) | AC3-3b RED (axis index no longer < strict index; endsWith fails) | YES - pins axis-then-harshness order. |
| S-3c | 3 (existing :28-50 default identity) | Change the new param default to `harshness: GradeHarshness = "strict"` | `prompts-praise-routing.test.ts:28-50` RED: `buildSystemPrompt("Instructions.","Rubric.")` now appends `STRICT`, so `DEFAULT_NO_CRITERIA` `.toBe` fails | YES - proves the DEFAULT-identity is load-bearing and that the omitted-arg default must be `"balanced"`. |
| S-4a | 4a (route default-safety) | In `parseRequestBody`, replace the default-safe guard with a pass-through `harshness: body.harshness as GradeHarshness` | W-ROUTE-3 RED (`"savage"` reaches options instead of `"balanced"`) | YES - W-ROUTE-3 is the discriminating case; W-ROUTE-2 alone would NOT catch this. |
| S-4b | 4a (route presence) | Drop `harshness` from the object passed at `route.ts:191` (revert to `{ commentSplit }`) | W-ROUTE-1 RED (`...calls[0][5].harshness` is undefined, not `"strict"`) | YES. |
| S-4c | 4b (incremental unset) | Add `harshness: plan.harshness` to the object in `buildRunItemRequests` | W-INC-2 RED (`"harshness" in requests[0]` is true) | YES - and note W-INC-1's `toEqual` stays GREEN (undefined key ignored), which is exactly why W-INC-2 exists. |

No sabotage above is red-in-both-directions or green-in-both-directions; each is
GREEN on the correct implementation and RED only on its named mutation.

---

## 8. Soundness findings on the scope's harshness design (flagged, not silently adopted)

1. **The scope undercounted the engine call sites (3 claimed, 4 real).** The
   ternary at `engine.ts:355-357` is TWO calls. The gate was right. These notes
   close it with per-site, engine-driven byte-identity (Oracle E). This is a
   MEASUREMENT gap, now instrumented - not a code defect.

2. **The scope's AC3-2 is NOT the blocker closer.** AC3-2 is a `buildSystemPrompt`
   function-level pin; it cannot see a wrong intervening fill at an engine call
   site. Kept as Oracle 3, but Oracle E is what closes the blocker. Treating
   AC3-2 as sufficient would re-ship the exact "instrument that does not measure
   what it claims" class the blocker is about.

3. **The STRICT directive directly contradicts explicit base-prompt lines**
   (`prompts.ts:190` "be generous/lenient", `:193` "Grade generously by default",
   `:194` "award full points for that area" unless violated). The design appends
   a contradicting instruction and relies on RECENCY/precedence for the model to
   resolve it toward strictness. Whether the model does so is UNOBSERVABLE here
   (no `GEMINI_API_KEY`, LLM paths mock-only) - this is owner-walk residual R1,
   not a machine-checkable property. This is inherent to the byte-identity-default
   constraint: editing the base lines to remove the lean would break the
   `"balanced"`-is-byte-identical requirement, so appending is the only option
   consistent with it. The directive is therefore a REGISTER NUDGE, not a
   guarantee; the notes measure that it is COMPOSED correctly (Oracle E/3), never
   that it WORKS. This must be recorded as R1 in the backlog, with the owner as
   owner and "grade one submission at each level and compare" as the step.

4. **`harshnessDirectiveForLevel`'s unknown-value branch is only reachable via an
   `as` cast** because the type forbids other inputs, and the route coerces
   unknown -> `"balanced"` before the engine. The `"sideways" as GradeHarshness`
   case (Oracle 2) pins the defensive `return ""` so a future refactor cannot
   turn an unexpected value into a throw on the grading path. Low severity;
   noted so the checker does not flag the cast as a smell.

---

## 9. Gate for Wave 1

```
npm run test:paths src/lib/grade/prompts.test.ts src/lib/grade/prompts-praise-routing.test.ts src/lib/grade/prompts-harshness.test.ts src/lib/grade/harshness-engine-default.wiring.test.ts src/app/api/grade-run-item/route.test.ts src/app/components/grading/incrementalRunPlan.test.ts
```
(one path per arg; never a raw multi-path `vitest`, which silently drops an
unmatched arg - traps-tests.md / this-repo.md). Plus, unconditionally:
`npx vitest run src/file-size-ceiling.structure.test.ts`, `npx tsc --noEmit`
(single caller - no concurrent tsc), `npm run lint` (exit 0, no NEW warning in
files this wave writes), and `git status --short` vs the Wave 1 assignment
(stale-worktree hazard). Re-measure `prompts.ts` and `engine.ts` with
`@(Get-Content <f>).Count` at the gate.

New test files this wave creates: `src/lib/grade/prompts-harshness.test.ts`,
`src/lib/grade/harshness-engine-default.wiring.test.ts`. Name any
comment-stripping helper `withoutLineComments`; do not write the literal
`ta-grading-chat-harshness` in any Wave 1 file (it lands in Wave 3's storage-keys
canary - writing it early trips that canary).
