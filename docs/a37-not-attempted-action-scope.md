# A37 scope: an action the instructor can take on a not-attempted row

Architecture seat, 2026-10-08. Branch main, measured against HEAD in this
checkout. This is a scope (design) artifact; it writes no production code. A
`loop-checker` reads it before any build wave.

Every quantity below names the command or `file:line` that produced it, run in
Git Bash from the repo root unless marked PowerShell. `wc -l` is used for line
counts and agrees with `@(Get-Content).Count` in this repo
(`docs/loop/this-repo.md` section 3); the two files I keep nearest the ceiling
(`GradingResults.tsx`, `grading.ts`) are flagged for a PowerShell
`@(Get-Content).Count` re-measure at the wave gate.

---

## 0. The one-paragraph answer

A31 shipped not-attempted disclosure copy that names no action because nothing
on the grading path recorded WHICH surface produced the row. The fix is a
source tag captured at grade time: a new optional `source` member on
`GradingRunOptions` (input) that the engine stamps onto each not-attempted row
(`NotAttemptedOutcome.source`, output), read by the existing copy leaf
`ungradedDisclosure.ts` to select per-surface action copy. This is chosen over
a `GradingResults` prop for three measured reasons (section 4). It names only
MANUAL and EXISTING-control actions, never an in-app re-run, so it does not
depend on the row-identity question that is STILL unanswered at HEAD
(section 1) - the in-app re-run control stays out of scope and blocked
(section 10, RES-A37-RERUN).

---

## 1. Precondition: the identity question is STILL unanswered - and what that does and does not block

The brief requires confirming, against HEAD, whether A12/A13 added a stable id
or re-run key to `GradeResult`/`GradingRun`. **They did not.** Proven three
ways:

1. **types.ts at HEAD carries no id and no re-run key.** `GradeResultBase`
   (`src/lib/grade/types.ts:238-304`), `GradedResult` (`:310-313`),
   `UngradedResult` (`:323-326`) and `GradingRun` (`:380-401`) have no `id`
   field. `NotAttemptedOutcome.sourceIndex` (`:176`) carries its own comment:
   "a caller that treats it as a re-run key re-runs the wrong student"
   (`:173-176`). Command: `grep -n "id\b\|rerun\|re-run key" src/lib/grade/types.ts`
   returns no id/key field on any result or run type (only the sourceIndex
   warning).

2. **The A12/A13 ship commits touched neither identity file.**
   `git show --stat --oneline b7e62fe` lists only `GradingResults.tsx`,
   `gradingResultsHelpers.test.ts`, `ungradedDisclosure.test.ts`,
   `ungradedDisclosure.ts`. `git show --stat --oneline 917d29f` lists
   `GradingResults.tsx`, `gradingResultsHelpers.test.ts`,
   `ungradedRowLabel.test.ts`, `ungradedRowLabel.ts`, `page.module.css`.
   Neither touches `src/lib/grade/types.ts` or `src/app/actions/github.ts`,
   the two files where a re-run identity would have to appear. They shipped the
   DISCLOSURE (a visible marker + corrected copy), not identity.

3. **A12 and A13's own backlog notes say so.** Both rows (state=verification)
   record re-run identity as "DEFERRED, NOT DROPPED ... handed to A37", and A13
   states outright "repoDigestToEmbeddedEntry ... sets no gradedRepo/gradedRef/
   userId ... sourceIndex is not a re-run key."

### What this blocks, and what it does not

The brief's STOP clause reads: "If the identity question is STILL unanswered
(no re-run key exists), STOP and report that A37 is still blocked (a per-surface
remedy NAMING A RE-RUN would ship a second false sentence) - do not scope a
RE-RUN CONTROL on an absent identity." Its parenthetical and trailing clause
both bind the **in-app re-run control** specifically.

A37's title question - "whether a source discriminator is added at all, and if
so as a prop or a `GradingRunOptions` member" - and the per-surface action copy
the brief's SCOPE DECISION 2 asks for do NOT name an in-app re-run. SCOPE
DECISION 2 explicitly offers, for the zip surface where "no control exists
today," the option to "state the manual path"; the GitHub copy points at an
EXISTING control; the Canvas copy says nothing. None re-dispatches a specific
dropped row, so none needs an identity, and none ships a false sentence.

**Ruling I take, recorded as MY reading for the checker to scrutinise, not an
owner decision:** the STOP binds only the in-app re-run control sub-scope. The
discriminator decision and the manual/existing-control per-surface copy proceed,
because (a) they name no re-run, (b) they are the brief's own DELIVER items, and
(c) the brief's SCOPE DECISION 2 was written to handle exactly the "no control
exists today" (absent-identity) case. The in-app re-run control is carried OUT
of this scope as RES-A37-RERUN (section 10), still blocked on the absent
identity. If the checker reads the STOP as binding the WHOLE item, the correct
disposal is (b) Reduce - put to the owner the single fork "does A37 ship the
identity-free actionable-copy remedy now, or wait for a row-identity design
first" - and I recommend shipping now, because the copy is honest without
identity and A31's gap is live today.

