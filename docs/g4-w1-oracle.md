# G4 Wave 1 test notes + frozen oracle: src/lib/llm-deadline.ts

Test-seat artifact for G4 Wave 1 (the dark pure leaf `src/lib/llm-deadline.ts`),
authored BEFORE any implementer builds it so the implementer builds to pinned
values rather than guessing. Consumes `docs/g4-timeout-bounding-scope.md`
(section 5 Wave 1, F2, F5) and `docs/g4-acceptance-criteria.md` (AC-1 inherited
RULING 76). READ-ONLY on production code: this pass wrote exactly
`docs/g4-w1-oracle.md`.

Every quantity below names the command or `file:line` that produced it. All
numbers were measured against the real tree this session (2026-10-11), not
recalled. The reference implementation and the whole frozen table were executed
in node (scratchpad `ref.js`); the run output is pasted in section 7.

---

## 0. What this leaf is, and what it is NOT

`src/lib/llm-deadline.ts` does not exist yet (`ls src/lib/llm-deadline.ts` ->
"No such file or directory") and no symbol named `remainingModelBudgetMs`
exists anywhere in `src` (`grep -rn "remainingModelBudgetMs" src` -> empty). So
Wave 1 is a greenfield pure leaf; there is no prior shape to preserve.

It holds the LLM first-attempt timeout budget constants and ONE pure,
elapsed-aware helper. It is a plain `.ts` leaf (NOT under `"use server"`) so the
test can import the constants and unit-test the helper with no mock, no clock
patch, no render, no network. Wave 1 ships it DARK: no route and no client
consumer yet, so it bounds nothing. The leaf's own unit test IS the caller that
exercises the export (state this at the wave gate so it does not read as dead
code - `docs/g4-timeout-bounding-scope.md:381-385`).

This leaf is pure arithmetic. All of AC-1's route-level behaviour (the race, the
worded 504, `maxDuration`) is Wave 2/3 and is NOT testable here (no component
renders; `vitest.setup.ts` throws on real fetch - MEMORY tests-are-network-
blocked). Section 6 lists exactly what is argued-only versus executable.

---

## 1. The constants, pinned to the shipped precedent (measured)

RULING 77 adopts `TOTAL_BUDGET_MS = 50_000` and a 2s reserve from
`class-trends-insight/route.ts`. The full constant family is confirmed IDENTICAL
across the TWO shipped interactive-LLM route precedents, so these are not
invented numbers - they are the repo's adopted values:

| Constant | Value | Source (command: `grep -n <name> <file>`) |
|---|---|---|
| `TOTAL_BUDGET_MS` | `50_000` | `class-trends-insight/route.ts:47` |
| `MODEL_WAIT_MIN_MS` | `8_000` | `class-trends-insight/route.ts:48` AND `course-intel/ask/route.ts:171` |
| `MODEL_WAIT_MAX_MS` | `24_000` | `class-trends-insight/route.ts:49` AND `course-intel/ask/route.ts` (grep hit, same block) |
| `MODEL_WAIT_RESERVE_MS` | `2_000` | `class-trends-insight/route.ts:51` |

Confirmed the paths: `src/app/api/class-trends-insight/route.ts` (opened lines
28-157) and `src/app/api/course-intel/ask/route.ts` (opened lines 134-172,
421-424, 820-823).

`course-intel/ask/route.ts:145` uses `TOTAL_BUDGET_MS = 54_000` and a
`MODEL_WAIT_RESERVE_MS = PERSIST_WAIT_MS + 2_000` (`:172`); it is named here only
so nobody invents a THIRD budget. Wave 1 adopts `class-trends-insight`'s 50000 /
2000 per RULING 77, not course-intel's 54000. Both routes share MIN=8000 and
MAX=24000, which is what makes 8000 the grounded MIN (see section 2).

---

## 2. The chosen MODEL_WAIT_MIN_MS and its justification

**MODEL_WAIT_MIN_MS = 8_000.**

The scope left MIN UNSPECIFIED and required a repo-grounded choice with stated
reasoning. 8000 is grounded two ways:

