# G4 scope: the LLM call with no timeout, and DECISION 6

Backlog row opened at `docs/backlog.yml:117` (`- id: 'G4'`), read in full before
this pass, together with `AGENTS.md`, `docs/DEV_LOOP.md`, `docs/loop/this-repo.md`
and `docs/loop/leverage.md`. No prior scoping document exists for G4 (`state:
'unscoped'` at `docs/backlog.yml:118`), so there is no disposition table in this
document -- this is a first scope, not a restructuring.

## The one sentence that matters

**G4 is a prerequisite for DECISION 6 to deliver the one thing it was chosen
for -- a per-item failure the pool can report, instead of a raw platform kill
-- but it is a prerequisite BY INCLUSION, not by sequencing.** It does not need
its own chunk to land before A39 starts. It needs to be a named, checked
acceptance-criterion inside A39's own first wave: the new Route Handler's call
into the grading engine must be wrapped in a wall-clock deadline that fires
comfortably under `maxDuration = 60`, using a wrapper this repo has already
built and tested (`src/lib/bounded-race.ts`, detailed in section 4). Ship the
Route Handler without that wrapper and DECISION 6 has only relocated the
defect this row already names: an unbounded `callLlm` call that runs until
something else kills it, with no worded response reaching the pool. The
declared ceiling makes the KILL POINT known (60s instead of an unconfirmed
platform default); it does nothing on its own to make the kill graceful.

The reasoning, spelled out, because it is the load-bearing claim of this
document: DECISION 6's own text says the pool "is what resets the clock per
call, the route handler is what gives each call a confirmed ceiling" and that
the combination "was always the only candidate with both" (`docs/owner-
decisions-2026-09-23.md`, DECISION 6, bullet 2). A confirmed ceiling on the
INVOCATION is not a bound on the CALL inside it. `callLlm` (section 1, below)
has no way to stop early, so a Route Handler that simply awaits it either (a)
returns once the call finishes, taking however long that is, up to the
platform's real kill, or (b) is killed by the platform mid-call, in which case
its own `try`/`catch` never runs and the pool sees a raw transport failure --
exactly the failure mode this row already documents for Server Actions,
moved to a Route Handler with a number attached. G4's own note field
(`docs/backlog.yml:127`) states the general version of this fact about the
OLD, unconfirmed-ceiling design: "knowing the ceiling and bounding the call are
two halves of one fix, not alternatives." DECISION 6 supplies the first half.
Nothing has yet supplied the second. That is what this document scopes.

---

## 1. The current shape of `callLlm`

`src/lib/llm.ts:375-378`:

```
export async function callLlm(
  req: LlmRequest,
  provider: LlmProvider = DEFAULT_PROVIDER
): Promise<LlmResult> {
```

`LlmProvider` (`llm.ts:22`) is `"gemini" | "other" | "embedded"`. There is
exactly ONE branch inside `callLlm`, not a per-provider dispatch:
`llm.ts:379-386` --

```
  // Generic text generation always uses Gemini. The Course Engine ("other")
  // provider does not implement this generic interface ...
  void provider;
  return callGemini(req);
```

So the three-value type does not describe three timing behaviours -- every
call, regardless of the `provider` argument, runs the identical path:
`callGemini` (`llm.ts:482-566`) -> `postGenerateContent` (`llm.ts:434-480`) ->
`fetch(url, {...})` at `llm.ts:452`. This simplifies rather than complicates
the remedy: there is one transport to bound, not three.

**No AbortSignal, no fetch-level timeout, anywhere in the file.** Measured
2026-09-23:

```
grep -n "AbortSignal\|AbortController\|signal\|setTimeout\|timeout" src/lib/llm.ts
```

