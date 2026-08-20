# Generating a lecture script from the selected module materials (chunk 3d)

The instructor's request, in their own words: as one of the bulk actions
available when selecting items on the module view, give me the option to
generate a script from the materials that have been selected.

A "script" here is the spoken-word, teleprompter-ready lecture script this app
already produces elsewhere - the thing an instructor reads aloud on camera, and
the thing the Avatar Studio and the recording tab already consume. This chunk
makes the module selection a grounding source for it. It adds NO Canvas write:
like "decks", the script is generation-only.

## Reuse survey (vetted - every symbol read before this doc was written)

**The headline: the generator, the selection-to-materials gatherer, the artifact
store, the preview modal, refine and download all already exist. The only new
code is one registry entry, one dispatch branch, and one length control.**

| Target | What already exists | Path |
| --- | --- | --- |
| The script generator | `generateLectureScriptAction(topic: string, objectives: string, targetMinutes: number, provider?: LlmProvider): Promise<{script: string} \| {error: string}>` - ONE LLM call, temperature 0.6, maxOutputTokens 4096; clamps minutes to 1-30 (out-of-range silently becomes 5), targets `minutes * 140` words, injects `getWritingStyleBlock(user.id)`, emits `[PAUSE]` on its own line between sections, returns plain text only | `src/app/actions/media.ts:228` ("use server") |
| Selection -> materials text | `gatherSelectionMaterials(items, ctx)` - batched, fail-forward, `DESCRIPTION_FETCH_LIMIT = 6`, `MATERIALS_CAP = 20000` with a truncation note | `src/lib/lms-generation/materials.ts:353`, capped at `:72`/`:75` |
| Whole-module expansion | `expandModuleSelection(items, moduleKeys, modules, exportModules)` | `src/lib/lms-generation/materials.ts` (bottom), called `src/app/actions/lms-generation.ts:336-344` |
| Versioned save | `saveGeneratedArtifactVersion(supabase, userId, {courseId, kind, title?, text, structured?, prompt})` - always inserts a new version | `src/lib/supabase/generated-artifacts.ts:66-73` |
| Bulk-bar button row | `GenerateFromSelectionSection` renders `kinds.map(...)`, one button per registered kind | `src/app/components/content-tab/modules/GenerateFromSelectionSection.tsx:99-114` |
| Offered-kinds gate | `offerableGenerationKinds(itemCount, moduleCount)` - all-or-nothing, does NOT vary per kind | `src/app/components/content-tab/modules/useLmsGeneration.ts:230-232` |
| Preview / version picker / refine / download | `GeneratedPreviewModal` - renders `versions.find(v => v.version === selectedVersion)?.text` in a `<pre>`, with NO per-kind branch anywhere in its render | `src/app/components/content-tab/modules/GeneratedPreviewModal.tsx:182`, `:259-267` |
| Download formats | `artifactDownloadFormats(artifact)` - always `["md", "docx"]`, adds `"pptx"` only when `parseDeckSlidesFromStructured(structured).length > 0` | `src/lib/lms-generation/artifact-download.ts:57-65` |
| Per-course `ta-` persistence idiom | `readStored(key)` + lazy `useState` initializer + write-on-change `useEffect`, keyed `` `ta-syllabus-quiz-module-${courseUrl}` `` | `src/app/components/content-tab/modules/useLmsSyllabusButtons.ts:45-54`, `:109-122` |

**The model to copy for the kind**: `objectivesKindConfig`
(`src/lib/lms-generation/kinds.ts:471-489`) - a plain-text kind with a
module-label-derived title and no `structured` payload. Scripts differ from it
in exactly one way: `commitMode` stays `"save-version"`, so there is no
`commitMeta` and no posting.

**The model to copy for the length control**: the deck template picker
(`GenerateFromSelectionSection.tsx:68-81`) - an inline select in the Generate
group, gated on its own kind being offered, hook-owned, threaded by name
through `ModulesView.tsx:597-604`.

**Deliberately NOT reused:**

