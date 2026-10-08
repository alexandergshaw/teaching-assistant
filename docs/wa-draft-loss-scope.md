# WA-DRAFT-LOSS scope: an unposted drafted announcement is lost on reload

Seat: scope (recon plus fix-shape recommendation), authored 2026-10-04 at HEAD
`419c1493` (`git rev-parse --short HEAD`). Backlog row: `docs/backlog.yml:1136`
(`WA-DRAFT-LOSS`, state `unscoped`, kind `bug`). This is a scope, not a build:
no production or test code was written. It has NOT been checked yet; a fresh
`loop-checker` pass is its next step. Nothing here is an owner ruling.

Every quantity names its instrument. Instruments used:

- `Read` of each cited file, with `file:line` as the Read tool numbers them
  (1-based). Every citation was opened, not only grepped.
- `Grep` probes, each stated with its pattern. Where a probe returned nothing I
  say "probe returned nothing", which is weaker than "does not exist".
- `wc -l` for file sizes (the repo-wide ceiling test counts lines its own way;
  see `docs/loop/traps-spec.md`; the numbers below are `wc -l` and are used only
  against the 1000-line ceiling with a wide margin).
- The gate wrapper, run 2026-10-04 at HEAD `419c1493`, one path per argument:
  `npm run test:paths -- <p1> <p2> ...` (exact command in section 11) printed:
  `COVERED announcement-draft-slots.test.ts files=1 passed=91`,
  `COVERED useAnnouncementDraftSlots.test.ts files=1 passed=31`,
  `COVERED announcement-post-lock.test.ts files=1 passed=37`,
  `COVERED announcement-post-retry.test.ts files=1 passed=8`,
  `COVERED walkthrough-run-decisions.test.ts files=1 passed=27`,
  `COVERED walkthrough-announcement.structure.test.ts files=1 passed=93`,
  `COVERED src/lib/client-state-sweep.test.ts files=1 passed=10`
  (aggregate `Test Files 7 passed (7)`, `Tests 297 passed (297)`). That is the
  BASELINE a build must keep green.

Nothing was run in a browser. This checkout has no `.env`, renders no component
and has no live database (`docs/loop/this-repo.md` section 6). Every statement
about what a user sees or what a browser prompts is a READING claim.

Leverage claim (`docs/loop/leverage.md`): not applicable. This is a bug fix, one
of the four exempt kinds in `docs/DEV_LOOP.md` ("Criteria" paragraph). Shape (b)
below is borderline (it adds a capability, "your draft survives a reload"); if
the owner picks (b) the AC pass for that wave must open with a leverage claim.

---

## 0. Answer up front

- **Confirmed at HEAD.** A drafted announcement exists only as `useReducer`
  state in `useAnnouncementDraftSlots.ts:264`. Nothing in the announcement
  files writes it anywhere (probe `localStorage|sessionStorage|indexedDB` over
  the four slot/panel/hook files returned only two comment lines,
  `WalkthroughAnnouncementPanel.tsx:129, 603`, both saying the exemplar is NOT
  in localStorage). The only `beforeunload` listener in the directory is
  `WalkthroughAnnouncementPanel.tsx:391-399`, registered only while
  `capturing || pendingFrames > 0`. A drafted, hand-edited or in-flight slot
  never triggers it.
- **Recommended shape: (a) widen the guard** (warn before loss, no storage).
  One implementer wave, zero new `ta-` keys, no canary bump, no at-rest data.
  Section 5 gives the reasoning and why it is a genuine fork.
- **The product fork, one line for the owner:** "When an instructor reloads
  with an unposted draft, is a browser 'leave site?' warning enough (ships now,
  recommended), or must the draft survive the reload (new saved key, restore
  banner, roughly three waves)?" Either answer ends the activity (section 5).
- **The row's own instrument is stale in three places** (section 1.4): the
  guard is at `:391-399` not `:522-530`; the key canary is 6 not 5; and shape
  (b) would move it 6 to 7, not 5 to 6. A builder who trusted the row would
  edit the wrong lines and bump the wrong number.

---

## 1. Confirmation and location at HEAD

### 1.1 Where the slot state lives

| Fact | Evidence |
|---|---|
| Slot phases are exactly `empty`, `drafting`, `drafted` | `announcement-draft-slots.ts:91-94` (`SlotDraft` union); `:96` (`SlotDraftPhase`) |
| `drafted` carries the whole announcement: `draft: Drafted` = `title`, `message`, `builtFrom`, `researchNotice`, `timing` | `announcement-draft-slots.ts:75-89`, `:94` |
| `drafting` can carry the PREVIOUS draft as `restore` (a Regenerate over an existing draft) | `announcement-draft-slots.ts:93`; set at `:495` (`regenerate-started`) |
| The per-slot record is `DraftSlot`: `id`, `choice`, `timing`, `scheduledAt`, `draft`, `postArmedFor`, `regenerateArmed`, `posting`, `postError`, `postedTo`, `postedScheduledLabel`, `postLocked`, `copyError`, `copied` | `announcement-draft-slots.ts:105-150` |
| The reducer is a pure function; there is no storage call in it | `announcement-draft-slots.ts:446-584`; probe `localStorage\|sessionStorage\|indexedDB` over this file returned 0 matches (`grep -c`) |
| The hook owns the state: `useReducer(slotsReducer, FIRST_SLOT_ID, initialSlotsFromId)` and the id counter `nextIdRef = useRef(2)` | `useAnnouncementDraftSlots.ts:264`, `:280`, `:542-544`; probe over this file returned 0 matches |
| `edit` clears `postLocked` and re-opens the draft for posting, `result` (a fresh draft) clears it, `post-result` success sets it | `announcement-draft-slots.ts:466-480` (`:473`), `:524-536` (`:527`), `:559-566` (`:564`) |
| `AnnouncementDraftSlot.tsx` has no storage either | probe returned 0 matches (`grep -c`) |
| The panel is always mounted, only hidden with `display:none` when another view is active, so an in-app tab switch does NOT lose slots | `src/app/page.tsx:795-806`; pinned by `topLevelTabs.wiring.test.ts:588-596` ("a display toggle on an always-rendered element, never a conditional render") |

