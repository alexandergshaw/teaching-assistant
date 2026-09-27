# G5 test notes and oracle - bounding the image model transport

**Write set: `docs/g5-test-notes.md` only.** No file under `src/` was written,
read-modified or mutated. No scratch directory was created inside the
repository (verified at the end of this document, with a canary, because
`find` exits 0 when it matches nothing).

**Brief:** `docs/g5-scope.md` (revision 2, committed `4adff06`) relocated its
**B3** obligation to this seat. `docs/g5-check.md` (`313edbb`) proved that
**neither instrument the scope designed can fail on RULING 76's own mutation.**
This document's primary job is the instrument that distinguishes an
elapsed-aware implementation from the fixed literal RULING 76 forbids. Read
against `docs/g4-scope.md` and `docs/g4-check.md` (716 lines each, `wc -l`) for
the inherited rulings, and `docs/BACKLOG.md:96` (via `grep -a -n "G5"
docs/BACKLOG.md`) for the row's own stated instrument requirement.

Sizes named for the record, all by `wc -l`, re-run this pass: `docs/g5-scope.md`
570, `docs/g5-check.md` 628, `src/app/actions/announcement-image.ts` 68,
`src/app/actions/announcement-image.test.ts` 113,
`src/app/components/recording/announcementImagePipeline.ts` 126,
`src/lib/bounded-race.ts` 75, `src/lib/bounded-race.test.ts` 66,
`src/lib/llm.ts` 821, `src/lib/llm.test.ts` 917,
`src/app/components/ui/modalAdoptionSourceScan.ts` 405,
`src/app/components/ui/modalAdoption.wiring.test.ts` 642,
`src/lib/no-emojis.test.ts` 313,
`src/app/components/canvas-tab/announcements-panel.wiring.test.ts` 410,
`src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts`
692. This document states no count of its own lines.

**Settled and not reopened here:** RULING 75 (racing bounds the caller's
patience, not the work), RULING 76 (elapsed-aware, per-invocation), RULING 77's
constants, RULING 94 (the bound goes in both places). Nothing below argues any
of them; the instruments measure whether they are implemented.

---

## 0. THE ANSWER TO THE OBLIGATION, up front

**RULING 76 IS ENFORCEABLE HERE. The instrument exists, it was built, and it
was executed against four adversarial implementations.**

The scope and the check were both right that a single-tick assertion cannot
tell an elapsed-aware implementation from `raceWithTimeout(generateGeminiImage(prompt),
24_000)`. They were wrong to conclude that the *emitted wait* is unobservable.
It is observable, with no change to the production code shape, because
`raceWithTimeout`'s emitted wait is **a positional argument**, and the preamble's
elapsed time is **an injectable input** (the clock, advanced inside the mocked
`requireOwner`).

The instrument:

- **observe** the emitted wait as `vi.mocked(raceWithTimeout).mock.calls[0][1]`;
- **control** the preamble elapsed time with a counter clock,
  `vi.spyOn(Date, "now").mockImplementation(() => nowMs)`, where the mocked
  `requireOwner` does `nowMs += preambleElapsedMs`;
- **compare** against a hand-written frozen literal table.

**No fake timers are involved in the clamp arithmetic at all**, which is
stronger than the scope's design rather than a workaround for it.

Executed result, measured this pass (command in section 2): a correct reference
implementation scores **8/8 green**; the literal `24_000` implementation and a
"records `startedAtMs` after the auth preamble" implementation each die on
**exactly the same 5 assertions**; two further mutants die on 1 and 2
assertions. The full row-kill matrix is section 5.

---

## 1. What is EXECUTED here versus what is ARGUED

My write set is one document, so no file in `src/` exists yet. Everything below
labelled EXECUTED was run against **real repository modules** - imported, not
transcribed - from a probe tree in this session's scratchpad
(`.../scratchpad/g5probe`, outside the repository).

### EXECUTED (measured this pass, command given at each use)

| # | What was executed | Result |
|---|---|---|
| E1 | `vi.useFakeTimers()` fakes `Date.now()` by default in vitest 4.1.9 in this checkout, and `advanceTimersByTimeAsync(n)` moves `Date.now()` by `n` | Both true |
| E2 | `AbortSignal.timeout(20)` stays unaborted across `advanceTimersByTimeAsync(100_000)` | True - independently re-confirmed INSIDE vitest, where the scope's own probe used raw node |
| E3 | A `setTimeout` scheduled during an advance, landing beyond the window, does not fire in that window | True |
| E4 | The inner instrument against 5 implementations x 6 oracle rows + 2 extra assertions | Correct impl 8/8 green; every mutant red, matrix in section 5 |
| E5 | All **nine** assertions already landed in `src/app/actions/announcement-image.test.ts` re-run against the wrapped reference with the REAL `raceWithTimeout` | 9/9 green - the wrap is not a regression, and the two rejection tests pin the `{kind:"failed"}` translation |
| E6 | The **real** `src/app/components/recording/announcementImagePipeline.ts` imported and driven under vitest's node environment with only the Server Action mocked | 2/2 green - instrument (O) is buildable on the production path, no component rendered |
| E7 | The outer bound instrument against the wrapped reference and against today's unwrapped shape | Wrapped 4/4 green; unwrapped red on exactly 1 of 4 (section 6 names the 3 that do not discriminate) |
| E8 | The call-site walker across 8 scenarios: today's tree, the wrapped tree, a new unwrapped caller in an unseen directory, the narrowed-walk repair, three comment-stripping canaries, a duplicate declaration, an aliased import | Matrix in section 7 |
| E9 | The landed RULING-79 comment tokenizer versus both regex forms, on 8 shapes | Tokenizer correct on 8/8; the unanchored regex WRONG on 3; the anchored regex WRONG on 1. Matrix in section 8 |
| E10 | `grep -c $'\r'` against a file holding 68 CR bytes | Reports **0, exit 1**. The defect the brief described, reproduced. Section 9 |
| E11 | `npm run test:paths -- src/lib/llm.test.ts src/app/actions/announcement-image.test.ts src/lib/bounded-race.test.ts` | `Test Files 3 passed (3)`, `Tests 83 passed (83)`, `COVERED src/lib/llm.test.ts files=1 passed=68`, `COVERED src/app/actions/announcement-image.test.ts files=1 passed=9`, `COVERED src/lib/bounded-race.test.ts files=1 passed=6` |
| E12 | No `signal` is created or passed by `raceWithTimeout` or reaches either `fetch` in `llm.ts` | Confirmed by reading and by `grep -n "signal" src/lib/llm.ts` -> only `:406` and `:751`, both prose |

