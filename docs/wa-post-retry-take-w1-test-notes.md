# WA-POST-RETRY-TAKE W1 - TDD test notes

Seat: `loop-test-author` (Opus). Consumer: a `loop-implementer` writes the leaf,
the hook hunks and the new test file FROM these notes; a fresh `loop-checker`
attacks these notes first. Source of truth for the fix shape:
`docs/wa-post-retry-take-scope.md` (SHIP-checked, read in full).

This document decides WHAT IS MEASURED and HOW IT FAILS. It writes no production
or test code. It is the openable artifact the checker and implementer gate on.

## 0. Grounding - every quantity names its command, every anchor was opened

- Repo state when measured: `git status` top of session shows the scope and
  these notes untracked; `src` tree unmodified from the scope's HEAD. Line
  counts measured THIS round with PowerShell `@(Get-Content <f>).Count`:
  - `src/app/components/recording/useTakeAnnouncement.ts` = **966**
  - `src/app/components/recording/takeAnnouncementArming.ts` = **34**
  - `src/app/components/recording/recording-split.structure.test.ts` = 618
  - `src/app/components/RecordingTab.tsx` = 900
- Anchors opened this round (not recalled):
  - `useTakeAnnouncement.ts:355` `const [armedFor, setArmedFor] = useState<string | null>(null);`
  - `useTakeAnnouncement.ts:50` imports `isConfirmArmed, mayPostCommit` from `../content-tab/modules/postConfirmArming`; `:51` imports `takePostArmSignature` from `./takeAnnouncementArming`.
  - `useTakeAnnouncement.ts:729-732` `backToReviewAfterPostFailure` = `setPostError(null); setStage({ phase: "review" });` (H4 target).
  - `useTakeAnnouncement.ts:736-740` `currentArmSignature`/`armed` composition.
  - `useTakeAnnouncement.ts:769-833` `async function commitPost()`; bare `await createAnnouncementAction(...)` `:788`; `setPosting(false)` `:796`; returned-error exit `:797-807` (copy `:798`, NO `setArmedFor`); success disarm `setArmedFor(null)` `:812`; `runTakeDraftPostCleanup(` `:821`.
  - `takeAnnouncementArming.ts:28-34` `takePostArmSignature` only; imports only `postConfirmArming` (`:26`). 34 lines, room for the new leaf.
  - `postConfirmArming.ts:94-96` `mayPostCommit`; `confirmArming.ts:26-28` `isConfirmArmed`.
  - `TakeAnnouncementPanel.tsx:623-627` review view renders `{postError && <div role="alert" ...>{postError}</div>}` directly above the ConfirmArmButtons (`:629-643`) and the armed notice (`:597-621`). CONFIRMS H4 needs NO Panel edit.
  - Mirrored precedent `bb060dd4`: refusal copy `useWalkthroughGenerationAdapters.ts:91` = `Canvas did not confirm the announcement - ${result.error}. Check the course's announcements in Canvas before posting again.`; transport copy `useAnnouncementDraftSlots.ts:208-209` `POST_TRANSPORT_FAILURE_MESSAGE`. The walkthrough COLLAPSES a rejection into `{ error: POST_TRANSPORT_FAILURE_MESSAGE }` (`:468`); the take path does NOT (see section 2, OBS 1).
- Reference proof RUN this round: `node scratchpad/ref-proof.js` -> `16 passed, 0 failed`. It is a throwaway JS harness, not committed; what it proves is in section 6.

Nothing renders under vitest (node-env, collects only `src/**/*.test.ts`); there
is no live Canvas and no network (`vitest.setup.ts` throws on real `fetch`). So
every rendered-behaviour claim is an owner walk (section 7, R-2).

## 1. The fix this wave builds (scope shape (a), one wave)

- **H1** clear the arm on EVERY failure exit of `commitPost` via the leaf's typed
  return (`setArmedFor(<outcome>.armedFor)`, value `null`), before the failure `return`.