---

## 2. Measured corrections to the A37 backlog row (the tree moved since it was filed)

The A37 row's instrument was measured 2026-09-23. Three of its facts are now
stale. I report the conflict rather than adopting either value silently
(`docs/loop/traps-spec.md`, "no unmeasured number"; the repo rule "refuse a
ruling you can disprove").

| A37 row claim (2026-09-23) | HEAD (2026-10-08) | Command |
|---|---|---|
| "GradingRunOptions has exactly one member, deadlineMs" (`:127-133`) | FOUR members: `deadlineMs` (:285), `commentSplit` (:288), `harshness` (:291), `feedbackWordTarget` (:294); interface at `engine.ts:279` | `grep -n "export interface GradingRunOptions\|readonly " src/lib/grade/engine.ts` |
| "three mounts - GithubGradingPanel.tsx:852, GradingTab.tsx:427, LiveFeedPanel.tsx:430" | FOUR mounts, lines shifted: `GithubGradingPanel.tsx:853`, `GradingTab.tsx:569`, `LiveFeedPanel.tsx:433`, and a NEW one `grading-chat/GradingChatPanel.tsx:519` | `grep -rn "<GradingResults" src --include=*.tsx` |
| "the leaf cannot distinguish the zip surface from the GitHub surface by the props it already receives" | A surface-discriminating prop ALREADY EXISTS: `editsSurface: string` (`GradingResults.tsx:140`), supplied distinctly by all four mounts (section 3). It does NOT fully solve A37 (section 4), but the premise "no distinguishing prop exists" is now false. | `grep -rn "editsSurface" src --include=*.tsx \| grep -v test` |

The row's UNDERLYING point survives all three: no member of `GradingRunOptions`
is a source tag, and `editsSurface` conflates zip with Canvas (section 3), so a
source discriminator for per-surface action copy still has to be added. But the
"does X exist" direction was the expensive one here, so section 3/4 start from
the tree.

---

## 3. Reachability: which not-attempted member reaches which surface

The not-attempted row is produced only by `gradeStudentEntries`
(`src/lib/grade/engine.ts`), which slices its input at
`getGeminiMaxSubmissions()` (`DEFAULT_MAX_SUBMISSIONS = 40`,
`src/lib/gemini.ts:32`) and appends two ascending tails: a run-deadline tail
(`engine.ts:498-511`, `stoppedBy: "run-deadline"` at `:504`) and a
submission-count-bound tail (`engine.ts:512-531`, `stoppedBy:
"submission-count-bound"` at `:517`).

### 3.1 The run-deadline member never reaches the review table (RES-A31-1, re-confirmed at HEAD)

`deadlineMs` reaches the engine only via `GradingRunOptions.deadlineMs`. On the
attended `gradeAction` path it is set only from the `runDeadlineMs` form field
(`src/app/actions/grading.ts:736-739`), and the only writers of that field are
four unattended workflow steps:

```
grep -rn "runDeadlineMs" src --include=*.ts --include=*.tsx | grep -v '\.test\.' | grep 'append\|set('
# steps.grading-cartridge.ts:110, steps.grading-draft-flow.ts:266,
# steps.grading-run.ts:479, steps.grading-run.ts:547  -- all workflow steps
```

Unattended runs render as drafts (`DraftedGradesTab`), never through
`GradingResults`. The attended browser path leaves `deadlineMs` undefined, so
`deadlineStoppedAt` is null and the run-deadline tail is empty
(`deadlineTailStart = deadlineStoppedAt ?? limitedEntries.length`,
`engine.ts:498`). **Therefore `submission-count-bound` is the only
not-attempted member an instructor sees on a `GradingResults` mount.** The
run-deadline member is NOT dead (it ships on draft surfaces) and MUST NOT be
deleted - the leaf's `stoppedBy` switch needs it for exhaustiveness (section 8,
instrument 3).

### 3.2 Which mounts can show a submission-count-bound row

A count-bound row appears only when a batch of more than 40 entries reaches
`gradeStudentEntries`. Traced per mount:

| Mount | `editsSurface` value | Producing call | Batches through the 40-cap `gradeStudentEntries`? | Count-bound row reachable? |
|---|---|---|---|---|
| `GithubGradingPanel.tsx:853` | `"github"` (`:860`) | `github.ts:761 gradeEntries(entries, ...)` where `entries = digests.map(...)` (LLM path) | YES - the whole digest list in one call | **YES** (LLM path). The embedded path `github.ts:751 gradeEntriesEmbedded(...)` does not cap (`grep -n "slice\|maxSubmission" src/lib/embedded-grader/index.ts` is empty) so it never produces one. |
| `GradingTab.tsx:569` | `"canvas"` (`:580`) | zip: `grading.ts:943 gradeSubmissions(zipBuffer, ...)`; Canvas URL: `grading.ts:821 gradeCanvasUrl(canvasUrl, ...)` | YES for both | **YES** (zip AND Canvas-discussion) |
| `LiveFeedPanel.tsx:433` | `"canvas"` (`:442`) | renders a Canvas run (`activeRun`, `:368`) produced by the same `gradeAction` Canvas path | YES | **YES** (Canvas) |
| `GradingChatPanel.tsx:519` | `driver.runKey` = `"grading-chat-" + sessionId` (`useContinuousGradingRun.ts:543`) | `/api/grade-run-item` -> `gradeEntries([resolved], ...)` ONE entry per call (`route.ts:224`) | NO (1 <= 40) | **NO** |

