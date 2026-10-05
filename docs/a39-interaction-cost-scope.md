# A39 - the grading interaction-cost scope (measurement-first recon, round 1, UNCHECKED)

Backlog row A39 (`docs/backlog.yml:703`, area `grading-setup-interaction-cost`).
A fresh `loop-checker` reads this before any consumer does. It is written to be
checked, not praised.

**Status:** authored by the architecture seat. NOT yet checked. No code, CSS or
test was changed by this seat.

---

## 0. The headline, stated first because it reframes the whole task

**The task that produced this document asks me to "count the interactions, THEN
recommend a remedy shape + forks" for A39, treating it as an unmeasured,
unscoped item. The tree disagrees, and `docs/loop/this-repo.md` /
`DEV_LOOP.md` require me to measure, report the conflict, and not adopt either
reading silently.** I did, and here is the conflict:

1. **The measurement already exists.** `docs/a39-census.md` is A39's first
   deliverable: a nine-path interaction census with per-step citations, filed
   at commit `66e8104` (the census's own header).
2. **The remedy was designed, forked, decided, and largely built.** A39 has
   shipped five waves plus six of seven "incremental-fill" waves, and - the
   part the task framing does not mention - a whole sibling surface,
   `GRADING-CHAT`, which is the product-level answer to the owner's complaint
   and is itself in `verification`.
3. **What remains is almost entirely owner-only** (browser walks nothing in
   this checkout can run) plus a short list of genuinely-open code findings,
   several of which were never filed as backlog rows and therefore - per
   `DEV_LOOP.md` step 0 - "do not exist".

So this document is NOT a fresh census and NOT a new remedy design. It is a
**re-measurement against the current tree** (`git rev-parse --short HEAD` =
`644be22b`), a **reconciliation** of what the census ranked against what
shipped, and a **scope of what actually remains**. Re-running the census from
scratch, or scoping a remedy whose shape is already decided and built, would
spend the strong tier re-deriving settled work - exactly the cost the loop's
own cards warn against.

If the owner's intent behind this task was in fact "verify A39 is done and tell
me what is left", this document answers that. If it was "find a NEW interaction
cost the shipped work missed", section 8 names the one open buildable defect and
section 6 says plainly that interaction COUNT was never where the loss was.

---

## 1. Measurement discipline binding this document

Every quantity names the command or `file:line` that produced it. Every absence
claim was paired with a canary in the same call. **NOTHING RENDERS UNDER VITEST
HERE** (`docs/loop/this-repo.md` section 6), so every interaction count is a
READING CLAIM traced from a control to the code behind it, never an observed
screen; section 10 routes those to the owner. Shell: Git Bash and PowerShell on
the dates below (greps 2026-10-05).

**Line counts use BOTH tools where size is load-bearing** (the repo's two
counters disagree by 42 on one file). Measured 2026-10-05:

```
$ wc -l src/app/components/GradingTab.tsx src/app/components/CartridgeDropPanel.tsx \
        src/app/components/grading/incrementalRunPlan.ts \
        src/app/components/grading-chat/GradingChatPanel.tsx \
        src/app/components/grading-chat/useContinuousGradingRun.ts src/lib/grade/engine.ts
  620 GradingTab.tsx        632 CartridgeDropPanel.tsx     301 incrementalRunPlan.ts
  244 GradingChatPanel.tsx  378 useContinuousGradingRun.ts 658 engine.ts
# PowerShell @(Get-Content <path>).Count returned the SAME six numbers (620/632/301/244/378/658).
```

The two counters AGREE on all six files here. Where this document cites a size,
both tools produced it.

---

## 2. The counting unit and the chat baseline (carried from the census, unchanged)

One **INTERACTION** = one discrete instructor act: a click; filling one field
(focus + paste = ONE); one file-dialog round trip; one list/dropdown selection;
one view transition. One **WAIT** = a point the instructor cannot pass until
something finishes; waits are counted separately from interactions, because a
path can cost zero interactions per submission while its wait grows linearly in
N. Section 6 turns on exactly that split.

**Chat baseline, as the owner states it:** per-assignment setup = 2 (paste
rubric, paste description); per submission = 1 (paste it); total **2 + N**;
navigation 0; prerequisites 0; **first grade after interaction 3**; paid on
every assignment forever. The last two facts are load-bearing: the chat's
advantage is FIXED cost plus **immediate per-item feedback**, and the app's is
MARGINAL cost, so the curves cross (A39 row note, `docs/a39-research.md`).

**Crossover N\***: smallest N with `s + p*N < 2 + N` (s = warm setup,
p = per-submission). When `p = 0`, `N* = s - 1`; when `p >= 1`, there is no
crossover. The chat's own profile is `s = 2, p = 1`.

---

## 3. The surface map, re-measured: the nine census paths are now ONE sub-tab plus a chat member

The census (section 1) enumerated nine grading paths (A-I) scattered across
Tools. Since then the **Tools > Grading sub-tab consolidation (GRAD-SUBTAB)**
landed, and `GradingView` is now a single inner-nav with six members:

```
$ grep -n "export type GradingView" src/app/components/manual/manual-rail.ts
45: export type GradingView = "run" | "repos" | "recording" | "snapshots" | "drafts" | "chat";
```

Mapping census paths to current members (traced from `manual-rail.ts:26-45` and
`page.tsx`):

| GradingView member | Census path(s) | Surface |
|---|---|---|
| `run` | A (zip), B (Canvas URL), C (Live Feed), D (GitHub) | `GradingTab.tsx` |
| `repos` | E (Repo Grades) | `repo-grades/` |
| `recording` | F (grade from recording) | `GradingRecordingPanel.tsx` |
| `snapshots` | G (grade from screenshots) | `SnapshotGradingPanel.tsx` |
| `drafts` | (new; drafted grades) | - |
| **`chat`** | **NONE - new surface** | `grading-chat/GradingChatPanel.tsx` (wired `page.tsx:17,786`) |

So the census's rank-3 "navigation" finding (inputs scattered, "the app turned a
linear paste-loop into navigation") is structurally addressed: the five of nine
paths that were separate screens are now one sub-tab's inner selection. Path H
(cartridge drop) still lives at the bottom of the `run` surface
(`GradingTab.tsx` renders `<CartridgeDropPanel />`), and path I (workflow
presets) is the unattended sibling, unchanged.

**The new `chat` member is the load-bearing change** and is described in
section 5.

---

## 4. Re-measured interaction table for the paths that matter now

I re-measured the three paths that decide the answer: **A** (the path an
unprovisioned instructor actually lands on), **H** (the census's cheapest
path), and **chat** (the new direct chat analogue). The other paths' census
counts (B/C/E cheaper but gated on an owner-set Canvas credential; D-per-repo
never crosses; F/G unmeasurable p) are unchanged in shape and are carried from
`docs/a39-census.md` section 3 rather than re-walked here - say so rather than
restating counts I did not re-open.

All citations below were opened on the current tree
(`src/app/components/GradingTab.tsx` @ 620 lines,
`CartridgeDropPanel.tsx` @ 632 lines).

### Path A - Upload ZIP (warm, steady state)

| # | Step | Kind | Current citation |
|---|---|---|---|
| A1 | land on Tools > Grading (`run`) | 0 warm | persisted via `ta-active-tab`/`ta-manual-view`; `GradingTab.tsx:111-115` restores `ta-grading-source` -> `"zip"` default |
| A2 | choose the zip | file dialog | `GradingTab.tsx:366-372` `<input type="file" ... onChange={handleUploadFileChange}>` |
| A3 | assignment description | field **OR 0 on repeat** | textarea `:426-439`; **auto-restored** when a same-named upload was graded before: `handleUploadFileChange` `:257-269` loads `loadRubricMemory(..., "upload:<name>")` and fills instructions when the field is empty/unedited |
| A4 | rubric | field **OR 0 on repeat** | textarea `:444-457`; same auto-restore `:257-269`; saved on submit `:352-357` `saveRubricMemory(RUBRIC_MEMORY_STORAGE_KEY="ta-grading-rubric-memory", "upload:<name>", {rubric, instructions})` |
| A5 | Start Review | click | `:484-490` submit button |

**COLD WARM = 4** (A2, A3, A4, A5), per submission **0**, crossover **N\* = 3** -
unchanged from the census's path-A number. **But the census's rank-1 finding for
path A is now FALSE:** the rubric and description are NO LONGER re-pasted on a
repeat upload of the same-named file - they auto-restore at 0 cost
(`GradingTab.tsx:61-65,120-129,257-269,352-357`, all A39 wave 2, commit
`8a977b1`). The removable step the census ranked #1 was removed on this path.

### Path H - Submissions / cartridge drop (warm)

The census's 5.2 defect (rubric field BELOW the file input, not persisted,
cleared after every upload) is **fixed**. Current field order, measured:

```
$ grep -n 'id="cartridge-' src/app/components/CartridgeDropPanel.tsx
418 cartridge-course  431 cartridge-assignment  444 cartridge-points
457 cartridge-lms     479 cartridge-rubric       493 cartridge-file   <- file is LAST
```

The rubric (`:479`) now precedes the file input (`:493`); the rubric persists
and restores (`RUBRIC_MEMORY_STORAGE_KEY="ta-cartridge-rubric"` `:39`,
`loadRubricMemory` `:132`, `saveRubricMemory` `:266`), and a drop row discloses
the restored rubric's ORIGIN (`:579`). A40 shipped this (`ceab414`, `8708009`,
`19cf77b`). **WARM is still ~3** (edit assignment label, rubric, file) but the
rubric is no longer silently dropped and no longer re-pasted on repeat.

**One census finding on path H remains OPEN** (section 8): the assignment
description still has nowhere to go - the cartridge workflow sends
`"${courseLabel} - ${assignmentLabel}"` as `assignmentInstructions`, measured
now:

```
$ grep -n "assignmentInstructions" src/lib/workflows/registry/steps.grading-cartridge.ts
95: formData.append("assignmentInstructions", `${drop.courseLabel} - ${drop.assignmentLabel}`);
```

### Path chat - the new continuous grading surface