- **H2** honest failure copy (no "Nothing was posted."), produced by the leaf.
- **H3** (fork, recommended INCLUDE) wrap the bare `await createAnnouncementAction`
  so a transport REJECTION takes the SAME failure exit: `setPosting(false)` runs
  and `resolveTakePostFailure` produces the transport copy. Fixes stuck-spinner
  bug F-T1.
- **H4** (owner-confirmable, recommended INCLUDE) stop clearing `postError` in
  `backToReviewAfterPostFailure` (`:730`) so the honest alert stays visible beside
  the idle button. No Panel edit (alert already rendered at `:623-627`).
- **THE PURE LEAF** `resolveTakePostFailure(failure)` in `takeAnnouncementArming.ts`.

## 2. The leaf's union-input design (explicit, per OBS 1)

```
export type TakePostFailure = { error: string } | { transport: true };

export function resolveTakePostFailure(
  failure: TakePostFailure
): { message: string; armedFor: null } {
  if ("transport" in failure) {
    return {
      message:
        "Could not reach the server - the post may or may not have gone " +
        "through. Check the course's announcements in Canvas before posting " +
        "again.",
      armedFor: null,
    };
  }
  return {
    message:
      `Canvas did not confirm the announcement - ${failure.error}. ` +
      "Check the course's announcements in Canvas before posting again.",
    armedFor: null,
  };
}
```

Design decisions, each with its reason:

- **Return TYPE is `armedFor: null`, not `armedFor: string | null`.** A non-null
  arm is UNREPRESENTABLE - a mutant that returns the signature fails `tsc`, not
  just a runtime assertion. This is the construction that makes the bug class
  impossible by type, not by denylist.
- **Input is a discriminated union `{ error: string } | { transport: true }`**,
  NOT the walkthrough's collapse-to-`{error}`. This is deliberate and is WHY
  OBS 1 is load-bearing: the hook's existing failure branch is
  `if ("error" in result)` (`:797`), and `"error" in { transport: true }` is
  `false`, so a `{transport:true}` value would FALL THROUGH to the success path.
  The implementer MUST broaden the branch to route both shapes (section 4, H3).
- **Two distinct messages owned by the leaf** (refusal vs transport) so the
  "may or may not have gone through" wording exists only on the transport class
  and the Canvas error text is preserved verbatim on the refusal class.
- **Copy is defined IN the leaf, not imported.** Do NOT import
  `POST_TRANSPORT_FAILURE_MESSAGE` from the walkthrough hook - that couples
  `recording/` to a walkthrough module for one string (scope section 5). The
  leaf is the right home: the hook is 966/1000 lines and imports `../../actions`
  (network-blocked under vitest, `:27-34`); the leaf imports only
  `postConfirmArming`, so a test can import it with no server action pulled in.
- **Copy stays plain ASCII** (hyphen-minus, no em-dash, no ellipsis char) so
  `source-bytes.structure.test.ts` and `no-emojis.test.ts` cannot trip.

The discriminant in the leaf is `"transport" in failure`. `"transport" in
{ error }` is `false`; `"error" in { transport: true }` is `false` - clean both
ways.

## 3. New test file

- Path: `src/app/components/recording/useTakeAnnouncement.retry-take.test.ts`
  (own file; name avoids any `ta-` token, any `stripComments` mention, any
  `.test`-helper import).
- Fixtures are HAND-WRITTEN literals (section 5), never derived from the code
  under test.
- The comment-strip helper is DUPLICATED into this file (never imported from
  another `*.test.ts` - that re-runs its describe blocks). Name it
  `withoutLineComments`; use the CRLF-safe UNANCHORED form the drafts-loop test
  already uses (`.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n\r]*/g, "")`).
  Do NOT use the anchored `/^[ \t]*\/\/.*$/gm` form (trailing-comment-blind).
  Do NOT name the helper `stripComments` or mention that literal anywhere - it
  reddens the repo via `src/tools/strip-comments-agreement.structure.test.ts`.
- Mock NOTHING the leaf does not need. AC-1/AC-2/AC-3 import real pure modules
  (`takeAnnouncementArming`, `postConfirmArming`); AC-4/AC-5/AC-8 read source
  text with `fs.readFileSync`. No `canvasFetch`/`fetch` touches this wave; if a
  future variant drives a Canvas path, mock `canvasFetch`, never `fetch`.

