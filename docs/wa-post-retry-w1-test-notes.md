# WA-POST-RETRY W1 test notes (TDD notes, test-author seat)

Consumer: one `loop-implementer` writes the test code and the fix from these
notes; a fresh `loop-checker` reads this file first. I wrote no production and
no test code - this `.md` is the only file I wrote.

Built from the SHIP-checked scope `docs/wa-post-retry-scope.md` (read in full),
shape **(a)** - not redesigned. Repo HEAD when measured: `git rev-parse HEAD`
printed `e88d8675` (2026-10-04); the scope was authored at `9a73295b`, and
`git diff --stat 9a73295b..e88d8675 -- src/app/components/walkthrough-announcement`
printed nothing, so every `src` line number below is a HEAD line number and the
scope's anchors are unshifted. All quantities below were MEASURED by opening the
cited `file:line`, not recalled; the command or read that produced each is named
in section 1.

Scope boundary honoured: only announcement files under
`src/app/components/walkthrough-announcement/` are in the write set. No grading,
`repo-grades/` or ingestion file is read or written by this plan - a sibling
grading wave runs concurrently and owns those.

---

## 0. The F-2 copy decision (owner-confirmable, proceeding on the recommended reading)

**One-line question for the owner (every answer terminates the activity):**
After a failed announcement post, should the error copy stop asserting "Nothing
was posted." unconditionally and instead say the post may or may not have landed
and tell the user to check Canvas first (recommended, mirrors
`BulkCourseMessagePanel.tsx:135`), or should the existing "Nothing was posted."
wording stay?

