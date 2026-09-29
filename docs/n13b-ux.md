# N13b UX pass

Seat: `loop-seat` (UX). Round 1 of 2 (docs/AGENTS.md "Two rounds, then ask" -
a fresh `loop-checker` gates this before any implementer reads it; a second
round, if needed, is a check-and-revise cycle over THIS artifact, not a new
one). Design/reading only - no production code, no test code.

Sources opened before writing anything below (brief-from-the-tree, not from
a doc, per `.claude/agents/loop-seat.md` and `docs/loop/seats.md:9-12`):

- `docs/n13b-acceptance-criteria.md` (full file, 406 lines) - esp. AC-8
  (two outputs, name-safety), AC-9 (named list = counted set), AC-12
  (reachability), and the "Out of lane" section naming the identity
  mechanism as the architect's job, not this pass's.
- `docs/backlog.yml:199-210` (the N13b row, read as one single-quoted note,
  not grepped - matches the AC doc's own citation method).
- `docs/loop/seats.md:183-207` (the User experience seat brief and its
  checker questions - click counts, keyboard collisions, `slotProps`,
  persistence, copy voice, "which of the three misleading findings is
  worst").
- `docs/DEV_LOOP.md` (full file) and `.claude/agents/loop-seat.md` (full
  file) for the non-negotiables this artifact must satisfy.
- `src/app/components/drafted-grades/ClassTrendsPanel.tsx` (full file, 212
  lines).
- `src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx` (full file,
  117 lines).
- `src/app/components/drafted-grades/classTrendsDraftState.ts` (full file, 58
  lines).
- `src/app/components/drafted-grades/classTrends.wiring.test.ts:100-138`
  (the panel's own wiring assertions, incl. the `.student` ban at :128-130).
- `src/lib/grade/class-trends.ts` (full file, 356 lines) - `AreaTrend`,
  `computeClassTrends`, `buildAreaSummary`, `containsForbiddenCompletenessPhrase`.
- `src/lib/grade/class-trends-draft.ts` (full file, 179 lines) -
  `composeClassTrendsDraft`, `areaFullyCovered`, `renderCountedClause`.
- `src/lib/grade/class-trends-insight.ts:1-75` - the anonymiser
  (`anonymizeGradeResults`, :59-69) and its own "only place `.student` is
  read" claim (:36-39,57).
- `src/app/components/grading-results/classTrendsEntry.ts` (full file, 55
  lines) - `hasTrendableResults` at :52-54.
- The five other mounts, grepped then opened at the cited lines:
  `src/app/components/DraftedGradesTab.tsx:27-28,656-658`,
  `src/app/components/GradingResults.tsx:19-20,607-622`,
  `src/app/components/grading-recording/GradingRecordingPanel.tsx:133-142,913-927`,
  `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx:62-65,916-926`,
  `src/app/components/repo-grades/index.tsx:77-83,853-858`.
- CSS actually opened, not assumed: `src/app/page.module.css:258-262`
  (`.fieldHint`), `:538-541` (`.error`), `:6572-6579` (`.draftExpand`),
  `:6611-6616` (`.draftFeedback`), `:6581-6609` (`.draftRubricArea*` - see
  "do-not-reuse" below); `src/app/components/recording/RecordingControls.module.css:389-444`
  (`.draftPreview` family).
- `src/app/components/ui/clipboard.ts:18` (`writeClipboardText` signature -
  `(text: string, html?: string)`).
- Command run to find every mount:
  `grep -rln '<ClassTrendsPanel' src/app --include=*.tsx` (matches the AC
  doc's own AC-12 instrument) - returned FIVE call-site files, exactly the
  five AC-12 names (`DraftedGradesTab.tsx`, `GradingResults.tsx`,
  `GradingRecordingPanel.tsx`, `SnapshotGradingPanel.tsx`,
  `repo-grades/index.tsx`). `ClassTrendsPanel.tsx` is NOT in that output - it
  renders `<ClassTrendsDraftPanel`, never itself. Those FIVE mount files serve
  SIX grading tools, because `GradingResults.tsx` backs both the run and the
  chat sub-tabs; "six surfaces" below means the six tools, "five call sites"
  the files. This distinction does not change the leverage claim - one edit to
  the shared component reaches every mount - it only makes the count honest. As the
  defining file - not a seventh mount).
- Persistence precedent, measured: `grep -rn 'localStorage\.(get|set)Item\("ta-' src`
  returned entries in `useThemePreference.ts`, `page.tsx`,
  `account/voice-style/page.tsx`, `CartridgeDropPanel.tsx`,
  `caption-studio/*`, `bulk-repo/hooks/*` and others - **no `ta-` key exists
  anywhere for `ClassTrendsPanel`'s own `expanded` state**
  (`ClassTrendsPanel.tsx:88`, `useState(defaultExpanded)`, no
  `localStorage` read). This is an existing gap, not one N13b opens - see
  the Persistence section below for why this pass does not fix it either.

This is a restructuring of nothing - there is no prior N13b UX artifact in
the tree (`git log --oneline -- docs/n13b-ux.md` on this checkout has no
history before this write). The "disposition table for a restructured prior
version" requirement in the seat brief is **not applicable**; stated
explicitly rather than silently omitted.

---

## 1. The one leverage point: all six surfaces share one component

Every one of the six mounts above passes only `entry` (and, at five of the
six, `defaultExpanded`) into `ClassTrendsPanel`. None of the six wraps it in
a layout that constrains its internal structure beyond a plain `<div>` with
a margin (`GradingResults.tsx:618`, `repo-grades/index.tsx:854`) or the
shared `styles.field` wrapper (`GradingRecordingPanel.tsx:926`). Nothing in
any of the six pre-filters, slices or re-orders `entry.run.results` before
handing it to the panel.

**Consequence for this design:** the named-list output is added inside
`ClassTrendsPanel.tsx` (or a new sibling component it mounts), never at any
of the six call sites. AC-12's reachability requirement is satisfied for
free at all six surfaces by one change, exactly as it already is today for
layer A (`computeClassTrends`) and layer C (`ClassTrendsDraftPanel`) - the
six mounts do not need touching, and no new wiring test per-surface is
needed beyond extending the existing `classTrends.wiring.test.ts` family
that already asserts against `ClassTrendsPanel.tsx`'s own source (that
extension is the test seat's job, flagged as Residual R-UX-1 below, not
authored here).

---

## 2. Reuse survey

**Reused as-is:**

- `styles.draftExpand` (`page.module.css:6572-6579`) - the bordered,
  padded, flex-column wrapper `ClassTrendsPanel.tsx:139` already opens the
  whole expanded body with. The new section is a child of this same
  wrapper, not a second one - one bordered card, not two.
- `styles.fieldHint` with `fontWeight: 600` inline (the exact idiom at
  `ClassTrendsPanel.tsx:140-142` for "Counted trends, per rubric area" and
  at `ClassTrendsDraftPanel.tsx:63-65` for "A draft message for students") -
  reused verbatim for the new section's own bold sub-heading. This is the
  house pattern for "label a sub-block inside an expanded panel," proven at
  two call sites in the same file tree already.
- `styles.draftFeedback` (`page.module.css:6611-6616`) - the exact `<li>`
  class `ClassTrendsPanel.tsx:150` uses for each area's counted summary.
  Reused for each per-area line in the new named-list block, so the new
  content visually matches the existing counted-trends list it sits next
  to (same `white-space: pre-wrap`, same secondary-text color, same
  font size) rather than inventing a second typographic voice.
- The `<ul style={{ margin: 0, paddingLeft: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>`
  inline layout at `ClassTrendsPanel.tsx:146-148` and again at :186-188 for
  the AI-reading list - reused a third time for the named-list block, since
  this file already establishes it as ITS OWN repeated list idiom, not
  something to reinvent as a fourth shape.
- `Button` from `@mui/material`, `size="small"` `variant="outlined"` for an
  action the user must deliberately take (draft/copy), `variant="text"` for
  a low-emphasis toggle - the exact size/variant pairing every button in
  both files already uses. No new button variant is introduced.
- `writeClipboardText` (`ui/clipboard.ts:18`) for the new Copy control,
  same as `ClassTrendsDraftPanel.tsx:55`. Its `html` parameter is
  **optional** (confirmed at the signature) - the named list has no bold,
  links or lists that need HTML, only plain name/area text, so the new
  call passes plain text with no second argument, never invoking
  `markdownToHtml` for content that is not markdown.
- The copy-status idiom exactly as built: `role="status" aria-live="polite"`
  for a successful copy (`ClassTrendsDraftPanel.tsx:104-107`) and
  `role="alert"` plus `styles.error` for a failed one (:108-112), with the
  SAME `COPY_ERROR_MESSAGE` string (`ClassTrendsDraftPanel.tsx:28-29`) -
  that message is about the browser's clipboard permission, not about what
  was being copied, so it is correct to reuse verbatim rather than write a
  second copy-failure sentence.
- The "explicit empty state, not an empty string" idiom:
  `ClassTrendsDraftPanel.tsx:78-83`'s `status === "empty"` render (text only,
  no button) is the pattern for the new section's own "nothing meets the
  subset threshold yet" state - see section 4.

**Deliberately NOT reused, with reasons (per `seats.md`'s "is anything on
the reuse list wrong to reuse" checker question, answered up front):**

- `styles.draftRubricArea` / `.draftRubricAreaName` / `.draftRubricAreaScore`
  / `.draftRubricAreaPercent` (`page.module.css:6581-6609`). Grepped
  (`grep -rn 'draftRubricArea' src`) and opened at every match: these back
  a DIFFERENT feature ("JOB B", the per-criterion rubric-breakdown display
  inside `DraftedGradesTab.tsx`, one submission's own score per criterion),
  not this cross-student trends panel. Their semantics (one area, one raw
  score, one percent, for ONE student's ONE submission) do not fit "one
  area, N student names" - reusing them would borrow a visual language
  built for a different comparison and likely mislead a reader into
  expecting a score column that will not exist here.
- `containsForbiddenCompletenessPhrase` (`class-trends.ts:37-40`) for the
  named-list's own text. This function exists to stop the CLASS-addressed
  draft from implying a completeness claim it cannot back
  (`class-trends.ts:17-32`'s header). The instructor-facing list's audience
  already knows the exact count (it is printed beside the names, per
  section 3) - filtering an instructor-typed rubric area name like "review
  for all students" through this list would silently drop a legitimate
  area with no privacy or honesty benefit, since no completeness claim is
  being made TO the instructor about the instructor's own class. Do not
  port this filter onto the new section. (The class draft's OWN use of it,
  unchanged, still applies to `renderCountedClause`'s output exactly as
  today - `class-trends-draft.ts:144-146`.)
- `controls.draftPreview` / `dangerouslySetInnerHTML`
  (`ClassTrendsDraftPanel.tsx:92-94`, `RecordingControls.module.css:389-444`).
  That machinery exists because the class draft is markdown rendered as
  rich HTML. The named list is a plain list of names and area labels with
  no markdown - rendering each name as an ordinary React text child
  (`{name}`) is both simpler and stronger: it goes through React's own
  escaping, so there is no HTML-injection surface here at all, versus the
  draft panel's existing (already-reviewed, unchanged) markdown-to-HTML
  path. Not reusing this is a strict security improvement over the
  available alternative, not merely a style choice.
- The `DraftUiState` / `nextDraftUiState` state machine
  (`classTrendsDraftState.ts:21-58`) as a SHARED state instance between the
  class draft and the new named-list control. The STATE-MACHINE SHAPE
  (idle -> ready/empty/rejected, plus a copy-settled transition) is a
  precedent worth mirroring in a parallel type for the new section, but the
  two controls must never share one `useState` value - see the collision
  risk in section 6, finding 3.

---

## 3. Placement and content shape

Recommended DOM order inside the existing `styles.draftExpand` wrapper
(`ClassTrendsPanel.tsx:139`), replacing today's order with one insertion:

1. "Counted trends, per rubric area" - unchanged (`:140-155`).
2. **NEW: "Students to contact - instructor only, never post this to the
   class"** (bold `styles.fieldHint`, same idiom as item 1's own heading).
   One block per area that meets the subset threshold (AC-2's `>= 3`
   distinct-student count), each rendered as one `styles.draftFeedback`
   `<li>` reading:

   `<DisplayArea> - <N> students missed points: <name>, <name>, <name>[, ...]`

   where `<N>` and the name set are the exact numerator AC-1/AC-9 compute
   (same source, same cardinality - AC-9's own pass condition), and
   `<DisplayArea>` is `AreaTrend.displayArea` (`class-trends.ts:127-129`),
   the same field the counted-trends line above already shows, so an
   instructor reading both blocks sees the same area name spelled the same
   way. Below the per-area lines, one `Button` labeled **"Copy student
   list"** (not just "Copy" - see section 6).
3. "Get AI reading (optional)" - unchanged (`:158-201`).
4. `ClassTrendsDraftPanel` (the class-addressed draft) - unchanged in its
   own file, but its existing Copy button's label changes (section 6).

**Why item 2 sits directly under the counted list, not after the AI
reading or after the class draft:** AC-9 ties the named list to the SAME
counted fact as item 1 (no model involved, no observation involved), so
placing it immediately adjacent keeps "here is the count" and "here is who"
visually paired, and keeps BOTH counted outputs above the model-optional
block and the class-facing block - the two things that read as "data" sit
together, the two things that read as "prose to send somewhere" sit
together, lower down. This also maximizes distance between item 2's names
and item 4's class-addressed copy button, which is the direction that
matters for AC-8: the control most likely to be pasted into a public class
channel is now separated from the names by two intervening blocks, not
adjacent to them.

**Why one new section, not a second panel/expander:** the task brief asks
whether the named list should live in "the same expanded panel, a separate
sub-section, or a separate copyable block" - it is a separate sub-section
(its own heading, its own list, its own Copy button) INSIDE the same
already-expanded panel, not a second collapsible control. A second
independent expander would add a click for no safety benefit: nothing about
hiding names behind an extra toggle makes the class-draft Copy button any
less likely to be confused with it, and OV-2 (below) already asks for the
list to be immediately visible and legible once the panel is open - hiding
it behind its own toggle works against that. The safety property AC-8 asks
for is enforced by the DATA CONSTRUCTION (a name must be structurally
unable to reach the class text - the architect's job per the AC doc's "Out
of lane" section) and by DISTINCT LABELS (this section), not by adding
friction to reach the names at all.

**What is explicitly NOT decided here (architect's lane, per the AC doc):**
where per-student identity threads into `AreaTrend` or a parallel structure,
what the exact per-student attribution type looks like, and which name a
Repo Grades row shows when bound vs. unbound (AC-11/R3). This design is
written against "a display name string per student, grouped by area,
already computed" - whatever shape the architect gives that value, the
layout above renders it. If the architect's chosen shape cannot list
distinct names per area at all (e.g. it collapses to a bare count with no
identity), that is a contradiction with AC-9 the architect pass must
resolve, not something this UX pass can paper over.

---

## 4. Subset-fired vs. not-fired, and the `hasTrendableResults` tie-in

**Reused gate, unchanged:** the whole panel (including this new section)
is unreachable unless `hasTrendableResults(entry)` is true at the mount
site (`classTrendsEntry.ts:52-54`, gated at every mount -
`DraftedGradesTab.tsx:656`, `GradingResults.tsx:617`,
`GradingRecordingPanel.tsx:925`, `SnapshotGradingPanel.tsx:63` via its own
adapter). The repo surface gates equivalently but NOT via a
`hasTrendableResults` call in `index.tsx`: `repo-grades/index.tsx:853` gates on
`trendsEntry` truthiness, and that `trendsEntry` comes from `repoRunTrendsEntry`,
which calls `hasTrendableResults(entry)` at `classTrendsFolderEntry.ts:95` - so
the gate is present, one indirection out. Nothing new is needed here - the new
section inherits this gate for free because it lives inside the same
already-gated panel body.

**Inside the panel, three distinct states for the new section**, mirroring
the "explicit state, not an empty string" idiom `ClassTrendsDraftPanel.tsx`
already uses for the class draft:

1. **No graded results at all carry any area** (`report.areas.length === 0`,
   `ClassTrendsPanel.tsx:143-145`'s existing branch). The new section
   renders NOTHING - it sits inside the same `report.areas.length === 0 ? ... : ...`
   conditional as the counted-trends list, so only ONE explanatory message
   ("No graded results to summarize yet") shows, never two redundant empty
   messages stacked on top of each other.
2. **Areas exist, but none has a distinct-student count `>= 3`.** The
   heading from section 3 does not render at all (a heading with nothing
   under it is exactly the "empty or misleading control" the brief warns
   against), and in its place one `styles.fieldHint` line, no button:
   `"No area yet has three or more students who missed points - nothing to
   contact anyone about yet."` No Copy button is offered, for the same
   reason `ClassTrendsDraftPanel.tsx:78-83` withholds one: a Copy button
   beside nothing implies there is something worth copying.
3. **At least one area clears the threshold.** The heading, the per-area
   lines, and the Copy button all render, exactly as in section 3.

This is a strict three-way split on ONE boolean-ish quantity ("does any
area's subset count clear 3"), the same shape `DraftUiState`'s
idle/ready/empty/rejected split already uses for the class draft - not a
new kind of ambiguity introduced into the file.

---

## 5. Click counts (house rule: count twice - first use and repeat use)

All six mounts render exactly one `ClassTrendsPanel` per graded run (not
per student), so "the panel" below means one run's trends block.

| Action | First use (fresh page load) | Repeat use (same session, panel already expanded, no reload) |
|---|---|---|
| See the counted trends list (existing, unchanged) | 1 click (Trends toggle) | 0 clicks (already visible) |
| See the new named list | 1 click (Trends toggle - the list itself needs no separate "compute" click, since it is derived synchronously alongside `computeClassTrends`, same as the counted list) | 0 clicks |
| Copy the named list | 2 clicks (Trends toggle + "Copy student list") | 1 click ("Copy student list") |
| Copy the class draft (existing, unchanged path) | 3 clicks (Trends toggle + "Draft a message" + "Copy class announcement") | 1-2 clicks (0 if a draft from earlier in the session is still shown, otherwise "Draft a message" again if the run changed + Copy) |

The named list is one click cheaper than the class draft's copy path
because it needs no separate "draft" step - it is already-computed data,
not a composed message a user must deliberately ask to generate. This
mirrors why the counted-trends list ABOVE it also needs no draft step
today (`ClassTrendsPanel.tsx:91`, `computeClassTrends` runs unconditionally
on render per Requirement 1's own comment at :60-64).

**Reading claim, not measured by rendering:** these counts are derived by
walking the JSX structure above, not by clicking through a running app -
no component renders under this repo's vitest (`docs/loop/this-repo.md`
section 6). OV-3 below is the walk that confirms them for real.

**Existing gap this design does not fix, named so it is not mistaken for
new:** `expanded` (`ClassTrendsPanel.tsx:88`) is plain `useState`, not
`ta-`-persisted, at any of the six mounts - measured by the `localStorage`
grep in the Sources section, which found zero hits for a class-trends key.
A returning instructor pays the full first-use count again after every
page reload, for the trends panel as a whole (not something this feature
adds - the counted list and the class draft already pay this cost today).
Adding persistence for `expanded` is a cross-cutting change to a control
this feature does not otherwise touch, and touching it would need its own
`ta-` key (see section 7) and its own regression check across all six
mounts' default-expanded behavior (`defaultExpanded` varies per mount -
`ClassTrendsPanel.tsx:81-86`). Recorded as Residual R-UX-2, not adopted
here.

---

## 6. Copy affordances and labels - the AC-8 UI reinforcement

**The core finding, and the most severe of the "three places this design
would mislead the user" (finding 1 of 3):** today there is exactly one
button in this whole panel labeled just **"Copy"** (`ClassTrendsDraftPanel.tsx:95-102`).
Adding a second Copy button next to it with the same bare label would
create precisely the mistake AC-8 exists to prevent: an instructor who
means to copy the class announcement could copy the named list instead
(and vice versa) with no label difference to catch the error, and then
paste the wrong one into whichever destination they had open. A UI cannot
enforce a privacy boundary with two identically-labeled buttons sitting in
the same scroll position of the same panel.

**Recommendation - rename both buttons, not just add a new one:**

- The existing class-draft button (`ClassTrendsDraftPanel.tsx:95-102`,
  today's bare `"Copy"`) becomes **"Copy class announcement"**.
- The new named-list button becomes **"Copy student list"**.
- The new section's heading (section 3) states the safety rule in words,
  not just in the button label: **"Students to contact - instructor only,
  never post this to the class."** This is the same idiom
  `ClassTrendsDraftPanel.tsx:64` already uses to state ITS OWN safety
  property in prose ("A draft message for students - copyable, never
  posted automatically") - the new heading is not a new voice, it is the
  same sentence shape applied to the opposite direction of risk.

This is a real behavior change to existing, shipped copy (the "Copy" ->
"Copy class announcement" rename), not purely additive - flagged plainly
rather than smuggled in as a side effect of the new feature, per this
seat's non-negotiable to say what changes.

**Finding 2 of 3 - the empty-state ambiguity**, covered mechanically in
section 4: without the explicit three-way split, a heading with nothing
under it, or a Copy button next to an empty list, would each independently
mislead a reader into thinking there is content or an action available
when there is none.

**Finding 3 of 3 - state-sharing risk between the two Copy controls.**
`DraftUiState`'s `copy-settled` transition (`classTrendsDraftState.ts:54-56`)
sets `copy: "copied" | "error"` on WHATEVER state object it is given. If an
implementer reuses ONE `useState<DraftUiState>` instance for both the
class-draft control and the new named-list control (rather than two
independent component instances, each with its own local state - the
structure this design assumes, per section 1's "new sibling component"
framing), clicking "Copy student list" could flip the "Copied." status text
that renders under the CLASS DRAFT's own paragraph, or vice versa - a
correctness bug that would look, on screen, like the wrong button quietly
claiming credit for the other one's action. This is a wiring risk for
whichever seat designs the exact component split (architect) and is not
something a UX layout can rule out from prose alone; recorded as Residual
R-UX-3, addressed to the architect pass, with the concrete instrument named
below.

**No new keyboard bindings.** Every control in this design is a plain MUI
`Button` (the same element/size/variant already used throughout both
files) - no text input, select or checkbox is added, so there is no
`slotProps.input` vs `htmlInput` question (that distinction only applies to
MUI `TextField`) and no new `keydown`/`onKeyDown` handler is introduced
that could collide with the `useRecorder.ts` `r`/`p`/`m` window handler the
checker brief names. Tab order and focus visibility are still reading
claims only - see OV-4 below.

---

## 7. Persistence

**No new textbox, select or checkbox is added by this design** - only two
`Button` elements (one renamed, one new) and a set of read-only text
blocks. The house rule ("every new textbox/select/checkbox must persist
across reloads via a `ta-` key") does not fire here, because nothing new of
that kind exists. Stated explicitly per the brief's own conditional
("if the design adds a toggle/expander, say its persistence key") rather
than left silent: **this design adds no toggle or expander**, so no new
`ta-` key is owed by it.

If a future pass instead wants the named list hidden behind its own
reveal step (e.g. a screen-share safety measure, distinct from AC-8's
copy-boundary concern, which is about where a name can be PASTED, not
where it is DISPLAYED), that would be a new checkbox/toggle and would need
a key such as `ta-class-trends-names-revealed` - named here as the key it
would need, not adopted, since section 3 recommends against adding that
toggle at all. This is Residual R-UX-4.

---

## 8. Reading claims vs. owner-verification

Everything above is a reading claim against source: no component renders
under this repo's vitest (`docs/loop/this-repo.md` section 6, restated in
`AGENTS.md`), so pixel layout, real focus order, real keyboard reachability,
and real contrast are none of them provable here. Every specific number,
label and state above was derived by opening the cited file and line, not
recalled - the citations in sections 1-7 are the check for that.

**Owner-verification walk**, extending OV-1/OV-2 already recorded in
`docs/n13b-acceptance-criteria.md` (owner: repo owner; instrument: the
deployed app; step: post-deploy owner walk, same as OV-1/OV-2 - not
repeated per-item below except where it differs):

- **OV-1** (from the AC doc, unchanged): the class-addressed draft, read on
  screen after a real run, names no student.
- **OV-2** (from the AC doc, unchanged): the instructor-facing list is
  visible, legible, and clearly distinct from the class draft.
- **OV-3**: walk the click counts in section 5 against the real deployed
  panel for one graded run - expand, view named list, copy it; expand,
  draft, copy the class announcement - and confirm the counts match 2 and
  3 respectively on first use.
- **OV-4**: Tab from the "Trends" toggle through every control this design
  adds; confirm both new/renamed Copy buttons are reachable in visual
  order, and that clicking "Copy student list" never changes the text
  under the class-draft block (the section 6, finding 3 hazard) or vice
  versa.
- **OV-5**: with a screen reader or the browser's accessibility tree
  inspector, confirm "Copy class announcement" and "Copy student list" are
  announced as two distinct names, not truncated to the same "Copy" by
  any surrounding text being read as part of the label.
- **OV-6**: view the panel in both light and dark theme (`html[data-theme]`
  is this app's only theme switch, per `seats.md:305-307`'s own citation)
  and confirm the new section's text meets the same contrast the existing
  `styles.fieldHint`/`styles.draftFeedback` text already meets - this pass
  reuses those classes unchanged (section 2), so it inherits whatever
  contrast they already have; it does not need a NEW contrast check unless
  the Visual/aesthetic seat's own pass on this design finds otherwise.

---

## 9. Residual register

Each entry names an owner, an instrument, and the step that measures it -
a residual missing any of the three is a deletion, per the seat's own
non-negotiable.

- **R-UX-1 - extend the wiring-test family for the new section.** Owner:
  test seat. Instrument: `classTrends.wiring.test.ts` (the existing
  `.student` ban at :128-130 and the panel-source assertions pattern
  already there). Step: once the architect names the exact component
  split (section 1) and the exact data shape (section 3's "out of lane"
  note), the test seat adds source-text assertions that (a) the new
  section's Copy button is labeled distinctly from the class draft's, per
  section 6, and (b) the new section's content is gated on the same
  `report.areas.length === 0` branch as the counted list, per section 4.
- **R-UX-2 - persist the panel's own `expanded` toggle.** Owner: whichever
  seat next touches general class-trends UX debt (not scoped to N13b).
  Instrument: the `localStorage` grep in the Sources section (zero `ta-`
  hits for this control today) plus `ClassTrendsPanel.tsx:88`. Step: add a
  `ta-` key, thread it through all six mounts' varying `defaultExpanded`
  values without changing any mount's current default, and add a
  regression case per mount.
- **R-UX-3 - the shared-state collision risk in section 6, finding 3.**
  Owner: architect. Instrument: `classTrendsDraftState.ts:54-56`'s
  `copy-settled` transition and whatever new component the architect
  designs for the named list. Step: confirm in the architect pass that the
  class-draft control and the new named-list control are two independent
  component instances with two independent local state values (not one
  shared `useState<DraftUiState>`), and that the test seat's oracle
  includes a case exercising both Copy buttons in the same render and
  asserting neither's status text leaks into the other's block.
- **R-UX-4 - the possible reveal-toggle, if the owner wants one.** Owner:
  repo owner (product decision) + whichever seat implements it if adopted.
  Instrument: section 7's named key (`ta-class-trends-names-revealed`) and
  this pass's recommendation against adding it. Step: a single batched,
  non-gating question at the item's next owner touchpoint - "should the
  named list require an extra reveal click for screen-share safety, or
  stay visible whenever Trends is expanded (this pass's recommendation)?" -
  answered either way ends this residual; no further design round is
  needed to apply either answer.
- **R-UX-5 - the "Copy" -> "Copy class announcement" rename is a change to
  shipped behavior.** Owner: implementer wave (flagged so it is not missed
  as an incidental rename). Instrument: `ClassTrendsDraftPanel.tsx:95-102`
  and the existing coupling in `classTrendsDraft.wiring.test.ts:82-93`. NOTE
  (checker correction): the earlier `grep -rn '"Copy"' ...` found nothing
  because the double-quoted `"Copy"` pattern structurally cannot match the
  test's `>Copy<` marker at `:92` - a PATTERN error, not staleness. The
  load-bearing empty-branch guard is `:91` (`not.toMatch(/handleCopy/)`), which
  is label-INDEPENDENT and survives the rename; `:92`'s `>Copy<` check is
  already effectively vacuous (the label sits on its own line, so `>Copy<` never
  appears literally). The rename is therefore test-safe, but the implementer
  must still update any label assertion in the same commit. Step: the
  implementer wave updates the label and any test asserting it in the same
  commit that adds the new button, so the two labels ship together and
  never pass through a state where both buttons read "Copy."

---

## 10. What this pass explicitly did not decide

Per the AC doc's own "Out of lane" section, unchanged here: the exact
mechanism carrying per-student identity into a per-area subset structure,
whether raw-number scores get converted via a per-criterion maximum, the
frozen oracle/sabotage design, and which name a Repo Grades attribution
shows (AC-11/R3) are none of them decided by this UX pass. This design is
written to be correct under any resolution of those that still produces
"a display name string per student, grouped by area, with its own count" -
if the architect's chosen shape cannot produce that, the contradiction
belongs to the architect pass, not to a revision of this document.
