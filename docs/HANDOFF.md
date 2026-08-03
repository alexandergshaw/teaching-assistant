# Teaching Assistant - session handoff

Repo: `C:\Users\alexa\OneDrive\Documents\Projects\teaching-assistant`
Branch: `main`, pushed, clean tree.
Suite: **363 files / 7306 tests green**. `docs/REGRESSION.md` current through **entry 203**.

Gate = `npx vitest run` + `npx tsc --noEmit` + `npx eslint src/` + `npx next build`.
The build's prerender tail ALWAYS fails locally on a Supabase env-var error - that is
expected; only "Compiled successfully" matters. Do NOT try to run the app: there is no
local `.env` and the Next middleware calls `createServerClient` unconditionally, so
every route 500s before rendering. Nothing is verifiable in a browser here.

---

## How to work this backlog

Group work by DISJOINT FILE SETS and run the groups as concurrent subagents. Verify the
disjointness against the actual files, not the description - a previous handoff claimed
two chunks were disjoint when both edited `WorkflowPanel.tsx`, and that cost a dispatch.

Standing rules, each learned the hard way:

- **Gate every returning agent** with `git status --short` against its brief before
  trusting its report. Agents do exceed scope and do misreport - one claimed "all well
  within the 1000-line cap" while its own numbers showed 1036.
- **Verify claims by RUNNING the shipped code, or by reading the shipped ARTIFACT.**
  Every defect that mattered in the last two sessions was found that way. Entry 203's
  deck findings came from unzipping a real `.pptx` and reading its OOXML; three of them
  were invisible from the source alone.
- **Tell every brief that peers are editing the same tree.** The batch where every brief
  said so had zero scope violations; the batch before it had several.
- **Subagent briefs must forbid ALL destructive git**: `commit`, `push`, `add`,
  `checkout`, `restore`, `reset`, `stash`, `clean`. One agent once ran
  `git checkout HEAD --` to "resync" and clobbered a peer's uncommitted work.
- **Re-check the 1000-line cap after every fix**, not before.
- Real instructor files for testing:
  `C:\Users\alexa\Downloads\26ss-info-1020-2a-computer-science-principles-export (1).imscc`
  (12 modules, real Canvas export - ground truth for anything cartridge-shaped).

---

## THE QUEUE, GROUPED BY DISJOINT FILE SETS

File sets below were checked against the actual files, not inferred from descriptions.
Two collisions are called out explicitly - respect them or two agents will clobber each
other. Groups with no stated collision can run concurrently.

NOTHING IS IN FLIGHT. Two agents (deck-contract work and the visualizer step) were
dispatched and then stopped before writing anything - `git status` was clean apart from
this document. The tree is exactly the pushed state.

| # | What | Files | Notes |
|---|---|---|---|
| **A** | **The deck contract.** Four separate findings that all edit the SAME file family, so they are ONE unit of work, not four: (1) slide-title length - see Q1; (2) D2 a section named after the deck itself; (3) D3 the recap slide's fabricated counterfactual; (4) D4 structural bloat and Bridge-slide filler. | `slide-prompt.ts`, `decks/generate.ts`, `lecture-concepts.ts` + tests | Biggest single quality win for the decks. Do NOT split across concurrent agents - they would collide on `slide-prompt.ts`. |
| **B** | **Visualizer gap step into Course Build + Copilot dispatch** - see Q2. Mostly wiring; the step already exists. | `steps.visualizer.ts`, `presets/course-build.ts`, `actions/github.ts`, `headless.ts` + test | Highest-risk part is the preset stepIndex shift. |
| **C** | **Line-cap ratchet** - 13 files at 950-997. Mechanical, no behaviour change. Splittable into 3-4 concurrent agents by file. | the 13 files listed below | Do this BEFORE A or B if either needs to touch a listed file. |
| **D** | **D5 generic "Helpful Free Resources" + D6 authorization-boundary bleed.** These COLLIDE on `actions/shared.ts` - run as ONE agent or strictly in sequence, NEVER in parallel. | `resource-links.ts`, `resource-links/field-resources.ts`, `course-project.ts`, `actions/shared.ts` | Also check `case-study-library.ts`, which references `FIELD_RESOURCE_MAP` - if this work touches it, D collides with F too. |
| **E** | **D7 Castletop workbook aesthetics** | `castletop.ts`, `castletop-sources.ts`, `CastletopCell.tsx` | **NOT READY.** Nobody has stated what is wrong with it. Open a real generated workbook and scope it before writing a brief. |
| **F** | **D8 validated case studies, one per week per course** | `case-study-*.ts` + the per-week selection path | Entry 203 AC4 removed the content blocker for security courses; the selection work itself is untouched. |
| **G** | **Stamp generated cartridges INTERNALLY** so a re-uploaded one is also recognized (entry 202 AC5 residual) | `cartridge-import*.ts` | - |
| **H** | **Small residuals** - see SMALLER OPEN ITEMS below; several are one-liners | scattered, mostly disjoint | - |

