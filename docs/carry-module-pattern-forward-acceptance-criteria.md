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

---

## 5. Post-design corrections - THIS SECTION IS THE FINAL CONTRACT

Written 2026-08-24 after a design pass that ran three executable probes against
the real regexes and the real date arithmetic copied verbatim out of source. It
found NINE errata above, three of them consequential. **Where this section
disagrees with sections 0-4, this section wins.** Nothing above is deleted -
the wrong claims are left in place as a record, exactly as chunk B's D7b was.

**D1. G2 UNDERCOUNTS: THERE ARE FIVE EXTRACTORS, NOT TWO.** Beyond
`fillNamePattern`'s regex and `extractModuleNumber` there are `parseWeekToken`
(`src/lib/week-numbering.ts:118`), a near-duplicate of `extractModuleNumber`,
and `renumberWeekLabel` (`:57`), a third that is `week`-only and
width-preserving. The prohibition stands and is now harder: **do not add a
sixth.**

**D2. TARGET SCHEME A's `{n}`, PLUS A RECORDED DIGIT WIDTH - AND THE DECIDER IS
THE ROUND TRIP, MEASURED.** Inference must produce a pattern that, re-rendered
for the SOURCE module's own week, reproduces the source title EXACTLY; a scheme
that cannot round-trip cannot be an idempotency key (AC8). Measured against
real fixture titles: scheme B (`{x}`, zero-pad to 2) fails **20 of 29** -
"Week 5 Homework" re-renders as "Week 05 Homework", and "Module 007 Lab" LOSES
A DIGIT. Scheme C cannot represent an item title at all. Scheme A plus a
recorded WIDTH round-trips **31 of 31**, including "Module 007 Lab" and
"Module 3: Week 3 Reading". Width is the missing primitive, and its virtue is
that it infers the course's own padding convention from the course's own data
instead of imposing one.

**D3. THE DISAMBIGUATION RULE IS VALUE EQUALITY AGAINST A KNOWN ANCHOR, NOT
VOCABULARY.** Tokenise a digit run if and only if its NUMERIC VALUE equals
`extractModuleNumber(sourceModule.name)`; leave every other run literal; record
the width of the first tokenised run. This is what lets inference skip the
question that sank both existing extractors - whether "Chapter" counts as a
module word - because the source module's own number is already known.
"Reading 2 for Week 3" in Module 3 keeps the 2 and tokenises the 3;
"Chapter 12 Discussion" and "Essay 1" in Module 3 refuse. Match GLOBALLY, not
first-run-only: "Module 3: Week 3 Reading" correctly needs both.

**D3b. THE FALSE POSITIVES ARE REAL, CONCENTRATE IN THE WORST PLACE, AND ARE
MITIGATED BY THE PLAN RATHER THAN BY A SMARTER REGEX.** A number that
COINCIDENTALLY equals the module number is tokenised: "Chapter 12 Discussion"
in Module 12 renders "Chapter 03 Discussion" in Module 3, which is simply
wrong. Collisions are structurally worst in LOW-NUMBERED modules, where small
ordinals ("Essay 1", "Lab 2") are most likely to collide - and Module 1 is both
the worst case and the module an instructor is most likely to pick as the
template, because it is the one they built first. No regex fixes this:
distinguishing "chapter 12 because it is module 12" from "chapter 12 because
the book has twelve chapters" is not decidable from the title. AC5's proposal
is the mitigation - it lists the RESOLVED final title per item per target, so a
false positive is visible before anything is written and the instructor can
deselect that row. **The proposal is therefore load-bearing, not a courtesy.**

**D4. AN UNNUMBERED TITLE IS BLOCKED, NOT CARRIED - AND THE AC's FRAMING OF
THIS FAILURE WAS WRONG IN A WAY THAT UNDERSTATED IT.** The danger is not that
later targets silently get nothing. On the FIRST run each target's by-title
check runs against ITS OWN items, all of which lack the title, so every target
says CREATE and the instructor ends up with N modules each holding an
identically-named "Final Project". The run LOOKS like it worked. The silent
skip appears only on a re-run. So: an item whose inferred token count is zero
becomes a fourth decision value, `"blocked-unnumbered"`, alongside
create/skip/overwrite. It is listed in the proposal with its reason rendered in
full, it is never written, and it costs no model call - the check runs on
titles alone, even earlier than AC7's pre-check. Plan counts are
create/skip/blocked so the instructor sees at a glance that 5 of 7 items carry.
Rejected: carrying verbatim (the outcome above); appending the target number
("Final Project 8" invents a convention the instructor never wrote, in their
live course); prefixing the module name (same, plus scheme C leaking into item
titles); letting the model name it (forbidden by AC8 - a model title differs
between runs, the skip check never matches, every re-run duplicates).
**One affordance, because it is the minimum-click resolution:** a blocked row
carries an inline title-pattern field pre-filled with the source title, so the
instructor can type `{n}` once ("Final Project" to "Week {n} Reflection") and
unblock that row. Instructor-authored once, then rendered deterministically per
target, which satisfies AC8 exactly as an inferred pattern does. The field must
contain `{n}` or the row stays blocked.

