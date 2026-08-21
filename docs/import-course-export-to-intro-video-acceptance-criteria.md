# Importing a course export and generating from it, with no live Canvas link (chunk 3h)

The instructor attached `introduction-to-cybersecurity-export.imscc` and reported
that generating a module intro video from it fails with:

> No saved course is linked to /courses/10287. Open the Courses table and link
> this course from its LMS cell if you have not already - and if another saved
> course shares this same Canvas course number, also set this course's
> Institution column there so the two can be told apart - then try again.

This is the SECOND report of the same sentence. Chunk 3g
(`docs/module-intro-video-script-acceptance-criteria.md`) treated it as a
URL-matcher defect and fixed real defects in `findCourseForCanvasUrl`. Those
fixes are intact. They were not the whole problem, and this chunk does not
revisit them.

## What actually happened (evidence, not conjecture)

**F1. The failing request was a LIVE selection. The `.imscc` was never
involved.** `resolveLmsCourseRowByIdAction`'s miss message is
`"Could not find that saved course - it may have been removed."`
(`src/app/actions/lms-syllabus-buttons.ts:155`), which does NOT start with
`COURSE_NOT_LINKED_PREFIX` (`src/lib/lms-generation/course-not-linked.ts:29`).
`resolveGenerationCourseRow` takes the by-id branch on plain truthiness of
`courseId` (`src/app/actions/lms-generation.ts:214-217`). Therefore observing the
not-linked message PROVES `courseId` was falsy, which means
`exportCourseId` was `undefined`, which means
`selection.source === "live"` (`src/app/components/ContentTab.tsx:182`).

**F2. The cartridge's own Canvas identity is exactly the URL in the error.**
`course_settings/context.xml` in the attached file reads
`<course_id>10287</course_id>`, `<course_name>Introduction to
Cybersecurity</course_name>`, `<canvas_domain>canvas.rize.education</canvas_domain>`.
So `/courses/10287` is this export's own course. The instructor was looking at
the live Rize course while holding its export, and the two halves of the same
course were invisible to each other.

**F3. Resolution failed for the ordinary reason: no saved row carries that
URL.** With a host-less `/courses/10287`, `hostOf` returns null
(`src/lib/course-canvas-url-match.ts:106-116`), so the host step is skipped
entirely and `inconclusive === idMatches`. The reachable null paths are: zero
rows whose `canvasUrl` parses to `10287` (`:343`), a blank/absent acronym
(`:351`, `:369`), or two-or-more id-matching rows that institution cannot
separate (`:370-371`). The live content load had already succeeded, which
requires `activeInstitution` to be set (`ContentTab.tsx:473`), so the blank-acronym
paths are excluded. The live course simply has no linked `course_hub` row.

**F4. There is no discoverable path from "I have an export file" to "generation
can read it".** The path exists and works, but it is NINE clicks across two
top-level tabs, and nothing anywhere suggests it: Courses -> New course -> name
it -> Create course -> that row's "LMS Exports" cell -> Manage -> Upload export
-> pick the file -> Manual -> LMS -> Modules -> click the chip under "Courses
with a saved export" (`src/app/components/courses/FilesCell.tsx:347-356`,
`src/app/components/CoursePicker.tsx:319-333`).

**F5. Dragging the file into the app does nothing, and the one drop-shaped
panel is a dead end for this goal.** There is no drag target for an export
anywhere. `CartridgeDropPanel` (Files -> Submissions, and Manual -> LMS ->
Grading) accepts `.imscc` but writes to the `cartridge_drops` table and the
`cartridge-drops` bucket (`src/lib/cartridge-drops.ts:39-75`). It never touches
`course_hub`, never calls `appendCourseExportFileAction`, and its modules are
unreachable from Course Content.

**Conclusion: the matcher is not the bug. The bug is that an imported export
never becomes a thing generation can be pointed at, and the error message sends
the instructor to the one place that cannot help them.**

## Reuse survey (vetted - every symbol below was read before this doc was written)

