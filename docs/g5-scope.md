# G5 scope — bound the image model transport (revision 2, against `docs/g5-check.md`)

**This is the one revision this artifact gets** (`AGENTS.md`, "Two rounds, then
ask"; `docs/loop/iteration-caps.md` cap 2). Round 1 was v1 (committed
`c5aa8a0`) plus its check (`docs/g5-check.md`, committed `313edbb`, 4 blockers /
5 majors / 8 minors, verdict "buildable in part"). This revision applies
**RULING 94** and every blocker/major the check marked fixable-in-revision,
relocates the one it marked otherwise, and re-measures every citation the
check flagged as drifted — including one where the check's own proposed
correction did not survive re-measurement (see the disposition table, row
m3).

## RULING 94, stated once and applied rather than re-argued

**The bound goes in BOTH places** — inside the Server Action
(`announcement-image.ts`) and at the client caller
(`announcementImagePipeline.ts:69`). Reason recorded rather than re-derived:
it is the only option whose correctness does not rest on the unmeasured OC5.
The inner placement protects the instructor only if the emitted wait beats
the platform's unconfigured Server Action ceiling; the outer placement
protects the instructor unconditionally, at whatever OC5 turns out to be, in
a plain leaf that is already node-testable. The inner one still stays,
because the action itself must still return something other than nothing on
a kill that happens to land below whatever the outer bound is. Cost: one
extra wrapped call, one extra node-testable assertion.

**Consequence applied below (§4):** the structural-precedent argument for
`raceWithTimeout` in v1 was inverted for the INNER placement — both cited
`raceWithTimeout` precedents are client-side, racing a Server Action call
from the browser *outside* the invocation, which is the OUTER placement's
shape, not the inner one's. The inner placement's actual structural match is
`withDeadline`'s precedent shape (inside a server invocation, sized from a
recorded start, racing a model call) — but `withDeadline` cannot be driven by
fake timers (re-confirmed this pass, see §4). So: `raceWithTimeout` at the
inner placement rests on testability alone; `raceWithTimeout` at the outer
placement rests on testability AND a correct structural match. Stated exactly
this way in §4; the inverted argument is dropped, not repeated.

---

## Disposition table (v1 → this revision)

