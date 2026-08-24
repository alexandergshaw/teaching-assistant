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

## 0b. AMENDMENT - the bar this control lands on was rebuilt (2026-08-23)

This document was written BEFORE chunk E landed (commit `1123a69`,
docs/REGRESSION.md entry 329). The bulk bar is no longer loose rows; it is a
declared group model, and a new control cannot simply be added to the JSX.

What changed that this chunk must obey:

- **Every control is declared in `bulkBarGroupCatalog.ts`** with an id, a
  `kind`, a `visible(facts)` predicate, a `persistKey` (or a `null` key WITH a
  written `unpersistedReason` - invariant I6 fails the build otherwise), and a
  **consequence tier**.
- **The tier is DERIVED, never declared per group.** `groupTier` takes the max
  over a group's visible members, so adding this chunk's control to a group
  automatically raises that group's tier. Get the control's own tier right and
  the grouping follows.
- **This control is `fan-out-write`.** One click creates a Canvas assignment in
  EVERY selected module. That makes its group non-collapsible and force-open by
  rule (`mayCollapse` returns false), and requires a non-null `consequenceTag`
  on the group stating plainly what one click does (invariant I5).
- **Never gate a disclosure body on `open`.** A `<details>` hides without
  unmounting; gating unmounts controls, and a control that never mounts never
  writes its persisted default.
- **New persisted state lives in `useBulkModuleActions.ts`**, never in a
  `Section.tsx` - a section can be conditionally unmounted, a hook called from
  `ModulesView` cannot.
- **Any new textarea/select/checkbox persists** under a `ta-`-prefixed
  per-course key, read through a TOLERANT resolver so a stale stored value
  degrades to the default rather than rendering an unselectable option.
- `ModulesView.tsx` is at **994 of 1000 lines**. If this chunk needs to touch
  it, SPLIT first - do not compress comments to fit.
- `useBulkModuleActions.ts` is at 431 lines; `BulkModulesSection.tsx` at 605.

AC1 below said this control lives in `BulkModulesSection`. That is still right -
it is a per-module fan-out action - but it now lives inside that section's
`addToEach` group or a new sibling group declared in the catalog. The step-4
architect decides which and says why.

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

## 3b. ARCHITECTURE AND AC AMENDMENTS (step 4 output, 2026-08-23)

FINAL CONTRACT. Where this disagrees with anything above, this wins.

### D1. Ten corrections to this document

| Ref | Correction |
| --- | --- |
| **W1** | Section 0's reuse table names the WRONG write function. `addContentToModuleDetailed` calls `createGradableAction` -> `createGradable` (`gradables.ts:84`), NOT `createAssignment`. Load-bearing: `createAssignment` does `new Date(a.dueAt).toISOString()` - it re-parses SERVER-SIDE - while `createGradable` appends `due` VERBATIM. The whole timezone design depends on the verbatim path. |
| **W2** | AC7 names two no-deadline causes; there are **three**. The course row may fail to resolve at all (`courseNotLinkedError`), which is not "no start date" and sends the instructor to a different screen. Reasons: `no-course-row`, `no-course-start-date`, `no-week-number`. |
| **W3** | AC8's points guidance is defective both ways: "reuse `bulkAddPoints`" reads hook state whose FIELD is conditionally unrendered (type 50, switch to Page, click, get 50-point assignments from an invisible field), and "otherwise null" ships a graded assignment worth zero. RESOLVED: `CURRENT_EVENTS_POINTS = 20`, the `INTRO_DISCUSSION_POINTS` precedent. AC5 becomes vacuous, which AC5 itself contemplates. |
| **W4** | AC1's button name COLLIDES with a shipped control: the Generate row already has a `Current events` button producing an INSTRUCTOR report at reversible-write tier. Two near-identical names with opposite consequences is what the group model exists to prevent. RESOLVED: the GROUP is "Current events assignment", the BUTTON is "Create one per module" (armed: "Create 4 assignments?"). |
| **W5** | AC6 never pins the generator's output FORM. `descriptionToHtml` passes text through unchanged when `/<\/?[a-z][\s\S]*>/i` matches and escapes it otherwise - two contracts chosen by a regex. Output is PLAIN TEXT, and the prompt must forbid angle brackets. |
| **W6** | AC14 has no wording for SKIPPED (already present), because the AC never decided idempotency. After a re-run the note is entirely skips and AC14 cannot describe it. |
| **W7** | AC9 says the prompt "states the deadline" while AC11 says code interpolates every date. Entry 328's shipped defect was exactly two copies of one deadline drifting. RESOLVED: the model is FORBIDDEN to state any date, point value or length; `buildCurrentEventsRequirementsBlock` is the sole statement. |
| **W8** | Section 5's baseline (606 files / 12171 tests) is stale by two chunks. The measured post-`1123a69` state is **634 files / 12654 tests**. |
| **W9** | Section 0b flags the `ModulesView.tsx` ceiling but names no split. Named: agent 1D extracts `buildBulkModulesSectionProps.ts`. |
| **W10** | AC12's grounding list omits `institution`, which the sibling generator carries. Included. |