Conclusion: the loss window is a full page unload only (reload, tab close, hard
navigation, browser or tab crash, sign-out's full reload at `TopBar.tsx`). It is
NOT an in-app navigation loss. That bounds the blast radius.

### 1.2 The guard, and what it does not cover

`WalkthroughAnnouncementPanel.tsx:391-399`:

    useEffect(() => {
      if (!(capturing || pendingFrames > 0)) return;
      const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }, [capturing, pendingFrames]);

Probe `beforeunload` over `src` (non-test) found three real listeners repo-wide (useKbEditSession.ts:109, ModuleDeckCapturePanel.tsx:476, and this panel) plus one comment mention (KnowledgeTab.tsx:17); the
only one in this directory is the above (`grep -n beforeunload` over the
directory, non-test: lines 397 and 398 of the panel only). No test in the
directory pins it (probe `beforeunload` over `*.test.ts` in the directory
returned nothing; the only repo test mentioning it is
`ModuleDeckCapturePanel.wiring.test.ts:363-365`, a different panel). So a
widening edit disarms no existing test, and equally nothing proves the guard
exists today; a new pin is owed (AC-3).

Sibling idiom to copy, not to re-derive: `ModuleDeckCapturePanel.tsx:465-477`
(DE18) registers the same listener and is pinned by
`ModuleDeckCapturePanel.wiring.test.ts:362-365`.

The hazard this creates for a naive edit: the effect sits at `:391`, BEFORE the
`useAnnouncementDraftSlots(...)` call at `:462-481` that declares `slots`. A
widened condition cannot read `slots` where the effect currently is; the effect
must move below `:481` (hook call order is not semantically constrained here, all
hooks are unconditional) or a second effect be added after it.

### 1.3 Blast radius

A reload with an unposted draft drops, with no prompt: every `drafted` slot's
title and message including the instructor's hand edits (unrecoverable),
`drafting` calls in flight (the response lands on a dead page), and the arm and
lock state. Two adjacent facts a scope reader needs:

- The captured material is ALSO memory-only: `batchBlocksRef` (`Panel:317`,
  appended at `:360`, read by `buildRequest` at `:439`). After a reload it is
  empty, so even a restored draft could not be regenerated: the server rejects
  an empty `materialsText` with "Nothing was captured yet - capture a
  walkthrough first." (`src/app/actions/walkthrough-announcement.ts:395-397`),
  and the reducer's `result` error branch then restores the prior draft
  (`announcement-draft-slots.ts:513-522`). Safe, but a restored draft's
  Regenerate always errors until a new capture. Relevant to (b) only.
- Captured material with NO draft yet (auto-draft off, the instructor has not
  pressed Generate) is a separate silent-loss state the guard also does not
  cover. It is outside this row; registered as residual R-WA-DL-3.

### 1.4 Corrections to the row's own instrument (`docs/backlog.yml:1136-1146`)

| The row says | HEAD says | Instrument |
|---|---|---|
| beforeunload listener at `Panel:522-530` | `Panel:391-399`. At `:522-530` is the tail of `handleStartStop` and `handleRemoveExemplar`'s header. The panel is 839 lines. | `Read` of the panel; `wc -l` = 839 |
| "the panel persists exactly five `ta-rec-wta-*` keys" and shape (b) moves the canary "5 to 6" | SIX keys (`-course`, `-module`, `-notes`, `-emoji`, `-resources`, `-autodraft`); canary is `toBe(6)`; (b) would move it 6 to 7 | `walkthrough-announcement.structure.test.ts:107-114`; `useWalkthroughSetup.ts:23-32` |
| the keys are "persisted by the panel" | They live in `useWalkthroughSetup.ts`, not the panel (the panel has 0 storage calls) | probe over the panel: 2 hits, both comments |
| "a mount-effect restore ... panel comment at `WalkthroughAnnouncementPanel.tsx:209-216`" | There is no such comment there (`:209-216` is exemplar-fetch code). The hydration rationale is at `useWalkthroughSetup.ts:116-123`. | `Read` of both ranges |

Whoever builds from this scope must use the corrected citations.

---

## 2. Fix shapes, verified and costed

"Unposted work" below means a slot that is `drafting`, or `drafted` with
`postLocked === false`. `postLocked` is the one fact "this exact text is on
Canvas" (`announcement-draft-slots.ts:140-144`); it is cleared by an edit or a
fresh draft, which is why it, and not `postedTo`, defines what a reload loses.
(`postedTo` is NOT cleared by an edit, `announcement-draft-slots.ts:466-480`, so
`isRunComplete`, which reads `postedTo` at `walkthrough-run-decisions.ts:43-45`,
is the wrong predicate for this.)

| | (a) widen the guard | (b) persist and restore | (c) both |
|---|---|---|---|
| What it protects | Warn-before-loss: the instructor can cancel the reload. Does not save the draft. | No loss at all through reload, tab close and crash. | Everything (b) does, plus a prompt for the windows (b) cannot restore (in-flight draft, in-flight post). |
| Files touched (production) | `WalkthroughAnnouncementPanel.tsx` (effect moved and re-conditioned, about 10 lines), `walkthrough-run-decisions.ts` (+1 pure function). NOT the hook, NOT the reducer. | New leaf `announcement-draft-persist.ts` (serialize, parse, size cap), `announcement-draft-slots.ts` (+1 reducer action `restore`), `useAnnouncementDraftSlots.ts` (+2 effects: mount restore, persist; restore `nextIdRef`), panel (restore banner wiring) | the union of (a) and (b) |
| Files touched (test) | `walkthrough-run-decisions.test.ts` (98 lines now) +1 table; one new small wiring-pin file | new persist-leaf test; `announcement-draft-slots.test.ts:778-796` and `announcement-post-lock.test.ts:79` BOTH have exhaustive `Record<SlotsAction["type"], ...>` literals that stop compiling at an 18th action, and the post-lock one needs a decided outcome cell for it; `walkthrough-announcement.structure.test.ts:107-114` count 6 to 7 and its title string; `client-state-sweep.test.ts` erase-list pin | both |
| New `ta-` key | none | one (`ta-rec-wta-drafts` is a suggested name), canary `toBe(6)` to `toBe(7)` in the same commit (`walkthrough-announcement.structure.test.ts:114`) | one |
| `SlotsAction` canary | unchanged (17) | 17 to 18, two exhaustive Records, plus the "exactly 17 members" test name at `announcement-draft-slots.test.ts:770` | 17 to 18 |
| Complexity cost | One pure predicate with a frozen truth table; one effect edit. | Hydration-safe restore (a lazy `useState`/`useReducer` initializer reading storage disagrees with the server markup on this SSR'd client component, `useWalkthroughSetup.ts:116-123`, so restore must be a mount effect and therefore a new reducer action); a persisted shape that must not carry arm/post state; quota failure handling; sweep contract; stale-draft handling (section 4.3). | both, plus deciding which windows each covers |
| Rough relative cost (estimate, not measured) | 1 implementer wave, about 3 production and test files edited plus 1 new test file | 3 waves (leaf and tests; reducer action and canaries; hook and panel wiring and sweep pin), about 8 files | 3 waves plus the (a) wave |
| Security and privacy | No new data at rest. | New at-rest text; section 4. | same as (b) |

Reuse note for the owner's "does the (a) work get thrown away if I pick (b)":
no. Under (c) the (a) predicate stays (it is what warns during `drafting` and
`posting`, which (b) cannot restore); under pure (b) one function and one effect
condition are removed. Rework cost of choosing (b) after (a) ships is about one
small wave of deletions, not a redo.

---

## 3. What each shape must NOT disturb (verified constraints)

- `scheduledAt` is DELIBERATELY unpersisted, owner Branch A
  (`announcement-draft-slots.ts:112-122`; `docs/owner-decisions-2026-09-23.md:164`
  quoted in the row). (b) must not persist it. (a) is unaffected.
- The WA-POST-LOCK coupling R-1 (`docs/wa-post-lock-scope.md:401-405, 618-621`;
  `docs/wa-post-lock-w1-test-notes.md:410-414`): a restored posted draft must
  not come back unlocked. This scope discharges R-1 by the "restore refuses
  posted drafts" arm: (b)'s persisted set is exactly the unposted set defined at
  the top of section 2, so a locked slot is never written and nothing posted can
  be restored. The pass condition is AC-B3.
- The exemplar's raw text is not in localStorage (decision P3, pinned by
  `walkthrough-announcement.structure.test.ts:117-119`, which forbids
  `ta-rec-wta-exemplar`). (b) must persist no `choice` of kind `saved` (it
  carries an `AnnouncementOutline` derived from an exemplar,
  `announcement-draft-slots.ts:63`); a restored slot returns to
  `{ kind: "default" }`. `builtFrom` (kind plus exemplar id plus label,
  `:70-73`) is a small frozen record and is acceptable.
- The directory-wide `ta-` canary counts distinct matches of
  `(?<![a-zA-Z])ta-[a-z-]*[a-z]` over every non-test file in the directory
  (`walkthrough-announcement.structure.test.ts:100`). It would also count a
  `ta-` literal in a NEW non-test leaf, so any new key literal goes in exactly
  one file and no comment may spell it a second time (the repo already learned
  this, `useWalkthroughSetup.ts:14-22`).
- No cross-test-file imports (`docs/loop/traps-tests.md`): the new tests
  duplicate their fixtures.
- File ceiling: `WalkthroughAnnouncementPanel.tsx` is 839 lines (`wc -l`),
  `useAnnouncementDraftSlots.ts` 544, `announcement-draft-slots.ts` 584,
  `walkthrough-announcement.structure.test.ts` 956. (a) adds about 10 lines to
  the panel and nothing to the 956-line test file (which has about 44 lines of
  headroom to 1000 and should not receive the new pin). (b) would add real size
  to the hook and the reducer and must size the extraction BEFORE its code
  (`modulesview-at-ceiling` lesson), so its persist logic lives in the new leaf.

---

## 4. Security and privacy seat view (applies only to (b) and (c))

### 4.1 Is the draft text sensitive

Reading, not measurement. The draft is instructor-authored, class-facing text
that the instructor intends to publish to every enrolled student. The prompt
forbids the model from claiming anything about individual students (a name, a
count, completion state): `src/lib/walkthrough-announcement-prompt.ts:187-198`,
and the draft is built from the instructor's own LMS pages. That is an
instruction to the model only, not an output filter (the repo-grades security
pass found the same for its prompt, `docs/repo-grader-w5-persist-security.md`
section 2), and hand edits are free text. So: lower sensitivity than the repo
grader's cells (grades plus a probable GitHub handle, ruled acceptable under a
contract in that document), same class as "text the instructor typed in this
browser". I did not find student identifiers in the persisted shape by
construction (it would hold title, message, `builtFrom`, `researchNotice`,
`timing`, a timestamp), but I did not audit the model output path.

