# PRES-1 site-reliability pass

- Item: PRES-1, area `presentations-authoring`.
- Seat: `loop-seat` (Sonnet), reliability pass, round 1. A fresh `loop-checker`
  gates this document before its consumer (the architect / implementer waves)
  reads it.
- Consumes: `docs/pres-1-acceptance-criteria.md` (AC round, checked, owner
  forks resolved 2026-09-29). Owner decisions treated as fixed, not
  re-litigated: **R-1** deck format is `.pptx` via the shipped
  `src/lib/pptx.ts` `buildSlidesPptx`, with a distinct on-page preview build
  item; **R-2** Presentations is a new Tools inner-nav sibling that reuses
  existing decks/pptx/intake infrastructure and leaves the `ppt-design` tab
  untouched.
- No architect artifact exists yet for PRES-1 (`find docs -iname "*pres*"
  -o -iname "*slide-deck*"` returns only the AC document itself, run from the
  repo root 2026-09-29). This pass therefore **recommends** a request/response
  shape where mechanism is undecided and states the underlying constraint as a
  pass condition that binds whatever shape the architect actually picks - it
  does not gate the architect's choice of file layout or component structure.
- This is production-code-free: no file under `src/` was changed by this pass.
  One throwaway probe test (`src/lib/__pres1_pptx_probe.test.ts`) was written,
  run, and deleted during authoring to measure `buildSlidesPptx`'s real
  behaviour on edge-case input (section 3 below); `git status --short` at the
  end of this session shows no such file and no other change under `src/`.

## Environment ceilings that bind every claim below

Measured facts (`docs/loop/this-repo.md` sections 2, 6), restated because a
reliability pass lives or dies on which numbers are real:

- **No API key locally.** `GEMINI_API_KEY` is owner-set in Vercel only. No
  claim in this document about REAL Gemini latency, real retry frequency, or
  real generation wall-clock time is measured - every timeout number below is
  either read from this repo's own already-shipped constants/comments, or
  computed arithmetically from them. Where I could not get a number at all, I
  say so and register it as a residual (section 9) rather than estimating.
- **No live deployment reachable from here.** Whatever Vercel's actual
  function-duration log or cold-start behaviour looks like in production is
  unverifiable in this checkout; the Hobby 60-second hard cap and the "a value
  above it fails to build" behaviour are as documented in this repo's own
  route comments and deployment memory, not as freshly reproduced here.
- **No component renders.** Nothing about whether a spinner, a partial-results
  list, or a disabled button actually appears on screen is checked here; that
  is UX's and Accessibility's reading claim, not this pass's.
- **pptxgenjs itself has no network dependency**, so unlike the LLM path its
  behaviour on edge-case input IS directly executable in this environment -
  section 3 uses that fact and states exactly how (a deleted throwaway test,
  not a permanent one).

---

## 1. The multi-artifact generation: per-artifact failure handling

### 1.1 What "one artifact's call fails while others succeed" actually means here

Four artifact kinds (outline, activities, deck, review), each potentially
needing up to two `callLlm` passes (produce, then adversarial review). Before
prescribing handling, the failure needs decomposing into the THREE shapes a
single `callLlm`-backed step can fail in, because each already has a
different, already-built idiom in this codebase and conflating them loses
information the user needs:

| Shape | What happened | Existing formatter/idiom |
|---|---|---|
| Transport/HTTP failure | `callLlm` returns `{ ok: false, status, body }` after retries are exhausted (`src/lib/llm.ts:200-202`) | `describeLlmFailure(result, label)` (`llm.ts:257-264`) - redacts, then truncates, the upstream body before it ever reaches a user-facing string |
| Empty/blocked response | `callLlm` returns `{ ok: true, text: "" }` (MAX_TOKENS, a safety block) (`llm.ts:200-202`, comment at `:266-278`) | `describeEmptyLlmText(result, label)` (`llm.ts:272-278`) - surfaces `finishReason` when present |
| Structurally unparseable response | HTTP 200, non-empty text, but the text does not parse into the artifact's expected JSON/shape | No shared formatter - each caller writes its own message. Precedent: `discussion-replies.ts:373-377`, `"Could not read the drafted replies from the model output."` |

**Pass condition 1a.** Object: the per-artifact result the generation
orchestrator hands to the UI for a selection of N artifacts where fewer than N
succeed. Instrument: a mocked-`callLlm` unit test where one artifact's mock
resolves `{ ok: false, status: 500, body: "..." }` (or rejects, if the
orchestrator itself throws per-artifact) while the others resolve
successfully; assert the orchestrator's return value contains the successful
artifacts' full content AND a distinguishable per-artifact failure record for
the failed one - never a top-level thrown exception, never a return value that
drops the failed artifact's key entirely (which would read as "not
selected" rather than "attempted and failed"). Direction of failure: FAILS if
one artifact's failure causes the whole call to reject/throw and the caller
loses the artifacts that DID succeed; FAILS if the failed artifact is silently
absent from the result rather than present with an error marker.

### 1.2 The house pattern to reuse, not reinvent

This exact shape - N independent generation units, partial success is the
normal case, not the exception - already has TWO executing precedents in this
repo, both real, both opened directly (not recalled):