### ARGUED, not executed - each with the landed precedent that makes it constructible

| # | Claim | Why argued | Landed precedent |
|---|---|---|---|
| A1 | The test files named in section 10 can be created at the stated paths and are collected | vitest collects `src/**/*.test.ts` (`vitest.config.ts:28`); my probe ran from a separate root | 79 `*.wiring.test.ts` files exist (`find src -name "*.wiring.test.ts" \| wc -l` -> 79); `announcements-panel.wiring.test.ts` (410 lines) is the naming precedent |
| A2 | `vi.mock("@/lib/bounded-race")` works from a test under `src/app/actions/` | Executed from the probe root with the same `@` alias, not from a repo-collected file | The alias is the same `resolve.alias` entry (`vitest.config.ts:9`); `announcement-image.test.ts:12-22` already module-mocks two `@/...` paths from that directory |
| A3 | A new `*.wiring.test.ts` may import `stripComments`/`walkFiles` from `@/app/components/ui/modalAdoptionSourceScan` | Not executed as a repo-collected file | The bundle guard at `modalAdoption.wiring.test.ts:619-641` filters out `/\.test\.tsx?$/` importers before flagging violators - read line by line; a `.test.ts` importer is excluded by construction |
| A4 | `export const MODEL_WAIT_MAX_MS = ...` in `announcement-image.ts` would fail a gate | I did not run the gate on a mutated file | `src/lib/use-server-exports.test.ts:112-113` legalises only `^export\s+async\s+function` and `^export\s+default\s+async\s+function` (plus type-only forms, `:98-102`). See section 4.2 - this gate is what makes the frozen-literal oracle the only available design |
| A5 | 18 test files already read a mocked call's second positional argument | Measured as a file count, not re-executed | `grep -rln "mock\.calls\[0\]\[1\]" src --include=*.test.ts \| wc -l` -> **18**; same-pattern canary `mock\.calls\[0\]\[99\]` -> exit 1, empty |
| A6 | Whether an instructor SEES a distinguishable failure state | **No component is rendered by any test in this repo.** Labelled a reading claim | `TakeAnnouncementPanel.tsx:564-567` renders `{imageError}` inside the `imageState === "failed"` branch. Residual R-A |
| A7 | Any claim about a REAL timeout | **The network is blocked and there are no API keys.** No real timeout can be observed here, at either placement | `vitest.setup.ts:34-53` throws on any unmocked `fetch`. Every timing figure below is a simulated or computed quantity, never an observed latency |

---

## 2. The seam, stated exactly

**No production seam change is required.** Three things are already true of the
planned shape, and together they make the emitted wait observable:

1. `raceWithTimeout(work, timeoutMs)` takes the wait as its **second positional
   parameter** (`src/lib/bounded-race.ts:31-34`). Mocking the module and
   reading `mock.calls[0][1]` observes the emitted number directly, as a number,
   with no timers.
2. The formula reads the wall clock twice - once at invocation entry, once when
   sizing (`src/app/api/class-trends-insight/route.ts:94` and `:143`, the shape
   RULING 77 fixed). `Date.now` is a stubbable global.
3. The preamble whose latency must be counted is `requireOwner()`, which the
   existing test file already mocks (`announcement-image.test.ts:12-14`). Making
   that mock advance the stubbed clock is how the test controls elapsed time.

**The injection points, named:**

| What is controlled/observed | How |
|---|---|
| "now" and the recorded start | `let nowMs = 1_000_000;` plus `vi.spyOn(Date, "now").mockImplementation(() => nowMs)`, restored in `afterEach` |
| The preamble's elapsed time | `vi.mocked(requireOwner).mockImplementation(async () => { nowMs += preambleElapsedMs; return {...}; })` |
| The emitted wait | `vi.mocked(raceWithTimeout).mock.calls[0][1]` |
| The model call not resolving | `vi.mocked(generateGeminiImage).mockImplementation(() => new Promise(() => {}))` - required, because `raceWithTimeout(generateGeminiImage(prompt), waitMs)` evaluates the inner call eagerly, and an unmocked one would hit `vitest.setup.ts`'s throwing stub |
| The timeout branch | `vi.mocked(raceWithTimeout).mockResolvedValue({ kind: "timedout" })` |

**Deliberately NOT the clock stub's job:** the number of times `Date.now()` is
called. `mockImplementation(() => nowMs)` is insensitive to that, so the
instrument does not over-specify the implementation - which is the
`source-text-tests-overspecify` lesson applied to a stub.

**Why the clock stub, and not `vi.setSystemTime`.** `vi.setSystemTime` (the
landed precedent, 7 files, e.g. `llm-content.test.ts:226-227`) requires fake
timers. Fake timers work here - E1/E2/E3 prove `Date.now()` is faked by default
and moves with `advanceTimersByTimeAsync` - but they are unnecessary for this
measurement and they cost the thing section 11 needs most: a failure message
carrying expected and received VALUES. Measured, verbatim:

- The emitted-wait assertion's failure: `AssertionError: expected 24000 to be
  18000 // Object.is equality`, with a `- 18000 / + 24000` diff.
- The equivalent fake-timer assertion's failure (from E7, verbatim):
  `AssertionError: expected false to be true // Object.is equality`.

The first names the defect. The second does not. **That is the decisive reason
the clamp arithmetic is measured by argument inspection and not by ticking a
clock**, and it is in addition to E2's `AbortSignal` finding.

**Which timing is fake-timer-drivable, and which is not - both measured this
pass:**

| Helper | Mechanism | Fake-timer drivable? | Use it for |
|---|---|---|---|
| `raceWithTimeout` (`bounded-race.ts:45`) | plain `setTimeout` | **YES** (E3, and `bounded-race.test.ts` does exactly this at `:21-24`) | The OUTER bound's behavioural check (section 6), where a single fixed constant is the whole requirement |
| `withDeadline` (`fetch.ts`) | `AbortSignal.timeout` | **NO** (E2) | Nothing in this wave. Not chosen at either placement |

---

## 3. What the instruments require of the wave plan

I do not write the wave plan or the write sets. These are the requirements my
instruments place on whoever does.

1. **The wave that lands the inner wrap must land `src/app/actions/announcement-image.ts`
   and a test file under `src/app/actions/` in the same wave.** Requirement I-1
   observes an argument of a call in that file; there is no seam it can reach
   from elsewhere.
