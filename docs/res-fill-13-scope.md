# RES-FILL-13 scope + acceptance criteria

Area: grading (`grading-setup-interaction-cost`). Round 1 of the two-round cap
(see `AGENTS.md` "Two rounds, then ask"); a fresh `loop-checker` gates this
artifact before any consumer acts on it.

Source row: `docs/backlog.yml:1039-1050` (`grep -n "RES-FILL-13" -A 12
docs/backlog.yml`, opened directly, quoted below in full at the row's own
line numbers):

- `docs/backlog.yml:1040` - `state: 'unscoped'`
- `docs/backlog.yml:1044` - `owns: []`
- `docs/backlog.yml:1045` - `verify: null`
- `docs/backlog.yml:1047` - `instrument: ''`
- `docs/backlog.yml:1048` - `from:` cites `docs/a39-incremental-fill-architecture.md`
  section 13, filed 2026-09-28
- `docs/backlog.yml:1049` - the note: the route has a scroll-target node
  (`sectionRef`) but the effect that would scroll to it is keyed to the run
  identity, firing once per run at the moment the identity is created -
  before the first result row exists - and this is **stated as deliberate**,
  not an oversight, with no instrument recorded because "the only real
  enforcer... is a render."

This scope does not change that filing's diagnosis. It exists to turn the
filed observation into checkable AC, per this task's brief. It does not
re-decide whether the owner wants the gap closed - RES-FILL-13 itself says
that decision is still open ("if the owner wants the gap closed at all").

This is NOT a restructuring of a prior scope document - none exists for this
row (`ls docs/res-fill-13-scope.md` before this write: "No such file or
directory"; `grep -rn "RES-FILL-13" docs/*.md` found only the design doc,
`docs/BACKLOG.md`, `docs/a39-fill-waves.md`, and `docs/backlog-unscoped-triage.md:127`,
none of which is a scope/AC document with prior requirements to disposition).
No disposition table applies.

## 1. Where the incremental run renders its results, and why it does not scroll there today

**The scroll-target node** is wired in `src/app/components/GradingTab.tsx:599-602`:

```
sectionRef={(el) => {
  resultsRef.current = el;
  if (resultsSectionFallbackRef) resultsSectionFallbackRef.current = el;
}}
```

`resultsRef` is declared at `src/app/components/GradingTab.tsx:108`
(`const resultsRef = useRef<HTMLDivElement>(null);`) and is the same ref the
comment at `GradingTab.tsx:594-598` says already backs "the scroll-into-view
effect above." The node itself is `GradingResults.tsx:552`
(`<section className={styles.results} ref={sectionRef} tabIndex={-1}>`),
accepting the `sectionRef` prop declared at `GradingResults.tsx:172` and
consumed at `GradingResults.tsx:203`. This node exists for both the whole-run
and incremental routes - `GradingResults` is the one mount both routes render
into (confirmed by reading `GradingTab.tsx:580-602`: the same
`<GradingResults ... sectionRef={...} />` call site both routes share).

**The effect that should scroll to it** is `GradingTab.tsx:237-245`:

```
useEffect(() => {
  if (displayRun && resultsRef.current) {
    resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [runResetKey(runKey, displayRun)]);
```

**Why it does not fire on the incremental route's first arrival** - traced
end to end, not read off the design doc:

- `runResetKey` is defined at `src/app/components/grading-results/gradingResultsHelpers.ts:735-737`:
  `return runKey ?? run;` - when `runKey` is defined, the run object
  (`displayRun`) is not part of the returned value at all.
- `selectRunKey` (`src/app/components/grading/incrementalRunPlan.ts:292-293`)
  returns `phase === "idle" ? undefined : \`incremental-${runId}\``. For the
  whole run of an incremental grade, `phase` moves out of `"idle"` once and
  `runId` does not change again until the next run, so `runKey` is a single
  constant value (`incremental-<N>`) for the entire run's lifetime.
- Because `runKey` is defined for that whole lifetime, `runResetKey`'s `??`
  never reaches `displayRun` - the effect's dependency is `incremental-<N>`
  from the moment the run starts until it ends, regardless of how many result
  rows arrive in between.
- The one render where that dependency *changes* (from `undefined` to
  `incremental-<N>`) is traced in `src/app/components/grading/useIncrementalGradingRun.ts:236-240`:
  ```
  runIdRef.current += 1;
  ...
  setPhase("running");
  setIncrementalRun(null);
  ```
  `setPhase("running")` is what flips `selectRunKey`'s branch (line 239), and
  it is set in the **same** state-update batch as `setIncrementalRun(null)`
  (line 240) - i.e. at the instant the dependency changes, `displayRun`
  (`= selectDisplayRun(phase, incrementalRun, run)`,
  `incrementalRunPlan.ts:280-286`, which returns `incrementalRun` whenever
  `phase !== "idle"`) is `null`. The effect's own guard,
  `if (displayRun && resultsRef.current)` (`GradingTab.tsx:238`), is false at
  that render, so no scroll happens. No later render changes the dependency
  again until the run ends, so no scroll ever happens for that run's first
  (or any) result row.

