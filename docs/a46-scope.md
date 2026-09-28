# A46 scope: concurrent and incremental grading

Backlog row A46 (`docs/BACKLOG.md:130`, read via `grep -a -n "A46" docs/BACKLOG.md`
this pass). **First-check, per the brief:** `ls docs/a46-*.md` before this file
existed returned nothing, exit 2; `git log --oneline -3 -- docs/a46-scope.md`
returned nothing, exit 0 — no prior scope exists. This is round 1 of this
activity.

**The headline finding, stated before anything else because it changes what
this document's job is:** the remedy A46 asks for is not undesigned. Backlog
row A39's own architecture and wave-plan passes — both already at their
terminal round under `AGENTS.md` "Two rounds, then ask" — specify almost
exactly this mechanism for paths A and B, in detail, and it is unbuilt. Section
1 below is the measurement proving that. This document's job is therefore not
to design a second concurrent-grading mechanism; it is to verify A46's own
claims, point precisely at what A39 already answers, name what A39 does **not**
answer (a real, narrower gap), and put one terminating fork to the owner about
disposal.

Every quantity below names the command that produced it. Every absence claim
carries a canary in the same call. No file under `src/` or any `docs/a39-*`,
`docs/a44-*`, `docs/g4-*`, `docs/g5-*` file was opened for writing — this
document's write set is exactly `docs/a46-scope.md`, verified at the end.

---

## 0. The row's own four measured claims, re-verified

| Claim | Re-measured | Verdict |
|---|---|---|
| `gradeStudentEntries` is a sequential `for` loop, one model call per student | `grep -n "for (let i = 0; i < limitedEntries.length" src/lib/grade/engine.ts` → `:215` | **HOLDS** |
| A deliberate `await sleep` between iterations | `grep -n "await sleep(interRequestDelayMs)" src/lib/grade/engine.ts` → `:286` | **HOLDS** |
| `DEFAULT_INTER_REQUEST_DELAY_MS = 1200` | `grep -n "DEFAULT_INTER_REQUEST_DELAY_MS" src/lib/gemini.ts` → `:67` | **HOLDS** |
| `GradingTab.tsx:513` renders results only when `run.results.length > 0` | `grep -n "run.results.length" src/app/components/GradingTab.tsx` → `:455` (the empty-state sibling, `=== 0`) and `:513` (`> 0`) | **HOLDS, exact line survives** |
| `run` is the action's single return value | `page.tsx:63`, unchanged since A39's own census (re-opened this pass) | **HOLDS** |