2. **Requirement W-1 walks all of `src/`.** It is RED today (E8/S1), so it
   cannot land before the wrap. Landing it in an earlier wave would put a
   permanently-red test on `main`.
3. **The constants must NOT be exported** from `announcement-image.ts` (A4).
   Non-exported module-local `const`s, matching
   `class-trends-insight/route.ts:47-51`.
4. **`CLIENT_PATIENCE_MS` must be exported** from
   `announcementImagePipeline.ts` (not a `"use server"` file), because
   requirement O-1 reads it. That is safe; see section 6's warning about what
   that assertion does and does not prove.
5. **Nothing in this wave touches `src/lib/llm.ts` or `src/lib/llm.test.ts`.**
   No instrument below needs either changed, and section 9 explains why no new
   instrument is owed there.
6. **The gate command, spelled once:**
   `npm run test:paths -- src/lib/llm.test.ts src/lib/bounded-race.test.ts src/app/actions/announcement-image.test.ts src/app/actions/announcement-image.wiring.test.ts src/app/components/recording/announcementImagePipeline.test.ts src/app/components/recording/announcementImagePipeline.wiring.test.ts`
   Never a raw multi-path `vitest run` or `npm test <paths>` - that form
   silently drops any argument it does not match and exits 0. Plus
   `npx tsc --noEmit --incremental false`, run by **the wave gate and nobody
   else** (`tsconfig.json` sets `incremental: true`, so concurrent runs race on
   `tsconfig.tsbuildinfo`). Plus `npm run lint`: **pass condition is exit 0 with
   no NEW warning in the files this wave writes, measured against the same
   command run before the change. Do not pin an absolute warning count** - it
   read 4, then 7, then 8 in one day.
7. **The baseline for requirement E5 is the three `COVERED` lines in E11.** A
   wave that reports fewer than `passed=9` on `announcement-image.test.ts` has
   deleted an assertion rather than satisfying one.

---

## 4. The frozen oracles, stated as CONSTRUCTIONS

### 4.1 The emitted-wait oracle

**Construction.** Take RULING 77's four constants, read once by
`grep -n "MODEL_WAIT_\|TOTAL_BUDGET_MS" src/app/api/class-trends-insight/route.ts`:
`TOTAL_BUDGET_MS = 50_000` (`:47`), `MODEL_WAIT_MIN_MS = 8_000` (`:48`),
`MODEL_WAIT_MAX_MS = 24_000` (`:49`), `MODEL_WAIT_RESERVE_MS = 2_000` (`:51`).
Take the formula from `:143-144`. Substituting gives, for a preamble elapsed
time `e`:

```
waitMs(e) = min(24_000, max(8_000, 48_000 - e))
```

Then choose `e` so that the result lands in each of the function's three
regions and on each of its two breakpoints, and **write every expected value
out as a decimal literal by hand.** The table is the oracle:

| row | preamble elapsed `e` | `48_000 - e` | **expected emitted wait (frozen literal)** | region |
|---|---|---|---|---|
| R1 | `0` | 48_000 | **`24_000`** | MAX clamp active |
| R2 | `24_000` | 24_000 | **`24_000`** | breakpoint: linear meets MAX |
| R3 | `30_000` | 18_000 | **`18_000`** | **linear - the discriminating row** |
| R4 | `40_000` | 8_000 | **`8_000`** | breakpoint: linear meets MIN |
| R5 | `42_000` | 6_000 | **`8_000`** | MIN clamp active |
| R6 | `60_000` | -12_000 | **`8_000`** | negative remainder, MIN floor holds |

**Why this construction is not a tautology, and the proof is structural rather
than a promise.** The test cannot import the constants: `announcement-image.ts`
is `"use server"`, and `src/lib/use-server-exports.test.ts:112-113` permits only
async-function exports, so exporting them fails a landed gate and `next build`
(A4). The expected values are therefore *necessarily* literals in the test,
derived from the ruling document, not read from the implementation. **A
structural gate makes the correct oracle the only available one.**

**Three-point clamp coverage, as the brief requires:** R1 (above/at the clamp,
flat-MAX), R3 (below the clamp, linear), R5 (flat-MIN). **The below-clamp row
R3 is the one that discriminates**, confirmed by E4 and priced exactly in the
matrix at section 5.

**MEASURED REDUNDANCY, stated rather than hidden.** Against the four mutants I
built, **R2 kills nothing**, R4 kills nothing R3 does not already kill, and R6
kills nothing R5 does not already kill. The minimum discriminating set is
**{R1, R3, R5}**. I specify **R1, R3, R5, R6** - four rows: the three that
discriminate, plus R6 because it is the only row where `remainingMs - RESERVE`
is negative, a distinct arithmetic condition even though no mutant I wrote dies
there. **I do not specify R2 or R4.** Keeping an assertion that kills nothing
and cannot be said to cover a distinct condition is coverage theatre; a checker
would be right to call it that, and the honest thing is to have measured it and
dropped it.

**Reachability, stated plainly so it is not mistaken for something it is not.**
On this path today only `requireOwner()` precedes the model call, so the
production elapsed time is small and **R1 is the only row a real invocation
reaches.** R3, R5 and R6 exercise the function over inputs production does not
currently produce. That is not the "fixture uses a shape the UI never emits"
defect: the *shape* is milliseconds-of-elapsed-time, exactly what the code
consumes, and the requirement being pinned - RULING 76 - is explicitly about
the computation being *a function of* those inputs. The only way to observe
that a value is a function of an input is to vary the input. The reason it
matters despite being unreachable today is that the moment anything is added
before the model call - a second model call, a Supabase read, a slower auth
round trip - the input moves and a constant becomes wrong, silently.

### 4.2 The `{kind:"timedout"}` -> `{error}` wording oracle

**Construction.** The scope leaves this wording unspecified, and the round-1
check named it as unpinned by anything in the wave. It cannot be derived, so it
is **chosen here and frozen**, and the implementer copies it verbatim:

```
Image generation timed out. The announcement text is unaffected - try the image again.
```

Chosen to match what the surrounding code already tells the instructor -
`announcement-image.ts:21-25`'s own header states a failure here "never blocks
or degrades the text the instructor is about to post" - and it contains no
emoji and no non-ASCII character (`src/lib/no-emojis.test.ts` owns that rule
repo-wide; do not hand-roll an emoji scan).

The assertion is `expect(result).toEqual({ error: "<the literal above>" })`.
**The spelling IS the fact here**, which is the one case where the
`source-text-tests-overspecify` lesson does not apply: the point is to pin a
translation that nothing else in the wave pins.

