# Design: durability for the Grading chat run (RES-GC-7 / RES-GC-10)

Seat: forward design pass over `docs/loop/seats.md`'s Data/storage and
Reliability briefs. **This is NOT a build activity.** It does not block the
concurrent GRADING-CHAT build (`src/app/components/grading-chat/**`,
`manual-rail.ts`, `page.tsx`, per that build's own gate). Nothing under `src/`
was opened for writing. This document is the only file this pass touches; it
was not committed or pushed (per the brief).

Consumes `docs/grading-chat-reliability.md` (item 4, RES-GC-7/RES-GC-10/
RES-GC-11) and `docs/grading-chat-architecture.md` (section 7 mount, section 12
storage) as the starting design, `docs/grading-chat-acceptance-criteria.md`
AC-15 as the persistence rule this surface already has to satisfy for its
three panel controls, and `docs/BACKLOG.md`'s GRADING-CHAT row, which already
lists RES-GC-7 and RES-GC-10 as **deferred, not covered by this build** -
confirming this pass's premise (`grep -n "RES-GC-7\|RES-GC-10" docs/BACKLOG.md`,
both hits inside the row's "DEFERRED, NOT covered by this build" clause).

## 0. Instruments - every quantity names its command

| Quantity | Instrument |
|---|---|
| Cited-line reads | `Read` at the cited line, on the working tree at pass time |
| Existing-precedent search | `grep -rn`/`grep -rln` over `src`, each hit opened |
| Realistic result-set size | a Node script (`node -e`) that builds N `GradeResult`-shaped objects with realistic text lengths and measures `Buffer.byteLength(JSON.stringify(...), "utf8")` - **labelled ESTIMATED throughout**: it is a synthetic sample, not a captured live session (none exists in this checkout - no key, no network, no rendered component) |
| Residual-id collision check | `grep -rn "RES-GC-" docs/*.md \| grep -oE "RES-GC-[0-9]+" \| sort -u` |
| Docs gate | `npm run docs:gate` (`package.json:22` - `npm run test:paths src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts`) |
| Tree state | `git status --short` |

---

## 1. The question, restated precisely

The chat run (accumulated graded rows + in-flight submissions) lives only in
`useContinuousGradingRun`'s React state/refs (architecture.md section 12,
[READING] - the hook does not exist yet). A reload, crash, or accidental
unmount loses all of it. The build ships RES-GC-11 (an on-screen warning) as
its floor. Is any storage beyond that warning worth building, and if so,
which shape and where?

---

## 2. Existing precedent - two different answers from two sibling surfaces

### 2.1 The surface named in the brief (GradingResults / useIncrementalGradingRun) IS equally ephemeral

[MEASURED] `grep -n "localStorage|ta-grading" src/app/components/GradingTab.tsx`
returns exactly two lines: `GradingTab.tsx:111` (read) and `:133` (write), both
for `ta-grading-source` - a mode selector, not the run. `grep -n "localStorage"
src/app/components/GradingResults.tsx` returns zero direct hits; the one
storage-touching import it has is `persistGradingResultsEdits`
(`gradingResultsHelpers.ts:663-668` [MEASURED, read in full]), which persists a
`Record<string, RowEdit>` of **hand-edited row corrections**, keyed by
`gradingResultsEditsKey(canvasUrl, surface)` - not the graded run itself, and
scoped by `canvasUrl`, which is exactly the kind of "changes after mount" key
the hydration trap in section 5 below is about. **Confirmed: the batch/
incremental Canvas-or-zip "run" surface this feature is modelled on does NOT
persist its results across reload.** A reload of `GradingTab` loses every
score and comment exactly like the chat surface would, and only the
instructor's own row-level edits (if any) survive, keyed to a `canvasUrl` this
surface's chat sessions do not have. This confirms the reliability pass's own
framing: the batch path is "equally ephemeral," so the chat surface is not
introducing a new class of loss, only a longer session in which the existing
class of loss can accumulate more damage before it happens.

