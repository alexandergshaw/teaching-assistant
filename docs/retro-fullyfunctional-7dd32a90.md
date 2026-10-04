# Retro: the "fully-functional" push - range `4e4487e6..7dd32a90`

Commit range examined: `4e4487e6..HEAD`, HEAD = `7dd32a90`, 30 commits
(`git rev-list --count 4e4487e6..HEAD` = 30). Authored 2026-10-04. Report-only:
this file is the only change. The range carries the owner's 2026-10-04 priority
set - GRADING-CHAT grader fully-functional (W1 `77f02755`, engine `780f963f`;
W2 `docs/grader-w2-test-notes.md` committed `c542441e` but NOT yet built),
announcements-from-recording (W1a `347d532c`, W1b `65da662c`; W2
`docs/rec-w2-test-notes.md` committed `2f65958a` but NOT yet built), and
discussion-reply click-reduction W-B (`47554810`) - plus the A29 bulk-message
leaves/action (`e5950ad7`, `0ff48952`) and two earlier retro commits
(`290903af`, `59830e3c`) that fall inside the range but belong to the previous
retro and are not analysed here.

Two waves are **in-progress at retro time**: grader W2 and recording W2. Their
test notes are committed and under/awaiting adversarial check; no build-wave
commit touches their production surfaces yet. Nothing below assumes their
outcome.

---

## Part 1 - Lessons learned

### L1. Test-author notes delivered as handbacks, not files, forced a documented checker REVISE and recurred across several waves' notes in this one session

The `loop-test-author` seat repeatedly returned its notes only as a subagent
handback rather than as a committed file, so a checker dispatched to gate those
notes could not open the artifact. At least ONE case is DOCUMENTED to have
bounced its gating checker with a correct REVISE for "artifact absent from
handoff" (grader W1, 903d9bd7); the other handoff-fix commits confirm handback
DELIVERY that had to be repaired by persisting the files, rather than a
separately-documented second and third bounce. Handback delivery recurred across
four waves' worth of notes (W1, W1a, engine, W1b), grouped into three handoff-fix
commits that persist the notes verbatim:

- Grader W1 driver-state notes: `903d9bd7`, whose body states the test-author
  "delivered its notes as a handback message, not a file, so the first W1 notes
  check could not open the artifact it was gating and correctly REVISE'd
  (artifact-absent-from-handoff)."
- Recording W1a oversize-segment-split notes: `19de9018` ("handoff fix").
- Grader engine wave AND recording W1b draft-leaf notes: `4409a113`, body:
  "Persist the two remaining test-author artifacts to files ... (both were
  delivered as handbacks)."

The correction was adopted later in the same session: W2 and W-B notes were
committed directly as files as part of authoring (`c542441e` creating
`docs/grader-w2-test-notes.md` and `docs/discussion-wb-test-notes.md`;
`2f65958a` creating `docs/rec-w2-test-notes.md`), so by mid-session the pattern
was being pre-empted rather than repaired after a bounced check.

This is a genuine within-session recurrence of handback-not-file delivery across
several waves, not a one-off; exactly one bounce (903d9bd7) is documented as a
checker REVISE, the rest are confirmed handback deliveries repaired by persisting.
Nothing shipped wrong - the cost was an extra orchestrator round trip per wave to
message the author to persist. AI1 rests on the recurrence of the handback
delivery itself, not on a bounce count.

### L2. The `stripComments` governance gate reddens repo-wide for any new test file that MENTIONS `stripComments` - a latent naming hazard three waves navigated

`src/tools/strip-comments-agreement.structure.test.ts` walks every
`*.test.ts` under `src/` and ENUMERATES every file whose text
`.includes("stripComments")` (`:509`); its invariant fails on any unaccounted
mention (`:521`) and asserts `ALL_DEFINED.length + EXCLUSIONS == mentioning.length`
(`:536`). (It also pins that the enumerated copies DIFFER from the production
tokenizer - the copies are string-unaware/MIME-unsafe while the tokenizer is not
- NOT that they agree; and a new copy is made green by adding it to a
classification bucket, not by matching the tokenizer.) Consequence: any NEW test
file that so much as MENTIONS the literal `stripComments` (helper name, call, or
comment) reddens the gate repo-wide until it is classified. A helper named
otherwise (e.g. `withoutLineComments`) is not enumerated and never trips it.

Three concurrent waves in this range NAVIGATED this latent hazard (none suffered
an actual repo-wide red, because each used the safe name):

