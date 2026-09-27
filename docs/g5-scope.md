# G5 scope — bound the image model transport

**No prior scope exists.** `ls docs/g5-*.md` (before this pass) returned no
match; `git log --oneline -3 -- docs/g5-scope.md` returned nothing. This is a
first-round artifact, not a restructuring — no disposition table is owed.

**Row source:** `docs/BACKLOG.md`, read via `grep -a -n "G5" docs/BACKLOG.md`
this pass (the row is on line 96 of that grep's own output; `docs/backlog.yml`
was not opened, per the brief). Inherits from `docs/g4-scope.md` (committed
`935ffa6`, the revision, 717 lines by `wc -l`) and `docs/g4-check.md`
(committed `19d5d0c`, the round-1 check, 717 lines by `wc -l` — both read in
full this pass) rather than re-arguing RULING 75/76/78.

---

## 0. Re-verifying the row's own claims, before inheriting them

The row states two measured facts and one line citation. All three re-checked
directly against today's tree:

| Row's claim | Re-measured this pass | Verdict |
|---|---|---|
| `generateGeminiImage` "around `src/lib/llm.ts:757`" | `grep -n "export async function generateGeminiImage" src/lib/llm.ts` → **`:790`**, not `:757`. `wc -l src/lib/llm.ts` → **821** (unchanged from G4's own count, confirming no commit touched the file between G4 and this pass). | **Drift, not error.** `:757` was accurate as of some earlier commit; the function moved down 33 lines. Every citation below uses `:790`. |
| "7 files mention the function under `grep -rl` ... against a same-filter canary on a nonexistent name returning 0 with exit 1" | `grep -rl "generateGeminiImage" src --include=*.ts --include=*.tsx` → 7 files, listed below. Canary: `grep -rl "generateGeminiImageZZZNONEXISTENT" src --include=*.ts --include=*.tsx` → **exit 1**, empty output, read directly from the command. | **Confirmed exactly**, same filter, same count. |
| "The caller does not call `callLlm`; its only apparent match is inside a doc comment [at :38]" | `grep -n "generateGeminiImage\|callLlm" src/app/actions/announcement-image.ts` → the only `callLlm` text is line 38, inside `/** ... the same split callLlm's callers already use ... */`, a JSDoc comment on `generateAnnouncementImageAction`. No executable `callLlm(` call anywhere in the file. | **Confirmed exactly, including the line number.** |

The 7 files (`grep -rl "generateGeminiImage" src --include=*.ts --include=*.tsx`):
`src/app/actions/announcement-image.test.ts`, `src/app/actions/announcement-image.ts`,
`src/app/components/recording/announcement-image-filename.ts`, `src/lib/gemini.ts`,
`src/lib/llm.test.ts`, `src/lib/llm.ts`, `src/lib/take-announcement.ts`. Checked
each with `grep -n "generateGeminiImage" <file>` individually: three of the
seven (`announcement-image-filename.ts:13`, `gemini.ts:14`,
`take-announcement.ts:267`) are prose in a doc comment mentioning the name,
never a call. `llm.ts:790` is the definition. `llm.test.ts` /
`announcement-image.test.ts` are tests. **The only production call-expression
in the tree, confirmed by `grep -rn "generateGeminiImage(" src --include=*.ts
--include=*.tsx | grep -v "\.test\."`, is `announcement-image.ts:52`, and
`llm.ts:790` (the definition itself).** No second call site exists anywhere.
`generateAnnouncementImageAction` (the Server Action wrapping it) has exactly
one caller in the whole tree outside tests: `grep -rln
"generateAnnouncementImageAction" src --include=*.ts --include=*.tsx | grep -v
"\.test\."` → `announcement-image.ts` (its own definition) and
`src/app/components/recording/announcementImagePipeline.ts`.

**Nothing in the row is wrong.** The row survives re-measurement with one line
number corrected for drift.

---

## 1. The call graph and attendedness

**One production call graph, fully attended, zero unattended paths.** This is
the first material difference from G4's text-path graph (31 files with 2+
sites, a shared cron-tick population, an unattended grading pipeline) —
re-derived here, not inherited:

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
  `imageState` through `"generating"` while the call is in flight, and
  `TakeAnnouncementPanel.tsx:538` renders that state
  (`{imageState === "generating" && (...)}`) — a browser is on screen waiting,
  confirmed by reading the render branch directly, not inferred from the state
  machine alone.