### 4.2 At-rest controls (mirror the repo-grades contract where it applies)

The repo-grades contract (`docs/repo-grader-w5-persist-security.md` section 6,
M1-M4, S1) applies to (b) as follows:

- **Erase on sign-out and owner change: free, but pin it.**
  `client-state-sweep.ts:45` keep-list is `["ta-theme"]`, plus the sweep's own
  marker (`:152`); `sweepLocalStorage` (`:167-188`) erases every other key, so a
  new key is erased by default. The existing smell test would not catch someone
  later adding the key to the keep-list (shown for the repo-grades key in that
  document section 4.1), so (b) owes an erase-list pin for the new key in
  `src/lib/client-state-sweep.test.ts` (pin the fact: `shouldKeepLocalStorageKey`
  returns false). Same M1 pattern.
- **Erase on post and on reset: falls out of the design.** The persisted set is
  the unposted set; the persist effect `removeItem`s the key when that set is
  empty. A successful post (sets `postLocked`, `:564`), a fresh run (`reset`,
  `:576-580`) and removal of the last unposted slot therefore all clear the key
  with no separate sweep code. This is a pass condition, AC-B4, not a hope.
- **Field enumeration (M2 analog).** Persist by construction, never by spread:
  `title`, `message`, `builtFrom`, `researchNotice`, `timing`, `at`. Never
  `scheduledAt`, `choice`, arm state, `posting`, `postedTo`, error strings.
  `researchNotice.text` is app-generated copy; keep it, bounded.