## 4. Acceptance criteria - object, instrument, direction, sabotage

Honest split first. **EXECUTABLE:** AC-1, AC-2, AC-3 (import and call the real
leaf + the real arming functions). **READ-LEVEL (source-text wiring):** AC-4,
AC-5, AC-8 - because `commitPost`/`backToReviewAfterPostFailure` are impure
closures vitest cannot call (no jsdom, no hook render, actions network-blocked).
A verifier MUST NOT report AC-4/AC-5/AC-8 as behaviour. AC-6, AC-7 are
suite/canary state.

### AC-1 - the failure outcome carries no arm (EXECUTABLE)
- Object: `resolveTakePostFailure(x).armedFor` for the three fixture inputs.
- Instrument: direct import of the leaf; executed.
- Direction: RED if any of the three returns a non-null `armedFor` or omits the field.
- Sabotage **M2**: leaf returns a non-null arm. Discriminates (RED). Also fails
  `tsc` (TS2322) by the return type - report BOTH kills.
- NOTE (division of labour, proven): AC-1 does NOT catch M3 (copy-only mutant),
  because M3 leaves the arm null. That is correct, not a gap - M3 is AC-2's job.
  A single AC that claimed to catch both would be the over-claiming instrument
  this seat exists to prevent.

### AC-2 - copy is honest and class-correct (EXECUTABLE)
- Object: `resolveTakePostFailure(x).message` for the three fixtures.
- Instrument: direct import; regexes. Pins FACTS, not spelling (except the error
  substring, where the spelling IS the fact).
- Pass conditions (each a separate `expect`):
  1. No message matches `/nothing was posted/i`.
  2. Every message matches `/check/i` AND `/Canvas/`.
  3. The `{ transport: true }` message matches `/may or may not/i`.
  4. The two `{ error }` messages do NOT match `/may or may not/i` (discriminates
     transport from refusal - without this an all-transport leaf passes).
  5. Each `{ error }` message contains its supplied `error` text verbatim
     (`.includes(error)`) - the error is not swallowed.
- Direction: RED if copy regains "Nothing was posted.", drops the check-Canvas
  direction, loses the transport "may or may not" wording, or swallows the error.
- Sabotage **M3**: revert refusal copy to "Nothing was posted." Discriminates (RED).

### AC-3 - a retry is not trapped; re-arming still commits (EXECUTABLE, real arming fns)
- Object: the pair `isConfirmArmed` (`confirmArming.ts:26-28`) and `mayPostCommit`
  (`postConfirmArming.ts:94-96`), driven by the leaf's outcome and the hook's own
  signature composition.
- Instrument: executed over the REAL functions the hook uses, with
  `sig = JSON.stringify([takePostArmSignature("take-1","course-1","ACME"),"s","b"])`
  (the hook's composition, `:736-739`).
- Pass conditions:
  1. `isConfirmArmed(resolveTakePostFailure({error:"x"}).armedFor, sig) === false`
     (after a failure, the next click ARMS - it does not commit).
  2. With `armedFor = sig`: `isConfirmArmed(sig, sig) === true` AND
     `mayPostCommit(null, false, true) === true` (a fresh arm-then-confirm still
     commits - the retry is not blocked).
- Direction: RED if the outcome arm still matches the signature (bug: one-click
  re-post survives), OR if arming can no longer reach a committable state (trap).
- Sabotage **M2** (modelled as the hook re-arming with `sig`): condition 1
  becomes `true`, so AC-3 RED. Discriminates.
- NOTE: this models the two-click flow, not a rendered click. No `mayPostCommit`
  term is added (scope section 1.2): a genuine outage retry must stay possible.

### AC-4 - the hook applies the leaf on the failure exit (READ-LEVEL wiring)
- Object: the comment-stripped, brace-delimited body of `async function
  commitPost()` (same `withoutLineComments` + `bodySlice` idiom as
  `useTakeAnnouncement.drafts-loop.wiring.test.ts:17-36`; anchor
  `/async function commitPost\(\)\s*\{/`).
- Instrument: raw `fs.readFileSync`; regex + index ordering.
- Pass conditions (all required):
  1. body matches `/resolveTakePostFailure\(/` (the leaf is called).
  2. body matches `/setArmedFor\(\s*[^)]*\.armedFor\s*\)/` - the failure-exit
     disarm passes the LEAF's own `.armedFor` through (NOT a hardcoded `null`,
     NOT the signature).
  3. body matches `/\w+\.message\b/` - the displayed message derives from the
     leaf's result (no pre-existing `.message` exists in this body; current body
     uses `.error`/`.imageError` only).
  4. body still matches `/setArmedFor\(\s*null\s*\)/` (the success disarm `:812`
     is preserved).
  5. ORDERING: the index of the `.armedFor` disarm is less than the index of
     `runTakeDraftPostCleanup(` - proving it sits on the pre-cleanup failure
     path, not after it.