Disjointness verified: A, B, C, D, F, G, H touch no file in common, with the two
collisions above called out. `actions/github.ts` (B) and `steps.github.ts` (C) are
different files - do not confuse them.

### NOT A CODE TASK - only the instructor can do it

**The INFO 1020 tile still holds a corrupted course project.** Every Week 8 artifact is
bent around a "Data-Driven Public Health Policy Recommendation Engine" for a Computer
Science course. It is PERSISTED on the tile, and `define-course-project` is idempotent by
design (blank never replaces an existing project), so no re-run clears it. Entry 203 AC9
made the override reachable. Someone must point it at this course and type a real project.
No code can distinguish a bad persisted project from a good one.

Also instructor-only: the tile's LMS Exports list may still hold the app-generated
cartridge from before entry 202. The Files tab now labels those "Generated by Course
Build" - delete the labelled one and re-upload the real Canvas export.

---

## THE NEXT THING: the line-cap ratchet is nearly out of room

Zero files are over 1000 today, but THIRTEEN sit between 950 and 997:

    997  src/lib/workflows/registry/steps.github.ts
    997  src/lib/workflows/registry-helpers.ts
    994  src/lib/workflows/types.ts
    988  src/app/components/LecturePlanningTab.tsx
    983  src/app/actions/media.ts
    983  src/app/components/FilesTab.tsx
    979  src/app/actions/messaging.ts
    979  src/lib/workflows/registry/steps.rubrics.ts
    971  src/app/actions/course-planning.ts
    969  src/lib/workflows/next-week.test.ts
    964  src/lib/code-runner.test.ts
    958  src/lib/workflows/registry/steps.content-generators.ts
    957  src/app/components/workflows/useWorkflowRun.ts

`registry-helpers.ts` only fits because an agent compressed two multi-line expressions to
make room. The next edit to any of these forces a split mid-task. Split the top few
PROACTIVELY, as their own mechanical pass, before they block a feature.

---

## QUEUED BY THE INSTRUCTOR (held until the entry-203 batch was pushed - now unblocked)

### Q1. Slide titles are too long

Measured on `INFO 1020 - Lecture Materials (14).zip`, 48 slides: median title 29 chars,
but 8 over 60 and the longest 88. TWO classes, DIFFERENT causes:

- **Assertion titles, unbounded** (71-88 chars): the per-concept slides, e.g. "Classes
  are templates and objects are the living instances created from those templates." (88).
  Making these full assertions rather than noun phrases is DELIBERATE and good slide
  design - keep it. Only the length is wrong. Put the full assertion in the first bullet
  and keep the title's claim short.
- **Bridge titles, structurally forced** (59-74 chars): `slide-prompt.ts:32` and `:168`
  mandate the literal template `{ "title": "Bridge: ... to ..." }` and `:68` spells out
  "Bridge: <this concept> to <next concept>". Concatenating two section names can only be
  long. Either title after the DESTINATION concept alone, or drop Bridge slides (they are
  already flagged as connective filler - Coursera/Udemy decks do not announce their own
  transitions).

There is NO title-length rule anywhere - confirmed by grepping `slide-prompt.ts` and
`decks/generate.ts` for character limits, zero hits. Enforce in CODE, not only the prompt:
that file already has `enforceNoCodeForApplied` and `enforceCodingCycle` with a
`slide-prompt.structural-guard.test.ts` to match. A prompt rule alone is not verifiable.

Files: `src/lib/slide-prompt.ts`, `src/lib/decks/generate.ts` + tests.

### Q2. Visualizer-gap step that spins up a Copilot agent

