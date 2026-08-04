# Workflow architecture

Where the workflow engine's hard-won rationale lives. Preset files (especially
`src/lib/workflows/presets/course-build.ts`) used to carry this prose inline,
next to the one place people must edit to change anything - and it has
already drifted out of sync with the code there more than once. This
document is about invariants, not any one preset's current wiring: preset
files change constantly and are not cited here for their specific content,
only the engine code that makes them work.

Audience: an engineer about to change a workflow, a step, or a preset, who
needs to know which invariants will bite them. Every claim below was checked
against the code, not copied from a comment; where a comment and the code
disagreed, that is called out explicitly.

## 1. The model

A `WorkflowDef` (`src/lib/workflows/types.ts`) is an ordered list of
`WorkflowStepConfig` steps. Each step has a `type` (a key into the step
registry) and a `bindings` map from its own input keys to an `InputBinding`:

- `{ source: "runtime", fieldKey }` - filled from the run form.
- `{ source: "step", stepIndex, outputKey }` - an earlier step's output, by
  position.
- `{ source: "step", stepId, outputKey }` - the same, by an authoring-time
  name (see section 2). Never seen by either run engine - `expandWorkflowDef`
  lowers it away first.
- `{ source: "literal", value }` - a fixed string.

A registry step type (`registry-helpers.ts`'s `StepDefinition`) declares
`inputs: StepInputSpec[]` and `outputs: StepOutputSpec[]`, plus a `run()`
closure that takes a resolved `values` bag and returns
`{ outputs, summary, requireConfirmation?, requireInput? }`. `StepInputSpec`
(`types.ts`) also carries the run-form presentation concerns: `options`/
`multi`/`optionLabels` for a fixed-choice field, `visibleWhen` for conditional
display (section 7), `group` to steer which secondary section it lands in,
and `courseDerived` for a module input the workflow scope fills in directly.

A step's own `runIf` (`{ binding, expected }`) gates whether it runs at all;
see section 4 for the cascade this creates. `WorkflowDef.scope`
(`WorkflowScope`) sets workflow-level targets (institution / course tile /
Canvas course / org / lookahead / moduleOffset / concepts / sourcePolicy /
lmsModule) that fill matching inputs without asking - `scopeCoversType` and
`applyWorkflowScope` (both in `types.ts`) are the single source of truth both
run engines and the run form use for this.

## 2. Named step ids - what they fixed, and what they did not

Presets originally wired steps together purely by array position:
`{ source: "step", stepIndex }` and remap/bindOverride keys like `"6.selected"`
name a step by where it currently sits. Inserting a step anywhere earlier in
the array silently re-points every later reference - no compile error, no
runtime error, just a workflow that quietly asks for the wrong things or
binds the wrong output.

`WorkflowStepConfig.id` (`types.ts`) is an authoring-time name for a step,
unique within its own def. A binding may say `{ source: "step", stepId,
outputKey }` instead of `stepIndex`, and a `runIf` gate can do the same.
`expandWorkflowDef` (`src/lib/workflows/types.expand.ts`) resolves every
`stepId` to a `stepIndex` - in **expanded** coordinates, not the raw
`def.steps` position, which is the whole reason this was hard to get right
(see `types.expand.step-ids.test.ts`'s "AC E2" test: an include step sitting
before the id-bound target absorbs several steps, so the target's expanded
index diverges from its raw array index). Both run engines only ever see
`stepIndex` - `run-step-core.ts`'s `expandedStepIndex` throws if a `stepId`
somehow survives expansion, and `preset-bindings.oracle.test.ts` asserts the
same for every shipped preset.

An unresolvable `stepId` - unknown, a forward reference, naming an
include-workflow step (which exposes no outputs), or ambiguous because of a
duplicate id - throws immediately, naming both the id and the workflow
(`types.expand.ts`'s `resolveStepId`). An unreferenced duplicate id is
tolerated at render time (the render path must not go down over unused
authoring sloppiness) but is flagged unconditionally, every time, by the
build-time validator (`validate-workflow-def.ts`'s `duplicate-step-id` code -
see section 6).

**What this did not fix: `include.skipSteps` is still `number[]`.**
`WorkflowStepConfig.include` (`types.ts`) has `remap` and `bindOverrides`
whose keys may now use an id prefix (section 3), but `skipSteps` is declared
as a plain array of numbers and `types.expand.ts` reads it verbatim
(`const skip = new Set(include.skipSteps)`) - there is no id-resolution path
for it at all, unlike `resolveIncludeKeyPrefix` for the other two fields.
Inserting a step into an included workflow ahead of (or at) the position a
`skipSteps` entry names shifts every later index, so the entry silently
starts dropping a different step than the one the preset author meant -
exactly the class of bug named ids exist to prevent, on a field named ids
never reached.

## 3. include-workflow

A step with `type: "include-workflow"` is replaced, at expansion time, by the
**current** steps of another workflow (dynamic composition - editing the
source workflow changes every includer). Its `include` object has:

- `workflowId` - the source workflow.
- `skipSteps: number[]` - the source's own top-level step indices to drop
  (see section 2 for why this stays positional).
- `remap: Record<string, InputBinding>` - replacement bindings for a
  **dropped** step's output, keyed `"<prefix>.<outputKey>"`.
- `bindOverrides?: Record<string, InputBinding>` - replacement bindings for a
  **kept** step's input, keyed `"<prefix>.<inputKey>"`.

The `<prefix>` in a `remap`/`bindOverrides` key names a top-level step of the
**source** workflow: a numeric string is always read as an index (backward
compatible), any other string is looked up among the source's own top-level
step ids (`resolveIncludeKeyPrefix`, `types.expand.ts`) - never recursively
into a nested include's absorbed steps, which live in a different workflow's
id namespace. An id that matches no top-level step of the source throws,
naming it.

**The nested-include rule.** `remap`/`bindOverrides` matching works against
`topIndices` - for an absorbed step (one that came from a nested include),
`topIndices` reports the index of the **enclosing include step itself**, not
the absorbed step's own position. So a key naming an include-workflow step of
the source fans out to **every** step that include absorbs, exactly the way
a numeric key targeting that same position always has. This is proven
directly in `types.expand.step-ids.test.ts`'s two nested-include tests: one
constructs a two-step inner workflow, includes it inside an outer workflow,
includes THAT inside a third, and shows a `bindOverrides` key naming the
outer include step's id lands on both of the inner workflow's absorbed steps
- while a key naming one of those inner steps' own ids resolves against the
wrong namespace and throws (`"an id key naming an ABSORBED step does not
match"`).

`validate-workflow-def.ts` mirrors this same expansion logic
(`mirrorExpand`) purely to report - `include-unknown-workflow`,
`include-skip-out-of-range`, `remap-key-not-a-dropped-step`,
`remap-key-unknown-output`, `override-key-no-such-step`,
`override-key-not-an-input`, and `runif-target-dropped` (a kept step's
`runIf` gate targets a step this same inclusion just dropped - the real
expander silently deletes the gate, so the step would start running
unconditionally; the validator is what makes that loud instead).

## 4. The invariants that bite

### The skip cascade keys on step index, not output key

`evaluateStepGate` (`run-step-core.ts`) is the one place both engines decide
whether a step runs. A step whose `runIf` condition is not met is marked
`"skipped"`; any later step with **any** binding whose `source === "step"`
pointing at a skipped step's index is transitively skipped too
(`skippedRunIndices`), regardless of which output key it reads. The cascade
folds forward one step at a time as the caller adds each verdict back into
`skippedRunIndices`, so a chain of dependents skips all the way down.

This is why a deselected output family in Course Build is never implemented
as a `runIf` gate on its generator step. `weekly-generator.ts`'s
`runWeeklyGenerator` (the shared runner behind the six per-week generators -
announcements, Q&A, current events, Significance of the Material, knowledge
checks, instructor notes) states the reasoning directly: "Deselected means
'do no work, pass files through unchanged' - never a runIf gate (these steps
stay in the chain either way, so downstream chain consumers never skip)."
`resolve-codebase-repo` (`steps.course-build-codebase.ts`) does the same for
its own `repo` output. Gating either off with `runIf` would cascade to every
step bound to its `files`/`repo` output - which, for the `files` chain, means
the terminal Common Cartridge export (`blackboard-export`) and the zip
(`save-zip-to-course`) would themselves be skip-cascaded, producing nothing
for the whole run instead of just omitting one family.

A step declaring **zero outputs** has nothing for a dependent to bind to, so
gating it with `runIf` is safe - it can never cascade. `fill-readmes`
(`steps.github.ts`) declares `outputs: []` and is a legitimate `runIf`
target for exactly this reason.

### The `files` accumulator is a strict chain, and pure convention

Most content-generating steps declare a `files` input and a `files` output of
type `"files"` (`GeneratedCourseFile[]`), read the incoming array, append
what they produced, and pass the combined array on. Nothing in the type
system enforces this - `StepDefinition.run`'s `values` and its
`StepRunResult.outputs` are both `Record<string, unknown>`
(`registry-helpers.ts`), so a step that reads `files` and forgets to include
it (or a new key) in its own `outputs` compiles cleanly and silently drops
every file produced upstream of it.

Terminal consumers - steps that take `files` but declare `outputs: []`, so
nothing downstream can observe what they did with it - are
`blackboard-export` (the Common Cartridge/.imscc export,
`steps.lms-export.ts`), the LMS-populate step (`steps.lms-modules.ts`), and
`save-zip-to-course` (`steps.course-setup.storage.ts`). Losing the chain
anywhere upstream of one of these means it ships nothing, with no thrown
error - `registry-helpers.ts`'s own comment on
`StepDefinition.passThroughOnFailure` cites a real run (`90415cd8`) where
one generator's failure cascaded into 47 of 49 step errors for exactly this
reason, which is what that field (and `resolvePassThroughOutputs` in
`run-step-core.ts`) now exists to contain: a failed step can name which of
its own outputs should republish an upstream value instead of leaving it
`undefined`, so one generator's failure does not take the rest of the chain
down with it.

### An unbound step input is silently skipped, unless scope covers it

Adding a new input to a step definition does nothing for a preset until that
preset's own step config supplies a `bindings` entry for it - not a design
flaw so much as the reason binding coverage is worth checking after any input
change. `resolveStepInputs` (`run-step-core.ts`): if `step.bindings[spec.key]`
is undefined, the input is left out of `target` entirely **unless**
`scopeCoversType(scope, spec.type)` is true, in which case
`applyWorkflowScope` fills it from the workflow's scope directly. So a
scope-level target (e.g. "modules ahead") reaches even a preset step that
predates the input - but an ordinary unbound input just never reaches the
step, with nothing raised anywhere.

### `src/lib/workflows/registry/` is entirely client-reachable

Attended workflow steps run **in the browser**
(`useWorkflowRun.ts` is `"use client"`, and it calls step `run()` closures
directly). Every file under `src/lib/workflows/registry/` is therefore
client-bundled, and must not import - even transitively -
`@/lib/supabase/server`, `@/app/actions/shared`, or `next/headers`.
Importing `@/app/actions` itself (the `"use server"` barrel) is fine: a
`"use server"` export is just an RPC-shaped async function from the caller's
side.

Only `npx next build` catches a violation of this; `tsc`, `eslint`, and
`vitest` all stay green, because the violation is a bundling problem, not a
type or logic error. `src/lib/workflows/current-events-page-text.ts` and
`src/lib/workflows/course-schedule-docx.ts` are both extractions written to
fix exactly this: `current-events-page-text.ts`'s header explains that
`current-events-report.ts` pulled in `@/app/actions/shared` (which reaches
`@/lib/supabase/server` -> `next/headers`) purely for a string-reshaping
helper with no real dependencies, breaking the build for the client step
that needed only the helper; `course-schedule-docx.ts` documents the same
failure mode for `steps.course-guides.ts`'s several `@/app/actions`
server-action imports leaking into `steps.course-setup.storage.ts`. The
shared six-generator runner (`weekly-generator.ts`) carries the same warning
verbatim in its own header - proof the constraint is actively maintained,
not a one-off fix.

### A `"use server"` module may export only async functions

Next.js/Turbopack enforces "only async functions are allowed to be exported
in a `'use server'` file" at build time - not something `tsc` or `vitest` can
see. `src/lib/use-server-exports.test.ts` is the guard: it scans every source
file under `src/` whose first substantive line is the `"use server"`
directive and fails if any of them exports anything other than an async
function, a default async function, or a type-only export. It also asserts
it found more than 30 such modules, so the check cannot pass vacuously by
matching nothing.

### `HEADLESS_SAFE_STEP_TYPES`'s size canary is one-directional

`isHeadlessSafeWorkflow` (`headless.ts`) decides whether a workflow can run
on a schedule with nobody watching: every expanded step's type must be in
`HEADLESS_SAFE_STEP_TYPES`, or satisfy a per-type predicate in
`CONDITIONALLY_HEADLESS_SAFE` (today: `prepare-lecture`, `scan-term-courses`,
`audit-visualizer-coverage` - each safe only for a specific, statically-known
binding shape, since none of them can see a value that only exists at run
time). `headless.test.ts` pins `HEADLESS_SAFE_STEP_TYPES.size` to an exact
number (152 as of this writing).

The canary only catches a size **change** - it cannot catch a size that
should have changed but did not. Adding a new step type to the registry
requires no edit to `headless.ts` at all: the new type is simply absent from
`HEADLESS_SAFE_STEP_TYPES`, the set's size is unchanged, the canary stays
green, and the new step is silently classified interactive
(not headless-safe) regardless of whether its own `run()` ever actually
pauses. The failure mode this misses is therefore not "a headless-safe step
became unsafe" but "a genuinely headless-safe new step never gets added to
the list and is stuck excluded from every scheduled workflow until someone
notices."

## 5. The two run engines

`server-runner.ts` (unattended - the cron route, run-now route, webhook
route, triggers route) and `useWorkflowRun.ts` (attended - the in-browser run
button) both now delegate the actual per-step decision logic to
`run-step-core.ts`: `evaluateStepGate` (disabled branch, `runIf` gate, skip
cascade), `resolveStepInputs` (binding resolution, scope application, `"*"`
expansion, `@class-repo`/`@class-tile` refs), `resolvePassThroughOutputs`
(deliverable-resilience pass-through), `isRunOk` (the run-clean verdict), and
`buildRunReportMarkdown` (the saved text-deliverables report).
`run-step-core.ts`'s own header states why: before this extraction the two
loops each carried an 89-line byte-identical copy of this logic, plus four
behavioral divergences nobody had noticed, because the attended copy interleaves
`setRunState` UI calls into its control flow in a way that made the drift
hard to see by eye. `useWorkflowRun.pass-through.ts` is now a thin
re-export of `run-step-core.ts`'s `resolvePassThroughOutputs`/`isRunOk` kept
only so existing import sites and `pass-through-on-failure.test.ts` need no
changes - it has no logic of its own.

What is still genuinely separate per engine, and why:

- **Pause/resume.** Only the attended engine can pause: `useWorkflowRun.ts`
  holds `runPause`/`pauseResolverRef` state and a `requireInput`/
  `requireConfirmation` handshake so a step can wait for a human. The
  unattended engine has nobody to answer a pause - `runExpandedBodyOnce`
  (`server-runner.ts`) treats an unexpected `requireConfirmation`/
  `requireInput` as a defensive abort: record `"needs-interaction"` and stop
  the **entire** run (not just the current fan-out group), since
  `isHeadlessSafeWorkflow` (section 4) is supposed to have kept every such
  step out of an unattended run in the first place.
- **Fan-out and its deadline/checkpoint machinery.** Only
  `runWorkflowUnattended` fans a workflow out over institutions/course tiles
  (`fanout.ts`'s `isInstitutionFanout`/`isCourseFanout`/`isComposedFanout`),
  with a soft `deadlineMs` budget and `onInstitutionDone`/`onCourseDone`
  checkpoint callbacks so a scheduled run can resume mid-fan-out across
  ticks. The attended engine's own fan-out UI (course progress, "Stop after
  this course") has no deadline concept - a human is present the whole time.
- **Browser download APIs.** The attended engine collects
  `DOWNLOADABLE_OUTPUT_KEY` outputs and triggers a real browser download at
  the end of the run (`finalize-run-download.ts`). The unattended engine
  never downloads anything - its deliverables are saved server-side
  (`saveBundle`, `saveCourseMaterialFile`, etc., via `StepRunHelpers`).
- **Service-role vs. nullable-session helpers.** `buildServerStepRunHelpers`
  (`server-runner-helpers.ts`) is built from a caller-supplied service-role
  Supabase client and a schedule's own resolved owner - every helper closure
  is non-null. `buildAttendedStepHelpers`
  (`src/app/components/workflows/attended-step-helpers.ts`) is built from the
  signed-in browser session, so a signed-out state nulls several helpers out
  (a headless-safe step's own `run()` has to tolerate that).

## 6. The guard rails

- **`preset-bindings.oracle.test.ts` / `.json`.** Pins every shipped preset's
  fully **expanded, resolved** bindings (source, step index, output key) and
  `runIf` gate - captured at commit `1df8e38`, before the step-id migration:
  49 presets, 228 steps, 847 bindings, 307 of them step-to-step. This exists
  because `preset-shape.oracle.test.ts` alone cannot catch a mis-resolved
  binding: a binding that resolves to the wrong step index is still
  `source: "step"`, contributes no run-form field, and changes no step type,
  so the shape oracle stays green while every binding after an include
  points at the wrong place.
- **`preset-shape.oracle.test.ts` / `.json`.** Pins, per preset, the expanded
  step type list, `topIndices` (which top-level step each expanded step came
  from - what per-user enable/disable toggles and include `bindOverrides`
  key against), and the run form's field list (key, type, required), for the
  four course-setup presets. Captured at commit `2419cec`.
- **`presets.include-key-targets.test.ts`.** Resolves every `remap`/
  `bindOverrides` key of Course Build's own include step through
  `resolveIncludeKeyTargets` (`validate-workflow-def.ts`) and asserts it
  lands on the step **type** the preset author intended - catching the case
  a plain "does the target step declare an input by this name" check cannot:
  a step inserted ahead of the real target that happens to declare the same
  input name would satisfy that weaker check while silently stealing the
  key's meaning. This file lives under the `presets.*.test.ts` naming
  pattern and is under active edit alongside the preset files themselves as
  of this writing, so its exact key list and counts are not reproduced here.
- **`validate-workflow-def.ts`.** The build-time reporter (never throws,
  never mutates) behind the guard rail above. Issue codes:
  `unknown-step-type`, `step-binding-out-of-range`,
  `step-binding-forward-reference`, `step-binding-unknown-output`,
  `binding-key-not-an-input`, `include-unknown-workflow`,
  `include-skip-out-of-range`, `remap-key-not-a-dropped-step`,
  `remap-key-unknown-output`, `override-key-no-such-step`,
  `override-key-not-an-input`, `runif-target-dropped`, `duplicate-step-id`,
  and `internal-validation-error` - a catch-all so one step's unanticipated
  validation failure reports and moves on instead of truncating the whole
  walk (the module's own header explains this replaced an earlier single
  try/catch that silently stopped checking after the first step with an id
  binding).

**Never regenerate an oracle JSON to make a failing test pass.** Both oracle
tests say this explicitly in their own headers: a diff means a preset's
wiring changed, which is either a real defect or a deliberate change that
needs its own regression entry - never a reason to update the fixture and
move on.

## 7. The run form

`collectRuntimeFields` (`types.ts`) walks a workflow's (expanded) steps in
order and, for every input whose binding is `{ source: "runtime" }`, emits
one `RuntimeField` - first occurrence of a field key wins, so two steps
sharing a runtime field key (deliberately, to ask once) collapse to one
form field. A field is skipped entirely, and never asked, when
`scopeCoversType(def.scope, spec.type)` is true (the workflow's own scope
already supplies it), or when it is a module input on a step whose course
input is itself workflow-scoped (`courseDerived`/`isModuleType` - the module
is derived from the scoped course, not asked separately).

**Conditional visibility.** `StepInputSpec.visibleWhen` /
`RuntimeField.visibleWhen` carries either `{ fieldKey, equals }` or
`{ fieldKey, contains }`. `isFieldVisible`
(`src/lib/workflow-field-visibility.ts`) is the one predicate both the render
layer and the run-time binding resolution share:

- `equals` - visible only when the named controlling field's current value
  exactly matches. Before the controller is touched, its value is `""`,
  which never equals a real option, so an `equals`-gated field starts
  hidden.
- `contains` - for a multi-select controller: visible when the controller's
  newline-separated entries include the gate's value as a **whole entry**
  (never a substring). A **blank** controller counts as "every entry" (the
  same "blank means all" convention `multi-select-value.ts` uses elsewhere),
  so a `contains`-gated field is visible **by default**, before the
  multi-select has been touched at all.

Hiding a field this way never unbinds it and never clears its stored value;
it only affects whether the value reaches the step at run time
(`resolveStepInputs` resolves a hidden field to `""`/`[]`) and whether it can
block submission while required.

**`workflow-field-groups.ts`** sorts the currently-visible fields into
`Setup` (rendered inline, no click needed) and three secondary sections -
`Details`, `Templates`, `Posting` - reached with one click. A field is
`Setup` when it is `required`, OR when it carries a currently-satisfied
`visibleWhen` gate whose shape is `equals` (`partitionVisibleFields`'s
`isUnlockedGate` check branches on `!("contains" in field.visibleWhen)`) - a
field the instructor "just unlocked by answering the question right above
it." **A `contains` gate does not qualify**, specifically because a blank
multi-select controller satisfies it by default: nothing was "just
unlocked," so it falls through to the same capped "bonus" path as any other
optional field - up to `DEFAULT_BONUS_CAP` (4) additional early, visually
compact fields get promoted to `Setup` too, in declaration order, so a
workflow's first few genuine decisions do not get buried behind a click
purely for being optional. Everything else lands in a secondary group via
`classifySecondaryField`: an explicit `StepInputSpec.group` hint wins if
present, otherwise boolean types default to `Posting`, any type matching
`/template/i` defaults to `Templates`, and everything else defaults to
`Details`. A group with no fields is omitted entirely.

See `docs/WORKFLOW-RUN-FORM.md` for the field-by-field reference of Course
Build's own selectors; this section is about the mechanism, not any preset's
current field list.