- **Size and quota.** Bounded by `MAX_ANNOUNCEMENT_BATCH_SIZE = 3`
  (`announcement-draft-slots.ts:24`) drafts; a hard char cap and a fixed,
  content-free failure string, mirroring `repoGradesResultsStore.ts:42-47`.
- **Orphan windows are inherited, not created.** The repo-grades document's
  cases f (session expired while the browser was closed) and i (sign-out whose
  revoke call failed) apply identically to any new key. Not closed by this row.

### 4.3 The staleness hazard that is specific to announcements (not in repo-grades)

A restored draft can be weeks old and speak in the present ("this week we are
covering"; the `timing` field `beginning-of-week`/`midweek` is part of the
prompt, `walkthrough-announcement-prompt.ts:64`). The post path is arm then
confirm with the full text visible in an editable slot, so a restored draft is
not posted blindly, but an instructor skimming a restored slot could publish
stale copy to students, which is irreversible (the WA-POST-LOCK row's class).
So (b) must: persist an `at` timestamp, show a restore notice carrying that date
("Restored a draft saved on <date>"), and the owner decides a TTL (the
repo-grades document argued against a TTL because its `posted` marker is the
double-post guard, `docs/repo-grader-w5-persist-security.md` section 6 S2;
that reason does NOT apply here because posted drafts are never persisted). My
proposal if (b) is chosen: drop a persisted draft older than 14 days at parse
time (arbitrary; owner-confirmable inside the (b) AC pass).

### 4.4 The reload-during-posting window

A reload while `posting === true` leaves a post whose outcome is unknown (it may
have landed). (b) must not restore that slot as an ordinary unposted draft with a
live Post button. Mirror the repo grader's frozen-copy treatment
(`repoGradesResultsStore.ts:38-40`, `RELOAD_INTERRUPTED_POST_MESSAGE`): persist
and restore such a slot with `postError` set to a fixed string telling the
instructor to check the course's announcements in Canvas before posting again
(the same advice as `POST_TRANSPORT_FAILURE_MESSAGE`,
`useAnnouncementDraftSlots.ts:206-209`). Under (a) this window is covered by the
warning, because `posting` slots are `drafted` with `postLocked === false`.

---

## 5. Recommendation and the fork

**Recommended: (a), proceed on it.** Reasons, in the owner's priority order
(token efficiency without sacrificing quality):

1. It removes the defect as the row words it: the loss is SILENT. After (a) the
   instructor is told before every full page unload, on every drafted, edited or
   in-flight slot, and can cancel. Loss then requires an explicit "Leave" click,
   which is an informed choice.
2. It is one wave on two production files with zero new at-rest data. (b) is
   about three waves, an 18th reducer action with two exhaustive-Record test
   edits, a canary bump, a sweep pin, a security contract and a staleness
   design; (c) is both.
3. No quality is traded away that the row claims. The row's own first candidate
   is (a) and calls it "the cheaper one". What (a) does not do is save the draft
   through a crash or an accepted "Leave" prompt, and it does not help on
   browsers that suppress `beforeunload` (some mobile browsers do; I did not
   verify any, this is a reading of general browser behaviour I could not test
   here).
4. What the model spent on a draft is small next to what the instructor spent
   on a walkthrough, and (b) does not save the walkthrough (`batchBlocksRef` is
   memory-only and out of scope): a restored draft cannot be regenerated
   (section 1.3). So (b) saves the draft text and the instructor's edits, not the
   expensive part. That weakens (b)'s case.

**Genuine product fork, owner-confirmable in one line.** "Warn only (ships now,
recommended) or persist and restore (new saved key, restore banner, about three
waves)?" It is genuine because (b) trades an at-rest data class and a
stale-publish hazard for no-loss-ever, which is a risk appetite call, not a
code fact.

