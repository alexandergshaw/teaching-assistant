# Retrospective: 396e8f34..HEAD (session of 2026-09-29, resumed 2026-10-04)

Range defined from `git log --oneline 396e8f34..HEAD`: 32 commits, oldest
`6464a523` (PRES-1 Wave 1), newest `4e4487e6` (L-RETRO citation). Two clusters:
feature/grading work on 2026-09-29 (15:29-21:15, author dates) and the L-RETRO
loop-role additions on 2026-10-04 (09:10-09:25). Work in range: PRES-1
(waves 1-3 + drag-drop), A43-C (conversational ask), PRES-2 (S1-S6 13-stage
pipeline), A38 grading (waves 0-2), three test-greening commits, and the
loop-retro / loop-retro-reviewer roles themselves.

This report changes nothing but itself. Quantities name the command that
produced them; every lesson and area opens an evidence handle you can resolve.

---

## Part 1 - Lessons learned

### L1. Registration-canary drift recurred FOUR times in this range, and in every case the wave that caused the drift did not run the test that guards it

Four hand-maintained enumeration tests had to be reconciled in range:

- `src/app/components/tabs/tab-rails.test.ts` (the "7->8" Tools-rail canary),
  reconciled at `5bd60985` ("seven Manual views" -> "eight", adding
  `manual:presentations`). Root cause is IN RANGE: `fda6bc52` (PRES-1 Wave 3)
  added `manual:presentations` to the Tools rail, edited `manual-rail.ts`,
  `manual-rail.test.ts` and `useAppNavigation.ts`, but did NOT touch
  `tab-rails.test.ts`, which independently enumerates `TOOLS_RAIL_ITEMS`. Its
  wave gate ran "169 tests" (`git show fda6bc52` body) - a scoped subset that
  excluded the canary. `5bd60985`'s own message confirms it "fixes a
  pre-existing red tab-rails assertion (8 Manual views)". So the red was
  introduced at `fda6bc52`, survived PRES-1's push (`40965560`), and was caught
  three feature commits later during PRES-2.
- `src/tools/strip-comments-agreement.structure.test.ts`, greened at
  `931616c9`. Root cause IN RANGE: `b9069a9e` (A38 Wave 1) added
  `useGradingRowGrade.wiring.test.ts`, which the `SAFE_FILES` exact-set
  assertion enumerates. `b9069a9e`'s body reports "197 wave tests + full
  grading suite green" - the guard lives under `src/tools/`, not grading, so
  the scoped run did not cover it.
- `src/app/actions/wholesale-auth-mock-population.structure.test.ts`, greened
  at `9bcbe79e`. Root cause BEFORE range: `9f5f1fd3` (N15) added
  `grading-picture-transcribe.test.ts` (`git log --diff-filter=A` on that path;
  `git merge-base --is-ancestor 396e8f34 9f5f1fd3` = not an ancestor, i.e.
  pre-range).
- `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`,
  greened at `9bcbe79e`. Root cause BEFORE range: `4e46fadb` added
  `DraftedGradesTab.tsx`'s `classTrendsEntry` import, a new consumer the A23
  transitive-safety exact-set did not list (`9bcbe79e` diff and body).

