# Adversarial check: grading-chat-architecture.md (wave 1, architect + reuse)

Fresh `loop-checker`. Did not author the artifact. Checked before the
plan/test/UX seats consume it. Default-to-defective when uncertain.

HEAD at check time: recent commits show N13a landed (`d5179a92`, `bc1c1453`),
so the doc's git-status snapshot (six N13a `class-trends-draft` files) is now
stale; the live concurrent work is RES-A11Y-6. See NOTE-1.

## Instruments used (every quantity names its command)

| Quantity | Command |
|---|---|
| Line count A | `wc -l < <path>` (Bash) |
| Line count B | `@(Get-Content <path>).Count` (PowerShell) |
| id/symbol collision | `Grep pattern="grading-chat|gradingView === \"chat\"|GradingChat|ta-grading-chat|\"chat\"" glob=*.ts*` |
| cited-line reads | `Read` at each cited line |
| docs gate | `npm run docs:gate` |
| tree state | `git status --short` |

---

## What I verified and confirmed SOUND (run-and-confirmed, not run-and-empty)

**Reuse list - opened well over half at the cited line; every one resolves and
does what the doc claims:**

- `incrementalRunPlan.ts` leaf, read in full: `mergeArrivedResults` (:172) is
  sourceIndex-keyed, sorted ascending, last-wins; `totalTicketCount` is
  provably NOT a filter bound (the parameter is unused in the body - the F22
  comment at :165-170 is accurate). `classifyItemFailure` (:198),
  `canonicalColumns` (:237, frozen `criteriaNames` when non-empty),
  `buildIncrementalRun` (:260, recomputed from raw arrived every call),
  `GradeRunItemRequestBody` (:57-65), `ArrivedItemResult` (:67-70),
  `INCREMENTAL_CONCURRENCY = 3` (:31), `estimateEntryWireBytes` (:80),
  `ITEM_REQUEST_BYTE_BUDGET` (:42), `INCREMENTAL_ROUTE_ENABLED = false` (:104),
  `routeGradingRun` (:125-142). The append-safety claim (R1/section 2.2) HOLDS:
  none of the reused leaves carries a fixed-total assumption. The pure-leaf
  import-from-client claim holds (`:19-23` comment; reconcile.ts is a pure leaf).
- `route.ts` read in full: POST (:127) grades `gradeEntries([entry], ...)`
  (:173, one-element array), `requireUser()` (:133), `maxDuration = 60` (:26),
  soft `TOTAL_BUDGET_MS = 50_000` (:38) via `raceWithTimeout` (:172). **R4
  confirmed**: each submission is its own HTTP request/auth/budget/invocation;
  no single 60s invocation spans the session; the cron `deadlineMs` is NOT
  passed by the route (no `options` arg at :173) and could not fire on a
  1-element array anyway (the `i > 0` guard, `engine.ts:219`). The decision not
  to port the wall-clock deadline is well-founded (`gemini.ts:28-31` confirms
  the deadline is the cron mechanism).
- `engine.ts`: `gradeEntries` (:430) -> `gradeStudentEntries` (:438);
  `.slice(0, maxSubmissions)` (:204) with `maxSubmissions =
  getGeminiMaxSubmissions()` (:200). **The 40-cap-is-a-no-op-over-one-element
  claim (5.2) HOLDS.** `DEFAULT_MAX_SUBMISSIONS = 40` (`gemini.ts:32`).
- `run-header.ts`: `resolveRunHeader` (:32), blank-instructions refusal
  byte-identical (:38-40), blank-rubric synthesis gated on
  `synthesizeRubricWhenBlank` (:42-47), `criteriaNames` (:49), and the
  **SERVER-ONLY** constraint the doc relies on is real (:16-19: reaches
  `lib/supabase`, must never be a client closure or barrel re-export). The doc
  correctly routes it through a "use server" action.
- `single-file-entry.ts`: `classifyGradingUpload` (:36, extension-only,
  zip|single|unsupported), `buildSingleFileEntry` (:72, async, Buffer,
  returns null on failure). `.docx`-as-zip handled; `.docx`-renamed-`.zip`
  still open (RES-A39A-9), correctly marked inherited.
- `repo-content.ts`: `fetchGradableRepoContent` (:55) **never throws** (:48-54,
  returns `{error}`), returns `{repo, ref, content, files, fileCount,
  truncated}` (:28-44). `parseSubmissionGithubUrl` returns `{error}` on
  non-GitHub (:56-57), so arbitrary URLs are genuinely REFUSED, not attempted.
