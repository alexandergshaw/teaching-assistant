# FEEDBACK-LENGTH-CONTROL - scope / wave plan

Architecture/scoping seat. Scope only, no production code. A fresh `loop-checker`
reads this before any build. Every quantity names the command that produced it;
every `file:line` was opened at HEAD ~`fa0b6370`.

Owner, direct chat 2026-10-08 (verbatim): "i need a control to specify the length
of the feedback as well - in terms of word count".

This is the DIRECT ANALOG of the SHIPPED grading-chat harshness control
(`docs/grading-chat-controls-scope.md` item 3; seam `f87b5415`, UI `9f5d3910`).
The design mirrors harshness almost line for line, with a numeric twist. Unless a
section says otherwise, the mechanism, the threading, the lock, the frozen-oracle
discipline, the storage canary and the gate are the SAME as harshness - read that
scope and this one together.

---

## 0. Measured facts this scope rests on

All commands run from repo root, this checkout, 2026-10-08.

| Fact | Command | Value |
|---|---|---|
| prompts.ts size | `@(Get-Content src/lib/grade/prompts.ts).Count` | 475 |
| engine.ts size | `@(Get-Content src/lib/grade/engine.ts).Count` | 662 |
| grade/types.ts size | `@(Get-Content src/lib/grade/types.ts).Count` | 475 |
| grade-run-item route size | `@(Get-Content src/app/api/grade-run-item/route.ts).Count` | 215 |
| incrementalRunPlan size | `@(Get-Content src/app/components/grading/incrementalRunPlan.ts).Count` | 303 |
| GradingChatPanel size | `@(Get-Content src/app/components/grading-chat/GradingChatPanel.tsx).Count` | 400 |
| useContinuousGradingRun size | `@(Get-Content src/app/components/grading-chat/useContinuousGradingRun.ts).Count` | 412 |
| grading-chat ta- keys frozen set | `grading-chat-storage-keys.structure.test.ts:13-19` | 5 keys |

All files are far under the 1000-line ceiling (`src/file-size-ceiling.structure.test.ts`,
`LIMIT = 1000`). Estimated post-edit deltas (see section 7) keep every file under 500.
Re-measure the two files each wave edits with `@(Get-Content <f>).Count` at that gate
rather than trusting these; the ceiling test runs UNCONDITIONALLY in every gate.

**This environment cannot verify** (`this-repo.md:245-264`): no live DB, no API keys
(`GEMINI_API_KEY` is owner-set in Vercel; every LLM path is mock-only), and **NO
COMPONENT IS RENDERED BY ANY TEST**. So every "rendered", "visible", "clicked", and
"the model honours the word count" claim is an OWNER WALK; only source-text/structure/
wiring and pure-function oracles are machine-checkable here. No requirement below has
a render as its only enforcer.

---

## 1. The harshness seam as it ACTUALLY exists at HEAD (opened, not recalled)

The harshness control is fully shipped. The feedback-length control slots in beside
it at every layer. Verified:

- `src/lib/grade/types.ts:74` - `export type GradeHarshness = "lenient" | "balanced" | "strict";`.
  Shared runtime validators already live here (`coerceGradeDetermination`, `:118`;
  `coerceUngradedOutcome`, `:314`) - the precedent for putting a shared coerce helper here.
- `src/lib/grade/prompts.ts`:
  - `buildSystemPrompt` signature ends at a **7th trailing param**
    `harshness: GradeHarshness = "balanced"` (`:96`).
  - Composition at `:222-224`:
    ```
    const withAxis = axisScope === "all" ? basePrompt : `${basePrompt}\n\n${axisScopeDirective(axisScope)}`;
    const harshnessDirective = harshnessDirectiveForLevel(harshness);
    return harshnessDirective ? `${withAxis}\n\n${harshnessDirective}` : withAxis;
    ```
  - `STRICT_HARSHNESS_DIRECTIVE`/`LENIENT_HARSHNESS_DIRECTIVE` consts (`:229-233`),
    pure map `harshnessDirectiveForLevel(level)` returning `""` for balanced/undefined/
    unknown (`:238-242`).
- `src/lib/grade/engine.ts`:
  - `GradingRunOptions.harshness?` (`:291`), destructured at `:346`
    (`const { deadlineMs, commentSplit, harshness } = options;`).
  - **FOUR** `buildSystemPrompt` call sites, ALL already passing 7 args ending in
    `harshness)`: `:360`, `:361`, `:368`, `:370` (verified below).
- `src/app/api/grade-run-item/route.ts`: `harshness?: unknown` on the local
  `GradeRunItemRequestBody` (`:66`); default-safe parse at `:140`
  (`body.harshness === "lenient" || body.harshness === "strict" ? body.harshness : "balanced"`);
  returned (`:97`, `:140`) and passed to `gradeEntries` options at `:196`.
- `src/app/components/grading/incrementalRunPlan.ts`: `GradeRunItemRequestBody` gained
  `readonly harshness?: GradeHarshness` beside `commentSplit?`; `buildRunItemRequests`
  does NOT set it.
- `src/app/components/grading-chat/useContinuousGradingRun.ts`: `harshnessRef`
  (`:141`), captured at `beginSession` (`:235`
  `harshnessRef.current = sessionParams.harshness ?? "balanced"`), conditional-spread
  onto the body (`:338`
  `...(harshnessRef.current !== "balanced" ? { harshness: harshnessRef.current } : {})`),
  reset to balanced (`:378`). `beginSession` param carries `harshness?` (`:90-92`).
