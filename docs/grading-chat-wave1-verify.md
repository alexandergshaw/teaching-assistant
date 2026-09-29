# Verify: GRADING-CHAT wave 1 as-built diff (adversarial, pre-owner-walk)

Fresh adversarial check over the UNCOMMITTED wave-1 diff. I did not author it.
The full suite is green (23441) by report; this pass hunts only defects a green
suite cannot catch here (nothing renders under this node-env vitest; the route
has never taken live traffic).

Instruments used (every quantity names its command):
- Line counts: `wc -l < <path>` (Git Bash) AND `@(Get-Content <path>).Count`
  (PowerShell) - both run, both agree on all five new files.
- Guard/seam citations: `Read` / `grep -n` at the cited line on the working tree.
- Existence: `grep -rn` / `ls` (existence only, never counting logic).
- Docs gate: `npm run docs:gate`. Tree: `git status --short`.
- Runtime concurrency claims are labelled reasoning-from-reading vs measured.

Files opened: all five new production files + all four new test files; the four
edited files' diffs; reused spine `incrementalRunPlan.ts`, `run-header.ts`,
`route.ts`, `repo-content.ts`; both ratchet-gate tests in full; the
`assertAlwaysMounted` helper; `GradingResults.tsx` props; `gemini.ts`;
`page.module.css` classes; `SegmentedToggle`/`submitOnEnter` existence; the
wave spec `docs/grading-chat-waves.md`.

---

## The nine named attacks

### 1. The pool cannot wedge (sharpest risk) - RUN, mostly EMPTY (one residual)

`useContinuousGradingRun.ts` `pump()` (lines 154-178). The async failure path is
genuinely wedge-safe:
- Line 157 `inFlightRef.current += 1`; line 160 `dispatchItem(request)` chained
  `.then` (162) / `.catch` (164) / `.finally` (170).
- An ASYNC rejection lands in `.catch` (pushes a `classifyItemFailure` row) and
  `.finally` ALWAYS runs after either branch: it decrements `inFlightRef` (171),
  updates state, `rebuildRun()`, and re-invokes `pump()` (175). A `.catch` that
  returns normally means `.finally` cannot be skipped. [reasoning-from-reading]
- MEASURED: T4 `repeated-failure-does-not-wedge`
  (`useContinuousGradingRun.lifecycle.test.ts:156-181`) drives 3 consecutive
  async rejections, flushes microtasks, and proves a 4th submit still dispatches.
  This is the realistic production failure mode (a rejected fetch), and it is safe.

RESIDUAL (defensive-hardening, NEW): a SYNCHRONOUS throw from `dispatchItem` -
or a seam that returns a non-thenable - would throw out of `pump()` at line 160
AFTER the `inFlightRef.current += 1` at 157 but BEFORE any `.finally` is
attached, permanently leaking one slot. This is UNREACHABLE in production
because the only production seam, `postGradeRunItem` (line 98), is declared
`async`, so every synchronous error inside it (e.g. an invalid URL to `fetch`)
is captured into a rejected promise, never thrown synchronously. It is
reachable only by a test/other injected `dispatchItem`. Not a blocker; noting
because T4 exercises only async rejections and the class is invisible to it.
[reasoning-from-reading]

### 2. The always-mounted claim - RUN, EMPTY (correct)

`page.tsx` (diff, the block after `:729`): `GradingChatPanel` is wrapped in a
single `<div style={{ display: <4-term guard> ? undefined : "none" }}>` - an
always-rendered, display-toggled sibling of `SnapshotGradingPanel`, NOT a
`{cond && <Panel/>}` conditional. The in-memory run therefore survives Tools/
sub-tab navigation.

I-chat-mount genuinely pins this. `assertAlwaysMounted`
(`topLevelTabs.wiring.test.ts:521-549`) is structural, not keyword-spotting: it
requires exactly one `<GradingChatPanel` render site, and a regex
`style={{ ... display: ... "none" ... }} > <GradingChatPanel` that a conditional
render cannot satisfy, plus all four guard terms in the wrapper. A flip to a
conditional mount would turn this red. Confirmed.

