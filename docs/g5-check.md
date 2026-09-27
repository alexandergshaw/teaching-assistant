# G5 scope, round 1 check - the no-writes claim rests on the one instrument that cannot see the write, and neither new instrument can fail on RULING 76

**Artifact checked:** `docs/g5-scope.md`, **509 lines** (`wc -l docs/g5-scope.md` → 509;
`@(Get-Content docs/g5-scope.md).Count` → 509 - both agree), committed `c5aa8a0`.
Round 1 of at most two. I did not author it.

**Read first, in full:** `docs/DEV_LOOP.md`, `docs/loop/traps-spec.md`,
`docs/loop/iteration-caps.md`, `docs/loop/leverage.md`, the G5 row via
`grep -a -n "G5" docs/BACKLOG.md` (the row is file line **96**; `docs/backlog.yml`
was not opened), `docs/g4-scope.md` and `docs/g4-check.md`.

**No restructuring, so no disposition table is owed.** The artifact's own claim
that no prior G5 scope exists is confirmed: `git log --oneline -3 -- docs/g5-scope.md`
returns only `c5aa8a0`.

**Nothing under `src/` was mutated.** The one mutation-style question I could not
settle by reading (whether `vi.useFakeTimers()` can drive `AbortSignal.timeout`)
was measured with a standalone Node probe written **outside the repo**, in this
session's scratchpad (`abortsignal-faketimer-probe.mjs`). No scratch file was
created inside the tree; `git status --short` at the end confirms it.

---

## Verdict

**BUILDABLE IN PART.** 4 blockers, 5 majors, 8 minors.

The mechanism half is sound and the row's own re-measurement is exact. What fails
is the evidence under the load-bearing absence claim, both new instruments, and
the numbers the owner-facing fork is priced on.

---

## The question the brief puts first: does the no-persisted-writes claim hold?

**NO, not as written - and YES for the conclusion it supports.** Both halves
matter, so both are stated.

§2's first bullet: *"`generateAnnouncementImageAction` (`announcement-image.ts:42-68`)
makes zero writes of any kind - no Supabase call, no file write, nothing besides
`requireOwner()` (an auth read) and the model call itself. Confirmed by reading
the whole 68-line file."*

`requireOwner()` is not an auth read. Traced forward from `announcement-image.ts:46`:

- `grep -n "export async function requireOwner" src/lib/supabase/auth.ts` → **`:451`**,
  whose entire body is `return requireUser();`.
- `requireUser()` (`auth.ts:328`) ends its authorized path at **`auth.ts:358`**:
  `await reconcileAppUserRow(user.id, row, user.email ?? "");`
- `reconcileAppUserRow` (`auth.ts:255-260`) calls **`ensureAppUser({ id: userId })`**
  whenever `appUserNeedsReconciliation(row, email)` is true.
- `ensureAppUser` (`app-users.ts:722`) performs
  `supabase.from("app_users").upsert(insertRow, { ignoreDuplicates: true })` at
  **`app-users.ts:773`** and a `.update(...)` at **`app-users.ts:910`**
  (`grep -n "\.insert(\|\.upsert(\|\.update(" src/lib/supabase/app-users.ts`).
- The denial path writes too: `auth.ts:340` calls `ensureAppUserRowExists`
  (`app-users.ts:978`), which upserts at **`app-users.ts:994`**.

So a **durable Supabase write can occur inside the bounded action, before the
model call is ever made.** "Zero writes of any kind - no Supabase call" is false,
and the instrument the scope names for it - reading one 68-line file - is exactly
the instrument that cannot observe an indirect write. That is `traps-spec.md`'s
newest rule applied to a read instead of a count: *when a count appears to settle
a question, ask whether the instrument can even observe the thing it is being read
as settling.*

The document also contradicts itself on this. §3 requires `startedAtMs` be recorded
*"before `requireOwner()`, so the auth round-trip's own latency is counted"* - an
auth round-trip **is** a Supabase call. §2 and §3 cannot both be literally true.

**The conclusion survives the correction, and I say so plainly because the remedy
depends on it.** The `app_users` write completes *before* `generateGeminiImage` is
entered, is idempotent (`ignoreDuplicates: true`), is unrelated to the image, and
is not a status marker that could be left looking complete. `src/lib/llm.ts`
itself holds no persistence at all (`grep -n "supabase\|\.insert(\|\.upsert(\|writeFile\|fs\." src/lib/llm.ts`
→ exit 1; its only two imports are `./gemini` and `redactSensitiveText` from
`./lms-generation/generation-diag`, which is also write-free by the same grep).
`announcementImagePipeline.ts:65-82` writes only React state, confirmed by reading
all 126 lines. So **no write races the model call**, G4 §6.5's write-ordering rule
is satisfied on this path, and **no write-ordering remedy is owed** - which is what
§2 concluded. The proof is wrong; the answer is right.