Per the owner's rule that the answer ends the activity: if the answer is "warn",
this scope ships as written. If it is "persist" or "both", this scope ships with
section 6B as the AC set for the follow-on wave and everything unresolved in
section 9 stays a residual. Nothing in (a) is wasted by either answer
(section 2 reuse note). What is already started toward the recommended reading:
nothing is built (this is the scope seat); the build is ready to dispatch on (a)
as soon as this scope's check clears. What the other answer would cost: roughly
two more waves than (a) (estimate), not a redo of (a).

---

## 6. Acceptance criteria

Nothing renders under vitest (`docs/loop/this-repo.md` section 6), so the
actual browser prompt and the actual reload-restore are owner residuals
(section 9). Machine-checkable claims are pure-function truth tables and source
pins. Each names the object, the instrument and the direction of failure.

### 6A. Shape (a), the recommended build

Design decision for the builder: one exported pure function
`shouldWarnBeforeUnload`, in `walkthrough-run-decisions.ts` (the leaf that
already holds `isRunComplete`; it already imports `DraftSlot` from
`announcement-draft-slots.ts:6`, and no open row owns it, probe over
`docs/backlog.yml` `owns:` lists below). The predicate is a function of
`{ capturing, pendingFrames, slots }` and returns
`capturing || pendingFrames > 0 || slots.some(unposted)` where `unposted` is
`draft.phase === "drafting" || (draft.phase === "drafted" && !postLocked)`.
The spelling is the builder's; the truth table is the contract.

**AC-A1 (decision table, executing).** Object: the return value of
`shouldWarnBeforeUnload` for hand-written literal inputs, in
`walkthrough-run-decisions.test.ts`. Instrument: frozen-literal table, every
expected value typed by hand, no call to the function under test to compute an
expectation (`docs/loop/traps-tests.md`). Rows, minimum:

| Row | capturing | pendingFrames | slots | Expected |
|---|---|---|---|---|
| R0 idle | false | 0 | one empty slot | false |
| R1 capturing | true | 0 | one empty slot | true |
| R2 frames pending | false | 3 | one empty slot | true |
| R3 drafted, unlocked | false | 0 | one drafted, `postLocked:false` | true |
| R4 drafted, locked | false | 0 | one drafted, `postLocked:true` | false |
| R5 drafting, no prior draft | false | 0 | one `drafting`, `restore:null` | true |
| R6 drafting over a prior draft | false | 0 | one `drafting`, `restore:` a draft | true |
| R7 posting in flight | false | 0 | one drafted, `postLocked:false`, `posting:true` | true |
| R8 edited after a post | false | 0 | one drafted, `postedTo:` non-null, `postLocked:false` | true |
| R9 locked slot regenerating | false | 0 | one `drafting`, `postLocked:true`, `restore:` a draft | true |
| R10 mixed: locked plus empty | false | 0 | `[locked drafted, empty]` | false |
| R11 mixed: locked plus unlocked | false | 0 | `[locked drafted, drafted unlocked]` | true |
| R12 empty slot list | false | 0 | `[]` | false |

Fails when: any row differs. The direction that matters is a FALSE NEGATIVE
(R3, R5-R9, R11): silent loss returns. R4, R10 and R12 are the false-positive
guards (a prompt after a clean post would train the instructor to ignore it).
R8 is the discriminator between `postLocked` and `postedTo`: a builder who
reuses `isRunComplete`'s `postedTo` reading flips R8 to false and is caught.
R9 pins that a lock does not hide an in-flight regenerate.

**AC-A2 (sabotage, executing).** The test seat must prove AC-A1 can fail: (i)
replace `!postLocked` by `postedTo === null`: R8 must go red; (ii) drop the
`"drafting"` arm: R5, R6, R9 must go red; (iii) drop the `slots` term: R3 must
go red. Restore from a copy, never `git checkout --` on an uncommitted file
(`docs/loop/traps-tests.md`; memory: sabotage-restore-needs-a-copy).

**AC-A3 (wiring pin, source).** Object: `WalkthroughAnnouncementPanel.tsx`
with comments stripped. Instrument: a source structure test in a NEW file in the
directory (NOT `walkthrough-announcement.structure.test.ts`, 956 lines). Pin the
fact, not the spelling (memory: source-text-tests-overspecify): (1) the panel
calls `shouldWarnBeforeUnload` with an argument object that includes `slots`;
(2) there is exactly one `addEventListener("beforeunload"` and a matching
`removeEventListener("beforeunload"` in the same effect; (3) the old inline
condition `capturing || pendingFrames > 0` no longer gates the listener.
Fails when: the `slots` term is removed or replaced (mutation: pass `[]`), the
listener is registered unconditionally, or a second listener is added. This is
the only instrument that proves the predicate is actually wired to the browser
event, which is the reachability layer (memory: verify-reachability): a green
AC-A1 with an unwired predicate would ship dead.

