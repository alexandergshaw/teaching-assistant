# WA-POST-LOCK W1 - TDD test notes and oracle

Seat: `loop-test-author` (Opus). Consumer: a fresh `loop-checker`, then
`loop-implementer`. Built from the SHIP-checked scope `docs/wa-post-lock-scope.md`
(read in full) and shape (a) only - a hard `postLocked` boolean. This file
decides WHAT is measured and HOW it fails; it is not test code and not
production code.

Repo HEAD when grounded: `f4c51306`. Every anchor below was opened at HEAD and
every line number re-verified against the current tree, not recalled from the
scope. The scope's line numbers had shifted in two places; the corrected ones
are given and flagged.

## 0. Satisfiability and sabotage, proven before hand-off (seat obligation 1)

A set of red tests is not a spec until something passes it. Two throwaway
reference runs (node, in the session scratchpad - NOT committed):

- `ref-reducer.mjs`: a pure reference reducer + `mayCommitPost` under shape (a),
  driving AC-1, AC-2, AC-3 (all 17 types), AC-6 (12-cell grid) and AC-12.
  Result: **ALL GREEN** - the spec is satisfiable. Then six named sabotages, each
  **RED** (discriminates): post-result-no-set, edit-no-clear, result-no-clear,
  and mayCommitPost dropping each of its three terms.
- `ref-pins.mjs`: the three source-text pins (AC-8/9/11) run against the REAL
  `AnnouncementDraftSlot.tsx` text, with the proposed edits applied in memory.
  Result at HEAD: **AC-8 and AC-11 RED** (the fix is absent), as a red TDD test
  must be. With the correct edit: all three **GREEN**. Three sabotages
  (drop-lock-from-disabled, lock-on-Regenerate, hint-nested-in-block), each
  reddens exactly the pin it targets.

No mutant was rebuilt this run; all nine discriminated as first designed
(seat obligation 2 reported honestly - the count is nine real kills, none
inflated).

## 1. The fix shape (do not redesign - scope recommended shape (a))

A new in-memory boolean `postLocked` on `DraftSlot`:

- `DraftSlot` gains `readonly postLocked: boolean` (near `announcement-draft-slots.ts:129`, beside `postedTo`).
- `makeSlot` (`:367-383`) sets it `false`.
- `"post-result"` SUCCESS arm (`:543-549`) sets it `true`.
- `"edit"` arm (`:453-465`) sets it `false` (beside the existing `postArmedFor: null` clears).
- `"result"` SUCCESS arm (`:510-520`) sets it `false` (beside the existing clears).
- New pure export `mayCommitPost(slot): boolean` = `slot.draft.phase === "drafted" && !slot.postLocked && !slot.posting`.
- Hook `armPost` (`useAnnouncementDraftSlots.ts:467-480`) returns early unless `mayCommitPost(slot)`.
- Component Post `disabled=` (`AnnouncementDraftSlot.tsx:278-283`) gains `|| slot.postLocked`.
- A SIBLING hint, rendered only while `slot.postLocked`, placed AFTER the `{slot.postedTo && (` block (`:360-377`).

`postedTo` must NOT be reused as the lock: its `"edit"` arm does not clear it
(verified at `:453-465` - clears `postArmedFor`, `regenerateArmed`, `copyError`,
`copied` only), so `postedTo !== null` means "posted at some point in this
lineage", not "the on-screen draft is the posted draft".

## 2. Grounded anchors (opened at HEAD f4c51306)

