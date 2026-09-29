# Unscoped backlog triage (read-only survey)

Produced 2026-09-28. This is a MAP for the owner to pick from, not a scope, a
design, or a build. Nothing in `docs/backlog.yml` was edited; no state was
changed; no commit or push was made from this pass.

## Measured counts

Command: `python3` parse of `docs/backlog.yml` with PyYAML, plus a cross-check
with `grep -c "state: '<x>'" docs/backlog.yml` (both agree):

- `unscoped`: **58** (this triage covers all 58, by id, below)
- `owner`: **5** (one-line disposition below)
- `verification`: **25** — **the task brief said 24; the measured count is
  25.** `grep -c "^- id:" docs/backlog.yml` returns **88**, and 58+5+25 = 88,
  so these three states are exhaustive over the file (no fourth state
  exists). Re-run `grep -c "state: 'verification'" docs/backlog.yml` to
  reconfirm if the file has moved since.

## Method and its limits

- Read every unscoped row's `id`, `area`, `from`, `title`, `note`,
  `blocked_by`, `question` directly from the parsed YAML (not from
  `docs/BACKLOG.md`, which is a rendering of the same source).
- For every row claiming a commit shipped, the commit hash was checked with
  `git cat-file -e <hash>` against this tree. Every hash cited in this triage
  as "shipped" was verified to exist this way (sample: `a77f447`, `2aa5c13`,
  `6aed083`, `166ce6c`, `021e6a9`, `19cf77b`, `2fef046`, `ceab414`,
  `0ad7378` — all present).
- For the thirteen `RES-FILL-*` rows, which are residuals off one design doc
  written when part of that design was "uncommitted... a transient push
  failure," each claim of "already fixed" below was checked against the
  CURRENT source, not assumed from the row's own prose:
  - `src/lib/grade/reconcile.ts:8-20` — read directly. It now imports
    `./prompts` (not `./rubric`) and its header comment already states the
    RULING 134 supersession by name. This directly resolves RES-FILL-1,
    RES-FILL-9 and RES-FILL-12 as filed.
  - `src/lib/module-graph/runtime-import-graph.test.ts:655-664` — read
    directly; its comment already documents the `./prompts` move and the
    9-trail count. Confirms RES-FILL-1/9 further.
  - `src/lib/grade/rubric-provenance-stamp.ts:1-20` — read directly; already
    names `run-header.ts`'s `resolveRunHeader` as a seventh caller. The
    comment-update half of RES-FILL-6 is done; its test-authoring half is
    not (see bucket below).
  - `src/lib/grade/extraction.ts:130-166` — read directly; already carries
    the conditional contract and cites RES-FILL-10 by name with the
    `grep -c "inferFileNamesWith" src/app/actions/grading.ts` → 0 proof
    inline. Resolves RES-FILL-10 as filed.
  - `src/app/actions/grading.ts` — `wc -l` gives **941** lines today, at/under
    the `-le 941` bound the row asked to reconcile against `RES-W-7`.
    Resolves RES-FILL-8's stated concern.
  - `src/app/components/grading/useIncrementalGradingRun.ts:96,223-282` —
    read directly; `startLockRef` still releases before `startReview`
    returns on the whole-run path. RES-FILL-2's defect is confirmed STILL
    LIVE, not fixed.
  - `src/app/actions/grading.ts:884-907` — read directly; `resolveRunHeader`
    (which can call rubric generation) still runs before `gradeSubmissions`
    on the whole-run zip path. RES-FILL-5's defect is confirmed STILL LIVE.
- Everything else below is a **reading claim** traced to the row's own `note`
  text and, where practical, a direct grep — consistent with this
  environment's ceiling (`docs/loop/this-repo.md` section 6): no live DB, no
  API keys, no rendered component, `gh` not installed, network blocked under
  vitest. Any row whose only remaining verification is a rendered screen, a
  live Canvas/Graph API call, or a production Actions-log tick is marked
  OWNER-DEPENDENT below for exactly that reason, even where the row's own
  history is otherwise mostly built.
- I did **not** re-run `npm test`, `tsc`, or any gate as part of this
  triage — the brief is read-only survey, not verification of the shipped
  commits' correctness. `npm run docs:gate` is run once at the end, covering
  only this new doc.

---

## Bucket 1 — AGENT-STARTABLE NOW (26 rows)

