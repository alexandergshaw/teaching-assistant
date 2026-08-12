# The syllabus acknowledgement quiz asks which module to attach it to

Instructor request: "when the syllabus acknowledgement quiz is generated, it
needs to ask which module to attach it to."

## What happens today

The button creates a course-level classic quiz, then links it into a module
ONLY if one is literally named "Start Here" (`findStartHereModule`, matched
case- and whitespace-insensitively). If no such module exists the quiz is filed
nowhere - it lives in the Quizzes list and the message says so. There is no
first-module fallback on this path, deliberately: its sibling "Generate
syllabus" button has one, this one does not.

So the defect is not that it picks the wrong module. It is that the instructor
has never had a say.

## Two frozen records this amends, explicitly

Acceptance-criteria documents in this repo are frozen historical records and are
never edited in place, so this document carries the amendments and names them:

- **REGRESSION entry 249 check 1** says "ONE CLICK IS THE WHOLE POINT. Both
  buttons run to completion on a single press." AC1 below keeps the happy path
  at one click, so the spirit survives - but the sentence as written no longer
  describes a button that carries a target control, and this document is the
  amendment.
- **REGRESSION entry 249 check 9 and `lms-tab-syllabus-buttons-acceptance-
  criteria.md` B1-7** say the button "never CREATES a module as a side effect -
  that is a bigger action than the instructor asked for." AC4 deliberately
  reverses that, on the reasoning the original gives: creating a module is no
  longer a SIDE EFFECT once the instructor has explicitly chosen "New module"
  as the target. It is the requested action.

## Acceptance criteria

**AC1 - the target is asked in the toolbar, not in a dialog, and the happy path
stays one click.** An inline "Into module" select sits beside the Syllabus quiz
button in the same `ccBarGroup`, following the grammar the Rubrics "Edit..."
select and the deck-template picker already use. A modal would cost three clicks
on every press for a question that has a good default; the standing rule is that
fewest interactions wins without trading away confirmation, and this trades away
nothing - the outcome is stated afterwards, as it already is.

**AC2 - the default is "Start Here" when it exists, and nothing otherwise.**
Never silently the first module: that is how content lands somewhere the
instructor did not intend, and this path has deliberately never had that
fallback. With no Start Here module and no choice made, the button behaves
exactly as it does today - it creates the quiz and reports that it was not
linked into any module. Today's behaviour is the floor, not a regression.

**AC3 - the choice persists per course, and a stale one cannot resurrect.**
Stored under a `ta-` key following the `BulkCreateModulesModal` read-on-init /
write-on-change idiom. Canvas module ids are course-specific, so a restored id
MUST be validated against the current module list before it is accepted, the way
`useBulkModuleActions` validates its restored subtype and `repoGradesUiState`
filters restored ids. An id that no longer resolves falls back to AC2's default.

**AC4 - "New module..." is offered, and reuses rather than duplicates.** The
existing `NEW_MODULE_TARGET_VALUE` sentinel, `resolvePostModuleTarget` and
`planModuleTarget` are reused verbatim - including `planModuleTarget`'s
case- and trim-insensitive name match, which is the only thing standing between
"press twice" and a course full of duplicate modules, since `createModuleAction`
has no Canvas-side idempotency key. Do not mint a second vocabulary for the same
question.

**AC5 - the already-exists path stays cheap, with one addition.** Today a second
press finds the existing quiz by title, ticks the term task and returns without
writing to Canvas. That stays. The one addition: if the quiz exists but is in NO
module and a target is now chosen, link it. Re-homing a quiz that already sits in
some other module is a bigger action than was asked for - report where it is
instead, naming that module.

**AC6 - the outcome message names the module the quiz actually landed in**, and
stops asserting a reason it did not verify. Today, if `listCourseContentAction`
errors, the message still claims `no "Start Here" module exists` - a reason the
code never checked. Fix that in the same pass rather than preserving it.

**AC7 - every existing side effect survives.** The term task
`syllabus-ack-quiz` is still ticked on BOTH paths, the existing note is
preserved, `doneAt` is not re-stamped when already done, a checklist failure
still never fails the button, the tab-wide Canvas-write busy flag is still held
for the whole action, and `reload()` still runs so the linked quiz appears.
Entry 251's checks are the contract; none of them may change.

**AC8 - zero modules is not an error.** With no modules in the course the select
offers only "New module...". Leaving it unset creates the quiz unlinked, exactly
as today.

**AC9 - nothing renders as an overlay from the header bar.** Anything rendered
from `ModulesHeaderBar` sits inside `.ccStickyHeader`, which is a stacking
context and a containing block for `position: fixed` - entry 272 records what
that did to a modal. An inline select touches none of this, which is a further
reason to prefer it. Note the existing guard test only checks one level deep, so
it would NOT catch an overlay introduced in a new component rendered from the
header bar: do not rely on it.

**AC10 - the usual gates.** Suite green, `tsc` clean, `lint` clean, no emojis,
every touched file under 1000 lines, no new dependency.

## Out of scope, and recorded rather than silently left

- **The sibling button still guesses.** "Generate syllabus" resolves Start Here
  ELSE the first module (`resolveModuleForSyllabusPlacement`). After this change
  one button in the group asks and the other guesses, which is an inconsistency
  in a single toolbar group. Not widened here because it was not what was asked
  and it touches a second frozen criterion (B2-7).
- **The closest existing module picker does not persist at all.**
  `useLmsGeneration`'s `postModuleChoice`/`postNewModuleName`/`templateId` are
  plain `useState` with no `ta-` key, in violation of the standing rule. The new
  picker follows `BulkCreateModulesModal` instead. That gap is real and separate.

## Limits

vitest here is node-env and collects only `src/**/*.test.ts`, so no component
renders: the select, its default and its persistence are verified by reading,
and only the pure decisions - which module a stored choice resolves to, and what
the already-exists path should do - are executable. Neither syllabus button has
ever been rendered or clicked by any test (entry 249's own limit), and that does
not change here.
