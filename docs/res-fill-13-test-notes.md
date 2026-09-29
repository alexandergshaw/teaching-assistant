# RES-FILL-13 test notes / frozen oracle

Area: grading. Round 1 of the two-round cap (`AGENTS.md` "Two rounds, then
ask"); a fresh `loop-checker` gates this artifact before any consumer acts on
it. Design only: no production code, no test code written here.

Consumes the settled, checked scope `docs/res-fill-13-scope.md` (root cause,
AC-1..AC-4, Findings A/B/C, the silent-green disclosure). This document turns
that scope's AC into instruments: for each, the object under comparison, the
instrument that produces each quantity, the DIRECTION of failure, and a named
sabotage that goes RED one way and GREEN the other and is stated to
discriminate or not.

The one thing this seat must not let ship: an instrument that reports GREEN
without measuring what it claims. RES-FILL-13's fix is a scroll, and a scroll
is a render. This repo renders no component under vitest. So the load-bearing
proof is an owner walk (AC-3), and the machine-checkable half is deliberately
scoped to what source text can honestly establish and no further. The most
important lines in this document are the ones that say what the source-text
instrument CANNOT prove.

---

## 0. Frozen facts (each names the command or file:line that produced it)

All reads below are of the real tree at this session, not the design doc.

- **F-a. The effect and its dependency literal.** `GradingTab.tsx:237-245`
  (Read). Line 245 is verbatim: `  }, [runResetKey(runKey, displayRun)]);`.
  The guard is `GradingTab.tsx:238`: `if (displayRun && resultsRef.current)`.
- **F-b. `runResetKey`.** `gradingResultsHelpers.ts:735-737` (Read):
  `return runKey ?? run;`. When `runKey` is defined, `run` (i.e. `displayRun`)
  is not in the returned value.
- **F-c. `selectRunKey`.** `incrementalRunPlan.ts:292-293` (Read):
  `return phase === "idle" ? undefined : ` then the template
  `incremental-${runId}`. Constant string for a whole incremental run's
  lifetime once `phase` leaves `idle`.
- **F-d. `selectDisplayRun`.** `incrementalRunPlan.ts:280-286` (Read):
  `return phase === "idle" ? wholeRun : incrementalRun;`.
- **F-e. The batched flip.** `useIncrementalGradingRun.ts:236-242` (Read):
  `runIdRef.current += 1;` then `setPhase("running"); setIncrementalRun(null);`
  in the same update batch. At the render where `runKey` first becomes
  `incremental-<N>`, `displayRun` is `null`, so the effect's own guard is false
  and no scroll fires. No later render changes the dependency again for that
  run.
- **F-f. Hook return signals available for a latch.**
  `useIncrementalGradingRun.ts:61-68` (Read) returns `incrementalRun`,
  `incrementalDone`, `incrementalRunning`, `phase`, `runId`. Initial state:
  `incrementalRun` starts `null` (`:115`), `incrementalDone` starts `0`
  (`:117`).
- **F-g. `beginWholeRun`.** `useIncrementalGradingRun.ts:128-132` (Read):
  `setPhase("idle"); setIncrementalRun(null); submitWholeRun(fd);`. It never
  advances `incrementalDone`; `incrementalDone` is only advanced on the
  incremental pool path (`:202`, `setIncrementalDone(doneCount)`).
- **F-h. The F25 frozen test.** `autoGradeTransition.wiring.test.ts:461-474`
  (Read). Its slice is `depsStart = indexOf("}, [", idx)` then
  `depsEnd = indexOf(")", depsStart)` (`:465-467`) - the FIRST `)` after
  `}, [`. It asserts the slice contains `runResetKey(` and does NOT match
  `/\[\s*displayRun\s*\]/`, `/\[\s*run\s*\]/`, `/\[\s*state\.run\s*\]/`.
- **F-i. Anchor uniqueness in `GradingTab.tsx`.** `scrollIntoView(` occurs
  exactly once (Grep `scrollIntoView\(`, one hit at `:239`); `}, [` occurs
  exactly once (Grep `}, \[`, one hit at `:245`). Both slice anchors used
  below are unambiguous in this file.
- **F-j. The test source is comment-stripped.**
  `autoGradeTransition.wiring.test.ts:99`:
  `const gtSource = stripComments(readFileSync(GRADING_TAB_PATH, "utf8"));`,
  with a canary at `:28-35`. The dep line (F-a) carries no comment, so
  stripping does not alter the text any slice below reads. The `//` block at
  `GradingTab.tsx:241-244` is removed before slicing, so no assertion below can
  be fooled by the word `displayRun` appearing inside that comment.
- **F-k. The fix shape (from scope, not re-decided here).** The recommended fix
  is ADDITIVE: append a first-arrival term after `runResetKey(runKey,
  displayRun)` inside the SAME effect's dependency array, reusing the existing
  ref, node, mount, and whole-run branch untouched
  (`docs/res-fill-13-scope.md` AC-4, Finding B).

**Consequence of F-h + F-k, verified by simulating the slice by hand.** With
the additive fix `}, [runResetKey(runKey, displayRun), incrementalDone > 0]);`,
F25's `depsEnd = indexOf(")", depsStart)` still lands on the `)` that closes
`runResetKey(runKey, displayRun)`. F25's slice is therefore
`}, [runResetKey(runKey, displayRun)` - identical to today's - and the appended
term `, incrementalDone > 0` is OUTSIDE F25's slice entirely. So:

1. F25 stays GREEN under the additive fix with NO edit (this is scope Finding
   B, now confirmed against the real slice code at `:465-467`).
2. F25 CANNOT serve as AC-1's instrument, because it does not see the added
   term and is already GREEN on today's unchanged source. AC-1 needs its own,
   WIDER slice. This is the single most important construction fact in this
   document.

---

## 1. The instrument boundary (executable here vs argued vs owner-verified)

- **Machine-checkable here (node-env vitest, source text only):** the
  dependency array's TEXT changed from the frozen literal, still contains
  `runResetKey(`, references a named signal known to change during an
  incremental run (`incrementalDone` / `incrementalRun`), and is not a bare
  `[displayRun]`. This is AC-1 and the machine-checkable half of AC-2.
- **Checker JUDGMENT (argued, not asserted green):** that F25's INTENT
  (fire at most once per run) was carried forward rather than gutted. Scope
  Finding C. Not machine-checkable - a stripped-down F25 still passes vitest.
- **Owner-verified only (AC-3):** that the viewport actually scrolls to the
  results at first arrival and does NOT re-scroll on every later row. Nothing
  in this repo can run this. It is a render.

**The claim I refuse to make:** that any source-text assertion proves the
scroll fires. It cannot. Section 4 attacks AC-1 with a passing-but-wrong
implementation to show exactly where the source-text half ends.

---

## 2. Requirements

### R1 - AC-1: the dependency gained a first-arrival signal (machine-checkable)

- **Object under comparison:** the TEXT of the scroll effect's dependency
  array in `GradingTab.tsx` (F-a), before vs. after the fix.
- **Instrument:** a NEW source-text assertion (separate `it`/`describe` from
  F25, co-located in `autoGradeTransition.wiring.test.ts` so it reuses that
  file's existing comment-stripped `gtSource` at `:99` - NOT imported from
  another `*.test.ts`, which would re-run that file's describe blocks). The
  slice is WIDER than F25's (F25 stops at the first `)`; this must reach the
  array's closing `]`). Construction and both-end anchor assertions are in
  section 3.
- **Quantities the instrument produces**, all from the wider slice `depArr`
  (the `[ ... ]` array text):
  1. `depArr` is not byte-equal to the frozen literal
     `"[runResetKey(runKey, displayRun)]"` (something was added).
  2. `depArr` contains `runResetKey(` (the whole-run behavior is preserved -
     this is also AC-2's machine-checkable half).
  3. `depArr` matches `/incrementalDone|incrementalRun/` (the added term
     references a signal KNOWN to go truthy at first arrival - F-f - not an
     arbitrary constant).
  4. `depArr` does not match `/\[\s*displayRun\s*\]/` (not a bare
     `[displayRun]`, which F25 already forbids and which re-scrolls every
     arrival).
- **Direction of failure:**
  - RED if the dependency is UNCHANGED from the frozen literal (fix not wired):
    quantity 1 fails, and quantity 3 also fails. Two independent RED signals.
  - RED if it regresses to a bare `[displayRun]`: quantity 2 fails (no
    `runResetKey(`) and quantity 4 fails. F25 also goes RED independently.
  - RED if the added term is a NAMED inert constant (`, true`, `, runKey`,
    `, 1`): quantity 3 fails (no `incrementalDone`/`incrementalRun` token).
    This is the layer that raises the bar past the obvious silent-green.

**What R1 pins, and what it does NOT.** It pins the FACT (a first-arrival
signal token is present and the whole-run form is preserved), not the spelling
- `incrementalDone > 0`, `incrementalRun !== null`, `Boolean(incrementalRun)`,
`incrementalDone >= 1` all pass, and pinning one exact form would force a
contorted implementation (memory: source-text tests over-specify). It does NOT
prove the term is a first-arrival LATCH rather than an every-arrival trigger,
and it does NOT prove the scroll fires. Those are section 4's disclosures and
route to AC-3.

### R2 - AC-2: F25 preserved and not gutted (part machine-checkable, part argued)

- **Object under comparison:** the F25 block itself
  (`autoGradeTransition.wiring.test.ts:461-474`), before vs. after the fix.
- **Instrument, machine-checkable half:** run F25 unchanged against the fixed
  source. Under the recommended additive fix (F-k) it MUST stay GREEN with no
  edit (proved by hand against the slice code, section 0). The oracle for AC-2
  is therefore: **F25 requires NO edit under the additive fix.** A wave that
  edits F25 without a stated slice-breaking reason is itself the finding.
- **Instrument, argued half (scope Finding C, NOT machine-checkable):** a fresh
  checker reads F25 after the fix and judges that its intent - the effect fires
  at most once per run, not once per arrival - is still enforced by SOME
  instrument (F25 as-is, plus R1). vitest cannot enforce this: a stripped-down
  F25 that asserts nothing still passes.
- **Direction of failure:**
  - RED (machine) if F25's assertions were silently broken by a non-additive
    fix and left unmodified - F25 goes RED and that is the signal to either
    restore the additive form or, only then, update F25's slice.
  - DEFECTIVE (checker judgment) if F25 was LOOSENED (assertions deleted or
    weakened) so that it passes vacuously while the once-per-run intent is no
    longer guarded by anything. State this as a checker call, never as a green
    test.

**F25 must NOT be loosened gratuitously** (scope AC-4). The additive fix needs
no F25 change at all; the only legitimate F25 edit is a WIDENING of its slice
if a chosen fix genuinely moves the term inside the first `)`, and even then it
must still forbid a bare `[displayRun]`.

### R3 - The silent-green trap (the honesty requirement, disclosed, routed to AC-3)

- **The trap:** an inert term that text-differs from the frozen literal, keeps
  `runResetKey(`, references no changing signal - or references one but cannot
  change - passes AC-1's weakest form, tsc, build, and F25, yet the scroll
  STILL never fires because nothing in the dependency changes at first arrival.
- **What AC-1 does about it:** quantity 3 (require an `incrementalDone` /
  `incrementalRun` token) defeats the NAMED constants the scope lists
  (`, true`, `, runKey`, `, 1`). This is as strong as source text honestly
  gets.
- **What AC-1 CANNOT do about it, stated plainly:** a determined
  passing-but-wrong implementation can reference the signal in an expression
  that never changes - e.g. `, incrementalRun && false` - which matches
  `/incrementalRun/`, differs from the frozen literal, keeps `runResetKey(`,
  and is not a bare `[displayRun]`. It passes ALL of AC-1, tsc, build, and F25.
  At runtime it is a constant `false`, so the dependency never changes and the
  scroll never fires. **No node-env test in this repo can catch this**, because
  the difference between `incrementalRun !== null` (changes once) and
  `incrementalRun && false` (never changes) is a runtime value, not a source
  fact. This is exactly the "keyword guard defeated by four appended words"
  failure class this seat exists to prevent, and I am declaring it OPEN rather
  than pretending a longer regex closes it (lengthening a denylist is a
  forbidden second-failure move; the bad state here is simply not
  representable as an unbounded source-text set).
- **Direction / routing:** the only instrument that fails on
  `incrementalRun && false` is AC-3's owner walk (the viewport does not move).
  R3 is therefore ROUTED to AC-3, not asserted green anywhere here.

### R4 - AC-3: the owner walk (the load-bearing proof, not machine-checkable)

- **Object under comparison:** a real incremental grading run in a browser,
  page scrolled away from the results section, after the fix vs. today.
- **Instrument:** an owner (or a browser-driving agent per
  `docs/loop/this-repo.md`'s stated exceptions) performing the walk below.
  There is NO vitest instrument and there cannot be one (node-env, no component
  rendered - `docs/loop/this-repo.md` section 6, `AGENTS.md`).
- **Walk steps:**
  1. Open the grading surface, load an assignment that routes to the
     INCREMENTAL path (many submissions, so results stream row by row rather
     than arriving as one whole-run object).
  2. Before starting, scroll the page so the results section is OFF screen
     (above or below the viewport - the setup form area, not the results).
  3. Start the run. Watch the viewport at the moment the FIRST result row
     lands.
  4. PASS half A: the viewport scrolls to the results section at, or within a
     small number of rows of, the first row arriving.
  5. Continue watching as rows 2..N arrive.
  6. PASS half B: the viewport does NOT re-scroll on each subsequent row (no
     scroll-jack - the exact F25 regression).
- **Direction of failure:**
  - FAIL if the viewport never moves to the results within a few rows (catches
    the silent-green inert term of R3, including `incrementalRun && false`).
  - FAIL if the viewport jumps on every row arrival (catches an every-arrival
    trigger such as a bare `, incrementalDone` in the deps, which R1's source
    text does NOT catch - see section 4).

### R5 - The whole-run branch is not affected (machine-argued from code)

- **Object under comparison:** the whole-run route's scroll behavior, before
  vs. after the additive fix.
- **Instrument / argument (grounded in F-c, F-d, F-f, F-g):** during a whole
  run, `beginWholeRun` sets `phase="idle"` (F-g), so `selectRunKey(idle, ...)`
  returns `undefined` (F-c) and `runResetKey(undefined, displayRun)` returns
  `displayRun` = the whole-run object (F-b, F-d). The additive term is INERT
  during a whole run: `incrementalRun` stays `null` (F-g sets it null,
  `beginWholeRun` never repopulates it) so `incrementalRun !== null` is a
  constant `false`; `incrementalDone` stays `0` (F-f initial, F-g never
  advances it) so `incrementalDone > 0` is a constant `false`. A constant term
  in a dependency array never triggers the effect. The whole-run scroll
  therefore still fires exactly once, when `submitWholeRun` replaces the run
  object at completion and `runResetKey` changes - unchanged from today.
- **Direction of failure:** this is an ARGUED requirement, not an executable
  one. Its executable proxy is: AC-1 quantity 2 (`runResetKey(` still present)
  guards that the whole-run key was not removed. The rest (that the added term
  is inert during a whole run) is argued from the code above and confirmed at
  AC-3 if the owner additionally runs one whole-run grade and sees it still
  lands on results once. Recorded as a residual (R-4 below), not asserted
  green.

---

## 3. AC-1 slice construction (exact, for the implementer)

The frozen oracle is a CONSTRUCTION, and it is constructible from the tree
(the literal is `GradingTab.tsx:245`, read this session):

```
FROZEN_TODAY = "[runResetKey(runKey, displayRun)]"
```

The slice, over the comment-stripped `gtSource` already present at
`autoGradeTransition.wiring.test.ts:99` (do not re-read in a new file that
imports from this one; if placed in a new test file, duplicate the
`stripComments(readFileSync(...))` read, never import it - memory: no
cross-test-file imports):

```
idxScroll = gtSource.indexOf("scrollIntoView(")   // anchor START (F-i: unique)
arrOpen   = gtSource.indexOf("}, [", idxScroll)   // anchor MIDDLE (F-i: unique)
arrClose  = gtSource.indexOf("]", arrOpen)        // anchor END (array close)
```

**Both-end anchor-resolves assertions (mandatory - guards the indexOf(-1)
silent-widening trap this seat has shipped before):**

```
expect(idxScroll).toBeGreaterThanOrEqual(0)   // START resolved
expect(arrOpen).toBeGreaterThan(idxScroll)    // MIDDLE resolved and after START
expect(arrClose).toBeGreaterThan(arrOpen)     // END resolved and after MIDDLE
```

Then extract the array text (`arrOpen + 3` skips the three chars `}, ` so the
slice begins at `[`):

```
depArr = gtSource.slice(arrOpen + 3, arrClose + 1)   // "[ ...deps... ]"
expect(depArr.length).toBeLessThan(200)              // WIDTH GUARD: a slice that
                                                     // widened to the file is thousands
                                                     // of chars; a real dep, even
                                                     // multi-line, is well under 200
```

The four AC-1 assertions (R1 quantities 1-4):

```
expect(depArr).not.toBe(FROZEN_TODAY)                 // changed
expect(depArr).toContain("runResetKey(")              // whole-run form kept (AC-2)
expect(depArr).toMatch(/incrementalDone|incrementalRun/) // named first-arrival signal
expect(depArr).not.toMatch(/\[\s*displayRun\s*\]/)    // not bare displayRun
```

**Why the END anchor is `indexOf("]")` and not F25's `indexOf(")")`.** F25's
`)` anchor lands on the paren that closes `runResetKey(...)` and truncates
before any appended term (section 0). To SEE the appended term, AC-1 must reach
the array's `]`. The assumption this makes: no nested `[` appears inside the
dep expression before the closing `]`. The expected forms
(`incrementalDone > 0`, `incrementalRun !== null`) contain none. If a future
fix introduces a nested `[...]` (e.g. an index expression), the width guard
still holds and the assertion still reads a superset of the array; note it for
the checker but it is not an expected shape.

**Multi-line deps are handled:** if the implementer writes the array across
lines, `arrOpen` still finds `}, [` and `arrClose` still finds the array's
`]`; `depArr` then carries newlines and spaces but well under the 200-char
guard, and all four assertions still hold.

---

## 4. Attacking my own guard (the passing-but-wrong implementations, run by hand)

Per this seat's obligation: write the passing-but-wrong implementation and run
the instrument against it. Each row states the dep text, what AC-1 (source
text) does, what F25 does, and what AC-3 (OV) does. "Discriminates" is stated
explicitly; a mutation green or red in BOTH directions discriminates nothing
and is called out.

| # | Dependency array text | AC-1 | F25 | AC-3 (OV) | Discriminates? |
|---|---|---|---|---|---|
| M1 (no-op) | `[runResetKey(runKey, displayRun)]` | RED (q1 not-changed fails; q3 no signal token) | GREEN | FAIL (no scroll) | YES - the "fix not wired" case; AC-1 catches it |
| M2 (bare displayRun) | `[displayRun]` | RED (q2 no runResetKey; q4 bare displayRun) | RED (no runResetKey; bare displayRun) | FAIL (scroll-jacks every row) | YES - caught at both source-text instruments |
| M3 (named inert const) | `[runResetKey(runKey, displayRun), true]` | RED (q3 no signal token) | GREEN | FAIL (never changes, no scroll) | YES - AC-1's q3 is exactly this catch |
| M4 (intended latch) | `[runResetKey(runKey, displayRun), incrementalDone > 0]` | GREEN | GREEN | PASS (scrolls once at first row, no re-scroll) | YES - the GREEN reference point |
| M5 (contrived inert, references signal) | `[runResetKey(runKey, displayRun), incrementalRun && false]` | GREEN | GREEN | FAIL (constant false, never changes, no scroll) | NO at source text; YES only at AC-3 |
| M6 (every-arrival trigger) | `[runResetKey(runKey, displayRun), incrementalDone]` | GREEN | GREEN | FAIL (re-scrolls every row - scroll-jack) | NO at source text; YES only at AC-3 |

**The disclosures this table forces, stated as the load-bearing lines:**

- **M5 defeats AC-1 completely.** It passes every machine-checkable assertion
  and only AC-3's walk (R3 half, viewport never moves) catches it. AC-1's
  source-text instrument therefore CANNOT prove the scroll fires. I am not
  strengthening AC-1's regex to chase M5: the set of inert expressions that
  reference a signal is unbounded, and a denylist over it is the exact
  forbidden move (`docs/loop/iteration-caps.md`, and this repo's own history of
  a guard defeated by appended words). The correct instrument for M5 is the
  render, i.e. AC-3.
- **M6 defeats AC-1 too, in the opposite direction.** `, incrementalDone` (bare
  count, not a boolean) passes AC-1 (it references a named signal) and passes
  F25 (first `)` still closes runResetKey, no bare displayRun), but re-fires on
  every arrival - the scroll-jack F25's INTENT exists to forbid. F25's TEXT
  does not catch it because F25 only forbids the literal `[displayRun]`, not a
  count in the deps. So the once-per-run intent is, for the incremental branch,
  enforced ONLY by AC-3 half B, plus the checker judgment of AC-2. This is the
  honest statement of what "F25 is preserved" does and does not buy.
- **Net:** AC-1 discriminates M1, M2, M3 (the fix-not-wired and named-inert
  cases). It does NOT discriminate M5 or M6. Everything AC-1 misses is a render
  property, and every render property in this row lands on AC-3. There is no
  node-env instrument that closes M5 or M6; claiming otherwise would be the
  precise defect this seat guards against.

---

## 5. Running the instruments

- AC-1 and F25 both read `gtSource` in `autoGradeTransition.wiring.test.ts`;
  co-locate the AC-1 assertion there so a single file runs both. Single-file
  run (no `test:paths` needed for one path):
  `npx vitest run src/app/components/autoGradeTransition.wiring.test.ts`.
- If the wave adds a second test file, run the set with the wrapper, never a
  raw multi-path vitest (which silently drops unmatched paths):
  `npm run test:paths -- src/app/components/autoGradeTransition.wiring.test.ts src/app/components/<other>.test.ts`.
- Type gate is separate and required (a `/s` dotAll regex passes vitest and
  FAILS tsc - not used above, but flagged for the implementer): `npx tsc
  --noEmit`.

---

## 6. Executable here vs argued vs owner-verified (explicit)

- **Executable (vitest, this repo):** R1 (AC-1, all four quantities), the
  machine-checkable half of R2 (F25 stays green, no edit), and R5's proxy
  (runResetKey token present). These are the only claims asserted GREEN here.
- **Argued (stated as argument, not asserted green):** R2's intent-preserved
  half (checker judgment, scope Finding C), R5's inertness-during-whole-run
  (argued from F-c/F-d/F-f/F-g), and the whole R3 disclosure.
- **Owner-verified only (AC-3, R4):** the scroll fires at first arrival, and
  does not re-scroll per row. This is the load-bearing proof and nothing here
  stands in for it.

---

## 7. Residual register

| # | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | The incremental route visibly scrolls to results at first arrival and does not re-scroll per row (AC-3; the only instrument that catches M5 and M6) | The chunk that next owns `GradingTab.tsx`, or the owner directly | A browser render - the AC-3 walk (section 2 R4), manual or a browser-driving agent per `docs/loop/this-repo.md`'s stated exceptions; no vitest instrument exists or can exist (node-env, no component render) | Run the AC-3 walk once the AC-1 source-text checks are green |
| R-2 | Whether the owner wants this gap closed at all, versus leaving the recorded status quo | Owner | Decision, not a measurement | The next time this row is picked up for a build wave; RES-FILL-13's filing already frames this as open |
| R-3 | Which exact signal is cleanest for the latch (`incrementalDone > 0` vs `incrementalRun !== null` vs a new piece of state) | An implementer/architect wave for this row | Read `useIncrementalGradingRun.ts`'s full state shape at build time and pick the smallest correct boolean-latch form; AC-1 accepts any that references `incrementalDone`/`incrementalRun` | The wave-plan/implementer step after this notes pass, before code |
| R-4 | That the additive term stays inert on the whole-run route in the running app (argued from code in R5, not executed) | The chunk that next owns `GradingTab.tsx`, or the owner | One whole-run grade in the browser: confirm it still lands on results exactly once (piggybacks the AC-3 walk) | Same AC-3 session as R-1 |

Missing any of owner/instrument/step, a residual is a deletion; each row above
carries all three.

---

## 8. Commands and reads run to produce this document

- Read `docs/res-fill-13-scope.md` (full), `docs/DEV_LOOP.md` (full).
- Read `GradingTab.tsx:225-254`, `gradingResultsHelpers.ts:728-737`,
  `incrementalRunPlan.ts:278-296`, `useIncrementalGradingRun.ts:50-79`,
  `:128-147`, `:225-314`, `autoGradeTransition.wiring.test.ts:28-100`,
  `:440-474`.
- Grep `scrollIntoView\(` in `GradingTab.tsx` (one hit, `:239`); Grep `}, \[`
  in `GradingTab.tsx` (one hit, `:245`) - anchor uniqueness (F-i).
- Grep `beginWholeRun = |useState|setIncrementalDone|setIncrementalRun` in
  `useIncrementalGradingRun.ts` - initial state and whole-run inertness (F-f,
  F-g).
- The additive-fix slice behavior (section 0 consequence) was simulated by hand
  against the exact slice code at `autoGradeTransition.wiring.test.ts:465-467`,
  not read off the design doc.