### 3. pointsPossible scale parity (wave BLOCKER-1) - RUN, EMPTY (discharged end to end)

Traced: `extractCanvasEntries(url)` -> `{entries, pointsPossible}` ->
`prepareChatSubmissionAction` Canvas branch returns
`{kind:"entries", entries, pointsPossible}` (`grading-chat-intake.ts:178-184`)
-> `submit()` copies `pointsPossible = outcome.pointsPossible`
(`useContinuousGradingRun.ts:231`) onto EVERY queued body's `pointsPossible`
(`:255`) -> `route.ts` parses `pointsPossible` (`:123,131`) and passes it to
`gradeEntries([entry], ..., pointsPossible)` (`:187`). A Canvas submission grades
at the real scale, not null.

Tests assert the BODY, not just the field: T4 BLOCKER-1
(`useContinuousGradingRun.lifecycle.test.ts:246-247`) reads
`dispatchItemMock.mock.calls[0][0].pointsPossible` === 100; the text case
(`:257-258`) asserts null. T3b (`grading-chat-intake.test.ts:186-195`) asserts
the intake outcome carries 100. Not a tautology (mock input 100 vs threaded
body 100; the code copies, it does not re-hardcode 100).

### 4. RES-GC-8 partial-grade - RUN, EMPTY (correct accounting)

`submit()` (`useContinuousGradingRun.ts:234-271`): `available = maxEntries -
dispatchedCountRef.current` (236); `available <= 0` -> whole refusal (237-242);
else `admitted = entries.slice(0, available)`, `refusedCount = entries.length -
admitted.length` (243-244). 41 entries at max 40, count 0 -> 40 admitted, 1
refused, all 40 ENQUEUED, `partial` returned. No drop, no double-count:
`sourceIndex = dispatchedCountRef.current` pre-increment (247-248) gives unique
0..39. A second submit sees the running `dispatchedCountRef.current` (a ref, read
fresh) so it correctly refuses once full. MEASURED: T4 (`:185-213`) asserts
`dispatchedCount===40`, `refusedCount===1`, 3 dispatched at once (the rest queued
behind the concurrency bound), and the second-submit refusal case (`:215-228`).

### 5. Append-vs-reset (the leverage) - RUN, EMPTY (correct)

`arrivedRef` accumulates via `.push` in the `.then`/`.catch` (162,165); results
are rebuilt every `.finally` from `mergeArrivedResults(dispatchedCountRef.current,
arrivedRef.current)` (`rebuildRun`, :131-145), keyed by `sourceIndex` (rows
appear, never move). State is only cleared in `reset()` (274-289), never in
`submit()`. MEASURED: T4 (`:135-152`) proves results grow to
`["Alice","Bob"]` across two submits. T5 canary
(`GradingChatPanel.structure.test.ts:69-73`) pins `driver.run` fed to
`GradingResults`, no local `setDriverRun`.

### 6. The two ratchet-gate edits - RUN, EMPTY (both correct and FORCED, not dodges)

(a) `action-guard-coverage-github-cohort.test.ts`: `grading-chat-intake.ts` added
to `GITHUB_FILES`. FORCED, not decorative: the "GITHUB_FILES tracks the live
import-graph closure" test (`:678-703`) computes `githubReachingActionFiles()`
and asserts the not-yet-enumerated remainder equals exactly
`{actions/llm-content.ts}`. `grading-chat-intake.ts` reaches lib/github via
`fetchGradableRepoContent` -> `repo-content.ts:19`
(`import { getRepo, getRepoTree, getFileText, listCommits } from "../github"`),
so the live closure detects it; omitting it would make the test RED. Both exports
call `requireAppOwner()` as their first statement
(`grading-chat-intake.ts:52` and `:115`), so the "no GITHUB_FILES action calls
requireUser() directly" check (`:462-478`) stays green. Correct posture, matches
`grading-incremental.ts`.

