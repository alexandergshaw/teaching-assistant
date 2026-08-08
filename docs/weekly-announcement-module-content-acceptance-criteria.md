# Scheduled weekly announcements, drafted from each week's module content - acceptance criteria

Feature: the "Schedule Weekly Announcements" workflow stops posting one repeated
message template for every week and instead drafts each week's announcement from
that week's Canvas MODULE content.

Extends `docs/weekly-announcement-scheduling-acceptance-criteria.md` (shipped at
a42fe8b, pinned as `docs/REGRESSION.md` entry 236). Every item in that document
still holds unless a numbered item below explicitly supersedes it.

Mechanism (unchanged, do not revisit): ONE run still pre-schedules the WHOLE term
up front - each in-session week's announcement created immediately with a future
`delayed_post_at`. What changes is only WHAT each week says.

Revision note: an adversarial review of the first draft of this document rejected
its architecture. Drafting was to be orchestrated by the registry STEP, calling a
server action per week. Next.js serializes client-dispatched Server Functions
(`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:206`:
"The client currently dispatches and awaits them one at a time... If you need
parallel data fetching... perform parallel work inside a single Server Function
or Route Handler"), so bounded concurrency in the step would have been a fiction
in attended runs, and an unattended run - which has no per-step deadline check
(`src/lib/workflows/server-runner.ts` checks its deadline only between fan-out
groups) - could be killed mid-drafting with NOTHING persisted, re-drafting the
whole term on every tick without ever converging. Drafting therefore happens
inside ONE server action, with its own time budget, and partial progress
converges via the existing mapping table.

## Vetted existing code - reuse these, do not reinvent

Every citation verified against the tree at 07e7a70.

- `extractModuleNumber(name)` - `src/lib/workflows/module-value.ts:68`. Pure,
  dependency-free, string-only, and tolerant of "Module 07", "Module 7",
  "Module07", "Week 7", "Module 07: Loops". USE THIS, not its sibling
  `findModuleByNumber(modules, n)` (`:81`), whose parameter type
  (`Array<{id: string|number; name: string}>`) would force an unrelated
  signature change or a duplicated regex - see AC1 item 1's rule, which is not
  a plain "first match" anyway.
- `safeFetchAll(url, ctx)` / `fetchAll(url, ctx)` / `fetchJson` /
  `mapWithConcurrency(items, limit, fn)` - `src/lib/canvas-modules/fetch-helpers.ts`
  (`:41`, `:15`, `:70`, `:80`), and `resolveCourse` - `src/lib/canvas-core.ts`.
  All server-only. The bulk pattern to copy is `listAccessibilityContent`
  (`src/lib/canvas-modules/accessibility.ts:36-46`): ONE `?per_page=100` list per
  content type for the whole course, page bodies via `mapWithConcurrency(..., 6, ...)`.
- `listModules(courseUrl, code)` - `src/lib/canvas-modules/modules.ts:12`. READ IT,
  DO NOT CALL IT. It fetches items for EVERY module (`:26-31`) under an unbounded
  `Promise.all`, so a 17-module course costs 18 simultaneous requests when this
  feature needs items for only the weeks it is actually drafting. Mirror its
  request shapes (`/modules?per_page=100`, then
  `/modules/:id/items?per_page=100&include[]=content_details`) against only the
  TARGETED modules.
- `getPage(courseUrl, pageSlug, code)` - `src/lib/canvas-modules/pages.ts:23`.
- `htmlToText(html)` - `src/lib/canvas-core.ts:68`. Handles `<br>`, block-close
  newlines, `<li>` bullets and the five common entities.
- `draftAnnouncementAction(instruction, provider)` -
  `src/app/actions/messaging.ts:405`. The vetted drafting path: owner gate, the
  instructor's saved writing-style block, the `embedded` provider's no-LLM
  scaffold, JSON `{title, message}` parsing, and `{ error }` instead of a throw.
  Call it per week from the new drafting action; do not hand-roll a second
  `callLlm` prompt.
- `isNonTransientQuotaRefusal(message)` -
  `src/lib/workflows/registry/weekly-generator.ts:79`. Requires `HTTP 429` AND a
  spend-cap/billing phrase, deliberately so an ordinary transient 429 (whose body
  routinely contains the word "quota") does NOT trip it. It lives in a
  client-bundled registry file that imports the actions barrel, so a server
  action must not import it from there: MOVE the function verbatim to a new pure
  module `src/lib/llm-refusal.ts` and re-export it from `weekly-generator.ts`
  under the same name, leaving every existing importer and its test siblings
  untouched.
- `textToHtml` - `src/lib/canvas-core.ts:87`, already applied by
  `createScheduledAnnouncementResilient` (`announcements.ts:331`). Drafted bodies
  are plain text and need no new escaping (entry 236 check 22).
- Unchanged and reused as-is: `buildAnnouncementSchedule`, `planAnnouncements`,
  `renderAnnouncementTemplate`, `findMatchingAnnouncement`,
  `formatWeekOutcomeReport` (`src/lib/announcement-schedule.ts`), and the whole
  mapping-table layer (`src/lib/supabase/weekly-announcement-schedule.ts`).
- The per-item text SHAPE in `gatherLiveModuleItems`
  (`src/lib/workflows/registry-helpers.sources.ts:263-341`) is a PARTIAL
  precedent: it writes `Type: Title (N points, due Mon D)` for
  Assignment/Quiz/Discussion (`:303-323`) but `# Title` for Page and File
  (`:283`, `:289`), and it calls `previewFileAction` per File item (`:287`).
  UNIFY on `Type: Title` for every item, and DO NOT fetch file previews. Mirror
  the header shape only; do not import that module - it is client-bundled and
  drives every fetch through server actions.

Researched, not repo convention: Canvas's throttling is a leaky bucket that
charges a 50-unit PRE-FLIGHT penalty per in-flight request and refunds it on
completion, so a client issuing at most one simultaneous request is "unlikely to
be throttled", and staggered concurrency well above 6 is what practitioners
report using. Concurrency 6 for page reads is therefore inside the envelope, and
Canvas WRITES stay strictly sequential as entry 236 check 14 already pins.

## AC1 - Where each week's content comes from

1. WEEK N'S MODULE IS MATCHED BY NAME, and the positional fallback is
   deliberately NARROW. The rule, in order:
   a. If any module's name yields a number via `extractModuleNumber`, use ONLY
      name matching. A week with no numbered module gets NO content (item 12's
      fallback), never a positional guess. A course of
      `["Start Here", "Module 01" .. "Module 14"]` asked for week 15 therefore
      gets no content - it does NOT get "Module 14".
   b. If NO module in the course yields a number at all, position may be used,
      but ONLY when the module count equals the term's week count. That equality
      is the evidence that the modules map one-to-one onto weeks; a leading
      "Start Here" breaks it and is exactly the shift this rule exists to
      prevent.
   c. Otherwise: no content for that week.
   Whichever branch answers is recorded and surfaced (items 29/30).
2. A week's material is that module's ordered items. Every item contributes a
   header line `Type: Title` plus points and due date when Canvas reports them.
   Body text is included for `Page` items (the page body) and for
   `Assignment` / `Quiz` / `Discussion` items (description/message). `File`,
   `ExternalUrl`, `ExternalTool` and `SubHeader` items contribute their header
   line ONLY - no file downloads or previews: a term's worth of file previews is
   not affordable inside the 60-second cap.
3. All HTML is converted with `htmlToText` before it reaches the model. A page
   body arrives from Canvas as raw HTML; sending it verbatim wastes the token
   budget and degrades the draft.
4. Per-week material is capped at 8000 characters INCLUDING a visible
   `[truncated]` marker appended to the text itself, so the model is never handed
   a sentence that simply stops. The week's report line also says it truncated.
5. THE TERM'S CONTENT IS FETCHED ONCE PER RUN, NOT ONCE PER WEEK, AND ONLY FOR
   THE TARGETED MODULES: one `/modules?per_page=100` request; one
   `/modules/:id/items` request per TARGETED module (bounded concurrency, not an
   unbounded `Promise.all`); page bodies only for pages those modules reference,
   at concurrency 6; and one bulk `?per_page=100` list each for `assignments`,
   `quizzes` and `discussion_topics`, joined to items by `contentId` in memory.
   Never one description fetch per item, and never a `/files/:id` preview.
6. CONTENT IS FETCHED ONLY WHEN A WEEK ACTUALLY NEEDS A DRAFT. A re-run against a
   fully scheduled term issues ZERO content reads and ZERO LLM calls - it still
   reports every week `already-present` and creates nothing (entry 236 check 4).

## AC2 - How each week is drafted

7. ONE SERVER ACTION OWNS GATHERING AND DRAFTING for the whole run. The step
   makes exactly one call to it, with the list of weeks that need an
   announcement. Splitting gathering and drafting into separate client-dispatched
   calls is forbidden: Next serializes them (see the revision note), so
   concurrency would be lost and the round trips multiplied.
8. The instruction per week names the week number, the module's name, the course
   name, that week's materials, and the instructor's extra notes, and asks for
   the sections the sibling steps already use: what students will learn this
   week, what they will be doing, upcoming deadlines, anything else to be aware
   of. It says explicitly to write from the materials rather than restating the
   module title.
9. Drafts are issued with BOUNDED CONCURRENCY, defaulting to 4 - never
   one-at-a-time across a term, never all at once. LLM calls are not Canvas
   calls: entry 236 check 14's sequential rule governs Canvas creates, which stay
   sequential and stay pinned by their existing tests.
10. A NON-TRANSIENT quota refusal (`isNonTransientQuotaRefusal` - `HTTP 429` plus
    a spend-cap/billing phrase) stops the run from issuing further drafts. An
    ordinary transient 429, including one whose body contains the word "quota",
    does NOT. Weeks skipped this way fall back to the message template (item 12)
    rather than deferring, because a re-run would hit the same wall and the term
    would never get scheduled at all.
11. DRAFTING NEVER BLOCKS SCHEDULING. A week whose draft fails (HTTP error,
    unparseable response) falls back to the message template, and its report line
    carries the underlying drafting error - never an aggregate message
    (entry 236 check 12).
11a. THE DRAFTING ACTION HAS ITS OWN TIME BUDGET (25 seconds by default,
    injectable for tests) and stops issuing new drafts when it is exhausted. The
    weeks it did not reach are marked DEFERRED, and a deferred week is NOT
    attempted this run - it is reported `not-attempted`, exactly as the execution
    budget's own truncation already is. This is what makes an unattended run
    converge: run 1 drafts and creates what it can, those weeks are recorded in
    the mapping table, and run 2 plans them as `already-present` and spends its
    whole budget on the rest. Deferring is deliberately different from falling
    back (items 10-12): a week cut short by the clock will succeed on a re-run,
    so quietly downgrading it to the template would permanently cost the
    instructor the drafted announcement they asked for.

## AC3 - Fallbacks, and the bare course

12. A week with no module matched (item 1), a module with no readable content, a
    failed draft (item 11) or a quota-skipped draft (item 10) falls back to the
    message template. The report line says which happened.
13. If there is no fallback message either (the instructor left it blank), that
    week is reported `failed` with a reason naming both causes, and the rest of
    the term continues.
13a. A DRAFT ENTRY WITH A BLANK MESSAGE IS A FALLBACK REQUEST, NOT CONTENT.
    `{week, message: ""}` must resolve exactly like a week with no entry at all -
    template, or `failed` when there is no template. Canvas will happily accept
    an empty announcement body; nothing in the transport layer will catch this.
14. TEMPLATE MODE REPRODUCES TODAY'S BEHAVIOR BYTE FOR BYTE: the rendered message
    template posted for every week, no content reads, no LLM calls.
15. THE ACTION'S DRAFTED BEHAVIOR IS OPT-IN AT ITS OWN API, VIA THE PRESENCE OF
    THE DRAFTS OPTION. When no drafts option is supplied,
    `scheduleWeeklyAnnouncementsAction` keeps today's validation VERBATIM -
    including the existing `!titleTemplate.trim() || !messageTemplate.trim()`
    rejection, which `canvas-inbox.weekly-announcement-schedule.test.ts:162-166`
    pins for a blank TITLE with a non-blank message. Per-week resolution (items
    16, 12, 13) applies only when drafts are supplied. An empty `drafts: []` is
    "drafting was on, nothing needed drafting" and behaves as templates
    throughout; a drafts entry for a week outside the plan is ignored.

## AC4 - Titles, and what the mapping table stores

16. Title precedence per week: the instructor's title template rendered with
    `{week}` when it is non-blank; else the drafted title; else `Week N`.
17. `title` and `message` are no longer both unconditionally required ON THE STEP.
    Template mode still requires a message (there is nothing else to post) AND a
    title (item 15 - the action rejects a blank one, and the step must not
    surface that as a raw error). Module mode requires neither.
18. THE TITLE ACTUALLY SENT TO CANVAS IS STORED on that week's mapping row (a new
    nullable `title` column), written at write-ahead insert time - before the
    Canvas call, per entry 236 check 5 - and again at confirm time. On the
    `resolve-pending` path that confirms an announcement ALREADY on Canvas, the
    title written back is the one that announcement actually carries (the stored
    one), never this run's freshly drafted title: a row that disagrees with
    Canvas poisons the next recovery.