Traced from `GradingChatPanel.tsx:1-60` and the row's design docs. Layout is
Instructions -> Rubric -> Results table -> Composer (`:3-11`).

| # | Step | Kind | Citation |
|---|---|---|---|
| ch1 | land on Tools > Grading, `chat` member | 0 warm | inner-nav; always-mounted, display-toggled so an in-flight run survives nav (`:13-16`) |
| ch2 | set Instructions | field **OR 0** | `useState("")` `:56`; Canvas-scoped setup memory restores it (`chatSetupMemory.ts`, `deriveChatScope`/`loadChatSetupMemory` `:30`) |
| ch3 | set Rubric | field **OR 0** | `useState("")` `:57`; same setup memory; `CHAT_RUBRIC_MEMORY_KEY="ta-grading-chat-rubric-memory"` (`chatSetupMemory.ts:17`) |
| ch4 | **per submission**: paste/drop one | 1 per submission | `ChatComposer` + `chatFileBatch.ts` / `chatSubmissionIntake.ts` |
| ch(none) | result row **appends as each is graded** | NO WAIT for the batch | continuous per-item run via `useContinuousGradingRun.ts` -> `/api/grade-run-item`, concurrency pool `INCREMENTAL_CONCURRENCY = 3` (`incrementalRunPlan.ts:31`) |

