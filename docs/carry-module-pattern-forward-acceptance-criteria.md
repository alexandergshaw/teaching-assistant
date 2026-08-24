# Carrying one module's pattern forward into other modules

Chunk D of the Modules-view backlog.

**The ask, verbatim (2026-08-23):** "i also need a way to select a module and
the items within and then have one of the bulk actions be to carry the
pattern/format of the assignments, etc in this module forward to a list of
other modules I select"

**Two decisions the owner made after the options were costed:**
1. **Structure PLUS content regenerated per target module.** Each target gets
   the template's shape - item types, order, names, points, submission types,
   relative due dates - with each item's body generated for THAT module's own
   topic. Not a verbatim copy with the number swapped.
2. **A plan preview before anything is written.** The proposal lists what would
   be created, skipped or overwritten in each target module, and nothing
   reaches Canvas until the instructor applies it.

---

## 0. Reuse survey, and the four things that do not exist

Vetted by reading, 2026-08-23. **This capability does not exist anywhere** -
not in a modal, not behind a workflow form. Every "copy content across
containers" path in the repo is course-to-course or one-target-module.

| Need | Reuse | Where |
| --- | --- | --- |
| A module's item skeleton, free, no extra Canvas call | `CanvasModuleItem` already carries `title`, `type`, `position`, `indent`, `published`, `pageUrl`, `contentId`, `dueAt`, `pointsPossible` | `canvas-modules/types.ts:2-22`, filled by `mapModuleItem` |
| Per-item detail | `getGradable` -> `{title, description, rubricId, submissionTypes}` | `canvas-modules/gradables.ts:13-45` |
| Page body | `getPage` -> `CanvasPage.body` | `canvas-modules/mappers.ts:36-45` |
| Quiz questions | `listQuizQuestions` | `canvas-modules/quiz.ts:30-45` |
| The richest write (14 fields) | `createAssignment` via `createCourseAssignmentAction`, which creates AND links in one call | `canvas-modules/assignments.ts:6-44`, `actions/canvas-modules.ts:121` |
| Rubric REUSE (not cloning) | `bulkAssociateRubric` attaches one existing rubric to N assignments | `canvas-modules/rubrics.ts:285-312` |
| Week -> deadline | `dueDateForWeek` + `parseCourseDate` + `extractModuleNumber` | as chunk B |
| **The course row from the Modules view** | **`readCourseDeadlineContextAction`, built by chunk B** | `src/app/actions/current-events-assignments.ts` |
| Idempotent by-name planning | `planBulkModuleCreation`'s decision shape | `src/lib/bulk-module-plan.ts:151` |
| Fan-out to N targets with per-item outcomes | `addContentToModuleDetailed` + `describeOrphans` | `modules/moduleContentActions.ts:88` |
| Declaring a new bulk control | the group model | `modules/bulkBarGroupCatalog.ts`, REGRESSION entry 329 |

**The four gaps, and they are the whole chunk:**

**G1. Nothing reads a module AS A TEMPLATE.** The per-item reads exist; nothing
composes them into "here is module X's shape".

**G2. PATTERN INFERENCE DOES NOT EXIST.** The app renders a name pattern
forward (`fillNamePattern`: `{module}`/`{n}` -> "Week 3 Homework") but nothing
runs it backwards. Turning "Week 3 Homework" into a re-renderable pattern is
the core new primitive. **Hazard:** there are already THREE mutually
incompatible name-pattern schemes (`{module}`/`{n}` unpadded;
`expandModuleNameTemplate`'s `{x}` zero-padded; `composeModuleTitle`'s
"Module NN:") and TWO module-number extractors that disagree
(`fillNamePattern`'s regex accepts unit/chapter/wk/mod; `extractModuleNumber`
accepts only module/week). Inference must pick one and MUST NOT add a fourth.

**G3. EIGHT FIELDS ARE WRITABLE BUT NOT READABLE.** `unlock_at`, `lock_at`,
`allowed_attempts`, `assignment_group_id`, `grading_type`,
`allowed_extensions`, `peer_reviews`, `omit_from_final_grade`. The app can SET
all eight and READ none. A "carry the format forward" that silently drops half
the format is worse than one that says which half it carries.