"Insert a step into the course build that searches the visualizer repo for the concepts in
a course, and spins up a copilot agent with any gaps it finds."

All three primitives EXIST - this is wiring, not invention:
- Searching: `loadVisualizerIndexAction` (`src/app/actions/live-class.ts`) already fetches
  and parses the visualizer's nav index; `resolveVisualizerLinks`
  (`src/lib/live-class/links.ts`) already matches a concept against it. A concept that
  resolves to nothing IS the gap. Reuse both; do not write a second index parser.
- Concepts: the CONCEPT PLAN (`src/lib/lecture-concepts.ts:217`) is the authoritative
  per-lecture concept list, already consumed by the deck contract.
- Copilot: `createCopilotAgentTask` / `listCopilotTasks` (`src/lib/github.copilot.ts`),
  with `createCopilotRepoAction` (`src/app/actions/github.ts:329`) as the worked example -
  including its degradation posture, where Copilot being unavailable is a NOTE on the
  result rather than a failure. Copy that. The visualizer repo already exists, so use
  `createCopilotAgentTask`, not the repo-creating variant.

CONFIRM FIRST: the repo name looks like `programming-concept-visualizer` but that was read
out of a TEST FIXTURE (`live-class.test.ts:549`), which is not proof of the production
value.

DECIDE FIRST: the ask says "concepts in a course" but the CONCEPT PLAN is per-week - does
this sweep every week or only selected modules? And one Copilot task per gap, or one
batched task per run? Recommend batching with a cap, and SAYING what was capped.

Traps: idempotence (use `listCopilotTasks` as the existence check, the way
`ensureCourseProject` checks `hasProject()`); **inserting a step shifts every later
`bindOverrides` stepIndex in COURSE_BUILD** - recompute all of them from source, this is
the highest-risk part; the `HEADLESS_SAFE_STEP_TYPES` exact-size canary must be bumped in
the same change; opening a GitHub issue is an outward-facing side effect, so follow the
supervised/unsupervised atomic-action convention rather than letting an unattended run
silently open issues.

---

## STILL OPEN from the deck audit (entry 203 covers what was fixed)

- **D1. The corrupted course project on the INFO 1020 tile.** Every Week 8 artifact is
  bent around a "Data-Driven Public Health Policy Recommendation Engine" for a Computer
  Science course. This is now PERSISTED on the tile, and `define-course-project` is
  idempotent by design (blank never replaces), so re-running can never clear it. Entry
  203 AC9 made the override reachable; SOMEONE STILL HAS TO POINT IT AT THIS COURSE AND
  GIVE IT A REAL PROJECT. No code can tell a bad persisted project from a good one.
- **D2. A deck section named after the deck.** An earlier run produced "Core Concepts of
  Lecture Slides" as a section name, and bridged to it. The self-referential contamination
  entry 196 AC3 caught in week SUMMARIES survives in section NAMES. (Absent from the newer
  deck, so possibly already fixed by other changes - reproduce before fixing.)
- **D3. A recap slide fabricating a counterfactual.** "Had the engineers at Sun
  Microsystems utilized these specific OOP principles earlier... they would have likely
  avoided the massive fragmentation that led to Java's development." Sun CREATED Java and
  Java IS the OOP answer - the recap inverts its own case study, which slide 3 states
  correctly.
- **D4. Structural bloat.** 50 slides for one week in a rigid five-times-repeated
  Section/Concept/Example/Walkthrough/Practice/Answer/Bridge lockstep, every Bridge slide
  pure filler.
- **D5. Generic "Helpful Free Resources".** MIT OCW / OpenStax / Saylor on an OOP
  assignment - three general catalogs, nothing about OOP or Python. `resource-links.ts`
  has a FIELD_RESOURCE_MAP; this fell through to the generic tier.
- **D6. Authorization-boundary bleed.** "Ensure all object definitions are contained
  within your authorized project environment" on an assignment about writing three Python
  classes. That is `PROJECT_HANDS_ON_CONTRACT`'s AUTHORIZED TARGETS clause, written for
  security courses touching systems they do not own, leaking where it is meaningless.
  Consider composing that half only when the field warrants it.
- **D7. Castletop workbook aesthetics.** Carried over, never scoped, nobody has stated
  what is actually wrong. Files: `src/lib/castletop*.ts`,
  `src/app/components/courses/CastletopCell.tsx`. Look at a real generated workbook first.