(b) `wholesale-auth-mock-population.structure.test.ts`: `grading-chat-intake.test.ts`
added to the frozen set. HONEST: that test genuinely wholesale-mocks auth
(`grading-chat-intake.test.ts:5-8`, `vi.mock("@/lib/supabase/auth", ...)`), so
`findWholesaleAuthMockFiles()` lists it and the shrink-only "has not grown beyond
the frozen set" check (`:249-267`) would go RED without the addition. The
addition is a deliberate, reviewed act, not a way to dodge a real guard test.

RESIDUAL (pre-existing class, REPEAT-OF the repo's documented "wholesale mock
hides the guard" limitation): because the intake test wholesale-mocks auth, NO
executing test proves the chat actions REJECT a non-owner at runtime - only the
source-scan cohort test proves `requireAppOwner()` is present. This matches the
posture of `grading-incremental.ts` and the ratchet's own stated "what this
cannot see"; not introduced by this wave.

### 7. maxEntries=40 literal (impl disagreement #4) - RUN, EMPTY (acceptable, residual noted)

`DEFAULT_MAX_ENTRIES = 40` (`useContinuousGradingRun.ts:55`) is hardcoded rather
than importing `getGeminiMaxSubmissions()`. Verified the value matches today's
default: `gemini.ts:32` `DEFAULT_MAX_SUBMISSIONS = 40`. The reliability reasoning
("ships at 40 either way", RES-GC-5) holds: `gemini.ts` reads `process.env` and is
a server-only-convention module, so a client hook cannot import it without
dragging server env into the bundle. Acceptable for wave 1.

RESIDUAL (drift, NEW - already registered as RES-GC-5): a `GRADE_MAX_SUBMISSIONS`
env override is NOT honored on this surface, and if `DEFAULT_MAX_SUBMISSIONS`
ever changes in `gemini.ts`, this literal goes stale silently - no test ties the
two together. Owner-accepted per the plan; instrument to add later: a test
asserting the literal equals the module default.

### 8. F4 bounds + refusals - RUN, EMPTY (correct)

- `buildTextEntry` slices label to `CHAT_LABEL_MAX_CHARS` (500) AFTER
  default/trim (`chatSubmissionIntake.ts:61-63`). T3a (`:28-33`) proves
  600 -> 500, non-empty, no throw.
- `resolveChatRunHeaderAction` REFUSES (returns cleanly, does not truncate/crash)
  oversized instructions/rubric >20000 (`grading-chat-intake.ts:54-62`), BEFORE
  `resolveRunHeader` can spend a `generateRubric` call. T3b (`:91-96`) proves
  `generateRubric` is not called on oversized instructions.
- Arbitrary URL genuinely refused with a named reason naming Canvas + GitHub
  (`grading-chat-intake.ts:203-206`), and `fetchGradableRepoContent` is NOT
  reached. T3b (`:227-236`) asserts the reason contains "Canvas" and "GitHub"
  and `mockFetchGradableRepoContent` not called.

### 9. Silent-green - the specific way this ships green and still wrong

Named: **instructions/rubric edits after the first submission are silently
ignored, with the fields left enabled and no signal.** `beginSession` is
idempotent - once `headerRef.current` is set it is a no-op
(`useContinuousGradingRun.ts:184`), and every later submit grades against the
FIRST-captured `assignmentInstructionsRef`/`header.effectiveRubric`. But
`GradingChatPanel` leaves the Instructions and Rubric `TextField`s fully editable
after the session starts (`:107-131`, no `disabled`), and each keystroke persists
to localStorage (`:66-73`). An instructor who edits the rubric mid-session sees
it change on screen, submits, and every new row is graded against the OLD rubric
- no error, all gates green, and nothing renders under vitest to catch it. The
driver test only ever calls `beginSession` once with fixed text, so the class is
invisible to it. This is arguably within the "set once" design intent (AC-17),
which is why I file it RESIDUAL rather than blocker - but the silent-ignore is a
trap, and it produces WRONG grades on a second assignment in the same page load.
See fix list. [reasoning-from-reading; confirm at owner-walk OW-GC-2]

No fixture uses a shape the real code never emits: `gradedRow` is a real
`GradeResult`, `readyHeader` a real `ok` `GradingRunHeader` with `effectiveRubric`
(read at `:253`), the mocked intake outcomes match `IntakeOutcome`, and the
Canvas mock returns `{entries, pointsPossible}` matching `extractCanvasEntries`
(tsc-green confirms the destructure at `:178`). No assertion reads a hardcoded
value the implementation also hardcodes (attack-3/4 checked above).

Gate hygiene: the wave gate (`docs/grading-chat-waves.md` section 8) uses
`npm run test:paths -- <paths>` for the multi-path run and a separate full
`npm test`, so the raw-multi-path-vitest silent-drop trap is avoided.
[run-and-empty, from reading the plan]

---

## Other defects found outside the nine attacks

### RESIDUAL A (reachability / dead code, NEW): `reset()` is exported but has no caller

`useContinuousGradingRun` exports `reset` (`:83`, `:293`), but
`GradingChatPanel` never calls `driver.reset()` (grep: empty) and no UI control
starts a new session. The lifecycle test's only `.reset(` is the harness
`h0.reset()`, not `driver.reset()`. So `reset` is exported, unused and untested -
the exact "capability ships dead" class this repo repeatedly records.

Compounding: the ceiling refusal copy (`:240`, `:268`) tells the instructor to
"Start a new session to grade more" / "to grade the rest", but the UI offers NO
way to start a new session except a full page reload - which the disclosure
(`CHAT_SESSION_NOT_SAVED_DISCLOSURE`) warns loses every graded row. So the copy
promises an action the surface cannot perform non-destructively. Core single-
assignment flow (up to 40) is unaffected; filed RESIDUAL, recommended fix below.

### RESIDUAL B (edits-persistence vs the disclosure, NEW, owner-walk): manual grade edits DO persist

`GradingResults` is passed `canvasUrl=""` and `editsSurface="grading-chat"`
(`GradingChatPanel.tsx:144-146`). `editsSurface` is typed plain `string`
(`GradingResults.tsx:134`) so "grading-chat" type-checks and scopes a fresh
localStorage edits namespace - no collision. But that means an instructor's
manual grade tweaks in the results grid DO persist across reload keyed by student
label, while the run itself does not - and with generic labels ("Submission 1",
...) a new session's "Submission 1" would inherit the previous session's stored
edit. Mild inconsistency with the "session is not saved" disclosure. Owner-walk;
pre-existing GradingResults behavior, not a wave-1 regression.

### RESIDUAL C (estimator underestimate, REPEAT-OF an inherited property): repo entry wire size

`buildRepoUrlEntry` (`grading-chat-intake.ts:76-91`) puts per-file text in
`submittedFiles[].previewContent`, but `estimateEntryWireBytes`
(`incrementalRunPlan.ts:80-86`) counts only `entry.content.length` +
`rawBase64` lengths, ignoring `previewContent`. So the per-item byte-budget
check underestimates a repo entry's true wire size by roughly the sum of
per-file previews. Both N2 (`firstOversizedEntryReason`) and `route.ts:117` use
the SAME estimator, so they agree with each other (no split-threshold bug), and
the dominant field `repo.content` IS counted. Inherited property of a reused
function, not introduced here. Residual only.

---

## Owner-walk items (only a rendered browser can confirm)

Nothing renders under this vitest, so every look/feel/focus/keyboard/clipboard
claim is owner-walk. Beyond the plan's OW-GC-1..8:

- OW-1: The 6th "Chat" item appears under Tools > Grading; the composer's three
  modes (Text/File/URL) each show the right control; `SegmentedToggle` persists
  the mode across reload (`ta-grading-chat-input-mode`).
- OW-2: Enter-sends in text mode (`slotProps.input.onKeyDown`), Shift+Enter
  newlines; Enter-submits in URL mode (top-level `onKeyDown={submitOnEnter}`).
  Source split verified (T5 `:46-59`); FIRING is owner-walk.
- OW-3: Send button retains focus on the composer field after clearing
  (`ChatComposer.tsx:77`); source-pinned by T5, focus behaviour owner-walk.
- OW-4: The `IconButton` children are literal text "Send" and "+" (not icons,
  not emojis) - confirm this reads acceptably; `aria-label`s are present
  (`:116`, `:147`). Visual only.
- OW-5: A "partial" outcome is surfaced via the `role="alert"` error paragraph
  (`GradingChatPanel.tsx:88-89,135-139`) even though 40 rows succeeded - confirm
  the styling does not read as a hard failure.
- OW-6: **The edit-after-start silent-ignore (silent-green #9) and the missing
  reset (RESIDUAL A)** - drive a session, edit the rubric, submit again, and
  confirm whether new rows honour the edit (they will not); then try to grade a
  second assignment without reloading.
- OW-7: An in-flight run survives switching Tools chips and back (always-mounted)
  - the one behaviour the whole mount design exists for.

---

## Verdict, counts, stopping point

**VERDICT: the feature LANDS AS-IS for its core acceptance flow (set instructions
+ rubric once, stream up to `maxEntries` submissions, growing table). No
blockers.** All nine named attacks discharge clean or leave only residuals; the
wedge, always-mounted, pointsPossible parity, partial-grade, append-vs-reset,
both ratchet edits, and F4 bounds are all correct and, where measurable, pinned
by tests that fail in the right direction.

Counts by severity:
- BLOCKER: 0
- RESIDUAL: 8 (attack-1 sync-throw hardening; attack-6b no-executing-guard;
  attack-7 max-40 drift; silent-green #9 edit-after-start; A reset dead-code +
  unreachable "new session" copy; B edits-persistence vs disclosure; C repo
  wire-estimate). Plus the plan's already-registered RES-GC-* / owner-walk set.

Recommended (cheap, non-blocking) fixes before or shortly after landing, in
priority order:
1. Wire a "New session" control to the already-built `driver.reset()`, and/or
   disable the Instructions/Rubric fields once `headerState === "ready"` with a
   one-line "Editing starts a new session" affordance. Closes silent-green #9 AND
   RESIDUAL A (dead `reset` + unreachable ceiling copy) together. Highest value.
2. (Optional) Guard `pump()` against a non-async seam by wrapping the dispatch in
   `Promise.resolve().then(() => dispatchItem(request))` so a synchronous throw
   cannot leak a slot (attack-1 residual). Defensive only.
3. (Later) A test tying `DEFAULT_MAX_ENTRIES` to `gemini.ts`'s default
   (attack-7 drift).

**Stopping point: DESIGN.** The rulings are sound (both ratchet-gate edits are
forced and correct; the mount idiom is correctly chosen and pinned; the one-wave
cut's caller rule holds). Measurement is sound (both counters agree; the gate
uses `test:paths`; tests assert emitted shapes and the dispatched body). What
remains is a small set of DESIGN-completeness gaps - chiefly the enabled-but-
ignored instruction fields and the built-but-unwired `reset()` - that are
defensible under the "set once / ephemeral" intent but should be confirmed at the
owner-walk (OW-6). Nothing here needs another loop round; it needs an owner eye on
the browser walk.

Gate + tree state:
- `npm run docs:gate`: PASS (3 files, 49 tests) - re-run after writing this doc.
- `git status --short`: reported in the hand-back.