| Target | What already exists | Path:line |
| --- | --- | --- |
| Cartridge parse (whole blob) | `parseCartridgeBlob(blob): Promise<CartridgeCourseData>` | `src/lib/cartridge-import.ts:409` |
| Course identity from the cartridge | `parseCourseSettings(xml)` -> `{title, courseCode, startAt}` - reads `course_settings.xml` ONLY | `src/lib/cartridge-import.ts:207-217` |
| Tag text extractor | `tagText(xml, tag)` - already used by every parser in that file | `src/lib/cartridge-import.ts` (module-local) |
| Chunked upload of a course zip | `uploadCourseZipChunked` | used at `src/app/components/courses/FilesCell.tsx:277` |
| Attach an export file to a row | `appendCourseExportFileAction(courseId, {name, path, size, parts})` - `generated` is OPTIONAL and omitted here on purpose | `src/app/actions/course-hub-core.ts:258-268` |
| Create a course row | `createCourseHubAction(input)` - validates ONLY `input.name?.trim()` | `src/app/actions/course-hub-core.ts:22-30` |
| Owner-scoped row list | `listCourseHubAction()` | `src/app/actions/course-hub-core.ts:12-19` |
| The export-qualifies predicate | `latestSourceExportFile(c)` -> newest `exportFiles` entry whose `generated !== true` | `src/lib/courses-table-helpers.ts:631-635`, `:621-623` |
| Which sources a row offers | `lmsRenderSourcesFor(c)` -> `{live, export}` | `src/lib/courses-table-helpers.ts:661-663` |
| The picker's export section | `describeExportSectionState(...)`, chips at `CoursePicker.tsx:322-334`, gated on `showExportCourses` `:317` | `src/lib/course-picker-availability.ts:131-136` |
| Selecting an export course | `handleSelectExportCourse(id)` -> `{source:"export", courseId}` + `loadContent` | `src/app/components/ContentTab.tsx:521-526` |
| Reading an export by row id | `readExportCourseContentById(supabase, courseId)` - no Canvas credentials | `src/lib/lms-export-source/read-export-course-content.ts:104` |
| The by-URL matcher | `findCourseForCanvasUrl(courses, tabUrl, acronym?, knownAcronyms?)` | `src/lib/course-canvas-url-match.ts:292` |
| Canvas course id from a URL | `parseCanvasCourseId(url)` - regex `/\/courses\/(\d+)/`, LEADING slash required | `src/lib/canvas-url.ts:65-68` |
| The message (sole producer + detector) | `buildCourseNotLinkedMessage`, `isCourseNotLinkedMessage`, `COURSE_NOT_LINKED_PREFIX` | `src/lib/lms-generation/course-not-linked.ts:29,71,84` |

**Deliberately NOT reused / NOT changed:**

- `findCourseForCanvasUrl` is NOT modified. Chunk 3g's rule is correct; F3 shows
  it returned null for the right reason. Loosening it to rescue this case would
  re-open exactly the cross-institution collisions it exists to refuse.
- `CartridgeDropPanel` is NOT re-pointed at `course_hub` (F5). It has its own
  job (submission archives for grading) and three callers that want it.
- `resolveGenerationCourseRow`'s branch order is NOT changed.
- No database migration. `course_hub.canvasUrl` and `exportFiles` already exist.

## What ships

### Part A - the cartridge knows which Canvas course it is

**A1.** New pure leaf `src/lib/cartridge-canvas-identity.ts` - no zip, no I/O,
no Supabase, so it is unit-testable against a raw XML string:

```ts
export interface CartridgeCanvasIdentity {
  courseId: string | null;      // "10287"
  courseName: string | null;    // "Introduction to Cybersecurity"
  canvasDomain: string | null;  // "canvas.rize.education"
}
export function parseCartridgeContextXml(xml: string): CartridgeCanvasIdentity;
export function cartridgeCanvasUrl(identity: CartridgeCanvasIdentity): string | null;
```

**A2.** `parseCartridgeContextXml` returns all-null fields for XML that is
absent, empty, or carries none of the three tags. It NEVER throws. A non-Canvas
Common Cartridge has no `context.xml` at all and must degrade to all-null, not
to an error.