1. **It is the shipped, adopted value in BOTH precedent routes**, not one:
   `class-trends-insight/route.ts:48` and `course-intel/ask/route.ts:171` each
   define `MODEL_WAIT_MIN_MS = 8_000`, alongside the exact
   `TOTAL/MAX/RESERVE` family RULING 77 adopts. Choosing a different MIN here
   would make the new leaf inconsistent with the two routes it is extracted from
   and would be an unmotivated number - exactly what the brief forbids.
2. **Semantic floor:** 8s is the smallest wait below which a Gemini JSON
   generation on these paths cannot plausibly return. `GENERATION_CONFIG` on the
   precedent is `maxOutputTokens: 2048, responseMimeType: "application/json"`
   (`class-trends-insight/route.ts:53`); a structured 2048-token generation that
   has not begun returning inside 8s will not finish usefully. A wait below that
   buys a near-certain timeout while still paying the fixed call setup, so below
   8s the correct action is to NOT START the call (section 3's sentinel), never
   to wait a doomed 2-3s.

This is a chosen value recorded as the test seat's reading, consistent with the
precedent; the owner redirects at one message's cost if a different floor is
wanted.

---

## 3. The helper contract (exact signature + clamp arithmetic)

### 3.1 Signature (PURE - `now` is a parameter, not `Date.now()` inside)

```
export function remainingModelBudgetMs(startedAtMs: number, now: number): number;
```

- `startedAtMs`: the ms timestamp captured once when the handler started
  (`const startedAtMs = Date.now()` at the top of the route's `POST`, matching
  `class-trends-insight/route.ts:94`).
- `now`: the current ms timestamp at the moment the NEXT model attempt is about
  to be made. The precedent inlines `Date.now()` here
  (`class-trends-insight/route.ts:143`); Wave 1 lifts it to a PARAMETER so the
  helper is pure and unit-testable WITHOUT `vi.useFakeTimers()` or a clock mock.
  The route passes `remainingModelBudgetMs(startedAtMs, Date.now())` at the call
  site - that `Date.now()` lives in the route (Wave 2), not in this leaf.
- Return: the ms to allow the next model attempt, OR the sentinel `0` meaning
  "do not start a call" (section 3.3).

Elapsed is `now - startedAtMs`. The helper is elapsed-aware per RULING 76: across
a multi-call invocation each call recomputes against the SAME `startedAtMs`, so
later calls get a smaller budget and eventually the sentinel. S2 (learning
resources) makes two `callLlm` calls per concept in a loop
(`learning-resource-links.ts:269,:338`), so the multi-call case is live, not
hypothetical - which is exactly why section 3.3 diverges from the precedent.

### 3.2 The clamp formula (the checker's flagged ambiguity, RESOLVED)

The checker flagged "clamp-then-subtract-reserve vs subtract-then-clamp" as
ambiguous. It is NOT ambiguous in this repo: BOTH shipped precedents use the
IDENTICAL order - **subtract the reserve FIRST, then clamp**, with the floor
applied INSIDE the cap:

```
class-trends-insight/route.ts:143-144
  remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();
  waitMs = Math.min(MODEL_WAIT_MAX_MS, Math.max(MODEL_WAIT_MIN_MS, remainingMs - MODEL_WAIT_RESERVE_MS));

course-intel/ask/route.ts:421-424 and :820-823  (identical shape)
  remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();
  Math.min(MODEL_WAIT_MAX_MS, Math.max(MODEL_WAIT_MIN_MS, remainingMs - MODEL_WAIT_RESERVE_MS))
```

So the pinned arithmetic is **subtract-then-clamp**. Define the intermediate:

```
afterReserve = (startedAtMs + TOTAL_BUDGET_MS - now) - MODEL_WAIT_RESERVE_MS
             = TOTAL_BUDGET_MS - (now - startedAtMs) - MODEL_WAIT_RESERVE_MS
             = 50000 - elapsed - 2000
             = 48000 - elapsed
```

### 3.3 The under-MIN decision: SENTINEL 0 (the safe reading), a JUSTIFIED divergence from precedent

This is the one real correctness fork. The precedent resolves it one way; Wave 1
resolves it the other way, on purpose, and the conflict is RECORDED here rather
than silently adopted either direction.

- **Precedent behaviour (both routes):** `Math.max(MODEL_WAIT_MIN_MS, afterReserve)`
  floors to MIN. When `afterReserve < MIN` (little or no budget left) the
  precedent returns 8000 and the route then STARTS an 8s-bounded call. In a
  SINGLE-call handler (which both precedents are) this is near-harmless, because
  the budget is computed right after fast setup so `afterReserve` is ~47000 and
  the floor branch essentially never fires.
- **Why Wave 1 must NOT floor to MIN:** this leaf is explicitly ELAPSED-AWARE and
  MULTI-CALL (RULING 76; S2's two-calls-per-concept loop). In the over-budget
  case a later call can have `afterReserve` near zero or negative. Flooring to
  MIN there starts an 8s call when only ~1s of real budget remains before the
  platform kill - so the platform kills mid-call and the handler NEVER returns
  the worded error. That is the EXACT harm G4 exists to remove (AC-2: a worded,
  distinguishable outcome, never a raw transport failure). A criterion satisfied
  one step short of the user-visible effect is the failure mode this seat guards
  against: flooring to MIN "bounds the call" while defeating the invariant.
- **Chosen contract:**

```
remainingModelBudgetMs(startedAtMs, now):
  afterReserve = (startedAtMs + TOTAL_BUDGET_MS - now) - MODEL_WAIT_RESERVE_MS
  if afterReserve < MODEL_WAIT_MIN_MS:  return 0           // SENTINEL: do not start a call that cannot finish
  return Math.min(MODEL_WAIT_MAX_MS, afterReserve)          // guaranteed in [MIN, MAX]
```

  The return is therefore EITHER `0` OR a value in `[MIN, MAX]`; it is never a
  positive number below MIN and never above MAX and never negative. For
  `afterReserve >= MIN` the result is byte-identical to the precedent
  (`Math.max(MIN, afterReserve)` equals `afterReserve` once `afterReserve >= MIN`).
  The ONLY divergence is below MIN: precedent returns MIN, Wave 1 returns 0.

### 3.4 Caller obligation (route usage note - Wave 2, NOT tested by this leaf's unit test)

`raceWithTimeout` does NOT cancel the loser; losing the race only stops the
caller waiting (`bounded-race.ts:26-29`, opened). Therefore the route MUST branch
on the sentinel BEFORE constructing the `callLlm` promise:

```
const budgetMs = remainingModelBudgetMs(startedAtMs, Date.now());
if (budgetMs <= 0) return wordedTimeoutResponse(/* 504, "... timed out ..." */);
const outcome = await raceWithTimeout(callLlm(req, provider), budgetMs);
```

Passing `0` into `raceWithTimeout(callLlm(...), 0)` would STILL fire the network
call (burning Gemini quota) and only then report `timedout` - defeating the point
of the sentinel. This obligation is argued, not executable here (it needs the
route, which is Wave 2); it is recorded as residual OR-1 in section 8 so Wave 2
cannot drop it.

---

## 4. The frozen-LITERAL oracle (hard-coded expected numbers)

These are hand-frozen expected values, NOT derived from the implementation
(refactor-disarms-tests / source-text-tests-overspecify: pin the computed VALUES
and the arithmetic behaviour, never the source spelling). The implementer writes
these literals into the test; the test must NOT recompute them from the helper's
own constants.

Constants frozen into the oracle: TOTAL=50000, RESERVE=2000, MIN=8000, MAX=24000.
`elapsed = now - startedAtMs`. `afterReserve = 48000 - elapsed`.

| # | startedAtMs | now | elapsed | afterReserve | EXPECTED | Case it pins |
|---|---|---|---|---|---|---|
| R1 | 1000000 | 1000000 | 0 | 48000 | **24000** | normal: plenty of budget -> capped at MAX |
| R2 | 7000000 | 7000000 | 0 | 48000 | **24000** | shift-invariance twin of R1 (different absolute times, same elapsed, same output) |
| R3 | 1000000 | 1024000 | 24000 | 24000 | **24000** | boundary EXACTLY at MAX (`afterReserve == MAX`) |
| R4 | 1000000 | 1030000 | 30000 | 18000 | **18000** | mid linear region (`MIN < afterReserve < MAX`) |
| R5 | 9000000 | 9030000 | 30000 | 18000 | **18000** | shift-invariance twin of R4 (large absolute shift) |
| R6 | 1000000 | 1040000 | 40000 | 8000 | **8000** | boundary EXACTLY at MIN (`afterReserve == MIN` -> returns MIN, NOT sentinel) |
| R7 | 1000000 | 1040001 | 40001 | 7999 | **0** | just below MIN -> SENTINEL (near-exhaustion, "do not start") |
| R8 | 1000000 | 1048000 | 48000 | 0 | **0** | over-budget boundary (`remaining == RESERVE`, afterReserve == 0) |
| R9 | 1000000 | 1055000 | 55000 | -7000 | **0** | well over budget -> 0, never negative |

Why the shape matters (the elapsed-aware discriminator, from G5's finding that a
single-tick assertion passes for BOTH a literal and an elapsed-aware impl):

- Elapsed is ADVANCED across rows (0 -> 24000 -> 30000 -> 40000 -> 40001 ->
  48000 -> 55000), so a fixed-literal impl that ignores elapsed (e.g. "always
  return 24000") fails R4/R6/R7/R8/R9.
- R2 and R5 are SHIFT-INVARIANCE TWINS: same elapsed as R1 and R4 but with
  `startedAtMs`/`now` shifted by millions. An impl that reads only `now` (or only
  `startedAtMs`) produces a different number for the twin and fails. This forces
  the helper to compute `now - startedAtMs`, not either argument alone.
- Both boundaries are pinned EXACTLY (R3 at MAX, R6 at MIN) plus one row just
  past the MIN boundary (R7) so the sentinel threshold is nailed to the
  millisecond.

The axes (the `(startedAtMs, now)` inputs) are authored by hand and are a
DIFFERENT source from the expected-value column (also authored by hand, frozen);
neither is computed from the other, so there is no branch that cannot fire
(`seats.md` test-seat rule: axes from a different source than the generator).

---

## 5. Sabotage / mutant set -> which frozen row catches each

F5 names 3 mutants (drop MAX clamp, drop MIN floor, drop reserve subtraction).
All three are caught. Two EXTRA mutants are included because they are the exact
failure modes this item's history warns about: M4 pins the arithmetic ORDER the
checker flagged, and M5 pins the chosen under-MIN divergence against the shipped
precedent. Every mutant is RED on its catcher row and GREEN on the reference impl
(red-in-one-direction = discriminating). None is red-in-both or green-in-both.

Executed against the table in node (section 7 is the raw run):

| Mutant | What it changes | Catcher row(s): correct -> mutant | Discriminates? |
|---|---|---|---|
| **M1 drop MAX clamp** (`return afterReserve` instead of `min(MAX, afterReserve)`) | removes the cap | **R1**: 24000 -> 48000 RED (also R2) | YES. Green on sentinel rows R7-R9, so not red-in-both. |
| **M2 drop MIN floor / sentinel** (`return min(MAX, afterReserve)` unconditionally) | removes the "do not start" branch | **R7**: 0 -> 7999 RED (also R9: 0 -> -7000) | YES. Green on R1-R6, so discriminates. |
| **M3 drop reserve subtraction** (`afterReserve := 50000 - elapsed`) | removes `- RESERVE` | **R4**: 18000 -> 20000 RED (also R5, R6, R7) | YES. Green on R1/R2/R3 (saturated at MAX), so discriminates. |
| **M4 ORDER SWAP** clamp-then-subtract (`min(MAX,max(MIN,raw)) - RESERVE`) | the checker's flagged ambiguity, wrong order | **R1**: 24000 -> 22000 RED (also R2, R3) | YES. Proves the ORDER is pinned, not just the presence of each op. |
| **M5 PRECEDENT floor-to-MIN** (`min(MAX, max(MIN, afterReserve))`, no sentinel) | the shipped routes' behaviour applied here | **R7**: 0 -> 8000 RED (also R8, R9) | YES. Proves Wave 1's under-MIN divergence is enforced, not just documented. |

Mapping to F5's named three: M1 is "drop the MAX clamp", M2 is "drop the MIN
floor", M3 is "drop the reserve subtraction". Each is caught by a row that exists
in the table above - no mutant required a new row to be added. M4 and M5 are
additional, deliberately retained kills (reported explicitly, not banked as
coverage inflation - `seats.md` practice 2).

No mutant was REBUILT or discarded as a bad instrument this round: all five
mutate the single object under test (`remainingModelBudgetMs`'s return), all five
produce a type-valid `number`, and all five are red on exactly one side. If the
implementer finds a sixth mutant that survives, the rule is to check whether it
is a real gap or a bad mutant before adding an assertion (`seats.md` practice 2).

---

## 6. Executable here vs argued-only (labelled, per the seat's hard rule)

**EXECUTABLE in this checkout (node-env vitest, no mock, no clock patch):**
- The full frozen table in section 4 against `remainingModelBudgetMs` - pure
  arithmetic, 9 literal rows.
- All five mutants in section 5 - each sabotages the helper and the designated
  row goes red (proven in node, section 7).
- The constants' exact values (a direct equality assertion that
  `TOTAL_BUDGET_MS === 50000` etc.), so a future edit to a constant is caught.

**ARGUED ONLY (NOT asserted as verified - stated so the checker/implementer do
not mistake argument for evidence):**
- The caller-branches-on-sentinel-before-callLlm obligation (section 3.4): needs
  the Wave 2 route; recorded as OR-1.
- That the route returns a worded 504 before the platform kill: no network, no
  key, nothing renders (AC-2 OWNER half; AC R-2). Wave 2/owner.
- That a user SEES a legible "timed out" state: no component renders under vitest
  (AC R-3). Owner/UX walk.
- That 8000ms MIN and 50000ms TOTAL are generous enough for a real Gemini run on
  the deployed path: no key (AC R-2). Owner post-deploy.

A green Wave 1 suite proves the ARITHMETIC is correct. It proves NOTHING about
the route, the race wiring, the worded body, or the rendered state - those are
Wave 2/3 and owner verification. This is stated rather than left for a passing
suite to imply otherwise.

---

## 7. Satisfiability proof (reference implementation run green)

Per the elevated-seat obligation ("prove the red tests are satisfiable - build a
reference implementation and get it green"), the reference impl in section 3.3
was executed against the full frozen table and all five mutants in node
(scratchpad `ref.js`). Raw output:

```
=== REFERENCE vs frozen table ===
R1 elapsed=0 expected=24000 got=24000 OK
R2 elapsed=0 expected=24000 got=24000 OK
R3 elapsed=24000 expected=24000 got=24000 OK
R4 elapsed=30000 expected=18000 got=18000 OK
R5 elapsed=30000 expected=18000 got=18000 OK
R6 elapsed=40000 expected=8000 got=8000 OK
R7 elapsed=40001 expected=0 got=0 OK
R8 elapsed=48000 expected=0 got=0 OK
R9 elapsed=55000 expected=0 got=0 OK
REFERENCE ALL PASS: true

=== MUTANT kills (rows that go RED) ===
M1 drop MAX clamp      : R1(got 48000 != 24000), R2(got 48000 != 24000)
M2 drop MIN floor/sent : R7(got 7999 != 0), R9(got -7000 != 0)
M3 drop reserve sub    : R4(got 20000 != 18000), R5(got 20000 != 18000), R6(got 10000 != 8000), R7(got 9999 != 0)
M4 order swap(clamp 1st): R1(got 22000 != 24000), R2(got 22000 != 24000), R3(got 22000 != 24000)
M5 precedent floor-MIN : R7(got 8000 != 0), R8(got 8000 != 0), R9(got 8000 != 0)
```

The 9 red rows are satisfiable (one function passes them all) and every mutant is
killed. The spec is therefore a real specification, not a contradiction resolved
by dropping an assertion.

---

## 8. Implementer build notes (so the test and the leaf match)

- The leaf is a plain `.ts` file under `src/lib/`, NOT `"use server"`, exporting
  the four constants and `remainingModelBudgetMs`. It imports nothing.
- The implementation MUST use the subtract-then-clamp order of section 3.2 and
  the sentinel of section 3.3. Do not copy the precedent's `Math.max(MIN, ...)`
  floor verbatim: that is M5, which the test kills.
- The test file is `src/lib/llm-deadline.test.ts`. It imports from
  `@/lib/llm-deadline`, asserts each of the 9 frozen rows as a hard-coded literal
  (do NOT recompute expecteds from the imported constants - that would be an
  assertion reading a value the implementation also reads, which passes forever),
  and asserts each constant's exact value.
- Do NOT import any helper from another `*.test.ts` (re-runs its describe blocks
  - MEMORY no-cross-test-file-imports). This leaf's test is self-contained.
- No `/s` (dotAll) regex anywhere (fails tsc TS1501) - not that this pure leaf
  needs any regex; noted because it is a repeated trap.
- Wave gate for Wave 1: `git status --short` shows exactly
  `src/lib/llm-deadline.ts` and `src/lib/llm-deadline.test.ts`; run
  `src/file-size-ceiling.structure.test.ts` (the one unconditional canary) plus
  this new test. Two test files -> `npm run test:paths src/lib/llm-deadline.test.ts src/file-size-ceiling.structure.test.ts`,
  never a raw multi-path vitest (MEMORY test-paths-wrapper). `@(Get-Content
  src/lib/llm-deadline.ts).Count` is trivially < 1000.

---

## 9. Residual register (owner / instrument / step - each present or it is a deletion)

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| OR-1 | The route must branch on the sentinel (`budgetMs <= 0`) and return the worded error BEFORE constructing the `callLlm` promise; `raceWithTimeout` does not cancel work, so passing 0 into it still fires the call (`bounded-race.ts:26-29`). | Wave 2 implementer | A route test: mock `callLlm` as a spy, drive the handler with a fully-elapsed clock (startedAtMs far in the past) so the budget is the sentinel, assert `callLlm` was NEVER called AND the handler returned the worded 504. | Wave 2 (discussion-replies route) build + its route test |
| OR-2 | MIN=8000 is the test seat's chosen floor, consistent with both precedents but not an owner ruling. If a real deployed run shows 8s is too generous or too tight, the floor moves. | Repo owner | Post-deploy: observe whether any in-scope run that would have finished under 60s is cut by the 8s floor / sentinel, and whether any doomed call still slips past. | AC R-2 post-deploy owner verification |
| OR-3 | The shipped precedents (`class-trends-insight/route.ts:144`, `course-intel/ask/route.ts:424,:823`) floor to MIN with no sentinel, so in principle a future multi-call refactor of EITHER could start a doomed call in the over-budget case. Out of G4 W1 scope (single-call handlers today), recorded so it is not lost. | Whoever next makes either route multi-call | A route test asserting the over-budget path returns a worded error without starting a call. | The next chunk that loops `callLlm` inside either precedent route |

These residuals exist only in this document until the orchestrator files them as
rows in `docs/BACKLOG.md`; `iteration-caps.md` counts an unfiled residual as not
yet real.

---

## 10. Verification of this document's own write set

This pass wrote exactly `docs/g4-w1-oracle.md`. No file under `src/`, no test
file, no other `docs/` file was opened for writing. Commands run this session:
`ls src/lib/llm-deadline.ts`; `grep -rn "remainingModelBudgetMs" src`;
`grep -rn` for the four constants in the two route files; `node ref.js` (in the
scratchpad, outside the repo tree). Every cited `file:line` was opened:
`bounded-race.ts:1-75`, `class-trends-insight/route.ts:28-157`,
`course-intel/ask/route.ts:134-172` and the grep-confirmed `:421-424`/`:820-823`.
The divergence from precedent (sentinel vs floor-to-MIN) is recorded in section
3.3 as a justified choice, with the precedent behaviour pinned as mutant M5, not
silently adopted or silently overridden.