- **Reachable page:** `src/app/page.tsx` hosts `RecordingTab`
  (`page.tsx:627`, confirmed by `grep -n "RecordingTab" src/app/page.tsx`),
  which hosts `TakeAnnouncementPanel` (`RecordingTab.tsx:813`). `page.tsx:1` is
  `"use client"` (re-confirmed this pass, not inherited from G4:
  `head -1 src/app/page.tsx` → `"use client";`).
- **`maxDuration`:** none, and none is declarable. `grep -n maxDuration
  src/app/page.tsx` → **exit 1**, empty, re-run this pass (G4 established the
  same absence for the same file; re-confirmed rather than trusted). A client
  component cannot export route segment config (G4 §1, unchanged fact, not
  re-argued). `generateAnnouncementImageAction` is therefore in the same
  "UNCONFIRMED effective bound" bucket G4 §3 already named for `page.tsx`
  itself and "the other ~58 caller files" — **this is not a new gap, it is the
  same one, OC5** (`docs/a29-architecture.md:285`, "Repo owner", "The Vercel
  project settings page", "Verify. The design does not depend on the answer" —
  confirmed open by reading the row directly, not by trusting G4's citation of
  it).
- **What the caller does with a rejection today:** it cannot reject.
  `generateAnnouncementImageAction` (`announcement-image.ts:44-67`) wraps its
  entire body in `try`/`catch` and every branch returns `{ error: string }` —
  the same never-throw discipline G4 §5 already established for
  `callGemini`'s callers. **What a platform kill does is unaffected by this
  try/catch**, per G4's own restored §5 rule: a kill runs no code at all, so
  the try/catch's presence is irrelevant to the kill case and relevant only to
  the "promise rejects and we catch it" case (§9 R1 below is the residual that
  is NOT this row's to close — see §5).
- **No shared-ceiling, no unattended, no batch population exists on this
  path.** `grep -rln "generateGeminiImage\|generateAnnouncementImageAction"
  src/lib/workflows src/app/api --include=*.ts --include=*.tsx` → **exit 1**,
  empty, confirming no cron/workflow-registry step and no Route Handler
  touches this transport. G4 §6.4's shared-ceiling rule and §6.5's
  batch-vs-per-item write-ordering trace (three different shapes across three
  unattended grading files) **do not apply to this row at all** — there is
  nothing unattended here to size against.

---

## 2. What a platform kill leaves persisted

**Nothing.** This is the cleanest of the shapes G4 traced, and it is a
structural fact, not a design choice this row has to make:

- `generateAnnouncementImageAction` (`announcement-image.ts:42-68`) makes zero
  writes of any kind — no Supabase call, no file write, nothing besides
  `requireOwner()` (an auth read) and the model call itself. Confirmed by
  reading the whole 68-line file; its only imports are `requireOwner` and the
  three `@/lib/llm` exports.
- `generateImage()` (`announcementImagePipeline.ts:65-82`), the pipeline
  function that calls the action, writes only to **React component state**
  (`setImageState`, `setImageBase64`, `setImageMimeType`, `setImageError`,
  `setLogImageAttempts`) — never to `localStorage`, never to a durable draft.
  This is stated as a deliberate constraint in the file's own header
  (`announcementImagePipeline.ts:16-22`: "Never persisted (not localStorage,
  not the message draft payload)") and confirmed independently by
  `useTakeAnnouncement.ts:214` repeating the same claim in its own doc comment
  on the `imageState` field it owns.
- **The one durable write this feature ever makes is a separate action,
  triggered separately, after the image call has already fully settled.**
  Traced directly in `useTakeAnnouncement.ts:743-769` (`commitPost`): the
  `image` argument passed to `createAnnouncementAction` is built at line
  753-761 as `imageState === "ready" && imageBase64 && imageMimeType ? {...} :
  undefined` — every other state (`"generating"`, `"failed"`, `"idle"`)
  resolves to `undefined` and the announcement posts text-only. **A platform
  kill during `generateGeminiImage` leaves `imageState` stuck at
  `"generating"` in a component that no longer exists (the invocation is
  dead); it can never reach `"ready"`, so the later write it would have fed
  simply never receives an image argument.** There is no half-written row,
  no `"graded"`-before-its-draft shape, no total-loss batch — because there is
  no write racing the model call at all. `createAnnouncementAction` itself
  (`src/app/actions/canvas-inbox.ts:284`) is out of this row's scope; it is a
  distinct action already reachable from other paths and untouched by
  anything G5 does.

**One in-tree comment drift caught and NOT relied upon.**
`announcementImagePipeline.ts:30-33`'s own header claims "posting to Canvas
never carries the image as a standalone attachment" — this is **stale**.
`useTakeAnnouncement.ts:221-224`'s doc comment on `imageState` (the newer of
the two, and the one matching the code actually read above) says the opposite:
"The image DOES post now, as of this wave ... uploads it to the course's
Canvas Files and folds an `<img>` ... onto the HTML." The `commitPost` trace
above resolves the contradiction from the executable code, not from either
comment: the image **does** post via `createAnnouncementAction`'s 6th
argument. Flagged here because it is exactly the "brief from the tree, not the
doc" hazard applied to two in-tree comments disagreeing with each other, not
only to an external design doc — not something this row owes a fix for (it is
prose, not a defect in behavior), but worth a residual (§9 R3) so it does not
get inherited as fact by a future brief.