### 4.3 The client-patience wording oracle

Same construction, for the OUTER placement, which must be distinguishable from
the inner one (residual R-A turns on exactly that):

```
The image request timed out before the server answered. The announcement text is unaffected - try the image again.
```

### 4.4 The client-patience constant

`CLIENT_PATIENCE_MS = 30_000`, as the scope ruled in its section 4. Frozen as a
literal: `expect(CLIENT_PATIENCE_MS).toBe(30_000)`. **Read section 6's warning
before treating that assertion as coverage - it passed on the unwrapped mutant.**

---

## 5. The INNER requirements

Verify rows name three things each: the **object** under comparison, the
**instrument** producing each quantity, and the **direction of failure**.

### I-1. The emitted wait is a function of the preamble's elapsed time

| | |
|---|---|
| **Object** | The second positional argument passed to `raceWithTimeout` by `generateAnnouncementImageAction`, once per invocation |
| **Instrument A (measured)** | `vi.mocked(raceWithTimeout).mock.calls[0][1]`, under the section-2 seam, for each of R1/R3/R5/R6 |
| **Instrument B (oracle)** | The hand-written decimal literals of section 4.1 |
| **Direction of failure** | RED when the emitted wait for any row differs from its frozen literal. In particular RED when the wait does not change as the preamble elapsed time changes - which is the whole point |
| **Extra assertion, stated separately because it is the B3 obligation in one line** | With the same mocks, two runs at preamble `0` and preamble `30_000` must yield `{first: 24_000, second: 18_000}`. RED when they are equal |
| **Also RED when** | `raceWithTimeout` is called zero times, or more than once, in one invocation (`toHaveBeenCalledTimes(1)`) |

### I-2. `startedAtMs` is recorded BEFORE the auth preamble

| | |
|---|---|
| **Object** | Same as I-1 |
| **Instrument** | Same as I-1. No separate test is needed - see below |
| **Direction of failure** | RED via I-1's R3/R5/R6 rows |

**This requirement needs no instrument of its own, and that is a measured
finding rather than an omission.** I built the mutant (`ref-bad-startedafter`:
elapsed-aware formula, MIN and MAX both present, `startedAtMs` recorded one
line *after* `await requireOwner()`) and it dies on **exactly the same five
assertions** as the literal mutant. The scope's requirement that the auth
round-trip count against the budget is therefore enforced by I-1, not merely
asserted in prose.

### I-3. The timeout branch returns the frozen `{error}` string

| | |
|---|---|
| **Object** | The value `generateAnnouncementImageAction` resolves to when `raceWithTimeout` yields `{kind:"timedout"}` |
| **Instrument A** | `toEqual` against section 4.2's frozen literal |
| **Instrument B** | Mocked `raceWithTimeout` resolving `{kind: "timedout"}` |
| **Direction of failure** | RED when the wording changes, when the value carries an extra key, or when the branch falls through to the generic `catch` message |
| **DOES NOT DISCRIMINATE** | Elapsed-awareness. **Measured: this assertion passed on all four mutants.** It must never be read as covering I-1 |

### I-4. No regression on the nine landed assertions

| | |
|---|---|
| **Object** | The nine existing `it()` blocks in `src/app/actions/announcement-image.test.ts` |
| **Instrument** | `npm run test:paths -- ... src/app/actions/announcement-image.test.ts`, whose own `COVERED` line must read `passed=9` or more |
| **Direction of failure** | RED when any existing assertion changes value. Two of them are load-bearing and must NOT be rewritten: `:100-105` and `:107-112` currently rely on a `generateGeminiImage` **rejection** propagating to the outer `catch`. After the wrap that rejection arrives as `{kind:"failed"}`. **Those two landed tests are therefore the enforcer of the `{kind:"failed"}` translation, and no new test is owed for it** |

EXECUTED (E5): all nine pass against the wrapped reference with the REAL
`raceWithTimeout`, including both rejection tests. The translation that makes
that true is `if (outcome.kind === "failed") throw outcome.error;` before the
success handling, which re-enters the file's existing `catch`. An implementer
who instead invents a new message for `"failed"` turns both landed tests RED,
which is the correct direction.

### The row-kill matrix (E4, verbatim from the probe's own output file)

```
row ->               0 |    24000 |    30000 |    40000 |    42000 |    60000
good             24000 |    24000 |    18000 |     8000 |     8000 |     8000
badLiteral       24000 |    24000 |    24000 |    24000 |    24000 |    24000
badAfter         24000 |    24000 |    24000 |    24000 |    24000 |    24000
badNoMax         48000 |    24000 |    18000 |     8000 |     8000 |     8000
badNoMin         24000 |    24000 |    18000 |     8000 |     6000 |   -12000

killed-by good          -> NOTHING (survives)
killed-by badLiteral    -> 30000,40000,42000,60000
killed-by badAfter      -> 30000,40000,42000,60000
killed-by badNoMax      -> 0
killed-by badNoMin      -> 42000,60000
```

`good` surviving is the required control: the reference implementation passes
everything, so the red tests are satisfiable. Section 12 accounts for the two
non-discriminating rows this matrix exposed.

---

## 6. The OUTER requirement - the client-patience bound

`src/app/components/recording/announcementImagePipeline.ts` is **confirmed
node-testable, by execution, not by argument** (E6): the REAL module imports and
its `generateImage(deps)` runs to completion under vitest's node environment
with only `@/app/actions/announcement-image` mocked. Today's baseline, measured:
`setImageState` receives `["generating", "ready"]` on success and
`["generating", "failed"]` with `setImageError` receiving `[null, "boom"]` on an
`{error}` result. **No component is rendered**; `deps` is a plain injected
object (`AnnouncementImageDeps`, `:41-54`) and the test supplies `vi.fn()`-style
recorders for the five setters and the ref.

### O-1. The fixed patience value is 30_000

| | |
|---|---|
| **Object** | The exported `CLIENT_PATIENCE_MS` |
| **Instrument** | `expect(CLIENT_PATIENCE_MS).toBe(30_000)` |
| **Direction of failure** | RED when the constant changes |
| **DOES NOT DISCRIMINATE** | **Measured: this passed on the unwrapped mutant.** A constant can exist, be exported, be asserted, and be used by nothing. It is a change-detector, not a coverage claim, and it is specified only because it must be paired with O-2 and W-2 |

### O-2. The bound fires at the constant, and not before

