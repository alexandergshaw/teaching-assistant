# Re-gearing the script button to a module intro video, and making it work from an import (chunk 3g)

The instructor's request, in their own words: "this button should be regeared to
generate the script for a module intro video. and it should work when there is
no live connection, only a course import (currently getting this message: No
saved course is linked to /courses/10287. Set this course's Canvas URL on its
course row, then try again. for the attached import)".

Two halves, deliberately kept in one chunk because the instructor reported them
as one experience: the button produces the wrong KIND of script, and for their
imported course it produces nothing at all.

The attached cartridge is a real Canvas export of "Introduction to
Cybersecurity" (CYBER I): 16 modules shaped `Week N: (Sep 7 - Sep 13)`, each
opening with a `ContextModuleSubHeader` naming the week's topic, then that
week's assignments, quizzes and discussions, then a `Unit N Chapter: ...` wiki
page and supporting pages. It already contains `Unit N Overview Video` pages -
but every one of them is a bare Vimeo `<iframe>` with no text, so there is no
existing script in the export to imitate or reuse. This is the shape the intro
script is written against.

## Reuse survey (vetted - every symbol read before this doc was written)

**The headline: nothing about the button, the preview modal, the teleprompter,
refine, edit or download needs to change. The button's existence, label and
behaviour are 100% data-driven from `kinds.ts` plus one `case` in the server
action. The re-gear is a prompt, a label, a title and a length list.**

| Target | What already exists | Path:line |
| --- | --- | --- |
| The kind config being re-geared | `scriptsKindConfig: GenerationKindConfig<ScriptGeneratedContent>` - `id: "scripts"`, `artifactKind: "lecture-script"`, `label: "Lecture script"`, `commitMode: "save-version"`, `deliveredAloud: true`, no `commitMeta`, no `renderStructured` | `src/lib/lms-generation/kinds.ts:629-646` |
| The button row | `GenerateFromSelectionSection` renders `kinds.map(...)`; `offersScript = kinds.some(k => k.id === "scripts")` gates the length select | `src/app/components/content-tab/modules/GenerateFromSelectionSection.tsx:83`, `:116-132` |
| The kind list the buttons come from | `GENERATION_KINDS` derived from `GENERATION_KIND_IDS`; `offerableGenerationKinds` is all-or-nothing | `src/app/components/content-tab/modules/useLmsGeneration.ts:160-163`, `:238` |
| The server branch | `case "scripts"` - resolve minutes, compose topic, call the generator, guard, save | `src/app/actions/lms-generation.ts:580-622` |
| Length bounds and maths | `LECTURE_SCRIPT_MIN_MINUTES = 1`, `_MAX_MINUTES = 30`, `_WORDS_PER_MINUTE = 140`, `lectureScriptWordTarget(minutes)`, `lectureScriptMaxOutputTokens(minutes)` (clamped 512..8192), `checkLectureScriptMinutes(raw)` | `src/lib/lecture-script-bounds.ts:47,52,57,80,91,113` |
| Offered lengths + coercion | `SCRIPT_LENGTH_OPTIONS = [5,10,15,20,30]`, `DEFAULT_SCRIPT_MINUTES = 15`, `resolveScriptMinutes(raw)` (membership, not range) | `src/lib/lms-generation/script-length.ts:30,35,48` |
| Writing-style injection | `getWritingStyleBlock(userId)` - returns `""` when there is no sample | `src/app/actions/writing-style-block.ts:9-33` |
| Course resolution dispatcher | `resolveGenerationCourseRow(courseUrl, courseId)` = `courseId ? resolveLmsCourseRowByIdAction(courseId) : resolveLmsCourseRowAction(courseUrl)` | `src/app/actions/lms-generation.ts:210-212` |
| The by-id (export) resolver | `resolveLmsCourseRowByIdAction(courseId)` - owner-scoped `listCourseHubAction` lookup, no Canvas | `src/app/actions/lms-syllabus-buttons.ts:96` |
| The failing matcher | `canvasUrlMatchesCourse(courseCanvasUrl, tabCanvasUrl)` - requires the parsed `/courses/<id>` AND the lowercased host to match | `src/lib/course-canvas-url-match.ts:35-49` |
| The host extractor at the centre of the defect | `hostOf(url)` - `new URL(url)`, falling back to `new URL("https://" + url)` | `src/lib/course-canvas-url-match.ts:16-26` |
| What the UI actually emits as a course URL | `onSelect(`/courses/${id}`)` (live picker) and `url: `/courses/${c.id}`` (Courses-table LMS cell) - host-less, always | `src/app/components/CoursePicker.tsx:275`, `src/app/components/courses/LmsCell.tsx:49` |
| The institution discriminator that already exists | `Course.institution`, already threaded to every call site as `activeInstitution` / `acronym` | `src/app/components/ContentTab.tsx:139`, `courses-table-helpers.ts:603-605` |
| The export recovery path (also broken by the same defect) | `tryExportFallbackForFailedLiveRead(supabase, courseUrl)` - its FIRST line is `resolveLmsCourseRowAction(courseUrl)` | `src/app/components/ContentTab.tsx:114-124` |
| The error string | `courseNotLinkedError(canvasUrl)` | `src/app/actions/lms-syllabus-buttons.ts:37-41` |
| Offline materials | `gatherExportItem(entry)` - reads `entry.item.body`, synchronous, "no network access, so never fails" | `src/lib/lms-generation/materials.ts:270-279` |
| Offline course read by row id | `readExportCourseContentById(supabase, courseId)` - Storage download + `parseCartridgeBlob`, no Canvas credentials | `src/lib/lms-export-source/read-export-course-content.ts:104` |
| The export identifier, already threaded | `exportCourseId` from `ContentTab` through `ModulesView` into `useLmsGeneration` | `src/app/components/ContentTab.tsx:171`, `ModulesView.tsx:235` |
| Teleprompter gate | `kindDeliveredAloud(id)` - reads `deliveredAloud` off the config, never an id literal | `src/lib/lms-generation/kinds.ts:684-686` |
| Title carry-forward | `TITLED_GENERIC_KINDS` already contains `"scripts"`; no exhaustiveness check exists | `src/app/actions/lms-generation.ts:246` |

