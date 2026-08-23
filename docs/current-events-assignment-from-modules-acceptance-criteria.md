# Current-events research assignment, one per selected module

Chunk B of the "two module-anchored graded items" backlog group. Chunk A is
`docs/intro-discussion-from-modules-acceptance-criteria.md`. **B does not
start until A is pushed** - but the two chunks were deliberately designed onto
DISJOINT machinery, and this document names the boundary so a later reader can
see it was a choice, not an accident.

**The ask, verbatim (2026-08-23):** "i need a button on the modules view that
creates assignment(s) and puts them in the selected modules that has students
research current events that relate to that module and submit a few paragraphs
as their submission"

Three things in that sentence are load-bearing and drive the whole design:
- **"assignment(s)"** and **"the selected modules"** - PLURAL. One assignment
  per selected module, not one assignment for the selection.
- **"relate to that module"** - each assignment is about ITS OWN module's
  topic. A single shared prompt reused across modules fails the ask.
- **"submit a few paragraphs as their submission"** - `online_text_entry`, a
  graded Canvas assignment, not a discussion and not a file upload.

---

## 0. Reuse survey (step 2 of docs/DEV_LOOP.md)

Vetted by reading, 2026-08-23.

| Need | Reuse | Where |
| --- | --- | --- |
| **One new item per selected module, in a loop** | `bulkAddToModules` - already loops `for (const mod of targetMods)` and creates one item per selected module | `src/app/components/content-tab/modules/useBulkModuleActions.ts:202-289`, loop at `:245` |
| Creating a graded assignment in one module and linking it | `addContentToModuleDetailed(courseUrl, acronym, "Assignment", moduleId, name, opts)` - already handles create-then-link and reports `success` / `failed` / **`orphaned`** (created but not linked, with identity) | `src/app/components/content-tab/modules/moduleContentActions.ts:88` |
| Per-item due date, points, description, submission type | `AddContentOpts` - already carries `dueAt`, `points`, `rubricId`, `description`, `submissionType` | `moduleContentActions.ts:15-25` |
| Reporting partial failure honestly, including leftovers in Canvas | `describeOrphans` | `useBulkModuleActions.ts:31-37` |
| The bar this button lives on | `BulkModulesSection` - the section shown when one or more MODULES are checkmarked | `src/app/components/content-tab/modules/BulkModulesSection.tsx` |
| Course's own recurring deadline ("Sundays at 11:59 PM") | `parseAssignmentDueRule` / `dueDateForWeek` | `src/lib/assignment-due-rule.ts:69,120` |
| Which week a module is | `extractModuleNumber(module.name)` | `src/lib/workflows/module-value.ts:68` |
| Course start date "YYYY-MM-DD" -> local Date | `parseCourseDate` | `src/lib/course-calendar-dates.ts:62` |
| Canvas write for an assignment with a due date | `createCourseAssignmentAction` -> `createAssignment`, which already sends `assignment[due_at]`, `assignment[submission_types][]`, `assignment[points_possible]`, `assignment[published]` | `src/app/actions/canvas-modules.ts:121`, `src/lib/canvas-modules/assignments.ts:14-31` |

**What this chunk does NOT reuse, and why.** Chunk A's home - the
`GENERATION_KIND_CONFIGS` registry and its preview-then-post pipeline - is
structurally incapable of this feature, and that was verified by reading, not
assumed:

- `generateFromSelectionAction` collapses every selected module into ONE
  `items` array and ONE `materialsText`, and its own doc comment says it
  "persists exactly one new generated_artifacts version ... never more than
  one" (`src/app/actions/lms-generation.ts:319-322,377-399`).
- Its success type is `{ artifact: GeneratedArtifact; notes: string[] }` -
  singular.
- `PostGeneratedArtifactInput` takes one `artifactId` and one `target`, and
  `ModuleTarget` is a single module by construction
  (`commit-plan.ts:54`, `lms-generation.ts:685-711`).
- `defaultPostModuleChoiceFrom` refuses to default a target at all when the
  selection spans more than one module (`lmsGenerationModuleTarget.ts:119`).
- `generated_artifacts` is keyed `(courseId, kind)` with **no module column**
  (`src/lib/supabase/generated-artifacts.ts:98,158-180`), so N modules would
  produce N indistinguishable versions of one kind.

Bending that pipeline to fan out would mean changing five contracts that
currently have exactly one shape each. The bulk bar already has the shape this
feature needs. **The two chunks therefore touch disjoint files, and B may be
built without re-reading A's diff.**

---

## 1. The control

**AC1.** A new button, `Current events assignment`, in the EXISTING
`BulkModulesSection` - the bar that appears when one or more modules are
checkmarked. It sits with the other whole-module actions, not in the
"Generate" row (that row is chunk A's home and is selection-scoped, not
per-module).

**AC2.** It is gated exactly like every other control in that section, through
the existing `gateOperation(ctx, "modules")` section gate. No new gate
vocabulary.

**AC3 (clicks).** One click runs the whole thing: for each checkmarked module,
generate that module's prompt and create the assignment in it. There is no
per-module dialog and no preview modal. This differs from chunk A deliberately
- chunk A creates ONE item an instructor will want to read and edit first,
whereas this creates N routine, structurally identical items, and N preview
modals would be N confirmations of the same decision.

