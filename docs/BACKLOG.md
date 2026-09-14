# Backlog

What is OWED, by whom, measured how. Not a diary - `docs/REGRESSION.md` holds
behaviour and the git log holds history. Read at step 0 of `docs/DEV_LOOP.md`,
appended at disposal time, reconciled at the push.

Two rules, both with the failure that produced them:

- **Every entry names the commit that created it.** Without it nothing here can
  be audited against the tree.
- **Every quantity and every quoted rule names the command or `file:line` that
  produced it.** The first version of this file said a panel was 891 lines
  (it was 900) and attributed a rule to `docs/DEV_LOOP.md` that had been deleted
  from it. Both passed every gate, because nothing in the test suite reads
  `docs/`. A backlog of remembered numbers is worse than no backlog, because it
  gets cited instead of re-measured.

---

## 1. Owner-only: needs a live key, a real browser, or a production tick

No `.env` exists in this checkout, vitest is node-env and renders no component,
the network is blocked under vitest, and `gh` is not installed. Nothing in this
section can be closed by an agent here.

| # | Owed | Instrument | From |
|---|---|---|---|
| 1.1 | **Look at the announcement preview.** Its appearance is a reading claim - the styling is ported from `course-intel.module.css` and reviewed by eye, which is how the unstyled version passed review the first time. Check that bullets indent, paragraphs separate, and links look like links. | Open the walkthrough announcement panel | `b3701cd` |
| 1.2 | **Paste a copied draft into Canvas's editor.** Whether a real browser accepts the multi-type clipboard write, and whether the rich flavour arrives as bold rather than asterisks, cannot be tested here: of the 9 `it(` blocks in `src/app/components/ui/clipboard.test.ts` (`grep -c "  it(" `), the ones exercising `ClipboardItem` install a stub class, and one deliberately stubs it as `undefined` to pin the fallback. | Copy a draft, paste into Canvas | `b3701cd` |
| 1.3 | **Read the orphan sweep's first production tick's raw body.** The delete accounting ships OBSERVATIONAL ONLY because what `remove()` returns for a named delete is unmeasured; `matchedByLeafName` / `matchedByFullPath` exist to settle it in one tick. Unblocks 3.2. | The first run's JSON body in the Actions log | `c25bdec` |
| 1.4 | **Confirm the sweep's prefix form matches.** A ruling pinned `${userId}/${segment}` with no trailing slash; only a live listing proves Supabase agrees. Signature of a wrong guess: a positive `scannedUserPrefixes` with every other count at zero. | Same tick as 1.3 | `c25bdec` |
| 1.5 | **Confirm the scheduled workflow fires.** | The Actions web UI after merge | `c25bdec` |
| 1.6 | **Check whether a killed tick leaves its start-of-tick line.** `src/app/api/cron/sweep-orphan-uploads/route.ts:92` logs it; the sibling `run-schedules/` route chose a durable DB write instead, precisely because a tick killed at the platform cap never runs `finally`. | Vercel function logs after the first timeout | `c25bdec` |

## 2. Decisions only the owner can make

| # | Question | Why it is blocked |
|---|---|---|
| 2.1 | **How should a researched resource link look to a student?** An inline `[label](url)` sentence is the current default. A trailing "Related resources" LIST is ruled out: the zero-section branch of `src/lib/walkthrough-announcement-prompt.ts` forbids lists outright, so the presentation must be branch-independent or explicitly branch-aware. | Product judgment; changes what the architect designs |
| 2.2 | **Should a terse template stay terse?** I ruled that the announcement floor (greeting, sign-off, one item per paragraph) outranks an exemplar carrying none, because "announcement-shaped by default" was the ask. It is a deliberate override of exemplar fidelity and it is reversible. | A product call I made on the owner's behalf |

## 3. Next chunk, ready to start

