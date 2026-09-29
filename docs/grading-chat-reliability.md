# Reliability: the Grading chat surface

Seat: Reliability (wave 2), per `docs/loop/seats.md`'s Reliability brief. Consumes
`docs/grading-chat-acceptance-criteria.md` (AC-1..17, AC-L, R1-R7) and
`docs/grading-chat-architecture.md`, which its own fresh check
(`docs/grading-chat-architecture-check.md`) found SOUND ENOUGH to build on, with
one BLOCKER (a seam-type omission, `pointsPossible` dropped at `IntakeOutcome` -
architecture-check.md:168-209) and one weakest-decision RESIDUAL (whole-class
refusal at the entry ceiling - architecture-check.md:211-225). Both are
inherited here as open, not re-litigated - this pass does not re-check the
architecture, it builds the reliability analysis on top of the verdict as
handed off.

**This pass is READ-ONLY.** No file under `src/` was opened for writing; this
document is the only file this pass touches. Every claim about the EXISTING
route/engine/pool is [MEASURED] - read at the cited line, on the working tree at
pass time. Every claim about the NEW driver/panel (`useContinuousGradingRun`,
`GradingChatPanel`, the intake action) is [READING FROM SPEC] - none of that code
exists yet (confirmed: `Glob` for `src/app/components/grading-chat/**` and
`src/app/actions/grading-chat-intake.ts` returns no files), so nothing about it
can be executed or measured, only reasoned from the architecture document's own
text. **No component is rendered by any test in this repo, and the network is
blocked under vitest** (`docs/loop/this-repo.md`), so nothing here that depends
on real timing, a live model, or an on-screen warning is anything more than a
reading claim - marked as such throughout, never dressed as a green-gate result.

## 0. Instruments - every quantity names its command

| Quantity | Instrument |
|---|---|
| Cited-line reads | `Read` at the cited line, on the working tree at pass time |
| "Does X exist yet" | `Glob` for the exact path named in the architecture doc |
| Occurrence / collision checks | `Grep` (never `grep -c` - the trap this repo has hit twice on line-count tools that disagree) |
| Docs gate | `npm run docs:gate` |
| Tree state | `git status --short` |

---

## 1. Cross-cutting finding, read before the five items below

**The mechanism this surface will run in production for the first time is not
the concurrency PATTERN - that already has production mileage elsewhere - it is
this specific ROUTE and its specific timeout arithmetic.**

- `INCREMENTAL_CONCURRENCY = 3` (`src/app/components/grading/incrementalRunPlan.ts:31`)
  is the pool width `/api/grade-run-item` would run under. But that route's only
  intended client caller, `useIncrementalGradingRun.ts`, is reached through
  `routeGradingRun` (`incrementalRunPlan.ts:125-142`), which returns `"whole-run"`
  unconditionally today because `INCREMENTAL_ROUTE_ENABLED = false`
  (`incrementalRunPlan.ts:104,126`, confirmed at Read). **No submission has ever
  reached `/api/grade-run-item` from a real user action in production.**
- The CONCURRENCY-3-WORKER PATTERN itself does have production mileage, but
  through a different transport: `BULK_GRADE_CONCURRENCY`
  (`src/app/components/repo-grades/useRepoGradesBulkGrade.ts:59,477`) runs the
  same width of workers against a Server Action (no `fetch("/api/grade-run-item"`
  anywhere in that file - `Grep` for `fetch\(` in it returns nothing), not this
  Route Handler. The pool SHAPE is proven; this PRIMITIVE - the Route Handler,
  its 50s soft budget, and the non-cancelling race around it (item 2 below) - is
  not.
- So every timeout/failure-mode claim in items 1, 2 and 4 below is arithmetic
  over code that has shipped but never taken live traffic. Shipping this surface
  is the load test. Item 5's observability gap matters more for exactly this
  reason: if the first live traffic this primitive ever sees produces no server
  log line on failure, there is no way to tell whether it behaved as designed.

---

## 2. R4 - THE CONTINUOUS-RUN BOUND