This matches the row's diagnosis at `docs/backlog.yml:1049` exactly, now with
the specific state transition and line numbers that produce it: the gap is
not a missing ref and not a missing effect - it is the effect's dependency
array intentionally keying off run identity (not the arriving data), per the
comment at `GradingTab.tsx:234-236` and `GradingTab.tsx:241-244`, which
themselves cite "architecture 10, M6."

**This is deliberately pinned by an existing frozen test**, not just
described in prose:
`src/app/components/autoGradeTransition.wiring.test.ts:461-474`
(`describe("F25 (architecture 10, M6): the scroll effect fires at most once
per run, not once per arrival"`) asserts the dependency array text contains
`runResetKey(` and does **not** match `[displayRun]`, `[run]`, or
`[state.run]`. Any future fix that changes what the effect keys off of will
need this test read and, if its assertions no longer hold for the new
behavior, updated in the same change - it is not in scope for this docs-only
pass to touch it, but a build wave against this row cannot avoid it. Filed
here as a constraint the next owner must open, not resolved by this document.

## 2. Does a scroll-to-results pattern already exist on a sibling surface to reuse

Yes - **it is the same effect**, not a separate mechanism on a different
component. `GradingTab.tsx:237-245` already handles the **whole-run** route
correctly today: when `phase === "idle"`, `selectRunKey` returns `undefined`
(`incrementalRunPlan.ts:293`), so `runResetKey` falls through to comparing
`displayRun` itself (the `run` object, `gradingResultsHelpers.ts:736`). A
whole-run dispatch replaces `run` with a single new, fully-populated object
only once, at completion, so the dependency changes exactly when there is
data to scroll to, and the effect fires correctly for that route.

So there is no second, different pattern anywhere else in the grading
surfaces to go copy (checked: the only other `scrollIntoView` call sites in
`src/app/components/**` are `AiChatWindow.tsx:229`, `ContentTab.tsx:213`,
`courses/EditableRowList.tsx:83`, `courses/CoursesTable.tsx:243`,
`course-planning/useSyllabusAdaptation.ts:85`, and
`repo-detail/usePullsTab.ts:119` - none of them a grading surface, none of
them a "run identity vs. arriving data" case; `grep -n "sectionRef|scrollIntoView"
src/ -r` run for this document, full output above). The fix this row asks
for is not "add a scroll mechanism" - the mechanism, the ref, and the node
already exist and are already shared correctly by the whole-run route. It is
"give the incremental route's branch of the *same* effect a dependency that
changes on first arrival, the way the whole-run branch's dependency already
changes on completion." The design doc's own proposed name for this
(`docs/a39-incremental-fill-architecture.md:2130`, "RES-FILL-13" row) is a
first-arrival latch - consistent with what tracing the code independently
shows is missing.

## 3. Acceptance criteria

Split explicitly per this task's instruction: this repo's vitest is node-env
and collects only `src/**/*.test.ts` (no component is rendered -
`docs/loop/this-repo.md` section 6, restated in `AGENTS.md`), so "the page
visibly scrolls" cannot be produced by any test here. Each AC below states
which half it is.

**AC-1 (machine-checkable, source-text).** Object under comparison: the text
of the dependency array on the `scrollIntoView` effect in `GradingTab.tsx`
(currently at line 245, `}, [runResetKey(runKey, displayRun)]);`), before vs.
after the fix. Instrument: a source-text assertion (in the style of the
existing `autoGradeTransition.wiring.test.ts:461-474` F25 block) that greps
the effect's dependency expression and asserts it is a function of something
that changes on first-row arrival for the incremental route (e.g. a row count
or a first-arrival flag), not solely of `runResetKey(runKey, displayRun)`
unchanged. Direction of failure: RED if the dependency expression is
unchanged from today's `runResetKey(runKey, displayRun)` (i.e. the fix was
not actually wired), or if it regresses to a bare `[displayRun]` (which
`F25`'s existing test already forbids, because that reintroduces the
scroll-jack-per-arrival behavior `M6`/`F25` were closing).

**AC-2 (machine-checkable, source-text).** Object under comparison: the
existing `F25` test block itself
(`autoGradeTransition.wiring.test.ts:461-474`). Instrument: reading the test
after the fix lands. Direction of failure: RED if `F25`'s assertions were
left unmodified while the dependency text changed in a way that breaks them
(a stale frozen oracle silently failing, or silently passing because nobody
updated it), or RED if `F25`'s underlying intent - the effect must not
re-fire on every arrival once results are streaming, only on the first one -
was dropped rather than carried forward into whatever oracle replaces or
extends it.