| # | Work | State |
|---|---|---|
| 3.4 | **Suggest-and-confirm roles for snapshot shots.** Created by ruling H1-E. With H1 wave 1 removing the taught Read click, per-shot ROLE ARMING is the only remaining per-shot cost in the owner's original complaint - the criteria banned inferring roles and used that ban to avoid touching arming. The ban on inferring from PIXELS stands and is correct: role is not a caption, it selects the prompt's framing block, drives image-budget priority (`snapshot-grade.ts:75`), drives the Next-student keep/clear partition (`snapshot-shot.ts:210`) and drives `missingRoles`, so a mis-inference changes the score and the data lifecycle. The right shape is SUGGEST-AND-CONFIRM: the read pass already sends every shot to a vision model and returns per-shot results, and the tray already supports select-then-set re-roling, so a PROPOSED role the instructor confirms costs no extra model call and keeps role an instructor attribution. Do not build it blind. | Its own chunk | ruling H1-E |
| 3.5 | **Make the pinned rubric areas EDITABLE before grading (ruling B43-8).** The real fix for rubric parsing, and the owner's own answer forces it: their rubrics include points in a separate column or on their own line, which after flattening may not share a line with the criterion at all - no line-based matcher can ever recover that. Measured proof that the parser cannot be made reliable: `"Thesis (20 pts)"` and `"Excellent (20 pts)"` are byte-identical in grammar, so no punctuation rule separates a criterion from a rating tier; an end-of-line variant invented `Excellent`/`Good`/`Poor` as scored areas and read `"See Figure 3 (2019)"` as a 2019-point criterion. So stop making the parser's precision load-bearing on a grade: `snapshot-grade.ts:121` already computes and returns `pinnedRubricAreas` and `SnapshotGradingPanel.tsx:834-858` already renders them in a live region - turn that display into a confirm/remove list so BOTH over-parse and under-parse are visible and correctable before grading. Disposal by construction (`iteration-caps.md:16`), not another guard. Copy must also name OVER-parse; today it warns only that missing areas were not graded. | Its own chunk; needs criteria | ruling B43-8 |
| 3.2 | **Flip `failedCount` to gating** in `.github/workflows/sweep-orphan-uploads.yml`. A one-line edit an agent makes here; blocked on 1.3's INPUT, not on capability. Until the semantics are known, a wrong guess in either direction poisons the only outbound alert this deployment has. | Blocked by 1.3 |

## 4. Debts a ruling created

| # | Owed | Trigger | From |
|---|---|---|---|
| 4.2 | **Key snapshot-grading citations by shot ID, not array position.** Deleting or reordering a shot silently re-points every citation naming a later index - citations key on a numeric `shotIndex` (`src/app/components/snapshot-grading/snapshot-citations.ts:24,63`), and `SnapshotGradingPanel.tsx:177-183` documents in its own comment that delete and reorder are uncovered. The current flag tracks only restored-at-mount and cleared-by-Next-student. The mechanism needs replacing, not another patch. | Its own chunk | `82f5bde` |
| 4.3 | **Decide whether `extractRubricCriteria` should widen.** The matcher is `src/lib/grade/rubric.ts:16` - `/^(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*(pts?\|points?\|%)?\s*\)\s*:/i`. The unit is OPTIONAL, so `Area (20):` and `Area (20%):` already parse; the real gaps are that the trailing colon is MANDATORY and that any INDENTED line is skipped outright (`rubric.ts:14`), which is exactly why a flattened PDF table parses partially. Blast radius is larger than one consumer: three production call sites (`src/lib/grade/engine.ts`, `src/app/components/grading-recording/grading-feedback-prompt.ts`, `src/app/actions/snapshot-grade.ts`) plus a frozen oracle at `src/lib/rubric-render.test.ts` that imports the real function deliberately, so widening mutates that oracle's inputs too. Size the chunk against all four. | Its own chunk | `d517ba2` |
| 4.4 | **Reclassify every `requireOwner()` call site into `requireUser()` or `requireAppOwner()`.** `requireOwner` is now `return requireUser()` (`src/lib/supabase/auth.ts:451-452`) - any active account passes. Its `@deprecated` block says so outright and calls the state "DELIBERATELY LESS RESTRICTIVE ... a tracked, temporary state, not an oversight", naming the minority of call sites that reach an owner-private shared secret as the ones owed an explicit `requireAppOwner()`. It is genuinely tracked - `docs/multi-user-login-acceptance-criteria.md` A6 and the architecture doc's "The requireOwner() split" - but ONLY there, inside a shipped feature's criteria. Nothing reads that at step 0, which is how a G3 design pass rediscovered it as if it were new. Note `multi-user-login-acceptance-criteria.md:889` records that `requireAppOwner()` has ZERO call sites, so the real owner gate is written but unwired. The entry is here so the wave is visible to the queue, not to re-decide it. | Its own wave; any chunk adding a call site that touches an owner-private secret | `docs/multi-user-login-acceptance-criteria.md` A6 |