**AC-A4 (cleanup, source).** The effect's cleanup removes the listener and its
dependency is the predicate's boolean result (or its inputs), so the listener is
removed when the last unposted slot is posted. Fails when: no
`removeEventListener`, or the dependency array omits what the predicate reads
(a stale closure would keep prompting after a clean post). Instrument: the same
new structure test, plus `npm run lint` (the repo's exhaustive-deps rule is the
tool that fails a dependency array that omits a read value; baseline is four
warnings, `docs/loop/this-repo.md` "four lint warnings are the baseline").

**AC-A5 (unchanged behaviour).** The capture-phase guard still fires for R1 and
R2 (covered by AC-A1) and the baseline suite stays green: the seven wrapper lines
quoted in the header must still print `COVERED` with passed counts that are the
baseline or higher, and `Tests 297 passed` becomes 297 plus the new tests.
Fails when: any baseline file's passed count drops or any file is reported
missing.

**AC-A6 (canaries untouched, source).** `SlotsAction` stays 17 members, the
directory `ta-` key count stays 6, `AnnouncementDraftSlot.tsx` still has exactly
one `useEffect`. Instrument: the existing canaries
(`announcement-draft-slots.test.ts:770-796`,
`walkthrough-announcement.structure.test.ts:107-114`,
`AnnouncementDraftSlot.structure.test.ts:51-52`). Fails when: any moves. No
canary bump is owed for (a).

**Owner or browser residuals for (a)** (section 9): the prompt actually appears
on a real reload with a drafted slot; does not appear after the draft is posted;
does not appear on an idle fresh load; and appears while a Generate is in flight.

### 6B. Shapes (b) and (c), the AC set if the owner picks persistence

Contingent. Written now so that the owner's answer ends this activity without a
rescope.