**D4b. THREE FALSE-NEGATIVE CLASSES, ALL RESOLVING TO BLOCKED RATHER THAN TO
SILENT WRONGNESS.** A module name with no number at all refuses the whole carry
with ONE message rather than twelve identical per-item ones. Offset numbering
(Module 1 is orientation, its items say "Week 2") blocks. And vocabulary the
MODULE uses but `extractModuleNumber` does not - module "Unit 5", item
"Week 5 Homework" - blocks too, because `extractModuleNumber("Unit 5")` is null
even though a human sees the 5 in both. That last one is the one place using
`extractModuleNumber` for the module name genuinely costs something.

**D5. BOTH HALVES OF THE TRANSPOSITION RUN IN THE BROWSER, NOT JUST THE
RECOMPOSITION - AC4 UNDERSPECIFIED THIS.** `dueAt` arrives as a UTC instant.
Decomposing it needs LOCAL getters. Measured on the actual instant
`dueDateForWeek` produces for a Thursday 23:59 rule in week 3 of a term
starting 2026-01-12: local getters read `thu 23:59`, UTC getters read
`fri 05:59`. **The weekday FLIPS.** A server-side decomposition of an Americas
instructor's "Thursday 11:59 PM" yields Friday 5:59 AM, and recomposition then
puts every carried item in every target on a Friday morning. This is entry
328's defect in mirror image - that was a UTC COMPOSITION bug, this would be a
UTC DECOMPOSITION bug - and it is equally invisible to tsc, eslint, vitest and
next build, because every intermediate value stays a valid Date and a valid ISO
string. The transposition module sits beside `current-events-assignment-plan.ts`
and carries the same header warning and the same both-directions guard test.

**D5b. DST IS SAFE, AND THE REASON IS AN ORDERING THAT MUST NOT BE "TIDIED".**
`dueDateForWeek` calls `setHours` LAST (`assignment-due-rule.ts:141`, after the
`setDate` calls at `:128`, `:132`, `:136`), so the wall clock is stamped AFTER
DST has re-resolved. Measured across the 2026-03-08 boundary: week 8 and week 9
are both `thu 23:59` local, `05:59Z` then `04:59Z` - correct. The hazard is the
tempting alternative: adding `n * 7 * 86400000` milliseconds lands on **Friday
00:59**, off by a day AND an hour. Do not reorder those calls, and do not
replace the `setDate` walk with millisecond arithmetic.

**D6. G3's EIGHT ARE SIX - THE AC IS WRONG IN BOTH DIRECTIONS.**
`grading_type` and `omit_from_final_grade` ARE read today, in
`src/lib/canvas/auto-zero.ts` and consumed in `grading.ts`, so "the app can SET
all eight and READ none" is false. They are read by a different module family
(`src/lib/canvas/` rather than `src/lib/canvas-modules/`), which is presumably
how the survey missed them; carrying them is plumbing, not new capability. The
corrected genuinely-write-only list is SIX: `unlock_at`, `lock_at`
(assignment-scope), `allowed_attempts`, `assignment_group_id`,
`allowed_extensions`, `peer_reviews`.

**D7. THE FIELDS ARE NOT MERELY UNREADABLE, THEY ARE UNWRITABLE BY THE PATH AC6
NAMES - SO DISCLOSURE IS PER KIND, NOT ONE FLAT LIST.**
`addContentToModuleDetailed` reaches `createGradable`, which writes NONE of the
six for any kind, and for Quizzes and Discussions cannot write
`submission_types` either. So "not carried" is not a UI choice there; it is a
hard limit of the write path. The richer path exists and is already wired -
`createCourseAssignmentAction` calls `createAssignment` and links the module
item in one call, and `lms-generation-writers.ts` already uses it. **Use it for
Assignments** (the only path that can honour AC3's submission types, points and
due date, and the only one a future widening to the six could use), accept the
reduced set for Quizzes and Discussions, and disclose PER KIND. AC3's flat
field list and AC6's reuse row were inconsistent with each other; this resolves
them.

