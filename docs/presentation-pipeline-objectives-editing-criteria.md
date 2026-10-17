# Slide Deck Pipeline: objectives and individual slide editing

## Leverage claim

This extension earns GUARANTEED leverage by making accepted learning objectives
actual inputs to the outline, plan and deck, and by making a committed slide edit
invalidate the deck's old review receipts. An instructor using a chat must manually
carry objectives between prompts, copy edits back into the authoritative deck and
remember which reviews no longer apply. The removal test disconnects objectives
from generation or disables edit invalidation: the corresponding production-path
test must fail. Merely displaying generated objectives is not this mechanism.

## Inventory and scope

Inventory commands: `rg --files src | rg '(Pipeline|SlideRegen|presentation-pipeline|slide-pipeline)'`,
`rg -n 'SlideRegenView' src`, and
`rg -n 'template' src/app/components -g '*Pipeline*' -g '*pipeline*'`.
Directly read `src/app/components/presentations/pipeline/PipelineTab.tsx`,
`SlideRegenView.tsx`, `panel-logic.ts` and
`src/lib/presentations/pipeline.ts` using `Get-Content`.

The existing `PipelineTemplatePicker` selects uploaded files and saved libraries;
`PipelineTab` resolves that choice for download. `SlideRegenView` already supports
one slide, an instruction, candidate comparison and explicit Accept/Discard.
`pipeline.ts` already provides deck-to-review invalidation. No homework-objective
artifact or individual direct text editor was found in these inspected entry paths.
Reuse those existing template and regeneration controls; this item adds the missing
objectives flow and direct slide text editing, rather than a parallel deck workflow.

## Acceptance criteria

1. **Reachable homework intake.** In Presentations > Slide Deck Pipeline, an
   instructor can paste homework separately from general context and request a
   checklist of what students should be able to do. Blank/whitespace input cannot
   dispatch. Inputs beyond documented bounds receive an actionable validation
   message rather than silent truncation. Existing source and context intake works.

2. **Reviewable objective checklist.** Successful generation shows concise,
   homework-grounded, observable student objectives with individual selection
   controls. Objectives start selected; the instructor can edit their text, remove
   them and select which to use. Display identifies them as generated suggestions,
   not evidence that students mastered the homework. Generation failure or malformed
   output preserves the previous accepted checklist and pasted homework and offers
   retry. Empty or unusable output cannot become an accepted objective set.

3. **Intentional application.** An explicit Apply action commits the selected,
   nonempty objectives. An empty selection cannot silently replace an active set;
   a separately labeled Clear action returns to the existing objective-free flow.
   Draft edits and selecting/unselecting rows alone do not alter the current deck.
   Applied objectives are visibly distinguishable from an unapplied draft.

4. **Real downstream use.** Subsequent outline, plan and deck generation receives
   the applied objectives through the production request/prompt path, alongside
   existing sources and context. Run-to-end uses that same applied set. The UI
   promises objectives guide generation, not guaranteed semantic coverage of every
   objective. No objectives preserves the existing workflow. A test with distinctive
   objective text proves the text reaches each relevant generation request rather
   than being stored or displayed only.

5. **Objective freshness.** Applying changed objectives or clearing an applied set
   marks previously generated dependent stages and deck reviews/polish stale;
   old artifacts remain inspectable but are not represented as current. Changing
   homework marks its generated suggestions outdated until regenerated; the last
   explicitly applied objectives remain active and are labeled accordingly until
   replaced or cleared. A response for old homework cannot replace a newer draft.

6. **Direct individual editing.** For a generated deck, the instructor can select a
   slide and edit its title and bullet text. Speaker-note editing is available on
   own-layout decks when supported by the shared slide model; while a template is
   selected it is disabled with an explanation that template downloads preserve
   the template's existing notes. Save commits valid edits; Cancel leaves the deck unchanged.
   Validation follows the supported slide/export limits and explains invalid input.
   Saving one slide preserves other slides, deck identity/title, ordering and
   unedited supported fields. An unchanged Save produces no false invalidation.

7. **Authoritative deck and invalidation.** A changed Save updates the same deck
   artifact used by previews, regeneration, whole-deck actions and PPTX download.
   It marks standard, information-flow review, visual review and polish stale while
   retaining their prior artifacts, without invalidating upstream outline/frame/plan.
   Subsequent reruns use the edited deck. A download initiated after Save contains
   title/bullet edits through both the existing own-layout and selected-template
   paths, and supported note edits through the own-layout path. Template-backed
   output retains existing template notes and makes that limitation clear even
   when a template is selected after earlier own-layout note edits.

8. **Safe asynchronous interaction.** A regeneration candidate or late response
   based on an older slide/deck cannot overwrite a newer committed edit. Selecting
   another slide cannot apply an old candidate to that slide. Pending operations
   prevent conflicting saves or explicitly detect the conflict before commit.
   Network errors, Discard and leaving candidate mode do not mutate the deck.

9. **Reuse and persistence.** The existing effective template choice, explicit
   selected-template download behavior and prompt-based single-slide regeneration
   remain reachable. Accepted objectives and committed edits survive reload using
   the pipeline's existing persistence expectations; older persisted state without
   objectives loads as objective-free. No requirement is made for uploading a new
   template or multi-slide batch regeneration in this item.

10. **Privacy-safe Diagnostics.** Objective-generation and slide-regeneration
    operations each report one terminal success/failure/cancel-or-stale outcome,
    elapsed duration, bounded failure category and output count where applicable.
    Objective apply/clear and changed slide-save report successful local operation
    counts and number of downstream stages invalidated. Entries appear in the
    existing Diagnostics surface. Never log homework, objective text, slide text,
    notes, prompts, candidate bodies, filenames or raw error/provider payloads.
    Fixture-based assertions prove both operation reporting and absence of those
    distinctive content strings; instrumentation failure must not lose user edits.

11. **Verification and accessibility limits.** Tests exercise actual request
    builders/reducers and export input paths with independent expected values,
    including objective propagation, stale responses, exact single-slide mutation,
    cancel, invalidation and old-state loading. Named controls and status/error
    announcements support keyboard operation. Record a browser walkthrough for
    checklist selection, Save/Cancel, candidate Accept/Discard and reload; repository
    tests render no components and cannot prove keyboard/focus behavior or layout.
    If a live instrument is unavailable, record its owner, instrument and receiving
    step rather than treating source-text checks as rendered interaction evidence.