returns two lines: `:401`, `return new Promise((resolve) => setTimeout(resolve,
ms));` -- the `sleep()` helper used only for retry BACKOFF delays, never for
bounding a request -- and `:718`, a doc comment ("... whose text (when
present) is the primary, always-real signal ...", opened directly, confirms
this is prose about a finish-reason field, not a cancellation mechanism).
Neither `fetch` call in the file (`:452` in `postGenerateContent`, text path;
`:608` in `postInteraction`, image path, `generateGeminiImage`'s transport)
passes a `signal` option. This matches the row's own citation and the row's
own caveat about it ("the single 'signal' hit at :718 is prose about
something else") -- re-confirmed, not stale.

**A second transport shares the same gap and the same retry loop, but is a
separate call surface.** `generateGeminiImage` (`llm.ts:757`) is exported
directly, not reached through `callLlm`, and is NOT part of the 127-site
census below. It shares `postInteraction`'s retry/backoff with the text path
but is out of G4's stated scope (the row's title names `callLlm`). Recorded as
a residual (section 7) rather than folded in silently.

**A latent bug found this pass, not in the original row, that matters the
moment anyone adds real cancellation:** both transports' retry loops treat
EVERY thrown error from `fetch` as transient and retry it. `postGenerateContent`,
`llm.ts:457-463`:

```
    } catch (err) {
      // Network/transport error -- always transient, retry with backoff.
      lastResult = { ok: false, status: 0, body: err instanceof Error ? err.message : "Network error" };
      if (isLastAttempt) return lastResult;
      await sleep(backoffDelay(attempt, null));
      continue;
    }
```

`postInteraction`, `llm.ts:617-623`, is byte-identical in shape. If a future
change passes an `AbortSignal` into either `fetch` call, an abort fires as a
thrown `AbortError`, which this `catch` cannot distinguish from a network
blip -- it retries up to `MAX_ATTEMPTS = 5` (`llm.ts:396`) with backoff up to
`MAX_DELAY_MS = 10000` (`llm.ts:398`) per attempt, which can burn most of the
existing ~9s worst-case backoff budget (the file's own comment at `llm.ts:393`)
AFTER the caller has already decided to stop waiting. This does not affect the
wrapper-based remedy recommended in section 4 (it never touches `fetch`'s
`signal` option), so it is not a blocker for A39. It IS a blocker for any
FUTURE true-cancellation design and is recorded as a residual (section 7)
rather than fixed here, since fixing it now with no caller yet exercising it
has no verification target.

---

## 2. Every caller

Command, run 2026-09-23:

```
grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
```

returns **127**, matching the row's own 2026-09-22 re-measurement
(`docs/backlog.yml:125`) exactly -- the figure has not moved in the last day.

```
grep -rln "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
```

returns **64** files.

**Both figures are over-counts, and re-opening them is what this section is
for rather than quoting them as-is.** A line-text grep cannot tell a real
invocation from a comment that merely mentions the function name. Proxy check
for comment-shaped matches (line begins with `//` or `*` before `callLlm(`):

```
grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -E "^[^:]+:[0-9]+:\s*(//|\*)"
```

returns exactly 2 lines: `src/lib/llm.ts:16` (this file's own doc comment,
"... callLlm() so the active provider can be switched ...") and
`src/lib/knowledge-overview-prompt.ts:9` ("... a caller to hand to callLlm().
The only import is LlmContent's TYPE ..."). Both opened directly.
`knowledge-overview-prompt.ts` is a pure prompt-builder confirmed by reading
`:1-20`: "This module never touches the network ... The only import is
LlmContent's TYPE (erased at compile time)" -- it does not call `callLlm` at
all; its real callers (course-intel and class-trends-insight routes) already
appear elsewhere in the 64-file list under their own names. `llm.ts` itself is
the definition file, not a caller. **So the honest minimum is 125 real call
sites across at most 62 real caller files** -- this is a floor, not a
recount of all 127: the comment-prefix proxy only catches `//`/`*`-led lines
and would miss a call named inside a block-comment continuation with no
leading marker. No such case was found, but the method cannot rule one out.

### Route Handlers (3 of the 64) -- the closest analogue to what A39 will add

```
grep -n "maxDuration" src/app/api/ai-chat/route.ts
grep -n "maxDuration" src/app/api/class-trends-insight/route.ts
grep -n "maxDuration" src/app/api/course-intel/ask/route.ts
```

Canary that the pattern fires when present (run first, so the absence claims
below are trusted): the same grep against
`src/app/api/automations/run-now/route.ts` returns `:43: export const
maxDuration = 60;` -- confirmed hit.

| Route Handler | `maxDuration` | Wrapped? |
|---|---|---|
| `src/app/api/ai-chat/route.ts` | **absent** (grep exit 1, a real absence against the canary above, not a broken pattern) | No. Chat endpoint, one message in, one call to `callLlm` (`route.ts:1-2` imports it directly), fully user-facing -- an instructor watching a chat window. This is a THIRD reachable unbounded path beyond the two the row already names, found this pass. |
| `src/app/api/class-trends-insight/route.ts` | `:33`, `= 60` | Yes -- `withDeadline` (section 4), `:148-149` |
| `src/app/api/course-intel/ask/route.ts` | `:134`, `= 60` | Yes -- `withDeadline`, `:426-430`, budget `TOTAL_BUDGET_MS = 54_000` at `:145` |

So 2 of the 3 Route Handlers already ship the shape DECISION 6 needs; the
third (`ai-chat`) does not, and is a live, user-facing, currently-unbounded
call that is NOT one of the row's two named paths.

### Server Actions and the grading chain (the path DECISION 6 touches)

52 of the 64 files live under `src/app/actions/`. 48 carry a top-of-file
`"use server"` directive (`grep -l '"use server"' <files> | wc -l` = 48); the
other 5 (`current-events-assignment-generator.ts`,
`intro-discussion-generator.ts`, `learning-resources-generator.ts`,
`module-objectives-generator.ts`, `shared.ts`) are leaf helpers a real action
invokes directly -- two of them say so in their own header comments (e.g.
`current-events-assignment-generator.ts:14`, "no 'use server' directive (this
file is a leaf the caller invokes directly ...)"). `learning-resources-
generator.ts` is one of the row's own two named reachable paths.

**The grading engine specifically -- the file DECISION 6's redesign wraps.**
`src/lib/grade/engine.ts:74` calls `callLlm` inside `gradeSubmission`
(`:30-116`), with no wrapper of any kind around it today (confirmed by reading
`:60-116` directly; the call at `:74-79` is a bare `await`). The call chain
inside the same file: `gradeSubmission` (`:30`) is called by
`gradeStudentEntries` (`:178`), called by the three exported entry points
`gradeSubmissions` (`:403`), `gradeEntries` (`:457`), `gradeCanvasUrl` (`:473`).

```
grep -rln "gradeSubmissions(\|gradeEntries(\|gradeCanvasUrl(" src --include=*.ts | grep -v "\.test\." | grep -v "src/lib/grade/engine.ts"
```

returns exactly three files: `src/app/actions/github-repos.ts`,
`src/app/actions/github.ts`, `src/app/actions/grading.ts`.

**This one engine is reached BOTH attended and unattended today, and the two
paths are protected differently -- this is the pairing item 2 asks for.**

- **Attended:** `src/app/page.tsx:63`, `useActionState(gradeAction,
  initialState)` -- a real instructor click, a spinner on screen, a Server
  Action with no `maxDuration` of its own (client components cannot export
  route segment config; `page.tsx:1` is `"use client"`). Effective bound:
  UNCONFIRMED. `docs/a29-architecture.md:285` records this exact question
  (OC5, "What is the platform's unconfigured Server Action duration on this
  Vercel project?") as still open, answer "Repo owner ... Verify", and
  DECISION 6's own preamble (`docs/owner-decisions-2026-09-23.md`, "The
  question was what the unconfigured Server Action duration ceiling actually
  is ... with the recommendation to stop depending on the answer") is the
  owner choosing to stop needing that answer for the per-item call, not an
  answer to it. Do not treat "platform default" as a known number anywhere in
  this document; it is not measured in this repo.
- **Unattended:** three workflow-registry steps run this same engine inside a
  cron tick -- `steps.grading-run.ts:473-478`, `steps.grading-draft-flow.ts
  :262`, `steps.grading-cartridge.ts:100` (all three re-opened this pass, all
  three carry the identical comment, quoted once: "N13a Ruling 1/2:
  getGeminiMaxSubmissions is read ONCE on the shared path, so raising it to 40
  raises it here too, inside this cron tick's maxDuration=60s budget. The
  wall-clock deadline ... is what keeps this step from attempting up to 40
  students in one invocation."). The tick's own ceiling is declared:
  `src/app/api/cron/run-schedules/route.ts:56`, `maxDuration = 60`. But that
  60s is SHARED across every institution and student the tick processes
  before reaching this call, not a fresh budget per call -- and the
  `runDeadlineMs` check the comment describes only refuses to START a new
  student past the deadline; it does not bound a student's call once started.
  **This is the row's defect, already live, already costing this repo an
  extra piece of machinery to work around it:** the wall-clock "refuse to
  start" check exists precisely because nothing bounds the call in progress,
  which is the gap G4 names.

---

## 3. What the platform actually does today, per call site

`docs/loop/this-repo.md` section 6 states there is no `.env`, no live key, and
"any claim about real query/model behaviour ... is unverifiable here" --
nothing below is a live timing measurement; every figure is a declared config
value read from source, cited as such.

| Call site | Declared ceiling | Effective bound |
|---|---|---|
| `course-intel/ask/route.ts` | `maxDuration = 60` (`:134`) | Self-imposed 54s (`TOTAL_BUDGET_MS`, `:145`), enforced by `withDeadline` -- the route never lets the platform be the one to end the call |
| `class-trends-insight/route.ts` | `maxDuration = 60` (`:33`) | Wrapped in `withDeadline` at `:148-149`; the specific budget constant was not re-opened this pass (out of G4's file set) |
| `ai-chat/route.ts` | none declared | UNCONFIRMED Route Handler platform default. Vercel's public docs state 10s as the Hobby default for an unconfigured function, but this repo has never measured or recorded that figure itself (unlike the Server Action case, which at least has OC5 tracking it as an open question) -- so it is UNVERIFIED here, not 10s as a fact of this repo |
| `page.tsx` (attended grading) | none (client component, cannot declare) | UNCONFIRMED (OC5, `docs/a29-architecture.md:285`, still open) |
| `steps.grading-run.ts` / `-draft-flow.ts` / `-cartridge.ts` (unattended grading) | `maxDuration = 60` on the containing tick (`cron/run-schedules/route.ts:56`) | A SHARED, shrinking remainder of that 60s, not a per-call budget; today's only protection is the wall-clock "do not start a new student late" check, which does not bound a student already in flight |
| The other ~58 caller files (Server Actions with no workflow-step path, per this pass's spot checks) | none available (client-invoked Server Action) | UNCONFIRMED, same as `page.tsx` |

**DECISION 6's per-item Route Handler, once built, adds a row identical in
shape to the first two:** `maxDuration = 60` declared, and -- if this row's
requirement is honoured -- a self-imposed budget under it enforced in code,
not left to the platform. If it is not honoured, the new row looks like the
`ai-chat` row instead: a declared-but-unenforced ceiling with the platform as
the only thing that ever actually stops the call.

---

## 4. The remedy's shape

Three shapes were named in the brief: an `AbortSignal` threaded through, a
timeout wrapper at the call site, or a per-provider deadline. Per-provider is
moot (section 1: one branch, no per-provider divergence to bound
differently). Between the other two, **this repo has already built, tested,
and partially adopted the wrapper shape** -- reusing it is cheaper than it
looks and is what this section recommends.

### 4a. The wrapper already exists, twice, at two different quality levels

**`withDeadline`** (`src/lib/course-intel/fetch.ts:316-325`) is the one
DECISION 6's own architecture already cites (`course-intel/ask/route.ts:47-50`
per DECISION 6's text) and the one two of the three route handlers already
use (section 2). Its own doc comment, `fetch.ts:294-315`, states the exact
defect this row files, independently, in its own words: "the LLM client in
this repo has NO fetch timeout of any kind ... It also takes no AbortSignal,
so nothing can cancel it," and is explicit about what it does NOT do: "It
bounds the CALLER'S WAIT, not the work. The abandoned request keeps running
until the function ends." Implementation:

```
export function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  const signal = AbortSignal.timeout(ms);
  ...
  return Promise.race([work, timeout]);
}
```

**`raceWithTimeout`** (`src/lib/bounded-race.ts:31-75`) is a second, newer,
domain-free implementation of the same idea, explicitly built NOT to use
`AbortSignal.timeout`: `bounded-race.ts:20-24`, "The bound is a plain
`setTimeout`, not `AbortSignal.timeout`. That is not a style choice -
`vi.useFakeTimers()` patches `setTimeout` but does not patch
`AbortSignal.timeout`, so a bound built on the latter cannot be driven
synchronously in this repo's tests." It returns a tagged `BoundedOutcome`
(`settled` / `timedout` / `failed`) instead of throwing, and its own test file
(`src/lib/bounded-race.test.ts:1`, "Every test here runs under
`vi.useFakeTimers()` with zero real elapsed [time]") proves it is fully
testable without a real clock -- something `withDeadline` cannot claim, since
`AbortSignal.timeout` does not respond to fake timers.

**`raceWithTimeout` has zero production callers today:**

```
grep -rln "raceWithTimeout" src --include=*.ts | grep -v "\.test\."
```

returns only `src/lib/bounded-race.ts` itself. It is built, committed, and
tested, and nothing calls it yet.

### 4b. The recommendation

Use `raceWithTimeout`, not `withDeadline`, at the new Route Handler A39 will
build, wrapping whichever top-level call the handler makes into the grading
engine (`gradeSubmission` or a thin wrapper around it -- A39's own
architecture pass decides the exact call, not this document). Reasons, in
order:

1. It is fake-timer testable (section 6), which `withDeadline` is not --
   this matters because nothing here can drive a REAL 55-second wait in a
   test.
2. It does not throw, which fits a per-item pool result better than a
   thrown error a pool loop has to catch per item.
3. It costs nothing at any of the other ~61 caller files. This is a
   caller-side wrapper at ONE new call site, not a `callLlm` signature
   change. No existing file in the 64-file census needs to change for A39 to
   ship this correctly.

Budget precedent already in this repo, to size the deadline against: `course-
intel/ask/route.ts:145`, `TOTAL_BUDGET_MS = 54_000` against a declared
`maxDuration = 60` -- a 6-second reserve. The same shape (a route-level
constant, comfortably under 60, leaving margin for the handler's own
JSON-encode/response-send overhead) is the one to carry into A39's route
handler; the exact number is A39's own call, not this document's.

### 4c. What a signal-threaded, TRUE-cancellation remedy would cost, named so it is not silently assumed away

The deeper fix -- an optional `signal?: AbortSignal` added to `LlmRequest`
(`llm.ts:48-55`) or as a second parameter to `callLlm`, threaded into both
`fetch` calls (`:452`, `:608`) -- would actually stop the in-flight request
rather than merely stop waiting on it. Costed honestly: as an ADDITIVE,
optional field it does not force a signature-breaking change across the 62
real caller files (an optional parameter with no default behaviour change is
backward compatible), so it is NOT the "127-site wave" the row's own note
warns against for a callLlm SIGNATURE change. It is, however, two more things
this document does not deliver: (a) the `AbortError`-retried-as-transient fix
in section 1 becomes mandatory the moment any caller passes a real signal, or
a caller's own abort gets silently retried past its own deadline; (b) it buys
nothing on Vercel that `raceWithTimeout` does not already buy for a
single-student-per-invocation Route Handler, because the invocation ends
(and Vercel reclaims the process) at the same moment regardless of whether
the abandoned `fetch` promise was formally aborted or merely un-awaited --
this repo's own `withDeadline` comment makes exactly this point ("The
abandoned request keeps running until the function ends"). Recorded as a
residual (section 7) for a design seat to weigh, not decided here.

---

## 5. What the user sees when a call is cut short

Two different users, two different surfaces, and the rule that binds both:
per `docs/owner-decisions-2026-09-23.md` DECISION 2 (citing A31 Ruling 1), "a
sentence may assert only what holds on every caller and every reachable
state."

**A39's per-item Route Handler, WITH the wrapper (section 4b):** the pool's
fetch to that handler gets a normal HTTP response carrying `{ error: "<label>
did not finish within N seconds" }` (the exact shape `withDeadline`'s
rejection message already uses, `fetch.ts:319-320`) -- NOT a hung connection,
NOT a raw transport failure. The pool, per DECISION 6 ("a per-item failure the
pool can report rather than a whole run dying"), can then do exactly what the
grading engine's own `GradedResult | UngradedResult` union (N13a, shipped
`7c409a6`) already models: mark this one student as not-graded with a stated
reason, and continue with the rest. **What is NOT preserved:** any partial
text from the timed-out model call. Gemini's `:generateContent` endpoint used
here is non-streaming (`postGenerateContent` awaits one full JSON response,
`llm.ts:475`) -- there is no partial output to salvage from an abandoned call,
so "no partial work is preserved" is true for that one student's attempt, and
distinct from "no partial work is preserved" for the RUN as a whole, where
every already-completed student's result is unaffected because each is its
own Route Handler invocation under A39's redesign. The honest sentence: *this
one student was not graded because the call did not finish in time; every
other student's result in this run is untouched.*

**A39's per-item Route Handler, WITHOUT the wrapper (the shape this document
argues against):** whatever the platform does at 60s -- a raw connection
drop, no `{error}` body, nothing the pool's own `try`/`catch` can distinguish
from a network failure on the client's own connection. This is the SAME
failure shape the row already documents for the unbounded Server Action case,
merely with a known instead of unknown kill time. No copy can honestly say
"the app tells you why grading stopped" under this shape, because it does
not.

**`ai-chat/route.ts` today (found this pass, not one of the row's two named
paths, and NOT touched by A39's redesign):** no `maxDuration`, no wrapper --
an instructor mid-conversation who hits a slow call sees whatever the
platform's unconfigured default produces, which this repo has never measured
(section 3). This is a live, user-facing instance of the row's defect, sitting
outside the grading chain DECISION 6 touches, and is recorded as its own
residual (section 7) rather than folded into A39's fix, since fixing it needs
its own `maxDuration` decision this document has no authority to make.

---

## 6. What can be tested here, and what cannot

`docs/loop/this-repo.md` section 2: `vitest.setup.ts` throws on any real
`fetch`, and network is blocked by design. Section 6: no live key, no real
model output verifiable locally. Neither of those blocks testing the WRAPPING
logic, and this repo already has the proof: `src/lib/bounded-race.test.ts`
exercises `raceWithTimeout` entirely under `vi.useFakeTimers()` with, per its
own header comment, "zero real elapsed [time]" -- a `neversettles` promise
races a fake timer and the test asserts `{kind: "timedout"}` synchronously.
The SAME pattern (already proven, `fetch.test.ts:627-638`, quoted in section
4a) extends to a source-text wiring assertion over the new route handler
file, once it exists: read the file's source with `readFileSync`, `matchAll`
every `callLlm(` (or `gradeSubmission(`) occurrence, and assert each one sits
inside a `raceWithTimeout(` argument within N characters before it -- exactly
`fetch.test.ts:627-638`'s own shape, ported.

**What CAN be asserted, concretely, once the route handler exists:**
1. `raceWithTimeout` itself already has full coverage (fake-clock timeout,
   fake-clock settle-in-time, no-unhandled-rejection) -- nothing new needed
   there, it is existing infrastructure being reused, not built.
2. A wiring test on the new route handler's source text, proving the call is
   nested inside the wrapper (not merely imported and unused nearby) --
   `fetch.test.ts:627-638` is the literal template.
3. A unit test on whatever function the handler calls (`gradeSubmission` or a
   thin per-item wrapper), stubbing `callLlm` itself (module-level mock, no
   real `fetch` touched) to never resolve, and asserting the wrapped call
   returns `{kind: "timedout"}` under `vi.useFakeTimers()` rather than hanging
   the test.

**What CANNOT be asserted here, and must be routed to the owner rather than
implied as covered:**
1. Real Gemini call latency, and whether the chosen deadline constant (e.g.
   54s, section 4b) is actually generous enough for a real submission's grade
   call -- no live key, no network (`this-repo.md` section 6).
2. Whether the platform genuinely reclaims the abandoned `fetch` at the
   moment the Route Handler returns, versus continuing to bill/run it for
   some further interval -- this is Vercel platform behaviour, unobservable
   from a vitest process.
3. Whether the pool actually renders "not graded, timed out" to the
   instructor in a way that reads clearly -- nothing here renders a
   component (`this-repo.md` section 2 and section 6, repeated because it is
   the single most consequential limit in this repo).
4. The `ai-chat/route.ts` unconfirmed-default question (section 3) -- no test
   can measure a live platform default; only a Vercel dashboard read or a
   real timed request can.

A green suite under this plan proves the WRAPPING is wired correctly. It
proves nothing about whether the chosen number of seconds is the right one,
and no sentence in an implementation's test report may claim otherwise.

---

## 7. Wave plan and residual register

**This document's own write set is exactly this one file.** No wave below is
executed by this pass; the plan is handed to the next seat that scopes A39's
implementation and to whichever seat later re-opens G4 proper.

### Wave A -- inside A39's own wave 1 (not a separate G4 chunk)

Not scheduled independently. Recorded here as the REQUIREMENT A39's own
acceptance criteria must carry, per the prerequisite-by-inclusion argument at
the top of this document.

- **File(s):** the new Route Handler A39's architecture pass creates (path
  not yet named -- A39 is `state: 'unscoped'`), plus a new source-text wiring
  test alongside it (pattern: `fetch.test.ts:627-638`).
- **Content:** wrap the handler's call into the grading engine in
  `raceWithTimeout` (`src/lib/bounded-race.ts`), deadline sized with margin
  under `maxDuration = 60` (precedent: `TOTAL_BUDGET_MS = 54_000`,
  `course-intel/ask/route.ts:145`). On `{kind: "timedout"}` or `{kind:
  "failed"}`, return a normal JSON error response, not a thrown/unhandled
  error, so the pool's own fetch to the handler gets a body to parse.
- **Pass condition:** the wiring test (object under comparison: the route
  handler's source text; instrument: `readFileSync` + `matchAll` against
  `callLlm(`/`gradeSubmission(`, exactly as `fetch.test.ts:627-638`; direction
  of failure: RED if any such call site's preceding 200 characters do not
  contain `raceWithTimeout(`) plus a fake-timer unit test on the wrapped
  function (object: the function's returned promise; instrument:
  `vi.useFakeTimers()` plus a stubbed `callLlm` that never resolves;
  direction of failure: RED if the promise does not settle to a timeout
  outcome before real time would have to elapse).
- **Owner:** whichever seat scopes/implements A39's Route Handler wave.

### Wave B -- the AbortError-retry hazard (section 1), independent, small, no urgency

- **File:** `src/lib/llm.ts`, the two identical `catch` blocks at `:457-463`
  and `:617-623`.
- **Content:** distinguish an aborted `fetch` (an `AbortError`/`DOMException`
  with `name === "AbortError"`) from a genuine transient network error, and
  return immediately on the former instead of entering the retry/backoff
  loop.
- **Pass condition:** object under comparison: `postGenerateContent`'s
  returned result; instrument: a test stubbing `fetch` to reject with an
  `AbortError` under `vi.useFakeTimers()`, asserting zero `sleep()` calls
  (no backoff observed) and an immediate `{ok: false}` return; direction of
  failure: RED if the stub is invoked more than once (a retry occurred).
- **Why not now:** dead code today -- no caller passes a `signal` into either
  `fetch` call (section 1), so nothing exercises this path yet, and a test
  written against a path nothing reaches is exactly the kind of
  non-removal-test `docs/loop/leverage.md`'s removal-test discipline warns
  against for a different reason (no assertion changes without the bug,
  because the bug cannot fire). Becomes mandatory the moment Wave C (below)
  or any other caller starts passing a real `AbortSignal`.
- **Owner:** the next G4-proper implementer wave, sequenced before Wave C.

### Wave C -- the rest of G4 (the ~60 remaining unbounded call sites), NOT this chunk

- **Scope:** every caller outside the grading chain and the two already-
  wrapped route handlers -- roughly 60 of the 62 real caller files (section
  2), including the newly-found `ai-chat/route.ts` (section 2/5) and the
  row's own two originally-named paths (`discussion-replies.ts` via
  `learning-resource-links.ts`, `learning-resources-generator.ts:229`).
