# Scheduled weekly announcements from a package, and back out as one - acceptance criteria

Extends `schedule-weekly-announcements-for-term` (the SCHEDULE_WEEKLY_ANNOUNCEMENTS
preset) along two new axes and one new option:

- IN: the term's weekly content may come from an uploaded course cartridge or
  course export instead of a live Canvas course.
- OUT: the run may emit an importable Common Cartridge (.imscc) and/or a plain
  zip of the drafted announcements, instead of (or in addition to) creating
  them in Canvas.
- OPTION: an explicit "email a copy to students" choice, alongside the weekday
  and post-time options that already exist.

The existing live path - course tile in, announcements created in Canvas with
future `delayed_post_at` - is UNCHANGED. Every new behavior is reached only by
a new input value, and the default value of every new input is the value that
reproduces today's behavior byte for byte.

## Mechanism, stated once

Today's step creates each week's announcement in Canvas immediately, carrying a
future `delayed_post_at`, so nothing is visible to students until its own week.
That is not a recurring schedule and this feature does not make it one.

The package path is the same plan, rendered instead of posted: the same
`buildAnnouncementSchedule` slots, the same drafted text, written into a file
the instructor imports (or keeps) rather than into Canvas. A packaged run
performs NO Canvas writes and NO mapping-table writes at all.

## Vetted existing code - reuse these, do not reinvent

Everything below was read and confirmed present at the cited path during the
survey for this document. Reuse it. Do not write a second copy.

### Parsing a cartridge or export (the IN axis)

| What | Where | Notes |
| --- | --- | --- |
| `parseCartridgeBlob(blob: Blob): Promise<CartridgeCourseData>` | `src/lib/cartridge-import.ts:357` | THE canonical parser. Dispatches Canvas-export / generic CC / Blackboard by content, not extension. Throws a named message for Moodle `.mbz`. |
| `detectCartridgeFormat(manifestXml, hasBlackboardMarkerFiles)` | `src/lib/cartridge-import.ts:337` | `"blackboard" \| "common-cartridge" \| "unknown"`. Blackboard is detected from the namespace marker inside the manifest plus `.bb-*` marker files. |
| `CartridgeCourseData` / `CartridgeModule` / `CartridgeModuleItem` | `src/lib/cartridge-import-shared.ts:74` / `:49` / `:18` | `CartridgeModuleItem = { title: string; type: string; body?: string }`. `body` is tag-stripped text capped at `MAX_CARTRIDGE_ITEM_BODY_CHARS = 3000`. |
| `detectAppGeneratedCartridge(blob)` | `src/lib/cartridge-import.ts:487` | Never throws. Used to refuse the app's own output as input (entries 202, 206). |
| `hasOnlyGeneratedExports(tile)` | `src/lib/courses-table-helpers.ts` | The tile-export equivalent of the same refusal (entry 196 AC3). |
| `helpers.loadCourseExport(courseId)` | `src/lib/workflows/registry-helpers.ts:57` | `(courseId: string) => Promise<CartridgeCourseData \| null>`. Already runs `parseCartridgeBlob` server-side; returns null both for "no export" and "only app-generated exports". |
| The two precedent branches to copy | `src/lib/workflows/registry/steps.course-schedule-from-source.ts:618` (uploaded cartridge) and `:758` (tile export) | Including their exact error strings for the empty/self-generated cases. |

### Turning parsed modules into announcement text (the bridge)

| What | Where | Notes |
| --- | --- | --- |
| `selectModuleForWeek` | `src/lib/announcement-module-content.ts:58` | Generic over `T extends { name: string }`, so it accepts `CartridgeModule` UNCHANGED. Name-first matching; positional fallback only for a wholly unnumbered course whose module count equals the week count. |
| `formatModuleMaterials(module, { remaining })` | `src/lib/announcement-module-content.ts:109` | Pure. `MODULE_MATERIALS_CAP = 8000`. |
| `buildWeeklyAnnouncementInstruction({week, moduleName, courseName?, materials, extraNotes?})` | `src/lib/announcement-module-content.ts:144` | Pure; returns the plain string the drafter takes. |
| `ModuleContent` / `ModuleContentItem` / `WeeklyAnnouncementDraft` | `src/lib/announcement-module-content.ts` | `WeeklyAnnouncementDraft = { week; title?; message?; note?; defer? }`. |
| `draftWeeklyAnnouncements(...)` | `src/lib/announcement-drafting.ts:41` | The LLM call is INJECTED as `draft`. Concurrency 4, budget-aware, quota short-circuit via `isNonTransientQuotaRefusal`. |
| `resolveAnnouncementTitle` | `src/lib/announcement-module-content.ts` | Title precedence, including the `{week}` override. |