| | |
|---|---|
| **Object** | `generateImage(deps)`'s effect on its injected `AnnouncementImageDeps`, and the tick at which its promise settles |
| **Instrument A** | The REAL `raceWithTimeout` (not mocked), `vi.useFakeTimers()`, `generateAnnouncementImageAction` mocked to a never-settling promise, `await vi.advanceTimersByTimeAsync(29_999)` then `await vi.advanceTimersByTimeAsync(1)`, with a `settled` flag set in a `.then()` |
| **Instrument B** | Section 4.3's frozen wording literal |
| **Direction of failure** | RED at 29,999 if the promise has already settled or `setImageState` has been called with anything past `"generating"`; RED at 30,000 if it has NOT settled (this is the arm that kills the unwrapped shape), if `setImageState` was never called with `"failed"`, if it was ever called with `"ready"`, or if `setImageError` did not receive the frozen literal |
| **DISCRIMINATES** | **Yes, and it is the only one of the four outer assertions that does.** Measured: red on today's unwrapped shape, green on the wrapped reference |

Fake timers are correct *here* and not in section 5, because the requirement at
this placement **is** a fixed constant - there is no arithmetic to report a
value for, so the weaker failure message costs nothing.

### O-3. A fast success and an `{error}` result are unchanged

| | |
|---|---|
| **Object** | Same as O-2 |
| **Instrument** | The mocked action resolving `{base64, mimeType}` in one case and `{error: "..."}` in the other |
| **Direction of failure** | RED when success no longer reaches `"ready"`, or when the action's own `{error}` string no longer reaches `setImageError` verbatim |
| **DOES NOT DISCRIMINATE** | **Measured: both passed on the unwrapped mutant.** They are regression guards on the two paths that exist today, correctly, and nothing more |

**One assertion the scope's (b-outer) implies that I am NOT specifying, with the
reason:** `expect(vi.getTimerCount()).toBe(0)` after a fast success. It passes
on the unwrapped mutant trivially (there is no timer at all), so as an outer
requirement it discriminates nothing. The property it would check - that the
helper clears its timer - is already owned by `bounded-race.test.ts:53-57` and
`:59-65`, which execute today (E11: `passed=6`). Duplicating it here would add a
number to the outer file's pass count and no information.

---

## 7. The call-site walkers - a floor, not a set

The scope's (a1)/(a2) are "exclude the declaration, then assert the rest are
wrapped". **I replace the exclusion with a partition**, because an exclusion is
a denylist of declaration forms and this repo's record on denylists is bad. The
construction:

For each identifier `ID` in {`generateGeminiImage`, `generateAnnouncementImageAction`},
walk every non-test `.ts`/`.tsx` file under `src/`, strip comments (section 8),
and sort **every** occurrence of `ID(` - not preceded by an identifier
character - into exactly one of three buckets by its immediately-preceding,
whitespace-collapsed source:

| bucket | test on the preceding text | meaning |
|---|---|---|
| `declaration` | ends with `function ` | the definition |
| `bounded` | ends with `raceWithTimeout(` | a bounded call |
| `other` | everything else | **the violation** |

### W-1. Every occurrence is a declaration or a bounded call

| | |
|---|---|
| **Object** | The `other` bucket, over the whole non-test `src/` tree |
| **Instrument** | The partition above; the assertion is `expect(other).toEqual([])`, with each element rendered as `file@index after "...<60 chars of preceding text>"` so the failure names the site |
| **Direction of failure** | RED when any occurrence is neither, **including one in a directory this walk has never produced a finding in** |

EXECUTED (E8): RED on today's tree (S1a/S1b, one `other` each, at
`announcement-image.ts` and `announcementImagePipeline.ts` respectively). GREEN
on the wrapped overlay (S2a/S2b). **RED when a new unwrapped caller is
synthesized at `src/lib/workflows/registry/steps.announcement-image-bulk.ts`,
a directory neither identifier has ever appeared in** (S3a/S3b). The trap the
round-1 check named is closed by execution, not by assertion.

### W-2. The bound is sized by the intended quantity, not an inline number

| | |
|---|---|
| **Object** | The text between `raceWithTimeout(` and the closing `)` at each bounded site |
| **Instrument** | At the outer site, `/raceWithTimeout\([^;]*?CLIENT_PATIENCE_MS/` must match - the exact shape `walkthrough-announcement.structure.test.ts:350-351` already uses for `EXEMPLAR_FETCH_TIMEOUT_MS`. At the inner site, the argument must be a bare identifier (a local `waitMs`), asserted as "does not match `/raceWithTimeout\(\s*generateGeminiImage\([^)]*\),\s*\d/`" |
| **Direction of failure** | RED when a numeric literal is inlined at either site |
| **Honest limit** | This is a **source-text** check and it pins a fact, not a spelling: an identifier rather than a digit. It does NOT prove the identifier holds the right value - I-1 does that for the inner site and O-2 for the outer. It is what pairs with O-1 to stop `CLIENT_PATIENCE_MS` from being an unused constant |

### W-3. The walk is not narrowed

| | |
|---|---|
| **Object** | The walker's own collected file list |
| **Instrument A** | `expect(files.length).toBeGreaterThan(1200)` - the same construction as `src/lib/no-emojis.test.ts:270-277`, whose comment states the anti-churn rationale for a floor well below the real count. Measured today: **1593** non-test `.ts`/`.tsx` files under `src/` |
| **Instrument B** | The list must contain at least one path under each of `src/app/actions/`, `src/app/components/`, `src/lib/` |
| **Instrument C** | `expect(declaration.length).toBe(1)` - the declaration is in `src/lib/llm.ts` for one identifier and `src/app/actions/announcement-image.ts` for the other, so a walk that lost either directory loses this count |
| **Direction of failure** | RED when the walk is narrowed; RED when a second declaration appears |

EXECUTED (E8): narrowing the walk to `src/app/actions` (112 files) or
`src/app/components` (744 files) makes W-3 RED on both B and C while W-1 would
still be GREEN (S4a/S4b). **The cheap repair the check predicted is blocked, and
it is blocked by three independent assertions rather than one.** A second
`function`-form declaration in a new file is RED on C (S6 rebuilt).

### The measured hole in W-1, named rather than glossed

**An ALIASED import defeats it.** `import { generateGeminiImage as gen } from "@/lib/llm"` followed
by `await gen(p)` contains no `generateGeminiImage(` substring, so the walker
reports GREEN on a genuinely unbounded caller. Measured (E8/S8).

