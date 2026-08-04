# Teaching Assistant - session handoff

Repo: `C:\Users\alexa\OneDrive\Documents\Projects\teaching-assistant`
Branch: `main` at **e867b5f**, pushed, clean tree.
Suite: **379 files / 7624 tests green**. `docs/REGRESSION.md` current through **entry 225**.

---

## THE GATE - read this first, it cost this session twice

    npx tsc --noEmit
    npx eslint src/
    npx vitest run
    npx next build        <-- DO NOT SKIP. Only "Compiled successfully" matters.

The build's prerender tail ALWAYS fails locally on a Supabase env-var error - that is
expected. Do NOT try to run the app: there is no local `.env` and the middleware calls
`createServerClient` unconditionally, so every route 500s. Nothing is verifiable in a browser.

**Two separate `next build` breaks happened in one afternoon, both invisible to tsc, eslint
AND vitest.** Both were the same shape: a CLIENT-REACHABLE module importing something whose
transitive chain reaches `@/lib/supabase/server` -> `next/headers`. Attended workflow steps
run IN THE BROWSER, so anything under `src/lib/workflows/registry/` is client-reachable.

1. `steps.course-setup.storage.ts` imported from `steps.course-guides.ts` (which imports
   `@/app/actions`).
2. `steps.course-build-current-events.ts` imported from `current-events-report.ts` (which
   imports `@/app/actions/shared`, whose barrel re-exports `writing-style-block`).

The fix both times: extract the pure function into its own dependency-free module and
re-export it from the original so no existing importer changes. See
`course-schedule-docx.ts` and `current-events-page-text.ts` as the two worked examples.

**Any change that imports across the registry/actions boundary MUST run `next build`.**
Every subagent brief must include it in the gate - omitting it is what let both breaks
through.

---

## How to work this backlog

Group by DISJOINT FILE SETS and run groups as concurrent subagents. Verify disjointness
against the ACTUAL files - the collision below was found only by checking, and a previous
handoff shipped a wrong disjointness claim that cost a dispatch.

Standing rules, each learned the hard way:

- **Gate every returning agent** with `git status --short` against its brief. Agents do
  exceed scope and do misreport. This session: one agent reported a failure as "pre-existing
  at 5910d52" when HEAD had moved several commits past that, and the failure was in fact
  caused by an edit made minutes earlier.
- **Verify claims by RUNNING the shipped code or reading the shipped ARTIFACT.** Every defect
  that mattered this session came from reading two real run logs, not from reading source.
- **Sabotage-check every new test.** Break the implementation, confirm red, revert. A test
  that cannot fail is worse than none. One agent's own sabotage loop caught a gate that could
  never fire (see entry 218).
- **Tell every brief that peers are editing the same tree**, and name the forbidden files.
- **Forbid ALL destructive git** in subagent briefs: commit, push, add, checkout, restore,
  reset, stash, clean, rm.
- **Re-check the 1000-line cap AFTER a change, not before.**
- Real instructor files for testing:
  `C:\Users\alexa\Downloads\26ss-info-1020-2a-computer-science-principles-export (1).imscc`
  (12 modules, real Canvas export - ground truth for anything cartridge-shaped)
  `C:\Users\alexa\Downloads\Course Build (9).zip` and `(10).zip` (the two real failed runs
  every open LMS item below was diagnosed from)

---

## THE QUEUE

File sets checked against the actual files. The ONE collision is called out explicitly.

| # | What | Files | Concurrent-safe? |
|---|---|---|---|
| ~~**A**~~ | ~~`courseToInputPayload` silently nulls four columns~~ **DONE - entry 223** | - | - |
| ~~**B**~~ | ~~`starter-materials` throws for a single-course Blackboard run~~ **DONE - e867b5f, entry 222** | - | - |
| ~~**C**~~ | ~~About Your Instructor document~~ **DONE - entry 225** | - | - |
| ~~**D**~~ | ~~`lms-rubric`: no fix needed, add a pinning test~~ **DONE - entry 224** | - | - |

**THE QUEUE IS EMPTY. A, B, C and D are all done and pushed** (entries 222-225).
What remains below is not code: the Blackboard credentials block, the corrupted
INFO 1020 course project, and two open unknowns. See "NOT A CODE TASK" and
"STILL OPEN, smaller".