So count-bound rows are reachable on GitHub, zip, and Canvas; never on
grading-chat.

### 3.3 Why `editsSurface` is not a usable source discriminator

`editsSurface` was built to disambiguate a localStorage key, not to name the
grading source. Measured against the table above it yields THREE distinct
values across the reachable surfaces, but the partition is wrong:

- `"github"` isolates GitHub cleanly (only `GithubGradingPanel` emits it).
- `"canvas"` is shared by `GradingTab` (which is the classic **zip/canvas**
  path - its own mount comment says so, `GradingTab.tsx:582`) AND
  `LiveFeedPanel`. It therefore CANNOT tell a zip run from a Canvas run, and the
  zip surface is the one that most needs actionable copy (a zip of >40 students
  is the canonical overflow case).
- `driver.runKey` is a per-session runtime string, not a stable surface tag.

A name-shaped prop does not answer the channel-shaped question. The zip-vs-Canvas
split is the hard case `editsSurface` cannot make.

---

## 4. The discriminator decision

### 4.1 Decision: a `GradingRunOptions.source` member, stamped by the engine onto `NotAttemptedOutcome.source`

The source is captured at grade time by the grading action (which is the true
origin of the surface) and travels WITH the row, so the leaf reads it off
`result.ungraded.source` with no live-state dependency.

### 4.2 Why this over a `GradingResults` prop (DESIGN 2, rejected)

Three measured reasons, each load-bearing:

1. **`GradingResults.tsx` is at 999 of the 1000-line ceiling** (`wc -l
   src/app/components/GradingResults.tsx` = 999;
   `src/file-size-ceiling.structure.test.ts` LIMIT = 1000 at `:41`). A new prop
   threaded through its body risks the ceiling. The stamp-on-the-row design
   needs ZERO change to `GradingResults.tsx`: `classifyRow(result, edit)` is
   already called with the full `result` at `GradingResults.tsx:719`, so a field
   on `result.ungraded` flows into the leaf unchanged.
2. **A `GradingResults` prop could not reliably split zip from Canvas.**
   `GradingTab` serves both under one mount; the only in-component signal is its
   live `source` dropdown state (`GradingTab.tsx:95`, `type GradingMode =
   "zip" | "canvas" | "livefeed" | "github"` at `:43`), which the user can
   change AFTER a run completes, mislabelling a displayed zip run as Canvas.
   This is the A39 provenance-staleness class (`types.ts:390-399` stamps
   `rubricUsed` onto the RUN precisely so a later edit cannot change what a past
   run reports). Stamping `source` at the action captures the true source once,
   immune to the dropdown.
3. **The "reaches both" criterion favours the member.** The engine is the layer
   that produces the count-bound row and holds the count; the member reaches it,
   and because the engine stamps the value onto the row, it also reaches the
   surface leaf for free. A prop reaches only the surface.

### 4.3 Why not reuse the existing `editsSurface` prop

It is a free-form storage-key string that conflates zip and Canvas (section 3.3)
and carries a dynamic grading-chat value; coupling copy selection to it would
break the moment the storage key changes and would still fail the zip/Canvas
split. Leave `editsSurface` to its storage-key job.

### 4.4 Distinct values and DIRECTION OF FAILURE

`GradingSource = "zip" | "canvas" | "github"` - three values, one per surface
that can show a count-bound row. Count-bound-reachable surfaces: zip, canvas,
github (three). **Distinct values (3) >= surfaces (3), so per-surface copy IS
possible; the DIRECTION-OF-FAILURE collapse (fewer values than surfaces) does
NOT fire.** grading-chat is excluded from the union because its rows are never
count-bound; a not-attempted row that somehow carries no source (back-compat
with persisted rows, or any future producer) falls back to the current
no-action copy. `source` is OPTIONAL on `NotAttemptedOutcome`, matching how
`determination` and `canvasUserId` were added without touching other producers.

Note the per-surface COPY decision for Canvas is "say nothing actionable"
(section 5) - that is a content decision about one surface, not a discriminator
failure: Canvas is distinguishable, it simply has no true in-app or manual
action to name.

---

## 5. Per-surface draft copy (wording DRAFT, for owner refinement; mechanism is the deliverable)