**D8. THE READER MUST NOT BE `getGradable` ALONE, OR EVERY CARRIED ITEM SHIPS
WORTH ZERO POINTS.** `getGradable` reads exactly four fields - title,
description, rubricId, submissionTypes. It does NOT read `points_possible`,
`due_at` or `published`, all three of which AC3 promises to carry. Those come
from `mapModuleItem`, which the loaded module tree already has FOR FREE.
Combining the two reads is correct and costs no extra Canvas call. Implementing
AC3 from the reuse table's `getGradable` row alone - which is what that row
invites - would silently zero the points on every carried item in every target.

**D9. A CHECKPOINTED DISCUSSION IN THE TEMPLATE LOSES ITS THURSDAY/SUNDAY SPLIT
SILENTLY, AND THAT IS OUR OWN FEATURE.** The graded-discussion checkpoints
structure is written via GraphQL and NOTHING in `src` reads any of it back. So
if the template module holds an intro discussion built by chunk A (entry 328) -
a likely template, since it is week one's centrepiece - chunk D detects a plain
discussion and carries it forward as one, dropping the checkpoint split with no
message. Either detect it and BLOCK the row with that reason, or disclose it
per kind under D7. Do not carry it silently.

**D10. G4 IS EXACTLY RIGHT AND IS THE CHEAPEST ITEM IN THE CHUNK.** The
capability is present at every layer except one: `module-items.ts:22-23`
already writes both `position` and `indent`, `NewModuleItem` declares both,
`createModuleItemAction` passes the object through unfiltered, and
`mapModuleItem` reads both back. Only `AddContentOpts` lacks the members. Two
new fields and two pass-throughs; no new Canvas capability, no new endpoint.

**D11. EXPORT-SOURCED CONTENT IS UNGATED AND SHOULD NOT BE.** Nothing refuses
this feature for export-sourced modules, where `contentSourceGating.ts:19-21`
records that three of the four fields AC3 promises to carry do not exist. Chunk
B shipped the mirror of this as a silent dead click and had to fix it before
push (entry 330 check 14). Gate it, and say why in the refusal.

**D12. THE THREE HIGHEST-RISK UNKNOWNS, EACH WITH ITS CHEAPEST EXPERIMENT.**
(1) The template module may not be numbered `module`/`week` at all, which
no-ops the whole chunk WHILE REPORTING SUCCESS - the D4b class-1 refusal must
therefore be loud and specific, never an empty plan. (2) The false-positive
collision rate on low-numbered template modules is unmeasured. (3) Template
items may mostly lack `dueAt`, which would rescope AC4 entirely to applying the
course's own `assignmentDueRule` with no decomposition at all. Settle (3)
before building the transposition; it is a read-only probe against one real
course and it decides whether D5 is needed.

**D13. AN ITEM WITH NO `dueAt` IS NOT BLOCKED - IT FALLS BACK TO THE COURSE'S
OWN RULE, WHICH MAKES D12 RISK 3 MOOT WITHOUT A PROBE.** Most template items may
well carry no due date at all; a great many module items are Pages and
ungraded. Blocking those would refuse most of a normal course. So the
transposition has two inputs and one output: if the source item HAS a `dueAt`,
decompose and recompose it (D5); if it does not, apply the course's configured
`assignmentDueRule` for the TARGET module's week, which is exactly what chunk B
already does and needs no decomposition. If neither is available the item still
carries, with no due date, and the plan says so per item. This is the same
three-reason shape entry 330 check 11 recorded: a missing deadline never aborts
the entry, it is disclosed. It also means the transposition module must be
written to handle a null `dueAt` from its first line rather than having the
case bolted on later.

---

## 6. Roles, the control, and the proposal - SECOND POST-DESIGN AMENDMENT

Written 2026-08-24 after a design pass on AC1/AC2/AC5 that read wave 1's landed
code rather than the pre-wave survey. **Where this disagrees with anything
above, including section 5, this section wins.**

**D14. THE SOURCE IS CHOSEN BY A SELECT IN THE BAR, SEEDED TO THE
LOWEST-NUMBERED SELECTED MODULE.** Reuses the `postModuleOptionsFrom` /
`defaultPostModuleChoiceFrom` precedent and its documented no-persist
exemption. Rejected: a "use as template" button on the module row. It does not
remove the exclusion ambiguity, it escapes `pruneSelectionForModules`, and it
repeats the shape of lie entry 329 point 3 records - a control whose visual
state is not the state it writes. With exactly one module selected there are no
targets and the group refuses with that reason stated; with zero the group is
not visible at all.