- `grading-incremental.ts` (the do-not-reuse model): `prepareGradingRunAction`
  (:79), `requireAppOwner()` (:80), fuses (a) `resolveRunHeader` once (:159,
  `synthesizeRubricWhenBlank: !canvasUrl`) with (b) per-input extraction
  (:122-134) into a FIXED ticket list (:170). Collision refusal is a thrown
  Error with prefix `"Refused: "` (:60, :196-198). **The "split the fused
  action" spine is justified.**
- `useIncrementalGradingRun.ts` (the do-not-extend model), read in full:
  genuinely batch-shaped - one FormData (:219), `prepareGradingRunAction` once
  (:246), fixed `requests` (:270-271), cursor drain returning on `index >=
  requests.length` (:190), `Promise.all` over workers resolves the run (:209),
  `incrementalTotal` set once (:269), terminal computed against known total
  (:214). `postGradeRunItem` (:76-87) and the per-item `.catch` (:192-200) are
  file-private (not exported) - so the doc's "copy these two, import the rest"
  split is accurate. **R1 (new sibling, not extension) is justified** and the
  drift risk is contained: projection/column/failure logic is IMPORTED, only
  ~12 lines of transport are copied (the leaf is sync/pure so the async fetch
  cannot live there). Minor, acceptable; noted as NOTE-2.

**Enumeration / mount (attack 4):**
- `manual-rail.ts`: `GradingView` = exactly 5 members (:38);
  `GRADING_VIEW_PRESENCE: Record<GradingView, true>` (:40-46, tsc-forced);
  `GRADING_VIEWS` derived via `Object.keys` (:47, so a new key auto-covers the
  derived guard); Grading destinations group (:113-122, the 5 existing ids);
  `getActiveDestinationId` generic `` `grading-${gradingView}` `` (:238-239, no
  edit needed); `resolveStateFromDestinationId` gradingView IIFE (:328-335,
  falls back to `currentGradingView`); `INNER_NAV` grading -> "Grading tools"
  (:187-191), `getInnerNavAriaLabel` (:215-218). All enumeration claims (7.2)
  are accurate.
- Derived GUARD `manual-rail.test.ts:323-337` confirmed: iterates
  `GRADING_VIEWS`, 5th arg `"run"` (:326), so a member with no resolver branch
  falls back to `"run"` and fails `toBe("chat")` -> RED. **It genuinely
  auto-forces the resolver branch.** I-inner canary `manual-rail.test.ts:238-245`
  is the exact 5-id list (CANARY, correctly classified).
- `page.tsx`: always-mounted display-toggled capture idiom (:685-729)
  confirmed; run/repos ternary (:619) excludes chat; drafts conditional
  (:649-651) untouched. The comment at :614-618 states the exact
  two-surfaces-at-once hazard the doc's mount decision avoids. `GradingTab.tsx`
  is NOT in the write set and needs no edit. Mount justification (holds an
  in-flight pool + accumulated rows a conditional unmount would drop) is a
  sound parallel to the MediaStream panels.
- I-W2 `assertAlwaysMounted` (`topLevelTabs.wiring.test.ts:520-567`) and I-R-1
  (:576-591) confirmed; I-chat-mount is modelled on the former's three checks
  (one render site, immediate-wrapper `display:...none` regex, wrapper guard
  terms) exactly. I-R-1 uses `indexOf` (first occurrence = :619) so the new
  sibling does not disturb it.
- **Collision check [MEASURED, Grep, not `grep -c`]:** no `grading-chat`, no
  `GradingChat`, no `ta-grading-chat`, no `gradingView === "chat"` anywhere in
  `src`. The two `"chat"` hits are unrelated (`FabQuickActionsMenu.tsx:145` key,
  `session-diagnostic-log.test.ts:426`). New ids are free.

**Build gate (attack 6):** N2 (`grading-chat-intake.ts`) genuinely introduces a
new `"use server"` file, so `npm run build` IS the correct required gate; both
exports are async; `buildRepoUrlEntry` is module-private (no export-shape
violation); no type re-export is specified. The new actions use
`requireAppOwner()` (the STRONGER guard), not the route's `requireUser()`, so
the weaker guard is not copied; the route's `requireUser` asymmetry is genuinely
inherited (the batch path has the identical asymmetry) and correctly routed to
security as R7. Sound.