- **Why not bundled here:** the row's own note (`docs/backlog.yml:127`)
  already rules this out as one chunk: "NOT to be worked as one chunk: at 127
  call sites ... any `callLlm` signature change is a repo-wide seam and needs
  its own chunking." Nothing in this pass changes that arithmetic -- if
  anything the corrected 125/62 floor (section 2) confirms the same order of
  magnitude.
- **Shape, once scoped:** per-caller `raceWithTimeout` wrapping is the
  cheapest (no `callLlm` signature change, same pattern as Wave A), at the
  cost of ~60 separate wrapper placements with no shared enforcement point;
  OR an optional `signal`/deadline parameter on `callLlm` itself (section 4c)
  with a repo-wide wiring test replacing the per-caller one -- a genuine
  design fork for a `loop-architect` pass, not decided here.
- **Owner:** a dedicated future G4 chunk, scoped separately from A39.
- **Instrument for "done":** the same wiring-test shape already proven at
  `fetch.test.ts:627-638`, generalized to run over every file in the
  caller census (section 2) rather than one route's source.

### Residual register

| # | What is not proven now | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | `ai-chat/route.ts` has no `maxDuration` and no wrapper -- a live, user-facing unbounded path outside the two the row named and outside A39's redesign | A future G4-proper chunk (Wave C) or a standalone follow-up, owner's call which | `grep -n maxDuration src/app/api/ai-chat/route.ts` (today: absent) re-run after any fix | Fix lands, then the same grep confirms presence, then a `withDeadline`/`raceWithTimeout` wiring test per section 6's pattern |
| R2 | The `AbortError`-retried-as-transient defect in `postGenerateContent`/`postInteraction` (section 1, Wave B) | Next G4-proper implementer, sequenced before any real `AbortSignal` threading | Fake-timer test stubbing an aborted `fetch`, asserting no retry (section 7, Wave B pass condition) | Land Wave B before Wave C if Wave C's chosen shape is signal-threading rather than per-caller wrapping |
| R3 | Whether `callLlm` should eventually gain a true-cancellation `signal` parameter (section 4c) versus staying wrapper-only forever | A `loop-architect` pass, not this document | Cost comparison already laid out in section 4c; needs an owner/architect decision, not a measurement | Decide as part of Wave C's own scoping, before Wave C's implementer wave starts |
| R4 | Whether the deadline constant A39's handler picks (precedent: 54s under 60) is actually generous enough against a real Gemini grading call | Repo owner, live key required | One real timed grading run against production Gemini, per `this-repo.md` section 6's "no API keys" limit | A39's own owner-verification step, before or shortly after its first production deploy |
| R5 | Whether an instructor actually sees a legible "not graded, timed out" state on screen, versus a technically-correct API response nobody surfaces well | Repo owner / a UX pass on A39's as-built diff | Real browser observation -- nothing here renders a component (`this-repo.md` section 2/6) | A39's own follow-up UX pass against its as-built diff, per `docs/DEV_LOOP.md`'s "Follow-up design seats against the as-built diff" step |
| R6 | `generateGeminiImage`'s identical no-AbortSignal gap (section 1) -- a separate call surface, not part of the 127-site `callLlm` census | Whoever next touches `src/lib/llm.ts`'s image path, or a dedicated future row | `grep -n "signal" src/lib/llm.ts` re-run against the `postInteraction` block specifically | Filed as a finding here; not yet its own backlog row -- an agent picking this up first owes it a row, per `docs/DEV_LOOP.md` step 0 ("a residual with all three that lives only in a scratchpad is the same deletion with extra steps") |

---

## Verification of this document's own write set

Ran after writing, from the repo root:

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Exit code captured to a file rather than read from a pipe, per this pass's
own instruction; see the orchestrator/checker turn for the recorded value.
`git status --short` was run to confirm the write set is exactly
`docs/g4-scope.md` (plus the two files already modified before this pass
started, per the session's own git-status snapshot: `docs/a39-architecture.md`
and `docs/css-orphans.md`, neither touched by this pass). No file under
`src/`, `docs/backlog.yml`, `docs/BACKLOG.md`, or any of `docs/a39-*`,
`docs/a24-*`, `docs/a32-*`, `docs/a37-scope.md`, `docs/a3-scope.md`,
`docs/n15-rubric-picture-scope.md` was opened for writing by this pass.