- Direction: RED if the failure exit no longer disarms via the leaf.
- **REQUIRED CONSTRUCTION for the implementer (so this pin is honest, not
  contorted):** bind the leaf result to a name and pass `<name>.armedFor` /
  `<name>.message` - e.g. `const outcome = resolveTakePostFailure(result);
  setArmedFor(outcome.armedFor); setPostError(outcome.message);
  setStage({ phase: "failed", stage: "post", message: outcome.message });`. Do
  NOT destructure the arm into a bare `armedFor` variable - condition 2 pins the
  `.armedFor` property access on purpose (section 4.1 says why). This is the one
  prescribed spelling in these notes; it is the wiring fact, the frozen-copy
  analogue.
- **WEAKNESS, STATED:** text, not behaviour. AC-1/AC-3 prove the leaf; AC-4
  proves only that the hook CALLS it. The fully-executable alternative is R-3
  (deps-injected `runTakePost`); not built this wave.

### AC-4.1 - the SILENT-GREEN sabotage, named and proven
The check named the exact risk: the implementer builds the leaf correctly
(AC-1 green) yet forgets to WIRE it, re-arming with the signature on the failure
exit. Sabotage **M-wire**: replace `setArmedFor(outcome.armedFor)` with
`setArmedFor(currentArmSignature)` on the failure exit.
- AC-1 stays GREEN (the leaf is untouched) - which is exactly why AC-4 must
  exist.
- AC-4 goes RED: condition 2's `/setArmedFor\([^)]*\.armedFor\)/` finds no match
  (the only `setArmedFor` now carries the signature, not `.armedFor`).
- PROVEN this round: `ac4(MWIRE_COMMITPOST) -> RED` in the reference harness.
- This is the load-bearing reason AC-4 pins `.armedFor` rather than merely
  "a `setArmedFor` exists". A mere-existence pin would stay green on M-wire.

### AC-5 - the rejection takes the same exit (READ-LEVEL wiring; only if H3 accepted)
- Object: the same `commitPost` body slice.
- Pass conditions:
  1. the `createAnnouncementAction(` call is guarded - body matches
     `/createAnnouncementAction\([\s\S]*?\)\s*\.catch\(/` OR body has both
     `/try\s*\{/` and `/catch\s*\(/` around the call.
  2. body matches `/transport/` (the tag is constructed).
  3. body matches `/"transport"\s+in\s+\w+/` - the failure branch condition is
     broadened to route the transport shape (OBS 1: `"error" in result` alone
     does not catch `{transport:true}`).
  4. body matches `/resolveTakePostFailure\(/` (the routed value reaches the leaf).
- Direction: RED if the call is bare again (no catch) or the transport shape is
  not routed through the leaf.
- **REQUIRED CONSTRUCTION:** the scope-recommended shape -
  `const result = await createAnnouncementAction(...).catch(() => ({ transport:
  true as const })); ... if ("error" in result || "transport" in result) {
  const outcome = resolveTakePostFailure(result); ... }`. This is prescribed so
  condition 3's routing pin is honest; a try/catch that calls the leaf directly
  in the catch block would wrongly RED condition 3, so use the `.catch` +
  broadened-`if` form.