**What closes it, with its canary:** a second assertion that no non-test file
aliases either import -
`/import\s*\{[^}]*\bgenerateGeminiImage\s+as\s+/` (and the same for the action),
over the same walked file list. Measured: **0** occurrences in the real tree
today; the same regex **MATCHED** the synthesized aliasing file, so the canary
fires. I specify this as part of W-1. It closes re-aliasing at the import; it
does not close a re-export barrel that renames, which is residual R-B.

### A mutant I REBUILT rather than banked as a kill

My first scenario for W-3's instrument C used a `const`-arrow declaration
(`export const generateGeminiImage = async (prompt: string) => {`) and came back
**GREEN**. The tempting reading is "coverage gap, add an assertion". It is not:
that source text contains **no `generateGeminiImage(` substring at all**, so the
mutant does not produce the state it claimed to produce. It is a bad mutant. I
rebuilt it as a second `function`-form declaration, which the walker can see,
and it goes RED (S6). Reported because a kill count inflated by bad mutants is
the exact defect this seat exists to prevent, wearing a number.

---

## 8. Comment stripping - the brief's own rule is wrong here, and I measured it

The brief instructs: `.split(/\r?\n/)` plus an **unanchored** `/\/\/.*$/`. **On
the shapes these walkers depend on, that form produces a FALSE RED on a
correctly wrapped call, in three of eight cases.** So does the anchored form, in
a different case. Measured (E9), verbatim from the probe:

```
case                                                 want | tokenizer | unanchored | anchored
C1 real wrap + TRAILING comment naming the id        true | OK   true | OK   true | OK   true
C2 wrap exists ONLY in a full-line comment           false| OK   false| OK   false| OK   false
C3 a URL string on the same line as the real wrap    true | OK   true | WRONG false| OK   true
C4 real wrap after a block comment naming the id     true | OK   true | OK   true | OK   true
C5 regex literal containing a slash pair, then the real wrap true | OK   true | WRONG false| OK   true
C6 template literal containing a URL, then the real wrap true | OK   true | WRONG false| OK   true

OTHER-BUCKET cases (want 0 - a false non-zero is a FALSE RED on a correct build)
case                                                 tokenizer | unanchored | anchored
C7 real wrap + TRAILING comment holding a BARE call  OK   0       | OK   0       | WRONG 1
C8 real wrap + INDENTED full-line comment holding a BARE call OK   0       | OK   0       | OK   0
```

**THE RULING THIS IMPLIES, and it is not mine - it is already this repo's.**
`src/app/components/ui/modalAdoptionSourceScan.ts:135-155` implements
`stripComments` as a character-scanning tokenizer under **RULING 79**, and its
own header states the reason: no line-wise regex can both remove a trailing
`//` comment and leave a `//` inside a string literal alone, and the two
defects are mutually exclusive. I reproduced both halves independently and the
tokenizer is correct on all eight shapes.

**So W-1's stripper is `stripComments` imported from
`@/app/components/ui/modalAdoptionSourceScan`, and its walk is that module's
`walkFiles(dir, matches)` (`:56-67`).** Not a hand-rolled regex. The bundle
guard at `modalAdoption.wiring.test.ts:619-641` permits this: it filters
importers by `/\.test\.tsx?$/` before flagging violators, so a `*.wiring.test.ts`
importer is excluded by construction (A3).

Two consequences to carry:

- **The stripper needs its own canary in the wave's test file**, because it is
  now the thing W-1's correctness rests on: C2 (a wrap that exists only inside
  a comment must NOT satisfy W-1) and C7 (a bare call inside a trailing comment
  must NOT enter the `other` bucket). Both are one-line string fixtures.
- **`stripComments`'s own documented limitations are inherited**, verbatim from
  `modalAdoptionSourceScan.ts:151-155`: the `)`/`}` ambiguity in
  `regexAllowedHere`, and an unterminated regex scanned only to end of line.
  Neither shape occurs in the two files this wave writes (both read). Residual
  R-C.
- **No `/s` (dotAll) flag in any regex in this wave.** It passes vitest and
  fails tsc with TS1501. Every pattern above uses `[\s\S]` or is single-line.

---

## 9. The abort guard - no instrument is owed, and here is the exact reason

Both transports in `src/lib/llm.ts` independently carry the abort-terminal
guard: `isAbortError` at `:478` inside `postGenerateContent` and at `:645`
inside `postInteraction` (`grep -n "isAbortError" src/lib/llm.ts` -> 420, 478,
645). `src/lib/llm.test.ts:897-907` already **executes** it against the real
`generateGeminiImage`, mocking only `global.fetch`, asserting
`toHaveBeenCalledTimes(1)` and the exact returned value. Re-run this pass (E11):
`COVERED src/lib/llm.test.ts files=1 passed=68`.

**This wave cannot activate that guard, so no instrument in it may imply
otherwise.** Measured (E12): `raceWithTimeout` creates no `AbortSignal` and
passes none (`grep -n "signal\|AbortSignal\|AbortController" src/lib/bounded-race.ts`
-> two prose hits, `:20` and `:22`); `grep -n "signal" src/lib/llm.ts` returns
only `:406` and `:751`, both prose, and `:406`'s own text says "once a future
wave adds". Neither `fetch` call receives a `signal` option. Only threading a
real signal INTO `fetch` would activate it, and `docs/BACKLOG.md:95` rules that
a different item.

**Therefore: no test in this wave asserts anything about `AbortSignal`,
`isAbortError`, or cancellation.** The row's own instrument requirement
(`BACKLOG.md:96`) says this in the negative - "never one that greps for
AbortSignal - the presence-of-a-name shape has shipped green through five
sabotages in this repo" - and every requirement above complies: each one
observes a value, a returned object, or a partitioned source population, and
none searches for the presence of a name.

---

## 10. The test files these requirements need

Paths only. **The wave plan, not this document, decides waves and write sets.**

| Path | Holds | New/extended |
|---|---|---|
| `src/app/actions/announcement-image.test.ts` | I-1, I-2, I-3, and the nine landed assertions of I-4, unchanged | extended |
| `src/app/actions/announcement-image.wiring.test.ts` | W-1 and W-3 for `generateGeminiImage`, plus W-2's inner arm and the section-8 stripper canaries | new |
| `src/app/components/recording/announcementImagePipeline.test.ts` | O-1, O-2, O-3 | new |
| `src/app/components/recording/announcementImagePipeline.wiring.test.ts` | W-1 and W-3 for `generateAnnouncementImageAction`, plus W-2's outer arm | new |
| `src/lib/llm.test.ts`, `src/lib/bounded-race.test.ts` | Unchanged. Re-run only, as the section-3 gate names them | untouched |