**Object under comparison:** the architecture's decision (section 5.3, built) to
refuse a submission event once accepting it would carry `dispatchedCount` past
`maxEntries` (default `getGeminiMaxSubmissions()` = 40, `src/lib/gemini.ts:32,129`
[MEASURED]), against the architecture-check's own RESIDUAL-1
(architecture-check.md:211-225) that this refuses the WHOLE submission event,
including a Canvas URL or zip that already paid full extraction cost.

**Is 40 the right session ceiling for a continuous surface, or should it
differ from the batch cap?** Recommend: **keep 40 as the single ceiling value**
(do not invent a second number - `incrementalRunPlan.ts:38-41`'s own comment
already names "two thresholds that disagree" as a bug class this repo has hit),
but change WHAT the ceiling does at the boundary for a multi-entry event.

- **Whole-submission-refusal (as built) is the wrong default for the common
  bulk case.** Measured cost: `prepareChatSubmissionAction`'s Canvas branch
  (architecture.md:276) calls `extractCanvasEntries`, which is a full network
  fetch and parse of the whole class BEFORE the entry count is known. Under the
  built rule, a 41-student Canvas URL pays that full cost and then refuses every
  one of the 41 - zero grades produced, full extraction spend. This is
  AC-11-compliant (a visible refusal, no silent drop - AC-11's own direction of
  failure is only "silent truncation"), so it is not a correctness bug against
  the acceptance criteria as written; it is a bad OUTCOME the criteria did not
  rule out.