- Sabotage **M4**: remove the `.catch` and narrow the condition back to
  `"error" in result`. Discriminates (RED). PROVEN: `ac5(M4_COMMITPOST) -> RED`.
- If the owner picks "separate" (defer H3): DELETE AC-5 and the
  `{ transport: true }` cases from AC-1/AC-2; nothing else moves. The leaf's
  union still type-checks with the transport arm unused, but prefer dropping the
  transport branch too so no dead branch ships.

### AC-6 - nothing removed or weakened (EXECUTABLE + diff)
- Object: existing suites run UNEDITED -
  `takeAnnouncementArming.test.ts`, `postConfirmArming.test.ts`,
  `confirmArming.test.ts`, `useTakeAnnouncement.drafts-loop.wiring.test.ts`,
  `useTakeAnnouncement.draft-finalize.wiring.test.ts`,
  `useTakeAnnouncement.image-copy-safety.test.ts`.
- Instrument: the gate wrapper (green) + `git diff --name-only` showing
  `postConfirmArming.ts`, `confirmArming.ts`, `ConfirmArmButtons.tsx`,
  `TakeAnnouncementPanel.tsx` and all the above `*.test.ts` ABSENT.
- Direction: RED on any edit to them. `takeAnnouncementArming.test.ts` tests
  `takePostArmSignature` only; the new function's tests live in the NEW file.

### AC-7 - no canary moved (EXECUTABLE)
- Object: the canaries in section 5.1.
- Instrument: the gate wrapper; plus the hook size by
  `@(Get-Content src/app/components/recording/useTakeAnnouncement.ts).Count`.
- Pass: all canaries green unedited; hook count `<= 1000` (verifier records the
  actual number). Direction: RED on any tripped canary or a hook over 1000.

### AC-8 - the honest copy survives "Back to review" (READ-LEVEL; only if H4 accepted)
- Object: the brace-delimited body of `function backToReviewAfterPostFailure()`
  (anchor `/function backToReviewAfterPostFailure\(\)\s*\{/`).
- Instrument: raw read.
- Pass: body does NOT match `/setPostError\(/`.
- Direction: RED if it clears the error again. Negative pin - a fact about a
  deleted call, not a spelling.
- Sabotage **M5**: re-insert `setPostError(null);`. Discriminates (RED). PROVEN:
  `ac8(M5_BACK) -> RED`.
- The RENDERED persistence (alert visible above the idle button after Back to
  review) is NOT verifiable here - owner walk, R-2. AC-8 proves only the source
  no longer clears the error.

## 4.1 Why AC-4 pins `.armedFor` and not just "a setArmedFor exists"

The repo memory warns source-text tests over-specify. Against that: a
mere-existence pin (`/setArmedFor\(/`) stays GREEN on M-wire (which still calls
`setArmedFor`, just with the wrong value) and on a hardcoded
`setArmedFor(null)` that leaves the leaf as dead code. Both are the exact
failure this wave exists to prevent. Pinning the `.armedFor` property access on
the leaf's result is the minimum that discriminates M-wire while still accepting
the natural `const outcome = ...; setArmedFor(outcome.armedFor)` style. The cost
is one prescribed binding shape, documented above, which is not contorted.

## 5. Fixtures (hand-written literals)

```
const INPUTS = [
  { error: "Canvas refused access" },
  { error: "Canvas did not respond." },
  { transport: true },
];
const sig = JSON.stringify([takePostArmSignature("take-1", "course-1", "ACME"), "s", "b"]);
```

Rationale: the two `{ error }` strings are a clean refusal and the exact
class-C "ambiguous" literal from `canvas-fetch-response.ts:137`; `{ transport:
true }` is the H3 shape. The signature uses the same composition the hook uses
at `:736-739`, built from the real `takePostArmSignature`.

## 5.1 Canary discipline (all measured by opening the cited file this round)