That distinction is the whole finding: a future reader inheriting "this action
makes zero Supabase calls" will build against something false.

---

## Blockers

### B1 - The load-bearing absence claim is proved by an instrument blind to the class it denies
**Class: an absence claim proved by an instrument that cannot observe the class of
instance it denies. REPEAT-OF the class G4 round 1 already produced** (`6e326dc`,
"an absence claim that was false because of one include flag"). The corrective rule
is identical for both - prove an absence with an instrument that can observe an
indirect or filtered-out instance, and carry a canary exercising the same filter -
so relabelling it "a read instead of a grep" would be buying a round.

Evidence and measurement: the section above. Disposition: **fixable in the one
revision.** Restate §2's first bullet as "the only write reachable inside this
action is `requireOwner()`'s conditional, idempotent `app_users` reconciliation
(`auth.ts:358` → `app-users.ts:773/910`), which completes before the model call";
keep §2's conclusion unchanged; delete the "no Supabase call" phrasing so it stops
contradicting §3.

### B2 - Instrument (a) is RED on a correct build, and the document's own §0 says so
**Class: an instrument whose specified population contradicts the document's own
measurement, so it cannot pass as written. NEW.**

§5(a) specifies: derive `callSites` by running `/generateGeminiImage\(/g` over
`src/**/*.{ts,tsx}` excluding tests, then *"for every site, assert the
immediately-preceding, whitespace-collapsed source matches
`/raceWithTimeout\(\s*generateGeminiImage\(/`"*, and states *"today this resolves
to exactly 1, at `announcement-image.ts:52`"*.

Measured: `grep -rn "generateGeminiImage(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l`
→ **2**:

```
src/app/actions/announcement-image.ts:52:    const result = await generateGeminiImage(prompt);
src/lib/llm.ts:790:export async function generateGeminiImage(prompt: string): Promise<LlmImageResult> {
```

The regex matches the **definition**, which no `raceWithTimeout(` will ever
precede. The scope's own §0 states this correctly - *"is `announcement-image.ts:52`,
and `llm.ts:790` (the definition itself)"* - and §5 then asserts the opposite
count. Implemented verbatim, the wave's new test file fails forever on a correct
build.

Why it is a blocker rather than a typo: the implementer will invent an exclusion
the spec does not authorize, and the cheapest one - narrow the walk to
`src/app/actions` - reinstates precisely the floor-not-set defect the instrument
exists to prevent, while going green. Disposition: **fixable in the one revision**
(exclude the declaration form, e.g. require the match not be preceded by
`function `, and state the expected population as 2 matches / 1 call site with the
command that produced it).

### B3 - Neither instrument can fail when the elapsed-aware shape is replaced by the literal RULING 76 forbids
**Class: a pass condition that cannot fail on the defect it was written for -
silent green. NEW.**

G4 §6.2 (`docs/g4-scope.md:369-378`) fixes the formula, and
`class-trends-insight/route.ts:143-144` implements it:

```
const remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();
const waitMs = Math.min(MODEL_WAIT_MAX_MS, Math.max(MODEL_WAIT_MIN_MS, remainingMs - MODEL_WAIT_RESERVE_MS));
```

With the four constants §4 adopts wholesale (`TOTAL_BUDGET_MS = 50_000` `:47`,
`MODEL_WAIT_MIN_MS = 8_000` `:48`, `MODEL_WAIT_MAX_MS = 24_000` `:49`,
`MODEL_WAIT_RESERVE_MS = 2_000` `:51`; command: `grep -n "MODEL_WAIT_\|TOTAL_BUDGET_MS" src/app/api/class-trends-insight/route.ts`)
and exactly one model call preceded only by `requireOwner()`, `remainingMs - RESERVE`
is ~47_700 ms, so `waitMs` clamps to **`MODEL_WAIT_MAX_MS` = 24_000 in every
reachable invocation.**

Consequence: instrument (b) - *"assert the returned `{ error: string }` matches the
wrapper's own timeout wording at exactly that simulated tick"* - produces the same
observed value for the elapsed-aware computation and for a bare
`raceWithTimeout(generateGeminiImage(prompt), 24_000)` literal. Instrument (a)
matches `/raceWithTimeout\(\s*generateGeminiImage\(/`, which the literal also
satisfies. **So nothing in the scope goes RED when the one thing this row exists to
install is absent.** That is the row's entire stated purpose - *"the image path must
not be given the shape that was just ruled wrong for the text path"* (`BACKLOG.md:96`) -
left unenforced with every gate green.