An agent could open a scope/architecture pass today with no owner input and
no missing environment. Ranked below by value-to-effort, highest first.
Sizes are rough: **tiny** (a few lines, one file), **small** (one wave, one
file set), **medium** (a real scope + build, a handful of files), **large**
(multi-wave feature).

| Rank | id | Size | What it delivers |
|---|---|---|---|
| 1 | `N13a` | tiny | Owner already raised the grading cap to 40 and explicitly said to drop the class-trends-draft floor; only `DEFAULT_CLASS_TRENDS_DRAFT_FLOOR` at `class-trends-draft.ts:18` (enforced at `:168` per the row's 2026-09-22 remeasure) needs deleting. Everything else the row once carried (the not-attempted seam, the six rulings) is already shipped per the row's own text. |
| 2 | `RES-FILL-5` | tiny | Reorder `gradeAction` so rubric generation doesn't run before extraction/collision-refusal on the whole-run zip path — confirmed still live at `grading.ts:884-907`. Saves one wasted model call on every collision-refused blank-rubric run, exactly the population `docs/loop/leverage.md`/A39 cares about. |
| 3 | `RES-FILL-2` | tiny | Fix `startLockRef` releasing before `startReview` returns on the whole-run path (`useIncrementalGradingRun.ts:96,223-282`, confirmed still live) — a same-render double-press double-dispatches a real model-call budget. A26 already shipped the same-shaped fix on a sibling surface as precedent. |
| 4 | `RES-A11Y-6` | tiny | Add length/type validation to caller-supplied `item_title` in the accessibility route (`src/app/api/accessibility/route.ts:99,114`) — unvalidated text into a service-role write today. Needs only a bound decision, not a product call. |
| 5 | `A40-D6` | tiny | Add a construction-level guard so a `Row` type field the insert never writes can't silently stay null forever with `tsc` blind to it — mirrors the fix RULING 120 already shipped for the opposite direction. |
| 6 | `RES-FILL-6` | tiny | The comment half (naming every `GradingRun` producer) is already done at `rubric-provenance-stamp.ts:1-20`; only the enforcing test over the producer call-site SET is owed. |
| 7 | `L17` | small | Convert the two remaining hand-maintained-array exhaustiveness guards (`GradeResult`, `GradingRun`) to the derived-key form L9 already proved out on the snapshot row type — a known pattern, not a fresh design. |
| 8 | `A4` | small | Owner answered the fork (option b) and its stated blocker (A1) has landed — re-point the three AskAiModal chips at the fact-grounded question shapes A1 now supports. |
| 9 | `RES-FILL-3` | small | Freeze a frozen-literal oracle over `gradeSubmissions`'s returned `results[].student` before the (still-pending) consolidation of its ingestion composition with the fill's `extractStudentEntries` — the row's own "after the fill ships" trigger has now fired (fill waves 1-6 are shipped per `A39`). |
| 10 | `A37` | small–medium | Answer the re-run identity yes/no (read `parseRepoRef` and its callers) that A12/A13 both left as an explicit residual with A37 named as the receiver — formally `blocked_by: [A12, A13]`, but the blocking sub-question is itself agent-answerable, not owner-gated. |
| 11 | `L6` | small | Decide (the row already leans toward "don't schedule a re-derivation cadence") and, if worth it, build the narrow reachability guard for the LIVE-LOOP leverage class — no removal test exists for it today. |
| 12 | `L16` | medium | Pick a fix for the stop-guard's "actionable-idle" vs "actionable-being-built" conflation — the row already scopes a 5th `building` state and a cheaper alternative (accept the guard as a floor); needs a design decision inside the loop-tooling, not the owner. |
| 13 | `L11` | medium | Make the owns-list caller-check mechanical in the wave gate instead of remembered prose — three open sub-questions (what to grep, false-positive risk, where it lives) all resolvable by a scoping pass. |
| 14 | `L12` | medium | Decide the "one guard file per guarded component" convention question `repoGrades.wiring.test.ts`'s breach raised — the row itself argues the cheaper fix is adding the ceiling gate to every verify list rather than a wholesale convention change. |
| 15 | `L13` | medium | Give the 53 duplicated `stripComments` copies either a shared non-test home or a mechanical cross-copy agreement check — re-verify against L9's already-shipped tokenizer module before sizing; some of this may already be narrower than filed. |
| 16 | `A45` | medium | Corroborate zip-path student identity against the roster/Canvas user list the app already holds — A44's 23-fixture oracle and generator are built and reusable; the row names the exact roster-field trap (`studentRepos[].username`) to avoid. |
| 17 | `A38` | medium | Both owner forks are answered (single-row grade; confirm-above-N spend cap) — ready for an architecture pass on the five settle-before-build questions the row lists (bound interaction, rubric consistency, cost disclosure, copy, concurrency/lock). |
| 18 | `A8` | medium | A8-R (recognition on the photographed surface) is fully shipped; the row's own serial plan names A8-P (the LMS-connected AI paths, routes a+g, ~10 files) as the remaining half, now unblocked by A8-R landing. Two residuals (routes c/d) stay owner-owned for live verification, not gating. |
| 19 | `A41` | medium | Well-specified silent-collapse bug (non-four-part zip filenames merge distinct students into one row) with three named remedy shapes; the row explicitly leaves the choice to "the architect pass, not this row" — no owner input required. |
| 20 | `A42` | medium | MIME-wildcard `/*`-as-comment-opener trap in the duplicated `stripComments` helper (85 files, 64 duplicated copies) — re-measure the "nine live trigger files" count first, since L9's later tokenizer (`01b2f30`) may have already fixed one of the two production modules the row names. |
| 21 | `L9` | large | Mechanical triage-and-fix sweep over the remaining ~99-113 undefended source-scanning test files, using the triage rule and tokenizer this row's own history already built and proved (`6125260`, `712aa42`, `2a924ef`, `b53faa6`, `89980da`, `01b2f30`). Large only because of file count; the method is de-risked. |
| 22 | `A7` | large | Owner asked for a full repo-grader UX overhaul; a prior 2172-line AC doc already exists and must be read first so this doesn't re-litigate settled decisions. Confirm `A5`/`A6` have landed (both absent from unscoped/owner lists, suggesting so) before starting — they share a file set. |
| 23 | `N13b` | large | Owner has already set the subset threshold ("three or more students") and the "any deduction counts" definition — remaining is real feature work: a second classification axis, per-student attribution, and a privacy-safe split between a class-facing and an instructor-facing output. |
| 24 | `A43` | large | Owner said keep the conversational layer in scope (DECISION 15) even though "no function or tool calling exists anywhere in the app" — the template-guarantee half (A43-T) is shipped; the remaining decision (general tool-calling mechanism vs. a deck-specific operation set) is an architecture call, not an owner one. |
| 25 | `A29` | large | Owner has answered the send-mechanism fork (Canvas Inbox, ≤100 students, "named refusal" over measuring first) — ready for an architecture pass, but several Canvas/Graph API facts it depends on (pagination defaults, group-conversation behavior) are unverifiable in this environment (network blocked, no keys) and must be routed to a research pass that states what it could not confirm. |
| 26 | `A25` | large | Cross-assignment trend accumulation, the larger reading of the owner's original "series of assignments" request. **Not formally `blocked_by` anything**, but the row's own text says its shape "depends on what A16 wave 2 learns" and on `N13b` (both informational, not in the `blocked_by` field) — flagging this gap explicitly since the row could otherwise be started blind to that dependency. |

---

## Bucket 2 — OWNER-DEPENDENT (11 rows)

| id | What it needs |
|---|---|
| `N3` | Blocked on `V3`'s *input* (a live production Actions-log tick's response body), not on capability — a one-line YAML edit once the number is known. `V3` is itself state `verification`, unreadable here (no `gh`, no live Actions access). |
| `R2` | The row's own text: "R2 IS OWNER-BLOCKED FROM HERE" — the permission classifier refuses the `requireOwner`→`requireUser` conversion category outright (denied a plain grep for the guard name too). Same blocker as owner row `R2-PERM`, which the owner should answer first. |
| `R3` | Explicitly not a decision to make now — "revisit when the app actually supports more than one instructor," a product-capability trigger that hasn't fired. Not blocked on a question, blocked on a precondition not existing yet. |
| `G3` | The remaining unmeasured constant (`~250ms` per-call latency assumption) can only be confirmed by reading a real scheduled run's Actions log — "unverifiable from this checkout, since Actions cannot run here and there is no `gh` CLI," per the row's own note. |
| `G4` | Real product/cost fork: migrate two Server-Action-hosted features to Route Handlers with their own sub-60s ceiling, or accept the unknown platform ceiling. The row calls this "a genuine product/cost call rather than something an agent should default." |
| `A17` | Owner asked for a control that measurably already exists, fully wired (`Regenerate`, arm-then-confirm). The only instrument left is the owner saying where they looked / what they expected to click — nothing renders under vitest here, so this can't be settled by reading source alone. |
| `A39` | Six of seven fill waves are shipped (`ceab414` through `de1e84e`). The seventh — flipping `INCREMENTAL_ROUTE_ENABLED` — is explicitly, in the row's own words, "NOT AGENT-STARTABLE: it needs the owner eight-item walk, five items of which have no possible in-repo instrument, because nothing renders under this vitest." |
| `RES-FILL-4` | Row states directly: "OWNER: repo owner first (which behaviour is wanted)" — whether a partial incremental run and a deadline-stopped whole run should show class-trends signal the same way. |
| `RES-FILL-7` | Row states directly: a reader-experience judgement on whether a mid-run column reorder disorients an instructor — "OWNER: repo owner first... then whoever owns `incrementalRunPlan.ts` if the fallback is needed." |
| `RES-FILL-11` | Row states directly: "STEP: after the A39 fill ships... after an owner ruling on the intended behaviour" — the two candidate fixes for a stale-URL edit-persistence collision trade against each other and need a decision on what SHOULD happen. |
| `RES-FILL-13` | Explicitly no in-repo instrument possible ("the only real enforcer... is a render"), and explicitly optional: "a first-arrival latch is the proposed fix if the owner wants it, not proposed as required work." |