- Discussion W-B: the test-author notes themselves instructed duplicating the
  risky name - `docs/discussion-wb-test-notes.md:251` ("DUPLICATE the
  stripComments helper") and `:341` ("duplicate `stripComments`"). The shipped
  wiring test instead used a safe name: `47554810` body ("wiring test uses a
  governance-gate-safe withoutLineComments helper"); confirmed in
  `src/app/components/wb-remembered-fab-launch.wiring.test.ts:6`
  (`function withoutLineComments`).
- Grader W2 (in-progress): the working-tree structure test now uses the safe
  name - `src/app/components/grading-chat/GradingChatPanel.structure.test.ts`
  contains `withoutLineComments` (`grep -rln withoutLineComments
  src --include=*.test.ts`).
- Recording W2 (in-progress): both new working-tree tests use the safe name -
  `src/app/components/recording/TakeAnnouncementPanel.drafts-link.wiring.test.ts`
  and `.../useTakeAnnouncement.drafts-loop.wiring.test.ts` (same grep).

The fix that worked everywhere: name the helper `withoutLineComments` so it is
not enumerated by the gate.

### L3. Reachability gaps (surface-is-a-layer) were caught at check/verify, not by green gates

Two B1-class findings in this range are cases where a pure/driver oracle passed
but the surface->driver hop was unpinned:

- Grader W2 `commentSplit` panel-feed: `docs/grader-w2-test-notes.md:27-44`
  measures that the `/api/grade-run-item` body is built entirely inside the
  driver, the route already consumes `commentSplit` (`route.ts:65,95,135,176,
  191`), and "the ONLY missing hop is the chat surface putting `commentSplit`"
  onto the body - the panel calls only `driver.beginSession(...)` /
  `driver.submit(...)`, neither of which carries it. The engine wave shipped the
  option deliberately dead: `780f963f` body, "no caller passes it yet - the
  driver/panel wiring is grader W2, so the split is not user-reachable until
  then." The reachability hop is explicitly assigned a write set to close it,
  not assumed.
- Recording W1a splitter: `347d532c` body, "fresh verify SHIP (R-LOOP
  reachability confirmed by reading - the splitter is actually reached)" - the
  new pure leaf `planSegmentSubchunks` could have shipped dead had
  `runTranscriptionLoop` not been rewired to call it; the verifier confirmed the
  call by reading.

These confirm the standing "the surface is a layer" discipline is being applied
at the right stage (plan/check/verify), where a green suite cannot see a missing
hop because no component is rendered.

### L4. One shared working tree under concurrent waves let a registration-canary drift reach `main`

All waves edited a single tree, and A29 W2 (`0ff48952`) added files that two
exact-set registration canaries enumerate, which reddened them - but the reds
reached `main` uncaught. `58f22f08` body: "Fixes two stale-frozen-list reds
that shipped to main uncaught (push gate runs no vitest - the recurring
registration-canary drift)." The repair added `bulk-course-message.test.ts` to
`FROZEN_WHOLESALE_AUTH_MOCK_FILES`
(`src/app/actions/wholesale-auth-mock-population.structure.test.ts`, +1 line)
and `bulk-course-message.ts` to `GITHUB_FILES_PENDING_ENUMERATION`
(`src/app/actions/action-guard-coverage-github-cohort.test.ts`, +6 lines)
(`git show --stat 58f22f08`); a follow-up security review then reclassified it
as reviewed (`3047db51`, keeping `requireUser`).

The within-wave mitigation did hold where it was applied: each wave committed
its own explicit paths separately (`347d532c`, `77f02755`, `780f963f`,
`65da662c` are per-wave commits touching disjoint production files), which is
why the mid-flight sibling edits did not cross-contaminate the shipped diffs.
The failure was not the tree itself but that the **push gate runs no vitest**,
so a shared-tree exact-set canary breakage is invisible until a full suite runs.
(I could not independently resolve from git or `docs/` the specific transcript
observations of `engine.ts` mid-edit syntax errors appearing in a sibling's
`tsc`; those are session-level and are not asserted here.)

### L5. POSITIVE - the check->build->verify loop caught real defects the green gates missed

Three concrete catches in this range, each where tsc/lint/suite were green:

- F3=A cross-session Canvas-URL leak: `77f02755` body, "fresh check SHIP (B1
  reset-clears folded)" - the check folded in that `reset()` must clear
  `canvasUrlRef` so a new session never inherits the prior Canvas URL; the
  shipped driver does so.
- G5 bad-output over-fire: `780f963f` body, "the S3/G5d over-fire anchor proven
  load-bearing by mutation" - a sabotage mutation proved the guard's anchor
  discriminates rather than passing by accident.