**Line counts [MEASURED, both counters agree on all 11 files]:** page.tsx
804/804, manual-rail.ts 360/360, manual-rail.test.ts 558/558,
topLevelTabs.wiring.test.ts 634/634, useIncrementalGradingRun.ts 299/299,
incrementalRunPlan.ts 299/299, grading-incremental.ts 230/230,
single-file-entry.ts 133/133, repo-content.ts 134/134, run-header.ts 60/60,
route.ts 192/192. Every [MEASURED] figure in section 0 is accurate. Nothing
touched or reused is near 1000. `GradingChatPanel.tsx` (~300-420, does not
exist) is the only ceiling risk; the same-wave `ChatComposer.tsx` split
contingency is real and flagged.

**Wave plan / caller rule (attack 7):** caller chain N1<-N2/N3, N2<-N3, N3<-N4,
N4<-P2, P1 self-guarded - every new export has its caller in the one wave. No
type-only exception claimed (N1 has runtime `buildTextEntry`). One wave is the
right call (surface-is-a-layer; shipping a subset would repeat the
library-without-surface failure).

**Gate hygiene:** section 9 uses `npm run test:paths -- <paths>` (never a raw
multi-path `vitest`/`npm test`), and says so explicitly, citing
`gate-commands.structure.test.ts`. No silent-arg-drop path. `npx tsc --noEmit
--incremental false` carries the anti-race flag. **This attack came back
clean.**

**docs:gate [MEASURED]:** `npm run docs:gate` PASSED - no-emojis (18),
source-bytes (3), gate-commands (28), all green. The document carries no emoji
and no stray bytes.

