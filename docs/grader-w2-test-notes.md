# Grader Wave W2 - TDD test notes + frozen oracles (GRADING-CHAT panel wiring)

Authoring seat: loop-test-author (Opus). These are NOTES, not test code. An
implementer builds from them; a fresh loop-checker reads them first. Measured
2026-10-04 against the working tree (all `file:line` opened, not recalled).
Nothing in the panel renders under vitest (node-env, `src/**/*.test.ts` only),
so panel facts are SOURCE-TEXT (executable here) or OWNER (walk) - tagged
honestly. The genuinely PURE, behaviorally-driven oracles are the edits-key
function (WK-5c, O4 half 1) and the commentSplit body pin (O3-A).

ORCHESTRATOR RULING applied (W2-R1, commentSplit injection): MECHANISM A. The
W2 write set INCLUDES the driver, the shared request-body type, and the driver
lifecycle test. O3-A is the live oracle; O3-B is superseded and kept only as a
record of the rejected alternative. Reasons: item 3 is the reachability gate for
the whole engine wave (without it the split ships dead); Mechanism A gets the
PURE instrument (drive the driver, inspect the dispatched body, plus the
default-companion over-fire guard) instead of the weak source-text pin; and it
reuses the driver's tested `postGradeRunItem` transport instead of
re-implementing fetch + throw-on-`!res.ok` in the panel (Mechanism B's real
regression hazard). Cost of being wrong is one optional field on a shared type.

---

## 0. The commentSplit injection measurement (what forced the Mechanism-A ruling)

I measured the grade-request path end to end. The POST body to
`/api/grade-run-item` is built ENTIRELY INSIDE THE DRIVER, not the panel:

- `useContinuousGradingRun.ts:295-302` constructs
  `const body: GradeRunItemRequestBody = { sourceIndex, entry,
  assignmentInstructions, rubric, provider, pointsPossible }` - no
  `commentSplit`, and it is typed `GradeRunItemRequestBody`
  (incrementalRunPlan.ts:58-65), whose fields are all `readonly` and which has
  NO `commentSplit` field.
- The route ALREADY consumes it: `route.ts:65` (`commentSplit?: unknown`),
  `:95`, `:135` (`commentSplit: body.commentSplit === true`), `:176`, `:191`
  (`gradeEntries(..., { commentSplit })`). So the engine/route halves are built
  and live; the ONLY missing hop is the chat surface putting `commentSplit:
  true` on the wire.
- The panel (`GradingChatPanel.tsx`) only calls `driver.beginSession(...)` and
  `driver.submit(...)`. Neither carries `commentSplit`, and
  `useContinuousGradingRun({ provider, dispatchItem?, maxEntries? })` has no
  `commentSplit` param. There is no channel from the panel to the body without
  changing the driver OR injecting a custom `dispatchItem`.