- **AC-B1 (shape, executing).** `toPersisted` (name the builder's) is a
  construction, never a spread: its key set equals the frozen literal
  `{at, title, message, builtFrom, researchNotice, timing}` for a fully populated
  `DraftSlot` carrying marker strings in `scheduledAt`, `choice.outline`,
  `postedTo`, `postError`, `postArmedFor`, `copyError`. The serialized blob
  contains no marker. Instrument: node-env unit test; a spreading mutant must
  fail it. Fails when: key set differs in either direction, or any marker appears.
- **AC-B2 (hydration-safe restore).** Restore runs in a mount effect after an
  `await Promise.resolve()` (the setState-in-effect idiom,
  `useWalkthroughSetup.ts:141-150`), through a new `restore` reducer action, and
  `nextIdRef` is set to one more than the highest restored `wta-slot-N` so a new
  slot cannot collide with a restored id. Instrument: reducer test for `restore`;
  a pure `nextIdAfterRestore(slots)` test with a literal (`wta-slot-1`,
  `wta-slot-3` gives 4). Fails when: a restore into a non-empty reducer
  overwrites a draft already generated this session (the `restore` reducer must be
  a no-op unless every slot is `empty`), or an id collides.
- **AC-B3 (R-1 discharge, executing).** No locked or posted slot is ever written
  or restored: for slots `[drafted locked]` the persisted blob is empty (key
  removed); a blob that parses to a draft restores with `postLocked === false`
  only because it was never posted; `parse` of a tampered blob containing
  `postLocked` or `postedTo` ignores them. Instrument: node-env test with frozen
  literals. Fails when: a posted draft round-trips (the double-publish bug through
  the back door, `docs/wa-post-lock-scope.md:401-405`).
- **AC-B4 (erase, executing).** The persist step removes the key when the
  unposted set is empty: after `post-result` success on the only unposted slot,
  after `reset`, and after `remove` of the last unposted slot. Instrument: node-env
  test against an injected storage seam (a `getItem/setItem/removeItem` object, the
  `RepoGradeCellsStorage` precedent, `repoGradesResultsStore.ts:52-56`). Fails
  when: any of the three leaves the key present.
- **AC-B5 (sweep pin).** `shouldKeepLocalStorageKey("<new key>")` is false.
  Instrument: add the key to the erase list in
  `src/lib/client-state-sweep.test.ts`; the wrapper line for that file must show
  passed greater than 10. Fails when: the key is ever added to
  `DEVICE_PREFERENCE_KEYS` (`client-state-sweep.ts:45`).
- **AC-B6 (canaries move together, source).** In one commit: ta-key canary
  `toBe(6)` to `toBe(7)` and its title string
  (`walkthrough-announcement.structure.test.ts:107-114`); `SlotsAction` 17 to 18 in
  BOTH exhaustive Records (`announcement-draft-slots.test.ts:778-796` and the
  "exactly 17 members" name at `:770`, `announcement-post-lock.test.ts:79`), the
  latter with a decided cell for `restore` (a restore never sets `postLocked`).
  Instrument: `tsc` (the exhaustive Record), the key canary. Fails when: either
  moves without the other, caught by tsc for the action and by the canary for the
  key.
- **AC-B7 (staleness and in-flight, executing).** A persisted draft older than
  the TTL decided at the AC pass is dropped at parse; a draft persisted while
  `posting` restores with the fixed interrupted-post string and is not
  immediately postable without a fresh arm. Instrument: node-env tests with an
  injected clock and literal fixtures. Fails when: a stale blob restores, or a
  restored in-flight slot shows no warning.
- **AC-B8 (quota).** A `setItem` that throws leaves the session working and sets a
  fixed content-free message (no interpolation of draft text). Instrument:
  node-env test with a throwing storage seam. Fails when: the error text contains
  the draft's title or message.
- Under (c), AC-A1 through A6 also apply unchanged.

---

## 7. Write set and collision check

Shape (a) write set (production and test), by exact path:

    src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
    src/app/components/walkthrough-announcement/walkthrough-run-decisions.ts
    src/app/components/walkthrough-announcement/walkthrough-run-decisions.test.ts
    src/app/components/walkthrough-announcement/<new>.structure.test.ts   (new file)

The row's `owns` (`docs/backlog.yml:1141`) lists the panel, the hook and
`announcement-draft-slots.ts`. (a) needs the panel and does NOT need the hook or
the slots file, and it needs `walkthrough-run-decisions.ts` which the row does
not list: the orchestrator must widen `owns` to match, else the wave gate's
`git status --short` check will flag an out-of-assignment path.

Collision check, instruments and results:

- Probe over `docs/backlog.yml`: a script splitting on `- id:` blocks and testing
  each `owns:` list for the substrings `WalkthroughAnnouncementPanel`,
  `useAnnouncementDraftSlots`, `announcement-draft-slots`,
  `walkthrough-run-decisions`, `useWalkthroughSetup` listed exactly two rows:
  `WA-POST-LOCK` (state `verification`, owns the hook and the slots file) and
  `WA-DRAFT-LOSS` itself. Neither `SMOOTH-WALKTHROUGH` nor any `WA-POST-RETRY*`
  row carries a populated `owns` (all print `owns: []`), so the row-level lists
  are not the whole truth; the commit log is.
- `git log --oneline -12` over the three row-owned files shows the settled
  history: `bb060dd4` (WA-POST-RETRY W1), `b7931c4d` (WA-POST-LOCK W1) on top of
  the SMOOTH-WALKTHROUGH commits (`494826ec`, `ffaba04f`, `df2dff8d`). The
  WA-POST-LOCK and WA-POST-RETRY waves already touched and committed these
  files, so (a) serializes AFTER them with no overlap (consistent with the
  dispatch note).
- `git status --short src` at authoring printed nothing: no uncommitted source
  edits exist in `src`, so no live wave holds these files. (The working tree has
  untracked `docs/*` files from sibling seats; none is a source file.)
- Files shared with the WA-POST-LOCK and WA-POST-RETRY work: for (a),
  `WalkthroughAnnouncementPanel.tsx` is not in those waves' write sets as far as
  the commit log shows (their commits are named for the slot, hook and test files;
  I did not diff each commit, so this is the commit titles plus `owns`, not a
  diff check). Shape (b) WOULD share `announcement-draft-slots.ts`,
  `useAnnouncementDraftSlots.ts` and the two exhaustive-Record test files with
  them, and must read `docs/wa-post-lock-scope.md` section 5 first (R-1).
- Unseen resource that no file list shows: `npx tsc --noEmit` has one caller;
  no two agents sabotage-verify on the same tree at once
  (`docs/DEV_LOOP.md`, "Disjoint backlog items" bullet).

Wave shape for (a): one implementer wave (predicate and table, panel edit, new
wiring pin), then a sabotage pass (AC-A2), then the verify. For (b) and (c) the
wave plan seat cuts it; this scope only records the three-wave estimate.

---

## 8. Disposition of the row's requirements

This scope restructures the row, so each of its claims is dispositioned:

| Row claim | Disposition |
|---|---|
| (a) extend the beforeunload condition to any drafted-and-unposted slot | KEPT as the recommended shape, id AC-A1..A6; widened to include `drafting` and `posting` (R5-R7), which the row did not name; "unposted" defined by `postLocked`, not `postedTo` (R8) |
| (b) persist drafts, new key, canary moves | KEPT as the contingent alternative, ids AC-B1..B8; canary corrected 5-to-6 to 6-to-7 |
| mount-effect restore because a lazy initializer does not show on first paint | KEPT (AC-B2), citation corrected to `useWalkthroughSetup.ts:116-123` |
| "a decision on whether a restored draft may be posted without re-reading it" | DECIDED within (b): it may be posted only through the existing arm-then-confirm with the full text visible, plus a dated restore notice and a TTL (section 4.3, AC-B7); owner-confirmable |
| schedule time stays unpersisted | KEPT (section 3) |
| interacts with SMOOTH-WALKTHROUGH fork F4: an automatic fresh run must never discard an unposted draft | CHECKED, not changed: `handleStartStop` resets only when `isRunComplete(slots)` (`Panel:511-515`), which requires every slot's `postedTo` non-null (`walkthrough-run-decisions.ts:43-45`), so an unposted draft is never cleared by a fresh run. One nuance: an edit-after-post slot has `postedTo` non-null and `postLocked` false (R8), so `isRunComplete` can be true while that slot holds an unposted correction; a fresh run would discard it. Registered as R-WA-DL-2, not fixed here |
| same file collision as WA-POST-LOCK | CHECKED, section 7 |
| `walkthrough-announcement.structure.test.ts:118-124` pins five keys | WITHDRAWN as stated: it is `:107-114` and six |

---

## 9. Residual register

Each names an owner, an instrument and the step that measures it.

| Id | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-WA-DL-1 | The actual browser prompt (reload and tab close with a drafted slot; absence after a clean post; absence when idle; presence mid-Generate). Nothing renders under vitest. Also whether any target browser suppresses `beforeunload` (mobile). | repo owner | OWNER WALK in a real browser: Generate a draft, reload, observe the prompt; post it, reload, observe none; repeat with an in-flight Generate | the next walkthrough walk; add four lines to the existing `WA-S2M8-WALK`-style owner-walk residual (`docs/backlog.yml`, referenced by `docs/wa-post-lock-w1-test-notes.md:402-404`) or a dedicated WA-DRAFT-LOSS walk row |
| R-WA-DL-2 | `isRunComplete` reads `postedTo`, which an edit does not clear, so a post-then-edit slot counts as "posted" and a fresh run (`Panel:511-515`) discards its unposted correction | orchestrator (files a row if the owner cares) | extend `walkthrough-run-decisions.test.ts` `isRunComplete` table with a post-then-edit row; today that row would return true | a backlog row at the next reconcile; independent of the (a)/(b) answer |
| R-WA-DL-3 | Captured material with no draft yet is also memory-only and unguarded (`batchBlocksRef`, `Panel:317`): auto-draft off, instructor stopped capture, reloads, loses the whole walkthrough; also after a clean run the material persists until the next Start | orchestrator (files a row) | one truth-table row per case in the same predicate's test; deciding term is `legibleBlockCount > 0` (`Panel:318, :406`) which would be a new input to the predicate | a backlog row; a one-line owner confirmation of whether to warn on material-only |
| R-WA-DL-4 | If (b)/(c): TTL value, restore-notice wording, and the quota behaviour in a real browser | repo owner (TTL, wording), builder (quota) | AC-B7, AC-B8 plus an OWNER WALK of a real reload-restore | the (b) AC pass, if the owner answers persist |
| R-WA-DL-5 | If (b)/(c): Regenerate on a restored draft always errors until a new capture (empty `materialsText`, `walkthrough-announcement.ts:395-397`), restoring the prior draft each time | UX seat of the (b) wave | a reading of `AnnouncementDraftSlot.tsx` Regenerate controls (`:295-304`) for a way to disable or explain it; OWNER WALK | the (b) UX pass; not applicable to (a) |
| R-WA-DL-6 | If (b)/(c): orphan data windows inherited from the sweep (session expired while the browser closed, failed revoke) | repo owner (accepts by answering the fork) | OWNER WALK as in `docs/repo-grader-w5-persist-security.md` R-S3 | with R-WA-DL-4 |
| R-WA-DL-7 | The stale row instrument (`docs/backlog.yml:1136-1146`) still carries the wrong line numbers and key count | orchestrator | re-read the row against section 1.4 | the push that closes this scope |

---

## 10. What I could not determine

- Anything behavioural in a browser: the prompt text, whether it shows without a
  prior user gesture (the instructor has always clicked Generate by then, so
  likely yes, but untested), mobile behaviour, crash recovery.
- Whether the model output can ever contain a student identifier despite the
  prompt (section 4.1): I read the prompt, not the output path.
- The real cost of a draft call and of a capture in money or minutes; the
  "rough relative cost" figures in section 2 are my estimates from file counts,
  not measurements.
- Whether `WalkthroughAnnouncementPanel.tsx` was edited by the WA-POST-LOCK or
  WA-POST-RETRY commits: I read commit titles from `git log --oneline`, not their
  diffs (section 7).
- The 14-day TTL is an arbitrary proposal with no measurement behind it.

---

## 11. Commands that produced this document's measured facts

- `git rev-parse --short HEAD` -> `419c1493`.
- Baseline wrapper (one path per argument, repo-relative):
  `npm run test:paths -- src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/walkthrough-announcement/announcement-post-lock.test.ts src/app/components/walkthrough-announcement/announcement-post-retry.test.ts src/app/components/walkthrough-announcement/walkthrough-run-decisions.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/lib/client-state-sweep.test.ts`
  -> the seven `COVERED` lines quoted in the header.
- `wc -l` over the directory: panel 839, hook 544, slots 584,
  `walkthrough-announcement.structure.test.ts` 956, `walkthrough-run-decisions.test.ts` 98,
  `walkthrough-run-decisions.ts` 57.
- `Grep` `beforeunload` over `src` (non-test and test); `grep -n beforeunload -r .`
  filtered of tests in the directory -> only `Panel:397-398`.
- `grep -c "localStorage\|sessionStorage\|indexedDB"` over the six
  slot/panel/hook files -> 0 for slots, hook, `AnnouncementDraftSlot.tsx`,
  `walkthrough-run-decisions.ts`; 2 (both comments) for the panel; 14 for
  `useWalkthroughSetup.ts`.
- A Python pass over `docs/backlog.yml` (split on `- id:`) for `owns:` lists
  containing the five file substrings -> `WA-POST-LOCK`, `WA-DRAFT-LOSS` only;
  states and `owns` printed for `WA-POST-RETRY`, `WA-POST-RETRY-TAKE`,
  `WA-POST-DEDUP` (`owner`), `SMOOTH-WALKTHROUGH`.
- `git log --oneline -12 -- <the three row-owned files>` and
  `git status --short src` (empty).
- Docs gate for the commit adding this file, one path per argument
  (`package.json` `docs:gate`): `npm run test:paths src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts`.
  Run by this seat on the finished file: `COVERED src/lib/no-emojis.test.ts files=1 passed=18`,
  `COVERED src/source-bytes.structure.test.ts files=1 passed=3`,
  `COVERED src/tools/vitest-paths/gate-commands.structure.test.ts files=1 passed=28`.
  It proves only no emoji and no stray bytes; nothing in the suite reads this document's claims.
