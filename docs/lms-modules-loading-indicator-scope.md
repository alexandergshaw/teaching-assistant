# LMS modules view: loading indicator - UX + scoping pass

Author: loop-seat (read-only investigation + UX/scope pass), 2026-10-12.
Tree anchor: HEAD `8c3b1d30` (`git rev-parse --short HEAD`); `git status --short`
over `src/app/components/ContentTab.tsx src/app/components/content-tab
src/app/page.module.css` printed nothing at authoring time, so every `file:line`
below is a CLEAN-tree line. No production file was edited to produce this
document. Not yet adversarially checked.

Owner request, verbatim: "should have a loading indicator on the lms modules
view".

Consumer: the AC / architect / implementer chain for this item. Sections 1-3
are findings, 4 is the minimal change, 5-6 UX and accessibility reading claims,
7 write set, 8 acceptance criteria, 9 pins and sabotage, 10 forks and
residuals.

---

## 0. The headline: the premise is half wrong, and the half that is right is a dead prop

The request assumes the modules view shows nothing while it fetches. Reading
the tree, that is FALSE for the path the owner most likely means and TRUE for a
different path the owner probably also hit:

1. **Select / restore path - an indicator ALREADY EXISTS.** Picking a course
   (or the mount-time auto-restore of the remembered course) sets
   `loadState.status = "loading"` and ContentTab renders the app's canonical
   spinner block (`src/app/components/ContentTab.tsx:751-758`: `styles.loadingState`
   + `styles.spinner` + `styles.loadingTitle`, text "Loading course content...",
   `role="status" aria-live="polite"`). Do not build a second one.
2. **Reload path (Refresh button, and every post-action reload) - NO indicator
   at all.** `reload()` (`ContentTab.tsx:518-521`) calls
   `loadContent(selection, true)` - the SILENT mode. Silent mode deliberately
   never sets `loadState` (`:336`, `if (!silent) setLoadState(...)`), so
   `loadState.status` stays `"idle"` for the whole Canvas round trip. The list
   stays on screen, unchanged, for the seconds Canvas takes, then swaps. That
   is exactly "looks frozen".
3. **The Refresh button's own in-flight state is DEAD CODE.**
   `ModulesHeaderBar.tsx:239,242` renders `disabled={busy || refreshing}` and the
   label `{refreshing ? "Refreshing..." : "Refresh"}`. `refreshing` arrives from
   `ContentTab.tsx:812` as `refreshing={loadState.status === "loading"}`. But
   ModulesView is only mounted when `loaded` is true (`:770`, `!loaded ? null :
   view === "modules"`), and `loaded` requires `loadState.status === "idle"`
   (`:561-567`). `loadState.status === "loading"` and "ModulesView is mounted"
   are therefore MUTUALLY EXCLUSIVE: the prop is false in every render in which
   it is observable. The identical pattern on the non-modules views
   (`ContentTab.tsx:715` `disabled={busy || loadState.status === "loading"}` and
   `:718` label) sits inside `courseTab && view !== "modules" && loaded` (`:667`),
   so it is dead for the same reason.

Consequence for the item: the work is NOT "add a spinner to the modules view".
It is "give the silent reload an in-flight signal and wire it into the Refresh
control that was always meant to show one". The select/restore indicator needs
no change (one latent defect on that path is filed in section 3).

**What I could not determine:** which of the two paths the owner was looking at.
No component renders under vitest and the app cannot be driven here without
`.env` (`docs/loop/this-repo.md` section 6). If the owner saw no spinner on the
SELECT path, reading cannot explain it and an owner walk is needed - recorded as
R-1 in section 10. I proceed on the reading that the reload path is the gap,
recorded as MY reading, not an owner ruling.

---

## 1. The component and the calls (located from the tree)