---

## Bucket 3 — STALE / MAYBE-DONE (19 rows)

Flagged for the owner to confirm-and-close, not to build. Each line says what
was measured and how, and is careful to say "likely superseded" rather than
"done," per the brief's discipline rule.

| id | Why it looks superseded / already satisfied |
|---|---|
| `R4` | Row's own text: "WAVE 1 SHIPPED 2026-09-27 AT `a77f447` AND THE EXPOSURE IS CLOSED AT BOTH GUARDS" — commit verified to exist. No further wave is described. |
| `G5` | Row's own text, verbatim: "WAVE 2 SHIPPED 2026-09-27 AT `2aa5c13`, SO G5 IS COMPLETE." Commit verified to exist. |
| `A12` | Disclosure work shipped at `b7e62fe`/`917d29f` per the row. Its one open residual (re-run identity, RES-2/RES-3) is explicitly handed to `A37` (bucket 1) — this row's remaining substance is a duplicate of that hand-off, not new scope. |
| `A13` | Same two commits as `A12`. Remaining residuals: RES-7 (a comment-satisfied test fix, small, agent-startable whenever a chunk next touches that file) and RES-4/RES-5 (owner-verification-only: real screen, real contrast — unverifiable here by construction). |
| `A14` | Main defect (student zip losing student) fixed at `cb478e9` per the row. Three residuals remain, none of which is "the same bug live again": two are explicit owner decisions (real Canvas zip filenames; whether to fix a deliberately-left phantom-row collision) and one is a small agent-startable disclosure fix. |
| `L14` | Wrapper (`npm run test:paths`) shipped at `c80fa68` per the row, with most residuals discharged or accepted-by-design. Two remain: R4 (owner decision on whether `runVerify` gets a caller) and R8 (a `docs/REGRESSION.md` baseline entry, small and agent-startable). |
| `A19` | Feature shipped at `3d2f07f`/`26bf0d0`/`33f7557` per the row. Five residuals remain (RES-4 through RES-8), mostly owner or "no automated instrument possible" reviewer-convention items — none is the original feature request being unbuilt. |
| `A22` | Mostly shipped at `7375a21`/`4dad288` per the row. One item (RES-A22-3, reading `directoryRoots` in `runtime-import-graph.ts`) is unresolved and small. |
| `A32` | Shipped through round 2 at `2fef046` per the row (commit verified). Two residuals remain: B2 (owner decision, the two-clock fork) and RULING 68/M8 (a doc citation re-pin the row says is "MINE and not yet applied"). |
| `A33` | Row's own text: "SHIPPED 2026-09-23 AT `6aed083`" (verified) — no further work stated anywhere in the note. |
| `A40` | Shipped through `19cf77b` (verified) per the row. One item remains explicitly with the owner: B4, whether the cross-assignment rubric fallback should exist at all. |
| `A44` | Row's own text: both waves shipped, and its two stated open obligations are explicitly closed later in the same note at `166ce6c` and `021e6a9` (both verified to exist). Nothing left stated as open. |
| `A40-D7` | Filed as a retrospective "class" naming four already-fixed instrument-scope mismatches; the row's own remedy is "not more instruments... the habit of checking," i.e., no further concrete build is proposed. Candidate to fold into `docs/loop/traps-spec.md` as a lesson rather than stay a backlog row. |
| `A46` | Shipped in substance through `2f06261` per the row. Two residuals remain, both explicitly owner items: the disambiguated label's wording, and a live-Canvas-only edge case (shared `userId` across submissions) the row says "needs a live Canvas; stays a residual with an owner." |
| `RES-FILL-1` | **Directly verified**: `reconcile.ts:8-20` already imports `./prompts` (not `./rubric`) and its header already states the resolution; `runtime-import-graph.test.ts:655-664` already documents it. |
| `RES-FILL-8` | **Directly verified**: `wc -l src/app/actions/grading.ts` → 941, at/under the `-le 941` bound the row needed reconciled against `RES-W-7`. |
| `RES-FILL-9` | **Directly verified** — same evidence as `RES-FILL-1` (same two files, same claim). |
| `RES-FILL-10` | **Directly verified**: `extraction.ts:130-166` already carries the conditional contract and cites `RES-FILL-10` and the zero-occurrence proof by name. |
| `RES-FILL-12` | **Directly verified**: `reconcile.ts`'s header already states the RULING 134 supersession in the terms the row asked for. |