**G4. `position` AND `indent` ARE READABLE AND WRITABLE BUT DROPPED.**
`addContentToModuleDetailed` never passes either, so the current bulk-add
cannot reproduce a template module's item ORDER or nesting - which is a
visible part of "the pattern".

---

## 1. Acceptance criteria

**AC1 (the control, and its tier).** A new group in the bulk bar, declared in
`bulkBarGroupCatalog.ts`. Tier: the PROPOSE step is `read-only` (it writes
nothing); the APPLY step is `fan-out-write` at minimum and `destructive` if
overwrite is ever offered. Because the tier is derived from visible members,
declaring the apply control correctly is what makes the group non-collapsible.

**AC2 (source and targets are different roles, and the model has no such
concept today).** One module is the TEMPLATE; N others are TARGETS. The
selection model has one item Set and one module Set with **no role
discrimination**, and `targetMods` would include the source. The closest
precedent is the LMS-generation post target (source items -> ONE target
module); nothing in the app pairs "pick one source" with "pick N targets".
Design it explicitly; do not overload the existing Sets in a way that leaves
the source writable by its own action.

**AC3 (what carries, stated per field rather than promised in general).**
Carried: item type, order (`position`) and nesting (`indent`), the inferred
name pattern re-rendered for the target, `points_possible`, `submission_types`,
the relative due date, and rubric ASSOCIATION by reuse. Regenerated per target:
each item's description/body. **Not carried, and the UI must say so rather
than silently dropping them:** the eight fields in G3.

**AC4 (relative deadline transposition).** "Due Thursday of its week" becomes
"Thursday of the TARGET module's week". Decompose the template item's `dueAt`
into (week-of-term, weekday, time-of-day) and recompose against the target's
week using `dueDateForWeek`. **Computed in the BROWSER** - entry 328 and chunk
B's D4 both record why, and `createGradable` appends `due_at` verbatim, so
there is no second chance to catch a UTC-shifted instant.

**AC5 (the plan, which is the deliverable).** A proposal per target module
listing, per item: CREATE, SKIP (already present), or OVERWRITE, with the
resolved final title and deadline. Nothing is written until applied. Matching
is by title, case/trim-insensitive - `planBulkModuleCreation`'s rule at item
scope, the same one chunk B adopted.

**AC6 (per-object failure is per-object).** Both the proposal and the apply
step continue past a failure and report it per object, reusing
`ModuleContentResult` / `describeOrphans`. "The model returned nothing for
Module 5" and "Canvas rejected Module 5" must stay distinguishable.

**AC7 (generation shape).** One LLM call per target item, fanned out with
`Promise.allSettled` - chunk B's D3 reasoning applies unchanged: a single call
returning N bodies loses per-item failure isolation and truncates on a long
course. The idempotency pre-check runs BEFORE any model spend so a re-run
costs nothing.

**AC8 (titles are code-derived).** As in chunk B: the title is the idempotency
key, so it comes from the inferred pattern, never from the model. A
model-authored title differs between runs and the skip check would never match.

---

## 2. Non-goals

- No cloning of rubrics; association only (`bulkAssociateRubric`).
- No carrying of the eight unreadable fields (G3) - disclosed, not attempted.
- No cross-course templates. Same course only.
- No new name-pattern scheme (G2).

## 3. Testing reality

vitest here is node-env and renders NO component. The inference function, the
deadline transposition, the plan builder and the outcome note are all pure and
must be extracted as such - that is the only way any of this is testable.
Nothing will prove the proposal renders or that the apply button is reachable.

## 4. Gates

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build      # compile line only
```

No emojis; ASCII only. 1000-line ceiling via `@(Get-Content path).Count`.
**`ModulesView.tsx` is at 998 of 1000 and MUST be split before this chunk
touches it** - chunk B shipped a dedicated extraction agent and the file still
GREW by four lines, so assume an extraction here buys less than it looks like.
Compressing comments to buy room is forbidden.
Baseline: measure it at dispatch; do NOT carry a number forward from an older
document, which has now caused a stale-baseline correction twice.