19. `resolve-pending`'s content match uses the STORED title when the row has one,
    falling back to the rendered template title for legacy rows (`title` null -
    the state of every row written before this change). Without this a drafted
    title makes `findMatchingAnnouncement` unable to recognise the announcement a
    crashed run already created, and the recovery path would create a duplicate -
    the exact failure the whole feature exists to prevent.
20. The migration is additive and idempotent, the column is nullable, and rows
    written before this change keep working. `mapScheduledAnnouncementRow` maps
    it, and `src/lib/supabase/weekly-announcement-schedule.test.ts:14-43` (a full
    `toEqual` on the mapped object, and a `Row` factory that must gain
    `title: null`) is updated in the same change.

## AC5 - The existing contract is untouched

21. Entry 236 checks 4, 5, 6, 7, 8, 9, 13, 14, 16, 17, 18, 22 and 23 all still
    hold: re-running creates nothing; write-ahead ordering; the key is
    `course_id + week_number`; a pending row resolves by read-back; an already
    posted announcement is never modified; an existing row beats "past"; the run
    is resumable via the mapping table; creates are sequential; break weeks are
    not excluded and the report says so; the registry file stays free of
    server-only imports; the step stays headless-safe; the body is converted by
    `textToHtml`; the Canvas-only guard still runs before any database write.
