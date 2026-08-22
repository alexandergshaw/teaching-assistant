# A Learning Resources page, generated from the selection and posted into a module

A new "Learning resources" button in the Modules view's **Generate from
selection** row: given the selected assignments, quizzes, pages and files, it
generates a student-facing resources page and posts it into the selected
module as a Canvas Page.

## Correction to the premise this feature was asked with

The request named "the module objectives bulk action". There is no such bulk
action. `BulkModulesSection.tsx` / `useBulkModuleActions.ts` own only
Publish/Unpublish/Delete and "Add to each"; neither mentions objectives.
"Module objectives" is one **generation kind** among eight in the
`GenerateFromSelectionSection` row (`src/app/components/content-tab/modules/
GenerateFromSelectionSection.tsx:135-150`), driven by `useLmsGeneration.ts`.

This makes the ask smaller than it sounds: everything after "the model
produced text" is already generic.

## What already exists (reuse survey - vetted, do not rebuild)

The generate -> save version -> preview/refine -> post-to-Canvas pipeline is
**kind-agnostic end to end**. For a kind whose Canvas shape is a Page linked
as a module item - which is exactly this one, and exactly what objectives
already is - the following are reused **without modification**:

| Need | Existing code | Where |
| --- | --- | --- |
| The button, its busy state, its gating | `GenerateFromSelectionSection` + `offerableGenerationKinds` | `GenerateFromSelectionSection.tsx:73-158`, `lmsGenerationKindHelpers.ts:98-100` |
| Client generate handler, selection expansion, busy/notes | `useLmsGeneration.generate` | `useLmsGeneration.ts:541-641` |
| Reading the selected items' real text | `gatherSelectionMaterials` / `expandModuleSelection` | `src/lib/lms-generation/materials.ts:318, 457` |
| Module label for the prompt and the page title | `buildModuleLabel` | `lmsGenerationSelection.ts:56-91` |
| Saving a version + version history | `saveGeneratedArtifactVersion`, `listGeneratedArtifactVersionsAction` | `src/lib/supabase/generated-artifacts.ts`, `lms-generation.ts:822-843` |
| Preview, refine, hand-edit, download | `GeneratedPreviewModal` | `GeneratedPreviewModal.tsx` |
| **Which module to post into, defaulted from the selection** | `defaultPostModuleChoiceFrom`, `resolvePostModuleTarget`, `postModuleOptionsFrom` | `lmsGenerationModuleTarget.ts:35-137` |
| Posting: fresh course read, target plan, page create/update, module link, outcome summary | `postGeneratedArtifactAction` -> `planModuleTarget` / `planPostSteps` / `executePostPlanSteps` / `summarizePostOutcome` | `lms-generation.ts:698-797`, `commit-plan.ts:50-102, 208-243, 328-372`, `commit-execute.ts:115-229` |
| Markdown -> Canvas page HTML | `buildPostContentForKind`'s `"page"` branch (`markdownLiteToHtml`) | `post-content.ts:73-81` |
| Canvas writes | `createPageAction` / `updatePageAction` / `createModuleItemAction` via `LIVE_CANVAS_WRITERS` | `canvas-files-bulk.ts:419-445`, `canvas-modules.ts:105-118`, `lms-generation.ts:154-156` |

**The genuinely new code is the generation half only**: one kind config, one
generator function with its own prompt, one `case` in one switch, one button
label. Nothing in `commit-plan.ts`, `commit-execute.ts` or `post-content.ts`
is touched.

## Decisions

**D1. The page is grounded in the selection - it never invents links.** The
objectives generator already runs `stripModelUrls` over model output for this
reason. A "resources" page is the single most hallucination-prone artifact
this app could produce (a model asked for resources will confidently emit
plausible, dead URLs), so the same strip applies here and the prompt is built
so the page is still useful without them. A resource, for this feature, is one
of:
1. a course item the instructor actually selected (named as it is named in
   Canvas, so a student can find it in the module),
2. a concept or skill to review before attempting that work, with a one-line
   statement of why it matters for that specific assignment or quiz,
3. a concrete practice suggestion or self-check,
4. search terms a student can use to find outside material themselves.

Inventing a URL, a textbook chapter number, a video title, or an author is a
defect, not a feature.

**D2. Same Canvas shape as objectives**: `canvasObjectKind: "page"`,
`placement: "module-item"`, `publishedOnCreation: false`. The instructor
reviews the generated page in the preview modal and posts it deliberately -
generation never writes to Canvas.

**D3. The post target defaults to the module the selection names** for free -
`defaultPostModuleChoiceFrom` keys off the selection, not the kind, so
declaring `placement: "module-item"` is the whole of the work (recent commit
a66b140 / `docs/objectives-post-target-from-selection-acceptance-criteria.md`).

**D4. Plain `{ text: string }` generated shape**, not a structured one. That
keeps `kindSupportsTextEdit` true, so the instructor can hand-edit the page
in the preview modal before posting - worth more here than machine-readable
structure, since a resources list is prose a human will want to tune.