**AC4 (the confirm step that IS kept).** The button arms on first click and
commits on the second, reusing the EXISTING `isConfirmArmed` /
`selectionSignature` arming already used by `bulkDeleteModules`
(`useBulkModuleActions.ts:16`, `confirmArming.ts`). The armed label states the
count and is unambiguous, e.g. `Create 4 assignments?`. Arming is reset by any
selection change - that is what `selectionSignature` is for. This keeps a
confirm step without paying for a modal.

**AC5 (persistence).** Any new textbox, select or checkbox this chunk adds
persists across reloads under a `ta-`-prefixed localStorage key (repo
invariant). If the chunk adds no new control beyond the button, this AC is
satisfied vacuously and the regression entry must say so.

---

## 2. What gets created, per module

**AC6.** For each checkmarked module, exactly one Canvas Assignment:

| Field | Value |
| --- | --- |
| name | `<module topic> - Current Events Research`, derived from the module's own name with its "Module NN:" label stripped |
| description | the generated prompt (AC9), rendered to HTML by the existing write layer |
| submissionType | `online_text_entry` |
| pointsPossible | AC8 |
| dueAt | AC7 |
| published | `false` |

**AC7 (due date).** The deadline is the course's OWN recurring rule applied to
THAT module's week - not a stagger from today, and not a hardcoded weekday:

```
week   = extractModuleNumber(module.name)
start  = parseCourseDate(course.startDate)
rule   = parseAssignmentDueRule(course.assignmentDueRule) ?? { day: "sun", time: "23:59" }
dueAt  = dueDateForWeek(start, week, rule)
```

The `{ day: "sun", time: "23:59" }` fallback is not a new invention: it is the
exact default `weekDeadline` already applies for callers that pass no rule
(`src/lib/assignment-due-rule.ts:8-12`).

When `start` is null or `week` is null, the assignment is created with **no**
due date and the outcome note says WHY, per module - "no course start date" and
"module name carries no week number" must remain distinguishable. Collapsing
distinct failures into one indistinguishable state is the defect this repo's
loop catches most often (docs/DEV_LOOP.md step 8).

**AC8 (points).** Reuse the bar's existing `bulkAddPoints` field if the button
is placed where that field is already in scope; otherwise null. Do NOT invent
a second points input.

**AC9 (the generated prompt).** Per module, and grounded in that module:
- names the module's actual topic;
- asks the student to find a **recent, real** news item or development that
  relates to that topic, and to cite it with a link and a date;
- asks for **a few paragraphs** (state a concrete range, e.g. 3-4 paragraphs
  or roughly 300-500 words) submitted as text;
- asks them to connect the item back to what the module covers - what it
  confirms, complicates or changes;
- states the deadline in plain language.

**AC10 (recency window).** The prompt asks for events from a stated window. It
must be phrased RELATIVELY ("in the last 30 days", "since the start of this
term"), never as a hardcoded absolute date, because the assignment text
outlives the day it was generated.

**AC11 (the model does not do date arithmetic).** As in chunk A: every date in
the prompt text is computed by code and interpolated. A model asked to compute
"the Sunday of week 7" will get it wrong.

**AC12 (grounding).** The generator receives, per module: the module's name,
its item titles (already in hand client-side from the displayed tree - no
extra Canvas call), and the course row fields `name`, `courseCode`,
`description`, `topicOutline`, `courseKind`.

---

## 3. Failure behaviour

**AC13.** The loop CONTINUES past a failed module. This is
`bulkAddToModules`'s existing behaviour and must not regress.

**AC14.** The final note reports, in one sentence: how many were created, how
many failed, and - separately - any that were **orphaned** (assignment created
in Canvas but not linked into the module), naming each so a human can find it.
`describeOrphans` already renders exactly that clause and must be reused
verbatim, not re-spelled.

**AC15.** A generation failure for ONE module must not abort the others, and
must be reported distinctly from a Canvas write failure. "The model returned
nothing for Module 3" and "Canvas rejected the assignment for Module 3" are
different problems with different fixes.

---

## 4. Non-goals

- No rubric generation. The bar's existing `bulkAddRubricId` picker, if in
  scope, may attach an EXISTING rubric; nothing new is created.
- No publishing. Assignments are created unpublished, like every other
  creation path in this tab.
- No change to `bulkAddToModules`'s existing behaviour, its existing fields, or
  any other bulk action.
- No touching of `post-content.ts`, `commit-plan.ts`, `commit-execute.ts`,
  `kinds.ts` or `lms-generation.ts` - those are chunk A's files. If this chunk
  finds it needs one of them, that is a signal the boundary was drawn wrong and
  it must be raised, not quietly crossed.

---

## 5. Gates

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build      # compile line only
```

Baseline before this group: **606 test files, 12171 tests, all passing**
(measured 2026-08-23).

Repo invariants: no emojis (`src/lib/no-emojis.test.ts` owns the rule);
server-action files export only async functions; 1000-line ceiling on every
touched file, counted with `@(Get-Content path).Count`.