The fix has to change kind, not strength: instrument (b) must drive **two different
preamble elapsed times** (a `requireOwner` mock that awaits a fake-timer delay) and
assert **two different emitted waits**, so a constant cannot satisfy both. A single
tick cannot distinguish them however tightly it is asserted.

Disposition: **relocate to `loop-test-author`** (disposal (a)) - the obligation is
to specify an instrument that observes the elapsed-aware dependence, not a tighter
assertion on one tick. The wave should not be dispatched until that exists, because
its green would mean nothing.

### B4 - The fork put to the owner is priced on a number the adopted formula never emits
**Class: the escalated decision is priced on a quantity the design does not produce.
NEW.**

§4 frames option (X) as *"Reuse the Route-Handler numbers (`TOTAL_BUDGET_MS = 50_000`,
`MODEL_WAIT_RESERVE_MS = 2_000`, `MODEL_WAIT_MIN_MS = 8_000`, `MODEL_WAIT_MAX_MS = 24_000`)"*
and states the cost of being wrong as: *"if the real unconfigured-Server-Action
default is smaller than 50s ... the wrapper still fires **after** the platform kill,
buying nothing."*

Under the formula those very constants belong to, the wrapper fires at **24_000 ms**.
So (X) buys a real worded error for every ceiling above ~24 s and buys nothing only
below it - the stated cost is wrong across the whole ~25 s to 50 s band. Option (Y)
("a materially tighter number, for instance an 8-second budget") is then being
compared against a 50 s figure that (X) does not produce; under the same formula (Y)
would emit `min(24_000, max(8_000, 8_000 - 2_000))` = 8_000, i.e. the real spread the
owner is choosing between is **24 s versus 8 s**, not 50 s versus 8 s.

§4 never states the emitted `waitMs` at all. That is an unmeasured, unnamed quantity
carrying the entire fork, and `AGENTS.md` requires every answer to that fork to END
the activity - so the owner would be terminating on a wrong cost description.

Disposition: the revision must state the emitted wait with the command behind it.
The residual choice is an **owner decision**, folded into the terminating question
below.

---

## Majors

### M1 - The structural-precedent argument for `raceWithTimeout` over `withDeadline` is inverted
**Class: a precedent cited for a shape it does not have. NEW.**

§4's table row "Existing precedent's own shape" says `raceWithTimeout` *"wraps work
from a **client-invoked, no-declared-ceiling** caller: `announcements-panel.tsx:128`,
`WalkthroughAnnouncementPanel.tsx:303,:358` - both `.tsx` components"*, against
`withDeadline` *"wraps work from a **Route Handler with a declared `maxDuration`**"*.
It then concludes G5's caller is *"structurally the same shape as `raceWithTimeout`'s
two existing precedents"*.

Measured (`head -1` on both, plus reading each site):

- `src/app/components/canvas-tab/announcements-panel.tsx:1` → `"use client";`, and
  `:128` races `Promise.all([getMostRecentAnnouncementExemplarAction(...), listAnnouncementExemplarsAction(...)])`.
- `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx:1`
  → `"use client";`, `:303` and `:358` the same shape.

Both precedents put the race **in the browser, outside the server invocation**,
wrapping server-action calls. `withDeadline`'s precedents put it **inside a
server-side invocation, wrapping a model call, sized from a `startedAtMs`**
(`class-trends-insight/route.ts:94,143-144`).

G5's plan - `raceWithTimeout` inside `announcement-image.ts` (`"use server";`,
confirmed by `head -1`), wrapping the model call, sized from a `startedAtMs` at
invocation entry - is structurally the **`withDeadline` precedent's** shape. The
scope's own argument, applied correctly, points at the helper it rejected.

The recommendation may still be right: the **testability** leg holds and I measured
it (see m6). But §4 presents two mutually reinforcing legs, and one is backwards,
so the recommendation currently rests on one leg the document does not identify as
load-bearing. Disposition: **fixable in the one revision** - keep the
recommendation, drop or invert the precedent leg, and say the choice rests on
fake-timer drivability alone.

### M2 - The remedy leaves the row's named harm conditionally open, and the one placement that closes it unconditionally is never considered
**Class: the chosen remedy closes the named harm only under an unmeasured
condition, with the unconditional alternative unexamined. NEW.**

