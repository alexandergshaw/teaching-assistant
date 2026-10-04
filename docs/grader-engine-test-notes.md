# Test notes + frozen oracles: grader ENGINE wave (G5 bad-output guard + G8/F1=B comment split)

Authoring seat: loop-test-author (Opus). These are NOTES, not test code. A `loop-implementer` writes the tests from them; a fresh `loop-checker` reads them first. Nothing here renders a component; every instrument is a node-env vitest drive of the production path with `callLlm` mocked. Tests are network-blocked (`vitest.setup.ts` throws on real fetch) - we mock `callLlm`, never `fetch`.

## 0. Grounded facts (opened, not recalled - checker can re-verify fast)

- `gradeSubmission` is MODULE-PRIVATE (not exported). The only exported engine doors are `gradeSubmissions`, `gradeEntries`, `gradeCanvasUrl` (`src/lib/grade/engine.ts:365,430,446`). **Every oracle drives `gradeEntries`** - the door `engine.test.ts`/`engine.ungraded.test.ts` already mock - never imports `gradeSubmission`. This is the "drive the production path" practice and it is forced here anyway.
- The graded/ungraded discriminant is `result.ungraded === undefined` (graded) vs an `UngradedOutcome` (`types.ts:200-210,277-295`). There is NO `kind` field on the row itself; `kind` lives on `row.ungraded.kind` ("grading-failed" | "not-attempted"). So "row is not graded" is asserted as `row.ungraded?.kind === "grading-failed"`.
- `gradeSubmission` returns `GradedResult` and THROWS on `!result.ok` (`engine.ts:93-96`). `gradeStudentEntries` catches and builds a `grading-failed` `UngradedResult` via `buildUngradedRow`, whose `strengths` and `message` carry `GRADING_FAILURE_PREFIX` (`engine.ts:260-282`, `types.ts:11`). **The G5 guard's cheapest sound shape reuses this seam: `gradeSubmission` throws on bad output, the existing catch turns it into a grading-failed row.** (The implementer MAY instead return an `UngradedResult` from `gradeSubmission`; the behavioral oracles below don't care which, because they assert on `run.results[0]`.)
- `finishReason?: string` sits on `LlmResult`'s `ok: true` branch (`llm.ts:201`), populated from the Gemini candidate's own value (`parseFinishReason`, `llm.ts:310-334`, used at `:582,589`). Truncation value is the literal `"MAX_TOKENS"`; normal completion is `"STOP"`; the field is often ABSENT on today's successful calls. Confirmed by live precedent: `llm.ts:525-526` comment ("empty response with finishReason MAX_TOKENS"), and recording-path tests already assert on `finishReason: "MAX_TOKENS"` (`grading-submission-grade.test.ts:283`, `module-content-extract.test.ts:178`).
- `parseRubricResponse` NEVER throws and NEVER signals failure (`parsing.ts:49-128`): on no-JSON or `JSON.parse` throw it falls back to `overallComment = raw.trim()`, a single `{area:"Overall", score:"", comment: raw}`, `improvements: ""`, `totalScore: ""`. It is SHARED by the recording path (`grading-feedback-prompt.ts`). **The guard must NOT change it.**
- The separate-strengths PROMPT mode ALREADY EXISTS and is fully tested (`prompts.ts:86` param, pinned by `prompts-praise-routing.test.ts:76-212`). In that mode the model emits THREE contents: `strengths` (praise), `overallComment` (deductions), `improvements` (advice). **So the G8 work adds NO new prompt text** - it threads an option so the engine (a) passes `praiseRouting:"separate-strengths"` to `buildSystemPrompt` (`engine.ts:209`) and (b) re-routes the parsed fields.
- The shared display has exactly THREE boxes reading exactly three `GradeResult` fields (`gradingResultsHelpers.ts:255-278`): `strengths`->"What Went Well", `improvements`->"What Could Be Better", `resubmitNotice`->"Resubmission Note" (fixed wording). `overallComment` is the composed CSV/Canvas text, not a box. `gradingResultsHelpers.ts` is OFF-LIMITS and NOT in this write set.
- Line counts (`@(Get-Content).Count`): `engine.ts` 487, `prompts.ts` 415, `parsing.ts` 301, `engine.test.ts` 361, `engine.ungraded.test.ts` 432, `prompts-praise-routing.test.ts` 212, `route.ts` 206. The guard (~15-20 lines) + split routing (~10) + a `GradingRunOptions` field (~3) land `engine.ts` near ~520 - well under the 1000 ceiling. RE-MEASURE at the wave gate.

