# Acceptance criteria: the Tools > Grading sub-tab

Round 1 of this activity. `ls docs/tools-grading-subtab-ac.md` before this file
existed returned "No such file or directory";
`git log --oneline -3 -- docs/tools-grading-subtab-ac.md` returned nothing.
**No prior version exists, so there is no disposition table** - entry gate 3
(`docs/loop/iteration-caps.md:152-157`) does not fire.

Write set: this file only. No file under `src/` or `supabase/` was opened for
writing. `git status --short` is reported at the end.

## The owner's words, verbatim

> "the new concurrent tool should live under the Tools tab, under a new sub tab
> called 'Grading'. All other grading related tools should also be pulled into
> this new subtab"

Every criterion below traces to a fragment of that sentence, and where my
reading and the sentence diverge, the sentence wins.

## OWNER DECISION - the sub-tab carries inner navigation

Given by the owner during this pass: **Tools > Grading is a container with its
own inner navigation across the grading surfaces, not one screen with
sections.** This is recorded as a decision, not a fork. It is not re-argued
below and no alternative is presented. Two consequences the decision creates
are addressed as criteria rather than as options: the inner selection needs a
name, a persistence story and a first-load answer (AC5, AC6), and every surface
pulled in becomes a NAV ITEM, so the survey's line is what keeps the nav from
becoming cluttered (AC4, and the cut in section 3).

---

## 0. Two facts in my brief are wrong by measurement. Both change the work.

I was told to verify and not inherit. Both corrections below are load-bearing.

### 0.1 Grading is ALREADY under Tools. This is partly a MERGE, not a move.

My brief stated "the grading surface currently lives under CONTENT, not Tools."
Every `file:line` it gave is correct; the interpretation is not.

`manualView === "content"` is not a tab called Content. It is a member of
`ManualViewType` whose LABEL IS "LMS" (`src/app/components/manual/manual-rail.ts:122`,
`content: "LMS"`), and `ManualViewType` members are exactly the chips of the
Tools rail. The top-level tab value `"manual"` is labelled `"Tools"`
(`src/app/components/tabs/tab-sections.ts:40`, `manual: "Tools"`), a fact that
file's own header explains at `:22-29` ("manual" is the Tools tab and "files"
is the Library tab. The label changed; the URL value did not").

So the real hierarchy, measured:

- Top strip: `ActiveTab` = `courses | manual | files | course-intel`
  (`tab-sections.ts:31`), labelled Courses / **Tools** / Library / Course Intel
  (`:38-43`).
- The Tools tab shows ONE flattened rail of ten chips, built from
  `MANUAL_VIEW_ORDER` (seven) plus `WORKFLOWS_VIEW_ORDER` (three) -
  `src/app/components/tabs/tab-rails.ts:132-149`.
- `lms-grading`, label `"Grading"`, is an INNER destination of the LMS chip
  (`manual-rail.ts:56`), returned by `getInnerDestinations("content")` at
  `:154-156`.

The backlog instrument my brief flagged is therefore accurate, not evidence of
a second surface: `grep -aon "Tools > LMS > Grading[^|]\{0,90\}" docs/BACKLOG.md`
returns one hit, `docs/BACKLOG.md:128`, "Tools > LMS > Grading, scroll to
Submissions". It names the SAME `GradingTab` this consolidation moves.