### 2.2 A DIFFERENT sibling surface already built and shipped exactly this fix - do not re-invent it, model on it

[MEASURED] `src/lib/github-grading-run-store.ts` (522 lines,
`grep -rln "persistGithubGradingRun\|loadStoredGithubGradingRun" src` returns
only `GithubGradingPanel.tsx` and this file itself - one caller, one owner)
exists precisely because `GithubGradingPanel` (the repo-URL grading surface)
had this same complaint, filed and closed as R2 in
`docs/repo-grading-records-acceptance-criteria.md:53-77` ("R2.1 - THE GAP IS
PERSISTENCE, NOT DOWNLOAD ... the run itself is React state: reload, switch
tabs and back, or close the laptop, and every score and comment is gone").
**This is not a hypothetical option - it is a working, tested pattern already
in this repo, for a sibling grading surface with the same shape of loss.** The
shape it shipped, read in full at the cited lines:

- **What survives** (`github-grading-run-store.ts:33-73`
  `StoredGithubGradingRun`): `gradedAt` (ISO timestamp), a scope label, a few
  small completeness flags, and `run: GradingRun` - the FULL `GradeResult[]`
  including `overallComment`, `strengths`, `improvements`, `resubmitNotice`,
  `rubricAreas`, `totalScore`, `feedback`. Not a bare receipt.
- **What is stripped before serialize** (`:75-124`, `serializeGithubGradingRun`):
  `stripGradingRunForDraft` (`src/lib/workflows/grading-review-rows.ts:90-92`,
  the SAME strip `grading_drafts` uses server-side) empties `submittedFiles`
  entirely (name, extension, `previewContent`, `rawBase64`) and drops
  `codeExecution` - "localStorage's budget is smaller than a DB row's, so this
  module reuses that exact strip rather than writing a looser one"
  (`:82-90`, comment, read in full).
  `submissionTruncated` is the one exception, re-attached by index-pairing
  because it is a single already-computed boolean, never raw bytes (`:99-114`).
- **Never trust stored data** (`:126-370`, `parseStoredGithubGradingRun` and its
  per-field parsers): every field is read out by hand and type-checked; nothing
  is spread or cast; `submittedFiles` is always rebuilt as `[]` regardless of
  what a hand-edited blob claims (`:131-133,254`); a single bad result
  invalidates the WHOLE run rather than silently dropping one student
  (`:277-280`); fields added after the format shipped degrade by an explicit,
  documented per-field rule (untrustworthy-if-absent vs safely-defaults-to-[]),
  never a blanket default.
- **Best-effort write, one run's worth of blast radius** (`:386-404`,
  `persistGithubGradingRun`): a `try/catch` around `localStorage.setItem`; a
  quota/private-browsing throw loses persistence for that one write and
  nothing else - the run stays visible in React state for the rest of the
  session, it just will not survive a reload (comment at `:386-389`, and
  `github-grading-run-store.test.ts:607-635` [MEASURED] exercises exactly this
  with a Storage stub that throws on `setItem`).
- **A restored run must say so** (`:406-422`, `describeRestoredGithubGradingRun`):
  "Restored from your last run, graded `<when>`. Re-grade to refresh these
  results." - kept as a pure string builder, not inline JSX, "so vitest can pin
  it" (comment at `:409-416`).