- `src/app/components/grading-chat/GradingChatPanel.tsx`: `HARSHNESS_STORAGE_KEY =
  "ta-grading-chat-harshness"` (`:54`), `loadHarshness`/`persistHarshness` (`:56-72`),
  mount-effect restore (`:94-103`, NOT a useState initializer - hydration), state
  (`:85`), `selectHarshness` (`:105-108`), `SegmentedToggle` in the `ghActions` row
  (`:314-325`) `disabled={sessionReady}`, passed to `beginSession` via `ensureSession`
  (`:169`).
- Frozen oracles green today: `prompts-praise-routing.test.ts:222-252`
  (`AC3-2`/`AC3-3`/`AC3-3b`), `harshness-engine-default.wiring.test.ts` (Oracle E,
  engine-driven byte-identity), `prompts-harshness.test.ts` (directive purity),
  `route.test.ts:250-277` (route default-safe parse), `GradingChatPanel.structure.
  test.ts:572-604` (panel/driver wiring).

### The FOUR engine call sites (read at `engine.ts:359-371`) and the 8th-arg append

Every site ALREADY passes 7 explicit args (harshness in slot 7). The feedback-length
param is the **8th** and appends cleanly to ALL FOUR with NO intervening default fill -
because harshness already filled slot 7 everywhere. This is STRICTLY SIMPLER than the
harshness pass, whose `:360`/`:361` ternary branches once needed intervening fills.
There is NO dangerous-fill site here.

1. `engine.ts:360` (commentSplit=true branch):
   current `...criteria, "some", "separate-strengths", "all", harshness)`
   -> post `...criteria, "some", "separate-strengths", "all", harshness, feedbackWordTarget)`
