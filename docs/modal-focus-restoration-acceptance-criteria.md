# Focus returns to the opener - AC4's undelivered half

Five waves gave 30 dialogs a shared dismissal/focus mechanism. Restoration
shipped at ONE of them. REGRESSION entry 282 records this as the project's
largest undelivered promise, and
`docs/modal-dismissal-focus-acceptance-criteria.md` AC4 and decision 9 are the
criteria this change is measured against - it adds no new ones.

The reason it was deferred four times is real: restoration needs each modal's
OPENER to capture a ref at click time, and openers live in parent components, so
it pulls ~40 files into what were otherwise mechanical waves. It is now its own
project.

## The finding that shapes the design

A survey of all 30 traced every opener. Most are NOT stable. They are buttons
inside a filterable table row, a bulk-action bar that unmounts when the selection
clears, a disclosure that can collapse, or a list item that the dialog's own save
REMOVES. `AccessibilityCenter`'s per-issue "Fix" button is the sharpest case: on
save, the issue disappears from the list, so the opener is reliably disconnected
by the time the dialog closes - on the single most common path through that
feature.

Today `restoreTarget` returns `null` for a disconnected node and nothing is
focused, which leaves focus on `<body>`. **AC4 forbids exactly that.** So
restoration cannot be "capture one ref and restore it"; it has to degrade.

## Decisions taken up front

1. **Ordered candidates, not one ref.** `restoreTarget` in `modalFocus.ts`
   ALREADY takes an array and returns the first still-connected entry - that was
   designed as this extension point and has never been used as one. The hook and
   the shell expose it: a caller passes the opener AND a fallback that outlives
   it. No new pure logic is needed; the existing function's own doc comment
   already says a caller wanting a fallback "passes it as a later candidate in
   the same array".
2. **The fallback is a real element that outlives the row**, chosen per site -
   the table container, the bulk bar's own toolbar, the header. Never
   `document.body`: `restoreTarget` deliberately refuses to synthesize one
   (decision 9), and a `?? document.body` would satisfy the letter of AC4 while
   doing the thing decision 9 warns against.
3. **Capture is `event.currentTarget` at click time, synchronously.** Never
   `document.activeElement` (decision 9's two recorded reasons). For an opener
   whose handler `await`s before setting state - `inbox-panel`'s planner does -
   the capture must happen BEFORE the await, or `currentTarget` is already
   nulled by React's event pooling semantics.
4. **One ref per DIALOG, not per opener.** Several dialogs have 2-4 openers
   (`RubricBuilderModal` has four). They write the same ref; whichever was
   clicked last is the one that opened it, which is exactly right.
5. **A keyed ref map where one dialog serves N rows.** `GradingResults`'s two
   overlays are single dialogs driven by a per-student row. A single ref would
   restore to whichever row was clicked most recently even if a different one
   opened it. Key the map by the same identity the state uses (the student).
6. **The walkthrough restores once, at the end.** `AccessibilityCenter`'s
   "Review all" opens editor after editor with NO click between stops -
   `advanceReview` is a pure state transition, so stops 2+ have no opener to
   capture. Capture once at the "Review all" click and restore there when the
   walkthrough ends. That matches the user's actual intent ("review everything"),
   and it is the only honest answer for a dialog nobody clicked to open.
7. **A dialog-internal opener that unmounts its own parent passes the fallback,
   not itself.** `CsvPreviewModal`/`RubricPreviewModal`/`SyllabusPreviewModal`
   each have an "Edit Document" button that opens `DocumentPreviewModal` and
   closes the containing modal in the same update. Capturing that button is
   pointless - it is guaranteed disconnected. It passes the ref its own opener
   used, so focus lands back on the row that started the chain.

## Acceptance criteria

**AC1 - the mechanism takes an ordered candidate list.** `useModalDismiss` and
`ModalShell` accept the opener plus zero or more fallbacks and hand them to
`restoreTarget` in order. The existing single-ref call site
(`AttachmentsPanel`/`AttachmentPreviewModal`) keeps working unchanged.

**AC2 - focus never lands on `<body>` after a close.** For every adopting dialog,
either the opener or a named fallback is still connected. Where a site genuinely
has neither, that is recorded as a decision, not left as an omission.

**AC3 - capture is at click time and synchronous.** No site reads
`document.activeElement`; no site captures after an `await`.

**AC4 - every opener of a multi-opener dialog captures.** Missing one means focus
returns to the wrong control when that control was the one used.

**AC5 - the row cases degrade correctly.** A dialog whose opener unmounted while
it was open must not throw and must land focus on that site's fallback.

**AC6 - a derived guard.** The existing `modalAdoptionScan.ts` already derives
the adopter list from the tree. Extend the guard so a dialog that adopts the
mechanism but passes NO restore candidate is a visible failure, with an
allowlist for the recorded exceptions. Derived from the tree, never hardcoded -
entry 272 check 5.

**AC7 - the usual gates.** Suite green, `tsc` clean, `lint` clean, no emojis,
every touched file under 1000 lines, no new dependency.

## Waves

- **R1** - the mechanism (AC1) plus the leaf prop: every dialog component accepts
  and forwards restore candidates. Purely additive, touches no opener.
- **R2** - Modules view (11 dialogs).
- **R3** - Files / Pages / Copy.
- **R4** - Courses tab, including decision 7's chained openers.
- **R5** - Grading, including decision 5's keyed map.
- **R6** - Accessibility (decision 6's walkthrough), inbox-panel, automation runs,
  and the AC6 guard.

## Limits

vitest is node-env and renders no component, so NONE of this is provable by
test: not that a ref is captured, not that focus moves, not that a fallback is
connected. `restoreTarget` is the only part under real test and it is already
tested. Everything else is verified by reading and by the AC6 source-scan guard,
which can prove a candidate is PASSED and never that it is correct. The app
cannot run here (no Supabase env), so no restoration has been observed.