The drafter's entire contract is a `string`. A cartridge source therefore needs
ONE new function producing `Map<number, WeekModuleContent>` from parsed modules;
`formatModuleMaterials`, `buildWeeklyAnnouncementInstruction`,
`draftWeeklyAnnouncements` and `draftAnnouncementAction` are all untouched.

### The schedule itself (shared by both axes)

| What | Where | Notes |
| --- | --- | --- |
| `parsePostTime(raw)` | `src/lib/announcement-schedule.ts:72` | `/^([01]?\d\|2[0-3]):([0-5]\d)$/`. NEVER throws; blank and malformed both degrade to 08:00. |
| `DEFAULT_POST_HOUR = 8`, `DEFAULT_POST_MINUTE = 0` | `src/lib/announcement-schedule.ts:43` | |
| `buildAnnouncementSchedule(start, weekCount, weekday, postTime)` | `src/lib/announcement-schedule.ts:98` | Monday-anchored via `dateForWeekday`; `setHours` after the day arithmetic, so the local wall-clock hour survives DST. |
| `planAnnouncements(slots, existing, now)` | `src/lib/announcement-schedule.ts:179` | Pure. Live path only - a packaged run does no planning. |
| `formatWeekOutcomeReport` | `src/lib/announcement-schedule.ts` | The report renderer both paths share. |

`src/lib/announcement-schedule.ts` carries an explicit invariant in its header
(lines 5-9): it never imports `@/lib/supabase/server`, `@/app/actions/shared`,
or `next/headers`. Keep it that way.

### Building a package (the OUT axis)

| What | Where | Notes |
| --- | --- | --- |
| `buildCommonCartridge(courseTitle, weeks: CartridgeWeek[], options?: { flavor?: "cc" \| "canvas" })` | `src/lib/workflows/common-cartridge.ts:379` | Returns a `Blob`. Flavor defaults to `"cc"`. Isomorphic: already called from a client registry step AND from `step-helpers-server.ts`. |
| `CartridgeWeek` | `src/lib/workflows/common-cartridge.ts:20` | `{ week; title; files: {name,blob}[]; pages: {title,html}[]; assignments: {title,html,points,dueAt?}[] }`. |
| `buildAssignmentSettingsXml` | `src/lib/workflows/common-cartridge.ts:105` | The exact shape to imitate for a topic settings file: Canvas namespace `http://canvas.instructure.com/xsd/cccv1p0`, an optional date element (`<due_at>`). |
| `buildModuleMetaXml` | `src/lib/workflows/common-cartridge.ts:124` | Writes `course_settings/module_meta.xml`. Its item `contentType` union is `"Assignment" \| "Attachment"` TODAY. |
| `buildCartridgeStampJson` / `CARTRIDGE_STAMP_PATH` | `src/lib/cartridge-import-stamp.ts:81` / `:38` | Every cartridge this app writes is stamped so it can never be re-consumed as source. |
| `DOWNLOADABLE_OUTPUT_KEY = "__downloadableFile"` | `src/lib/workflows/run-logging.ts:127` | A step sets `outputs[DOWNLOADABLE_OUTPUT_KEY] = { blob, fileName }` INSTEAD of downloading. Attended runner flushes one download per course; unattended runs never read it. Gate on `typeof document !== "undefined"`. |
| `helpers.saveBundle(blob, name)` | `src/lib/workflows/registry-helpers.ts:39` | Saves to the Files tab. |
| `helpers.saveCourseExportFile(courseId, blob, fileName)` | `src/lib/workflows/registry-helpers.ts:53` | Saves onto the course tile. |
| `jszip` (dynamic import) | `package.json:23` | `const { default: JSZip } = await import("jszip")` - the idiom every cartridge module uses. |
| `markdownLiteToHtml` | `src/lib/markdown-lite.ts` | Announcement bodies are plain text/markdown-lite; this is how `steps.lms-export.ts` renders them to HTML. |

### The step and preset surface

