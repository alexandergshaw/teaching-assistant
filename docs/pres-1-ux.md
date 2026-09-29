# PRES-1 UX pass

Seat: `loop-seat` (Sonnet). Round 1 of this artifact; a fresh `loop-checker`
gates it before the architect or any implementer reads it. Design and reading
only - no code was written or run for this pass.

**Consumes** `docs/pres-1-acceptance-criteria.md` (AC-1 through AC-8, LEV-1,
the residual register, and the owner's two fixed decisions: deck format is
`.pptx` via the shipped `buildSlidesPptx`, with an on-page slide PREVIEW for
visibility; Presentations is a new inner-nav sibling reusing existing infra,
`ppt-design` left untouched). Where this document names a mechanism, that
mechanism is a **recommendation for the architect**, not a ruling - shape,
wave ordering and the oracle stay with the architect, plan and test seats per
`docs/loop/seats.md:77-84` and the AC document's own "Out of scope" section.
Nothing here should be read as pre-empting that pass; every place I made a
judgment call that could go a different way is called out explicitly in
section 13 as a recommendation, not a gate.

**Also opened, because "brief from the tree" means checking `docs/` for
sibling PRES-1 artifacts before designing, not only the AC document:**
re-running `ls docs/ | grep -i pres` partway through this pass (other seats
were landing work concurrently) turned up FOUR sibling passes already
committed - `docs/pres-1-architecture.md` (architecture, wave 1 - the
shape-owning seat), `docs/pres-1-data.md` (data/storage, wave 1),
`docs/pres-1-security.md` (security, wave 2), `docs/pres-1-sre.md`
(reliability, wave 2). Per `DEV_LOOP.md`'s own instruction to regenerate
later briefs against what earlier waves established rather than re-deriving
it, this document was revised after opening all four. Several places below
now cite them directly because the architecture pass had already fixed the
exact seam types and reachability ladder this document only estimated
(sections 1, 2, 4, 5, 6, 7 all tightened against it), the security and SRE
passes independently converged on choices this pass had also made (plain-
JSX-text rendering, per-artifact independent status), or a data-pass reading
disagreed with the architecture pass's own shape and is named as an
unreconciled cross-seat conflict rather than silently picked for the reader
(section 2's file-cardinality note, Residual R-UX-8). None of the four had
been checked by a fresh `loop-checker` as of this reading, so they are
treated as informative, not as settled fact where they make an argument
rather than state a measured one - except where the architecture document
states an actual chosen type signature or file, which this pass treats as
the shape to design against, consistent with that seat owning shape.

**Environment ceiling, restated because it binds every claim below**
(`docs/loop/this-repo.md` sections 2 and 6): no component is rendered by any
test in this repo (vitest is node-env, `include: ["src/**/*.test.ts"]`, no
jsdom, no testing-library, no render call). Every claim in this document about
layout, click counts, keyboard order, or what an instructor sees on screen is
a **[READING]** claim derived by opening source files, or an **[OV]**
owner-verification claim that only a deployed-app walk can settle. Each claim
below says which. There is no live database, no API key, and no rendered
browser session available to this seat, so model-output QUALITY (whether a
critique is genuinely useful, whether 3-5 activity ideas come back) is out of
reach here by construction, not by omission - already registered as R-3/R-5 in
the AC document and not re-registered here.

---

## 1. The Presentations tab and Slide Deck Creation child layout

**[READING]** The reuse survey in the AC document (`docs/pres-1-acceptance-
criteria.md:280-287`) already names the mechanism; `docs/pres-1-
architecture.md` (opened partway through this pass - see the note above the
environment-ceiling paragraph) has since resolved the exact wiring, in its
own sections 4-6. This section adds the concrete CONTENT layout inside that
already-resolved surface, since that is this seat's job, not the architect's;
where the two overlap, the architecture document's own file names and line
estimates are cited directly rather than re-described.

**Reused idiom - the inner-nav container.** `PowerPointDesignTab` is the
closest sibling: a single-destination `ManualViewType` mounted per
`src/app/page.tsx:601-603` (`{manualView === "ppt-design" && (<TabShell><Power
PointDesignTab /></TabShell>)}`), rendering its own `TabHeader` at
`src/app/components/ppt-design/index.tsx:626-630` (`eyebrow="Design"`,
`title="PowerPoint Design"`, a one-line `subtitle`). Presentations differs in
one respect the AC document (AC-2) already settled: it must be an **inner-nav**
view like `grading` and `content`, not a single-destination view like
`ppt-design`, because it needs to take a sibling child tab later without
restructuring. The concrete pattern to copy is `grading`'s, not
`ppt-design`'s:

**Resolved by the architecture pass** (`docs/pres-1-architecture.md:141-226`,
its section 5 "Reachability ladder" and the "extensible-child decision"
directly beneath it) - restated here rather than re-argued, since it directly
settles what section 13, item 3 of an earlier draft of this document had
flagged as an open architecture question:

- The new `ManualViewType` member is named `"presentations"`
  (`pres-1-architecture.md:150,197`), added to `MANUAL_VIEW_ORDER` and
  `MANUAL_VIEW_LABELS` (`manual-rail.ts:154-172`), which is what makes
  `isManualViewType` accept it automatically (`:182-184`, built FROM the
  order list - no second hand-maintained list to fall out of sync).
- `INNER_NAV`/`InnerNavViewType` (`manual-rail.ts:192-198`) gains
  `"presentations"`, and `destinations` (`:75-130`) gains a "Presentations"
  group holding an ARRAY of one destination today: `{ id:
  "presentations-slide-deck", label: "Slide Deck Creation", ... }`
  (`pres-1-architecture.md:198-203`) - AC-2's "built so more children can be
  added" is satisfied at the rail level (a second child is one more array
  entry) without threading a full child-selection state for a single child
  yet; the architecture document states plainly what that would cost to add
  later (a `PresentationsView` union, a `normalizePresentationsView`, a `?
  presentationsView=` param, a new `ta-` restore branch - `:210-220`) and why
  it is correctly deferred rather than pre-built.
- `ManualRail.tsx:35-72` needs no change at all - confirmed independently by
  this pass and by the architecture pass (`:175-178`): it already renders
  whatever `getInnerDestinations` returns as a `role="tablist"` of
  `role="tab"` buttons (`styles.lessonInnerTabs` / `styles.lessonInnerTab` /
  `styles.lessonInnerTabActive`, `ManualRail.tsx:56-68`), reading the
  tablist's accessible name from the same table `getInnerDestinations` reads
  (`getInnerNavAriaLabel`, `manual-rail.ts:222-225`) rather than a
  hand-written ternary - the exact mechanism the file's own header comment
  says was added because a hand-written ternary once let a third inner nav go
  out announced with the wrong name (`ManualRail.tsx:29-33`). Reusing it here
  means Presentations inherits a bug class this repo has already paid for,
  for free.
- The mount is a new conditional branch in `page.tsx` (architecture's hop 5,
  `pres-1-architecture.md:172-174`): `{manualView === "presentations" &&
  (<TabShell><SlideDeckCreationTab /></TabShell>)}` - `SlideDeckCreationTab`
  is the architecture document's own name for the surface this section
  designs the content of (`pres-1-architecture.md:121`, file layout table).
  `src/app/page.tsx:601-603`'s single-destination `ppt-design` branch is
  still the wrong one to model the MOUNT shape on; the architecture document
  independently reaches the same conclusion this draft did before it existed
  (the `grading`-family conditionals at `page.tsx:620-650` are the closer
  precedent for a view whose inner nav can grow), and additionally names the
  two hand-edited hops a naive copy of `ppt-design` would miss: the local
  `ManualView` union restated in `useAppNavigation.ts:40-47` (a SECOND copy
  of `ManualViewType` - the same class of hand-list that once dropped
  `"artifact-design"`, `pres-1-architecture.md:166-171`), and
  `getActiveDestinationId`/`resolveStateFromDestinationId`
  (`manual-rail.ts:227-249,285-346`) needing a branch mapping
  `"presentations-slide-deck"` both ways.

**Content layout inside "Slide Deck Creation," in DOM order:**

