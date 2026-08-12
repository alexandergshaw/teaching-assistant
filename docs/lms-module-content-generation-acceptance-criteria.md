# Generating and posting new module content from the LMS selection (chunk 3b)

The instructor's workflow, in their own words: select the whole course so far,
generate a new module's OBJECTIVES, then select only that new module's
objectives and generate the assignment, quiz, lecture and announcement for that
module.

This is the chunk that finally adds the Canvas WRITE that entries 262 and 266
deferred. Every existing kind stays generation-only.

## Reuse survey (vetted - every symbol read before this doc was written)

**The headline: every generator already exists. The gap is orchestration and the
commit, not generation.**

| Target | Generator that already exists | Path |
| --- | --- | --- |
| Objectives | `generateModuleObjectivesForAssignment(assignmentName, displayTitle, assignmentText, fallbackContent, provider, courseKind, requiredTools, weekNumber, totalWeeks): Promise<{text} \| {error}>` | `src/app/actions/module-objectives-generator.ts:47` (plain function, NOT a "use server" module; has a no-LLM fallback via `scaffoldModuleObjectivesDoc`) |
| Lecture | `generateLectureFromMaterialsAction(courseName, moduleName, materialsText, provider, courseKind): Promise<{presentationTitle, slides, announcement, codeStripped?} \| {error}>` | `src/app/actions/course-planning-lecture.ts:21` - note it returns an `announcement` string FREE alongside the deck |
| Quiz questions | `generateKnowledgeCheckAction(weekLabel, topic, materials, provider, courseKind): Promise<{questions} \| {error}>` | `src/app/actions/knowledge-check.ts:90` |
| Announcement | `draftAnnouncementAction(instruction, provider): Promise<{title, message} \| {error}>` | `src/app/actions/messaging.ts:405` |
| Assignment | `generateAssignmentAction` | `src/app/actions/llm-content.ts:245` |

| Canvas write | Action | Path |
| --- | --- | --- |
| Page | `createPageAction(courseUrl, {title, body?, published?}, acronym?)` | `src/app/actions/canvas-files-bulk.ts:434`; lib `pages.ts:64` defaults `published:false`, does NOT dedupe by title |
| Page update | `updatePageAction(courseUrl, pageUrl, {title?,body?,published?}, acronym?)` | `canvas-files-bulk.ts:419` |
| Assignment (creates AND links) | `createCourseAssignmentAction(courseUrl, fields: NewAssignment, moduleId \| null, acronym?)` | `src/app/actions/canvas-modules.ts:121` |
| Gradable (no link) | `createGradableAction(courseUrl, kind: "Assignment"\|"Quiz"\|"Discussion", fields, acronym?)` | `canvas-files-bulk.ts:377`; always unpublished |
| Quiz question | `createQuizQuestionAction(courseUrl, quizId, question, acronym?)` | `canvas-files-bulk.ts:301` |
| Publish a quiz | `bulkUpdateAction(courseUrl, "Quiz", [id], {published:true}, acronym)` | `canvas-files-bulk.ts:179` |
| Announcement | `createAnnouncementAction(courseUrl, title, message, acronym?, delayedPostAt?)` | `src/app/actions/canvas-inbox.ts:233` |
| Module | `createModuleAction(courseUrl, name, position?, acronym?)` | `canvas-modules.ts:59` - NO idempotency, POSTs unconditionally |
| Module item | `createModuleItemAction(courseUrl, moduleId, item: NewModuleItem, acronym?)` | `canvas-modules.ts:105` |
| Question adapter | `quizQuestionToInput(q): QuizQuestionInput` | `src/app/components/content-tab/utils.ts:382` |

**The model to copy for the commit**: `postGuidesToLms`
(`src/lib/workflows/registry/steps.course-guides.ts:198`) - reuse-or-create a
named module (`:214-225`), then per doc either `updatePageAction` an existing
same-title page or `createPageAction` a new one (`:245-260`), then
`createModuleItemAction` only if not already linked (`:262-265`); fully re-run
safe, per-doc try/catch that turns a failure into a note rather than aborting.
The quiz reference implementation is `steps.knowledge-checks.ts:146-204`.

**Deliberately NOT reused**: `addContentToModuleDetailed`
(`content-tab/modules/moduleContentActions.ts:88`) does all of this already, but
it is a CLIENT module (imports `"../../../actions"` and `@/lib/pptx`), so a
server-side commit step cannot import it.

## Findings that shape the design

1. **`commitMode` is dead metadata.** Exhaustive grep: `commitMode` and
   `needsCourseRow` appear only in `kinds.ts` and `kinds.test.ts`. No runtime
   code reads either. This chunk introduces the FIRST consumer - it is not a
   refactor of an existing switch, because there is no switch.
2. **`kinds.ts` is a deliberate leaf** (its header bans any `@/app/actions` or
   Supabase import), so the commit EXECUTOR cannot live there. Only the
   declarative commit METADATA can.
3. **The runner's dispatch is a literal if/else chain**
   (`lms-generation.ts:241` qa, `:263` else currentEvents) with an explicit
   comment at `:168-172` saying the decks refusal exists precisely because a
   stray kind would silently run the else branch. Adding four kinds to that
   chain without converting it to a real dispatch would repeat that hazard.