**D5. The `artifactKind` string is chosen once and never renamed.** It is the
version-history query key (`generated_artifacts` rows are keyed by
`(courseId, kind)`); renaming it orphans every saved version with no
migration path (`kinds.ts:93-96`).

## Acceptance criteria

### A. The kind

**A1.** A new generation kind `resources` exists, labelled `Learning
resources`, offered by the same rule every other kind is offered by (any
item or module selected). Because it has no `OutputFamily` counterpart, it
joins the `NON_FAMILY_KIND_IDS` carve-out the way `scripts` does - the
`Extract`-derived union will not compile otherwise (`kinds.ts:112-145`).

**A2.** Its `artifactKind` is `learning-resources` - distinct from every
existing kind, kebab-case, and permanent (D5).

**A3.** Its `commitMeta` is `{ canvasObjectKind: "page", placement:
"module-item", publishedOnCreation: false }` - byte-identical in shape to
objectives, so the entire post pipeline applies unmodified.

**A4.** `render` / `isEmpty` / `emptyMessage` follow the `{ text }` pattern.
The empty message names this kind specifically, so a blank model response is
distinguishable from any other kind's.

**A5.** `buildPrompt` records the audit-trail reconstruction saved to
`generated_artifacts.prompt` - it is NOT the literal model prompt (that lives
in the generator, A7).

### B. The generator

**A6.** A new generator function is added, shaped exactly like
`generateModuleObjectivesForAssignment`: it takes the module label, the
gathered materials text, the provider and the course kind, and returns
`Promise<{ text: string } | { error: string }>`. It lives in its own file
under `src/app/actions/`, not inside `lms-generation.ts`.

**A7.** The prompt implements D1: resources are drawn from the supplied
materials, concepts, practice and search terms - never invented links,
citations, chapter numbers or media titles. It reuses the existing shared
contracts rather than re-writing them: `PLAIN_LANGUAGE_CONTRACT`
(`@/lib/artifact-voice`) and `courseKindContract` / `courseKindNoun`
(`@/lib/course-kind`). It does NOT use `BLOOM_OBJECTIVES_CONTRACT` - that is
an objectives-specific contract and has no meaning here.

**A8.** The output is passed through `stripModelUrls` (D1). A model response
that is empty after stripping is an error, not an empty success.

**A9.** The embedded provider short-circuits to a deterministic scaffold
before any model call, exactly as the objectives generator does - never a
silent failure and never a model call.

**A10.** The page is written for STUDENTS, second person, and organized so it
is scannable in the Canvas page it becomes: short headed sections, one line
per resource, no preamble about being an AI or about the instructor's intent.

### C. Wiring

**A11.** One `case "resources":` is added to `generateFromSelectionAction`'s
switch. It calls the new generator with the gathered materials, saves the
version with the title `` `${moduleLabel} Learning Resources` `` (the literal
lives at this call site, mirroring objectives' own `${moduleLabel}
Objectives`), and returns `{ artifact, notes }`. The `default:` `never`
exhaustiveness guard must be satisfied by the new case, never by widening it.

**A12.** Nothing else in the post path changes. `postGeneratedArtifactAction`,
`planModuleTarget`, `planPostSteps`, `executePostPlanSteps`,
`summarizePostOutcome`, `buildPostContentForKind` and `LIVE_CANVAS_WRITERS`
are all used as they stand. A diff touching any of them is a signal the kind
was modelled wrongly.

**A13.** Posting creates the page and then links it into the target module, in
that order, reusing a same-title page when one exists - all of which is
`planPostSteps`' existing page branch. A created-but-unlinked outcome reports
as `partial` naming what was created, never as a bare failure.

### D. Tests

**A14.** The generator gets its own unit tests in the shape of
`module-objectives.test.ts`: grounding fallback, embedded-provider
short-circuit, model error propagation, empty response, and - the one that
matters most - **that a model response containing URLs comes back with them
stripped** (D1/A8).

**A15.** `lms-generation.test.ts`'s "new save-and-post kinds" block gains a
case for this kind: the generator is the only one called, the version is
saved with the derived title, an empty text saves nothing, and a generator
error propagates without saving.

**A16.** Tests pin FACTS and ORDERING, never prose spelling - source-text
assertions in this repo have twice forced contorted implementations.

## Out of scope

- Any change to the post/commit pipeline (A12).
- Structured resource data (title/URL pairs) or a `renderStructured`
  implementation - see D4.
- Fetching, validating or link-checking external URLs.
- A separate bulk-bar row. This is a kind in the existing row, not a new
  control.

## Sequencing

This feature does not start until the in-flight "Ask AI with the module
selection" chunk (`docs/modules-selection-ask-ai-acceptance-criteria.md`) is
pushed. Its only file overlap is `ModulesView.tsx`, and that chunk is editing
it now.