All inside `SlideDeckCreationTab.tsx`, the architecture document's own name
for this surface (`pres-1-architecture.md:121`, estimated ~320 lines):

1. `TabHeader` (`eyebrow="Presentations"`, `title="Slide Deck Creation"`, a
   one-line `subtitle` naming what it does - matching the exact prop shape
   `ppt-design/index.tsx:626-630` already uses).
2. The context intake panel (section 2), backed by `hooks.ts`
   (`pres-1-architecture.md:123`, ~40 lines, the `ta-` persistence for intake
   and selection).
3. The artifact-selection row and its "Generate" button (section 3).
4. The output area: one block per artifact that has been produced, in the
   fixed order outline, activities, deck, each with its own critique
   attached directly beneath it when review was selected (section 4), and
   the deck's on-page preview - `SlideDeckPreview.tsx`
   (`pres-1-architecture.md:122`, ~90 lines) - plus its Download/Regenerate
   controls living inside the deck's own block (section 5).

This mirrors `PowerPointDesignTab`'s own top-to-bottom shape (header, then
settings/intake, then the generated-content block) rather than a two-column
layout - `docs/loop/seats.md`'s Visual/aesthetic checklist item on container
constraints applies here too: this repo's largest stylesheet has only 7
`resize:` declarations in 7010 lines (`this-repo.md`'s own note, unverified by
me this round since it is that seat's number to re-measure, not mine to
quote as fresh), so a resizable or fixed-width side-by-side layout is the
exception, not the default, and a single stacked column is the safer
choice for a page that will eventually show four artifacts plus a slide
preview.

---

## 2. Context intake panel - paste text and drop/upload files, one place

**Owner's words, AC-3:** "The instructor pastes files/text as context" -
**both** affordances, reaching the same generation path, in-house LLM only.

**The idiom that already ships both together, and is the one to copy almost
verbatim:** `LessonPlanningForm.tsx:87-106`, the "Context" field -

```
<div className={styles.field}>
  <label htmlFor="lessonContext">Context</label>
  <TextField id="lessonContext" multiline minRows={8} fullWidth
    placeholder="Add any background context, notes, or relevant information..."
    value={lessonContext} onChange={...} />
  <div className={styles.fileField}>
    <input id="lessonContextFile" type="file" multiple ref={contextFileRef} />
    <p>Optionally attach any files for additional context.</p>
  </div>
</div>
```

This is the closest existing precedent in the tree to "paste text AND
drop/upload files in one place" - a single `.field` block pairing a large
multiline `TextField` with a `.fileField` file input directly beneath it, both
feeding the same downstream generation call. It already accepts `multiple`
files (`:99`). **This is the base structure to reuse for PRES-1's context
field**, not `ppt-design`'s own "Source (optional)" control
(`GeneratePanel.tsx:100-142`) - that control is a single text field that
holds **either** a repo reference **or** an attached file's name, mutually
exclusive (`disabled={!!sourceReceipt || sourceBusy}` at `:106`, `disabled=
{sourceBusy || sourceRepoText.trim().length > 0}` at `:135`). AC-3 wants both
at once, which `LessonPlanningForm`'s shape already supports and `ppt-
design`'s does not - reusing the wrong one here would ship a control that
cannot satisfy its own acceptance criterion.

**What to layer on top of that base**, from two other existing idioms:

- **Drag-and-drop and paste-from-clipboard**, from
  `TextbookPhotoModal.tsx:146` (`handleFile`, the single funnel every input
  path calls into), `:159-176` (a `paste` listener attached to the dialog's
  own root element, not `document`, removed on unmount), `:285-297` (the
  drop zone itself: `onDragOver`/`onDragLeave`/`onDrop` plus
  `tableStyles.dropZone`, with the border and background swapping on
  drag-active state - `:298-307`), and `:309-324`/`:355-365` (the empty-state
  copy plus a `Choose file` button wired to a hidden `<input type="file">`).
  The class names live in a component-scoped module,
  `CoursesTable.module.css:689,826,834,851` (`.hiddenInput`, `.thumbImage`,
  `.thumbPlaceholder`, `.dropZone`) - reusing the exact classes means either
  importing across component directories or copying the pattern into a new
  module scoped to Presentations; that packaging choice is the architect's,
  not mine, but the **visual behaviour** (dashed border at rest, a thicker
  solid border plus a tinted background while a file is dragged over it) is
  what should carry over, matching this repo's existing drop-zone voice
  rather than inventing a second one.
- **The receipt**, from `src/lib/decks/deck-source.ts:21-30`
  (`DeckSourceReceipt`: `name`, `bytes`, `characters`, `truncated`) and its
  rendered form at `GeneratePanel.tsx:148-153` ("N characters kept
  (truncated to fit the prompt)"). Every file or paste the instructor adds
  should produce one line like this, naming what was kept, not just that
  something was attached - the instructor needs to know a 40-page PDF got
  truncated to fit the prompt budget, the same reason `deck-source.ts` exists
  at all (`DECK_SOURCE_MAX_CHARS = 20000`, `deck-source.ts:19`).
- **The always-visible "what's carried" fieldset**, from
  `GradingRecordingContextPanel.tsx:36-64`: a `<fieldset><legend>Context</
  legend>` wrapping (a) a notice naming what is carried when something is,
  and (b) an "add more" control rendered **unconditionally**, outside the
  gate on whether anything is carried yet - `:44-49`'s own comment states the
  reasoning directly ("an instructor carrying nothing yet is this feature's
  primary case, not an edge case"). For PRES-1 that maps to: the paste
  textarea and the "Attach file" control are always visible and always
  usable, never hidden behind a first click.
- **Individually-removable multi-item lists**, from
  `CarriedKnowledgePages.tsx:113-150`: since `LessonPlanningForm`'s file
  input already accepts `multiple` and the owner's own words list several
  file-shaped things at once (homework, chapter objectives, a lesson plan
  copied from the LMS), the receipt area needs to show one line per
  attached file, each individually removable, not a single combined count -
  this component's pattern (a small local list plus a one-level "Undo" on
  removal, `:113-150`) is the nearest existing shape for that, though it is
  keyed on Knowledge Base page ids and would need a PRES-1-specific
  re-implementation over file names, not a direct import.

**Confirmed against the architecture pass, which landed after this section's
first draft:** `docs/pres-1-architecture.md:254-258` fixes
`PresentationContext` as `{ text: string; sources: PresentationSource[] }` -
an ARRAY of sources, each `{ name, text }` - and section 7's persistence
recommendation names the key `ta-pres-source-receipts` in the PLURAL,
explicitly `DeckSourceReceipt[]` (`pres-1-architecture.md:451`, "mirrors the
`ta-ppt-source-receipt`/`ta-ppt-source-materials` split" but pluralized).
This confirms the multi-file, individually-removable-list design above at the
type level, not just as a UX preference - a single-file model could not
satisfy `sources[]` without always writing a one-element array.

**A cross-seat conflict worth flagging rather than silently resolving:**
`docs/pres-1-data.md:255-268` (the wave-1 data/storage pass) models the same
concern as a SINGULAR `fileReceipt: DeckSourceReceipt | null`, explicitly
reasoning that PRES-1 needs "one more field than `ppt-design` has" beyond a
single receipt. That document and the architecture document disagree on
cardinality - singular there, an array here - and both were opened during this pass. I have no reliable way to tell which
was authored first (no timestamp is available to this seat), but the
architecture seat is the shape-owning tier for this exact kind of decision
(`docs/loop/seats.md`'s Architect row: "the file layout... the exact type
signatures at every seam"), so this design follows architecture.md's plural
`sources[]`/`ta-pres-source-receipts` rather than data.md's singular
`fileReceipt`.
Naming the disagreement here rather than silently picking a side is the
point: whichever seat reconciles `types.ts` at implementation time needs to
know both documents currently disagree, not discover it mid-build. See
Residual R-UX-8.

**Layout, DOM order, inside the panel:**

1. `<fieldset><legend>Context</legend>` (the `GradingRecordingContextPanel`
   idiom).
2. A multiline paste textarea (`.field` + `TextField multiline minRows={8}`,
   the `LessonPlanningForm` idiom), placeholder text naming the intended
   content directly ("Paste this week's lesson materials - homework,
   chapter objectives, a lesson plan copied from the LMS...").
3. The drop zone / "Attach file(s)" control directly beneath it
   (`TextbookPhotoModal` idiom, accepting more than one file since
   `LessonPlanningForm.tsx:99` already sets the precedent with `multiple`).
4. One receipt line per attached file (`deck-source.ts` shape), each with its
   own "Remove" control.
5. A single "Clear context" action that empties both the pasted text and
   every attached file's receipt in one step, reusing `handleClearSource`'s
   shape (`ppt-design/index.tsx:414-419`) - needed because the pasted text
   and file receipts persist across reloads (section 7), so a returning
   instructor starting a NEW week's lesson needs one control to blank the
   panel rather than manually selecting-all-and-deleting a multiline field
   plus removing every file receipt one at a time.

**In-house-only egress ([MACHINE], not mine to build):** the AC document
already scopes this as a source-text/import test over whichever action
extracts the pasted text and files (`docs/pres-1-acceptance-criteria.md:141-
149`). From a UX standpoint the only thing this section adds is: the panel
must render **no** out-link, button, or copy pointing the instructor at an
external authoring tool - not even as a "or use our friend's plugin"
convenience aside - since `AGENTS.md`'s `in-house-ai-only.md` memory is a
hard standing rule the owner has stated is non-negotiable.

---

## 3. Four-artifact selection - checkboxes plus one "Generate" button

**Owner's words, AC-4:** "get back ANY COMBINATION of" the four kinds; "the
instructor chooses which, they are not all-or-nothing" (AC document
requirement 4).

**Why checkboxes plus one button, not four separate per-kind buttons.** The
nearest existing multi-kind generation control in this repo,
`GenerateFromSelectionSection.tsx:253-268`, uses **one button per kind**
("Generate outline," "Generate script," etc.), each an independent trigger -
that fits its own domain (a bulk-selection bar where a user typically wants
exactly one kind at a time) but is the wrong shape here: with four
independent buttons, producing "all four" costs four separate clicks and four
separate round trips, and nothing stops the instructor from believing they
have "generated everything" after clicking only two of four buttons. A
checkbox row plus one "Generate" button matches AC-4's own instrument
directly - "the returned output contains exactly the selected content
artifacts" for one call - and minimizes clicks for the common case (see
section 8) without losing the "any combination" property: every checkbox is
independently toggleable, matching `Checkbox`/`FormControlLabel` already used
this way at `GenerateFromSelectionSection.tsx:239-252` for a single boolean
option.

**Layout:**

```
<fieldset>
  <legend>Artifacts to generate</legend>
  [x] Lecture outline
  [x] Adversarial review (critiques whichever of the above you also select)
  [ ] Activity ideas (3-5)
  [ ] Slide deck
  [Generate]