**A3.** `cartridgeCanvasUrl` returns `https://<canvasDomain>/courses/<courseId>`
when BOTH are present; `/courses/<courseId>` when only `courseId` is present;
`null` when `courseId` is absent. `courseId` must be all digits to be used -
anything else yields `null`, because `parseCanvasCourseId` would reject it
downstream and a stored URL that cannot be parsed back is worse than none.

**A4.** `parseCartridgeBlob` reads `course_settings/context.xml` when present
and adds ONE new optional field to its result:
`canvasIdentity?: CartridgeCanvasIdentity`. Absent/unreadable entry -> field is
`undefined`. Every existing consumer of `CartridgeCourseData` compiles and
behaves unchanged - this is additive only.

**A5.** VERIFIED AGAINST THE REAL FILE: parsing the attached cartridge's
`context.xml` must yield exactly
`{courseId: "10287", courseName: "Introduction to Cybersecurity", canvasDomain: "canvas.rize.education"}`,
and `cartridgeCanvasUrl` of that must be
`"https://canvas.rize.education/courses/10287"`. Pin this as a frozen literal
oracle in the test, not as a value recomputed by the implementation.

### Part B - import an export in one step, from where it is needed

**B1.** A new control, "Import a course export", renders in the Course Content
source picker directly beneath the "Courses with a saved export" section, and
renders EVEN WHEN that section is empty (that is precisely the state a
first-time importer is in). It opens a file dialog with
`accept=".imscc,.zip,application/zip"`.

**B2.** On pick, in this order:
1. Parse the blob in-browser (`parseCartridgeBlob`) for `title` and
   `canvasIdentity`. A parse failure is reported inline and stops here - nothing
   is uploaded.
2. Decide the destination row (Part C's pure helper).
3. Upload the raw file with the SAME chunked uploader `FilesCell` uses.
4. Attach it with `appendCourseExportFileAction`, with NO `generated` flag, so
   `latestSourceExportFile` immediately counts it (reuse survey).
5. Select it: `{source: "export", courseId}`, persisted and loaded through the
   EXISTING `handleSelectExportCourse` path - not a new loader.

**B3.** After a successful import the instructor is looking at that export's
modules in Course Content, with no further clicks. Total cost: open Course
Content -> Import a course export -> pick file. This replaces the nine clicks in
F4; the F4 path is NOT removed (it is still the right place to manage several
exports per course).

**B4.** The control is disabled while an import is in flight, reports progress,
and reports failure inline in the picker. It never leaves a half-imported state
selected: if step 3 or 4 fails after step 2 created a row, the error names the
row it created so the instructor can find it, rather than silently orphaning it.

**B5.** No institution is required at any point. The export branch is
deliberately not acronym-gated (`ContentTab.tsx:450-468`), and
`readExportCourseContentById` is owner-scoped with no Canvas call. An instructor
with zero Canvas configuration must be able to complete B1-B3.

### Part C - an imported export lands on the RIGHT row, and stamps its identity

**C1.** New pure helper (its own leaf, so it is testable with plain objects):

```ts
export function chooseImportDestination(
  courses: {id: string; name: string; canvasUrl: string | null}[],
  identity: CartridgeCanvasIdentity | undefined,
  fallbackName: string
): {kind: "existing"; courseId: string} | {kind: "create"; name: string; canvasUrl: string | null};
```

**C2.** Match order, tried in sequence:

  a. **Existing, by Canvas URL.** The cartridge carries an all-digits
     `courseId` AND exactly ONE saved row's `canvasUrl` parses (via
     `parseCanvasCourseId`) to that same id -> attach, stamp nothing (that row
     already matches).

  b. **Existing, by name.** The cartridge reports a `courseName` AND exactly
     ONE saved row's name matches it (trimmed, case-folded) AND that row's
     `canvasUrl` is blank/null/whitespace -> attach, and stamp the cartridge's
     `canvasUrl` onto that row. The blank-URL requirement is not incidental: a
     row already carrying a DIFFERENT Canvas URL is positive evidence it is a
     different course, so a name coincidence must never override it.

  c. Otherwise -> `create`.