22. A `reschedule` NEVER re-drafts and never rewrites the title or body in
    Canvas. It moves `delayed_post_at` only. An instructor may have hand-edited a
    scheduled announcement in Canvas; silently overwriting that is not this
    feature's business. Weeks planned `reschedule`, `already-present`,
    `skip-past` or `leave-posted` are therefore never gathered for and never
    drafted; only `create` and `resolve-pending` weeks are.
23. THE STEP MAKES TWO ACTION CALLS AND THE SECOND RE-PLANS FROM SCRATCH. The
    plan the step receives is advisory - it decides only what to draft. The
    execute action re-reads the mapping table, re-reads Canvas and re-plans, so a
    week that changed state between the two calls cannot produce a duplicate: the
    `(course_id, week_number)` unique constraint and the fresh plan still own
    idempotency. NEVER "optimize" the execute action into trusting the passed-in
    plan. The cost of this is one extra paginated read-back per run on a course
    that already has rows; accepted deliberately in exchange for item 6's
    zero-LLM re-run.
23a. The 45-second execution budget in `scheduleWeeklyAnnouncementsAction` is
    unchanged and still stops the run cleanly BETWEEN weeks, with the mapping
    table as the only checkpoint. Drafting is NOT inside that budget - it has its
    own (item 11a), in its own action invocation. Both budgets exist because an
    unattended run has no per-step deadline check to fall back on.