</fieldset>
```

Four `FormControlLabel`/`Checkbox` pairs in one `.field`-style group (reusing
the `.adaptRow` control-row idiom - referenced 66 times across
`src/app/**/*.tsx,*.css`, `docs/loop/seats.md:264-270`'s own measured count,
not re-measured by me this round since it is that seat's figure to keep
current), followed by one `Button variant="contained"` labelled "Generate,"
matching the label-doubles-as-progress-word convention already used
throughout this file family (`GeneratePanel.tsx:263-269`'s "Generating..."
swap, `GenerateFromSelectionSection.tsx:266`'s identical pattern).

**Order and default state, matching the owner's own described flow** ("paste
the week's materials, get a slide outline plus adversarial review comments,
regenerate the plan from those comments, then do the same for the deck," AC
document `:24-26`): **Outline** and **Adversarial review** default checked,
**Activity ideas** and **Slide deck** default unchecked. This is a
recommendation, not a ruling - flagged again in section 13 - but it is not
arbitrary: it makes the owner's own two-stage narrative the zero-extra-click
path (generate outline plus review first, refine it, then separately add the
deck), rather than requiring two unchecks up front to avoid generating
artifacts the flow does not ask for yet. All four checkboxes stay
independently togglable regardless of default; nothing here forecloses "all
four, immediately," which only costs the two extra clicks to check the
remaining boxes.

**A selection this design must not render silently.** "Adversarial review"
checked with no content artifact also checked is a legal combination of the
control (nothing enforces mutual dependency at the checkbox level) but
produces nothing - there is nothing to critique. The Generate button should
disable in that exact state, with an inline hint ("Select at least one of
outline, activity ideas or slide deck for review to critique") rather than
letting the instructor click Generate and receive an empty, unexplained
result. This is a machine-checkable edge case worth naming to the test seat
explicitly (Residual R-UX-3 below) since AC-4's own instrument only requires
"a representative set of selections" and this one is easy to miss precisely
because it is legal input that produces a degenerate result, not an invalid
one.

**The clobber risk this section's shape creates - the most serious of the
three places this design would mislead the user, covered in full in section
10, finding 1:** once an artifact has already been produced and possibly
refined via "Regenerate with context" (section 5), re-clicking "Generate"
after checking one more box must not silently redo the artifacts that were
already produced and approved. Stated here because it is a direct consequence
of this section's own control shape (one shared Generate button spanning
artifacts in different states of completion), not a downstream concern
introduced later.

---

## 4. Per-artifact display, with its adversarial-review critique attached

**Owner's words, AC-5:** "adversarially reviewed comments/critiques for EACH
thing produced" - "not a single undifferentiated review blob," per artifact,
and never for an artifact that was not produced.

**Reused idiom - the labelled sub-section beside its parent content.**
`GradingResults.tsx`'s `.resultsChecklist` sections (`page.module.css:1871-
1900`; used at `GradingResults.tsx:579-588` for "What earns full credit" and
`:591-603` for "Sample correct answer") are the closest existing pattern for
"a titled block of secondary content sitting directly beside a primary
result" - a bordered, tinted card with an `h3` heading and body content,
visually distinct from but adjacent to the main result above it. That shape
is what a critique block should copy: each produced artifact renders inside
its own primary card, and when review was selected, a `.resultsChecklist`-
styled "Critique" block renders immediately beneath that artifact's own card
- in document order, not in a separate side column. A side-by-side
two-column "artifacts on the left, critiques on the right" layout was
considered and rejected: it would need either a fixed-width container (the
measured rarity of `resize:` in this repo's own stylesheet, cited in section
1, argues against assuming one) or a CSS grid keyed to viewport width, and it
would put more distance between a critique and the specific artifact it
critiques than stacking them, no accessibility gain in exchange (this is a
[READING] judgment; the Accessibility seat's own wave-3 pass owns the final
call on reading order, not this one).

**Layout, DOM order, for the output area as a whole:**

1. **Outline card** (if produced) - the outline's own content, then, if
   review was selected, an "Outline - critique" `.resultsChecklist` block
   directly beneath it, then a "Regenerate with context" button scoped to
   the outline (section 5's mechanism, applied here too - AC-7 applies to
   every artifact kind, not only the deck, per its own object definition:
   "the regenerate action for a **chosen artifact**").
2. **Activity ideas card** (if produced) - same shape: content, critique
   directly beneath if review was selected, its own "Regenerate with
   context."
3. **Slide deck card** (if produced) - the on-page preview (section 5), its
   critique directly beneath if review was selected, Download and
   Regenerate-with-context side by side (section 5).

Each card is independent: a card with no critique beneath it (because review
was not selected, or because that specific artifact was not selected at all)
is not an error state and needs no placeholder - the absence of the "N
critique" block is itself the signal, matching AC-5's "not for a
non-produced artifact" clause directly. The one state that DOES need an
explicit placeholder, not silence, is covered in section 6 and section 10
finding 3: review selected, artifact produced, but that artifact's own
critique has not yet come back (a partial-failure or still-in-flight state),
which must not render identically to "review was never selected."

**Confirmed against the architecture pass's actual seam type**
(`docs/pres-1-architecture.md:272-277`): the per-artifact keying this section
assumes is not a separate map to join against - it is INLINE on the
discriminated `ProducedArtifact` union itself (`{ kind; content; critique:
Critique | null }`), so "a critique for a non-produced kind" is
unrepresentable by construction (there is no `ProducedArtifact` for a
non-produced kind to hang a critique off of at all), which is the exact
"construction over assertion" preference `docs/loop/seats.md:110-114` asks
for. This is a stronger enforcer than the plain `Partial<Record<Kind,
Critique>>` map `docs/pres-1-data.md:184-194` had independently proposed for
the same requirement - both satisfy AC-5, but the architecture document's
version is the one actually seaming `generate.ts` to the tab
(`pres-1-architecture.md:294-328`), so this section's layout renders
`artifact.critique` off each `ProducedArtifact` directly, not a separately
looked-up map.

**A rendering constraint from the security pass, load-bearing for this
section's markup, not just its visual shape**
(`docs/pres-1-security.md:350-393`, section 6): outline text, activity
ideas, and critique text are all model-authored prose - unlike the deck's
own structured `title`/`bullets`, which `GeneratePanel.tsx` already renders
as plain React text nodes with no HTML interpretation
(`GeneratePanel.tsx:374,384-386`). The security pass's finding is direct: if
any of this prose is ever rendered via `dangerouslySetInnerHTML`, it must go
through the existing hardened renderer, `markdownToHtml`
(`src/lib/markdown.ts`, its own `escapeHtml` fix cited at
`pres-1-security.md:356-361`) - never interpolated raw. The simpler,
equally-valid alternative the security pass names, and the one this
section's card layout assumes throughout (plain `<p>`/`<ul>` text nodes, the
same `.resultsChecklist` shape `GradingResults.tsx` already uses for prose),
needs no renderer and carries no XSS surface at all, since React escapes
plain text children by construction. Either is acceptable; rendering
model-authored prose through `dangerouslySetInnerHTML` with NO renderer in
between is the one shape this section rules out, and it is a security
requirement, not a house-voice preference.

---

## 5. The deck: on-page preview, Download, and Regenerate-with-context

**Owner's words, AC-6:** "must be VISIBLE and DOWNLOADABLE on the page,"
resolved by the owner (R-1, AC document `:266-270`) as `.pptx` via
`buildSlidesPptx` for the download, with a distinct on-page preview for
visibility since a `.pptx` does not render inline by itself.

**The preview - reuse `GeneratePanel.tsx:274-418`'s "Preview (N slides)"
block almost as-is, inside the architecture document's own
`SlideDeckPreview.tsx`.** This is the single strongest reuse candidate in the
whole survey: `ppt-design` already renders exactly the shape PRES-1 needs for
its deck preview - a heading counting the slides ("Preview (N slides),"
`:285`), one MUI `Card` per slide (`:318`), each showing the slide's `title`
(`:374`), `bullets` as a `<ul>` (`:384-390`), and `code` as a monospace block
with a language label (`:391-410`) when present - reading directly off the
same `PptxSlide` shape (`src/lib/pptx.ts:19-39`: `title`, `bullets`, `code`,
`codeLanguage`, `notes`, `graphic`) that `buildSlidesPptx` (`pptx.ts:199-223`)
consumes to build the actual file. The architecture pass independently
specifies this exact component (`SlideDeckPreview.tsx`,
`pres-1-architecture.md:122,420-429`, ~90 lines) taking `slides={deck.slides}`
from ONE `DeckContent` (`= GeneratedDeck`) held in the tab's own state, with
the download handler reading the SAME object
(`pres-1-architecture.md:418-437`, section 6.7 "the ONE slide model") -
independently reaching this pass's own conclusion that preview and download
must share one data structure so neither can diverge from the other, and
naming the actual machine-checkable enforcer for it (a wiring test that
`SlideDeckPreview` is passed `deck.slides` and the download handler calls
`serializeDeckToPptx(deck)` on that same `deck`, `pres-1-architecture.md:533-
540`) that this UX pass has no instrument of its own to build - it can only
describe the layout the enforcer protects.

**What must NOT carry over from that reused block: the per-slide Edit
affordance and the destructive "Regenerate" button.** `GeneratePanel.tsx`'s
version lets the instructor edit each slide's title/bullets/code inline
(`:320-370`) and its own "Regenerate" button (`:491-498`) wholesale clears
`generatedDeck`/`editedSlides`/`editingSlideIdx`/`generateError`
(`index.tsx:754-759`) - a fresh-start action, not a context-carrying one.
Reusing that inline-edit affordance is out of scope (PRES-1's AC document does
not ask for slide editing, and the architecture document's own `deck-file.ts`/
`SlideDeckPreview.tsx` file layout has no editing seam), but reusing that
exact "Regenerate" button's semantics would be a direct violation of AC-7 and
LEV-1: AC-7 requires regenerate to **carry** the prior context and prior
critique forward, and `ppt-design`'s own "Regenerate" discards everything and
starts over. The architecture document's own seam confirms the carrying
mechanism precisely: `regenerateArtifact(input: RegenerateInput)`
(`pres-1-architecture.md:279-285,325-327`) takes `priorContext`,
`priorCritique`, `priorContent` (the version being improved), and
`withReview` (whether to re-run the critique after regenerating) - all folded
in **by code**, not by the instructor re-pasting anything, which is the LEV-1
mechanism made concrete. **The label itself must differ** - "Regenerate with
context," not bare "Regenerate" - both because the mechanism differs
(carrying vs. discarding) and because a bare "Regenerate" next to `ppt-
design`'s own identically-named, differently-behaved button (an instructor
who has used both tabs) is exactly the kind of same-label-different-behaviour
trap `n13b-ux.md`'s own "Copy" vs "Copy class announcement" finding
(`docs/n13b-ux.md:348-357`) already identifies as this repo's worst class of
misleading UI. **A UI detail `RegenerateInput.withReview` raises that the AC
document does not decide:** since it is a per-call boolean, not something the
type forces to equal the global review checkbox, the simplest,
click-minimal reading - and this pass's recommendation - is that "Regenerate
with context" always passes the CURRENT value of the review checkbox at
click time, with no separate control asking the instructor to decide review
twice. Recorded as part of Residual R-UX-1.

**Download.** Reuse `handleDownloadPptx`'s idiom
(`index.tsx:545-563`), now routed through the architecture document's own
serializer: `serializeDeckToPptx(deck)` (`pres-1-architecture.md:367-380`,
`src/lib/presentations/deck-file.ts`) wraps `buildSlidesPptx` and returns the
`ArrayBuffer`; wrap it in a `Blob` typed `PRES_PPTX_MIME`
(`pres-1-architecture.md:372-373`, the same MIME string as
`index.tsx:56`'s `PPTX_MIME`), `URL.createObjectURL`, a synthetic anchor
click, then `revokeObjectURL` - the exact idiom `ppt-design` already ships,
pointed at the new serializer rather than `buildOutputPptx`. Button label:
"Download .pptx" (`GeneratePanel.tsx:463-470`'s exact copy) - specific about
the format, not a bare "Download," since the deck is the one artifact in
this feature with a real downloadable file and the label should say what
kind of file it is.

**Layout inside the deck card:** heading ("Preview (N slides)"), the
Card-per-slide read-only preview, then a button row: "Download .pptx"
(primary, `variant="contained"`) and "Regenerate with context" (secondary,
`variant="outlined"`) side by side, matching `GeneratePanel.tsx:462-489`'s
existing button-row shape (`display: flex, gap, flexWrap`).

**A labelling honesty note, not a machine-checkable defect - see section 10,
finding 2.** The Card-per-slide preview renders through MUI (`Card`,
`CardContent`, ordinary HTML `<ul>`/`<pre>`), while the actual `.pptx` is
built by `pptxgenjs` with its own fonts, layout and (per `PptxSlide.graphic`)
shapes/tables the HTML preview does not attempt to reproduce
(`pptx.ts:32-38`). The two will not look identical. The preview block's own
heading or a one-line caption beneath it should say so plainly - e.g. "Preview
of slide content - the downloaded file may look different" - so "visible" is
never mistaken for "pixel-accurate," which AC-6's own instrument already
guards against for the opposite failure (an invisible enforcer standing in
for a real render, `docs/pres-1-acceptance-criteria.md:206-209`); this is the
same honesty principle applied to the content-vs-appearance gap instead.

**Independently reinforced by the security pass, for a different reason.**
`docs/pres-1-security.md:383-393` (section 6) arrives at the same plain-
text-Card-preview design from a security angle: it recommends building AC-6's
"visible" requirement from "the SAME structured `title`/`bullets`/theme data
already used to build the `.pptx`... and already rendered safely as plain
text in `GeneratePanel.tsx:374-386` - i.e., a client-side slide-shaped layout
built from data the app already has and already renders safely, not a
rendering of the `.pptx` BINARY itself," closing both an XSS question and an
egress question in the one recommendation. Two seats reaching the same
concrete design from different starting concerns (UX honesty here, XSS/
provenance there) is corroborating, not redundant - it means the reused
`GeneratePanel.tsx` Card pattern is not just convenient, it is the load-
bearing choice for both concerns at once.

---

## 6. Empty, loading, and partial-failure states

**The AC document's own ceiling, restated as the design constraint it is**
(`docs/pres-1-acceptance-criteria.md:33-37`): "AC must not render a
misleading blank" when one artifact fails while others succeed. Each of the
four artifact slots needs its **own** independent status, not one status for
the whole Generate action, because a single shared "busy"/"error" flag cannot
represent "outline succeeded, deck failed" - exactly the state this
requirement exists to protect.

**Per-artifact state machine (four independent instances, one per
checkbox-selected kind):**

| State | Rendered as | Reused idiom |
|---|---|---|
| Not selected | Nothing at all for that slot - no card, no placeholder | (absence is the signal, AC-5) |
| Selected, not yet requested | Nothing yet - the slot only appears once Generate has been clicked | - |
| Selected, in flight | The slot's heading plus `role="status" aria-live="polite"` and a `CircularProgress`, label swapped to "Generating..." | `GeneratePanel.tsx:263-269` |
| Selected, succeeded | The artifact's card (section 4), critique beneath if review was selected and has also returned | `GradingResults.tsx`'s `.resultsChecklist` |
| Selected, review selected, artifact succeeded, critique still in flight or not yet returned | The artifact's card, plus a distinct "Critique pending..." placeholder in the critique's position - **never blank**, and never identical in markup to "review was not selected" (section 10, finding 3) | new for this feature - no exact precedent, closest analogue is the loading state above |
| Selected, failed | A `--danger-surface`/`--danger-border`/`--danger` banner in that slot's position, naming which artifact failed and (if available) why - the OTHER slots' states are untouched | `GeneratePanel.tsx:241-255`'s error banner styling, reused per-slot instead of once globally |
| Selected, succeeded, save/regenerate action in flight | A local busy indicator on that action's own button ("Regenerating...", "Saving...") without disturbing the artifact's own already-rendered content | `GeneratePanel.tsx:471-479`'s "Saving..." button-label swap |

**This table is a UX rendering of a data shape the reliability pass
independently specified.** `docs/pres-1-sre.md:106-119` recommends modelling
each artifact as a discriminated per-artifact record - one of `{ kind,
status: "ok", content, critique? }`, `{ kind, status: "error", message }`, or
`{ kind, status: "not-selected" }` - explicitly because "a shared string
cannot say WHICH of four artifacts failed," and extends the same three-way
discipline to the REVIEW of each artifact, "so a produced-but-unreviewed
artifact is visibly different from a produced-and-reviewed one." That is the
same distinction this table's fifth row (critique pending) and section 10's
finding 3 both name from the UX side - two seats converging on "this must be
a discriminated status per slot, not a shared boolean" from reliability and
UX starting points respectively. The mechanism that makes each slot
INDEPENDENTLY resolvable in the first place is the architecture document's
own recommendation that the client dispatch one action call per selected
content kind (`docs/pres-1-architecture.md:409-416`, section 6.6) - each
kind's own request settling on its own schedule is what makes "outline
succeeded while deck is still loading" a normal, representable state rather
than an edge case a single combined call would have to simulate.

**A race the state machine above must also survive, named by the
reliability pass, not by this one.** `docs/pres-1-sre.md:425-451` (section
4.2) documents a race a plain busy-boolean cannot catch: if the pasted
context or the selection changes WHILE a regenerate call for artifact X is
still in flight, that call's eventual result must not silently overwrite
content the instructor has since moved on from. Concretely for this design:
if the instructor clicks "Clear context" (section 2) or edits the paste
field while a "Regenerate with context" call is in flight for some artifact,
the stale response, when it arrives, must be discarded rather than applied.
This pass's own recommendation, consistent with SRE's "Pattern A" analysis
in the same section (`pres-1-sre.md:390-402`): disable "Clear context" and
the paste field's own generation-triggering effect (not typing itself, just
whatever would start a NEW call) while any generation or regenerate is in
flight, so the race is avoided at the UI level rather than only patched at
the data layer - stated as a recommendation for the architect to weigh
against SRE's own Pattern A/B fork (`pres-1-sre.md:404-423`), not a ruling.

**Empty state for the whole panel, before anything has ever been generated:**
the context intake panel and the checkbox row render exactly as described in
sections 2 and 3; the output area (section 1, item 4) renders nothing at all
- no "no artifacts yet" placeholder card, matching `GenerateFromSelectionSect
ion.tsx:180`'s own precedent of returning `null` rather than rendering an
empty-state message when there is nothing to show yet, since the checkbox row
and the Generate button above it already communicate the same thing more
usefully than a static placeholder would.

---

## 7. Persistence - `ta-` keys, and a hydration question this pass raised and the architect resolved

**House rule** (`AGENTS.md` memory `persist-ui-control-state.md`, restated in
AC-8): every new textbox/select/checkbox persists across reloads via
localStorage `ta-` keys.

**What persists, and under what key - the architecture document has already
named these** (`docs/pres-1-architecture.md:448-455`, superseding an earlier
draft of this section that guessed at four separate selection keys before
that document existed):

| Control | Key | Shape |
|---|---|---|
| Pasted/typed context text | `ta-pres-source-text` | `string` |
| Attached-file receipts | `ta-pres-source-receipts` | `DeckSourceReceipt[]` (plural - section 2's multi-file design) |
| Extracted file materials text | `ta-pres-source-materials` | `string` |
| All four selection checkboxes together | `ta-pres-selection` | `ArtifactSelection` (`{ outline, activities, deck, review }`, one object, one key - not four keys) |

Naming follows the existing `ta-ppt-*` convention's own shape (`ta-ppt-
source-receipt`, `ta-ppt-source-materials`, `ppt-design/hooks.ts:118,122`),
pluralized where PRES-1's own shape is plural (section 2). The selection is
ONE key holding one object, not four independent keys - this section's own
first draft split it into four before opening the architecture document; the
architecture document's choice is more consistent with `ArtifactSelection`
being a single seam type (`pres-1-architecture.md:247-252`) that the
generation call takes as one argument, and is followed here instead.

**Generated artifact content itself is deliberately NOT listed above.** The
outline/activities/deck/critique text a Generate click produces is
session-only in this design, not persisted - AC-8 only requires the pasted
context and the selection controls to survive a reload; nothing in the AC
document asks generated output to survive one, and `ppt-design`'s own
generated deck state (`useGenerationState`, `hooks.ts:193-241`) is
`useState`, not persisted, either (only `subject`/`audience` are, via
`ta-ppt-gen-subject`/`ta-ppt-gen-audience` at `hooks.ts:195-196`). This is
worth naming explicitly rather than leaving it ambiguous - a reload during a
session loses in-progress artifacts and their critiques, same as `ppt-
design` already does for its own generated deck today.

**A concern this section's first draft raised and the architecture pass has
since resolved - kept here as a record of the correction, not restated as an
open question.** AC-8's own instrument (`docs/pres-1-acceptance-
criteria.md:250-254`) requires: "any `ta-`-seeded initial value is applied
through a mount effect, not only a `useState` initializer" - citing the
`persisted-details-open-hydration` memory directly. Before opening the
architecture and data documents, this pass had flagged `useLocalStorageState`
(`ppt-design/hooks.ts:15-36`) as a possible unproven instance of exactly that
failure shape, since its seed comes entirely from a `useState` initializer
(`:16-25`) with no companion mount effect - the same shape
`docs/REGRESSION.md:44873-44877` names as "a shape that has previously failed
in this repo," for two OTHER controls entirely. **Both sibling documents
address this directly and reach the same practical conclusion by different
routes:**

- `docs/pres-1-architecture.md:464-475` (the architecture pass's own
  "Hydration rule") narrows the failure to a specific SHAPE, not a general
  property of `useState`-seeded values: for controls bound to `value`/
  `checked` (a text field, a checkbox - exactly what PRES-1's context field
  and selection checkboxes are), the persisted value reconciles correctly on
  reload; the one documented hazard is a `<details open={persisted}>`
  ATTRIBUTE, which does not reconcile because it is not a value/checked
  binding. Its design constraint for the implementer: no persisted
  open/visibility state may be driven by a `<details open={...}>` attribute -
  use conditional rendering instead, or a mount effect if a `<details>`-
  shaped control is used anyway.
- `docs/pres-1-data.md:389-413` reasons from a different angle (no
  server-rendered markup exists for a `manualView`-gated inner tab to
  mismatch against in the first place, since nothing mounts it before a
  client-side tab switch) and reaches the same "safe to reuse as-is"
  conclusion, filing it as its own residual (R-D9) for the architect to
  confirm or overrule.

**This pass follows the architecture document's more specific ruling**, since
none of the controls this design specifies (section 2's paste field and file
attach, section 3's four checkboxes) is a `<details>`-shaped collapsible -
every persisted control here is a plain value/checked binding, exactly the
case the architecture document says reconciles correctly. The residual below
(R-UX-4) is narrowed accordingly: it is no longer "build a new hook," it is
"confirm the implementer introduces no `<details open={persisted}>` control
anywhere in this design" - which, on the layout this document actually
specifies, should already hold true by construction, but is worth a
concrete instrument rather than an assumption, since a later revision could
add a collapsible section (e.g. "show more" on a long outline) without
revisiting this paragraph.

---

## 8. Click counts (house rule: count twice - first use and repeat use)

**[READING]**, walked against the layout specified in sections 1-5 above -
this is a **designed** count against a not-yet-built surface, not a measured
count against a running app (nothing renders here to measure against). OV-3
below is the walk that confirms these numbers once the surface exists.

**First use - the owner's own described flow** (paste materials, get outline
plus review, regenerate the outline, then do the same for the deck), starting
from the Tools tab with no manualView chosen yet, no `ta-pres-*` keys set:

| Step | Action | Clicks |
|---|---|---|
| 1 | Click "Presentations" chip in the Tools rail (lands directly on Slide Deck Creation - the sole child auto-activates, same as `grading`'s own default-destination behaviour, `manual-rail.ts:246`: `` `grading-${gradingView}` `` resolves immediately from the persisted/default `gradingView`, no second click needed) | 1 |
| 2 | Click into the paste textarea and type/paste the week's materials | 1 |
| 3 | Outline and Review are pre-checked by default (section 3) - no click needed | 0 |
| 4 | Click "Generate" | 1 |
| 5 | Read the outline and its attached critique | 0 |
| 6 | Click "Regenerate with context" under the outline | 1 |
| 7 | Read the regenerated outline and its critique | 0 |
| 8 | Click the "Slide deck" checkbox to add it | 1 |
| 9 | Click "Generate" again (additive - produces only the newly-checked deck, does not redo the already-approved outline; see section 10, finding 1, and section 13's recommendation that Generate be additive rather than a full-selection-from-scratch redo) | 1 |
| 10 | Read the deck preview and its critique | 0 |
| 11 | Click "Regenerate with context" under the deck, if the critique warrants a redo | 1 |
| 12 | Click "Download .pptx" | 1 |

**Total: 8 clicks** for the full described flow (paste, generate outline plus
review, regenerate the outline once, add and generate the deck, regenerate
the deck once, download). Attaching a file instead of, or in addition to,
pasting text adds exactly 1 click ("Attach file" / drag-drop needs 0 clicks
but is not the countable path) over this base count, matching
`TextbookPhotoModal.tsx:319-323`'s own "Choose file" affordance.

**Repeat use - a second week's lesson, same session or after a reload, same
artifact combination as last time (outline plus review), materials already
selected via the "Clear context" control from section 2:**

| Step | Action | Clicks |
|---|---|---|
| 1 | Click "Presentations" chip (only needed if a different tab is currently active) | 1 |
| 2 | Click "Clear context" | 1 |
| 3 | Click into the paste textarea, paste this week's materials | 1 |
| 4 | Selection already persisted from last time (outline plus review) - no click | 0 |
| 5 | Click "Generate" | 1 |

**Total: 4 clicks**, against 8 for the equivalent first-use portion (steps
1-4 and 9 above, i.e. reaching a produced outline plus review without any
regenerate cycle) - the saving comes entirely from the persisted selection
(AC-8) needing no re-clicking, mirroring the shape of the grading-flow
precedent `docs/loop/seats.md:191-194` already cites (a flow that is cheaper
on repeat specifically because context/selection survives, not because the
work itself got smaller).

---

## 9. Keyboard story, and the collision check the checker brief requires

**[READING].** No new global key binding is introduced anywhere in this
design - every control is a plain MUI `TextField`, `Checkbox`, or `Button`,
reached by ordinary Tab order, activated by Enter/Space on buttons and
checkboxes, exactly as `LessonPlanningForm.tsx`, `GeneratePanel.tsx` and
`GenerateFromSelectionSection.tsx` already work today. Two things checked
explicitly, both clean:

- **The paste textarea must never treat Enter as "submit."** It is
  `multiline` (matching `LessonPlanningForm.tsx:79`/`:91`/`:111`'s own
  `multiline` fields, none of which binds Enter to anything), so a literal
  newline is the only behaviour Enter should ever produce there - Generate
  stays a button click, never an Enter-to-submit shortcut on this field. If
  a future revision ever wants an Enter shortcut on a single-line field in
  this feature (there is none in this design), the house rule already
  documented at `ChatComposer.tsx:8-14` applies: a multiline field's
  `onKeyDown` must live in MUI's `slotProps.input` (reaches the real
  `<textarea>`), never `htmlInput`, where it silently never fires.
- **No collision with the two existing `window`-level `keydown` handlers this
  repo has.** `useRecorder.ts:877-895`'s `r`/`p`/`m` shortcut layer is gated
  on its own `active` flag (`:879`, `if (!active) return`), true only while
  the Recording tab is the active view - Presentations is a different
  `ManualViewType` entirely, so this handler is inert whenever Presentations
  is showing. The snapshot-grading surface's own window-level shortcut layer -
  extracted out of `SnapshotGradingPanel.tsx` into its own hook (`this-repo.md`'s
  own note on that extraction) - lives at
  `useSnapshotKeyboardShortcuts.ts:80-121`, gated the same way: `onKey`
  computes `isEligible` from `isActive: activeRef.current` (`:84`) before
  doing anything, via `isSnapshotShortcutEligible` (`:80-90`). Corrected here
  after opening the file: `docs/loop/leverage.md`'s own LIVE-LOOP citation
  names `SnapshotGradingPanel.tsx:516-558` for this mechanism, and that range
  is now a clipboard-paste handler (`useEffect` at `:547`, `handlePaste` at
  `:550`), not
  a keydown layer - the keydown wiring moved to the hook above. Neither this
  handler nor `useRecorder.ts`'s reaches Presentations under any of the
  `ManualViewType`/`gradingView` values this design touches.

Tab order, real focus visibility, and ARIA naming beyond what is stated above
are the Accessibility seat's wave-3 pass, per `docs/loop/seats.md:183-208`'s
own boundary between the User experience and Accessibility rows - not
re-derived here.

---

## 10. The three places this design would mislead the user

**Finding 1 of 3 - the most severe, and load-bearing (a state-model fix, not
a copy fix):** section 3's shared "Generate" button spanning artifacts in
different states of completion. If a second "Generate" click, made after
checking one more box, re-produces **every currently-checked** artifact from
scratch - including ones already produced and already refined via
"Regenerate with context" - it silently discards approved work with no
warning and no visible difference in the button the instructor just clicked.
This is the state-model shape flagged inline in section 3 and again in the
click-count walk (section 8, step 9): "Generate" must be scoped to
not-yet-produced, currently-checked artifacts only; redoing an
already-produced artifact must require its own explicit "Regenerate with
context" click, never a side effect of adding a different artifact to the
selection. This is a recommendation for the architect's state design
(section 13, item 1), not something a button label alone can fix - the
control needs to actually behave this way, or a truthful label ("Generate
new selections") would just describe a bad default rather than prevent it.
**The architecture document makes this concrete rather than hypothetical:**
its own recommendation that the client dispatch one action call per selected
content kind (`pres-1-architecture.md:409-416`) means the click handler
already has to decide, per kind, whether to call at all - this finding's fix
is simply that the per-kind decision must also check "has this kind already
been produced," not only "is this kind currently checked." The
`RegenerateInput.priorContent` field (`pres-1-architecture.md:283`, "the
version being improved") independently confirms the tab's state must retain
each artifact's last-produced content distinctly in order for regenerate to
work at all - which is the same state an over-eager "Generate" must not be
allowed to clobber.

**Finding 2 of 3 - load-bearing for the caption, decorative for the layout:**
section 5's on-page slide preview, built from HTML/MUI, will not visually
match the `.pptx` file `pptxgenjs` actually produces (different fonts,
layout, and any `PptxSlide.graphic` shapes/tables the preview does not
attempt to render, `pptx.ts:32-38`). Left unlabelled, an instructor could
reasonably read "visible on the page" as "this is what the file looks like"
and be surprised on opening the download. The fix is one caption line next to
the preview heading, not a rebuild of the preview - decorative in effort,
load-bearing in honesty, since AC-6 explicitly rules out satisfying
"visible" with a construct that misrepresents what was actually produced.

**Finding 3 of 3 - load-bearing, ties directly to the AC document's own
"must not render a misleading blank" ceiling:** an artifact card with no
critique beneath it must mean one of two different things depending on
state, and they must never share the same markup. "Review was not selected"
(nothing to show, by design, per AC-5) and "review was selected but its
critique has not returned yet, or failed" (something is missing that should
be there) look identical if both are rendered as silence. Section 6's state
table names the fix: a distinct "Critique pending..." (or a failure banner)
placeholder for the second case, never sharing a render branch with the
first. An implementer collapsing both into one `{critique && <Critique
.../>}` guard - the natural-looking shortcut - reproduces this exact failure;
naming it here is what makes it checkable at the wave-plan and test-seat
stage rather than discovered after ship.

---

## 11. Copy - exact strings for empty, loading, partial, and error states

All emoji-free and arrow-glyph-free, matching this repo's house voice
(plain, direct, no exclamation points) as seen throughout `GeneratePanel.tsx`
and `LessonPlanningForm.tsx`:

- Context paste placeholder: "Paste this week's lesson materials - homework,
  chapter objectives, a lesson plan copied from the LMS..."
- Empty file state (inside the drop zone): "Drag and drop files here, paste
  one, or choose a file."
- Receipt line: "{characters} characters kept" / "{characters} characters
  kept (truncated to fit the prompt)" - reused verbatim from
  `GeneratePanel.tsx:149-152`.
- Checkbox row legend: "Artifacts to generate"
- Review checkbox label: "Adversarial review (critiques whichever of the
  above you also select)"
- Disabled-Generate hint (review checked alone): "Select at least one of
  outline, activity ideas or slide deck for review to critique."
- Per-slot loading label: "Generating..."
- Critique-pending placeholder: "Critique pending..."
- Per-slot failure banner: "Could not generate the {outline / activity ideas
  / slide deck / review} - {reason, if available}." (one banner per failed
  slot, never a single combined failure message covering more than one slot)
- Deck preview heading: "Preview ({N} slides)"
- Deck preview caption: "Preview of slide content - the downloaded file may
  look different."
- Download button: "Download .pptx"
- Regenerate button (every artifact, not only the deck): "Regenerate with
  context"
- Clear-context action: "Clear context"

---

## 12. Reading claims vs. owner-verification - the walk

Everything above sections 8-11 in particular is a [READING] claim against
source and against the AC document's own citations, not a measurement of a
running app. **Owner-verification walk**, extending R-4/R-5 already recorded
in the AC document AND R-A5 already recorded in `pres-1-architecture.md:686`
(the same walk, named a third time by a third seat - owner: repo owner;
instrument: the deployed app; step: post-deploy owner walk - not repeated per
item below except where it differs). OV-1 and OV-2 below are the same
underlying walk as AC's R-4 and architecture's R-A5; naming it a third time
here is not a third residual to file, it is this pass's own explicit line on
a walk two sibling documents already own, so the orchestrator does not
accidentally file three near-duplicate backlog rows for one owner-verification
step:

- **OV-1** (from the AC document's R-4 and architecture's R-A5, unchanged):
  the "Presentations" chip is reachable in the Tools rail, and "Slide Deck
  Creation" appears beneath it and survives a reload.
- **OV-2** (from the AC document's R-4 and architecture's R-A5, unchanged): a
  generated deck is visibly rendered on the page and downloads as a working
  `.pptx`.
- **OV-3**: walk the click counts in section 8 against the deployed surface
  for one real lesson - paste materials, generate outline plus review,
  regenerate the outline, add and generate the deck, regenerate the deck,
  download - and confirm the counts match 8 on first use and 4 on the
  repeat-use path described there.
- **OV-4**: Tab through every control this design adds (context paste field,
  file attach, four checkboxes, Generate, each artifact's Regenerate-with-
  context, Download) and confirm all are reachable in visual order with no
  control skipped or trapped.
- **OV-5**: check one selection with review checked alongside exactly one
  content artifact, generate, and confirm the critique renders directly
  beneath that one artifact and nowhere else - then deselect review and
  confirm no critique placeholder of any kind appears for a fresh
  generation.
- **OV-6**: force a partial failure (if the deployed environment allows
  simulating one - otherwise this step is itself blocked pending a real
  failure) with two artifacts selected, and confirm the failed slot shows an
  error banner while the succeeded slot renders normally, per section 6's
  state table - this is the direct walk of AC's "must not render a
  misleading blank" ceiling.
- **OV-7**: click "Generate" a second time after checking one additional
  box, with at least one artifact already produced and already regenerated
  once; confirm the already-produced artifact's content is untouched by the
  second click (section 10, finding 1's hazard) and only the newly-checked
  artifact is produced.
- **OV-8**: view the panel in both light and dark theme (`html[data-theme]`
  is this app's only theme switch) and confirm every reused class
  (`.field`, `.fileField`, `.fieldHint`, `.resultsChecklist`,
  `.lessonInnerTab*`) reads with the same contrast it already has elsewhere,
  since this design introduces no new colour value of its own - it inherits
  whatever contrast those classes already carry.

---

## 13. Recommendations on open forks - stated, not gated

Per `AGENTS.md`'s standing rule that a fork gets a recommended reading acted
on rather than left as a blocking question, and per this seat's brief to
recommend rather than gate: two places in this document made a judgment call
the architect could reasonably resolve differently (a third, the inner-nav
list shape, was an open question in this document's first draft and has
since been resolved by the architecture pass - see the note below), named
explicitly so the checker and the architect can see exactly where and why.

1. **"Generate" must be additive (produces only not-yet-produced,
   currently-checked artifacts), not "regenerate everything currently
   checked."** This is the section 10/finding-1 recommendation, now
   concretely groundable in the architecture document's own per-kind client
   dispatch (`pres-1-architecture.md:409-416`) and `RegenerateInput.prior
   Content` (`:283`) - see section 10's updated finding 1. The alternative -
   Generate always reproduces the full current selection from scratch - is
   simpler to implement but silently destroys approved, regenerated work,
   which is a worse outcome than the extra state tracking additive semantics
   need. Recommended: additive, implemented as "the per-kind dispatch loop
   skips any kind that already has a `ProducedArtifact` in state." Cost of
   being wrong: if the architect instead ships "regenerate everything," every
   regenerate cycle becomes fragile to any later checkbox change, and the fix
   is a state-model change, not a copy change, after the fact. This
   recommendation also carries the `RegenerateInput.withReview` UI detail
   named in section 5: recommended to always mirror the live review checkbox
   at click time, no separate control.
2. **Default checkbox state is {outline: on, review: on, activities: off,
   deck: off}**, not all-four-on or all-four-off. Recommended because it
   matches the owner's own two-stage narrative with zero extra clicks
   (section 3). Cost of being wrong: trivial - a default is a one-line
   change with no structural consequence, unlike finding 1 above.

**Resolved, not a fork any more - kept here only as a record of what this
document no longer needs to ask.** An earlier draft of this section carried a
third item recommending the inner-nav view union for "Slide Deck Creation" be
built as a list of one from day one, rather than a single-destination mount
that would need restructuring later. The architecture pass has since settled
this directly (`pres-1-architecture.md:190-225`, "the extensible-child
decision") with exactly that shape - `INNER_NAV`/`destinations` gets an array
entry now, and the leaf-level child-selection plumbing (`PresentationsView`
union, `ta-` restore branch, `page.tsx` mount switch) is deliberately deferred
until a real second child exists, stated as a genuine cost trade rather than
an oversight. Section 1 now cites that resolution directly instead of
recommending toward it.

**A cross-seat conflict, not a fork of this pass's own making, restated here
for visibility:** section 2's file-cardinality disagreement between
`pres-1-architecture.md` (plural `sources[]`/`ta-pres-source-receipts`) and
`pres-1-data.md` (singular `fileReceipt`) is not a UX judgment call this pass
can resolve by recommendation - it is two sibling documents stating different
seam types for the same field. Filed as Residual R-UX-8, owner the
orchestrator/architect, not recorded as one of this section's own numbered
recommendations because this pass has no standing to arbitrate between two
higher-tier documents' type signatures.

None of the three blocks this document from shipping as a recommendation for
the next wave; each is also carried into the residual register below with an
owner and a step.

---

## 14. Disposition table

Not applicable. This is the first UX pass for PRES-1 - no prior PRES-1 UX
document exists to restructure (confirmed: `ls docs/ | grep -i pres` returns
only `pres-1-acceptance-criteria.md`), so there is nothing to map to kept /
handed-over / withdrawn.

---

## 15. Residual register

Each entry names an owner, an instrument, and the step that measures it - a
residual missing any of the three is a deletion, per this seat's own
non-negotiable.

- **R-UX-1 - the additive-Generate state model (section 10, finding 1;
  section 13, item 1).** Owner: architect (the per-kind client dispatch is
  already named at `pres-1-architecture.md:409-416`; what remains is the
  "skip if already produced" clause this pass recommends adding to it, plus
  the `RegenerateInput.withReview` UI default named in section 5). Instrument:
  a source-text/wiring test on the tab's per-kind dispatch loop, plus the
  test seat's oracle asserting that checking a new box after an artifact has
  already been produced and regenerated once leaves that artifact's content
  unchanged and triggers a `callLlm` call only for the newly-checked kind
  (mirrors AC-4's own mocked-`callLlm` call-record instrument,
  `docs/pres-1-acceptance-criteria.md:158-169`). Step: wave 3 (the tab), per
  `pres-1-architecture.md`'s own wave plan (section 8).
- **R-UX-2 - the review-checked-alone degenerate selection (section 3).**
  Owner: test seat. Instrument: a selection-oracle case with only "review"
  checked and nothing else, asserting Generate is disabled (or, if the
  architect instead allows the click, that it produces an explicit "nothing
  to review" result rather than an empty, unexplained one). Step: added to
  the same oracle AC-4's own instrument already builds
  (`docs/pres-1-acceptance-criteria.md:158-169`).
- **R-UX-3 - the critique-pending vs. critique-not-selected render
  distinction (section 6; section 10, finding 3).** Owner: implementer wave.
  Instrument: a source-text/wiring test asserting the two states render
  through different branches (e.g. a discriminated `"not-selected" |
  "pending" | "ready" | "error"` critique status, never a single `{critique
  && ...}` guard collapsing "not selected" and "pending" together). Step:
  the wave that builds the per-artifact card, gated by this assertion before
  merge.
- **R-UX-4 - narrowed after the architecture pass resolved the general
  hydration question (section 7): confirm no `<details open={persisted}>`
  control is introduced.** Owner: implementer wave (`hooks.ts`,
  `SlideDeckCreationTab.tsx`). Instrument: a source-text assertion that no
  `<details` with a persisted-boolean-bound `open` prop appears anywhere in
  the new files, per the architecture document's own design constraint
  (`pres-1-architecture.md:464-475`) - this design's own controls (a text
  field, four checkboxes) are value/checked-bound, not `<details>`-shaped, so
  this should hold trivially, but is worth a concrete instrument rather than
  an assumption a later "show more" revision could quietly violate. Step:
  wave 3, alongside the AC-8 instrument the test seat already owns.
- **R-UX-5 - the component-scoped drop-zone classes (section 2).** Owner:
  architect / visual-aesthetic seat (wave 3). Instrument:
  `CoursesTable.module.css:689,826,834,851` versus wherever Presentations'
  own styles live. Step: the architect's file-layout decision states whether
  Presentations imports across `components/courses` or gets its own copy of
  the drop-zone rule set - either is acceptable, but it must be a stated
  decision, not an accidental cross-directory import discovered at review.
- **R-UX-6 - the preview-honesty caption (section 5; section 10, finding
  2).** Owner: implementer wave. Instrument: a source-text assertion that
  the deck preview block renders a caption distinct from its heading, stating
  the preview may not visually match the downloaded file. Step: the wave
  that builds the deck preview card.
- **R-UX-7 - all owner-verification items (OV-1 through OV-8, section
  12).** Owner: repo owner. Instrument: the deployed app, a real generation
  run, both themes. Step: post-deploy owner walk, the SAME step already
  recorded as R-4/R-5 in the AC document and as R-A5 in
  `pres-1-architecture.md:686` - not a fourth step to schedule, restated here
  so each OV item has its own explicit line rather than being folded silently
  into one shared bullet across three documents.
- **R-UX-8 - the file-cardinality conflict between sibling wave-1
  documents (section 2; section 13).** `pres-1-architecture.md:254-258,451`
  models the context's attached files as a plural array
  (`PresentationSource[]`, `ta-pres-source-receipts`); `pres-1-data.md:255-
  268` independently models the same field as a singular
  `fileReceipt: DeckSourceReceipt | null`. This design follows the
  architecture document's plural shape (section 2's reasoning), but the two
  documents themselves have not been reconciled with each other. Owner: the
  orchestrator, or the architect on the next round of `pres-1-architecture.md`
  if one is dispatched. Instrument: a diff of the two cited type definitions
  plus whichever one `src/lib/presentations/types.ts` actually ships with.
  Step: before wave 1 implementation of `types.ts`/`hooks.ts`, since building
  against the wrong cardinality would need every downstream consumer (the
  intake UI, the persistence hook, the prompt builder) rewritten once the
  conflict surfaces.

---

## 16. What this pass explicitly did not decide

Per the AC document's own "Out of scope for this document" section - and now
also largely settled by `docs/pres-1-architecture.md`, opened partway through
this pass, per the note at the top of this document: the exact seam types,
file layout, and per-kind client dispatch mechanism are the architecture
document's own sections 4-6, cited directly throughout sections 1-7 above
rather than re-derived. What genuinely remains open after both documents:
whether the per-kind dispatch loop actually implements the "skip if
already-produced" clause this pass recommends (R-UX-1), the exact discriminated
per-artifact status type (SRE's recommendation in section 6, not yet a chosen
type in any document), the file-cardinality conflict between the architecture
and data documents (R-UX-8), the wave ordering already fixed by architecture's
own section 8 (not restated here), and the oracle/sabotage design and the
LEV-1 removal-test construction, which belong to the test seat. This document
names the UX-visible constraints those still-open pieces must satisfy
(additive semantics, per-slot independent state, the critique-pending
distinction, the single-slide-model preview) without picking the mechanism
that satisfies them - that boundary is deliberate, not a gap this pass ran
out of room for.