**D15. ROLES LIVE BESIDE THE SELECTION, AS A KEY RE-RESOLVED THROUGH
`selectedModules` ON EVERY RENDER** (the `useVisualizerCoverage` idiom), NOT as
a new field in the shared selection Sets. Adding a role to the shared Sets
changes every other bulk action's data; the concrete failures are (a) Delete
acting on the wrong set once a role partitions it, and (b) a dangling template
key surviving `pruneSelectionForModules` and then being read against a module
that no longer exists. Re-resolving each render makes a stale key impossible
rather than merely unlikely.

**D16. THE UI DELIBERATELY DOES NOT PRE-FILTER THE SOURCE OUT OF THE TARGET
LIST.** Wave 1's `buildModulePatternPlan` already enforces the exclusion and
records `excludedSourceTargetId`. If the UI also filtered, the builder's guard
would never run in production and would decay into dead code that only its own
unit test exercises. Let the guard run on every invocation and let the UI
render what the plan says it excluded. This is the reachability lesson this
repo has already recorded: a guarantee that is never exercised is not a
guarantee.

**D17. AC1's MECHANISM IS WRONG, AND THE SAME HOLE IS ALREADY SHIPPED
ELSEWHERE.** AC1 assumed declaring the apply control at `fan-out-write` makes
the group non-collapsible and forces a `consequenceTag`. It does not, if apply
lives inside the review modal: the tier is derived from VISIBLE members, a
control rendered in a modal is not a visible member of the group, so the
derived tier stays `read-only`, `mayCollapse` returns true, and
`auditGroupModel`'s I5 stops requiring a tag - the audit would then assert, in
perpetuity, that the most destructive path in the bar is safe. Fix: declare the
apply control in the catalog with `visible: (f) => f.carryReviewOpen`, so the
group's derived tier rises exactly when the destructive path is reachable.
**The shipped Generate group has this hole today** - its "Post to Canvas" lives
in `GeneratedPreviewModal` and is invisible to the derivation. That is a
pre-existing defect in entry 329's model, not one this chunk introduces; record
it and do not silently inherit the pattern.

**D18. THE PROPOSAL GROUPS BY SOURCE ITEM, NOT BY TARGET MODULE.** Three
reasons, and they all point the same way: a D3b false positive is a property of
the ITEM and is uniform across every target, so per-target grouping shows the
same error N times; the fix is per-item; and `authoredPatterns` is already
keyed by source item id. Grouping by item also turns D4b's "one message, not
twelve" from an aspiration into the natural rendering. This needs three small
additions to wave 1's builder, all of which are absent today:
`patternTemplate` on the row (the pattern text is the fastest false-positive
signal and is currently not carried out of the builder at all),
`excludedItemIds` (D3b's "the instructor can deselect that row" has no
representation), and `sourceWeek` on the plan.

**D19. IT RENDERS AS A MODAL AT ModulesView ROOT**, via
`ModulesViewSecondaryModals.tsx`, reusing the `preview*` CSS. The bar cannot
host it: `.bulkBarBody` is capped at `min(60vh, 640px)` and entry 329 records
that ceiling as THE space fix, a panel would be the third nested scroller, and
the sticky header's z-index/backdrop-filter stacking trap forbids rendering a
modal from inside the bar. Ten targets by seven items is seventy rows; that
does not go in a 60vh box.

**D20. TWO STALE FACTS CORRECTED.** `ModulesView.tsx` is **732** lines, not
998 - the orchestration extraction landed, and section 5's own gate note is out
of date. And D11's export gate is correct but INSUFFICIENT ALONE:
`facts.moduleCount` counts export keys while targets must be live, so the gate
and the operand disagree, which is the same mismatch entry 330 check 14 had to
fix before push.

**D21. INVALIDATION IS ARMED AT THE TEMPLATE READ, NOT AT THE WHOLE PROPOSAL.**
`confirmArming`'s technique applies, but at finer grain: arm the template READ
(the only Canvas-backed part) and DERIVE the plan with `useMemo`. Changing the
target selection then never discards the fetched template or the instructor's
typed `{n}` patterns - which a whole-proposal arm would throw away on every
checkbox click. No effect is written, so eslint's setState-in-effect rule never
bites.