**Never import a helper from another `*.test.ts`.** The two wiring files need
the same partition logic; **duplicate it** rather than sharing it, or put it in
a plain `.ts` leaf (the `src/lib/count-lines.ts` precedent). Importing it would
re-run the other file's `describe` blocks under the wrong setup.

---

## 11. The sabotage protocol

The protocol binds the implementer. It names **mutation FAMILIES**, not single
mutations, because a family is what a requirement must be robust against.

### Families, and which requirement must go RED

| # | Mutation FAMILY | Example member | Must go RED | Expected to discriminate? |
|---|---|---|---|---|
| F1 | **Replace the elapsed-aware wait with any fixed quantity** | `raceWithTimeout(generateGeminiImage(prompt), 24_000)` | I-1 rows R3, R5, R6 | **YES** - measured, 4 of 6 rows red |
| F2 | **Move the clock read so the preamble is not counted** | `startedAtMs = Date.now()` after `await requireOwner()` | I-1 rows R3, R5, R6 | **YES** - measured, identical kill set to F1 |
| F3 | **Remove or alter one clamp arm** | drop `Math.min(MODEL_WAIT_MAX_MS, ...)`; drop `Math.max(MODEL_WAIT_MIN_MS, ...)`; swap min/max; change one constant | I-1: R1 for the MAX arm, R5/R6 for the MIN arm | **YES** - measured, but note the arms are killed by DIFFERENT rows, which is why R1 and R5 are both specified |
| F4 | **Change the timeout wording, or drop the branch** | return the generic catch message on `{kind:"timedout"}` | I-3 | **YES** |
| F5 | **Drop the `{kind:"failed"}` translation** | delete `if (outcome.kind === "failed") throw outcome.error;` | I-4, via the two LANDED tests at `announcement-image.test.ts:100-112` | **YES** |
| F6 | **Remove the wrap at either call site** | restore `await generateGeminiImage(prompt)` / `await generateAnnouncementImageAction(prompt)` | W-1 (`other` non-empty); O-2 at the outer site | **YES** - measured, S1a/S1b and E7 |
| F7 | **Add an unbounded caller** | a new call in any directory | W-1 | **YES** - measured, S3a/S3b |
| F8 | **Narrow the walk** | walk only the declaring or only the calling directory | W-3 B and C | **YES** - measured, S4a/S4b |
| F9 | **Inline a numeric literal as the bound** | `raceWithTimeout(generateAnnouncementImageAction(prompt), 30000)` | W-2 | **YES** |
| F10 | **Defeat the stripper** | put the wrap in a comment; put a bare call in a trailing comment | Section 8's C2/C7 canaries | **YES** - measured |
| F11 | **Change `CLIENT_PATIENCE_MS`** | `= 20_000` | O-1, and O-2's 29,999 arm | **YES** |
| F12 | **Alias the import and call the alias** | `import { generateGeminiImage as gen }` | W-1's alias assertion | **YES** - measured, canary fires. **W-1's bucket partition alone does NOT discriminate this**, which is why the alias assertion is required rather than optional |
| F13 | **Remove `raceWithTimeout`'s own `clearTimeout`** | delete the `finally` block in `bounded-race.ts` | `bounded-race.test.ts:53-65` | **Not this wave's** - already owned, and `bounded-race.ts` is not in this wave's write set. Named so nobody sabotages a file the wave does not touch and then reports a kill for it |

### Families I expect NOT to discriminate, stated because saying so is the point

| Mutation | What stays GREEN | Why it matters |
|---|---|---|
| F1/F2/F3 against **I-3** | I-3 is GREEN on all four mutants (measured) | I-3 must never be cited as covering elapsed-awareness |
| F6 at the outer site against **O-1** and **O-3** | Both GREEN on the unwrapped mutant (measured) | O-1 in particular reads as coverage and is a change-detector |
| **R2 (preamble 24_000) and R4 (preamble 40_000)** | GREEN on every mutant I built | Which is why they are not specified (section 4.1) |
| A mutation to the **wording of `describeLlmFailure`** | Every requirement in this document | Owned elsewhere; out of scope |

### Rules of the pass

1. **Record the RED output VERBATIM**, with expected and received values.
   Measured example of the required shape, from my own run:
   `AssertionError: expected 24000 to be 18000 // Object.is equality` with its
   `- 18000 / + 24000` diff. A message of the shape
   `expected false to be true` does **not** satisfy this rule; if a sabotage
   produces only that, the assertion is the wrong shape (section 2).
2. **Restore by `cp` from a backup taken before the mutation. NEVER
   `git checkout --` on a path.** On an uncommitted file that reverts to the
   index and destroys the chunk's work, and under concurrency it can revert a
   sibling's file.
3. **A SABOTAGE THAT STAYS GREEN IS A FINDING TO TRACE, NOT A MUTATION TO SWAP
   OUT.** Two legitimate outcomes: the instrument has a gap (fix the
   instrument), or **the mutant is bad** - it mutates the wrong object, or
   produces a state the type system or the source text forbids. Say which, with
   evidence. Two instances from this pass: my `const`-arrow declaration mutant
   was bad and was **rebuilt** (section 7), and my walker harness double-counted
   an overlaid file, inflating `bounded` from 1 to 2 - a defect in my
   instrument, fixed and re-run before any number here was quoted. Neither was
   banked as a kill.
4. **Every anchored literal must be proven to occur exactly once in its file
   before it is used as a mutation anchor**, and the mutation must not destroy
   the anchor the test searches for. Prove it by parsing, not by eyeballing a
   grep: a shared opening line has already put an edit in the wrong row in this
   repo.
5. **A byte-level CR count at the END OF EVERY SABOTAGE CYCLE**, not only at the
   end of the wave, on every file the cycle touched. See section 9 below for the
   command, and do **not** use `grep -c $'\r'`.
6. **Mock `canvasFetch`, never `fetch`, on any Canvas path**, and mock
   `generateGeminiImage` rather than `fetch` on this path. A live 401 once made
   a sabotage check pass. Note the corollary that applies directly to I-1: with
   `raceWithTimeout` mocked, `generateGeminiImage(prompt)` is still *evaluated*,
   so it must be mocked or `vitest.setup.ts:34-53` throws.
7. **No two agents sabotage-verify on the tree at once**, and **exactly one
   caller runs `npx tsc --noEmit`**.

### The CR instrument, measured in both directions

`grep -c $'\r'` **is not usable here, and this was reproduced this pass, not
recalled.** Against a file holding **68** CR bytes it reports `0` with exit
`1` - the same reading it gives a clean file. `Select-String -Pattern "\`r"`
reports `0` on the same file. Both are false-clean.