| What | file:line | Note vs scope |
|---|---|---|
| `DraftSlot` interface / `postedTo` | `announcement-draft-slots.ts:105-145` / `:129` | matches |
| `makeSlot` | `announcement-draft-slots.ts:367-383` | matches |
| `SlotsAction` union (17 members) + the "17" comment | `announcement-draft-slots.ts:393-414` / `:415-420` | matches; 17 confirmed by count |
| `"edit"` arm | `announcement-draft-slots.ts:453-465` | scope said `:453-466`; body is `:453-465` |
| `"result"` success arm | `announcement-draft-slots.ts:510-521` | matches |
| `"post-result"` success return | `announcement-draft-slots.ts:543-549` | matches; error arm `:540-542` |
| `armPost` / `commitPost` | `useAnnouncementDraftSlots.ts:467-480` / `:423-465` | matches |
| stale-ref concession (same-tick) | `useAnnouncementDraftSlots.ts:264-272` | matches - load-bearing for N2 |
| Post `disabled=` (4 conditions) | `AnnouncementDraftSlot.tsx:278-283` | matches |
| Post `ConfirmArmButtons` | `AnnouncementDraftSlot.tsx:270-292` | matches |
| Regenerate `ConfirmArmButtons` (no `disabled`) | `AnnouncementDraftSlot.tsx:293-305` | matches |
| posted-status block `{slot.postedTo && (` | `AnnouncementDraftSlot.tsx:360-377` | matches |
| the one `useEffect` | `AnnouncementDraftSlot.tsx:106-111` | matches |
| 17-member Record canary | `announcement-draft-slots.test.ts:772-799` (literal `:778-796`, `toHaveLength(17)` `:797`) | matches |
| frozen reset oracle (full-object `toEqual`) | `announcement-draft-slots.test.ts:829-847` | matches |
| existing `"post-result"` describe | `announcement-draft-slots.test.ts:604-645` | AC-1/AC-2 extend it |
| existing `"result"` Set D-succ (lists cleared fields) | `announcement-draft-slots.test.ts:514-531` | AC-3 result-clears extends it |
| ta-key canary `distinctKeys.size).toBe(6)` | `walkthrough-announcement.structure.test.ts:107-114` | matches |
| one-`useEffect` freeze (W2) | `AnnouncementDraftSlot.structure.test.ts:51-52` | matches |
| A32 postedTo slice `indexOf("{slot.postedTo && (")` -> first `)}` | `walkthrough-announcement-timing.structure.test.ts:273-301` (slice built `:276-277`) | matches |
| Post block label slice `idleLabel={isScheduled` -> 2nd `<ConfirmArmButtons` | `walkthrough-announcement-timing.structure.test.ts:187-195` | ALREADY spans the `disabled=` block; new AC-8 pin must not disturb its prop matchers |
| `isRunComplete` reads `postedTo !== null` | `walkthrough-run-decisions.ts:43-45` | AC-4 drives it |

## 3. Same-commit canary updates (name these to the implementer)

MUST be touched in the fix commit or the gate reds:

- **Frozen reset oracle** (`announcement-draft-slots.test.ts:829-847`): add
  `postLocked: false` to the literal **BY HAND**. `reset` returns
  `initialSlots` -> `makeSlot`, which now emits the field, so the full-object
  `toEqual` reddens until the literal lists it. Checker: confirm the literal was
  edited by hand to `false`, NOT rewritten to spread or derive from `makeSlot`
  (that would convert a frozen oracle into a tautology - the repo's recorded
  refactor-disarms-tests failure).

MUST NOT move under shape (a) - say so explicitly so the implementer does not
bump them:

- **17-member Record canary** (`announcement-draft-slots.test.ts:772-799`):
  shape (a) adds NO action type. Stays 17. Do not touch.
- **ta-key canary** (`walkthrough-announcement.structure.test.ts:114`,
  `size).toBe(6)`): `postLocked` is in-memory, no `ta-` key. Stays 6. Do not touch.
- **one-`useEffect` freeze** (`AnnouncementDraftSlot.structure.test.ts:51`): the
  hint is a plain conditional render, NO new effect. Stays 1. Do not touch.

## 4. Requirements: object, instrument, direction, sabotage

Every row names the object under comparison, the instrument, the DIRECTION it
reddens, and a named sabotage with its discrimination verdict. All run under the
single gate in section 7. Reducer/grid requirements are proven in
`ref-reducer.mjs`; source pins in `ref-pins.mjs`.

### AC-1 - post-result success SETS the lock
- Object: slot after `"post-result"` success, for BOTH `scheduledLabel: null`
  and a label, starting from `postLocked: false, posting: true`.