`docs/loop/this-repo.md:147-158` already names these as "the ones that catch a
change that should not have broken anything", and `AGENTS.md`'s ledger carries
the pattern ("a registration list that grew while a hand-maintained canary did
not"). The session re-proved it four times, so this is a standing structural
fact of the gate, not a one-off.

### L2. Two of those reds persisted undetected across a push boundary (and at least one across a session boundary)

`wholesale-auth-mock` (cause `9f5f1fd3`, pre-range) and `gradingResults` (cause
`4e46fadb`, pre-range) were both first greened at `9bcbe79e`, in range. By
exact-set-assertion semantics a listed enumeration fails the moment an
unlisted matching file exists, so both tests were necessarily red from their
causing commit until `9bcbe79e` - across every push in between. Caveat: this is
inferred from the assertion shape plus `git merge-base` ancestry; I did not
check out `396e8f34` and execute the suite to observe the red directly. The
mechanism that lets a red survive this long is L4 below: the push gate does not
run vitest.

### L3. A scope was authored against a stale tree, and it was the NEXT seat - not the scope's own checker - that caught it

A38's scope told Wave 0 to extract a capture-status block that had ALREADY been
extracted (in A39 wave 3a-ii, commit `ff42424e`). The wave-plan seat withdrew
the premise and substituted a different, still-inline target
(`docs/a38-wave-plan.md:43-66` and `:168-172`), which shipped as the
capture-drain hook at `e198329b` ("extract capture-drain pipeline to a hook
(895)"). The A38 backlog note (`docs/backlog.yml`, A38 row) records the same:
"The originally-planned Wave-0 block was already extracted in a39; the target
was re-scoped". The scope also carried a stale count ("stale N=totalCount at
:652 superseded by min", A38 note), re-measured by the wave-0 implementer per
`docs/a38-wave-plan.md`. This is the recurring "brief from the tree, not the
doc" failure (`AGENTS.md` memory ledger); the point for the loop is WHEN it was
caught - one activity downstream of the scope's own adversarial check, not at
it.

### L4. The push gate's exclusion of vitest is the common enabler behind L1 and L2

The project's own standing gate is lint + tsc + build compile-line, with vitest
deliberately excluded (`AGENTS.md`/memory: push-without-full-build;
headless-count-canary records "gate doesn't run vitest"). Combined with waves
that run a scoped vitest subset (`fda6bc52` "169 tests"; `b9069a9e` "197 wave
tests + full grading suite"; `5bd60985` "424 tests across the pipeline + nav +
guard suites"), there is no point in the per-wave or per-push path where the
full `*.structure.test.ts` set is guaranteed to run. Every L1/L2 incident fits
exactly in that gap.

### L5. The "two rounds then ask" and SHAPE-5 fork controls worked this session - forks were escalated with terminating questions and recommendations, not ground into a third round

- `98d34eb7` A43-C scope shipped "SHIP after 2 rounds"; `4824950d` PRES-2 scope
  shipped "SHIP-after-fix applied" (round-1 check fixes folded, not a third
  round).
- `d6eb26de` escalated R2 as owner-blocked with a three-option terminating
  decision (relax policy / owner applies / accept partial), after the
  environment permission classifier refused the `requireOwner`->`requireUser`
  edits - a genuine environment block, correctly surfaced rather than worked
  around (`docs/backlog.yml` R2 question).
- `e083a05a` escalated G4 as a cost/reliability fork with an explicit "Recommend
  A" and every option terminating (`docs/g4-acceptance-criteria.md`;
  `docs/backlog.yml` G4 question).
- PRES-2's F1 surface fork was escalated AND resolved AND acted on in the same
  session: `REGRESSION.md` entry 447 records "OWNER DECISIONS 2026-09-29: F1 =
  pipeline on the NEW Slide Deck Creation tab", and the pipeline shipped on that
  surface at `5bd60985`.

This is the behaviour `AGENTS.md` was tightened five times to produce; the
session is positive evidence it is now holding for real product forks.

### L6. Baseline discipline held - every new feature area was baselined before work on it

`REGRESSION.md` tail (`grep -an "^## " docs/REGRESSION.md | tail`): entry 445
"PRES-1 waves 1+2 as shipped ... baseline before the batched PRES-1 regression
pass" (committed `1746a8c5`), 446 "PRES-2 S1-S5 as staged ... baseline before S6
assembles them", 447 "PRES-2 S6 as staged ... baseline before S6.7 mounts a
surface". The current tail entry is 447; next number is 448 (read from the tail,
not recalled).

### L7. The new loop roles were made reachable, guarding the project's most-cited "ships dead" failure

L-RETRO's backlog note and commits `639a0edc` / `4e4487e6` register
`loop-retro` and `loop-retro-reviewer` in both `docs/DEV_LOOP.md` and
`docs/loop/this-repo.md` (confirmed by the in-range diff of those two files, two
table rows each). The note states the roles are "reachable; live as agent types
this session" - the "a role file with no reference ships dead" failure
(`AGENTS.md` memory: assignment-must-include-the-wiring-file;
verify-reachability) was explicitly closed. This report being produced by
`loop-retro` is itself the reachability proof.

### Not determinable from this evidence window (stated rather than guessed)

The owner's brief named three runtime phenomena. The commit range (git log,
diffs, `REGRESSION.md`, `backlog.yml`, the agent docs) does not record them, and
I will not infer them:

- **A weekly/Opus rate-limit 429.** No entry in the range records it.
  `docs/loop/this-repo.md:360-362` already states as a standing fact that "the
  rate limit binds before the dollars do", but that is prior art, not in-range
  evidence of an event this session. A 429 is a runtime occurrence not captured
  in git.
- **Low-value never-stall "churn" dispatches.** Subagent dispatches do not
  appear in git. The commit cadence shows continuous feature progress with no
  obvious filler commits, but I cannot confirm OR deny that peripheral passes
  were dispatched only to satisfy the Stop-guard; the transcript, which I do not
  have, is the only evidence that would settle it.
- **Auto-commit hook "lag" specifically.** I can ground BATCHING (L4-adjacent,
  see A6 / `4824950d`) but not timing lag. Whether a commit was authored by the
  hook or manually is indistinguishable in git (all show author "Alex Shaw"),
  so "the hook lagged and forced a manual commit" is not resolvable here.

---

## Part 2 - Areas for improvement

### A1. Add the guarding structure test to a wave's gate whenever that wave adds the kind of entry it enumerates