**AC-3 (owner-verification / OV, not machine-checkable).** Object under
comparison: the rendered incremental grading run in a real browser, page
scrolled away from the results section, vs. the same run today. Instrument:
an owner (or a browser-driving agent per `docs/loop/this-repo.md`'s stated
exceptions, if one is used) starts an incremental grading run from a scroll
position above the results section and watches whether the viewport scrolls
to the results section at (or shortly after) the first result row's arrival.
Direction of failure: FAIL if the viewport does not move to the results
section within a small number of rows of the run starting, or if it moves on
every subsequent row arrival (scroll-jacking, the exact regression `F25` was
written to prevent). This is the step nothing in this repo can run standing
in for it - it is a render-dependent behavior and is recorded as an OV walk
step, not asserted as green by any test here.

**AC-4 (scope judgment, not a pass/fail condition).** This is a small,
targeted wiring fix, not a redesign: the ref, the node, the shared mount, and
the whole-run branch of the effect all already work and are reused as-is; the
only change is the incremental branch's dependency expression (one line,
`GradingTab.tsx:245`) plus whatever minimal piece of state feeds it (e.g.
exposing a "first row has landed" signal from `useIncrementalGradingRun.ts`
or deriving one from existing state such as `incrementalDone > 0` /
`incrementalRun !== null`, both already returned from that hook per
`useIncrementalGradingRun.ts:61-64` and `:305-308`) and the corresponding
update to the `F25` test's assertions (AC-2). No new ref, no new mount, no
new component, and no change to the whole-run branch's behavior are needed
or in scope. The smallest fix is: latch the incremental branch's dependency
to fire once when `displayRun` first becomes non-null after a run starts
(mirroring, not replacing, the identity-keyed suppression that stops it
firing again on every later arrival), update `F25`'s assertions to match
the new dependency shape, and leave the whole-run branch untouched.

## 4. What this scope does not decide

Per the source row (`docs/backlog.yml:1049`), the design that produced this
gap treated leaving it open as an acceptable, deliberate choice pending
owner interest - it is not scoping a bug that must be fixed, but scoping what
fixing it would look like if the owner wants it fixed. This document takes no
position on whether to spend the fix; it only makes the fix's size and AC
checkable so that decision can be made without re-deriving the mechanism.

## Residual register

| # | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | Whether the incremental route visibly auto-scrolls to the first arriving row in a real browser (AC-3) | The chunk that next owns `GradingTab.tsx` (same owner the source row already names at `docs/backlog.yml:1049`), or the owner directly | A browser render - manual walk or a browser-driving agent per `docs/loop/this-repo.md`'s stated exceptions; no vitest instrument exists or can exist here (node-env, no component rendering, `docs/loop/this-repo.md` section 6) | The OV walk step described in AC-3, run once the wiring fix (AC-1/AC-2) has landed and passed its source-text checks |
| R-2 | Whether the owner wants this gap closed at all, versus leaving it as the recorded status quo | Owner | N/A - this is a decision, not a measurement | The next time this row is picked up for a build wave; RES-FILL-13's own filing already frames this as open, and this scope does not close it |
| R-3 | Whether `incrementalDone > 0` / `incrementalRun !== null` (or some other existing signal named in AC-4) is in fact the cleanest first-arrival signal, versus needing a new small piece of state in `useIncrementalGradingRun.ts` | An implementer or architect pass scoping the actual wave for this row | Reading `useIncrementalGradingRun.ts`'s full state shape at build time and picking the smallest correct signal | The wave-plan or implementer step that follows this scope, before any code is written |

## Commands run to produce the citations above

- `grep -n "RES-FILL-13" -A 40 docs/backlog.yml`
- `grep -n "sectionRef|scrollIntoView" -r src` (via the Grep tool, path
  `src/app/components`, and again root-scoped for the sibling-pattern search
  in section 2)
- `grep -n "section 13|section 10|section 4.1|M6" docs/a39-incremental-fill-architecture.md`
- Direct reads of `src/app/components/GradingTab.tsx` (lines 1-120, 195-454,
  585-604), `src/app/components/grading/useIncrementalGradingRun.ts` (lines
  1-80, 225-280), `src/app/components/grading/incrementalRunPlan.ts`
  (`selectDisplayRun`/`selectRunKey` definitions), `src/app/components/grading-results/gradingResultsHelpers.ts`
  (`runResetKey` definition), `src/app/components/autoGradeTransition.wiring.test.ts`
  (lines 440-474), and `src/app/components/GradingResults.tsx` (`sectionRef`
  prop and the `<section>` mount)
- `wc -l` on every file cited above, run once before writing this document:
  `GradingTab.tsx` 617, `useIncrementalGradingRun.ts` 314,
  `incrementalRunPlan.ts` 299, `gradingResultsHelpers.ts` 737,
  `autoGradeTransition.wiring.test.ts` 474, `docs/backlog.yml` 1074 - every
  line number cited above is within these bounds
- `ls docs/res-fill-13-scope.md` (before this write, to confirm no prior
  version of this document exists) and `grep -rn "RES-FILL-13" docs/*.md` (to
  confirm no other scope/AC document already covers this row)
