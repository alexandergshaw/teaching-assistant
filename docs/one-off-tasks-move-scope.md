# Scope / recon: ONE-OFF-TASKS-MOVE

Move the **One-Off Tasks** destination from its current TOP-LEVEL tab to a
**Courses-tab rail item**, a sibling of the Courses view and the two Tasks chips
(Term Setup, Daily / Weekly).

**Owner decision, 2026-10-06 (resolves the FORK 1 left open at first ship):**
"put the one-off tasks tab as a courses tab subtab - should be a sibling of
courses, term setup and daily / weekly." This decision is settled; this scope
only turns it into a precise touch-list. It does not reopen it.

**This is a placement/registration move, not a feature.** The component, the
hook, the model/mapper, the server actions and the DB table stay byte-for-byte
unchanged. No new user-reachable capability is created, so **no leverage claim
is owed** - see "Leverage trigger" at the end.

All line counts below name the command that produced them; every `file:line`
was opened.

---

## 1. The structure decision (the one real design choice)

The brief names two readings of "sibling of courses, term setup AND
daily/weekly":

- **(a)** a new `TasksView` chip beside term/recurring, rendered *under* the
  tasks section by `TasksTab`.
- **(b)** a new top-level `CoursesSection` beside `"courses"` and the tasks
  group, rendered by its own branch.

### RECOMMENDATION: option (b). Not genuinely ambiguous; here is why.

Read the Courses rail and its render branch:

- The Courses rail (`src/app/components/tabs/tab-rails.ts:76-86`,
  `COURSES_RAIL_ITEMS`) has two kinds of item, discriminated on
  `CoursesSection` (`:66` `type CoursesSection = "courses" | "tasks"`): the bare
  `"courses"` item (`section: "courses"`) and the `tasks:${TasksView}` items
  (`section: "tasks"`, one per `TASKS_VIEW_ORDER` member).
- page.tsx renders the Courses tab as **rail, then one branch per section**:
  `coursesSection === "courses"` -> `<CoursesTab .../>`
  (`src/app/page.tsx:505-527`) and `coursesSection === "tasks"` ->
  `<TasksTab view={tasksView} />` (`src/app/page.tsx:533`).
- `TASKS_VIEW_LABELS` are `term: "Term Setup"`, `recurring: "Daily / Weekly"`
  (`src/app/components/tabs/tab-sections.ts:119-123`), and **`TasksTab` renders
  those two views only** (it owns its own `TabShell`,
  `src/app/components/TasksTab.tsx:103,593-798`).

The owner lists **the Courses view itself** (a `section`, not a `TasksView`)
*and* the two Tasks chips as the siblings. The common denominator that makes
One-Off Tasks a peer of **all three** is being a **rail chip**, and the rail
already holds chips from two different sections. Option (a) would make One-Off
Tasks a child of the Tasks grouping (rendered by `TasksTab`, a sibling of
term/recurring only), which does **not** make it a peer of `"courses"`. Option
(a) also drags `TasksView`, `TasksTab`, the retired `?tab=tasks` deep-link
semantics and `normalizeTasksView` into a move that touches none of them today.

Option (b) makes One-Off Tasks structurally identical to how `"courses"`
already works: its own `CoursesSection`, its own rail chip, its own render
branch - a true peer of `"courses"`, `tasks:term` and `tasks:recurring`. That
is the structure the owner described.

### Naming (architect's choice, following the `"courses"` precedent)

- New `CoursesSection` value: **`"oneoff"`** (single lowercase token, matching
  `"courses"`/`"tasks"`).
- New rail-item id: **`"oneoff"`** - id equals section, exactly as the
  `"courses"` item's id equals its section (`tab-rails.ts:77`). The tasks items
  are prefixed (`tasks:${view}`) only because they carry a sub-view; a
  section-with-no-sub-view uses the bare section string as its id. The id never
  reaches the URL (guarded by `tab-rails.test.ts:368-383`), so there is no
  contract leak from id==value.