**This is the chat's own profile, matched and then beaten:** setup `s = 2` (or 0
on a known scope), `p = 1` per submission - **the same `2 + N`** - and critically
the **same time-to-first-value**: a row appears as each submission finishes,
rather than after all N (the census's section 2.1 loss, below). The app's
earned advantage over the chat on this surface, per the row's UX pass: **append
vs reset** (repeat use is 1 click and 0 rows lost here vs a full table
replacement on the `run` surface), plus provenance, attribution, and a 3-wide
concurrency pool. It is the first live wiring of the per-item route the batch
form still gates off (section 7).

---

## 5. Shape diagnosis - which of the three candidate shapes each cost was, and what shipped

The row named three candidate shapes to argue against concretely. Mapping the
census's measured costs to them, and to what has since landed:

| Candidate shape | Was it the defect? | Evidence | Status now |
|---|---|---|---|
| **(1) PERSISTENCE** - reaching a stored rubric costs more than re-pasting | **YES, this was the dominant removable cost** (census rank 1+2). The rubric was not stored on A/D/F/G/H and was *actively cleared* on H; the no-persistence POLICY was stated deliberately (`RubricInputModal.tsx`) | census 5.1-5.4 | **SHIPPED.** Rubric memory now on A (`ta-grading-rubric-memory`), H (`ta-cartridge-rubric`), F/G (wave 3b `5122b49`/`3370460`), and chat (`ta-grading-chat-rubric-memory`). The no-persistence policy was deleted where asserted - its phrasings dropped from 6 matches to 1 residual mention (`grep "deliberate exception" src/app/components --include=*.tsx` -> only `LegibilityProbeModal.tsx:31`, a back-reference) |
| **(2) ONE SURFACE** - inputs on separate screens turn a paste-loop into navigation | **Partly.** Five of nine paths were separate screens | census section 1 | **SHIPPED.** GRAD-SUBTAB consolidated them into one `GradingView` inner-nav (section 3); the chat member puts Instructions, Rubric, and the submission composer on ONE surface |
| **(3) NO UPSTREAM GATE** - LMS/course/naming required before the first grade | **Mixed.** Course selection was NOT required (census P9, still true); but Canvas credential (P2) IS required and is OWNER-ONLY, gating the three cheapest paths (B/C/E); and the zip naming convention (P7) is required-in-effect and fails silently | census P2, P7, P9 | **Partly.** Credential dead-end now routes the instructor to where they set it (wave 5 `775f26b`). P7 silent mis-grouping is partly guarded by the A44 collision refusal and the `byBase` deletion (`GRADE-INFER-MERGE` `cdccbea8`) but the underlying silent fallback remains (section 8). The chat surface has NO LMS gate - setup fields start blank and submissions are pasted files |

**The fourth shape the census found that the row did not name, and it is the
real one (census section 6):** TIME-TO-FIRST-VALUE. On interaction COUNT the app
already beat the chat at N <= 2 on four paths *before any A39 work shipped* - yet
the owner experienced it as slower. The loss was never clicks; it was that the
batch `run` path shows **nothing until all N finish** (`engine.ts` sequential
loop, `DEFAULT_INTER_REQUEST_DELAY_MS = 1200` `gemini.ts:67`, capped at
`DEFAULT_MAX_SUBMISSIONS = 40` `gemini.ts:32`), while the chat returns a grade
after every paste. **This is the shape the `chat` surface and the incremental
route exist to fix** (section 7).

---

## 6. The honest verdict

**The interaction COUNT was won before A39 shipped a line, and the shipped work
did not need to win it - it hardened it** (persistence removed the re-paste on
every reachable path) **and, more importantly, closed the one axis the count
could not see** (time-to-first-value, via the continuous `chat` surface and the
per-item route).

Stated as a comparison, with the object, the instrument, and the direction of
failure named:

- **Object:** warm interaction count, app vs chat `2 + N`, for a realistic
  assignment (N >= 2).
- **Instrument:** the per-step tables in section 4, traced from controls to
  handlers (reading claims; no render).
- **Direction of failure:** a path that costs MORE than `2 + N` at the N a real
  instructor has. Measured: path A = 4 (crosses at N=3), path H ~= 3 (N=2), chat
  = `2 + N` matched with per-item feedback. **No reachable path fails this
  today**, which is why there is no count-reduction remedy left to scope.

**Therefore there is no new remedy shape to recommend and no product fork left
open that is both unresolved AND buildable here.** The honest recommendation is:

1. **Do not re-scope a remedy.** The three candidate shapes are all addressed
   (section 5). Scoping a fourth would be inventing work.
2. **The FIRST highest-leverage REMAINING slice is owner verification** - it is
   what unblocks the largest body of finished, unverifiable work (section 9).
   Nothing in this checkout can run it.
3. **The one agent-buildable open defect** is RES-A39-3(b) (path H grades
   against two labels instead of a real assignment description) - the single
   census-family correctness finding that still has an in-repo instrument.
   Section 8 scopes it as the buildable slice, because the task asked for a
   buildable, independently-gateable wave shape and this is the only honest
   candidate.

---

## 7. Relationship to the incremental-fill effort (asked for explicitly)

**They are the same effort, not independent.** `docs/a39-incremental-fill-*` and
the `RES-FILL-*` residuals ARE the time-to-first-value remedy for the batch
`run` path: a concurrent per-item route (`/api/grade-run-item`), a 3-wide pool
(`INCREMENTAL_CONCURRENCY = 3`), and a "fill" of the existing results surface so
rows stream in. Six of seven fill waves shipped (`0cb98bc`, `5b0c44a`,
`ef28161`, `c37b266`, `32af6aa`, `de1e84e`). **Wave 7 is the flag flip and is
owner-blocked:**

```
$ grep -n "INCREMENTAL_ROUTE_ENABLED" src/app/components/grading/incrementalRunPlan.ts
106: export const INCREMENTAL_ROUTE_ENABLED = false;
128: if (!INCREMENTAL_ROUTE_ENABLED) return "whole-run";
```

The owner fork behind that flag (SECOND SURFACE vs FILL of the existing surface)
was **decided FILL** and built; the flip waits on an eight-item owner browser
walk, five items of which have no possible in-repo instrument (A39 row note).

**The `chat` surface is the SECOND consumer of the same per-item route, reached
UNCONDITIONALLY** (`GRADING-CHAT` row, `docs/backlog.yml:1109`: "the first live
wiring of the dormant per-item route ... reached unconditionally here for the
first time"). So the streaming capability is already user-reachable through the
chat member even while the batch `run` form keeps it flagged off. This is the
key interaction between the two: **a checker or owner must not read
`INCREMENTAL_ROUTE_ENABLED = false` as "streaming is off" - it is off for the
batch form only; the chat surface streams today.**

---

## 8. The one buildable remaining slice - RES-A39-3(b)

This is the only open census-family defect with an in-repo instrument, and the
task asked for a buildable, independently-gateable wave. It was **never filed as
a backlog row** - it lives only inside `docs/a39-census.md` section 8 (RES-A39-3)
and inside A40's note (`docs/backlog.yml:725`), which explicitly says "(b) ...
remains an open, unfiled finding and must not be read as closed by A40
landing". Per `DEV_LOOP.md` step 0, an unfiled residual does not exist, so
**the first step of this slice is to FILE it as a backlog row** (owner: the
orchestrator), then build.

**The defect, re-measured 2026-10-05:** on the cartridge path (H, the app's
cheapest), the instructor's pasted assignment description has nowhere to go. The
workflow step sends a two-label string:

```
$ grep -n "assignmentInstructions" src/lib/workflows/registry/steps.grading-cartridge.ts
95: formData.append("assignmentInstructions", `${drop.courseLabel} - ${drop.assignmentLabel}`);
```

If the rubric box is also empty, `gradeAction` then synthesizes a rubric from
that two-label string (`grading.ts` `generateRubric(assignmentInstructions,
...)`). **Direction of failure: the fastest path grades against the least
information, and nothing says so.**

**Shape of the fix (architect's call to confirm, not decided here):** either
(a) collect a real assignment-description field on `CartridgeDropPanel` and
thread it through `saveCartridgeDrop` -> the `cartridge_drops` row -> the
workflow step, or (b) if a description field is out of scope for an unattended
drop, make the two-label fallback VISIBLE on the drop row the way the rubric
origin already is. (a) is the real fix; (b) is the honest-disclosure fix. This
is a product fork and belongs to the owner - recommend (a), because the rubric
field was already added to this panel, so a sibling description field is the
same move; cost of (a) being wrong is one unused field and a migration column.

**Write set for slice (a), with the wiring file included:**

```
$ git grep -l "saveCartridgeDrop\|assignmentInstructions\|cartridge_drops" -- \
    src/app/components/CartridgeDropPanel.tsx \
    src/lib/workflows/registry/steps.grading-cartridge.ts \
    'src/lib/**/cartridge*'
```

| File | Role |
|---|---|
| `src/app/components/CartridgeDropPanel.tsx` (632 lines, at its ratchet cohort) | the new field + its persistence + save-side wiring |
| `src/lib/workflows/registry/steps.grading-cartridge.ts` | **the wiring file** - the step that CONSUMES the stored description and must stop sending two labels |
| the `cartridge_drops` save path + migration (additive nullable column) | storage; migrations auto-apply on push - additive + idempotent only |
| its `*.test.ts` siblings (`CartridgeDropPanel.reorder.test.ts`, `rubric-origin.test.ts`) | tests that read these files as source text |

**Machine-checkable gate for the slice** (structure/source-text + pure-function
only; nothing renders here). Spelled with `test:paths`, one path per arg, plus
the file-size ceiling unconditionally:

```
npm run test:paths -- \
  src/lib/workflows/registry/steps.grading-cartridge.test.ts \
  src/app/components/CartridgeDropPanel.reorder.test.ts \
  src/file-size-ceiling.structure.test.ts
```

- **Object:** the `FormData` the cartridge step builds. **Instrument:** a unit
  test over that `FormData`. **Direction of failure:** RED on today's code -
  assert `assignmentInstructions` is NOT `"<course> - <assignment>"` when a
  stored description exists. It must be watched failing first.
- **Object:** `CartridgeDropPanel.tsx` line count. **Instrument:**
  `file-size-ceiling.structure.test.ts`. **Direction of failure:** the file
  grows past its ceiling; it is at 632 now with no cohort headroom, so this
  slice may require an extraction before it adds (the A39 panels' recorded
  pattern).

---

## 9. Owner forks and owner-only work (the real remaining queue)

Every entry here terminates an activity; none is a gate on the others.

| Fork / walk | What it decides / verifies | Recommended | Cost of the alternative |
|---|---|---|---|
| **W7 flag flip** (`INCREMENTAL_ROUTE_ENABLED`) | turn batch-form streaming on | the FILL is built and the chat surface already proves the route in production; flip after the 8-item walk | leaving it false costs nothing new - the chat member already streams; the batch form stays all-or-nothing |
| **GRADING-CHAT owner walk** (`docs/grader-owner-walk.md`, 18 checks) | chat look/feel, Enter-to-send, Send focus retention, streaming table surviving nav, partial-refusal alert | run it - the code is `verification`-complete | none; this is the gate between built and shipped-confirmed |
| **RES-A39-3(b) fork** (section 8) | real description field vs visible-fallback on path H | (a) real field | (b) leaves the fastest path grading on two labels, disclosed |
| **RES-A39-1** (does the no-persistence rubric policy still hold?) | now largely MOOT - the policy was deleted where it was asserted (section 5) | confirm it is closed | if the owner still wants a sensitivity position, it is a NEW decision, not this one |

The two product forks the shipped work already resolved - FILL vs second surface
(decided FILL), and GRADING-CHAT R2/R3 (blank-rubric and URL-scope, being built
on the recommended readings) - are recorded in their rows and are NOT reopened
here.

---

## 10. Residual register (owner + instrument + step)

Missing any of the three, an entry is a deletion. Each must land in
`docs/BACKLOG.md` or it does not exist.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A39-SCOPE-1 | **RES-A39-3(b) is unfiled.** Path H sends two labels as the assignment description (`steps.grading-cartridge.ts:95`); the census and A40's note call it open but no backlog row carries it. | Orchestrator to file; then an implementer for slice (a). | The grep in section 8 (`:95` must stop reading two labels) + a `FormData` unit test, RED on today's code. | File the row this turn; build in the next A39 chunk. |
| RES-A39-SCOPE-2 | **P7 silent mis-grouping may be only partly closed.** `leafStemFallback` still exists (`grade/utils.ts:121`); `byBase` was deleted (`cdccbea8`) and A44 collision-refusal guards blending - but whether three non-conforming filenames still collapse to fewer than three students is UNVERIFIED by me this pass. | A later chunk touching `grade/utils.ts`, or the owner in a browser. | A unit test over the grouping with three non-conforming filenames asserting the returned entry count; RED if they collapse. | Before any claim that P7 is closed. |
| RES-A39-SCOPE-3 | **Every interaction count here is a reading claim.** Nothing renders under vitest. | Repo owner, in a real browser. | Walk paths A, H and chat from a cold profile; count acts against section 4. | The owner verification pass. |
| RES-A39-SCOPE-4 | **W7 flip is owner-blocked and must not be read as "streaming is off".** `INCREMENTAL_ROUTE_ENABLED = false` gates the batch form only; the chat member streams today. | Repo owner (8-item walk); then an implementer flips one constant. | `grep -n INCREMENTAL_ROUTE_ENABLED src/app/components/grading/incrementalRunPlan.ts` (`:106`) + the chat route's unconditional reach (`GRADING-CHAT` row). | After the owner walk. |
| RES-A39-SCOPE-5 | **GRADING-CHAT cross-reload session inheritance (W2-R2).** A page reload resets the in-memory sessionId to 0, so a new post-reload session can inherit the pre-reload session's URL-keyed edits. | Owner/architect (persisted counter or removeItem-on-reset). | As stated in the `GRADING-CHAT` row note (W2-R2). | Whenever durability is scoped. |
| RES-A39-SCOPE-6 | **This scope is UNCHECKED and re-measured only three paths (A, H, chat).** B/C/E/D/F/G counts are carried from `docs/a39-census.md`, not re-opened this pass. | This document's `loop-checker`. | Re-open the census's path tables against the current tree if a B/C/E/F/G count becomes load-bearing. | Before any decision rests on a carried-forward count. |

---

## 11. `owns` for this document

This is a docs-only artifact. The files it reads AS SOURCE (and would re-measure
if they move) are listed so a checker can see the citation surface. Command used
to confirm each path exists and resolve its current size:

```
$ for f in src/app/components/GradingTab.tsx src/app/components/CartridgeDropPanel.tsx \
    src/app/components/grading/incrementalRunPlan.ts src/lib/grade/engine.ts src/lib/gemini.ts \
    src/app/components/grading-chat/GradingChatPanel.tsx \
    src/app/components/grading-chat/useContinuousGradingRun.ts \
    src/app/components/manual/manual-rail.ts src/lib/grade/utils.ts \
    src/lib/workflows/registry/steps.grading-cartridge.ts \
    src/file-size-ceiling.structure.test.ts src/app/page.tsx; do wc -l "$f"; done
```

All twelve resolve. Sizes for the six that matter are in section 1; the rest are
cited by `file:line` in sections 3-8. This document owns only
`docs/a39-interaction-cost-scope.md`.

---

## 12. What I could not determine, stated rather than guessed

- **Whether P7 three-file collapse still happens** (RES-A39-SCOPE-2) - I
  confirmed the fallback code path exists but did not run the grouping with a
  non-conforming fixture this pass.
- **The B/C/D/E/F/G interaction counts on the current tree** - carried from the
  census, not re-walked (RES-A39-SCOPE-6).
- **Anything a screen shows, any felt speed, any real click-through** - no render
  under vitest, no API key, no live Canvas (`docs/loop/this-repo.md` section 6).
- **Whether the owner's intent behind this task was "verify A39 is done" or
  "find a new cost"** - section 0 answers both readings; I did not assume one.
- **Wall-clock model latency and whether the uncapped batch action dies at N in
  production** - deployment facts, unmeasurable here (carried from census
  section 7).