---

## A. `courseToInputPayload` silently nulls four columns - DONE (entry 223)

`courseToInputPayload(c: Course)` (`src/lib/workflows/registry-helpers.ts`) omitted
`courseKind`, `weeklyChecklist`, `gradesDueDate`, `gradesDueTime`. All four are carried now.

**One correction to the original diagnosis, which mattered:** only `courseKind` was
actually being wiped. It is a plain scalar, so `toRow()`'s `clean()`
(`undefined` -> `""` -> `null`) writes a null over it via
`course_kind: clean(input.courseKind)`. The other three are GUARDED in `toRow`:
`weekly_checklist` by `Array.isArray(...) ? ... : undefined`, and both grades-due columns
by `input.gradesDueDate !== undefined ? ... : undefined`. `JSON.stringify` drops undefined
keys before the request reaches PostgREST, so omitting those three left the columns
untouched - same as `hiddenTiles` in entry 61. They are carried anyway for a complete
round-trip, not because they were losing data.

**Seven call sites, not six** - the original list missed `steps.syllabus.ts:305`:

    steps.course-setup.rosters.ts:154, :349, :470
    steps.course-setup.materials.ts:272
    steps.course-setup.timeline.ts:73
    steps.grading-singles.ts:483
    steps.syllabus.ts:305

`courseKind` drives the coding-vs-applied deck contract, case-study selection, and the
deck-template default from entry 219; a wiped kind falls back to guessing from the course
name. Exact bug class entry 61 already fixed once for
`modality`/`topicOutline`/`syllabusTemplateId`.

**Why entry 61's drift-proof test missed it, and what now prevents a third occurrence:**
the test derives its checked key set from `fullCourseFixture()`'s RUNTIME keys. All four
fields are TS-*optional* on `Course`, so the fixture was free to omit them and the guard
passed vacuously. `fullCourseFixture()` is now typed **`Required<Course>`**, so an
unmentioned optional field is a COMPILE error, not a silent gap. Do not relax that
annotation. Verified by sabotage: dropping `courseKind` fails 3 tests, including the
general round-trip one that previously passed.

---

## B. `starter-materials` throws for a single-course Blackboard run

`src/lib/workflows/registry/steps.course-setup.materials.ts:466`:

    if (failures === urls.length) throw new Error("Starter materials failed for every course.");

Per-course failures are absorbed into notes, but this terminal throw fires when EVERY course
failed - and for a single-course run on a Blackboard tile, that is one course. Same defect
class as the four steps fixed in entry 217.

**It is NOT a drop-in application of `lms-target-guard.ts`**: that guard is shaped for a
single `hubCourse`, while this step takes a course LIST. It needs a per-course check inside
the existing loop.

It declares no outputs, so nothing cascades - but it still registers as a failed step. It did
not appear in run 756544e0 because that run was Course Build, where it is additionally gated
by `selectedStartHere`.

Reuse `lms-target-guard.ts`'s `resolveTileLms`/`isCanvasLms`/`canvasOnlySkipText` rather than
a second notion of "which LMS is this".

---

## C. About Your Instructor - DONE (entry 225)

Shipped as specified. Two things worth carrying forward:
**(1)** Entry 223's `Required<Course>` fixture annotation fired on its first real
outing - declaring the four optional fields failed `tsc` until all four were in
`fullCourseFixture()`. The guard works; do not route around it.
**(2)** Note ordering was nearly a regression. This skip note and Instructor
Contact's both `unshift`, and Contact has a pinned test demanding index 0. The
About gate is evaluated BEFORE Contact in code so Contact's unshift lands last -
while `sortOrder` stays Contact 4, About 5. Code order and sort order deliberately
disagree; do not "tidy" them into agreement.

Original spec, kept for reference:

The instructor DECIDED the approach; do not revisit it. The app holds NO instructor
biographical data - only a free-text `instructor` name typed per run and the tile's `email`.
So: **optional profile fields the instructor fills in once, rendered verbatim, NO LLM anywhere
in the path.** Generating a bio from a bare name would fabricate credentials.