### D2. Idempotency - DECIDED

Pre-check by TITLE, client-side, against the already-loaded module tree, using
the same case/trim-insensitive match `planBulkModuleCreation` uses, applied at
ITEM scope. Skip and report; never delete-and-recreate.

`planPostSteps` deliberately does NOT dedupe quizzes and discussions, and that
is correct THERE: a post follows a preview and one explicit target, so posting
twice is a deliberate act. This control has NO preview (AC3) and writes N
objects per click, so the likeliest re-run - after a partial failure - would
duplicate every module that succeeded.

**This is also why the TITLE is code-derived and the generator returns only a
body.** The title is the idempotency key; a model-authored title differs
between runs, so the pre-check would never match and every re-run would
duplicate. This is the one deliberate divergence from
`intro-discussion-generator`, which does take the model's title.

### D3. One LLM call PER MODULE, fanned out with Promise.allSettled

Not one call returning N prompts. Argued on failure isolation and truncation:
- A single call's HTTP 500, rate-limit or malformed envelope kills ALL N at
  once, leaving no per-module failure to report - the collapsed-error defect
  AC15 exists to prevent.
- Fifteen modules at 300-500 words is ~7,000-10,000 output tokens. The sibling
  generator runs at 1024. Raise the cap and a long course truncates mid-array;
  a truncated array either fails to parse (all N lost) or silently drops the
  tail after a lenient slice.
- Cost points the same way: only a few hundred shared input tokens are
  duplicated; output tokens dominate and are identical either way.
- Latency is a wash - `allSettled` costs one call's latency, not N.

TWO PHASES, never interleaved: generate all, then write all. The two failure
lists stay separate, generation runs concurrent while Canvas writes stay
sequential, and **the idempotency pre-check runs BEFORE any model spend**, so a
re-run costs zero tokens and zero writes.

### D4. Deadlines are computed IN THE BROWSER, and the Modules view cannot reach the course row today

`ModulesView` receives `courseUrl`, `exportCourseId`, `acronym`, `courseName`
and nothing else. `ContentTab` does not have the course row either - its
`courseName` is a Canvas read. Entry 328's client-side `startDate` came back in
a chunk-A action's response, and section 4 forbids touching those files.

So this chunk gets its own minimal read: `readCourseDeadlineContextAction`
returns the two RAW column strings (`startDate`, `assignmentDueRule`) and
nothing derived. The computation lives in a client-only pure module called from
the hook.

Three structural guards, all sabotage-checkable:
1. `CurrentEventsGenerationRequest` has NO date field - the generation action
   cannot compute a deadline because it is never told which week anything is.
2. `readCourseDeadlineContextAction` imports neither `assignment-due-rule.ts`
   nor the plan module.
3. A wiring test scans `src/app/actions/current-events-assignment*.ts` for
   `.toISOString(` and for an import of the plan module, asserting zero of each.

This is not theatre: `createGradable` appends `due_at` VERBATIM (W1), so a
server-produced `.toISOString()` reaches Canvas as 23:59Z - hours early for
every instructor in the Americas, with nothing in any gate able to see it.

### D5. A NEW group, not `addToEach`

1. `consequenceTag` is per-GROUP; `addToEach`'s names exactly one write, and a
   second differently-shaped fan-out would force one sentence to describe two.
2. `bulkAddPoints`/`bulkAddRubricId` state outlives its field's visibility -
   the hidden-input bug in W3.
3. `addToEach`'s own comment says its members are "one coherent flow, never
   usable independently"; a zero-input one-click generator is not part of it.
4. Canary hygiene: a separate group moves the 13->14 group canary and leaves
   the `modules + addToEach = 15` visible-control canary alone. Folding it in
   would move the 15 and move no group canary, so nothing would prove the
   capability landed in the right bucket.