## 1. THE F1=B MAPPING - a contradiction I found, the reading I applied, and the fork

FF-10 (in the scope) says the split must put "praise only" in did-right, "deductions" in did-wrong, AND "advice is not mixed into either." **That is unbuildable under the stated constraints, and I proved it by reading the tree:** separate-strengths mode produces THREE contents (praise, deductions, advice), there are only TWO free prose fields (`strengths`, `improvements`; `resubmitNotice` is reserved), F1=B forbids a `GradeResult` type change, and `gradingResultsHelpers.ts` (the only place a 4th box could be added) is off-limits. Three contents cannot land in two boxes with none mixed.

**Reading applied (R1), which the scope's own F1=B wording already endorses ("deductions folded into 'What Could Be Better'"):**
- `strengths` field (What Went Well) = **praise only** = `parsed.strengths`  ->  "did right"
- `improvements` field (What Could Be Better) = **deductions + advice** = compose(`parsed.overallComment`, `parsed.improvements`)  ->  "did wrong" (with how-to-fix alongside)

This drops nothing, needs no type change, and satisfies the owner's literal two-bucket request ("did right / did wrong"). I DROP FF-10's "advice is not mixed into either" clause and record it as a fork. I do NOT assert it.

**FORK for the owner/architect (ride-alongside, do not gate; W1-W4 and the G5 guard are independent of it):** should advice get its OWN box, separate from deductions? (A, recommended) No - advice stays with deductions in "What Could Be Better"; zero extra cost; ships now as R1. (B) Yes - a later SCOPED item adds a fourth prose field + a `gradingResultsHelpers.ts` box; that is a shared-type change outside this write set and outside F1=B. My oracles below assert R1; if the owner picks B later it is additive and does not invalidate them.

## 2. Write set (this ENGINE wave only - DISJOINT from sibling W1 driver state)

Production: `src/lib/grade/engine.ts` (G5 guard in `gradeSubmission`; split routing + `GradingRunOptions` field), `src/lib/grade/parsing.ts` (ADDITIVE only - expose `parsed.strengths`; see 5.3), `src/app/api/grade-run-item/route.ts` (thread the split option through the body). Tests: `engine.ungraded.test.ts` (G5), `engine.test.ts` (G8 routing + regression), `prompts-praise-routing.test.ts` (already covers the prompt mode - do not duplicate), NEW `src/lib/grade/parsing.fallback.test.ts` (parser-unchanged frozen oracle). **Do NOT touch `grading-chat/**` or `gradingResultsHelpers.ts`.** The driver passing the option is the sibling's W1/W2.

Run the set with the wrapper (never a raw multi-path vitest):
`npm run test:paths -- src/lib/grade/engine.ungraded.test.ts src/lib/grade/engine.test.ts src/lib/grade/prompts-praise-routing.test.ts src/lib/grade/parsing.fallback.test.ts`

## 3. The option seam (architect/implementer finalize the NAME; tests bind to the final name)

Add one trailing optional field to `GradingRunOptions` (`engine.ts:138-145`), recommended `commentSplit?: boolean`. Threaded route body -> `gradeEntries(..., options)` -> engine. When true: `buildSystemPrompt(instructions, rubric, criteria, "some", "separate-strengths")` AND the R1 routing. When unset/false: byte-identical to today. (Forged/absent only makes output less split - no auth consequence, same reasoning as `deadlineMs`.)

## 4. G5 - bad model output never becomes a graded row (FF-6). Home: `engine.ungraded.test.ts`

Frozen fixtures (literals, no recomputation). Put a distinctive sentinel in each so "raw text leaked into a box" is directly testable:
- `VALID_JSON = JSON.stringify({ overallComment: "RAW_SENTINEL_OK", rubricResults:[{area:"Overall",score:"8/10"}], totalScore:"8/10" })`
- `PROSE_NO_JSON = "PROSE_SENTINEL the work looks good overall"` (no braces at all)