- Four nullable `text` columns on `course_hub`: `instructor_bio`, `instructor_title`,
  `instructor_credentials`, `instructor_department`. Fields optional (`?:`) on the `Course`
  interface - 78 files build `Course` fixtures by hand and required fields would break them all.
- Migration `20260920000000_course_hub_instructor_profile.sql` (re-check for a later timestamp
  first). Idempotent `add column if not exists ... text null`, matching
  `20260918000000_course_hub_course_kind.sql`. **Migrations auto-apply via a GitHub Action on
  push - never tell anyone to run one by hand.**
- **CORRECTION to the research pass**: it claimed `CourseHubRow` is NOT in
  `types.tables-a.ts`. It IS - verified. Edit that file.
- Edit points in `supabase/courses.ts`: `Course`, `CourseInput`, the `COLUMNS` string literal
  (**miss this and the column silently never loads**), `CourseRow`, `toCourse`, `toRow`.
- Also add the four to `courseToInput()` AND `courseToInputPayload()`. A has landed, so
  that file is free - but read entry 61 points 5-7 first: these are plain scalars, so they
  must be carried or `clean()` wipes them, and `fullCourseFixture()` is typed
  `Required<Course>`, so declaring them optional on `Course` will not let you skip the
  fixture - TS will fail the build until all four are in it.
- Tile UI is table-only (`CourseRow.tsx`, `CoursesTable.tsx`, `courses-table-helpers.ts`);
  recent optional fields never touched `AddCourseForm.tsx`. Bump `CURRENT_COLUMNS_VERSION`
  (currently 12) and add a `COLUMNS_ADDED_IN` entry, or the column never appears for anyone
  with a persisted column set. `instructorBio` needs `kind="multiline"`.
- The document is a FIFTH entry in `generate-course-guides`'s existing `docs` array - no new
  step, no new toggle, no preset change. Three hardcoded "of 4" counts become "of 5"
  (step description, `noGuidesGenerated()`, final summary). No test asserts those strings.
- **Skip, do not stub**: no bio means no document plus
  `"No About Your Instructor document - the course tile has no instructor bio set."` pushed
  via `notes.unshift(...)`, matching Instructor Contact's own skip-when-no-email precedent.
- Do not duplicate Instructor Contact, which owns name, email and contact guidance.
- `sortOrder: 5` within the guides step's own `weekNumber: 0` namespace - RE-CHECK for
  collision before using it.

---

## D. `lms-rubric` - audited, needs NO fix - DONE (entry 224)

Audited against entry 217's guard and found **already safe**. Its Canvas call is
double-wrapped: `createRubricAction` catches `resolveCourse`'s throw into `{error}`, and the
step's own `try/catch` turns that into a note. No bare `throw` reaches the run loop. A prior
audit (entry 155) reached the same conclusion independently, and it genuinely SUCCEEDED in run
756544e0 rather than being missing from a partial list.

Deliverable was a regression test pinning that, in
`steps.rubrics.course-kind.test.ts` - no production change. Shipped: one test,
sabotage-checked in BOTH directions (rethrow -> red, drop-the-note -> red). That
verdict has now been reached three times by three passes; the test exists so a
fourth audit is never needed.

A full sweep of every Canvas-touching step found only `starter-materials` (item B) still
unguarded. Everything else already absorbs Canvas errors into notes.

---

## NOT A CODE TASK - only the instructor can do these

- **Blackboard module creation is NOT BUILDABLE.** Verified: zero Blackboard credentials, no
  REST client, no OAuth. `cartridge-import-blackboard.ts` parses a hand-exported archive;
  `blackboard-export` writes a file to import manually. `course-lms-options.ts:19` says in its
  own comment that selecting an LMS "does not create a live integration", and the DB column is
  literally `canvas_url` holding Blackboard URLs too - which is why the Canvas parser choked.
  Needs: a Blackboard REST Application registered in the institution's Developer Portal
  (Application Key + Secret, created by a Learn sysadmin), allow-listed against
  `wncc.blackboard.com`, an auth-mode decision, and content/gradebook scopes.
  If it is ever built, `lms-wipe` must NOT inherit the Canvas posture - Canvas wipe has no
  confirmation gate and is cron-eligible.
