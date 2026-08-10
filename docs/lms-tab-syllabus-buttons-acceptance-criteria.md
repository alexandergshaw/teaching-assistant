# Two one-click buttons on the Manual > LMS tab

Instructor's request, verbatim:

> i need the ability to add a syllabus acknolwedgement quiz via a simple button
> press on the manual/lms tab. due date should be 3 days after course start,
> points should be 1. minimal number of clicks

> also need a button for generating the syllabus/inserting it on this page.
> this one pulls from syllabus tempalte if it's assigned in the course row, and
> asks for one/has you upload one if it's not. again, minimal clicks

Two buttons, one group, one push. "Minimal clicks" is the governing constraint:
the happy path for BOTH buttons is exactly one click.

## Decisions already made by the instructor

1. **Syllabus destination: attach the .docx as a file in a Canvas module.** NOT
   the Canvas Syllabus page. `generateCourseSyllabusAction` returns a .docx and
   `course[syllabus_body]` needs HTML; no docx-to-HTML converter exists in this
   repo and building one is lossy for a template's tables and styling.
   `placeSyllabusInModuleAction` already does exactly this.
2. **Course row lookup: match on `canvasUrl`; if no row matches, say so.** The
   button reports that the course is not linked rather than guessing. The local
   course row stays authoritative, as the rest of the app already treats it.

## Reuse survey - VETTED existing code (do not reinvent any of this)

### The sequence for button 1 already exists
`src/lib/workflows/registry/steps.course-setup.materials.ts` is the precedent
and is a client-imported registry file, so every action in it is already proven
callable from a client component:
- `:197-210` due date: `new Date(`${startRaw}T00:00:00`)`, `+3` days,
  `setHours(23,59,0,0)`, `.toISOString()`
- `:320-332` `createGradableAction(url, "Quiz", {title, description, dueAt}, inst)`
- `:334-351` `createQuizQuestionAction(... type:"true_false_question", points:1 ...)`
- `:353-362` `bulkUpdateAction(url, "Quiz", [String(id)], {published:true}, inst)`
- `:364-376` `createModuleItemAction(url, moduleId, {type:"Quiz", contentId, title}, inst)`
- `:185-195` find-or-create the "Start Here" module

### Actions (all already exist; NO new Canvas server action is needed)
| Need | Action | file:line |
|---|---|---|
| create quiz | `createGradableAction` | `src/app/actions/canvas-files-bulk.ts:377` |
| add question | `createQuizQuestionAction` | `canvas-files-bulk.ts:301` |
| publish quiz | `bulkUpdateAction` | `canvas-files-bulk.ts:179` |
| list quizzes (for dedup) | `listBulkItemsAction` | `canvas-files-bulk.ts:165` |
| list modules | `listCourseContentAction` | `src/app/actions/canvas-modules.ts:15` |
| create module | `createModuleAction` | `canvas-modules.ts:55` |
| link item into module | `createModuleItemAction` | `canvas-modules.ts:101` |
| place syllabus docx in module | `placeSyllabusInModuleAction` | `canvas-modules.ts:36` |
| generate syllabus | `generateCourseSyllabusAction` | `src/app/actions/syllabus-templates.ts:110` |
| save generated docx | `createFinalizedSyllabusAction` | `syllabus-templates.ts:318` |
| upload a template | `createSyllabusTemplateAction` | `syllabus-templates.ts:44` |

### Pure helpers
- `resolveSyllabusTemplateId(courseTemplateId, institutionFields)` -
  `src/lib/syllabus-facts.ts:70` -> `{templateId, source:"course"|"institution"|"none"}`
- `buildSyllabusFactsFromCourse(course, {email, lmsUrl})` - `syllabus-facts.ts:39`
- `parseCourseDate(raw)` - `src/lib/course-calendar-dates.ts:61` - local midnight
- `addDays(d, n)` - `course-calendar-dates.ts:68` - local, DST-safe
- `parseCanvasCourseId(url)` - `src/lib/canvas-url.ts:65`
- `readFileBase64(file)` - `src/lib/courses-tab-helpers.ts:246`

### UI idioms to match
- `note` state `{kind:"success"|"error"; text} | null` - `ContentTab.tsx:73`,
  rendered `ContentTab.tsx:264`
- one-click server-action button - `GithubSyncPanel.tsx:48-59`, rendered `:144-149`
- toolbar slot - `ModulesHeaderBar.tsx:110-199` (`ccBar` groups)
- inline upload - `SyllabusTemplateCell.tsx:58-86`
- institution/courseUrl - `ContentTab.tsx:48,51-53`; `acronym = activeInstitution || undefined`

## Acceptance criteria

### Shared

**S1.** A new server action resolves a course row from the tab's Canvas URL.
Matching is on `parseCanvasCourseId(url)` AND host, not raw string equality, so
a trailing slash or a query string does not defeat it. Returns the row or an
explicit not-found; never throws. Owner-gated like every other action, returning
`{...} | {error}`.