- **Recommend partial-grade-to-the-ceiling for a multi-entry expansion, refusal
  only for what does not fit.** Concretely: when one submission event expands to
  N entries and `dispatchedCount + N > maxEntries`, dispatch the first
  `maxEntries - dispatchedCount` entries and refuse the remainder with a named
  reason ("Graded the first `<k>` of `<N>` students in this file; the session's
  `<maxEntries>`-submission limit was reached. Start a new session to grade the
  rest."), rather than refusing all N. This is the SAME clip-not-drop shape
  `gradeStudentEntries` already uses for the batch path's OWN `.slice(0,
  maxSubmissions)` (`src/lib/grade/engine.ts:204`) plus its `not-attempted`
  disclosure tail for the entries the slice cut off
  (`src/lib/grade/types.ts:140-142`, `stoppedBy: "submission-count-bound"`,
  `engine.ts:323-330` [MEASURED, read in full]) - the batch path has NEVER
  whole-refused a run for exceeding the cap; it grades the prefix and discloses
  the rest as not-attempted. The chat surface's built design (whole-refuse) is
  actually a STEP BACK from that existing precedent, not a port of it.
- **Direction of failure this recommendation is checkable against:** a
  41-student Canvas URL with `maxEntries = 40` produces 40 graded/attempted rows
  and ONE named refusal/not-attempted marker for the 41st, never zero rows.
- **This is a recommendation, not a ruling I can make alone** - it changes
  `prepareChatSubmissionAction`'s per-kind resolution (section 3.3 of the
  architecture) from "resolve N entries, then the caller's ceiling check
  accepts-or-refuses the whole batch" to "resolve N entries, clip to what fits,
  refuse the remainder" - a small, additive change to the intake action's return
  shape (an outcome that can carry BOTH some entries AND a partial-refusal
  reason), not a redesign of the driver, mount, or taxonomy. Filed as RES-GC-8
  below; architecture-check's RESIDUAL-1 is the same finding from the check
  side and this is its reliability-side answer.

---

## 3. THE IN-FLIGHT POOL - failure isolation, traced against the model the
architecture says the new driver copies

**Object:** whether a per-item transport failure (a network drop, the route's
own 50s soft budget elapsing, a 500) wedges the pool, and whether the pool keeps
accepting new submissions after one.

**The model this traces against, read in full [MEASURED]:**
`useIncrementalGradingRun.ts`'s `runWorker` (`:185-206`) is a `for (;;)` loop
inside ONE async function per worker slot. Each iteration does:
```
try {
  const response = await postGradeRunItem(request);
  arrivedRef.current.push({ sourceIndex, result: response.result });
} catch (err) {
  arrivedRef.current.push({ sourceIndex, result: classifyItemFailure(...) });
}
doneCount += 1;
... rebuild(...)
```
(`:192-204`). The `try/catch` is INSIDE the loop body, in the SAME synchronous
control flow as the next `cursor` read - so a caught failure does not exit the
worker; the loop simply continues to the next `index`. **This is why the batch
pool does not wedge**: failure handling and "ask for the next item" are the same
statement sequence, not two independently-scheduled callbacks that could drift
apart.

**Does the continuous driver inherit this? Read from the architecture's spec,
NOT from code (none exists) [READING FROM SPEC].** Section 2.2
(architecture.md:159-165) describes the continuous shape in prose only: "the
continuous driver keeps an `inFlight` count and a growing `queue`... a `pump()`
dispatches from the head while `inFlight < INCREMENTAL_CONCURRENCY`. When a
dispatch settles, `pump()` runs again." No code backs this; the type signatures
in section 2.4 do not show it either. This is a materially DIFFERENT SHAPE from
the batch pool: the batch pool is a fixed number of self-driving loops, one per
worker slot, where "ask for more work" is a loop iteration; the continuous
driver's queue is event-driven, where "ask for more work" is a call to `pump()`
that must be reachable from BOTH the success and the failure continuation of
every dispatch, on an unbounded, growing queue with no worker-loop shape to fall
back on.

**The concrete risk this shape change introduces, checkable once code exists:**
if `pump()`'s dispatch is written as `dispatchItem(request).then((result) => {
arrivedRef.push(...); inFlight--; pump(); })` with no `.catch`, a rejected
`dispatchItem` promise is an UNHANDLED REJECTION that never runs the
`inFlight--`/`pump()` continuation - `inFlight` stays incremented forever for
that slot. After `INCREMENTAL_CONCURRENCY` (3) such failures, every slot is
permanently occupied and the pool WEDGES: it stops accepting new submissions
even though nothing crashed and no error is visible anywhere, because nothing
ever calls `pump()` again. This is exactly the "must not wedge" failure mode the
brief names, and it is NOT a hypothetical against the batch model - it is the
single most common way a hand-rolled event-driven pool differs from a worker-
loop pool when it is written by copying the model's OUTCOME ("isolate the
failure, keep going") without copying its SHAPE ("the retry is the next line of
the same function, not a second scheduled callback").

**What must be true of the implementation, and what tests it:**
`classifyItemFailure(sourceIndex, entry, error)` (`incrementalRunPlan.ts:198`,
imported per architecture section 2.2) must be reached, `inFlight` decremented,
and `pump()` re-invoked from BOTH the resolved and the rejected path of every
dispatch - i.e. `.then(...).catch(...)` with the decrement-and-pump logic in
BOTH handlers, or a single `.finally()` that always decrements and pumps
regardless of outcome, with the failure classification handled separately. The
architecture's own instrument table (architecture.md section 8, `I-continuous-
driver` row) names AC-5 ("one item's failure removes or corrupts another item's
row") as the assertion this behaviour is checked against, but AC-5's stated
direction of failure (AC doc, AC-5) is about ROW CORRECTNESS ("a submission
produces zero grade calls, or two; or one item's failure removes or corrupts
another item's row"), not about POOL LIVENESS after `INCREMENTAL_CONCURRENCY`
consecutive failures. **Neither AC-5, AC-6, nor the I-continuous-driver row as
specified names a test that dispatches `INCREMENTAL_CONCURRENCY` (3) failing
submissions back-to-back and then asserts a 4th submission's `dispatchItem` is
still called.** That is the one assertion that would catch the wedge scenario
above and I could not find it anywhere in the AC or the architecture's
instrument table. Filed as RES-GC-9 below, for the test seat.

**Does the pool keep accepting new submissions while items are in flight or
failing?** By the architecture's OWN stated contract (`submit` "Returns before
grading completes (non-blocking, AC-6)" - architecture.md:211), yes, by design -
`submit` enqueues and returns immediately regardless of pool state, so a
caller-visible "accept" is decoupled from dispatch. That decoupling is sound IF
`pump()` is re-entrant-safe against the wedge above; it is NOT a fix for the
wedge, because a wedged pool still ACCEPTS (`submit` returns `{kind:
"accepted"}`) while never actually dispatching the accepted work - which is a
WORSE failure than an outright refusal, because nothing tells the instructor
their submission is stuck.

---

## 4. EPHEMERAL STATE DURABILITY

**Object:** the blast radius of a reload / crash / accidental nav-away that
unmounts the chat host, for an instructor 30 submissions into a session, and
whether any cheap durability is warranted.

**What is measured about the design as built (architecture.md section 7, 12):**
the always-mounted mount (page.tsx, after `:729`, confirmed by the
architecture-check as accurately traced - architecture-check.md:100-111) DOES
solve in-app navigation (switching Tools chips and back does not unmount the
panel or its hook, so an in-flight run survives that). It does NOT and CANNOT
solve a full page reload, browser crash, or tab close - React state and refs are
destroyed with the page in every one of those cases, and the architecture says
so plainly (section 12: "an in-flight run cannot be rehydrated... this surface
does NOT create a new durable GradingRun store").

**The blast radius, quantified against the batch surface's own equivalent
risk, which is smaller in kind, not just in degree.** A batch `run` submission
is one click-to-completion action: if the tab dies mid-run, the instructor loses
AT MOST the one run in flight, and the batch path's own cron/deadline mechanism
already ships a partial-completion disclosure for its OWN kind of interruption -
`NotAttemptedOutcome` with `stoppedBy: "run-deadline" | "submission-count-
bound"` (`src/lib/grade/types.ts:140-142` [MEASURED]) - because that path runs
inside ONE bounded server invocation and must account for what it did not reach
before the platform kills it. **The chat surface's session is not one
invocation cut short; it is potentially dozens of independent HTTP requests
spread across however long the instructor keeps working, and NONE of the batch
path's not-attempted machinery applies to it** - `NotAttemptedOutcome` is
produced by `gradeStudentEntries`'s own loop deciding not to START an entry
(`engine.ts:293-330`); it has no meaning for "the browser tab that was tracking
30 already-arrived rows just closed." **There is no disclosure mechanism at all
for THIS interruption - not even the batch path's own kind.** An instructor 30
submissions in who reloads loses: every graded row's full feedback text, every
in-flight request's eventual result (silently discarded - see item 1's note on
`raceWithTimeout` not cancelling `work`), and any memory of WHICH submissions
they had already dropped (the composer only persists instructions/rubric/mode
under `ta-` keys per architecture section 12's table - not a submission
history), so re-establishing where they were requires re-identifying, by hand,
which of their own files were already graded. The cost is not just re-spending
the model calls (small in dollars per gemini.ts:55-59's own estimate) - it is
the instructor's OWN TIME re-tracking which submissions are done, which is
exactly the cognitive cost this surface exists to remove (AC-17, R5).

**My assessment: the architecture's decision NOT to build full durability is
sound (base64 file content and feedback text are a genuinely poor localStorage
fit, and an in-flight fetch cannot be rehydrated regardless of storage) - but
the architecture's framing of this as "an accepted limit with the not-attempted/
partial disclosure as the reporting half" does not hold, because that reporting
half does not exist for this failure mode.** Recommend two independently
gateable pieces, neither a redesign:

- **Minimum bar (reliability floor, cheap, no new storage): an explicit,
  persistent on-screen warning that this session is not saved and a reload or
  tab close loses all accumulated rows and in-flight work.** This is a UX/copy
  obligation (RES-GC-2 territory), not mine to author, but I am naming it as a
  RELIABILITY REQUIREMENT: the architecture's OW-GC-5 owner-walk item
  (architecture.md:867) tests that an in-flight run "survives switching to
  another Tools chip and back" but never tests that the instructor is TOLD what
  does NOT survive. Silence here is the actual defect, not the lack of
  durability.
- **Optional cheap durability (residual, not required for this wave): persist a
  LIGHTWEIGHT receipt only** - `{sourceIndex, student, totalScore}` per completed
  row, explicitly EXCLUDING `feedback`/`strengths`/`improvements` text and
  `submittedFiles`' base64 content (the two things architecture section 12
  correctly says are a poor localStorage fit) - so a reload at least shows "these
  N students were already graded, with these scores" as a recovery aid, even
  though the rich comments would need a re-grade to restore. This is bounded in
  size (a few dozen small records, no files) and does not touch the in-flight-
  fetch problem (which genuinely cannot be solved by any storage). Filed as
  RES-GC-10.

