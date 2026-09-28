# Adversarial check: docs/tools-grading-subtab-ac.md

Round 1 of at most two. Fresh checker; did not author the artifact. Read-only
pass: this file is the only write. `docs/tools-grading-subtab-ac.md` was not
edited, no file under `src/` was edited, nothing was committed or pushed.

Verdict is at the end. Six blockers, nine residuals, five attacks returned
empty and are reported as run.

---

## 0. Instruments this check used, and their commands

| Quantity | Command |
|---|---|
| Line counts, counter A | `wc -l <path>` (Bash tool) |
| Line counts, counter B | `@(Get-Content <path>).Count` (PowerShell) |
| Symbol membership | the repo's own `src/tools/symbol-count/count.ts`, `countSymbolOccurrences` transpiled with the installed `typescript` and run over every `.ts`/`.tsx` under `src/` - **2772 files scanned**, matching the artifact's own stated population |
| Backlog row location | `grep -aon "Tools > LMS > Grading[^|]\{0,90\}" docs/BACKLOG.md` (the artifact's own command, run verbatim) |
| Ceiling census | `grep -rn "620" src --include=*.test.ts` |
| Docs gate | `npm run docs:gate` |

`npm run docs:gate` on the tree **with the artifact present: 3 test files
passed, 49 tests passed** (`src/lib/no-emojis.test.ts`,
`src/source-bytes.structure.test.ts`,
`src/tools/vitest-paths/gate-commands.structure.test.ts`, all COVERED). The
artifact's AC12 claim holds.

---

## 1. The two corrections I was told to re-verify independently

### 1.1 "Grading is ALREADY under Tools" - CONFIRMED, every clause

Measured, not inherited:

- `src/app/components/manual/manual-rail.ts:122` is `content: "LMS",` inside
  `MANUAL_VIEW_LABELS` (`:120-128`). CONFIRMED.
- `src/app/components/tabs/tab-sections.ts:40` is `manual: "Tools",` inside
  `TAB_LABELS` (`:38-43`), and that file's header at `:22-29` does say
  `"manual" is the Tools tab and "files" is the Library tab. The label changed;
  the URL value did not`. CONFIRMED.
- `manual-rail.ts:56` is
  `{ id: "lms-grading", label: "Grading", description: "View and manage student submissions" }`,
  returned by `getInnerDestinations("content")` at `:154-156`. CONFIRMED.
- `repo-grades` is `MANUAL_VIEW_ORDER[6]` at `manual-rail.ts:117`, labelled
  `"Repo Grades"` at `:127`, described at `:88` as
  `"Grade student GitHub repos and post the results to Canvas"`. CONFIRMED.
- `TOOLS_RAIL_ITEMS` at `tab-rails.ts:132-140` maps `MANUAL_VIEW_ORDER` with
  `label: MANUAL_VIEW_LABELS[view]`. So the chip set derives. CONFIRMED.

**The reframing is correct and it is the strongest version of the
already-exists case.** A user today reaches a destination whose label is
literally `Grading` (Tools > LMS > Grading) and a sibling Tools chip that
grades and posts to Canvas. The request is a re-grouping inside one rail with a
merge, not a cross-tab move. This attack returns EMPTY.

### 1.2 "Fill waves 6 and 7 do not write GradingTab.tsx" - CLAIM CONFIRMED, CITATIONS WRONG

The claim is true. Three of the four `file:line` addresses that support it are
not where the artifact says.

| Artifact's citation | What is actually there | Where the cited content is |
|---|---|---|
| `docs/a39-fill-waves.md:1250-1255` = "W6 write set" | `:1249` `**Write set:**`, `:1250` blank, `:1251-1252` table header, `:1253-1255` the FIRST THREE rows | the four rows are `:1253-1256`; the cited range **truncates `useIncrementalGradingRun.lifecycle.test.ts`**, one of the four paths the artifact then lists |
| `docs/a39-fill-waves.md:1298-1302` = "W7 write set" | the tail of **W6's gate command**, then `---` and blanks | W7's write set is `:1305-1310` |
| `docs/a39-fill-waves.md:1290-1294` = "W7's Group A requires every 9.1 bound held on BOTH counters" | **W6's** changed-lines total and the opening of W6's gate | Group A is `:1314-1318`; the quoted phrase is at `:1317` |

W7's real write set, read at `:1305-1310`: `incrementalRunPlan.ts:99` plus that
file's three flag-off assertions at `:54`, `:58`, `:77`. No `GradingTab.tsx`.
W6's real write set, read at `:1253-1256`: four paths, no `GradingTab.tsx`.
**The conclusion stands. The addresses do not.**

---

## 2. Blockers

### B1 - HAND-ENUMERATED SET PRESENTED AS COMPLETE. NEW.

`docs/tools-grading-subtab-ac.md:196-211` is a table whose declared purpose is
"Does it need a hand edit?", and `:309-313` (THE RULE) states the write set as
"an edit to `page.tsx` and to `manual-rail.ts`, with GradingTab's own body
untouched". Four required edit points are absent from both.

**(a) `src/app/components/manual/ManualRail.tsx` is not mentioned once in the
artifact.** `grep -n "ManualRail" docs/tools-grading-subtab-ac.md` returns
nothing (exit 1). It is the component that renders the inner strip, and it
carries a hand-written ternary:

```
aria-label={manualView === "course-planning" ? "Course build modes" : "LMS views"}
```

(`ManualRail.tsx:48`, inside the `role="tablist"` at `:47`). A new
`manualView === "grading"` that returns inner destinations renders its tablist
**named "LMS views" to assistive technology**. Nothing renders under this
vitest, so no test can see it, and no criterion in the artifact binds it.

**(b) `getActiveDestinationId` and `resolveStateFromDestinationId` need
SIGNATURE changes, not only new ladder branches.** Both take exactly
`(manualView, buildView, contentView)` today (`manual-rail.ts:160-164`,
`:183-188`) and the second returns exactly those three
(`:188`). The inner `gradingView` is a fourth piece of state, so both must gain
it. `ManualRail.tsx:38` calls the first and `page.tsx:506` calls the second -
both callers change. The artifact says only "yes - a hand-written ladder" and
"yes - TWO ladders".

**(c) `src/app/url-state.ts` needs three edits the artifact never names.**
`grep -n "buildUrlSearch\|parseUrlState\|UrlNavState" docs/tools-grading-subtab-ac.md`
returns nothing. Section 2.1 (`:232-234`) requires "the URL param
**`gradingView`**", and a URL param in this repo is exactly three things:
a field on `UrlNavState` (`url-state.ts:290-311`), a parse line in
`parseUrlState` (`:337-350`), and a whitelisted branch in `buildUrlSearch`
(`:380-399`, which emits `contentView` only under
`state.manualView === "content"`). Nothing else writes the query string.

**(d) `useAppNavigation.ts:38-45` declares a SECOND hand-written union
`ManualView`** restating all seven `ManualViewType` members
(`grep -rn "export type ManualView =" src` returns exactly this one site). This
one fails loudly at `tsc` because `normalizeManualView`'s
`ManualViewType` return is assigned into `useState<ManualView>` at `:156`, so it
is the least dangerous of the four - but it is still an edit the assignment must
carry, and `iteration-caps.md` already rules that an assignment missing a file
ships dead code with every gate green.

Corrective move: the consumer must DERIVE the edit surface with its own
instrument (every reader of `ManualViewType`, every reader of
`getInnerDestinations`/`getActiveDestinationId`/`resolveStateFromDestinationId`,
every writer of the query string) and report what this table missed - not accept
a longer version of the table. `traps-spec.md:30-33` already states this rule
for exactly this shape.

### B2 - REPEAT-OF B1 (same corrective rule): the collision inventory in section 4 is a floor, and TWO of the misses are in WAVE 1.

`:278-306` opens "There is no write-set collision (0.2). There are three real
constraints" and names one test file, `autoGradeTransition.wiring.test.ts`. That
citation is correct (`:16` `GRADING_TAB_PATH`, `:395` the one-mount describe,
`:412-417` the `toEqual(["src/app/components/GradingTab.tsx", "src/app/components/LiveFeedPanel.tsx"])`
exact set - all three verified at those exact lines). The inventory is not.

**Wave 1, forced by AC8's requirement that `isContentView("grading")` be
false** - which requires `"grading"` to leave `ContentView`
(`content-tab/constants.ts:3`), because `LMS_VIEW_PRESENCE`
(`manual-rail.ts:25-34`) makes the two co-extensive:

- `src/app/components/contentTab.wiring.test.ts:49-60` - `extractRenderChain`
  locates the chain with `src.indexOf('view === "grading" ? (')` and **throws**
  when it is -1. It is called at `:64`, inside the describe callback, so the
  whole block fails, not one case.
- `src/app/components/contentTab.wiring.test.ts:72` -
  `expect(LMS_VIEWS.length).toBe(8)`. Becomes 7. RED.
- `src/app/components/contentTab.wiring.test.ts:36` - `SELF_HOSTING_VIEWS`
  still holds `"grading"`; nothing tells the implementer whether it shrinks to
  two or the partition count at `:73` moves.
- `src/app/components/manual/manual-rail.test.ts:34` -
  `expect(getDestinationById("lms-grading")).toBeDefined()`. AC8 requires the
  exact opposite. RED.
- `manual-rail.test.ts:56` - `getActiveDestinationId("content", "new", "grading")`
  and `:117` - `resolveStateFromDestinationId("lms-grading", ...)` expecting
  `contentView === "grading"`. Both RED, and both additionally become **`tsc`
  errors**, because `"grading"` is no longer a `ContentView` argument.

The artifact cites `contentTab.wiring.test.ts` exactly once
(`:81`, as corroborating evidence that grading is self-hosting) and never as a
file this work turns red. An implementer handed "add a removal block modelled on
the course-intel block" and hitting five red pre-existing assertions has to
decide alone whether to delete them. `AGENTS.md`'s own recorded rule -
"never ship a loosened guard without the feature it was loosened for" - has no
criterion behind it here.

**Wave 2: the recording canaries.**
`grep -n "recording-split" docs/tools-grading-subtab-ac.md` returns nothing. The
artifact prices rows 3 and 4 as size work (`:265-270`, "Moving them is
decomposition work") citing `file-size-ceiling.structure.test.ts:51-54`. The
real constraint is
`src/app/components/recording/recording-split.structure.test.ts`, which freezes
`"grading"` and `"snapgrade"` into the Recording strip in at least six places:

- `:137-144` `expect(entries).toHaveLength(12)` on the strip literal;
- `:150-152` `expect(recordingTabContent).toMatch(/\["grading",\s*"[^"]+"\]/)`;
- `:169-176` the restore guard must contain `v === "grading"`;
- `:196-199` `expect(matches).toHaveLength(11)` on `role="tabpanel"`;
- `:209-234` the `keys` array naming `grading` and `snapgrade`, with
  `expect(panelTargets.size).toBe(11)` and an `id="rec-panel-grading"`
  requirement;
- `:261-265` `aria-labelledby="rec-tab-grading"` must appear.

Wave 2 is a frozen-canary problem with six named assertions, not a size
problem. The artifact's own `wc -l`/`Get-Content` figure of 917 for
`RecordingTab.tsx` is correct (I measured 917 on both) and is the wrong worry.

### B3 - QUANTITY NOT PRODUCED BY THE NAMED INSTRUMENT. NEW.

The artifact's `:104-127` claims "Two instruments, both named, for every
number." Four numbers fail that standard, and one of them is the artifact's own
pasted command disagreeing with its own stated answer.

**(a) `docs/BACKLOG.md:128` is wrong, and it is cited three times.** The
artifact pastes its command at `:64`. Run verbatim:

```
grep -aon "Tools > LMS > Grading[^|]\{0,90\}" docs/BACKLOG.md
133:Tools > LMS > Grading, scroll to Submissions, pick a file with the rubric box still empty, then type a rubric,
```

One hit, as claimed - at **`:133`**, not `:128`. `docs/BACKLOG.md:128` is row
`L3`, about dead CSS tokens. `:133` is row **A40**. The wrong number appears at
`:64-66` (section 0.1), at `:166` (survey row 8's `(G)` cell) and at `:403`
(AC6's stated reason).

**(b) `GradingRecordingPanel` is 977, not 964, and the number came from a doc.**
Survey row 3 (`:161`) reads
"`GradingRecordingPanel` (`grading-recording/`, 964 per `docs/loop/traps-spec.md:12-15`)".
Measured now: `wc -l` -> **977**; `@(Get-Content ...).Count` -> **977**. The
trap card does say 964 at `:12-15`, so the citation resolves - but a doc is not
an instrument, and the figure is 13 lines stale. **This one is load-bearing in a
way the artifact does not see:** `grading-recording/` is not under
`src/app/components/recording/`, so it is NOT excluded by
`isCoveredByRecordingSplitCheck` (`file-size-ceiling.structure.test.ts:56-62`)
and IS checked against `const LIMIT = 1000` (`:41`). At 977 it has **23 lines of
headroom against the only mechanical size ceiling in the tree** - while section
4(a) spends its argument on 3 lines of headroom against a ceiling that, as the
artifact itself correctly proves, no test enforces at all.

**(c) Clause (G)'s precedent is cited to a code fence.** `:138-139` cites
`docs/grading-path-survey.md:36-37` for
"the ones that are actually a **grading** path (score a submission, or gate
whether/what gets posted to a gradebook)". Measured: `:36` is a `grep -rn
"inlineData"` line and `:37` closes the fence. The quoted text is at
**`:40-42`**. The substance is exactly as quoted, and row 9's captioning ruling
is real (`docs/grading-path-survey.md:91`) - but the primary half of the line
the artifact says the owner will judge is addressed to the wrong lines.

**(d) `ta-content-view` is attributed to the wrong file.** `:226-227` lists
"`ta-manual-view`, `ta-build-view`, `ta-content-view`, `ta-workflows-view`,
`ta-drafts-view`, `ta-tasks-view` at `useAppNavigation.ts:46-61`". Five of six
are there (`:46`, `:49`, `:51`, `:53`, `:55`). `grep -rn '"ta-content-view"' src`
returns exactly one site: `src/app/components/content-tab/constants.ts:6` - which
the artifact itself cites correctly in AC7 at `:408-409`.

Minor in the same class: `contentTab.wiring.test.ts:35` (`:81`) is the last line
of the comment; `SELF_HOSTING_VIEWS` is at `:36`. `a39-fill-waves.md:69` (`:284`)
is a row of a size table reading `620 | 620 | 620`, not a statement of the
`-le 620` bound; only `:1000` states the bound.

### B4 - CHECK BOUND TO AN OBJECT THAT CANNOT CARRY IT. NEW.

**AC7** (`:406-432`) requires that `contentView=grading` in a URL,
`ta-content-view = "grading"` in storage, and the destination id `lms-grading`
each "resolve to the Tools > Grading destination with the run surface selected,
and the canonical value is what is written back". Its named instrument is
"in `url-state.test.ts` and `manual-rail.test.ts`".

`url-state.ts` cannot host that rule under its own documented contract.
`:313-322` states that `parseUrlState` "parses every field independently of the
others" and that deciding which sub-view is in effect "is the caller's job
(page.tsx) ... walking the chain one level at a time". An alias from a
`contentView` value to a `manualView` value is a CROSS-FIELD rule. It therefore
lives in `parseUrlState` in violation of that contract, or in `page.tsx` /
`useAppNavigation.ts` - and in the latter case AC7's two named test files cannot
reach it, because `useAppNavigation`'s closures only run inside a real React
render, which is precisely why `useAppNavigation.test.ts` reads source text
instead (its header, `:1-17`). The artifact correctly relocates the
CONSTRUCTION to the architect (`:431-432`) but pre-commits the INSTRUMENT's
location before the construction exists. Either the criterion names the object
abstractly and lets the architect place the instrument, or the architect's
answer is constrained first.

**AC6's stated reason is self-defeating against AC8.** `:402-404`: "Stated as a
criterion because `docs/BACKLOG.md:128`'s own owner-verification instrument
names that surface by path, and an owner following it must still arrive." The
real row (A40, `:133`) names the path "Tools > LMS > Grading, scroll to
Submissions" - and **AC8 deletes that destination**. AC6 constrains only
`normalizeGradingView(null)`; it does nothing to keep A40's navigation string
true. A40's text needs updating and no residual records that.

### B5 - AN ASSERTION THAT CANNOT FAIL. NEW.

AC8 (`:434-446`) lists five sub-assertions. The fourth is
"`getActiveDestinationId` never returns `lms-grading` for any member", and its
named model is the `course-intel` block at `manual-rail.test.ts:337-366`. That
block's shape, read at `:352-357`:

```
for (const view of MANUAL_VIEW_ORDER) {
  expect(getActiveDestinationId(view, "new", "modules")).not.toBe("course-intel");
}
```

The loop fixes `contentView` at `"modules"`, and `getActiveDestinationId`
returns `` `lms-${contentView}` `` for `manualView === "content"`
(`manual-rail.ts:167-168`). So the analogous assertion is **TRUE TODAY, with
`lms-grading` fully present in the rail**. It passes before any work is done.
Under the only other reading - ranging over `ContentView` rather than
`ManualViewType` - the call is unwritable, because `"grading"` would no longer
be a `ContentView` and the line is a `tsc` error. The sub-assertion is vacuous
or impossible; it is not a check. AC8's other four sub-assertions are sound.

### B6 - THE SILENT-GREEN BUILD, NAMED. NEW.

Build wave 1 exactly as the artifact specifies: add `"grading"` to
`ManualViewType`, `MANUAL_VIEW_ORDER`, `MANUAL_VIEW_LABELS`; add a
`destinations` group; add a `getInnerDestinations` branch; add branches to both
ladders; add a `page.tsx` render block; add `gradingView` state,
`ta-grading-view` and `normalizeGradingView` in `useAppNavigation.ts`. Write
AC1 through AC12 as specified. Result:

1. **The inner nav is announced as "LMS views"** (B1a). No gate sees it.
2. **The `gradingView` URL param is never written.** `buildUrlSearch`
   (`url-state.ts:367-417`) is the only builder of the query string and has no
   branch for it; `UrlNavState` has no field for it. AC5's instrument reads
   `ta-grading-view`; AC6's reads `normalizeGradingView(null)`. **No criterion
   in the artifact touches the URL param that section 2.1 requires.**
3. **Back and Forward silently lose the inner selection.**
   `useAppNavigation.ts:580-582` is the popstate restore:
   `setManualView(parsed.manualView)` then hand-written
   `if (parsed.manualView === "course-planning") setBuildView(...)` /
   `if (parsed.manualView === "content") setContentView(...)`. A `"grading"`
   branch is required and unnamed. This is not cosmetic: `url-state.ts:5-13`
   records that "the instructor overruled that explicitly" and that
   second-level controls inside a tab's sub-view each get a history entry -
   "do not narrow this scope again without asking". Wave 1 as specified narrows
   it.
4. `npm run lint`, `npx tsc --noEmit --incremental false`, `next build`,
   `npm test` and every structure test are green, because nothing in this repo
   renders a component and nothing asserts on the query string for a param that
   does not exist.

**Answer to the explicit question about multi-path runs: NO instrument in the
artifact runs two or more paths outside the wrapper.** AC10 is
`npm run test:paths <one path>`; AC12 is `npm run docs:gate`; `:330-331` states
the wrapper rule. The artifact's spelling without `--` matches the repo's own
`docs:gate` script (`npm run test:paths src/lib/no-emojis.test.ts ...`), and
`gate-commands.structure.test.ts` passed with the artifact in its corpus. That
attack returns EMPTY.

---

## 3. Attacks that returned EMPTY, reported as run

**E1 - the reference counts for `LiveFeedPanel` and `GithubGradingPanel`.**
Verified with the repo's own two-instrument tool over 2772 files, not `grep -c`.

| Symbol | Files with `codeOccurrences > 0` | Detail |
|---|---|---|
| `LiveFeedPanel` | 2 | `LiveFeedPanel.tsx` decl=1; `GradingTab.tsx` decl=1 ref=1 |
| `GithubGradingPanel` | 2 | `GithubGradingPanel.tsx` decl=1; `GradingTab.tsx` decl=1 ref=1 |
| `CartridgeDropPanel` | 3 | own decl; `FilesTab.tsx` decl=1 ref=1; `GradingTab.tsx` decl=1 ref=1 |
| `SnapshotGradingPanel` | 2 | own decl; `RecordingTab.tsx` decl=1 ref=1 |

The artifact's "(decl=1 ref=1)" notation for `GradingTab.tsx` is exactly what
the tool reports. Its `AccommodationsPanel.tsx` example is real:
`code=0 comment=1` for `CartridgeDropPanel`. Its two
`instrumentsReconcile === false` results reproduce exactly
(`autoGradeTransition.wiring.test.ts` for `LiveFeedPanel`, `code=0 str=5`;
`snapshot-grading.structure.test.ts` for `SnapshotGradingPanel`,
`code=0 cmt=5 str=25`), both with `codeOccurrences = 0`, so RES-GRAD-6 is
correctly scoped. **Nothing wrong found.**

**E2 - does clause (D) define the answer to be whatever is already a
destination?** It does real work and it loses nothing. Every surface (D)
excludes still arrives: `LiveFeedPanel`, `GithubGradingPanel` and
`GradingResults` have no code reference anywhere outside `GradingTab.tsx` (E1),
so they travel with row 1 by construction. Promoting either to a nav item would
also immediately break
`autoGradeTransition.wiring.test.ts:412-417`, since `LiveFeedPanel.tsx` is one of
the two files in that frozen `editsSurface="canvas"` set - so (D)'s exclusion is
independently justified, not circular. I enumerated the app's destination space
(4 top tabs; 3 Courses chips; 10 Tools chips; 2 Build, 8 LMS, 12 recView, 2
Drafts, 2 Library, 2 `filesView` inner items) and found no destination
satisfying (G) that the survey omits. **The line holds.** One correction, filed
below as R5: row 8's `(D)` score of "mixed" is wrong - Library > Files >
Submissions is unambiguously a destination (`FilesTab.tsx:730-731`) whose entire
content is `<CartridgeDropPanel />` (`:852`).

**E3 - the 620 ceiling has no mechanical enforcer.** CONFIRMED precisely.
`grep -rn "620" src --include=*.test.ts` returns **exactly 1** hit:
`src/app/components/fab-menu-logic.test.ts:33`, a viewport clamp
(`{ width: 640, height: 620 }`), unrelated. The only mechanical ceiling is
`const LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`.
`GradingTab.tsx` measures **617 on both counters** (`wc -l` 617,
`@(Get-Content).Count` 617). Headroom 3. The artifact is right on every part of
4(a) except the two `a39-fill-waves.md` addresses (B3) and the `:69` reading.

**E4 - the persistence trap.** The artifact does not walk into it. It adopts the
`contentView` precedent (`useAppNavigation.test.ts:38-63` and `:65-88`, both
verified at those lines - a source-text block isolation pinning delegation, and
a derived loop over `LMS_VIEWS`), AC5 mirrors both shapes, and the
localStorage-seeded-initializer class is named and routed to OW2 at `:539-542`
with an owner, an instrument and a step. That is the correct handling given that
nothing renders here. It does not DESIGN the hydration class out (no mount-effect
requirement), but the precedent it copies ships in-tree today, so this is a
routed residual rather than a defect. **Nothing wrong found.**

**E5 - the leverage line.** All three citations resolve and the reasoning is
sound. `leverage.md:42` does say CONCURRENCY is "**NOT YET AN INSTANCE - a
measured GAP**" owned by A46. `:66` does strike Click cost as "Free to any
feature with a UI at all". `:111-123` is the three-way call, and it is addressed
to "a feature this shape"; `seats.md:73-75` does exempt a refactor with the exact
words the artifact quotes. Declining the claim and recording the fired trigger is
the correct disposal, and it is not silence. **Nothing wrong found.**

---

## 4. The twelve criteria, one at a time

| AC | Can it fail on the defect it names? | Finding |
|---|---|---|
| AC1 | Yes, both directions | **SOUND.** `i.label === "Grading"` is a runtime equality over `TOOLS_RAIL_ITEMS`, so a template literal or a split string producing `"Grading"` still matches - evasion is not possible. `"Repo Grades"` is discriminated by exact equality; the two `"Grading ("` labels (`RecordingTab.tsx:592`, both verified) are not in `TOOLS_RAIL_ITEMS` at all. The mutation is real: `MANUAL_VIEW_LABELS` is `Record<ManualViewType, string>` and `MANUAL_VIEW_ORDER` is a plain array, so adding to the first without the second compiles and the chip vanishes. |
| AC2 | Yes | Sound in shape; the round-trip loop at `manual-rail.test.ts:255-268` is the right model. Blocked by B1b: the two functions' signatures change, so "the id round-trips through both functions" is under-specified about what the fourth argument is. |
| AC3 | Only as source text | **Honestly labelled** (`:371-373`). Satisfiable: `page.tsx` uses a literal `{manualView === "<x>" && (` guard for all seven members (`:513`, `:538`, `:560`, `:566`, `:572`, `:578` plus content). It proves a guard exists, nothing about what appears. OW1 carries the visible half. Accept. |
| AC4 | Yes on extra AND missing | The `toEqual` mechanics are correct - array `toEqual` fails on extra, missing and reorder. **But see section 5: it is the weakest requirement in the document**, because its oracle is a list the build declares. |
| AC5 | Yes | Sound, and its two named model cases exist at the cited lines. The mutation (hand-written `\|\|` ladder omitting the last member) does turn case (ii) red. |
| AC6 | Yes | The assertion is sound. Its STATED REASON is not (B4). |
| AC7 | Undetermined | B4. The requirement is right and important; the instrument is bound to files that may not be able to host the rule. |
| AC8 | 4 of 5 | B5 - the fourth sub-assertion cannot fail. And B2 - it forces five existing assertions red without saying so. |
| AC9 | It is a gate, and the artifact says so | **Honest** (`:463-464`). One instrument defect: it pins "either counter moves off 617" as an absolute. The property wanted is "THIS chunk did not write the file", which `git status --short` alone establishes. As written, AC9 goes RED on a different wave's legitimate change to `GradingTab.tsx`. Filed as R1. |
| AC10 | Yes | **SOUND and correctly ADOPTED.** `autoGradeTransition.wiring.test.ts:412-417` is verbatim the exact-set `toEqual`, and its filter runs over `stripComments(...)` output so it is comment-blind. |
| AC11 | Yes, via AC4 | Sound. `incrementalRunPlan.test.ts` does assert the flag is false, and `INCREMENTAL_ROUTE_ENABLED = false` is at `incrementalRunPlan.ts:104` (established; not re-litigated). |
| AC12 | Partly | `npm run docs:gate` passed on this tree (section 0). One defect: it names `npx tsc --noEmit`, not `npx tsc --noEmit --incremental false`. The bare form races on `tsconfig.tsbuildinfo` under concurrency, which is why `parallel-disjointness.md` gives it ONE caller and `a39-fill-waves.md:1297` spells it with the flag. Filed as R7. |

**Which criteria are really assertions of intent rather than instruments:** AC3
(source text only - stated), AC9 (a gate - stated), and the "and the canonical
value is what is written back" half of AC7 (no named object). All three are
declared as such except the last.

**Does the four-item owner walk cover what the tests structurally cannot?**
Mostly. OW1 covers visible chip presence and that the inner nav renders as a
nav; OW2 covers real reload persistence; OW3 covers the old bookmark; OW4 covers
clutter with the honest note that no instrument exists. **Two gaps:** nothing in
the walk checks the inner nav's ACCESSIBLE NAME (B1a - the "LMS views" label
would pass a sighted read of OW1), and nothing checks Back/Forward (B6.3), which
is the one behaviour `url-state.ts:5-13` records as an explicit instructor
instruction.

---

## 5. The weakest requirement

**AC4.** Its pass condition is exact-set equality of
`getInnerDestinations("grading")` against "the wave's declared id list"
(`:374-381`). Implemented exactly as written it protects perfectly against
implementer drift and **cannot detect an incomplete survey**, because the oracle
is a list the build itself declares. The owner's sentence -
"All other grading related tools should also be pulled into this new subtab" - is
a COMPLETENESS requirement, and the artifact's answer to it is an
eleven-row hand-written table (`:157-169`) derived from no instrument, with no
criterion requiring the consumer to re-derive it. If a grading destination is
missing from that table, AC4 is green, AC1 through AC12 are green, and the
owner's sentence is unsatisfied with nothing naming the cause.

I ran that derivation myself (E2) and found no omission, so the table is
CORRECT TODAY. That is a fact about this tree, not a property of the criterion.

---

## 6. Residuals

The artifact's six residuals: RES-GRAD-1 (real - `CartridgeDropPanel`'s two
render sites confirmed by census), RES-GRAD-2 (real), RES-GRAD-3 (real -
`ToolsRailItem`'s `toolsSection` discriminant confirmed at `tab-rails.ts:126-128`),
RES-GRAD-4 (established; not re-litigated), RES-GRAD-5 (real and confirmed by
E3), RES-GRAD-6 (real and reproduced exactly). The artifact is right that none is
a row in `docs/BACKLOG.md` and right to call that a deletion until filed
(`iteration-caps.md:167`, verified at that line).

**One of them is a blocker wearing a residual's clothes: RES-GRAD-1.** Its own
step is "before the wave that re-parents row 1" - which is WAVE 1, the wave the
consumer is about to design. A requirement due inside the wave under design is
an undecided input to that wave, not deferred work.

New residuals this check adds:

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | AC9 pins `617` as an absolute, so it reports RED on another wave's legitimate change to `GradingTab.tsx`; the property wanted is "this chunk did not write it" | test-author | `git status --short` alone, or a before/after pair | before the wave gate is written |
| R2 | `componentStorageKeys.structure.test.ts:234-235` is a FROZEN exact `ta-` key set over the non-test top-level files of `src/app/components/` (non-recursive). A Grading container placed directly in that directory carrying any `ta-` literal turns it red; one placed in a subdirectory does not | architect | `npm run test:paths src/app/components/componentStorageKeys.structure.test.ts` | when the file layout is chosen |
| R3 | **DECISION 18 is uncited**, and DECISION 18 itself carries the wrong premise the artifact corrects. `docs/owner-decisions-2026-09-27.md:144` is "DECISION 18 - the Tools > Grading sub-tab is a container with INNER NAVIGATION", and `:174-176` states "Fill waves 6 and 7 touch `GradingTab.tsx`" - which section 0.2 correctly disproves. The ledger will be read by every future seat | orchestrator | `awk '/^## DECISION 18/,/^## DECISION 19/' docs/owner-decisions-2026-09-27.md` | before the architect pass |
| R4 | `docs/BACKLOG.md:133` (row A40) carries an owner-verification path, "Tools > LMS > Grading, scroll to Submissions", that AC8 deletes | backlog seat | `grep -an "scroll to Submissions" docs/BACKLOG.md` | the push that lands wave 1 |
| R5 | Survey row 8's `(D)` is scored "mixed"; Library > Files > Submissions is unambiguously a destination (`FilesTab.tsx:730-731`) whose whole content is `<CartridgeDropPanel />` (`:852`), which strengthens rather than weakens the owner's claim on it | architect | the destination enumeration in E2 | with RES-GRAD-1 |
| R6 | `docs/loop/traps-spec.md:12-15` states `GradingRecordingPanel.tsx` at 964; measured 977 on both counters. The trap card's own instance is stale | whoever next edits that card | `wc -l` and `@(Get-Content).Count` on that path | next loop-doc pass |
| R7 | AC12 names `npx tsc --noEmit` rather than `npx tsc --noEmit --incremental false` | test-author | `docs/loop/parallel-disjointness.md`'s one-caller rule | before the build brief |
| R8 | Nothing in the criteria or the owner walk binds the inner nav's ACCESSIBLE NAME, and `ManualRail.tsx:48`'s ternary silently supplies `"LMS views"` | accessibility seat (wave 3) | reading claim only - no component renders here | with B1a's fix |
| R9 | Nothing binds Back/Forward for the inner selection, against the explicit instruction recorded at `url-state.ts:5-13` | test-author | a `buildUrlSearch`/`parseUrlState` round-trip case in `url-state.test.ts` | with B1c's fix |

---

## 7. What the artifact gets right, in one place

Stated because five of eight attacks returned empty and that is a result:

- Both corrections in section 0 are substantively CORRECT, and both change the
  work as claimed.
- The survey's membership calls are correct, verified with the repo's own
  two-instrument census rather than `grep -c`, and the `AccommodationsPanel`
  example that justifies the tool is real.
- Clause (D) does real work and loses no surface the owner would name.
- 4(a) is correct in full: 617 on both counters, 3 lines of headroom, exactly one
  `620` in the test tree and it is unrelated, `LIMIT = 1000` the only mechanical
  ceiling.
- AC1 and AC10 are sound instruments. AC3 and AC9 are honestly labelled as not
  being instruments.
- The DECISION 17 reading is correct and correctly cited (`:106-113`, `:110-121`,
  `:115-118` all resolve), and 1.1's conclusion that the concurrent tool is row 1
  follows from it.
- The leverage handling is correct and correctly cited.
- It satisfies every obligation DECISION 18 lays on the scope pass: an explicit
  LINE, a first landing set rather than one commit, an inner-selection
  persistence story with a first-load answer, and the fate of the old
  location's persisted view id.
- `npm run docs:gate` passes with it in the corpus.

---

## 8. Verdict

**NOT BUILDABLE** as it stands.

Counts by severity: **6 blockers, 9 new residuals** (plus 6 pre-existing, one of
which is misclassified).

| # | Class | NEW / REPEAT |
|---|---|---|
| B1 | Hand-enumerated set presented as complete (edit points) | **NEW** |
| B2 | Hand-enumerated set presented as complete (asserting tests) | **REPEAT-OF B1** - same corrective rule: derive the set with an instrument instead of lengthening the list |
| B3 | Quantity not produced by the named instrument | **NEW** |
| B4 | Check bound to an object that cannot carry it | **NEW** |
| B5 | An assertion that cannot fail | **NEW** |
| B6 | Reachability not traced from the control to the code | **NEW** |

B2 is labelled a REPEAT deliberately and not relabelled to buy a round. Both it
and B1 are fixed by the same rule, so under
`iteration-caps.md:132-135` that class goes to **disposal now** rather than to a
longer table: the corrective move is (a) RELOCATE - require the architect pass to
derive the edit surface and the asserting-test set with its own instruments and
report what the artifact's lists missed. Strengthening the tables is the
forbidden second attempt.

### Shortest set of changes that makes it buildable

1. **Replace section 2's table and section 4's write-set sentence with a
   derivation obligation** on the architect: every reader of `ManualViewType`,
   every caller of `getInnerDestinations` / `getActiveDestinationId` /
   `resolveStateFromDestinationId`, and every writer of the query string, listed
   by an instrument. Name `ManualRail.tsx` (props plus the `:48` `aria-label`
   ternary), the two signature changes, and `url-state.ts`'s three points
   (`UrlNavState`, `parseUrlState`, `buildUrlSearch`) explicitly, since they are
   already measured here.
2. **Same obligation for the asserting-test set**, and state plainly that AC8
   forces `contentTab.wiring.test.ts:49-60, :72` and
   `manual-rail.test.ts:34, :56, :116-120` red (two of them at `tsc`), with a
   rule on what may be edited in them. Add the six
   `recording-split.structure.test.ts` assertions to wave 2's constraint list.
3. **Fix the four wrong quantities and re-measure the fifth:**
   `docs/BACKLOG.md:133` (three places), `GradingRecordingPanel` 977 with its two
   counters and the note that it has 23 lines against `LIMIT = 1000`,
   `docs/grading-path-survey.md:40-42`, `docs/a39-fill-waves.md:1253-1256` /
   `:1305-1310` / `:1317`, and `ta-content-view`'s real home.
4. **Re-bind AC7** to an object abstractly ("the resolution rule, wherever the
   architect places it, with its instrument named once that is decided") and
   delete AC6's stated reason, replacing it with R4.
5. **Replace AC8's fourth sub-assertion.** It cannot fail. The construction that
   makes the bad state unrepresentable is already in the tree:
   `validateLmsViewsCompleteness()` (`manual-rail.ts:221-241`) plus the
   `LMS_VIEW_PRESENCE` exhaustiveness check - assert on those, not on a loop with
   a fixed `contentView`.
6. **Add two criteria for B6:** one binding the inner tablist's accessible name
   (a reading claim, and an OW item), and one binding a
   `buildUrlSearch`/`parseUrlState` round-trip for `gradingView` plus the
   popstate branch at `useAppNavigation.ts:580-582`.
7. **Promote RES-GRAD-1 out of the residual register** into a wave-1 input, and
   file R3 against the decisions ledger.

---

## 9. Stopping point

What remains is **design** and **measurement**, in that order. Nothing here
needs an owner ruling and nothing turns on a fork the orchestrator has to
settle: DECISION 18 is settled and this check does not reopen it, and DECISION
17's reading is correct as cited. The one thing that touches a RULING rather
than the seat is R3 - the wrong W6/W7 premise inside DECISION 18 itself - and it
is a record correction, not a decision to re-take, because the artifact's
conclusion already lands on one of the two branches DECISION 18 permits.

**What I checked:** every `file:line` in the artifact that points into `src/`
(all resolved except `contentTab.wiring.test.ts:35`); every `file:line` that
points into `docs/` (three wrong, listed in B3 and 1.2); both line counters on
`GradingTab.tsx`, `RecordingTab.tsx` and `GradingRecordingPanel.tsx`; the
symbol census for five components over 2772 files with the repo's own tool; the
full destination space of the app against clause (G); all twelve criteria against
the tree they bind; the three "derives" claims traced to the rendering component;
`npm run docs:gate`.

**What I did not check:** the `@(Get-Content).Count` counter on the "eleven other
nav files" the artifact says it measured (I verified three of them); whether
`RecordingTab.tsx` can be decomposed for wave 2 (that is the architect's, and the
artifact says so); the actual click-cost delta, which the artifact declines and I
did not measure either; whether the artifact's proposed wave 3 crossing of the
`toolsSection` discriminant is feasible; and anything requiring a rendered
component, a live key or a browser - there is no instrument for those in this
checkout.