- Rail label: **`"One-Off Tasks"`** (the existing `TAB_LABELS["one-off-tasks"]`
  wording, `tab-sections.ts:43`).

### Sub-decision: the old top-level value becomes a RETIRED ALIAS (recommended, and load-bearing)

This is the one judgment call a checker should scrutinise. **It is not a
speculative-bookmark concern; it protects the owner's own live persisted
state.**

`activeTab` is persisted to `localStorage["ta-active-tab"]`
(`src/app/components/home/useAppNavigation.ts:557`) and restored on load via
`resolveTabDestination(source)` (`useAppNavigation.ts:97-98,123`). The owner
requested this move while using the feature, so their stored `ta-active-tab` is
almost certainly `"one-off-tasks"` right now. If `"one-off-tasks"` is simply
deleted from the tab set with no alias, `resolveTabDestination("one-off-tasks")`
falls through to `DEFAULT_DESTINATION` (tab `"manual"`,
`url-state.ts:124`) - the owner opens the app after the change that was supposed
to *relocate* One-Off Tasks and instead lands on Tools, with One-Off Tasks
apparently gone. That is exactly the "silent bounce" the whole D25b retired-
alias apparatus exists to prevent (`tab-sections.ts:149-161`).

Adding `"one-off-tasks"` to `RETIRED_TAB_DESTINATIONS` ->
`{tab: "courses", coursesSection: "oneoff", ...}` makes the stored value (and
any `?tab=one-off-tasks` URL) land on Courses with One-Off Tasks showing, and
the first URL sync rewrites the address bar to the canonical
`?tab=courses&coursesSection=oneoff` (`useAppNavigation.ts:646-675`,
`buildUrlSearch` `url-state.ts:455-462`). The coursesSection initializer already
honours an alias-named section over the persisted key
(`useAppNavigation.ts:134-144`), so the migration is self-healing on first load.

**Cost of the alias:** one extra retired-value canary bump
(`tab-sections.test.ts:113`, `topLevelTabs.wiring.test.ts:384-457`). That is the
entire cost, and the generic retired-value loops in both tests then cover it for
free. The alternative (no alias) is cheaper by one literal and ships the owner a
disappearing feature. **Recommend the alias.**

> If the checker disputes the alias, the fork is: *ship the alias* (owner's
> stored tab migrates to the new home) **or** *omit it* (owner's stored
> `ta-active-tab="one-off-tasks"` bounces to Tools once, self-heals on the next
> tab click). Everything else in this scope is identical either way. The scope
> SHIPS WITH THE ALIAS unless the checker shows the owner's persisted value
> cannot be `"one-off-tasks"`.

---

## 2. Current state, confirmed against the tree

One-Off Tasks shipped as a top-level tab in W1 (commit `3b20328e`); W3 wired the
full UI. Verified now:

| Fact | Citation (opened) |
|---|---|
| `ActiveTab` union has `"one-off-tasks"` (5th) | `tab-sections.ts:31` |
| `TAB_ORDER` has `"one-off-tasks"` (5th) | `tab-sections.ts:36` |
| `TAB_LABELS["one-off-tasks"] = "One-Off Tasks"` | `tab-sections.ts:43` |
| Top-level render branch | `page.tsx:849-853` (`{activeTab === "one-off-tasks" && (<TabShell><OneOffTasksTab /></TabShell>)}`) |
| Import | `page.tsx:28` (`import OneOffTasksTab from "./components/one-off-tasks/OneOffTasksTab"`) |
| Component takes **no props**, owns its hook + institution registry | `OneOffTasksTab.tsx:16-30` (`useOneOffTasks()`, `useInstitutions()`); renders a bare `<div className={styles.stack}>`, **no self-TabShell** |
| Canary pinning TAB_ORDER==5 | `tab-sections.test.ts:31`; `topLevelTabs.wiring.test.ts:145-146` |