---

## 5. THE INTER-REQUEST DELAY

**Object:** whether `getGeminiInterRequestDelayMs()` (default 1200ms,
`src/lib/gemini.ts:67,143-149` [MEASURED]) - applied by `gradeStudentEntries`
between entries of the SAME loop (`engine.ts:284-290` [MEASURED, read in full]:
`if (interRequestDelayMs > 0 && i < limitedEntries.length - 1 && !nextRefused)
await sleep(interRequestDelayMs);`) - still applies, or should apply, on the
continuous per-item path.

**Confirmed it structurally cannot apply today, and will not apply to the new
driver either without new code.** `route.ts:173` calls `gradeEntries([entry],
...)` - a ONE-element array. Inside `gradeStudentEntries`, the sleep guard is
`i < limitedEntries.length - 1`; for a one-element array this is `0 < 0`, always
false. **The sleep line is dead code on this call path - it can never execute
for a per-item request, at any concurrency, at any submission rate.** This is
the same conclusion the architecture reaches (section 5.3, RES-GC-4) and this
pass confirms it by tracing the actual guard condition, not by re-stating the
claim.

**Is this a real rate-limit exposure, or does the per-call retry/backoff already
cover it?** Both are true, for different failure shapes.
`postGenerateContent`'s own retry loop (`src/lib/llm.ts:395-440,467-503`
[MEASURED, read in full]) retries a SINGLE call's own 429/5xx up to `MAX_ATTEMPTS
= 5` times with exponential backoff (worst case ~9s across 4 retries per that
file's own comment, `:393-394`) - this covers "this one request got rate-
limited," which is a per-call resilience mechanism, not a substitute for
pacing. It does nothing to prevent THREE simultaneous items (or, worse, a burst
draining a zip/Canvas-URL-expanded backlog of dozens of entries as fast as
`INCREMENTAL_CONCURRENCY` slots free up) from presenting the provider with a
request RATE the batch path's deliberate 1200ms spacing was built to avoid in
the first place. The batch path paces proactively; the per-call retry reacts
after a 429 has already happened. A continuous surface with no pacing at all can
produce MORE simultaneous load than the batch path ever did, because it pools 3-
wide with zero inter-dispatch spacing where the batch path was single-threaded
with 1200ms spacing.

**Recommendation, isolated so it does not fight AC-L.** Do NOT add a delay to
every dispatch unconditionally - that would directly work against the surface's
own leverage claim (AC-L: dispatch on arrival, before the next submission
event). Instead, **pace only dispatches drawn from an existing backlog**: when
`pump()` pulls the NEXT queued entry immediately after a worker slot frees up
AND the queue is non-empty at that moment (i.e., there is already more queued
work than the pool can run at once - the bulk-expansion case: a zip or Canvas
URL that produced many entries from one event), apply
`getGeminiInterRequestDelayMs()` before that next dispatch, mirroring the exact
guard shape `engine.ts:288` already uses (skip the delay when there is nothing
next to protect). A single, isolated text/file/URL submission with an empty
queue is dispatched immediately, exactly as AC-L requires; a 41-entry Canvas URL
drains at the batch path's own pace instead of three-times-batch-speed. This is
additive to the driver (one guard inside `pump()`), does not change the seam
signatures in architecture section 2.4, and does not touch AC-L's assertion
(the mocked-seam test's `dispatchItem` call for a lone submission is unaffected;
only a BACKLOG's internal pacing changes). **This is a recommendation, not a
built decision - RES-GC-4 already routes it to this seat and architecture
explicitly did not decide it; filed below as the concrete answer.**

---

## 6. OBSERVABILITY

**Object:** the row shape for logging a continuous session, reusing the
existing log convention; the rollback and its blast radius.

**The existing convention, read from the model file the route itself claims to
follow.** `/api/grade-run-item/route.ts`'s own header comment says it is
"Modelled line-for-line on `src/app/api/class-trends-insight/route.ts`"
(`route.ts:20-24` [MEASURED]) for its guard and budget shape. That model file
DOES log: `console.error("[class-trends-insight] model call failed:",
describeLlmFailure(...))` (`class-trends-insight/route.ts:165`), a no-text
case (`:169`), and the outer catch (`:174`) - three log sites, all on
MODEL/SERVER-side failure branches, NONE on the 401/400 client-input branches,
and the comment at `:160-164` states explicitly why: "Nothing about a submission
or its feedback text is logged here or anywhere else in this route: only the
failure description of the LLM call itself." **`route.ts` copied this file's
guard order and budget numbers but copied NONE of its logging - a `Grep` for
`console\.(log|warn|error)` against `route.ts` returns zero matches.** The
primitive this surface is about to drive continuously, at a volume no other
caller has ever produced (item 1), currently produces NO server-side signal on
ANY of its four failure branches (400 malformed body, 401 auth, 502 model/
transport failure, 504 soft-budget timeout).

**Recommended row shape, reusing the model file's convention exactly:** add
`console.error("[grade-run-item] <branch>:", <failure description>)` at the two
branches that mirror the model file's own two logged cases -
`outcome.kind === "timedout"` (`route.ts:177-182`) and `outcome.kind ===
"failed"` (`route.ts:183-185`), plus the outer `catch` (`route.ts:189-190`) -
and NOT at the 400/401 branches, matching the model file's own choice not to log
client-input rejections. Each entry carries: the route tag, `sourceIndex` (never
`entry.student` or `entry.content`), the failure kind (`timedout` | `failed` |
`exception`), and elapsed ms (`Date.now() - startedAtMs`, already computed at
`:128`) for latency signal. **Never `assignmentInstructions`, `rubric`, or any
field of `entry`** - matches the model file's own "no student personal data"
discipline (`class-trends-insight/route.ts:160-164`) and this repo's session-
diagnostic-log module's identical rule (`session-diagnostic-log.ts:44-49`,
which additionally EXCLUDES grading from its own coverage by name - `"Grading,
rubrics, drafted grades and repo grading."`, `:109` - so that module is
explicitly NOT the log to extend here; it is also BROWSER-ONLY BY CONTRACT
(`:37-42`) and this route runs server-side, so importing it would be a
structural violation, not a reuse).