**Conclusion for requirement 2: no remedy is owed here.** The write-ordering
rule G4 §6.5 states generally ("a write that marks work done must never land
before the record that status depends on is also durably written") is already
satisfied on this path, structurally, because no such write exists inside the
bounded call.

---

## 3. The rulings this inherits, confirmed rather than assumed

**RULING 76 (elapsed-aware, per-invocation, never a fixed constant).**
Applies, but degenerates to the single-call case G4 §6.2 already names
explicitly: *"the single-site file ... is the degenerate case of the same
function, where `remainingMs` is only ever computed once because there is
only one call. A fixed literal is never correct, even for a single-site
caller."* This row has exactly one `callLlm`-family call per invocation
(confirmed §1: no second model call anywhere in
`generateAnnouncementImageAction`'s call graph), so the shape is: record
`startedAtMs = Date.now()` at function entry (before `requireOwner()`, so the
auth round-trip's own latency is counted), then wrap the model call in
`raceWithTimeout` sized from the remainder. **Never a bare
`raceWithTimeout(generateGeminiImage(prompt), 50_000)` literal** — that would
repeat exactly the shape G4 B1 found incoherent, just at a smaller population.

**RULING 75, with its stated limit (racing is not cancelling).** Applies
unchanged. `bounded-race.ts:26-29`, its own doc comment: *"Losing the race
does not cancel `work`. ... `work` keeps executing."* Re-confirmed by opening
`bounded-race.ts` directly this pass. **This row closes the platform-kill
harm (the caller stops waiting and returns a worded error) and does not close
abandoned in-flight work or quota burn** — same limit G4 named for the text
path, restated here rather than re-derived, because the mechanism (whatever
wraps a bare `fetch`-based call with no `signal`) is identical in kind.

**"The abort is already terminal" — confirmed by an EXECUTING test, not by
reading code.** `src/lib/llm.ts` has two structurally distinct transports —
this corrects G4's own phrasing, see the callout box below — and **both**
carry the identical abort-terminal fix: `isAbortError(err)` at `llm.ts:478`
inside `postGenerateContent` (the text transport, called by `callGemini`), and
at `llm.ts:645` inside `postInteraction` (the image transport, called by
`generateGeminiImage`, confirmed at `llm.ts:800`). **This is not asserted from
reading the code — `src/lib/llm.test.ts:897-907` already executes it**:

```
it("an AbortError is attempted once and propagates immediately, never
retried (G4 Wave B)", async () => {
  ...
  const fetchMock = vi.fn().mockRejectedValue(abortError);
  vi.stubGlobal("fetch", fetchMock);
  const result = await generateGeminiImage("a simple illustration");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ ok: false, status: 0, body: "This operation was aborted." });
});
```

Re-run this pass in isolation: `npm run test:paths -- src/lib/llm.test.ts` →
**68 tests passed (68), 0 failed**, `COVERED src/lib/llm.test.ts files=1
passed=68` printed by the wrapper. This test calls the real
`generateGeminiImage`, mocks only `global.fetch` (never touching the network;
`vitest.setup.ts`'s real-fetch guard does not fire because the global is
replaced before any call, the same pattern already used at
`llm.test.ts:900-901` and throughout this file), and asserts an exact call
count — the class of instrument this row's own §4 below requires, already
landed. **What is therefore already done: nothing further is owed for the
abort-retry defect on this transport. What is NOT yet done, and is this row's
entire remaining job: nothing wraps the call with a deadline in the first
place**, so there is currently no real `AbortSignal` for `isAbortError` to
ever see on this path — the fix at `:645` is correct and tested, but inert
until a wave adds a wrapper.

> **Correcting G4's own phrasing, not its conclusion.** G4's R6 disposition
> said "the image path calls the same shared function" as the text path. Read
> directly: `postGenerateContent` (`llm.ts:454`) and `postInteraction`
> (`llm.ts:620`) are **two separate functions**, hitting two different
> endpoints with two different auth styles (`llm.ts:596-618`'s own doc
> comment: `postInteraction` is "**Deliberately NOT shared** with
> `postGenerateContent`"). What IS shared is `MAX_ATTEMPTS`,
> `backoffDelay`, `sleep`, `RETRYABLE_STATUS`, and `isAbortError` — and the
> abort-terminal fix was applied to each function's own catch block
> independently (two edits, not one), per `llm.ts:646-648`'s own comment:
> "shared here because `generateGeminiImage` routes through this same
> transport, so the image path gets the fix without a second copy" — read in
> context, "this same transport" means the same fix pattern, applied at the
> sibling function, not literally one shared call. **G4's underlying claim —
> that Wave B's fix covers this row without a duplicate fix being owed — is
> correct**, and the executing test above proves it; only the one-function
> description was imprecise. Worth stating precisely here because a future
> reader tracing "where is the shared function" from G4's prose alone would
> not find one.

---

## 4. The budget arithmetic, concretely — and the fork

**No wrapper exists today.** `grep -n "raceWithTimeout\|withDeadline"
src/app/actions/announcement-image.ts
src/app/components/recording/announcementImagePipeline.ts
src/app/components/recording/useTakeAnnouncement.ts` → **exit 1**, empty,
confirmed this pass. The call at `announcement-image.ts:52` is completely
bare — no bound of any kind, unlike every text-path caller G4 catalogued,
all of which are at least candidates for a fixed-constant wrapper. This path
starts from a worse position: fully unbounded, not merely wrongly-bounded.

**Which mechanism, and why.** Two wrapper tools exist in this repo and they
are not interchangeable:

| | `raceWithTimeout` (`src/lib/bounded-race.ts`) | `withDeadline` (`src/lib/course-intel/fetch.ts:316`) |
|---|---|---|
| Outcome shape | Never throws; resolves `{kind:"settled"\|"timedout"\|"failed"}` | Rejects with a worded `Error` |
| Timer mechanism | Plain `setTimeout` (`bounded-race.ts:43-49`) | `AbortSignal.timeout(ms)` (`fetch.ts:317`) |
| Testable with fake timers? | **Yes** — `bounded-race.ts:20-24`'s own doc comment states this is why `setTimeout` was chosen over `AbortSignal.timeout`; proven by `bounded-race.test.ts:20-24` (`vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`, zero real elapsed time) | **No** — `fetch.test.ts:585,589-591` drives it with real wall-clock waits (`20`, `5`, `30` ms) because `vi.useFakeTimers()` does not patch `AbortSignal.timeout` |
| Existing precedent's own shape | Wraps work from a **client-invoked, no-declared-ceiling** caller: `announcements-panel.tsx:128`, `WalkthroughAnnouncementPanel.tsx:303,:358` — both `.tsx` components, no `maxDuration` | Wraps work from a **Route Handler with a declared `maxDuration`**: `course-intel/ask/route.ts`, `class-trends-insight/route.ts` |

**This row's caller is a client-invoked Server Action with no declared or
declarable `maxDuration`** — structurally the same shape as
`raceWithTimeout`'s two existing precedents, not the Route-Handler shape
`withDeadline`'s precedents share. **Recommendation: `raceWithTimeout`**,
both because it matches the closer structural precedent and because it is the
only one of the two that this repo can drive synchronously in a test (the
instrument in §5 depends on this).

**The fork.** RULING 77 settled the Route-Handler number (`50_000` /
`2_000` reserve) against a *known* `maxDuration = 60` ceiling. This row has no
known ceiling at all — `page.tsx` declares none and cannot, and OC5 (the
platform's actual unconfigured-Server-Action duration) is still open,
answered nowhere in this repo per G4 §3's own standing rule ("do not treat
'platform default' as a known number anywhere in this document; it is not
measured in this repo"). Reusing `50_000`/`2_000` verbatim would be reusing a
number whose *justification* ("comfortably under the known 60s ceiling") this
caller does not have — the same class of error RULING 77 fixed in the other
direction (a number correct for one ceiling, applied to an invocation with a
different one), except here the receiving ceiling is not merely different, it
is **unmeasured**.

**This produces X or Y; every answer ends this fork:**

- **(X) Reuse the Route-Handler numbers (`TOTAL_BUDGET_MS = 50_000`,
  `MODEL_WAIT_RESERVE_MS = 2_000`, `MODEL_WAIT_MIN_MS = 8_000`,
  `MODEL_WAIT_MAX_MS = 24_000`, all from `class-trends-insight/route.ts:47-51`)
  as a stated, deliberately conservative placeholder pending OC5.** Cost of
  being wrong: if the real unconfigured-Server-Action default is smaller than
  50s (Vercel's public docs cite 10s for an unconfigured Hobby function — a
  figure G4 §3 explicitly refuses to credit as measured in this repo), the
  wrapper still fires *after* the platform kill, buying nothing — the exact
  failure this whole row exists to prevent, just at an unverified ceiling
  instead of a verified one.
- **(Y) Pick a materially tighter number** (for instance an 8-second budget,
  comfortably under even the unverified 10s figure) so the wrapper protects
  against the worse-case unconfirmed ceiling. Cost of being wrong: a real
  Gemini image call that would have completed in, say, 15 seconds under a
  ceiling that turns out to be 60s gets cut off early and the instructor sees
  a spurious timeout on a call that would have succeeded.

**Recommendation: (X)**, with OC5 recorded as the reason this number is
provisional (§9 R4), not because 50s is known to be safe here — it is not —
but because (Y)'s number is exactly as unmeasured as (X)'s ceiling
assumption, and (X) reuses a number the owner has already ruled on once
(RULING 77) rather than inventing a third. **Either answer only changes the
two constants; the mechanism (§5's wave) is identical either way, and OC5
stays exactly as open as G4 already left it — this row does not owe OC5 an
answer, only a documented assumption pending one.**

---

## 5. The instrument, and the one that will not work

**Two instruments already exist and are not this row's to build:**
`llm.test.ts:897-907` (§3 above) proves the abort-terminal fix on this exact
transport, executing the real function. Nothing further is owed there.

**Two new instruments this row's wave must add, both executing the real
code, neither grepping for `AbortSignal`:**

**(a) A structural walker over the whole tree, not a single-file check —
mutation family: "a `generateGeminiImage(` call site ships, or becomes,
unwrapped."** Modeled on two existing precedents, one to imitate and one to
avoid:

- **Avoid:** `src/lib/course-intel/fetch.test.ts:627-637`'s existing
  `callLlm`/`withDeadline` check is a 200-character-proximity idiom
  (`.slice(index - 200, index)` then `.toContain("withDeadline(")`) —
  satisfiable by a comment mentioning the wrapper's name anywhere in the
  preceding 200 characters, the exact class G4 B5 already diagnosed for Wave
  C's inherited template.
- **Imitate:** `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts:339`
  anchors on direct source adjacency instead:
  `expect(panelSource).toMatch(/raceWithTimeout\(\s*Promise\.all\(/)` — the
  wrapper call's own opening parenthesis immediately followed by the wrapped
  expression, not a bare-string proximity search.
- **Walk the whole tree, not one hardcoded file** — per `traps-spec.md`'s
  floor-not-set rule and G4 B5's fix for Wave C. `src/lib/no-emojis.test.ts`
  already has a real, executing whole-tree walker in this exact repo
  (`no-emojis.test.ts:240-255`, `fs.readdirSync` recursive, plus its own
  canary at `:224` proving the walk cannot silently return `[]`) — this is
  the pattern to reuse, scoped to `src/**/*.{ts,tsx}` excluding `*.test.*`.

  Concretely: derive `callSites` by walking that file set and running
  `/generateGeminiImage\(/g` against each file's source (never a frozen
  list); `expect(callSites.length).toBeGreaterThan(0)` first, so an empty
  walk cannot pass vacuously (today this resolves to exactly 1, at
  `announcement-image.ts:52` — the test must not hardcode that count, only
  assert it is nonzero); for every site, assert the immediately-preceding,
  whitespace-collapsed source matches
  `/raceWithTimeout\(\s*generateGeminiImage\(/`. **Direction of failure:**
  RED when a call site — including one in a file this document has never
  seen — is not the direct argument of a `raceWithTimeout(` call. **Given a
  population of exactly one caller today, no shrink-only allowlist is needed
  the way G4 Wave C needs one for its ~60-file population** — the wave
  simply requires 100% wrapped, and the run-time-derived set is what makes a
  future second caller land inside the same requirement automatically rather
  than needing the test rewritten.

**(b) An execution test that asserts the emitted timeout value by running the
wrapped code, never by inspecting source text — mutation family: "the
wrapper is present but computes the wrong wait, or never actually races."**
Modeled on `bounded-race.test.ts:20-24`'s fake-timer shape combined with
`llm.test.ts`'s existing `vi.stubGlobal("fetch", ...)` pattern: mock `fetch`
to never resolve (the `neverSettles` shape at `bounded-race.test.ts:13-17`),
`vi.useFakeTimers()`, call the real, as-built
`generateAnnouncementImageAction`, `vi.advanceTimersByTimeAsync` to the
computed wait value, and assert the returned `{ error: string }` matches the
wrapper's own timeout wording at exactly that simulated elapsed time — never
the real wall clock, and never a real `fetch`. **Object under comparison:**
`generateAnnouncementImageAction`'s returned value. **Instrument:** the fake-
timer execution above. **Direction of failure:** RED if the promise resolves
to anything other than the timeout `{error}` shape at the expected simulated
tick, or if it resolves before that tick (wrapper fires too early) or not at
all by that tick (wrapper never raced). This is the "execute the producer,
never grep for `AbortSignal`" instrument the brief requires, and it is
buildable today with zero live key and zero real elapsed time, per
`bounded-race.test.ts`'s own already-proven pattern.

**What remains genuinely unverifiable in this environment, stated rather than
guessed at:** whether a *real* Gemini image call ever actually takes long
enough for this to matter, and what the real platform kill point is (OC5).
Both are `docs/loop/this-repo.md` section 6 territory — no live key, no
network — and both are already residuals (§9 R4, R5), not gaps this
instrument pretends to close.

---

## 6. Waves

**One wave.** The population is one caller, three small files, no shared
ceiling, no batch-write concern (§2) — none of G4's reasons for a multi-wave
split (a 60-file population, a separate cron/workflow population, a
not-yet-built Route Handler) apply here.

- **Wave G5-A — bound the one image call site.**
  - **Files:** `src/app/actions/announcement-image.ts` (add
    `startedAtMs`/`raceWithTimeout` around the existing bare call at `:52`,
    translate `{kind:"timedout"}` into the same `{error: string}` shape every
    other branch already returns, matching `withDeadline`'s own wording style
    at `fetch.ts:320` for consistency even though the mechanism differs);
    `src/app/actions/announcement-image.test.ts` (extend with instrument (b)
    from §5, plus a regression check that the existing `requireOwner`-failure
    and empty-prompt branches are unaffected — both already covered by tests
    in this 113-line file today, re-run rather than rewritten); a **new**
    file `src/app/actions/announcement-image.wiring.test.ts` (instrument (a)
    from §5), naming convention matched to the existing
    `announcements-panel.wiring.test.ts` precedent (`grep -n` confirms that
    file exists, 410 lines).
  - **This wave includes the file that calls the new wrapper** —
    `announcement-image.ts` itself is both the file gaining the export change
    and the file calling it; there is no separate caller file to add, unlike
    G4's Wave C where ~60 caller files were the whole point.
  - **Size check, per the brief's own requirement:** `wc -l` today —
    `announcement-image.ts` 68, `announcement-image.test.ts` 113,
    `announcementImagePipeline.ts` 126 (untouched by this wave — no change is
    needed there; `generateImage()` at `:65-82` already just awaits whatever
    the action returns). None of the touched or cited files is within an
    order of magnitude of the 1000-line ceiling; no extraction question
    arises. `src/lib/llm.ts` (821 lines) and `src/lib/llm.test.ts` (917
    lines) are **not touched by this wave at all** — the wrapper belongs at
    the caller, per RULING 75, not inside the shared transport, so this row
    adds zero lines to either file.
  - **Pass condition:** object is `generateAnnouncementImageAction`'s
    returned value and the whole-tree `generateGeminiImage(` call-site
    population; instruments are (a) and (b) from §5; direction of failure as
    stated there.
  - **Depends on:** the fork in §4 (which constants to use) — the mechanism
    is unaffected by the answer, only two numeric constants are, so this wave
    can be built now with the recommended (X) values and revised in place if
    the owner answers (Y) instead, without touching the wave's structure.
  - **Owner:** next implementer. Not blocked on any other in-flight document —
    checked against the brief's named live siblings, `docs/a44-waves-check.md`
    and `docs/r4-check.md`; neither was opened, read, or referenced by this
    document, and neither shares a file with Wave G5-A's write set above.

---

## 7. Leverage

**None directly; this row protects a capability that already exists,
exactly as the brief anticipated.** Per `DEV_LOOP.md:101-108`, a leverage
claim is owed only when a chunk "builds or changes a capability a user
reaches — not a bug fix." This is a reliability bug fix: it changes nothing
about what the announcement-image feature does when the model responds in
time, only what happens when it does not. Checked against `leverage.md`'s own
taxonomy rather than asserted: the feature this row protects (draft an
announcement image from Gemini, reviewable and discardable before posting)
already has a real, named leverage claim of its own — CORPUS-adjacent via the
later Canvas-Files upload, and CAPTURE-adjacent not at all (this is
generation, not device capture) — but that claim belongs to whichever chunk
built `generateAnnouncementImageAction` in the first place, not to this one.
This row adds no user-reachable behavior; it only prevents an existing
behavior from degrading into a raw transport failure under a platform kill,
the same non-claim G4 §8 made for the text path, for the same reason.

---

## 8. Residual register

| # | What is not proven now | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| R1 | Whether the platform actually kills a client-invoked Server Action before or after `requireOwner()`/the model call in a way that matters — i.e., OC5 itself, which this row inherits rather than answers | Repo owner | The Vercel project settings page (`docs/a29-architecture.md:285`, OC5, still open) | N/A — decision/measurement residual, not a code defect | Whenever OC5 is answered for any row; this row does not block on it (§4, recommendation (X) is provisional pending it) |
| R2 | Whether the adopted budget (`TOTAL_BUDGET_MS`, whichever the fork resolves to) is generous enough for a real Gemini **image** call specifically — image generation latency is not asserted anywhere to match text-generation latency, and no live key exists here to compare them | Repo owner, live key required | One real timed image-generation run against production Gemini, elapsed time read from the same `elapsedMs`-style instrumentation `callGemini` already uses (`llm.ts:555-557`) if added to `generateGeminiImage` in the same wave | Fails if the image call times out under the adopted soft budget at a rate the owner considers unacceptable, mirroring G4's R4/RULING 77 direction (an item timing out under the soft budget that would have completed under the real, still-unmeasured ceiling) | An owner-run timed check after Wave G5-A ships, not this document's to run |
| R3 | `announcementImagePipeline.ts:30-33`'s header comment ("posting to Canvas never carries the image as a standalone attachment") is stale prose contradicted by `useTakeAnnouncement.ts:221-224` and by the actual `commitPost` code (§2) | Whoever next edits either file | A direct read of `commitPost`'s `image` argument construction (`useTakeAnnouncement.ts:753-761`), already performed once in §2 | N/A — a documentation-currency finding, not a behavioral defect; recorded so a future brief does not inherit the stale claim as fact | The next chunk that touches either file's header comment; not inside Wave G5-A, whose write set does not include either file |
| R4 | The fork in §4 itself — whether (X) or (Y)'s constants are adopted | Repo owner | The fork's own cost comparison in §4, already laid out; needs a decision, not a measurement | N/A — decision residual | Decided before or alongside Wave G5-A's dispatch; the wave's structure (§6) is unaffected either way |
| R5 | Whether an instructor actually sees a legible "image generation timed out" state on screen, distinct from the existing "failed" state's generic wording | Repo owner / a UX pass on the as-built diff | Real browser observation — nothing here renders a component (`docs/loop/this-repo.md` section 6) | Fails if the state is technically correct but not legible in practice | A follow-up UX pass against Wave G5-A's as-built diff, same as G4's R5 |

None of the five residuals above is a remedy standing in for an instrument —
each names a real owner and a real, distinct instrument or decision step.

---

## Verification of this document's own write set

```
git status --short
```

```
 M docs/css-orphans.md
```

That entry is pre-existing and sibling-owned (present in the conversation's
opening git-status snapshot, before this pass started; not opened, read, or
touched by this pass). This pass's own entry is `docs/g5-scope.md` (new).
Live siblings named in the brief, `docs/a44-waves-check.md` and
`docs/r4-check.md`, were not opened, read, or referenced by this document —
confirmed by their absence from every citation above. No `git stash`, no
`git add -A`, no `git checkout --` was run. No file under `src/` was opened
for writing; the one `npm run test:paths -- src/lib/llm.test.ts` run in §3
executed existing tests only and mutated no file (confirmed: the run's own
output names only `src/lib/llm.test.ts` as covered, and this document's write
set, checked again after that run, is unchanged). `docs/backlog.yml` was not
read or touched, per the brief — every backlog citation above went through
`grep -a -n "G5" docs/BACKLOG.md`. No scratch directory was created under the
repo; the only files this pass wrote are `docs/g5-scope.md` itself.