**R2/R3 isolation (the brief's explicit ask) - CONFIRMED genuinely isolated:**
- **R2 (blank rubric):** `synthesizeRubricWhenBlank` is a single boolean arg to
  `resolveRunHeader` (verified at run-header.ts:44). All three owner outcomes
  flip one boolean or add one `beginSession` guard; none touches the driver,
  taxonomy, mount, or table. The owner's answer is additive/one-flag.
- **R3 (URL scope):** arbitrary-URL is REFUSED with a named reason; an
  arbitrary-URL fetcher is a NEW branch in `prepareChatSubmissionAction`, not a
  shape change. The `url` slot's type does not change when the fetcher is added.
  The owner's answer is purely additive.

Neither fork bleeds into the core design.

---

## FINDINGS

### BLOCKER-1 (NEW) - class: "the intake seam drops run-level metadata the reused grading path consumes"

**File:** `docs/grading-chat-architecture.md:257-261` (IntakeOutcome type),
`:276` (Canvas row), `:288` (`prepareChatSubmissionAction` return).
**Evidence:** `grading-incremental.ts:105-111,173`; `incrementalRunPlan.ts:155`;
`route.ts:158,173`; `engine.ts:195-196`.

`extractCanvasEntries(canvasUrl)` returns `{ entries, pointsPossible }` - the
batch path reads BOTH (`grading-incremental.ts:109-110`), threads
`pointsPossible` into the plan (:173), `buildRunItemRequests` copies it into
every request body (`incrementalRunPlan.ts:155`), the route passes it to
`gradeEntries` (`route.ts:173`), and the engine uses it to scale the student's
total to the assignment's real point scale (`engine.ts:195-196`).

The architecture's `IntakeOutcome` (section 3.2) is exactly
`{ kind: "entries"; entries: StudentSubmissionEntry[] } | { kind: "refused" }`
- it has NO slot for `pointsPossible`, and section 3.6's Canvas note treats
`extractCanvasEntries` as "already returns entries," dropping the sibling field.
The driver seam (section 2.4) likewise has no path to carry it to
`postGradeRunItem`. So a **Canvas-URL submission graded on the chat surface
would dispatch with `pointsPossible = null` and produce totals on a different
scale than the identical Canvas URL graded on the batch `run` surface** - a
silent divergence from the surface the AC (section 0) says it must not
contradict. It passes every green gate here because nothing renders and no
instrument tests Canvas point-scaling through the chat driver.

`pointsPossible` is per-submission-event (only Canvas carries a non-null value;
text/file/zip/GitHub are all null in the batch path too), so the fix is small
and additive: give `IntakeOutcome`'s entries variant a `pointsPossible: number
| null` and thread it through the driver into each dispatched request body. It
does not reshape R1/R3/R4/the mount - but the seam TYPE must be corrected before
the plan/test seats bake the omission in, and the test seat needs an assertion
that a Canvas-URL intake's dispatched body carries the extracted
`pointsPossible` (extending AC-2's "panel values unchanged" to the
extractor-supplied value).

**Same class, RESIDUAL severity (do not need a fix now, but name it):**
`speedGraderUrl` is dropped at the same boundary (`grading-incremental.ts:111`,
consumed by `buildIncrementalRun`'s `speedGraderUrl` param,
`incrementalRunPlan.ts:261`). For a continuous mixed-source run there is no
single SpeedGrader link, so omitting it is arguably correct - but it is the same
seam flattening and should be stated as a deliberate drop, not left silent.

### RESIDUAL-1 (NEW) - the weakest decision (attack 8): entry-counted ceiling refuses a whole normal-sized class

**File:** `docs/grading-chat-architecture.md:428-435` (5.3), `:848` (RES-GC-5).

The ceiling "counts ENTRIES (post-expansion)" with default `maxEntries = 40`,
and `submit` "dispatches nothing" when a submission would carry `dispatchedCount`
past it. A single Canvas URL (or one zip) for a class of 41+ is ONE submission
event that expands past 40 on the first drop - so the surface would **refuse the
entire class and grade zero students**, after `prepareChatSubmissionAction` has
already paid the full Canvas fetch/extraction. This is AC-11-compliant (visible
refusal, no silent drop, one isolated knob) so it is not a blocker - but it will
be implemented exactly as written and produce a poor result for the most common
bulk case. RES-GC-5 currently asks only "is 40 the right number"; it should also
ask the whole-submission-refusal-vs-partial semantics for a multi-entry event.
This is the single choice most likely to ship green and disappoint.

### NOTE-1 (informational) - stale git-status snapshot

Section 0 / 10.2 name the concurrent set as the six N13a `class-trends-draft`
files; those have since landed. Live `git status --short` now shows
`docs/css-orphans.md`, `src/lib/supabase/accessibility.ts`, and
`accessibility.item-title-bound.test.ts` (RES-A11Y-6). The write set is still
disjoint from the live concurrent work (grading-chat/manual-rail/page.tsx vs
lib/supabase/accessibility), so disjointness holds; the doc's own instruction to
re-intersect at dispatch time covers this. No action beyond re-running the
intersection against RES-A11Y-6 before dispatch.

### NOTE-2 (informational) - transport copy is a bounded drift risk

The sibling copies `postGradeRunItem` (~12 lines) and the `.catch` idiom because
both are file-private to the batch hook (confirmed). Acceptable (the pure leaf is
sync, so the async fetch cannot be hoisted there), but if the route's request
contract changes, two copies must move together. Not a defect; flagged for the
plan seat.

---

## VERDICT

**SOUND ENOUGH for the plan/test/UX seats to consume, after one small seam
correction.** The spine (R1 new sibling, R3 taxonomy, R4 per-item bound, the
mount, the storage model) is accurate against the tree: every load-bearing
reuse claim I opened resolves and behaves as claimed, the append-safety and
per-request-timeout reasoning holds, the enumeration/mount follow the wave-2/3
pattern exactly, the new ids are collision-free, the build gate is correctly
required, the caller rule is discharged, and both owner forks (R2/R3) are
genuinely isolated so the owner's answers are additive. docs:gate is green.

The one BLOCKER is a seam-type omission (Canvas `pointsPossible` dropped at
`IntakeOutcome`), fixable additively without touching any of the major shape
decisions - route it to a design correction plus one test-seat assertion; it
does not need a full round.

**Counts by severity:** 1 BLOCKER, 1 RESIDUAL (weakest-decision), 1
same-class residual (speedGraderUrl), 2 informational notes.

**Blockers by class:**
- BLOCKER-1: "the intake seam drops run-level metadata the reused grading path
  consumes" - **NEW**.

**Attacks that came back run-and-empty (no defect):** the gate/silent-green
multi-path check (section 9 uses `test:paths` correctly); the collision check;
the "use server"/build-gate check; the guard-asymmetry-copied check; the
line-ceiling check; the caller-rule check; R2/R3 isolation.

**Stopping point:** *design* (one seam type needs `pointsPossible`; the
test seat needs the matching assertion). Everything else is *nothing*. No
*rulings* are in dispute (the orchestrator's rulings were not the subject here;
R7 asymmetry is correctly deferred to security, not a ruling defect).