**The top-level tab was stateless**: it carries no section/view param, no
`ta-` key of its own, and `url-state.ts` touches it only through
`isActiveTab`/`TAB_ORDER` (derived, `url-state.ts:99-103`). Confirmed nothing
else references the `"one-off-tasks"` **ActiveTab value** (no event listener, no
cross-nav, no rail): `Select-String -Path (Get-ChildItem -Recurse src -Include
*.ts,*.tsx) -Pattern 'one-off-tasks'` returns only (i) `tab-sections.ts` x3,
(ii) the two canaries, (iii) `page.tsx:28,849,851`, and (iv) the component /
data-layer directory `one-off-tasks/...` and `one_off_tasks` table (all
unrelated to the tab VALUE). The component dir name and the DB table are NOT
touched by this move.

`OneOffTasksTab` is imported **only** by `page.tsx` (command: `Select-String
... -Pattern 'one-off-tasks/OneOffTasksTab'` -> `src/app/page.tsx` only).

---

## 3. Production touch-list

### REMOVE the top-level registration

1. `tab-sections.ts:31` - `ActiveTab`: drop `| "one-off-tasks"` ->
   `"courses" | "manual" | "files" | "course-intel"`.
2. `tab-sections.ts:36` - `TAB_ORDER`: drop `"one-off-tasks"` ->
   `["courses", "manual", "files", "course-intel"]`.
3. `tab-sections.ts:38-44` - `TAB_LABELS`: drop the `"one-off-tasks"` entry
   (tsc forces this once `ActiveTab` shrinks - `TAB_LABELS` is
   `Record<ActiveTab,string>`).
4. `page.tsx:847-853` - delete the top-level render branch (and its comment at
   `:847-848`). The `import` at `:28` STAYS (now consumed in the Courses
   branch).

### ADD the Courses-tab rail item (option b)

5. `tab-sections.ts:66` - `CoursesSection`: add `| "oneoff"` ->
   `"courses" | "tasks" | "oneoff"`.
6. `tab-sections.ts:70` - `COURSES_SECTION_ORDER`: append `"oneoff"` ->
   `["courses", "tasks", "oneoff"]`.
7. `tab-sections.ts:86-89` - `COURSES_SECTION_LABELS`: add `oneoff: "One-Off
   Tasks"` (tsc forces this - it is `Record<CoursesSection,string>`, iterated by
   `tab-sections.test.ts:54`).
8. `tab-rails.ts:58` - `CoursesRailItemId`: add `"oneoff"` ->
   `"courses" | "oneoff" | \`tasks:${TasksView}\``.
9. `tab-rails.ts:69-71` - `CoursesRailItem` union: add
   `| { id: "oneoff"; label: string; section: "oneoff" }`.
10. `tab-rails.ts:76-86` - `COURSES_RAIL_ITEMS`: append the oneoff item after
    the tasks spread:
    `{ id: "oneoff", label: COURSES_SECTION_LABELS.oneoff, section: "oneoff" }`.
    (Order: `courses`, `tasks:term`, `tasks:recurring`, `oneoff`.)
11. `tab-rails.ts:95-97` - `coursesRailItemFor`: add the `"oneoff"` arm ->
    `section === "tasks" ? tasksRailItemId(tasksView) : section === "oneoff" ? "oneoff" : "courses"`.
12. `tab-rails.ts:103-112` - `coursesStateFromRailItem`: the `COURSES_RAIL_BY_ID`
    lookup already resolves the new item; add the branch so an `item.section ===
    "oneoff"` returns `{ coursesSection: "oneoff", tasksView: currentTasksView }`
    (leave `tasksView` untouched, matching the `"courses"` arm at `:110`).
13. `page.tsx` - inside the `activeTab === "courses"` branch, as a third
    sibling of the two section renders (after `:533`, before the `</>` at
    `:534`), add:
    `{coursesSection === "oneoff" && (<TabShell><OneOffTasksTab /></TabShell>)}`.
    **Keep the `TabShell` wrapper** - `OneOffTasksTab` provides none of its own
    (unlike `TasksTab`), so wrapping it in page.tsx preserves its exact W3
    presentation and honours "component unchanged." `TabShell` is already
    imported in page.tsx (used by the `course-intel` branch, `:842`).

