# Introduce-yourself discussion, generated from the Modules view

Chunk A of the "two module-anchored graded items" backlog group.

**The ask, verbatim (2026-08-23):** "i need a button on the modules view that
can create an 'introduce yourself and talk about your career as it relates to
this course' discussion board assignment (with the course information from the
row and other modules submitted as context) and assign it to the checkmarked
module, with an initial post deadline 11:59pm the thursday before the sunday of
that week, and then the two replies due Sunday at 11:59 of that week"

Chunk B (the current-events research assignment) is a SEPARATE chunk with its
own AC document and its own push. Nothing here may be written to serve it, but
everything here that is genuinely shared - the deadline module, the discussion
post kind - is built so B can reuse it without an edit.

---

## 0. Reuse survey (step 2 of docs/DEV_LOOP.md)

Vetted by reading, 2026-08-23. Every row below is EXISTING code. An
implementer that writes a second version of any of these has made a mistake.

| Need | Reuse | Where |
| --- | --- | --- |
| A button on the Modules view that generates from the selection | The `GENERATION_KIND_CONFIGS` registry - one button per kind is rendered automatically | `src/lib/lms-generation/kinds.ts:790`, rendered by `src/app/components/content-tab/modules/GenerateFromSelectionSection.tsx:134` |
| Registering a kind that has no `OUTPUT_FAMILIES` entry | `NON_FAMILY_KIND_IDS` - the precedent is `"scripts"` and `"resources"` | `src/lib/lms-generation/kinds.ts:154` |
| Declaring "this kind posts to Canvas and lands in a module" | `commitMode: "save-and-post"` + `GenerationCommitMeta` | `src/lib/lms-generation/kinds.ts:212,223` |
| Which module the post lands in, defaulted from the checkmarked module | `postTargetFromSelection` / `planModuleTarget` | `useLmsGeneration.ts:458`, `commit-plan.ts:83`; docs/objectives-post-target-from-selection-acceptance-criteria.md, REGRESSION entry 320 |
| The course row (name, code, startDate, description, topicOutline, courseKind, assignmentDueRule) | `resolveGenerationCourseRow` already runs for every `needsCourseRow` kind | `src/app/actions/lms-generation.ts:225`, used at `:349`; row shape `src/lib/supabase/courses.types.ts:64-123` |
| "the sunday of that week" / "the thursday before" | `dueDateForWeek(start, week, rule)` - Monday-anchored weeks, thu = Monday+3, sun = Monday+6, so both land in the SAME week and Thursday precedes Sunday | `src/lib/assignment-due-rule.ts:120` (`WEEKDAY_MONDAY_OFFSET` at `:99`) |
| "YYYY-MM-DD" course start date -> local `Date` | `parseCourseDate` | `src/lib/course-calendar-dates.ts:62` |
| Which week a module is | `extractModuleNumber(module.name)` - tolerant of "Module 07", "Week 7", "Module07", "Module 07: Loops" | `src/lib/workflows/module-value.ts:68` |
| Creating a graded Canvas discussion | `createGradable(courseUrl, "Discussion", fields)` - already POSTs `discussion_topics` with `assignment[points_possible]` / `assignment[due_at]` | `src/lib/canvas-modules/gradables.ts:84`, exposed as `createGradableAction` at `src/app/actions/canvas-files-bulk.ts:395` |
| Linking the created discussion into a module | `createModuleItemAction(courseUrl, moduleId, { type: "Discussion", contentId }, acronym)` | `src/app/actions/canvas-modules.ts:105` |
| The plan/execute split for a Canvas post | `planPostSteps` (pure) + `executePostPlanSteps` (injected `CanvasWriters`) | `src/lib/lms-generation/commit-plan.ts:208`, `src/lib/lms-generation/commit-execute.ts:115` |
| "other modules submitted as context" | `listCourseContentAction` is ALREADY called in `generateFromSelectionAction` whenever a whole module is selected - its `content.modules` carries every module's name | `src/app/actions/lms-generation.ts:381` |
| Selected-material grounding text | `gatherSelectionMaterials` | called at `src/app/actions/lms-generation.ts:392` |

**The single most important reuse fact:** a graded discussion is the FIRST
`CanvasPostKind` this codebase has that is not one of
`page | assignment | quiz | announcement`
(`src/lib/lms-generation/commit-plan.ts:111`). Adding it is the only genuinely
new plumbing in this chunk; everything else is a new row in an existing table.

---

## 1. The control