| Canary | Tripped by this wave? |
|---|---|
| `recording-split.structure.test.ts:76-92` "all recording/*.ts/*.tsx under 1000" (dir scan, INCLUDES new files) | NOT if the hook stays < 1000. 966 + H1..H4 (est. +4 to +10) = <= 976. MEASURE after; if > 990, extract, never raise the ceiling. The NEW test file is also scanned - keep it well under 1000. |
| `recording-split.structure.test.ts:360-435` `ta-rec-*` exact-set (scans non-`.test.ts` recording files -> includes the LEAF) | NOT tripped: the leaf's new copy contains no `ta-rec-` token. The NEW test file is a `.test.ts`, EXCLUDED from that scan (`:297`). |
| `recording-split.structure.test.ts:141-147` `toHaveLength(9)` strip count | NOT touched (no RecordingTab strip change). |
| `recording-split.structure.test.ts:57-61` drafts-loop... (see below) | STAYS GREEN UNEDITED; does NOT guard this wave. |
| `file-size-ceiling.structure.test.ts` repo-wide 1000 | NOT tripped (same hook-size condition). |
| `componentStorageKeys.structure.test.ts` directory-wide `ta-` scan | **Correction to scope section 7:** this scan is NON-RECURSIVE (`src/app/components/` top-level files only, `:101-108`). `recording/` is a subdirectory, so NEITHER the leaf NOR the new test file is scanned by it. It stays green trivially and polices nothing this wave touches. Kept in the gate only as a safety net. The real key canary for this wave is `recording-split`'s `ta-rec-*` scan above. |
| `strip-comments-agreement.structure.test.ts` | NOT tripped: the new test names its helper `withoutLineComments`, never the enumerated literal. |
| `no-emojis.test.ts` (scans `src` and `docs`, incl. `.md`) | NOT tripped: this doc and all new copy are emoji-free ASCII. |
| `source-bytes.structure.test.ts` | NOT tripped: new copy is plain ASCII, no control bytes, no BOM. |

**The drafts-loop wiring test (`useTakeAnnouncement.drafts-loop.wiring.test.ts:57-61`)
stays GREEN unedited and does NOT guard this wave.** Its `commitPostBody.indexOf
("return;")` resolves to the FIRST `return;`, which is `if (!selectedCourse)
return;` at `:770`, NOT the failure return at `:806` (confirmed by opening both).
The H1..H4 edits leave `:770` in place and keep `runTakeDraftPostCleanup(` after
it, so `:60` stays green - but it pins NOTHING about the failure exit, so do not
rely on it as a guard for this wave. Also: its `bodySlice` must still resolve
`/async function commitPost\(\)\s*\{/` and `/function saveDraft\(\)\s*\{/` - do
not rename or re-signature either function. The `.catch` + broadened-`if` H3
shape keeps the braces balanced, so `bodySlice` still terminates.

## 5.2 Gate command (wrapper, one path per argument)

Run after tsc/lint. `<NEW>` is `useTakeAnnouncement.retry-take.test.ts`.