- The B1 reachability gaps in L3 above, surfaced at plan/verify.

### L6. POSITIVE - baseline-before-wave discipline held

The engine wave recorded the pre-wave behaviour before touching it: REGRESSION
entry 448 ("Grader engine, `gradeEntries` path: bad-output handling and comment
routing BEFORE the G5 + G8/F1=B engine wave - baseline"), committed `18eb17ad`
(+273 lines, `git show --stat 18eb17ad`). 448 is the tail entry
(`grep -an "^## " docs/REGRESSION.md | tail`), so the baseline was added, not
remembered.

---

## Part 2 - Areas for improvement

### AI1. Make "persist the notes to a committed `docs/*-test-notes.md` file" an explicit authoring obligation in the test-author seat

L1 shows the handback-not-file delivery recurred across several waves in one
session (one documented checker bounce, 903d9bd7; the rest confirmed handback
deliveries repaired by persisting). The
seat brief already says "**Write the file**, do not delegate"
(`.claude/agents/loop-test-author.md:79`), but that line was insufficient to
prevent the recurrence because it does not say WHERE or tie the file to the
checker's need. Recommended change (owner to decide): in
`.claude/agents/loop-test-author.md` and the test-author "Produces" row in
`docs/loop/seats.md`, state that authoring is not complete until the notes are
committed to a named `docs/<item>-test-notes.md` path, because the checker gates
on an openable artifact and a handback is not openable. This is the systemic fix
the owner asked to be assessed; it is worth encoding because the failure is in
the seat's standard output path, not in one agent.

### AI2. Warn against the `stripComments` name in the test-author brief and list the gate in `this-repo.md`

L2 shows three waves navigated this latent naming hazard (none hit an actual
repo-wide red, by using the safe name) and that the W-B notes actively told the
implementer to duplicate a helper named `stripComments`
(`docs/discussion-wb-test-notes.md:251,341`). The seat brief already prescribes
the correct comment-strip FORM (`.claude/agents/loop-test-author.md:73-75`,
unanchored `//.*$`) but says nothing about the NAME. Recommended changes:
(a) at `.claude/agents/loop-test-author.md:71-72` (the "duplicate it" rule for
cross-test-file helpers), add that a duplicated comment-strip helper must NOT be
named `stripComments` - any file MENTIONING that literal is enumerated by
`src/tools/strip-comments-agreement.structure.test.ts` and reddens the gate
repo-wide until it is added to a classification bucket; use a non-enumerated name
like `withoutLineComments`; and (b) add a row for this gate to the structural-gates
table in `docs/loop/this-repo.md` section 3, which currently does not mention it
(`grep -niE "stripComments|strip-comments-agreement" docs/loop/this-repo.md`
returns nothing).

### AI3. Add a targeted registration-canary check to the pre-push gate, or make the push gate's no-vitest limit explicit at wave-plan time

L4 shows a shared-tree exact-set canary breakage reached `main` because "the
push gate runs no vitest" (`58f22f08`). Recommended change (owner to decide
which): either run the handful of registration/structure canaries
(`wholesale-auth-mock-population.structure.test.ts`,
`action-guard-coverage-github-cohort.test.ts`, and the other
`*.structure.test.ts` exact-set lists) in the pre-push gate via
`npm run test:paths`, since they are fast and are exactly the gates that catch a
new file entering an enumerated set; or, if that is too costly, have the wave
plan enumerate which exact-set canaries any new action/file feeds so the adding
wave updates them in the same commit. The commit body itself calls this "the
recurring registration-canary drift," which marks it as a pattern, not an
incident.

### AI4. Make the engine->route->driver->panel reachability hop an explicit write-set line in the wave plan when a feature spans layers

L3 shows the loop handled this correctly this time (the W2 panel hop was named
as its own write set, the W1a splitter call was verified by reading), but only
because the test-author measured it after the fact
(`docs/grader-w2-test-notes.md:46-52` records that the engine-wave notes had
said "The driver passing the option is the sibling's" and W2 had to discover the
exact missing hop). Recommended change: when a scoped item is cut into waves
that span a pure leaf, a route, a driver and a surface, the wave plan
(`loop-plan`) should list the surface->driver hop as an explicit deliverable of
the wave that owns the surface, so a dead-but-green intermediate layer is a
planned, tracked state rather than something a later wave rediscovers. This
generalises the existing "surface is a layer" rule from a verify-time finding to
a plan-time write-set entry.

---

Lessons: 6 (L1-L4 the within-session recurrences the owner flagged; L5-L6
positives). Areas for improvement: 4.