**Conclusion: option 3 below is not a new invention - it is porting an
existing, tested, shipped pattern to a second surface.** The size-budget
reasoning this precedent already states for itself (`:82-90`: "a reasonable
trade against the alternative of persisting a whole queue's raw submissions
(potentially megabytes) into an origin-wide 5-10MB budget") is the same
reasoning this design reaches independently in section 3.3's measurement.

**Also confirms option 4 is not this repo's own answer to the identical
problem.** `GithubGradingPanel` had the exact same "I lost my graded run"
complaint this feature has, and the repo's own prior design chose localStorage,
not a Supabase table - even though `grading_drafts` (a durable, already-wired
store) existed at the time and was explicitly considered and rejected for this
role (`grading-review-rows.ts:78-90`: drafts "never post from `submittedFiles`"
and "the review step re-fetches files from Canvas on demand" - a different
lifecycle, posting-review, not scratch-session-recovery). Reusing
`grading_drafts` for chat-run recovery would conflate two different meanings of
"stored grade" the repo has kept deliberately separate; a durable option here
would need a NEW table, which is additional, unprecedented cost, not a shortcut.

---

## 3. The options, each with cost, landing, and blast radius

### 3.1 Option 1 - do nothing beyond the warning (the current build's floor)

**Cost: zero (already shipping as RES-GC-11).** **Protects:** nothing beyond
telling the instructor before the loss happens, which is real value (it turns
a silent surprise into an informed risk) but recovers zero work. **Does not
protect:** every graded row and every in-flight submission on any reload,
crash, or accidental unmount. **Honest exposure statement:** for a session that
never reaches 30+ submissions, or where the instructor treats a reload as
"start over" (regenerable by resubmitting - AC-17's whole point is NOT
re-entering instructions/rubric, but re-submitting student files is still
possible), this floor may be genuinely adequate - resubmitting a file is one
click per student, not a redo of the setup. It stops being adequate exactly at
the scale the reliability pass named: 30 submissions deep, a reload throws away
30 model calls' worth of instructor review time, which is the cost that
actually matters (this document's own reliability pass already made that case;
not re-argued here).

### 3.2 Option 2 - RES-GC-10 as originally scoped: a non-content receipt

**Shape (as the reliability pass filed it):** persist only
`{sourceIndex, student, totalScore}` per completed row, explicitly excluding
`strengths`/`improvements`/`feedback`. **What it stores:** three small fields x
N rows. **What it protects:** the instructor learns "these N students were
already graded, with these scores" - a recovery AID, not a recovery. **What it
does not do:** it does NOT let the table redisplay; the instructor still has to
either re-grade (spending the model calls again) or manually copy scores
somewhere before re-grading overwrites them. **Where:** `localStorage`, one
`ta-` key.

**This document's finding against the receipt-only shape:** given section
3.3's measurement, stripping `strengths`/`improvements`/`feedback` saves
negligible bytes (they are the SAME small-text fields the receipt already
budgets a row for) while discarding most of the row's value. The receipt was a
reasonable conservative first guess before any size was measured; now that a
realistic size is available (3.3), the marginal byte cost of keeping the small
text fields is not worth the value given up. **Recommendation: do not build
the receipt as its own, narrower shape - if durability is built at all, build
option 3 instead**, which is barely more expensive and actually restores the
table.

### 3.3 Option 3 - persist the accumulated RESULTS, never the raw submissions

**Shape:** the completed `GradeResult[]` rows (small text: `overallComment`,
`strengths`, `improvements`, `rubricAreas`, `totalScore`, `feedback`), with
`submittedFiles` (large: base64 file content) always stripped before
serialize - modelled directly on `github-grading-run-store.ts` (section 2.2),
not invented fresh. **What restores:** every COMPLETED row, on the next mount.
**What does not restore, unconditionally:** any submission that was in flight
at the moment of loss - there is no way to resume a pending
`/api/grade-run-item` fetch regardless of storage (the architecture document's
own conclusion, section 12, restated correctly by the reliability pass, item 4:
"an in-flight fetch cannot be rehydrated by any storage"). This must be stated
to the instructor exactly as `describeRestoredGithubGradingRun` states it for
its own precedent (section 2.2): a restored session is visibly marked restored,
so the instructor knows the rows on screen are not necessarily the whole
picture of what they had submitted.

**Where: `localStorage`, one NEW `ta-` key** (`ta-grading-chat-results`,
following the exact naming architecture.md section 12 already uses for the
three panel controls - `ta-grading-chat-instructions`,
`ta-grading-chat-rubric`, `ta-grading-chat-input-mode`). Not `sessionStorage`
(would not survive the crash/close case the whole feature is about - a closed
tab loses `sessionStorage` too) and not IndexedDB (higher API and testing cost
for no size benefit at this scale - section 3.3's own measurement shows the
localStorage budget is not remotely under pressure).

**Size, measured against a realistic session, not guessed** [ESTIMATED - see
section 0]: a Node script built 40 `GradeResult`-shaped objects (40 =
`getGeminiMaxSubmissions()`, `src/lib/gemini.ts:32,129` - the session ceiling
architecture.md section 5.3 already reuses, so 40 is the worst case a session
can reach without a ceiling change) with GENEROUS per-field text (a 35-word
strengths string, a 30-word improvements string, a 60-word feedback string,
and 4 rubric-area comments of 15 words each per student - materially more text
than the fixture in `github-grading-run-store.test.ts:20-30` uses, which is a
few words per field). Result: **~96,268 bytes (~94 KB) total for 40 rows,
~2,407 bytes/row average.** Against the same 5-10MB per-origin budget
`github-grading-run-store.ts:82-90` already cites for its own identical shape,
this is roughly 1% of the smaller bound, at the SESSION'S OWN MAXIMUM size -
not a typical session, the ceiling. There is no realistic scenario in which
this shape approaches a localStorage quota problem, and the `try/catch`
best-effort-write idiom (section 2.2) already covers the case where it
somehow does on some other origin content sharing the budget.

**What this option costs beyond a straight port of the precedent - three real
design decisions, not free:**

1. **Write cadence has no natural trigger, unlike the precedent.**
   `persistGithubGradingRun` writes ONCE, when its ONE bounded run completes
   (a fixed-total drain - architecture.md section 2.1). The continuous driver
   has no "run complete" event - `completedCount` grows indefinitely across a
   session with no defined end (architecture.md section 2.4,
   `completedCount: number`, no terminal state). The write must instead fire
   **on every arrival** (each time `mergeArrivedResults` recomputes the
   projection) or on a coarser cadence. At `INCREMENTAL_CONCURRENCY = 3`
   (`incrementalRunPlan.ts:31`), at most 3 completions land close together, and
   each write is a ~2.4 KB `JSON.stringify` + `localStorage.setItem` - cheap
   enough that per-arrival writes need no debounce at this session's own
   ceiling (40 arrivals x ~2.4 KB writes over a session lasting minutes to
   tens of minutes is not a performance concern), but this IS a departure from
   the precedent's shape that the follow-up wave must decide explicitly, not
   inherit silently.
2. **The restored session's ordinal counter must be seeded past the restored
   rows, or a resumed session corrupts itself - not a nice-to-have.**
   `mergeArrivedResults` is keyed by `sourceIndex`, sorted ascending,
   **last-wins** (architecture.md:139-144, "a row never moves, it only
   appears," RULING 30). The driver "assigns `sourceIndex` from a monotonic
   counter" (architecture.md section 2.4). If a restore reseeds the rows array
   but that counter restarts at 0 in the new hook instance, the FIRST new
   submission after a restore is assigned `sourceIndex = 0` - which, under
   last-wins semantics, silently overwrites the restored row that already
   occupies `sourceIndex = 0` in the table, corrupting the exact data this
   option exists to protect. **The stored blob must therefore also carry the
   next-unused ordinal (or equivalently, the count of persisted rows), and the
   restore path must seed the driver's counter from it before accepting any
   new submission.** This is the one piece of this option that is not a copy
   of the precedent (the precedent's run is always terminal - nothing is ever
   appended to a restored `GithubGradingPanel` run) and it is a correctness
   requirement, not an enhancement: get it wrong and option 3 becomes worse
   than option 1, because it appears to restore correctly and then silently
   destroys a row later in the same session.
3. **What deletes this data, and when (Data/storage seat's own required
   question, `docs/loop/seats.md:227-228`).** Nothing today, matching the
   precedent (no TTL on `ta-github-grading-run` either). Recommend the
   driver's own `reset()` (architecture.md section 2.4, `reset: () => void
   // clears the session (new assignment)`, already a planned export) also
   clear the persisted key - starting a new session is the one explicit,
   user-initiated action that should retire the old one, mirroring "nothing
   deletes an old run automatically, but the user's own reset does."

**What this option does NOT claim:** it does not make an in-flight submission
resumable (no storage can, per section 3.3's own admission above and the
architecture's original finding), and it does not persist the resolved run
header (instructions/rubric are already separately persisted per AC-15; the
header is cheap to recompute from them via `beginSession`, matching
architecture.md section 12's own "NO, in-memory (hook)" ruling for the header -
not revisited here).

### 3.4 Option 4 - a durable server-side run store (Supabase table)

**Cost: heaviest.** A new migration (auto-applies on push - memory:
migrations-auto-apply-via-action - so this is a production change the moment
it merges, not a local decision), RLS policies, a typed row mapper (memory:
supabase-types-never-rows - a bare typed select collapses to `never` here), a
retention/cleanup policy for abandoned sessions (the Data/storage seat's own
required question), and a write path from the client driver to a server action
on some cadence (per-arrival writes to Supabase are a much heavier operation
than a `localStorage.setItem` - real network round trips, real RLS evaluation,
per completed row). **What it protects that option 3 does not:** persistence
across devices/browsers, and survival of a cleared-localStorage or
private-window session - genuinely more durable. **What it does not fix:** the
in-flight-submission problem is unchanged (nothing durable can resume a pending
fetch; the fix there, if there is one, is retry/resume logic in the driver
itself, out of scope for storage entirely).

**Recommendation: not worth it for this surface**, for two independent
reasons, not one: (a) section 3.3's own measurement shows the localStorage
budget is nowhere near pressure at this session's own ceiling, so option 4 buys
durability the workload does not need; and (b) section 2.2's precedent finding
- this repo already faced the identical problem on a sibling surface and chose
localStorage over the durable store that already existed and was available
(`grading_drafts`), for a self-serve, human-reviewed, regenerable-by-
resubmitting flow. Building a table here would be inventing a heavier answer
than this repo's own prior design already gave to the same question.

---

## 4. Recommendation

**Build option 3 (persist completed rows, strip raw submissions), modelled
directly on `github-grading-run-store.ts`, as a follow-up wave - not this
build, and not a receipt-only shape.** This is a genuine recommendation, not
"the warning is sufficient" dressed up as one: the measured size (~94 KB at
the session's own 40-entry ceiling, using generously-sized text) is cheap, the
pattern is not invented (it is a port of an already-shipped, already-tested
sibling module), and it recovers the actual thing an instructor cares about
(the graded table), not just a count of it. It is NOT free, for the three
reasons in 3.3 (write cadence, ordinal-continuity, and reset-clears-storage)
and it does NOT solve the in-flight-submission loss, which no storage
shape can. **RES-GC-11's warning must still ship and must still say that
in-flight work is lost even after option 3 lands** - the warning's job changes
from "everything is lost" to "in-flight work is lost, completed rows are not,"
which is a copy change for whichever seat owns RES-GC-11's wording, not a
reversal of it.

**If the owner's appetite is lower than this recommendation:** option 1 (ship
as is) is a legitimate, bounded choice for a self-serve tool where resubmitting
is cheap - stated honestly, not as a fallback nobody should pick. What is NOT
recommended is option 2 alone (the bare receipt), because it costs almost the
same as option 3 while returning much less, and option 4, because nothing
about this workload's measured size or this repo's own prior art on the
identical problem supports its added weight.

---

## 5. The localStorage hydration trap - does it apply here, and how

The brief names a real, recorded repo defect: `persisted-details-open-
hydration` - "a localStorage-seeded `useState` initializer never shows on
reload." Read at its precise, currently-cited location
(`src/app/components/knowledge/knowledge-overview-storage.ts:29-41`
[MEASURED, read in full]), the ACTUAL failure condition is narrower than "any
lazy initializer seeded from localStorage is broken": it is a lazy initializer
whose STORAGE KEY IS SCOPED BY SOMETHING THAT CHANGES AFTER MOUNT (there,
`scopeKey`, which changes every time the instructor selects a different page).
"A lazy initializer runs exactly once per component instance and would keep
serving the FIRST scope's stored value ... forever after" (comment, `:34-36`).
The same file states the safe counter-example explicitly: `useKbAttachments.ts:31`
seeds a boolean the SAME way, "safe there ONLY because that key is not scoped
by anything that changes after mount" (`:30-33`).

**Applied to this design:** a `ta-grading-chat-results` key is a SINGLE,
static key - it is never re-scoped by anything that changes while the
always-mounted panel (architecture.md section 7) is alive; the panel mounts
exactly once for the session, matching the safe case (`useKbAttachments.ts:31`)
rather than the unsafe one (a per-scope key). This repo's own existing,
shipped precedent for a static-key, single-instance, lazy-initializer restore
is `GradingTab.tsx:109-113` (`ta-grading-source`), which restores a value that
drives conditional branching in the UI - a materially similar risk shape to a
results table branching on `results.length === 0` vs `> 0`. **On the narrow
question the recorded trap actually tests (does the key change after mount),
the lazy-initializer pattern is safe here and matches this repo's own already-
shipped answer for a comparable restore.**

**What this pass could not verify, stated plainly:** whether restoring a
WHOLE TABLE'S worth of rows via a lazy initializer produces a visible
hydration-mismatch flash (SSR renders zero rows, client's first hydrating
render reads localStorage and renders N rows) that is worse in practice than
the single-field case `GradingTab.tsx` already ships. **No component is
rendered by any test in this repo** (`docs/loop/this-repo.md`), so this cannot
be checked here; it is an owner-walk item if option 3 is built. If the owner
walk finds a visible flash or incorrect display, the proven fallback already
exists in this repo and should be used instead: seed plain defaults and
re-hydrate via an explicit mount effect
(`knowledge-overview-storage.ts:37-41`, `useKnowledgeOverview.ts`'s own
mount-hydration effect, and `SnapshotGradingPanel.tsx:75,198-199`'s
module-scope-flag variant of the same idiom) - the pattern this brief's own
note anticipated. Recommendation for the follow-up wave: **try the lazy
initializer first** (it matches the repo's nearer, more comparable precedent
and needs no extra render-order plumbing), **fall back to the mount-effect
idiom only if the owner walk observes a problem the lazy initializer causes**
- do not pre-emptively build the heavier idiom against a risk this pass could
not confirm is real for this shape.

---

## 6. Residual register (owner, instrument, step - all three, or it is a deletion)

None of these is a row in `docs/BACKLOG.md` yet; RES-GC-7 and RES-GC-10 already
exist there as deferred (section 0's collision check), and this pass narrows
rather than replaces them. New ids (RES-GC-14/15) avoid collision with the
RES-GC-1..13 already in use (checked: `grep -rn "RES-GC-" docs/*.md | grep -oE
"RES-GC-[0-9]+" | sort -u` tops out at RES-GC-13).

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-GC-7 (narrowed by this pass) | Persist a completed chat run durably. This pass's finding: a Supabase table (as RES-GC-7 originally framed it) is not warranted - localStorage is sufficient at the measured size and matches this repo's own prior answer to the identical problem (section 2.2, 3.4). Keep RES-GC-7 open only for "does the owner want cross-device/cross-browser durability," which nothing here can answer | owner | none - a product want, not a technical question | owner input; not required |
| RES-GC-10 (superseded by this pass's option 3) | The receipt-only shape (`{sourceIndex, student, totalScore}`, no comment text) is not recommended as its own build - section 3.2 finds the byte savings over the fuller option 3 shape negligible relative to the value given up. Recommend closing RES-GC-10 in favor of RES-GC-14 below rather than building it as scoped | data seat + owner | the size measurement in section 3.3 (re-run for real once code exists) | next architecture/data pass on this surface, if durability is funded |
| RES-GC-14 (new) | Build option 3: a `src/lib/grading-chat-run-store.ts` module modelled line-for-line on `github-grading-run-store.ts` (strip via `stripGradingRunForDraft`, strict per-field parse, best-effort write, restored-run banner text), called from `useContinuousGradingRun.ts`, key `ta-grading-chat-results` | data seat (module) + reliability (the requirement) + owner (funds it) | a round-trip test modelled on `github-grading-run-store.test.ts` (round-trips small text, strips `submittedFiles`, degrades a malformed blob to "no run") | follow-up wave; not required for the current build to ship |
| RES-GC-15 (new) | The ordinal/`sourceIndex` continuity requirement (section 3.3, point 2): the stored blob must carry the next-unused ordinal, and the restore path must seed the driver's monotonic counter from it before accepting any new submission, or a post-restore submission silently overwrites a restored row under `mergeArrivedResults`'s last-wins rule | whichever seat authors `useContinuousGradingRun.ts`'s restore path (architect or implementer, if RES-GC-14 is funded) | a driver test: restore N rows, submit one more, assert the new row's `sourceIndex` is `N` (not `0`) and no restored row is dropped or overwritten | same follow-up wave as RES-GC-14 - this is a correctness precondition of that wave, not a separate later step |
| RES-GC-16 (new) | Whether the lazy-initializer restore (section 5) produces a visible hydration flash for a whole table, vs the single-field precedent it is modelled on - could not be verified here (no component renders under any test in this repo) | owner (walk) | owner-walk: reload mid-session after RES-GC-14 lands, watch for a flash or incorrect first paint | owner walk, same follow-up wave; if it fails, fall back to the mount-effect idiom (`knowledge-overview-storage.ts:37-41` pattern), not a redesign |
| RES-GC-11 (unchanged, restated for continuity) | The on-screen warning (already in the current build) must be updated, if RES-GC-14 lands, from "everything is lost" to "in-flight work is lost; completed rows are restored" - a copy change, not a reversal | UX seat (copy) | owner-walk: reload mid-session, confirm the warning's wording matches what actually survives | same follow-up wave as RES-GC-14, after it lands (the warning must describe the ACTUAL behaviour, so it cannot be rewritten before the behaviour exists) |

---

## 7. What I could not determine

1. **Whether a live reload of a real `useContinuousGradingRun` session actually
   produces a visible hydration mismatch for the lazy-initializer restore
   (RES-GC-16).** No component renders under any test in this repo
   (`docs/loop/this-repo.md`); this is reasoned from the recorded trap's own
   stated cause (a re-scoped key) and the nearest working precedent
   (`GradingTab.tsx:109-113`), not observed.
2. **The real per-origin localStorage quota on any device this app will
   actually run on.** The 5-10MB figure used in section 3.3 is quoted from
   `github-grading-run-store.ts:82-90`'s own comment, not independently
   measured in this environment (no browser, no live session).
3. **Whether the owner wants cross-device/cross-browser durability at all**
   (the one question that would revive option 4) - a product want this design
   pass cannot answer from the code or the docs.
4. **`GradingChatPanel.tsx`'s actual write cadence under real concurrent
   arrivals** (point 1 of section 3.3) - reasoned arithmetically from
   `INCREMENTAL_CONCURRENCY = 3` and the measured ~2.4 KB/row write size, not
   measured against a real running instance (the driver code does not exist
   yet).

---

## 8. Gate run on this document

Command: `npm run docs:gate` (`package.json:22`).