| # | v1 claim/requirement | Disposition | Detail |
|---|---|---|---|
| B1 | §2 "makes zero writes of any kind — no Supabase call" | **Kept (conclusion); proof replaced.** | `requireOwner()` reaches a real, conditional, idempotent `app_users` write (`auth.ts:451→358`, `app-users.ts:773/910/994`). The conclusion — no write-ordering remedy owed — survives because that write completes before the model call, is idempotent, and is unrelated to the image. §2 rewritten below with the real chain and the corrected sentence. |
| B2 | §5(a) instrument population "resolves to exactly 1" | **Kept id; fixed.** | The regex matched the declaration too (population 2, not 1). Fixed by excluding call sites whose immediately-preceding, whitespace-collapsed token is `function`. Re-measured population after the fix: 1. |
| B3 | §5(b) single-tick emitted-wait assertion | **Relocated to `loop-test-author`.** | Obligation stated in §5 below: an instrument that drives two differing preamble elapsed times and asserts two differing emitted waits, so the `MODEL_WAIT_MAX_MS` clamp cannot satisfy both with one constant. Not designed here. |
| B4 | §4 fork priced on `TOTAL_BUDGET_MS = 50_000` as the emitted wait | **Withdrawn as settled by RULING 94.** | The formula clamps to `MODEL_WAIT_MAX_MS = 24_000` in every reachable invocation (arithmetic re-verified in §4, same constants). Under RULING 94(C) no number's correctness depends on OC5 any more, so the X/Y fork is moot on its own terms, not merely re-priced. |
| M1 | §4 "structurally the same shape as `raceWithTimeout`'s two existing precedents" (used to justify the INNER placement) | **Kept recommendation; withdrew the inverted leg.** | The precedent leg is re-assigned to the OUTER placement, where it is correct without inversion (§4 table). The INNER placement's helper choice now rests on testability alone, stated as such. |
| M2 | "the remedy leaves the harm conditionally open... the unconditional alternative unexamined" | **Resolved by RULING 94.** | No longer an owner decision — (C) adopts both, so the harm closes unconditionally via the outer placement regardless of OC5. |
| M3 | §3 "inert until a wave adds a wrapper" | **Kept (fact); sentence corrected.** | Replaced with: inert until something threads a real `AbortSignal` *into* `fetch`, which G4's own row rules a different item (`BACKLOG.md:95`). Wave G5-A's `raceWithTimeout` wraps do not do that threading either — restated so a future reader does not infer they do. |
| M4 | §8 R3: `announcementImagePipeline.ts:30-33`'s "no standalone attachment" comment is stale | **Deleted.** | Both `:24-28` and `:30-33` are true of the code (an `<img>` fold-in is not a standalone attachment); re-verified this pass by reading `canvas/announcements.ts:311-312,408-409` and grepping `attachment` in that file (all hits are the unrelated `.imscc` content-export path, `:111-190`). No enforcer was protecting the withdrawn residual; nothing else changes. |
| M5 | §6 wave names no gate command | **Fixed.** | §6 now states `npm run test:paths -- <paths>` explicitly, with the wrapper's own per-file `COVERED` line quoted from a real run this pass, plus `npx tsc --noEmit --incremental false`. |
| m1 | Instrument (a)'s cited canary is a tautology; real floor is elsewhere; `toBeGreaterThan(0)` is weak given B2 | **Fixed.** | Citation corrected to `no-emojis.test.ts:275` (`toBeGreaterThan(500)`). A numeric floor of that kind does not fit this row's population (1, by design, not by scale), so instead §5 adds an explicit cross-directory presence assertion — the walk's own file list must include a path under each of `src/app/actions/`, `src/app/components/`, and `src/lib/` — which is what actually defeats the "narrow the walk to one directory" repair the check named as the cheap trap for B2. |
| m2 | `docs/g4-scope.md` / `docs/g4-check.md` are "717 lines by `wc -l`" | **Fixed.** | Re-measured: `wc -l docs/g4-scope.md docs/g4-check.md` → 716 and 716 this pass, same as the check found. |
| m3 | `commitPost` at `:743`; image ternary at `:753-761` | **Re-verified; NOT changed.** | Direct re-measurement this pass (`cat -n src/app/components/recording/useTakeAnnouncement.ts`, lines 738-765) shows `commitPost` at **line 743** and the ternary at **lines 753-761**, exactly as v1 stated. `git log --oneline -- <file>` shows no commit has touched it since before the check's own commit (last touch `d3bda21`, well before `313edbb`). The check's proposed correction (`:741`, `:751-759`) does not hold against the current tree; recorded here as a check error, not applied. |
| m4 | "Deliberately NOT shared" doc comment at `:596-618` | **Fixed.** | Re-measured: the comment is `llm.ts:610-619` (`grep -n "Deliberately"` → `:611`; block runs `:610-619`). The `:646-648` citation was already exact (`grep -n "shared here because"` → `:647`). |
| m5 | "the image path calls the same shared function" attributed to G4's R6 disposition (`g4-check.md`) | **Fixed.** | The phrase is the orchestrator's, in `docs/BACKLOG.md:95`'s RULING 78 note, not in `docs/g4-check.md:667-677`. Attribution corrected in §3's callout box. |
| m6 | Fake-timer claim (true) rested on a doc comment, not a measurement | **Strengthened.** | Independently re-measured this pass, outside the repo (`abortsignal-probe.mjs`, scratchpad): with the global `setTimeout` replaced by a counting stub (the mechanism `vi.useFakeTimers()` uses), `AbortSignal.timeout(20)` still fired (`{"node":"v22.14.0","realTimeoutCalls":0,"fired":true}`) — the stub was called zero times, so `AbortSignal.timeout` does not route through the global `vi.useFakeTimers()` patches at all. Claim holds; now backed by an executed probe, not a comment. |
| m7 | §4 narrows RULING 77 without saying so | **Moot.** | The X/Y fork that did the narrowing is withdrawn (B4/RULING 94). §4 below reuses RULING 77's constants verbatim, with no narrower alternative proposed, so nothing narrows the ruling in this revision. |
| m8 | Live-sibling name (`r4-check.md` vs `r4-scope.md`) | **N/A this pass.** | No sibling document overlapping this one's write set was open when checked. `docs/a44-architecture.md` did not exist when first checked and appeared later in this same pass as a new, disjoint file (different path, no shared citation) — see the tree-state section at the end for the exact timing and the disjointness argument. |

---

## 0. Re-verifying the row's own claims, before inheriting them

Unchanged from v1 — the check confirmed this section exactly (own re-run of
every command, same results) and it is not implicated by any blocker or
major. Restated without re-deriving:

`generateGeminiImage` is at `src/lib/llm.ts:790` (row's `:757` is drift, not
error — `wc -l src/lib/llm.ts` → 821, unchanged since G4). 7 files mention the
function under `grep -rl "generateGeminiImage" src --include=*.ts
--include=*.tsx`, against a same-filter canary on a nonexistent name
returning empty with exit 1. The caller does not call `callLlm`; its only
apparent match is a doc comment at `announcement-image.ts:38`, re-confirmed
this pass (`grep -n "generateGeminiImage\|callLlm" src/app/actions/announcement-image.ts`).
`generateAnnouncementImageAction` has exactly one caller outside tests in the
whole tree: `src/app/components/recording/announcementImagePipeline.ts`
(`grep -rln "generateAnnouncementImageAction" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
→ its own definition plus that one file).

---

## 1. The call graph and attendedness

Unchanged in substance from v1; the check confirmed "reachability and
attendedness: HOLDS, every hop opened" and found only a citation-precision
note, corrected here.

```
click "Regenerate image" or auto-attempt on review
  -> src/app/components/recording/useTakeAnnouncement.ts:579 generateImage()
     ("use client", confirmed: head -1 -> "use client";)
  -> announcementImagePipeline.ts:65 generateImage(deps)
  -> src/app/actions/announcement-image.ts:42 generateAnnouncementImageAction
     ("use server", confirmed: head -1 -> "use server";)
  -> src/lib/llm.ts:790 generateGeminiImage(prompt)
  -> src/lib/llm.ts:620 postInteraction(apiKey, body)  [bare fetch, no signal]
```

- **Attendedness:** attended. `useTakeAnnouncement.ts:579-614` drives
  `imageState` through `"generating"` while the call is in flight;
  `src/app/components/recording/TakeAnnouncementPanel.tsx:538` renders that
  state (`{imageState === "generating" && (...)}`).
- **Reachable page:** `src/app/page.tsx` hosts `RecordingTab`
  (`page.tsx:627`), which hosts `TakeAnnouncementPanel` (`RecordingTab.tsx:813`).
  Path corrected this pass, in the other direction from what the check's own
  prose suggested: `RecordingTab.tsx` itself is at
  `src/app/components/RecordingTab.tsx` (confirmed:
  `find src/app/components -iname "RecordingTab.tsx"`), while
  `TakeAnnouncementPanel.tsx` — the file the check's parenthetical actually
  named — is at `src/app/components/recording/TakeAnnouncementPanel.tsx`
  (confirmed the same way). `page.tsx:1` is `"use client"`.
- **`maxDuration`:** none, and none is declarable — `grep -n maxDuration
  src/app/page.tsx` → exit 1, read from the command. A client component
  cannot export route segment config. `generateAnnouncementImageAction` is in
  the same "UNCONFIRMED effective bound" bucket as `page.tsx` itself — this is
  OC5 (`docs/a29-architecture.md:285`), open, and — per RULING 94 — no longer
  something this row's correctness depends on, because the outer placement
  (§4) closes the harm regardless of what OC5 turns out to be.
- **What the caller does with a rejection today:** it cannot — the action's
  entire body is `try`/`catch`, every branch returns `{ error: string }`.
  What a platform kill does is unaffected by that `try`/`catch` (a kill runs
  no code at all); it is relevant only to the "promise rejects and we catch
  it" case, which the outer `raceWithTimeout` at the client caller (§4) now
  also has a path for.
- **No shared-ceiling, no unattended, no batch population on this path.**
  `grep -rln "generateGeminiImage\|generateAnnouncementImageAction"
  src/lib/workflows src/app/api --include=*.ts --include=*.tsx` → exit 1,
  empty. G4 §6.4/§6.5 (shared ceiling, batch write-ordering) do not apply
  here — nothing unattended exists on this path to size against.

---

## 2. What a platform kill leaves persisted

**Corrected per B1.** v1 claimed the action makes zero writes of any kind,
including "no Supabase call." That is false: `requireOwner()` is not a bare
auth read.

**The real chain, traced this pass:**

- `requireOwner()` (`auth.ts:451`) is `return requireUser();` — its entire
  body.
- `requireUser()` (`auth.ts:328`) ends its authorized path at `auth.ts:358`:
  `await reconcileAppUserRow(user.id, row, user.email ?? "");`.
- `reconcileAppUserRow` (`auth.ts:254-267`, the whole function) calls `ensureAppUser({ id: userId })`
  only when `appUserNeedsReconciliation(row, email)` is true.
- `ensureAppUser` (`app-users.ts:722`) performs
  `supabase.from("app_users").upsert(insertRow, { ignoreDuplicates: true })`
  at `app-users.ts:773`, and an `.update(...)` at `app-users.ts:910`
  (`grep -n "\.insert(\|\.upsert(\|\.update(" src/lib/supabase/app-users.ts`).
- The denial path writes too: `auth.ts:340` calls `ensureAppUserRowExists`
  (`app-users.ts:978`), which upserts at `app-users.ts:994`.

**So the accurate statement is:** the only write reachable inside
`generateAnnouncementImageAction` is `requireOwner()`'s conditional,
idempotent `app_users` reconciliation (`auth.ts:358` → `app-users.ts:773/910`,
or the denial path's `app-users.ts:994`), and it completes — durably, one way
or the other — before `generateGeminiImage` is ever entered. `announcement-image.ts:42-68`'s
own body contains no Supabase call, no file write, and nothing else besides
that auth step and the model call; its only imports are `requireOwner` and
the three `@/lib/llm` exports (`grep -n "^import" src/app/actions/announcement-image.ts`).

**The conclusion is unchanged, and here is why the corrected proof still
supports it:** the `app_users` write is `ignoreDuplicates: true` on the
insert path and a plain field update on the reconciliation path — idempotent
either way; it is unrelated to the image (it reconciles the account row, not
anything about this generation); and it is not a status marker that could be
left looking complete by a later kill (nothing downstream reads it to decide
whether the image succeeded). `src/lib/llm.ts` itself holds no persistence at
all (`grep -n "supabase\|\.insert(\|\.upsert(\|writeFile\|fs\." src/lib/llm.ts`
→ exit 1). `generateImage()` (`announcementImagePipeline.ts:65-82`), the
pipeline function that calls the action, writes only to React component
state (`setImageState`, `setImageBase64`, `setImageMimeType`, `setImageError`,
`setLogImageAttempts`) — never `localStorage`, never a durable draft
(`announcementImagePipeline.ts:16-22`'s own header). **So no write races the
model call**, G4 §6.5's write-ordering rule is satisfied on this path, and
**no write-ordering remedy is owed** — the answer §2 gave in v1. The proof
under it was wrong; the answer was right.

The one durable write this feature ever makes for the image itself is a
separate action, triggered separately, after the image call has already
fully settled: `useTakeAnnouncement.ts:743`'s `commitPost()` builds the
`image` argument to `createAnnouncementAction` at `:753-761` as
`imageState === "ready" && imageBase64 && imageMimeType ? {...} : undefined` —
every other state resolves to `undefined` and the announcement posts
text-only. A platform kill during `generateGeminiImage` leaves `imageState`
stuck at `"generating"` in a component instance that no longer exists; it can
never reach `"ready"`, so the later write simply never receives an image
argument. There is no half-written row and no total-loss batch, because there
is no write racing the model call at all.

*(The stale-comment finding v1 carried as residual R3 — "posting to Canvas
never carries the image as a standalone attachment" — is deleted, not carried
forward; see the disposition table, M4.)*

---

## 3. The rulings this inherits, confirmed rather than assumed

**RULING 76 (elapsed-aware, per-invocation, never a fixed constant).**
Applies, degenerating to the single-call case G4 §6.2 already names: record
`startedAtMs = Date.now()` at function entry, before `requireOwner()` (the
auth round-trip's own latency — now correctly understood as including a real,
if idempotent, Supabase round trip, per §2's corrected proof — counts against
the budget), then wrap the model call in `raceWithTimeout` sized from the
remainder. Never a bare `raceWithTimeout(generateGeminiImage(prompt), 50_000)`
literal.

**RULING 75, with its stated limit (racing is not cancelling).** Applies
unchanged. `bounded-race.ts:26-29`: "Losing the race does not cancel `work`
... `work` keeps executing." This row closes the platform-kill harm (the
caller stops waiting and returns a worded error) and does not close abandoned
in-flight work or quota burn, for either placement RULING 94 adds.

**"The abort is already terminal" — confirmed by an executing test.**
`src/lib/llm.ts` has two structurally distinct transports, and both carry the
abort-terminal fix: `isAbortError(err)` at `llm.ts:478` inside
`postGenerateContent` (text), and at `llm.ts:645` inside `postInteraction`
(image, called by `generateGeminiImage` at `llm.ts:800`). `src/lib/llm.test.ts:897-907`
already executes this on the real `generateGeminiImage`, mocking only
`global.fetch`. Re-run this pass in isolation:
`npm run test:paths -- src/lib/llm.test.ts` → `Test Files 1 passed (1)`,
`Tests 68 passed (68)`, wrapper line `COVERED src/lib/llm.test.ts files=1
passed=68`. **Nothing further is owed for the abort-retry defect on this
transport.** What is *not* yet done, and is this row's entire remaining job:
nothing wraps the call with a deadline, on either side, so there is currently
no real `AbortSignal` for `isAbortError` to ever see on this path — and
neither of Wave G5-A's `raceWithTimeout` wraps changes that either (M3):
`raceWithTimeout` creates no `AbortSignal` at all (`bounded-race.ts:31-74` is
a plain `setTimeout` race; re-confirmed reading the whole function this pass).
The guard stays inert not "until a wave adds a wrapper" but until something
threads a real signal *into* `fetch`, which G4's own row rules a different
item (`BACKLOG.md:95`: "Any wave that wants the work itself cancelled must
thread a real signal INTO fetch, and that is a different item from this
one.").

> **Correcting attribution, not content (m5).** The phrase "the image path
> calls the same shared function" is the orchestrator's own note in
> `docs/BACKLOG.md:95` (RULING 78), not `docs/g4-check.md`'s R6 disposition
> (`:667-677`, which does not contain that phrase — re-checked this pass).
> Read directly: `postGenerateContent` (`llm.ts:454`) and `postInteraction`
> (`llm.ts:620`) are two separate functions with two independent
> `isAbortError` guards (`grep -n "isAbortError" src/lib/llm.ts` → 420, 478,
> 645); the module's own comment says they are "Deliberately NOT shared"
> (`llm.ts:610-619`). What is shared is the retry policy
> (`MAX_ATTEMPTS`/`backoffDelay`/`sleep`/`RETRYABLE_STATUS`/`isAbortError`),
> per `llm.ts:646-648`'s own comment: "shared here because
> `generateGeminiImage` routes through this same transport" — read in
> context, "this same transport" names the shared fix pattern, not one
> literal shared call. G4's underlying claim — that Wave B's fix covers this
> row without a duplicate fix being owed — is correct; only the
> one-function description was imprecise.

---

## 4. The budget arithmetic, and where the bound goes (RULING 94 applied)

**No wrapper exists today, at either placement.**
`grep -n "raceWithTimeout\|withDeadline" src/app/actions/announcement-image.ts
src/app/components/recording/announcementImagePipeline.ts
src/app/components/recording/useTakeAnnouncement.ts` → exit 1, empty,
re-confirmed this pass.

**Which helper goes where, and why — the inverted argument from v1 dropped
(M1):**

| Placement | Helper | Structural precedent | Why this helper |
|---|---|---|---|
| **Inner** — `announcement-image.ts`, wraps `generateGeminiImage(prompt)`, sized from `startedAtMs` (elapsed-aware, RULING 76) | `raceWithTimeout` | Shape-matches `withDeadline`'s own precedents — inside a server invocation, sized from a recorded start, racing a model call (`class-trends-insight/route.ts:94,143-144`). **Not** `raceWithTimeout`'s own precedents, which are both client-side. | `withDeadline` cannot be driven by fake timers: `AbortSignal.timeout` does not route through the global `vi.useFakeTimers()` patches (independently re-measured this pass, node v22.14.0 — see disposition table m6). `raceWithTimeout`'s own doc comment (`bounded-race.ts:20-24`) states this is exactly why it exists. **Recommendation rests on this leg alone** — the structural-precedent leg does not support this placement, and is not claimed to. |
| **Outer** — `announcementImagePipeline.ts:69`, wraps `await generateAnnouncementImageAction(prompt)`, fixed `CLIENT_PATIENCE_MS` | `raceWithTimeout` | Shape-matches `raceWithTimeout`'s own two existing precedents exactly: a client component racing a call to a Server Action from outside the invocation, no declared or declarable ceiling — `announcements-panel.tsx:128` (`"use client"`, confirmed `head -1`), `WalkthroughAnnouncementPanel.tsx:303,:358` (`"use client"`, confirmed `head -1`). | No mismatch. Testability and the structural precedent agree here, unlike the inner placement. |

**The number actually emitted at the inner placement today, under RULING
77's adopted constants** (`TOTAL_BUDGET_MS = 50_000` `:47`,
`MODEL_WAIT_MIN_MS = 8_000` `:48`, `MODEL_WAIT_MAX_MS = 24_000` `:49`,
`MODEL_WAIT_RESERVE_MS = 2_000` `:51`, all `class-trends-insight/route.ts`,
`grep -n "MODEL_WAIT_\|TOTAL_BUDGET_MS" src/app/api/class-trends-insight/route.ts`,
formula at `:143-144`): with `startedAtMs` recorded at function entry and one
model call preceded only by `requireOwner()`, `remainingMs - RESERVE` is
approximately 47,700 ms, which the `Math.min(MODEL_WAIT_MAX_MS, ...)` clamp
caps to **exactly 24,000 ms in every reachable invocation here.** This is the
number v1's §4 never stated while pricing a fork against it (B4) — stated
explicitly now because RULING 94(C) makes the withdrawal of that fork turn on
it.

**The v1 fork (reuse `50_000`/`2_000` as a placeholder vs. pick a materially
tighter number) is withdrawn as settled, per RULING 94 and B4 — not
re-priced, moot.** Under (A)-only (what v1 planned), the fork mattered because
the inner placement's correctness depended on whether 24,000 ms beats the
unmeasured OC5. Under (C), the outer placement closes the harm unconditionally
regardless of OC5, so the inner placement's constants stop being a decision
with a cost of being wrong — they are simply RULING 77's already-ruled numbers,
reused verbatim, same as G4's own Route Handler row. **No second constant
question is being asked of the owner in this revision.**

**The outer placement's own constant, `CLIENT_PATIENCE_MS`, is new and is
this revision's one genuine numeric choice — stated with its reasoning rather
than left implicit:**

- It must strictly exceed the inner clamp's `MODEL_WAIT_MAX_MS` (24,000 ms),
  or the outer bound would fire before the action has had its full chance to
  return a worded `{error}`, defeating the inner placement for no reason.
- Proposed: **`CLIENT_PATIENCE_MS = 30_000`** — a 6,000 ms margin over the
  inner clamp, sized the same order of magnitude as this codebase's existing
  reserve constants (`2_000`-`8_000` ms) but doubled, because the outer bound
  additionally has to absorb the network round trip to and from the Server
  Action invocation, which the inner budget does not need to account for
  (the inner clock starts once already inside the invocation).
- This is a stated engineering choice, not a measurement — there is no live
  environment here to time that round trip (`docs/loop/this-repo.md` section
  6). Recorded as residual R6 below, not as a blocking question: RULING 94
  already settled placement, and any number safely above 24,000 ms is
  correct in kind even if a later owner tick wants a different margin.

**Fixed constant at the outer placement is correct, not a violation of
RULING 76.** RULING 76's "never a fixed constant" rule binds a deadline on a
*model call*, computed from invocation start against a shared total budget —
it does not bind a UI-patience bound on the browser's own wait for a Server
Action response, which has no upstream budget to be elapsed-aware against
(nothing precedes it). Both of the cited `raceWithTimeout` precedents use a
plain fixed constant for exactly this reason (`EXEMPLAR_FETCH_TIMEOUT_MS = 20_000`,
`announcement-draft-slots.ts:174`) — that constant is not otherwise reused
here (it sizes a much cheaper Supabase-backed fetch, not an LLM image call),
but the *pattern* — client-side patience bound, fixed constant — is the one
this outer placement follows.

---

## 5. The instruments

**Two instruments already exist and are not this row's to build:**
`llm.test.ts:897-907` (§3) proves the abort-terminal fix on the real
transport. Nothing further owed there.

**Two structural walkers this wave's tests must add — one per placement,
neither grepping for `AbortSignal`:**

**(a1) Inner call-site walker.** Walk `src/**/*.{ts,tsx}` excluding
`*.test.*`, collect every match of `/generateGeminiImage\(/g`, **exclude any
match whose immediately-preceding, whitespace-collapsed source ends in
`function`** (this is the fix for B2 — it removes the declaration at
`llm.ts:790` from the population without narrowing the walk to one
directory). `expect(callSites.length).toBeGreaterThan(0)` first. For every
remaining site, assert the immediately-preceding, whitespace-collapsed source
matches `/raceWithTimeout\(\s*generateGeminiImage\(/`. Re-measured population
after the exclusion fix: **1**, at `announcement-image.ts:52`
(`grep -rn "generateGeminiImage(" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
→ 2 raw matches, 1 after excluding the line containing `function`). Canary: a
same-filter search on a nonexistent name, exit 1. **Anti-narrowing assertion
(m1's fix, stronger than a numeric floor at this population size):** the
walk's own collected file-path list must include at least one path under each
of `src/app/actions/`, `src/app/components/`, and `src/lib/` — proving the
walk actually traversed all three, so narrowing it to `src/app/actions` (the
cheap repair the check named as the B2 trap) fails this assertion even though
it would still find the one existing call site. Direction of failure: RED
when a call site (including one in a directory this walk has never scanned)
is not the direct argument of `raceWithTimeout(`, or when the directory-
presence assertion fails.

**(a2) Outer call-site walker**, same shape, over
`/generateAnnouncementImageAction\(/g`, excluding the declaration the same
way as (a1) (immediately-preceding collapsed token `function`). Re-measured
this pass: `grep -rn "generateAnnouncementImageAction(" src --include=*.ts
--include=*.tsx | grep -v "\.test\."` → exactly 2 matches —
`announcement-image.ts:42` (the declaration; excluded) and
`announcementImagePipeline.ts:69` (the call; kept). An `import { ... }`
statement never matches this pattern at all, since no `(` follows the name
there — no separate exclusion is needed for it, unlike the declaration form.
Population after the exclusion: **1**, at `announcementImagePipeline.ts:69`.
Asserts the immediately-preceding source matches
`/raceWithTimeout\(\s*generateAnnouncementImageAction\(/`. Same canary and
same directory-presence requirement as (a1).

**One execution instrument this scope specifies directly (not defeated by
B3's failure mode, because this bound is a literal constant, not
elapsed-aware — nothing to clamp differently across inputs):**

**(b-outer) `announcementImagePipeline.test.ts` (new).** Mock
`generateAnnouncementImageAction` (module mock) to never resolve. Inject
`AnnouncementImageDeps` with `vi.fn()` setters. `vi.useFakeTimers()`, call the
real `generateImage(deps)`, `vi.advanceTimersByTimeAsync(CLIENT_PATIENCE_MS)`.
Assert: `setImageState` was called with `"failed"`, `setImageState` was never
called with `"ready"`, and `setImageError` was called with a non-empty string
containing wording that identifies a timeout (e.g. asserting the substring
"timed out" is present — pinning the *fact* that this branch fired and the
kind of failure, not the exact spelling, per this repo's own "source-text
tests over-specify" lesson). Direction of failure: RED if `generateImage`
resolves before the tick, resolves to `"ready"`, or has not resolved by the
tick (the wrapper never raced). No component is rendered; this is a plain
node-env leaf test, consistent with `announcementImagePipeline.ts` already
taking its dependencies as a plain injected object (`AnnouncementImageDeps`,
`:41-54`).

**Relocated, not designed here (B3) — the obligation `loop-test-author`
carries for the INNER placement's execution instrument:**

v1's single-tick assertion ("assert the returned `{error: string}` matches
the wrapper's own timeout wording at exactly that simulated tick") cannot
fail on the defect this row exists to prevent: with the adopted constants
clamped to a constant 24,000 ms in every reachable case, an elapsed-aware
implementation and a bare `raceWithTimeout(generateGeminiImage(prompt),
24_000)` literal produce the identical observed value at a single tick, and
instrument (a1) is satisfied by the literal too. **`loop-test-author` must
specify, for `announcement-image.ts`'s inner `raceWithTimeout` wrap:**

1. An instrument that drives **two differing preamble elapsed times** before
   the model call (e.g. a mocked `requireOwner()` that itself awaits a
   fake-timer-driven delay of two different durations across two test cases)
   and asserts **two differing emitted waits** (or two differing simulated
   ticks at which the `{error}` timeout resolves), so a constant cannot
   satisfy both.
2. Given the clamp's shape (`Math.min(MAX, Math.max(MIN, remaining -
   RESERVE))`), the two (or, better, three: below-min, mid-range,
   above-max) preamble elapsed times must be chosen so the test can tell
   whether the implementation is tracking `remainingMs` inside the clamp's
   *linear* region, not only whether it ever differs from a hardcoded
   number — two points both landing in the flat `MAX` region would pass a
   bare constant too.
3. A **frozen literal oracle** for the exact `{error}` wording this
   translation produces (not "matches `withDeadline`'s wording style," which
   is a style, not a string) — pinning the `{kind:"timedout"} → {error}`
   translation itself, which is otherwise unpinned by anything else in this
   wave.

The wave (§6) does not dispatch the inner test file until this instrument
exists; the outer test file (b-outer above) and both wiring tests (a1, a2)
have no such dependency and can be built now.

---

## 6. Waves

**One wave**, now touching two call sites instead of one — still no shared
ceiling, no batch-write concern (§2), no reason for G4's multi-wave split.

- **Wave G5-A — bound both call sites (RULING 94: C).**
  - **Files:**
    - `src/app/actions/announcement-image.ts` — record `startedAtMs` at entry
      (before `requireOwner()`), wrap `generateGeminiImage(prompt)` in
      `raceWithTimeout` sized from RULING 77's constants, translate
      `{kind:"timedout"}` into `{error: string}` (frozen wording, per the
      relocated obligation in §5), translate `{kind:"failed"}` into the same
      shape the existing `catch` already produces.
    - `src/app/actions/announcement-image.test.ts` (extend) — the relocated
      inner execution instrument, once `loop-test-author` delivers it; plus a
      regression run of the existing `requireOwner`-failure and empty-prompt
      branches (already covered, re-run not rewritten).
    - `src/app/actions/announcement-image.wiring.test.ts` (new) — instrument
      (a1).
    - `src/app/components/recording/announcementImagePipeline.ts` — add
      `CLIENT_PATIENCE_MS = 30_000` (§4), wrap the existing
      `await generateAnnouncementImageAction(prompt)` at `:69` in
      `raceWithTimeout`, branch on `outcome.kind`: `"settled"` keeps today's
      logic unchanged; `"timedout"` and `"failed"` both resolve through the
      same `setImageState("failed")` / `setImageError(...)` /
      `setLogImageAttempts(..., outcome: "failed")` path the existing
      `{error}` branch already uses (the `"failed"` arm is defensive —
      `generateAnnouncementImageAction` never rejects today, per its own
      `try`/`catch` — required only because `raceWithTimeout`'s return type
      has three variants).
    - `src/app/components/recording/announcementImagePipeline.test.ts` (new)
      — instrument (b-outer).
    - `src/app/components/recording/announcementImagePipeline.wiring.test.ts`
      (new) — instrument (a2).
  - **This wave includes the file that calls each new wrap** —
    `announcement-image.ts` both changes and calls the inner wrap;
    `announcementImagePipeline.ts` both changes and calls the outer wrap.
    Neither wrap creates an export another file must be updated to call.
  - **Size check** (`@(Get-Content).Count` / `wc -l`, both agree per this
    pass's own re-run): `announcement-image.ts` 68, `announcement-image.test.ts`
    113, `announcementImagePipeline.ts` 126 — none within an order of
    magnitude of the 1000-line ceiling before or after this wave's small
    additions. `src/lib/llm.ts` (821) and `src/lib/llm.test.ts` (917) are
    **not touched** by this wave at all. Naming precedent for the wiring
    test files: `src/app/components/canvas-tab/announcements-panel.wiring.test.ts`,
    410 lines by `wc -l`, re-confirmed this pass.
  - **Pass condition:** object is `generateAnnouncementImageAction`'s
    returned value, `generateImage()`'s effect on its injected
    `AnnouncementImageDeps`, and the whole-tree call-site populations for
    both `generateGeminiImage(` and `generateAnnouncementImageAction(`;
    instruments are (a1), (a2), (b-outer), and the relocated inner execution
    instrument; direction of failure as stated in §5 for each.
  - **Gate command, named explicitly (M5):**
    `npm run test:paths -- src/lib/llm.test.ts src/app/actions/announcement-image.test.ts src/app/actions/announcement-image.wiring.test.ts src/app/components/recording/announcementImagePipeline.test.ts src/app/components/recording/announcementImagePipeline.wiring.test.ts`
    — never a raw multi-path `vitest run`, which silently drops unmatched
    paths and exits 0. Re-run this pass on the two paths that exist today
    (the other three are new in this wave): `npm run test:paths --
    src/lib/llm.test.ts src/app/actions/announcement-image.test.ts` →
    `Test Files 2 passed (2)`, `Tests 77 passed (77)`, wrapper lines
    `COVERED src/lib/llm.test.ts files=1 passed=68` and
    `COVERED src/app/actions/announcement-image.test.ts files=1 passed=9`.
    Also run: `npx tsc --noEmit --incremental false`.
  - **Depends on:** the relocated inner execution instrument (§5) before the
    inner test file can be written; not blocked on anything else. RULING 94
    already settled placement and the constants question, so no owner
    decision blocks dispatch of the rest.
  - **Owner:** next implementer.

---

## 7. Leverage

Unchanged from v1; the check confirmed "no leverage claim owed: HOLDS." This
is a reliability bug fix — it changes nothing about what the
announcement-image feature does when the model responds in time, only what
happens when it does not, per `DEV_LOOP.md:101-108`. The feature this row
protects already has its own leverage claim, belonging to the chunk that
built `generateAnnouncementImageAction` in the first place, not to this one.

---

## 8. Residual register

| # | What is not proven now | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| R1 | OC5 itself — the platform's actual unconfigured Server Action ceiling | Repo owner | The Vercel project settings page (`docs/a29-architecture.md:285`) | N/A — decision/measurement residual | Whenever OC5 is answered for any row; this row no longer blocks on it (RULING 94 makes the outer placement's correctness independent of the answer) |
| R2 | Whether the inner clamp (24,000 ms) and the outer bound (30,000 ms) are both generous enough for a real Gemini **image** call specifically — no live key exists here to compare image-generation latency against either number | Repo owner, live key required | One real timed image-generation run against production Gemini, elapsed time read the same way `callGemini` already instruments it (`llm.ts:555-557`) if added to `generateGeminiImage` in the same wave | Fails if the image call times out under either bound at a rate the owner considers unacceptable | An owner-run timed check after Wave G5-A ships |
| R5 | Whether an instructor actually sees a legible, distinguishable failure state on screen for each of: model failure, inner (server-side) timeout, and outer (client-side) timeout — all three currently land in the same `"failed"`/`imageError` bucket with different strings | Repo owner / a UX pass on the as-built diff | Real browser observation — nothing here renders a component | Fails if the states are technically correct but read as identical or illegible in practice | A follow-up UX pass against Wave G5-A's as-built diff |
| R6 | Whether `CLIENT_PATIENCE_MS`'s 6,000 ms margin over the inner clamp is adequate against the real network/auth round trip between the browser and the Server Action invocation — no live environment here to measure that round trip | Repo owner | Production timing observation (or lightweight logging added in a later wave) after Wave G5-A ships | Fails if the outer bound fires before the inner worded timeout has a chance to return, so the instructor sees the outer's generic wording instead of the inner's specific one, on a call that was about to succeed | An owner-run or logged observation after deploy; does not block dispatch |

*(R3 from v1 — the stale-comment finding — is deleted per M4, not renumbered
into this table; R4 from v1 — the X/Y fork — is withdrawn per B4/RULING 94,
also not carried forward.)*

None of the residuals above stands in for an instrument that should have run
here instead; each names a real owner and a real, distinct instrument or
decision step.

---

## Verification of this document's own write set

```
git status --short
```

Run at the end of this pass, not copied from an earlier check in the middle
of it:

```
 M docs/css-orphans.md
 M docs/g5-scope.md
?? docs/a44-architecture.md
```

`M docs/css-orphans.md` is pre-existing and sibling-owned — present in this
session's opening `git status` snapshot before this pass started, and
neither opened nor touched here. `M docs/g5-scope.md` is this pass's own
entry (the committed v1 was `c5aa8a0`; this revision modifies it in place).

`?? docs/a44-architecture.md` (1011 lines by `wc -l`, re-measured just now)
is the live sibling named in the brief — it did **not** exist when this pass
checked for it earlier (`ls docs/a44-architecture.md` returned no match at
that point) and appeared during this pass, before this final check. It was
**not opened, read, or referenced anywhere in this document**; nothing above
cites it, and its write set (`docs/a44-architecture.md`) does not intersect
this document's write set (`docs/g5-scope.md`), so the two are disjoint by
path regardless of timing. No `git stash`, no `git add -A`, no
`git checkout --` was run on any path, sibling or otherwise. No file under
`src/` was written or mutated — the two `npm run test:paths` runs in this
pass (`src/lib/llm.test.ts` alone, then with `announcement-image.test.ts`
added) executed existing tests only, and the one probe run this pass
(`abortsignal-probe.mjs`, disposition table row m6) lives in this session's
scratchpad outside the repository tree, not inside it. `docs/backlog.yml`
was not read or touched; the G5 row was read via
`grep -a -n "G5" docs/BACKLOG.md` (row on line 96 of that grep's output; the
G4 row, cited in §3's callout box, is on line 95). This document's own write
set is `docs/g5-scope.md` only.
