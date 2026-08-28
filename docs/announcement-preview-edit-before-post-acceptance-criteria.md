# The announcement bulk action: review and edit before it reaches Canvas

The owner's report (2026-08-28): *"i need a way for the announcement bulk
action on the modules view to produce a preview/edit modal before posting the
announcement to canvas"*.

## What is actually there today

Read the code before assuming the feature is absent. Most of it is not.

The "Announcements" button in the modules-view bulk bar
(`bulkBarGroupCatalog.ts`, `generateKind_announcements`) generates an artifact
and opens `GeneratedPreviewModal.tsx`. That modal already offers, for this
kind:

- the generated BODY, rendered read-only (`announcementsKindConfig.render`
  returns `generated.message`);
- an **Edit / Preview** toggle with a real textarea and a **Save edit** button,
  gated on `canEditText` (`kindSupportsTextEdit`, true for announcements
  because the kind has no `renderStructured`), which persists a new artifact
  version through `saveEditedGeneratedArtifactAction`;
- **Ask for changes** (LLM refine), a version picker over the real stored
  history, and downloads;
- a **Post to Canvas** button, with no module picker (this kind's
  `placement` is `"course-level"`).

So a preview modal exists, and the body is already hand-editable. The request
is not "build the modal". Three real gaps are what make it read as absent:

### Gap 1 - the announcement's SUBJECT is invisible and uneditable

The Canvas announcement's subject line is `artifact.title`
(`postGeneratedArtifactAction`: `const title = (artifact.title ?? "").trim()
|| config.label`). That value:

- is set once, at generate time, from the model's `generated.title`;
- is deliberately NOT rendered by the kind's `render`
  (`announcementsKindConfig`'s own doc comment says so: "`title` is
  deliberately NOT rendered by this kind's `render`");
- appears on screen only incidentally, as the modal's `<h3>` heading via
  `previewHeaderTitle`, where it is indistinguishable from a window title and
  is unlabelled;
- is carried forward verbatim by BOTH edit paths - `TITLED_GENERIC_KINDS`
  includes `"announcements"` precisely so refine and hand-edit pass
  `currentTitle` through untouched.

The instructor therefore cannot see, let alone change, half of what students
will receive. Whatever subject the model wrote is what goes out.

### Gap 2 - the post commits on the first click, and cannot be undone

`announcementsKindConfig.commitMeta.publishedOnCreation` is `true`, and its own
doc comment explains why that is honest rather than sloppy: Canvas's
`discussion_topics` endpoint makes an announcement visible immediately, with no
unpublished-draft state to opt out of. The bulk-bar catalog's own entry for
`generatePostToCanvas` already names the consequence in as many words - tier
`"fan-out-write"`, chosen because *"this one commits on its first click"*.

An immediate, irreversible, every-student-sees-it write is the one write in
this flow that should not fire on a single click, and it is the only writing
control in this tab that does.

### Gap 2b - AN UNSAVED EDIT IS SILENTLY NOT POSTED (found by the data pass)

This one is a live defect, not a missing affordance, and it is the sharpest
form of the owner's complaint.

`post()` never reads the modal's `draft`. `onPost` takes no arguments; the hook
finds the row by `preview.versions.find((v) => v.version ===
preview.selectedVersion)` (`useLmsGeneration.ts:856`) and sends only
`artifact.id`. Meanwhile the modal renders `displayText = canEditText ? draft :
currentText` (`GeneratedPreviewModal.tsx:302`).

So: type a correction into the body, do NOT press "Save edit", press "Post to
Canvas". Canvas receives the OLD text, while the corrected text is still on
screen. Nothing warns. The two existing work-loss guards do not catch it -
`handleDismiss` and `handleSelectVersion` are guarded on `dirty`
(`GeneratedPreviewModal.tsx:326-331`, `:348-354`); the Post button is not.

The same holds after a FAILED save: `saveEdit`'s error branch deliberately
leaves `preview` and the draft untouched (`useLmsGeneration.ts:773-781`), so
the instructor sees their text, sees an error note, and can still post the old
version.

### Gap 3 - nothing on screen states what posting will do

The hint next to the button reads "Posts this version to Canvas as a course
announcement." It does not say the announcement goes live to students
immediately, and it does not show the subject that will be used.

## Scope

In scope: the subject becomes visible, labelled and editable; the post becomes
a deliberate two-step confirm that states its consequence and shows exactly
what will be sent.

Out of scope, deliberately: `delayed_post_at` scheduling. The first draft of
this section gave a wrong reason ("duplicating a second scheduling surface") -
neither existing scheduling surface is this one, so that argument does not
apply. The honest reason is cost: `createAnnouncement` does take
`delayedPostAt` as an optional fifth parameter
(`src/lib/canvas/announcements.ts:229-251`), but nothing on THIS path has a
slot to carry it. `CanvasWriters.createAnnouncement` has no parameter for it
(`commit-execute.ts:97-102`), `lms-generation-writers.ts:64` drops the
argument, and threading it would widen that writer interface plus
`commit-plan.ts:248-249`, `post-content.ts:146-147` and
`postGeneratedArtifactAction`'s input - four files, none of which this feature
otherwise touches. Named here so its absence reads as a decision with a price
attached, not an oversight.

Also out of scope, recorded so it is not mistaken for a claim this feature
makes: for the OTHER save-and-post kinds, `planPostSteps` reuses an existing
Canvas page by title, course-wide, so a resources/objectives post can silently
overwrite another module's page (see `lms-generation-refine.test.ts:994-998`).
Those kinds create UNPUBLISHED objects, so they do not gain a confirm here -
but "no confirm" must not be read as "recoverable".

## Acceptance criteria

### A - the subject is first-class in the preview

1. For a kind whose title is a real, separate content field the instructor
   owns, the preview modal renders a labelled **Subject** text field showing
   the artifact's current `title`, above the body. It is not the `<h3>`
   heading and does not replace it.

1a. **PLACEMENT AND MODE** (from the UX pass): full width, immediately ABOVE
   `.previewContent` and BELOW the Edit/Save-edit row. Not below the body -
   `.previewContent` has `max-height: min(66vh, 620px)` and scrolls, so a
   subject placed after it can be pushed off screen and posted unread. Not in
   the header - that region is "what this is / what you can do with it / how
   to leave". Sitting as one visual pair with the body under the shared Save
   control is what makes AC6's "one save, one version" legible without
   explanation.
   The field is ALWAYS live, never gated behind the Edit/Preview toggle: Save
   edit already renders regardless of `editing`, a one-line field has no
   distinct preview rendering, and gating it would cost two extra clicks per
   subject change.

1b. **THE `<h3>` MUST STOP SHOWING THE SAME STRING.** `previewHeaderTitle`
   prefers `artifact.title`, so for announcements the heading IS the subject
   today. Shipping the field without touching that renders the same sentence
   twice, six lines apart - once unlabelled as a window title, once labelled
   as content - which is worse than today. When a kind offers the subject
   field, `headerTitle` falls back to `preview.kindLabel`. This satisfies AC1
   literally (the `<h3>` still exists, still is not replaced) and closes the
   "indistinguishable from a window title" half of Gap 1 that the field alone
   does not close. Accept the consequence deliberately: `ModalShell`'s
   accessible name becomes the stable "Preview of Announcements" instead of a
   name that silently changes on every keystroke, which is better.
2. Whether that field is offered is decided by a DECLARATIVE flag read from
   the kind's config - never a hardcoded `kindId === "announcements"` at the
   call site, and never a second hand-maintained id list. The repo's existing
   idiom for exactly this is `kindDeliveredAloud` /
   `kindOffersPost` / `kindSupportsTextEdit`; follow it. A future kind opts in
   by declaring the flag on its own `kinds.ts` config with no edit in the
   modal.
3. The flag must not silently contradict `TITLED_GENERIC_KINDS`
   (`lms-generation-refine.ts`). That list is hand-written, has no
   exhaustiveness check, and already caused one verified defect when a kind was
   left out of it. A kind that offers subject editing but is missing from that
   list would have its edited subject dropped at save time.

3a. **THE INVARIANT IS A STRICT SUBSET, NOT EQUALITY.** (Correction: the first
   draft said "agree", which is wrong and would have forced the feature onto
   four kinds that must not have it.) `TITLED_GENERIC_KINDS` holds six kinds,
   four of which - `objectives`, `assignments`, `scripts`, `resources` - carry
   titles DERIVED at generate time from a module label
   (`${moduleLabel} Learning Resources`, `lms-generation-refine.ts:80-94`).
   Those are not "a real, separate content field the instructor owns" (AC 1),
   and asserting equality would grow a Subject box on every one of them.
   The invariant is: every kind with the new flag is IN
   `TITLED_GENERIC_KINDS`; never the converse.

3b. **THE CANARY MUST BE BEHAVIOURAL, NOT A LIST COMPARISON.**
   `TITLED_GENERIC_KINDS` is module-private and cannot be imported - the
   existing canary says so in as many words
   (`lms-generation-refine.test.ts:1010-1013`). It also cannot simply be
   exported: that file is `"use server"`, where only async exports compile, and
   `next build` is the only gate that catches a violation. So the canary drives
   BEHAVIOUR, in the shape of `lms-generation-refine.test.ts:1027-1068`: for
   each kind where the flag is set, assert `kindSupportsTextEdit` is true, then
   call `saveEditedGeneratedArtifactAction` with an edited title and assert the
   persisted `title` is the edited value. A kind with the flag but missing from
   the list makes `carriedTitle` evaluate to `{}`, no title is written, and the
   test fails naming that kind. Copy the existing canary's non-vacuity
   assertion too (`:1062-1067`).

3c. **`introDiscussion` MUST BE DECIDED, NOT LEFT IMPLICIT.** It is the second
   kind matching AC 1's definition exactly - `{title, message}`
   (`kinds.ts:560-566`), `render` returns only `message` (`:862`), and its
   Canvas title flows through the same `lms-generation.ts:846`. DECISION: it
   does NOT set the flag in this chunk. Its posted object is an unpublished
   discussion, not an immediately-visible announcement, so it does not share
   the urgency that motivates this work, and widening the UI to a second kind
   is scope this request did not ask for. It is the obvious next opt-in and the
   subset canary admits it with zero further edits anywhere.

### B - editing the subject is saved, not just displayed

4. `saveEditedGeneratedArtifactAction` accepts an edited title and writes it to
   the new version. Today it always writes `input.currentTitle` for a
   `TITLED_GENERIC_KINDS` kind; it must instead write the edited value when one
   is supplied, and keep carrying `currentTitle` forward when one is not.
   Absent/undefined must keep today's exact behaviour - an existing caller that
   sends no title must not start blanking titles.
5. A blank/whitespace-only subject is refused at the action, with the same
   plain-sentence error style the action's existing guards use, **but ONLY
   when an edited title is actually supplied.** (Qualifier added by the
   adversarial check - without it this collides with AC 4.) Today
   `{ title: input.currentTitle ?? null }` legitimately writes `null`, and the
   existing canary drives every text-editable kind through the action with
   only `currentTitle`. An unqualified refusal would break legacy rows and
   non-titled kinds. An ABSENT edited title leaves today's carry-forward,
   including its `null`, byte-identical. A SUPPLIED blank one is refused, so it
   can never be saved and then silently degrade to `config.label` at post time.
6. Subject and body save TOGETHER in one action call and produce ONE new
   version - never two versions, and never a state where the saved body and
   saved subject came from different versions.
7. The Save control's enabled/disabled rule accounts for the subject: dirty
   means *either* field changed. Saving with only the subject changed must
   work.
8. Switching versions with the version picker reloads BOTH fields from the
   version selected, exactly as the body already does, and the existing
   unsaved-edit discard guard covers a dirty subject too.

8a. **THE RESEED GUARD MUST TEST BOTH FIELDS IN ONE `if`.** (Blocker found by
   the adversarial check.) The render-time reseed at
   `GeneratedPreviewModal.tsx:288-293` fires on `currentText !== seededText`
   ALONE. AC 7 permits saving with only the subject changed, which produces two
   versions with IDENTICAL text and different titles - so switching between
   them would not reseed, and the subject field would keep showing the other
   version's title. That is precisely the stale-draft failure REGRESSION entry
   312 check 7 exists to prevent, reached through a door that entry did not
   have.

   The condition becomes `currentText !== seededText || currentTitle !==
   seededTitle`, and the ONE block resets both drafts plus `discardConfirm` and
   `pendingVersion`. Never two independent `if`s - that would leave a frame
   where the subject and body came from different versions, which is AC 6's
   failure mode reached through the picker instead of through Save.

   `dirty` becomes the OR of both fields and MUST KEEP ITS IDENTIFIER NAME:
   `generatedPreviewModal.wiring.test.ts:508-534` slices the version handler
   and asserts it consults `dirty` by that spelling.

### C - posting is a deliberate, informed second step

9. For a kind that posts immediately and irreversibly, **Post to Canvas** does
   not write on its first click. The first click opens a confirm step; a
   second, distinct click commits. Which kinds require this is again a
   declarative property, not an id check at the call site - the honest source
   is the kind's own `commitMeta.publishedOnCreation`.
10. The confirm step states the consequence in plain words: the announcement
    goes to every student in the course as soon as it is posted, and this app
    cannot take it back. Match the voice of the bulk bar's existing
    `consequenceTag` strings - specific, not alarming.
11. The confirm step shows the exact subject and the exact body that will be
    sent, read from the same version the post will read. It must not
    re-render from separate state that could disagree with what gets posted.
12. **The arm invalidates when the content changes.** Reuse
    `confirmArming.ts`'s existing MODEL - arm against a signature of what would
    be posted rather than a boolean flag reset by an effect. That file's whole
    argument applies unchanged here: an effect that clears a stale arm is easy
    to forget; a signature invalidates by construction. Editing the subject,
    editing the body, or switching versions after arming must therefore disarm
    the button with no reset code anywhere. This repo's eslint rejects setState
    reached synchronously from an effect, so the boolean-plus-effect shape is
    not merely worse, it is unavailable.

12a. **BUT DO NOT REUSE `selectionSignature` VERBATIM - it is unsafe for this
    input.** (Correction from the UX pass; the earlier draft of this AC got it
    wrong.) That function SORTS its inputs and joins with a space, because it
    was built for an order-independent set of ids. Feeding it free text fails
    twice: sorting scrambles which field is which, and a space join lets a
    subject containing a space collide across a field boundary - so an arm
    could survive an edit that should have invalidated it, the exact failure
    this item exists to prevent. Reuse `isConfirmArmed` VERBATIM - that is the
    half this actually needs - and build the signature with a small ordered,
    delimiter-safe helper of its own. `JSON.stringify` of an ordered array is
    sufficient and obviously injective; use it.

12a-sig. **THE SIGNATURE IS `(kindId, artifactId, moduleChoice,
    newModuleName)` - NOT the subject and body text.** (Second correction, from
    the adversarial check.) The data-path facts below establish that
    `generated_artifacts` is append-only for content, so a given `artifactId`
    names an IMMUTABLE (title, text) pair forever. Signing the text as well is
    redundant, and the redundancy is not harmless: it invites a reader to think
    the arm tracks the DRAFT, which is exactly the confusion AC 11 exists to
    prevent. The module-target fields are included even though announcements
    have none, so a future kind that both needs a target and posts immediately
    does not inherit a stale-arm bug. What covers an unsaved text edit is not
    the signature but AC 12b: posting is blocked outright while dirty.

12d. **A SUCCESSFUL POST MUST EXPLICITLY DISARM.** The signature model
    invalidates on CONTENT change, and a successful write is not a content
    change: `post()` does not close the modal, and the posted version is
    unchanged, so the arm survives and one further click posts a SECOND
    identical announcement. Clear the arm in the post handler before calling
    through. This is the one place the signature model does not cover itself
    and it needs a comment saying so.
12b. **AN UNSAVED EDIT CAN NEVER BE POSTED PAST (Gap 2b).** Because the
    confirm must show the version the post will actually read - the saved row,
    never the draft (AC 11) - a dirty draft and an armed confirm would
    contradict each other on screen. Posting is therefore blocked while the
    editor is dirty, with an on-screen reason naming the unsaved edit, rather
    than posting the stale saved text behind the instructor's back. Blocking
    is the floor; if the design instead routes a dirty post through Save first,
    that also satisfies this, provided what gets posted is what was confirmed.
    This must hold after a FAILED save too, where the draft legitimately
    survives (`useLmsGeneration.ts:773-781`).

12c. The arm signature includes the artifact's `id`, not only its `version`
    number. `version` is scoped to (course, kind) and `selectVersion` carries
    only the number, whereas `saveEdit`'s success tail replaces `preview`
    wholesale (`useLmsGeneration.ts:791`). Keying on `id` is collision-proof
    across that replacement.

13. A cancel control leaves the confirm step with nothing written.
14. Everything already gated stays gated: `postUnavailableReason` still
    replaces the whole control for an export selection, and the confirm step is
    unreachable when posting is unavailable.

### D - the bulk bar's own audit stays honest

15. Any new control reachable from this flow is declared in
    `bulkBarGroupCatalog.ts` with a real tier, the same reason
    `generatePostToCanvas` itself had to be declared there: an undeclared
    control makes `groupTier` assert the group is safer than it is.
16. The `generate` group's `consequenceTag` is re-read against what the flow
    now does. If the confirm step changes what an instructor reading only the
    bar should expect, the tag says so - and it still must not overstate
    (C11's rule: a tag that overstates is worse than one that understates).
17. Every new textbox/select/checkbox carries a `persistKey` or an explicit
    `unpersistedReason`. The subject field is a per-artifact content value, not
    a remembered preference - it belongs to the version, so its
    `unpersistedReason` says that; it must not be written to localStorage.

### E - accessibility and the house style

18. The confirm step follows the modal's existing discard-panel precedent
    (the "Keep editing" panel already in `GeneratedPreviewModal.tsx`) for
    focus, roles and live-region behaviour rather than inventing a second
    confirm idiom in the same component.
19. MUI `TextField`/`Button` and the existing `page.module.css` classes only -
    no new CSS, matching the two previous chunks that extended this modal.
20. No emojis anywhere, per `AGENTS.md`.

### F - what the node-env suite can actually pin (added by the adversarial check)

This is the most important structural requirement in the document, and it is
the reason the rest of it is testable at all.

21. **THE THREE NEW DECISIONS ARE EXTRACTED INTO PURE `src/**/*.ts` MODULES,
    not buried in the `.tsx`.** vitest here is node-environment and renders no
    component, so anything living inside `GeneratedPreviewModal.tsx` can only
    ever be pinned by a source-text grep - the over-specification hazard this
    repo has recorded twice, and far too weak for AC 12b, the sharpest
    requirement here. `confirmArming.ts` is already the precedent: a pure,
    28-line, dependency-free module beside the component it serves. Extract,
    in the same spirit:
    - the reseed trigger and the combined `dirty` predicate (AC 8a);
    - the arm-signature builder (AC 12a-sig);
    - the "may this post proceed" predicate combining `postUnavailableReason`,
      `dirty` (AC 12b) and `isConfirmArmed`.
    The `.tsx` keeps JSX and wiring. Those three modules get real unit tests
    that can genuinely fail.

22. **THE CAPABILITIES DELETION GUARD IS EXTENDED.** (Blocker.)
    `generatedPreviewModal.wiring.test.ts:55-73` keeps one entry per modal
    capability; REGRESSION entry 312 check 12 records that a capability with no
    entry can later be deleted with every test green. This feature adds two
    capabilities and the first draft never mentioned the list.
    Note the constraint that makes this non-trivial: each `CAPABILITIES`
    pattern must match BOTH a declared prop and a binding at
    `ModulesView.tsx`, and this feature deliberately adds ZERO new props (the
    subject is local modal state; the kind predicates are read from
    `preview.kindId`). The `teleprompter` chunk faced exactly this and solved
    it with its own dedicated wiring test file rather than a forced prop.
    FOLLOW THAT PRECEDENT: pin both new capabilities in the dedicated
    `generatedPreviewModal.subject.wiring.test.ts`, and update the existing
    stale-fixture canary (`:340-360`) rather than padding the fixture to hide
    the change.

23. **STRUCTURAL WIRING ASSERTIONS THE NEW MARKUP WILL HIT.** Named so an
    implementer does not read a red test as breakage: `:604-613` (the nearest
    preceding `className` before the "From your selection." hint must be
    `styles.previewMeta`), `:615-635` (the hint's index must fall inside the
    FIRST fragment after `postNeedsModuleTarget && (` - a nested fragment
    breaks it), `:576-584` (that string may occur exactly once), `:536-542`
    (every `styles.X` referenced must already exist in `page.module.css` -
    this is what enforces AC 19's no-new-CSS rule), `:493-494` (no
    `createPortal`), `:442-471` (`PENDING_BINDING` is `[]` and policed in both
    directions), and `teleprompter.wiring.test.ts:94-107` (`handleDismiss`'s
    regex terminates at the first two-space-indented `};`, and
    `teleprompterOpen` must still precede `onClosePreview()` - so the new
    disarm rung goes AFTER the teleprompter rung and must not reindent).

24. **THE CATALOG'S TIER THEOREMS AND ITS SABOTAGE TEST MUST BE RESOLVED
    DELIBERATELY.** (Blocker.) `bulkBarGroups.test.ts:821-838` hides
    `generatePostToCanvas` and asserts the group tier drops to
    `reversible-write`; a second control declared `fan-out-write` under the
    same `generatePostReachable` fact makes that assertion fail. And
    `:788-793`'s theorem would go insensitive to either control individually -
    deleting `generatePostToCanvas` would no longer redden it, which is a
    tautology of exactly the kind this repo has been bitten by.
    Required: gate the confirm control on `generatePostReachable` (the
    `releaseCommit`/`commandApply` precedent), declare Cancel `read-only` and
    the Subject field `read-only` on a NEW fact `generateSubjectEditable`
    (default `false` in `baseFacts`), add a per-control assertion for the
    confirm mirroring `:777-786`, and extend the sabotage block to blind BOTH
    controls. `generatePostToCanvas` STAYS `fan-out-write` - it is an
    unrecallable write, not a delete - but its recorded rationale at
    `bulkBarGroupCatalog.ts:916-927`, which turns on "this one commits on its
    first click", becomes FALSE and must be re-derived out loud.

25. **HONEST A11Y FRAMING.** (Correction to AC 18.) The discard panel this AC
    cites as the precedent is a plain `<div>` with inline styles: no `role`, no
    `aria-live`, no focus move. "Follow it for roles and live-region
    behaviour" therefore specifies nothing. Inherit its STRUCTURAL idiom (the
    inline-styled `var(--warning-bg)` panel, the two-button row) and take the
    live-region behaviour from the stronger in-repo precedents instead -
    `ReleaseReviewModal.tsx:131` and `VisualizerCoverageSection.tsx:249-260`,
    whose header comment argues explicitly for redundant signals before an
    unrecoverable write. None of this is provable by the suite; it must be
    right by reading.

## Settled UX decisions - literal copy, do not re-invent

From the UX pass. These are decisions, not suggestions; deviating needs a
reason written down.

**Where the confirm renders.** A panel in the post block, directly ABOVE the
post row, styled exactly like the existing discard panel (`padding: "0.75rem
1rem"`, `borderTop: "1px solid var(--field-border)"`, `backgroundColor:
"var(--warning-bg)"`), with the two resolutions in the post row itself. Not a
nested modal - `ModalShell` pushes onto a dismissal stack and the Escape ladder
in `handleDismiss` already special-cases teleprompter; a second shell for one
decision is the second confirm idiom AC E18 forbids. Not fully inline either -
a single flex row cannot hold the body AC 11 requires on screen. The container
copies the in-file discard panel; the armed-commit button pair copies
`ReleaseReviewModal`. Both already exist.

**The consequence sentence** (the only live region):

> Posting publishes this announcement to every student in the course
> immediately - Canvas has no unpublished state for an announcement - and this
> app cannot recall or delete it afterward.

**Content labels**, copying `CommandProposalModal`'s "Will be written to Canvas
as:" idiom: `Subject that will be sent:` and `Body that will be sent:`.

**Buttons.** Not armed: `Post to Canvas`. Armed: `Confirm post`, preceded by a
`Cancel` (`variant="text"`) that exists ONLY while armed - the in-file `Revert`
precedent. In flight: the existing `Posting…` string, unchanged.

**Post-row hint**, replacing today's string, which Gap 3 correctly calls silent.
Identical in both states so nothing shifts under the cursor:

> Posts this version to Canvas as a course announcement - every student sees it
> as soon as it is posted.

**Dirty-block hint**, replacing the button per AC 12b:

> Save your edit first - Post to Canvas sends the saved version, not your
> unsaved changes.

**Subject helper text**: `Students see this as the announcement's subject line
in Canvas.` When blank: `error` plus `Enter a subject - an announcement cannot
be posted without one.` Use MUI `helperText` (which associates via
`aria-describedby` for free) rather than the file's unassociated `previewMeta`
span - a considered deviation, because that span is used for presentational
provenance trivia while this sentence carries a consequence.

**Button colour stays `primary` in both states.** `ReleaseReviewModal` turns
its armed button red, but that is tied to the destructive tier;
`generatePostToCanvas` is `fan-out-write`, and red for "send an announcement"
is the overstatement C11 warns against. Record this in a comment so a later
reader does not "fix" it.

**Accessibility, copied not invented.** Plain `<div>` for the panel, never a
second `role="dialog"` inside `ModalShell`'s `aria-modal` section.
`role="status" aria-live="polite"` on the consequence paragraph ONLY - never
on the quoted body, which would read a whole announcement aloud on arm. Focus
does not move: the arming button stays mounted and its accessible name changes
from "Post to Canvas" to "Confirm post", which is why the panel renders above
the row rather than replacing it (replacing the trigger would unmount a focused
element and drop focus to `<body>`, which nothing in this file does). Give the
consequence paragraph a stable id and point the armed button's
`aria-describedby` at it. Quoted content goes in a `<code>` block with
`whiteSpace: "pre-wrap"` and a `maxHeight` scroll cap - never
`dangerouslySetInnerHTML`.

**Click cost, stated plainly:** the common path (generate, read, post) goes
from 3 clicks to 4. That is the floor for a real confirm on an unrecallable
write, and there is no way around it - the only one-click-post design is an
undo window, and Canvas gives us nothing to undo with. Bought back: cancel
costs one click, no modal to open or dismiss, and the always-live subject field
adds the new capability at zero mode toggles.

## Adjacent defects this diff should close

Each is real, pre-existing, and made more reachable by this change. Close them
here rather than leaving a known-false comment or an unexamined write standing.

- **`generatePostToCanvas`'s tier comment becomes FALSE.** It currently reads
  "...and this one commits on its first click" as the reason it is not
  `destructive`. After this change that sentence is untrue. The tier stays
  `fan-out-write` (an unrecallable write, not a delete), but the reasoning must
  be re-derived out loud, not left standing.
- **`Save edit` appears to be undeclared in the bulk-bar catalog.** It creates
  a new `generated_artifacts` version - a `reversible-write` - and is reachable
  only from inside this modal. That is precisely the defect
  `generatePostToCanvas`'s own comment describes: "a green check on an
  unexamined path, which is worse than no check."
- **Regenerate is not covered by the unsaved-work guard.** `handleDismiss` and
  `handleSelectVersion` consult `dirty`; Regenerate does not, so it produces a
  new version and the render-time reseed wipes an unsaved edit silently. This
  exists today for the body; the subject field makes it easier to hit. Route it
  through the same guard with a third pending-action variant, panel copy
  "Discard your unsaved changes and regenerate?"
- **Revised `generate` group `consequenceTag`**, scoped so it does not
  overstate for the non-announcement kinds:

  > Post to Canvas, inside the generated-content preview, writes the drafted
  > content into the live course - for an announcement that means every student
  > sees it immediately, after a second confirming click.

- **The Subject field's `unpersistedReason`** (AC 17), literal:

  > Per-artifact content, not a remembered preference - the subject belongs to
  > the generated version and is reloaded from whichever version is selected,
  > so persisting it would attach one course's subject to another course's
  > draft.

## The invariant that keeps the two capabilities coherent

`offersSubject` implies `canEditText`. A kind offering a live subject field but
no text editing would render a field with no way to save it, directly above a
hint saying editing is unavailable - visibly broken. Assert this in the kinds
config alongside the AC A3 canary.

## Data-path facts the implementer must not re-derive

Established by the data pass against the real source. Treat as given.

- **No migration is needed.** `generated_artifacts.title` is already nullable
  `text` with no constraint
  (`supabase/migrations/20261004000000_generated_artifacts.sql:88`);
  `SaveGeneratedArtifactVersionInput` already accepts it,
  `saveGeneratedArtifactVersion` already writes it
  (`generated-artifacts.ts:182`). The feature changes only WHICH value goes
  into that column. Do NOT add `NOT NULL`/`CHECK` - `"qa"`/`"currentEvents"`
  legitimately store `null` there.
- **A given `artifactId` names an immutable (title, text) pair forever.** The
  table is append-only for content: the only UPDATE touches `is_current` and
  `updated_at` (`generated-artifacts.ts:167-172`), and nothing deletes rows.
  This is what makes AC 11 achievable at all.
- **`postGeneratedArtifactAction` looks up by `id`, never by `isCurrent`**
  (`lms-generation.ts:841`), so a second tab saving a version cannot change
  what an open modal posts.
- **The single subject-degradation point is `lms-generation.ts:846`**:
  `(artifact.title ?? "").trim() || config.label`. A blank title becomes the
  literal `"Announcement"`, silently. `createAnnouncement` DOES reject a blank
  title (`announcements.ts:236`), but that guard is unreachable because of
  line 846. AC B5's guard therefore belongs at the ACTION, next to the
  existing `"There is no text to save."` guard
  (`lms-generation-refine.ts:470-471`), matching its plain-sentence style.
- Today's title write is one line: `const carriedTitle =
  TITLED_GENERIC_KINDS.includes(input.kind) ? { title: input.currentTitle ??
  null } : {};` (`lms-generation-refine.ts:481`). Note the `{}` branch omits
  the key entirely - existing tests assert on `"title" in input`, so keep that
  shape for non-titled kinds.
- A hand-edit save already nulls `structured` and replaces `prompt` with
  `MANUAL_EDIT_PROMPT` (`lms-generation-refine.ts:484-490`). Harmless for
  announcements, which never populate `structured`. Do not "fix" it here.
- The announcement body is the ONE kind shipped as raw text with no
  `markdownLiteToHtml` (`post-content.ts:146-147`); `createAnnouncement` then
  trims it and runs `textToHtml` (`announcements.ts:242`). A confirm step
  showing plain text is showing the source, not the rendered result - do not
  claim byte-exactness it does not have.

### Tests that WILL break, and must be updated in the same commit

Not optional, and not a sign something went wrong - these pin the current
signature by source text:

- `useLmsGeneration.postSeed.test.ts:42` - `SAVE_EDIT_START` is the literal
  `"const saveEdit = (text: string) => {"`, and `sliceBetween` THROWS on a
  missing marker (`:56`). Any change to `saveEdit`'s signature breaks it.
- `useLmsGeneration.test.ts:878`, `:883` - same literal via `sourceBetween`.

### Tests that must be KEPT and strengthened, not replaced

- `lms-generation.post-and-list.test.ts:484-500` is the end-to-end
  verbatim-carry oracle for the subject (asserts `createAnnouncementAction`
  receives `"Heads up!"`). Keep it; ADD a blank-title case asserting the new
  refusal at save rather than `"Announcement"` at post.
- `lms-generation-refine.test.ts:784-801` pins "no edited title supplied ->
  carry `currentTitle`". This is exactly the test that catches AC B4's
  backward-compatibility clause being dropped. Keep it green.
- `lms-generation-refine.test.ts:1018-1070` is the existing
  `TITLED_GENERIC_KINDS` canary. AC A3's new agreement test is its SIBLING,
  never its replacement.
- `lms-generation.post-and-list.test.ts:253-298` ("posts the exact version
  named by artifactId, not the newest") is what makes AC 11's guarantee real.

## Verification the tests must actually reach

The vitest suite is node-environment and collects only `src/**/*.test.ts`, so
no component is rendered and no test here can prove markup or keyboard
behaviour. Wiring tests in this feature area therefore read source text - and
this repo has recorded twice that source-text assertions over-specify. Pin the
FACT and the ORDERING, never the spelling:

- the flag gating the subject field is derived from the kind config, not
  compared against a literal id;
- the flag and `TITLED_GENERIC_KINDS` agree (a real behavioural canary, not a
  spelling one);
- `saveEditedGeneratedArtifactAction` writes the supplied title and falls back
  to `currentTitle` when none is supplied - covered by calling the action's
  logic, not by grepping it;
- the arm signature includes subject, body and version, so any of the three
  changing invalidates it - covered by calling `isConfirmArmed` with real
  before/after signatures.