| What | Where | Notes |
| --- | --- | --- |
| `StepInputSpec` | `src/lib/workflows/types.ts:196` | `options`, `multi`, `optionLabels`, `accept`, `visibleWhen`, `requiredWhen`, `group`. |
| `type: "uploads"` | `src/lib/workflows/types.ts:46`, rendered at `src/app/components/workflows/RuntimeFieldInput.tsx:478` | Runtime-only `File[]`, never persisted. `accept` defaults to `".imscc,.zip"`. The step reads `values.<key> as File[]`. |
| `visibleWhen` / `requiredWhen` | `src/lib/workflows/types.ts:236` / `:249` | Resolved by `isFieldVisible` / `isFieldRequired` in `src/lib/workflow-field-visibility.ts`. `requiredWhen` is EQUALS-ONLY and can only ADD requiredness. |
| `collectRuntimeFields` | `src/lib/workflows/types.ts:682` | Must carry every new spec field through to `RuntimeField` or the feature is dead in production (entry 239 check 11). |
| `HEADLESS_SAFE_STEP_TYPES` | `src/lib/workflows/headless.ts:27` | Already contains `schedule-weekly-announcements-for-term` (line 215). |
| The headless count canary | `src/lib/workflows/headless.test.ts:186` | `expect(HEADLESS_SAFE_STEP_TYPES.size).toBe(154)`. |
| `step-categories.ts` | `src/lib/workflows/step-categories.ts:188` | `schedule-weekly-announcements-for-term` is already registered under `announcements`. |

## AC1 - The new "Draft from" option: an uploaded package

1. `draftFrom` gains ONE new option value, `"cartridge"`, labeled
   "An uploaded course cartridge or export". `DRAFT_FROM_OPTIONS` becomes
   `["", "template", "cartridge"]`, APPENDED - never reordered. The existing
   values `""` (Canvas module content, the default) and `"template"` keep their
   exact current meaning and their exact stored strings.
2. A new input `cartridge`, `type: "uploads"`, `accept: ".imscc,.zip"`,
   `required: false`, `visibleWhen: { fieldKey: "draftFrom", equals: "cartridge" }`,
   `requiredWhen: { fieldKey: "draftFrom", equals: "cartridge" }`. It follows
   the identical pattern `steps.course-schedule-from-source.ts:204` uses.
3. When `draftFrom === "cartridge"` and no file was uploaded, the step throws
   `"Upload a course cartridge or course export (.imscc or .zip) - the uploaded package source needs it."` before any other work.
4. The uploaded file is parsed with `parseCartridgeBlob`. A Blackboard archive,
   a Canvas course export and a plain Common Cartridge are all accepted -
   `parseCartridgeBlob` already dispatches by content. A Moodle `.mbz` surfaces
   that parser's own named error unchanged.
5. If `detectAppGeneratedCartridge` returns true for the upload, the step
   throws the self-consumption refusal, matching entries 202/206:
   `"That cartridge was produced by this app, not exported from a real course - drafting announcements from it would feed the app its own output back in. Upload the LMS's own export instead."`
6. If the parsed package has ZERO modules, the step throws rather than
   producing an empty term: `"The uploaded package has no modules - nothing to draft each week's announcement from."` Never a silent empty success.
7. Week-to-module matching uses `selectModuleForWeek` UNCHANGED, passing
   `CartridgeModule[]` directly (it is generic over `{ name: string }`). A week
   with no matching module falls back exactly as the live path does: the
   message template, with the same `note` wording, and `matchedBy: "none"`.
8. `CartridgeModuleItem` carries no due date and no points. The header line
   `formatModuleMaterials` renders therefore omits the `(N points, due Mon D)`
   suffix for a packaged source. That is a data limit of the format, not a bug,
   and the per-week note says so once: `"drafted from the uploaded package"`.
9. When `draftFrom === "cartridge"`, the course tile (`hubCourse`) is OPTIONAL.
   It is used only to name the output and to supply a course title when the
   package has none. No Canvas URL, no start date on the tile, and no LMS link
   are required.
10. `startDate` and `weeks` still have to come from somewhere. Precedence, in
    order: (a) the course tile's own `startDate` / `weeks` when a tile is
    selected; (b) the package's `startAt` and its module count. Two new
    optional inputs, `startDate` (`type: "date"`) and `weekCount`
    (`type: "number"`), each `visibleWhen` `draftFrom === "cartridge"`, override
    both. If none of the three yields a start date, the step throws
    `"Set a start date - the uploaded package does not carry one and no course tile is selected."`