---

## Bucket 4 — DUPLICATE / FOLDS-INTO (1 row)

| id | Folds into |
|---|---|
| `N15-rubric-picture` | `A39` — A39's own note says its rubric-picture scoping pass "concluded that row is a WAVE of A39 rather than an independent item." The screen-capture-to-transcription mechanism it needed (N14) has since shipped, so scoping it independently would duplicate ground A39's interaction-cost work already covers. |

---

## Could not classify (1 row)

`A40-D5` does not fit any of the four buckets cleanly, and forcing it into
one would misstate its actual status:

- It is not **agent-startable now**: the row states plainly "an instrument
  written now cannot fail" — the harmful code path (something reading the
  `upload:<archiveName>` rubric-origin column back into a loader) does not
  exist yet, so there is nothing to build a red test against today.
- It is not **owner-dependent**: no decision or credential is needed, only a
  future code change elsewhere.
- It is not **stale/maybe-done**: nothing has shipped against it.
- It is not a **duplicate**.

It is best described as **blocked on a precondition that does not exist
yet** ("becomes buildable the moment a reader exists") — closer to `R3`'s
shape (a trigger, not a question) than to any owner-dependent row, but with
no product/capability decision behind the trigger, only a future code
change. Recommend leaving it as its own bucket-less watch item rather than
mis-filing it.

