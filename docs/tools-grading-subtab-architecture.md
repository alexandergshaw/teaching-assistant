# Architecture: the Tools > Grading sub-tab

Round 1 of this activity. This is a NEW activity: the acceptance-criteria
activity (`docs/tools-grading-subtab-ac.md`, checked in
`docs/tools-grading-subtab-ac-check.md`, verdict NOT BUILDABLE with 6 blockers)
is finished and is not reopened. This pass is the DISPOSAL of that check under
its own recommended routing: RELOCATE - derive the edit surface and the
asserting-test set with my own instruments and report what the AC's tables
missed.

`ls docs/tools-grading-subtab-architecture.md` before this file existed returned
"No such file or directory"; `git log --oneline -3 -- docs/tools-grading-subtab-architecture.md`
returned nothing. No prior version of THIS artifact exists, so
`docs/loop/iteration-caps.md:152-157` entry gate 3 does not fire on its own
terms. Section 13 ships the disposition tables anyway, because the check
relocated obligations onto this pass and a reader needs to see each one landed.

**Write set: this file only.** No file under `src/` or `supabase/` was opened for
writing. Nothing was committed or pushed. `git status --short` at the start of
this pass printed nothing (clean tree, HEAD `98e76b2`).

**Settled and not reopened.** DECISION 18 (`docs/owner-decisions-2026-09-27.md:144`):
Tools > Grading is a container with INNER NAVIGATION, from the owner's words
"sub-tab with inner navigation". DECISION 17 (`:106-113` of the same file): the
incremental grading run is a FILL of the existing surface. Neither is re-argued
and no fork the owner has answered is presented below.

---

## 0. Instruments, and the command that produced every quantity

| Quantity | Instrument, with the command |
|---|---|
| Line count, counter A | `wc -l <path>` (Bash tool) |
| Line count, counter B | `@(Get-Content <path>).Count` (PowerShell) |
| Symbol occurrences, per file, split declaration/call/reference and comment/string | `src/tools/symbol-count/count.ts`'s `countSymbolOccurrences`, transpiled with the installed `typescript` (5.9.3, `node -e "console.log(require('typescript').version)"`) and driven over every `.ts`/`.tsx` under `src/` - **2772 files scanned**, printed by the driver itself |
| String-literal value census (exact equality, comment-blind) | a `ts.createSourceFile` AST walk collecting every `StringLiteral` / `NoSubstitutionTemplateLiteral` whose `.text` equals the value, with `file:line` |
| Source-text readers of a file | a `ts.createScanner` scan (trivia NOT skipped, `reScanTemplateToken`-aware) over every `*.test.ts` under `src/` - **1166 test files scanned** - collecting string-literal tokens and comment tokens SEPARATELY, then matching path needles against the string tokens only |
| Write-set disjointness | `cat <setA> <setB> \| sort \| uniq -d`, output pasted in section 9 |
| Docs gate | `npm run docs:gate` |

Three disciplines, stated because this pass would otherwise repeat measured
failures of this repo:

- **`grep -c` was not used to count any symbol.** It counts lines containing the
  word (`docs/loop/traps-spec.md:162-178`, RULING 135, four wrong numbers in one
  session).
- **Every absence claim is paired with a positive control in the same run.** The
  four new names this design introduces were measured absent
  (`gradingView`, `ta-grading-view`, `grading-run`, `grading-repos`: 0 files
  each; `GradingView`, `GRADING_VIEWS`, `normalizeGradingView`, `isGradingView`,
  `getInnerNavAriaLabel`: 0 files each) **in the same invocation** that returned
  `contentView` at 3 files and `LMS_VIEWS` at 5 files. The instrument was
  demonstrably looking.
- **Both line counters were run on every file this design names.** They agree on
  all 21 files measured; the largest known disagreement in this tree is 42 lines
  on one file (`docs/loop/traps-spec.md:12-15`), so agreement is reported, not
  assumed.

**Reasoning-from-reading versus measurement.** Every claim below is tagged where
it matters. In particular: `vitest` here is node-env and collects only
`src/**/*.test.ts`, so **no component is rendered by any test in this repo**.
Nothing in this design can be verified against markup, an accessible name, focus
or keyboard behaviour. Where a claim is about what a user SEES or HEARS READ
ALOUD, it is labelled a reading claim and routed to the owner walk with no proxy
proposed.

---

## 1. The measurements, first, because two of them change the shape

### 1.1 Sizes. Both counters, every file this design names.

| Path | `wc -l` | `@(Get-Content).Count` | Agree |
|---|---|---|---|
| `src/app/components/manual/manual-rail.ts` | 241 | 241 | yes |
| `src/app/components/manual/ManualRail.tsx` | 65 | 65 | yes |
| `src/app/page.tsx` | 703 | 703 | yes |
| `src/app/url-state.ts` | 417 | 417 | yes |
| `src/app/components/home/useAppNavigation.ts` | 638 | 638 | yes |
| `src/app/components/content-tab/constants.ts` | 28 | 28 | yes |
| `src/app/components/ContentTab.tsx` | 895 | 895 | yes |
| `src/app/components/tabs/tab-rails.ts` | 192 | 192 | yes |
| `src/app/components/GradingTab.tsx` | **617** | **617** | yes |
| `src/app/components/repo-grades/index.tsx` | 930 | 930 | yes |
| `src/app/components/RecordingTab.tsx` | 917 | 917 | yes |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | **977** | **977** | yes |
| `src/app/components/manual/manual-rail.test.ts` | 438 | 438 | yes |
| `src/app/components/contentTab.wiring.test.ts` | 105 | 105 | yes |
| `src/app/url-state.test.ts` | 899 | 899 | yes |
| `src/app/components/tabs/tab-rails.test.ts` | 375 | 375 | yes |
| `src/app/components/tabs/topLevelTabs.wiring.test.ts` | 480 | 480 | yes |
| `src/app/components/home/useAppNavigation.test.ts` | 181 | 181 | yes |
| `src/app/components/recording/recording-split.structure.test.ts` | 602 | 602 | yes |
| `src/app/components/componentStorageKeys.structure.test.ts` | 260 | 260 | yes |
| `src/app/components/autoGradeTransition.wiring.test.ts` | 474 | 474 | yes |

**The only mechanical ceiling in the tree is `const LIMIT = 1000`
(`src/file-size-ceiling.structure.test.ts:41`).** Sizing this design against the
two facts the orchestrator's RULING C names:

- **The 620 bound on `GradingTab.tsx` is not this design's problem, because
  wave 1 does not write that file at all** (section 9). Its three lines of
  headroom are preserved by the cut, not by a bound.
- **`GradingRecordingPanel.tsx` at 977 has 23 lines against `LIMIT = 1000`, and
  it IS checked**: it lives at `src/app/components/grading-recording/`, not under
  `src/app/components/recording/`, so `isCoveredByRecordingSplitCheck`
  (`src/file-size-ceiling.structure.test.ts:56-62`) returns false for it. It is
  wave 2's file, not wave 1's, and section 9.2 sizes wave 2 against 23 lines
  rather than against a bound nothing enforces.
- **The largest file wave 1 writes is `src/app/page.tsx` at 703.** The design
  REMOVES a branch from `ContentTab.tsx` (895) and adds one to `page.tsx`, so
  the net movement is a handful of lines each way. No wave-1 file comes within
  250 lines of 1000.

### 1.2 The four confirmed starting points, re-opened and confirmed

RULING A hands these over as confirmed starting points rather than as the
complete set. All four were re-opened at the cited lines:

| Ruling A item | Line opened | What is there |
|---|---|---|
| a | `src/app/components/manual/ManualRail.tsx:48` | `aria-label={manualView === "course-planning" ? "Course build modes" : "LMS views"}`, inside the `role="tablist"` at `:47`. A third inner nav is announced "LMS views". |
| b | `manual-rail.ts:160-164` / `:183-188` | Both take exactly `(manualView, buildView, contentView)`; the second returns exactly those three. Callers: `ManualRail.tsx:38`, `page.tsx:506`. |
| c | `url-state.ts:290-311` / `:337-350` / `:367-417` | `UrlNavState`, `parseUrlState`, `buildUrlSearch`. `:389` emits `contentView` only under `state.manualView === "content"`. |
| d | `useAppNavigation.ts:38-45` | `export type ManualView = ...` restating all seven `ManualViewType` members. |

### 1.3 Corrections the check established, used as given