- **`src/app/actions/learning-resource-links.ts:527-594`.** `Promise.allSettled`
  over N concepts (`:528-532`); each settlement is folded into a `perConcept:
  ConceptOutcome[]` array where a REJECTED promise gets its own entry carrying
  `failed: reason` (`:547-562`) rather than aborting the batch, and a
  human-readable line is pushed onto a shared `notes: string[]` (`:549`,
  `:574-578`, `:593-594`) that survives to the caller regardless of which
  concepts failed.
- **`src/app/actions/discussion-replies.ts:609-682`**
  (`gatherReplyResourcesAction`). Returns a discriminated `{ resources,
  degraded: boolean } | { error }` shape (`:629-634`). `degraded: true` is used
  for a KNOWN, EXPECTED capability limit (the embedded provider makes no
  network call, `:658-660`) - distinct from `{ error }`, which is reserved for
  an unexpected failure. This distinction matters for PRES-1: a deselected
  artifact producing nothing is not a failure (AC-4's "any combination"); a
  selected artifact's `callLlm` call failing IS a failure, and the two must
  never share one signal.

**Recommendation (not a gate - architect decides the exact type).** Model
PRES-1's per-artifact result as a discriminated per-artifact record, one of
`{ kind, status: "ok", content, critique? }`, `{ kind, status: "error", message
}`, or `{ kind, status: "not-selected" }` - mirroring `ConceptOutcome`'s
per-item discipline (`resource-search-outcome.ts`, referenced from
`learning-resource-links.ts:91`) rather than a single boolean `ok` plus a
shared error string, because a shared string cannot say WHICH of four
artifacts failed. The reviewing artifact's own failure (the adversarial pass
for a given content artifact) needs the same three-way shape, keyed to the
content artifact it was reviewing, so a produced-but-unreviewed artifact is
visibly different from a produced-and-reviewed one (this is also AC-5's own
requirement, restated here because it is also a reliability requirement: an
artifact whose review silently failed must not look identical to one that was
never asked to be reviewed).

### 1.3 The gap Promise.allSettled does NOT close

`Promise.allSettled` only protects against a per-artifact THROW or a per-item
`callLlm` failure while all four artifacts run inside the SAME server
invocation. It does **not** protect against the platform killing that whole
invocation before it returns a response - see section 2, which is the more
dangerous failure mode and the reason section 2's recommendation is not
"wrap the four calls in allSettled and call it done."

---

## 2. Timeouts against the Vercel Hobby 60s cap - arithmetic, not hand-waving

### 2.1 The cap itself, as this repo has already measured it