The harm on the row is *"when the platform kills the invocation the action's catch
never runs, so the client gets a raw transport failure instead of the `{error}`
string"* (`BACKLOG.md:95`). A race **inside** the invocation is itself killed by that
kill: it closes the harm only if the emitted wait (24_000 ms, B3) is below the
platform's unconfigured Server Action ceiling - which is OC5, open, and unmeasured.
That conditionality is the sole reason §4 needs a fork at all.

A race at the **client caller** - `announcementImagePipeline.ts:69`,
`const result = await generateAnnouncementImageAction(prompt);` - closes it
**unconditionally**, whatever OC5 turns out to be, because no platform kill can
reach a timer in the browser. And that is exactly where both cited `raceWithTimeout`
precedents live (M1). It is also the more testable site in this environment:
`announcementImagePipeline.ts` is a plain `.ts` leaf taking an injected
`AnnouncementImageDeps` (`:41-54`), so a node-env test can drive it with fake timers
and observe `setImageState("failed")` / `setImageError(...)` without rendering
anything - whereas the in-action test must mock `@/lib/supabase/auth` and
`@/lib/llm` (as `announcement-image.test.ts:12-22` already does).

RULING 75 is not reopened by this. RULING 75 places a wrapper at the **caller of the
model call**, which is the action; a client-side patience bound is a different bound
on a different caller, additive rather than substitutive. The scope neither adopts
it nor states why not.

Disposition: **owner decision** - this is the one part not dispatchable while the
rest is, because it changes which file the wave writes. Folded into the terminating
question.

### M3 - "inert until a wave adds a wrapper" is false of the wrapper this scope recommends
**Class: a claim about a wave's consequence that the wave's own mechanism cannot
produce. NEW.**

§3 states: *"there is currently no real `AbortSignal` for `isAbortError` to ever see
on this path - the fix at `:645` is correct and tested, but inert until a wave adds
a wrapper."*

Measured: `grep -n "signal" src/lib/llm.ts` → **`:406`** and **`:751`** only, both
prose; neither `fetch` call passes a `signal` option. `raceWithTimeout`
(`bounded-race.ts:31-74`) creates **no `AbortSignal` at all** - it is a plain
`setTimeout` race. `withDeadline` (`fetch.ts:316-325`) creates an
`AbortSignal.timeout` but never passes it to `work` either.