The engine-wave notes said "The driver passing the option is the sibling's
W1/W2" - but W1 shipped without it. MECHANISM A (ruled) closes the gap: add
`readonly commentSplit?: boolean` to `GradeRunItemRequestBody`
(incrementalRunPlan.ts:58-65), add an optional `commentSplit?: boolean` param to
`useContinuousGradingRun` and set `commentSplit` on the body at
useContinuousGradingRun.ts:295-302, and have the panel construct the driver with
`useContinuousGradingRun({ provider: "gemini", commentSplit: true })`. The body
is byte-identical when the flag is absent (matches the route's "only literal
true opts in", route.ts:134-135, and the engine note's "forged/absent only makes
output less split"). Everything else in W2 (O1, O2, O4) is independent of this.

Tag key: MACHINE(pure) = node-driven behavior here. MACHINE(source-text) =
readFileSync+regex here, executable but NOT behavior (FF-R7 limit). OWNER =
browser/key.

---

## 1. W2 WRITE SET (confirmed, disjoint, line-counted; Mechanism-A additions folded in)

- `src/app/components/grading-chat/GradingChatPanel.tsx` (191 lines via Read;
  additions small) - the wiring: pass `canvasUrl={driver.canvasUrl}`,
  `runKey={driver.runKey}`, `editsSurface={driver.runKey}`; mount
  `RubricProvenance` and `GeneratedRubricCard` from driver values; construct the
  driver with `commentSplit: true`.
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` (125
  lines) - EXTEND with new source-text canaries; do NOT edit/delete its 13
  existing assertions (FF-11).
- `src/app/components/grading-results/gradingResultsHelpers.ts` (737 lines via
  Read) - ONLY `gradingResultsEditsKey` (:558-560) changes. Confirmed free:
  `git status --short` shows it UNMODIFIED, no in-flight wave touches it.
- `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts` -
  ADD a new `describe` block for WK-5c; do NOT edit the existing
  `describe("gradingResultsEditsKey")` (lines 114-153) or the
  `loadPersistedEdits`/`mergeStoredRowEdit` blocks. Same file (no cross-test-file
  import), so the existing frozen pins RUN ALONGSIDE and auto-catch any legacy
  regression.
- `src/app/components/grading-chat/useContinuousGradingRun.ts` (Mechanism A) -
  add optional `commentSplit?: boolean` param; set it on the body at :295-302.
- `src/app/components/grading/incrementalRunPlan.ts` (Mechanism A) - add
  `readonly commentSplit?: boolean` to `GradeRunItemRequestBody` (:58-65).
- `src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts`
  (Mechanism A) - ADD O3-A; do NOT edit/delete existing assertions (FF-11).

NOT edited, confirmed: `GradingResults.tsx` - `canvasUrl` (:114), `runKey`
(:123, optional), `editsSurface` (:134, required) are ALL already props; it calls
`loadGradingResultsEdits(canvasUrl, run, editsSurface)` (:213,:234) and
`persistGradingResultsEdits(canvasUrl, edits, editsSurface)` (:248). A frozen
source-text pin at `ungradedDisclosure.test.ts:568-571` locks the exact call
shape `loadGradingResultsEdits(canvasUrl, run, editsSurface)` - adding a 4th arg
there would go RED, which is WHY the session discriminator must ride IN
`editsSurface`, not as a new param. Also NOT edited: `engine.ts`/`parsing.ts`/
`route.ts` (engine wave, already consumes commentSplit).

Run the touched test files with the wrapper (never raw multi-path vitest):

```
npm run test:paths -- \
  src/app/components/grading-chat/GradingChatPanel.structure.test.ts \
  src/app/components/grading-results/gradingResultsHelpersEditState.test.ts \
  src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts
```

## 2. W1 / engine exported names I bound to (adjust if a name shifted)

Opened `useContinuousGradingRun.ts:355-373` - the driver exposes, as TOP-LEVEL
fields: `canvasUrl` (:360, `canvasUrlRef.current`), `runKey` (:361,
`"grading-chat-" + sessionIdRef.current`), `sessionId` (:362), `effectiveRubric`
(:363), `rubricFingerprint` (:364), `generatedRubric` (:365, `string |
undefined`), `retry`, `run`. The F3=A refusal is live (`submit` returns
`{kind:"refused"}` for a 2nd different Canvas URL, :249-254). `run.rubricFingerprint`
is stamped via `buildIncrementalRun`. Assumption to flag for the implementer: if
W1's final verify renamed `runKey`/`sessionId`/`generatedRubric`, the pins below
must track the shipped names.

---

## Oracle O1 - FF-L / G1: panel passes the driver's canvasUrl + runKey (not ""). [MACHINE source-text; behavior is OWNER WK-1]

- Object: the `<GradingResults>` mount in `GradingChatPanel.tsx` (currently
  `:172-181`, hardcodes `canvasUrl=""` at :175, passes no `runKey`).
- Home: `GradingChatPanel.structure.test.ts` (new `describe`).
- Instrument [MACHINE source-text]: read the panel source; slice the
  `GradingResults` JSX (from `"<GradingResults"` to its closing `"/>"` or `">"`).
  Assert:
  - the source does NOT contain `canvasUrl=""` anywhere (kills "still hardcoded
    empty");
  - the source references `driver.canvasUrl` (value flows from the driver);
  - the `GradingResults` slice contains a `canvasUrl={` prop whose value is
    non-literal;
  - the source references `driver.runKey` AND the `GradingResults` slice
    contains `runKey={`.
- Direction: RED if `canvasUrl=""` survives, or `runKey` is not passed, or
  `canvasUrl` is not fed from the driver.
- Frozen oracle (pin the FACT, not spelling): the pair `{canvasUrl fed from
  driver.canvasUrl, runKey fed from driver.runKey}` is present on the mount; the
  empty-string literal is absent. Tolerate destructuring (`const { canvasUrl,
  runKey } = driver`) by asserting on both the import-of-value (`driver.canvasUrl`
  / `driver.runKey` appear in source) and the mount prop presence separately - do
  NOT require the exact substring `canvasUrl={driver.canvasUrl}` if that
  over-constrains; the discriminating facts are "not empty" + "fed from driver".
- Sabotage A (RED->GREEN): leave `canvasUrl=""` -> the no-empty + fed-from-driver
  assertions RED. DISCRIMINATES.
- Sabotage B (RED): pass `canvasUrl` but omit `runKey` -> the runKey pin RED.
  DISCRIMINATES (this is the G4 row-state-survival hop).
- LIMIT (FF-R7, state it in-file): a source-text pin is not a behavioral drive;
  the actual Canvas write is OWNER (WK-1), the live Post of a URL row is OWNER
  (WK-5/FF-R4). The driver's RETENTION of the URL is already PURE-proven in W1
  Oracle 1. This oracle only proves the panel HANDS the retained value on.

## Oracle O2 - FF-9 / G7: panel mounts RubricProvenance + GeneratedRubricCard from driver values. [MACHINE source-text; visual is OWNER WK-12]

- Objects (measured component contracts, which differ from the task's paraphrase
  - bind to the REAL props):
  - `RubricProvenance` (grading-results/RubricProvenance.tsx:13) is
    `export default function RubricProvenance({ run }: { run: GradingRun })` - it
    reads provenance from the RUN (`describeRunRubricProvenance(run)`), so it is
    fed `run={driver.run}`, NOT `effectiveRubric`/`rubricFingerprint` directly
    (the fingerprint reaches it THROUGH the run, stamped by buildIncrementalRun;
    W1 Oracle 6 proved `driver.run.rubricFingerprint` is non-empty). It returns
    null when there is no line, but its param is non-null `GradingRun`, so the
    panel MUST null-guard (`driver.run && <RubricProvenance run={driver.run} />`).
  - `GeneratedRubricCard` (grading-results/GeneratedRubricCard.tsx:13) is
    `export default function GeneratedRubricCard({ generatedRubric }:
    { generatedRubric: string })` - fed `generatedRubric={driver.generatedRubric}`.
    Because `driver.generatedRubric` is `string | undefined`, the panel MUST
    truthy-guard (`driver.generatedRubric && <GeneratedRubricCard
    generatedRubric={driver.generatedRubric} />`) or tsc fails.
- Home: `GradingChatPanel.structure.test.ts`.
- Instrument [MACHINE source-text]: assert the panel source contains the default
  imports from the real paths `"../grading-results/RubricProvenance"` and
  `"../grading-results/GeneratedRubricCard"` (GradingChatPanel is in
  grading-chat/, siblings of grading-results/), AND renders `<RubricProvenance`
  with `run={driver.run}` AND `<GeneratedRubricCard` with
  `generatedRubric={driver.generatedRubric}`.
- Direction: RED if either component is imported but not rendered (the
  "defines-but-never-places" trap the file's existing disclosure test already
  guards for, line 19-21), or rendered without the driver value, or fed the wrong
  prop name.
- Frozen oracle: pin the two imports (by path) AND the two render sites (by
  component name + the driver-sourced prop). Pin the FACT (imported AND rendered
  AND fed from the driver), not surrounding JSX.
- Sabotage A (RED->GREEN): import both but render neither -> render-site pins
  RED. DISCRIMINATES.
- Sabotage B (RED): render `GeneratedRubricCard generatedRubric=""` (constant)
  instead of the driver value -> the `generatedRubric={driver.generatedRubric}`
  pin RED. DISCRIMINATES.
- LIMIT: whether these actually appear on screen, read correctly, and show the
  generated criteria is OWNER (WK-12). This oracle proves wiring, not pixels.

## Oracle O3-A - FF-10 / G8 reachability: the grade request carries commentSplit:true. [MACHINE pure] (LIVE oracle under the Mechanism-A ruling)

Home: `useContinuousGradingRun.lifecycle.test.ts`.

- Object: `dispatchItemMock.mock.calls[0][0].commentSplit` (the body the driver
  dispatches). The harness already injects `dispatchItem: dispatchItemMock`
  (test :82-87) and inspects `calls[i][0]` as the body.
- Instrument [MACHINE pure]: construct the driver with the split on -
  `useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock,
  commentSplit: true })` (a NEW local driver factory in the new `it`, not the
  shared `useTestDriver` which hardcodes no split); `resolveChatRunHeaderActionMock`
  already resolves `readyHeader`; `beginSession`, then `submit({kind:"text",
  content:"x"})`; assert `dispatchItemMock.mock.calls[0][0].commentSplit === true`.
- Companion [MACHINE pure], mandatory (the gate against over-fire): the DEFAULT
  driver (`useTestDriver()`, no `commentSplit`) dispatches a body with
  `commentSplit === undefined` (or `!== true`). This proves the flag is OPT-IN
  and the default path is byte-identical - the same regression posture the route
  pins at :134-135.
- Frozen oracle: `true` when constructed with the flag; `undefined` when not.
  Literals, not recomputed.
- Direction: RED if the flag-on body lacks `commentSplit:true`, or the default
  body carries it.
- Sabotage A (RED->GREEN): driver ignores the param (body never sets
  commentSplit) -> flag-on assertion RED. DISCRIMINATES.
- Sabotage B (RED): driver hardcodes `commentSplit:true` unconditionally -> the
  DEFAULT companion RED. DISCRIMINATES (catches the over-fire that would split
  every other surface too).

## Oracle O3-B - SUPERSEDED by the Mechanism-A ruling (kept only as the rejected alternative)

Mechanism B would have the panel pass a custom `dispatchItem` to the driver that
POSTs `JSON.stringify({ ...request, commentSplit: true })`, pinned by a
source-text canary plus a drift guard that the panel re-implements throw-on-
`!res.ok`. It was rejected because `postGradeRunItem` is module-private, forcing
the panel to re-implement the fetch + throw contract (a silent-failure
regression hazard), and because its only instrument is a weak source-text pin.
DO NOT BUILD O3-B. Use O3-A.

## Oracle O4 - WK-5c / G3: session-scoped edits key (prevents cross-session inheritance AND the canvasUrl-passthrough regression). [MACHINE pure, two homes]

This is a load-bearing PURE oracle and it has TWO halves, because the session
discriminator can be dropped in TWO places. Both halves are required (the trap:
passing `canvasUrl` through, on its own, MOVES same-assignment re-grades onto the
SHARED key `ta-grading-results-edits:${canvasUrl}` and REGRESSES the same-URL
case).

### Measured today-state (why the fix is needed)

`gradingResultsEditsKey(canvasUrl, surface)` (:558-560) =
`canvasUrl ? "ta-grading-results-edits:"+canvasUrl :
"ta-grading-results-edits::"+surface`. For a NON-EMPTY canvasUrl the `surface`
argument is INERT (documented :539-557). Today the chat panel passes
`canvasUrl=""` + `editsSurface="grading-chat"` (a CONSTANT), so the key is
`ta-grading-results-edits::grading-chat` - session-independent; every
cross-session re-grade inherits prior edits. After W2 passes a real `canvasUrl`,
the key would become `ta-grading-results-edits:${canvasUrl}` - STILL
session-independent, now shared with any surface on that URL. Both must be fixed
together.

### O4 half 1 - the key function. Home: `gradingResultsHelpersEditState.test.ts` (NEW describe block). [MACHINE pure]

I PROVED a satisfiable construction (scratchpad `wk5c-ref.js`, node, 10/10
pass): keep a BOUNDED, FROZEN legacy-surface set and session-scope everything
else -

```
const LEGACY_SURFACES = new Set(["canvas", "github"]);
export function gradingResultsEditsKey(canvasUrl, surface) {
  if (canvasUrl) {
    return LEGACY_SURFACES.has(surface)
      ? `ta-grading-results-edits:${canvasUrl}`              // legacy shape, UNCHANGED
      : `ta-grading-results-edits:${canvasUrl}::${surface}`; // session-scoped for the chat surface
  }
  return `ta-grading-results-edits::${surface}`;             // empty-url branch already uses surface
}
```

This is the SAFE direction the seat requires: the unbounded set of surfaces gets
the session-scoped (safe) default; the exception is a CLOSED, enumerable set of
exactly the two legacy surfaces that have stored data in the wild (documented at
:539-557). The MECHANISM is the architect's to bless, but it is the only one
available to W2 because the session must ride in `editsSurface` (GradingResults.tsx
is not editable; its call shape is frozen). The panel feeds the discriminator by
passing `editsSurface={driver.runKey}` (= `grading-chat-<sessionId>`, already
session-unique and changes only across reset) - the same value it passes as
`runKey`.

Assert (frozen literals; `URL = "https://canvas.example.edu/courses/1/assignments/2"`):

- WK5c-1 (the fix, RED today): `gradingResultsEditsKey(URL, "grading-chat-0") !==
  gradingResultsEditsKey(URL, "grading-chat-1")` - two sessions, SAME non-empty
  canvasUrl, DIFFERENT keys.
- WK5c-3 (the passthrough-regression guard, RED today): `gradingResultsEditsKey(URL,
  "grading-chat-0") !== "ta-grading-results-edits:" + URL` - the chat session key
  is DISTINCT from the shared assignment key, so passing canvasUrl through does
  not by itself cause inheritance.
- WK5c-2 (determinism, within-session persistence): `gradingResultsEditsKey(URL,
  "grading-chat-0") === gradingResultsEditsKey(URL, "grading-chat-0")`.
- WK5c-5 (text/file rows stay session-scoped; GREEN now and after - label
  PROTECTIVE, not TDD-red): `gradingResultsEditsKey("", "grading-chat-0") !==
  gradingResultsEditsKey("", "grading-chat-1")`.
- Legacy preservation: DO NOT duplicate. The existing pins at lines 120-125,
  128-132, 141-145, 147-152 run in the SAME file and already freeze
  `(URL,"canvas")`/`(URL,"github")` -> `ta-grading-results-edits:${URL}` and the
  empty-url canvas/github split. Reference them; adding to this file is what makes
  them a live guard on the change.
- Direction: RED if two sessions on one URL collide, or the chat session key
  equals the bare shared key, or any legacy pin breaks.
- Sabotage A1 (RED->GREEN): ship today's function unchanged (no fold) -> WK5c-1
  AND WK5c-3 RED (verified: today's function makes both equal). DISCRIMINATES.
- Sabotage A2 (RED): fold surface into the non-empty branch for ALL surfaces
  (drop the legacy exception) -> the existing strand-guard pins (:150-151) go RED.
  DISCRIMINATES - proves the bounded legacy set is load-bearing, not decoration.

### O4 half 2 - the panel feeds a session discriminator. Home: `GradingChatPanel.structure.test.ts`. [MACHINE source-text]

The pure half tests the function with a VARYING surface; it cannot catch a panel
that passes a CONSTANT surface. So pin the panel:

- Assert the `GradingResults` mount's `editsSurface` prop is fed from the session
  discriminator (`driver.runKey` or `driver.sessionId`), NOT the bare literal
  `editsSurface="grading-chat"`.
- Direction: RED if the panel still passes `editsSurface="grading-chat"`
  (constant).
- Sabotage B (RED->GREEN, the named regression "pass canvasUrl through but omit
  the session discriminator"): panel passes `canvasUrl={driver.canvasUrl}` but
  keeps `editsSurface="grading-chat"` -> this source-text pin RED while O1 stays
  green. DISCRIMINATES, and it is the exact regression shape flagged by the
  coordinator. The pure half (half 1) CANNOT catch this; only this source-text
  pin can.

### O4 - loadPersistedEdits / mergeStoredRowEdit unchanged

Only `gradingResultsEditsKey` changes. `loadPersistedEdits` (:619) and
`mergeStoredRowEdit` (:597) call it/are called indirectly but their signatures
and bodies are untouched. Their existing frozen tests
(`gradingResultsHelpersEditState.test.ts` lines 155-258) run alongside and must
stay green (FF-11). Do NOT edit them. If the implementer finds a need to touch
either, that is a scope change - flag it, do not silently widen.

---

## 3. Blast radius of the gradingResultsEditsKey change - MEASURED

All `GradingResults` mounts (every `editsSurface` value), via
`grep -n "editsSurface="`:

| Mount | Line | editsSurface |
|---|---|---|
| `GithubGradingPanel.tsx` | :859 | `"github"` |
| `GradingTab.tsx` | :578 | `"canvas"` |
| `LiveFeedPanel.tsx` | :442 | `"canvas"` |
| `GradingChatPanel.tsx` | :176 | `"grading-chat"` (W2 changes to `{driver.runKey}`) |

The legacy set `{canvas, github}` keeps all three non-chat mounts byte-identical
(proven, 10/10). Real call sites of the key (via
`loadGradingResultsEdits`/`persistGradingResultsEdits`) are ONLY
`GradingResults.tsx:213,234,248`; every other grep hit is a comment or a doc. The
recording path does NOT mount GradingResults with an editsSurface (no grep match)
- it is unaffected. `gradingResultsHelpers.ts` is unmodified in git; no in-flight
wave contends.

## 4. FF-11 (regression) - do not weaken

The seven files in scope section 2.9 stay green, no existing assertion edited or
deleted. New canaries are ADDITIVE. The 13 existing
`GradingChatPanel.structure.test.ts` assertions, the existing
`gradingResultsEditsKey`/`loadPersistedEdits`/`mergeStoredRowEdit` blocks, and
the existing `useContinuousGradingRun.lifecycle.test.ts` assertions must still
pass. The `ungradedDisclosure.test.ts:568-571` frozen call-shape pin must stay
green - which is WHY the session rides in `editsSurface`, not a new arg to
`loadGradingResultsEdits`. Adding `readonly commentSplit?: boolean` to
`GradeRunItemRequestBody` is additive and optional, so existing constructors of
that body stay valid.

## 5. EXECUTABLE here vs ARGUED vs READ/OWNER

- MACHINE(pure), the strong deliverable: O4 half 1 (key function) - proven
  satisfiable 10/10; O3-A commentSplit body pin + default-companion over-fire
  guard.
- MACHINE(source-text), executable but FF-R7-limited (not behavior): O1
  (canvasUrl/runKey passthrough), O2 (provenance imports+renders), O4 half 2
  (panel feeds discriminator).
- ARGUED (cited, not run here): RubricProvenance reads the fingerprint THROUGH
  the run (buildIncrementalRun stamp); the legacy set is exactly {canvas,github}
  (four mounts enumerated); commentSplit is additive on the shared body type.
- OWNER (walk): WK-1 live Canvas post of a URL row; WK-12 provenance
  visible/correct on screen; WK-5 b/c live reload+re-grade; WK-13 live split
  quality. None decidable here (no render, no key, no network).

## 6. RESIDUAL REGISTER (owner, instrument, step - all three)

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| W2-R1 | commentSplit injection point | RESOLVED - orchestrator ruled Mechanism A | driver + shared type + pure O3-A | built in W2 per this doc |
| W2-R2 | Reload resets `sessionId` to 0 (`useRef(0)`), so a NEW session AFTER a page reload reuses `grading-chat-0` and can inherit the pre-reload first session's stored edits for the same URL | owner + architect | the in-tab New-session case IS fixed by O4 (reset increments sessionId); the cross-RELOAD case is not. Full fix = persist a monotonic session counter OR removeItem the key on reset | OWNER walk WK-5 variant (b); architect decides if a persisted counter is in scope |
| W2-R3 | Panel source-text pins (O1/O2/O4-half2) are not behavioral drives | test-author seat | no render available; pin + owner walk is the ceiling (FF-R7) | stated in each oracle |
| W2-R4 | Live Canvas write / provenance pixels / split quality | owner | browser + key | WK-1, WK-12, WK-13 |

## 7. What I could not determine

- Anything live (render, Canvas, Gemini).
- Whether W1's final-verify renamed `runKey`/`sessionId`/`generatedRubric` (I
  bound to the names at `useContinuousGradingRun.ts:355-373` as they stand in the
  working tree; flagged for the implementer).
- The reload-session-counter decision (W2-R2) - architect's follow-up.

One sentence for the checker: the single most important thing to verify is that
O4 has BOTH halves (pure key-function AND panel source-text), because either
alone leaves the canvasUrl-passthrough regression catchable in only one of its
two drop points.