**AC1.** A new generation kind `introDiscussion` renders as one more button in
the EXISTING "Generate" row on the Modules view. No new bar, no new modal, no
new dropdown. Label: `Intro discussion`. This is the established one-click
precedent (`GenerateFromSelectionSection.tsx`'s own header comment) and it
costs the fewest clicks.

**AC2.** The button is offered on exactly the same terms as every other kind -
`offerableGenerationKinds` decides, and it is NOT special-cased. A module-only
selection (the "checkmarked module" case in the ask) already offers every
kind.

**AC3.** Pressing it generates, saves a `generated_artifacts` version, and
opens `GeneratedPreviewModal`. It does NOT write to Canvas. Posting is the
existing second, explicit step inside that modal. The preview is a confirm
step and is kept deliberately; it is one click, and it is what makes the two
computed deadlines visible before they are committed.

---

## 2. The kind registry entry

**AC4.** `src/lib/lms-generation/kinds.ts`:

```ts
export const introDiscussionKindConfig: GenerationKindConfig<IntroDiscussionGeneratedContent> = {
  id: "introDiscussion",
  artifactKind: "intro-discussion",   // permanent - the version-history query key
  label: "Intro discussion",
  needsCourseRow: true,
  commitMode: "save-and-post",
  commitMeta: {
    canvasObjectKind: "discussion",
    publishedOnCreation: false,
    placement: "module-item",
  },
  buildPrompt: (materialsText, meta) => ...,
  render: (generated) => generated.message,
  isEmpty: (generated) => !generated.title.trim() || !generated.message.trim(),
  emptyMessage: "The model returned no intro discussion for this selection.",
};
```

**AC5.** `"introDiscussion"` joins `NON_FAMILY_KIND_IDS`
(`kinds.ts:154`) - there is no `OUTPUT_FAMILIES` member for it and one must
NOT be invented, for the reason that constant's own doc comment already gives.
It joins `GENERATION_KIND_CONFIGS` (`kinds.ts:790`).

**AC6.** `publishedOnCreation: false`. Every non-announcement creation path in
this tab creates unpublished, and `createGradable` hardcodes
`published=false` today (`gradables.ts:117`). An instructor publishes when
ready.

**AC7 (generated content shape).**

```ts
export interface IntroDiscussionGeneratedContent {
  title: string;
  /** The discussion prompt as plain text/markdown. Rendered to HTML by the
   *  Canvas write layer, never by the generator. */
  message: string;
  /** Points for the graded discussion. Null when the model gives none. */
  pointsPossible: number | null;
}
```

`render` returns `message` only, so `kindSupportsTextEdit` stays true for this
kind (no `renderStructured`) and the instructor can hand-edit the prompt in
the preview modal before posting - the entry-312 editing path, inherited free.

---

## 3. The deadlines - the load-bearing part

**AC8.** New pure leaf module `src/lib/lms-generation/intro-discussion-deadlines.ts`.
It imports ONLY `@/lib/assignment-due-rule`, `@/lib/course-calendar-dates`
and `@/lib/workflows/module-value`. No `@/app/actions`, no Supabase, no
`Date.now()`, no randomness. Directly unit-testable with literal fixtures.

```ts
/** 11:59pm Thursday - the initial post. */
export const INITIAL_POST_RULE: AssignmentDueRule = { day: "thu", time: "23:59" };
/** 11:59pm Sunday of the SAME week - the two replies. */
export const REPLIES_RULE: AssignmentDueRule = { day: "sun", time: "23:59" };
/** How many replies the prompt asks for, and (when checkpoints are used) what
 *  Canvas is told to require. */
export const REQUIRED_REPLY_COUNT = 2;

export interface IntroDiscussionDeadlines {
  /** The week number the deadlines were computed for. */
  week: number;
  /** Local Date, Thursday 23:59 of `week`. */
  initialPostAt: Date;
  /** Local Date, Sunday 23:59 of the SAME `week`. Always strictly after
   *  `initialPostAt` - pinned by test. */
  repliesDueAt: Date;
}

/** Null when the course has no usable start date, or when `moduleName`
 *  carries no derivable week/module number. Null is a real answer, never a
 *  thrown error and never a silently-wrong date: the caller posts the
 *  discussion with NO dates and says so in the outcome note (AC13). */
export function planIntroDiscussionDeadlines(args: {
  startDate: string | null | undefined;
  moduleName: string;
}): IntroDiscussionDeadlines | null;
```

**AC9 (the arithmetic, and why it is not re-derived).** `dueDateForWeek`
already anchors week 1 to the week CONTAINING the course start date, with weeks
Monday-anchored (`assignment-due-rule.ts:120-146`). Under that anchoring
`thu` is Monday+3 and `sun` is Monday+6, so for any week N:

- `initialPostAt = dueDateForWeek(start, N, INITIAL_POST_RULE)`
- `repliesDueAt  = dueDateForWeek(start, N, REPLIES_RULE)`

and `initialPostAt < repliesDueAt` by exactly 3 days, in the same calendar
week - which is precisely "the thursday before the sunday of that week". No
new date arithmetic is written in this chunk. An implementer that writes
`setDate(+3)` anywhere has violated this AC.

**AC10 (tests that must exist, and must be able to fail).**
1. Thursday is strictly 3 days before Sunday, for weeks 1, 2, 5 and 14.
2. `initialPostAt` really is a Thursday (`getDay() === 4`) and `repliesDueAt`
   really is a Sunday (`getDay() === 0`), for a course starting on EACH of the
   seven weekdays. This is the test that catches a week-shift, and it must be
   written against literal expected dates, not against a second copy of the
   formula (docs/DEV_LOOP.md step 9, "frozen literal oracle").
3. Both times are 23:59:00.000 local.
4. Week comes from the module NAME, not its position: a module named
   "Module 07: Loops" sitting third in the list yields week 7.
5. Null for a blank/malformed start date; null for a module name with no
   number ("Course Resources").

---

## 4. Posting a discussion to Canvas

**AC11 (new post kind).** `src/lib/lms-generation/commit-plan.ts`:

- `CanvasPostKind` gains `"discussion"`.
- `PostContent` gains
  `{ kind: "discussion"; fields: NewGradedDiscussion }`.
- `PostPlanStep` gains
  `{ step: "create-discussion"; fields: NewGradedDiscussion }` and
  `{ step: "link-discussion"; title: string }`.
- `planPostSteps` case `"discussion"` returns EXACTLY
  `[{ step: "create-discussion", ... }, { step: "link-discussion", title }]`.
  Two steps, unlike an assignment's one: `createGradable` creates the topic
  but does NOT link it into a module (contrast
  `createCourseAssignmentAction`, which does both in one call -
  `canvas-modules.ts:121-136`). A discussion therefore needs the separate
  `createModuleItemAction` link step that an assignment does not.
- A discussion is NEVER reused by title. It follows the quiz rule, not the
  page rule - see `ExistingModuleContent`'s own doc comment for why inventing
  a dedupe rule here would be wrong.
- `create-discussion` is content-defining (`isContentStep`); `link-discussion`
  is a link step (`isLinkStep`). `describeContent` gains its case.

**AC11b (a Canvas GraphQL client).** New leaf
`src/lib/canvas-modules/graphql.ts`, exporting one minimal helper that POSTs
to `<baseUrl>/api/graphql` with the resolved course token. It is a direct
structural copy of the existing, proven `ghGraphql`
(`src/lib/github.pulls.ts:8-27`) - same shape, same error handling - with ONE
required difference: it must return the top-level `errors` array to its
caller rather than collapsing it into a thrown `Error` string, because AC14g
branches on a specific top-level error message. Throwing a joined string and
re-parsing it out is not acceptable; the reason must survive as data.

**AC12 (the write shape).** `src/lib/canvas-modules/types.ts` gains:

```ts
export interface NewGradedDiscussion {
  title: string;
  /** Plain text; the Canvas layer converts to HTML. */
  message: string;
  pointsPossible: number | null;
  /** ISO datetime or "" - the initial-post deadline. */
  dueAt: string;
  /** ISO datetime or "" - when the thread closes. */
  lockAt: string;
  published: boolean;
  /** How many replies students owe. Sent only when Canvas checkpoints are in
   *  use; see AC14. */
  requiredReplyCount?: number;
}
```

**AC13 (SUPERSEDED - kept as a record of a wrong turn).** The first draft of
this AC set `due_at` = Sunday and put the Thursday deadline in prose only,
reasoning that `due_at` = Thursday "would flag every on-time reply as late."
**That reasoning is false**, disproved by reading Canvas's source during step
3 - see AC13b. It is recorded here rather than deleted so that step 10 does
not re-derive it and reach the same wrong conclusion.

**AC13b (verified Canvas lateness behaviour, checked 2026-08-23).** For a
classic, non-checkpointed graded discussion, Canvas stamps the submission with
the **earliest** entry the student made, not the latest.
`DiscussionTopic#ensure_submission` (`discussion_topic.rb`, canvas-lms master):

```ruby
submitted_at = all_entries_for_user.minimum(:created_at)
```

and `DiscussionEntry#update_topic_submission` agrees
(`entries.order(:created_at).limit(1).pick(:created_at)`). It is `minimum`,
not `maximum`. A student who posts Thursday 22:00 and replies twice Sunday
21:00 is stamped Thursday 22:00 and is **on time**. Replies never move the
timestamp forward.

Consequences, both of which drive the design:
1. `due_at` = Thursday is CORRECT for the classic path, not harmful. The one
   lateness verdict Canvas computes is governed entirely by the first post,
   which is exactly what the Thursday deadline is for.
2. The classic path can never express the replies deadline as a graded
   deadline at all. One submission, one verdict. A student who posts nothing
   until Friday gets a single LATE flag covering everything, with no way to
   tell "late initial post" from "late replies".

**AC14 (checkpoints are the PRIMARY path - verified, not speculative).**
Canvas Discussion Checkpoints give a graded discussion two genuinely separate
due dates, two separate submissions, two independent late verdicts, and a
Canvas-enforced required reply count. That is precisely this feature's ask, so
it is the primary implementation, not an optional upgrade.

Verified facts, all checked 2026-08-23 against
`github.com/instructure/canvas-lms@master` (the code that runs Canvas) because
the public REST docs are silent on all of it:

- **Checkpoints are GraphQL-only.** `config/routes.rb` contains zero
  occurrences of "checkpoint", and
  `discussion_topics_controller.rb`'s `API_ALLOWED_TOPIC_FIELDS` whitelist
  contains no checkpoint field. There is no REST route. **An implementer that
  adds a `checkpoints[]` form param to the REST call has built nothing.**
- **Endpoint:** `POST <baseUrl>/api/graphql`, `Authorization: Bearer <token>`,
  `Content-Type: application/json`, body `{"query": ..., "variables": ...}`.
- **Mutation:** `createDiscussionTopic(input: CreateDiscussionTopicInput!)`.
- **Field names are camelCase**, not the snake_case of the REST API:
  `checkpointLabel`, `pointsPossible`, `repliesRequired`, `forCheckpoints`,
  `dueAt`, `contextId`, `contextType`. `reply_to_entry_required_count` is the
  DATABASE COLUMN `repliesRequired` writes to, and is readable back over REST
  (AC14g) - it is NOT an input parameter name.
- `checkpointLabel` is one of exactly `reply_to_topic` / `reply_to_entry`.
- Each `dates[]` entry MUST carry `type: "everyone"` (or `"override"`), or the
  service raises `DateTypeRequiredError`.
- `repliesRequired` is honoured ONLY on the `reply_to_entry` checkpoint, and
  is validated `0 <= n <= 10`.

**AC14e (the trap that must be pinned by a test).** The creator service is
gated on `input[:checkpoints]&.count == DiscussionTopic::REQUIRED_CHECKPOINT_COUNT`,
where `REQUIRED_CHECKPOINT_COUNT = 2`. Sending ONE checkpoint **silently
creates an ordinary graded discussion with no error at all**. Exactly two
checkpoints are sent, always, and a unit test asserts the built mutation
variables contain exactly two - this is the single most likely way for this
feature to appear to work while doing the wrong thing.

Equally mandatory, from the same service:
- `assignment.forCheckpoints: true` MUST be sent, or the mutation errors with
  "If checkpoints are defined, forCheckpoints: true must be provided...".
- When `forCheckpoints` is true, `assignment.pointsPossible` / `dueAt` /
  `lockAt` / `unlockAt` MUST NOT be sent. Canvas sums the checkpoints' points
  itself.
- `assignment.courseId` must equal `contextId`.

**AC14f (the exact mutation this chunk sends).** Frozen here so the
implementer does not re-derive it:

```
mutation CreateCheckpointedDiscussion($input: CreateDiscussionTopicInput!) {
  createDiscussionTopic(input: $input) {
    discussionTopic { _id title assignment { _id hasSubAssignments } }
    errors { attribute message }
  }
}
```

with variables:

```
input: {
  contextId: "<numeric course id>",       // legacy numeric id is accepted
  contextType: "Course",
  title, message, published: false,
  discussionType: "threaded",
  requireInitialPost: true,               // AC19 - students write before reading
  assignment: { courseId: "<same id>", name: <title>, forCheckpoints: true, gradingType: "points" },
  checkpoints: [
    { checkpointLabel: "reply_to_topic", pointsPossible: P1,
      dates: [{ type: "everyone", dueAt: <initialPostAt ISO8601 with offset> }] },
    { checkpointLabel: "reply_to_entry", pointsPossible: P2, repliesRequired: 2,
      dates: [{ type: "everyone", dueAt: <repliesDueAt ISO8601 with offset> }] }
  ]
}
```

**AC14g (availability detection, and never a silent fallback).** The gating
flag is `discussion_checkpoints`, declared `state: allowed` (off by default)
and `applies_to: Account` in `config/feature_flags/vice_release_flags.yml`. It
is an ACCOUNT flag, so:

- **Do NOT probe `GET /api/v1/courses/:id/features/enabled`.** `Feature.applicable_features`
  builds a Course's applicable types as `["Course"]` only, so an
  account-scoped flag is simply ABSENT there - indistinguishable from "off".
  That is a false-negative trap and this AC forbids it.
- The account-scoped endpoint that would report it needs admin permission a
  teacher token does not have.
- **Therefore: attempt the mutation and branch on the failure.** When
  unavailable, Canvas returns HTTP 200 with a TOP-LEVEL `errors` array (not
  `data.createDiscussionTopic.errors`) whose message is
  `"discussion_checkpoints feature flag must be enabled"`. Match that.
- On that specific error, and ONLY that error, fall back to AC14h. Any other
  GraphQL error is a real failure and is reported as one, with its message
  preserved. Collapsing the two would hide a genuine defect behind a
  plausible-looking fallback.
- **The fallback is never silent.** The post outcome note states which path
  ran, and when the classic path ran it says plainly that only the initial-post
  deadline is enforced by Canvas and the replies deadline is enforced by the
  thread closing. The two-deadline promise is not kept by the classic path in
  any form, and the instructor must be told.
- Post-create verification: `GET /api/v1/courses/:id/discussion_topics/:topic_id`
  returns `is_checkpointed: true` and `reply_to_entry_required_count: 2` for a
  checkpointed topic (`lib/api/v1/discussion_topics.rb`). Both fields are
  ABSENT, not false/0, on a non-checkpointed topic - so presence is the test.

**AC14h (the classic fallback, corrected by AC13b).** `POST /api/v1/courses/:id/discussion_topics`:

- `assignment[due_at]` = **Thursday 23:59** (`initialPostAt`). Correct per
  AC13b: the single lateness verdict is governed by the first post.
- `assignment[lock_at]` = **Sunday 23:59** (`repliesDueAt`). The thread closes
  when the replies are due; students can still READ it (`can_view: true`) but
  cannot post.
- **Send `assignment[lock_at]`, never both it and top-level `lock_at`.** The
  controller's `prefer_assignment_availability_dates` nulls the topic's own
  `lock_at` whenever `assignment[lock_at]` is present. Sending both is how you
  get a discussion that locks at a date you did not choose.
- `title` / `message` / `published` / `discussion_type` / `require_initial_post`
  are TOP-LEVEL topic params; `points_possible` / `due_at` / `lock_at` are
  NESTED under `assignment[...]`. There is no top-level `points_possible` or
  `due_at` on a discussion topic.
- Both deadlines still appear in the prompt body, as they do on the
  checkpoints path.

**AC14i (timezone - a real defect class, not a nicety).** An ISO8601 timestamp
with no offset is read by Canvas as **UTC**. `dueDateForWeek` returns a LOCAL
`Date`, and `.toISOString()` converts using the running process's timezone.
This app's server runs on Vercel in UTC, so computing the deadline
server-side and calling `.toISOString()` would turn "11:59pm" into 11:59pm UTC
- 7:59pm for an instructor on US Eastern. There is no course-timezone column
in this codebase to correct with.

The existing convention already handles this and must be followed, not
re-invented: attended work computes deadlines IN THE BROWSER, where the
instructor's local timezone is the course's working timezone
(`steps.assignments-creation.ts:180` does exactly `weekDeadline(...).toISOString()`
client-side). Therefore:

- The **calendar-date DISPLAY text** interpolated into the prompt (AC19/AC20)
  is computed SERVER-side. Safe: the calendar date and the "11:59pm" wording
  are pure local arithmetic and identical in any process timezone.
- The **absolute instants sent to Canvas** are computed CLIENT-side, from the
  same pure function in AC8, and `.toISOString()` is called in the browser.
- To let the client do that, the generate response carries the course's
  `startDate` and the resolved target module's name back to the client. The
  server already has the course row (`resolveGenerationCourseRow`); no extra
  round trip.
- A test pins that the two deadline ISO strings differ by exactly 3 days and
  that neither is derived from `Date.now()`.

**AC14b (where `PostContent` is actually built - AC gap found 2026-08-23).**
The AC's first draft named `commit-plan.ts` as the place a post's content is
assembled. That is wrong: `buildPostContentForKind`
(`src/lib/lms-generation/post-content.ts:73-94`) is the sole producer of
`PostContent`, its current signature is
`(canvasObjectKind, title, artifact, publishedOnCreation)`, and its assignment
arm HARDCODES `dueAt: ""` (`post-content.ts:91`) - pinned by
`post-content.test.ts:53` ("always online_text_entry with no due date or
points"). This chunk therefore MUST also:

- add a `"discussion"` arm to `buildPostContentForKind`;
- widen its signature with the computed deadlines, as an OPTIONAL parameter
  so every existing kind's emitted `PostContent` stays byte-identical and
  `post-content.test.ts:53` keeps passing unchanged;
- leave the assignment arm's `dueAt: ""` exactly as it is. Chunk B changes
  that line; this chunk must not, or the two chunks collide in one file.

**AC14c (when the deadlines are computed, and against which module).** The
deadlines depend on the module NAME, and the post target is chosen in the
preview modal AFTER generation. So they are computed TWICE, from the one pure
function in AC8, never from two copies of the rule:

- at GENERATE time, SERVER-side, from the selected module's name, to
  interpolate the display dates into the prompt text (AC19/AC20);
- at POST time, CLIENT-side, from the RESOLVED target module's name, to
  produce the absolute instants sent to Canvas. Client-side is mandatory, not
  a preference - see AC14i for why computing them on the server silently
  shifts every deadline by the server's UTC offset.

These agree in the normal case, because `defaultPostModuleChoiceFrom`
(`lmsGenerationModuleTarget.ts:119`) already defaults the target to the
selected module whenever the selection is one location. If the instructor
retargets to a different module, the Canvas dates follow the NEW module while
the already-generated prompt text keeps the old ones. That divergence is
permitted (the text is hand-editable in the preview - entry 312) but it must
be VISIBLE: the post outcome note states the two dates actually written to
Canvas, in full, every time.

**AC14d (`TITLED_GENERIC_KINDS`).** `src/app/actions/lms-generation-refine.ts`
carries a hand-maintained list of kinds that derive their own title at
generate time. Omitting a new kind from it was a REAL SHIPPED DEFECT when the
`resources` kind was added. `introDiscussion` derives its title from the model
(AC7), so it joins that list, and the hand-written canary in
`lms-generation-refine.test.ts` is bumped in the SAME commit.

**AC15 (executor).** `commit-execute.ts` gains a `create-discussion` case
calling a new `CanvasWriters.createDiscussion` method, and a `link-discussion`
case calling the EXISTING `createModuleItemAction` writer with
`{ type: "Discussion", contentId }`. `LIVE_CANVAS_WRITERS`
(`src/app/actions/lms-generation.ts`) supplies the real
`createGradableAction(courseUrl, "Discussion", fields, acronym)`. The
executor stays free of any `@/app/actions` import.

**AC16 (`createGradable` gains lock/unlock).**
`src/lib/canvas-modules/gradables.ts`'s `createGradable` currently sends no
`lock_at`. Its `fields` parameter gains optional `lockAt` and
`unlockAt`, sent as `assignment[lock_at]` / `assignment[unlock_at]` for the
Assignment/Discussion branches. Existing callers pass neither and their emitted
params must be BYTE-IDENTICAL to today - pinned by a test that captures the
`URLSearchParams` for a no-lockAt call and compares against a frozen literal.

---

## 5. The generated prompt

**AC17.** New server action file
`src/app/actions/intro-discussion-generator.ts`, exporting ONLY async
functions (repo invariant). It follows the shape of the most recent sibling
generator (`src/app/actions/learning-resources-generator.ts`).

**AC18 (context sent to the model).** All of:
- Course row: `name`, `courseCode`, `description`, `topicOutline`,
  `courseKind`, `institution`. ("the course information from the row")
- The TARGET module's name.
- **The names of every OTHER module in the course, in order.** ("other
  modules submitted as context") These come from the `content.modules` the
  runner already fetched - no second Canvas call.
- The selected materials text `gatherSelectionMaterials` already produced.

**AC19 (what the prompt must produce).** A discussion prompt that:
- welcomes students and asks them to introduce themselves;
- asks specifically about their **career**, and how it relates to **this
  course** - grounded in the actual course topics from AC18, not generic;
- states the initial-post requirement and the **two replies** requirement
  explicitly;
- states both deadlines in plain language, with the Thursday date for the
  initial post and the Sunday date for the replies;
- gives a length expectation for the initial post and for each reply.

**AC19b (what the prompt asks for, from step-3 pedagogy research).** The
introduction asks for four specific things, so that no two posts read alike:
name and program or role; a concrete career anchor (current job, target job,
or a role they are curious about); one explicit link between that career and
this course's subject matter - "name one skill from this course you expect to
use, and where"; and one small human detail that gives classmates something to
reply to.

- Give a RANGE (150-250 words), not a minimum. A floor produces padding; a
  target produces aim.
- Word the two obligations as two dated requirements, not one sentence with
  two dates in it: "Post your introduction by [Thursday date] 11:59pm. Then
  reply substantively to at least two classmates by [Sunday date] 11:59pm."
- Define "substantive" concretely - ask a follow-up question or name something
  in common - so "great post!" is visibly not the assignment.
- State what each part is worth, and that the two parts are graded separately.
  On the checkpoints path that is literally true in Canvas; on the classic
  fallback it is the instructor's own rubric, and the prompt wording is the
  same either way.

**AC19c (`require_initial_post`).** Both paths send it true
(`requireInitialPost` on GraphQL, `require_initial_post` on REST). Students
write their own answer before seeing the room, which materially reduces
convergent, copycat introductions. This is a deliberate default, and the
regression entry records it as one.

**AC20.** Deadlines are NOT invented by the model. The two dates are computed
by AC8 and interpolated into the prompt text by code. A model asked to do
date arithmetic will get it wrong, and this is exactly the class of error the
loop's Limits sections keep recording.

**AC21 (no start date).** When AC8 returns null, the prompt uses the phrases
"by 11:59pm Thursday of this module's week" and "by 11:59pm Sunday of this
module's week" instead of concrete dates, the Canvas post carries no due or
lock date, and the post outcome note says plainly that no dates were set
because the course has no start date (or the module name carries no week
number) - the REASON must survive, not collapse into a generic message
(docs/DEV_LOOP.md step 8).

---

## 5b. ARCHITECTURE AND AC AMENDMENTS (step 4 output, reconciled 2026-08-23)

This section is the FINAL contract. Where it disagrees with anything above,
this section wins. It merges the step-4 architect's findings with the step-3
Canvas research, which the architect did not have.

### D1. The architect's nine defects, resolved

| Ref | Defect | Resolution |
| --- | --- | --- |
| W1 | AC7's `pointsPossible` can never reach Canvas - `saveGeneratedArtifactVersion` persists only `title`/`text`/`structured`, and adding `renderStructured` would kill hand-editing. A null value makes `createGradable` omit `assignment[...]` entirely, producing an UNGRADED discussion - contradicting "discussion board assignment" in the ask. | **ACCEPTED.** Delete `pointsPossible` from `IntroDiscussionGeneratedContent`. Points become the constant `INTRO_DISCUSSION_POINTS = 20` in the AC8 leaf, split `10 / 10` across the two checkpoints on the checkpoints path and sent as a single `20` on the classic path. |
| W2 | AC12 said `message` is plain text; `descriptionToHtml` only escapes and breaks lines, so markdown would render literally. | **ACCEPTED.** `message` is HTML from `markdownLiteToHtml(artifact.text)`, produced in `post-content.ts` exactly like the page and assignment arms. |
| W3 | `NewGradedDiscussion.published` would be silently discarded. | **MOOT** under D2 - the new writer owns `published` directly. |
| W4 | AC13 and AC16 named two different Canvas fields as `lock_at`. | **RESOLVED BY RESEARCH, not by choice.** Send `assignment[lock_at]`. Never both it and top-level `lock_at`: `prefer_assignment_availability_dates` nulls the topic's own `lock_at` whenever `assignment[lock_at]` is present. See AC14h. |
| W5 | AC18's "no second Canvas call" is unsatisfiable for an items-only selection - `listCourseContentAction` only runs when a whole module is selected. | **ACCEPTED.** One kind-scoped fetch is permitted for `introDiscussion`, and it DEGRADES TO AN EMPTY MODULE LIST on error. Module names are context; they never fail the generation. |
| W6 | AC14c/AC21 require an outcome channel that does not exist - `PostGeneratedArtifactSuccess` carries only `summary`. | **ACCEPTED.** `notes?: string[]` on the success shape, a second optional parameter on `postResultNote`, and both `lmsGenerationNotes.ts` and `useLmsGeneration.ts` enter the file budget. |
| W7 | `CanvasPostKind` is dead code; the two unions that actually gate the change are `GenerationCommitMeta.canvasObjectKind` and `buildPostContentForKind`'s first parameter. | **ACCEPTED.** All three named. `post-content.ts` imports and uses `CanvasPostKind`, killing one duplicate permanently. `kinds.ts` keeps its literal (its leaf rule is worth keeping) with a type-level assertion in `kinds.test.ts` pinning the agreement. |
| W8 | `buildPostContentForKind` is called before the module is resolved, so AC14c's "deadlines from the resolved target module" has nothing to pass. | **SUPERSEDED BY D3** - the reorder is no longer needed at all. |
| W9 | No line budget; `lms-generation.test.ts` (1112) and `lms-generation-refine.test.ts` (1068) are already over the 1000 ceiling. | **ACCEPTED.** New action tests go in NEW files. The two over-ceiling test files may grow by canary lines only. `lms-generation.ts` (891) must land under 1000 - measure with `@(Get-Content path).Count` and REPORT rather than compressing comments to squeeze under. |
| W10 | Canvas datetime format unspecified; `toISOString()` on a server-computed Date encodes 23:59 UTC. | **DIAGNOSIS ACCEPTED, FIX REJECTED.** See D3 - the architect proposed a wall-clock string with no offset, but Canvas reads an unqualified timestamp as UTC (step-3 research), so that has the identical bug. |

### D2. The Canvas write layer is a NEW dedicated module, not a widened `createGradable`

AC16 (widen `createGradable`) is **WITHDRAWN**. It was written before the
checkpoints research. `createGradable` is a shared helper behind the "change
type" flow, and this feature needs four things it does not have
(`lock_at`, `published`, `require_initial_post`, `discussion_type`) plus an
entirely separate GraphQL path. Widening it would pollute a shared helper and
put the checkpoints branch in the wrong module.

Instead, one new module owns the complete graded-discussion write, both paths,
and decides between them:

```ts
// src/lib/canvas-modules/graded-discussion.ts
export type GradedDiscussionPath = "checkpoints" | "classic";

export interface NewGradedDiscussion {
  title: string;
  /** HTML, already through markdownLiteToHtml. */
  message: string;
  pointsPossible: number;
  /** ISO8601 WITH OFFSET, or "" - the initial-post deadline (Thursday). */
  initialPostAt: string;
  /** ISO8601 WITH OFFSET, or "" - the replies deadline (Sunday). */
  repliesDueAt: string;
  requiredReplyCount: number;
  published: boolean;
}

export interface GradedDiscussionResult {
  id: number;
  /** Which path actually ran. Surfaced to the instructor - never swallowed. */
  path: GradedDiscussionPath;
  /** Present only on "classic": why checkpoints were unavailable. */
  fallbackReason?: string;
}

export async function createGradedDiscussion(
  courseUrl: string,
  fields: NewGradedDiscussion,
  code?: string
): Promise<GradedDiscussionResult>;
```

Behaviour: attempt the AC14f GraphQL mutation. On a top-level error matching
`discussion_checkpoints feature flag must be enabled`, and ONLY that, fall
back to the AC14h classic REST create and set `path: "classic"` with the
reason. Any other GraphQL error throws with its message intact - a real
failure must never be disguised as a fallback.

`createGradable` is **not touched by this chunk.** Its `published=false`
hardcode, its missing `lock_at`, and the W3 dead-field problem stay exactly as
they are; they belong to whoever next needs them.

### D3. Deadlines are computed CLIENT-side, which also deletes the F3 problem

The architect's F3 (content is built before the module is resolved) and its
proposed reorder of `postGeneratedArtifactAction` are **both unnecessary**,
because the client already knows the target module: `postModuleChoice` holds
the module id and the loaded module tree holds its name. So:

- `useLmsGeneration.post()` computes the deadlines with the AC8 pure leaf,
  from the target module's name and the course `startDate`, IN THE BROWSER.
- `.toISOString()` is called there, in the instructor's timezone, producing
  the correct absolute instant. This is the existing convention
  (`steps.assignments-creation.ts:180`), not a new one.
- The wall-clock-string alternative the architect proposed (W10's fix) is
  REJECTED: Canvas reads an unqualified timestamp as UTC, so it has exactly
  the bug it was meant to avoid.
- `PostGeneratedArtifactInput` gains
  `discussionDeadlines?: { initialPostAt: string; repliesDueAt: string; note: string }`,
  supplied by the client.
- `buildPostContentForKind` keeps its existing call site at
  `lms-generation.ts:776` and simply gains the optional fifth argument. **No
  reorder.**
- The generate response carries the course `startDate` back to the client so
  it can compute at all.

### D4. The final split - eight assignments, two waves

No file appears in two assignments. Every agent gets its allow-list and the
sibling list. Never `git stash`. Code against the contracts above, not against
files that may not be on disk yet; if `tsc` reports a sibling's module
missing, REPORT it, never create it or inline a copy.

**Wave 1 - seven concurrent agents:**

| # | Owns | Contract |
| --- | --- | --- |
| A1 | `src/lib/lms-generation/intro-discussion-deadlines.ts` + test | AC8, plus `INTRO_DISCUSSION_POINTS`, `describeMissingDeadlines`, `formatDeadlineForPrompt`, and the `NO_DATE_*` constants |
| A2 | `src/lib/lms-generation/kinds.ts` + `kinds.test.ts` | AC4-AC7 as amended by W1; five canary bumps; the `CanvasPostKind` type-level assertion |
| A3 | `commit-plan.ts`, `commit-execute.ts`, `post-content.ts` + their three tests | AC11/AC14b/AC15 as amended by W2/W7/D3; all four of `planPostSteps`/`isContentStep`/`isLinkStep`/`describeContent` |
| A4 | `src/lib/canvas-modules/graphql.ts`, `src/lib/canvas-modules/graded-discussion.ts`, `src/app/actions/canvas-discussions.ts` + tests | AC11b, AC14/AC14e-h, D2. The whole write layer, both paths |
| A5 | `src/app/actions/intro-discussion-generator.ts` + test | AC17-AC19c. Copy `learning-resources-generator.ts`'s shape exactly, including its ABSENCE of a `"use server"` directive |
| A6 | `lms-generation-refine.ts` + its test | AC14d - one array element and its canary. Do not grow the file further; it is already over ceiling |
| A7 | `lmsGenerationNotes.ts`, `useLmsGeneration.ts` + its test | W6's notes channel, D3's client-side deadline computation, and the `kindOffersPost` canary at `useLmsGeneration.test.ts:431-448` |

**Wave 2 - one agent:**

| # | Owns | Contract |
| --- | --- | --- |
| A8 | `src/app/actions/lms-generation.ts`, plus NEW `lms-generation.intro-discussion.test.ts` | The `introDiscussion` case, the W5 module-name hoist, the `LIVE_CANVAS_WRITERS.createDiscussion` wiring to A4's action, `notes` on the success shape, `discussionDeadlines` on the input shape, and the 1000-line budget |

**Files nobody touches, confirmed by the reachability trace:**
`lmsGenerationKindHelpers.ts`, `GeneratedPreviewModal.tsx`, `module-items.ts`,
`gradables.ts`, `canvas-files-bulk.ts`. The button renders from the registry
alone.

**AMENDED 2026-08-23, after the step-10 review.** The list above originally
also named `GenerateFromSelectionSection.tsx` and `ModulesView.tsx`. That was
correct for the feature as first specified and became WRONG when H1 (the
non-transactional Canvas mutation) forced checkpoints behind an explicit
opt-in: an opt-in needs a control, the control lives in the Generate row, and
its props must be threaded from `ModulesView`. Both files are in scope, and
the confirmation review verified the threading is compile-enforced rather than
silently optional. Recorded rather than quietly deleted, because "the AC said
nobody touches this file" is exactly the sentence a future reviewer would
otherwise use to call the change scope creep.

**Two modules exist that no D4 assignment named**, both traceable to the W9
line budget rather than to new scope, and both recorded here so they are not
mistaken for drift:
- `src/app/actions/lms-generation-writers.ts` - `LIVE_FETCHERS` /
  `LIVE_CANVAS_WRITERS`, moved verbatim out of `lms-generation.ts` to keep
  that file under 1000 lines. Deliberately NOT a `"use server"` file.
- `src/lib/lms-generation/post-outcome-notes.ts`,
  `src/app/components/content-tab/modules/lmsGenerationDiscussion.ts` - pure
  helpers extracted for the same reason.

**AC20b (added after the fact, to cover behaviour that shipped without an AC
line).** `stripRestatedDeadlineLines`
(`src/app/actions/intro-discussion-generator.ts`) removes any line of MODEL
prose that echoes one of the two deadline strings verbatim, before the
code-authored deadline block is appended. AC19b/AC20 required the dates to be
code-computed and code-stated but did not describe a de-duplication backstop,
so a compliant model would have stated each deadline twice. The strip is
reliable rather than hopeful precisely because both deadline strings are
handed to the model as literal context, so any echo contains the exact
substring. Prompt instruction alone would not have been testable.

### D5. The seven silent-failure hops

A green `tsc` does not catch any of these. Each needs a test that can fail.

1. `isContentStep`/`isLinkStep`/`describeContent` missing the new steps - a
   fully successful post reports **"Nothing was posted."**
2. `executePostPlanSteps` missing either case - the switch has no `default`
   and no return-type pressure, so the step is skipped, no outcome is
   recorded, and nothing is created.
3. Sending ONE checkpoint instead of two - Canvas **silently** creates an
   ordinary graded discussion (AC14e).
4. `TITLED_GENERIC_KINDS` missing the id - a refined version posts under the
   generic label. This exact defect shipped with the `resources` kind.
5. Deadlines computed server-side - every 11:59pm silently becomes the
   server's UTC offset (D3).
6. A fallback to the classic path that is not surfaced - the instructor
   believes two deadlines are enforced when one is (AC14g).
7. The AC21 reason collapsing into a generic message - "no course start date"
   and "module name carries no week number" need different fixes.

### D6. Canaries - corrected against the architect's reading

The section-7 table above is INCOMPLETE. Five more must be bumped:
`kinds.test.ts:104-114` (per-kind config identity), `:159-165`
(per-kind `canvasObjectKind`), `:167-172` (`publishedOnCreation: false` list),
`:178-183` (`placement: "module-item"` list), and
`useLmsGeneration.test.ts:431-448` (`kindOffersPost` per-kind list).

Conversely, these are DERIVED and must NOT be hand-edited - they self-adapt,
and editing one hides the very drift it exists to catch:
`kinds.test.ts:57-66`, `:71-89`, `:94-100`, `useLmsGeneration.test.ts:79-89`.

`HEADLESS_SAFE_STEP_TYPES.size` is confirmed NOT moved - this chunk registers
no workflow step type. Say so explicitly in the REGRESSION entry.

Must stay green UNCHANGED, as proof the change was additive:
`post-content.test.ts:53-67`, `kinds.test.ts:193-196` (`aloudIds` stays
`["scripts"]`), and the existing plan/execute assertions in
`commit-plan.test.ts` and `commit-execute.test.ts`.

## 6. Non-goals

- No per-module fan-out. This chunk generates ONE intro discussion for the
  selection and posts it into ONE module target. An intro discussion is a
  once-per-course item; fanning it out across every checkmarked module would
  create duplicates nobody asked for. (Chunk B, the current-events assignment,
  is the one that is explicitly per-module - "puts them in the selected
  modules" - and that fan-out is decided in ITS AC, not here.)
- No rubric creation.
- No group-discussion configuration.
- No change to any existing kind's behaviour. Every existing kind's
  `commitMode`, `commitMeta` and emitted Canvas params stay byte-identical.

---

## 7. Gates

From PowerShell (Bash is unreliable on this machine):

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build      # compile line only; the prerender tail fails locally without Supabase keys
```

Repo invariants that apply to this chunk specifically:
- No emojis. `src/lib/no-emojis.test.ts` owns the rule; never hand-roll a scan.
- Server-action files export only async functions - a type re-export from a
  `"use server"` file is caught ONLY by `next build`.
- Count file lines with `@(Get-Content path).Count`. 1000-line ceiling on every
  touched file.
- Any count canary that moves (a kind count, a post-kind count) is bumped in
  the SAME commit.

**The canaries this chunk moves**, found by reading, 2026-08-23. Every one is
bumped in the same commit as the change that moves it:

| File | What it pins |
| --- | --- |
| `src/lib/lms-generation/kinds.test.ts:27-56` | the `GENERATION_KIND_IDS` list |
| `src/lib/lms-generation/kinds.test.ts:57-66` | `artifactKind` uniqueness |
| `src/lib/lms-generation/kinds.test.ts:71-90` | every id is in `OUTPUT_FAMILIES` or `NON_FAMILY_KIND_IDS`, and the two are disjoint |
| `src/lib/lms-generation/kinds.test.ts:95-99` | `GENERATION_KIND_CONFIGS` keys equal `GENERATION_KIND_IDS` |
| `src/app/actions/lms-generation-refine.test.ts` | the hand-written `TITLED_GENERIC_KINDS` list (AC14d) |
| `src/app/components/content-tab/modules/useLmsGeneration.test.ts:79-87` | every offerable kind id resolves to a real config |
| `src/lib/lms-generation/post-content.test.ts:53` | the assignment arm's "no due date or points" - must still pass UNCHANGED (AC14b) |

Baseline before this chunk: **606 test files, 12171 tests, all passing**
(measured 2026-08-23).

**Precedent to copy end to end:** the `resources` kind, commit `4ad4dbf`,
`docs/REGRESSION.md` entry 322, `docs/learning-resources-page-acceptance-criteria.md`.
That change touched 10 files and deliberately did NOT touch `commit-plan.ts`,
`commit-execute.ts`, `post-content.ts`, `GenerateFromSelectionSection.tsx` or
`ModulesView.tsx` - the button and the post pipeline are derived from the
registry. This chunk breaks that free ride in exactly two places, both
budgeted above: the new `"discussion"` post kind (AC11/AC15) and the deadline
plumbing into `post-content.ts` (AC14b).