So after Wave G5-A lands with **either** helper, `isAbortError` at `llm.ts:645` still
never fires. The guard stays inert not "until a wave adds a wrapper" but until
something threads a real signal into `fetch` - which the G4 row explicitly rules a
**different item** (*"Any wave that wants the work itself cancelled must thread a real
signal INTO fetch, and that is a different item from this one"*, `BACKLOG.md:95`).
§3's sentence tells the next reader that G5 activates it. Disposition: **fixable in
the one revision** (one sentence).

### M4 - R3 is a false finding, and its residual has no owner
**Class: a contradiction manufactured between two statements that are both true,
then carried as a residual with no owner. NEW.**

§2 and R3 claim `announcementImagePipeline.ts:30-33` (*"posting to Canvas never
carries the image as a standalone attachment"*) is **stale**, contradicted by
`useTakeAnnouncement.ts:221-224`.

Measured, reading all 126 lines of the pipeline file and the Canvas code:

- The **same file** already carries the newer statement, four lines earlier, at
  **`:24-28`**: *"The image DOES post, as of the wave that added it:
  `useTakeAnnouncement.ts`'s own `commitPost()` passes a 'ready' image to
  `createAnnouncementAction`'s optional image argument."* The scope does not mention
  it, and it is the fact that dissolves the alleged drift.
- The two statements are not in conflict. The image posts as an `<img src=...>`
  folded into the announcement HTML, pointing at the Canvas Files upload -
  `src/lib/canvas/announcements.ts:312` and `:408`
  (`` return `${textHtml}<p><img src="${escapeHtmlAttr(image.url)}" alt="..."></p>` ``).
  The only `attachment` handling in that file (`:111-190`) is a content-export
  `.imscc` download, not the announcement image
  (`grep -n "attachment" src/lib/canvas/announcements.ts src/lib/canvas/announcement-image-upload.ts`).
  An embedded `<img>` is not a standalone attachment. **Both comments are true of
  the code.**

Two further problems in the same row. The check brief expected the correction to be
assigned to a wave; it is not - R3's owner is *"Whoever next edits either file"* and
its step is *"the next chunk that touches either file's header comment"*. That is no
owner and no step, which `iteration-caps.md` calls a deletion. And §8's closing
sentence - *"None of the five residuals above is a remedy standing in for an
instrument - each names a real owner and a real, distinct instrument or decision
step"* - is false for this row.

Disposition: **(d) Delete R3** in the one revision, naming it withdrawn because both
comments are accurate; no enforcer was protecting it.

### M5 - The wave names no gate command, on a wave that adds a second and third test path
**Class: a hand-off that omits the one command its own evidence depended on. NEW.**

§6's pass condition names an object, two instruments and a direction of failure, but
no runner. The wave lands `src/app/actions/announcement-image.test.ts` (extended), a
new `src/app/actions/announcement-image.wiring.test.ts`, and should re-run
`src/lib/llm.test.ts` - three paths, against a documented hazard where a raw
`vitest run a b` silently drops unmatched paths and exits 0.

The scope used the wrapper correctly for its own single run, and I re-ran it this
pass to confirm the quantity: `npm run test:paths -- src/lib/llm.test.ts` →
`Test Files 1 passed (1)`, `Tests 68 passed (68)`, and the wrapper's own
`COVERED src/lib/llm.test.ts files=1 passed=68`. So the omission is in the hand-off,
not in its own measurement. Disposition: **fixable in the one revision** - state
`npm run test:paths -- <the three paths>` as the wave's gate, plus
`npx tsc --noEmit --incremental false`.

---

## Minors

**m1 - the canary precedent cited for instrument (a) is a tautology.** §5(a) cites
*"its own canary at `:224` proving the walk cannot silently return `[]`"*. Measured:
`no-emojis.test.ts:224` is a `describe(...)` header and the only `it` inside it is
`expect(true).toBe(true);` at `:230`, whose own comment says the real assertion
*"lives in the real-scan describe block below"*. The real floor is
`expect(allFiles.length).toBeGreaterThan(500)` at **`:275`**
(`grep -n "toBeGreaterThan\|allFiles.length" src/lib/no-emojis.test.ts`). This
matters beyond the citation: instrument (a)'s own floor is `toBeGreaterThan(0)`,
which - with the definition site counted (B2) - is satisfied by a walk that reached
only `src/lib` and missed all of `src/app`. The precedent it claims to imitate uses
a >500 floor for exactly that reason.

**m2 - both G4 line counts are wrong by one, in the direction of the known
off-by-one instrument.** §0 states `docs/g4-scope.md` and `docs/g4-check.md` are each
*"717 lines by `wc -l`"*. Measured: `wc -l docs/g4-scope.md docs/g4-check.md` → **716**
and **716**; `@(Get-Content <f>).Count` → **716** and **716**. Both tools agree, so
717 came from neither - it is the `content.split("\n").length` off-by-one
`traps-spec.md` names. (The commits are right: `935ffa6` and `19d5d0c`.)

**m3 - two §2 citations drift by two lines.** `commitPost` begins at
`useTakeAnnouncement.ts:741`, not `:743`; the `image` ternary is `:751-759`, not
`:753-761` (`sed -n '735,775p' src/app/components/recording/useTakeAnnouncement.ts`).
The trace itself is correct, including the point that every non-`"ready"` state
resolves to `undefined`.

**m4 - the "Deliberately NOT shared" doc comment is at `llm.ts:610-619`**
(`grep -n "Deliberately" src/lib/llm.ts` → `611`), not `:596-618` as cited - that
range begins inside the preceding `GEMINI_INTERACTIONS_URL` comment block. The
`:646-648` citation is exact (`grep -n "shared here because" src/lib/llm.ts` → 647).

**m5 - the corrected claim is the orchestrator's, not G4's.** §3's callout attributes
*"the image path calls the same shared function"* to *"G4's R6 disposition"*. Measured:
`docs/g4-check.md:667-677` (the R6 terminating question) does not contain that phrase;
it appears in the **G4 row of `docs/BACKLOG.md:95`**, in the orchestrator's RULING 78
note. The correction itself is right and I verified it independently:
`postGenerateContent` at `llm.ts:454` and `postInteraction` at `llm.ts:620` are two
functions with two independent `isAbortError` guards at `:478` and `:645`
(`grep -n "isAbortError" src/lib/llm.ts` → 420, 478, 645).

**m6 - the fake-timer claim is TRUE, but the scope's evidence does not establish it.**
§4 rests it on `bounded-race.ts:20-24`'s own doc comment plus
`fetch.test.ts:585,589-591` using real waits. A comment is not a measurement, and
short real waits are consistent with the claim without proving it. I measured it
directly, outside the repo: with `globalThis.setTimeout` replaced by a no-op (the
mechanism a fake-timer install uses), `AbortSignal.timeout(20)` still fired on
node **v22.14.0** - so it does not route through the global the facility replaces,
and fake timers cannot drive it. **Claim holds on this runtime.** Recorded as a minor
only because the conclusion is right; the instrument was a doc comment.

**m7 - §4 re-opens RULING 77 without saying so.** RULING 77 adopted
`TOTAL_BUDGET_MS = 50_000` / `MODEL_WAIT_RESERVE_MS = 2_000` as the number for the
shape G4 §6 generalizes (`docs/g4-scope.md:211`, `:610`, `:633`). §4 asks the owner to
choose between that and 8_000 for a caller of that same generalized shape.
Legitimate to raise - the ceiling really is unmeasured here - but it is a request to
**narrow an accepted ruling**, and the document does not say so. Relatedly, the OC5
row it cites (`docs/a29-architecture.md:285`) itself records *"**The design does not
depend on the answer** (section 2.1)"*, which the scope quotes while building a fork
that does.

**m8 - live-sibling name.** §6 and the closing section name `docs/r4-check.md`; the
live sibling in this round is `docs/r4-scope.md`. No file overlap either way, and the
disjointness conclusion is unaffected.

---

## What holds, stated once each and not padded

- **§0's re-measurement of the row: exact.** Re-run this pass:
  `grep -rl "generateGeminiImage" src --include=*.ts --include=*.tsx` → **7** files,
  the same seven listed; canary
  `grep -rl "generateGeminiImageZZZNONEXISTENT" src --include=*.ts --include=*.tsx`
  → empty, **exit 1** read from the command, same filter;
  `grep -n "export async function generateGeminiImage" src/lib/llm.ts` → **`:790`**
  (the row's `:757` is drift, as the scope says); `wc -l src/lib/llm.ts` → **821**,
  `@(Get-Content).Count` → **821**; `announcement-image.ts:38` is the doc-comment
  `callLlm`, with no executable call in the file.

- **"Zero unattended callers": HOLDS, and it survives a deliberately widened
  filter.** I did not reuse the scope's two-directory, name-based grep. Measured this
  pass: `postInteraction` has exactly **one** caller
  (`grep -rn "postInteraction" src --include=*.ts --include=*.tsx` → definition
  `llm.ts:620`, call `llm.ts:800`, two test comments) - so the transport has a single
  entry point and cannot be reached by another export. The whole-`src` reference set
  for `generateAnnouncementImageAction|generateGeminiImage|announcement-image` is
  **17** files, none under `src/lib/workflows` or `src/app/api`.
  **No re-export barrel:** `src/app/actions/index.ts` does not exist, and the real
  barrel `src/app/actions.ts` (77 lines) does not re-export it
  (`grep -n "announcement-image\|announcementImage" src/app/actions.ts` → exit 1) -
  which is what a workflow step importing `from "@/app/actions"` would have needed.
  **No dynamic import** reaches it (`grep -rn "await import(" src ... | grep -i announcement`
  returns only `jszip`, prompt-test spies and two fixture strings). **No GitHub
  Actions workflow:** `.github` mentions "image" only as `ubuntu-latest runner image`
  (`sweep-orphan-uploads.yml:69`, `unattended-runs.yml:81`). And the one workflow step
  that does generate images sources them from Unsplash, not Gemini
  (`steps.deliverable-images.ts:34`). The claim is sound.

- **The transport separation and the abort-terminal fix in BOTH: HOLDS.** Two separate
  functions, two independent guards (m5). The cited test does exercise the **image**
  transport - `llm.test.ts:897-907` calls the real `generateGeminiImage`, which reaches
  `postInteraction` at `llm.ts:800` - and the citation range is exact to the line.
  **It would go RED if `:645`'s guard were removed:** the abort would fall into the
  transient branch and retry to `MAX_ATTEMPTS = 5` (`llm.ts:396`) over real
  `sleep`s of 600 / 1200 / 2400 / 4800 ms plus jitter (`llm.ts:397-398`, `backoffDelay`
  at `:435-440`), and that test installs no fake timers - so it fails either on
  `toHaveBeenCalledTimes(1)` against 5 or on vitest's own per-test timeout. **I did not
  mutate the file**; this is derived from the code plus the confirmed green run, per the
  brief's no-mutation constraint.

- **Reachability and attendedness: HOLDS, every hop opened.** `src/app/page.tsx:1`
  `"use client";`; `page.tsx:627` `<RecordingTab ... />`;
  `src/app/components/RecordingTab.tsx:813` `<TakeAnnouncementPanel` (the scope gives
  the filename without the directory - it is `src/app/components/`, not
  `src/app/components/recording/`); `TakeAnnouncementPanel.tsx:538`
  `{imageState === "generating" && (` with `role="status" aria-live="polite"`;
  `grep -n maxDuration src/app/page.tsx` → **exit 1**, read from the command, not
  through a pipe. Note the rendering half is a **reading claim** - nothing here renders
  a component.

- **Wave sizing and the calling file: HOLDS.** No new export is created (the wrapper
  is imported from `bounded-race.ts`), so there is no caller file to add;
  `announcement-image.ts` is both the changed file and the calling file. `src/lib/llm.ts`
  (821) and `src/lib/llm.test.ts` (917) are untouched - the wave adds zero lines to
  either, so neither approaches 1000. Touched-file sizes re-measured with
  `@(Get-Content).Count`: `announcement-image.ts` **68**, `announcement-image.test.ts`
  **113**, `announcementImagePipeline.ts` **126**. The naming precedent exists at
  `src/app/components/canvas-tab/announcements-panel.wiring.test.ts`, **410** lines by
  `wc -l` - the scope gave the name without the path, and it is not in the
  walkthrough-announcement directory its neighbouring citations point at.

- **No leverage claim owed: HOLDS.** A reliability bug fix, correctly ruled out under
  `DEV_LOOP.md:101-108`, with the existing feature's own claim correctly assigned to the
  chunk that built it.

---

## The weakest requirement

**§5(b)'s "assert the returned `{ error: string }` matches the wrapper's own timeout
wording at exactly that simulated tick."** Implemented exactly as written it is a
tautology on both halves: the implementer reads the wording off their own
implementation (§6 says only "matching `withDeadline`'s own wording style at
`fetch.ts:320`" - a style, not a frozen string), and the tick off a constant the MAX
clamp makes invariant (B3). It goes green while leaving both RULING 76's shape and the
`{kind:"timedout"}` → `{error}` translation unpinned. The repair is a frozen literal
oracle for the wording plus two differing preamble elapsed times for the tick.

## The silent-green path, named concretely

Build Wave G5-A exactly as specified. `npm run lint`, `npx tsc --noEmit --incremental false`
and `next build` pass - nothing in them reads a timeout. Instrument (a) goes RED on
`llm.ts:790` (B2); the implementer narrows the walk to `src/app/actions` to make it
green, which silently converts a whole-tree walker into an enumeration. Instrument (b)
passes against `raceWithTimeout(generateGeminiImage(prompt), 24_000)` (B3). Result:
green lint, green tsc, green build, green vitest, green structure tests - with **no
elapsed-aware budget, a walker that cannot see a new caller outside one directory, an
`isAbortError` guard still permanently inert (M3), and the harm still open for any
platform ceiling below 24 s.** Every gate in the artifact is satisfied and the row
delivered nothing.

## Multi-path test hazard

Checked explicitly, per the brief. The scope's own single run correctly used
`npm run test:paths --` (verified by re-running it). **No gate or instrument in the
artifact runs two or more paths through a raw `vitest`.** The defect is the opposite
one - the wave names no runner at all for the three paths it produces (M5).

---

## What is dispatchable, and what is not

**Dispatchable as it stands, no revision needed:** §0 (row re-measurement), §1 (the
call graph and attendedness, with B1's proof corrected but its conclusion intact), §7
(leverage), and the mechanism half of §6 - record `startedAtMs` at entry before
`requireOwner()`, wrap the model call, translate `{kind:"timedout"}` into the existing
`{error: string}` shape, leave `llm.ts` and `llm.test.ts` untouched.

**Not dispatchable until the one revision lands:** the wave itself. B2 makes its new
test unbuildable as written and B3 means its green proves nothing about the shape the
row exists to install, so dispatching now spends an implementer on a wave whose gates
cannot fail on its own purpose.

**Fixable in the one revision:** B1, B2, M1, M3, M4, M5, and every minor.

**Relocate (disposal (a)):** B3, to `loop-test-author`. Obligation carried: specify an
instrument that observes the elapsed-aware dependence - at minimum two preamble
elapsed times producing two different emitted waits - plus a frozen literal oracle for
the timeout wording.

**Owner decision:** B4 and M2, as one question below.

**Stopping point: design.** Not measurement - everything measurable here I measured,
including the two claims the brief flagged as version-dependent and filter-dependent,
and both of those held. Not rulings - RULING 75 and RULING 76 are untouched and
uncontradicted by this artifact, and nothing here lands on an orchestrator ruling
except m7's unstated narrowing of RULING 77, which the question below absorbs. What
remains is where the bound is placed, which is a design fork the loop cannot settle
from the code because it turns on OC5.

---

## The question for the owner, shaped so every answer ends the activity

> **G5's bound can sit in one of two places, and they close different halves of the
> same harm. Pick one; the wave ships as it stands with that applied.**
>
> **(A) Inside the Server Action** (what the scope plans). The action itself returns a
> worded `{error}` - but only if the emitted wait beats the platform's unconfigured
> Server Action ceiling, which is OC5 and still unmeasured. The emitted wait is
> **24_000 ms**, not the 50_000 the scope discusses: the constants it adopts from
> `class-trends-insight/route.ts:47-51` are clamped by `MODEL_WAIT_MAX_MS = 24_000`
> (`route.ts:144`). So (A) protects any ceiling above ~24 s and buys nothing below it.
>
> **(B) At the client caller** (`announcementImagePipeline.ts:69`), which is where both
> of the `raceWithTimeout` precedents the scope cites actually live - both are
> `"use client"` components. The instructor always sees a worded timeout state
> regardless of OC5, and the bound is testable in a plain node test with no component
> rendered. The action itself still returns nothing on a kill.
>
> **(C) Both** - one extra wrapped call and one extra node-testable assertion.
>
> **Every answer terminates.** If (A), the constants are RULING 77's as already ruled
> and §4's X/Y fork is **withdrawn as already settled**, with the emitted 24_000 stated
> explicitly - no second question. If (B) or (C), the constant stops depending on OC5
> at all and the fork is moot on its own terms. In every case OC5 stays exactly as open
> as G4 left it, recorded as a residual with the repo owner and the Vercel project
> settings page as its instrument, and nothing else in the scope is reopened.

**Cost of being wrong:** (A) alone, if the real ceiling is the 10 s figure Vercel's
public docs cite for an unconfigured Hobby function, leaves the row's harm entirely
open while every gate is green - the exact failure it exists to prevent. (B) alone
leaves the action returning nothing on a kill, so any future non-browser caller of the
action inherits the unbounded call. (C) costs one extra wrapped call and one test.
**My recommendation: (C)** - it is the only one whose correctness does not depend on an
unmeasured number, and its extra cost is a single `raceWithTimeout` call in a file that
is already node-testable.

---

## Tree state at the end of this pass

```
git status --short
```

Run after this document was written, not copied from the session's opening snapshot:

```
 M docs/css-orphans.md
 M src/app/actions/action-guard-coverage.test.ts
 M src/app/actions/deck-source.ts
 M src/app/actions/github.ts
?? docs/a44-waves-check.md
?? docs/g5-check.md
?? src/app/actions/deck-source.test.ts
?? src/app/actions/github.test.ts
```

**`?? docs/g5-check.md` is this pass's only entry.** Every other line is
sibling-owned and none was opened, read or written here:
` M docs/css-orphans.md` was already present in this session's opening
`git status` snapshot before this pass started; `?? docs/a44-waves-check.md` is the
live sibling named in this round's brief; and the four `src/app/actions/*` entries
(`action-guard-coverage.test.ts`, `deck-source.ts`, `github.ts`, plus the two new
`.test.ts` files) appeared during this pass, after the reads above and after
`npm run test:paths -- src/lib/llm.test.ts`, so they belong to a concurrent
implementer and not to this check. None of them intersects Wave G5-A's write set,
and none was read by this document - in particular
`src/app/actions/announcement-image.ts` and `announcement-image.test.ts`, the two
files this check's findings cite, are **not** modified in the tree.
No `git stash`, no `git add -A`, no `git checkout --` was run on any path. No
file under `src/` was written or mutated, and no scratch file was created inside the
repo - the one probe this pass ran
(`abortsignal-faketimer-probe.mjs`, m6) lives in this session's scratchpad outside
the tree, which is why nothing from it appears above. The two live siblings named in
the brief, `docs/r4-scope.md` and `docs/a44-waves-check.md`, were not opened or
referenced. `docs/backlog.yml` was not read or touched; every backlog citation went
through `grep -a -n "G5" docs/BACKLOG.md`. The one test command run this pass,
`npm run test:paths -- src/lib/llm.test.ts`, executed existing tests only and
mutated no file.