| Shell | Command that WORKS | Measured: clean file / 68-CR file |
|---|---|---|
| Bash | `tr -dc '\r' < <file> \| wc -c` | `0` / `68` |
| PowerShell | `([IO.File]::ReadAllBytes($f) \| Where-Object { $_ -eq 13 }).Count` | `0` / `68` |

The canary was a byte-for-byte CRLF copy of
`src/app/actions/announcement-image.ts`, made **outside the repository**, so the
instrument was proven to fire on the condition it exists to detect, using the
same filter.

---

## 12. Reference implementation - the red tests are satisfiable

A set of failing tests is not a specification until something has passed it.
Built this pass, in the scratchpad probe tree, importing the REAL
`@/lib/bounded-race`, the REAL `@/lib/llm` formatters via `vi.importActual`, the
REAL `@/lib/take-announcement` prompt builder, and the REAL
`announcementImagePipeline.ts` for its type and its baseline:

| Reference | Requirements it satisfies | Result |
|---|---|---|
| Inner, elapsed-aware | I-1 (4 specified rows, plus the 2 measured-redundant ones), I-2, I-3 | **8/8 green** |
| Inner, elapsed-aware, real `raceWithTimeout` | I-4, all nine landed assertions | **9/9 green** |
| Outer, wrapped | O-1, O-2, O-3 | **4/4 green** |
| Walker, wrapped-tree overlay | W-1, W-2, W-3 | **GREEN on both identifiers** |

**No criterion above required an implementation I could not write.** Nothing was
changed to make a criterion satisfiable; what changed as a result of building
them is recorded honestly: R2 and R4 were **dropped** as measured-redundant,
W-1's comment stripper was **changed** from the brief's regex to the landed
tokenizer, W-1 gained the **alias assertion**, and O-3's
`getTimerCount()` assertion was **dropped** as already owned.

---

## 13. Residual register

Every row names an owner, an instrument, and the step that will measure it.
A row missing any of the three would be a deletion, and I would call it that.

| # | What is not proven here | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| R-A | Whether an instructor can distinguish the three failure states on screen - model failure, inner (server) timeout, outer (client) timeout. All three land in the same `imageState === "failed"` branch rendering `{imageError}` (`TakeAnnouncementPanel.tsx:564-567`), with three different strings | Repo owner / a UX pass on the as-built diff | Real browser observation. **No component is rendered by any test here**, so this is a reading claim and cannot be an instrument in this wave | Fails if the three states are technically distinct but read as identical or illegible | A follow-up UX pass against the as-built diff |
| R-B | Whether a re-export barrel that RENAMES either export could hide an unbounded caller from W-1. The alias assertion closes `import { X as y }`; it does not close `export { X as y } from "..."` followed by a call to `y` | Next agent extending W-1 | A walk over `export {` blocks with a rename, over the same file list, with a synthesized-renaming canary | Fails if a renaming re-export exists and is called unbounded | Measured today as absent for both identifiers by the same walk that found 0 aliased imports - re-measure whenever either module gains a barrel |
| R-C | `stripComments`'s two documented limitations (`modalAdoptionSourceScan.ts:151-155`): `regexAllowedHere`'s `)`/`}` ambiguity, and an unterminated regex | Whoever owns RULING 79's tokenizer | That module's own test coverage | Fails if either shape appears in a file W-1 walks and flips a bucket | Neither shape occurs in the two files this wave writes (both read in full). Re-check at the next wave that adds a regex literal near either call site |
| R-D | Whether 24,000 ms (inner) and 30,000 ms (outer) are generous enough for a real Gemini **image** call. **No real timeout can be observed here: the network is blocked and there are no API keys** | Repo owner, live key required | One timed image generation against production Gemini, elapsed time read as `llm.ts:555-557` already instruments `callGemini` | Fails if the image call times out under either bound at a rate the owner finds unacceptable | An owner-run timed check after the wave ships |
| R-E | OC5, the platform's unconfigured Server Action ceiling | Repo owner | The Vercel project settings page (`docs/a29-architecture.md:285`) | N/A - a measurement residual | Whenever OC5 is answered for any row. RULING 94 makes this row's correctness independent of it |
| R-F | That the two new wiring test files pass `npx tsc --noEmit` and `npm run lint` | The wave gate | `npx tsc --noEmit --incremental false`; `npm run lint` with the exit-0-and-no-new-warning-in-written-files condition | Fails on any tsc output, or a new warning in a file this wave writes | The wave gate. **I did not run tsc**: exactly one caller may, and it is the wave gate, not this seat |

---

## 14. Tree state at the end of this pass

```
git status --short
```

Run after this document was written:

```
 M docs/css-orphans.md
?? docs/g5-test-notes.md
```

`?? docs/g5-test-notes.md` is **this pass's only entry**. ` M docs/css-orphans.md`
is sibling-owned and pre-existing - it was present in this session's opening
`git status` snapshot before this pass began, and was neither opened nor
touched here.

`docs/a44-architecture.md`, the live sibling named in the brief, was **not
opened, read or referenced**; it no longer appears as untracked, so it was
committed by its own author during this pass. Its write set does not intersect
this document's.

**No `git stash`, no `git add -A`, and no `git checkout --` was run on any
path, sibling or otherwise. `docs/backlog.yml` was not read or touched** - every
backlog citation went through `grep -a -n "G5" docs/BACKLOG.md` (the G5 row is
line 96 of that output, the G4 row line 95).

**No file under `src/` was written or mutated.** Everything executed in section
1 ran from `.../scratchpad/g5probe`, outside the repository, against a vitest
config whose `root` is the repo (so real modules resolve through the same `@`
alias) and whose `include` is an absolute glob pointing back into the
scratchpad. The one repository command that executed anything was
`npm run test:paths -- src/lib/llm.test.ts src/app/actions/announcement-image.test.ts src/lib/bounded-race.test.ts`,
which ran existing tests only. The CRLF canary is a copy made in the
scratchpad, not in the tree.

**No scratch directory was created inside the repository, verified with a
canary because `find` exits 0 when it matches nothing:**
`find . -maxdepth 2 -name "*.probe.test.ts" -not -path "./node_modules/*"`
returns empty with exit 0, and the same filter against a file that does exist,
`find . -maxdepth 2 -name "vitest.config.ts" -not -path "./node_modules/*"`,
returns `./vitest.config.ts` with exit 0 - so the empty output is the evidence,
not the exit code.