Two or more matches at (a) OR at (b) -> fall through to `create`, never a
guess: the same refusal `findCourseForCanvasUrl` branch (b) makes, for the same
reason.

**C2-REVISION (added during verification of the first implementation wave, and
the reason this rule is not simply "match on canvasUrl").** With (a) alone, the
reporting instructor's own situation produces the WRONG outcome. F3 established
they have no row whose `canvasUrl` parses to `10287` - but they very likely do
have a saved row for this course already, named after it, with a blank
`canvasUrl` and their real data on it. Rule (a) alone would create a SECOND,
empty row and (per C3/C4) stamp the Canvas URL onto the DUPLICATE. The live
path would then resolve to the empty row, and generated artifacts would be
keyed to it. That fails worse than the bug being fixed, because it succeeds
quietly. Rule (b) exists to send the export to the row that already represents
the course.

**C2b.** `chooseImportDestination` returns
`{kind:"existing"; courseId; stampCanvasUrl: string | null}` or
`{kind:"create"; name; canvasUrl}`. `stampCanvasUrl` is non-null ONLY in case
(b), and only when `cartridgeCanvasUrl(identity)` is itself non-null - so the
caller can never stamp without an explicit instruction to.

**C3.** On `create`, `name` is the cartridge title, falling back to the file's
basename with its extension stripped when the title is blank, and `canvasUrl` is
`cartridgeCanvasUrl(identity)` - so a Canvas export stamps
`https://canvas.rize.education/courses/10287` onto the new row at birth.

**C4.** CONSEQUENCE, AND THE REASON C3 IS IN SCOPE: with that URL stamped, the
instructor's ORIGINAL failing action starts working too. A live selection of
`/courses/10287` now has exactly one id-matching row, so
`findCourseForCanvasUrl` branch (a) resolves it (given any acronym), and the
live-side intro video generates. The live and export halves of one course stop
being invisible to each other. This is a real behaviour change to the live path
and must be called out in the regression entry.

**C5.** `chooseImportDestination` never mutates and never calls a server action;
Part B's control is the only thing that acts on its verdict.

### Part D - a truthful dead end

**D1.** `buildCourseNotLinkedMessage` keeps `COURSE_NOT_LINKED_PREFIX` as its
opening words verbatim (`isCourseNotLinkedMessage` matches on it, and
`course-not-linked.test.ts` feeds the real producer into the real detector -
do not break that pairing). Only the remediation tail changes, to name the
import route that actually exists now:

> ... Open the Courses table and link this course from its LMS cell, or import
> this course's export from the Course Content source picker. If another saved
> course shares this same Canvas course number, also set this course's
> Institution column so the two can be told apart.

**D2.** Any test that pins the FULL message string is updated in the same
commit. Pin the FACTS (starts with the prefix; contains the URL; names both
remedies) rather than the exact spelling - source-text assertions over-specify
and have twice forced contorted implementations in this repo.

## Out of scope, deliberately

- Backfilling `canvasUrl` onto rows whose export was uploaded BEFORE this
  change. Doing it right means re-reading every stored blob; C4 only helps
  imports made from here on. Called out, not fabricated as done.
- Persisting the Canvas identity onto the `exportFiles` record (would need a
  migration, and C3 already puts the identity where the matcher reads it).
- A resolution fallback that matches a live URL against export contents.
- Drag-and-drop. Every import path in this app is click-to-open; adding a drop
  target is a separate, wider change.
- `CartridgeDropPanel`, `RuntimeFieldInput` uploads, and Misc files (F5).

## Known adjacent defect, NOT fixed here (found during this investigation)

With a LIVE selection, repo-folder items selected in `RepoFoldersSection` flow
into the same selection Sets the generation bulk bar reads
(`ModulesView.tsx:621-628`, `lmsGenerationSelection.ts:25-27,84`). So a request
can carry a live `courseUrl` with content that never came from Canvas. That is a
separate mixed-source question from this chunk's and is recorded here only so it
is not mistaken for something this chunk introduced.