- Production is Vercel Hobby; the real hard ceiling is 60 seconds regardless
  of what any route requests (`docs/loop/this-repo.md`'s deployment memory;
  confirmed in-repo at `src/app/api/lms-generation/deck/route.ts:26-32`:
  "Requesting 300s does not, by itself, GRANT 300s... this repo's own
  deployment note records prod as Vercel Hobby, whose real hard ceiling is 60s
  regardless of what a route requests").
- A Server Action reachable from `src/app/page.tsx` gets no `maxDuration` at
  all, because that page sets none (`src/app/actions/command-interface.ts:28`,
  `src/app/actions/visualizer-selection.ts:21`) - so it runs under whatever the
  platform's own unconfigured default is, which is TIGHTER than 60s, not equal
  to it. This repo's own established response to "a Server Action's work will
  not fit that default" is to move the call to a Route Handler with an
  explicit `maxDuration`, not to try to stretch the Server Action
  (`visualizer-selection.ts:13-24`, `src/app/api/lms-generation/deck/
  route.ts:31-53`).
- On a platform-level kill, **nothing is intercepted from inside the
  handler** - no response reaches the client at all (`class-trends-insight/
  route.ts:40-42`: "that kill cannot be intercepted from in here, so it
  produces no response at all, not a worded error"). This is categorically
  worse than an `{ error }` return: the client sees a hung fetch, not a
  message.

### 2.2 The arithmetic: why one request for all four artifacts is unsafe on its own documented numbers

`callLlm`'s own transport layer retries up to `MAX_ATTEMPTS = 5` times on a
retryable HTTP status or a network error, with exponential backoff
(`BASE_DELAY_MS = 600`, `MAX_DELAY_MS = 10000`, both at `src/lib/llm.ts:396-
398`). The file's own comment (`llm.ts:393`) computes the worst-case backoff
delay (excluding jitter, excluding the calls' own latency) across the 4
retries as approximately 600 + 1200 + 2400 + 4800 ms, about 9 seconds. Adding
the documented jitter (`Math.floor(Math.random() * 400)` per attempt,
`llm.ts:439`) raises the true worst case to roughly 10.6 seconds - **per
single `callLlm` invocation, before counting any real model response time at
all.**

PRES-1's generation, per the owner's words and AC-4/AC-5, is up to 4 artifacts
x up to 2 passes (produce, adversarial review) = **up to 8 sequential `callLlm`
invocations** if built as one request that awaits them one after another.

- Object under comparison: the wall-clock cost of 8 sequential `callLlm`
  invocations inside ONE request, versus the platform's 60-second hard cap.
- Instrument: arithmetic over `llm.ts`'s own documented retry constants
  (`MAX_ATTEMPTS`, `BASE_DELAY_MS`, `MAX_DELAY_MS`, the jitter bound), which is
  the same instrument `llm.ts:393`'s own comment already uses for a single
  call.
- Result: 8 x ~9-10.6s of **worst-case retry backoff alone** = roughly
  72-85 seconds, already over the 60-second hard cap **with zero real model
  latency added and zero real network round-trip time added.** Real per-call
  latency is unmeasurable here (residual R-SRE-1), but it can only make this
  worse, never better - so the "8 sequential calls, one request" shape is
  unsafe on a lower bound alone, independent of the unmeasured number.
- Direction of failure: this shape FAILS (silently, per 2.1's "no response at
  all") the moment the FUNCTION's total wall-clock time - not any one call's -
  crosses 60s. A single slow or retried artifact near the end of the sequence
  can take down the three that already finished, because nothing is returned
  until the whole handler returns.

This is the same failure mode `lms-generation/deck/route.ts` already documents
for its own multi-call case, generalized: that route's own comment
(`:44-52`) states `saveGeneratedArtifactVersion` is the LAST line of the
success path, so "a timeout therefore fails clean: the instructor sees an
error and can retry... never a truncated deck silently saved" - true for THAT
feature because it treats the whole multi-call deck as ONE atomic unit by
design. PRES-1's owner ask is explicitly the opposite: four INDEPENDENT
artifacts where partial success must be visible (section 1). A single-request,
all-eight-calls shape inherits the deck route's atomicity whether PRES-1 wants
it or not, because HTTP responses are atomic - `Promise.allSettled` inside the
handler cannot make a response ride out early.

### 2.3 Recommendation: split the request boundary along the artifact boundary, not just the in-process error handling

**Recommended shape** (architect decides the concrete file layout; this binds
only the request/response boundary): the BROWSER drives the fan-out, one
request per selected artifact's produce+review pair (or, more conservatively,
one request per produce call and a separate request per review call - see the
sub-fork below), issued as soon as the prior context is available, not
sequentially awaited inside a single server call. This is not a new idea in
this codebase; it is the SAME answer this repo has already given three times
to the identical constraint:

1. `src/app/actions/command-interface.ts:26-32` (G12): "the fan-out is driven
   from the BROWSER, one invocation per row... This function must NEVER loop
   over rows - if it is ever changed to accept an array, that is a violation
   of this contract."
2. `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx:13-19`:
   `handleRead` calls its action "ONCE PER BATCH from an explicit `for await`
   loop inside a click handler - never from a useEffect, and never one action
   looping internally over every batch (Vercel's 60s cap is per invocation)."
3. `src/app/api/class-trends-insight/route.ts` and `src/app/api/course-intel/
   ask/route.ts`: both are thin Route Handlers doing ONE model call each,
   `maxDuration = 60` (`class-trends-insight/route.ts:33`), not a multi-call
   handler.

**Sub-fork inside the recommendation (reliability's opinion, architect's
call):** review-per-produced-artifact (up to 4 produce requests + up to 3
review requests, each request containing exactly ONE `callLlm` call) is safer
than produce+review paired per request (up to 4 requests, each containing 2
sequential `callLlm` calls), because it halves the worst-case retry-backoff
exposure per request (one call's ~9-10.6s worst case instead of two calls'
~18-21s) while still satisfying AC-5's per-artifact-keyed-critique requirement
regardless of which shape wins. I recommend the fully-split form; it costs one
more round trip and does not require a different type than the paired form.

**Recommended per-request mechanics**, reusing what already exists rather than
inventing a new deadline primitope:

- Each request is a Route Handler (not a Server Action reachable from
  `page.tsx`, per the established split criterion in 2.1), `maxDuration = 60`
  - matching `class-trends-insight/route.ts:33`, not the deck route's `300`,
    because a single-artifact request here is bounded to at most 2 sequential
    `callLlm` calls, never several loop groups' worth like the deck route.
- Each request imposes its OWN soft deadline strictly under 60s and returns a
  WORDED error before the platform kills it, exactly as `class-trends-
  insight/route.ts:47` (`TOTAL_BUDGET_MS = 50_000`) and `src/lib/course-intel/
  fetch.ts:316-325`'s `withDeadline` already do. **Important, measured
  caveat, quoted because it changes what "soft deadline" can honestly
  promise:** `withDeadline`'s own comment (`fetch.ts:303-307`) states it
  "bounds the CALLER'S WAIT, not the work... the abandoned request keeps
  running until the function ends." `callLlm`/`postGenerateContent` accept no
  `AbortSignal` parameter at all today (`llm.ts:375-386`, `:454-457`) - so a
  soft deadline wrapped around `callLlm` produces an early worded response for
  the CLIENT, but does not stop the retry loop's own CPU/network use inside
  the still-running function. This is fine for PRES-1's per-artifact split
  (each request does at most one `callLlm` call, so "give up waiting" and "the
  function is about to finish anyway" are close together), but it must not be
  described as cancellation, and a future wave adding a real `AbortSignal`
  parameter to `callLlm` (anticipated by `llm.ts:404-422`'s `isAbortError`
  comment, "once a future wave adds one") is what would close this gap for
  real.
- Pass condition 2a. Object: any single request/action invocation the
  architect's mechanism actually issues. Instrument: reading the as-built
  route/action file and counting sequential `callLlm` invocations reachable
  from one entry point without an intervening network response boundary.
  Direction of failure: FAILS if that count, multiplied by ~10.6s (2.2's
  worst-case-per-call figure), exceeds 50s (leaving 10s margin under the
  60s hard cap for parsing/serialization/auth, mirroring class-trends-
  insight's own margin of 10s between its 50s soft budget and the 60s cap).
  This condition binds regardless of which concrete file layout the architect
  picks - it is a property of the call graph, not of any one file.

---

## 3. The .pptx build: malformed input, empty content, and never a silently broken download

### 3.1 Measured, not assumed: what `buildSlidesPptx` actually does on bad input

`buildSlidesPptx` (`src/lib/pptx.ts:199-679`) performs **no runtime validation**
of its `BuildSlidesOptions` shape before handing fields to `pptxgenjs`. Rather
than assert this from reading alone, I wrote a throwaway vitest file
(`src/lib/__pres1_pptx_probe.test.ts`, deleted immediately after - see the
header of this document) exercising five edge cases directly against the real,
installed `pptxgenjs` (no network involved; this is a local library, unlike
`callLlm`, so this is genuinely machine-measured, not a reading claim). Ran
with `npx vitest run src/lib/__pres1_pptx_probe.test.ts --reporter=verbose`,
2026-09-29:

| Input | Result | Measured detail |
|---|---|---|
| `slides: []` | No throw. Valid, non-empty buffer. | `EMPTY_SLIDES_BYTELENGTH 45654` - just the title slide, ~45.6KB. |
| `slides: [{ title: undefined, bullets: [] }]` | No throw. Valid, non-empty buffer. | `UNDEFINED_TITLE_BYTELENGTH 51769` - a slide with a BLANK title is silently accepted. |
| `slides: [{ title: "X", bullets: "not-an-array" }]` | **Throws.** | `"slide.bullets.map is not a function"` - a raw, internal JS error message, not a user-facing one. |
| `presentationTitle: "", slides: []` | No throw. Valid, non-empty buffer. | `EMPTY_TITLE_EMPTY_SLIDES_BYTELENGTH 45506`. |
| `theme: { backgroundKind: "solid" }` (no `backgroundColor`) | **Throws.** | `"Cannot read properties of undefined (reading 'startsWith')"` - from `hexColor(theme.backgroundColor)` at `pptx.ts:104-107` calling `.startsWith` on `undefined`. |

The asymmetry is the finding: **some malformed shapes crash with an internal,
non-user-facing message; others silently produce a technically-valid but
content-deficient file.** Neither is what the owner's "must be VISIBLE and
DOWNLOADABLE" requirement (AC-6) wants, and neither is caught by any existing
test - `pptx.ts` has no test file of its own covering this (`find src -iname
"pptx*.test.ts"` was not run as part of this probe, but no such file is
imported by anything found while opening this module).

### 3.2 The existing download handler already swallows a throw silently - do not copy this into PRES-1

`src/app/components/ppt-design/index.tsx:545-563` (`handleDownloadPptx`) wraps
`buildOutputPptx()` (which calls `buildSlidesPptx` at `:536-542`) in a
try/catch, but its `catch` block (`:560-562`) only does `console.error("Download
failed:", err)` - it never calls `setGenerateError`, the same state the
`{ "error" in out }` branch two lines above (`:549-552`) DOES set. **A thrown
error from `buildSlidesPptx` (e.g. either crash case in 3.1's table) therefore
produces no user-visible feedback at all in the existing `ppt-design` tab** -
the button appears to do nothing. This is read directly from the file, not
inferred; R-2 leaves `ppt-design` untouched, so this existing gap is not this
pass's to fix, but PRES-1's OWN new download handler must not replicate the
same shape.

- Pass condition 3a. Object: PRES-1's own download handler's behaviour on a
  `buildSlidesPptx` throw (either of the two measured crash shapes in 3.1, or
  any other). Instrument: a unit test that calls the handler/action with a
  slide model constructed to trigger a real `buildSlidesPptx` throw (reusing
  the two measured triggers - non-array `bullets`, or a theme missing
  `backgroundColor`, if PRES-1 ever constructs a theme at all - see 3.4)
  and asserts the resulting user-facing state carries an error message, not
  merely a console log. Direction of failure: FAILS if the catch block's only
  effect is a `console.error` with no state change a component could render
  from - the exact shape measured in `ppt-design/index.tsx:560-562`.

### 3.3 "Empty content" needs a definition, because `buildSlidesPptx` does not refuse it

A deck with zero content slides is not rejected by `buildSlidesPptx` - it is a
valid ~45.6KB file with one title slide (3.1, row 1). If the generation
pipeline's parse step ever produces zero slides (a model that returns an empty
array, or a response that fails to parse into any slides at all), calling
`buildSlidesPptx` anyway produces a "successful" download that is, in the
owner's terms, not what was asked for - a misleading success, not a crash.

- Pass condition 3b. Object: the slide array the generation pipeline is about
  to pass to `buildSlidesPptx` for a selected deck artifact. Instrument: a
  pure pre-flight check (the architect's/test seat's to place) asserting
  `slides.length > 0` AND every slide has a non-empty, trimmed `title`, run
  BEFORE `buildSlidesPptx` is ever called, with the deck treated as a
  **generation failure** (same per-artifact `{ status: "error" }` shape as
  section 1's recommendation), not a zero-slide "success", when it fails.
  Direction of failure: FAILS if a deck with zero content slides, or any
  slide with a blank title, is ever presented to the user as a successfully
  generated, downloadable deck.

### 3.4 A concrete way to avoid the theme-crash mode entirely, not just catch it

The owner's ask (AC-6, the backlog quote) never asks for a themed/branded
deck - only a visible, downloadable one. If PRES-1's own deck-building call
simply omits `theme` (leaving `buildSlidesPptx`'s `theme?: PptxTheme`
parameter, `pptx.ts:70-91`, undefined), the standard NAVY/ACCENT path
(`pptx.ts:493-527`) runs, which this probe's five cases never exercised a
crash in. This is a construction, not a test: **not building a theme object at
all is cheaper and safer than validating one**, and it is available because
nothing in the owner's words requires a theme.

### 3.5 The download's non-empty-payload guarantee (AC-6's own machine instrument)

`prs.write({ outputType: "arraybuffer" })` (`pptx.ts:679`) is the one line
that actually produces bytes; every measured case in 3.1 that did not throw
returned a non-zero `byteLength` (45506-51769 bytes across the four successful
cases). AC-6 already names this as its own machine instrument ("a logic test
asserts non-empty output of the declared format for a non-empty deck",
`pres-1-acceptance-criteria.md:213-214`); this pass adds the corollary that
the test must ALSO cover the zero-slide case explicitly and assert it is
treated as a refusal upstream (3.3), not merely that the byte count is
non-zero - a non-zero byte count is necessary but not sufficient, because
3.1's own measurement shows a content-empty deck is ALSO non-zero bytes
(45654 vs 45506-51769 for a real deck - the byte-count gap between an empty
and a populated deck is real but small, and no test should rely on eyeballing
a byte threshold to distinguish them).

---

## 4. Regenerate-with-context: re-entrancy and concurrent-run guards

### 4.1 The two house patterns for "do not let a second click start a second run"

This repo has two DIFFERENT, both-executing precedents for exactly this
problem, and they make different tradeoffs the architect should choose
between (recommendation, not a ruling):

**Pattern A - refuse the second start (a `busy` string, checked before
dispatch).** `src/app/components/content-tab/modules/
lmsGenerationKindHelpers.ts:102` (`export type GenerationBusy = "" |
GenerationKindId`) and `:116-124` (`nextGenerationBusy`, `canStartGeneration`).
The defense is TWO-LAYERED, not merely a disabled button: `canStartGeneration`
is checked before every dispatch (`useLmsGeneration.ts:457,627,717,798`), AND
`nextGenerationBusy`'s own reducer is a no-op while already busy (`:116-120`:
"`start` while something is already running is a NO-OP - it returns the
CURRENT (already-running) kind unchanged... so a caller that skips the
`canStartGeneration` guard before dispatching still cannot start a second
concurrent write"). A double-click, or a click that races a disabled-prop
re-render, cannot start two concurrent generations even if the UI-level guard
is bypassed.

**Pattern B - abort the first, start a fresh one.**
`src/app/components/snapshot-grading/SnapshotGradingPanel.tsx:290-312`
(`gradeAbortRef`, `beginGradeAbort`). `beginGradeAbort` (`:309-312`) aborts any
existing in-flight controller THEN creates and stores a new one, reachable
"ONLY from the Grade button's onClick... never from an effect"
(`useSnapshotGrade.ts:12-14`). A second click cancels the first request's
result (its resolution is discarded because a fresh controller/generation now
owns the ref) and starts clean, rather than refusing the click outright.

**Recommendation.** For a REGENERATE button specifically (as opposed to first
generation), Pattern B reads closer to the owner's own words - "regenerate the
plan from those comments" implies the instructor changed their mind and wants
the NEW attempt to win, not to be told to wait. Pattern A is simpler and has
two independent points of defense already proven in this codebase. Either is
acceptable; **what is not acceptable is neither** - a plain `useState`
loading flag with no defense against a second click racing the render that
disables the button is the failure this section exists to rule out, and
this repo has already measured that failure mode's blast radius in a
different feature (`SnapshotGradingPanel.tsx:45-60`'s `studentGenerationRef`
comment describes exactly this race for "Next student", see 4.2).

### 4.2 The subtler race a boolean guard does not catch, and the mechanism that does

`SnapshotGradingPanel.tsx:45-60`'s `studentGenerationRef` comment documents a
race a simple busy-boolean CANNOT catch: an action not itself gated by the
busy flag (there, "Next student"; for PRES-1, plausibly "paste new context" or
"switch away from Slide Deck Creation") can change state WHILE a generation
started under the OLD state is still in flight. When that stale call resolves,
it must not be applied to the now-current state. The fix there is a
monotonically-incrementing generation counter, captured before the async call
and compared (by equality, not by "has it changed") after the await, with a
stale mismatch discarding the result rather than applying it
(`useSnapshotGrade.ts` receives `studentGenerationRef` for exactly this
comparison).

- Pass condition 4a. Object: a regenerate call for artifact X, started, then
  the pasted context or artifact selection changes BEFORE that call resolves
  (whether or not a busy flag blocks a second REGENERATE click - this is a
  different trigger, an edit to context/selection, not a second click).
  Instrument: a mocked-`callLlm` unit test where the mock's resolution is
  delayed (a controllable promise), the "current context/selection" state
  changes before it resolves, then the mock resolves; assert the stale
  result is discarded (never written into the artifact the user is now
  looking at). Direction of failure: FAILS if a slow, now-stale regenerate
  response overwrites content the user has since changed the inputs for.
- Pass condition 4b (the simpler, first-line case). Object: two REGENERATE
  clicks on the same artifact in quick succession. Instrument: a mocked-
  `callLlm` unit test asserting exactly one in-flight request exists after two
  rapid dispatches (Pattern A: the mock is called once; Pattern B: the mock is
  called twice but only the second's result is ever applied - the test's
  shape depends on which pattern the architect picks, so THIS is the one
  place this pass explicitly defers the assertion's exact shape to whichever
  pattern wins in 4.1). Direction of failure: FAILS if two concurrent
  requests are both applied, in either order, to the same artifact's stored
  content (a visible symptom: the artifact's content flips a second time,
  unprompted, after the user believed generation had finished).

### 4.3 Resource-leak / teardown checklist

Reusing `SnapshotGradingPanel.tsx:290-296`'s pattern directly: an
`AbortController` (or busy-flag reset) created for a regenerate call must be
released in BOTH of two places, named separately because the checker brief
for this seat specifically asks whether teardown says what must NOT be torn
down as clearly as what must:

- **Must be released:** on unmount, via a `useEffect` cleanup calling
  `.abort()` (or clearing the busy flag) - mirrors `SnapshotGradingPanel.
  tsx:291-296` exactly. Without this, navigating away from Slide Deck Creation
  mid-generation leaks a pending fetch and, if a busy-flag-only guard is used
  with no unmount reset, could wedge the busy flag for a hook instance that
  never gets to clear it.
- **Must NOT be released/cleared:** the pasted context and prior-critique
  state (AC-7, AC-8's `ta-` persisted keys) on a regenerate's failure. A
  failed regenerate must leave the PRIOR successful artifact and its context
  exactly as they were - `SnapshotGradingPanel.tsx`'s own generation-counter
  comment (`:56-60`) makes the identical point for its own feature: the
  counter check is deliberately NOT folded into the abort, because doing so
  would "wedge `grading` true forever for the newly-current student." The
  PRES-1 analogue: a failed regenerate must not clear the artifact that WAS
  there, and must not clear the `ta-`-persisted context that produced it -
  only the in-flight request's own bookkeeping is torn down.
- Pass condition 4c. Object: the persisted context/critique/artifact state
  after a regenerate call fails (any of section 1's three failure shapes).
  Instrument: a mocked-`callLlm` unit test where the mock rejects/returns
  `{ ok: false }`; assert the PRIOR artifact content and the PRIOR context are
  both still present and unchanged after the failure. Direction of failure:
  FAILS if a failed regenerate leaves the artifact blank, or clears the
  pasted context, rather than leaving the last-good state in place with an
  error surfaced alongside it.

---

## 5. Observability: what should be logged/surfaced on partial failure

### 5.1 The house idiom is a redacted, structured diag record, not a console log

Searched for the server-side error-surfacing convention actually used by
comparable multi-call generation code (`grep -n "console.error"
src/app/actions/discussion-replies.ts src/app/actions/learning-resource-
links.ts src/app/api/lms-generation/deck/route.ts` - zero matches in all
three). **This repo's generation actions do not log to the server console as
their primary observability mechanism** - they attach a redacted diagnostic
record to the RETURNED value, which the client can render or persist, because
there is no evidence in this checkout of a queryable server log an instructor
or the owner could otherwise reach (this-repo.md section 6: no live
database, and this codebase gives no indication of a log aggregator).

The concrete shape: `src/lib/lms-generation/generation-diag.ts`.

- `redactSensitiveText(text, maxLength = 200)` (`:73-77`) strips a full URL
  pattern and a bare `key=...` parameter BEFORE truncating (its own header
  comment, `:13-26`, explains why order matters: Gemini's API key rides as a
  `?key=` query parameter, `llm.ts:459`, so an upstream error body that echoes
  the rejected request can carry the credential). `llm.ts:261` already reuses
  this exact function inside `describeLlmFailure`.
- `fnv1aHash(text)` (`:45-51`) - a short, non-secret content hash used so a
  diagnostic record can say "these two prompts were identical" without ever
  carrying the literal prompt text.
- `ScriptGenerationLlmDiag` (`:88-120`) is the per-call shape: `attempted`,
  `provider`, `model`, `promptLength`/`promptHash` (never the prompt),
  `ok`, `finishReason`, `textLength` (never the generated text),
  `failureBodyRedacted` (present ONLY on failure, absent - not merely empty -
  on success, `:115-119`, so a reader can tell "no body" from "nothing to
  report").

**Recommendation.** PRES-1's per-artifact result (section 1.2) should carry an
analogous, per-artifact diag fragment - `attempted`, `ok`, `finishReason`,
`promptLength`/`promptHash`, `failureBodyRedacted` (via
`redactSensitiveText`) - one per artifact kind, not one for the whole
generation, so a reader (the owner, debugging a reported "the deck never
came") can see which of up to 8 calls (section 2.2) actually ran and how each
one ended, without ever seeing the instructor's pasted material or the raw
model output.

- Pass condition 5a. Object: the diag fragment attached to a failed artifact.
  Instrument: a unit test asserting `failureBodyRedacted` (or equivalent)
  never contains the literal string `key=` followed by anything but
  `[redacted]`, when constructed from an upstream body that DOES contain one -
  the same property `generation-diag.test.ts` already exercises for the
  existing type (not opened directly in this pass beyond confirming it exists
  via file listing; the test seat should build PRES-1's own version rather
  than this pass asserting its content). Direction of failure: FAILS if a raw
  upstream body (which can echo request parameters, `generation-diag.ts:56-
  59`) reaches a diag field un-redacted.
- **Does the log carry personal data it should not** (the checker's own
  question for this seat): the instructor's PASTED CONTEXT (homework, lesson
  plans, chapter objectives) is the direct analogue of the "instructor's own
  writing sample" `generation-diag.ts:16-19` already refuses to log verbatim
  (`promptHash`/`promptLength` stand in for it). PRES-1's diag record must
  follow the same rule: length and hash of the pasted context, never the
  context itself, and never the generated artifact TEXT itself in a diag
  field - only in the actual artifact content the instructor already
  consented to seeing rendered on their own page.

---

## 6. Rollback and blast radius

### 6.1 The claim: removing the tab is the rollback, and it is genuinely small

R-2 (owner-resolved) makes Presentations a new Tools inner-nav sibling that
reuses existing infrastructure and leaves `ppt-design` untouched. Verifying
"untouched" means checking whether the reused modules are PRES-1-private or
already shared, because a shared file is the one thing DEV_LOOP.md calls out
by name ("Shared files are the trap").

Measured (`grep -rln "buildSlidesPptx" src --include=*.ts --include=*.tsx |
grep -v test`, and the same for `generateDeckFromTemplate`), both run
2026-09-29:

- `buildSlidesPptx` already has **12 non-test callers**: `media.ts`,
  `moduleContentActions.ts`, `useLessonPlanner.ts`,
  `lecture-planning-file-utils.ts`, three files under `ppt-design/`,
  `SlideGraphicPreview.tsx`, `lms-generation/artifact-download.ts`,
  `pptx-graphics-audit.ts`, `slide-graphics.ts`, `text-normalize.ts`, and
  three files under `workflows/registry/`.
- `generateDeckFromTemplate` already has **8 non-test callers** spanning
  `lms-generation.ts`, `media.ts`, the deck route, `decks/generate.ts` itself,
  `lecture-concepts.ts`, `lms-generation/deck.ts`, and `kind-configs.ts`.

**These are already shared, already-exercised libraries, not `ppt-design`-
private state.** PRES-1 calling them is read-only reuse (calling an existing
pure/near-pure function with PRES-1's own arguments) - it does not need to,
and per DEV_LOOP.md's own standing rule must not, MODIFY `pptx.ts` or
`decks/generate.ts`'s existing behaviour to fit PRES-1's needs. If a real
architect pass later finds PRES-1 needs a NEW capability from `buildSlidesPptx`
that does not exist today (say, a different slide layout), that is an
ADDITION (a new optional parameter with an existing-callers-unaffected
default, matching this codebase's own repeated pattern for exactly this
situation, e.g. `DeckGenerationRequest`'s `acronym` field,
`src/app/api/lms-generation/deck/route.ts`'s own M12 comments), never a
behavioural change to an existing code path - the 12 and 8 callers above are
the blast radius of getting that wrong, not `ppt-design` alone.

- Pass condition 6a. Object: the diff PRES-1 actually ships, once built.
  Instrument: `git diff` (or the wave's own file list) checked against the 12
  + 8 caller lists above (re-measure at verify time, since this is a snapshot
  - `docs/loop/traps-spec.md`'s own warning against quoting a stale count
  applies here too). Direction of failure: FAILS if any existing line inside
  `pptx.ts`'s or `decks/generate.ts`'s CURRENT behaviour (not a new, additive
  export) is edited - that is a shared-file change, not a rollback-safe
  addition, and it must go through this repo's own regression baseline for
  that file rather than being folded into PRES-1's own commit unreviewed.

### 6.2 What "removing the tab" actually reverts, and what it does not

- **Reverts cleanly:** the new `ManualViewType` member, its label, its inner-
  nav destination array, and the new component tree mounted under it
  (`manual-rail.ts`'s additions, the new `Presentations`/`SlideDeckCreation`
  components) - removing the tab removes the only way to REACH this code, and
  nothing else in the app calls it (it is new code with, by construction, no
  existing caller to orphan).
- **Also reverts cleanly, per AC-8:** the pasted context, selection state, and
  intake receipt, IF they are stored under NEW `ta-` keys as AC-8 requires -
  a `ta-`-keyed localStorage value with no reader left in the app after the
  tab is removed is inert, not a leak (nothing reads it, nothing breaks by its
  continued presence in a user's browser).
- **Does NOT need reverting, because it should never be touched in the first
  place (6.1):** `pptx.ts`, `decks/generate.ts`, the `deck-source.ts` extract
  actions, `upload-budget.ts`. If the architect's build genuinely needs a
  change to one of these SHARED files, that change - not the tab - becomes the
  actual rollback unit, and it is not small; flagging this explicitly is what
  keeps "removing the tab is the rollback" from becoming a claim the built
  diff quietly stops supporting (DEV_LOOP.md's "Verify" step exists precisely
  to catch a claim like this drifting away from what shipped).
- **Undetermined here, because the architect has not run (residual R-SRE-5):**
  whether PRES-1 persists a generated deck/artifact to Supabase at all, or
  stays fully client-side (build-in-browser, download via
  `URL.createObjectURL`, matching `ppt-design/index.tsx:553-559`'s own
  pattern, and never touching `generated_artifacts` the way the deck route's
  `saveGeneratedArtifactVersion` does). The owner's words and the AC document
  describe only localStorage persistence of intake/selection state (AC-8);
  nothing in the AC document requires a server-persisted deck. If the
  architect DOES add server persistence, this section's "no shared-state
  change" claim needs re-checking against whatever table is touched - this is
  exactly the kind of claim recorded here as needing re-verification once the
  as-built diff exists, not asserted as fact now.

---

## 7. Machine-checkable vs. reading vs. owner-verification, summarized

| Finding | Class |
|---|---|
| `buildSlidesPptx`'s five measured edge-case behaviours (section 3.1) | MACHINE - executed directly in this environment, no network needed |
| The 8-sequential-calls / ~72-85s arithmetic (section 2.2) | MACHINE (arithmetic over in-repo constants) for the computation itself; **OWNER** for whether real Gemini latency makes the true number better or worse (residual R-SRE-1) |
| Per-artifact partial-failure shape (section 1) | MACHINE - mocked-`callLlm` unit tests, once the orchestrator exists |
| Regenerate re-entrancy guards (section 4) | MACHINE - mocked-`callLlm` + fake-timer unit tests |
| Observability redaction (section 5) | MACHINE - a pure function test, same discipline as `generation-diag.test.ts` |
| Rollback caller counts (section 6.1) | MACHINE (measured via `grep`, reproducible) but must be RE-MEASURED at verify time against the as-built diff, not quoted from this document |
| "The tab visibly disappears when removed" / "the download actually opens in PowerPoint" | OWNER - no component renders under vitest, no real file-open check exists here |
| Real production function-duration numbers | OWNER - no live deployment reachable from this checkout |

---

## 8. Disposition table

Not applicable. This is the first reliability artifact for PRES-1; no prior
version exists to restructure, hand over, or withdraw requirements from.

---

## 9. Residual register

Every residual below names an owner, an instrument, and the step that will
measure it, per this seat's own non-negotiable and `iteration-caps.md`'s
Residual definition. Filed here for the orchestrator to move into
`docs/BACKLOG.md`, per the same convention the AC document already used (this
seat does not write the backlog directly under concurrency).

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-SRE-1 | Real per-call Gemini latency for a produce or review pass is unmeasured (no API key locally); section 2.2's arithmetic is a documented lower bound, not a full estimate. | Owner | Time real generation requests against the deployed feature; read Vercel's function-duration data for the relevant route(s) | Post-deploy owner verification, first production runs |
| R-SRE-2 | Whether the architect's chosen request/response mechanism actually keeps sequential-`callLlm`-per-invocation low enough to satisfy pass condition 2a is undetermined until the architect pass exists. | Architect, then Verify | Read the as-built route/action file(s); count sequential `callLlm` calls reachable per entry point | Architect pass; re-checked at Verify against the built diff |
| R-SRE-3 | `pptxgenjs`'s behaviour on malformed shapes beyond the five probed here (non-string title, very large slide counts, malformed `code`/`graphic` fields) is unmeasured. | Test seat | Extend the deleted probe into a real, committed oracle/sabotage suite once the generation pipeline's parse step exists | Test seat, after Build |
| R-SRE-4 | Whether the regenerate concurrency guard uses Pattern A (refuse) or Pattern B (abort-and-restart) from section 4.1 is undecided by this pass. | Architect | The architect's own design doc, plus a wiring/structure test asserting whichever mechanism is chosen actually blocks or discards a concurrent call (pass condition 4b) | Architect pass; Test seat builds the corresponding oracle |
| R-SRE-5 | Whether PRES-1 persists a generated deck/artifact server-side at all (versus staying fully client-side, per section 6.2's last bullet) is undetermined until the architect pass exists; the rollback/blast-radius claim in section 6 assumes the latter. | Architect, then Data seat | Read whatever migration/table (if any) the architect's design proposes | Architect pass; re-verified by the data-seat pass this AC document already routes to wave 2 |
| R-SRE-6 | Whether anything about a partial-failure run is actually visible/legible on the real, deployed page (a partial-results list, a per-artifact error state) cannot be checked here - no component renders under vitest. | Owner | Open the deployed Presentations tab, trigger a run where at least one artifact is made to fail (or genuinely fails), and confirm the surfaced state matches section 1's recommended shape | Post-deploy owner verification |
| R-SRE-7 | Whether the recommended Route-Handler-with-`maxDuration=60` shape (2.3) actually builds and deploys without exceeding whatever Hobby's real, current per-route limits are (this repo's own numbers are dated 2026-09-13/2026-09-27 elsewhere and this pass did not re-measure the platform itself). | Owner | Deploy and confirm the route builds; watch the first real run for a platform-level timeout | Post-deploy owner verification |

---

## 10. What this pass explicitly did not attempt

- Did not design the generation orchestrator's file layout, type names, or
  component tree - that is the architect's artifact, not this one; this
  document states constraints (pass conditions) that bind whatever shape the
  architect picks, and one recommendation (section 4.1's Pattern A vs B; the
  fully-split sub-fork in section 2.3) stated explicitly as a recommendation,
  not a ruling.
- Did not open or verify the security posture of pasted-file intake reaching a
  prompt (prompt injection, XSS on rendered model output) - the AC document's
  own routing (`pres-1-acceptance-criteria.md:338-339`) sends that to the
  wave-2 security pass, and this pass's mandate from the dispatching brief is
  failure modes, rollback, and observability, not threat modeling.
- Did not open `generation-diag.test.ts` itself to verify its current
  assertions (only confirmed the module it tests exists and read its
  production code) - the test seat owns building PRES-1's own analogous
  oracle, not auditing an unrelated feature's existing one.
- Did not attempt to measure `pptxgenjs`'s behavior through anything other
  than the five cases in section 3.1 - broader fuzzing of that library is
  recorded as R-SRE-3, owned by the test seat, not performed here.
