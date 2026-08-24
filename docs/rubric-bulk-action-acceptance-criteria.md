# Generate a rubric and associate it to every selected item

Chunk H of the Modules-view backlog.

**The ask, verbatim (2026-08-24):** "i need a bulk action that generates and
associates a rubric to all selected items"

---

## 0. Reuse survey - this is closer to a wiring job than to new machinery

Vetted by reading, 2026-08-24. **Rubric generation already exists and has
shipped.** The survey's central finding is that a full generate -> parse ->
create pipeline is already in the tree; it is simply wired to a workflow step
driven by a repo zip or a course description, and it has never been pointed at
a selection of module items or given an association fan-out.

| Need | Reuse | Where |
| --- | --- | --- |
| Generate rubric prose | `generateRubric` - 3-5 equally weighted areas as `"Area Name (25%): desc"`, each with three fixed deduction tiers | `src/lib/grade/rubric.ts:156` |
| Turn that prose into rows | `parseGeneratedRubric` | `src/app/utils/rubric.ts:11` |
| Rows -> Canvas criteria -> create | the `lms-rubric` workflow step, which already maps rows to `RubricCriterionInput[]` and calls `createRubricAction` | `src/lib/workflows/registry/steps.rubrics.ts:148` |
| Create a rubric, criteria and per-criterion rating tiers | `createRubric` / `appendRubricFields`; can optionally associate to ONE assignment in the same POST | `src/lib/canvas-modules/rubrics.ts:250`, `:187` |
| Associate one existing rubric to N assignments | `bulkAssociateRubric(courseUrl, rubricId, assignmentIds, code?)` - sequential behind one shared `createThrottleBudget`, catches per item and continues, returns `{updated, failures}`. **Creates nothing.** | `src/lib/canvas-modules/rubrics.ts:285` |
| Scale a percentage spec to a specific point total | `RubricBuilderModal`'s percent mode already does exactly this, falling back to 100 when points are null | `RubricBuilderModal.tsx:161` |
| Each item's point total, free | `CanvasModuleItem.pointsPossible`, already in the loaded module tree because `listModules` requests `include[]=content_details` | `types.ts:19`, `mappers.ts:18`, `modules.ts:28` |
| Declaring a new bulk control | the consequence-tier group model | `bulkBarGroupCatalog.ts`, REGRESSION entry 329 |

**What genuinely does not exist:** a path from a SELECTION of module items to
generation, and any association fan-out that creates the rubric it associates.

---

## 1. Acceptance criteria

**AC1. ONE GENERATED SPEC, MATERIALISED AS ONE CANVAS RUBRIC PER DISTINCT POINT
TOTAL.** The ask is ambiguous between "one rubric attached to everything" and
"a tailored rubric per item", and the ambiguity is not stylistic - it decides
the build. The resolution: generate ONE point-agnostic spec (criteria as
PERCENTAGES), then materialise it into one Canvas rubric per DISTINCT
`pointsPossible` across the selection. Ten 100-point essays produce exactly ONE
rubric, which is the literal reading of the ask and the tidy native outcome,
because Canvas rubrics are reusable objects. A mixed selection produces one
correct rubric per total rather than one wrong rubric for everything.

**AC1b. Rejected: one rubric shared across differing totals.** A rubric's
criteria points should sum to the assignment's `points_possible`; a single
shared rubric cannot match ten different totals, and the grade is then wrong.
This is the sharpest constraint in the chunk and it is why the spec is authored
in percentages.

