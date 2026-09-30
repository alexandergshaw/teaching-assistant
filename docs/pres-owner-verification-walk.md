# Owner verification walk: Presentations / deck features

A step-by-step checklist for the owner to run in a real signed-in browser
against the deployed app (`teaching-assistant-pi.vercel.app`, Vercel Hobby,
auto-deploy from `main`). Nothing here can be proven in this checkout: vitest
is node-env and mounts no component (`docs/loop/this-repo.md` section 6), there
is no `.env`/live Supabase, no `GEMINI_API_KEY`, and the network is blocked in
this environment. Every step below is grounded in the code as it exists in the
working tree at the commands cited; the "Grounded in" line under each feature
names exactly what was opened.

**Before you start - confirm this has actually shipped to `main` and deployed.**
This doc was authored against the WORKING TREE, not a pushed commit. At the
time of writing, `git status --short` in the repo root showed the pipeline
files (`src/app/components/presentations/pipeline/*.tsx`,
`src/lib/deck-standard/{frame,slide-plan}.ts` and tests) as untracked (`??`)
and the wiring files (`src/app/page.tsx`, `src/app/components/manual/
manual-rail.ts`, `src/app/url-state.ts`, `src/app/components/home/
useAppNavigation.ts`, `src/lib/deck-standard/{standard,polish}.ts`) as
modified-but-uncommitted. Run `git log --oneline -5` and check the Vercel
deployments list before Section 3 below - if the S6.7 commit has not landed on
`main` and deployed, the "Slide Deck Pipeline" child tab in Section 3 will not
exist yet on the live site. Sections 1 and 2 (PRES-1, A43-C) are unaffected by
this - they predate this session's pipeline work.

Every check below states the ACTION and the EXPECTED RESULT so it can be
ticked off.

---

## 1. PRES-1: Slide Deck Creation (the thin, one-shot flow)

**Grounded in:** `src/app/components/presentations/{index.tsx, SourcesEditor.tsx,
ArtifactCard.tsx, SlideDeckPreview.tsx, panel-logic.ts}` and
`src/app/api/presentations/generate/route.ts` (all read directly for this doc).

1. **Navigate: Tools > Presentations > Slide Deck Creation.**
   Expected: the "Presentations" entry is a Manual-view nav item
   (`src/app/components/manual/manual-rail.ts:203`, label `"Presentations"`)
   with an inner child labeled "Slide Deck Creation"
   (`manual-rail.ts:146`, id `presentations-slide-deck`). The tab renders a
   `TabHeader` reading "Slide Deck Creation" / "Paste lecture context, choose
   what to generate, and review each artifact in place."
   (`presentations/index.tsx:142-146`).

2. **Paste context.** Type text into the "Context" field.
   Expected: it persists to `localStorage` key `ta-pres-context-text`
   (`panel-logic.ts:163`) - reload the page and confirm the text is still
   there.