2. `engine.ts:361` (default branch - today's default grading call):
   current `...criteria, "some", "in-overall-comment", "all", harshness)`
   -> post `...criteria, "some", "in-overall-comment", "all", harshness, feedbackWordTarget)`
3. `engine.ts:368` (initialAxisPrompt):
   current `...initialCriteria, axisMode, axisRouting, "initial-post-only", harshness)`
   -> post `...initialCriteria, axisMode, axisRouting, "initial-post-only", harshness, feedbackWordTarget)`
4. `engine.ts:370` (replyAxisPrompt):
   current `...replyCriteria, axisMode, axisRouting, "reply-only", harshness)`
   -> post `...replyCriteria, axisMode, axisRouting, "reply-only", harshness, feedbackWordTarget)`

### The OTHER callers of buildSystemPrompt (deliberately left byte-identical)

`grep -n buildSystemPrompt src` found callers that pass FEWER than 8 args and so keep
the new param at its default (undefined -> no directive -> byte-identical). They DO NOT
thread feedback-length (the owner scoped this to the grading-chat surface):
- `src/app/components/grading-recording/grading-feedback-prompt.ts:91` -
  `buildSystemPrompt("", rubricText, criteria)` (recording path).
- `src/app/components/snapshot-grading/snapshot-grade-prompt.ts:102-108` -
  5 args (`"every", "separate-strengths"`), then appends its own clauses; slots
  6/7/8 default. Snapshot stays byte-identical.
- `src/lib/grade/reply-axis-scoring.oracle.test.ts:148-155` - omits slots 7/8; its
  equality assertions still hold (both sides default). ADOPT / re-run.

These are `checked-safe` in the owns list (section 7).

---

## 2. Control shape decision (the twist) - RECOMMEND a numeric word-count field

The owner said "in terms of word count". That is a NUMBER, not a register label.

**RECOMMEND shape (a): a single numeric input - a target word count, EMPTY/unset =
today's prompt byte-identical.** Not discrete Brief/Standard/Detailed levels (b), not
a slider-with-presets (c).

Justification:
- The request names the unit ("word count"). A number IS the specification; a discrete
  level forces the owner to learn a hidden mapping ("what is Standard in words?").
- A slider/preset needs a component this repo lacks for a numeric range; a discrete
  toggle (`SegmentedToggle`) would map each level back to a number anyway, adding a
  layer of indirection over the thing the owner asked to type directly.
- `MEMORY: prefer-most-extensive-scope` + `minimize-clicks`: a number field is the
  fullest, most direct build and one interaction (type the number).
- The one real cost of a number field over a toggle is transient/invalid input (empty,
  0, non-integer, out of range). That is resolved by default-safe coercion (section 4),
  exactly as harshness resolves an invalid wire value to its default.

The control is a plain MUI `TextField` `type="number"` (the app already uses numeric
TextFields widely), NOT a new component and NOT `SegmentedToggle`. It renders in the
same setup row as the harshness toggle (`GradingChatPanel.tsx:313-331` `ghActions`),
`disabled={sessionReady}` (locked after the session starts, like harshness), with a
small inline "Clear" affordance consistent with the existing clears, and the chosen
value reflected in the post-lock `setupSummary` strip.

**Whatever the shape, the DEFAULT (empty/unset) MUST append NO directive**, so today's
prompt is byte-identical. This is the load-bearing constraint and it holds by
construction (section 4.2).

---

## 3. The value contract (NOT a string union - the key difference from harshness)

Harshness is a closed 3-member string union. Feedback length is a **bounded integer or
unset**. So:

- **Wire/options type:** `feedbackWordTarget?: number`. **Unset (`undefined`) = no
  directive = byte-identical.** A present value is an integer in `[MIN, MAX]`.
- **No new union type in `types.ts`.** Instead `types.ts` gains two value constants and
  one shared validator (mirroring `coerceGradeDetermination`, already in this file):
  ```ts
  export const FEEDBACK_WORD_TARGET_MIN = 20;
  export const FEEDBACK_WORD_TARGET_MAX = 500;
  /** Coerce an untrusted/persisted value to a valid word target, or undefined
   *  (unset) for anything out of range, non-integer, NaN, or absent. */
  export function coerceFeedbackWordTarget(value: unknown): number | undefined {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isInteger(n)) return undefined;
    if (n < FEEDBACK_WORD_TARGET_MIN || n > FEEDBACK_WORD_TARGET_MAX) return undefined;
    return n;
  }
  ```
  One home for the bounds; imported by BOTH the route (authoritative, untrusted input)
  and the panel (for its own ref). This is the direct analog of harshness's "invalid ->
  balanced" default-safe parse, except the safe default here is `undefined` (unset),
  which IS the byte-identical state.

Why one shared coerce (and not a bespoke check in the route): the bounds are a single
numeric floor/cap pair; duplicating them is exactly the drift failure `seats.md`'s AC
checker warns about ("every numeric floor or cap checked against every other"). One
exported pair, one validator.

---

## 4. The seam (the SHAPE every later wave is built against)

### 4.1 The pure directive function + wording (architect proposes; test-author freezes)

In `src/lib/grade/prompts.ts`, beside `harshnessDirectiveForLevel` (`:238`). It imports
`FEEDBACK_WORD_TARGET_MIN`/`MAX` from `./types` (prompts.ts already imports from `./types`
at `:1`) and is TOTAL and SELF-GUARDING so the frozen oracle can drive it directly:

```ts
export function feedbackLengthDirective(target: number | undefined): string {
  if (
    typeof target !== "number" ||
    !Number.isInteger(target) ||
    target < FEEDBACK_WORD_TARGET_MIN ||
    target > FEEDBACK_WORD_TARGET_MAX
  ) {
    return "";
  }
  return `Aim to keep the written feedback for this submission to approximately ${target} words in total across the feedback fields. Prioritize the most important points and keep the wording concise. Do not pad to reach the count, and do not drop a required deduction, rubric citation, or any other rule above just to stay under it.`;
}
```

PROPOSED exact wording (architect's proposal; the test-author owns the final frozen
literal and may refine it, keeping these invariants):
- Register-consistent with the base prompt and the harshness directives: plain
  instructor voice, a length BUDGET only.
- **Must NOT countermand the JSON shape or any structural rule.** The trailing "do not
  drop a required deduction, rubric citation, or any other rule above just to stay under
  it" is load-bearing: it keeps the length budget subordinate to the deduction/citation/
  filename/ratio rules, mirroring how the strict directive's "never invent a problem"
  keeps it honest. Without it, a tight word budget could be read as licence to drop a
  required deduction - a structural regression that no machine check here would catch.
- No em/en dashes (base prompt bans them, `prompts.ts:217`); no emoji; no hand-authored
  `\uXXXX` escapes (the Write/Edit tools materialize them literally - `MEMORY: write-tool-
  materializes-escapes`).
- Parameterized on `${target}`: the frozen oracle pins `feedbackLengthDirective(150)`
  to the exact literal with "150" substituted, and the out-of-range/unset cases to `""`.

### 4.2 Composition and ordering inside buildSystemPrompt (byte-identity-preserving)

`buildSystemPrompt` gains an **8th trailing param** `feedbackWordTarget?: number`
(optional, no default needed - `undefined` IS unset). Replace the current `:222-224`
return with an append-in-order composition:

```ts
const withAxis = axisScope === "all" ? basePrompt : `${basePrompt}\n\n${axisScopeDirective(axisScope)}`;
const parts: string[] = [withAxis];
const harshnessDirective = harshnessDirectiveForLevel(harshness);
if (harshnessDirective) parts.push(harshnessDirective);
const lengthDirective = feedbackLengthDirective(feedbackWordTarget);
if (lengthDirective) parts.push(lengthDirective);
return parts.join("\n\n");
```

**Ordering decision (twist #2): axis -> harshness -> length.** Harshness keeps its
existing position (appended first of the two optional directives); length appends after
it. This is the ONLY ordering that leaves every existing harshness test green without
edits, because those tests set length UNSET:
- `AC3-2` (`prompts-praise-routing.test.ts:223`): all-explicit + balanced + (8th omitted)
  -> both directives empty -> `.toBe(DEFAULT_NO_CRITERIA)`. Green.
- `AC3-3` (`:229`): strict + (8th omitted) -> `.toBe(DEFAULT_NO_CRITERIA + "\n\n" +
  STRICT_HARSHNESS)`. Green (length appends nothing).
- `AC3-3b` (`:238`): `out.endsWith("\n\n" + STRICT_HARSHNESS)` with length unset. Green.
- Oracle E (`harshness-engine-default.wiring.test.ts`): default/commentSplit/two-axis
  with options not carrying feedbackWordTarget -> byte-identical. Green.

The harshness-vs-length order is only machine-observable when BOTH are set, which only a
NEW test exercises (section 5). Independence is proven by that test, not assumed.

### 4.3 Independence from harshness (twist #4 - confirmed)

Both are optional trailing directives composed into the same prompt. Both are captured
independently at `beginSession`, threaded independently through `GradingRunOptions`, the
route, and the wire body, and appended independently in `buildSystemPrompt`. The
byte-identity default holds iff BOTH are unset (harshness "balanced"/absent AND
feedbackWordTarget undefined/absent) - which is exactly today's state for every existing
caller. A new test (section 5, `AC-L-3c`) pins that BOTH set -> both directives present,
in order.

### 4.4 Engine threading (twist #4: 8th positional param vs options-object refactor)

**RECOMMEND the 8th trailing positional param**, mirroring harshness's 7th, for the same
reasons: it keeps the blast radius to the four call sites + the append site, leaves
every other caller byte-identical, and the options-object refactor would touch every
`buildSystemPrompt` caller (6 production + ~5 test files) plus the three frozen-oracle
test files - out of proportion to this feature, and ALREADY recorded as a residual
(`grading-chat-controls-scope.md` R6/O1).

BUT the smell is now REAL and compounding: 8 positional params, the SECOND consecutive
feature to append one. I sharpen the residual (R-LEN-6) into a DEBT with a trigger:
**the NEXT feature that needs to change `buildSystemPrompt`'s signature owes the
options-object refactor BEFORE its own param.** This is the guard-before-migration /
assignment-must-include-wiring-file shape of debt (`MEMORY`): a clause rather than a
vague "someday". It is not this feature's job (doing it here triples the blast radius
behind a byte-identical default that the frozen oracles already pin), but it must stop
growing silently.

Engine edits: `GradingRunOptions` gains `readonly feedbackWordTarget?: number;` beside
`harshness?` (`engine.ts:291`); destructure at `:346` becomes
`const { deadlineMs, commentSplit, harshness, feedbackWordTarget } = options;`; append
the 8th arg at all four call sites (section 1). `gradeEntries` (`:601-610`) forwards
`options` unchanged - no signature change there.

### 4.5 Route threading (default-safe, untrusted input)

`src/app/api/grade-run-item/route.ts`:
- Add `feedbackWordTarget?: unknown;` to `GradeRunItemRequestBody` (`:58-67`).
- `parseRequestBody` return type gains `feedbackWordTarget: number | undefined;`
  (NOT a non-optional default like harshness - undefined is the meaningful unset).
- In the return object (`:129-141`), add
  `feedbackWordTarget: coerceFeedbackWordTarget(body.feedbackWordTarget),`.
  Default-safe by construction: absent/invalid/out-of-range -> `undefined` -> no
  directive -> byte-identical. This is defense-in-depth re-coercion of the client value
  (never trust the wire), mirroring harshness's independent route-side validation.
- Destructure at `:181`, pass to `gradeEntries` options at `:196`:
  `{ commentSplit, harshness, feedbackWordTarget }`. Passing `feedbackWordTarget:
  undefined` is byte-identical to omitting it (the engine destructures to `undefined`
  either way and the directive returns `""`).

### 4.6 Wire type (incrementalRunPlan)

`GradeRunItemRequestBody` in `incrementalRunPlan.ts:58-66` gains
`readonly feedbackWordTarget?: number;` beside `harshness?`. `buildRunItemRequests`
(`:150-158`) does NOT set it - exactly as it already omits `commentSplit`/`harshness`.
This is a type-only field addition (no runtime); its first SETTER is the driver in the
control wave (section 6), so no caller-in-wave is owed in the seam wave - call it out as
a type-only change at the seam gate or the gate reads it as an escape.

---

## 5. Byte-identity default + the oracle plan (mirror harshness)

The default (unset) is byte-identical to today at every layer. Instruments, all
machine-checkable here:

- **Directive purity (new `AC-L-1`).** New file `src/lib/grade/prompts-feedback-length.
  test.ts` (or a new describe in `prompts.test.ts`), mirroring `prompts-harshness.test.ts`.
  Frozen table, the directive literal DUPLICATED (never imported from `prompts.ts` - that
  is a self-comparison tautology):
  - `feedbackLengthDirective(150)` -> the exact frozen literal with "150" (and the
    symmetric case for another in-range value, e.g. 50).
  - `feedbackLengthDirective(undefined)` -> `""`.
  - `feedbackLengthDirective(0)` -> `""` (below MIN).
  - `feedbackLengthDirective(19)` -> `""` (MIN-1), `feedbackLengthDirective(20)` ->
    non-empty (MIN boundary), `feedbackLengthDirective(500)` -> non-empty (MAX),
    `feedbackLengthDirective(501)` -> `""` (MAX+1).
  - `feedbackLengthDirective(150.5)` -> `""` (non-integer), `feedbackLengthDirective(NaN)`
    -> `""`.
  - control: the in-range directive is non-empty and contains the number it was given.
- **buildSystemPrompt byte-identity + composition (new `AC-L-2`/`AC-L-3`), EXTEND
  `prompts-praise-routing.test.ts`** (duplicate the directive literal; do not import):
  - `AC-L-2` (8th-arg default identity): `buildSystemPrompt("Instructions.","Rubric.",[],
    "some","in-overall-comment","all","balanced", undefined).toBe(DEFAULT_NO_CRITERIA)`.
    Fails on a single byte of drift when the 8th slot is explicit-undefined.
  - `AC-L-3` (a target composes and appends LAST): the "all" axis case asserts
    `.toBe(DEFAULT_NO_CRITERIA + "\n\n" + FEEDBACK_150_LITERAL)`.
  - `AC-L-3b` (ordering: harshness BEFORE length when both set):
    `buildSystemPrompt(...,"all","strict", 150)` ->
    `.toBe(DEFAULT_NO_CRITERIA + "\n\n" + STRICT_HARSHNESS + "\n\n" + FEEDBACK_150_LITERAL)`.
    Pins both the separator and the harshness-then-length order (the independence proof,
    section 4.3).
  - `AC-L-3c` (axis + harshness + length all stack, order axis->harshness->length) with
    `axisScope="initial-post-only"`: `endsWith("\n\n" + FEEDBACK_150_LITERAL)` AND
    `indexOf(AXIS_SNIPPET) < indexOf(STRICT_HARSHNESS) < indexOf(FEEDBACK_150_LITERAL)`.
- **Engine default-path byte-identity (`AC-L-4`), EXTEND `harshness-engine-default.
  wiring.test.ts`** (Oracle E - the blocker-closer pattern; drives the REAL `gradeEntries`,
  mocks `callLlm`, reads the composed prompt off the captured request):
  - The existing E1/E2/E3 cases STAY GREEN unchanged (options never carry
    `feedbackWordTarget` -> byte-identical). Re-run.
  - Add `E-LEN`: drive `gradeEntries([entry()], "Instructions.", "Rubric.", "gemini",
    null, { feedbackWordTarget: 150 })` and assert the captured prompt
    `startsWith(FROZEN_DEFAULT + "\n\n" + FEEDBACK_150_LITERAL)` is FALSE and
    `.includes(FEEDBACK_150_LITERAL)` is true AND ends with
    `FEEDBACK_150_LITERAL + SEP + ...` - i.e. the directive is appended at the engine's
    real composed call, not just at the function level. (The test-author pins the exact
    anchor; the point is the engine threads the 8th arg, mirroring why Oracle E exists.)
- **Route default-safe parse (`AC-L-5`), EXTEND `route.test.ts`** mirroring `:250-277`:
  `feedbackWordTargetReachedEngine(extra)` reads `mockGradeEntries.mock.calls[0][5]
  .feedbackWordTarget`:
  - valid passes through: `{ feedbackWordTarget: 150 }` -> `150`; `{ feedbackWordTarget:
    "150" }` -> `150` (string from JSON tolerated via the coerce).
  - absent -> `undefined`.
  - invalid -> `undefined`: `{ feedbackWordTarget: 5 }` (below MIN), `{ 600 }` (above
    MAX), `{ "big" }`, `{ 150.5 }`, `{ null }`. This is the DISCRIMINATING default-safety
    case (a naive `body.feedbackWordTarget as number` pass-through would let `5`/`600`/
    `"big"` through).
  - The existing `VALID_BODY` (no feedbackWordTarget) still parses. Adopt + re-run.
- **incrementalRunPlan unset preservation (`AC-L-6`), EXTEND `incrementalRunPlan.test.ts`**:
  `:112`'s full-object `toEqual` on `requests[0]` stays green; ADD
  `expect("feedbackWordTarget" in requests[0]).toBe(false)` - because `toEqual` ignores
  an `undefined`-valued key, so this is the instrument that catches an accidental
  `feedbackWordTarget: plan.feedbackWordTarget` (undefined at runtime).

Satisfiability: as with harshness, no isolated reference tree is needed - every red
oracle's expected value is either a literal CAPTURED from the HEAD engine/function
(the byte-identity cases, green today) or a literal this seat AUTHORS (the directive
string), which the trivial `feedbackLengthDirective` body returns verbatim. Applying
the five edits (8th param + `feedbackLengthDirective` + the four threading edits) makes
the new oracles green and leaves the existing suite green.

---

## 6. Persistence + the storage canary (twist #5)

- One NEW `ta-` key: **`ta-grading-chat-feedback-length`**, stored as the raw string the
  owner typed (so a transient "1" does not jank into NaN). Loaded via a mount effect
  (NOT a useState initializer - `MEMORY: persisted-details-open-hydration`), coerced to
  `number | undefined` only at the `beginSession` seam.
- **This key MUST be added to `grading-chat-storage-keys.structure.test.ts`'s frozen
  `EXPECTED` set (`:13-19`, currently 5 keys) in the SAME commit** that writes the key
  literal. That canary scans RAW source (comments included) of every non-test file in
  the directory and reddens repo-wide until the set matches (`:40-64`). Corollary: NO
  file in the seam wave may write the literal `ta-grading-chat-feedback-length` in code
  OR a comment before the control wave lands (the seam wave touches no grading-chat
  directory file anyway, so this is naturally satisfied). Refer to the key by
  description only until the control wave.
- Panel state: a raw string `feedbackLengthText` (persisted/restored), plus
  `loadFeedbackLength()`/`persistFeedbackLength()` mirroring `loadHarshness`/
  `persistHarshness`. `selectFeedbackLength(next)` sets state + persists.
- Driver: a `feedbackWordTargetRef` captured at `beginSession`
  (`feedbackWordTargetRef.current = sessionParams.feedbackWordTarget`), reset in
  `reset()`, conditional-spread onto the body:
  `...(feedbackWordTargetRef.current !== undefined ? { feedbackWordTarget:
  feedbackWordTargetRef.current } : {})`. `beginSession`'s param gains
  `feedbackWordTarget?: number`. The panel passes
  `coerceFeedbackWordTarget(feedbackLengthText)` into `ensureSession` ->
  `beginSession` (`GradingChatPanel.tsx:169`).

---

## 7. Machine-checkable vs owner-walk; the leverage reading

### Machine-checkable (this environment)
The pure directive fn oracle (`AC-L-1`), the buildSystemPrompt byte-identity +
composition (`AC-L-2/3/3b/3c`), the engine default-path byte-identity (`AC-L-4`,
Oracle E), the route default-safe parse (`AC-L-5`), the incrementalRunPlan unset pin
(`AC-L-6`), and the control's persistence + capture-at-beginSession + conditional-spread
wiring (source-text in `GradingChatPanel.structure.test.ts`, mirroring `:572-604`).

### Owner walk (no instrument here)
- **R-LEN-1:** whether the live model actually honours the word count. No
  `GEMINI_API_KEY`; LLM paths mock-only. Step: grade one submission at a few targets and
  read the feedback length. This is a REGISTER NUDGE composed correctly, never a
  guarantee - the directive is "approximately N", and whether a model obeys an
  approximate budget is unobservable here (the same `R1` limit harshness carries).
- **R-LEN-2:** rendered number field look/placement/lock, and the validation hint for an
  out-of-range entry. No component renders.

### Leverage reading (for AC/owner; not claimed here)
This changes a capability a user reaches, so a claim is owed (`DEV_LOOP.md`, Criteria).
Honest reading: a bare directive-injection is the thin `AskAiModal`/formality-toggle
shape (click-cost, not categorical). BUT in the grading-chat it rides the SHIPPED
**SCALE** mechanism (`leverage.md:41`): captured once at `beginSession` and applied to
every student in the batch, holding feedback LENGTH constant across N submissions - which
a chat cannot do (it re-specifies length per paste and drifts). This COMPOUNDS with the
same SCALE class harshness claims; it is not a new taxonomy row. The removal test is
driver-level and buildable here (section 5's `AC-L-7`, below). F-LEN-c: leverage disposal
is the owner's - (a) accept-cost-explicitly (the advantage is SCALE consistency of
feedback length), (b) redesign, (c) reject. RECOMMEND (a). The AC seat finalises; the
architect only records the reading.

- **`AC-L-7` SCALE removal test (leverage), EXTEND `useContinuousGradingRun.lifecycle.
  test.ts`** mirroring the commentSplit body test (`:548-566`): drive
  `beginSession({ ..., feedbackWordTarget: 150 })`, then TWO `submit`s, assert
  `dispatchItemMock.mock.calls[0][0].feedbackWordTarget === 150` AND
  `...calls[1][0].feedbackWordTarget === 150` (both bodies in one session carry the SAME
  captured target), and a default session (no target) dispatches `feedbackWordTarget ===
  undefined`. It goes RED if the capture/freeze is removed so the value is re-read per
  submit from a source that can diverge.

**FINDING (soundness, section 9): the harshness AC3-6 SCALE removal test was NEVER
IMPLEMENTED at the driver level** - `grep harshness src/app/components/grading-chat/
useContinuousGradingRun.lifecycle.test.ts` returns nothing; harshness's SCALE claim
shipped as a SOURCE-TEXT conditional-spread pin only (`GradingChatPanel.structure.test.
ts:598-603`). This feedback-length scope CLOSES that gap for its own claim by actually
driving two submits (`AC-L-7`). This is strictly stronger than the harshness precedent.

---

## 8. Wave plan

One feature, two waves - the clean mirror of harshness's W1 (seam) + W3 (control+driver);
harshness's W2 was the unrelated clear/copy/loading panel items, which do not exist here.

### Wave 1 - SEAM (no UI; byte-identical at every layer)
Write set (each export's caller is in THIS wave except the type-only field, flagged):
- `src/lib/grade/types.ts` - `FEEDBACK_WORD_TARGET_MIN`/`MAX` + `coerceFeedbackWordTarget`
  (runtime; called by `prompts.ts`'s directive and `route.ts` in this wave).
- `src/lib/grade/prompts.ts` - 8th param `feedbackWordTarget?` + `feedbackLengthDirective`
  + the composition rewrite (the directive is CALLED by `buildSystemPrompt` in this wave).
- `src/lib/grade/engine.ts` - `GradingRunOptions.feedbackWordTarget?` + destructure +
  the 8th arg at the FOUR `buildSystemPrompt` sites (the caller of the new param).
- `src/app/api/grade-run-item/route.ts` - parse (`coerceFeedbackWordTarget`) + pass to
  `gradeEntries` options (the caller on the wire path).
- `src/app/components/grading/incrementalRunPlan.ts` - `feedbackWordTarget?: number` on
  the wire `GradeRunItemRequestBody` (TYPE-ONLY field; no runtime; first setter is the
  driver in Wave 2 - flag as type-only at the gate).
- Tests: EXTEND `prompts-praise-routing.test.ts` (`AC-L-2/3/3b/3c`), EXTEND
  `harshness-engine-default.wiring.test.ts` (`AC-L-4`), EXTEND `route.test.ts` (`AC-L-5`),
  EXTEND `incrementalRunPlan.test.ts` (`AC-L-6`), NEW `prompts-feedback-length.test.ts`
  (`AC-L-1`). ADOPT/re-run: `prompts.test.ts`, `reply-axis-scoring.oracle.test.ts`,
  `snapshot-grade-prompt.test.ts`, `grading-feedback-prompt`'s tests.

After Wave 1 the wire is absent from every client -> byte-identical.

### Wave 2 - CONTROL + driver (serial: AFTER Wave 1)
Needs Wave 1's wire field. Write set:
- `src/app/components/grading-chat/useContinuousGradingRun.ts` - `feedbackWordTarget`
  param on `beginSession`, `feedbackWordTargetRef`, reset, conditional spread on the body.
- `src/app/components/grading-chat/GradingChatPanel.tsx` - `feedbackLengthText` state +
  `ta-grading-chat-feedback-length` load/persist + mount-effect restore + the number
  `TextField` (lock after session, Clear affordance, setupSummary reflection) + pass the
  coerced target to `ensureSession`/`beginSession`.
- `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts` - ADD
  `ta-grading-chat-feedback-length` to `EXPECTED` (`:13-19`) - SAME commit.
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` - ADOPT: add the
  control + lock + persistence + capture + conditional-spread assertions (mirror
  `:572-604`).
- `src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts` - ADOPT:
  the `AC-L-7` SCALE body test.

`ChatComposer.tsx` is NOT touched (the control lives in the panel setup row, like the
harshness toggle, not the composer).

### Serialization note (as the brief directs; one point NOT confirmed against the queue)
- Wave 1 touches `prompts.ts`/`engine.ts`/`route.ts`/`incrementalRunPlan.ts` - the SAME
  seam files the shipped harshness used. Harshness has LANDED (`f87b5415`/`9f5d3910`), so
  there is no conflict with it; but any OTHER in-flight item editing those four files
  serializes against Wave 1.
- Wave 2 touches `GradingChatPanel.tsx` + `useContinuousGradingRun.ts` - the SAME panel
  and driver the brief names as the in-flight REGRADE-AFTER-BATCH work. **I could NOT
  confirm a backlog row by that name** (`grep -i regrade docs/BACKLOG.md` hit only
  "re-run"/"re-runnable" prose on A12/A13-class rows, not a distinct regrade row). The
  orchestrator MUST check the live queue before dispatching Wave 2 concurrently with any
  panel/driver work: if any item is editing `GradingChatPanel.tsx` or
  `useContinuousGradingRun.ts`, Wave 2 serializes behind it (these files are shared; one
  over-reaching agent reverts the other - `MEMORY: no-git-stash-under-concurrency`,
  `wave-gate-git-status`). Wave 1 (seam) is disjoint from the panel/driver and may run
  concurrently with non-seam work.

### Gate (every wave)
```
npm run test:paths <p1> <p2> ...   # one path per arg, never a raw multi-path vitest
```
Per-wave `test:paths` membership:
- **Wave 1:** `src/lib/grade/prompts.test.ts src/lib/grade/prompts-praise-routing.test.ts
  src/lib/grade/prompts-feedback-length.test.ts src/lib/grade/harshness-engine-default.wiring.test.ts
  src/lib/grade/reply-axis-scoring.oracle.test.ts src/app/api/grade-run-item/route.test.ts
  src/app/components/grading/incrementalRunPlan.test.ts
  src/app/components/snapshot-grading/snapshot-grade-prompt.test.ts`
- **Wave 2:** `src/app/components/grading-chat/GradingChatPanel.structure.test.ts
  src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts
  src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts`

Plus, UNCONDITIONALLY each wave: `npx vitest run src/file-size-ceiling.structure.test.ts`,
`npx tsc --noEmit` (single caller - no concurrent tsc), `npm run lint` (exit 0, no NEW
warning in files this wave writes), and `git status --short` vs the wave assignment
(stale-worktree hazard). Re-measure `prompts.ts`/`engine.ts`/`types.ts` (Wave 1) and
`GradingChatPanel.tsx`/`useContinuousGradingRun.ts` (Wave 2) with `@(Get-Content <f>).Count`
at the gate. Name any comment-stripping helper `withoutLineComments`, never `stripComments`
(`strip-comments-agreement.structure.test.ts`).

### The `owns` list (tests that READ an edited file as source text)
Command:
```
Get-ChildItem -Recurse -Include *.test.ts src | Select-String -Pattern
"buildSystemPrompt|grade/prompts|grade/engine|grade/types|grade-run-item|incrementalRunPlan|GradingChatPanel|useContinuousGradingRun|grading-chat-storage-keys" -List
```
Output (2026-10-08), classified:
```
src/lib/grade/prompts.test.ts                             ADOPT (Wave 1 - re-run; all calls <8 args, default byte-identical)
src/lib/grade/prompts-praise-routing.test.ts              ADOPT (Wave 1 - frozen oracle; AC-L-2/3/3b/3c)
src/lib/grade/prompts-feedback-length.test.ts             NEW (Wave 1 - AC-L-1 directive purity)
src/lib/grade/prompts-harshness.test.ts                   checked-safe (harshness directive unchanged)
src/lib/grade/harshness-engine-default.wiring.test.ts     ADOPT (Wave 1 - Oracle E; AC-L-4 + existing E1/E2/E3 re-run green)
src/lib/grade/reply-axis-scoring.oracle.test.ts           ADOPT (Wave 1 - re-run; slot-7/8 omitted on both sides, equality holds)
src/lib/grade/engine.test.ts                              checked-safe (default path unchanged; re-run in the verifier's full suite)
src/app/api/grade-run-item/route.test.ts                  ADOPT (Wave 1 - AC-L-5; VALID_BODY still parses)
src/app/components/grading/incrementalRunPlan.test.ts     ADOPT (Wave 1 - AC-L-6; :112 toEqual stays green)
src/app/components/snapshot-grading/snapshot-grade-prompt.test.ts  ADOPT (Wave 1 - re-run; 5-arg call, slots 6/7/8 default)
src/app/components/grading-recording/* (grading-feedback-prompt tests)  checked-safe (3-arg call; default branch unchanged)
src/app/components/grading-chat/GradingChatPanel.structure.test.ts  ADOPT (Wave 2 - control + wire assertions)
src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts  ADOPT (Wave 2 - EXPECTED bump, same commit)
src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts  ADOPT (Wave 2 - AC-L-7 SCALE body test)
src/app/components/grading-chat/latestGradedResult.test.ts  checked-safe (selector; not edited)
src/lib/module-graph/runtime-import-graph.test.ts         checked-safe (no new cross-boundary import; coerce is a client-safe value in types.ts, imported by prompts.ts which already imports types.ts, and by route.ts)
```
The verifier re-runs the full suite once per wave to confirm the checked-safe set.

### Orphan-class / canary notes
- No new CSS class is strictly required (the number field is a plain MUI `TextField` in
  the existing `ghActions` row); if Wave 2 adds any class to `grading-chat.module.css`,
  it MUST be referenced in the same commit (the page-module orphan ratchet pins
  `page.module.css`, not this module, but an unreferenced class is still debt). State
  which in the build brief.
- `grading-chat-storage-keys.structure.test.ts` EXPECTED set: bumped ONLY in Wave 2, in
  the same commit that adds the key literal.

---

## 9. Soundness findings (flagged, not silently adopted)

1. **The 8th positional param is a real, compounding smell.** This is the SECOND feature
   to append a trailing positional to `buildSystemPrompt` (harshness was the 7th). The
   options-object refactor stays deferred (R-LEN-6) because doing it here triples the
   blast radius behind a byte-identical default the frozen oracles already pin - but the
   debt now carries a TRIGGER: the next feature changing this signature owes the refactor
   first. Recommended, with the debt sharpened (section 4.4).
2. **The harshness AC3-6 SCALE removal test was never implemented at the driver level**
   (section 7). Harshness's SCALE claim shipped as a source-text pin only. This scope
   closes that for feedback-length (`AC-L-7` drives two submits). Flagged so the AC/test
   seats do not inherit the weaker precedent.
3. **The length directive could, if worded carelessly, countermand a structural rule**
   (drop a required deduction to stay under the budget). The proposed wording's trailing
   clause ("do not drop a required deduction, rubric citation, or any other rule above")
   is load-bearing to keep the budget subordinate. No machine check here can observe the
   model obeying this (R-LEN-1), so the wording is the only guard - the test-author must
   keep that clause when freezing the literal.
4. **"approximately N words" is a register nudge, not a guarantee** - inherent to the
   byte-identity-default constraint (the base prompt cannot be edited to carry a length
   budget without breaking the unset-is-byte-identical requirement, so appending is the
   only option). The oracles measure that it is COMPOSED correctly, never that it WORKS.
   Recorded as R-LEN-1.
5. **Out-of-range coerces to UNSET, not clamp, not error** (section 4). Recommended because
   unset = byte-identical = the safe default; clamping silently rewrites the owner's intent,
   erroring fights minimise-clicks. A panel hint covers the owner-facing case. Clamp is a
   fork (F-LEN-b) the owner may overrule.

---

## 10. Forks (recommended)

- **F-LEN-a - numeric field vs discrete levels vs slider. RECOMMEND numeric field**
  (section 2). Cost of wrong: a later wave swaps the control; the seam (directive fn +
  number wire) is unchanged either way, so the blast radius of being wrong is one `.tsx`.
- **F-LEN-b - out-of-range coerces to unset vs clamps to the nearest bound. RECOMMEND
  unset** (section 8/9.5). Cost of wrong: one line in `coerceFeedbackWordTarget` + the
  oracle rows.
- **F-LEN-c - leverage disposal: accept-cost (SCALE consistency of length) vs redesign vs
  reject. RECOMMEND accept-cost** (section 7). The AC seat records the chosen disposal;
  the architect only reads it.
- **F-LEN-d - 8th positional param vs options-object refactor. RECOMMEND the 8th param**,
  with the refactor debt triggered on the next signature change (section 4.4/9.1).
- **F-LEN-e - bounds MIN=20 / MAX=500. RECOMMEND 20/500** (20 is the floor below which a
  length budget fights the deduction+citation+ratio rules into incoherence; 500 is already
  a long per-submission feedback). Owner may retune; it is two constants in `types.ts` and
  the boundary oracle rows.

---

## 11. Residual register (owner + instrument + step; MUST be filed in docs/BACKLOG.md)
A residual not in `docs/BACKLOG.md` does not exist (`DEV_LOOP.md:200-215`); the
orchestrator files these at disposal (a seat cannot edit the backlog).

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-LEN-1 | Does the live model actually honour the approximate word count? | Owner | None here (no `GEMINI_API_KEY`; LLM paths mock-only) | Owner walk: grade one submission at a few targets, read the feedback length |
| R-LEN-2 | Rendered number field look/placement/lock + the out-of-range validation hint | Owner | None (no component renders) | Owner/browser walk |
| R-LEN-5 | Leverage disposal (F-LEN-c): accept-cost (SCALE consistency of length) vs redesign vs reject | Owner | Verify re-judges vs the as-built diff; `AC-L-7` pins the SCALE removal test | AC seat records the chosen disposal |
| R-LEN-6 | `buildSystemPrompt` now takes 8 positional params; the options-object refactor is DUE on the next signature change | Owner/next-toucher | `@(Get-Content src/lib/grade/prompts.ts).Count`; the param list | The next feature changing the signature does the refactor FIRST |
| R-LEN-7 | Harshness AC3-6 SCALE removal test is absent at the driver level (shipped as source-text pin only) | Owner/next-grading-chat-toucher | `grep harshness useContinuousGradingRun.lifecycle.test.ts` (empty today) | Add a two-submit body test for harshness, mirroring `AC-L-7` |
| R-LEN-8 | Numeric slider / presets deferred (F-LEN-a) - the number field is the shipped shape | Owner | Would be source-text + owner walk | Owner scopes separately if the plain field proves insufficient |

---

## 12. Disposition
First version of `docs/feedback-length-control-scope.md` (untracked). No prior
requirements to map; no renumbering. All `AC-L-*` / `R-LEN-*` ids are new.