4. **`useLmsGeneration` never calls `setBusy` or `reload()`**, and its header
   (`:24-33`) justifies both with "this feature never writes to Canvas". A
   posting kind invalidates both justifications. `ModulesView.tsx:143-173`
   passes neither into the hook today.
5. **The instructor's second step needs `reload()`.** After posting an
   objectives page, selecting THAT PAGE individually will not see it until the
   client module tree refreshes. Selecting the whole MODULE is immune, because
   the server re-fetches the tree itself (`lms-generation.ts:212`).
6. **`OUTPUT_FAMILIES` already carries** `"objectives"`, `"assignments"`,
   `"knowledgeChecks"` and `"announcements"`, so `GenerationKindId` can be
   widened with no new vocabulary. The file's own rule is append, never insert.

## Acceptance criteria

### Registry and commit model

R1. **`GenerationCommitMode` GAINS A SECOND VALUE AND ITS FIRST RUNTIME
CONSUMER.** The existing three kinds keep `"save-version"` and their behaviour is
untouched. New kinds declare that they also post, plus the declarative metadata a
commit needs (what Canvas object, whether it is published on creation, how it is
placed in a module). `kinds.ts` stays a leaf - metadata only, no executor.

R2. **FOUR NEW KINDS**, reusing existing `OUTPUT_FAMILIES` ids: `objectives`
(a Canvas Page), `assignments` (a Canvas Assignment), `knowledgeChecks` (a Canvas
Quiz plus its questions), `announcements` (a Canvas Announcement). `decks`
remains the lecture and remains generation-only in this chunk.

R3. **THE RUNNER'S IF/ELSE CHAIN BECOMES A REAL PER-KIND DISPATCH.** Adding four
kinds to an `if (kind === "qa") ... else` chain would reproduce exactly the
silent-wrong-branch hazard `:168-172` documents. Every kind must resolve to its
own generator explicitly, and an unhandled kind must fail loudly, never fall
through to a neighbour.

### Posting

P1. **NOTHING IS POSTED WITHOUT AN EXPLICIT SECOND ACT.** Generation saves a
version and shows it in the existing preview modal, exactly as today. Posting is
a separate, explicitly pressed action from that modal. This follows the project's
standing draft/review-then-commit rule for side effects, and it means the review
surface built in chunk 3c is the review step - no new modal.

P2. **THE ARTIFACT IS SAVED BEFORE ANYTHING IS POSTED.** The Canvas write happens
after `saveGeneratedArtifactVersion`, so a failed post always leaves a recoverable
saved version. A post is never the only copy of generated work.

P3. **POSTING IS RE-RUN SAFE**, following `postGuidesToLms`: reuse an existing
same-titled page rather than creating a duplicate, and link into a module only
when not already linked. `createModuleAction` has no idempotency, so a
reuse-or-create check by name must happen before creating a module.

P4. **A PARTIAL POST REPORTS WHAT LANDED.** A quiz whose questions partly fail,
or content created but not linked to its module, must be reported as such - the
orphan case that `ModuleContentResult` already models. Never a bare "failed" when
a Canvas object was in fact created, and never a bare "success" when it was not
linked.

P5. **THE INSTRUCTOR CHOOSES WHERE IT LANDS.** Either an existing module, or a
NEW module created by name as part of the post - the "generate a new module"
half of the request. A new module is created unpublished-by-default consistent
with every other creation path in this tab.

P6. **THE "NOTHING WAS WRITTEN TO CANVAS" COPY MUST STOP LYING.**
`generationSuccessNote` and `refineSuccessNote` hardcode that sentence, and the
preview modal repeats it in two places. For a posting kind that copy is false and
must be corrected; for the three existing kinds it must remain exactly as it is.

### Client wiring

C1. **THE TAB-WIDE BUSY FLAG AND `reload()` ARE WIRED FOR POSTING KINDS.** Both
of `useLmsGeneration`'s documented departures are void once Canvas state changes:
a post must hold the flag that gates other Canvas-writing controls, and must
refresh the module tree afterwards so the newly created page/assignment/quiz is
selectable - which is precisely what the instructor's second step needs (finding
5). Generation-only kinds must NOT start holding the tab-wide flag; that
departure was correct and stays.

C2. **THE HOOK'S HEADER COMMENT IS CORRECTED, NOT LEFT STALE.** It currently
states the feature never writes to Canvas and never reloads. Both become false
for posting kinds.

### Cross-cutting

X1. **PURE LOGIC IS SEPARATELY TESTABLE**: which kinds post, what a post plans to
do, the reuse-or-create decision, and the partial-result summary are pure
functions with in-memory fixtures and no `vi.mock`.

X2. **NO EMOJIS. No new CSS.** Reuse the preview modal's existing classes and the
tab's existing MUI idiom.

X3. **`headless.test.ts`'s exact-count canary** must be updated in the SAME commit
if and only if a headless-safe step type is added or removed. This chunk adds no
workflow step, so it should be untouched - confirm, do not assume.

## Limits (state, do not paper over)

- vitest is node-env and renders no component; no test proves the post button
  renders or is reachable. Verified by reading only.
- Canvas is not exercised in tests - every Canvas write is behind an injected or
  mocked collaborator, so "it posts correctly" is not proven end to end here.
- `decks` stays generation-only; committing a lecture deck as a `.pptx` file into
  a module is deliberately out of scope for this chunk.
- The video/narration/avatar add-on to a generated lecture is a separate,
  later chunk and is not started here.