## 5. Known gaps, recorded so they are not rediscovered

| # | Gap | Note | From |
|---|---|---|---|
| 5.1 | A hung exemplar fetch disables Generate indefinitely. `WalkthroughAnnouncementPanel.tsx:793` disables it on `savedExemplarsLoading`, and the `Promise.all` at `:241-244` has no timeout - **either** call in it hanging does this, so a fix that times out only one leaves the hole open. Two loading signals exist. CORRECTION, measured: an earlier version of this entry said "neither of which is an error state", which is FALSE for `AnnouncementDraftSlot.tsx:103` - that line is a ternary whose false arm renders "Could not load your saved formats." with a Retry button at `:104-108`. The substance survives anyway, and that is the point worth keeping: on a HANG rather than a rejection, `savedFailed` stays false, so the error arm never renders and the user sees "Loading your saved formats..." forever. An error state that only a rejection can reach is not coverage for a hang. `WalkthroughAnnouncementPanel.tsx:686` has no error arm at all. | Green suite, dead button | `b3701cd` |
| 5.5 | Snapshot grading's restored list is seeded from a `localStorage`-reading `useState` initializer on an SSR'd surface. The identical initializer already ships elsewhere and a structural mismatch recovers by re-render, so this is inherited rather than new. | Reload the running app, read the console | `82f5bde` |
| 5.6 | The sweep's per-call latency assumption (~250ms, `src/lib/orphan-upload-sweep.ts:46,55`) underpins both `MAX_USER_PREFIXES_PER_TICK` and `PHASE1_ROOT_LISTING_BUDGET_MS`. A wrong assumption makes the sweep UNDER-clean, which is the safe direction. | First tick's timing | `c25bdec` |
| 5.7 | **An LLM call with no timeout runs under the platform default, not 60s.** `callLlm` takes no `AbortSignal`, so nothing bounds a first attempt; `learning-resource-links.ts:55-66` documents a 90-100s case and says the mitigation is `RETRY_BUDGET_MS = 32_000` (`:121`), which gates RETRY decisions and does not bound the first attempt. Compounding it: `src/app/page.tsx` exports NO `maxDuration` (`grep -n maxDuration src/app/page.tsx` returns nothing), and this repo already records in its own comments (`src/app/api/automations/run-now/route.ts:35-37`, `course-intel/ask/route.ts:48-59`) that Next honours `maxDuration` for Server Actions only at the PAGE level. So these actions run under the platform default rather than the 60s Hobby figure. When the platform kills the invocation the action's own `catch` never runs, so the client gets a raw transport failure instead of the `{error}` string the action would have returned. Reachable today via `discussion-replies.ts:786` and `learning-resources-generator.ts:229`. Recorded because two separate G3 design passes found it and filed it nowhere. | Its own chunk; needs an owner decision on page-level `maxDuration` vs a call-level bound | `c25bdec`-era, pre-existing |