**Deliberately NOT reused:**

- `generateLectureScriptAction` (`src/app/actions/media.ts:241`) is NOT modified
  and NOT re-pointed. Its prompt is a full lecture ("open with a one-sentence
  hook and end with a brief recap", `[PAUSE]` between major sections) and it has
  other callers that genuinely want that: the Recording tab
  (`useLectureScript.ts:74`), the `generate-lecture-script` workflow step
  (`steps.media.ts:416`) and `draft-upcoming-lectures`
  (`steps.content-generators.draft-upcoming-lectures.ts:276`). Re-pointing it
  would silently re-gear all of them.
- `AVATAR_VIDEO_PURPOSES` / `composeAvatarScriptBrief`
  (`src/lib/avatar-video-purpose.ts:18-103`). Adding a `"module-intro"` purpose
  there is a genuinely cheaper one-file change and it was considered and
  rejected: it lives in the Recording tab's Avatar Studio, not on the module
  bulk bar, and it composes from a free-text prompt plus course facts with NO
  materials parameter. The instructor asked for the script to come from the
  selected module materials, which is exactly what that path cannot do.
- Changing `artifactKind` away from `"lecture-script"`. See finding 2.

## Findings that shape the design

1. **THE REPORTED ERROR IS NOT THE EXPORT-SELECTION BUG THAT WAS ALREADY
   FIXED.** `docs/REGRESSION.md` entry 300 closed `No saved course is linked to
   .` - an EMPTY url, because `ContentTab` blanks `courseUrl` for every export
   selection (`ContentTab.tsx:160`) and `exportCourseId` was not threaded. The
   instructor's message names `/courses/10287`, so `courseUrl` was non-empty and
   `courseId` was absent - i.e. the selection was LIVE, and
   `resolveGenerationCourseRow` took the by-URL branch. Entry 300's fix is
   intact and is not the fix here.

2. **`artifactKind` IS THE ONLY VERSION-HISTORY KEY, SO IT MUST NOT CHANGE.**
   `listGeneratedArtifactVersions(..., config.artifactKind)`
   (`lms-generation.ts:725`, `:1207`) is the sole query key for the preview
   modal's version picker, and there is no other artifact browser in the app.
   Renaming `"lecture-script"` would orphan every already-saved version with no
   migration path and restart the picker at v1. The re-gear therefore changes
   the label, the prompt, the title and the lengths, and leaves the storage key
   alone. The id `"scripts"` likewise stays, which keeps `NON_FAMILY_KIND_IDS`,
   its disjointness test, and `TITLED_GENERIC_KINDS` all untouched.

3. **`[PAUSE]` IS A PROMPT CONVENTION AND NOTHING PARSES IT.** Repo-wide grep
   finds it in exactly two non-test places: the lecture prompt that asks for it
   (`media.ts:261`) and a comment in `lecture-script-bounds.ts:60` explaining
   the tokens-per-word allowance. `TeleprompterPanel` scrolls the raw string.
   So an intro-video prompt may drop `[PAUSE]` for free - no consumer regresses.

4. **`SCRIPT_LENGTH_OPTIONS` HAS EXACTLY ONE PRODUCTION CONSUMER.**
   `useLmsGeneration.ts:1199` is the only non-test site outside
   `script-length.ts` itself. The Recording tab keeps its own independent list
   (`useLectureScript.ts`, typed `"2" | "5" | "10" | "15"`). So the option list
   can be re-geared in place rather than growing a parallel list, and no other
   surface changes length.

5. **A STALE STORED LENGTH SELF-HEALS.** `resolveScriptMinutes` is a MEMBERSHIP
   test, not a range test (`script-length.ts:48-52`), so a
   `ta-lms-script-minutes-<courseUrl>` value of `15` left over from the
   lecture-length era resolves to the new default rather than rendering an
   unselectable option. Nothing needs migrating and the localStorage key does
   not change.

6. **THE LENGTH SELECT IS NOT WIRING-TESTED.** The by-name/no-spread
   completeness test in `generatedPreviewModal.wiring.test.ts:442-450` covers
   `GeneratedPreviewModal` only. For `GenerateFromSelectionSection` the same
   file asserts only that it still renders inside the sticky header and that the
   source still contains `kinds.map(` and `templates.map(` (`:474-485`) - there
   is no `scriptLengthOptions.map(` assertion. A dropped script prop is caught
   by `tsc` alone. Entry 267 check 6 records this exact path shipping switched
   off once already.

7. **THE LABEL IS LOAD-BEARING IN FOUR USER-VISIBLE SENTENCES.**
   `generationSuccessNote` (`useLmsGeneration.ts:369-375`), `refineSuccessNote`
   (`:377-384`), `editSuccessNote` (`:395-402`), and
   `postGeneratedArtifactAction`'s refusal, which quotes the label verbatim and
   is asserted verbatim at `lms-generation.test.ts:1792`. The button tooltip
   builds `Generate ${label.toLowerCase()} from the selected content`
   (`GenerateFromSelectionSection.tsx:143`), so the new label has to read
   grammatically inside that sentence.

8. **`src/app/actions/lms-generation.ts` IS 1212 LINES - 212 OVER THE CEILING -
   BEFORE THIS CHUNK ADDS A LINE.** `useLmsGeneration.ts` is 1226 and
   `ModulesView.tsx` is 1077. This chunk touches the first of those, so the
   split is part of the chunk, not a follow-up. See W1.

9. **`needsCourseRow` IS DEAD METADATA.** It is declared on the config interface
   and set `true` on all eight kinds, and repo-wide grep finds no runtime reader
   - only `kinds.ts`, `kinds.test.ts` and three doc mentions. The course row is
   resolved unconditionally at `lms-generation.ts:354`, before any kind-specific
   logic. Flipping this field to `false` would change NOTHING at runtime, so it
   must not be used as the mechanism for the offline half.

10. **THE COURSE ROW IS A HARD DATABASE REQUIREMENT AND CANNOT BE MADE
    OPTIONAL.** `generated_artifacts.course_id` is `uuid not null references
    public.course_hub (id) on delete cascade`
    (`supabase/migrations/20261004000000_generated_artifacts.sql:74`). "Works
    with no live connection" therefore means "needs no CANVAS", never "needs no
    course row". An imported course already HAS a row - the export file was
    uploaded into it (`FilesCell.tsx:265-299` appends to
    `course_hub.export_files`). The row id is the only join key a cartridge ever
    has; nothing in the cartridge parse produces a Canvas course id.

11. **`hostOf` INVENTS A HOST FOR A PATH-ONLY URL, AND THAT IS THE WHOLE BUG.**
    `new URL("/courses/10287")` throws, so `hostOf` retries
    `new URL("https:///courses/10287")`. The WHATWG parser's
    "special authority ignore slashes" state eats the extra slash and reads the
    host up to the next one, so **`hostOf("/courses/10287")` returns the string
    `"courses"`**, not null. Verified in Node, the same parser the server action
    runs on. The consequence is the matrix below - a host-less tab URL matches
    ONLY a stored value that is also host-less:

    | stored `canvasUrl` | tab URL | storedHost | tabHost | match |
    | --- | --- | --- | --- | --- |
    | `https://school.instructure.com/courses/10287` | `/courses/10287` | `school.instructure.com` | `courses` | false |
    | `school.instructure.com/courses/10287` | `/courses/10287` | `school.instructure.com` | `courses` | false |
    | `/courses/10287` | `/courses/10287` | `courses` | `courses` | true |
    | `null` | `/courses/10287` | - | - | false |

12. **THE APP ITSELF ONLY EVER PRODUCES HOST-LESS URLS, SO THE GUARD IS ALREADY
    SILENTLY DEFEATED.** `CoursePicker.tsx:275` emits `` `/courses/${id}` `` for
    every live course picked, and `LmsCell.tsx:49` stores `` `/courses/${c.id}` ``
    for every course linked from the Courses table. Every one of those collapses
    to the pseudo-host `"courses"`, so two courses at two DIFFERENT institutions
    sharing numeric id 10287 are already indistinguishable, and
    `findCourseForCanvasUrl`'s `.find` (`course-canvas-url-match.ts:61`) already
    returns whichever row comes first. The cross-institution property the host
    comparison exists to protect is not merely bypassed by this bug - the bug IS
    a silent weakening of it, and no test detects it. The fix must therefore
    STRENGTHEN the guard, not relax it.

13. **NO TEST IN THE REPO EXERCISES THE URL SHAPE THE UI ACTUALLY EMITS.**
    `course-canvas-url-match.test.ts` uses full `https://` URLs on both sides
    everywhere except one schemeless case that still HAS a host (`:65-67`).
    `lms-generation.test.ts:106` and `lms-syllabus-buttons.test.ts:66` both pin
    `https://canvas.example.edu/courses/100`. The `/courses/<id>` shape is
    untested end to end, which is exactly why this shipped.

14. **THE ERROR MESSAGE'S ADVICE MAKES THE PROBLEM WORSE.** It says "Set this
    course's Canvas URL on its course row". Following it the natural way - copy
    the URL out of the Canvas address bar into `AddCourseForm.tsx:287`'s
    free-text field - stores a FULL `https://` URL, which per finding 12 can
    never match the host-less tab URL. The instructor then sees the identical
    error again. The only remedy that happens to work today is the Courses-table
    LMS cell, because it writes the host-less shape.

15. **EIGHT OTHER FEATURES FAIL THE SAME WAY.** Every by-URL caller: all generic
    generation kinds (`lms-generation.ts:211`), deck generation
    (`deck/route.ts:106`), Download selection for a live course
    (`lms-export/selection/route.ts:360`), the syllabus acknowledgement quiz and
    the generate-and-insert syllabus buttons (`lms-syllabus-buttons.ts:375`,
    `:484`), repo-to-module pairing (`useRepoPairing.ts:280`), export module
    additions (`useExportModuleAdditions.ts:120`), and the export fallback
    (`ContentTab.tsx:118`). Fixing the matcher fixes all of them at once.

16. **THE EXPORT RECOVERY PATH IS BROKEN BY THE SAME DEFECT, WHICH IS WHY THE
    INSTRUCTOR NEVER GOT FLIPPED TO THE IMPORT.**
    `tryExportFallbackForFailedLiveRead` resolves the row by the same host-less
    URL first (`ContentTab.tsx:118`), so it returns null and the recovery
    silently never fires. To have reached the Generate button at all the
    instructor's LIVE read must have SUCCEEDED - a host-less URL is perfectly
    adequate for live reads, because `resolveCourse` takes the base URL from the
    institution env vars (`canvas-core.ts:210`). So their environment does have
    a working Canvas connection plus an `.imscc` on the row, and they picked the
    course from the live dropdown rather than the "Courses with a saved export"
    chip. The picker offers the same course in both sections with nothing to say
    that only one of them can generate.

17. **THE MATERIALS PATH IS ALREADY FULLY OFFLINE.** `gatherExportItem`
    (`materials.ts:270-279`) reads `entry.item.body` with no I/O, and the client
    sends whole `CartridgeModuleItem` objects (bodies included) across the
    action boundary. `LIVE_FETCHERS` is passed but never invoked for export
    entries. Nothing in the grounding half needs a fix - only the identification
    half does.

## Acceptance criteria

### W1. The split comes first, on its own, green before the feature starts

**W1.1.** `src/app/actions/lms-generation.ts` (1212 lines) is brought under 1000
by moving `refineGeneratedArtifactAction` and `saveEditedGeneratedArtifactAction`
- with their private helpers - into a new `"use server"` module
`src/app/actions/lms-generation-refine.ts`. Every importer is updated. This is a
MOVE: no behaviour change, no signature change, no renamed export.

**W1.2.** The new module exports only `async` functions. No type re-exports, no
constant exports - a `"use server"` module may export nothing else, and `next
build` is the only gate that catches a violation.

**W1.3.** `TITLED_GENERIC_KINDS` is read by both moved actions and by nothing
else, so it moves with them or becomes a shared import from a pure leaf - not a
second copy. Two copies of a hand-maintained list with no exhaustiveness check
is precisely the defect that list's own doc comment already warns about.

**W1.4.** The full suite, `tsc`, repo-wide eslint and the build's compile line
are green after W1 and BEFORE any feature work begins.

### Registry

**M1. THE KIND IS RE-GEARED IN PLACE, NOT REPLACED.** `scriptsKindConfig` keeps
`id: "scripts"`, `artifactKind: "lecture-script"`, `needsCourseRow: true`,
`commitMode: "save-version"`, no `commitMeta`, no `renderStructured`, and
`deliveredAloud: true`. No new kind id, so `GENERATION_KIND_IDS`,
`NON_FAMILY_KIND_IDS`, the disjointness test, `OUTPUT_FAMILIES` and
`TITLED_GENERIC_KINDS` are all untouched.

**M2. THE LABEL IS `"Intro video script"`.** It has to survive
`Generate ${label.toLowerCase()} from the selected content` (finding 7), which
gives "Generate intro video script from the selected content" - grammatical.
`"Module intro video"` was rejected for reading as a request to generate a
video, which this button does not do.

**M3. `buildPrompt`'S AUDIT TEXT NAMES THE NEW PURPOSE.** It reads as a module
intro video script for the course and module, carrying `targetMinutes` exactly
as it does today. `emptyMessage` likewise names an intro video script. These
strings are the version history's own record of what was asked for; leaving them
saying "lecture script" would make the audit trail lie.

**M4. `deliveredAloud` STAYS `true` AND ITS TEST IS UNCHANGED.**
`kinds.test.ts:146-172` asserts exactly one `deliveredAloud` kind and that it is
`"scripts"`. An intro video script is read to camera, so the teleprompter
remains correct and that whole describe block must still pass byte-unchanged.

### Server - the generator

**M5. A NEW ACTION, NOT A NEW ARGUMENT.** `generateModuleIntroScriptAction` is
added; `generateLectureScriptAction` is not modified, not re-pointed, and its
other callers are not touched (reuse survey). Adding a mode parameter to the
existing action was considered and rejected: it changes a signature with five
call sites and forces `media.script-length.test.ts` to change, for no gain.

**M6. THE PROMPT IS COMPOSED BY A PURE LEAF.** A new
`src/lib/lms-generation/intro-script-prompt.ts` exports a pure
`composeModuleIntroScriptPrompt(input)` taking the course name, module label,
materials text, resolved minutes and the style block, and returning the prompt
string. The action is a thin wrapper: auth, minutes check, style block, one LLM
call, guard, return. Pure so it can actually be tested - vitest here is
node-env, and a prompt built inside a `"use server"` action is untestable.

**M7. THE PROMPT INTRODUCES THE MODULE AND REFUSES TO TEACH IT.** This is the
whole point of the re-gear, so it is spelled out. The composed prompt must:
- state that this is a short module introduction video an instructor records to
  camera and posts at the top of a course module;
- state explicitly that it INTRODUCES the module and does not teach it - no
  worked examples, no in-depth explanation, and the supplied material is what
  students are about to study rather than a script to read out;
- open by naming the module and its topic in one sentence;
- name two to four things students will be able to do by the end;
- name the module's graded work by its ACTUAL title, one clause each on what it
  asks for;
- close by naming the single thing to open first;
- forbid inventing anything not present in the supplied material;
- ask for first person, spoken directly to camera, short sentences;
- ask for plain text only - no headings, no markdown, no stage directions and
  NO `[PAUSE]` markers (finding 3);
- carry the target word count and minutes, and append the style block last.

**M8. THE LENGTH MATHS IS REUSED, NOT REINVENTED.** The new action uses
`checkLectureScriptMinutes`, `lectureScriptWordTarget` and
`lectureScriptMaxOutputTokens` from `src/lib/lecture-script-bounds.ts`
unchanged, and refuses an out-of-range length rather than substituting one -
the defect `docs/REGRESSION.md` entry 311 closed must not be reintroduced.
Temperature stays 0.6, matching every sibling spoken-script generator.

**M9. THE SERVER BRANCH KEEPS ITS SHAPE.** `case "scripts"` still resolves
minutes through `resolveScriptMinutes`, composes the same non-empty topic, calls
the generator, applies the `"error" in` and `config.isEmpty` guards, and saves
one version. Only the generator called and the derived title change. The title
becomes `` `${moduleLabel} Intro Video Script` ``.

### Server - resolving the course without Canvas

**M10. THE BY-ID PATH IS PREFERRED WHENEVER A ROW ID IS KNOWN.**
`resolveGenerationCourseRow` already prefers `courseId`; the client must supply
it whenever it has one. This is the mechanism, not `needsCourseRow`
(finding 9) - that field is dead and must not be pressed into service.

**M11. `hostOf` STOPS INVENTING A HOST.** The `https://`-prefix retry runs only
when the input does not begin with `/`, so `hostOf("/courses/10287")` returns
null instead of the pseudo-host `"courses"` (finding 11). This alone removes the
cross-institution collision that finding 12 shows is live in production today.
IT MUST NOT SHIP ALONE: on its own it turns today's accidental
`/courses/N` to `/courses/N` match into a failure and breaks every currently
working course. M11 and M12 land together, in one commit.

**M12. THE INSTITUTION REPLACES THE HOST AS THE DISCRIMINATOR.**
`canvasUrlMatchesCourse` and `findCourseForCanvasUrl` take an optional acronym.
When BOTH sides carry a real host, behaviour is byte-identical to today - every
existing assertion in `course-canvas-url-match.test.ts`, including the
load-bearing cross-host rejection, must pass unchanged. When either side lacks a
host, the match requires the same `parseCanvasCourseId` AND
`course.institution === acronym`, compared case-insensitively. When no acronym is
supplied and a host is missing, the answer is FALSE - never a guess. The
institution is a real, authoritative scoping key that already exists on the row
and is already threaded to every call site as `activeInstitution` / `acronym`.

**M12a. THE GUARD GETS STRONGER, AND A TEST PROVES IT.** Two courses at two
different institutions sharing numeric course id 10287, both stored host-less,
must resolve to their OWN row and never to each other's. That test must FAIL
against today's code (it currently returns whichever row `.find` reaches first)
- it is the sabotage check for this whole section, so it is written first and
its failure against the pre-fix matcher is recorded.

**M12b. THE HOST-LESS SHAPE THE UI ACTUALLY EMITS GETS COVERAGE.** Per finding
13 no test anywhere exercises `/courses/<id>`, which is the only shape
`CoursePicker` and `LmsCell` ever produce. The matcher's suite gains that shape
on both sides, and the generation suite gains one end-to-end case using it
rather than the `https://canvas.example.edu/...` fixture that hid this.

**M12c. THE EXPORT RECOVERY PATH IS VERIFIED TO WORK AGAIN.**
`tryExportFallbackForFailedLiveRead` resolves by the same URL, so it has been
silently dead for every host-less selection (finding 16). A test covers: live
read fails, the row is found by the host-less URL plus acronym, the row has a
stored export, and the selection flips to export. No change to that function is
expected - if it needs one, that is a finding, not a licence to widen scope.

**M13. THE FAILURE MESSAGE TELLS THE INSTRUCTOR WHAT TO DO IN THIS APP.** When
resolution still fails, the message must not tell someone to paste a Canvas URL
onto the course row: per finding 14 that is the one action that makes it worse,
because a pasted full URL can never match. It names the course, says the course
row is not linked to this Canvas course, and points at the Courses table. The
`courseNotLinked` flag and its prefix-matching detector keep working; if the
wording changes, the prefix constant changes with it in the same commit (there
are three copies - `lms-syllabus-buttons.ts:39` produces it,
`lms-generation.ts:177` and `deck/route.ts:71` match it).

**M14. NO CANVAS CALL IS REACHABLE ON THE IMPORT PATH.** For an export-sourced
selection the branch must not call `listCourseContentAction` - `moduleIds` stays
empty because the client pre-expands export module selections
(`materials.ts:388-399`), and every item resolves through `gatherExportItem`,
which performs no I/O. A test asserts the live fetchers are never invoked for an
export-only selection.

### Client

**M15. THE LENGTH OPTIONS FIT AN INTRO VIDEO.** `SCRIPT_LENGTH_OPTIONS` becomes
`[1, 2, 3, 5]` and `DEFAULT_SCRIPT_MINUTES` becomes `2`, re-geared in place
(finding 4). Every option must remain inside `checkLectureScriptMinutes`' 1-30
range, unique and sorted, and the default must be a member - the existing
`script-length.test.ts` assertions are kept, not relaxed.

**M16. THE SELECT'S LABEL FOLLOWS THE BUTTON.** The inline select stays exactly
where it is, still gated on `offersScript`, still one click. Its label reads as
a video length rather than a script length. Nothing else on the bulk bar moves,
no dialog is added.

**M17. THE STORED LENGTH KEY DOES NOT CHANGE.**
`ta-lms-script-minutes-<courseUrl>` is kept, and
`useLmsGeneration.test.ts:665-672`'s exact-string assertion stays. A stored `15`
self-heals to the new default (finding 5).

**M18. EVERY PROP STILL REACHES THE SECTION BY NAME.** `ModulesView` binds
`scriptLengthOptions`, `scriptMinutes` and `onScriptMinutesChange` by name as it
does today. Because nothing wiring-tests this component's completeness
(finding 6), this chunk adds the missing assertion:
`generatedPreviewModal.wiring.test.ts`'s `GenerateFromSelectionSection` block
gains a `scriptLengthOptions.map(` check next to its existing `kinds.map(` and
`templates.map(` checks.

### Cross-cutting

**M19. THE FOUR LABEL-BEARING SENTENCES ARE UPDATED TOGETHER.** The three
success notes and the post refusal (finding 7) all read correctly with the new
label, and `lms-generation.test.ts:1792`'s verbatim assertion is updated in the
same commit.

**M20. NO CANVAS WRITE IS ADDED.** `commitMode` stays `"save-version"`. A script
is instructor material; posting it would publish the instructor's spoken lines
to students. The existing refusal, and entry 300's export-mode refusal wording,
are unchanged.

**M21. THE WORKFLOW SURFACE IS LEFT HONEST.** The `generate-lecture-script` step
and `draft-upcoming-lectures` still mean a full lecture script and still call
the unmodified generator. Nothing in the workflow registry is renamed or
re-pointed in this chunk.

## Limits (state, do not paper over)

- vitest here is node-env and collects only `src/**/*.test.ts`, so no component
  renders. The select's new label, the button's new label and the tooltip
  sentence are verified by reading and by source-text assertions only; nothing
  proves the rendered DOM.
- The prompt's QUALITY is not testable. The tests can pin that the composed
  prompt contains the intro-not-lecture instruction, the no-invention rule and
  the word target; whether the model actually writes a good intro video script
  is a judgement call the instructor makes on first use.
- Source-text assertions pin the FACT and the ORDERING, never the spelling.
- For a Blackboard archive the item bodies are still empty or noise (entries
  296, 297), so intro scripts generated from such a selection remain grounded on
  titles and types only. Unchanged by this chunk.
- Instructor-added export items are still unselectable - `additionToDisplayItem`
  never sets an `identifier` (`display-module-tree.ts:181-184`), so their bodies
  cannot reach any selection-key-driven payload. Unchanged by this chunk.