| Fact | Evidence (opened) |
|---|---|
| "LMS modules view" = `ContentTab` with `view === "modules"`, mounted from `src/app/page.tsx:643-646` inside `manualView === "content"` | `Read page.tsx 630-660` |
| Orchestrator holding the fetch + state: `src/app/components/ContentTab.tsx` (887 lines) | `@(Get-Content src/app/components/ContentTab.tsx).Count` = 887 |
| The list renderer: `src/app/components/content-tab/ModulesView.tsx` (924 lines), mounted only when `loaded` | `@(Get-Content ...ModulesView.tsx).Count` = 924 |
| Its empty state "This course has no modules yet." | `ModulesView.tsx:781` |
| The Refresh control: `src/app/components/content-tab/modules/ModulesHeaderBar.tsx` (570 lines), button at `:235-243` | `@(Get-Content ...ModulesHeaderBar.tsx).Count` = 570 |
| The async calls: live = `listCourseContentAction(sel.courseUrl, activeInstitution)` (`ContentTab.tsx:367` in `loadContent`, `:463` in the mount effect); export = `readExportCourseContentById(supabase, sel.courseId)` (`:341`, `:434`); live-failure recovery = `tryExportFallbackForFailedLiveRead` (`:376`, `:470`) | `Read ContentTab.tsx 334-502` |
| Diagnostics name for these: operation `load_course_content`, surface `lms-content`, described in the coverage text as "loading a course's modules and pages" | `src/lib/session-diagnostic-log.ts:94-95`; `contentDiagnosticLog.ts:81-83` |

`loadContent` call sites (`grep -n "loadContent(" src/app/components/ContentTab.tsx`):
`:508` and `:515` (select, non-silent), `:520` (`reload`, SILENT). `reload` is
threaded to ModulesView (`ModulesView.tsx:57,105`) and from there into the
hooks; `grep -rn "\breload\b"` over `src/app/components/content-tab` returns 113
line hits across 41 non-test files, so essentially every write action in the
modules view ends in a silent reload. The indicator therefore covers all of
them for free once the signal exists.

### What the view renders in flight today, per path

| Path | In-flight signal today | What the user sees |
|---|---|---|
| Select a course (`handleSelectCourse` `:504`, `handleSelectExportCourse` `:511`) | `loadState.status = "loading"` (`:336`) | Canonical spinner block `:751-758`; ModulesView unmounted; picker still visible |
| Mount auto-restore | initial `loadState` computed `"loading"` when a target + (export or institution) exists (`:183-197`) | Same block |
| Refresh button / any `reload()` | NONE (silent) | Old list unchanged, button reads "Refresh" and stays enabled; error, if any, surfaces only as a `note` (`:390-393`) |
| Failed select | `loadState.status = "error"` (`:398`) | `loadError` text under the picker (`CoursePicker.tsx:392`); `!loaded` shows the "Load a course above..." empty line (`:760-766`) |
| Genuinely empty course | status `"idle"`, `modules=[]` | ModulesView mounted, "This course has no modules yet." (`ModulesView.tsx:781`) - already distinct from loading |

So the empty-vs-loading distinction already holds by construction: "loading"
unmounts ModulesView, "empty" is rendered BY ModulesView. The change must not
disturb that ordering.

---

## 2. The app's existing loading idiom (reuse, do not invent)

- Block: `.loadingState` (`src/app/page.module.css:105-113`) + `.spinner`
  (`:125-133`) + `.loadingTitle` (`:135-139`), markup copied at least by
  `FilesView.tsx:468-474`, `CourseItemsView.tsx:754-760`, `PageEditorModal.tsx:153`,
  `ContentTab.tsx:752-757`. The CSS comment at `:115-124` calls `.spinner` "THE
  canonical spinner recipe for the whole app" and says not to fork it.
- Inline (spinner next to text, no box): `<span className={styles.spinner}
  aria-hidden="true" /> Loading your library...` at
  `caption-studio/VideoSource.tsx:105`; 30+ `styles.spinner` sites
  (`grep -rn "styles.spinner" src/app --include=*.tsx`).
- Not reusable here: `GradingProgress` is grading-specific
  (`grep -rln GradingProgress src/app --include=*.tsx` returns only
  `grading-chat/GradingChatPanel.tsx`); `.loadingRow` lives in the account
  pages' own stylesheets, not `page.module.css`
  (`grep -n "^\.loadingRow" src/app/page.module.css` returns nothing).