## AC2 - The new "Deliver" axis

11. A new input `deliver`, `type: "text"`, `required: false`, with options
    `["", "package", "both"]` and labels:
    - `""` -> "Schedule them in the LMS" (DEFAULT - today's behavior)
    - `"package"` -> "Build an importable package only (no LMS changes)"
    - `"both"` -> "Schedule them in the LMS and build the package"
    Blank is the default and IS a member of `options` (entry 238 check 24a: an
    options-bearing select whose stored default is absent from `options`
    renders empty with an out-of-range warning).
12. `deliver === ""` reproduces today's behavior EXACTLY: same action calls,
    same arguments, same outputs, same summary. Verified by a test that runs the
    preset with only today's inputs and asserts the
    `scheduleWeeklyAnnouncementsAction` call arguments are unchanged.
13. `draftFrom === "cartridge"` FORCES package-only delivery, whatever `deliver`
    holds. A packaged source performs no Canvas writes and no
    `weekly_announcement_schedule` writes. When `deliver` was `""` or `"both"`
    while the source is a package, the report states the override in one line
    rather than silently ignoring the field:
    `"Source is an uploaded package, so nothing was written to the LMS - the package below is the whole output."`
14. `deliver === "package"` with a LIVE source (`""` or `"template"`) also
    performs no Canvas writes: it plans the term with `buildAnnouncementSchedule`,
    drafts (module mode) or renders the template, and builds the package. It
    still requires a start date and week count, from the tile or from the new
    override inputs.
15. `deliver === "both"` runs the existing live path FIRST and unchanged, then
    builds the package from the SAME resolved per-week title/message/postAt
    triples the live path used. A package-build failure never fails a run that
    already wrote to Canvas: it degrades to a note appended to the report.

## AC3 - What the package contains

16. A new input `packageFormats`, `type: "text"`, `options: ["imscc", "zip"]`,
    `multi: true`, `required: false`, `visibleWhen` gated on `deliver` NOT being
    `""`. Blank means BOTH, following `output-selection.ts`'s
    `parseOutputSelection` convention (blank = every family). Labels:
    `imscc` -> "Course import package (.imscc)", `zip` -> "Plain zip of the announcement documents".
17. The `.imscc` is built with `buildCommonCartridge`, flavor `"canvas"` when
    the resolved LMS is Canvas and `"cc"` otherwise, and is stamped by the
    existing `buildCartridgeStampJson`.
18. Each in-session week becomes ONE announcement in the package. The exact
    wire format is taken from Canvas's own Common Cartridge exporter
    (`instructure/canvas-lms`: `lib/cc/topic_resources.rb` and
    `lib/cc/cc_helper.rb`), not invented:

    a. The standard CC topic file - written for BOTH flavors, so a non-Canvas
       LMS still imports the content. Root element `<topic>`, with
       `xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1"` and the
       matching `xsi:schemaLocation`; children `<title>` and
       `<text texttype="text/html">`. Its manifest resource `type` is the
       literal `imsdt_xmlv1p1` (Canvas's `CCHelper::DISCUSSION_TOPIC`).

    b. The Canvas topic meta file - written for the `"canvas"` flavor ONLY.
       Root element `<topicMeta>`, with
       `xmlns="http://canvas.instructure.com/xsd/cccv1p0"` (Canvas's
       `CCHelper::CANVAS_NAMESPACE`, the SAME namespace
       `buildAssignmentSettingsXml` at `common-cartridge.ts:114` already uses)
       and `xsi:schemaLocation` referencing
       `https://canvas.instructure.com/xsd/cccv1p0.xsd` (`CCHelper::XSD_URI`).
       Canvas writes its children in a fixed order; this builder emits the
       subset it can honestly populate, IN THAT ORDER:
       `<topic_id>`, `<title>`, `<delayed_post_at>`, `<position>`, `<type>`,
       `<discussion_type>`, `<pinned>`, `<workflow_state>`.
       `<type>` is the literal `announcement` - that single tag is what makes
       Canvas import the topic into Announcements rather than Discussions.
       `<workflow_state>` is `active`, `<discussion_type>` is `side_comment`,
       `<pinned>` is `false`.

    c. `<delayed_post_at>` carries the week's own slot in the same zoneless-UTC
       form `steps.lms-export.ts:151`'s `toUtcTimestamp` already produces for
       `due_at` - Canvas parses a zoneless value as UTC and renders it back in
       the course timezone. Reuse that conversion; do not write a second one.

    d. The meta file is registered as its own manifest resource of type
       `associatedcontent/imscc_xmlv1p1/learning-application-resource`
       (Canvas's `CCHelper::LOR` - the SAME literal the Canvas-flavor assignment
       branch at `common-cartridge.ts:284` already emits), and the topic
       resource carries a `<dependency identifierref>` pointing at it. That is
       Canvas's own linkage; do not fold both files into one resource.
19. CORRECTED - an earlier draft of this item said the opposite, and it was
    wrong. `common-cartridge.ts`'s `EmittedItem.contentType` union
    (`"Assignment" | "Attachment"`, at `:190`, mirrored at `:132` and re-asserted
    at the filter `:431`) is NOT widened, and all three sites stay untouched.
    An announcement is not a module item (item 20), so it is never pushed into
    `items` or `emittedItems` at all - a third union member would be dead code
    dressed up as coverage.

    This is safe because Canvas's Common Cartridge importer is RESOURCE-driven,
    not organization-driven - verified against `instructure/canvas-lms`, not
    assumed. `lib/cc/importer/canvas/topic_converter.rb` selects
    `resource[type=imsdt_xmlv1p1]` straight off the manifest;
    `lib/cc/importer/standard/discussion_converter.rb` reads
    `resources_by_type("imsdt")` off the index
    `Canvas::Migration::Migrator#get_all_resources` builds from
    `manifest.css("resource")`. Neither consults `<organizations>`.
    `convert_organizations` is a separate pass that builds module structure and
    LINKS already-converted topics; it never creates one. Canvas's own exporter
    proves the round trip: `lib/cc/organization.rb` builds the organizations
    tree from `context_modules` only, so every announcement Canvas itself
    exports is an unreferenced resource.

    The page loop at `:208-231` DOES carry a real defect - it pushes to `items`
    but never to `emittedItems`, so a page reaches the manifest tree and never
    reaches `course_settings/module_meta.xml`. It is pinned as existing
    behavior by REGRESSION entry 240 check 5. Do not copy it and do not fix it
    here; fixing it would change every cartridge this app already writes.
20. Announcements are NOT placed inside the numbered weekly modules. Canvas
    announcements are not module items. They ride as their own manifest
    resources, and `module_meta.xml` is not given announcement entries.
21. The zip contains, per in-session week, one `week-NN-announcement.md` file
    (title as an H1, body beneath, and a front-matter block carrying `week`,
    `postAt` in ISO-8601, and `emailCopy`), plus one `README.md` naming the
    course, the weekday, the post time, the resolved email-copy setting, and one
    line per week. It is a plain `JSZip` archive, dynamically imported.
22. Both artifacts are delivered the way `steps.lms-export.ts` already delivers
    the course cartridge: `helpers.saveBundle` to the Files tab, and
    `helpers.saveCourseExportFile` when a tile is bound, and - on an attended
    run only (`typeof document !== "undefined"`) -
    `outputs[DOWNLOADABLE_OUTPUT_KEY] = { blob, fileName }` so the runner flushes
    one download per course. The step NEVER triggers a download itself.
23. When both formats are selected, the two blobs are handed over as two saved
    files; only ONE may occupy `DOWNLOADABLE_OUTPUT_KEY`, so the `.imscc` wins
    when both are built and the report names the zip's saved location.

## AC4 - The email-copy option

24. A new input `emailCopy`, `type: "text"`, `required: false`, options
    `["", "1", "0"]` with labels:
    - `""` -> "Use each student's own notification settings" (DEFAULT)
    - `"1"` -> "Email a copy to students"
    - `"0"` -> "Do not email a copy"
25. Resolution lives in ONE new pure function,
    `resolveAnnouncementEmailCopy(lms: string, choice: string): { value: boolean | null; honored: boolean; note: string }`,
    in `src/lib/announcement-schedule.ts` (already client-bundle safe). Nothing
    else in the codebase decides what the choice means.
26. TRUTHFULLY SCOPED, because this is the one place the feature can lie.
    Canvas's discussion-topic create endpoint accepts no notification parameter
    at all - verified against the published API reference and against
    `app/controllers/discussion_topics_controller.rb`'s `API_ALLOWED_TOPIC_FIELDS`
    (`title message discussion_type delayed_post_at lock_at podcast_enabled
    podcast_has_student_posts require_initial_post pinned todo_date
    group_category_id allow_rating only_graders_can_rate sort_by_rating
    anonymous_state is_anonymous_author`); there is no `notify_users`,
    `send_notification` or `notification_overrides` anywhere in Canvas's
    discussion controllers. Canvas notifies students from its own New
    Announcement notification at post time, per each student's preferences.
    Therefore, for a Canvas target the function returns `honored: false` and a
    note the run surfaces verbatim, once:
    `"Canvas has no per-announcement email setting - students are notified by their own Canvas notification preferences when each week posts."`
27. For every non-Canvas target the choice IS honored and is written into the
    package: into each week's zip front matter, into the zip README, and into
    the `.imscc` topic meta as an `<email_copy>` element on the app's own
    stamp sidecar (never inside a namespace we do not own). `honored: true`.
28. The input's `help` text states the rule BEFORE the run, not only in the
    report: which LMS honor it and that Canvas does not.
29. `emailCopy` never blocks, never throws, and never changes what is posted or
    packaged - only the recorded setting and the report line.

## AC5 - What is untouched

30. `generate-weekly-announcements` (`steps.weekly-announcements.ts`) and its
    preset bindings are UNCHANGED - the sibling-step separation entry 157 AC6
    and `steps.weekly-announcement-schedule.ts`'s header pin.
31. `createAnnouncement`, `createScheduledAnnouncementResilient`,
    `updateAnnouncementSchedule`, `getAnnouncementById` and `listAnnouncements`
    (`src/lib/canvas/announcements.ts`) are UNCHANGED. No new Canvas request
    parameter is added by this feature.
32. `scheduleWeeklyAnnouncementsAction` and `planWeeklyAnnouncementsAction`
    keep their exact current signatures. The package path does not call them.
33. `weekly_announcement_schedule` gains no column and no row on any packaged
    run. No migration.
34. `buildWeekCartridge` (`common-cartridge.ts:500`) is UNCHANGED.
35. `steps.lms-export.ts`'s `blackboard-export` step is UNCHANGED.

## AC6 - Step, preset and run-form surface

36. The step keeps its type `schedule-weekly-announcements-for-term`. It is
    already in `HEADLESS_SAFE_STEP_TYPES` and already registered under
    `announcements` in `step-categories.ts`; both stay as they are, and the
    headless count canary (`headless.test.ts:186`, currently 154) does NOT
    change, because no step type is added or removed.
37. Every new input is bound in `SCHEDULE_WEEKLY_ANNOUNCEMENTS`
    (`src/lib/workflows/presets/communication.ts:93`) to a runtime field of the
    SAME name. An unbound input is silently skipped by the run form, so an
    unbound new input would be indistinguishable from a deliberate choice.
    `deliver`'s and `emailCopy`'s gates read `values[fieldKey]` keyed by BINDING
    fieldKey (entry 239 check 18) - the same-name binding is what makes them
    fire.
38. The step file `steps.weekly-announcement-schedule.ts` stays free of any
    `@/lib/supabase/server`, `@/app/actions/shared` or `next/headers` import,
    even transitively. Its only action-layer import stays the literal string
    `"@/app/actions"`. Its own source-reading guard test
    (`steps.weekly-announcement-schedule.test.ts:31-36`) already asserts this
    and must keep passing. `cartridge-import.ts` and `common-cartridge.ts` are
    both already client-bundled by other registry steps, so importing them here
    is safe; `step-helpers-server.ts` is NOT and must not be imported.
39. Per-week drafting still issues exactly ONE server call. Next serializes
    client-dispatched Server Functions one at a time
    (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:206`),
    so a call per week would blow the 60-second unattended cap. The packaged
    path adds a new single action that takes the parsed modules and returns all
    drafts, mirroring `draftModuleAnnouncementsAction`'s one-call contract and
    its `DEFAULT_DRAFTING_BUDGET_MS = 25_000`.
40. Uploaded files cannot ride a SCHEDULED run - `ScheduleEditForm.tsx` warns on
    `f.type === "uploads" && f.required` over the RAW fields and cannot resolve
    a `requiredWhen` gate (entry 239 check 16 records this as latent). The new
    `cartridge` input is the FIRST conditionally-required `uploads` field in the
    codebase, so that latent under-report becomes REAL. This feature must fix
    it, not inherit it: the warning must also fire for an `uploads` field that
    is conditionally required.

## AC7 - Reporting

41. The report keeps its current per-week line format from
    `formatWeekOutcomeReport` for the live path.
42. A packaged run's report has its own per-week lines - week number, resolved
    post datetime, resolved title, and the drafting note - plus a header stating
    the source (live Canvas / uploaded package / message template), the
    delivery, the formats built, and the email-copy resolution note.
43. `scheduledCount` on a package-only run is 0 - nothing was scheduled. The
    summary must not imply otherwise. It reports weeks PACKAGED, in its own
    words.

## Non-goals (deliberate, not oversights)

- No Blackboard-proprietary export writer. Blackboard's own package format
  (`res*.dat`, `CONTENTHANDLER=resource/x-bb-announcement`, `ISEMAIL`) is READ
  by `cartridge-import-blackboard.ts` and is not written by anything in this
  codebase. Writing one is a separate feature with no fixtures to verify
  against. Non-Canvas targets get the standard CC discussion resource plus the
  app's own stamped metadata.
- No change to how Canvas notifies students. See AC4 item 26.
- No recurring/weekly-firing schedule. The mechanism note above stands.
- No import of the built package back into an LMS. The instructor imports it.
- No QTI, no rubrics, no assignment changes in the built package.

## Existing tests this change legitimately breaks

- `src/lib/workflows/preset-bindings.oracle.json` and
  `preset-shape.oracle.json` - `SCHEDULE_WEEKLY_ANNOUNCEMENTS` gains bindings
  and the step gains inputs. Regenerate deliberately and eyeball the diff; do
  not blanket-accept.
- `src/lib/workflow-run-form.contract.test.ts` and
  `presets.schedule-weekly-announcements.required-when.test.ts` - the preset's
  runtime-field set grows. Entry 239 check 19 warns that a changed field set can
  move an UNRELATED optional field in or out of the Setup tier; re-check the
  grouping assertions rather than only the new fields.
- `steps.weekly-announcement-schedule.test.ts` - input-list assertions.
- The headless count canary is NOT expected to change (AC6 item 36). If it does,
  something added a step type that was not asked for.

## Tests written BEFORE implementation

1. `draftFrom === ""` and `draftFrom === "template"` produce byte-identical
   `scheduleWeeklyAnnouncementsAction` arguments to today (AC2 item 12). This is
   the anti-regression oracle and it is a FROZEN LITERAL, not a comparison
   against the new code path.
2. A `draftFrom === "cartridge"` run makes ZERO calls to
   `scheduleWeeklyAnnouncementsAction`, `planWeeklyAnnouncementsAction` and every
   `weekly_announcement_schedule` writer, for `deliver` values `""`, `"package"`
   and `"both"` (AC2 item 13).
3. `selectModuleForWeek` over `CartridgeModule[]` returns the same week-to-module
   mapping as over live `ModuleContent[]` for a fixture with identical names.
4. An app-generated cartridge is refused with the AC1 item 5 message.
5. A zero-module package is refused with the AC1 item 6 message.
6. `resolveAnnouncementEmailCopy` returns `honored: false` plus the exact AC4
   item 26 note for `"canvas"`, and `honored: true` for every other LMS value,
   for all three choices.
7. The built `.imscc` parses back through `parseCartridgeBlob` without throwing,
   and the Canvas flavor's topic meta contains `<type>announcement</type>` and
   the expected `<delayed_post_at>` per week - asserted against a frozen
   expected-XML literal, not against the builder's own output.
8. The built zip contains exactly one file per in-session week plus a README,
   with the expected names.
9. Start-date/week-count precedence (AC1 item 10) across all combinations of
   tile / package / explicit override.
10. `parsePostTime` still degrades blank and malformed to 08:00 on both paths.
11. The step's source still contains no `@/lib/supabase/server`,
    `@/app/actions/shared` or `next/headers` import (extend the existing guard).
12. A sabotage check per test: each must be shown to FAIL when the behavior it
    pins is reverted.