- Instrument: reducer test, extends the describe at `announcement-draft-slots.test.ts:604`.
- Direction: RED if `postLocked !== true` after either success variant.
- Sabotage **S-set**: remove `postLocked: true` from the success return
  (`:543-549`). RED; restore (cp backup) GREEN. Discriminates (proven).

### AC-2 - a failed/refused post does NOT lock
- Object: slot after `"post-result"` error.
- Instrument: same describe.
- Direction: RED if `postLocked` becomes `true` on the error arm.
- Sabotage: set `postLocked: true` in the error arm (`:540-542`). RED on the
  error case; GREEN after restore. Discriminates (it is the inverse of S-set and
  the correct impl keeps the error arm untouched, so the two cases cannot both
  be green).

### AC-3 - what unlocks and what does not, over every action type (folds in N1)
- Object: `postLocked` effect of EACH of the 17 `SlotsAction` types.
- Instrument: a `Record<SlotsAction["type"], Case>` where each `Case` carries a
  hand-written starting slot, the action, and the expected outcome. The KEYS
  come from the type (`SlotsAction["type"]`) so tsc refuses to compile if an
  18th member is ever added without a key here - the SAME construction as the C1
  canary at `:778-796`, and a runtime `Object.keys(cases).length === 17` guards
  the count. **The axes (the 17 keys) come from the type; the generator (the
  per-type starting slot + action) and the expected outcomes are hand-written -
  different sources, so no branch is unreachable.**
- **Outcome enum - RECOMMENDED READING, a deliberate enrichment of the scope.**
  The scope proposed `"clears" | "keeps" | "n/a"`. That three-value enum cannot
  name the false->true transition `"post-result"` success performs, which is
  AC-1's load-bearing cell; collapsing it into `"keeps"` would hide it. Use a
  FOUR-value enum `"sets" | "clears" | "keeps" | "gone"`. Residual R-ENUM records
  this reading; it is non-blocking and changes no behaviour, only the
  instrument's expressiveness.