Import `GRADING_FAILURE_PREFIX` from `./types` (a frozen literal oracle - do not re-type the string). Reuse the file's existing `entry()`/mock setup (do NOT import helpers from another `*.test.ts`).

| # | Object under test | Instrument | Direction (RED when) |
|---|---|---|---|
| G5a | `run.results[0]` after `gradeEntries([entry()], instr, rubric, "gemini")` with `callLlm` -> `{ ok:true, finishReason:"MAX_TOKENS", text: VALID_JSON }` | drive `gradeEntries`; assert `row.ungraded?.kind === "grading-failed"`, `row.ungraded.message.startsWith(GRADING_FAILURE_PREFIX)`, and `row.strengths`+`row.improvements`+`row.overallComment`+`row.feedback` do NOT include `"RAW_SENTINEL_OK"` | RED if the row is graded (`ungraded === undefined`) or any box contains the raw text |
| G5b | same, `callLlm` -> `{ ok:true, finishReason:"STOP", text: PROSE_NO_JSON }` | assert `row.ungraded?.kind === "grading-failed"` and no box contains `"PROSE_SENTINEL"` | RED if graded, or the prose surfaces in a box |
| G5c | same, `callLlm` -> `{ ok:true, finishReason:"STOP", text: VALID_JSON }` | assert `row.ungraded === undefined`, `row.totalScore === "8/10"`, `row.overallComment.includes("RAW_SENTINEL_OK")` | RED if a clean complete parseable response is rejected |
| G5d (regression anchor) | same, `callLlm` -> `{ ok:true, text: VALID_JSON }` (NO finishReason - the shape the existing 89 tests use) | assert `row.ungraded === undefined` | RED if an ABSENT finishReason is treated as truncation (the over-fire failure) |

**Why G5a uses VALID (not truncated) JSON - this is the load-bearing design choice.** If case (a) used unparseable truncated JSON, the PARSE guard would catch it and the finishReason guard would never be exercised - a test GREEN for the wrong reason, the exact failure class this seat exists to prevent. With valid JSON, only the finishReason guard can make the row ungraded, so G5a isolates it. Symmetrically G5b uses `finishReason:"STOP"` so only the parse guard can fire. I verified this isolation holds against mutants (section 7).

**Truncation set is frozen minimal:** the oracle pins `"MAX_TOKENS"` -> ungraded and `"STOP"`/absent -> graded. The implementer MAY treat a BROADER set (e.g. `SAFETY`, `RECITATION`, `BLOCKED_*`) as bad too - a superset only makes more rows ungraded and still passes these pins. Do NOT pin a denylist in the test; pin the three discriminating cases. Recommend the guard be written as an ALLOWLIST of "complete" reasons (`finishReason` absent or `=== "STOP"`) rather than a denylist of bad ones - unbounded bad set, bounded good set (the `class-trends` denylist lesson, `seats.md` AC checker Q3).

**Guard placement is pinned by a sibling frozen oracle, not by trust:** see section 6 (`parsing.fallback.test.ts`). That oracle goes RED if the fix is put into `parseRubricResponse`, which forces it into `gradeSubmission` and protects the recording path.

**Blast radius, MEASURED (not argued):** the guard sits in the shared `gradeSubmission`. I grepped every `*.test.ts` driving the engine (20 files) and every `ok:true, text:"<literal>"` mock in the repo. NO `gradeSubmission`-path test feeds non-JSON prose or `MAX_TOKENS` expecting a graded row - all grade-engine mocks use `JSON.stringify(...)`/`okResponse()` with no finishReason. The prose/`MAX_TOKENS` mocks all live in OTHER subsystems (lms-generation, discussion-replies, module-content-extract) and the RECORDING path (`grading-submission-grade/extract`), which has its OWN parser and already handles `MAX_TOKENS`/unparseable itself - further evidence the guard belongs in `gradeSubmission` and NOT in the shared `parseRubricResponse`. So the existing suite stays green (FF-11).

## 5. G8 / F1=B - the comment split routing (FF-10, applied as R1). Home: `engine.test.ts`