**The merge half is real, but it is a different surface.** `repo-grades` is
already a Tools rail chip in its own right (`manual-rail.ts:117`, label "Repo
Grades" at `:127`), and its rail description at `:88` is "Grade student GitHub
repos and post the results to Canvas". A grading tool is already a Tools
sub-tab today. So the owner's request is a RE-GROUPING INSIDE THE TOOLS RAIL -
promote grading out of the LMS group and absorb the sibling grading
destinations - not a cross-tab move.

Corroborating evidence that grading was always a poor fit under LMS, and it is
enforced rather than merely commented: `ContentTab.tsx:572-574` says the
sub-tabs that act on the course loaded there are the rest, and "Grading,
Announcements, Inbox ... carry their own course picker / are
institution-scoped", and
`src/app/components/contentTab.wiring.test.ts:35` encodes that as
`SELF_HOSTING_VIEWS = new Set(["grading", "announcements", "inbox"])`, a set it
describes as "DELIBERATELY absent from `courseTab` and must stay that way."

### 0.2 Fill waves 6 and 7 DO NOT write `GradingTab.tsx`. The collision is elsewhere and worse.

My brief stated "the remaining waves touch `GradingTab.tsx` ... A navigation
change that edits that file collides with wave 6 and 7." Measured against the
plan:

- **W6 write set** (`docs/a39-fill-waves.md:1250-1255`): `grading-incremental.ts`,
  `grading-incremental.test.ts`, `useIncrementalGradingRun.ts`,
  `useIncrementalGradingRun.lifecycle.test.ts`. No `GradingTab.tsx`.
- **W7 write set** (`docs/a39-fill-waves.md:1298-1302`): `incrementalRunPlan.ts`
  plus three assertions in `incrementalRunPlan.test.ts`. No `GradingTab.tsx`.
- W5 is the wave that wrote it, and it has LANDED - `32af6aa`, "feat(a39): fill
  wave 5 - one machine, one mount, one door".

So there is **no write-set collision**. There are three real ones, and section
4 states the sequencing rule they produce. The brief's instinct was right; its
mechanism was not, and the difference matters because the cheap branch was
being priced as the expensive one.

### 0.3 Measurement discipline

Two instruments, both named, for every number.

- Sizes from BOTH: `wc -l src/app/components/GradingTab.tsx` -> **617**;
  `@(Get-Content src/app/components/GradingTab.tsx).Count` -> **617**. They
  agree. Same pair run over the eleven other nav files; no disagreement.
- Membership decisions (which component is rendered WHERE) from
  `src/tools/symbol-count/count.ts` - a script in my scratchpad imported
  `countSymbolOccurrences` and ran it over all **2772** `.ts`/`.tsx` files under
  `src/`, reporting per file `codeOccurrences` split into
  declaration/call/reference, plus the comment and string counts the AST cannot
  see. Cross-checked against a second, independent instrument: `grep -n` for
  the JSX tag, read at the reported line.
- **Two `instrumentsReconcile === false` results, reported not averaged**, per
  that tool's own rule: `LiveFeedPanel` in
  `src/app/components/autoGradeTransition.wiring.test.ts`, and
  `SnapshotGradingPanel` in
  `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`. Both
  have `codeOccurrences = 0`, so neither affects any membership call here.
  Carried as RES-GRAD-6.
- The instrument earned its keep once concretely: `AccommodationsPanel.tsx`
  reports `code=0 comment=1` for `CartridgeDropPanel`. A `grep -c` would have
  counted it as a render site and put a fourth surface in the survey.

---

## 1. The survey, and the LINE I drew

**The line has two clauses and BOTH are required.** The owner will judge the
line more than the mechanics, so it is stated before the table.

- **(G) GRADING.** The surface assigns or drafts a score against a submission,
  or gates what gets posted to a gradebook. This clause is not invented here -
  it is this repo's own precedent, `docs/grading-path-survey.md:36-37` ("the
  ones that are actually a **grading** path (score a submission, or gate
  whether/what gets posted to a gradebook)"), and that survey applied it to
  rule captioning and narration out as "wrong feature class" (its row 9).
- **(D) DESTINATION.** The surface is reached by selecting a navigation id - a
  rail chip or an inner-strip item - not by scrolling inside another
  destination.

**Why (D) exists, and why the owner decision makes it load-bearing.** Under
inner navigation every surface pulled in becomes a NAV ITEM. A surface that
satisfies (G) but not (D) is a SECTION of a destination; promoting it to a nav
item is not a consolidation, it is a decomposition of its host, and it makes
the nav longer while moving nothing. **A surface that merely mentions grades
fails (G)** - the clearest in-tree example is the LMS Assignments and Quizzes
views, which edit an assignment's `points_possible`
(`src/app/components/content-tab/constants.ts:18-19`, `DATED_TYPES` and
`POINTS_EDITABLE`) and never score a submission or post a grade. They are OUT,
and they are the shape the line is drawn against.

| # | Candidate | Where it lives now (measured) | How a user reaches it | (G) | (D) | Call |
|---|---|---|---|---|---|---|
| 1 | `GradingTab` (`src/app/components/GradingTab.tsx`, 617) | mounted as a PROP at `page.tsx:543`, rendered by `ContentTab.tsx:772-773` when `view === "grading"` | Tools > LMS > Grading (`manual-rail.ts:56`) | yes - it IS the grading run | yes, `lms-grading` | **IN. The anchor.** |
| 2 | `RepoGradesTab` (`repo-grades/index.tsx:104`) | `page.tsx:580`, at `manualView === "repo-grades"` | Tools > Repo Grades, a rail chip (`manual-rail.ts:117`) | yes - `manual-rail.ts:88` "post the results to Canvas"; `repo-grades/repoGradePostScore.ts` | yes, a chip | **IN. This is the merge half.** |
| 3 | `GradingRecordingPanel` (`grading-recording/`, 964 per `docs/loop/traps-spec.md:12-15`) | `RecordingTab.tsx:857`, at `recView === "grading"` | Tools > Recording > "Grading (from a recording)" (`RecordingTab.tsx:592`) | yes | yes, an inner-strip item | **IN, wave 2** |
| 4 | `SnapshotGradingPanel` (`snapshot-grading/`) | `RecordingTab.tsx:867`, at `recView === "snapgrade"` | Tools > Recording > "Grading (from screenshots)" (`:592`) | yes | yes | **IN, wave 2** |
| 5 | `DraftedGradesTab` (`DraftedGradesTab.tsx`) | `home/WorkflowsPanel.tsx:77`, at `draftsView === "grades"` | Tools > Drafts > Grades (`url-state.ts:80`) | yes - drafted grades, reviewed then posted | yes | **IN, wave 3** |
| 6 | `LiveFeedPanel` | exactly ONE code reference outside its own declaration, `GradingTab.tsx` (`decl=1 ref=1`); rendered `GradingTab.tsx:328` | only by being inside GradingTab | yes | **NO** - no nav id | **OUT as a destination. Travels with row 1.** |
| 7 | `GithubGradingPanel` | one code reference outside its declaration, `GradingTab.tsx`; rendered `GradingTab.tsx:326` | only inside GradingTab | yes | **NO** | **OUT as a destination. Travels with row 1.** |
| 8 | `CartridgeDropPanel` | **TWO** render sites: `GradingTab.tsx:614`, and `FilesTab.tsx:852` at `filesView === "submissions"` (`page.tsx:643`, Library tab) | inside GradingTab, AND Library > Files > Submissions | partial - rubric/archive intake for a run (`docs/BACKLOG.md:128`) | mixed | **OUT, and FLAGGED - see RES-GRAD-1** |
| 9 | `GradingResults` | a renderer used by rows 1 and 6 | never directly | yes | **NO** | OUT |
| 10 | LMS Assignments / Quizzes views | `ContentTab.tsx`, `contentView` members | Tools > LMS > Assignments / Quizzes | **NO** - edits `points_possible`, scores nothing | yes | OUT. Mentions grades. |
| 11 | captioning / narration (`actions/media.ts`) | not a nav destination | - | **NO** | - | OUT, by this repo's own prior ruling (`docs/grading-path-survey.md` row 9) |

**Row 8 is the one I will not move, and it is not a judgement call.**
`CartridgeDropPanel` is double-mounted. Moving row 1 without settling row 8
either leaves the Library mount orphaned of its sibling or creates a third
mount. That decision belongs to the architect, carried as RES-GRAD-1.

### 1.1 The concurrent tool has no destination to move, and must not get one

The owner's phrase opens with "the new concurrent tool". Under **DECISION 17**
(`docs/owner-decisions-2026-09-27.md:106-113`) the incremental run is a **FILL
of the existing surface**: "the incremental route produces the SAME
`GradingRun` the whole-run path does ... One table, one state machine. Not a
second, narrower live view." `INCREMENTAL_ROUTE_ENABLED` is `false`
(`src/app/components/grading/incrementalRunPlan.ts:104`).

So the concurrent tool IS row 1. It reaches Tools > Grading by row 1 moving,
not as a sixth nav item. Giving it its own item would re-create exactly the
"both tables can render stacked, each claiming to be the editable one" duality
that decision exists to prevent (`:115-118`). That is AC11.

---

## 2. Where the sub-tab lives and how it is selected

A new `ManualViewType` member, so the sub-tab is a Tools rail chip - the same
level `repo-grades` already occupies. Stated in terms of the real navigation
types, per my brief:

| Type / object | `file:line` | Does it need a hand edit? |
|---|---|---|
| `ManualViewType` union | `manual-rail.ts:14-21` | yes |
| `MANUAL_VIEW_ORDER` | `manual-rail.ts:110-118` | yes - and it sets the chip's position |
| `MANUAL_VIEW_LABELS` | `manual-rail.ts:120-128` | yes - the label is the literal `"Grading"` |
| `destinations` (the inner-nav group) | `manual-rail.ts:40-91` | yes, a new group, in the shape of the `"LMS"` group at `:48-60` |
| `getInnerDestinations` | `manual-rail.ts:150-158` | yes - today it returns `null` for every view but two |
| `getActiveDestinationId` | `manual-rail.ts:160-181` | yes - a hand-written ladder |
| `resolveStateFromDestinationId` (**the resolver `page.tsx:506` calls**) | `manual-rail.ts:183-219` | yes - TWO ladders, `manualView` and the inner view |
| `page.tsx` render guard | mirror of `page.tsx:578-581` | yes |
| the inner selection's state, key and param | `home/useAppNavigation.ts` | yes |
| `isManualViewType` | `manual-rail.ts:136-140` | **no** - derives from `MANUAL_VIEW_ORDER` |
| `TOOLS_RAIL_ITEMS` | `tab-rails.ts:132-140` | **no** - derives from `MANUAL_VIEW_ORDER` |
| `normalizeManualView` | `url-state.ts:186-188` | **no** - delegates to `isManualViewType` |

Note for whoever consumes this: `docs/loop/traps-spec.md:60-64` says a sub-tab
here needs five edits including "a hand-written `||` restore ladder". That
entry describes the **`recView`** mechanism inside `RecordingTab.tsx`, which is
a different and weaker construction than the Tools rail. Three of the Tools
rail's registration points DERIVE, as the table shows. The three hand-written
ladders in `manual-rail.ts` are where that trap still applies, and they are
exactly where this repo's own removal test found leftovers
(`manual-rail.test.ts:325-331`).

### 2.1 The inner navigation: name, persistence, first load

Per the owner decision, and following the naming convention the tree already
uses rather than inventing one (`ta-manual-view`, `ta-build-view`,
`ta-content-view`, `ta-workflows-view`, `ta-drafts-view`, `ta-tasks-view` at
`useAppNavigation.ts:46-61`; `ta-rec-view` at `RecordingTab.tsx:83`):

- **Name of the inner selection:** `gradingView`, a union `GradingView` with an
  ordered list beside it, in the shape of `LMS_VIEWS` (`manual-rail.ts:36-38`)
  so every derived guard picks a new member up automatically.
- **Where it persists:** `localStorage` under **`ta-grading-view`**, and the
  URL param **`gradingView`**, matching `manualView` / `contentView` /
  `workflowsView` (`url-state.ts:281-284`).
- **First load with nothing stored:** the GRADING-RUN surface - the one
  `lms-grading` leads to today. AC6 pins it. A nav that forgets where you were,
  or that lands a returning user somewhere new, is a worse outcome than the
  current arrangement, so both halves are criteria rather than notes.

**There are two competing precedents for HOW the inner selection is held, and
the criteria require the stronger one.** `contentView` is held in
`useAppNavigation.ts` with a URL param and a restore guard that DELEGATES to
`normalizeContentView`; `useAppNavigation.test.ts:18-27` records the bug fixed
there - the restore guard "was a hand-written list" that had drifted from the
validator. `recView` is the weaker shape: component state, a raw
`localStorage.setItem` at `RecordingTab.tsx:83`, no URL param. AC5's mutation
is written so the weaker shape fails it. Choosing the construction is the
architect's; what a criterion can and does require is that a stored selection
comes back and that no member of the ordered list is silently unaccepted.

---

## 3. The cut. The owner's phrase covers more than should land in one commit.

All five IN rows belong in the nav eventually. Landing all five at once is not
advisable, and the reason is structural rather than a size worry:

- Rows 1 and 2 are **already in the `manual` family** and already Tools
  destinations. Absorbing them changes registration and parenting only.
- Rows 3 and 4 are inner items of Recording's twelve-item strip and are gated
  on its capture lifecycle (`active={active && recView === "grading"}`,
  `RecordingTab.tsx:857`). `RecordingTab.tsx` is 917 lines
  (`wc -l` = 917; `@(Get-Content).Count` = 917) and is one of only two files
  named individually by the recording split gate
  (`src/file-size-ceiling.structure.test.ts:51-54`). Moving them is
  decomposition work.
- Row 5 sits in the **`workflows`** family, so moving it crosses the
  `toolsSection` discriminant of `ToolsRailItem` (`tab-rails.ts:126-128`) - a
  type change of a different kind from rows 1-4.

**Proposed order: wave 1 = rows 1 and 2; wave 2 = rows 3 and 4; wave 3 = row 5.**
Each is independently pushable and each leaves a coherent nav. AC4 is an
EXACT-SET assertion per wave, so an over-inclusive build fails rather than
quietly producing a cluttered nav.

---

## 4. The sequencing constraint against the live fill. THE MOST IMPORTANT SECTION.

There is no write-set collision (0.2). There are three real constraints.

**(a) The 620 ceiling is a W7 GATE CONDITION and NO TEST ENFORCES IT.**
`GradingTab.tsx` is 617 on both counters. The `-le 620` bound is the design's,
at `docs/a39-fill-waves.md:69` and `:1000`, and W7's Group A requires "every
9.1 bound held on BOTH counters" (`:1290-1294`).
`grep -rn "620" src --include=*.test.ts` returns exactly one hit and it is
unrelated - a viewport clamp at `src/app/components/fab-menu-logic.test.ts:33`.
The only mechanical ceiling in the tree is `const LIMIT = 1000` at
`src/file-size-ceiling.structure.test.ts:41`. **So a nav change that adds four
or more net lines to `GradingTab.tsx` passes every gate in the suite and
silently breaks W7's flip precondition, in a different chunk, with nothing
naming the cause. Headroom: 3 lines.**

**(b) Source-text tests read `GradingTab.tsx` BY PATH and pin its text.**
`src/app/components/autoGradeTransition.wiring.test.ts:16` sets
`GRADING_TAB_PATH = join(process.cwd(), "src/app/components/GradingTab.tsx")`.
`:395` pins "GradingTab.tsx has exactly one `<GradingResults` mount, not inside
a `.map(`". `:412-417` pins an EXACT SET:
`["src/app/components/GradingTab.tsx", "src/app/components/LiveFeedPanel.tsx"]`
as the only `src/app/**/*.tsx` files containing `editsSurface="canvas"`.
Extracting any part of GradingTab that carries that attribute into a new file
turns it red. This is the collision my brief was reaching for, and it lands on
TESTS, not on wave write sets.

**(c) DECISION 17 forbids a second grading-run destination** (1.1 above).

### THE RULE

**This work is CUT so that it does not write `src/app/components/GradingTab.tsx`
at all.** It is satisfiable, and here is why rather than an assertion: GradingTab
is already mounted as a PROP (`page.tsx:542-552`, passed into `ContentTab` as
`grading={<GradingTab ... />}`), so RE-PARENTING it is an edit to `page.tsx` and
to `manual-rail.ts`, with GradingTab's own body untouched. AC9 makes that a gate.

**If the build discovers it cannot avoid writing `GradingTab.tsx`, the work
WAITS for W7's flip.** That fork is decided by measurement - the path's presence
in `git status --short` and the two counters - not by judgement.

---

## 5. Acceptance criteria

**I ran none of the instruments below.** My write set is one document. Every
instrument named as "new" does not exist yet and I did not create it; every
instrument named as "existing" I read but did not execute. The one command I did
run against my own output is `npm run docs:gate` (section 8). Each criterion
names its object, its instrument, and the DIRECTION of failure, plus the
mutation that must turn it red.

Multi-path runs are spelled `npm run test:paths <p1> <p2> ...` throughout - a
raw multi-path `vitest`/`npm test` silently drops arguments it does not match.

**AC1 - the Tools rail carries a chip labelled exactly `Grading`.**
Object: the labels of `TOOLS_RAIL_ITEMS` (`tab-rails.ts:132`).
Instrument (new, in `src/app/components/tabs/tab-rails.test.ts`):
`TOOLS_RAIL_ITEMS.filter(i => i.label === "Grading")` has length 1, and that
item's `section` is `"manual"`.
Mutation: add the member to `ManualViewType` and `MANUAL_VIEW_LABELS` but not to
`MANUAL_VIEW_ORDER` - `TOOLS_RAIL_ITEMS` derives from the ORDER list
(`tab-rails.ts:133`), so the chip vanishes and the case goes red.
Direction of failure: RED when the label is absent, AND RED when it appears more
than once. The second half is not decoration: `MANUAL_VIEW_LABELS` already holds
`"Repo Grades"` (`manual-rail.ts:127`) and the Recording strip holds two labels
beginning `"Grading ("` (`RecordingTab.tsx:592`), so an unanchored `contains`
check would pass while the chip was missing.
Traces to: "under a new sub tab called 'Grading'".

**AC2 - clicking that chip reaches the view, and the chip highlights for it.**
Object: the pair `resolveStateFromDestinationId` (`manual-rail.ts:183`) and
`getActiveDestinationId` (`:160`) - the resolver `page.tsx:506` calls.
Instrument (new, in `manual-rail.test.ts`, in the shape of the derived loop at
`:255-262`): for every member of the new ordered list, the id round-trips
through both functions back to itself, with `manualView === "grading"`.
Mutation: omit the new branch from `resolveStateFromDestinationId`'s `manualView`
ladder - it falls through to `currentManualView` (`:197`) and the round-trip
goes red.
Direction of failure: RED when a chip click cannot reach the view, or when the
highlighted chip is not the one that leads there.

**AC3 - the sub-tab renders, not merely registers.**
Object: the set of `manualView === "<x>"` render guards in `page.tsx`.
Instrument (new, source-text, derived from `MANUAL_VIEW_ORDER` so future members
are covered without a new case): every member of `MANUAL_VIEW_ORDER` has a
matching guard in `page.tsx`.
Mutation: register the view without adding the `page.tsx` block.
Direction of failure: RED when a registered Tools view has no render guard. The
failure it prevents is named by this repo already -
`manual-rail.test.ts:325-328`: "a leftover `MANUAL_VIEW_ORDER` entry ... leaves a
dead chip in the rail that resolves to a view page.tsx no longer renders (a blank
pane)".
**This is a SOURCE-TEXT claim, not a render claim.** It proves the guard exists;
it proves nothing about what appears. OW1 carries the visible half.

**AC4 - the inner nav's items are EXACTLY the wave's IN set.**
Object: the ids returned by `getInnerDestinations("grading")` (`manual-rail.ts:150`).
Instrument (new, in `manual-rail.test.ts`): `toEqual` against the wave's declared
id list - exact equality, ordered.
Mutation: add one extra item, or drop one - either goes red.
Direction of failure: RED on a missing item AND RED on an extra one, deliberately
in both directions. A superset check would let the nav grow silently, which is
precisely the over-inclusion the owner decision makes expensive.

**AC5 - the inner selection survives a reload.**
Object: the value read back for `gradingView` on mount.
Instrument (new, two cases, in the shape of `useAppNavigation.test.ts:38-63` and
`:65-88`): (i) the restore guard delegates to a shared `normalizeGradingView` and
reads `ta-grading-view` exactly once; (ii) `normalizeGradingView` accepts every
member of the ordered list, DERIVED from that list rather than restated.
Mutation: replace the delegation with a hand-written `||` ladder that omits the
last member - case (ii) goes red on that member. That is the exact defect
`useAppNavigation.test.ts:18-27` records for `contentView`, and the shape
`docs/loop/traps-spec.md:60-64` records for `recView`.
Direction of failure: RED when a stored selection does not come back, or when any
member of the ordered list is not accepted by the normalizer.

**AC6 - first load with nothing stored lands on the grading-run surface.**
Object: `normalizeGradingView(null)`.
Instrument (new, one assertion in `url-state.test.ts`'s existing default-value
shape): it equals the run surface's id.
Mutation: change the fallback to any other member - red.
Direction of failure: RED when a first visit, or a cleared store, lands anywhere
other than the surface `lms-grading` reaches today. Stated as a criterion because
`docs/BACKLOG.md:128`'s own owner-verification instrument names that surface by
path, and an owner following it must still arrive.

**AC7 - a stored or bookmarked pointer at the OLD location arrives at the new one.**
Object: three inputs - the URL param `contentView=grading` (`url-state.ts:284`),
the persisted `ta-content-view = "grading"` (`VIEW_KEY`,
`src/app/components/content-tab/constants.ts:6`), and the rail destination id
`lms-grading` (`manual-rail.ts:56`).
Instrument (new, in `url-state.test.ts` and `manual-rail.test.ts`): each of the
three resolves to the Tools > Grading destination with the run surface selected,
and the canonical value is what is written back.
Mutation - and this one is the whole point: remove `"grading"` from `ContentView`
(`constants.ts:3`) with no alias. The exhaustiveness check
`LMS_VIEW_PRESENCE: Record<Exclude<ContentView, "version-control">, true>`
(`manual-rail.ts:25-34`) then FORCES `grading: true` out, which drops it from
`LMS_VIEWS` (`:36-38`), which empties it from
`CONTENT_VIEW_VALUES = new Set<ContentView>(LMS_VIEWS)` (`url-state.ts:205`),
so `normalizeContentView("grading")` returns `"modules"` (`:211-213`). **The user
lands on Modules with no error.** That is the failure this criterion exists to
catch, and this repo persists UI state under `ta-` keys, so every returning user
who last used Grading has that stored value.
Direction of failure: RED when any of the three old pointers resolves anywhere
other than the new Grading destination; explicitly RED on landing on Modules.
Satisfiability, checked rather than assumed: the alias construction already
exists here - `RETIRED_TAB_DESTINATIONS` (`tab-sections.ts:163-185`), whose own
header at `:150-160` names this exact failure ("every existing bookmark, shared
link and restored localStorage session carrying one lands on the WRONG TAB WITH
NO ERROR") and states that an alias "is a REDIRECT, not a synonym: the canonical
value is written back". **The construction is the architect's; the requirement is
this criterion's.**

**AC8 - the old location is gone as a destination, completely.**
Object: the registration points the repo's own removal precedent enumerates.
Instrument (new, a removal block in `manual-rail.test.ts` modelled on the
`course-intel` block at `:337-366` and the `live-class` block at `:369-390`):
`getDestinationById("lms-grading")` is undefined; `"grading"` is absent from the
LMS group's ids; `validateLmsViewsCompleteness()` (`manual-rail.ts:221`) returns
no errors; `getActiveDestinationId` never returns `lms-grading` for any member;
`isContentView("grading")` is false.
Mutation: leave the `lms-grading` entry in `destinations` (`:56`) while removing
the `ContentView` member - `validateLmsViewsCompleteness()` gains a "does not
correspond to a valid LMS view" error (`:236`) and the block goes red.
Direction of failure: RED on any leftover. Each leftover fails differently and
silently; `manual-rail.test.ts:325-331` names all three shapes.

**AC7 and AC8 are consistent only under one reading, and it is stated so neither
can be satisfied by weakening the other.** AC8 requires
`isContentView("grading")` to be false. AC7 requires the old pointer to still
resolve. Both hold if and only if the alias is a RESOLUTION RULE consulted before
`normalizeContentView`, and NOT a surviving `ContentView` member. If a build
keeps the member to satisfy AC7, AC8 goes red - correctly. This pairing is
flagged because `docs/loop/traps-spec.md:79-96` records a design that banned a
shape in one section and reintroduced it four sections later, with every sentence
individually defensible.

**AC9 - this chunk does not write `GradingTab.tsx`.**
Object: the chunk's write set, and the file's size.
Instrument (existing, the wave gate): `git status --short` against the
assignment, plus BOTH `wc -l src/app/components/GradingTab.tsx` and
`@(Get-Content src/app/components/GradingTab.tsx).Count`.
Mutation: none applicable - this is a gate, not a test, and I say so rather than
inventing a mutant for it.
Direction of failure: RED when the path appears in `git status --short`, or when
either counter moves off 617. Reason in 4(a): 3 lines of headroom against a
design ceiling no test enforces, and W7's Group A depends on it.

**AC10 - the `editsSurface="canvas"` exact set is unchanged.**
Object: the set asserted at `autoGradeTransition.wiring.test.ts:412-417`.
Instrument (existing, ADOPTED not written):
`npm run test:paths src/app/components/autoGradeTransition.wiring.test.ts`.
Mutation: extract any part of GradingTab carrying `editsSurface="canvas"` into a
new file - the exact-set assertion goes red.
Direction of failure: RED when the set gains or loses a member.

**AC11 - the incremental run gets no nav item of its own.**
Object: the inner id set from AC4, and the route flag.
Instrument (existing plus AC4): AC4's exact-set equality already forbids a sixth
item, and `src/app/components/grading/incrementalRunPlan.test.ts:62`
(`expect(INCREMENTAL_ROUTE_ENABLED).toBe(false)`) must stay green - this chunk
does not flip the flag.
Mutation: add an inner item for the concurrent run - AC4 red.
Direction of failure: RED on a second grading-run destination. Reason:
`docs/owner-decisions-2026-09-27.md:110-121`, one table, one state machine.

**AC12 - the repo's UI and byte standards.**
Object: this document and any file the build writes.
Instrument (existing): `npm run docs:gate`, plus `npm run lint` and
`npx tsc --noEmit` on the build. No emojis anywhere; the nav reuses the app's
existing rail and inner-strip visual language rather than introducing a new
pattern.
Direction of failure: RED on any emoji or byte-structure violation.
I ran `docs:gate` on this file (section 8); I ran none of the others.

---

## 6. The leverage line - trigger FIRED, and NO CLAIM. Declined, not omitted.

`docs/loop/seats.md:73-75` owes a claim when the chunk builds or changes a
capability a user reaches, and states that "on a bug fix, a refactor, a doc
correction or an owner verification there is no claim to make; record that as the
fired trigger and move on."

**This is a refactor of reachability.** It moves and regroups destinations that
all exist today (section 1, rows 1-5 are all live surfaces) and adds no
mechanism. The only advantage it could honestly name is CLICK COST, which
`docs/loop/leverage.md:66` lists among the STRUCK classes: "Free to any feature
with a UI at all ... it is not a categorical advantage over a chat." Claiming it
here would be the failing shape that card's negative example exists to catch.

So: **trigger recorded, claim declined.** I am not defaulting the three-way call
at `leverage.md:111-123` - that clause governs a FEATURE with a thin claim, and
this is not a feature. If the owner wants a click-cost figure for the
consolidation it is measurable and I did not measure it.

**The CONCURRENCY claim is real but belongs elsewhere.** `leverage.md:42` names
CONCURRENCY as "NOT YET AN INSTANCE - a measured GAP", owned by row A46. That
claim, and its removal test, belong to A46's own criteria. Importing it here
would credit a navigation change with an advantage it does not build.

---

## 7. Owner-walk items and the residual register

### Owner walk - nothing renders under this vitest

`vitest` here is node-env and collects only `src/**/*.test.ts`, so no component
is rendered by any test in this repo. Every claim above about what a user SEES is
a reading claim. **No proxy is proposed for any item below.**

| # | Item | Owner | Instrument | Step |
|---|---|---|---|---|
| OW1 | A chip labelled `Grading` is visibly present in the Tools rail, and the inner navigation renders AS a nav | repo owner | open the app, Tools tab, read the rail and the inner strip | before the row closes |
| OW2 | The inner selection visibly persists across a real hard reload | repo owner | pick a non-default inner item, hard-reload, observe | same sitting as OW1 |
| OW3 | An OLD bookmark lands on the new surface | repo owner | open `?tab=manual&manualView=content&contentView=grading` in a real browser | same sitting |
| OW4 | The consolidated nav is not cluttered at the landed item count | repo owner | judgement; no instrument exists here | after each wave |

OW2 is called out separately from AC5 because AC5 is a source-text and
pure-function claim. A `localStorage`-seeded initializer that never shows on
reload is a known class in this repo and React only warns on the hydration
mismatch - no test here can see it.

### Residual register

**Each row has an owner, an instrument and a step. None of them is a row in
`docs/BACKLOG.md` yet, because that file is not in my write set. Until the
backlog seat files them they DO NOT EXIST, and by
`docs/loop/iteration-caps.md:167` a residual missing any of its three fields is
a deletion - so these are deletions until filed. I am calling that plainly
rather than reporting success.**

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-GRAD-1 | `CartridgeDropPanel` is double-mounted (`GradingTab.tsx:614`, `FilesTab.tsx:852`); moving row 1 must not orphan or triplicate it | architect | the `symbol-count` census, re-run for `CartridgeDropPanel` | before the wave that re-parents row 1 |
| RES-GRAD-2 | Rows 3 and 4 (Recording's two grading items) not landed in wave 1 | repo owner (scope) | AC4's exact-set equality for wave 2 | wave 2 |
| RES-GRAD-3 | Row 5 crosses the `toolsSection` discriminant (`tab-rails.ts:126-128`) | architect | the `ToolsRailItem` type | wave 3 |
| RES-GRAD-4 | Stale citation: `docs/a39-fill-waves.md` cites `INCREMENTAL_ROUTE_ENABLED` at `incrementalRunPlan.ts:99`; measured `:104` | whoever next opens that plan | `grep -n "export const INCREMENTAL_ROUTE_ENABLED" src/app/components/grading/incrementalRunPlan.ts` | W6's brief |
| RES-GRAD-5 | The `-le 620` ceiling on `GradingTab.tsx` has NO mechanical enforcer; only `LIMIT = 1000` exists | test-author | a ratchet entry in `src/file-size-ceiling.structure.test.ts` | whichever chunk next writes `GradingTab.tsx` |
| RES-GRAD-6 | Two `instrumentsReconcile === false` results (0.3); both `codeOccurrences = 0`, so no membership call here depends on them | test-author | the `symbol-count` census script | whenever either symbol's count decides anything |

---

## 8. What I could not determine, and the gates I ran

**Could not determine:**

- Whether the alias in AC7 should ALSO show the user a visible "this moved"
  affordance. That is a UX call; the criterion requires only that they arrive.
- The click-cost delta of the consolidation. Measurable, not measured, and
  declined in section 6 rather than estimated.
- Whether rows 3 and 4 can be re-parented without decomposing
  `RecordingTab.tsx` (917 lines, both counters). Section 3 sizes it as
  decomposition work; proving it either way is the architect's.
- OW4. There is no instrument for "cluttered" in this repo and I did not invent
  a proxy for it.

**Gates run on this document:** `npm run docs:gate`. Result in the report.
**Gates NOT run:** every instrument in section 5 - my write set is one document
and I could not execute any of them. The three new-instrument families (AC1-AC8)
do not exist yet and I did not create them.