**AC1c. Rejected: N tailored rubrics unconditionally.** That is what
`RubricBuilderModal` does today, and it produces ten near-identical rubrics the
instructor then has to maintain by hand. Per-item tailoring is NOT precluded:
the generation action takes an array of requests and fans out with
`Promise.allSettled` (entry 330 check 1's shape), so switching to N specs later
is a change at ONE call site.

**AC2. THE POINT TOTAL COMES FROM THE SELECTION, NOT FROM A DETAIL FETCH.**
`getGradable` reads only title, description, `rubric_settings.id` and
`submission_types` - **it does not read `points_possible`**. Chunk D's D8
records the same trap one scope over, where trusting `getGradable` alone would
have shipped every carried item worth zero. Here the total is already in the
loaded tree at zero extra cost.

**AC3. IDEMPOTENCY KEYS ON THE ITEM'S EXISTING `rubricId`, NOT ON A TITLE.**
Entry 244's by-name rule is deliberately NOT reused: a rubric title does not
identify its content, and `listRubrics` returns only `{id, title, source}` -
no criteria, no total - so a name match cannot tell you whether the rubric is
the one you would have generated. Keying on whether the item already carries a
rubric is the check that means something. **Bounded cost, stated rather than
hidden:** a run that creates a rubric and then fails to associate it leaves an
orphan rubric in the course. Report it by name and id, as entry 258 check 11
does for orphaned content, and do not auto-delete it.

**AC4. ITEMS THAT CANNOT TAKE A RUBRIC ARE REPORTED, NEVER SILENTLY DROPPED.**
Pages, files, subheaders and external URLs have nowhere to attach one;
`bulkAssociateRubric` hardcodes `association_type: "Assignment"`. Per-object
failure is per-object (entries 258 and 330 check 11) and silent skipping is the
defect this loop exists to catch. **The shipped `bulkRubric` control
(`useBulkItemActions.ts:507`) silently drops ineligible items and has no New
Quiz guard - that is pre-existing, is explicitly NOT inherited here, and this
control must not be "aligned down" to match it.** An item that already has a
rubric is reported as skipped with that reason, not silently replaced.

**AC5. THE CONTROL JOINS THE EXISTING `grading` GROUP.** Not a fifteenth group:
three of the four reasons chunk B's D5 gave for a separate group do not apply
here, and `grading` already derives `fan-out-write`. The 29 -> 30 visible
control canary becomes the proof it landed in the right bucket, while the
14-group id list staying PUT proves no group was invented. Tier is derived from
visible members, never declared.

**AC6. GENERATION FANS OUT ONE CALL PER SPEC, TWO PHASES, NEVER INTERLEAVED.**
Generate concurrently with `Promise.allSettled`, then write to Canvas strictly
sequentially - Canvas throttles, and `bulkAssociateRubric` already shares one
`createThrottleBudget`. Generation failures and Canvas failures stay two
separate lists all the way to the note (entry 330 check 1).

---

## 2. Non-goals

- No editing of an existing rubric's criteria.
- No replacing a rubric already attached to an item (AC4 reports, does not
  overwrite).
- No cross-course rubrics.
- No fixing the pre-existing `bulkRubric` silent-drop (AC4) - record it.

## 3. Testing reality

vitest here is node-env and renders NO component, collecting only
`src/**/*.test.ts`. The spec model, the percentage-to-points scaling, the
distinct-totals grouping, the eligibility classifier and the outcome note must
all be pure and extracted - they are the only parts testable at all. Nothing
will prove the control renders, that it is reachable by keyboard, or that a
rubric appears correctly in the Canvas UI.

## 4. The three highest-risk unknowns

1. **Does a rubric POSTed with no `rubric_association` appear in the course
   rubric list at all?** `RubricBuilderModal` already ships that sequence, but
   nothing in this repo has been run against real Canvas. Two curl calls
   settles it, and it decides whether AC1's create-then-associate split works.
2. **Does `generateRubric`'s prose format survive an assignment DESCRIPTION as
   input?** Every existing caller feeds it repo files or a schedule, never an
   assignment body. A lost area line silently `continue`s in the parser, so the
   rubric parses "fine" while summing to 50 percent. Run it against three real
   descriptions before trusting the pipeline.
3. **Is `submission_types` a reliable New Quiz discriminator here?** The
   Assignments tab uses a different mechanism (`isNewQuiz`). A ten-minute grep,
   and it decides AC4's eligibility rule.

## 5. Gates

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build      # compile line only
```

No emojis; ASCII only. 1000-line ceiling via `@(Get-Content path).Count`.
Measure the test baseline AT DISPATCH - a carried-forward number has caused
three corrections in this project, and one agent skipped the measurement
entirely.