The group is `fan-out-write` and can never collapse BY DERIVATION: its one
control is visible whenever the group is, so `groupTier` is always fan-out and
`mayCollapse` always false. A test must pin that with the in-place-mutation
sabotage the sibling section already uses - WITH `try/finally`, because
`groupById` returns references into one shared module-level array.

### D6. The wave split

**Wave 1 - five concurrent agents.** 1A `src/lib/current-events-assignment.ts`
+ test (pure constants and note-building). 1B
`src/app/actions/current-events-assignment-generator.ts` + test (no
`"use server"`, copy the sibling generator's shape). 1C the group model
(`bulkBarGroups.ts` + `bulkBarGroupCatalog.ts` + their two tests - ONE change,
since the id union and the catalog cannot compile apart). 1D
`buildBulkModulesSectionProps.ts` + `ModulesView.tsx` - BEHAVIOUR-FREE line
relief only. 1E `src/app/actions/current-events-assignments.ts` + test (the
`"use server"` boundary).

**Wave 2 - three agents.** 2A the client hook + its wiring test. 2B
`src/lib/current-events-assignment-plan.ts` + test (client-only; the ONLY
`.toISOString()` in the chunk). 2C `BulkModulesSection.tsx` + its wiring test +
`ModulesView.tsx`.

Files NO agent may touch: `useBulkModuleActions.ts`, `moduleContentActions.ts`,
`BulkBarGroup.tsx`, `useBulkBarGroups.ts`, `buildBulkBarFacts.ts`,
`page.module.css`, `src/app/actions.ts`, and every chunk-A file.

### D7. Canaries

MOVE: the 13->14 group id list; `BulkModulesSection`'s "exactly two
`<BulkBarGroup>`" (->3, in two places); `DECLARED_SECTION_ORDER`'s
`BulkModulesSection` entry.

MUST NOT MOVE, and each is a real proof: `modules + addToEach = 15` visible
controls (proves the control landed in a THIRD group, not smuggled into
`addToEach`); `bulkActionsPersistence`'s `declared.length === 1` (proves no
second persisted control was invented - the inverse canary for W3);
BulkItemsSection's 29; the four `nearDead` ids;
`HEADLESS_SAFE_STEP_TYPES.size === 154`; chunk A's kind lists.

### D8. Two traps

- The `<BulkModulesSection>` render site must keep `facts={...}` and
  `groupsState={...}` as BARE IDENTIFIERS inside the tag - a full spread fails
  `bulkBar.wiring.test.ts`'s slice, and an arrow function puts a `>` inside the
  tag.
- The new `<BulkBarGroup>` goes AFTER `addToEach`'s closing tag. Two existing
  tests slice from a group's open tag to the first `</BulkBarGroup>`; a group
  inserted between them lands inside those slices.

### D7b. CORRECTION to D7's canary claim (step-10 review, 2026-08-23)

D7 says `bulkActionsPersistence`'s `declared.length === 1` is "the inverse
canary proving nobody invented a second persisted control" for THIS control.
That is not true: that test scopes to a fixed `OWNED_GROUP_IDS` set which does
not include `currentEvents`, so it can never see this group. It is still
correctly unmoved, but it proves nothing here.

What DOES cover the new control is `auditGroupModel`'s invariant I6, globally:
a `persistKey: null` control with no written `unpersistedReason` fails the
audit for every group including this one. Cite that, not the persistence test.

### D10. The ModulesView ceiling - a precondition for the NEXT chunk

`ModulesView.tsx` went 994 -> 998. Agent 1D's extraction removed 40 prop lines
and this chunk's own additions - two imports, the hook-call block, the
props-build block and three threaded props - consumed all of it and four lines
more. Net headroom went from 6 lines to 2.

Two lines is a rounding error, not headroom. It is not worth blocking a green,
gated, canary-correct chunk over, and compressing comments to buy room is
exactly what section 0b forbids. **But the next chunk that touches this file
must open with a real extraction in its wave 1** - the render block from
`<BulkModulesSection>` through `<BulkItemsSection>`, or the hook-call cluster -
and that belongs in that chunk's AC at dispatch, not discovered when tsc has
nothing left to give. Recorded here so it is not.

### D9. Recorded, not fixed

`gateOperation(ctx, "modules")` is unreachable today (`selectedModules` is a
bare `Set<number>` with no source discrimination), so on an export-sourced
course this button renders and its Canvas write fails - pre-existing and
identical for `Add` and `Delete`. Threading `exportCourseId` into the read
action at least makes the deadline read produce a real answer.

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