All copy is a past-tense statement about the run plus, where a TRUE action
exists, the action. None names an in-app re-run (no identity). None mentions
`GRADE_MAX_SUBMISSIONS` or any Vercel/owner action. Re-grading the same input
re-takes the same 40-entry prefix on every surface (`engine.ts:354 slice(0,
maxSubmissions)`), so "re-run" is never the true action - the true action always
reduces the input to the ungraded remainder.

- **zip (`source: "zip"`):** `"Not graded: this run reached its submission
  limit before this submission. To grade the rest, upload a new zip containing
  only the students this run did not reach."` (Manual path. No in-app control
  exists today; building one is an owner upgrade, section 10 RES-A37-ZIPCTRL.)
- **github (`source: "github"`):** `"Not graded: this run reached its
  submission limit before this submission. To grade the rest, remove the
  already-graded repositories from the queue, then grade again."` (Points at
  the existing per-row remove control: `GithubGradingPanel.tsx` `removeRow`
  at `:306`, Queue section `:551-560`, `QUEUE_KEY` `:54`. "Remove then grade
  again" is true because the instructor prunes the queue; plain re-run is not,
  which is the A13 finding.)
- **canvas (`source: "canvas"`):** keep the bare count statement with NO action
  clause - `"Not graded: this run reached its submission limit before this
  submission."` There is no queue to prune and no "upload only the ungraded"
  path for a Canvas discussion URL, so naming any action would be false. This
  is the honest no-action case.
- **absent `source` / grading-chat:** the no-action bare statement (same as
  Canvas). Back-compat for persisted rows written before this change.

The engine's appended count sentence (`engine.ts:527`, "This run's limit was N
submissions") is UNCHANGED and independent; it is not an action and stays on the
engine's own copy of the message, which only the engine holds the number for.

### 5.1 Diagnostics representation (AC, per DEV_LOOP b907ff8e, 2026-10-11)

A37 adds a data path - the `source` stamp on `NotAttemptedOutcome` - so "no
diagnostic" is a decision that must be STATED, not left implicit.

**AC-DIAG:** the recorded `source` is display-copy-selection ONLY and is
deliberately NOT added to any run diagnostics or deliverables report. Justified:
(1) `source` carries no grading signal and no student-facing fact - it selects
which already-authored copy a not-attempted row shows; (2) the not-attempted
REASON an instructor or a report would care about is already represented by the
row's `stoppedBy` member and its message (A31/A12/A13 shipped that), which the
deliverables report and the drafts surface already read; (3) the persisted
`source` round-trips through the existing allowlists (instrument 4) purely so
the copy survives reload, not to be reported. If a later item wants per-run
"how was this batch submitted" analytics, that is a new data path with its own
diagnostics AC; this scope does not open it. Direction of failure for this AC:
a build that routes `source` into any report or deliverable WITHOUT a new
diagnostics AC covering it violates this decision and must be caught at verify.

---

## 6. Minimal write set

Stamp-on-the-row, DESIGN 1. Ceiling impact measured; none crosses 1000, but the
two tight files are flagged.

| File (wc -l now) | Change | Est. delta | Notes |
|---|---|---|---|
| `src/lib/grade/types.ts` (510) | Add `export type GradingSource = "zip"\|"canvas"\|"github"`; add `readonly source?: GradingSource` to `NotAttemptedOutcome` (`:166-186`); add source handling to `coerceUngradedOutcome` (`:342-363`, the not-attempted branch at `:352-360`). | +12 | member-only field, same shape as `stoppedBy`. |
| `src/lib/grade/engine.ts` (661) | Add `type GradingSource` to the existing `./types` import block (`:9-24`); add `readonly source?: GradingSource` to `GradingRunOptions` (`:279-295`); destructure it (`:349`); pass `source` into the count-bound tail's outcome literal (`:512-531`) and, for completeness, the run-deadline tail (`:498-511`). | +9 | `buildUngradedRow` (`:308`) takes the outcome as-is, so source rides on the outcome object. The import is a real line (`GradingSource` is not yet imported here) - omitting it fails `tsc`. |
| `src/app/actions/grading.ts` (977) | Set `source` per branch: Canvas call `:821` -> `{...gradingRunOptions, source: "canvas"}`; zip call `:943` -> `{...gradingRunOptions, source: "zip"}`. Modify existing args, no new statements. | ~+2 | **Tight: 23 lines of headroom.** Re-measure with PowerShell `@(Get-Content).Count` at the wave gate; if it would cross 1000, the spread helper is a one-line local const. |
| `src/app/actions/github.ts` (880) | Extend the LLM call `:761 gradeEntries(entries, instructions, effectiveRubric, provider)` to `(... , null, { source: "github" })` (5th arg `pointsPossible`, 6th `options`, both already in the signature `engine.ts:604-615`). | +1 | embedded path `:751` optional; it never produces count-bound rows. |
| `src/app/components/grading-results/ungradedDisclosure.ts` (196) | Make the copy selector source-aware: `notAttemptedMessage` (`:87-98`) takes the source (the whole `NotAttemptedOutcome`, or `stoppedBy` + `source`) and returns the per-source action copy; its two callers `classifyRow` (`:122`) and `correctUngradedFeedbackSeed` (`:175`) both pass `result.ungraded.source`. Add the three frozen action strings. Keep `UNGRADED_DISCLOSURE_COPY` and both `stoppedBy` branches. | +40 | Both callers already hold `result.ungraded`; no new parameter reaches `GradingResults.tsx`. The seed path (`:175`) is what reaches the user (section 7), so it must be source-aware too, not just `classifyRow`. |
| `src/lib/grade-result-allowlist-coverage.test.ts` (owned, see 6.1) | TWO changes, same commit: (1) add `"source"` to `ALL_UNGRADED_OUTCOME_FIELDS` (`:103-110`) to quiet the compile canary; (2) add a THIRD, NOT-ATTEMPTED sentinel to `SENTINELS` (`:213`) carrying `ungraded.source`, so the round-trip `toEqual` on the `ungraded` field (`:265`/`:300`/`:331`) actually exercises `source` through all three persistence allowlists. | +~45 | (1) alone is a silent-green (see 6.1). (2) is the firing instrument. |