- The 17 cells, each decided and stated (N1's demand - no cell left to prose):

  | type | start phase / lock | expected | why |
  |---|---|---|---|
  | `add` | drafted, locked | keeps | appends a new slot; the locked slot is untouched |
  | `remove` | locked + a sibling, remove the SIBLING | keeps | `filter` keeps the locked object; a bad rebuild would drop the flag |
  | `choose` | drafted, locked | keeps | template choice changes a FUTURE regenerate, not the drafted text that posts |
  | `choose-timing` | drafted, locked | keeps | same as choose (DISCRIMINATOR: a naive "unlock on any mutation" reddens) |
  | `set-scheduled-at` | drafted, locked | keeps | a schedule-only change still re-publishes identical content (DISCRIMINATOR) |
  | `edit` | drafted, locked | **clears** | title/message change = different content (the one that MUST clear) |
  | `generate-started` | drafted, locked | keeps | phase guard `!== "empty"` makes it a no-op on a drafted slot |
  | `regenerate-started` | drafted, locked | keeps | goes to `drafting`; the lock clears when the fresh `result` lands, not at the start |
  | `result` (success) | **drafting**, locked | **clears** | a fresh draft result is new text - must unlock (drive from a drafting slot; `result` no-ops on drafted) |
  | `arm-post` | drafted, locked | keeps | arming does not change content |
  | `cancel-post` | drafted, locked, armed | keeps | disarming does not change content |
  | `arm-regenerate` | drafted, locked | keeps | arming regenerate does not change content |
  | `cancel-regenerate` | drafted, locked, armed | keeps | as above |
  | `posting` | drafted, locked | keeps | sets `posting`, not the lock |
  | `post-result` (success) | **drafted, UNlocked, posting** | **sets** | AC-1's transition inside the table |
  | `copy-result` | drafted, locked | keeps | copy is orthogonal |
  | `reset` | n/a | **gone** | returns fresh `initialSlots`; the locked slot ceases to exist - its unlocked replacement is pinned by AC-5, so this cell asserts nothing and is skipped |
- Companion assertions OUTSIDE the table (the table holds ONE value per type, so
  the error sub-branches of `result` and `post-result` each get their own line):
  - `result` ERROR keeps the lock (restores prior - possibly posted - text;
    staying locked is fail-safe). RED if the error arm clears it.
  - `post-result` ERROR = AC-2 above.
  - `post-result` ERROR on an ALREADY-locked slot keeps it locked (N1's
    fail-safe cell). RED if the error arm clears a lock.
- Direction: RED if any cell clears when it should keep (schedule/choose must
  NOT unlock) or keeps when it should clear (edit must).
- Sabotage **S-edit** (drop `postLocked: false` from the edit arm): the `edit`
  cell reddens. **S-result** (drop it from the result-success arm): the `result`
  cell reddens. Both proven; both restore GREEN.

### AC-4 - postedTo meaning unchanged (the F4 guard)
- Object: `postedTo`/`postedScheduledLabel` after `post -> edit`; and
  `isRunComplete` over that slot.
- Instrument: reducer test for the fields; `isRunComplete`
  (`walkthrough-run-decisions.ts:43`) driven through the REAL function (it is
  already in the gate via `walkthrough-run-decisions.test.ts`).
- Direction: RED if `postedTo` becomes `null` on edit, or `isRunComplete` flips
  for a posted-then-edited slot.
- Sabotage: make the `"edit"` arm also clear `postedTo`. RED. Discriminates
  (this is exactly the shape (a-naive) mistake the scope rejected).

### AC-5 - frozen reset oracle gains the field by hand
- Object: the literal at `announcement-draft-slots.test.ts:829-847`.
- Instrument: the existing full-object `toEqual`, with `postLocked: false` added
  by hand in the same commit.
- Direction: RED if `makeSlot` omits the field (tsc also fails - `DraftSlot`
  requires it) or defaults it truthy.
- Sabotage: set `makeSlot` `postLocked: true`. The reset oracle reddens (and so
  do AC-1-via-base, AC-6). Discriminates.
- Checker: the literal must be edited by hand to `false`, not derived.

### AC-6 - the pure decision mayCommitPost, 2x2x3 grid
- Object: `mayCommitPost(slot)` over `{phase in (empty, drafting, drafted)} x
  {postLocked in (false, true)} x {posting in (false, true)}` = 12 cells.
- Instrument: a frozen literal oracle. CONSTRUCTION, stated exactly:
  - The phase axis is the keys of `const PHASES: Record<SlotDraftPhase, true> =
    { empty: true, drafting: true, drafted: true }` - so a new phase added to
    the `SlotDraft` union reddens tsc here (axis derived from the TYPE, not a
    bare array).
  - The booleans are `[false, true]` each.
  - `EXPECTED` is a hand-written frozen map keyed by `` `${phase}|${locked}|${posting}` ``,
    **true for exactly one key** (`drafted|false|false`), false for the other 11.
    It is a LITERAL, never `mayCommitPost(...)` compared to itself.
  - The test enumerates the 12 combinations, builds a slot for each
    (`makeSlot` then override `draft` phase, `postLocked`, `posting`), and
    asserts `mayCommitPost(slot) === EXPECTED[key]`.
- Direction: RED if any locked, posting, or non-drafted cell returns `true`, or
  the one drafted/unlocked/idle cell returns `false`.
- Sabotage (three, each proven RED): drop the `!postLocked` term (the
  `drafted|true|false` cell flips); drop `!posting` (`drafted|false|true` flips);
  drop `phase === "drafted"` (the empty/drafting idle-unlocked cells flip).

### AC-7 - enforced at the commit layer (folds in N2)
- Object: the source of `armPost` in `useAnnouncementDraftSlots.ts`, sliced
  between `const armPost = useCallback(` and `const cancelPost = useCallback(`.
- Instrument: a source-text pin (the ONLY wiring check available - nothing
  renders, and `armPost` reads a ref so a unit test cannot drive it). Assert
  BOTH anchors resolve and `end > start`, then that the slice contains
  `mayCommitPost(`. Pin the FACT (armPost consults the gate), not the spelling
  of the whole guard - do not pin the exact `if (!mayCommitPost(slot)) return;`
  wording, which the source-text-over-specify rule forbids.
- Direction: RED if `armPost` no longer references `mayCommitPost`.
- Sabotage (named, scope AC-7): delete the `mayCommitPost` call from `armPost`
  on the REAL file. The pin reddens. Restore from a **cp backup**, never
  `git checkout --` an uncommitted file (that reverts to the index and destroys
  the chunk's work - recorded repo failure).
- **N2 - do NOT over-pin what this closes.** `mayCommitPost`'s `!posting` term
  closes the CROSS-tick double-click (T1/T2 in the scope's threat table) once
  the `posting` dispatch has flushed. It does NOT by itself close the SAME-tick
  double (T3): the same-tick window rests on MUI `loading` disabling the button
  (`ConfirmArmButtons`), and `armPost` reads `slotsRef.current`, which lags a
  render - the file's own comment at `useAnnouncementDraftSlots.ts:264-272`
  concedes the stale-ref gap. State T3 as a COMBINED guard (MUI loading-disable
  plus the cross-tick `posting` check), never as a `mayCommitPost` guarantee.
  The same-tick case is not test-provable here (nothing renders); it is an
  owner-walk residual (R-4), not a green assertion.

### AC-8 - enforced at the control (disabled=)
- Object: the Post `ConfirmArmButtons` `disabled=` expression.
- Instrument: a source-text pin. Slice from `idleLabel={isScheduled ? "Schedule post"`
  (start) to `onArm={() => onPostArm(slot.id)}` (end - the Post-specific form,
  not bare `onArm=`, which also appears on Regenerate). Assert BOTH anchors
  resolve and `end > start`, then the slice contains ALL of: `slot.postLocked`,
  `!courseName`, `.title.trim()`, `.message.trim()`, and
  `visibility.kind === "invalid"`.
- Direction: RED if `slot.postLocked` is absent OR any of the four existing
  conditions is dropped.
- Sabotage A (proven): remove `|| slot.postLocked`. RED. The four-condition
  requirement separately guards an implementer who refactors the expression and
  drops an existing guard.
- Note: the existing label-block slice at
  `walkthrough-announcement-timing.structure.test.ts:187-195` already spans this
  `disabled=` region and matches props by regex; adding `|| slot.postLocked`
  does not disturb those prop matchers (verified - they regex specific
  `idleLabel`/`confirmLabel`/... props, not the whole slice).

### AC-9 - Regenerate is the escape, never disabled by the lock
- Object: the Regenerate `ConfirmArmButtons` block.
- Instrument: a source-text pin. Slice from `idleLabel="Regenerate"` (start) to
  the Copy button `<Button size="small" variant="outlined" onClick={() => onCopy`
  (end). Assert BOTH anchors resolve, `end > start`, and `slice.length > 0`,
  then that the slice does NOT contain `postLocked`. The length/anchor assertion
  is mandatory: a negative `!includes` over an empty slice passes falsely (the
  slice-widened/collapsed failure class).
- Direction: RED if `postLocked` leaks into the Regenerate block.
- Sabotage B (proven): add `disabled={slot.postLocked}` to the Regenerate block.
  RED. Discriminates.

### AC-10 - no confirm weakened
- Object: both `ConfirmArmButtons` wirings.
- Instrument: source pin that `onArm={() => onPostArm(slot.id)}` AND
  `onConfirm={() => onPostArm(slot.id)}` are both present, and that `armPost`'s
  commit-on-second-call branch (`if (slot.postArmedFor === signature) {
  commitPost(id); ... }`, `:473-476`) is still reachable (slice contains
  `commitPost(` and `postArmedFor === signature`). Pin the FACT, not spelling.
- Direction: RED if either handler is removed, or `armPost` is changed to commit
  on the first call.
- Sabotage: remove the `onConfirm` handler, or change the `armPost` guard so the
  first call commits. RED. Discriminates. (This is the existing arm-then-confirm
  contract; the fix must not touch it.)

### AC-11 - the hint is a SIBLING, not inside the pinned block
- Object: `AnnouncementDraftSlot.tsx` source around the posted-status block.
- Instrument: compute `postedStart = indexOf("{slot.postedTo && (")`,
  `postedEnd = indexOf(")}", postedStart)`, `hintIdx = indexOf("slot.postLocked && (")`.
  Assert all three resolve (`> -1`), and `hintIdx > postedEnd` (the hint opens
  AFTER the posted-status block closes - a sibling). Also assert the A32 slice
  stays honest: the existing describe at
  `walkthrough-announcement-timing.structure.test.ts:273-301` must stay GREEN
  unchanged (it is in the gate).
- Direction: RED if the hint is nested inside the `{slot.postedTo && (` block.
- The hint MUST use the `&&` conditional-render idiom (`{slot.postLocked && (`)
  - the house pattern every sibling hint in this file already uses
  (`slot.copyError &&`, `slot.copied &&`, `postArmed &&`, `slot.regenerateArmed &&`).
  This is why the anchor `slot.postLocked && (` is distinct from the
  `disabled=` use of `slot.postLocked` (which is `|| slot.postLocked`, no `&& (`).
- Sabotage C (proven): nest the hint inside the posted-status `<p>` block.
  `hintIdx > postedEnd` becomes false. RED. Discriminates.

### AC-12 - in-flight edit fails safe
- Object: slot after `posting -> edit -> post-result success`.
- Instrument: reducer sequence test.
- Direction: pass requires `postLocked === true` at the end (the edit cleared a
  flag that was still `false`; the success then locks against the newer text).
  RED if the sequence ends unlocked.
- Sabotage: covered by S-set (post-result stops locking). RED. Documents the
  accepted quirk of scope section 3; a future (a-signature) upgrade would revise
  this assertion deliberately.

### AC-13 - frozen counts untouched
- Object: `useEffect(` count (stays 1), the 17-member Record (stays 17), the
  `ta-` key canary (stays 6).
- Instrument: the three existing tests, UNEDITED except AC-5's oracle.
- Direction: RED if an effect, an action type, or a `ta-` key is added.
- Sabotage: add a `useEffect` to the component. The W2 freeze
  (`AnnouncementDraftSlot.structure.test.ts:51`) reddens. Discriminates.

### AC-14 - no emoji, bytes clean
- Object: the touched `src` and `docs` files.
- Instrument: `src/lib/no-emojis.test.ts` (scans `src` and `docs`) and
  `src/source-bytes.structure.test.ts`.
- Direction: RED on any emoji or materialized escape / BOM / mojibake.
- Sabotage: n/a (repo-wide guards, not WA-specific); listed so the implementer
  keeps the hint copy emoji-free and does not paste a `\uXXXX` escape.

## 5. Executable here vs argued-only

Executable under vitest/tsc in this repo (all proven satisfiable in section 0):
AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7 (source pin), AC-8 (source pin),
AC-9 (source pin), AC-10 (source pin), AC-11 (source pin), AC-12, AC-13, AC-14.

Argued only - labelled as argued, NOT asserted as verified, NEVER faked green:

- That the Post button actually RENDERS disabled after a real post (AC-8 proves
  the `disabled=` expression contains the term; it does not render it).
- That the hint line is READ and ANNOUNCED by a screen reader (`role="status"
  aria-live="polite"` is a reading claim; a live region that mounts with its
  first message often does not announce - accessibility caveat).
- Where focus lands after the button disables under the user's own click.
- That editing one character re-enables the control in the live app.
- The SAME-TICK double-click (T3) being closed - argued via MUI loading-disable
  plus React flushing effects before the next discrete input; the stale-ref gap
  at `useAnnouncementDraftSlots.ts:264-272` means this is not provable here.

Nothing renders under vitest (node-env, collects only `src/**/*.test.ts`), so
none of the five above is written as a passing test. They route to R-4.

## 6. Proposed hint copy (READ-level; UX checker owns it)

A SIBLING after the `{slot.postedTo && (` block, shown only while `slot.postLocked`,
in the existing `styles.fieldHint` paragraph with `role="status" aria-live="polite"`:

    This draft is already on Canvas. Edit the subject or message, or
    Regenerate, to post it again.

No emoji. Accurate on both immediate and scheduled paths. The Post button's own
labels do not change (pinned by the timing structure test).

## 7. Gate command (one path per argument - never a raw multi-path vitest)

    npm run test:paths src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/walkthrough-announcement/AnnouncementDraftSlot.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-run-decisions.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts

Then:

    npx tsc --noEmit
    npx eslint src/app/components/walkthrough-announcement

(and the repo `docs:gate` line if `docs/` is part of the commit - this notes
file is under `docs/`, so `no-emojis` already covers it.)

Every test the change can redden is named above: the two reducer tests (AC-1/2/3/4/5/6/12),
the hook test (AC-7/10 pins live here or in the structure file - author's choice,
see below), the component structure test (AC-8/9/10/11/13 pins + the W2 freeze),
the timing structure test (A32 slice + the label-block slice), the directory
structure test (ta-key canary), walkthrough-run-decisions (AC-4's isRunComplete),
file-size-ceiling (the three prod files grow ~25-40 lines; none approaches 1000 -
sizes at HEAD: slots 568, component 393, hook 535), no-emojis and source-bytes.

Where to put the new source pins: AC-7 and AC-10 read `useAnnouncementDraftSlots.ts`
as source - put them beside the existing `BLOCKER R2-1` describe in
`useAnnouncementDraftSlots.test.ts:237-251`, which already `readFileSync`s that
file. AC-8/9/11/13 read `AnnouncementDraftSlot.tsx` - put them in a NEW describe
in `AnnouncementDraftSlot.structure.test.ts` (the scope sanctions a new describe
there). Do NOT import a helper from another `*.test.ts` - duplicate the
`readFileSync` line (recorded repo failure: cross-test-file import re-runs the
other file's describes).

## 8. Residual register (owner, instrument, step)

- **R-ENUM** (this seat's reading, non-blocking). AC-3's outcome enum was
  enriched from the scope's `"clears" | "keeps" | "n/a"` to
  `"sets" | "clears" | "keeps" | "gone"` so the false->true transition is
  nameable. Owner: `loop-checker` to confirm or reject. Instrument: review of
  the AC-3 table in this file. Step: the checker's pass over these notes; if
  rejected, collapse `"sets"` into a note and prove AC-1 solely via its own
  reducer test (both already specified).
- **R-4** (felt behaviour - owner walk). Post renders disabled after a real
  post; hint visible and announced; focus after the button disables;
  edit-one-character re-enables; same-tick double-click (T3). Owner: repo owner.
  Instrument: owner walk. Step: add these five lines to the existing
  `WA-S2M8-WALK` owner-walk residual (`docs/backlog.yml:1316` per the scope) or a
  dedicated WA-POST-LOCK walk residual; run at the next walkthrough walk.
- **R-1** (coupling, from scope section 5). If `WA-DRAFT-LOSS` persists drafts,
  the lock MUST persist with a restored posted draft (or restore must refuse
  posted drafts), else a reload restores an UNLOCKED copy of a posted
  announcement. Owner: scoper of `WA-DRAFT-LOSS`. Instrument: that row's own
  persistence test. Step: that row's scoping round reads scope section 5.
- **ADJ-1 / WA-POST-RETRY** is explicitly OUT of this wave (the owner is filing
  it as a separate row). Not folded in. No instrument owed here.

## 9. What I could not determine

- No live render, so every markup/focus/announce claim in section 5 is argued,
  not measured - stated as such, none faked green.
- The same-tick double-event (T3) cannot be reproduced here; argued via MUI
  loading-disable + the stale-ref concession, routed to R-4.
- I did not execute the repo vitest suite (network-blocked, heavy under this
  checkout's constraints); satisfiability was proven by a pure reference
  reducer + a source-pin simulation against the real file text (section 0),
  which is the faithful subset - the reducer and `mayCommitPost` are pure, and
  the source pins operate on the real `AnnouncementDraftSlot.tsx` bytes.
