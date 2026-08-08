# Conditionally-required workflow step inputs - acceptance criteria

Feature: a step input that is mandatory in one mode and optional in another can
say so, and the run form honors it - blocking the Run button and keeping the
field in Setup only while the condition holds.

Motivating case (shipped 2026-08-08, `docs/REGRESSION.md` entry 238 check 25):
`schedule-weekly-announcements-for-term` gained a `draftFrom` select. In
"template" mode the step hard-throws "Provide a title and message for the
announcement."; in the default module-content mode both are optional. They were
therefore relaxed to `required: false`, with two consequences - `message` (a
`longtext`) dropped out of the Setup group into the collapsed "More settings"
disclosure, and the Run button stopped validating it, so a template-mode run
with a blank message fails MID-RUN instead of at submit.

## Corrections to the brief this work started from

Stated so the record is not wrong twice:

- The two consumers are `src/lib/workflow-field-groups.ts` and
  `src/app/components/workflows/validate-run-form.ts` - NOT under
  `src/lib/workflows/`. `isFieldVisible` lives in
  `src/lib/workflow-field-visibility.ts`.
- The pinned rules are `docs/REGRESSION.md` entry 176 (grouping AND visibility).
  Entry 183 is Course Build's output families and has nothing to do with this.
- The brief asked for `requiredWhen` to be honored by threading state into
  `workflow-field-groups.ts`. It is not needed there and that file is NOT
  changed - see AC3.

## Vetted existing code - reuse these, do not reinvent

Verified against the tree at cb4e5e9.

- `isFieldVisible(field, values)` - `src/lib/workflow-field-visibility.ts`. The
  precedent for the whole feature: a pure predicate over the run form's FLAT
  `fieldKey` value map, resolving a gate that is a union of
  `{ fieldKey, equals }` and `{ fieldKey, contains }`, with the `contains` arm
  going through `parseMultiSelectValue` (`multi-select-value.ts`) and treating a
  blank controller as "every entry". `requiredWhen` reuses the `equals` arm's
  shape and resolution exactly, and deliberately does NOT offer the `contains`
  arm - see AC1 item 3a for why that arm is wrong for requiredness.
- `StepInputSpec.visibleWhen` / `RuntimeField.visibleWhen` -
  `src/lib/workflows/types.ts:236` and `:656`, carried through by
  `collectRuntimeFields` at `:709`. The same three places gain `requiredWhen`.
- `validateRunForm` - `src/app/components/workflows/validate-run-form.ts:49`,
  the single `if (!field.required) continue;`.
- `partitionVisibleFields` - `src/lib/workflow-field-groups.ts:130`, the single
  `if (field.required || isUnlockedGate)`.
- `WorkflowPanel.tsx:281` - `const visibleRuntimeFields = runtimeFields.filter(...)`,
  whose only consumer is `WorkflowPanel.tsx:519`'s `fields={visibleRuntimeFields}`.
  Traced end to end: no other component renders run-form fields
  (`RunInputPrompt.tsx` and `LiteralEditor.tsx` are separate surfaces with their
  own controls). `RunFormFields.tsx:111` is where that array meets
  `groupRunFormFields`, and `RunFormFields.tsx:63` already carries `values`.
- `collectRuntimeFields` has TWO production call sites, not one: the run form's
  (`WorkflowsTab.tsx:325`, whose result flows to BOTH the render path
  `WorkflowPanel` -> `RunFormFields` AND the run path `useWorkflowRun` ->
  `validateRunForm`), and `run-step-core.ts:107`'s `enabledRuntimeFields`,
  consumed by `server-runner.ts`. So `requiredWhen` reaches the server runner's
  RuntimeFields too - harmless, because nothing server-side reads requiredness
  at all (item 11), but the call graph is two-wide and an earlier draft of this
  document claimed it was one.

## AC1 - The gate