3. **Drag and drop a file onto the drop zone** (try a `.pdf`, a `.docx`, an
   image, and a code file in separate passes).
   Expected: each drop shows "`<filename>`: extracting..." while
   `extractDeckSourceFileAction` runs server-side
   (`SourcesEditor.tsx:15,96`, reused verbatim from `src/app/actions/
   deck-source.ts`), then resolves into a new named source card populated
   from the extracted text (`appendExtractedSourceNamed`,
   `SourcesEditor.tsx:16,103`). Drop two files in quick succession and
   confirm BOTH appear as separate sources (not one overwriting the other -
   `SourcesEditor.tsx:77-86`'s comment describes why this should be race-safe).
   A file type the extractor rejects should show an inline error message
   with a dismiss (x) control, not a silent failure
   (`SourcesEditor.tsx:98-101,192-201`).
   OWNER-ONLY: whether real extraction quality is good for each file type -
   this checkout cannot call the extractor's model path at all.

4. **Click to browse** (the same drop zone, `role="button"`, or press Enter/
   Space on it) as an alternative to dragging.
   Expected: opens the OS file picker; selecting a file behaves identically
   to a drop (`SourcesEditor.tsx:130-178`).

5. **Add a pasted-text source manually** via "Add pasted source", name it, and
   type text into it.
   Expected: a new source card appears with an editable name field and a
   remove ("x") button (`SourcesEditor.tsx:210-247`).

6. **Select some combination of the three checkboxes - Outline, Activity
   Ideas, Slide Deck - plus "Include AI critique for each artifact."**
   Expected: the checkbox set is `outline`/`activities`/`deck`
   (`panel-logic.ts:50-56`, labels from `KIND_LABELS`), `review` defaults to
   checked (`panel-logic.ts:207` shows the default selection has
   `review: true`). Toggling any box persists it (`ta-pres-selection`,
   `panel-logic.ts:165`) - reload and confirm the checkboxes still reflect
   your choice.

7. **Click Generate with at least one kind selected.**
   Expected: the button reads "Generating..." and is disabled while any
   selected kind is in flight (`presentations/index.tsx:119-125,176-183`);
   one `ArtifactCard` appears per selected kind, each independently reaching
   "loading" then either "ok" or "error" (`ArtifactCard.tsx:13-17`; the
   fan-out is `Promise.allSettled`, so a failure on one kind does not block
   the others - `index.tsx:123`).

8. **With "Include AI critique" checked, confirm each returned artifact shows
   a "Critique" block underneath its content.**
   Expected: an outline artifact renders as preformatted markdown text
   (`ArtifactCard.tsx:99-111`); an activities artifact renders as a bulleted
   list (`:113-121`); a deck artifact renders via `SlideDeckPreview`
   (`:123-125`). Each artifact that got a critique shows the "CRITIQUE"
   label + text block (`:127-147`). If a critique legitimately could not run
   because the request ran out of time budget, expect the AMBER "AI critique
   unavailable - generation ran out of time. Regenerate to retry." message
   instead of a silent absence (`:150-163`, `reviewSkipped`,
   `route.ts:210-235`'s distinction between "skipped for budget" and "ran,
   returned nothing"). OWNER-ONLY: which of these two paths you actually hit
   depends on live model latency - not reproducible here.

9. **For the Slide Deck artifact: confirm it renders in-page** (one card per
   slide, title + bullets + optional code block + optional speaker notes -
   `SlideDeckPreview.tsx:20-96`) **and click "Download .pptx".**
   Expected: a real `.pptx` file downloads, built via
   `serializeDeckToPptx` (`ArtifactCard.tsx:188-189`, dynamically imported
   from `@/lib/presentations/deck-file`). OWNER-ONLY: opening the downloaded
   file in PowerPoint/Keynote/Google Slides to confirm it is well-formed -
   this checkout never runs `serializeDeckToPptx` against a real file
   handle, only against its own tests.

10. **Click "Regenerate with context" on a produced artifact.**
    Expected: that one artifact re-enters "loading" and is replaced by a new
    result, built from the prior content + prior critique fed back in
    (`index.tsx:84-117`, `buildRegenerateRequestBody`). If the artifact
    previously errored (no prior success), the same button instead re-runs a
    fresh generate for that kind (`index.tsx:127-136`).

11. **Reload the page after doing the above.**
    Expected: the context text, the sources list, and the checkbox selection
    all survive the reload (all three are `usePersistedJSON` against the
    `ta-pres-*` keys named in step 2/6 above); the generated artifacts
    themselves do NOT persist (`artifactStates` is a plain `useState`,
    `index.tsx:45` - no `ta-` key backs it), so expect the artifact cards to
    reset to "Not generated yet." after a reload. This is a genuine reading
    of the code, not an assumption - flag it to the owner if persisting
    generated content across reload was expected.

---

## 2. A43-C: the conversational "Ask for a change" box (PowerPoint Design tab)

**Grounded in:** `src/app/components/ppt-design/{index.tsx, GeneratePanel.tsx,
ask-response.ts, hooks.ts}` and `src/app/api/decks/ask/route.ts` +
`src/lib/decks/deck-operations.ts` (all read directly for this doc). This
lives under a DIFFERENT nav tab than the Presentations panel above - Tools >
PowerPoint Design (`manual-rail.ts:134`, id `ppt-design`, label
"PowerPoint Design"), not Tools > Presentations.

1. **Navigate: Tools > PowerPoint Design.** Select or create a template, fill
   in subject/audience as the panel asks, and click **Generate**
   (`index.tsx:476`, `handleGenerateDeck`, wired to `GeneratePanel`'s
   `onGenerateDeck` at `index.tsx:798`).
   Expected: a deck is produced (`generatedDeck`) and its slides render in
   the panel. This step is a precondition for what follows, not new work
   from this session - the ask box requires a generated deck to exist
   (`GeneratePanel.tsx` renders the ask box only in the generated-deck
   branch of the panel).

2. **In the "Ask for a change" box** (labeled "e.g., make slide 2 punchier",
   `GeneratePanel.tsx:446-462`), type an ordinary conversational edit - e.g.
   "reword slide 2 to be punchier", "condense the bullets on slide 3", or
   "retitle slide 1" - and click **Ask** (or press Enter with the field
   focused; Enter submits like a single-line field's default -
   `GeneratePanel.tsx:453-458`).
   Expected: the button shows a spinner + "Asking..." while in flight
   (`:470-476`); on success, the slide preview AND the eventual
   Download/Save both reflect the edit - the route's returned slides replace
   `editedSlides` directly (`index.tsx:651-652`), which is the same state
   `onEditSlide` and Download/Save already read from.

3. **Ask for something the deck is NOT allowed to do - e.g. "add a slide
   about grading rubrics", or "change the layout/theme".**
   Expected: the deck is LEFT UNCHANGED (the route never mutates on a
   refusal - `deck-operations.ts:230-231`) and a reason is shown in a
   danger-colored box under the ask field (`GeneratePanel.tsx:479-494`,
   `askOutcome.text`). For "add a slide" specifically, expect wording close
   to: "I cannot add a slide to an uploaded template yet..." (the exact
   frozen string is `REFUSAL_WORDING["add-slide"]`,
   `deck-operations.ts:124-125` - quote it to compare, do not require an
   exact match if the model's own phrasing around it varies, since the
   `note` suffix is model-supplied). Confirm the deck's slide count and
   content are identical to before the ask.

4. **Trigger an error path if you can** (e.g. by testing while signed out,
   or during a period of API slowness) and confirm a message appears rather
   than a silent failure or an unstyled crash - `ask-response.ts:79-108`
   enumerates: signed-out (401), timeout (504, "partial" - nothing changed),
   model-call-failed (502), bad-request (400), each with its own worded
   message, `retryable` flagged true except for 400. OWNER-ONLY: actually
   reaching the 504/502 paths needs a live, slow, or failing model call -
   not reproducible without the deployed app and a real key.

5. **Type a draft into the ask box, reload the page without submitting.**
   Expected: the draft text survives the reload - `useDeckAskDraft`
   persists it under `ta-ppt-ask-draft` (`hooks.ts:142-143`).

6. **Confirm no required step was added before Download/Save/Regenerate.**
   Expected: the ask box is optional - you can ignore it entirely and
   Download/Save/Regenerate work exactly as before (the box is a single
   additional control, not a gate - see the comment at
   `GeneratePanel.tsx:430-434`).

---

## 3. PRES-2 pipeline: the Slide Deck Pipeline child tab

**VERIFY ONLY AFTER CONFIRMING S6.7 HAS LANDED ON `main` AND DEPLOYED** (see
the note at the top of this doc). As read directly from the working tree at
the time of writing, this section describes CODE THAT ALREADY EXISTS
end-to-end (all nine of the S6 gate test files pass:
`npm run test:paths -- src/lib/deck-standard/standard.test.ts
src/lib/deck-standard/polish.test.ts src/lib/presentations/pipeline.test.ts
src/lib/presentations/pipeline-prompts.test.ts
src/app/api/presentations/pipeline/route.test.ts
src/app/components/presentations/pipeline/panel-logic.test.ts
src/app/components/manual/manual-rail.test.ts src/app/url-state.test.ts
src/app/components/home/useAppNavigation.test.ts` -> 9 files, 323 tests, all
passed, run just before writing this doc). What none of that proves is
anything about RENDERING, clicking, or model output - that is this section's
whole job.

**Grounded in:** `src/app/components/presentations/pipeline/{PipelineTab.tsx,
PipelineStepper.tsx, FrameEditor.tsx, ReviewFindings.tsx}`,
`src/lib/presentations/pipeline.ts`, `src/lib/deck-standard/{frame.ts,
slide-plan.ts, standard.ts, polish.ts, checklists.ts}`,
`src/app/api/presentations/pipeline/route.ts`, `docs/pres-2-s6-plan.md`
(all read directly for this doc).

### 3.1 Reaching the tab and the stepper

1. **Navigate: Tools > Presentations > Slide Deck Pipeline.**
   Expected: a SECOND inner child now exists under "Presentations" alongside
   "Slide Deck Creation" - id `presentations-pipeline`, label "Slide Deck
   Pipeline" (`manual-rail.ts:147`). Both children coexist; the thin flow
   from Section 1 is unchanged.

2. **Confirm the stage stepper.** Expected: a horizontal row of ten chips,
   one per stage, in dependency order: "1. Sources", "2. Outline",
   "3-4. Frame", "5/9. Slide Plan", "10. Deck", "7. Standard Check",
   "8. Activities", "11. Review: Info Flow", "12. Review: Visuals",
   "13. Polish" (exact set and labels: `PipelineStepper.tsx:14-25`,
   `STAGE_LABELS`; the visible order follows `ALL_STAGE_IDS`, not
   necessarily the numeric order shown in each label - e.g. "10. Deck"
   renders before "7. Standard Check" because Standard Check depends on the
   Deck existing). Each chip shows its status in parentheses when not idle
   (`running`/`done`/`stale`/`error`) and shows "- locked" when it cannot
   run yet (`PipelineStepper.tsx:53-68`, `canRunStage`).
   OWNER-ONLY (reading claim, nothing renders here): the actual chip
   rendering, colors, wrapping at narrow widths, and whether `role="tablist"`
   /`role="tab"`/`aria-selected` produce a sane screen-reader experience -
   `PipelineStepper.tsx:48-60` sets these roles but no test here renders the
   DOM to confirm they work.

3. **Click through each stage chip.** Expected: clicking a chip sets it as
   the active stage and swaps the content panel below (`PipelineTab.tsx:294`,
   `onSelectStage`/`activeStage`); a locked stage is still clickable to LOOK
   at ("- locked" is a status label, not a disabled chip -
   `PipelineStepper.tsx:55` computes `runnable` but never sets `disabled`) -
   confirm you can view a not-yet-runnable stage's (empty) panel without it
   erroring.

### 3.2 Stage 1 - Sources (the user-commit gate)

4. **On the Sources stage, paste context and/or drag-drop files** - same
   `SourcesEditor` component as Section 1, so the same drag/drop, click-to-
   browse, per-file extraction-error, and multi-file race-safety behaviors
   apply here (`PipelineTab.tsx:42,303-308` reuses `SourcesEditor` verbatim).
5. **Click "Commit sources."**
   Expected: this is the ONLY way the Sources stage's state changes - typing
   alone does not commit it (`PipelineTab.tsx:172-174`, `commitSources`). Per
   the code comment at `PipelineTab.tsx:18-20`, "sources" deliberately never
   auto-runs even under Run-to-end - confirm that clicking Run-to-end before
   ever pressing "Commit sources" does NOTHING (no stage advances), and that
   after you commit once, downstream stages become reachable.

### 3.3 Generating stages one at a time

6. **Outline: type or click "Generate outline."**
   Expected: "Generate outline" POSTs to `/api/presentations/pipeline` with
   op `outline` (`PipelineTab.tsx:73-74,333-338`) and the markdown text field
   updates with the model's result; you can also hand-edit the markdown
   directly - editing marks Outline (and everything downstream: Plan, Deck,
   Reviews, Polish) STALE per the invalidation graph
   (`docs/pres-2-s6-plan.md:180-182`, `computeStale`) - confirm the stepper
   chips for those later stages flip to "(stale)" after you edit the outline
   text.
7. **Activities: type ideas (one per line) or click "Generate activities."**
   Expected: same pattern as Outline (`PipelineTab.tsx:76,358-365`).
8. **Frame (stages 3-4): use the Frame editor** - Mental Model name + steps
   (one per line), Running Example name + description
   (`FrameEditor.tsx:37-86`) - **or click "Suggest a frame via AI."**
   Expected: typing in the Frame editor is a LOCAL DRAFT that does NOT
   invalidate anything until you click "Save frame edit"
   (`FrameEditor.tsx:6-10`'s comment: "typing does not itself invalidate
   downstream stages... `onCommit` only when Save frame edit is clicked").
   Confirm: (a) typing alone does not mark Deck/Reviews/Polish stale; (b)
   clicking "Save frame edit" does; (c) "Suggest a frame via AI"
   (`PipelineTab.tsx:377-382`) fills the draft in from a model call and the
   draft re-seeds itself whenever the committed frame changes underneath it
   (`FrameEditor.tsx:30-32`).
9. **Slide Plan (stages 5/9): use "Add content slide" / "Add prediction" /
   "Add answer"** to build entries by hand, or click "Generate plan."
   Expected: each entry has a Role select (Content/Prediction/Answer) and a
   Dominant Claim field; Prediction and Answer entries additionally show a
   "Prediction id" field (`PipelineTab.tsx:388-421`). Confirm a "Prediction"
   entry and its "Answer" entry are always two SEPARATE list rows / two
   separate eventual slides - the type has no variant holding both
   (`slide-plan.ts:20-25`'s comment: this is enforced by construction, not a
   runtime check). Below the entry list, confirm a live validation readout
   appears once a plan exists ("The plan is well-formed." on success, or itemized
   problems - `PipelineTab.tsx:438-447`, `validateSlidePlan`).

### 3.4 Deck assembly, download, per-slide regen, and the deck-wide ask

10. **On the Deck stage, click "Generate deck."**
    Expected: POSTs op `deck` (`PipelineTab.tsx:78,454`); the resulting
    slides render via the same `SlideDeckPreview` used in Section 1
    (`PipelineTab.tsx:467`). Confirm the deck reflects the committed Frame
    (mental model/example threaded through) and the Slide Plan's dominant
    claims - OWNER-ONLY judgment call, since "genuinely on-Frame" is a
    semantic property with no instrument here
    (`docs/pres-2-s6-plan.md` RES-S6-C names this explicitly).
11. **Click "Download .pptx."**
    Expected: a real file downloads, same `serializeDeckToPptx` path as
    Section 1 (`PipelineTab.tsx:235-236`). OWNER-ONLY: opening it in
    PowerPoint to confirm it is well-formed.
12. **Once the deck exists, use "Regenerate one slide":** pick a slide from
    the dropdown, type what should change, click "Regenerate this slide."
    Expected: only that ONE slide changes; this is NEW code (not the whole-
    artifact `regenerateArtifact` from Section 1) - it regenerates one slide
    given the current Frame + that slide's Plan entry + its prior content
    (`docs/pres-2-s6-plan.md:112-116`). This control is disabled until the
    Deck stage's status is exactly "done", not merely "runnable"
    (`PipelineTab.tsx:176-179`'s comment on gate I3).
13. **Use "Apply a change to the whole deck"** (the instruction field +
    "Apply" button directly below Regenerate).
    Expected: this reuses the SAME shipped `/api/decks/ask` route from
    Section 2, not a new endpoint (`PipelineTab.tsx:205`, POST to
    `/api/decks/ask`) - so the same refusal behavior applies: ask it to "add
    a slide" here too and confirm the deck is left unchanged. NOTE: unlike
    Section 2's ask box, this control does not visibly surface a refusal
    reason in the UI - `handleApplyToDeck` (`PipelineTab.tsx:200-228`) only
    acts on a successful `{status:"ok"}` response and does nothing
    observable on a refusal (no error text is set). If you ask for a
    disallowed change here and see NOTHING happen (not even a message),
    that is a real gap this reading found - confirm it and flag it; it is
    not a rendering assumption, since the code path is directly readable at
    `PipelineTab.tsx:210-224`.

### 3.5 Standard Check, Reviews, Polish - "reviewed, no findings" vs "nothing has run"

14. **On Standard Check, with no deck yet generated:** confirm you see the
    informational note "Generate the deck first." and NOT an empty findings
    list (`PipelineTab.tsx:539`).
15. **Click "Run standard check" after generating a deck.**
    Expected: this runs PURELY LOCALLY (no network call - `checkDeckStandard`
    is imported and run in-browser, `PipelineTab.tsx:101-105`). Two things
    to specifically test given this session's fixes:
    - **Title Case + colon dividers:** if a slide title looks like
      "Section 2: The Request Lifecycle", confirm it does NOT get flagged as
      a Title Case violation (the fix treats the word after a colon as a
      forced-capital segment start - `standard.ts:60-66`'s comment,
      verified green by `standard.test.ts`, 21/21 passing at the command
      above).
    - **Hyphenated titles:** a title like "Post-Lecture Practice" should
      pass (each hyphen segment capitalized), and "Post-lecture Practice"
      (lowercase "lecture") should be FLAGGED (`standard.ts:67-79`'s comment
      on per-component checking).
16. **On Review: Info Flow and Review: Visuals, with no deck yet:** confirm
    the same "Generate the deck first." note, no findings list
    (`PipelineTab.tsx:560`).
17. **Click "Run info-flow review" / "Run visual review" after a deck
    exists.**
    Expected: each POSTs a distinct op (`review-infoflow` / `review-visual`,
    `PipelineTab.tsx:79-80`) and returns itemized findings, each optionally
    tagged with a slide number (`ReviewFindings.tsx:47-58`). If a review
    genuinely finds nothing, confirm it reads as an explicit, worded
    confirmation - "No findings. (best-effort - a model-based review can
    still miss something; this is not a guarantee.)" - NOT a blank panel
    that could be mistaken for "review didn't run" (`ReviewFindings.tsx:
    39-44`; the component returns `null` entirely, showing nothing, only
    when `ranComplete` is false - `:35-37`). OWNER-ONLY: whether the
    findings are GENUINELY adversarial (catch a real information-flow or
    visual problem) is a model-quality judgment with no instrument here.
18. **Click "Run polish pass" after a deck exists.**
    Expected: also purely local (`PipelineTab.tsx:106-109`,
    `polishDeck` imported directly). If the deck needed no mechanical
    changes, confirm a green "No mechanical changes were needed." message
    (`PipelineTab.tsx:582-586`); otherwise confirm an itemized change list,
    each entry naming its kind (dedupe-label / normalize-spacing /
    normalize-badge / renumber-section - `polish.ts:44-47`). Specifically
    test a deck whose slides carry code blocks or diagrams (`code`/
    `graphic` fields) and confirm polish does NOT silently drop those fields
    from the returned deck - this was a real bug fixed this session
    (`polish.ts` spreads `{...slide, ...}` rather than rebuilding a bare
    `{title, bullets, notes}` object; `polish.test.ts` is green at the
    command above).

### 3.6 Run-to-end and editing invalidation

19. **From a fresh pipeline (only sources committed), click "Run to end."**
    Expected: the button reads "Running to end..." and is disabled while in
    flight; each stage runs in dependency order automatically EXCEPT
    Sources itself, which never auto-runs (confirmed by reading
    `PipelineTab.tsx:150-165`: the frontier filters out "sources" every
    iteration) - so if you have not yet clicked "Commit sources," Run-to-end
    should do nothing observable. After committing sources, Run-to-end
    should walk Outline -> Frame -> Plan -> Activities -> Deck -> Standard/
    Reviews/Polish (pure stages run with no visible network activity)
    without requiring any further clicks, ending with a finished deck.
    OWNER-ONLY: whether the produced deck is actually GOOD - this is the
    whole point of a run-to-end smoke test, and there is no way to judge
    model output quality from this checkout.
20. **Mid-pipeline, edit an EARLIER stage** (e.g. change the Frame after a
    Deck already exists) and confirm the invalidation graph's effect is
    visible: the Deck, Reviews, and Polish chips should flip to "(stale)"
    (per `docs/pres-2-s6-plan.md`'s stated graph: editing frame stales
    deck+reviews+polish, not plan). Click "Run to end" again and confirm it
    only re-runs the STALE stages, not stages that are already done and
    untouched.
21. **Reload the page mid-pipeline** (after committing sources and
    generating at least the outline).
    Expected: the entire pipeline state survives - it persists under
    `ta-pres-pipeline-state` (+ `ta-pres-pipeline-context-text` +
    `ta-pres-pipeline-sources` for the in-progress sources draft,
    `PipelineTab.tsx:64-66`).

### 3.7 Click budget (owner-only measurement)

22. **Count clicks for the FASTEST path**: commit sources, click "Run to
    end" once, then "Download .pptx." Expected per the plan's claim
    (`docs/pres-2-s6-plan.md` section 3, "PIPE-BUDGET"): no required input
    beyond source intake - a user who wants the thin behavior should be able
    to reach a downloadable deck in roughly: (paste/drop sources) + Commit
    sources (1 click) + Run to end (1 click) + Download (1 click) = 3 clicks
    after providing source material. COUNT IT YOURSELF and record the real
    number - this is exactly the kind of claim `seats.md`'s User Experience
    checker requires be RE-WALKED, not asserted, and nothing in this
    checkout can click a button.

---

## 4. What this checkout could not verify at all (repeat for convenience)

Per `docs/loop/this-repo.md` section 6 - name these to the owner rather than
guessing:

- **No live database / no `.env`.** Any per-project persistence for the
  pipeline (deferred to `ta-` localStorage only, `docs/pres-2-s6-plan.md`
  RES-S6-B) cannot be checked against a real Supabase row or RLS policy here.
- **No API keys.** Every `callLlm` path (outline/activities/frame-suggest/
  plan/deck/regen-slide/review-infoflow/review-visual generation, the A43-C
  ask box, the PRES-1 review/critique pass) is exercised only through mocks
  in this repo's tests. Whether the model's actual output is good, on-Frame,
  or genuinely adversarial in its reviews is unverifiable without a deployed
  environment and a real key.
- **No rendered component.** Every UI claim above (layout, chip wrapping,
  focus order, keyboard reachability, `aria-selected`/`role="tab"` behavior,
  whether a drag-and-drop actually fires in a real browser) is a READING
  claim, stated as such throughout Sections 1-3, not something vitest proved.
- **The `.pptx` file's real-world fidelity.** `serializeDeckToPptx` is
  exercised by unit tests against its own output shape, never opened in an
  actual Office/Keynote/Slides viewer from this checkout.
- **The click-count claim in section 3.7** and any other UX click-budget
  number in `docs/pres-2-s6-plan.md` - these require a human clicking a real
  browser, not a static reading of the code.

---

## Instruments used to write this doc

```
git status --short                                    (repo root, at start of this task)
git log --oneline -5                                   (recent commits, cited above)
npm run test:paths -- src/lib/deck-standard/standard.test.ts src/lib/deck-standard/polish.test.ts src/lib/presentations/pipeline.test.ts src/lib/presentations/pipeline-prompts.test.ts src/app/api/presentations/pipeline/route.test.ts src/app/components/presentations/pipeline/panel-logic.test.ts src/app/components/manual/manual-rail.test.ts src/app/url-state.test.ts src/app/components/home/useAppNavigation.test.ts
  -> 9 test files, 323 tests, all passed
```

Files opened directly to write this doc: `src/app/components/presentations/
{index.tsx, SourcesEditor.tsx, ArtifactCard.tsx, SlideDeckPreview.tsx,
panel-logic.ts}`; `src/app/components/presentations/pipeline/{PipelineTab.tsx,
PipelineStepper.tsx, FrameEditor.tsx, ReviewFindings.tsx}`;
`src/app/api/presentations/{generate,pipeline}/route.ts`;
`src/app/components/ppt-design/{index.tsx, GeneratePanel.tsx, ask-response.ts,
hooks.ts}`; `src/app/api/decks/ask/route.ts`; `src/lib/decks/deck-operations.ts`;
`src/lib/deck-standard/{standard.ts, polish.ts, frame.ts, slide-plan.ts}`;
`src/app/components/manual/manual-rail.ts`; `docs/pres-2-s6-plan.md`;
`docs/loop/this-repo.md` section 6.