Frozen split fixture:
`SPLIT_JSON = JSON.stringify({ strengths:"PRAISE_X you structured this well", overallComment:"DEDUCT_Y Thesis: the claim is missing", improvements:"ADVICE_Z try an outline next time", rubricResults:[{area:"Overall",score:"7/10"}], totalScore:"7/10" })`
Default-shape fixture (no `strengths` key - what today's prompt elicits):
`DEFAULT_JSON = JSON.stringify({ overallComment:"PRAISE_AND_DEDUCT_W", improvements:"ADVICE_Z", rubricResults:[{area:"Overall",score:"7/10"}], totalScore:"7/10" })`

### 5.1 Field routing (the core, discriminates against `engine.ts:114`) - [PURE]
Drive `gradeEntries([entry()], instr, rubric, "gemini", null, { commentSplit: true })`, `callLlm` -> `{ ok:true, finishReason:"STOP", text: SPLIT_JSON }`. Assert on `row = run.results[0]`:
- `row.strengths.includes("PRAISE_X")` - praise reaches "did right"
- `!row.strengths.includes("DEDUCT_Y")` - **a deduction NEVER lands in "What Went Well"** (this is the single assertion that discriminates against the current `strengths = parsed.overallComment`)
- `row.improvements.includes("DEDUCT_Y")` - "did wrong" is visible in "What Could Be Better"
- `row.improvements.includes("ADVICE_Z")` - advice preserved (R1)
- `row.strengths !== row.improvements` - distinct fields
Pin FACTS (substrings), never exact composed wording (source-text-tests-overspecify).

### 5.2 Prompt mode actually flips - [PURE], independent pin
Same drive; read the sent prompt `mockCallLlm.mock.calls[0][0].contents[0].parts[0].text`:
- with `commentSplit:true` it CONTAINS `'"strengths": "what the student did well",'`
- with the option unset it does NOT contain that line
This catches a mutant that flips the parse routing but forgets to flip the prompt (and vice versa). The full prompt text is already frozen by `prompts-praise-routing.test.ts` - do NOT duplicate those assertions; this is only "did the engine select the mode".

### 5.3 Default stays byte-identical (regression) - [PURE]
Drive with the option UNSET, `callLlm` -> `{ ok:true, finishReason:"STOP", text: DEFAULT_JSON }`. Assert `row.strengths === "PRAISE_AND_DEDUCT_W"` and `row.improvements === "ADVICE_Z"` (today's mapping). Proves the option gates the change.

Parse (5.3-mechanism): the engine needs `parsed.strengths`. Recommended: add `strengths: string` (default `""`) to `parseRubricResponse`'s RETURN - additive, existing destructurers (`{overallComment, improvements, rubricAreas, totalScore}`) and the recording path (reads `parsed.overallComment`) are untouched, so the SHARED CONTRACT is preserved. This is a mechanism choice; its behavioral consequence is pinned by 5.1 (praise ends up in `strengths`), so no separate parse-internal test is needed.

### [OWNER] - tagged, not asserted
Whether a LIVE model actually separates praise from deductions cleanly (split QUALITY) is OWNER-verified - no component renders and no key exists here. The oracles pin ROUTING of a mocked split-shaped response only. Record as FF-10-owner.

## 6. Guard-placement frozen oracle (NEW file `parsing.fallback.test.ts`) - protects the shared parser

Import `parseRubricResponse` from `./parsing`. Frozen literal oracle of TODAY's fallback (green now AND after the G5 build; RED only if someone moves the fix into the parser):
- `parseRubricResponse("just prose, no json")` deep-equals `{ overallComment: "just prose, no json", improvements: "", rubricAreas: [{ area:"Overall", score:"", comment:"just prose, no json" }], totalScore: "" }`
- `parseRubricResponse("{ not valid json }")` (malformed braces -> `JSON.parse` throws) deep-equals the same shape with `overallComment`/`comment` = `"{ not valid json }"`.
This makes "fix G5 inside the parser" break a test, forcing the guard into `gradeSubmission` and keeping the recording path's behavior intact. Label it in-file as a PROTECTIVE pin (not a TDD-red test).

## 7. SABOTAGES - each with its discrimination verdict (all VERIFIED against a reference, section 8)

| Sabotage (named mutation) | Kills | Verdict |
|---|---|---|
| S1: delete the finishReason check in `gradeSubmission` | G5a only | DISCRIMINATES. Proven: mutant left G5a graded (RED) while G5b/G5c/G5d stayed green - isolates the finishReason guard |
| S2: delete the unparseable-JSON check | G5b only | DISCRIMINATES. Proven: mutant left G5b graded (RED), G5a unaffected - isolates the parse guard |
| S3: broaden the guard so absent/`STOP` finishReason is treated as truncation | G5d (and G5c) | DISCRIMINATES. This is the over-fire mutant; G5d is the anchor that catches it and it is ALSO caught by the whole existing 89-test suite (FF-11). Red in the right direction only |
| S4: route `strengths = parsed.overallComment` under split (i.e., forget to change `engine.ts:114` for the split branch) | 5.1 "deduction NOT in strengths" + "praise in strengths" | DISCRIMINATES. Proven: mutant reds exactly those two assertions - this is the current-code shape, so 5.1 is RED on today's tree (correct TDD red) |
| S5: flip parse routing but leave the prompt in default mode | 5.2 | DISCRIMINATES (prompt-flip pin catches the half-done split) |
| S6: change `parseRubricResponse` to signal failure instead of falling back | section 6 frozen oracle | DISCRIMINATES, and is the guard-placement enforcer |

No sabotage here is red-in-both-directions or green-in-both. Each isolates one guard.

## 8. Satisfiability proof (practice #1) - DONE

I built a reference engine in the scratchpad (`.../scratchpad/engine-ref.js`) mirroring the real control flow (gradeSubmission throws -> catch -> grading-failed row; parser uses its own `extractJsonObject`; split routes praise->strengths, deductions+advice->improvements). **A SINGLE implementation passes all 15 oracle assertions (G5a-d, 5.1, 5.3) green.** I then ran three mutants (drop finishReason guard / drop parse guard / route overallComment->strengths): each is caught, and the finishReason vs parse guards red INDEPENDENTLY (NO_FINISH reds only G5a; NO_PARSE reds only G5b), confirming the isolation design. No mutant was rebuilt. The red tests are satisfiable; the spec is internally consistent.

Key construction note (coverage-by-construction, not enumeration): the engine's "is this parseable" question is answered by the SAME `extractJsonObject` + `JSON.parse` the parser uses (recommend exporting a tiny `hasParseableRubricJson` from `parsing.ts`, or inlining the identical two lines), so the guard and the parser cannot drift to disagree about what "parseable" means.

## 9. Executable here vs argued

EXECUTABLE (node-env vitest, `callLlm` mocked): all of G5a-d, 5.1, 5.2, 5.3, and section 6. These are the whole deliverable - no part of this wave needs a render or a key.
ARGUED ONLY (labelled, not asserted as verified): the blast-radius conclusion in section 4 is a grep-floor argument (I read the engine-driving test files' mock shapes but did not run the full 16k+ suite); the implementer MUST run the full suite at the wave gate to confirm FF-11. The live split QUALITY and live truncation frequency are OWNER (section 10).

## 10. Residual register (owner, instrument, step)

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| G8-FORK | Advice own-box vs folded with deductions (section 1 fork) | owner | product decision | ride-alongside; R1 ships regardless; B is a later scoped item (type + gradingResultsHelpers change) |
| FF-10-owner | Live model actually separates praise/deductions | owner | a real 5-criterion grade with the split prompt, eyeball the two boxes | W4 owner walk |
| FF-R2 | How often production truncates grading JSON (G5 real rate) | owner | a real grade at production `GEMINI_MAX_OUTPUT_TOKENS`; count grading-failed rows | W4 owner walk; the guard then reports it as a named failed row |
| G5-BLAST | Full-suite green after the shared-guard change | implementer | `npm test` (full) at the wave gate | build wave gate, before push |
| G8-OPTNAME | Final `GradingRunOptions` split field name | architect/implementer | the tests bind to whatever name ships | build wave |
| REGRESSION | `docs/REGRESSION.md` lacks a baseline for `gradeSubmission`'s unparseable/`ok:true` fallback behavior before W3 changes it | baseline seat | `grep -a -n "No feedback generated" docs/REGRESSION.md` | BEFORE the G5 build lands (scope 6, W3 first step) |

## 11. What I could not determine
Anything live: real model output, real truncation frequency, real Canvas. Whether the architect will put the parse change in `parseRubricResponse` vs a sibling predicate (I pinned the behavioral consequence and the parser-unchanged frozen oracle; either mechanism satisfies both). The final option name. These are named above with owners and instruments, not dropped.
