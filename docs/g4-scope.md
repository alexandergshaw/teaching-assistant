# G4 scope, RESTRUCTURED: the LLM call with no timeout, and what changed since a229bf7

**This is a restructuring, not a first scope.** A prior scope for G4 exists
(`docs/g4-scope.md` as committed at `a229bf7`, "docs(g4): a prerequisite for
the route-handler decision, by inclusion not sequencing"), read in full before
this pass. Nothing in it is silently dropped. The disposition table in section
0 maps every prior requirement to KEPT / UPDATED / HANDED OVER / WITHDRAWN.
The short version: the facts about `callLlm` itself have not moved, but the
Wave A obligation the prior scope described as "not scheduled independently"
has since been picked up, named to an exact file path, and given a materially
stronger instrument by `docs/a39-waves.md`'s own wave-planning pass — and the
prior document's own "zero production callers" claim about `raceWithTimeout`
is now measurably false. Both are corrected here.

Backlog row read via `grep -a -n "G4" docs/BACKLOG.md` (`docs/BACKLOG.md:95`,
one row, `state: 'unscoped'`). Also read: `docs/DEV_LOOP.md`,
`docs/loop/traps-spec.md`, `docs/loop/iteration-caps.md`,
`docs/loop/leverage.md`, `docs/loop/this-repo.md` (the last one re-verified
against the tree rather than quoted — its section 6 "no `.env`, no live key,
no network" claim was independently re-confirmed by reading
`vitest.setup.ts`'s fetch-throw and by the absence of any `.env*` file in the
repo root listing).

---

## 0. Disposition table

| Prior requirement (a229bf7) | Disposition | Detail |
|---|---|---|
| §1 `callLlm` has one branch, no per-provider dispatch, everything runs through `callGemini` → `postGenerateContent` → `fetch` | **KEPT** | Re-verified: `llm.ts:375` (`callLlm`), `:482` (`callGemini`), `:22` (`LlmProvider` union, unchanged text), `:452` (the `fetch` call). No line has moved. |
| §1 zero `AbortSignal`/timeout in `llm.ts` except the `sleep()` backoff helper | **KEPT** | `grep -n "AbortSignal\|AbortController\|signal\|setTimeout\|timeout" src/lib/llm.ts` today returns the same two lines as before: `:401` (`sleep()`) and `:718` (unrelated doc-comment prose). Command re-run 2026-09-27, identical result to the 2026-09-23 run. |
| §1 `generateGeminiImage` is a separate, out-of-scope call surface, filed as residual R6 | **KEPT** | `generateGeminiImage` still at `llm.ts:757`, still not part of the `callLlm(` census, still no backlog row (`grep -a -rn "generateGeminiImage" docs/backlog.yml docs/BACKLOG.md` returns nothing). Residual R6 below is unchanged in substance. |
| §1 the `AbortError`-retried-as-transient latent bug in both `catch` blocks (Wave B) | **KEPT, re-cited with today's line numbers** | `postGenerateContent`'s catch: `llm.ts:457-462` (was cited `:457-463`, one-line drift, same code). `postInteraction`'s catch: `llm.ts:617-622` (was cited `:617-623`, same drift). Byte-identical shape confirmed by reading both today. |
| §2 127 raw / 64-file `callLlm(` census, corrected to a 125/62 floor via a comment-prefix proxy | **KEPT** | `grep -rn "callLlm(" src --include=*.ts --include=*.tsx \| grep -v "\.test\." \| wc -l` = **127** today (unchanged from 2026-09-22/23). File count = **64** (unchanged). Comment-prefix proxy (`grep -E "^[^:]+:[0-9]+:\s*(//\|\*)"` on the same set) returns the same **2** lines, same two files (`llm.ts:16`, `knowledge-overview-prompt.ts:9`). Floor unchanged at 125 sites / 62 files. |
| §2 Route Handler table: `ai-chat` unwrapped, `class-trends-insight` and `course-intel/ask` wrapped in `withDeadline` | **KEPT** | `grep -n maxDuration src/app/api/ai-chat/route.ts` still exits 1 (absent). `withDeadline(` callers today: `class-trends-insight/route.ts`, `course-intel/ask/route.ts`, plus one file not in the original table, `src/lib/course-intel/cross-course.ts` — noted as a new finding below, not a contradiction. |
| §2 grading-engine call chain: `gradeSubmission` → `gradeStudentEntries` → `gradeSubmissions`/`gradeEntries`/`gradeCanvasUrl`, reached from exactly 3 caller files | **KEPT, line numbers updated** | Same functions, same 3 caller files (`github-repos.ts`, `github.ts`, `grading.ts`). Line numbers drifted (unrelated edits added a comment block above the call): `gradeSubmission` def now `engine.ts:38`, the bare `callLlm` call now `engine.ts:82` (was `:74-79`), `gradeStudentEntries` now `:186` (was `:178`), the three entry points now `:416`/`:471`/`:487` (were `:403`/`:457`/`:473`). No behavioral change — still a bare, unwrapped `await`. |
| §2 attended path via `page.tsx:63`, `useActionState(gradeAction, ...)`, no `maxDuration`, OC5 still open | **KEPT** | `page.tsx:63` unchanged. `page.tsx:6` imports `gradeAction` from `./actions`; `page.tsx:543` renders `GradingTab`, to which `formAction`/`pending` are presumably passed as props (not re-derived this pass — out of G4's file set). OC5 re-opened at `docs/a29-architecture.md:285`: still "Repo owner ... Verify", design "does not depend on the answer." No number is asserted here. |
| §2 unattended path: 3 workflow steps, shared 60s tick budget, "refuse to start late" guard that does not bound an in-flight call | **KEPT, path corrected** | The three files are at `src/lib/workflows/registry/steps.grading-run.ts`, `-draft-flow.ts`, `-cartridge.ts` (the prior document implied a shorter path; the real path has the `workflows/registry/` segment). All three still carry the identical "N13a Ruling 1/2" comment at `:474`, `:261`, `:100` respectively (drifted 1-3 lines from the prior citation, same text). `cron/run-schedules/route.ts:56` still `maxDuration = 60`. |
| §4a `withDeadline` (`fetch.ts:316-325`) and `raceWithTimeout` (`bounded-race.ts:31-75`) both exist; `raceWithTimeout` built specifically to be fake-timer testable | **KEPT** | Neither file has changed shape. `bounded-race.test.ts:1` still states "zero real elapsed [time]" under `vi.useFakeTimers()`. |
| §4a **"`raceWithTimeout` has zero production callers today"** | **WITHDRAWN — measurably false as of today, and this document is the correction `docs/a39-waves.md` itself asked for** | `grep -rln "raceWithTimeout" src --include=*.ts \| grep -v "\.test\."` still returns only `bounded-race.ts` — but that command's `--include=*.ts` silently drops `.tsx` files. `grep -rln "raceWithTimeout" src --include=*.ts --include=*.tsx \| grep -v "\.test\."` returns **three real call sites in two `.tsx` files**: `src/app/components/canvas-tab/announcements-panel.tsx:128` and `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx:303,:358`. Canary that the extension filter is the actual cause, not a broken pattern: `grep -rln "raceWithTimeoutZZZ" src --include=*.ts --include=*.tsx` exits 1 (no false hits). **`docs/a39-waves.md:3015` (RES-W-2) already names this exact error against this exact document** ("`docs/g4-scope.md:321-328` states `raceWithTimeout` has zero production callers. It has three ... missed by an `--include=*.ts` filter that excludes `.tsx`") and assigns its correction to "whoever next edits `docs/g4-scope.md`, or the G4-proper chunk that consumes it." This pass is that edit. See section 4a-r below for what the three real callers actually wrap (not `callLlm`). |
| §4b recommend `raceWithTimeout` at A39's new Route Handler, "path not yet named — A39's own architecture pass decides the exact call" | **HANDED OVER to `docs/a39-waves.md` §8.4.3/§8.4.4 (Commit 4c), obligation kept, instrument upgraded, ownership moved, still unshipped** | The path is now named: `src/app/api/grade-run-item/route.ts` (does not exist yet — `ls` exits 2). A39's wave plan adopts exactly this document's recommendation (`raceWithTimeout`, not `withDeadline`) and builds a **stronger** instrument than this document specified — see section 4b-r. |
| §4c true-cancellation `signal` param on `callLlm`, costed but not decided (R3) | **KEPT** | No caller has added a real `signal` yet; the cost analysis is unchanged and still belongs to a `loop-architect` pass, not this document. |
| §5 user-facing failure descriptions for wrapped vs. unwrapped Route Handlers, and for `ai-chat` | **KEPT** | `ai-chat/route.ts` still calls `callLlm` bare at `:647` (drifted from unspecified prior line; re-confirmed today), still no `maxDuration`, still no wrapper. |
| §6 what can/cannot be tested here; `fetch.test.ts:627-638` as the wiring-test template | **KEPT, template strengthened** | `fetch.test.ts`'s `it("bounds the model call", ...)` block still exists, now at `:627-637` (one-line drift, same assertions: every `callLlm(` match must have `withDeadline(` within 200 chars before it). A39's own wave plan built a stricter three-check version of this exact pattern for the new route handler — see section 6-r. |
| §7 Wave A (inside A39, not a separate chunk) | **HANDED OVER**, see §4b row above and §7 below |
| §7 Wave B (`AbortError`-retry fix), small, independent, sequenced before Wave C | **KEPT**, cross-referenced by `docs/a39-waves.md:3016` as RES-W-3, same content, same owner (next G4 implementer), not claimed by A39 |
| §7 Wave C (the ~60 remaining call sites), explicitly not this chunk, per-caller wrap vs. signal-param fork | **KEPT**, still unscoped, fork restated in section 8 below |
| Residuals R1-R6 | **KEPT**, all six re-measured; see section 7 below for what moved and what did not |

**Nothing was dropped.** Every row above traces to a citation opened this pass.

---

## 1. What is actually true right now (re-verified, not re-derived from the prior scope)

Everything in the prior document's section 1 (the shape of `callLlm`, the
single `callGemini` branch, the absence of any `AbortSignal`/timeout, the
identical-shaped retry-swallows-abort latent bug in both transports) is
re-confirmed above in the disposition table with today's exact line numbers.
**Nothing about `callLlm` itself has changed since 2026-09-23.**

**One new finding this pass, not in the prior scope: `withDeadline` has a
third caller.** The prior table listed two (`class-trends-insight/route.ts`,
`course-intel/ask/route.ts`). Today:

```
grep -rln "withDeadline(" src --include=*.ts --include=*.tsx | grep -v "\.test\."
```

returns those two plus `src/lib/course-intel/cross-course.ts`. This is not a
contradiction of anything the prior scope said — it never claimed the count
was exactly two, only named the two Route Handlers relevant to the platform-
ceiling comparison it was making. Recorded here because an unexplained
discrepancy between two passes reading the same command is exactly the kind
of drift this restructuring exists to catch; it is not itself a G4 defect
(the file wraps a Server Action's internal fetch, not a Route Handler, and is
out of this row's caller-graph table for that reason, not by omission).

### 4a-r. What the three real `raceWithTimeout` production callers actually wrap

The corrected grep (disposition table, §4a row) finds three real call sites.
Opened all three directly:

- `WalkthroughAnnouncementPanel.tsx:303` and `:358` wrap
  `getMostRecentAnnouncementExemplarAction(...)` / `Promise.all([...])` and
  `listAnnouncementExemplarsAction(courseId)` respectively.
- `announcements-panel.tsx:128` wraps the same pair of actions.

Both actions are read at `src/app/actions/walkthrough-announcement.ts:117-148`:
each is a `try`/`catch` around a Supabase row read (`createServiceClient()`
then a `getMostRecentAnnouncementExemplar`/`listAnnouncementExemplars` call).
**Neither touches `callLlm` or any model call at all.** These three sites
belong to a different, already-closed backlog row — `docs/REGRESSION.md:41879`
heading "415. G1: the exemplar fetch gets a bound" (a distinct area from this
row's `llm-call-platform-ceiling`; `id: 'G1'` does not appear in
`docs/backlog.yml` at all, and the comment at
`WalkthroughAnnouncementPanel.tsx:300` reads "Bounded per G1", confirming the
attribution). **So the corrected fact is exactly this: `raceWithTimeout` has
production precedent and a proven wiring-test template (see §6-r), but it
still has zero callers that bound a `callLlm` invocation.** G4's own defect —
an unbounded model call — is exactly as open today as it was in the prior
scope; only the wrapper's track record improved.

---

## 2. The call graph (unchanged census, re-run)

Re-run 2026-09-27, identical to 2026-09-22/23:

```
grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l   -> 127
grep -rln "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l  -> 64
```

Comment-prefix proxy (same command as the prior pass):

```
grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -E "^[^:]+:[0-9]+:\s*(//|\*)"
```

returns the same 2 lines (`llm.ts:16`, `knowledge-overview-prompt.ts:9`), so
the honest floor is still **125 real call sites across 62 real caller
files** — a floor, not a recount, exactly as the prior scope stated (the
proxy method cannot rule out a call named inside a block-comment with no
leading marker).

`"use server"` split: `grep -rln "callLlm(" ... | grep "src/app/actions/" |
wc -l` = 52; of those, `grep -l '"use server"' <files> | wc -l` = 48 (same
5 leaf helpers as before, confirmed still present:
`current-events-assignment-generator.ts`, `intro-discussion-generator.ts`,
`learning-resources-generator.ts`, `module-objectives-generator.ts`,
`shared.ts`).

**One citation-drift finding, not a factual reversal.** The original backlog
row (`docs/BACKLOG.md:95`) cites `learning-resources-generator.ts:229` as a
reachable path. Today that file's `callLlm(` occurrences are at `:187` and
`:498` — `:229` sits between them and is not itself a call site. This is
ordinary line drift from edits made after the row was filed, not evidence the
row's underlying claim is wrong: the file is still one of the 62 real caller
files and still reaches `callLlm` unwrapped, just not at the exact line the
row names. Both files the original row named are confirmed still present and
still callers: `src/app/actions/learning-resource-links.ts` (`callLlm` at
`:269`, `:338`) and `src/app/actions/learning-resources-generator.ts`
(`callLlm` at `:187`, `:498`).

### Route Handlers (of the 64 files, still 3 relevant to this row's platform-ceiling comparison)

| Route Handler | `maxDuration` | Wrapped? |
|---|---|---|
| `src/app/api/ai-chat/route.ts` | **absent** (`grep -n maxDuration ...` exits 1, re-run today, same result) | **No.** `callLlm` called bare at `:647`. Still a live, user-facing unbounded path, still outside the row's two originally-named paths, still outside A39's redesign. |
| `src/app/api/class-trends-insight/route.ts` | `:33`, `= 60` | Yes, `withDeadline` |
| `src/app/api/course-intel/ask/route.ts` | `:134`, `= 60` | Yes, `withDeadline`, `TOTAL_BUDGET_MS = 54_000` still at `:145` |

### The grading engine (the path DECISION 6 / A39 touches)

`src/lib/grade/engine.ts`: `gradeSubmission` (`:38-`, bare `callLlm` at `:82`)
→ `gradeStudentEntries` (`:186`) → three exported entry points,
`gradeSubmissions` (`:416`), `gradeEntries` (`:471`), `gradeCanvasUrl` (`:487`).
Reached from exactly three caller files today
(`grep -rln "gradeSubmissions(\|gradeEntries(\|gradeCanvasUrl(" src --include=*.ts | grep -v "\.test\." | grep -v "src/lib/grade/engine.ts"`):
`src/app/actions/github-repos.ts` (`:839`), `src/app/actions/github.ts`
(`:753`), `src/app/actions/grading.ts` (`:638`, `:815`, `:898`, `:907`).

- **Attended:** `src/app/page.tsx:63`, `useActionState(gradeAction,
  initialState)`. `page.tsx:1` is still `"use client"`, so no
  `maxDuration` can be declared on this path today. `page.tsx:543` renders
  `GradingTab`, which A39's still-unshipped Commit 4c plans to give a second,
  bounded, per-item path (§3 below) — but as of this measurement `GradingTab`
  itself contains no reference to `gradeAction` by name (`grep -n gradeAction
  src/app/components/GradingTab.tsx` returns nothing), meaning it receives the
  action as a prop from `page.tsx` and the wiring between them was not
  re-derived in full this pass (out of G4's own file set; A39 owns
  `GradingTab.tsx`). **OC5 is still open**: `docs/a29-architecture.md:285`
  unchanged, "Repo owner ... Verify", "design does not depend on the answer."
- **Unattended:** `src/lib/workflows/registry/steps.grading-run.ts:474`,
  `steps.grading-draft-flow.ts:261`, `steps.grading-cartridge.ts:100` (path
  corrected from the prior scope's shorter citation — the real path includes
  `workflows/registry/`), all three still carrying the identical "N13a Ruling
  1/2" comment. `cron/run-schedules/route.ts:56` still `maxDuration = 60`,
  shared across the whole tick, not a per-call budget — unchanged defect.

---

## 3. What A39's own wave plan has done with G4's Wave A since the prior scope

This is the single biggest change since a229bf7 and the reason this pass is a
restructuring rather than a re-file. `docs/a39-waves.md` (revision 2,
committed `9050475`, "waves revision 2, terminal — and a fourth instrument
defect") independently re-derived G4's Wave A requirement and:

1. **Named the exact file.** `src/app/api/grade-run-item/route.ts` (does not
   exist yet in the tree — confirmed by `ls src/app/api/grade-run-item/
   route.ts`, exit 2, and by `find src -iname "*grade-run-item*"`, no
   results). The prior G4 scope explicitly left this unnamed ("A39's own
   architecture pass decides the exact call, not this document").
2. **Adopted this document's own recommendation** — `raceWithTimeout`, not
   `withDeadline` — with the same reasoning this document gave (fake-timer
   testability; a non-throwing result shape suited to a per-item pool).
   `docs/a39-waves.md:1915-1975` rules this explicitly, citing
   `bounded-race.ts:20-24` and `:26-29` verbatim.
3. **Built a stronger instrument than this document asked for.**
   `docs/a39-waves.md` §8.4.3 specifies three presence-then-comparison checks
   on the new route's source text (not this document's single wiring-test
   template):
   - **Check 1, auth order:** `requireUser(` appears before `gradeEntries(`.
   - **Check 2, CSRF floor:** the `content-type` header read happens before
     `req.json(` and before `gradeEntries(`.
   - **Check 3, the soft budget is under the hard cap:** the route's own
     `TOTAL_BUDGET_MS` constant, parsed from source text, is strictly less
     than its own `maxDuration` constant × 1000. This is precisely this
     document's own §4b requirement ("the deadline must fire BEFORE the
     platform kill, or it buys nothing") turned into an executable, static
     assertion — something the prior G4 scope recommended in prose but did
     not itself design as a check.

   Each check is proven capable of failing with its own negative fixture
   (F1: guard deleted → fails check 1 only; F2: content-type read deleted →
   fails check 2 only; F3: `TOTAL_BUDGET_MS` set equal to `maxDuration *
   1000` → fails check 3 only; F1b: guard moved after the call, for the
   ordering half of check 1). This four-fixture discrimination matrix is
   stronger than this document's own §5's proposed instrument, which named
   the mutation families but did not design per-family negative fixtures.
4. **Sized the file.** `src/app/api/grade-run-item/route.ts` gets a `-le 260`
   line ceiling, measured against `class-trends-insight/route.ts` (187 lines,
   "both counters," the line-for-line model), plus the S1 guard block and the
   `raceWithTimeout` wrapper (`docs/a39-waves.md:2416`).

**What this means for G4's own Wave A entry: it is HANDED OVER, not withdrawn
and not merely kept.** The obligation this document's prior version stated —
"the new Route Handler's call into the grading engine must be wrapped in a
wall-clock deadline that fires comfortably under `maxDuration = 60`" — is now
a named, checked, four-fixture-proven acceptance criterion inside a different
document's write set (`docs/a39-waves.md` §8.4.3-8.4.4), owned by whichever
implementer wave builds A39's Commit 4c. **It has not shipped.** No file
exists at the target path, and A39's own wave-plan pass is currently sitting
at its two-round cap with an unresolved owner question about a *different*
wave's extraction shape (`docs/a39-waves-rulings.md`'s final section, "TO THE
OWNER — one terminating question," about whether `GradingTab.tsx`'s
extraction target must be `.tsx` components or `.ts` leaves) — a question that
does not touch Commit 4c's file set or instrument, but does mean A39's wave
plan as a whole cannot be dispatched to an implementer until that question is
answered, per this repo's own two-round rule (`AGENTS.md`).

**Two things this pass will NOT do, because they are not in this document's
write set and are not G4's to decide:** it will not answer A39's owner
question, and it will not edit `docs/a39-waves.md`. Both are named here only
so the disposition table's "HANDED OVER" claim is checkable rather than
asserted.

---

## 4. What can be tested, restated with the stronger template

Everything the prior scope said about test limits is unchanged and re-affirmed
by fresh reading: no live key, no network, nothing renders under vitest here
(`vitest.setup.ts` throws on any real `fetch`; confirmed by reading the file's
throw statement directly, not merely citing the prior scope's claim about it).

**The wiring-test template to use going forward is the stronger one, not the
one this document originally proposed.** The prior scope pointed at
`fetch.test.ts:627-638` (single presence check: every `callLlm(` site's
preceding 200 characters contain `withDeadline(`; re-confirmed still present
today at `fetch.test.ts:627-637`, one-line drift). A39's wave plan produced a
second, independently-built template that is stronger on two axes: (a) it
checks *ordering* (`indexOf` comparisons), not just presence, and (b) it
proves each of its assertions can independently fail via a dedicated negative
fixture, which `fetch.test.ts`'s single-check version does not attempt.
`src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts`
(describe block "G1: both saved-exemplar fetch sites are bounded with
raceWithTimeout," opened directly) is a third, simpler precedent for the same
family — import presence, `Promise.all(` nesting, and a shared-constant count
assertion — proving the pattern generalizes across at least three independent
authors now. **Any future Wave C caller-wrapping test should follow the
ordering-plus-negative-fixture shape from `docs/a39-waves.md` §8.4.3, not the
single-presence shape this document originally suggested**, because the
single-presence shape is provably weaker (a comment mentioning the wrapper
name would satisfy it — this is the exact class of defect
`docs/a39-waves-rulings.md`'s RULING 28, cited in §8.4.3, exists to prevent).

What remains unmeasurable here, unchanged from the prior scope: real Gemini
latency, whether any chosen deadline constant is actually generous enough,
whether the platform truly reclaims an abandoned `fetch`, and whether an
instructor actually sees a legible failure state on screen. All four require
either a live key or a rendered browser, neither available in this
environment.

---

## 5. The fork, restated

**The fork is unchanged from the prior scope and still unresolved: Wave C's
shape.** Once the ~60 remaining unbounded caller files (outside the grading
chain and the two already-wrapped Route Handlers) are scoped as their own
chunk, this activity produces X or Y:

- **(X) Per-caller `raceWithTimeout` wrapping**, the same pattern Commit 4c
  will use (once it ships) and the same pattern the two G1 `.tsx` callers
  already use in production. Cost: ~60 separate wrapper placements, no single
  enforcement point, so a future new caller can still ship unwrapped with
  every existing gate green (nothing greps for "every `callLlm(` site" as a
  repo-wide rule today). Benefit: zero signature change to `callLlm` itself,
  zero risk to the other ~62 files not being touched, and it reuses a
  three-times-proven template (§4).
- **(Y) An optional `signal`/deadline parameter added to `callLlm` itself**
  (§4c's true-cancellation shape), with one repo-wide wiring test replacing
  ~60 per-caller ones. Cost: the `AbortError`-retried-as-transient defect
  (Wave B) becomes mandatory to fix first, or a caller's own abort gets
  silently retried past its own deadline; and per `withDeadline`'s own doc
  comment (`fetch.ts:294-315`, re-opened this pass, unchanged), it buys
  nothing extra on Vercel that the wrapper shape doesn't already buy for a
  single-invocation-per-call platform, because the process is reclaimed at
  the same moment regardless of whether the abandoned `fetch` was formally
  aborted.

**Recommendation: (X).** It is what Commit 4c is already building, it has
three shipped precedents now instead of zero, and (Y)'s only real advantage
(one enforcement point instead of sixty) is bought at the cost of a mandatory
Wave B fix plus no actual platform benefit. **This produces X or Y; every
answer ends this fork.** If the owner picks (Y), Wave B is no longer optional
and must be sequenced first — that consequence is stated here so picking (Y)
does not silently reopen a decision this document already made (Wave B's
priority).

---

## 6. Leverage

Unchanged from the prior scope's implicit answer, stated explicitly per
`docs/loop/leverage.md`'s requirement that a reliability bug name its class
honestly: **this row gives the app no NEW capability a chat with an LLM
cannot already do.** A chat window has no `maxDuration` at all to be killed
by. What this row protects is a capability the app already claims —
"the pool can report a per-item failure instead of a whole run dying"
(DECISION 6's own stated purpose) — from silently degrading into a raw
transport failure the instant the platform, not the app, decides a call has
run too long. That protection is real and worth the wave, but it is a
reliability floor under an existing feature, not new leverage, and this
document says so plainly rather than manufacturing a leverage claim.

---

## 7. Residual register (re-measured)

| # | What is not proven now | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| R1 | `ai-chat/route.ts` has no `maxDuration` and no wrapper — a live, user-facing unbounded path, re-confirmed unchanged today (`callLlm` bare at `:647`) | A future G4-proper chunk (Wave C) or a standalone follow-up | `grep -n maxDuration src/app/api/ai-chat/route.ts` (today: exit 1, absent) | RED (still absent) until a fix lands and the grep flips to present | Fix lands, then the grep confirms presence, then a wiring test per §4's stronger template |
| R2 | The `AbortError`-retried-as-transient defect in `postGenerateContent`/`postInteraction` (`llm.ts:457-462`, `:617-622`, Wave B), still dead code today (nothing passes a real `signal`) | Next G4-proper implementer, before any real signal threading | A fake-timer test stubbing `fetch` to reject with an `AbortError`, asserting zero `sleep()` calls and an immediate `{ok:false}` | RED if the stub is invoked more than once (a retry occurred) | Before Wave C, only if Wave C's owner-chosen shape (§5) is (Y); cross-referenced by `docs/a39-waves.md:3016` as RES-W-3, not claimed by A39 |
| R3 | Whether `callLlm` should eventually gain a true-cancellation `signal` parameter, or stay wrapper-only forever | A `loop-architect` pass | Cost comparison in §5, already laid out; needs a decision, not a measurement | N/A — this is a decision residual, not a measurement residual | Decided as part of Wave C's own scoping (§5's fork), before Wave C's implementer wave |
| R4 | Whether A39's chosen deadline constant (once Commit 4c ships, precedent: 54s under 60, per `course-intel/ask/route.ts:145`) is generous enough for a real Gemini grading call | Repo owner, live key required | One real timed grading run against production Gemini | Fails if real submissions time out at a rate the owner considers unacceptable | A39's own owner-verification step, after its first production deploy — unchanged, still not this document's to run |
| R5 | Whether an instructor actually sees a legible "not graded, timed out" state on screen | Repo owner / a UX pass on A39's as-built diff | Real browser observation — nothing here renders a component | Fails if the state is technically correct but not legible in practice | A39's own follow-up UX pass against its as-built diff |
| R6 | `generateGeminiImage`'s identical no-`AbortSignal` gap (`llm.ts:757`), a separate call surface, still not its own backlog row | Whoever next touches `llm.ts`'s image path | `grep -n "signal" src/lib/llm.ts` against the `postInteraction` block specifically (unchanged: only the unrelated `:718` doc-comment hit) | N/A — this residual IS the filing gap; per `docs/DEV_LOOP.md` step 0, an unfiled residual does not exist, so this line is itself the deletion until someone files it | Filed as a finding here again, still unfiled as a row; an agent picking this up first owes it a row |

**Two items from `docs/a39-waves.md`'s own residual list are not new
residuals — they are this row's own residuals, viewed from A39's side, and
are resolved by this restructuring rather than needing separate filing:**
RES-W-2 (the "zero production callers" correction) is discharged by §0/§4a-r
above. RES-W-3 (the `AbortError`-retry hazard staying dead code under the
wrapper-only shape) is identical to R2 and is not double-counted.

---

## 8. Wave plan

**This document's own write set is exactly `docs/g4-scope.md`.** No wave below
is executed by this pass.

- **Wave A** — HANDED OVER. See §3. Owner: A39's Commit 4c implementer wave,
  once `docs/a39-waves.md`'s pending owner question (unrelated to Commit 4c)
  is answered and the plan is dispatched. File(s): `src/app/api/grade-run-
  item/route.ts` (new) plus its own `route.test.ts` (new), per
  `docs/a39-waves.md` §8.4.3. **This row (G4) does not need its own chunk for
  Wave A** — restating the prior scope's own framing, now with a named path
  instead of a placeholder.
- **Wave B** — KEPT, independent, small, still not started. File:
  `src/lib/llm.ts`, the two `catch` blocks at `:457-462` and `:617-622`.
  Content: distinguish an `AbortError` from a genuine transient error and
  return immediately rather than retrying. Pass condition: object under
  comparison is `postGenerateContent`'s returned result; instrument is a test
  stubbing `fetch` to reject with an `AbortError` under `vi.useFakeTimers()`;
  direction of failure is RED if the stub is invoked more than once. Owner:
  the next G4-proper implementer, sequenced before Wave C only if Wave C's
  fork (§5) resolves to (Y).
- **Wave C** — KEPT, still unscoped, still not this chunk. Scope: the ~60
  remaining unbounded caller files (§2), including `ai-chat/route.ts` (R1)
  and the row's own two originally-named paths. Shape: the fork in §5,
  recommendation (X). Owner: a dedicated future G4 chunk. Instrument: the
  stronger ordering-plus-negative-fixture template from §4/§8.4.3, generalized
  across the caller census.

---

## Verification of this document's own write set

```
git status --short
```

was run before and after writing. Before this pass: `M docs/css-orphans.md`
(pre-existing, per the session's own git-status snapshot; not touched by this
pass). This pass's write set is exactly `docs/g4-scope.md` — no file under
`src/`, `docs/backlog.yml`, `docs/BACKLOG.md`, `docs/a39-*`, `docs/l9-*`, or
`docs/a41-*` was opened for writing. All measurements above were taken by
direct command execution against the real tree (not transcribed from the
prior scope or from `docs/a39-waves.md`'s own quoted commands) and every exit
code was read from the command directly rather than through a pipe, per this
pass's own instruction: each `grep ... | wc -l` pipeline's line count was
treated as the observation and cross-checked against a separate
`grep -c`-free re-run where precision mattered (the "zero callers" correction
in particular was re-run twice, once with `--include=*.ts` alone and once
with both extensions, to reproduce the exact discrepancy `docs/a39-waves.md`
describes rather than take its description on faith).

No production or test file was mutated to produce any measurement in this
document; every claim above was read, not evaluated, against the committed
tree. Nothing in this document required a scratchpad copy, since nothing was
executed beyond read-only `grep`/`ls`/`find` and one `sed` read.