- **The INFO 1020 tile still holds a corrupted course project** (a public-health engine on a
  CS course). Persisted on the tile; `define-course-project` is idempotent by design, so no
  re-run clears it. The override is reachable - someone must point it at that course.

---

## STILL OPEN, smaller

- The export download `Failed to fetch` root cause is **still unproven** (entry 216). Retry
  and instrumentation shipped. Next occurrence: if the enriched message reports a size <= 45MB
  with no part suffix, that is a chunking defect; a normally-shaped entry means network
  flakiness. `"Failed to fetch"` = browser/attended, `"fetch failed"` = Node/unattended.
- No APPLIED deck preset exists - all five built-ins are coding or neutral, so an applied
  course falls through to `preset-classic-lecture` (entry 219).
- `classSessionTemplate` has the same per-run-vs-per-course symptom as `deckTemplate` but
  INCOMPATIBLE semantics - its blank means "skip populating the LMS". Deliberately not fixed;
  do not fold it into the deck-template mechanism (entry 219).
- `.actionBar` uses `45px` where `.ccStickyHeader` uses `44px` for the same Tabs strip -
  documented, not guessed at (entry 211).
- A coding deck's per-concept intro slide has no fixed title prefix, so `pptx-graphics-audit`
  still cannot see it in finished OOXML (entry 211).

---

## LINE CAP - the tightest files

Nothing is over 1000. Closest:

    998  registry-helpers.assembleLectureFiles.test.ts   <-- one edit from violation
    985  actions/shared.test.ts
    983  supabase/courses.ts                             <-- grew 926 -> 983 in item C
    940  components/GradingResults.tsx
    936  registry/steps.media.ts
    933  actions/shared.ts
    930  actions/course-planning-grounding.ts

`assembleLectureFiles.test.ts` at 998 should be split before anything touches it.
`supabase/courses.ts` is now second-tightest: item C added four columns and it took 57
lines. It is a hub file that nearly every feature touches, so the NEXT change to reach
for it should plan to SPLIT it rather than grow it - a fifth column would put it within
a few lines of the cap. `steps.course-guides.ts` (615) and `courses-table-helpers.ts`
(708) both grew in C too and have room.

---

## PROJECT CONVENTIONS THAT BITE

- **NO EMOJIS**, with the single authorized `CHECKLIST_DONE_PREFIX` exception. `grep -P` is
  BROKEN here - it errors on every file, so any scan built on it reports clean without
  looking. Use Node with a canary assertion.
- **Only `next build` catches a server-only import in a client module** - see THE GATE above.
- A `"use server"` module may export ONLY async functions. `tsc` AND `vitest` pass violations
  through; only `next build` catches them.
- **vitest is `environment: "node"` over `src/**/*.test.ts` ONLY.** No jsdom, no
  testing-library. React components CANNOT be tested - this shapes every design decision.
  The workaround for component-level guarantees is a text-based structural test; see
  `page-module-css-classes.test.ts` and `useWorkflowRun.wiring.test.ts`, both of which carry a
  CANARY so a broken extractor cannot pass vacuously.
- **Unbound step inputs are silently skipped.** Adding an input does nothing until every preset
  binds it. Has shipped no-op "fixes".
- **Preset index arithmetic fails silently.** Appending a step avoids it entirely - that is why
  `audit-visualizer-coverage` was added last.
- `HEADLESS_SAFE_STEP_TYPES.size` is pinned at **152**. Bump it in the SAME change if a
  headless-safe step type is added or removed.
- The `files` accumulator is a strict chain; `blackboard-export` and `save-zip-to-course` read
  its tail. A deselected generator must PASS FILES THROUGH via `isGeneratorSelected`, never be
  `runIf`-gated.
- **TWO run loops with no shared code**: `server-runner.ts` (unattended) and `useWorkflowRun.ts`
  (attended). A step-level fix lands in both for free; an engine-level one does not.
- The `docx` library escapes quotes to `&quot;`/`&apos;` - decode before asserting on `<w:t>`.
- Typed Supabase selects collapse to `never`; map rows through an explicit mapper.
- `gh` CLI is NOT installed.
