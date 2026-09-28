# A40 scope: the rubric field's silent exclusion on the cartridge-drop panel

Backlog row A40 (area `grading-setup-interaction-cost`, kind `bug`). Filed by
commit `1150b50` ("backlog(a40,a41): file the two census defects, with the
example corrected"), dated **2026-09-23 07:34** (`git log --format="%h %ad %s"
--date=format:"%Y-%m-%d %H:%M" -S"A40" -- docs/BACKLOG.md`). Row text pulled
fresh with `grep -a -n "A40" docs/BACKLOG.md` (no read of `docs/backlog.yml`).

**Pre-check, run as instructed.** `ls docs/a40-*.md` -> `No such file or
directory`, exit 2. `git log --oneline -3 -- docs/a40-scope.md` -> no output,
exit 0. No prior scope exists.

**Headline finding, stated first because it changes what this scope is
about: the row is half stale.** A commit landed **`8a977b1` "feat(a39): rubric
memory and version provenance", 2026-09-27 07:47** (`git show -s --format="%h
%ad %s" --date=format:"%Y-%m-%d %H:%M" 8a977b1`) - four days after the row was
filed, on the same calendar day as this scope. It added a rubric-memory
mechanism to exactly the component and exactly the field this row is about.
**The row's "compounding" persistence claim no longer holds against the tree.**
The row's ordering claim still holds, verified independently below. Section 1
is the disposition; do not read the row's original text as current fact for
anything this section corrects.

---

## 0. Every claim re-verified against the tree today, not inherited

I opened every file below directly with the Read tool in this session; no
citation below was carried over from the row, the census, or the
architecture doc without reopening the line.

### 1. The real ordering and the real window

**Confirmed still true, independently:** `CartridgeDropPanel.tsx`'s file input
is rendered **first** among the panel's six fields - file (`:384-398`), course
(`:400-411`), assignment (`:413-424`), points (`:426-437`), LMS (`:439-457`),
rubric (`:459-473`, `id="cartridge-rubric"` at `:466`). Its `onChange`
(`:392`, `handleFileSelect`) fires on file selection and runs to completion
(`:207-287`) without any user gesture in between: it awaits an archive sniff
(`:221`), computes `effective` values by merging **the outer-scope `rubricText`
React state variable at the moment `handleFileSelect` started** with whatever
the sniff found (`:227-237`; the merge itself, `mergeSniffedValues`, is at
`src/lib/submission-archive-sniff.ts:64-89`, and its rubric line is
`current.rubricText || sniff.rubricText || null` at `:74` - the CURRENT,
i.e. pre-upload, value wins over anything sniffed), saves that same value into
rubric-memory (`:258-261`), and uploads it (`saveCartridgeDrop` at `:264`).
Only after the upload returns does it clear the textbox (`setRubricText("")`
at `:274`).

**One thing the row did not say and should have: there is no race window to
worry about, because the field is not editable during the upload at all.**
Every field in the form, including the rubric `TextField`, carries
`disabled={loading}` (`:470` for the rubric field, `:393` for the file input
itself), and `handleFileSelect` sets `loading` to `true` at `:215`, before the
sniff `await`. So an instructor cannot type into the rubric box while a
selected archive is sniffing and uploading - the whole form locks the instant
a file is chosen. **The defect is not a timing race; it is a plain
consequence of DOM order plus immediate-commit-on-choose:** the file field
sits above the rubric field, so an instructor who works down the form in
render order meets the file input first, picks the archive, watches the form
briefly lock and unlock, and only then reaches the (now-irrelevant, already
cleared or freshly restored) rubric field. Typing into it at that point
edits nothing about the upload that already fired - it starts the state for
the *next* one. This is a stronger, more mundane version of the row's claim,
not a weaker one: no unlucky timing is required, the ordinary top-to-bottom
path produces it.

**What survives an edit, precisely:** a rubric typed **before** the file is
chosen is captured (the closure reads current React state, which is up to
date at the moment `onChange` fires). A rubric typed **after** - whether one
second or one hour later - has no effect on the drop that already uploaded,
full stop; there is no partial survival to report.

### 2. Whether the archive upload is genuinely irrevocable

**Partially wrong as the row states it. A delete-and-retry path exists in
code** (`deleteCartridgeDrop`, `src/lib/cartridge-drops.ts:95-111`, removing
both the Storage object and the DB row; wired to the panel's Delete button
with a two-click confirm, `CartridgeDropPanel.tsx:289-302` `handleDelete`,
rendered at `:569-577`). Nothing in the UI or the delete function itself
gates on the drop's `status`, so an instructor CAN attempt to delete a drop
in any status.

**But the practical window to use it, in the case this panel exists for
(auto-grading turned on), is a race the instructor is very unlikely to win,
and I can cite why rather than assert it:**

- The instant `saveCartridgeDrop` returns, `handleFileSelect` dispatches
  `CARTRIDGE_DROP_UPLOADED_EVENT` (`:279`).
- `WorkflowTriggerWatcher` - mounted app-wide for every signed-in user
  (`src/app/page.tsx:361`) - listens for exactly that event
  (`WorkflowTriggerWatcher.tsx:162`,
  `window.addEventListener(CARTRIDGE_DROP_UPLOADED_EVENT, onCartridgeDropped)`)
  and its handler (`:88-119`) evaluates the `cartridge-uploaded` trigger and,
  on a claim, hands the run straight to the Workflows tab
  (`enqueueScheduledRun` + `onRunScheduled()`, `:107-114`) - all **client-side,
  in the same browser session, with no deliberate delay** of any kind. I
  verified the listener registration and the dispatch site directly; I did
  **not** trace `enqueueScheduledRun`/`workflow-schedule-handoff.ts` through to
  the moment the actual grading call starts, so "how many seconds until
  `gradeAction` itself runs" is a residual (register, below), not a measured
  number. What I can state as measured: the CLAIM on the drop row (the CAS
  that would block a delete from mattering) is attempted essentially
  immediately after upload, in-session, not gated on any cron.
- If the tab is closed before that fires, the fallback is
  `.github/workflows/unattended-runs.yml:295`,
  `cron: "4,19,34,49 * * * *"` - a tick at most every 15 minutes, with the
  file's own comment at `:282-283` noting GitHub's scheduled runs are
  "best-effort and can lag several minutes." That is a real, minutes-wide
  window in the unattended case.

**Direction of failure, stated plainly:** for the attended case this row's
example describes (the instructor is present, the tab is open, auto-grading
is on - the whole point of this path), the delete-before-grade window is
seconds at best and untraceable-from-source at worst, not a deliberate wait
the instructor could reasonably act inside. **This is a disclosure defect by
mechanism (a recovery path exists) that behaves as data loss in the case
that matters (the instructor cannot reliably reach it in time).** Both
readings the row offered are partly right; neither is the whole picture, and
the difference matters for which remedy class applies (section 4).

### 3. What the run actually does with a missing rubric

**Confirmed, and the census's specific worry does NOT materialize.** The
unattended step only ever reads the rubric that was stored **on the drop row
at upload time** - `steps.grading-cartridge.ts:97-99`:
`if (takeResult.rubricText) formData.append("rubric", takeResult.rubricText)`.
It never reads rubric-memory (`src/lib/grade/rubric-memory.ts`) at all - that
module is called only from the client component, to pre-fill the *visible
textbox* on a later visit, and its output never crosses the upload boundary
except by first landing in `rubricText` state and then in
`effective.rubricText` the same way a manually typed value would. So a
rubric restored from a *different* assignment's scope by rubric-memory's
"last-used fallback" (`rubric-memory.ts:108-126`, exact match first, else the
newest entry across every scope) **could** end up used for a new upload if
the instructor doesn't read the small `rubricOrigin` caption
(`CartridgeDropPanel.tsx:472`) - but that is a *different*, already-known and
already-disclosed risk the owner accepted when dropping the non-persistence
policy (`docs/owner-decisions-2026-09-23.md` DECISION 3, and
`rubric-memory.ts:17-21`'s own "wrong-grades-that-look-right trap" paragraph).
It is not the census's worry and I am not re-opening it here; it is named in
the residual register so it is not lost.

If no rubric was ever entered (empty from the start, not a fallback), the
formData carries no `rubric` key at all, and `gradeAction`'s Gemini branch
(`src/app/actions/grading.ts:885-887`) does
`effectiveRubric = rubric.trim() ? rubric : await generateRubric(assignmentInstructions, provider)`
- it synthesizes a rubric from `assignmentInstructions`, which on this path is
**not** a real assignment description but
`` `${drop.courseLabel} - ${drop.assignmentLabel}` `` set at
`steps.grading-cartridge.ts:96`. That is RES-A39-3's other half (b) - filed,
open, explicitly out of A40's scope per the row's own text, and I confirmed
the line is unchanged. **Direction of failure for A40's own concern: a
missing rubric here is disclosed nowhere, grades against a thin two-label
synthesis, and nothing distinguishes that in the resulting CSV from a
deliberately-generated rubric on a well-described assignment.**

### 4. The remedy's shape, costed in interactions

Baseline from `docs/a39-census.md` section 3, path H: **WARM = 3** (edit the
assignment label, paste the rubric, choose the archive), crossover
**N\* = 2**. Every candidate below is priced against that 3, using the same
counting unit (`docs/a39-census.md` section 0).

| Candidate | Mechanism | Cost | Verdict |
|---|---|---|---|
| **Reorder**: move the Rubric field above the File field (course/assignment/points/LMS may move too) | Makes the natural top-to-bottom path the safe path | **+0** - a pure reorder, no new control | Removes the *most common* trigger (reading order) for free. Does not stop an instructor who picks the file first out of habit or drag-and-drop. Not sufficient alone. |
| **Disclose**: after upload, state plainly what rubric (if any) this specific upload used, before the field clears | Ends the silence the row's "trust defect" framing is about | **+0** - a rendered message, not a click; `docs/loop/leverage.md`'s struck-row on click cost and `DEV_LOOP.md`'s "minimize clicks... without trading away confirmation steps" both treat a non-blocking message as free | Does not prevent the mistake. Turns a silent exclusion into a stated fact the instructor can act on (delete + re-upload, section 2) while the window is still open. |
| **Gate**: disable the file input until the rubric field is non-empty or the instructor explicitly confirms uploading without one | Forces the order rather than suggesting it | **+1** for every upload the instructor intends to leave rubric-less - which the UI's own placeholder text (`:469`, "If blank, the workflow will generate one") states is a supported, intentional case, not an oversight | Regresses a documented feature to close a gap disclosure alone can close for free. Raises path H's WARM from 3 to 4, N\* from 2 to 3 - a real, measured backslide against A39's own headline finding that H is the cheapest attended path. |
| **Defer to submit**: add an explicit "Upload" action after all fields, so the read happens at an intentional click rather than at file selection | Removes the ambiguity by construction - by definition, whatever is in each field at the click is what gets used | **+1** - a new submit click; same WARM 3->4, N\* 2->3 as Gate | The only candidate that removes the defect BY CONSTRUCTION rather than by convention or disclosure. Also the only one that changes the panel's core interaction model (immediate-commit-on-choose), which is a bigger change than this row's own framing ("a form-wiring bug") suggests. |

**Recommendation:** ship **Reorder + Disclose** together. Combined cost is
**+0** against the census's WARM=3 and N\*=2 - the interaction count this
row's own area (`grading-setup-interaction-cost`) is named for does not move.
It does not make the mistake impossible, but it makes the common path safe
and ends the silence on the path that remains unsafe, which is what item 5 of
the owner's framing above asks for ("the app is asserting, by saying
nothing, that it used what the instructor typed" - Disclose is the direct
answer to that sentence). Gate and Defer-to-submit are real, and one of them
is the only way to make the mistake structurally impossible - that tradeoff
is FORK 1, below, worded so either answer ships something.

### 5. The instrument - what is executable versus a reading claim

**Executable, and what a test can actually assert without rendering anything**
(`docs/loop/this-repo.md` section 6: vitest is node-env, collects only
`src/**/*.test.ts`, no component is rendered by any test here):

- `mergeSniffedValues` (`src/lib/submission-archive-sniff.ts:64-89`) is a pure
  function today and is already unit-testable as-is: an assertion that a
  non-empty `current.rubricText` always wins over `sniff.rubricText` is
  executable and can fail (change the `||` order and the test goes red).
- The persistence key set is executable: `loadRubricMemory` /
  `saveRubricMemory` (`src/lib/grade/rubric-memory.ts:97-126`) are pure
  functions over a storage key and a scope string; an exact-match-first,
  newest-fallback-second test is executable today with no DOM.
- The submitted payload's SHAPE for the missing-rubric case is executable:
  `steps.grading-cartridge.ts:96-99` builds `FormData` from a `drop` object
  that can be constructed directly in a test, with no React and no browser -
  asserting the `rubric` key is absent when `rubricText` is falsy, and present
  otherwise, is a real, executable, RED-on-regression check.
- **The render order and the disclosure message's actual wording are NOT
  executable here.** Nothing renders `CartridgeDropPanel.tsx` under vitest, so
  "the rubric field is now above the file field" and "the disclosure message
  says X" are reading claims traced from the JSX source text, never
  observations of a screen. A structural test can assert the *source text's*
  ordering (e.g. the byte offset of `id="cartridge-rubric"` precedes that of
  `id="cartridge-file"`) - that is a real, executable guard against a future
  regression, but it proves the source says what it says, not what an
  instructor sees. Label it that way in the test notes; do not let it stand
  in for a rendered check that does not exist in this repo.
- **Recommendation for whichever seat writes test notes:** if Disclose is
  built as "compute a summary string, then render it," extract the
  string-building into its own pure, exported function (mirroring
  `describeRubricOrigin` in `rubric-memory.ts:132-138`) so the *content* of
  the disclosure is executable and asserted by a real test, and the JSX only
  renders whatever that function returns. That is the difference between a
  test that can fail and one that greps for an identifier - the class this
  repo has shipped green through five sabotages already
  (`docs/loop/traps-spec.md`).

### 6. Waves

This is a bug fix touching one component; it does not need a multi-wave
split by file-set disjointness, but it does split into a landable-alone step
and its tests, per the loop's own Build-then-Tests ordering.

- **Wave 1 (production).** Write set: `src/app/components/CartridgeDropPanel.tsx`
  only.
  - Reorder the rubric field (and, if the implementer/architect chooses,
    course/assignment/points/LMS) above the file field.
  - After a successful upload, before or alongside clearing `rubricText`,
    render a stated fact about what this specific upload used: empty (with a
    pointer to "the workflow will generate one," matching the existing
    placeholder's own language) or the captured text (echoed, or a short
    description of it, per section 5's extraction recommendation).
  - `CartridgeDropPanel.tsx` is already rendered by its one existing caller,
    `GradingTab.tsx:473`, unchanged by this wave - no new caller to add, since
    no new export is introduced (per `docs/loop/traps-spec.md`'s "an
    assignment must include the file that CALLS the new export" - there is no
    new export here).
  - **Ceiling check, measured, not assumed:** `wc -l
    src/app/components/CartridgeDropPanel.tsx` = **600**. Not near the
    1000-line wall; no extraction is warranted or proposed.
- **Wave 2 (tests), same or next chunk.** Write set: a new
  `CartridgeDropPanel`-adjacent structure test (source-text ordering guard,
  per section 5) plus, if Disclose is extracted into a pure function per
  section 5's recommendation, a unit test on that function. No existing test
  file is known to cover this component today -
  `grep -rn "CartridgeDropPanel" src --include=*.test.ts` returned no match
  (exit 1) against the canary `grep -rn "GradingTab" src --include=*.test.ts`,
  which returned matches (exit 0) - so the absence is real, not a missed
  pattern.
- Both waves are independently landable in sequence (tests depend on wave 1's
  shape, but wave 1 does not depend on the tests existing).

### 7. Leverage

**None claimed, and none owed.** `docs/DEV_LOOP.md`'s Criteria section states
the leverage claim is required "when the chunk builds or changes a
capability a user reaches - not a bug fix, a refactor, a doc correction or an
owner verification." A40 is filed as kind `bug` in `docs/BACKLOG.md`'s own
row, and nothing in this scope adds a capability - it changes when an
existing field's value is read and adds a status message. No leverage claim
follows.

### 8. Residual register

| id | Residual | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| A40-R1 | How long after upload the actual grading call (`gradeAction`) starts when the tab stays open - I traced the event listener and the trigger claim (`WorkflowTriggerWatcher.tsx:88-119`) but not `enqueueScheduledRun`/`workflow-schedule-handoff.ts` through to execution. | Whoever implements the Disclose remedy, or the repo owner in a real session. | Read `src/lib/workflow-schedule-handoff.ts` and the Workflows tab's consumption of the queue end to end, or time it directly in a browser. | A number claimed without this trace is invented, not measured. | Before any remedy claims a specific "you have N seconds" figure in its own copy - Disclose as scoped above makes no such claim, so this does not block Wave 1. |
| A40-R2 | RES-A39-3(b) - Path H's `assignmentInstructions` is still `` `${courseLabel} - ${assignmentLabel}` `` (`steps.grading-cartridge.ts:96`), unchanged, confirmed on today's tree. Interacts with A40: a missing rubric on this path is synthesized from that same thin string. | The chunk whose write set includes `steps.grading-cartridge.ts` - already filed, per the row's own text, as explicitly out of A40's scope. | The unit test over the step's built `FormData`, already specified in RES-A39-3. | Confirmed still RED on today's code, re-verified this session, not re-filed. | The first A39/A40-adjacent implementation chunk that touches `steps.grading-cartridge.ts` - not this one. |
| A40-R3 | Rubric-memory's "last-used fallback" (`rubric-memory.ts:108-126`) can silently offer a DIFFERENT assignment's rubric into a new upload's field if the instructor does not read the `rubricOrigin` caption (`CartridgeDropPanel.tsx:472`). This is a known, owner-accepted tradeoff (DECISION 3, `docs/owner-decisions-2026-09-23.md:69-94`; `rubric-memory.ts:17-21`), not a new finding - named here only so it is not confused with A40's own defect. | Repo owner - this is a stated, accepted risk, not an open question. | The existing caption render at `CartridgeDropPanel.tsx:472` and DECISION 3's own text. | N/A - not a residual seeking closure, a pointer against misreading A40 as reopening it. | None; recorded for disambiguation only. |
| A40-R4 | Whether the Disclose message's copy is legible/clear to a real instructor - nothing renders this component under any test here (`docs/loop/this-repo.md` section 6). | Repo owner, in a real browser. | Upload an archive with the rubric box empty, then with it filled, and read what the panel shows immediately after. | A claim that the message is clear without this check is a reading claim, not a measured one. | The owner verification pass, alongside the general A39 verification residual (RES-A39-2, `docs/a39-census.md` section 8) it extends. | 

## 9. Fork discipline

**FORK 1 - prevent by construction versus disclose at zero cost.** Section 4
priced both branches; every answer below ships something and ends this
question.

- **Disclose-and-reorder (recommended)**: ships Wave 1 as scoped in section 4
  - zero added interactions, path H's WARM stays 3 and N\* stays 2, the
    common (top-to-bottom) path becomes safe, the uncommon path (file chosen
    first, out of habit) is no longer silent but is still possible.
- **Gate-or-defer-to-submit**: ships a structurally stronger fix that makes
  the mistake impossible, at a measured cost of +1 interaction on path H
  (WARM 3->4, N\* 2->3), which is a real backslide against A39's own
  headline finding for this specific path.

Which do you want: **ship the zero-cost pair now** (this scope's Wave 1), or
**spend the one extra click to make it structurally impossible**? Either
answer is final for this activity; I recommend the first, but the choice is
the owner's per `docs/loop/iteration-caps.md`'s disposal (b).

**No second fork.** The row's own pre-empted question ("is this the
`RubricInputModal` policy applied here") is settled, confirmed by a fresh
grep this session (`grep -n "RubricInputModal"
src/app/components/CartridgeDropPanel.tsx` -> no match, exit 1; the same
pattern against `GradingRecordingPanel.tsx` -> match, exit 0) - it is not.
RES-A39-1 (whether rubric persistence should exist at all) is not a fork
here either - it is already answered and already shipped (DECISION 3,
commit `8a977b1`), so there is nothing left for A40 to ask about it.

---

## Concurrency

Ran read-only against the tree; no file was written except this one. Sibling
`docs/r2-wave1-subwaves.md` was not touched, opened, or referenced. No
`git stash`, `git add -A`, or `git checkout --` was run.

```
$ git status --short
 M docs/css-orphans.md
?? docs/a40-scope.md
```

`docs/css-orphans.md`'s modification predates this session (present in the
git status snapshot at conversation start) and was not touched here.