- **D8. Validated case studies, one per week per course.** Entry 203 AC4 removed the
  content blocker for security courses; the per-week selection work itself is untouched.

---

## SMALLER OPEN ITEMS

- **`finalize-run-download.ts` run-log detail** - entry 203 AC5's recorded residual: that
  one artifact gets the deduped failure list but not the course fan-out prefix.
- **Imperative-verb set is near-inert** - entry 203 AC2's recorded follow-up. Broadening
  it risks reintroducing an over-demotion bug, so it needs its own verified pass.
- **Stamping generated cartridges INTERNALLY** so a re-uploaded one is also recognized -
  entry 202 AC5's residual. Lands in `cartridge-import.ts`.
- **`CoursesTable.module.css`** has two comments naming `.courseGroupSticky` as a math
  reference; that CSS was deleted in entry 203 AC7, so they are dangling pointers.
- **`pptx-graphics-audit.ts`** only reads applied's prefix array, so it stays
  diagnostic-blind to the coding-deck graphic requirements added in entry 203 AC10.
- **The redundant display-layer scope filter** (entry 203 AC6) is defense-in-depth for a
  non-bug. Fine to keep, fine to delete - just know which it is.
- **`projectMode: "template"` is indistinguishable from blank** (entry 203 AC9) - only
  `none` and `course-long` actually force anything. Decide whether the third option should
  become a real forcing override.

---

## PROJECT CONVENTIONS THAT BITE

- **NO EMOJIS** anywhere, with the single authorized `CHECKLIST_DONE_PREFIX` exception.
  `grep -P` is BROKEN in this environment - it errors on every file, so any scan built on
  it reports clean without looking. Use Node with a canary assertion.
- A `"use server"` module may export ONLY async functions. `tsc` AND `vitest` pass
  violations through; only `next build` catches them. Guard:
  `src/lib/use-server-exports.test.ts`.
- **vitest is `environment: "node"` over `src/**/*.test.ts` ONLY.** No jsdom, no
  testing-library. React components CANNOT be tested. Put logic in pure `.ts` modules or
  it is uncoverable - this shapes every design decision here.
- **Unbound step inputs are silently skipped.** Adding an input to a step does nothing
  until every preset using it binds it. Has caused shipped no-op "fixes".
- **Preset index arithmetic fails silently.** Inserting a step shifts every later
  `bindOverrides` key. Recompute from source; the comments have been wrong.
- The `files` accumulator is a strict chain; `blackboard-export` and `save-zip-to-course`
  read its tail. A deselected generator must PASS FILES THROUGH via
  `isGeneratorSelected`, never be `runIf`-gated.
- **TWO run loops with no shared code**: `server-runner.ts` (unattended) and
  `useWorkflowRun.ts` (attended). Engine changes must land in BOTH.
- eslint ERRORS on setState reached synchronously from an effect - use the inline async
  IIFE + `cancelled` flag idiom (`AiChatFab.tsx:115`).
- eslint's `react-hooks/globals` rejects module-cache reassignment from a component;
  keep mutable module state in a file with no component or hook.
- Typed Supabase selects collapse to `never`; map rows through an explicit mapper.
- Migrations auto-apply via a GitHub Action on push to main. Never tell the user to apply
  one by hand.
- `gh` CLI is NOT installed.
- Counting `<p:sp>` shapes in a `.pptx` is BLIND to table graphics (`<p:graphicFrame>` /
  `<a:tbl>`). Use `src/lib/pptx-graphics-audit.ts`. The `docx` library escapes quotes to
  `&quot;`/`&apos;` - decode entities before asserting on `<w:t>` or correct output reads
  as broken.
- **`pptx.ts` ignores a slide's `graphic` whenever `code` is present.** A graphic assigned
  to a code-bearing slide renders nothing at all, silently.

---

## OPEN DECISION THE INSTRUCTOR HAS ALREADY MADE

Q&A and current events are IN THE DEFAULT Course Build run, deliberately (2026-08-03).
"Blank means ALL", so a 16-week course does two extra per-week LLM fan-outs - roughly 32
extra model calls, one family doing live web research. The instructor was asked and chose
to keep it. Recorded in `REGRESSION.md` entry 191 AC5. Anyone reversing it should change
the default selection, not the pass-through wiring.