---

## Owner-state rows (5) — one-line disposition

| id | Disposition |
|---|---|
| `N15a` | Returned to unscoped deliberately after a defective scope check (8 blockers). Open product fork: repeated single uploads (measurably worse than the existing zip path per the census) vs. one multi-select upload (close to the existing zip path) vs. dropping the row; the row's own text recommends the multi-select reading or dropping. |
| `A3` | Owner already answered the persistence fork (DECISION 11: redesign around provenance, not recall) — needs a fresh scope written from that new premise; the existing scope was written against the superseded one and nothing has been re-scoped yet. |
| `R2-PERM` | The permission classifier refuses the entire `requireOwner`→`requireUser` conversion category for the ~91 remaining sites. Owner choice needed among: (a) adjust the rule, (b) leave the remainder on the permissive alias, (c) close R2 as partially delivered. |
| `R2-HDR` | `canvas-inbox.ts`'s header comment asserts every action is owner-gated; all nineteen are actually permissive after `3eb2c8b`. Same classifier denied the comment fix once. Owner choice: (a) direct the correction, (b) do it themselves, (c) leave it. |
| `SEC-F4` | Any approved account can delete entries in a shared knowledge library the code labels "owner-curated" — the guard and the name disagree and only the owner knows which is wrong. Needs a yes/no on whether cross-tenant sharing of that library is intended. |

---

## Gate

`npm run docs:gate` run after writing this file; result and `git status
--short` reported in the handoff message, not duplicated here since this
file is not itself the place to record a gate run's outcome.