### ADD the retired alias (section 1 sub-decision)

14. `tab-sections.ts:162` - `RetiredTabValue`: add `| "one-off-tasks"`.
15. `tab-sections.ts:164-186` - `RETIRED_TAB_DESTINATIONS`: add
    ```
    "one-off-tasks": {
      tab: "courses",
      coursesSection: "oneoff",
      toolsSection: DEFAULT_TOOLS_SECTION,
      librarySection: DEFAULT_LIBRARY_SECTION,
    },
    ```
    `RETIRED_TAB_VALUE_SET` and `isRetiredTabValue` derive from the keys
    (`:188-192`), so no further edit there.

### CONFIRMED: no production edit needed in url-state.ts or useAppNavigation.ts

Both derive everything they need; opened and traced:

- `url-state.ts`: `COURSES_SECTION_VALUES` derives from `COURSES_SECTION_ORDER`
  (`:141`), so `isCoursesSection`/`normalizeCoursesSection` accept `"oneoff"`
  automatically. `buildUrlSearch` emits `coursesSection` whenever it differs
  from `DEFAULT_COURSES_SECTION` and gates `tasksView` on
  `coursesSection === "tasks"` (`:455-462`), so `"oneoff"` emits
  `?tab=courses&coursesSection=oneoff` and no stray `tasksView`. `parseUrlState`
  validates via `isCoursesSection` (`:412`). `resolveTabDestination` consults
  `isRetiredTabValue` (`:123`), so the new alias is handled by the data change
  alone.
- `useAppNavigation.ts`: the `coursesSection` initializer (`:134-144`) and the
  `activeTab` initializer (`:115-124`) both route through
  `resolveTabDestination`/`isCoursesSection`; the alias and the new section flow
  through unchanged. `COURSES_SECTION_KEY = "ta-courses-section"` (`:70`) already
  persists the new value via the effect at `:584-586`.

If a checker finds a symbol in either file that must change, that is a finding
to surface - the claim here is derived-and-traced, not assumed.

---

## 4. Canary enumeration - EVERY tripped canary, each bumped in the SAME commit

Per `gate-must-include-directory-canary`: removing a top-level tab and adding a
rail chip trips multiple frozen canaries. Each MUST be in the wave gate AND
bumped in the same commit. Frozen literals were found with:
`Select-String -Path src/app/components/tabs/*.test.ts,src/app/url-state*.test.ts
-Pattern 'TAB_ORDER|TASKS_VIEW_ORDER|COURSES_RAIL_ITEMS|RETIRED_TAB_DESTINATIONS|coursesSection'`.