## AC6 - Step and preset surface

24. `schedule-weekly-announcements-for-term` gains: `draftFrom` (a select) and
    `extraNotes` (optional longtext folded into every week's draft). `title` and
    `message` become optional inputs, with help text stating what each is used
    for in each mode.
24a. THE SELECT'S OPTION VALUES ARE `""` AND `"template"`, with `optionLabels`
    for both. `RuntimeFieldInput.tsx:259-291` renders a `text` input with
    `options` as a MUI select whose `MenuItem`s are exactly `field.options`, so
    an options array that omits the default stored value (`""`) renders an EMPTY
    control with an out-of-range warning. vitest is node-env and renders no
    component, so no test can catch this - it is pinned by asserting the option
    values instead.
25. EVERY new input is bound in `SCHEDULE_WEEKLY_ANNOUNCEMENTS`. An unbound input
    is silently skipped by the run form (parent AC1 item 3), so an unbound
    `draftFrom` would be indistinguishable from a deliberate choice.
26. `preset-bindings.oracle.json` grows by exactly the new bindings, with its
    canaries bumped deliberately in the same change. NEVER regenerate it
    wholesale.
27. No new step type, so `headless.test.ts`'s exact-count canary does NOT move.
28. FILE-SIZE RATCHET: every file this work item touches ends under 1000 lines.
    `src/app/actions/canvas-inbox.ts` is 731 today; the gathering and drafting
    action goes in its OWN `"use server"` file, importing
    `@/lib/canvas-modules/modules`-adjacent modules DIRECTLY rather than the
    `@/lib/canvas-modules` barrel (which reaches office/PDF extraction).
29. THE DEFAULT CHANGES FOR ALREADY-SAVED RUNS AND SCHEDULES, DELIBERATELY. Blank
    means module content, and every stored run/schedule of the shipped preset
    predates this input, so an existing weekly-announcement schedule will start
    drafting from module content on its next run. That is the requested
    behavior, it is visible in every run report (item 30), and template mode
    remains one selection away. Recorded here because a preset binding diff makes
    it invisible: the oracle sees a new binding, not a changed meaning.

## AC7 - Reporting

30. Each week's report line says where its text came from: drafted from a named
    module, drafted from a module matched by position, truncated,
    "used the message template (no module content for week N)", or
    "drafting failed (<error>) - used the message template". A note is reported
    ONLY for a week this run actually created: a week the execute action re-plans
    as `already-present`, `skip-past`, `leave-posted` or `reschedule` must never
    carry "drafted from module X" into the report, because nothing was written.
31. The report keeps every guarantee of entry 236 checks 12 and 16: per-week
    status, real underlying errors, and the break-weeks disclosure once at the
    end.

## Existing tests this change legitimately breaks

Enumerated because the first draft of this document wrongly claimed there would
be no churn. Each is a deliberate, documented edit - none may be weakened.

- `src/lib/workflows/registry/steps.weekly-announcement-schedule.test.ts:22-25` -
  the `vi.mock("@/app/actions")` factory must list the new action names, or every
  test reaching `step.run` in the new default mode throws "No '<name>' export is
  defined on the mock" AT CALL TIME.
- `...:147-154` - "throws when title or message is blank" now describes TEMPLATE
  mode only. Add `draftFrom: "template"` to its values so it keeps asserting
  exactly what it asserts today (AC17 keeps that rule alive there).
- `...:299-309` - asserts a 9-argument call to
  `scheduleWeeklyAnnouncementsAction`; the step now passes the trailing
  `testOverrides` (undefined) and options. Extend the assertion; do not loosen it
  to `expect.anything()`.
- `src/app/actions/canvas-inbox.weekly-announcement-schedule.test.ts:317-324`,
  `:341`, `:356` - assert 6-argument `confirmScheduledAnnouncement` calls; a 7th
  `title` argument is now passed. Extend all three.
- Both files' `storedRow` helpers gain `title: null`.
- `src/lib/supabase/weekly-announcement-schedule.test.ts:14-43` - the `Row`
  factory and its full-object `toEqual` (AC20).
- `src/app/actions/canvas-inbox.ts:477-479` - the comment claiming
  `testOverrides` "is never passed by the registry step" becomes false.

## Non-goals (deliberate, not oversights)

- No re-drafting on reschedule (item 22).
- No file/attachment text extraction (item 2).
- No drafting for unpublished modules is specially handled - Canvas's own
  published flag is not consulted, matching every other content-reading step in
  this repo. Called out so it is a known limit rather than a discovered one.
- No per-week review-before-post UI. This is a whole-term, headless-safe action;
  review-before-send is what `WEEKLY_KICKOFF_ANNOUNCEMENT` already exists for.
- No change to `generate-weekly-announcements` (parent AC10 items 33/34).
- The repo's "persist every new UI control" rule does NOT apply: parent AC1 item
  4 withdrew it explicitly for workflow run-form step inputs, which persist
  nowhere by design.

## Tests written BEFORE implementation (the red suite handed to the implementer)

- `src/lib/announcement-module-content.test.ts` - the module-selection rule in
  all three branches of item 1, the item formatter's header lines, bodies,
  `htmlToText` handling, the character cap and its marker, the instruction
  builder, and title precedence.
- `src/lib/announcement-drafting.test.ts` - one draft per week, the default and
  configured concurrency, per-week failure isolation, the non-transient quota
  short-circuit AND the transient-429-containing-"quota" negative case, and the
  time-budget deferral.
- `src/lib/canvas-modules/module-content.test.ts` - a `globalThis.fetch`
  counting stub proving item 5's request shape: one modules list, one items call
  per TARGETED module only, one bulk list per content type, no per-item
  description fetch, no file preview.
- `src/app/actions/canvas-inbox.weekly-announcement-module-content.test.ts` - the
  drafted body reaches Canvas, the drafted title is stored, blank-message
  fallback (13a), the failure of item 13, deferral, the stored-title and
  legacy-null recovery paths (19), notes only on created weeks (30), the
  zero-work re-run (6), sequential creates, and the opt-in guarantee of item 15.
- `src/lib/workflows/registry/steps.weekly-announcement-schedule.module-content.test.ts` -
  the step's single drafting call, the weeks it asks for (22), the skip when
  nothing needs drafting (6), template mode, validation (17), and the preset
  bindings (25).