- No `CircularProgress`/`LinearProgress` in `content-tab/`
  (`grep -rn "CircularProgress\|LinearProgress" src/app/components/content-tab`
  returns nothing).

Reuse decision: `styles.spinner` from `page.module.css`, the stylesheet both
ContentTab (`:27`) and ModulesHeaderBar (`:6`) already import. NO new CSS class
(so `page.module.css` and `docs/css-orphans.md` are untouched; the latter is
being edited by in-flight work per git status).

One measured caveat: `.spinner` carries `margin-top: var(--space-1)` (4px,
`globals.css:88`), written for the flex-start `.loadingState` layout. Inside a
vertically centred button that is a 4px downward offset. See V-1 in section 10;
it is a visual-walk residual, not a reason to fork the class.

---

## 3. Findings

**F-1 (the gap, severity high for the owner's complaint).** Silent reload has no
in-flight signal; the `refreshing` prop is wired end to end
(`ContentTab.tsx:812` -> `ModulesView.tsx:116,490` -> `ModulesHeaderBar.tsx:37,
132,239,242`) but fed an expression that is structurally always false where it
is read (section 0, item 3). Fix is to feed it a real signal. Reachability trace
of the fix, control to code, every hop:

1. click `Refresh`, `ModulesHeaderBar.tsx:238` `onClick={reload}`
2. prop `reload` from `ModulesView.tsx:488` (`reload={reload}` into the
   header; `reload` destructured `:57`)
3. `ContentTab.tsx:518` `reload` -> `:520` `loadContent(selection, true)`
4. NEW: in-flight state set here (section 4)
5. `ContentTab.tsx:812` `refreshing=` -> `ModulesView.tsx:490` ->
   `ModulesHeaderBar.tsx:239/242` (existing label + disabled)
6. NEW: spinner element beside the label (section 4)

No hop is a new export; the state and its only reader are both inside
`ContentTab.tsx`, and the prop chain already exists, so there is no
"export without a caller" risk (a type-only exemption is NOT being claimed).

**F-2 (latent, severity low, on the select path).** `loadContent` sets
`loadState = "loading"` (`ContentTab.tsx:336`) and then, in the live branch,
`const id = parseCanvasCourseId(sel.courseUrl); if (!id) return;`
(`:365-366`). If the URL has no `/courses/<digits>` (`canvas-url.ts:87-90`) the
function returns with status still `"loading"` and NOTHING ever clears it: the
canonical spinner spins forever and records no diagnostic. This is the "forever
spinner" the task warns about. Reachable only with a malformed saved-course chip
(`CoursePicker.tsx:443`, `onSelect(c.url)`; chips are written with a validated
id at `:286-295`, so only hand-edited or legacy storage gets here) - hence low
severity, but it is two lines away from the code being edited and costs two
lines to close. The mount effect already guards the same condition BEFORE going
async (`:461`), and the initial state guards it (`:186`), so only `loadContent`
has the hole.

**F-3 (observed, not changed).** During a silent reload the old list stays
interactive and `setTargets(null)` / `setNote(null)` fire immediately
(`:337-338`). A user can act on stale rows while the refresh is in flight. The
`busy` flag does not cover it (`busy` is set by the actions, not by reload).
Out of scope (R-4).

**F-4 (observed, not changed).** Overlapping silent reloads are possible: many
callers invoke `reload()` and only the header button is guarded by `refreshing`.
A boolean in-flight flag would clear when the FIRST completes. Section 4 uses a
counter for that reason. A related pre-existing race (a silent reload
completing after an institution switch writes the previous school's modules,
`:293` reset vs `:403-404`) is untouched by this item (R-5).

---

## 4. The minimal change (default ON; no flag)

All of it in two production files. Sketch, for the implementer to realise - not
final code:

**ContentTab.tsx**

1. New state next to `loadState` (`:183`):
   `const [reloadsInFlight, setReloadsInFlight] = useState(0);` and
   `const refreshing = reloadsInFlight > 0;`. A COUNTER, not a boolean (F-4).
   Not persisted - no `ta-` key (it is transient request state, not a control).
2. `reload` (`:518-521`) becomes: if `hasTarget`, `setReloadsInFlight(n => n + 1)`
   then `void loadContent(selection, true).finally(() => setReloadsInFlight(n =>
   n - 1))`. `.finally` is chosen over editing `loadContent` because
   `loadContent` has FOUR early `return`s reachable on the silent path (`:346`,
   `:362`, `:388`, `:393`; `:351` and `:399` are non-silent only; found with
   `awk 'NR>=334 && NR<=407 && /return;/'`) plus the unguarded `if (!id) return`
   at `:366` - decrementing
   inside each is the construction that leaks a stuck "Refreshing..." the first
   time someone adds a sixth return. The promise-level decrement cannot miss one.
   `reload` must keep calling `loadContent(selection, true)` - SILENT - or the
   list unmounts and scroll position, open accordions and the sub-tab are lost
   (the reason silent exists, comment `:314-316`).
3. `:812` `refreshing={loadState.status === "loading"}` -> `refreshing={refreshing}`.
   (`ModulesView.tsx:490` and `ModulesHeaderBar` already consume it; ModulesView
   is NOT edited, which matters - it is 924 lines.)
4. Non-modules results header (`:715`, `:718`): replace the dead
   `loadState.status === "loading"` with `refreshing` in both the `disabled` and
   the label expressions, and add the same spinner span. Same defect, two lines,
   same state; Pages shares `loadContent`.
5. F-2 close: at `:365-366` replace the bare `return` with an error exit: record
   `recordDiag("load_course_content", sel.courseUrl, "failure", <message>)`
   and, when `!silent`, `setLoadState({ status: "error", message })`; return.
   Proposed copy (ASCII): "That link does not name a Canvas course." (the owner
   may re-word; the pin does not depend on the string).

**ModulesHeaderBar.tsx** (`:235-243`)

6. Inside the Refresh `Button`, render `{refreshing && <span
   className={styles.spinner} aria-hidden="true" />}` before the label. The
   existing `disabled={busy || refreshing}` and the "Refreshing..." label
   (`:239,242`) are kept as-is - they become live. The button is in the sticky
   header (`.ccStickyHeader`, `page.module.css:5625-5631`, `position: sticky`),
   so the indicator stays on screen even when the user has scrolled a long
   module list before clicking Refresh. That is why the indicator goes ON THE
   CONTROL and not in a block above the list: a block above the list would be
   scrolled out of view in exactly the case this complaint is about (section 10,
   fork F1).

Not changed: the select/restore block `:751-758`; `ModulesView.tsx`;
`page.module.css`; any server action; any persisted key.

### States after the change

| State | Where | Indicator |
|---|---|---|
| Initial / select / restore load | below picker, above (unmounted) list | canonical block `ContentTab.tsx:751-758` (unchanged) |
| Reload / Refresh / post-action reload (list stays mounted) | Refresh button in the sticky header | spinner + "Refreshing..." + disabled, until every in-flight reload settles |
| Reload failed | top of tab | existing `note` alert (`:390-393`, `:740-749`); indicator clears via `.finally` |
| Genuinely empty course | in the list area | "This course has no modules yet." (`ModulesView.tsx:781`), reached only AFTER loading ends |
| Bad course URL (F-2) | under the picker | error text via `loadError` (`CoursePicker.tsx:392`), no spinner |

Copy (ASCII, this app's voice, no emoji): label "Refreshing..." is the
existing string at `ModulesHeaderBar.tsx:242` and `ContentTab.tsx:718` - the
only string this item adds is the F-2 error line above.

---

## 5. UX pass

**Click count (arithmetic over read controls, nothing rendered):**
Refresh = 1 click, first use and repeat use, before and after. The change adds
no click and removes none; it makes the single click acknowledge itself. The
guard (`disabled` while refreshing) removes the double-click that currently
issues two Canvas fetches.

**Control order in DOM (modules header, existing):** "Copy to..." , "Import
from..." , divider , Refresh (`ModulesHeaderBar.tsx:205-243`). The spinner sits
INSIDE the Refresh button, so DOM order and tab order are unchanged.

**Three places the design would mislead (worst first):**
1. The list stays on screen and interactive while "Refreshing..." shows. A user
   can start an action on a row that the refresh is about to replace (F-3). The
   indicator makes the staleness visible but does not prevent it. Worst of the
   three; accepted because Canvas module/item ids are stable across a refresh
   and every write action re-reads before acting; a freeze overlay would cost
   the preserved scroll/accordion state that silent mode exists to keep.
2. After a write action the button now flashes "Refreshing..." although the user
   clicked something else. That is accurate (a reload IS running) and arguably
   desirable; flagged so nobody reads it as a bug.
3. A failed reload clears the spinner and shows an error `note`, but the OLD
   list remains. The note is the only cue the list is stale (existing behaviour,
   `:390-393`).

---

## 6. Accessibility (READING CLAIMS - no component is rendered by any test here)

- The spinner is `aria-hidden="true"` (matches every other site). The accessible
  cue is the button name changing "Refresh" -> "Refreshing..." plus
  `disabled`. A name change on a focused button is announced inconsistently
  across screen readers - I could not verify it and do not claim it announces.
- Disabling the focused button on click drops keyboard focus to `<body>` in some
  browsers. Existing behaviour for `busy` (same `disabled={busy || ...}`), but
  newly reachable on every Refresh click now that the second clause can be true.
  Needs the accessibility seat's reading (R-3).
- The canonical block (`:752`) is `role="status" aria-live="polite"`. The
  refresh path has NO live region in this proposal. A visually-hidden live region
  mounted unconditionally (seats.md rule: do not mount a region at the moment
  its first message arrives) is the usual answer, but there is no `srOnly`
  class in `page.module.css` (`grep -n "^\.srOnly" src/app/page.module.css`
  returns nothing; only `InSessionBanner.module.css` has its own) and `.bulkHint`
  has `min-width: 240px` (`page.module.css:5353-5359`), unusable inside the
  button group. Rather than invent either, this is residual R-3 for the wave-3
  accessibility seat, with the owner's priority being the sighted indicator.

---

## 7. Write set

| File | Change | Lines now (`@(Get-Content <f>).Count`) | Est. after |
|---|---|---|---|
| `src/app/components/ContentTab.tsx` | state + `reload` + prop + results-header + F-2 exit | 887 | about 905-910 |
| `src/app/components/content-tab/modules/ModulesHeaderBar.tsx` | spinner span in Refresh button | 570 | about 573 |
| NEW `src/app/components/contentTab.refreshing.wiring.test.ts` | source-text pins, section 9 | - | about 120 |

Ceiling risk: LOW. Nothing is within 90 lines of 1000
(`src/file-size-ceiling.structure.test.ts`, `LIMIT = 1000` at `:41`). The risky
neighbour is `ModulesView.tsx` at 924, which this design deliberately does NOT
touch (prop already exists). The ceiling test is still run unconditionally
(this-repo.md section 1). Estimates are estimates; the implementer re-measures
with `@(Get-Content <file>).Count` (never `Measure-Object -Line`).

Readers of the touched files that the wave gate MUST run (my derivation, a
FLOOR not the set - the receiver re-derives it with its own instrument and
reports what this list missed):
- reads `ContentTab.tsx`: `contentTab.wiring.test.ts:27`,
  `src/lib/lms-generation/selection-archive.test.ts:409,443-449`
  (`grep -rn "ContentTab.tsx" src --include=*.test.ts`, filtered to
  `readFile`/`path`/`join` lines)
- reads `ModulesHeaderBar.tsx`: `ModulesHeaderBar.wiring.test.ts:31`,
  `bulkCreateModules.wiring.test.ts:34`
- `contentTab.wiring.test.ts:49` extracts `const courseTab =([\s\S]*?);` (lazy to
  first `;`) and `:60-61` slices between `view === "inbox" ? (` and `view ===
  "version-control" && versionControl`; neither anchor is edited by this item.

Disjointness vs in-flight work: `git status --short` shows modified files only
under `src/app/actions/github-repos.ts` and `src/lib/repo-grade-*`; none is in
this write set. `docs/css-orphans.md` is modified by other work - this item
adds no CSS, and its gate MUST NOT include
`page-module-css-orphan-classes.test.ts` (it rewrites that file:
`grep -n writeFileSync` shows `:527`).

### Wave plan

One wave, one push: the state, its reader, the header spinner, the F-2 exit and
the pins are mutually dependent (the pins read both files), and the whole change
is under 40 production lines. No separate surface wave is needed because the
surface is a prop chain that already exists.

---

## 8. Acceptance criteria (UX-visible; mechanism is the architect's)

Fired triggers: leverage claim - NOT REQUIRED (a missing-state fix to an
existing surface, not a new capability); diagnostics representation - see AC-7.

Each condition names object, instrument, direction of failure.

- **AC-1 Refresh acknowledges itself.** Object: the Refresh control in the modules
  header while a reload is in flight. Instrument: wiring pin P2+P4 (source text)
  and an OWNER visual walk (R-1/V-1). RED if the control can show neither a
  spinner nor "Refreshing..." while a silent reload is pending.
- **AC-2 Honest duration.** Object: the in-flight count. Instrument: pin P1.
  RED if the count can fail to return to zero after a reload that returns early
  or rejects (a stuck "Refreshing..." is worse than none), or can return to zero
  while another reload is still pending (clears early).
- **AC-3 Silent stays silent.** Object: `reload`'s call to `loadContent`.
  Instrument: pin P3. RED if `reload` calls `loadContent` without `true` (the
  list would unmount and lose scroll/accordion/sub-tab state).
- **AC-4 Select/restore indicator untouched; empty is not loading.** Object: the
  block at `ContentTab.tsx:751-758` and the `!loaded ? null` gate at `:770`.
  Instrument: pin P6. RED if either is removed or the empty-state text becomes
  reachable while `loadState.status === "loading"`.
- **AC-5 No forever spinner on a bad link.** Object: `loadContent`'s live branch.
  Instrument: pin P5 (ordering). RED if any path leaves `setLoadState({ status:
  "loading"` without a later `setLoadState` on that path - concretely, if the
  `!id` early return can still follow the loading set without an error set.
- **AC-6 Non-modules views agree.** Object: the Pages/Assignments/Quizzes/Files
  results header Refresh control. Instrument: pin P4b. RED if it still derives
  from `loadState.status === "loading"` alone.
- **AC-7 Diagnostics (stated, per DEV_LOOP.md "Diagnostics representation").**
  The indicator is presentational: it adds no data path, and a failed silent
  reload is ALREADY recorded as `load_course_content` failure
  (`ContentTab.tsx:343,369,...`, surface `lms-content`,
  `session-diagnostic-log.ts:94-95`). The one NEW failure made visible is the
  F-2 bad-link exit, which records `load_course_content` failure (section 4,
  item 5). Instrument: pin P5 asserts the `recordDiag` call is present in that
  branch. RED if the F-2 exit sets an error without recording it.
- **AC-8 House rules.** No emoji (`src/lib/no-emojis.test.ts`), no new class in
  `page.module.css`, no new `ta-` key (`componentStorageKeys.structure.test.ts`
  not touched), file sizes under 1000.

Click budget: Refresh stays 1 click (first and repeat). No new key binding, so
no `keydown` collision question arises.

---

## 9. Structure pins and sabotage

Nothing renders under vitest (`vitest.config.ts` `environment: "node"`,
`include: ["src/**/*.test.ts"]`), so the pins are source-text and prove WIRING,
not paint. New file `src/app/components/contentTab.refreshing.wiring.test.ts`
(new file, not an edit to `contentTab.wiring.test.ts`, to keep the existing
5-view partition test unperturbed).

Comment-stripping: both files carry very long comments that contain the words
the pins look for ("Refreshing", "loading", "silent"). The pins MUST scan
comment-stripped source. The tokenizer `stripComments` in
`src/app/components/ui/modalAdoptionSourceScan.ts:155` is string-aware (the
A42 defect); but `src/tools/strip-comments-agreement.structure.test.ts` fails
repo-wide on an unclassified test that MENTIONS that name (this-repo.md section
3). Either import it under an alias as
`src/app/components/courses/page-module-css-classes.test.ts` does (alias
`tokenizerStripComments`) and run the agreement gate, or use the inline regex
strip `ModulesHeaderBar.wiring.test.ts:35-37` uses. The implementer picks one
and RUNS `strip-comments-agreement.structure.test.ts` in the gate either way.
Pin facts, not spellings (memory: source-text tests over-specify).

| Pin | Asserts (slice-bound) | Mutation that must turn it RED |
|---|---|---|
| P1 | `reload` body: contains a `+ 1` increment of the new state, a `-` decrement inside a `.finally(`, and `hasTarget` guards both | M1 delete `.finally(...)`; M4 delete the increment only |
| P2 | the JSX of `<ModulesView ... />`: its `refreshing=` expression references the new in-flight identifier and is not `loadState.status === "loading"` alone | M2 restore `refreshing={loadState.status === "loading"}` |
| P3 | `reload` body calls `loadContent(selection, true)` (second argument literally `true`) | M6 change to `loadContent(selection)` |
| P4 | `ModulesHeaderBar.tsx`: the Button whose `onClick={reload}` contains `styles.spinner` guarded by `refreshing` | M3 remove the spinner span |
| P4b | `ContentTab.tsx` results-header Refresh: `disabled`/label reference the new state, and `loadState.status === "loading"` no longer appears inside that Button | M7 revert `:715/:718` |
| P5 | in `loadContent`: the `parseCanvasCourseId(sel.courseUrl)` failure exit either precedes `setLoadState({ status: "loading"` or contains `setLoadState(` with status `"error"`, and contains `recordDiag(` | M5 restore the bare `if (!id) return;` after the loading set |
| P6 | the canonical block survives: `Loading course content` text inside `loadState.status === "loading"` and `courseTab &&`; `!loaded ? null` still precedes the `view === "modules"` branch | M8 delete the block or the null gate |

Sabotage rules for the test seat (these are the repo's own, restated with their
source): back the file up with `cp` before each mutation and restore from the
copy, NEVER `git checkout --` (memory: sabotage restore needs a copy); no two
agents sabotage the tree at once (DEV_LOOP.md Standing rules); a surviving
mutant may be a bad instrument - rebuild and say so rather than adding
assertions until it dies. A reference implementation proving the pins
satisfiable is the test seat's obligation (seats.md Test seat practice 1);
section 4 is deliberately small enough to be that reference.

Removal test: not applicable (no leverage claim). The closest analogue is M2:
reverting the one-line prop re-creates today's dead state and must go red.

Wave gate (a check spanning two or more test files uses the wrapper, never a
raw multi-path vitest; the wrapper prints one `COVERED`/`NOT COVERED` line per
argument and fails unless every argument ran at least one passing assertion):

```
npm run test:paths src/app/components/contentTab.refreshing.wiring.test.ts src/app/components/contentTab.wiring.test.ts src/app/components/content-tab/modules/ModulesHeaderBar.wiring.test.ts src/app/components/content-tab/bulkCreateModules.wiring.test.ts src/lib/lms-generation/selection-archive.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/tools/strip-comments-agreement.structure.test.ts src/app/components/courses/page-module-css-classes.test.ts
```

plus, as the single caller, `npx tsc --noEmit` (no output = pass) and `npm run
lint` (pass = exit 0 and no NEW warning in the files this wave writes, measured
against a pre-change run - do not pin a count). This scope has NOT run any of
these; the verification report that does must quote the wrapper's per-argument
lines.

---

## 10. Forks, assumptions, and the residual register

### Forks (my recommended reading is acted on; nothing is gated)

- **F1 - where the refresh indicator lives.** (A, recommended and specified
  above) on the Refresh control in the sticky header; or (B) the canonical
  `.loadingState` block above the list, as for select. A is chosen because the
  sticky header stays visible while scrolled and B causes a ~50px layout shift
  of the list on every reload. Cost if the owner prefers B: move about 8 lines
  and re-aim P4; no state change. Not started on B.
- **F2 - premise.** The select/restore path already has an indicator. I read the
  owner's request as the reload gap. If the owner means select, section 0 stands
  and the item reduces to F-2 only. Cost if wrong: none of the work is wasted
  (F-1 is a proven defect either way); an owner walk (R-1) settles which path
  they meant. Terminating shape for the owner: "this item ships the Refresh
  indicator plus the bad-link fix; the select spinner is already present" - every
  answer leaves it shippable.
- **F3 - include the non-modules views and F-2.** Included (cheap, same defect,
  same state). Drop either by deleting section 4 items 4 or 5 and AC-6 / AC-5.

### Residual register (owner, instrument, step - all three, or it is a deletion)

| Id | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | Which path the owner saw frozen, and that the Refresh spinner is visible and reads well (no component renders here) | Owner | Browser walk with a real Canvas course: click Refresh in the modules view on a slow connection; also select a course | Owner walk after the push; file the result against this item |
| V-1 | The inherited `margin-top: 4px` on `.spinner` (`page.module.css:128`) may sit the in-button spinner 4px low; fixing needs a new class or inline override, which the CSS comment `:115-124` restricts | Visual seat (wave 3) | Reading of `.spinner` + MUI small outlined Button box, then owner walk | Wave-3 visual pass, or R-1 walk |
| R-3 | Focus loss on disabling the focused Refresh button; absence of a live region on the reload path | Accessibility seat (wave 3) | Reading of focus behaviour (not a rendered test) | Wave-3 accessibility pass; says "reading claim" |
| R-4 | Stale list stays interactive during a silent reload (F-3) | Owner decision | None buildable; product choice (overlay vs accept) | Only if the owner asks; not filed as work |
| R-5 | Pre-existing: silent reload finishing after an institution switch can write the previous school's modules (`ContentTab.tsx:293` vs `:403-404`) | Backlog row to be filed by the orchestrator | A source-text pin cannot show a race; needs a deterministic fake of the action | A separate scoped item; NOT bundled here |
| R-6 | First-paint behaviour on a hard reload (the initial-state initializer branches on `typeof window`, `:184`); I did not determine whether ContentTab is server-rendered | Owner walk / architect | Browser check of the first paint on reload with a remembered course | Folded into the R-1 walk |
| R-7 | `ensureTargets` (`:167-182`) has no in-flight signal for the pickers that use `targets`, except the one "Loading files..." menu item (`BulkModulesSection.tsx:486`); I did not survey every consumer | Orchestrator to file if wanted | `grep -rn "targets" src/app/components/content-tab` per consumer | A separate scoped item |

### Could not determine

- Which interaction the owner saw (R-1).
- Anything about paint, spacing, focus or announcement (no render here).
- Whether `strip-comments-agreement.structure.test.ts` classifies an aliased
  import of the tokenizer as a mention; the implementer must run it.
- Live Canvas latency, i.e. how long the "frozen" window actually is: no `.env`,
  no network (this-repo.md section 6). The design does not depend on the number.

### Disposition table

Not applicable: this is a first version, nothing was restructured from a prior
document.

### Commands used (all re-runnable)

- `@(Get-Content <file>).Count` for ContentTab.tsx (887), ModulesView.tsx (924),
  ModulesHeaderBar.tsx (570), contentTab.wiring.test.ts (115), CoursePicker.tsx (454)
- `grep -n "loadContent(" src/app/components/ContentTab.tsx`
- `grep -rn "styles.spinner" src/app --include=*.tsx`
- `grep -rn "refreshing" src/app/components` (ContentTab.tsx:812, ModulesView.tsx:64,116,490,
  ModulesHeaderBar.tsx:37,132,239,242 are this surface)
- `grep -rn "ContentTab.tsx" src --include=*.test.ts`; same for `ModulesHeaderBar.tsx`
- `git rev-parse --short HEAD`; `git status --short` (scoped paths)