| # | Canary (file:line) | What it pins now | Required change |
|---|---|---|---|
| C1 | `tab-sections.test.ts:30-32` | `TAB_ORDER` == 5-member list incl. `"one-off-tasks"` | -> 4 members, drop `"one-off-tasks"`; describe/it wording "five"->"four" (`:29,30`) |
| C2 | `tab-sections.test.ts:113` | retired keys sorted == `["knowledge","tasks","workflows"]` | -> `["knowledge","one-off-tasks","tasks","workflows"]` |
| C3 | `tab-sections.test.ts:131-142` | per-retired-value destination asserts | ADD explicit: `RETIRED_TAB_DESTINATIONS["one-off-tasks"].tab === "courses"` and `.coursesSection === "oneoff"` |
| C4 | `tab-sections.test.ts:53-56` | every `COURSES_SECTION_ORDER` member has a truthy label | AUTO-covers once `"oneoff"` + label added; no literal to bump, but the gate must run it |
| C5 | `topLevelTabs.wiring.test.ts:145` | `TAB_ORDER` == 5-member list | -> 4 members |
| C6 | `topLevelTabs.wiring.test.ts:146` | `TAB_LABELS["one-off-tasks"] === "One-Off Tasks"` | DELETE (tsc error once `ActiveTab` shrinks); fix describe/it "five"->"four" (`:132,144`) |
| C7 | `topLevelTabs.wiring.test.ts:239-254` | Courses branch renders `coursesSection === "courses"` and `=== "tasks"` | ADD a new `it` asserting `branchSlice(source,"courses")` contains `coursesSection === "oneoff"` AND renders `OneOffTasksTab` - **this is the reachability canary for the moved pane (see section 5)** |
| C8 | `topLevelTabs.wiring.test.ts:180-196` | each `TAB_ORDER` member has a top-level `{activeTab === "<tab>" &&` branch | AUTO-shrinks to 4; ADD `expect(source).not.toContain('{activeTab === "one-off-tasks"')` so a stray top-level branch cannot survive |
| C9 | `topLevelTabs.wiring.test.ts:400-416` | each retired link lands on the right CHIP | ADD: `parseUrlState("?tab=one-off-tasks")` -> `tab==="courses"` and `coursesRailItemFor(parsed.coursesSection, parsed.tasksView) === "oneoff"` |
| C10 | `tab-rails.test.ts:191-193` | `COURSES_RAIL_ITEMS` ids == `["courses","tasks:term","tasks:recurring"]` | -> append `"oneoff"` |
| C11 | `tab-rails.test.ts:202` | length == `1 + TASKS_VIEW_ORDER.length` | -> `2 + TASKS_VIEW_ORDER.length` |
| C12 | `tab-rails.test.ts:205-210` | chip labels (`courses`, `tasks:term`, `tasks:recurring`) | ADD `byId.get("oneoff") === "One-Off Tasks"` |
| C13 | `tab-rails.test.ts:212-215` | `{sections}` set == `COURSES_SECTION_ORDER` | AUTO-covers: proves the new section has a chip once both updated; gate must run it |
| C14 | `tab-rails.test.ts:217-220, 245-250, 252-255` | no dup labels; round-trip; highlight | AUTO-cover once production handles `"oneoff"` (round-trip exercises `coursesStateFromRailItem`/`coursesRailItemFor` over every item); gate must run them |
| C15 | `url-state.test.ts` (restorability) | - no `"oneoff"` assertion today | ADD (REQUIRED): `buildUrlSearch({...DEFAULT_STATE, tab:"courses", coursesSection:"oneoff"}) === "?tab=courses&coursesSection=oneoff"` and `parseUrlState(that).coursesSection === "oneoff"` - the restorability instrument |

**Not tripped (verified, do not touch):**
- `tab-rails.test.ts:298-349` `EXPECTED_PARAM_NAMES` - adding a coursesSection
  *value* adds no *param name*; `coursesSection` is already emitted. No bump.
- `url-state.test.ts` existing coursesSection asserts (`:208-211,236-249,
  393-442,559-611`) and `url-state.announcements.test.ts:12` - all use specific
  values (`"courses"`/`"tasks"`) or a fixture; a new enum member breaks none.
  `isCoursesSection` tests assert `"courses"/"tasks"->true`, `"nope"->false`
  (`:236-238`) - no `"oneoff"->false` claim to break.
- `useAppNavigation.test.ts:102,129` - pin `COURSES_SECTION_KEY` string and the
  `isCoursesSection(saved)` wiring; both unchanged.
- `src/lib/module-graph/runtime-import-graph.test.ts`,
  `src/lib/recording-launch.test.ts` - read `page.tsx` as source text (command:
  `Select-String ... -Pattern '"page\.tsx"'`), but neither references
  `one-off-tasks`, imports, or recording changed by this move. Expected no-ops;
  **gated anyway** because they read an edited file as source text.

---

## 5. Reachability trace (control -> code), the thing that must not ship dead

Per `verify-reachability-not-just-correctness` / "the surface is a layer". Each
hop:

1. **Rail chip visible.** Courses rail is `COURSES_RAIL_ITEMS.map(...)`
   (`page.tsx:356` builds `coursesRailOptions`, rendered at `:498-503`). Adding
   the oneoff item (touch #10) puts the chip in the rail. Pinned: C10-C13.
2. **Click writes state.** `handleCoursesRailChange` (`page.tsx:389-392`) ->
   `coursesStateFromRailItem(id, coursesSection, tasksView)` -> for `"oneoff"`
   returns `{coursesSection:"oneoff", ...}` (touch #12) -> `setCoursesSection("oneoff")`.
   Handler UNCHANGED. Pinned: C14 round-trip.
3. **Highlight reflects state.** `coursesRailItemFor(coursesSection, tasksView)`
   (`page.tsx:501`) -> `"oneoff"` for section `"oneoff"` (touch #11). Signature
   UNCHANGED, so `topLevelTabs.wiring.test.ts:364` still holds. Pinned: C14.
4. **Pane renders.** `coursesSection === "oneoff" && <TabShell><OneOffTasksTab/></TabShell>`
   (touch #13). **Pinned by C7** - the single most important new canary; without
   it the chip highlights and the pane is blank with every other gate green
   (the exact failure this repo has shipped three times,
   `topLevelTabs.wiring.test.ts:40-43`).
5. **Restorable via URL.** `buildUrlSearch` emits
   `?tab=courses&coursesSection=oneoff`; `parseUrlState` reads it back
   (`url-state.ts:412,455-462`). Pinned: C15.
6. **Old persisted value migrates.** `resolveTabDestination("one-off-tasks")`
   (touch #15) -> Courses/oneoff; initializer honours it
   (`useAppNavigation.ts:134-144`). Pinned: C3, C9.

**Machine-checkable vs owner-walk (nothing renders here):** hops 1-6 are all
source-text / pure-function pins (C7 proves the render *branch exists*, not that
it paints). What no test here can prove - that the pane actually paints the task
list, that the chip reads correctly, that `TabShell` spacing looks right - is
the owner walk (residual R1).

---

## 6. Acceptance criteria

Each names the object, the instrument, and the direction of failure. "Nothing
renders here," so every criterion is a source-text or pure-function pin; the
felt result is R1.

- **AC1 - top-level registration gone.** Object: `TAB_ORDER` / `ActiveTab` /
  `TAB_LABELS`. Instrument: `tab-sections.test.ts:31` (bumped to 4) + `tsc`
  (TAB_LABELS key). FAIL: RED if `"one-off-tasks"` appears in `TAB_ORDER`.
- **AC2 - top-level render branch gone.** Object: `page.tsx` source. Instrument:
  new assertion C8 (`not.toContain('{activeTab === "one-off-tasks"')`). FAIL:
  RED if the top-level branch remains.
- **AC3 - new section registered.** Object: `COURSES_SECTION_ORDER` +
  `COURSES_SECTION_LABELS`. Instrument: `tab-sections.test.ts:53-56` (C4),
  `tab-rails.test.ts:212-215` (C13). FAIL: RED if `"oneoff"` missing from order
  or label.
- **AC4 - rail chip present.** Object: `COURSES_RAIL_ITEMS`. Instrument:
  `tab-rails.test.ts:191-193,202` (C10,C11). FAIL: RED if the `"oneoff"` chip is
  absent or the length is wrong.
- **AC5 - pane reachable by click.** Object: the Courses branch slice of
  `page.tsx`. Instrument: new C7. FAIL: RED if `coursesSection === "oneoff"`
  does not render `OneOffTasksTab` in that slice.
- **AC6 - restorable via URL.** Object: `buildUrlSearch`/`parseUrlState`
  round-trip at `coursesSection:"oneoff"`. Instrument: new C15. FAIL: RED if the
  round-trip loses `"oneoff"` or emits a stray param.
- **AC7 - old value migrates (ships with the alias).** Object:
  `resolveTabDestination("one-off-tasks")`. Instrument: new C3 + C9. FAIL: RED
  if it does not resolve to `{tab:"courses", coursesSection:"oneoff"}`.
- **AC8 - rail state round-trips.** Object: `coursesStateFromRailItem` <->
  `coursesRailItemFor` over the `"oneoff"` item. Instrument:
  `tab-rails.test.ts:245-250` (C14). FAIL: RED if the chip does not round-trip.
- **AC9 - no file over the ceiling.** Object: all of `src/`. Instrument:
  `src/file-size-ceiling.structure.test.ts` (LIMIT 1000). Baseline:
  `@(Get-Content src/app/page.tsx).Count` = **890** (2026-10-06); net change
  of the move is roughly -4 lines (remove ~7 top-level, add ~3 in-branch), so
  page.tsx stays well under 1000. FAIL: RED if any `src/` file exceeds 1000.

---

## 7. Wave plan

**ONE wave.** It is a placement move over a tightly-coupled nav cluster
(`tab-sections.ts` -> `tab-rails.ts` -> `page.tsx`, with `url-state.ts` /
`useAppNavigation.ts` deriving); splitting it would ship an intermediate state
that fails its own canaries. Independently pushable. All production + canary
edits land in **one commit** (canary discipline requires the frozen-list bumps
in the same commit as the change that moves them).

Write set (every path the wave touches):
- `src/app/components/tabs/tab-sections.ts`
- `src/app/components/tabs/tab-rails.ts`
- `src/app/page.tsx`
- `src/app/components/tabs/tab-sections.test.ts`
- `src/app/components/tabs/tab-rails.test.ts`
- `src/app/components/tabs/topLevelTabs.wiring.test.ts`
- `src/app/url-state.test.ts`

### Wave gate (PowerShell; run from repo root)

```
npx tsc --noEmit
npm run lint      # exit 0, no NEW warning in the files this wave writes
npm run test:paths -- `
  src/app/components/tabs/tab-sections.test.ts `
  src/app/components/tabs/tab-rails.test.ts `
  src/app/components/tabs/topLevelTabs.wiring.test.ts `
  src/app/url-state.test.ts `
  src/app/url-state.announcements.test.ts `
  src/app/components/home/useAppNavigation.test.ts `
  src/lib/module-graph/runtime-import-graph.test.ts `
  src/lib/recording-launch.test.ts `
  src/file-size-ceiling.structure.test.ts
```

Then the tree gate (`wave-gate: git status`): `git status --short` against the
write set above, and confirm no `.claude/worktrees` copy was edited
(`stale-worktree-shadows-glob`).

Notes on the gate:
- `test:paths` (one path per arg), never a raw multi-path `vitest`/`npm test`,
  which silently drops unmatched args (`test-paths-wrapper`,
  `this-repo.md:52-66`).
- `file-size-ceiling.structure.test.ts` is included **unconditionally**
  (`this-repo.md:42-49`).
- `url-state.announcements.test.ts`, `useAppNavigation.test.ts`,
  `runtime-import-graph.test.ts`, `recording-launch.test.ts` are the
  derive-consumers / source-text consumers of the edited files - expected
  no-ops, gated because they read or type-depend on what changed.
- Push gate per `push-without-full-build`: lint + tsc + build compile-line
  check (`(check-mark) Compiled successfully`), skip the prerender tail.

### Shared-file serialization

This item is disjoint from the two courses-table recons (column search; load
speed) **except `src/app/page.tsx`**. If either of those also edits `page.tsx`,
the builds touching it MUST serialize (`no-git-stash-under-concurrency`,
`wave-gate: git status`): one agent's `page.tsx` write at a time, each gated by
`git status --short` against its own explicit list. This item's `page.tsx` edit
is small and localized (delete `:847-853`; insert one line after `:533`), so it
is cheap to land first or last, but it must not run concurrently with another
`page.tsx` writer.

---

## 8. `owns` closure

Files this wave edits, PLUS every file that reads an edited file as source text
or imports a changed symbol. Derived with (output pasted below):

```
Select-String -Path (Get-ChildItem -Recurse src -Include *.ts,*.tsx) `
  -Pattern '"page\.tsx"|from "\./tab-sections"|from "\./tab-rails"|components/tabs/tab-sections|components/tabs/tab-rails' -List
```

- **Edited (write set):** `tab-sections.ts`, `tab-rails.ts`, `page.tsx`,
  `tab-sections.test.ts`, `tab-rails.test.ts`, `topLevelTabs.wiring.test.ts`,
  `url-state.test.ts`.
- **Reads `page.tsx` as source text** (`-Pattern '"page\.tsx"'`):
  `src/app/components/tabs/topLevelTabs.wiring.test.ts` (edited),
  `src/lib/module-graph/runtime-import-graph.test.ts`,
  `src/lib/recording-launch.test.ts`.
- **Imports `tab-sections` / `tab-rails`** (type-depend on the shrunk
  `ActiveTab` / widened `CoursesSection`):
  `src/app/components/home/useAppNavigation.ts`,
  `src/app/components/home/WorkflowsPanel.tsx`,
  `src/app/components/manual/manual-rail.ts`,
  `src/app/components/manual/ManualRail.tsx`, `src/app/url-state.ts`,
  `src/app/url-state.test.ts` (edited), plus the three `tabs/*.test.ts` (edited).
  None reference the removed `"one-off-tasks"` ActiveTab value (verified,
  section 2), so `tsc` is the instrument that would catch any type break.
- **Always, unconditionally:** `src/file-size-ceiling.structure.test.ts`
  (walks all of `src/`).

Every member of this closure not in the write set is covered by `tsc` and/or is
in the wave gate (section 7).

---

## 9. Residual register

Each entry names an owner, an instrument, and the step that measures it. A
residual missing any of the three is a deletion; none here is.

- **R1 - Felt navigation walk (OWNER-ONLY).** Owner: repo owner. Instrument:
  manual browser walk (no component renders under vitest, `this-repo.md:134`).
  Step: after push, owner clicks the Courses tab, confirms a fourth rail chip
  "One-Off Tasks" sits beside Courses / Term Setup / Daily / Weekly, selects it,
  and confirms the task list paints with correct `TabShell` spacing and no
  layout regression versus its old top-level form. Also confirm reloading on
  that chip returns to it (`?tab=courses&coursesSection=oneoff`), and that a
  session last left on the old top-level tab opens on Courses/One-Off Tasks.
  **This is the only part of the move that is not machine-checkable.** Must be
  filed in `docs/BACKLOG.md` as owner-only, or it does not exist.
- **R2 - Rail-chip order / grouping (OWNER, optional).** Owner: repo owner.
  Instrument: owner judgement on the walk (R1). Step: the scope places One-Off
  Tasks LAST in the Courses rail (`courses, Term Setup, Daily / Weekly, One-Off
  Tasks`). If the owner wants it elsewhere in the order, that is a one-literal
  change to `COURSES_RAIL_ITEMS` (touch #10) and C10's frozen list, not a
  re-design. File only if the owner raises it.

No other residual. The localStorage migration is **not** a residual - it is
machine-checked by C3/C9 (AC7).

---

## 10. Leverage trigger

`docs/loop/leverage.md` / `DEV_LOOP.md` "The loop / Criteria": a leverage claim
is owed only when the chunk "builds or changes a capability a user reaches - not
a bug fix, a refactor, a doc correction or an owner verification." **Fired
trigger: this is a RELOCATION / navigation refactor.** The One-Off Tasks
capability (its CORPUS-shaped persisted per-college task list) is unchanged -
the component, hook, model/mapper, server actions and `one_off_tasks` table are
not touched. The feature's own leverage was settled when it shipped
(`docs/one-off-tasks-scope.md`). **No leverage claim is owed here, and none is
made.**

---

## 11. Two-rounds note

The owner decision (section 1) settles the only product fork. The remaining
choices (section vs tasksView; the retired alias; naming) are architecture calls
made and recommended here with their rationale and cost. The alias is the one
call a checker should press on; it ships unless the checker disproves the
owner's persisted-value premise. Everything else is mechanical against the cited
tree.