**No change to any `GradingResults` mount, to `GradingResults.tsx`, to
`GradingTab.tsx`, `LiveFeedPanel.tsx`, `GithubGradingPanel.tsx`, or
`GradingChatPanel.tsx`.** The source originates server-side at the grading
action, which is where the surface identity actually is.

### 6.1 Two SEPARATE instruments on this file - and why the second is not free

This file carries TWO independent guards. They protect different failures and
must both be addressed; conflating them was the round-1 blocker.

**(A) The compile canary (sound as written - keep).**
`src/lib/grade-result-allowlist-coverage.test.ts:111-118` holds a COMPILE-TIME
check: `type MissingOutcomeFields = Exclude<keyof NotAttemptedOutcome | keyof
GradingFailedOutcome, (typeof ALL_UNGRADED_OUTCOME_FIELDS)[number]>` asserted
`extends never`. Adding `source` to `NotAttemptedOutcome` without adding
`"source"` to `ALL_UNGRADED_OUTCOME_FIELDS` (`:103-110`, array exact) makes
`MissingOutcomeFields` = `"source"` (non-never) and FAILS `npx tsc --noEmit`.
So "source" must be added to that array in the same commit (the "bump the
frozen list in the same commit" rule).

**(B) The persistence round-trip - NOT free, and a silent-green if left as (A)
alone. THIS WAS THE BLOCKER.** `ALL_UNGRADED_OUTCOME_FIELDS` is TYPE-ONLY: it
is `eslint-disable`d as unused at `:102` and read only at `:113` inside the
`typeof` of the compile check. Nothing iterates it at runtime. The round-trip
preservation tests (`:249-333`) instead run `it.each(SENTINELS)` and iterate
`fieldsFor(sentinel)`, derived from `ALL_GRADE_RESULT_FIELDS` (top-level keys;
`ungraded` is one such key, `source` is nested inside it and correctly not a
top-level key). The `toEqual` at `:265`/`:300`/`:331` compares the WHOLE
`ungraded` object - but the only ungraded sentinel pushed through is
`ungradedSentinel()` (`:171-211`), whose `ungraded` is `kind: "grading-failed"`
and carries NO `source`. So the round-trip passes whether or not
`coerceUngradedOutcome` preserves `source` on a not-attempted row.

Because `source` is OPTIONAL on `NotAttemptedOutcome`, a `coerceUngradedOutcome`
not-attempted branch (`types.ts:352-360`) that simply OMITS `source` is still
type-valid: `tsc` does not force it and (A) does not test it. The live
consequence, all gates green: a GitHub >40 batch grades (source stamped, GitHub
action copy shows); the owner reloads the tab; the run is restored through
`coerceUngradedOutcome` (on both persistence paths -
`github-grading-run-store.ts:237/240`, `grading-drafts.ts:155`); if `source` is
dropped, every not-attempted row comes back `source: undefined`, the leaf falls
back to the no-action copy, and `correctUngradedFeedbackSeed` re-seeds the
count-bound FALLBACK instead of the GitHub action. The exact action A37 exists
to add vanishes on reload - the whole feature defeated, silently.

**The fix (change of KIND, not strength):** add a THIRD sentinel to `SENTINELS`
(`:213`) - a NOT-ATTEMPTED `UngradedResult` whose `ungraded` is `kind:
"not-attempted"`, `stoppedBy: "submission-count-bound"`, carrying a sentinel
`source` (and the `sourceIndex`/`student`/`message` the member requires). The
existing `toEqual` on the `ungraded` field (`:265`/`:300`/`:331`) then exercises
`source` through all three allowlists (`stripGradeResultForDraft`,
`coerceGradeResult`, `parseGradeResult`). The new sentinel must also carry every
top-level field the coverage check at `:224-236` requires (clone
`ungradedSentinel()` and swap only its `ungraded` member), so that guard still
passes. Acceptable alternative if a third sentinel complicates the coverage
describe: a dedicated `coerceUngradedOutcome` unit test round-tripping a
not-attempted outcome with `source` and asserting it survives. Instrument 4
(section 8) is repointed to this; direction of failure: `coerceUngradedOutcome`
(or either persistence parser) drops `source` on a not-attempted row -> the new
sentinel's round-trip `toEqual` reds.

---

## 7. Reachability of the capability (control to code)

A count-bound not-attempted row with `source: "zip"` arises when a zip of >40
students is graded via `gradeAction` -> `grading.ts:943 gradeSubmissions` ->
`gradeStudentEntries` slices at 40 (`engine.ts:354`) and appends the count-bound
tail (`:512-531`), which now stamps `source: "zip"`; the row flows into
`GradingTab`'s `displayRun`.

The per-surface copy reaches the user through the STRENGTHS-SEED path, not a
direct message render - this is the exact mechanism, corrected in round 1.
`GradingResults.tsx:719` reads only `classifyRow(result, edit).state` (for the
`data-ungraded-state` marker and the row label), NOT `.message`. The visible
copy is seeded into the row's strengths box: on mount and on every run change,
`correctUngradedSeeds(run, ...)` (`GradingResults.tsx:236` and `:263`) maps over
the rows and calls `correctUngradedFeedbackSeed` (`ungradedDisclosure.ts:158`),
which replaces a correctable seed with `notAttemptedMessage(...)`
(`ungradedDisclosure.ts:175`). Once `notAttemptedMessage` is source-aware, that
seeded strengths value is the per-source action copy, rendered by the strengths
textarea. So the hop that carries the copy to the user is
`correctUngradedFeedbackSeed` -> `notAttemptedMessage(result.ungraded)`, driven
by `correctUngradedSeeds` at the two call sites above. The GitHub hop is
`github.ts:761` -> same tail -> `GithubGradingPanel`'s `run` -> the same seed
path. Each hop is a real call, not an assumed one; none depends on a component
render (none happens under vitest) or on identity.

---

## 8. Machine-checkable instruments (vitest renders nothing)

Each pass condition names the object, the instrument, and the direction of
failure. Tests are written by the implementer from the test seat's notes; this
section states what must be measurable.

1. **The per-source copy reaches the user-facing seed (pure).**
   - Object: a constructed not-attempted `UngradedResult` (`ungraded.kind:
     "not-attempted"`, `stoppedBy: "submission-count-bound"`) with each `source`
     value in turn, seeded with the engine's own count-bound message as its
     `strengths` (the correctable seed the real path starts from).
   - Instrument: a pure unit test driving the USER-FACING path -
     `correctUngradedSeeds(run, edits)` (or `correctUngradedFeedbackSeed`
     directly) - and asserting the resulting `edit.strengths` equals a
     **frozen literal copy string written out in the test file**, one per
     source: the zip action string, the github action string, and the bare
     no-action string for `"canvas"` and for absent `source`. The expected
     strings are FROZEN in the test, NOT imported from `ungradedDisclosure.ts`
     - importing the constant the implementation reads is the forbidden
     tautology (`refactors-disarms-tests` / `source-text-tests-overspecify`);
     freeze the literal so a wording change is a visible diff. (A sibling
     assertion may also check `classifyRow(result, edit).message`, but the seed
     path is the one the user sees, section 7.)
   - Direction of failure: RED if any source selects the wrong branch, or if the
     emitted copy differs from the frozen literal.

2. **Each grading action stamps the right source (source-text wiring).**
   - Object: the production call sites in `grading.ts` and `github.ts`.
   - Instrument: a `*.wiring.test.ts` reading source with `readFileSync` through
     `withoutLineComments` (the CRLF-safe helper the
     `strip-comments-agreement.structure.test.ts` gate mandates - do NOT
     hand-roll a stripper or that gate reddens repo-wide), asserting the zip
     branch call carries `source: "zip"`, the Canvas branch `source: "canvas"`,
     and `github.ts`'s `gradeEntries` call `source: "github"`.
   - Direction of failure: RED if a branch omits or mis-sets its source. (A
     stronger, render-free alternative the test seat should prefer where
     feasible: drive `gradeStudentEntries` with a stubbed provider over a >cap
     batch and assert the emitted not-attempted row's `source` - this exercises
     the engine stamp, not just the source text. The engine path is
     network-only via the provider, which `vitest.setup.ts` blocks, so mock the
     provider, never `fetch`.)

3. **The exhaustiveness switch keeps BOTH disclosure members.**
   - Object: `UNGRADED_NOT_ATTEMPTED_MESSAGES` (`types.ts:219-222`) and the
     leaf's `stoppedBy` switch (`ungradedDisclosure.ts:87-98`).
   - Instrument: assert both `"submission-count-bound"` and `"run-deadline"`
     keys are present (the existing `ungradedDisclosure.test.ts` already does;
     it must stay), and the `never` default in the switch is retained so a
     third `stoppedBy` member is a compile error.
   - Direction of failure: RED if the run-deadline member is deleted (section
     3.1 forbids it) or the switch loses its exhaustive default.

4. **`source` round-trips through persistence (the firing instrument - see
   6.1(B)).** Adding `"source"` to `ALL_UNGRADED_OUTCOME_FIELDS` is NOT this
   instrument; that array is type-only and no round-trip iterates it.
   - Object: the `ungraded` field of a NOT-ATTEMPTED sentinel, through all three
     persistence/draft allowlists.
   - Instrument: a THIRD sentinel added to `SENTINELS`
     (`grade-result-allowlist-coverage.test.ts:213`) - a not-attempted
     `UngradedResult` carrying `ungraded.source` - so the existing `toEqual` on
     the `ungraded` field (`:265`/`:300`/`:331`) round-trips `source` through
     `stripGradeResultForDraft`, `coerceGradeResult`, and `parseGradeResult`.
     Equivalent: a dedicated `coerceUngradedOutcome` test round-tripping a
     not-attempted outcome with `source`.
   - Direction of failure: RED if `coerceUngradedOutcome` (or either persistence
     parser) drops `source` on a not-attempted row. Proven to FIRE by
     sabotage: omit `source` from the not-attempted branch of
     `coerceUngradedOutcome` (`types.ts:352-360`) and confirm the new sentinel's
     round-trip reds, then restore.

The one claim NO instrument here can settle: whether the copy reads correctly
and legibly on a real screen in both themes. No component renders under vitest
and nothing computes contrast - owner-only (section 10, RES-A37-SCREEN).

---

## 9. Owns file list

Derived, not recalled. Command (Git Bash, repo root):

```
grep -rln "NotAttemptedOutcome\|coerceUngradedOutcome\|UngradedOutcome\|GradingRunOptions\|classifyRow\|UNGRADED_DISCLOSURE_COPY\|UNGRADED_NOT_ATTEMPTED_MESSAGES\|buildUngradedRow\|gradeRepositoriesAction\|ungradedDisclosure\|not-attempted" src --include=*.test.ts | sort -u
```

Output (19 files), classified against this change. "Owned" = this change edits
the file or must edit its assertions; "Adopted" = asserts on behaviour this
change touches but the file is not edited (the implementer must run it green);
"Checked-safe" = incidental mention, not affected.

Production files edited (not in the grep above, which is tests-only):
`src/lib/grade/types.ts`, `src/lib/grade/engine.ts`,
`src/app/actions/grading.ts`, `src/app/actions/github.ts`,
`src/app/components/grading-results/ungradedDisclosure.ts`.

| Test file | Class | Why |
|---|---|---|
| `src/lib/grade-result-allowlist-coverage.test.ts` | **Owned** | `ALL_UNGRADED_OUTCOME_FIELDS` must gain `"source"` same commit (6.1). |
| `src/app/components/grading-results/ungradedDisclosure.test.ts` | **Owned** | The leaf's copy-selection tests; new per-source branches need coverage. |
| `src/lib/grade/engine.ungraded.test.ts` | **Owned** | Engine not-attempted tails; add an assertion that the row carries `options.source`. |
| `src/lib/grade/harshness-engine-default.wiring.test.ts` | Adopted | Constructs `GradingRunOptions`; a new optional member does not change its FROZEN prompt captures (source never reaches the prompt). Run green. |
| `src/app/components/grading-results/ungradedRowLabel.test.ts` | Adopted | Reads `classifyRow` states; the state enum is unchanged. |
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` | Adopted | Pins `editsSurface` threading, which this change does not touch. |
| `src/lib/workflows/registry/steps.grading-cartridge.test.ts`, `...draft-flow.test.ts`, `...run.test.ts` | Adopted | Exercise workflow `runDeadlineMs`/options; unaffected by an optional `source`. |
| `src/app/actions/grading-submission-grade.test.ts` | Adopted | References `gradeStudentEntries` in comments; behaviour unchanged. |
| `src/tools/strip-comments-agreement.structure.test.ts` | Adopted (constraint) | Reddens repo-wide if a NEW test names the comment-strip helper literal; the new wiring test MUST use `withoutLineComments` (8.2). |
| `canvas-inbox.weekly-announcement-module-content.test.ts`, `...schedule.test.ts`, `class-trends-insight.test.ts`, `classTrendsRunCohort.test.ts`, `classTrendsFolderEntry.test.ts`, `repoGradesBulkGrade.test.ts`, `ingestion-attribution.oracle.test.ts`, `grading-draft-checklist.test.ts` | Checked-safe | Incidental "not-attempted" / symbol mentions; no assertion on the stamped `source`. |

Plus the unconditional ceiling canary `src/file-size-ceiling.structure.test.ts`
on every wave gate (`docs/loop/this-repo.md`). Wave gate for a run naming two or
more of these test files uses `npm run test:paths <p1> <p2> ...`, never a raw
multi-path `vitest`.

---

## 10. Owner upgrades (flagged, NOT gated) and residual register

Each residual names an owner, an instrument, and the step that measures it; each
must be filed in `docs/BACKLOG.md` or it does not exist.

- **RES-A37-RERUN - the in-app re-run control.** Re-dispatching a specific
  dropped row from the table. OWNER: the chunk whose write set includes
  `src/lib/grade/types.ts` and `src/app/actions/github.ts` and that first adds a
  stable row identity (the A12/A13 residual, still unanswered, section 1).
  INSTRUMENT: a test that a dropped row carries enough to re-dispatch exactly
  that student - which `sourceIndex` cannot provide (`types.ts:176`). STEP:
  after a row-identity design exists; blocked on identity, never on a promised
  pass. Direction of failure: any copy that names an in-app re-run before this
  lands ships a second false sentence.
- **RES-A37-ZIPCTRL - a "grade only the ungraded" zip control.** The build-a-
  control alternative to the zip manual-path copy (section 5). OWNER: the repo
  owner (a product call: build a new upload control vs. keep the manual-path
  copy). INSTRUMENT: a UX scope + a reachability test from the control to a
  filtered re-grade. STEP: the owner's next pass over the grading review
  surface. This scope recommends the manual-path copy as the minimal reading;
  the control is the upgrade.
- **RES-A37-CANVASACT - a Canvas-discussion ungraded action.** Section 5 keeps
  Canvas copy actionless because no true action exists today. OWNER: the owner
  (product). INSTRUMENT: whether a Canvas "grade remaining participants" flow is
  feasible against the Canvas API this repo uses. STEP: a future Canvas-grading
  scope.
- **RES-A37-SCREEN - does the copy read correctly on a real screen, in both
  themes.** OWNER: the repo owner on the owner-verification pass. INSTRUMENT: a
  real browser; nothing here renders a component or computes contrast
  (`docs/loop/this-repo.md` section 6). STEP: owner walk after the chunk's push.
- **RES-A37-GHCTRL-COUNT - confirm the GitHub count-bound path is live.**
  Section 3.2 shows `github.ts:761` can exceed 40 on the LLM path. OWNER: the
  implementer at build. INSTRUMENT: the engine-stamp test (8.2 alt) driving a
  >40 digest batch; direction of failure: if GitHub is in practice always <=40
  (e.g. a UI cap on queue size I did not find), the `"github"` copy is
  unreachable and should be dropped to avoid dead copy. STEP: build wave.

No disposition table: this is the first version of this artifact and it
restructures no prior A37 scope. It CORRECTS three A37 backlog-row claims
(section 2); those corrections belong in the A37 row's note at the push, not in
a disposition table.

---

## 11. Leverage pointer (for the AC seat, not authored here)

A37 changes a user-reachable capability (the disclosure now names a true next
action), so the AC seat owes a leverage claim. The candidate class is GUARANTEED
(`docs/loop/leverage.md`): the app names a surface-specific, true next action
because it recorded WHICH surface produced the row - a chat cannot, because it
has no record of how the batch was submitted. The removal test the test seat
would own: delete the `source` stamp at the grading action and the leaf falls
back to the no-action copy on every surface, so the zip/github action clause
disappears (assertion 1 in section 8 goes RED on the zip/github cases). This is
a pointer; the AC seat decides and the test seat builds it.

---

## 12. Sequencing against other in-flight work

A37's production write set is `src/lib/grade/types.ts`, `src/lib/grade/engine.ts`,
`src/app/actions/grading.ts`, `src/app/actions/github.ts`,
`src/app/components/grading-results/ungradedDisclosure.ts`.

- **A37 MUST SEQUENCE with the held zip classifier (never concurrent).** The zip
  classifier's carrier set (`extraction.ts`/`engine.ts`/`types.ts`) INTERSECTS
  A37 on `src/lib/grade/engine.ts` and `src/lib/grade/types.ts`. Two items that
  both edit those files cannot run as concurrent subagents (a sibling's edit to
  the shared file would revert the other's). Whichever lands first forces the
  other to rebase its `engine.ts`/`types.ts` edits. **A37 may land BEFORE the
  zip feature** - the zip work is held for post-W2 re-home, and A37 does not
  depend on it.
- **A37 IS disjoint from CHAT-SUBMISSION-CONSOLIDATE W2** - no file in A37's
  write set intersects W2's, so those two may run concurrently (subject to the
  shared-resource rules in `parallel-disjointness.md`: one `tsc` caller, no two
  sabotage-verifies on the tree at once, and the orchestrator must not write
  `docs/BACKLOG.md` in a window where a sibling may).

Intersection was computed by set membership on the two write lists, not
eyeballed; the overlap is exactly `{engine.ts, types.ts}`.