**No existing convention for a SESSION-level (multi-request) rollup.** I looked
for one and found none: the session-diagnostic-log module is the only per-
session log convention in this repo and it explicitly does not cover grading
(`:109` above). A continuous chat session spans many independent
`/api/grade-run-item` invocations with no shared request context between them
(item 1), so there is no natural place today to write one row per SESSION
("graded N of M, X failed, session lasted Y") - that would be a NEW aggregate
log, not a reuse of anything, and deciding where it lives (a new server-side
store, or accepted as client-only and therefore as unreliable as the state it
would be summarizing - item 4) is a data/operability-seat + owner call, not
mine to invent inside this pass. Filed as RES-GC-11.

**Rollback and blast radius.** Per the architecture's own write-set (section
10.2) and the architecture-check's confirmed pass condition (architecture-
check.md / architecture.md:635, "RED... if any of the six N13a `class-trends-
draft` files, or `GradingTab.tsx`, `useIncrementalGradingRun.ts`, or
`incrementalRunPlan.ts` appear (they must NOT be edited)"), **the smallest safe
revert is genuinely small**: this wave's write set is four NEW files
(`chatSubmissionIntake.ts`, `grading-chat-intake.ts`,
`useContinuousGradingRun.ts`, `GradingChatPanel.tsx`) plus two EDITS
(`manual-rail.ts`'s four enumeration additions, `page.tsx`'s one new
always-mounted sibling mount) plus test edits. Reverting deletes the four new
files and un-does the two small edits; nothing that the EXISTING `run`/`repos`/
`recording`/`snapshots`/`drafts` surfaces depend on is touched, so a revert
restores exactly today's behaviour on every other surface. **This is the good
case, and it is confirmed by the write-set table, not asserted.**

**The blast radius of a LIVE defect (not a revert) is wider than the write-set
table suggests, because of item 1's finding.** A defect this surface's traffic
SURFACES inside a REUSED shared function - `classifyItemFailure`,
`mergeArrivedResults`, `canonicalColumns`, `buildIncrementalRun`
(`incrementalRunPlan.ts`), or `gradeEntries`/`gradeStudentEntries`
(`engine.ts`) - is a defect in code the (currently dormant) A46 incremental
route and any FUTURE caller would inherit too, because those functions are not
copied, they are imported (architecture section 2.2, confirmed by the
architecture-check as accurate - architecture-check.md:28-39). Reverting this
wave's own files does not un-discover that defect; it only removes the traffic
that revealed it. This is not a reason to avoid shipping - the alternative is
never finding out - but it means the ROLLBACK PLAN is "revert four files and two
edits" while the FIX for a shared-file defect found this way is "fix
`incrementalRunPlan.ts`/`engine.ts` on their own review path," which is a
different, larger blast radius than the write-set table alone communicates.

---

## 7. RESIDUAL REGISTER (owner, instrument, step)

None of these is a row in `docs/BACKLOG.md` yet - filing backlog rows is the
orchestrator's job, not this seat's, per the same convention the architecture
pass itself states (architecture.md section 13 preamble). Stated plainly so
they are not mistaken for filed.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-GC-8 | Whole-submission-refusal at the entry ceiling (architecture-check RESIDUAL-1) should become partial-grade-to-the-ceiling for a multi-entry expansion (zip/Canvas URL), mirroring `engine.ts:204,293-330`'s own clip-and-disclose precedent, not a whole refusal | architect (owns `prepareChatSubmissionAction`'s return shape) + owner (confirms the product call) | a test asserting a 41-entry Canvas URL against `maxEntries=40` produces 40 rows + one named partial-refusal, never zero rows | next architecture revision on this seam, or the implementer wave if the architect delegates the shape |
| RES-GC-9 | No named test drives `INCREMENTAL_CONCURRENCY` (3) consecutive failing dispatches and then asserts a 4th submission still dispatches - the one assertion that would catch a `pump()` written without a `.catch` on every dispatch path (the wedge failure mode, section 3 above) | test seat (I-continuous-driver) | `useContinuousGradingRun.lifecycle.test.ts`, mocked `dispatchItem` rejecting 3 times then a 4th `submit` call asserted to dispatch | test-notes pass, before the implementer wave that writes `pump()` |
| RES-GC-10 | Optional cheap durability: a lightweight `{sourceIndex, student, totalScore}` receipt per completed row (explicitly excluding feedback text and base64 files), so a reload shows what was already graded even though rich comments would need a re-grade | data seat + owner (product call: worth the storage write path for this wave, or later) | a `ta-` key round-trip test on the receipt list only, never on the full `GradeResult` | follow-up wave; not required for this wave to ship |
| RES-GC-11 | Minimum reliability floor: an explicit on-screen warning that this session is not saved and a reload/close loses all accumulated rows and in-flight work - OW-GC-5 tests survival across in-app navigation but nothing tests that the instructor is told what does NOT survive a reload | UX seat (copy) + reliability (the requirement) | owner-walk: reload mid-session, confirm the warning was visible before the loss, not only after | UX wave 3, before ship |
| RES-GC-12 | No session-level (multi-request) log convention exists anywhere in this repo for grading; `session-diagnostic-log.ts` explicitly excludes grading by name (`:109`) and is browser-only by contract, so it cannot be extended here. Whether a per-session rollup is wanted at all, and where it would live, is undecided | data/operability seat + owner | none exists yet to point to; the owner's answer determines the instrument | owner scope call; not required for this wave (per-item logging, item 6's recommended rows, IS required) |
| RES-GC-13 (recommended reading, isolated) | Apply `getGeminiInterRequestDelayMs()` inside `pump()` ONLY when dispatching from a non-empty backlog (mirrors `engine.ts:288`'s own guard), never to a lone submission with an empty queue - so AC-L's dispatch-on-arrival assertion is unaffected and a bulk zip/Canvas expansion is paced like the batch path instead of 3x faster | reliability (this pass's recommendation) + architect (owns the seam if it disagrees) | a driver test: N queued entries from one event dispatch with `getGeminiInterRequestDelayMs()` spacing between them; a single lone submission with an empty queue dispatches with none | implementer wave, when `pump()` is written; not a blocker to the wave shipping without it, but the rate-limit exposure (section 5) is unmitigated until it lands |
| R7 (inherited from architecture, not re-decided here) | Guard asymmetry: `/api/grade-run-item` is `requireUser()` (`route.ts:133`) while the new intake/header actions will be `requireAppOwner()` | security + operability seats | read `route.ts:133` vs the two new actions' guards | wave 2 security pass |

---

## 8. WHAT I COULD NOT DETERMINE

1. **Whether `dispatchItem`'s promise in the real `pump()` implementation
   actually wires `.catch`/`.finally` on every path.** No code exists yet
   (confirmed by `Glob`); section 3's wedge risk is reasoned from the
   architecture's PROSE description, not from anything executable. This is
   named as RES-GC-9 precisely because it cannot be checked until the code and
   its test exist.
2. **Whether a client disconnect (tab closed mid-request) actually terminates
   the SERVER-side `/api/grade-run-item` invocation, or leaves it running to
   completion unobserved.** `raceWithTimeout` (`src/lib/bounded-race.ts:26-29`
   [MEASURED]) explicitly does not cancel `work` on the CLIENT side of that
   race; whether the underlying platform (Vercel, per memory: prod is Vercel
   Hobby) tears down the function on a dropped client connection is a platform
   behaviour this checkout cannot observe - no live deploy, no network. Stated
   plainly as unknown, not assumed either way.
3. **The real Gemini provider's actual requests-per-minute limit**, and
   therefore whether `INCREMENTAL_CONCURRENCY = 3` with no pacing (item 5) would
   ACTUALLY trigger visible 429s in practice, or merely add pressure that the
   per-call retry (`llm.ts:395-440`) absorbs invisibly. No such number is
   documented anywhere in this repo (`Grep` for rate-limit/RPM figures found
   only per-call 429-handling code and test fixtures, never a provider-quoted
   number), and there is no live key or network access here to measure it.
4. **Anything a user sees, or any real-time behaviour** (the felt concurrency
   OW-GC-3 names, whether a warning banner in RES-GC-11 would actually be
   noticed before a reload) - no component renders under any test here.
5. **Whether the owner considers the ceiling-refusal outcome (item 2) or the
   durability gap (item 4) important enough to gate this wave**, versus ship as
   designed and revisit - both are recommendations from this seat, not rulings;
   the architecture explicitly left both open to the owner/architect (R4's own
   RES-GC-5, and section 12's acceptance of the ephemeral-state limit).

---

## 9. GATE RUN ON THIS DOCUMENT

Command: `npm run docs:gate` (`package.json:22` -
`npm run test:paths src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
src/tools/vitest-paths/gate-commands.structure.test.ts`). Result and
`git status --short` reported in the hand-back to the orchestrator, per this
seat's brief (this pass does not itself edit the backlog or push).