```
npm run test:paths src/app/components/recording/useTakeAnnouncement.retry-take.test.ts src/app/components/recording/takeAnnouncementArming.test.ts src/app/components/recording/useTakeAnnouncement.drafts-loop.wiring.test.ts src/app/components/recording/useTakeAnnouncement.draft-finalize.wiring.test.ts src/app/components/recording/useTakeAnnouncement.image-copy-safety.test.ts src/app/components/recording/recording-split.structure.test.ts src/app/components/content-tab/modules/postConfirmArming.test.ts src/app/components/content-tab/modules/confirmArming.test.ts src/file-size-ceiling.structure.test.ts src/app/components/componentStorageKeys.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

(Every existing path above was confirmed present with `Test-Path`/`test -f` this
round.) Then `npx tsc --noEmit` (single caller; it races on
`tsconfig.tsbuildinfo`) and `npm run lint` (exit 0, no NEW warning in files this
wave writes, measured against the same command before the change). Gate the tree
with `git status --short` against exactly: `useTakeAnnouncement.ts`,
`takeAnnouncementArming.ts`, and the new test file (plus this doc).

Restore every sabotage by COPY-BACKUP, never `git checkout --` on an uncommitted
file (that reverts to the index and destroys the chunk's work). Only ONE agent
sabotage-verifies on the tree at a time (shared `tsconfig.tsbuildinfo`).

## 6. Reference proof - what was built and what it showed

A throwaway Node harness (`scratchpad/ref-proof.js`, NOT committed) implemented
the reference leaf and reference `commitPost`/`backToReviewAfterPostFailure`
bodies, copied the real pure arming functions, and ran every proposed instrument
against the honest implementation and against each named mutant. Result:
**16 passed, 0 failed.** Specifically proven:

- AC-1/AC-2/AC-3 are SATISFIABLE by a real leaf (all green on the reference).
- M2 reds AC-1 and AC-3; M3 reds AC-2; an all-transport leaf and an all-refusal
  leaf each red AC-2 (so AC-2 discriminates the two classes, not just the words).
- M1 (no failure disarm) and **M-wire (re-arm with the signature)** both red
  AC-4 - the silent-green risk is caught by the `.armedFor` pin.
- M4 reds AC-5; M5 reds AC-8.
- AC-1 stays GREEN on M3 (copy-only) - reported as correct division of labour,
  not a gap.

No mutant had to be rebuilt; none was red-in-both-directions or
green-in-both-directions. All five scope mutants (M1-M5) plus the M-wire
silent-green mutant discriminate as claimed.

## 7. Residual register

| # | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | Cross-reload / library-sourced take re-post and deliberate re-post after an ambiguous failure are NOT closed client-side (F-T3/F-T4). This wave must NOT be reported as closing re-publish. | repo owner (fail-open vs fail-closed; `WA-POST-DEDUP`) | `docs/BACKLOG.md:224` row; a live-Canvas duplicate-announcement test | when `WA-POST-DEDUP` is dispatched |
| R-2 | Rendered behaviour after a failed take post: idle "Post to Canvas" (not "Confirm post") after Back to review; the honest alert still visible above it (H4); first click only re-arms + re-shows the consequence notice; focus; Escape while loading. NONE renders under vitest. | repo owner | browser walk of a forced failure (revoke a token, or drop the network after confirm) | owner-walk row filed with the W1 ship; the verifier cites it UNVERIFIED, not passed |
| R-3 | The behavioural link from `commitPost` to the leaf is source-text only (AC-4/AC-5); nothing here executes `commitPost`. | orchestrator files; implementer builds when asked | a deps-injected `runTakePost(deps)` leaf (style of `runTakeDraftSave`/`runTakeDraftPostCleanup` in `src/lib/take-draft-lifecycle.ts`), executed with mocked setters and a mocked action. Not now: it moves a ~65-line impure function out of a hook with zero tests on it - more than a bug-fix wave should carry - but WOULD relieve the 966-line pressure. | a later extraction row, or when the hook next needs headroom |
| R-4 | A real `posted \| refused \| unknown` classifier at the action layer, so clean refusals could keep a one-click path and class C get exact copy (shape (a')). | orchestrator files if wanted | action-contract test over `createAnnouncementAction` with `canvasFetch`/`canvasRequest` mocked (never `fetch`) | only if (a') is chosen |
| R-5 | `handlePostButtonClick` has no `posting` guard; double-submit within one mount relies on MUI `loading` disabling the button. | orchestrator | read-through; if wanted, a pure `mayCommit` extension tested in the leaf | a later row; not a defect proven here |

## 8. Fork flags (proceed on the recommended reading; do not block)

- **H3 (rejection catch) - one-line owner-confirmable, recommended INCLUDE.**
  "Should this wave also make a dropped connection during a take-announcement
  post show a 'may or may not have posted, check Canvas' message instead of a
  permanent spinner (H3/AC-5), or ship the arm-clear alone and track the spinner
  separately?" EITHER answer ends the activity: if "separate", delete AC-5 and
  the `{transport:true}` fixture cases; H1/H2 stand alone.
- **H4 (persistent alert) - one-line owner-confirmable, recommended INCLUDE.**
  "Keep the honest failure alert visible beside the idle button after Back to
  review (stop clearing `postError` at `:730`, AC-8), or let it live only in the
  failed-stage alert?" If declined, delete AC-8; H1/H2/H3 stand alone.

Both are proceeded on as INCLUDE per the scope's recommendation; these flags are
not gates.