- `composeAvatarScriptBrief` (`src/lib/avatar-video-purpose.ts:79`) - it composes
  an AVATAR brief (course facts + a purpose from a seven-value enum + the
  instructor's free-text request) and its output opens "Write a spoken-word
  script for a short AI-generated avatar video". It has no materials parameter
  and no duration parameter. Grounding on a module selection is not what it
  composes.
- A Route Handler. Decks need `src/app/api/lms-generation/deck/route.ts` because
  `generateDeckFromTemplate` makes SEVERAL sequential LLM calls
  (`route.ts:20-48`). `generateLectureScriptAction` makes exactly one, so the
  Server Action path is correct and ~100 lines of duplicated preamble
  (`LIVE_FETCHERS`, course resolution, module expansion, the materials gather)
  are avoided.
- `generateSlideNarrationAction` / `generateVideoNarrationAction`
  (`src/app/actions/media.ts:309`, `:398`) - they return per-slide and timed
  segment structures respectively, and both require slides or video frames as
  input. Neither can be grounded on a materials string.

## Findings that shape the design

1. **THERE IS NO SCRIPT OUTPUT FAMILY, AND ADDING ONE WOULD SHIP A DEAD
   CONTROL.** `GenerationKindId` is `Extract<OutputFamily, ...>`
   (`kinds.ts:75-79`) and `kinds.test.ts:35-39` asserts every kind id is a
   member of `OUTPUT_FAMILIES`. But `OUTPUT_FAMILIES`
   (`src/lib/output-selection.ts:21-56`, 13 members, none of them a script) is
   COURSE_BUILD's run-form multi-select: every member becomes a pickable option
   via `OUTPUT_FAMILY_LABELS` and is expected to become a `selected*` flag in
   `steps.course-build-scope.ts:177-189`. No COURSE_BUILD step generates
   scripts, and "blank means ALL" (`output-selection.ts:88-91`) means every
   existing saved run would silently select a family that produces nothing.
   Adding the family is the cheap move and the wrong one.

2. **THE EXHAUSTIVENESS GUARANTEE THAT MAKES THE `Extract` WORTH KEEPING IS
   NARROWER THAN THE MEMBERSHIP TEST.** What the `Extract` actually buys is: if
   `"qa"` were renamed in `OUTPUT_FAMILIES`, `kinds.ts` fails to COMPILE. That
   protection is per-id, and it survives untouched if a non-family id is unioned
   in alongside it. The membership test is the only thing that would have to
   change - and relaxing it to "or anything" would disarm it. It has to be
   replaced by something with equal force, not deleted.

3. **THE SWITCH IS TYPE-ENFORCED; THE REFINE TITLE LIST IS NOT.**
   `generateFromSelectionAction`'s `default` assigns `input.kind` to a
   `never`-typed local (`lms-generation.ts:533-538`), so an eighth kind is a
   compile error until its `case` exists. But `TITLED_GENERIC_KINDS`
   (`lms-generation.ts:944`) is a hand-maintained `readonly GenerationKindId[]`
   with no exhaustiveness check at all. A kind with a derived title that is left
   out of it silently loses that title on the first refine - and then
   `postGeneratedArtifactAction`'s `title = (artifact.title ?? "").trim() ||
   config.label` (`:639`) papers over the loss with the kind's generic label.

4. **A NEW KIND'S BUTTON APPEARS FOR FREE; A NEW KIND'S CONTROL DOES NOT.**
   `GENERATION_KINDS` is derived (`GENERATION_KIND_IDS.map(...)`,
   `useLmsGeneration.ts:153-156`) and `offerableGenerationKinds` is
   all-or-nothing, so the button needs no client change. A length select does:
   hook state -> `UseLmsGenerationReturn` -> `GenerateFromSelectionSectionProps`
   -> a named binding in `ModulesView.tsx`. Entry 267 check 6 records this exact
   path shipping switched off once already, because `ModulesView` binds props by
   name and never spreads - which `generatedPreviewModal.wiring.test.ts:430-437`
   now enforces.

5. **`useLmsGeneration` PERSISTS NOTHING TODAY.** It has zero `localStorage`
   references; `templateId`, `postModuleChoice`, `postNewModuleName` and
   `instructions` are all plain `useState` and are lost on reload. The
   convention this repo requires for a new control is next door in
   `useLmsSyllabusButtons.ts:45-54`. This chunk brings the new control up to
   that standard; it does not retrofit the four existing ones.

6. **TWO FILES ARE ALREADY OVER THE 1000-LINE CEILING BEFORE THIS CHUNK ADDS A
   LINE.** `src/app/actions/lms-generation.ts` is 1040 and
   `src/app/components/content-tab/modules/useLmsGeneration.ts` is 1059.
   `post-content.ts` exists precisely because this file blew the ceiling once
   already (`lms-generation.ts:545-550`). This chunk adds to both, so the split
   is part of the chunk, not a follow-up.

7. **THE MINUTES ARGUMENT HAS A SILENT-CLAMP TRAP.**
   `generateLectureScriptAction` accepts `targetMinutes` but silently falls back
   to 5 for anything outside 1-30 (`media.ts:237`). `steps.media.ts:387` passes
   50 - so that workflow step has been producing 5-minute scripts, not 50-minute
   ones. That is a pre-existing defect in a different feature and is NOT fixed
   here, but it is the reason this chunk offers a fixed set of in-range options
   rather than a free-text number field.

## Acceptance criteria

### Registry

**S1. THE SCRIPT IS AN EIGHTH GENERATION KIND, NOT A NEW BULK SECTION.** It is
registered in `GENERATION_KIND_IDS` and `GENERATION_KIND_CONFIGS` and appears as
one more button in the existing Generate group. It inherits selection expansion,
materials gathering, the versioned artifact store, the preview modal, the
version picker, refine and download without any of those being modified. Adding
a second bulk row, or a dialog, for this is out of bounds.

**S2. THE KIND ID IS CARVED OUT OF `OUTPUT_FAMILIES` EXPLICITLY, NOT SMUGGLED
IN.** `kinds.ts` gains an exported `NON_FAMILY_KIND_IDS = ["scripts"] as const`
with a comment stating why (finding 1), and `GenerationKindId` becomes
`Extract<OutputFamily, ...> | (typeof NON_FAMILY_KIND_IDS)[number]`. The
per-id compile-time drift protection on the seven family-backed ids is
unchanged. `OUTPUT_FAMILIES`, `OUTPUT_FAMILY_LABELS`, the COURSE_BUILD run form
and `docs/WORKFLOW-RUN-FORM.md` are NOT touched.

**S3. THE CARVE-OUT CANNOT BECOME A LOOPHOLE.** `kinds.test.ts:35-39`'s
membership check is replaced by TWO tests, not weakened into one: (a) every
`GENERATION_KIND_IDS` member is in `OUTPUT_FAMILIES` OR in
`NON_FAMILY_KIND_IDS`; (b) `NON_FAMILY_KIND_IDS` and `OUTPUT_FAMILIES` are
DISJOINT. Without (b), a future id that does have a family could be parked in
the carve-out and lose its rename protection - which is the only thing the
`Extract` was ever buying.

**S4. THE CONFIG IS PLAIN TEXT, SAVE-ONLY.** `scriptsKindConfig`:
`id: "scripts"`, `artifactKind: "lecture-script"` (kebab-case, singular
instance, matching every existing entry), `label: "Lecture script"`,
`needsCourseRow: true`, `commitMode: "save-version"`, NO `commitMeta`, NO
`renderStructured`. `render` returns the script string unchanged. `isEmpty` is
true when the trimmed script is empty, with an `emptyMessage` naming the
selection. A teleprompter script is instructor material; posting it to Canvas
would publish the instructor's spoken lines to students, so the absence of
`commitMeta` is a decision, not an omission.

### Server

**S5. IT RUNS ON THE SERVER ACTION PATH, NOT A ROUTE HANDLER.** One `case
"scripts"` in `generateFromSelectionAction`'s switch, following the
`objectives` branch's five-step skeleton exactly (read config, call the
generator, `"error" in` guard, `config.isEmpty` guard, save, return `{artifact,
notes}`). No new route, no duplicated `LIVE_FETCHERS`, and no change to the
`decks` early refusal at `:298-300`.

**S6. THE GENERATOR IS CALLED UNCHANGED, AND ITS `topic` IS NEVER EMPTY.**
`generateLectureScriptAction` gets `topic` = the course name and module label
joined, `objectives` = `materials.materialsText`, and `targetMinutes` from the
request. `media.ts:229` refuses an empty topic outright, and `moduleLabel`
already falls back to `"the selected material"` (`lms-generation.ts:362`), so
the composed topic is non-empty on every path. Passing the materials as
`objectives` is deliberate and correct: that parameter renders into the prompt
as "Cover these objectives/notes:" (`media.ts:245`). `media.ts` is NOT modified.

**S7. THE REQUESTED LENGTH REACHES THE MODEL.** `GenerateFromSelectionInput`
gains an optional `targetMinutes?: number`. Absent or out-of-range, the branch
supplies the same default the UI offers rather than relying on the generator's
silent fallback to 5 (finding 7), so an unbound caller gets the documented
length and not a surprise. The saved `prompt` records the minutes actually used,
so the version history says which length produced which text.

**S8. THE TITLE IS DERIVED AND SURVIVES A REFINE.** Generate sets `title:
`${moduleLabel} Lecture Script`` (the `objectives` precedent, `:453`), and
`"scripts"` is added to `TITLED_GENERIC_KINDS` (`:944`) so the generic refine
path carries `input.currentTitle` forward. Finding 3 makes this un-typechecked,
so it gets its own test asserting a refined script keeps its title - not merely
that the list contains the string.

**S9. REFINE USES THE GENERIC TEXT PATH, WITH NO NEW BRANCH.** A script has no
`structured` payload, so the `decks` and `knowledgeChecks` special cases stay
untouched and `"scripts"` falls through to `:925-993` as intended. It must be
verified that it does so - a silently-dropped `structured` is the bug the
`knowledgeChecks` branch exists to fix (`:833-843`), and the way to be sure this
kind is immune is to confirm it never writes one.

**S10. POSTING REFUSES IT, LIKE EVERY OTHER SAVE-ONLY KIND.**
`postGeneratedArtifactAction` already refuses on `commitMode !== "save-and-post"`
(`:617-619`) with no per-kind switch, so this needs no code - but it gets the
same explicit refusal test `qa`, `currentEvents` and `decks` each already have
(`lms-generation.test.ts:1405/1415/1422`).

### Client

**S11. THE BUTTON APPEARS WITH NO CLIENT CHANGE, AND THAT IS VERIFIED, NOT
ASSUMED.** `kinds` is registry-derived, so "Lecture script" renders in the
Generate group for any non-empty selection. The existing registry-relative test
(`useLmsGeneration.test.ts:81-83`) already pins `offerableGenerationKinds(1)`
against `GENERATION_KIND_IDS` and must stay green without being edited.

**S12. THE LENGTH SELECT IS INLINE, GATED, AND WIRED END TO END.** A single
`TextField select` in the Generate group offering 5 / 10 / 15 / 20 / 30 minutes,
defaulting to 15, gated on `kinds.some(k => k.id === "scripts")` exactly as the
deck picker is gated on `offersDeck`, disabled while `busy !== ""`. It is
threaded hook state -> return value -> section props -> a NAMED binding in
`ModulesView.tsx`. Entry 267 check 6 is the precedent for why the binding is an
acceptance criterion and not an implementation detail: this control has to be
traced from the rendered select to the generator argument, not just compiled.

**S13. THE SELECT PERSISTS ACROSS A RELOAD, PER COURSE.** Key
`` `ta-lms-script-minutes-${courseUrl}` ``, using `useLmsSyllabusButtons.ts`'s
read-on-init / write-on-change idiom (lazy `useState` initializer guarded by
`typeof window === "undefined"`, plus a write effect). A stored value that is not
one of the offered options falls back to the default rather than being passed
through. The four pre-existing non-persisted controls in this hook are out of
scope.

**S14. THE PREVIEW MODAL IS NOT MODIFIED.** A script is plain text, which is
exactly what `GeneratedPreviewModal` already renders (`:182`, `:259-267`).
`offersPost` resolves false through the existing `kindOffersPost`, so the whole
Post block is absent with no new branch. Downloads offer `.md` and `.docx` and
correctly do NOT offer `.pptx`, because `artifactDownloadFormats` gates on
parsed slides and never on the kind id.

### Cross-cutting

**X1. EVERY HAND-MAINTAINED KIND LIST IS UPDATED IN THE SAME COMMIT.**
`kinds.test.ts:23-33` (the literal array AND the "seven kinds" wording in the
test name), `useLmsGeneration.test.ts:409-417` (`kindOffersPost`) and `:578-588`
(`kindLabelFor`), and `lms-generation.test.ts:1110-1126` +`:1304-1327` (the
hardcoded generator list `expectOnlyGeneratorCalled` and the R3 bogus-kind guard
assert are untouched - `generateLectureScriptAction` must join it, or the
"no neighbour generator was called" assertion is silently incomplete).

**X2. BOTH OVER-CEILING FILES ARE SPLIT AS PART OF THIS CHUNK.**
`src/app/actions/lms-generation.ts` (1040 before this change) and
`useLmsGeneration.ts` (1059 before this change) are brought under 1000. The
split must not re-export types from a `"use server"` module - only async
functions may be exported from one, and a type re-export there is caught by
`next build` alone, not by lint or `tsc`. Shared types move to a lib module.

**X3. NO BEHAVIOUR CHANGE TO ANY EXISTING KIND.** The seven existing kinds keep
their ids, labels, order, `commitMode`, titles and generators. The Generate
group gains exactly one button and one conditional select. `OUTPUT_FAMILIES` and
every COURSE_BUILD step are untouched, so no workflow run form changes.

## Limits (state, do not paper over)

- vitest here is node-env and `include`s only `src/**/*.test.ts`, so no component
  is ever rendered. The select's markup, its keyboard behaviour, its disabled
  state and the actual button click are verified by READING and by the
  source-text wiring tests, never by a rendered assertion. A green suite proves
  the wiring exists in the source, not that it works on screen.
- The quality of the generated script - whether 15 minutes of materials actually
  yields 2100 usable words - is not testable here and is not claimed.
  `generateLectureScriptAction`'s own contract is taken as given and not
  re-verified.
- `steps.media.ts:387`'s 50-minute argument silently clamping to 5 (finding 7)
  is a real pre-existing defect in the workflow step and is NOT fixed by this
  chunk.
- No generation has been exercised against a live Canvas course or a live model
  as part of this chunk.