`docs/BACKLOG.md:133` is row A40 and carries the owner's user path (verified:
`awk 'NR==133' docs/BACKLOG.md | grep -ao "Tools > LMS > Grading[^|]\{0,140\}"`
returns `Tools > LMS > Grading, scroll to Submissions, pick a file with the
rubric box still empty, then type a rubric, ...`). Clause (G)'s precedent is
`docs/grading-path-survey.md:40-42` (verified at those lines: "the ones that are
actually a **grading** path (score a submission, or gate whether/what gets posted
to a gradebook)"). `ta-content-view` lives only at
`src/app/components/content-tab/constants.ts:6` (string-literal census: 1 file,
1 occurrence). A39 W6's write set is `docs/a39-fill-waves.md:1253-1256` and W7's
is `:1305-1310`, both opened.

### 1.4 One record correction that is already discharged

The check's R3 said DECISION 18 carries the wrong W6/W7 premise. **It no longer
does.** `docs/owner-decisions-2026-09-27.md` now records the correction in place
("What I wrote: fill waves 6 and 7 touch `GradingTab.tsx`... MEASURED
AFTERWARDS: neither wave touches that file"), names `de1e84e` for W6 and
`32af6aa` for W5, and restates the constraint on the test-pinning grounds. R3 is
**closed, not carried**. Stating it because a residual that has been discharged
and is still listed teaches the next session to redo it.

---

## 2. THE SHAPE, and it is FORCED rather than chosen

This is the decision every later wave is built against, so it is stated first
and its derivation is given rather than asserted.

> **The Grading inner navigation is `getInnerDestinations("grading")`, rendered
> by the EXISTING single tablist inside `ManualRail.tsx`. No new nav component,
> no second tablist, no second `TabRail`. `"grading"` becomes a member of
> `ManualViewType` in the position `"repo-grades"` vacates, and `"grading"`
> LEAVES `ContentView`.**

### 2.1 Four existing assertions force it. Each was opened.

| Constraint | Where | What it forbids |
|---|---|---|
| `ManualRail.tsx` may contain **exactly one** `role="tablist"` | `topLevelTabs.wiring.test.ts:284`, `expect(source.split('role="tablist"').length - 1).toBe(1)` over comment-stripped source | A Grading inner nav rendered as a SECOND tablist in that file. This is a GUARD: its stated subject is "a flattening that leaves a second nav row behind has not flattened anything". |
| the `activeTab === "manual"` branch of `page.tsx` may contain **exactly one** `<TabRail` | `topLevelTabs.wiring.test.ts:218` / `:224` | A Grading container that renders its inner nav as a `TabRail`. Also a GUARD, same subject. |
| `ManualRail.tsx` must not contain `MANUAL_VIEW_ORDER` | `topLevelTabs.wiring.test.ts:281` | Re-deriving a second chip row inside ManualRail. |
| every `MANUAL_VIEW_ORDER` member needs a `manualView === "<view>"` branch in that same slice | `topLevelTabs.wiring.test.ts:313` / `:318`, a loop over `MANUAL_VIEW_ORDER` | Registering the chip with no render site. **This test already exists and is already derived**; see 5.3. |

So the only construction that satisfies all four is the one the tree already
uses for the LMS group: a `DestinationGroup` in `manual-rail.ts`'s `destinations`
array, returned by `getInnerDestinations`, rendered by the one tablist. **The
shape is not a preference; three of the four constraints go red on the
alternatives.**

### 2.2 Why `"grading"` must LEAVE `ContentView`. Also forced.

`validateLmsViewsCompleteness()` (`manual-rail.ts:221-241`) checks BOTH
directions: an `LMS_VIEWS` member with no `lms-` destination produces
"is missing from the rail destinations" (`:230`), and an `lms-` destination with
no `LMS_VIEWS` member produces "does not correspond to a valid LMS view"
(`:236`). `manual-rail.test.ts:138` asserts that function returns zero errors.
And `LMS_VIEWS` is `Object.keys(LMS_VIEW_PRESENCE)` (`:36-38`), whose type is
`Record<Exclude<ContentView, "version-control">, true>` (`:25`).

Therefore the `lms-grading` destination and the `ContentView` member
`"grading"` are **co-extensive by construction**. You cannot remove the old
destination while keeping the member, and DECISION 18 requires removal: "The
surfaces MOVE into it; they are not mirrored from it." Keeping the member means
keeping a second destination labelled `"Grading"` in the LMS inner nav, which is
mirroring.

So AC8's requirement that `isContentView("grading")` be false is not a
preference either. It falls out of `validateLmsViewsCompleteness` plus
DECISION 18, and that is the argument - not "the AC asked for it".

### 2.3 What that forces downstream, with which gate forces it

| Edit | Forced by | Silent if omitted? |
|---|---|---|
| `constants.ts:3` removes `"grading"` from `ContentView` | the decision above | - |
| `manual-rail.ts:31` removes `grading: true` from `LMS_VIEW_PRESENCE` | **tsc**: excess property on `Record<Exclude<ContentView,"version-control">, true>` | no |
| `manual-rail.ts:212` removes `if (id === "lms-grading") return "grading";` | **tsc**: `"grading"` is not assignable to `ContentView` | no |
| `manual-rail.ts:56` removes the `lms-grading` destination | `validateLmsViewsCompleteness()` via `manual-rail.test.ts:138` | no |
| `ContentTab.tsx:772` removes the `view === "grading" ? (grading)` branch | **tsc** TS2367, comparison with a non-member | no |
| `ContentTab.tsx:67`/`:73` removes the now-unused `grading?: ReactNode` prop | **lint** (unused destructured binding), NOT tsc - an optional prop left declared and unpassed compiles | **partly** - the wave brief must require it by name |
| `page.tsx:542` stops passing `grading={...}` to `ContentTab` | follows the prop removal | - |
| `useAppNavigation.ts:38-45` swaps the `ManualView` union members | **tsc**: `normalizeManualView`'s `ManualViewType` return is assigned into `useState<ManualView>` at `:156`/`:173` | no |
| `page.tsx:578` removes the `manualView === "repo-grades"` branch | **tsc** TS2367 | no |

**Six of the seven production files are tsc-forced. One (`ContentTab.tsx`) is
tsc-forced on its comparison and lint-forced on its prop.** That is the argument
for one wave rather than three (section 9.1).

### 2.4 The one thing that is genuinely mine, not derived

**The chip's POSITION in the rail.** I place `"grading"` at
`MANUAL_VIEW_ORDER` index 6, the slot `"repo-grades"` vacates
(`manual-rail.ts:117`). Reason: it keeps `MANUAL_VIEW_ORDER.length` at 7, which
keeps both frozen counts of ten green (`tab-rails.test.ts:66`,
`topLevelTabs.wiring.test.ts:349`), and it puts "Grading" where the users of
"Repo Grades" last saw a chip. **This is a UX call I am defaulting so the wave
is dispatchable, not an owner ruling and not a derivation.** Moving it later is
one line in `MANUAL_VIEW_ORDER` plus one line in the exact-list assertion at
`tab-rails.test.ts:54-65`; that is RES-ARCH-1, owned by the wave-3 user-experience
seat.

---

## 3. THE DERIVED EDIT SURFACE

Derived, not inherited. Command and output for each derivation, then the surface,
then an explicit list of what the AC's table missed.

### 3.1 The derivation: every reader of every symbol the change touches

Instrument: `src/tools/symbol-count/count.ts`'s `countSymbolOccurrences`,
transpiled with the installed `typescript` and run over all 2772 `.ts`/`.tsx`
files under `src/`, reporting only files with `codeOccurrences > 0`.

```
FILES SCANNED: 2772

=== ManualViewType === files with codeOccurrences>0: 4
  src/app/components/manual/ManualRail.tsx  code=2 (decl=1 call=0 ref=1)
  src/app/components/manual/manual-rail.ts  code=9 (decl=1 call=0 ref=8) cmt=1
  src/app/components/tabs/tab-rails.ts  code=9 (decl=1 call=0 ref=8) cmt=1
  src/app/url-state.ts  code=3 (decl=1 call=0 ref=2) cmt=2

=== MANUAL_VIEW_ORDER === files with codeOccurrences>0: 5
  src/app/components/manual/manual-rail.test.ts  code=9 (decl=1 call=0 ref=8) cmt=3 str=5
  src/app/components/manual/manual-rail.ts  code=2 (decl=1 call=0 ref=1) cmt=1
  src/app/components/tabs/tab-rails.test.ts  code=6 (decl=1 call=0 ref=5) cmt=1 str=1
  src/app/components/tabs/tab-rails.ts  code=2 (decl=1 call=0 ref=1) cmt=1
  src/app/components/tabs/topLevelTabs.wiring.test.ts  code=2 (decl=1 call=0 ref=1) str=2

=== MANUAL_VIEW_LABELS === files with codeOccurrences>0: 4
  src/app/components/manual/manual-rail.test.ts  code=7 (decl=1 call=0 ref=6) str=3
  src/app/components/manual/manual-rail.ts  code=1 (decl=1 call=0 ref=0)
  src/app/components/tabs/tab-rails.test.ts  code=2 (decl=1 call=0 ref=1)
  src/app/components/tabs/tab-rails.ts  code=2 (decl=1 call=0 ref=1)

=== isManualViewType === files with codeOccurrences>0: 4
  src/app/components/home/useAppNavigation.ts  code=2 (decl=1 call=1 ref=0) cmt=4
  src/app/components/manual/manual-rail.test.ts  code=11 (decl=1 call=10 ref=0) cmt=1 str=4
  src/app/components/manual/manual-rail.ts  code=1 (decl=1 call=0 ref=0)
  src/app/url-state.ts  code=2 (decl=1 call=1 ref=0) cmt=3

=== getInnerDestinations === files with codeOccurrences>0: 3
  src/app/components/manual/ManualRail.tsx  code=2 (decl=1 call=1 ref=0)
  src/app/components/manual/manual-rail.test.ts  code=8 (decl=1 call=7 ref=0) str=1
  src/app/components/manual/manual-rail.ts  code=1 (decl=1 call=0 ref=0)

=== getActiveDestinationId === files with codeOccurrences>0: 3
  src/app/components/manual/ManualRail.tsx  code=2 (decl=1 call=1 ref=0)
  src/app/components/manual/manual-rail.test.ts  code=16 (decl=1 call=15 ref=0) cmt=2 str=5
  src/app/components/manual/manual-rail.ts  code=1 (decl=1 call=0 ref=0)

=== resolveStateFromDestinationId === files with codeOccurrences>0: 3
  src/app/components/manual/manual-rail.test.ts  code=17 (decl=1 call=16 ref=0) cmt=4 str=3
  src/app/components/manual/manual-rail.ts  code=1 (decl=1 call=0 ref=0)
  src/app/page.tsx  code=2 (decl=1 call=1 ref=0)

=== getDestinationById === files with codeOccurrences>0: 2
  src/app/components/manual/manual-rail.test.ts  code=16 (decl=1 call=15 ref=0) str=1
  src/app/components/manual/manual-rail.ts  code=1 (decl=1 call=0 ref=0)

=== LMS_VIEWS === files with codeOccurrences>0: 5
  src/app/components/contentTab.wiring.test.ts  code=4 (decl=1 call=0 ref=3) cmt=3 str=1
  src/app/components/home/useAppNavigation.test.ts  code=4 (decl=1 call=0 ref=3) cmt=4 str=3
  src/app/components/manual/manual-rail.test.ts  code=5 (decl=1 call=0 ref=4) cmt=2 str=3
  src/app/components/manual/manual-rail.ts  code=3 (decl=1 call=0 ref=2)
  src/app/url-state.ts  code=2 (decl=1 call=0 ref=1) cmt=1

=== validateLmsViewsCompleteness === files with codeOccurrences>0: 2
  src/app/components/manual/manual-rail.test.ts  code=2 (decl=1 call=1 ref=0) str=1
  src/app/components/manual/manual-rail.ts  code=1 (decl=1 call=0 ref=0)

=== ContentView === files with codeOccurrences>0: 6
  src/app/components/ContentTab.tsx  code=2 (decl=1 call=0 ref=1)
  src/app/components/content-tab/constants.ts  code=1 (decl=1 call=0 ref=0)
  src/app/components/home/useAppNavigation.ts  code=3 (decl=1 call=0 ref=2) cmt=1
  src/app/components/manual/ManualRail.tsx  code=2 (decl=1 call=0 ref=1)
  src/app/components/manual/manual-rail.ts  code=9 (decl=1 call=0 ref=8) cmt=1
  src/app/url-state.ts  code=5 (decl=1 call=0 ref=4) cmt=3

=== VIEW_KEY === files with codeOccurrences>0: 2
  src/app/components/content-tab/constants.ts  code=1 (decl=1 call=0 ref=0)
  src/app/components/home/useAppNavigation.ts  code=5 (decl=1 call=0 ref=4) cmt=3

=== isContentView === files with codeOccurrences>0: 3
  src/app/components/home/useAppNavigation.test.ts  code=3 (decl=1 call=2 ref=0)
  src/app/url-state.test.ts  code=3 (decl=1 call=2 ref=0) str=1
  src/app/url-state.ts  code=2 (decl=1 call=1 ref=0) cmt=1

=== normalizeContentView === files with codeOccurrences>0: 4
  src/app/components/home/useAppNavigation.test.ts  code=7 (decl=1 call=6 ref=0) cmt=4 str=4  RECONCILE=FALSE
  src/app/components/home/useAppNavigation.ts  code=3 (decl=1 call=2 ref=0) cmt=3
  src/app/url-state.test.ts  code=10 (decl=1 call=9 ref=0) str=1
  src/app/url-state.ts  code=3 (decl=1 call=2 ref=0)

=== UrlNavState === files with codeOccurrences>0: 3
  src/app/components/tabs/tab-rails.test.ts  code=3 (decl=1 call=0 ref=2)
  src/app/url-state.test.ts  code=9 (decl=1 call=0 ref=8)
  src/app/url-state.ts  code=3 (decl=1 call=0 ref=2)

=== parseUrlState === files with codeOccurrences>0: 5
  src/app/components/home/useAppNavigation.ts  code=2 (decl=1 call=1 ref=0)
  src/app/components/tabs/tab-rails.test.ts  code=8 (decl=1 call=7 ref=0)
  src/app/components/tabs/topLevelTabs.wiring.test.ts  code=7 (decl=1 call=6 ref=0)
  src/app/url-state.test.ts  code=52 (decl=1 call=51 ref=0) cmt=1 str=3
  src/app/url-state.ts  code=1 (decl=1 call=0 ref=0) cmt=2

=== buildUrlSearch === files with codeOccurrences>0: 4
  src/app/components/home/useAppNavigation.ts  code=4 (decl=1 call=3 ref=0) cmt=1
  src/app/components/tabs/tab-rails.test.ts  code=3 (decl=1 call=2 ref=0) cmt=1
  src/app/url-state.test.ts  code=64 (decl=1 call=63 ref=0) cmt=4 str=2
  src/app/url-state.ts  code=1 (decl=1 call=0 ref=0) cmt=1

=== normalizeManualView === files with codeOccurrences>0: 3
  src/app/components/home/useAppNavigation.ts  code=2 (decl=1 call=1 ref=0) cmt=1
  src/app/url-state.test.ts  code=7 (decl=1 call=6 ref=0) cmt=1 str=1
  src/app/url-state.ts  code=3 (decl=1 call=2 ref=0)

=== ManualView === files with codeOccurrences>0: 1
  src/app/components/home/useAppNavigation.ts  code=2 (decl=1 call=0 ref=1)

=== ManualRail === files with codeOccurrences>0: 2
  src/app/components/manual/ManualRail.tsx  code=1 (decl=1 call=0 ref=0)
  src/app/page.tsx  code=2 (decl=1 call=0 ref=1) str=1

=== TOOLS_RAIL_ITEMS === files with codeOccurrences>0: 4
  src/app/components/tabs/tab-rails.test.ts  code=13 (decl=1 call=0 ref=12)
  src/app/components/tabs/tab-rails.ts  code=2 (decl=1 call=0 ref=1)
  src/app/components/tabs/topLevelTabs.wiring.test.ts  code=2 (decl=1 call=0 ref=1) str=1
  src/app/page.tsx  code=2 (decl=1 call=0 ref=1)

=== ToolsRailItem === files with codeOccurrences>0: 1
  src/app/components/tabs/tab-rails.ts  code=5 (decl=1 call=0 ref=4)
```

One `instrumentsReconcile === false` result, reported not averaged per the
tool's own rule: `normalizeContentView` in
`src/app/components/home/useAppNavigation.test.ts` (`code=7 cmt=4 str=4`). It is
a `.tsx`-free `.ts` file, so the runaway-template class is not in play; the tool
documents the comment/string SPLIT as the unverifiable half, and its
`codeOccurrences = 7` is the number this design uses. That file is already in
wave 1's write set on other grounds, so no membership call turns on the
reconciliation. Carried as RES-ARCH-6.

### 3.2 Which values carry the change: the string-literal census

Instrument: exact-equality AST census over 2772 files, comment-blind.

```
=== string literal exactly "lms-grading" === files=2 occurrences=6
    src/app/components/manual/manual-rail.test.ts  lines 34,56,117,225
    src/app/components/manual/manual-rail.ts  lines 56,212

=== string literal exactly "repo-grades" === files=8 occurrences=29
    src/app/components/home/useAppNavigation.ts  lines 45
    src/app/components/manual/manual-rail.test.ts  lines 195,295,296,297,297,301,308,312,313,317
    src/app/components/manual/manual-rail.ts  lines 21,88,117,127,177,178,196,196
    src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts  lines 54
    src/app/components/tabs/tab-rails.test.ts  lines 183,184
    src/app/page.tsx  lines 578
    src/app/url-state.test.ts  lines 272,272,884,892,895
    src/lib/module-graph/runtime-import-graph.test.ts  lines 396

=== string literal exactly "manual:repo-grades" === files=1 occurrences=2
    src/app/components/tabs/tab-rails.test.ts  lines 61,183

=== string literal exactly "ta-content-view" === files=1 occurrences=1
    src/app/components/content-tab/constants.ts  lines 6
```

Two of those eight `"repo-grades"` files were opened and ruled OUT of the write
set, with the reason:

- `src/lib/module-graph/runtime-import-graph.test.ts:396` -
  `directoryRoots(join(SRC, "app", "components", "repo-grades"))`. A DIRECTORY
  path, not a nav value. **This design moves no files**, so the
  `src/app/components/repo-grades/` directory is untouched and this test is
  unaffected.
- `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts:54` -
  a path segment in a source-text read of `repo-grades/index.tsx`. Same reason.

The 114-occurrence census of the bare literal `"grading"` across 46 files was
also run; the great majority are a `recView` value, a workflow preset key, a
rubric field or a bulk-bar group id. The ones that are a `contentView` value and
therefore in scope are named per-file in section 4.

### 3.3 The derived edit surface

**Wave 1, production (7 files).** Every entry names the object and the reason,
and the "forced by" column is from the table in 2.3.

| # | Path | Edit points | Forced by |
|---|---|---|---|
| E1 | `src/app/components/manual/manual-rail.ts` | (i) `ManualViewType` `:14-21`: `-"repo-grades"`, `+"grading"`. (ii) `LMS_VIEW_PRESENCE` `:25-34`: remove `grading: true` at `:31`. (iii) `destinations` `:40-91`: remove the `lms-grading` entry at `:56`; remove the `repo-grades` single-destination group at `:85-90`; add a `{ name: "Grading", destinations: [grading-run, grading-repos] }` group. (iv) `MANUAL_VIEW_ORDER` `:110-118`: `"repo-grades"` at `:117` becomes `"grading"`. (v) `MANUAL_VIEW_LABELS` `:120-128`: `:127` becomes `grading: "Grading"`. (vi) NEW `GradingView` type + `GRADING_VIEWS` ordered list + `isGradingView`. (vii) NEW `INNER_NAV` table + `getInnerNavAriaLabel`. (viii) `getInnerDestinations` `:150-158`: derive from `INNER_NAV`. (ix) `getActiveDestinationId` `:160-181`: fourth parameter + a `"grading"` branch; drop the `"repo-grades"` branch at `:177-178`. (x) `resolveStateFromDestinationId` `:183-219`: fifth parameter, a fourth returned field, a `grading-` branch, the retired-pointer aliases, drop `:196` and `:212`. (xi) NEW `RETIRED_GRADING_POINTERS` alias table. | tsc (ii, x), `validateLmsViewsCompleteness` (iii), the shape (i, iv-ix, xi) |
| E2 | `src/app/components/manual/ManualRail.tsx` | (i) props gain a required `gradingView: GradingView`. (ii) `:38` passes it to `getActiveDestinationId`. (iii) `:48` the aria-label ternary becomes `getInnerNavAriaLabel(manualView)`. (iv) `:41` the early return also guards the label being null. | tsc (i-ii); (iii) is the B6.1 fix |
| E3 | `src/app/components/content-tab/constants.ts` | `:3` `ContentView` loses `"grading"`. | section 2.2 |
| E4 | `src/app/components/ContentTab.tsx` | (i) `:772-773` the `view === "grading" ? (grading)` branch is removed; `view === "announcements"` becomes the chain's first branch. (ii) `:67` and `:73` drop the `grading` prop. (iii) `:572-574`'s comment drops Grading from its list of self-hosting views. | tsc TS2367 (i); lint (ii) |
| E5 | `src/app/url-state.ts` | (i) `UrlNavState` `:290-311` gains a REQUIRED `gradingView: GradingView`. (ii) `parseUrlState` `:337-350` gains a `gradingView: normalizeGradingView(params.get(GRADING_VIEW_PARAM))` line. (iii) `buildUrlSearch` `:380-399` gains a `state.manualView === "grading" && state.gradingView !== DEFAULT_GRADING_VIEW` branch inside the existing `toolsSection === "manual"` block. (iv) NEW `GRADING_VIEW_PARAM = "gradingView"`, `GRADING_VIEW_VALUES`, `isGradingView` re-export, `normalizeGradingView`, `DEFAULT_GRADING_VIEW`. | tsc (i, ii); (iii) is the B6.2 subject |
| E6 | `src/app/components/home/useAppNavigation.ts` | (i) `ManualView` `:38-45`: same swap as E1(i). (ii) NEW `GRADING_VIEW_KEY = "ta-grading-view"`. (iii) NEW `gradingView` state with a `localStorage` restore delegating to `normalizeGradingView`. (iv) NEW persist effect `localStorage.setItem(GRADING_VIEW_KEY, gradingView)`. (v) the `manualView` initializer `:156-190` gains the two retired-pointer aliases (see 6.3) and `:188`'s legacy `saved === "grading"` branch is re-pointed. (vi) `:474-487`'s enumerated `buildUrlSearch` literal gains `gradingView`. (vii) the popstate ladder `:577-588` gains `if (parsed.manualView === "grading") setGradingView(parsed.gradingView);`. (viii) the URL-sync effect's dep array `:510-523` gains `gradingView`. (ix) the return object `:607-637` gains `gradingView, setGradingView`. | tsc (i, vi); (ii-v, vii-ix) are design |
| E7 | `src/app/page.tsx` | (i) `:73` destructure gains `gradingView, setGradingView`. (ii) `:501-511` `<ManualRail>` gains the `gradingView` prop and `:506`'s `resolveStateFromDestinationId` call gains the argument and applies the fourth result. (iii) `:538-558` the `ContentTab` mount drops `grading={...}`. (iv) NEW `manualView === "grading"` branch rendering `gradingView === "repos" ? <RepoGradesTab /> : <GradingTab ...8 props.../>`. (v) `:578-582` the `manualView === "repo-grades"` branch is deleted. | tsc (i, ii, v); (iii, iv) are the move |

**`src/app/components/tabs/tab-rails.ts` needs NO edit.** Verified rather than
assumed: `TOOLS_RAIL_ITEMS` maps `MANUAL_VIEW_ORDER` with
`label: MANUAL_VIEW_LABELS[view]` (`:132-140`), `ToolsRailItemId` and
`ToolsRailItem` are template-literal types over `ManualViewType` (`:116`,
`:126-128`), and `toolsRailItemFor` / `toolsStateFromRailItem` are total over the
union (`:163-192`). Every one of its nine `ManualViewType` occurrences is a type
position that widens automatically.

**`src/app/components/tabs/tab-sections.ts` needs no edit.** `ToolsSection`
stays `manual | workflows`; Grading is a MANUAL-family view, not a new section.
Verified at `:145-190`.

**`src/app/components/GradingTab.tsx` is NOT in the write set.** Verified rather
than asserted: all eight props that `page.tsx:543-552` passes it are `page.tsx`
locals - `state`/`formAction`/`pending` at `:63`, `testState` at `:68`,
`copiedKey` at `:80`, `resultsSectionFallbackRef` at `:113`,
`handleOpenPreview` at `:220`, `handleCopy` at `:247`. Moving the JSX from
`ContentTab`'s `grading` prop position into the new `manualView === "grading"`
branch is a relocation **within one component**. No prop plumbing changes and
`GradingTab.tsx` is never opened. Its 617 lines on both counters are preserved,
and so is the frozen `editsSurface="canvas"` two-path set
(`autoGradeTransition.wiring.test.ts:417`) - wave 1 creates no `.tsx` file at
all.

### 3.4 WHAT THE AC'S TABLE MISSED. Explicit list.

The AC's table is `docs/tools-grading-subtab-ac.md:196-211`; its write-set
sentence is `:309-313`. Against the derivation above:

| # | Missed edit point | Consequence if the implementer follows only the AC |
|---|---|---|
| M1 | `ManualRail.tsx` entirely (`grep -n "ManualRail" docs/tools-grading-subtab-ac.md` returns nothing) | The aria-label ternary at `:48` announces the Grading inner nav as "LMS views". No gate sees it. Confirmed starting point (a). |
| M2 | Both function SIGNATURE changes, not just new ladder branches | The fourth piece of state is unreachable from the functions that must produce and consume it. Confirmed starting point (b). |
| M3 | `url-state.ts`'s three points (`UrlNavState`, `parseUrlState`, `buildUrlSearch`) | Section 2.1 of the AC REQUIRES a `gradingView` URL param; nothing in the AC writes one. Confirmed starting point (c). |
| M4 | `useAppNavigation.ts:38-45`'s second hand-written union | tsc catches it, so it is loud - but it is an assignment file the AC does not list. Confirmed starting point (d). |
| M5 | **`useAppNavigation.ts:474-487`** - the `buildUrlSearch` call whose object literal enumerates all twelve fields explicitly | With a required `gradingView` this is a tsc error; without one, the param is silently never written even if `buildUrlSearch` grew a branch. NEW, not in RULING A. |
| M6 | **`useAppNavigation.ts:510-523`** - the URL-sync effect's dependency array | `gradingView` absent from the deps means picking an inner item does not push a history entry at all. Lint's exhaustive-deps rule would flag it; the AC never names the file's effect. NEW. |
| M7 | **`useAppNavigation.ts:188`** - `if (saved === "content" \|\| saved === "grading" \|\| saved === "canvas") return "content";` | An EXISTING legacy `ta-active-tab === "grading"` migration that today lands on LMS and must now land on the new sub-tab. A bare string literal, so tsc is silent. NEW, and the AC's AC7 enumerates three retired pointers without this fourth one. |
| M8 | **`ContentTab.tsx`** as a write-set member at all | The AC's rule (`:309`) says the write set is "`page.tsx` and `manual-rail.ts`". `ContentTab.tsx:772` is a tsc error the moment `ContentView` loses the member, and its `grading` prop becomes dead. NEW. |
| M9 | **`content-tab/constants.ts`** as a write-set member | Named in AC7's mutation as something to change, never in the write-set table. NEW. |
| M10 | **The `repo-grades` retired-pointer family, entirely** | Absorbing row 2 removes `"repo-grades"` from `ManualViewType`, so `isManualViewType("repo-grades")` becomes false and `normalizeManualView("repo-grades")` returns `"course-planning"`. Every stored `ta-manual-view = "repo-grades"` and every `?manualView=repo-grades` link SILENTLY BOUNCES to Build Courses. The AC's AC7 covers three `contentView`-side pointers and none of these two. NEW, and it doubles AC7's scope. |
| M11 | **The `repo-grades` destination entry at `manual-rail.ts:85-90`** | Left behind, it is a dead destination id - exactly the leftover class `manual-rail.test.ts:321-331` enumerates. NEW. |

**M10 is the largest miss.** It is a whole second retired-pointer family with two
inputs (storage and URL), and it exists only because the AC's own wave 1 absorbs
`repo-grades`.

### 3.5 The `owns` list, including source-text readers

A test that reads one of my edited files AS SOURCE TEXT goes red on a change it
does not import. Instrument: the `ts.createScanner` scan over all 1166
`*.test.ts` files under `src/`, matching the full repo-relative path and the
last-two/last-three path segments against STRING tokens only; comment-only
mentions are reported separately and excluded.

```
TEST FILES SCANNED: 1166

=== src/app/components/manual/manual-rail.ts ===
  SOURCE-TEXT READERS (path in a string literal): 0

=== src/app/components/manual/ManualRail.tsx ===
  SOURCE-TEXT READERS (path in a string literal): 0

=== src/app/page.tsx ===
  SOURCE-TEXT READERS (path in a string literal): 1
    src/app/components/tabs/topLevelTabs.wiring.test.ts  string=4 via 'src/app/page.tsx'

=== src/app/url-state.ts ===
  SOURCE-TEXT READERS (path in a string literal): 0

=== src/app/components/home/useAppNavigation.ts ===
  SOURCE-TEXT READERS (path in a string literal): 1
    src/app/components/home/useAppNavigation.test.ts  string=1 via '...useAppNavigation.ts'

=== src/app/components/content-tab/constants.ts ===
  SOURCE-TEXT READERS (path in a string literal): 0

=== src/app/components/ContentTab.tsx ===
  SOURCE-TEXT READERS (path in a string literal): 1
    src/lib/lms-generation/selection-archive.test.ts  string=1 via '...ContentTab.tsx'

=== src/app/components/tabs/tab-rails.ts ===
  SOURCE-TEXT READERS (path in a string literal): 0

=== src/app/components/GradingTab.tsx ===
  SOURCE-TEXT READERS (path in a string literal): 3
    src/app/components/autoGradeTransition.wiring.test.ts  string=2
    src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts  string=1
    src/app/components/grading-results/rubricProvenanceLeaf.test.ts  string=1
```

**The full-path needle UNDER-reports, and I caught it.** A second run with the
BASENAME as the needle returned three more readers, because those tests build the
path from `__dirname` or `process.cwd()` plus a bare filename:

```
=== src/app/components/ManualRail.tsx (basename needle) ===
    src/app/components/tabs/topLevelTabs.wiring.test.ts  string=3
=== src/app/components/ContentTab.tsx (basename needle) ===
    src/app/components/contentTab.wiring.test.ts  string=3 comment=5
=== src/app/components/manual/manual-rail.ts (basename needle) ===
    (5 files, ALL comment-only - no reader)
```

Opened and confirmed: `contentTab.wiring.test.ts:27` is
`const CONTENT_TAB_PATH = path.join(__dirname, "ContentTab.tsx")`, and
`topLevelTabs.wiring.test.ts:79` is
`join(process.cwd(), "src","app","components","manual","ManualRail.tsx")` - which
the full-path needle misses because the path is assembled from segments. **The
basename run is the FLOOR; the full-path run is a lower bound.** I report both
and take the union, hand-vetted. This is the fifth shape of
`docs/loop/traps-spec.md:150-158`: the instrument could not observe what it was
being read as settling, and the fix was a second, independent needle.

**Wave 1 `owns`, the union of the symbol census and both path scans, 13 paths:**

```
src/app/components/manual/manual-rail.ts
src/app/components/manual/ManualRail.tsx
src/app/components/content-tab/constants.ts
src/app/components/ContentTab.tsx
src/app/url-state.ts
src/app/components/home/useAppNavigation.ts
src/app/page.tsx
src/app/components/manual/manual-rail.test.ts
src/app/components/contentTab.wiring.test.ts
src/app/components/tabs/tab-rails.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/app/components/home/useAppNavigation.test.ts
src/app/url-state.test.ts
```

All 13 verified present (`while read -r p; do [ -f "$p" ] && echo OK ...`
returned OK for all 13).

**Owned read-only** (read, must stay green, must NOT be edited):
`src/app/components/tabs/tab-rails.ts`, `src/app/components/tabs/tab-sections.ts`,
`src/app/components/GradingTab.tsx`, `src/app/components/repo-grades/index.tsx`,
`src/app/components/autoGradeTransition.wiring.test.ts`,
`src/app/components/componentStorageKeys.structure.test.ts`,
`src/file-size-ceiling.structure.test.ts`,
`src/lib/client-state-sweep.test.ts`,
`src/lib/module-graph/runtime-import-graph.test.ts`,
`src/lib/lms-generation/selection-archive.test.ts`,
`src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`.

---

## 4. THE DERIVED ASSERTING-TEST SET, with the per-test CANARY-OR-GUARD call

The distinction that matters: a **CANARY** freezes a fact the change legitimately
alters - update it and say what moved. A **GUARD** is telling you the design is
wrong - if it goes red, change the design, not the test.

### 4.1 Wave 1

| # | Test and line | What it asserts | Red? | CANARY or GUARD | Disposition |
|---|---|---|---|---|---|
| T1 | `manual-rail.test.ts:34` | `getDestinationById("lms-grading")` is defined | RED | **CANARY** | Move into a removal block modelled on `:336-365` (course-intel) - assert it is UNDEFINED. |
| T2 | `manual-rail.test.ts:56` | `getActiveDestinationId("content","new","grading")` is `"lms-grading"` | **tsc error** + red | **CANARY** | Delete the line; the derived loop at `:264-268` covers the remaining seven. |
| T3 | `manual-rail.test.ts:116-120` | `resolveStateFromDestinationId("lms-grading", ...)` gives `contentView === "grading"` | **tsc error** + red | **CANARY, converted to an ALIAS assertion** | Rewrite: the id now resolves to `manualView === "grading"`, `gradingView === "run"`. This is the AC7 instrument for pointer (c). |
| T4 | `manual-rail.test.ts:138` | `validateLmsViewsCompleteness()` returns zero errors | green if the destination and the member move TOGETHER; red if either is left behind | **GUARD** | Do not touch. It is the enforcer of 2.2 and the reason the two must move together. |
| T5 | `manual-rail.test.ts:142` | `LMS_VIEWS` equals the eight-name literal | RED | **CANARY** | Drop `"grading"`; seven names. |
| T6 | `manual-rail.test.ts:219-228` | `getInnerDestinations("content")` equals the eight `lms-` ids | RED | **CANARY** | Drop `"lms-grading"`; seven ids. |
| T7 | `manual-rail.test.ts:145-150`, `:256-262`, `:264-268` | three DERIVED loops over `LMS_VIEWS` | green - they shrink by one iteration | **GUARD (derived)** | Do not touch. These are why no new per-view case is needed. |
| T8 | `manual-rail.test.ts:293-319` - the whole `repo-grades subtab` describe, 5 `it`s | the chip is in `MANUAL_VIEW_ORDER` (`:312`), `isManualViewType("repo-grades")` is true (`:317`), `getInnerDestinations("repo-grades")` is null (`:308`) | 3 RED, 2 **tsc errors** | **CANARY, converted to a REMOVAL + ALIAS block** | Rewrite as a removal block (modelled on `:336-365` and `:369-397`) plus an alias block asserting the retired pointer lands on `grading`/`repos`. This is M10's instrument. |
| T9 | `contentTab.wiring.test.ts:49-60` | `extractRenderChain` anchors on `src.indexOf('view === "grading" ? (')` and **THROWS at -1** | **THROWS, killing the whole describe block** | **CANARY** | Re-anchor on `'view === "announcements" ? ('`, which becomes the chain's first branch. The subject (every LMS view has a render branch) is unchanged; only the anchor moves. |
| T10 | `contentTab.wiring.test.ts:72` | `LMS_VIEWS.length` is 8 | RED | **CANARY** | 7. |
| T11 | `contentTab.wiring.test.ts:36` | `SELF_HOSTING_VIEWS` holds `"grading"` | green (stale, not red) | **CANARY, and it must still be updated** | Remove `"grading"`. `:73`/`:74` stay green either way (the partition's eligible count is 5 both before and after), so this one is SILENT - and `AGENTS.md`'s "never ship a loosened guard" corollary is exactly why it must be named in the brief rather than left. |
| T12 | `tab-rails.test.ts:54-65` | the exact ten `TOOLS_RAIL_ITEMS` ids, including `"manual:repo-grades"` at `:61` | RED | **CANARY** | `"manual:repo-grades"` becomes `"manual:grading"`, same index. |
| T13 | `tab-rails.test.ts:66` and `topLevelTabs.wiring.test.ts:349` | `TOOLS_RAIL_ITEMS` has length 10 | **GREEN** - the swap keeps `MANUAL_VIEW_ORDER` at 7 | **CANARY, not triggered** | Do not touch. Stated because a reader will expect these to move. |
| T14 | `tab-rails.test.ts:88-91` | length equals `MANUAL_VIEW_ORDER.length + WORKFLOWS_VIEW_ORDER.length`, ids unique | green - derived | **GUARD (derived)** | Do not touch. |
| T15 | `tab-rails.test.ts:92-100` | every chip's label is its family's own label | green - derived | **GUARD (derived)** | Do not touch. This is half of AC1 already in the tree. |
| T16 | `tab-rails.test.ts:103-108` | no two chips share a label (`new Set(labels).size` at `:108`) | **GREEN** - "Repo Grades" leaves as "Grading" arrives, all ten distinct | **GUARD** | Do not touch. This is the other half of AC1's both-directions requirement, already in the tree. |
| T17 | `tab-rails.test.ts:183-184` | `toolsRailItemFor("manual","repo-grades","automations")` is `"manual:repo-grades"` | **tsc error** | **CANARY** | Substitute `"grading"` / `"manual:grading"`. |
| T18 | `tab-rails.test.ts:270-283` - `DEFAULT_STATE: UrlNavState` | a full twelve-field literal | **tsc error** once `gradingView` is required | **CANARY** | Add the field. This is the construction that makes the fixture edit unforgettable. |
| T19 | `tab-rails.test.ts:288-301` - `EXPECTED_PARAM_NAMES`, asserted exact-set at `:336` | the twelve param names `buildUrlSearch` can emit | see 6.2 | **CANARY, and the B6.2 set-completeness enforcer** | Add `"gradingView"` (thirteen) AND add a driving state to `:306-327`. Omitting the driving state leaves this GREEN at thirteen-expected vs twelve-emitted... no: it goes RED. Omitting BOTH leaves it green. See 6.2 for the exact accounting. |
| T20 | `topLevelTabs.wiring.test.ts:309-320` | every `MANUAL_VIEW_ORDER` member has a `manualView === "<view>"` branch inside the `activeTab === "manual"` slice, DERIVED from the order list | **GREEN once E7(iv) lands; RED if the chip is registered with no render branch** | **GUARD (derived)** | **Do not touch, and do not write a second one.** This is AC3's instrument, already in the tree, already derived. See 5.3. |
| T21 | `topLevelTabs.wiring.test.ts:274-285` | `ManualRail.tsx` has exactly one `role="tablist"` (`:284`) and no `MANUAL_VIEW_ORDER` (`:281`) | green under the shape in section 2; RED under any second-tablist design | **GUARD** | Do not touch. This is what forces the shape. |
| T22 | `topLevelTabs.wiring.test.ts:209-226` | exactly one `<TabRail` per merged tab branch (`:218`, `:224`) | green under the shape; RED under a `TabRail`-based inner nav | **GUARD** | Do not touch. |
| T23 | `topLevelTabs.wiring.test.ts:430-447` | reads `useAppNavigation.ts`, slices 600 chars from the first `isFirstUrlSyncRef.current` (`:489` in the source) and requires `target !== window.location.search` (source `:495`) and `replaceState` | green, unless a new state block is inserted between source `:489` and `:495` | **GUARD (fragile)** | Do not touch, and do not insert anything between the first-sync guard and its `replaceState`. Named because it is a positional window: E6(vi)'s edit at source `:474-487` is BEFORE the window and safe. |
| T24 | `useAppNavigation.test.ts:38-62` | isolates the `contentView` initializer between its own `useState` line and `const [workflowsView`, and pins the `normalizeContentView(localStorage.getItem(VIEW_KEY))` delegation | green | **GUARD (positional)** | Do not touch. **Placement rule for E6(iii): the `gradingView` state block must NOT be inserted between the `contentView` initializer and `const [workflowsView`.** Put it after `tasksView` (source `:292`). |
| T25 | `useAppNavigation.test.ts:65-75` | `normalizeContentView` accepts every `LMS_VIEWS` member, derived | green - one fewer iteration | **GUARD (derived)** | Do not touch. |
| T26 | `useAppNavigation.test.ts:150-171` - the `KEYS` hand list | each nav view key is declared and written back | green (stale) | **CANARY** | Add `{ constant: "GRADING_VIEW_KEY", value: "ta-grading-view" }`. This is AC5's persistence instrument, and it is an EXTENSION of an existing hand list, not a new instrument family. |
| T27 | `url-state.test.ts:33-46` - `DEFAULT_STATE: UrlNavState` | a full twelve-field literal | **tsc error** | **CANARY** | Add the field. |
| T28 | `url-state.test.ts:304` | `normalizeContentView("grading")` is `"grading"` | **tsc-clean but RED** (returns `"modules"`) | **CANARY** | Delete the line; the `LMS_VIEWS`-derived loop in `useAppNavigation.test.ts:71-74` carries the property. |
| T29 | `url-state.test.ts:460-467`, `:535-540`, `:669-676`, `:758-764`, `:802-808` | five `parseUrlState`/`buildUrlSearch` cases using `contentView: "grading"` as their VEHICLE | **tsc errors** (nine literal occurrences) | **CANARY - vehicle substitution only** | Replace `"grading"` with another non-default `ContentView` member (`"pages"` is already used at `:309` of `tab-rails.test.ts`'s driver, so `"assignments"` or `"quizzes"` keeps the cases distinct). **Do not delete the cases.** `:802-808` in particular is the "no pre-existing view param was renamed" guard (D25c); deleting it to make a tsc error go away would remove the only thing proving `contentView=` is still emitted. |
| T30 | `url-state.test.ts:881-897` - the `repo-grades subtab round trip` describe | `buildUrlSearch` emits `?tab=manual&manualView=repo-grades` and parses it back | **tsc error** at `:884` + red | **CANARY, converted to an ALIAS block** | Rewrite as the `manualView=repo-grades` retired-pointer test: the legacy URL resolves to the Grading chip with `gradingView === "repos"`, and the CANONICAL value is written back (the alias-is-a-redirect rule, `tab-sections.ts:157-160`). This is M10's URL-side instrument. |
| T31 | `autoGradeTransition.wiring.test.ts:16`, `:417` | `GradingTab.tsx` by path; the frozen `editsSurface="canvas"` exact two-path set | **GREEN** - wave 1 writes no `.tsx` file | **GUARD** | Do not touch. It is the reason the cut avoids `GradingTab.tsx`. |
| T32 | `componentStorageKeys.structure.test.ts:235` | the frozen exact `ta-` key set over NON-TEST TOP-LEVEL files of `src/app/components/`, comment-INCLUDED | **GREEN** - `ta-grading-view` is declared in `src/app/components/home/useAppNavigation.ts`, a SUBDIRECTORY, and the scan is non-recursive (`:10-26`) | **GUARD** | Do not touch. **And it is a placement constraint: any new file this design adds must NOT sit directly in `src/app/components/` if it carries a `ta-` literal, in a comment or otherwise.** The design adds no new file, so it is satisfied by construction. |
| T33 | `src/lib/client-state-sweep.test.ts:116-124` | no `DEVICE_PREFERENCE_KEYS` entry contains the substring `"grading"` | green | **GUARD** | Do not touch. Constraint: `ta-grading-view` must never be added to `DEVICE_PREFERENCE_KEYS`. |
| T34 | `src/file-size-ceiling.structure.test.ts:131-150` | every checked file within `LIMIT = 1000` | green - no wave-1 file exceeds 703 | **GUARD** | Do not touch. |
| T35 | `src/lib/lms-generation/selection-archive.test.ts` | reads `ContentTab.tsx` as source text | **undetermined** - the needle found one string reference; I did not open the assertion | **UNRESOLVED** | Named as a residual (RES-ARCH-2) rather than guessed at. It is in the wave's read-only set and the wave gate must run it. |

**Count: 35 asserting-test entries across 13 files. The AC's section 4 named ONE
test file.**

### 4.2 Wave 2's frozen canaries, listed now because wave 1 must not disturb them

Six assertions in `src/app/components/recording/recording-split.structure.test.ts`
freeze `"grading"` and `"snapgrade"` into the Recording strip. All six opened:

| Line | Assertion | Call |
|---|---|---|
| `:143` | `expect(entries).toHaveLength(12)` on the strip's one-line array literal | CANARY, wave 2 |
| `:151` | `expect(recordingTabContent).toMatch(/\["grading",\s*"[^"]+"\]/)` | CANARY, wave 2 |
| `:169-176` (values at `:173`) | the restore-equality chain must contain `v === "grading"` | CANARY, wave 2 - **and the precedent for the popstate instrument in 6.3** |
| `:198` | `expect(matches).toHaveLength(11)` on `role="tabpanel"` | CANARY, wave 2 |
| `:230` | `expect(panelTargets.size).toBe(11)`, with an `id="rec-panel-grading"` requirement | CANARY, wave 2 |
| `:262-263` | `aria-labelledby="rec-tab-grading"` must appear on its panel | CANARY, wave 2 |

**Wave 1 does not write `RecordingTab.tsx`, so all six stay green in wave 1.**
They are wave 2's cost, and section 9.2 prices wave 2 as a frozen-canary problem
rather than a size problem - the AC priced it as decomposition work against a
917-line file, which is the wrong worry.

---

## 5. The seams: exact type signatures

New and changed declarations, all in `src/app/components/manual/manual-rail.ts`
unless stated. `GRADING_VIEWS` lives in `manual-rail.ts` and NOT in
`url-state.ts`, for the reason `url-state.ts:61-79` gives about `WorkflowsView`
and `TasksView`: the ordered member lists belong in the leaf module, and
declaring one in `url-state.ts` and importing it back would be a cycle. This
repo has paid for that cycle once (a back-imported constant yielding `undefined`
with `tsc` silent).

### 5.1 The inner selection

```ts
// manual-rail.ts
export type GradingView = "run" | "repos";

// Ordered, in the shape of LMS_VIEWS, so every derived guard picks a new
// member up with no second list.
const GRADING_VIEW_PRESENCE: Record<GradingView, true> = { run: true, repos: true };
export const GRADING_VIEWS: readonly GradingView[] =
  Object.keys(GRADING_VIEW_PRESENCE) as GradingView[];

const GRADING_VIEW_SET: ReadonlySet<string> = new Set(GRADING_VIEWS);
export function isGradingView(value: unknown): value is GradingView {
  return typeof value === "string" && GRADING_VIEW_SET.has(value);
}
```

```ts
// url-state.ts - derived from isGradingView, never restated
export function normalizeGradingView(value: string | null): GradingView {
  return isGradingView(value) ? value : "run";
}
const DEFAULT_GRADING_VIEW = normalizeGradingView(null);   // matches :259-264's idiom
const GRADING_VIEW_PARAM = "gradingView";
```

`normalizeGradingView(null) === "run"` is AC6: a first load with nothing stored
lands on the grading-RUN surface, the one `lms-grading` reaches today.

### 5.2 The inner-nav table, and why it is one table

```ts
// manual-rail.ts
type InnerNavViewType = Extract<ManualViewType, "course-planning" | "content" | "grading">;

// ONE table. Both readers below derive from it, so a group that has inner
// destinations and a group that has an accessible name are the same set by
// construction - not by two lists agreeing.
const INNER_NAV: Record<InnerNavViewType, { groupName: string; ariaLabel: string }> = {
  "course-planning": { groupName: "Build",   ariaLabel: "Course build modes" },
  content:           { groupName: "LMS",     ariaLabel: "LMS views" },
  grading:           { groupName: "Grading", ariaLabel: "Grading tools" },
};

// SIGNATURE UNCHANGED, deliberately: 7 existing call sites in
// manual-rail.test.ts use `getInnerDestinations(x)?.map(...)` and
// `.toBeNull()`, and changing the return shape would churn all of them
// inside a canary file for no safety gain.
export function getInnerDestinations(manualView: ManualViewType): Destination[] | null {
  const entry = (INNER_NAV as Record<string, { groupName: string; ariaLabel: string }>)[manualView];
  if (!entry) return null;
  return destinations.find((g) => g.name === entry.groupName)?.destinations ?? null;
}

export function getInnerNavAriaLabel(manualView: ManualViewType): string | null {
  const entry = (INNER_NAV as Record<string, { groupName: string; ariaLabel: string }>)[manualView];
  return entry ? entry.ariaLabel : null;
}
```

`Extract<ManualViewType, ...>` rather than a fresh union: if `"grading"` is ever
renamed or removed from `ManualViewType`, `Extract` narrows and the `INNER_NAV`
literal's key becomes an excess property - a tsc error rather than a dead entry.

### 5.3 The two signature changes

```ts
// manual-rail.ts - fourth parameter, REQUIRED
export function getActiveDestinationId(
  manualView: ManualViewType,
  buildView: BuildViewType,
  contentView: ContentView,
  gradingView: GradingView,
): string

// manual-rail.ts - fifth parameter, and a fourth returned field
export function resolveStateFromDestinationId(
  id: string,
  currentManualView: ManualViewType,
  currentBuildView: BuildViewType,
  currentContentView: ContentView,
  currentGradingView: GradingView,
): {
  manualView: ManualViewType;
  buildView: BuildViewType;
  contentView: ContentView;
  gradingView: GradingView;
}
```

**REQUIRED, not optional, and this is a decision with a reason.** Each function
has exactly ONE production caller - measured, not assumed: the census gives
`getActiveDestinationId` at `ManualRail.tsx` (code=2) plus 16 occurrences in
`manual-rail.test.ts`, and `resolveStateFromDestinationId` at `page.tsx`
(code=2) plus 17 in the test. So the cost of "required" is mechanical: 15 and 16
test call sites each gain one argument. The benefit is that tsc names every
site. An OPTIONAL fourth parameter with a default is precisely the silent-green
shape RULING B is about - `getActiveDestinationId(manualView, buildView, contentView)`
would still compile after the change, return the wrong highlighted chip for
`manualView === "grading"`, and no test that does not specifically pass the new
argument would notice.

```tsx
// ManualRail.tsx - props gain a required field, so page.tsx:501 is a tsc error
// until it is passed
export function ManualRail({
  manualView, buildView, contentView, gradingView, onDestinationClick,
}: {
  manualView: ManualViewType;
  buildView: BuildViewType;
  contentView: ContentView;
  gradingView: GradingView;
  onDestinationClick: (destId: string) => void;
})
```

### 5.4 The destination ids

```
grading-run    label "Submissions"     -> gradingView "run",   renders <GradingTab>
grading-repos  label "Repo Grades"     -> gradingView "repos", renders <RepoGradesTab>
```

Collision check, measured with the string-literal census: `"grading-run"` and
`"grading-repos"` each appear in 0 files. `getDestinationById` is a flat search
across all groups (`manual-rail.ts:93-99`), so a collision with `build-*`,
`lms-*`, `version-control`, `recording`, `ppt-design` or `artifact-design` would
be a real bug; there is none.

`"Repo Grades"` is reused as the inner item's label. That does NOT collide with
`tab-rails.test.ts:108`'s uniqueness pin, which ranges over
`TOOLS_RAIL_ITEMS` labels only - and `"Repo Grades"` leaves that set when
`"repo-grades"` leaves `MANUAL_VIEW_ORDER`.

### 5.5 The retired-pointer alias table

Modelled on `RETIRED_TAB_DESTINATIONS` (`tab-sections.ts:163-185`), whose own
header at `:148-161` names this exact failure ("every existing bookmark, shared
link and restored localStorage session carrying one lands on the WRONG TAB WITH
NO ERROR") and states the rule an alias must satisfy: "an alias is a REDIRECT,
not a synonym: the canonical value is written back".

```ts
// manual-rail.ts
export interface GradingPointerTarget {
  manualView: Extract<ManualViewType, "grading">;
  gradingView: GradingView;
}

// Every pointer at a grading surface that this consolidation retires, with the
// place it now means. Keyed by the RAW stored/URL value, because that is the
// only thing an old link or an old localStorage entry carries.
export const RETIRED_GRADING_POINTERS: Record<string, GradingPointerTarget> = {
  // ta-content-view = "grading", and ?manualView=content&contentView=grading
  "content-view:grading": { manualView: "grading", gradingView: "run" },
  // the rail destination id, for a persisted or hand-typed destination
  "lms-grading":          { manualView: "grading", gradingView: "run" },
  // ta-manual-view = "repo-grades", and ?manualView=repo-grades   [MISS M10]
  "repo-grades":          { manualView: "grading", gradingView: "repos" },
  // ta-active-tab = "grading", the pre-merge top-level tab value still handled
  // at useAppNavigation.ts:188                                    [MISS M7]
  "active-tab:grading":   { manualView: "grading", gradingView: "run" },
};
```

Four pointers. The AC's AC7 named three and two of them were the same input.

---

## 6. B6's three silent failures: prevented by construction, or caught by a named instrument

RULING B: building the AC's wave 1 exactly as written ships an inner nav
announced "LMS views", a `gradingView` URL param that is never written, and
Back/Forward silently losing the inner selection - with lint, tsc, `next build`,
`npm test` and every structure test green. Each is addressed below with a
direction of failure.

### 6.1 The inner nav announced as "LMS views"

**PREVENTED BY CONSTRUCTION at the data layer.** `ManualRail.tsx:48`'s ternary
is replaced by `getInnerNavAriaLabel(manualView)`, and both that function and
`getInnerDestinations` read the SAME `INNER_NAV` table (5.2). A group that has
inner destinations and a group that has an accessible name are therefore the
same set by construction; there is no second list to omit a member from. Adding
a fourth inner nav without a label is not "a wrong label" - it is a `Record`
literal missing a key, which is a tsc error.

**CAUGHT, additionally, by two instruments:**

- **I1, a derived parity assertion** (new, in `manual-rail.test.ts`):
  - Object: the pair `(getInnerDestinations(v), getInnerNavAriaLabel(v))` for
    every `v` in `MANUAL_VIEW_ORDER`.
  - Instrument: `npm run test:paths -- src/app/components/manual/manual-rail.test.ts`.
  - Pass condition: for every member, `(getInnerDestinations(v) !== null) === (getInnerNavAriaLabel(v) !== null)`;
    and the set of non-null labels has as many distinct members as it has
    entries.
  - Direction of failure: **RED when a view has inner destinations and no
    accessible name, RED when it has a name and no destinations, and RED when
    two inner navs share a name.**
  - Mutation that must turn it red: add a `"grading"` entry to
    `getInnerDestinations`'s lookup without adding it to `INNER_NAV` - or, if
    the construction is bypassed, add the group and leave the ternary at `:48`.
  - It PASSES on today's tree (two inner navs, two distinct labels), so it is a
    test that is green now and goes red on exactly the defect.
- **I2, a source-text assertion** (new, in `topLevelTabs.wiring.test.ts`, whose
  header already justifies source-text for this file):
  - Object: `ManualRail.tsx`'s source.
  - Pass condition: the file contains `aria-label={getInnerNavAriaLabel(`, and
    does NOT contain the string `"LMS views"`.
  - Direction of failure: RED when the label is a literal or a ternary again.
  - **This is a SOURCE-TEXT claim, not a render claim.** It proves the attribute
    is fed from the function. It proves nothing about what assistive technology
    announces.

**The visible half is OW-A1**, an owner-walk item, with no proxy proposed.
`docs/loop/this-repo.md` section 6 and this repo's own standing rule: no
component is rendered by any test here, so no instrument in this checkout can
observe an accessible name.

### 6.2 The `gradingView` URL param that is never written

**This is where my derivation DISAGREES with the check, and the disagreement is
load-bearing.** B6.2 says no instrument in the tree can see the param. That is
half wrong, and the half that is wrong changes the fix.

**Measured:** `src/app/components/tabs/tab-rails.test.ts:284-337` is a FROZEN
ORACLE over the param names `buildUrlSearch` can emit. `EXPECTED_PARAM_NAMES`
(`:288-301`) is a hand-frozen list of twelve, deliberately "written down
somewhere the rename cannot reach" (`:285-287`); `emittedParamNames()`
(`:305-333`) drives `buildUrlSearch` through eight states and collects every key
it emits; `:336` asserts exact-set equality.

So the accounting, per build outcome:

| Build outcome | `emittedParamNames()` | `EXPECTED_PARAM_NAMES` | `:336` |
|---|---|---|---|
| emit branch added, frozen list not updated | 13 | 12 | **RED** - caught |
| emit branch added, frozen list updated, no driving state added | 12 | 13 | **RED** - caught |
| emit branch added, frozen list updated, driving state added | 13 | 13 | green - correct |
| **field + parse line but NO emit branch** (B6.2's exact case), list and driving state both updated | 12 | 13 | **RED** - caught |
| **field + parse line but NO emit branch, and nothing in the test touched** | 12 | 12 | **GREEN - NOT caught** |

The last row is the real gap: the existing oracle catches the missing emit
branch **only if the frozen list is extended**, and nothing forces that
extension. So the frozen oracle is necessary and not sufficient.

**PREVENTED, partly, BY CONSTRUCTION.** `gradingView` is a REQUIRED field on
`UrlNavState` (5.1 / E5(i)). That makes four separate sites tsc errors until
they are updated: `url-state.ts`'s own `parseUrlState` return literal,
`useAppNavigation.ts:474-487`'s enumerated `buildUrlSearch` argument,
`url-state.test.ts:33-46`'s `DEFAULT_STATE`, and
`tab-rails.test.ts:270-283`'s `DEFAULT_STATE`. An optional field would make all
four silent. **tsc does NOT force the `buildUrlSearch` emit branch**, so the
construction closes the fixture half and not the emit half.

**CAUGHT by two instruments, and each one alone is defeatable:**

- **I3, the directional round trip** (new, in `url-state.test.ts`, in the shape
  of the existing round-trip cases at `:841-873`):
  - Object: `parseUrlState(buildUrlSearch(state)).gradingView`.
  - Instrument: `npm run test:paths -- src/app/url-state.test.ts`.
  - Pass condition: for `state = { ...DEFAULT_STATE, tab: "manual", manualView: "grading", gradingView: "repos" }`,
    `buildUrlSearch(state)` is exactly `"?tab=manual&manualView=grading&gradingView=repos"`
    and `parseUrlState(that)` deep-equals `state`. Plus the negative: with
    `gradingView: "run"` (the default) the string is
    `"?tab=manual&manualView=grading"`, and with `manualView: "content"` the
    `gradingView` param is dropped entirely (the gating rule `buildUrlSearch`
    already applies to `contentView` at `:389`).
  - Direction of failure: **RED when the emit branch is absent** (the built
    string carries no `gradingView`, so the parse falls back to `"run"` and the
    deep-equal fails), **RED when the param is emitted at the default**, and
    **RED when it leaks onto a non-Grading branch.**
  - Mutation: delete the `buildUrlSearch` branch. Both halves of the first
    assertion go red.
  - **What I3 alone does not catch:** a THIRTEENTH param emitted under some
    other name, or a fourteenth param added later. That is I4's job.
- **I4, the frozen-oracle extension** (edit, `tab-rails.test.ts:288-301` and
  `:306-327`): add `"gradingView"` to `EXPECTED_PARAM_NAMES` and add
  `{ ...DEFAULT_STATE, tab: "manual", manualView: "grading", gradingView: "repos" }`
  to the `states` array.
  - Direction of failure: RED on any emitted-name set that is not exactly
    thirteen names.
  - **What I4 alone does not catch:** the last row of the table above - a build
    that touches neither the frozen list nor the driving state.

**Both are required. I say which failure each one alone permits rather than
presenting either as the fix.**

### 6.3 Back and Forward losing the inner selection

`useAppNavigation.ts:577-588` is a hand-written popstate ladder:
`setManualView(parsed.manualView)` at `:580`, then
`if (parsed.manualView === "course-planning") setBuildView(...)` at `:581` and
`if (parsed.manualView === "content") setContentView(...)` at `:582`.

**NOT prevented by construction, and I say so plainly.** Making the ladder
derived would mean replacing three hand-written branches with a loop over a
view-to-setter map - a refactor that changes the restore path for `buildView`
and `contentView` as a side effect of adding a third inner nav. That is a
behaviour change to two shipped restores riding on a nav addition, which is
exactly the shape `docs/loop/traps-spec.md:75-96` records. **I am declining the
construction and naming the residual** (RES-ARCH-3).

`url-state.ts:5-13` records that the instructor OVERRULED narrowing this scope
and said "do not narrow this scope again without asking", so full Back/Forward
coverage is a requirement here, not a nicety. It is met by E6(vii) plus
E6(viii) - the branch AND the dependency array; either one alone is silent.

**CAUGHT by one derived instrument:**

- **I5, the popstate branch parity assertion** (new, in
  `useAppNavigation.test.ts`, modelled exactly on
  `recording-split.structure.test.ts:169-176`, which isolates
  `RecordingTab.tsx`'s restore chain by regex and asserts every value appears in
  it):
  - Object: the source slice of `useAppNavigation.ts` between
    `const onPopState = () => {` and `window.addEventListener("popstate"`.
  - Instrument: `npm run test:paths -- src/app/components/home/useAppNavigation.test.ts`.
  - Pass condition, DERIVED from `INNER_NAV`'s key set rather than restated: for
    every view that owns an inner selection, the slice contains
    `parsed.manualView === "<view>"`. Plus: the slice contains
    `parsed.gradingView` at least once, so the new branch actually reads the
    parsed field.
  - Direction of failure: **RED when a view that owns an inner nav has no
    popstate branch.**
  - Mutation: add `"grading"` to `INNER_NAV` and omit the popstate branch. Red
    on exactly that member.
  - It PASSES on today's tree (`course-planning` at `:581`, `content` at
    `:582`), so it is green now and goes red on the defect.
  - **This is a SOURCE-TEXT / reading claim.** `useAppNavigation` is a hook; its
    closures only run inside a real React render, and calling the exported hook
    outside one throws (that file's own header, `:1-28`, and its
    `useAppNavigation.test.ts:1-17`). I5 proves the branch exists in source. It
    proves nothing about whether pressing Back restores the selection.
  - A SECOND assertion for E6(viii), same file, same slice-isolation idiom: the
    URL-sync effect's dependency array must contain `gradingView`. Direction of
    failure: RED when the array omits it, which is the "no history entry is ever
    pushed" defect. `eslint`'s exhaustive-deps rule would also flag it; the
    assertion is cheap and does not depend on lint configuration staying put.

**The behavioural half is OW-A2**, an owner-walk item: pick a non-default inner
item, press Back, press Forward, observe. No proxy proposed.

---

## 7. RULING D: `CartridgeDropPanel`'s double mount. DECIDED.

Measured, not inherited. Both mounts opened:

- `src/app/components/GradingTab.tsx:614` - `<CartridgeDropPanel />`, no props.
- `src/app/components/FilesTab.tsx:852` - `{filesView === "submissions" && <CartridgeDropPanel />}`, no props.

`FilesTab.tsx:727-735` is the `Submissions` inner-strip button, so the second
mount is reached at Library > Files > Submissions. The check's R5 is correct that
this is unambiguously a DESTINATION, not a section - I confirm it and it
strengthens rather than weakens the survey's treatment.

### THE DECISION

> **Both mounts stay exactly as they are. Wave 1 changes neither, and
> `CartridgeDropPanel.tsx` is not in any wave's write set.**

Four grounds, each measurable:

1. **The GradingTab-internal mount moves for free and cannot be orphaned.**
   Wave 1 does not write `GradingTab.tsx` (3.3), so `:614` travels with its host
   into the new `manualView === "grading"` branch. There is no edit at which an
   orphan could be created.
2. **No third mount is created.** The design adds no `<CartridgeDropPanel` JSX
   anywhere. The symbol census puts `CartridgeDropPanel` at exactly three files
   with `codeOccurrences > 0` and that count does not change.
3. **`CartridgeDropPanel` fails clause (G), so it is not a grading tool the
   owner's sentence reaches.** (G) is "the surface assigns or drafts a score
   against a submission, or gates what gets posted to a gradebook"
   (`docs/grading-path-survey.md:40-42`). `CartridgeDropPanel` is INTAKE: it
   uploads an archive and holds a rubric string. It assigns no score and gates
   no gradebook post. So the double mount is not a consolidation question at
   all - it is two entry points to the same intake form, which is a UX question
   for wave 3, not an architecture input to wave 1.
4. **The two mounts cannot be simultaneous, and they already share state.**
   `page.tsx:480` is `{activeTab === "manual" && ...}` and `:630` is
   `{activeTab === "files" && ...}` - mutually exclusive before and after wave 1.
   And both instances take no props and persist to the same `ta-cartridge-*`
   keys (frozen in `componentStorageKeys.structure.test.ts`'s
   `EXPECTED_TA_KEYS`, e.g. `"ta-cartridge-lms-chosen"` at `:249`), so two
   mounts are not two states.

**What this decision does NOT settle, said rather than buried:** whether the
Library > Files > Submissions entry point should eventually be the only one, or
whether the Grading sub-tab should absorb it. That is a product judgement on an
intake surface, it is not blocked by wave 1, and it is filed as RES-ARCH-4 with
the wave-3 user-experience seat as owner and the destination enumeration as its
instrument. **RES-GRAD-1 is discharged by the decision above, not deferred
again.**

---

## 8. Reachability, traced from the control to the code

`docs/loop/traps-spec.md:58-64`, and this repo's own recorded failure: two items
shipped a library and an endpoint with no surface between them. **When a feature
is split into layers, the surface IS a layer.** Every hop from the user's click
to the code, after wave 1:

| Hop | Where | What makes it exist |
|---|---|---|
| 1. The chip is in the rail | `TOOLS_RAIL_ITEMS` derives from `MANUAL_VIEW_ORDER` (`tab-rails.ts:132-140`) | E1(iv). Enforced by T14 (derived) and T12 (exact list). |
| 2. The chip is labelled `Grading` | `MANUAL_VIEW_LABELS` (`manual-rail.ts:120-128`) | E1(v). Enforced by T15 (derived) plus one new equality assertion; both-directions delivered by T16. |
| 3. Clicking it writes state | `page.tsx:491` `onChange={handleToolsRailChange}` calls `toolsStateFromRailItem` (`tab-rails.ts:174-192`), which is total over the union | no edit needed - verified by reading `:180-192` |
| 4. The state selects a render branch | `page.tsx` `manualView === "grading" &&` | E7(iv). **Enforced by T20, which already exists and is already derived.** |
| 5. The branch renders the surfaces | `gradingView === "repos" ? <RepoGradesTab /> : <GradingTab ... />` | E7(iv). Reading claim - nothing here renders a component. |
| 6. The inner nav appears | `ManualRail` renders `getInnerDestinations("grading")` through its one tablist | E1(viii), E2. Enforced by I1 for the data; T21 for the one-tablist shape. Reading claim for the pixels; OW-A1. |
| 7. Clicking an inner item writes the inner state | `page.tsx:505-510` applies `resolveStateFromDestinationId`'s fourth returned field | E7(ii), E1(x). Enforced by a new round-trip assertion over `GRADING_VIEWS` in `manual-rail.test.ts`, in the shape of the existing derived loop at `:264-268`. |
| 8. The highlighted chip matches | `getActiveDestinationId(..., gradingView)` (`ManualRail.tsx:38`) | E1(ix), E2(ii). Same round-trip assertion. |
| 9. The selection survives a reload | `ta-grading-view` declared, written, read back through `normalizeGradingView` | E6(ii-iv). Enforced by T26. Reading claim for the reload itself; OW-A2. |
| 10. The selection survives Back/Forward | `buildUrlSearch` branch + popstate branch + effect deps | E5(iii), E6(vi-viii). Enforced by I3, I4, I5. Reading claim for the browser; OW-A2. |
| 11. An old pointer arrives | `RETIRED_GRADING_POINTERS`, four entries | E1(xi), E6(v). Enforced by T3, T8, T30 and one new case per pointer. Reading claim for a real bookmark; OW-A3. |

**Hop 4's enforcer already exists**, and that is the most useful single finding
in this section: `topLevelTabs.wiring.test.ts:309-320` loops
`MANUAL_VIEW_ORDER` and requires a `manualView === "<view>"` branch inside the
`activeTab === "manual"` slice. It is derived from the order list, so registering
the chip without a render branch turns it RED with no new test written.
**AC3 proposed a NEW instrument of exactly that shape. Writing one would
duplicate a shipped test.** AC3 is satisfied by adoption, not by authoring.

---

## 9. The wave cut

### 9.1 Wave 1 - the container, and the two grading surfaces already in the Tools rail

**Write set: the 13 paths in 3.5.** Production: `manual-rail.ts`,
`ManualRail.tsx`, `content-tab/constants.ts`, `ContentTab.tsx`, `url-state.ts`,
`useAppNavigation.ts`, `page.tsx`. Tests: `manual-rail.test.ts`,
`contentTab.wiring.test.ts`, `tab-rails.test.ts`,
`topLevelTabs.wiring.test.ts`, `useAppNavigation.test.ts`, `url-state.test.ts`.

**Why 13 files in ONE wave, and it is not a preference.** Six of the seven
production files are tsc-forced by the other edits (table in 2.3), and two of the
six test files are tsc-forced by the required `UrlNavState` field (T18, T27). **No
proper subset of this write set compiles.** Splitting it would push a
non-compiling intermediate, which is not a wave - it is a broken commit. I state
this because a checker should ask why the wave is this wide, and the answer is
the type graph, not convenience.

**Why rows 1 and 2 together rather than row 1 alone.** A one-item inner
navigation renders a single-button tablist, which is not the surface DECISION 18
describes and is worse than today's arrangement. And the retired-pointer
MECHANISM (5.5) is identical for the `contentView` family and the
`repo-grades` family, so splitting them pays the design cost twice and ships an
interim state where `ta-manual-view = "repo-grades"` still resolves while
`ta-content-view = "grading"` already does not. One alias table, one wave.

**Gate:**

```
git status --short                       (must list exactly the 13 paths, nothing else)
npx tsc --noEmit --incremental false     (silent)
npm run lint
npm run test:paths -- src/app/components/manual/manual-rail.test.ts src/app/components/contentTab.wiring.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/home/useAppNavigation.test.ts src/app/url-state.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/app/components/componentStorageKeys.structure.test.ts src/file-size-ceiling.structure.test.ts src/lib/client-state-sweep.test.ts src/lib/lms-generation/selection-archive.test.ts src/lib/module-graph/runtime-import-graph.test.ts
npm test                                 (zero failed)
npm run build
wc -l <each of the 7 production paths>  and  @(Get-Content <each>).Count
```

Every multi-path run is spelled `npm run test:paths -- <paths>`. A raw
multi-path `vitest`/`npm test` silently drops arguments it does not match
(`docs/loop/this-repo.md`; the repo's own
`src/tools/vitest-paths/gate-commands.structure.test.ts` enforces it).
`npx tsc --noEmit --incremental false` carries the flag because the bare form
races on `tsconfig.tsbuildinfo` and has ONE caller under concurrency
(`docs/loop/parallel-disjointness.md`).

**Pass conditions, each naming the object, the instrument and the direction:**

| Object | Instrument | Direction of failure |
|---|---|---|
| the wave's write set | `git status --short` against the 13-path list | RED when any other path appears, and RED when `src/app/components/GradingTab.tsx` appears at all |
| `GradingTab.tsx`'s size | `wc -l` and `@(Get-Content).Count`, run BEFORE and AFTER | RED when the two readings differ from each other. **NOT pinned to 617 as an absolute** - that would report RED on a different wave's legitimate change to the file, which is the check's R1 and I am adopting its correction. "This chunk did not write it" is established by `git status --short`; the counters are a cross-check on that, not a separate bound. |
| every wave-1 production file's size | both counters | RED above 1000 (`src/file-size-ceiling.structure.test.ts:41`). Largest today is `page.tsx` at 703. |
| the `editsSurface="canvas"` set | `npm run test:paths -- src/app/components/autoGradeTransition.wiring.test.ts` | RED when the set gains or loses a member |
| the whole suite | `npm test` | RED on any failure. **Required, not optional: A39 W7's Group A precondition is "`npm test` zero failed" (`docs/a39-fill-waves.md:1314-1318`), so a wave 1 left half-done blocks W7's flip.** |

**Sequencing against A39, corrected.** There is no write-set collision - proven,
not asserted:

```
--- intersection of wave 1 with A39 W6+W7 (empty is the only pass) ---
--- end (nothing above = disjoint) ---
wave1 paths: 13; a39 paths: 6
```

(`cat w1.txt a39w67.txt | sort | uniq -d`, over W6's four paths at
`docs/a39-fill-waves.md:1253-1256` and W7's two at `:1305-1310`.)

**The real coupling is a GATE coupling, not a write-set one, and the AC reached
for it and got the mechanism wrong.** W7's Group A requires `npm test` zero
failed and `npx tsc --noEmit --incremental false` silent
(`docs/a39-fill-waves.md:1314-1318`). Wave 1 turns roughly a dozen assertions
red before repairing them, and `npx tsc` has ONE caller under concurrency. So:
**wave 1 and W7's gate run must not overlap**, and wave 1 must be green before
W7 is attempted. That is the whole constraint. It is a scheduling rule, not a
reason to wait.

### 9.2 Wave 2 - Recording's two grading items

**Rows 3 and 4:** `GradingRecordingPanel` (`RecordingTab.tsx:857`, `recView === "grading"`)
and `SnapshotGradingPanel` (`:867`, `recView === "snapgrade"`).

**Write set (estimated, not derived - wave 2's own derivation is owed when its
brief is written):** `RecordingTab.tsx`, `recording-split.structure.test.ts`,
`manual-rail.ts`, `page.tsx`, `manual-rail.test.ts`, plus whatever the six
canaries in 4.2 force.

**It is a FROZEN-CANARY problem, not a size problem.** The AC priced it as
decomposition against `RecordingTab.tsx`'s 917 lines. Measured: 917 on both
counters, and `RecordingTab.tsx` is EXCLUDED from the repo-wide ceiling because
it is one of the two files `isCoveredByRecordingSplitCheck` names
(`src/file-size-ceiling.structure.test.ts:51-54`). Removing two strip entries
SHRINKS it. The real cost is the six assertions in 4.2, three of which are
frozen COUNTS (12 tabs, 11 tabpanels, 11 panel targets) that all move together.

**The file that is actually near the edge is `GradingRecordingPanel.tsx` at 977
on both counters, with 23 lines against `LIMIT = 1000`, and it IS checked** -
`src/app/components/grading-recording/` is not under
`src/app/components/recording/`, so `isCoveredByRecordingSplitCheck`
(`:56-62`) returns false. Wave 2 must not grow it. If re-parenting needs it to
take a prop, the 23 lines are the budget and an extraction is the alternative.

**Order reason:** wave 2 adds items to a container wave 1 creates, and reuses
wave 1's `INNER_NAV` entry and alias table. It cannot precede wave 1.

### 9.3 Wave 3 - Drafted grades

**Row 5:** `DraftedGradesTab` (`home/WorkflowsPanel.tsx:77`, `draftsView === "grades"`).

It sits in the **workflows** family, so absorbing it crosses the `toolsSection`
discriminant of `ToolsRailItem` (`tab-rails.ts:126-128`, confirmed at those
lines) - a different KIND of change from waves 1 and 2, which move views inside
the manual family. Feasibility is not established here; section 10 says so.

**Order reason:** it is the only wave whose type change is to a discriminated
union rather than to a member list, so it is last and it is the one that may
turn out not to be worth doing.

### 9.4 What is NOT trivially revertible

Named because the architect's checker asks for it (`docs/loop/seats.md:178-179`):

- **`ContentView` losing a member** is a change to a persisted-value contract.
  Reverting wave 1 after users have been on it leaves `ta-manual-view = "grading"`
  in their storage, which the reverted `isManualViewType` rejects, bouncing them
  to Build Courses. **The revert needs the alias table to survive it** - or the
  revert is itself a silent bounce.
- **`RETIRED_GRADING_POINTERS`** is the migration. Deleting it later re-breaks
  every old bookmark. It is permanent surface, not scaffolding.
- Everything else in wave 1 is a nav registration and reverts cleanly.
- No migration, no Supabase change, no change to a Storage path.

---

## 10. What I could not determine

Stated plainly rather than filled in.

1. **Anything a user sees, hears read aloud, focuses or reaches by keyboard.**
   `vitest` here is node-env and collects only `src/**/*.test.ts`; no component
   is rendered by any test in this repo. Every claim in sections 6.1, 8 hop 5,
   8 hop 6 and 8 hop 9-11 about what APPEARS is a reading claim. No proxy is
   proposed for any of them, and none of the instruments I1-I5 is offered as
   one.
2. **Whether `src/lib/lms-generation/selection-archive.test.ts` goes red when
   `ContentTab.tsx` changes.** The path scan found it reads that file as source
   text; I did not open its assertion. Filed as RES-ARCH-2 with the wave gate as
   its instrument, rather than guessed at.
3. **Whether rows 3 and 4 can be re-parented without decomposing
   `RecordingTab.tsx`.** I priced wave 2 as a canary problem and named the six
   assertions, but I did not attempt the re-parenting. The `active={active && recView === "grading"}`
   gating at `RecordingTab.tsx:857` ties those panels to the capture lifecycle,
   and whether that lifecycle can be reached from a different `manualView` is
   wave 2's own derivation.
4. **Whether wave 3 is feasible at all.** Crossing `ToolsRailItem`'s
   `toolsSection` discriminant may require the `DraftedGradesTab` surface to
   stop being a `draftsView` sub-view, which is a change to `WorkflowsPanel`'s
   own nav. Not established.
5. **The click-cost delta of the consolidation.** Measurable, not measured, and
   not estimated. It is the wave-3 user-experience seat's, which counts clicks
   twice (first use and repeat use) per `docs/loop/seats.md:191-194`.
6. **Whether "Grading tools" is the right accessible name for the inner nav.**
   It is my default, chosen to parallel "LMS views" and "Course build modes". The
   wave-3 accessibility seat owns the wording; I own only that the name exists,
   is distinct, and comes from the same table as the destinations.
7. **Whether the chip belongs at index 6.** See 2.4: a defaulted UX call, mine,
   not the owner's.

---

## 11. The leverage line: trigger FIRED, NO CLAIM, declined not omitted

`docs/loop/seats.md:70-75` owes a claim when the chunk builds or changes a
capability a user reaches, and states that on a refactor "there is no claim to
make; record that as the fired trigger and move on."

**This design adds no mechanism.** Every surface it touches - the grading run,
Repo Grades, the LMS destination - exists and is reachable today, measured by
the census in 3.1 and the destination enumeration the AC's check independently
re-derived. It moves registrations and adds a migration. The only advantage it
could honestly name is CLICK COST, which `docs/loop/leverage.md:66` lists among
the STRUCK classes: "Free to any feature with a UI at all ... it is not a
categorical advantage over a chat."

**So: trigger recorded, claim declined.** I am not defaulting the three-way call
at `leverage.md:111-123`; that clause governs a FEATURE with a thin claim, and
this is not a feature. The AC reached the same disposal and the check confirmed
all three of its citations; nothing in my design changes the inputs to it.

One temptation resisted and named: `RETIRED_GRADING_POINTERS` is a real
mechanism a chat has no analogue for. It is a MIGRATION, not leverage - it keeps
an existing capability reachable rather than making a new one possible. Claiming
it would be the failing shape `leverage.md:85-98` ("What a failing answer looks
like") exists to catch.

The CONCURRENCY claim (`leverage.md:42`, "NOT YET AN INSTANCE - a measured GAP",
owned by row A46) belongs to A46's own criteria. Importing it here would credit
a navigation change with an advantage it does not build.

---

## 12. Residual register

Each row names an owner, an instrument and the step that will measure it. A row
missing any of the three is a DELETION and would be called that
(`docs/loop/iteration-caps.md:167`). **None of these is a row in
`docs/BACKLOG.md` yet, because that file is not in my write set. Until the
backlog seat files them they DO NOT EXIST, and I am calling that plainly rather
than reporting success.**

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-ARCH-1 | The Grading chip's position in the Tools rail is MY default (index 6, where `repo-grades` sat), not an owner call. Moving it is one line in `MANUAL_VIEW_ORDER` plus one in the exact-list assertion. | wave-3 user-experience seat | the exact id list at `src/app/components/tabs/tab-rails.test.ts:54-65` | the wave-3 UX pass on the as-built diff |
| RES-ARCH-2 | `src/lib/lms-generation/selection-archive.test.ts` reads `ContentTab.tsx` as source text; I did not open its assertion, so whether removing the grading branch turns it red is undetermined. | wave-1 implementer | `npm run test:paths -- src/lib/lms-generation/selection-archive.test.ts` | the wave-1 gate, before the commit |
| RES-ARCH-3 | The popstate ladder at `useAppNavigation.ts:577-588` stays HAND-WRITTEN. I5 catches an omission but the construction that makes it unrepresentable (a derived view-to-setter loop) is declined here, because it changes the restore path for `buildView` and `contentView` as a side effect. | test-author, then a later chunk | I5 today; a derived loop plus a before/after snapshot of all three restores if it is ever built | the next chunk that adds a FOURTH inner navigation |
| RES-ARCH-4 | Whether Library > Files > Submissions should remain a second entry point to `CartridgeDropPanel`, or the Grading sub-tab should absorb it. Section 7 decides that wave 1 changes neither; it does not decide the long-run shape. | wave-3 user-experience seat | the destination enumeration, plus the `ta-cartridge-*` key set frozen in `componentStorageKeys.structure.test.ts` | the wave-3 UX pass |
| RES-ARCH-5 | `docs/BACKLOG.md:133` (row A40) carries an owner-verification path, "Tools > LMS > Grading, scroll to Submissions", that wave 1 DELETES as a destination. The row's navigation string becomes false. | backlog seat | `grep -an "scroll to Submissions" docs/BACKLOG.md` | the push that lands wave 1 |
| RES-ARCH-6 | One `instrumentsReconcile === false` result: `normalizeContentView` in `useAppNavigation.test.ts` (`code=7 cmt=4 str=4`). No membership call in this design depends on the comment/string split; the `codeOccurrences` half is what was used. | test-author | `src/tools/symbol-count/count.ts` re-run on that file | whenever that symbol's comment/string split decides anything |
| RES-ARCH-7 | `useAppNavigation.ts` is 638 lines and wave 1 adds a state block, a persist effect, two alias branches, a popstate branch and two dep-array entries. Estimated 25-40 lines. No ceiling risk (1000), but it is the file every future nav addition grows. | architect, next nav chunk | `wc -l` and `@(Get-Content).Count` after wave 1 | the wave-1 gate records the new number; an extraction is owed before it passes 800 |
| RES-ARCH-8 | `docs/loop/traps-spec.md:12-15` states `GradingRecordingPanel.tsx` at 964. Measured 977 on BOTH counters. The trap card's own instance is 13 lines stale, and the card is the authority other seats quote for the counter-disagreement rule. | whoever next edits that card | `wc -l` and `@(Get-Content).Count` on that path | the next loop-doc pass |
| RES-ARCH-9 | `docs/a39-fill-waves.md` cites `INCREMENTAL_ROUTE_ENABLED` at `incrementalRunPlan.ts:99`; measured `:104`. Inherited from the check (its RES-GRAD-4), still open, restated here so wave 2's brief does not lose it. | whoever next opens that plan | `grep -n "export const INCREMENTAL_ROUTE_ENABLED" src/app/components/grading/incrementalRunPlan.ts` | W7's brief |
| RES-ARCH-10 | `topLevelTabs.wiring.test.ts:430-447` slices a fixed 600 characters from the first `isFirstUrlSyncRef.current` in `useAppNavigation.ts`. A future insertion between that guard and its `replaceState` silently moves the assertion out of the window. Positional fragility, not a defect today. | test-author | that assertion, plus a length check on the sliced block | the next chunk that writes `useAppNavigation.ts`'s URL-sync effect |

**Closed rather than carried**, so the next session does not redo them: the
check's R3 (DECISION 18's wrong W6/W7 premise) is **already corrected in the
ledger** - see 1.4. The check's RES-GRAD-1 (`CartridgeDropPanel`'s double mount)
is **DECIDED in section 7**, not deferred. The check's R1 (AC9 pinning 617 as an
absolute) is **applied** in 9.1's pass-condition table.

---

## 13. Disposition

### 13.1 The check's six blockers

| Blocker | Class | Disposal in this pass |
|---|---|---|
| B1 | Hand-enumerated edit-point set presented as complete | **RELOCATED and discharged.** Section 3 derives the surface with two named instruments (2772-file symbol census, 1166-file source-text scan), and 3.4 lists ELEVEN missed edit points - the four RULING A named plus seven new (M5-M11). |
| B2 | Same class, asserting tests | **RELOCATED and discharged.** Section 4 derives 35 asserting-test entries across 13 files with a per-test canary-or-guard call. The AC named one test file. Wave 2's six frozen canaries are listed in 4.2. |
| B3 | Quantity not produced by the named instrument | **DISCHARGED.** Section 0 names the command for every quantity; 1.1 runs both counters on 21 files and reports agreement; 1.3 adopts the four corrections the check established; `GradingRecordingPanel` is 977 with its 23-line headroom priced in 9.2; RES-ARCH-8 files the stale trap card. |
| B4 | Check bound to an object that cannot carry it | **DISCHARGED by placing the construction.** The alias lives in `RETIRED_GRADING_POINTERS` (`manual-rail.ts`, a pure table) and is applied by `resolveStateFromDestinationId` and by `useAppNavigation.ts`'s `manualView` initializer - which has the EXACT precedent for it at `:161-164` (the `VIEW_KEY === "version-control"` migration, same key, same rewrite-and-return shape). That makes the destination-id and `repo-grades` pointers testable as pure functions (T3, T8, T30) and leaves only the storage-read half as a source-text claim (I5's file). `parseUrlState`'s independent-fields contract (`url-state.ts:313-322`) is not violated: no cross-field collapse happens inside it. |
| B5 | An assertion that cannot fail | **DISCHARGED by replacement.** AC8's fourth sub-assertion ("`getActiveDestinationId` never returns `lms-grading`") is DROPPED, not tightened - the check proved the analogous `course-intel` loop at `manual-rail.test.ts:352-357` is true today with the id fully present. It is replaced by T4, `validateLmsViewsCompleteness()` returning zero errors, which is a CONSTRUCTION that makes the leftover state unrepresentable: the function checks both directions (`:228-238`) so a destination without a member and a member without a destination each produce a named error. |
| B6 | Reachability not traced from the control to the code | **DISCHARGED.** Section 6 addresses each of the three silent failures with a prevention or a named instrument and a direction of failure; section 8 traces all eleven hops. **And 6.2 corrects the check**: an existing frozen oracle (`tab-rails.test.ts:288-337`) DOES see the URL param in three of five build outcomes, which changes the fix from "write a new instrument" to "extend the oracle AND add a directional round trip, because each alone is defeatable". |

### 13.2 The AC's twelve criteria, and what this design binds each to

Not a re-scoping - the criteria activity is closed. This is where each criterion
lands, so nothing the AC required is silently dropped.

| AC | Status | Bound to |
|---|---|---|
| AC1 (a chip labelled exactly `Grading`, once) | **KEPT, mostly ADOPTED** | `tab-rails.test.ts:92-100` (derived labels) and `:108` (uniqueness) already deliver the both-directions half. ONE new equality assertion is needed, not a new instrument family. |
| AC2 (the chip reaches the view and highlights for it) | **KEPT, and its under-specification resolved** | The round-trip is over `GRADING_VIEWS` with the fourth argument now named (5.3). New assertion in `manual-rail.test.ts`, in the shape of `:264-268`. |
| AC3 (the sub-tab renders, not merely registers) | **KEPT, ADOPTED not authored** | `topLevelTabs.wiring.test.ts:309-320` already is this test, already derived from `MANUAL_VIEW_ORDER` (T20, section 8 hop 4). **Write no new one.** |
| AC4 (inner nav items are exactly the wave's IN set) | **KEPT, with its weakness named** | A new `toEqual` on `getInnerDestinations("grading")`. The check is right that its oracle is a list the build declares, so it cannot detect an incomplete survey; that completeness question is the survey's and the check independently re-derived the survey as correct today. |
| AC5 (the inner selection survives a reload) | **KEPT, ADOPTED as an extension** | T26: one entry added to the existing hand `KEYS` list at `useAppNavigation.test.ts:151-155`, which already asserts declare-and-write-back for three sibling keys. Behavioural half is OW-A2. |
| AC6 (first load lands on the grading-run surface) | **KEPT; its stated reason WITHDRAWN** | `normalizeGradingView(null) === "run"` (5.1). The AC's reason cited a backlog row that wave 1 invalidates; that is RES-ARCH-5, not a reason. |
| AC7 (an old pointer arrives at the new place) | **KEPT and WIDENED from three inputs to four** | `RETIRED_GRADING_POINTERS` (5.5). The AC named three inputs, two of which were the same value; this design adds the `repo-grades` family (M10) and the `ta-active-tab` legacy value (M7). |
| AC8 (the old location is gone, completely) | **KEPT; its fourth sub-assertion WITHDRAWN** | See B5 above. The enforcer it protected (leftover detection) is carried by `validateLmsViewsCompleteness()` plus the `LMS_VIEW_PRESENCE` exhaustiveness check, both of which are constructions rather than assertions. |
| AC9 (this chunk does not write `GradingTab.tsx`) | **KEPT, with the check's R1 applied** | 9.1's gate. `git status --short` establishes the property; the two counters are a cross-check, not a bound pinned to 617. |
| AC10 (the `editsSurface="canvas"` exact set unchanged) | **KEPT, ADOPTED** | T31. Wave 1 creates no `.tsx` file, so it is satisfied by construction. |
| AC11 (the incremental run gets no nav item of its own) | **KEPT** | Wave 1's inner nav is exactly two items (AC4's `toEqual`), and `INCREMENTAL_ROUTE_ENABLED` is not flipped. DECISION 17. |
| AC12 (the repo's UI and byte standards) | **KEPT, with the check's R7 applied** | `npm run docs:gate`, `npm run lint`, and `npx tsc --noEmit --incremental false` (the flag, per R7). No emojis; the nav reuses `styles.manualSubnav` / `styles.lessonInnerTabs` / `styles.lessonInnerTab` (`ManualRail.tsx:44-56`) rather than introducing a pattern. |

---

## 14. Gates run on this document

**Run:** `npm run docs:gate`. Result in the hand-back report.

**NOT run:** every instrument in sections 4, 6, 8 and 9. My write set is one
document. `I1` through `I5` do not exist yet and I did not create them; T1-T35
were read at their cited lines but none was executed against a modified tree.
No file under `src/` was opened for writing, nothing was committed, nothing was
pushed. `git status --short` is reported in the hand-back.