**S2.** When no row matches, BOTH buttons report a specific, actionable message
naming the URL - never a generic failure, and never a silent no-op.

**S3.** Both buttons live in the LMS tab's existing toolbar and use the existing
`note` reporting. **`ModulesHeaderBar.tsx`'s Rename/Schedule buttons keep their
`disabled={busy || modules.length === 0}` expressions byte-for-byte** -
`bulkCreateModules.wiring.test.ts:180-187` uses finding that exact pattern as
its own sanity check, so disturbing it silently disarms an unrelated guard
(REGRESSION #244 check 7).

**S4.** Each button is `disabled` while its own work runs and shows a progress
label, matching the `GithubSyncPanel` idiom. Neither can be double-fired.

### Button 1 - Syllabus Acknowledgement quiz

**B1-1.** One click on the happy path. No modal, no form, no confirmation.

**B1-2.** Due date = course row `startDate` + 3 days at 23:59 **local**, then
`.toISOString()` at the Canvas boundary. Uses `parseCourseDate` + `addDays` -
NOT `Date.parse`, NOT UTC getters. This repo's committed convention is local
wall-clock throughout (`course-calendar-dates.ts:24-31`); `week-numbering.ts:78`
is the one documented deviation and is not a model to copy.

**B1-3.** If the course row has no `startDate`, the button does NOT create the
quiz. It reports that the course has no start date. Creating a due-date-less
quiz would silently ignore a requirement the instructor stated explicitly.

**B1-4.** Points = 1, delivered as a single `true_false_question` with
`points: 1`. `createGradable`'s Quiz branch DISCARDS `pointsPossible` because
Canvas computes a classic quiz's total from its questions
(`gradables.ts:79-83`, REGRESSION #70 check 9) - so passing `pointsPossible: 1`
is not merely redundant, it is a no-op and must not be relied on.

**B1-5.** Idempotent. Before creating, `listBulkItemsAction(courseUrl, "Quiz")`
is checked for an existing quiz whose title matches
`"Syllabus Acknowledgement"` case- and whitespace-insensitively. If found, the
button creates nothing and reports it as already present. The starter-materials
precedent is NOT idempotent - re-running it makes a second quiz - and that flaw
is deliberately not inherited.

**B1-6.** The quiz is published (`bulkUpdateAction ... {published:true}`), since
an unpublished acknowledgement quiz is invisible to students and would make the
one-click promise false.

**B1-7.** Linked into the "Start Here" module when one exists (matched
case/trim-insensitively). If none exists, the quiz is still created and the
result says it was not linked. The button never creates a module as a side
effect - that is a bigger action than the instructor asked for.

**B1-8.** The result reports the quiz title and links to it in Canvas.

### Button 2 - Generate syllabus and insert it

**B2-1.** One click when a template is already resolvable. The only case that
costs extra interaction is the one the instructor named: no template assigned.

**B2-2.** Template resolution uses `resolveSyllabusTemplateId`, so a per-course
assignment wins and an institution-level default is the fallback (REGRESSION
#63 check 1). Only `source === "none"` triggers the upload prompt.

**B2-3.** On `source === "none"`, the user picks a `.docx`, which is uploaded via
`createSyllabusTemplateAction` and then **assigned to the course row**, so the
next press is one click. Not assigning it would make every future press cost the
same extra interaction.

**B2-4.** Facts come from `buildSyllabusFactsFromCourse` - the single 12-key
mapping (REGRESSION #63 check 6). No second fact mapping is written.

**B2-5.** The generated docx is saved via `createFinalizedSyllabusAction` and the
resulting id is persisted to the course row. `createFinalizedSyllabusAction`
does NOT write `course_hub.syllabus_id` itself - REGRESSION #60 check 5 pins
that the caller must do it.

**B2-6.** Persisting to the course row goes through the existing
`courseToInputPayload` helper, NEVER a hand-written field list.
`toRow` applies `clean(undefined) === null` to every absent column, so a partial
payload wipes real data - the live bug at `syllabus-upload.ts:118-145`, which
currently nulls `syllabusTemplateId` and ~14 other columns.

**B2-7.** The docx is attached to Canvas via `placeSyllabusInModuleAction` into
the "Start Here" module when one exists, else the first module. If the course
has no modules at all, the syllabus is still generated and saved, and the result
says it could not be attached.

**B2-8.** The result names the file and links to the Canvas module item.

## Explicitly OUT of scope

- Writing `course[syllabus_body]` and any docx-to-HTML conversion (decision 1).
- Making `starter-materials` idempotent. B1-5 covers the new button only;
  changing that workflow step is a separate change against REGRESSION #222.
- Fixing `uploadSyllabusAction`'s column-wiping bug. Filed separately; B2-6 only
  requires that the NEW code not repeat it.
- Wiring the `syllabus-ack-quiz` term task (`course-tasks-catalog.ts:66`) to
  these buttons.
- Break-aware due dates. `breaks` is annotation only and must never shift a date
  (REGRESSION #62 check 2).