**Reading acted on in these notes: F-2 ACCEPTED (make the copy honest).** This
touches two copy sites (section 2). If the owner declines F-2, delete AC-7's
adapter clause and the adapter hunk; AC-1..AC-6 and the arm-clear fix are
unaffected (F-3's class-C copy defect then stays open as a residual).

**CORRECTION 2 resolved - how the adapter copy is tested: by SOURCE-TEXT, not by
importing a builder.** `useWalkthroughGenerationAdapters.ts` is `"use client"`
and top-level-imports the server action `postWalkthroughAnnouncementAction`
(`:14-18`), so any `*.test.ts` that imported a message builder from it would
transitively pull `@/app/actions/walkthrough-announcement` - network-blocked
under vitest (`vitest.setup.ts` throws on real fetch; memory:
tests-are-network-blocked). I am NOT naming a new leaf file. The adapter's
failure framing is a static template literal fully visible in source, so the
honesty FACT is checked by reading the file raw with `fs.readFileSync` (the same
instrument every `*.structure.test.ts` in this directory already uses) over a
bounded slice, pinning the fact and not the spelling. The write set therefore
stays exactly the scope's three production files plus the one new test file - no
new leaf, no new directory entry. The hook's transport-rejection message
(`useAnnouncementDraftSlots.ts:463`) is different: that file imports NO server
action (`:20-40`), so it is tested by DIRECT IMPORT of an exported constant.

---

## 1. Grounding table - every anchor opened at HEAD e88d8675

| Fact | File:line (HEAD) | What is there (verbatim where load-bearing) |
|---|---|---|
| Error arm (the fix site) | `announcement-draft-slots.ts:554-556` | `if ("error" in action.result) { return { ...slot, posting: false, postError: action.result.error }; }` - PRESERVES `postArmedFor` by the spread (the bug) |
| Success arm clears the arm | `announcement-draft-slots.ts:558-565` | `postArmedFor: null` at `:564`, `postLocked: true` at `:563` |
| `mayCommitPost` | `announcement-draft-slots.ts:394-396` | `return slot.draft.phase === "drafted" && !slot.postLocked && !slot.posting;` - no `postError` term |
| `arm-post` reducer case | `announcement-draft-slots.ts:538-543` | `if (slot.postArmedFor === action.signature) return slot; return { ...slot, postArmedFor: action.signature };` |
| `posting` reducer case | `announcement-draft-slots.ts:550-552` | `{ ...slot, posting: true, postError: null }` - does not touch `postArmedFor` |
| `SlotsAction` union, 17 members | `announcement-draft-slots.ts:406-427` | `post-result` payload `{ course; scheduledLabel } | { error }` at `:421-425` |
| `makeSlot` defaults | `announcement-draft-slots.ts:372-389` | `postArmedFor: null`, `postError: null`, `postLocked: false`, `scheduledAt: ""`, `draft: { phase: "empty", error: null }` |
| `DraftSlot` has 14 fields | `announcement-draft-slots.ts:105-150` | id, choice, timing, scheduledAt, draft, postArmedFor, regenerateArmed, posting, postError, postedTo, postedScheduledLabel, postLocked, copyError, copied |
| `postSignatureFor` (exported) | `useAnnouncementDraftSlots.ts:206-215` | returns `null` unless `phase === "drafted"`; otherwise a JSON string over id/title/message/scheduledAt |
| `armPost` arm-vs-commit | `useAnnouncementDraftSlots.ts:470-485` | guard `if (!mayCommitPost(slot)) return;` at `:475`; `if (slot.postArmedFor === signature) { commitPost(id); return; }` at `:478-481` |
| `commitPost` rejection copy | `useAnnouncementDraftSlots.ts:459-464` | inline string `"Could not reach the server - the post may or may not have gone through."` at `:463` (NOT yet a named export) |
| hook imports NO server action | `useAnnouncementDraftSlots.ts:20-40` | react, `@/lib/markdown`, clipboard, `./scheduled-visibility`, types from `./announcement-draft-slots` only - safe to import from a test |
| Adapter over-claim (F-2/F-3 site) | `useWalkthroughGenerationAdapters.ts:88-92` | `if ("error" in result) { return { error: `Canvas refused the announcement - ${result.error}. Nothing was posted.` }; }` at `:89-91` |
| adapter top-level server-action import | `useWalkthroughGenerationAdapters.ts:14-18` | why a test cannot import from it (CORRECTION 2) |
| Existing armPost source pin (must stay green UNEDITED) | `useAnnouncementDraftSlots.test.ts:257-274` | slice `armPost`->`cancelPost`; `:272` asserts `/postArmedFor\s*===\s*signature/`, `:271` asserts `commitPost(`, `:268` asserts `mayCommitPost(` |
| Existing post-result ERROR test (blind to the arm) | `announcement-draft-slots.test.ts:629-634` | builds `drafted(FIRST_SLOT_ID, { posting: true })` (arm already null); asserts only `posting===false` and `postError` - stays green under the fix |
| Existing post-result SUCCESS tests | `announcement-draft-slots.test.ts:605-627` | success clears `postArmedFor` (arm set to `"sig"` first) - untouched |
| Existing edit test | `announcement-draft-slots.test.ts:399-407` | edit clears `postArmedFor` - untouched |
| 17-member action canary | `announcement-draft-slots.test.ts:772-799` | `Record<SlotsAction["type"], true>`; `expect(Object.keys(memberTypes)).toHaveLength(17)` at `:797` |
| 14-key frozen reset oracle | `announcement-draft-slots.test.ts:829-848` | already has `postArmedFor: null` at `:837` - NO field added by this wave |
| WA-POST-LOCK 17-cell lock table | `announcement-post-lock.test.ts:79-143` | `Record<SlotsAction["type"], Case>`; `AC-3` count 17 at `:141-143`; the `post-result` cell `:129-134` uses `POST_OK` (a SUCCESS result), `expected: "sets"` - the error-arm change never touches it |
| WA-POST-LOCK 12-cell `mayCommitPost` grid | `announcement-post-lock.test.ts:189-229` | `slotFor` builds every cell via `makeSlot` (so `postError: null`) at `:205-213`; `:215-217` asserts 12 cells |
| WA-POST-LOCK "error does not lock" / "error on locked keeps lock" | `announcement-post-lock.test.ts:51-61` | pins `postLocked` only |
| ta- key canary size === 6 | `walkthrough-announcement.structure.test.ts:93-114` | dynamic `readdirSync` over every non-test `.ts/.tsx`; `expect(distinctKeys.size).toBe(6)` at `:114`; regex `/(?<![a-zA-Z])ta-[a-z-]*[a-z]/` at `:100` |
| directory file-set is DYNAMIC (no frozen-roots canary) | `walkthrough-announcement.structure.test.ts:94-95, 199-203, 887-890` | all directory scans use `fs.readdirSync(...)` filtered at runtime - no enumerated basename list, so adding/removing a file does not red a frozen-roots canary here |

Commands that produced the quantities: `git rev-parse HEAD` (`e88d8675`);
`git diff --stat 9a73295b..e88d8675 -- src/app/components/walkthrough-announcement`
(no output); each row above read with the Read tool at the cited lines.

---

## 2. The fix (shape (a), exact - restated from scope section 7, NOT redesigned)

**Hunk 1 - the arm clear (`announcement-draft-slots.ts`, error arm `:555-556`).**
Add `postArmedFor: null` to the error return so a failed post no longer leaves a
one-click re-post armed:

```
if ("error" in action.result) {
  return { ...slot, posting: false, postError: action.result.error, postArmedFor: null };
}
```

No new `DraftSlot` field, no new `SlotsAction` member, no phase change.
**`mayCommitPost` is NOT given a new term** (it must stay `true` after a failure
so the retry can re-arm - adding `!postError` would hard-block the retry; see
M4/CORRECTION 1).

**Hunk 2 - the hook transport-rejection copy (`useAnnouncementDraftSlots.ts:463`),
extracted to an exported named constant** so a test can import it. Recommended
constant name: `POST_TRANSPORT_FAILURE_MESSAGE`. It keeps the existing "may or
may not have gone through" wording and ADDS a "check ... Canvas ... before
posting again" clause. Pin the fact, not the spelling (AC-7). Exporting a string
`const` from this `"use client"` file is safe (it is not a server action, and
the file already exports pure helpers its test imports).

**Hunk 3 - the adapter copy (`useWalkthroughGenerationAdapters.ts:90`, F-2
accepted).** The returned-`{error}` message stops asserting "Nothing was posted."
unconditionally (false for class-C ambiguous failures - F-3) and instead tells
the user to check Canvas before posting again. Recommended wording mirrors
`BulkCourseMessagePanel.tsx:135`, e.g. `Canvas did not confirm the announcement -
${result.error}. Check the course's announcements in Canvas before posting
again.` No string-prefix classifier (none exists - scope section 2). Tested by
source-text only (section 0 / AC-7).

---

## 3. Requirements - object, instrument, direction of failure

Every instrument is a reducer execution, a pure-function call, a direct import,
or a raw `fs.readFileSync` source read. NONE renders a component (vitest here is
node-env and collects only `src/**/*.test.ts`; a green suite proves nothing about
markup, focus or the rendered button - that is owner-walk R-2, section 6).

- **AC-1 - the error arm clears the arm, for any error text.** Object: the slot
  `slotsReducer` returns for a drafted, armed, `posting:true` slot given
  `post-result {error}`. Instrument: `slotsReducer` (`announcement-draft-slots.ts:446`).
  Pass: returned slot has `postArmedFor === null`, `posting === false`,
  `postError` === the dispatched string, `postLocked === false`. Direction:
  RED if the arm is preserved (the bug) OR if the error locks the slot. Run for
  THREE literal error strings - a refusal-like string, the transport-rejection
  string, and `"Canvas did not respond."` - because the reducer is blind to the
  text; all three must behave identically.
- **AC-2 - the one-click re-post path is closed.** Object: the predicate
  `armPost` branches on at `useAnnouncementDraftSlots.ts:478`
  (`slot.postArmedFor === signature`). Instrument: `postSignatureFor` (exported
  `:206`) over the slot before and after AC-1's error. Pass: BEFORE the error,
  `slot.postArmedFor === postSignatureFor(slot)` is `true` (proves the slot was
  genuinely armed, so AC-2 cannot pass vacuously); AFTER the error it is `false`.
  Direction: RED if the arm survives. **Tie to real code:** this restates
  `armPost`'s own predicate, which the existing source pin
  `useAnnouncementDraftSlots.test.ts:257-274` (`/postArmedFor\s*===\s*signature/`)
  proves is the live branch. That pin must remain green UNEDITED; without it
  AC-2 is a mirror, with it AC-2 is a chain from the reducer state to "armPost
  re-arms instead of committing."
- **AC-3 - a legitimate retry is not trapped, and costs exactly two deliberate
  clicks.** Object: the slot after AC-1's error, then `arm-post` with its own
  current signature. Instrument: `slotsReducer` + `mayCommitPost` +
  `postSignatureFor`. Pass: `mayCommitPost(afterError) === true` (NOTE:
  `afterError.postError` is NON-null - this is the assertion M4 breaks); after a
  fresh `arm-post` with `postSignatureFor(afterError)`, the AC-2 predicate is
  `true` (the second click would commit). Direction: RED if the error arm locks
  the slot or leaves `mayCommitPost` false. This is a reducer+predicate model of
  the two-click flow, not a rendered click (owner-walk R-2 covers the render).
- **AC-4 - WA-POST-LOCK undisturbed (locked slot stays locked AND gets its arm
  cleared).** Object: a `postLocked:true`, `posting:true`, `postArmedFor:"sig"`
  slot given `post-result {error}`. Instrument: `slotsReducer`. Pass:
  `postLocked === true` (kept via spread) AND `postArmedFor === null` (cleared).
  Direction: RED in either direction (lock dropped, or arm kept). This fixture
  sets `postArmedFor:"sig"` on a locked slot, which the existing lock tests do
  NOT (`announcement-post-lock.test.ts:57-61` leaves it null), so it is a new,
  distinct fixture.
- **AC-5 - success path and edits unchanged (nothing removed or weakened).**
  Object: the existing tests `announcement-draft-slots.test.ts:605-627` (success
  sets `postedTo`, clears arm) and `:399-407` (edit clears arm), plus
  `announcement-post-lock.test.ts` AC-1..AC-12. Instrument: the section 7 gate
  line, run unedited, plus `git diff --name-only` showing those test files
  unmodified. Pass: all green AND those files appear in no diff. Direction: RED
  if any existing assertion was edited or deleted (an edited existing assertion
  is itself the signal).
- **AC-6 - no canary moved.** Object: the three canaries. Instrument: the gate
  line. Pass: `Object.keys(memberTypes).length === 17`
  (`announcement-draft-slots.test.ts:797`), the 14-key frozen reset oracle equal
  (`:829-848`), and `distinctKeys.size === 6`
  (`walkthrough-announcement.structure.test.ts:114`), all green UNEDITED.
  Direction: RED if any action, field or `ta-` key was added. The fix adds none,
  so these stay green without being touched.
- **AC-7 - the copy is honest (executed for the hook constant, source-text for
  the adapter; loosely pinned - fact not spelling).**
  - Hook constant (direct import): `import { POST_TRANSPORT_FAILURE_MESSAGE }
    from "./useAnnouncementDraftSlots"`. Pass: it matches `/may or may not/i`
    AND `/check/i`. Direction: RED if it regains an unconditional false
    assurance or drops the "check" guidance.
  - Adapter message (source-text over a bounded slice of
    `useWalkthroughGenerationAdapters.ts`, read with `fs.readFileSync`): slice
    from `if ("error" in result)` to `return { course:` - assert BOTH anchors
    resolve (`indexOf > -1`, end `>` start), then assert the slice does NOT
    match `/nothing was posted/i` (the removed F-3 false assurance - the
    load-bearing negative) AND matches `/check/i` AND `/Canvas/`. Direction: RED
    if the adapter regains "Nothing was posted." Memory: source-text tests
    over-specify - pin the fact (no false "nothing was posted" + a direction to
    verify), never the full sentence. The felt honesty of the rendered alert is
    owner-walk R-2.

Not machine-checkable here, by construction (stated, not faked green): that the
rendered Confirm button reverts to idle "Post to Canvas", that the red error
alert stays visible across the re-arm, and that the consequence notice
re-renders. Those follow from `WalkthroughAnnouncementPanel.tsx:765` and
`ConfirmArmButtons` by READ, and are owner-walk R-2.

---

## 4. The new test file - `announcement-post-retry.test.ts`

Path: `src/app/components/walkthrough-announcement/announcement-post-retry.test.ts`.
**Fixtures are DUPLICATED here, never imported from another `*.test.ts`**
(importing a helper from another test file re-runs its `describe` blocks -
memory: no-cross-test-file-imports). Imports (all import-safe - neither module
pulls a server action):

```
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  FIRST_SLOT_ID, makeSlot, slotsReducer, mayCommitPost,
  type DraftSlot, type Drafted,
} from "./announcement-draft-slots";
import { postSignatureFor, POST_TRANSPORT_FAILURE_MESSAGE } from "./useAnnouncementDraftSlots";
```

Duplicated fixture (copied from the lock test's shape, `announcement-post-lock.test.ts:19-29`):

```
const DRAFTED: Drafted = {
  title: "Week 3", message: "Hello",
  builtFrom: { kind: "pasted" }, researchNotice: { kind: "off" },
  timing: "beginning-of-week",
};
function drafted(id: string, overrides: Partial<DraftSlot> = {}): DraftSlot {
  return { ...makeSlot(id, { kind: "default" }, "beginning-of-week"),
    draft: { phase: "drafted", draft: DRAFTED, error: null }, ...overrides };
}
```

Per-AC construction:

- **AC-1** (three strings). For each `err` in
  `["Canvas refused the announcement - bad token. Nothing was posted.",
    "Could not reach the server - the post may or may not have gone through.",
    "Canvas did not respond."]`:
  `const armed = drafted(FIRST_SLOT_ID, { posting: true, postArmedFor: "sig" });`
  `const next = slotsReducer([armed], { type: "post-result", id: FIRST_SLOT_ID, result: { error: err } });`
  assert `next[0].postArmedFor === null`, `next[0].posting === false`,
  `next[0].postError === err`, `next[0].postLocked === false`.
- **AC-2.** Build a drafted slot, compute `const sig = postSignatureFor(slot)`
  (assert `sig !== null` first). Arm it via the reducer:
  `arm-post` with `{ signature: sig }`; assert armed slot's
  `postArmedFor === postSignatureFor(armedSlot)` (true - non-vacuous). Dispatch
  `posting`, then `post-result {error}`. Assert
  `afterError.postArmedFor !== postSignatureFor(afterError)` and
  `afterError.postArmedFor === null`. (`postSignatureFor` is stable across the
  error arm because the draft content and `scheduledAt` are untouched.)
- **AC-3.** From `afterError` (AC-2): assert `mayCommitPost(afterError) === true`
  and `afterError.postError !== null` (so the M4 guard has a non-null case to
  break). Then `const sig2 = postSignatureFor(afterError)` and dispatch
  `arm-post {signature: sig2}`; assert the re-armed slot's
  `postArmedFor === sig2` (the AC-2 predicate - the second click would commit).
- **AC-4.** `const locked = drafted(FIRST_SLOT_ID, { postLocked: true, posting: true, postArmedFor: "sig", postedTo: "CS 101" });`
  `const next = slotsReducer([locked], { type: "post-result", id: FIRST_SLOT_ID, result: { error: "refused" } });`
  assert `next[0].postLocked === true` AND `next[0].postArmedFor === null`.
- **AC-7 adapter slice.** `const src = fs.readFileSync(path.join(__dirname, "useWalkthroughGenerationAdapters.ts"), "utf-8");`
  `const start = src.indexOf('if ("error" in result)'); const end = src.indexOf("return { course:", start);`
  assert `start > -1` and `end > start`; `const slice = src.slice(start, end);`
  assert `!/nothing was posted/i.test(slice)`, `/check/i.test(slice)`,
  `/Canvas/.test(slice)`.
- **AC-7 hook constant.** assert `/may or may not/i.test(POST_TRANSPORT_FAILURE_MESSAGE)`
  and `/check/i.test(POST_TRANSPORT_FAILURE_MESSAGE)`.

AC-5 and AC-6 are NOT re-implemented in this file - they are the UNEDITED
existing suites run by the section 7 gate plus a `git diff` check. Do not copy
their assertions here; re-asserting them would not prove they stayed green.

---

## 5. Sabotage matrix - mutate the IMPLEMENTATION, restore by copy-backup

Restore by `cp` backup of the mutated file, NEVER `git checkout --` on an
uncommitted file (memory: sabotage-restore-needs-a-copy). Run each mutant through
the section 7 gate. "Discriminates" means RED with the mutation, GREEN after
restore - a mutant RED or GREEN in both directions proves nothing.

| ID | Mutation (file:line) | Goes RED | GREEN after restore | Discriminates? |
|---|---|---|---|---|
| **M1** | `announcement-draft-slots.ts:555` error arm OMITS `postArmedFor: null` (the bug) | AC-1 (`postArmedFor===null`), AC-2 (arm survives) | yes | YES - this is the mutant the wave exists to catch |
| **M2** | error arm also sets `postLocked: true` | AC-1 (`postLocked===false`), AC-3 (`mayCommitPost(afterError)` now false = trapped); ALSO existing `announcement-post-lock.test.ts:51` ("error does not lock") | yes | YES - distinct kill from M1 (targets the lock, not the arm) |
| **M3 (REBUILT - see note)** | error arm clears the arm but ALSO nulls the error: `{ ...slot, posting:false, postError:null, postArmedFor:null }` | AC-1 (`postError === dispatched string` fails - error swallowed) | yes | YES - proves the fix did not destroy the error message |
| **M4** | `mayCommitPost` gains `&& !slot.postError` (`announcement-draft-slots.ts:395`) | AC-3 only (`mayCommitPost(afterError)===true` flips to false) | yes | YES - but see CORRECTION 1 below |
| **M5** | revert Hunk 3 adapter copy to `...Nothing was posted.` | AC-7 adapter slice (`!/nothing was posted/i`) | yes | YES - the F-3 false-assurance guard |
| **M6** | drop the "check ... Canvas" clause from `POST_TRANSPORT_FAILURE_MESSAGE` | AC-7 hook constant (`/check/i`) | yes | YES - the hook-copy honesty guard |

**M3 is a deliberate REBUILD (test-seat practice #2, reported here).** The
scope's AC-8 lists M3 as "clear the arm only in the success arm, as today ->
same as M1." That mutant produces the EXACT SAME code state as M1 (the error arm
has no clear either way), so it kills precisely the same assertions as M1 and
adds no independent discrimination - banking it as a fourth kill would inflate
the count with a duplicate. I rebuilt it into the error-swallowing mutant above,
which kills a DIFFERENT assertion (AC-1's `postError` equality) and proves the
one-line fix preserves the error text it sits beside. The implementer should run
the ORIGINAL scope-M3 once to confirm it reproduces M1's reds (a sanity check
that M1 and scope-M3 are the same state), then use the rebuilt M3 as the
retained mutant.

**CORRECTION 1, verified by measurement - M4 does NOT red the 12-cell grid.**
The scope's earlier draft (and AC-8 as first written) claimed adding a "no
postError" term reddens `announcement-post-lock.test.ts:189-229`. It does NOT:
every grid cell is built by `slotFor` via `makeSlot` (`:205-213`), which sets
`postError: null` (`announcement-draft-slots.ts:382`), so `!slot.postError` is
`!null === true` for all 12 cells and the `drafted|false|false -> true` cell
stays green (the other 11 are already `false` for phase/lock/posting reasons and
stay `false`). M4's ONLY kill is AC-3, which is why AC-3 is designed with a
NON-null `postError` on `afterError` (the error arm sets it). Do not claim the
grid as an M4 kill; it would be a sabotage green in the direction it was said to
catch - exactly the "instrument that reads as coverage but measures nothing"
failure this seat exists to prevent.

**M2 note:** M2 also reddens an EXISTING lock test (`:51`), which is extra kill
evidence, not a problem - a mutant SHOULD break multiple guards. It is still
distinct from M1 because M1 leaves that existing test green.

Every M1..M6 is RED-with / GREEN-without, so none is red-in-both or green-in-both.
No requirement is left without a sabotage: AC-1->M1/M2/M3, AC-2->M1, AC-3->M2/M4,
AC-4 is guarded by the same arm-clear mutation as M1 restricted to a locked
fixture (M1 run against AC-4's fixture reds `postArmedFor===null`; the
implementer should confirm this), AC-7->M5/M6. AC-5 and AC-6 are "nothing moved"
criteria whose sabotage is structural: editing any canary count or existing
assertion is itself caught by the gate going red or the `git diff` showing a
touched file.

---

## 6. Reference-implementation satisfiability (test-seat practice #1)

**I did not execute vitest** - this task restricts me to notes (no production or
test code), and the gate needs the full installed repo. The fix is a trivially
satisfiable one-line reducer change plus two copy edits with no contradiction
among the criteria, so I proved satisfiability ANALYTICALLY by tracing each
assertion against the exact reducer/predicate source read in section 1. This is
the honest limit of what this seat can do here; the implementer MUST run the
real gate green before the wave is accepted (it is cheap and the only true
proof).

Reference diff that makes every RED test green and keeps every existing test
green (the three hunks in section 2). Per-AC trace:

- AC-1: error arm returns `{ ...slot, posting:false, postError, postArmedFor:null }`
  -> `postArmedFor===null` (hunk), `posting===false` (literal), `postError===err`
  (passthrough), `postLocked===false` (spread of a `drafted` slot whose
  `postLocked` is `false`). GREEN for all three strings (reducer is text-blind).
- AC-2: `postArmedFor` is `null` after the error, so `null !== postSignatureFor`.
  Before: `arm-post {sig}` sets `postArmedFor = sig = postSignatureFor(slot)`.
  GREEN.
- AC-3: `mayCommitPost` is unchanged (phase `drafted`, `postLocked false`,
  `posting false` after the error) -> `true`; `afterError.postError` is the
  dispatched string (non-null); a fresh `arm-post` sets `postArmedFor = sig2`.
  GREEN.
- AC-4: locked fixture -> error arm keeps `postLocked` (spread) and sets
  `postArmedFor:null`. GREEN.
- AC-5/AC-6: hunk 1 touches only the error branch; success/edit/lock tests and
  all three canaries are untouched. GREEN unedited.
- AC-7: hunks 2 and 3 produce strings matching the pinned fragments. GREEN.

No criterion is unsatisfiable or mutually contradictory; nothing was dropped to
make the set satisfiable.

---

## 7. Gate (not run by me)

`git status --short` restricted to the write set first - the four paths in
section 2 plus the new test file, and nothing else (the concurrent grading wave
owns `repo-grades/`; any grading path appearing here is an over-reach and fails
the wave). Then, per the repo multi-path rule (`npm run test:paths`, one path
per argument - a raw multi-path `vitest`/`npm test` silently drops unmatched
args; memory: test-paths-wrapper):

```
npm run test:paths src/app/components/walkthrough-announcement/announcement-post-retry.test.ts src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/walkthrough-announcement/announcement-post-lock.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

`announcement-draft-slots.test.ts`, `useAnnouncementDraftSlots.test.ts` and
`announcement-post-lock.test.ts` are run UNEDITED and prove no regression (AC-5,
AC-6). Then `npx tsc --noEmit` (single caller - it races on
`tsconfig.tsbuildinfo`; memory) and the repo lint. The emoji, source-bytes and
file-size gates are the three repo-wide tests in the command above.

Scope's gate line named `AnnouncementDraftSlot.structure.test.ts`; the caller's
brief named `walkthrough-announcement-timing.structure.test.ts` instead. I
followed the caller's list (above). `AnnouncementDraftSlot.structure.test.ts`
reads `AnnouncementDraftSlot.tsx`, which this wave does NOT touch, so it is not
load-bearing here; it is cheap regression insurance and may be appended, but is
not required.

---

## 8. Executable here vs argued

**Executable (reducer / pure fn / direct import / raw source read):** AC-1,
AC-2, AC-3, AC-4, AC-6 canaries, AC-7 (both clauses), and every sabotage M1..M6.
AC-5 is executable as "existing suites green + untouched by diff."

**Argued only (READ, never executed here) - do NOT report as verified:** that
the rendered Confirm button reverts to idle, that the red alert persists across
re-arm, that the notice re-renders, and the felt honesty of the new copy. These
rest on `WalkthroughAnnouncementPanel.tsx:765` + `ConfirmArmButtons` and the
copy sites by READ. They are owner-walk R-2.

---

## 9. Residual register

| # | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | Cross-tab, cross-reload and a DELIBERATE two-click re-post after an ambiguous failure are NOT closed client-side. **This wave must NOT be reported as closing re-publish.** | repo owner (fail-open vs fail-closed policy) | `WA-POST-DEDUP` (`docs/BACKLOG.md:224`, owner-blocked); a live-Canvas duplicate-announcement test | when WA-POST-DEDUP is dispatched |
| R-2 | Rendered behaviour after a failed post: idle button, alert persists, notice re-renders, focus; and the felt honesty of the copy | repo owner | browser walk of a forced failure (revoked token / disconnect mid-post) | owner-walk row filed with the W1 ship; the verifier cites it as UNVERIFIED, not passed |
| R-3 | A real `posted | refused | unknown` classifier at the action layer (like `bulk-course-message.ts:31`) so a clean refusal could keep its arm and class-C got exact copy - shape (a') | orchestrator files; implementer builds when asked | new action-contract test over `postWalkthroughAnnouncementAction`, with `canvasFetch`/`canvasRequest` mocked (NEVER `fetch`; memory: tests-are-network-blocked) | a later row if (a') is chosen |
| R-4 | F-3 class-C false "Nothing was posted." - CLOSED by this wave IF F-2 accepted (AC-7 adapter). If the owner declines F-2, this reopens. | repo owner (the section 0 question) | AC-7 adapter slice | the F-2 answer |
| R-5 | Sibling surface `recording/useTakeAnnouncement.ts` has the same one-click-after-error shape (scope F-1) | orchestrator | reducer/decision test on that post path | the already-filed `WA-POST-RETRY-TAKE` row (`git log`: `e88d8675`) |

None of these three legs (owner, instrument, step) is missing from any row; per
`iteration-caps.md` a residual missing any leg is a deletion.

---

## 10. One artifact, round 1

This is the first and only version authored this round. If the checker returns
defective, that is round-2 input; a third round of THIS activity goes to the
owner per AGENTS.md, not to a revision 3.