Concretely, extend the wave-gate checklist in `docs/loop/wave-dispatch.md` /
`docs/DEV_LOOP.md` with a mapping: a wave whose write set adds a new
`*.test.ts` must also run `strip-comments-agreement.structure.test.ts` and
`wholesale-auth-mock-population.structure.test.ts`; a wave that edits
`manual-rail.ts` / `useAppNavigation.ts` or adds a nav/rail item must run
`src/app/components/tabs/tab-rails.test.ts`; a wave that adds a recording
sub-tab must run `recording-split.structure.test.ts`; a wave adding a new
client consumer of a `grading-results` leaf must run
`gradingResultsHelpersWiring.test.ts`. Evidence: the four L1 incidents, each a
wave that edited the enumerated kind but not the enumerating test.
`docs/loop/this-repo.md:147-158` is the authoritative list to build the mapping
from.

### A2. Run the full `*.structure.test.ts` set once per group before its push, since the push gate skips vitest

The push gate is lint + tsc + build by design (push-without-full-build memory),
so a structure-test red can survive to main. Add a pre-push step - minimally
`npx vitest run $(find src -name '*.structure.test.ts')` via the
`npm run test:paths` wrapper the repo already mandates for multi-path runs
(`docs/loop/this-repo.md:40-45`) - gating each group's push. Evidence: L2 - two
reds reached a push and were only found a session later at `9bcbe79e`.

### A3. Pair each hand-maintained enumeration canary with a meta-check that forces its update in the SAME wave, rather than relying on discipline

The exact-set lists (`SAFE_FILES`, `FROZEN_WHOLESALE_AUTH_MOCK_FILES`,
`TOOLS_RAIL_ITEMS`, the A23 consumer list) drift precisely because they are
hand-maintained literals; the strip-comments test's own comment records a prior
drift ("a hand-maintained one already drifted stale once ('68' ... corrected by
A42)", `931616c9` diff). The canary's tripwire value should be kept, but the
loop should treat "a wave added a file the canary scans" as a required write to
the canary in that wave's write set (same discipline as "every wave includes the
file that CALLS each new export", `docs/DEV_LOOP.md` Build step). Evidence: L1.

### A4. Move the "brief from the tree" re-measurement into the scope seat (or its checker), not the wave-plan seat

A38 shows a stale scope premise ("extract X" where X was already extracted) and
a stale count surviving the scope's own adversarial check and being caught only
at wave-plan time (L3). Add to the scope checker's contract in
`docs/loop/seats.md`: every "extract <symbol/block>" and every "N = <count>"
claim in a scope must cite a `file:line` re-measured against current HEAD, and
the checker must resolve each citation before passing the scope. Evidence:
`docs/a38-wave-plan.md:43-66`, `:168-172`; A38 backlog note; `ff42424e`.

### A5. Give an escalated-but-startable fork a real `owns` path (or declare it owner-blocked in words) so SHAPE-5's commit-cap is measurable against it

G4 is escalated to `state: 'owner'` with `owns: []` (`docs/backlog.yml` G4 row),
with recommended option A being startable code (migrate two paths to Route
Handlers). AGENTS.md's SHAPE-5 control says a fork row's recommended reading must
be startable within two commits of filing OR the row must be declared
owner-blocked in those words, and that the tally lives in the row's `owns`. An
empty `owns` makes that control unenforceable for G4. Recommendation: either set
G4's `owns` to the two named paths (`discussion-replies.ts`,
`learning-resources-generator.ts`) and treat the cost decision as the owner
answer, or restate G4 as owner-blocked (option B/C need a spend judgement).
Evidence: `docs/backlog.yml:163-174`; `AGENTS.md` SHAPE 5. Note: G4 is a genuine
cost fork; this is about making the existing control measurable, not a claim
that the fork was mishandled.

### A6. Stop reading commit subjects as a change index while the auto-commit hook batches - diff name-status instead, and split the tree before the hook fires

`4824950d` is subject-labelled "docs(pres-2): scope ..." yet `git show
4824950d --name-status` shows it also added `src/lib/deck-standard/standard.ts`,
`types.ts`, `standard.test.ts` (S1 PRODUCTION CODE) and
`docs/a38-acceptance-criteria.md` (an UNRELATED item's AC). The PRES-2 backlog
note itself records "the auto-commit hook folded S1 into commit 4824950d". The
concrete change: document in `docs/DEV_LOOP.md` that a reader (including this
retro role) must diff `--name-status`, never trust the subject, when the hook is
active; and where the orchestrator stages logically-distinct work, land it
before the hook coalesces it so the subject stays honest. Evidence:
`4824950d` name-status; `auto-commit-hook` memory ("trust the working tree, not
git bookkeeping").

### A7. Decide a loop behaviour under rate pressure, and record it where git can see it

I could not confirm an in-range 429 (see "Not determinable"), but
`docs/loop/this-repo.md:360-362` already treats the rate limit as the binding
constraint. If the owner wants a behaviour change under rate pressure (e.g.
collapse the six-seat design fan-out to the two highest-value seats, or serialize
checks), it belongs as an explicit rule in `docs/loop/traps-orchestration.md`
with the failure it prevents - not as an unwritten reaction. Evidence handle:
`docs/loop/this-repo.md:360-362` (the standing claim); the absence of any
rate-pressure rule in `docs/loop/traps-orchestration.md` is the gap.