1. `StepInputSpec.requiredWhen` and `RuntimeField.requiredWhen` are
   `{ fieldKey: string; equals: string }` - the `equals` arm ONLY. `visibleWhen`
   keeps its union unchanged; there is deliberately no shared alias spanning
   both, because the two gates do NOT mean the same thing (item 3a).
2. `collectRuntimeFields` carries `requiredWhen` through, exactly as it carries
   `visibleWhen`.
3. A field with `required: true` is required unconditionally; a `requiredWhen`
   alongside it is redundant but harmless (the static wins). A gate can only ADD
   requiredness, never remove it - nothing may make a `required: true` field
   optional, because every existing caller assumes that direction.
3a. REQUIREDNESS IS AFFIRMATIVE-ONLY, WHICH IS WHY `contains` IS NOT OFFERED.
   `isFieldVisible`'s `contains` arm treats a BLANK controller as "every entry"
   (`multi-select-value.ts`'s convention). For visibility that errs toward
   showing a field, which costs nothing. For requiredness the same rule errs
   toward BLOCKING THE USER: a field gated `contains: "announcements"` would be
   mandatory on a completely untouched form, before the instructor has chosen
   any outputs - the form would read "you have not said you are generating
   announcements, therefore we assume you are generating all of them, therefore
   this is mandatory." It would also reinstate through the front door the exact
   outcome item 9 forbids structurally: a contains-gated field would resolve
   required by default, and `required` promotes uncapped into Setup, so it would
   sit there permanently in both modes.
   No step needs a contains-shaped requiredness gate today and the motivating
   case needs only `equals`, so the arm is not built. An `equals` gate is never
   satisfied by a blank or absent controller (entry 176 AC1), so the offered arm
   points the same way the omitted one should have: an obligation appears only
   when a real choice creates it.

## AC2 - One predicate, in the module that already owns gate resolution

4. `isFieldRequired(field, values)` joins `isFieldVisible` in
   `src/lib/workflow-field-visibility.ts`. The EXACT-MATCH rule (case-sensitive,
   no trim, a blank controller never satisfies it) lives in ONE internal helper
   both predicates call, so the two can never disagree about what an `equals`
   gate means. The module's header comment is updated to say it owns both
   predicates.
4a. ITS PARAMETER TYPE MUST MAKE `required` OPTIONAL:
   `{ required?: boolean; requiredWhen?: { fieldKey: string; equals: string } }`.
   Mirroring `isFieldVisible`'s `Pick<RuntimeField, ...> | Pick<StepInputSpec, ...>`
   does NOT work here - `required` is non-optional on both interfaces, so a
   `Pick` of it rejects a partial fixture and the test suite will not compile.
   A structural parameter accepts a full RuntimeField, a full StepInputSpec, and
   a bare `{}` alike.
5. `isFieldRequired` does NOT consider visibility. Entry 176 AC2 makes "a hidden
   required field must never deadlock Run" load-bearing, and that skip already
   lives in `validateRunForm` BEFORE the requiredness check. Keeping the two
   predicates independent means a conditionally-required field that is also
   hidden still cannot block submission, and the reason stays in one place.
6. `resolveFieldRequirements(fields, values)` returns the same fields with
   `required` set to the EFFECTIVE value. It is the display-side application of
   item 4 and must be defined in terms of `isFieldRequired`, never a second copy
   of the rule.

## AC3 - Where it is honored, and where it deliberately is not

7. VALIDATION: `validateRunForm` swaps its `!field.required` test for
   `!isFieldRequired(field, values)`. No signature change - it already receives
   `values`. Everything else is untouched: the field-type allowlist, the
   visibility skip, and first-failure-wins ordering.
8. DISPLAY: the resolution happens in `RunFormFields.tsx`, on the line that
   already calls `groupRunFormFields(fields, undefined, scope)` - that file
   already receives `values` and already owns "which field sits where", so the
   resolve sits immediately above the grouping it feeds and cannot be forgotten
   from a distant call site. `WorkflowPanel.tsx:281` keeps ONLY its visibility
   filter, unchanged. (An earlier draft put the map in `WorkflowPanel` instead;
   that leaves a caller free to pass the UNFILTERED array, which typechecks,
   lints clean, regresses entry 176 AC2's rendering rule, and is caught by
   nothing - vitest renders no components.)
9. `src/lib/workflow-field-groups.ts` IS NOT CHANGED. Because item 8 resolves
   requiredness upstream of it, `partitionVisibleFields` keeps reading
   `field.required` and keeps promoting a conditionally-required field into
   Setup with no new parameter, no new import, and no change to any rule entry
   176 pins. This is the whole reason for resolving at the display boundary
   rather than threading values down.
10. THE REQUIRED MARKER FOLLOWS FOR FREE. Three readers sit downstream of item
    8: `FieldShell.tsx:138,151` renders `<RequiredMark required={field.required} />`,
    `RuntimeFieldInput.tsx:473` appends `" *"`, and `FieldShell.tsx:102` puts
    `required` on the native control through `FieldControlBinding` - so the
    resolved value now also drives the DOM/ARIA required state. A field the Run
    button will block on must show its marker; a blocked submit with no visible
    marker is worse than the mid-run failure this feature replaces.
10a. THIS RESTORES AN INVARIANT A DELETED SAFETY NET USED TO DEPEND ON.
    `RunFormFields.tsx:134-148` documents an auto-reveal for "a hidden invalid
    field", removed because `validateRunForm` only errors on a REQUIRED field
    and `groupRunFormFields` always keeps a required field in Setup - "if that
    invariant is ever weakened, this needs a real re-introduction." This feature
    weakens it in exactly one way: a conditionally-required field is only kept
    in Setup because item 8 resolved it first. Item 8 living in `RunFormFields`
    itself - the same file as that comment, one line above the grouping call -
    is what keeps the invariant true by construction rather than by remembering.
    Update that comment to say so.
11. THE SERVER RUNNER IS NOT INVOLVED, and this is not the divergence hazard
    entry 176 AC3 warned about for `visibleWhen`. Nothing server-side validates
    requiredness AT ALL today - verified by grep across `run-step-core.ts`,
    `server-runner.ts` and `server-runner-helpers.ts`. An unattended run's only
    enforcement is the step's own throw, which is unchanged. `requiredWhen` is a
    run-form affordance; it does not become a second contract the engines must
    agree on.
12. OUT OF SCOPE: `workflow-form-helpers.ts:274` validates the workflow
    BUILDER's config form - a different surface with a different value map. It
    does not change.
12a. A KNOWN LIMIT OF THE MECHANISM, not merely out of scope:
    `ScheduleEditForm.tsx:83` checks `runtimeFields.some(f => f.type === "uploads"
    && f.required)` to warn that a scheduled run cannot carry files. It receives
    the RAW fields and `ScheduleSection` has no `values` prop at all, so it
    cannot resolve a gate. A conditionally-required `uploads` field would make
    that warning silently under-report. No such field exists today, so this is
    latent - recorded here so it is found by reading rather than by a user.

## AC4 - Applied to the motivating case

13. `title` and `message` on `schedule-weekly-announcements-for-term` gain
    `requiredWhen: { fieldKey: "draftFrom", equals: "template" }`. The gate is
    exact-match, and `draftFrom`'s module-content value is the empty string, so
    the gate is satisfied only by an explicit "template" choice.
14. Their help text KEEPS documenting the rule, including the `{week}`
    placeholder. Deleting the "Required when ..." sentence was an earlier draft's
    instruction and is wrong twice over: the asterisk only appears AFTER template
    mode is picked, whereas the sentence tells the instructor the rule BEFORE the
    choice; and for `message` that sentence is the ONLY place `{week}` is
    documented, so removing it would take the placeholder with it. Nothing else
    about the step changes; its own throw stays as the last line of defence for
    unattended runs (item 11).
14a. ONE DEFINITION OF "TEMPLATE MODE". The step derives its mode from
    `String(values.draftFrom ?? "").trim() === "template"` while the gate is
    exact and untrimmed (entry 176 AC1). A stored value of `" template "` would
    run in template mode while the run form never required a message -
    reinstating the mid-run failure this feature removes. The step's comparison
    drops the trim so both read the same bytes. Unreachable through the select
    today; aligned anyway, because two definitions of one mode is how they
    drift.
15. Entry 238 check 25 records this as a known trade-off with the real fix
    deferred. It is amended to record the fix landing, rather than left claiming
    an open gap.
15a. ENTRY 176 IS AMENDED TOO. Its AC2 pins rendering as "`WorkflowPanel.tsx`
    filters before handing fields to `RunFormFields`" - now filter THEN resolve,
    with the resolve in `RunFormFields`. Its AC5 pins tier membership on
    `required` as a STATIC property read off `RuntimeField`; at the grouping
    boundary it is now a resolved, values-dependent value. Both are amendments
    to pinned rules and both get recorded; an earlier draft of this document
    claimed the change touched no rule entry 176 pins, which was wrong.

## AC5 - The survey, and why nothing else adopts it yet

16. Two other inputs carry "Required when action is rename." in their help text:
    `steps.lms-items.ts`'s `manage-course-files` and `steps.syllabus.ts`'s
    `manage-syllabus-template`, both on a `newName` input. NEITHER adopts
    `requiredWhen` in this change, and the reason is a real limit of the
    mechanism: their controlling `action` input is a plain `text` field with NO
    `options`, so the instructor types "rename" freehand. An `equals` gate is
    exact and case-sensitive (entry 176 AC1), so it would miss "Rename".
17. Making them adopters means first giving `action` `options: ["rename",
    "delete"]`. That is a separate change with its own hazard - a saved workflow
    whose stored value is "Rename" would render an out-of-range MUI select
    (entry 238 check 17 records that exact failure) - so it is not bundled here.
    Recorded rather than silently skipped.

## Tests written BEFORE implementation

- `src/lib/workflow-field-visibility.test.ts` (additions) - `isFieldRequired`
  across: no gate + `required: true`, no gate + `required: false`, an `equals`
  gate met and unmet, a `contains` gate met and unmet including its blank-means-
  all arm, a missing controller, and `required: true` winning over an unmet
  gate. Plus `resolveFieldRequirements` agreeing with `isFieldRequired` field by
  field and leaving every other property alone.
- `src/app/components/workflows/validate-run-form.test.ts` (additions) - a
  conditionally-required field blocks Run when its gate is met, does not when it
  is not, and does NOT block when it is gate-met but currently hidden.
- `src/lib/workflow-field-groups.test.ts` (additions) - a field resolved to
  required lands in Setup uncapped, and the same field left optional competes
  for a bonus slot like any other (proving item 9). Both fixtures are built
  THROUGH `resolveFieldRequirements`, never by hand-setting `required` - a
  hand-set fixture proves only that this module is unchanged and stays green
  whether or not the resolver works.
- `src/lib/workflows/presets.schedule-weekly-announcements.required-when.test.ts`
  (NEW, and the highest-value test here) - the whole pipeline over the REAL
  preset: `collectRuntimeFields` -> visibility filter -> `resolveFieldRequirements`
  -> `groupRunFormFields`, plus `validateRunForm` on the other path. Every other
  test in this feature builds fields from object literals, so all of them stay
  green if item 2's carry-through line is forgotten - and the run form only ever
  sees RuntimeFields, so the feature would be dead in production with a fully
  green suite. Precedent: `presets.course-build.run-form.test.ts`, written after
  `multi` was silently dropped between the two shapes for a long time.
- `src/lib/workflows/registry/steps.weekly-announcement-schedule.module-content.test.ts`
  (additions) - the step declares the gate on both inputs, pointing at
  `draftFrom` with `equals: "template"`.