**One correction, found by measurement, not assumed from the brief.** The task
brief that filed this row (and, upstream of it, A39's census on 2026-09-23)
treats `GradingTab.tsx` as a large file near the 1000-line ceiling — true in
earlier passes, but **stale now**: `wc -l src/app/components/GradingTab.tsx` →
**566**. `src/app/actions/grading.ts` is unchanged at **941**
(`wc -l src/app/actions/grading.ts`), close to the 1000 ceiling as the row
states. The shrink is a side effect of A39's own already-landed extraction
waves (3a-i, 3a-ii — section 1.2). This matters for section 6: no wave this
document names needs a ceiling stop on `GradingTab.tsx`.

`src/lib/grade/engine.ts` already carries an elapsed-aware `deadlineMs` on
`GradingRunOptions` (`:141`, read at `:196`, checked at `:216` and `:284`), but
it is **only ever set from the unattended workflow path**:
`grep -n "deadlineMs" src/app/actions/grading.ts` → `:732`,
`const gradingRunOptions: GradingRunOptions = runDeadlineMs !== undefined ? { deadlineMs: runDeadlineMs } : {};`,
and `runDeadlineMs` is only populated by
`src/lib/workflows/registry/steps.grading-run.ts:479,547`
(`repoGradingStopAt(helpers.deadlineMs, Date.now())`). The **attended** path
(`page.tsx` → `useActionState(gradeAction, ...)`) never sets `runDeadlineMs`, so
`deadlineMs` is `undefined` there and the loop runs unbounded, confirming the
row's claim about the attended path specifically, not just the shared code.

---

## 1. A39's Seam 1 / Wave 4 already specifies this remedy for paths A and B

### 1.1 What exists, and where

`docs/a39-architecture.md` (revision 2, its own header: "**This is the LAST
revision of this artifact**", consuming `docs/a39-rulings.md` 6ccacf4 against
`docs/a39-check.md`) contains **Section 4, "Seam 1: incremental delivery,
which is the same change as survival"** (`:930-1382`). It specifies, in detail
matching this row's own four required questions:

- A client-driven bounded-concurrency pool (`useIncrementalGradingRun.ts`,
  ported from the shipped `useRepoGradesBulkGrade.ts`) over a per-item Route
  Handler at `maxDuration = 60` (`src/app/api/grade-run-item/route.ts`, new),
  fed by a prep Server Action (`prepareGradingRunAction`, new file
  `grading-incremental.ts`) that does once, before any grading call, everything
  the run must not do N times (`:1003-1012`).
- `INCREMENTAL_CONCURRENCY = 3`, matching `BULK_GRADE_CONCURRENCY`
  (`repoGradesBulkGrade.ts:143`) — the same number, same provider, already in
  production (section 2.1 below).
- Ordering-safe reconciliation: tickets carry a stable `sourceIndex` assigned
  at ticket-build time (source order, before any call is dispatched);
  `mergeArrivedResults(tickets, arrived)` returns the dense,
  `sourceIndex`-ordered projection of arrived rows only — "a row never moves,
  it only appears" (`a39-architecture.md:1161-1167`). A pending row renders as
  **no row at all** (RULING 30, `:1194-1208`); the outstanding count lives in
  a progress line, not a placeholder row.
- Per-item isolation: a failed item becomes one `grading-failed` row; one
  failure never aborts the pool (`:1210-1215`).
- Cancellation that keeps every already-graded row and stops further spend
  (`:1217-1234`).

`docs/a39-waves.md` (also its own header: "**REVISION 2, TERMINAL** ... there
is no revision 3", `AGENTS.md` "Two rounds, then ask") turns this into
**Section 8.4, "Wave 4 - the run delivers row 1 while row 7 is still
running"** (`:1617` onward — the section runs to `:2505`, about 890 lines),
three ordered commits (4a: a frozen oracle over today's reconciliation, 4b:
`engine.ts`'s reconciliation becomes a pure `reconcileRun` projection, 4c: the
transport, the pool and the seam), each with a stated write set, a size
budget, a gate command, and a watched-failure requirement. I opened 4a and 4b
in full (`:1621-1721`) and confirmed both carry `npm run test:paths --`
commands, never a raw multi-path `vitest run`, and explicit `wc -l` /
`@(Get-Content).Count` size bounds. I did **not** re-open every line of 4c
(`:1723-2505`) — see the residual this creates, R4 below.

### 1.2 None of it is built; most of the surrounding waves already are

```
ls src/app/api/grade-run-item/route.ts        -> No such file or directory, exit 2
find src -iname "*incrementalRunPlan*" -o -iname "*useIncrementalGradingRun*"
                                               -> empty, exit 0 (find's exit alone is
                                                  not trusted; ls above is the real canary)
```

Positive canary that this instrument fires on a file that DOES exist:
`ls src/app/components/repo-grades/repoGradesBulkGrade.ts` → exit 0.

`git log --oneline -12` shows the surrounding waves have landed or been
corrected **today**: `c031050 feat(a39): grading one submission no longer
requires a zip` (wave 1), `2b5b4c7 feat(a39): provenance on all three
producers...` (wave 2's corrective fix, landed after `docs/a39-build-check.md`
found the original wave 2 DEFECTIVE — 3 blockers — and
`docs/a39-build-rulings.md` RULING 55-57 dispatched the fix). `docs/a39-build-check.md`'s
own "Snapshot caveat" states wave 3b and wave 5 landed (`5122b49`, `775f26b`)
during that same check. **Wave 4 (this row's whole subject) is the one wave in
the plan with nothing built.**

### 1.3 Wave 4 is not blocked by any open question

`docs/a39-waves-rulings.md` RULING 37 sent exactly one terminating question to
the owner — the extraction shape for **wave 3a-i** (a different wave, the
Snapshot panel). `docs/owner-decisions-2026-09-23.md` DECISION 7 (confirmed by
`grep -n "DECISION 7" docs/owner-decisions-2026-09-23.md` → `:210`) answered it
with option (a), and 3a-i shipped (`87fb303`, later found DEFECTIVE and
corrected). `docs/g4-scope.md`'s own disposition table (§4, "Corrected framing
(m1)") already establishes that 3a-i's write set does **not** intersect Commit
4c's. **Wave 4 has no open owner question against it.** Its only listed
blocker is its position in the dispatch schedule — slot 4, after wave 2 and
3b (`docs/a39-waves.md:612-621`) — and those have now landed.

### 1.4 The one thing I could not confirm from Wave 4's own text

`docs/a39-waves-rulings.md` RULING 39 found a real defect in round 1 of the
wave plan specifically inside Wave 4's own instrument (W4-9, the
press-twice guard) and required revision 2 to fix it or say it cannot be
measured. I did not re-open enough of Commit 4c's ~800 remaining lines
(`a39-waves.md:1723-2505`) to confirm RULING 39, 40 and 41 were actually
closed there, as opposed to merely required to be. **This is not a finding
against Wave 4** — it is a limit of this pass, stated rather than assumed
(see R4).

---

## 2. The row's four required questions, answered against the tree

### 2.1 Why the 1200ms sleep exists

Not a guess: `README.md:36`, added in the same commit that introduced the
constant (`git show 76d834f -- README.md`), states it in the app's own words:

> "The grading pipeline uses these limits to reduce free-tier quota spikes by
> capping per-run workload and pacing requests."

So the row's own suspicion is confirmed, by the repository's own documentation
rather than by inference: **it is quota protection**, not an arbitrary
constant. That said, it is not a hard, measured provider ceiling either — this
repo already runs **3-way concurrent grading calls, with zero inter-request
spacing, in production, on the same Gemini transport**: `BULK_GRADE_CONCURRENCY
= 3` (`repoGradesBulkGrade.ts:143`), whose own doc comment (`:132-142`, opened
this pass) states the reason is "rate limits on both the GitHub side and the
model side... three is a deliberate compromise." `gradeRepoAction` grades one
repo per call, so `engine.ts`'s own sleep guard never fires on that path
either (A39 architecture `:1330-1334`, re-confirmed by the fact that path E's
loop is per-repo, not per-student-batch). **Direction this settles: concurrency
of 3 for grading calls is a measured production precedent in this exact repo,
not an unbounded removal of a guard whose purpose is unknown.** `INCREMENTAL_CONCURRENCY
= 3` in Wave 4 reuses that number for that reason (`a39-architecture.md:1038,1335`).

### 2.2 The platform bound

Already the subject of a separate, already-ruled backlog row: `docs/g4-scope.md`
names A39's Commit 4c explicitly as the consumer of RULING 76's elapsed-aware
budget shape, and hands over the exact constant (`docs/g4-scope.md:627-634`,
"Wave A — HANDED OVER... Owner: A39's Commit 4c implementer wave... Constant to
build against: `TOTAL_BUDGET_MS = 50_000` with a 2-second reserve (§9 R4/RULING
77) — not `54_000`."). The route-handler-plus-client-pool shape Wave 4 already
specifies (§1.1 above) is precisely the shape G4 §3's own table calls the only
one with all three properties (delivers row 1 early, resets the clock per
call, declares a ceiling) — `docs/g4-scope.md:939-947`, ported verbatim into
`a39-architecture.md:934-947`. **This question is answered, and the answer is
already the shape Wave 4 specifies; the one open item is the constant, and G4
already named it.**

### 2.3 Whether incremental display separates from concurrency

A39's architecture already asked this exact question and answered it, not by
omission: `docs/a39-architecture.md:1317-1325` ("What replaces the 1.2s spacer
(RULING 31)") states plainly that "deleting a spacer and tripling parallelism
in the same wave is two changes wearing one name" and then bundles them anyway,
citing path E's production precedent (2.1 above) as the reason concurrency is
not a fresh, unbounded risk. **This is an existing ruling, not an open
question** — A46 does not need to re-decide it, and re-deciding it here would
be exactly the "seat-derived reading that may not foreclose a branch when an
owner decision exists" trap (`docs/loop/traps-spec.md:108-129`) run in
reverse: there is no owner decision contradicting it, so it stands.

Separately, and this is where the row's own instinct still has force:
**incremental display without concurrency (`INCREMENTAL_CONCURRENCY = 1`) is a
strictly smaller change than Wave 4 as specified**, since Wave 4's contract
(`buildRunItemRequests`/`mergeArrivedResults`, pure and concurrency-agnostic
per `a39-architecture.md:1036-1040`) does not hard-code the worker count
anywhere the pool itself needs it fixed at 3. If the owner wants a narrower
first landing, "ship Commit 4c with `INCREMENTAL_CONCURRENCY = 1`" is a real,
smaller option already inside the existing design, not a new one — named in
the fork (section 5) rather than decided here, because Wave 4 is a checked,
terminal artifact and narrowing its concurrency constant is exactly the kind
of change that belongs to whoever dispatches it, informed by the fork's
answer.

### 2.4 What a platform kill leaves persisted

Different from G4 §6.5's write-ordering rule, because that rule was built for
**unattended, batch-at-the-end** paths (cron-triggered grading, where a status
marker can be written before the record it depends on). This row's subject —
the attended UI path — is a different shape by the architecture's own explicit
statement: **"Seam 1 adds no new persisted CONTROL. Cancel is a run action,
progress is derived, the accumulator is run state; nothing here survives a
reload."** (`a39-architecture.md:1369-1371`). A platform kill (or a page
reload) during an incremental run loses the in-progress run's client-side
state entirely — every arrived row and every in-flight call — because nothing
about the run itself is durable until the instructor takes a separate,
later action (posting grades, saving a draft). This is a real, named cost the
architecture accepts rather than a gap A46 discovers: **there is no
half-written-looks-complete risk on this path (G4 §6.5's worse failure mode),
because nothing is marked "done" mid-run at all** — but there is a full loss
of an in-progress run's un-persisted rows on any kill, which the census's own
grading disclosure work never had to consider because the whole-run path loses
everything on a kill too. Carried as R5 below (not fixed here — it is a UX/product
question about whether an in-progress incremental run should autosave a draft,
which no artifact in this tree has yet asked).

---

## 3. The identity constraint (A44), checked rather than assumed

The task brief requires this row to hold A44's identity invariants as a
constraint from the start. Two things were checkable in the tree today, one
was not.

**CHECKED, and it holds:** A44's collision refusal already fires **before any
ticket could exist**, for the zip path. `extractStudentEntries`
(`src/lib/grade/extraction.ts:134-149`, opened this pass) calls
`describeCollisionRefusal(decideCollisionRefusal(...))` at `:145` and
**throws** on a positive refusal, strictly before `groupSubmissionsByStudent`
is ever called at `:149`. `a39-architecture.md:1007` states
`prepareGradingRunAction` calls exactly this function
("`extractStudentEntries`, `extraction.ts:134`, for a zip") to build its
ticket list. **So Wave 4's zip path inherits A44's refusal automatically,
with no additional code** — the refusal fires during the SAME prep step that
builds tickets, before the pool exists, let alone before any model call.

**CHECKED, and it holds:** ordering safety. Wave 4's `mergeArrivedResults`
keys every arrived result by a `sourceIndex` fixed at ticket-build time
(§1.1), never by "whichever result the pool saw next." A44's concern —
"a concurrent design that reorders completions must keep the identity key
attached to each result rather than relying on arrival order" — is
structurally satisfied here: which student a given Route Handler call is
grading is fixed by the ticket it was dispatched with, not inferred from
response order.

**NOT CHECKED, and stated as a residual rather than assumed either way:**
`docs/a44-test-notes.md` itself records that R5 ("the refusal is EMITTED by
the producer") is "**KEPT VERBATIM**... Still ARGUED, not executed" (`:52`,
`:936` area) — meaning even on TODAY's whole-run path, no executing test
proves the refusal fires before a model call is spent; it is argued from
reading `extraction.ts:145` sitting before `:149`, exactly as I argued it two
paragraphs up. **My check is the same class of evidence A44's own test notes
already flagged as insufficient for the whole-run path**, and Wave 4 would
inherit that same unexecuted-guarantee status on the incremental path too,
not a worse one. This is R1 below.

**Path B (Canvas), not checked at all this pass:** `extractCanvasEntries`
(`extraction.ts:150` onward) was opened only far enough to confirm its
signature; whether Canvas submissions can collide the same way a zip's
filenames can was not measured here. Carried as R2.

---

## 4. Leverage, refined against what the tree actually shows

`docs/loop/leverage.md`'s CONCURRENCY row (added `ba1bfa5`, same day) already
carries this row's own citations verbatim. One precision this scope adds,
because it changes what the fork in section 5 is actually asking:

**The mechanism Wave 4 builds is POOLED CONCURRENCY (N model calls in flight
at once) plus PER-ITEM INCREMENTAL DELIVERY (a row renders as its own call
returns) over a FIXED, already-assembled batch of tickets.** It is not, and
does not claim to be, "grading starts on submission 2 while the instructor is
still uploading submission 1" in the literal sense — on paths A and B, every
submission the pool will ever grade is already fully in hand
(`extractStudentEntries`/`extractCanvasEntries` return before the pool starts;
`prepareGradingRunAction`'s ticket list is fixed at that point). The chat
analogy the owner used is best read as: **the app can have three gradings
running at once and can show a finished one immediately, while a chat has
exactly one exchange in flight and shows nothing until that one resolves** —
that is the real, checkable mechanism (SCALE's concurrency-of-N, not a growing
queue), and it is what Wave 4 delivers.

**What Wave 4 does NOT deliver, and what the owner's literal wording ("upload
one, have it start grading while you upload another") most precisely
describes:** a running pool that can **accept a new ticket after it has
already started**, so item 2's grading begins while the instructor is still
assembling item 3 (or even item 2, if the workflow were per-file rather than
per-batch upload). Nothing in `a39-architecture.md` or `a39-waves.md` builds
this — `prepareGradingRunAction`'s contract returns one fixed `tickets` array;
there is no "add a ticket to an in-flight run" operation anywhere in the
seam. This is a genuinely separate, harder mechanism (an open work queue, not
a bounded pool over a closed list), and no artifact in this tree designs it.
Named as the fork's second option below, not designed here.

---

## 5. The fork, put once, shaped so every answer ends this activity

**Which of the following is A46's job**, given that (X) is already fully
specified, terminal, and simply not yet built, and (Y) is real but is not
designed anywhere:

- **(X) A46 = A39's Wave 4, unchanged in shape.** A46 is discharged by
  dispatching `docs/a39-waves.md` §8.4 (Commits 4a/4b/4c) as written, with the
  one net-new obligation this scope adds (§7, W-A46-1: an executing test that
  the collision refusal fires before any ticket is built on the incremental
  path — closing the "ARGUED not EXECUTED" gap in R1, which A44's own test
  notes already flagged for the whole-run path and which this row would
  otherwise inherit silently). A46 is then **closed as a duplicate**, pointing
  at A39, once Wave 4 ships. This is what "the app currently does the
  opposite" resolves to: a fix that already exists on paper and needs
  building, not a fresh design.
- **(Y) A46 additionally covers the literal open-queue mechanism** (§4's
  second paragraph): grading begins on an already-uploaded item while a later
  item is still being produced/uploaded, for a workflow this app does not
  currently offer on any path (every existing path assembles the whole batch
  — zip, Canvas fetch, GitHub queue — before any grading starts). This is new
  work with no existing design, would need its own architecture pass (a new
  per-file upload-and-queue UI, not a variant of Wave 4's pool), and should be
  filed as its own follow-on row, sequenced **after** Wave 4 ships, not folded
  into it.

**Recommendation: (X) now, (Y) as a named follow-on, not a blocker.** Wave 4
already delivers the measured felt loss this row's own evidence names (all
four bullets under "What I measured before filing" in the row) — the
sequential loop, the sleep, and the all-or-nothing render. (Y) answers a
narrower literal reading of the owner's chat analogy that no existing surface
in this app supports on either side (the chat doesn't literally grade item 2
while item 1 is mid-paste either — it queues on the human's typing exactly
the way this app's zip path queues on the human's zip-assembly). Filing (Y)
separately means it gets designed with real acceptance criteria instead of
riding in as an unstated expansion of Wave 4's already-checked contract.

Every answer ends this activity: (X) alone closes A46 by pointing at an
existing wave; (X)+(Y) closes A46's build half now and files a second row for
the rest; neither answer reopens Wave 4's own terminal design, which per
`AGENTS.md` has no round 3 left and is not this document's to re-argue.

---

## 6. Disposition table

Because this scope substantially redirects the row's own framing rather than
inventing a first design, per `iteration-caps.md` entry gate 3.

| A46's own requirement | Disposition | Detail |
|---|---|---|
| "Find out WHY the 1200ms sleep exists" | **KEPT, answered.** | §2.1 — `README.md:36`, quota protection; path E's zero-spacing 3x precedent bounds the risk of removing it. |
| "State the platform bound" | **HANDED OVER, already handed over once.** | §2.2 — `docs/g4-scope.md` already names A39's Commit 4c as the receiver, with the exact constant. Nothing for A46 to add. |
| "Whether incremental display separates from concurrency" | **KEPT, already ruled, not reopened.** | §2.3 — `a39-architecture.md:1317-1325`. The narrower `INCREMENTAL_CONCURRENCY = 1` landing is named as an option inside the fork (§5), not decided. |
| "What a platform kill leaves persisted" | **KEPT, answered — and it is a different question on this path than on G4's.** | §2.4 — nothing is durable mid-run on this path at all; the real cost is total loss of in-progress rows on any kill/reload, carried as R5. |
| "Do not let this compromise attribution" (A44 constraint) | **KEPT, checked, one part unverified.** | §3 — collision refusal and ordering both hold by construction; whether the refusal is EXECUTABLY proven (not just argued) is R1, inherited from A44's own test notes, not created here. |
| Implicit assumption: this needs a new design | **WITHDRAWN.** | §1 — the design exists, terminal, at `a39-architecture.md` §4 and `a39-waves.md` §8.4. Enforcer this withdrawal protects: none — nothing in the row itself asserted "no design exists"; it asked four questions a design already answers. |
| "Waves with write sets" | **HANDED OVER to `a39-waves.md` §8.4, plus one new small wave.** | §7. |

---

## 7. Waves with write sets

**W-A39-Wave4 (not authored by this document — dispatch as specified).**
Owner: A39's implementer. Write set, size budgets and gates: exactly
`docs/a39-waves.md:1617-2505` (Commits 4a, 4b, 4c). This document does not
restate or re-derive that content; doing so would create a second, divergent
copy of a checked, terminal artifact. The one thing this document adds:

**W-A46-1 — prove the collision refusal fires before any ticket is built,
executed rather than argued.**
- **Object:** `prepareGradingRunAction`'s ticket list (once Commit 4c exists),
  compared against a fixture zip carrying a manufactured collision (the same
  shape A44's own K1-K4 fixtures use, `docs/a44-test-notes.md:545-573`).
- **Instrument:** call `prepareGradingRunAction` (or, until 4c lands, the
  underlying `extractStudentEntries`) with that fixture; assert it throws /
  returns an error **before** any `grade-run-item` fetch is issued — a spy on
  the fetch/model call asserting zero invocations.
- **Direction of failure:** RED if any model call fires before the refusal is
  raised, or if the refusal never fires on the fixture that today's whole-run
  path (`grading.ts`) already refuses.
- **File(s):** `src/app/actions/grading-incremental.test.ts` (new, once
  Commit 4c's `grading-incremental.ts` exists) — sequenced as part of Commit
  4c, not before it, since its subject does not exist yet. Until then, this
  obligation is recorded here so it is not lost when 4c is scoped for
  dispatch.
- **Owner:** whoever dispatches Commit 4c.
- **Ceiling check:** no file this wave touches is within an order of
  magnitude of the 1000-line ceiling — `grading-incremental.ts` does not exist
  yet and the architecture sizes comparable new files at well under 300 lines
  (`reconcile.ts <= 250`, `a39-waves.md:1651`); `grading.ts` (941) is untouched
  by Wave 4's write set per `a39-architecture.md:975-977` ("new rather than an
  addition to `grading.ts`").

No other wave is authored here. Per the brief's own instruction, a wave that
would touch a file near the ceiling is named and stopped rather than planned
around — none of Wave 4's or W-A46-1's files are near it, so no stop is
triggered.

---

## 8. Residual register

| # | What is not proven now | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| R1 | Whether the collision refusal executably fires before any model call, on either the whole-run or the incremental path — today it is ARGUED (source order) not EXECUTED (a passing test) | Whoever dispatches Commit 4c (and, separately, whoever next touches `grading.ts`'s whole-run path) | W-A46-1 (§7); a parallel test over today's whole-run `gradeAction` would close the same gap for the existing path | RED if a model call is observed before the refusal raises, or if the fixture that should refuse does not | Inside Commit 4c's own commit for the incremental path; a separate, smaller chunk for the whole-run path |
| R2 | Whether Canvas submissions (path B) can collide the way zip filenames can, and whether `extractCanvasEntries` has an equivalent refusal | Whoever scopes path B's share of Wave 4, or a fresh A44-style census scoped to Canvas | Open `extraction.ts`'s `extractCanvasEntries` and `grep` for any refusal call inside it; if none, decide whether Canvas's per-student Canvas user ID already makes the collision class impossible and say why | RED (as a scope defect) if Wave 4 ships path B's incremental grading with no equivalent check and no stated reason one is unnecessary | Before Commit 4c's path-B slice ships |
| R3 | Whether `INCREMENTAL_CONCURRENCY = 3` is the right number against the REAL Gemini free-tier quota (no live key exists here) | Repo owner, live key required | One real run of >3 concurrent grading calls, quota-exceeded response observed or not | Fails if the run is throttled at a rate the owner considers unacceptable | An owner-run timed check after Commit 4c ships, same shape as G4/G5's own R2/R4 residuals |
| R4 | Whether Wave 4's Commit 4c (`a39-waves.md:1723-2505`) actually closes RULING 39 (the W4-9 press-twice instrument), RULING 40 (the whole-run return's consumer) and RULING 41 (the security canary's three checks) — round 1 found these as real defects and revision 2's header claims they are addressed, but this pass did not re-open enough of 4c's text to confirm it | Whoever dispatches Commit 4c | Re-read `a39-waves.md:1723-2505` in full against `a39-waves-rulings.md` RULINGS 39-41 before treating 4c as ready to build | Fails if any of the three rulings' required fix is missing from the text that ships as the implementer's brief | Immediately before Commit 4c is dispatched, not deferred into the build |
| R5 | Whether an in-progress incremental run should autosave a draft so a reload/kill does not lose every un-persisted arrived row — the architecture accepts total loss by design (§2.4) and no artifact has asked whether that acceptance still holds now that the run can last longer (more submissions, real concurrency) | Repo owner — this is a product/UX call, not a defect | None buildable here — nothing renders under vitest, and "should this autosave" is a scope question, not a measurement | N/A — decision residual | Whenever the owner reviews Wave 4's as-built diff, or as a follow-on scope if the answer is yes |
| R6 | The fork in §5 itself — whether (Y), the literal open-queue mechanism, is wanted at all | Repo owner | The fork's own two named options | N/A — decision residual | Answered alongside §5's terminating question; does not block Wave 4's dispatch under (X) |

None of the six residuals above stands in for an instrument that should have
run here instead; each names a real owner and either a real instrument or an
explicit decision step.

---

## 9. Method notes

- Line counts: `wc -l` (Bash) throughout; no `Measure-Object -Line` was used
  anywhere in this pass.
- Every absence claim above (`grade-run-item/route.ts`, `incrementalRunPlan.ts`,
  `useIncrementalGradingRun.ts`) carries a positive canary in the same call
  (§1.2).
- Exit codes were read from the command directly wherever cited (`ls` exit 2
  for the missing route; `find` exit 0 with empty output, explicitly not
  trusted alone per this repo's own `find` caveat).
- No production or test file was mutated to produce any measurement in this
  document. No scratch directory was created inside the repository.
- This document does not re-verify `a39-check.md`, `a39-waves-check.md`, or
  `a39-build-check.md`'s own findings beyond what is cited above — they are
  each already-checked, ruled-on artifacts at or past their own two-round cap,
  and re-arguing them here would be exactly the "third round of the same
  activity" `AGENTS.md` forbids.

---

## Verification of this document's own write set

```
git status --short
```

```
 M docs/css-orphans.md
?? docs/a46-scope.md
```

`M docs/css-orphans.md` is pre-existing and sibling-owned — present in this
session's opening `git status` snapshot before this pass started (see the
conversation's own `gitStatus` context), and neither opened nor touched here.
`?? docs/a46-scope.md` is this pass's own new file. `docs/backlog.yml` was not
read or touched — the A46 row was read exclusively via
`grep -a -n "A46" docs/BACKLOG.md`, per the brief's explicit instruction not to
touch `docs/backlog.yml` while it is being edited elsewhere. No sibling
document (`docs/a40-scope.md`, `docs/r2-wave1-subwaves.md`) was opened, read,
or referenced. No `git stash`, `git add -A`, or `git checkout --` was run on
any path. This document's own write set is exactly `docs/a46-scope.md`.
