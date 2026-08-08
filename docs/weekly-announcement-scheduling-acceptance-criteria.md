# Weekly announcement scheduling - acceptance criteria

Feature: schedule a recurring weekly announcement on a chosen weekday, for every
week the class is in session, in one run.

Mechanism (user decision, do not revisit): ONE run pre-schedules the WHOLE term in
Canvas up front. Each in-session week's announcement is created immediately,
carrying a future `delayed_post_at` so Canvas posts it on the chosen weekday. This
is NOT a recurring schedule that fires weekly.

Breaks (user decision, do not revisit): ignored for this iteration. Weeks 1..N are
scheduled with no break awareness, matching what `buildCourseEvents` already does.
The limitation is stated plainly in the UI and in the run report.

## Vetted existing code - reuse these, do not reinvent

Every citation below was verified against the tree at 60a254f.

- `dateForWeekday(start, week, jsDay)` - `src/lib/course-calendar-dates.ts:155`.
  Pure, client-safe, and exactly the "date of weekday X in week N" helper this
  feature needs. `buildCourseEvents` already calls it at
  `src/lib/course-calendar-events.ts:189` inside its per-week/per-weekday loop.
  COPY THAT PATTERN. Do not write a new date-stepping helper.
- `createAnnouncement(...)` - `src/lib/canvas/announcements.ts:203`. Already sends
  `is_announcement=true` and appends `delayed_post_at` as an ISO string at :224.
  The Canvas call itself is complete and needs no change.
- `createScheduledAnnouncementAction` - `src/app/actions/canvas-inbox.ts:249`.
  Existing server-action wrapper.
- `generate-weekly-announcements` step - `src/lib/workflows/registry/steps.weekly-announcements.ts:151`.
  Existing per-week generator. See "relationship to the existing step" below.
- `weekStartDate(start, week)` - `src/lib/workflows/registry/weekly-generator.ts:61`.
  What the existing step uses INSTEAD of a weekday. Root of gap (a).

## Relationship to the existing step

`generate-weekly-announcements` already schedules one announcement per week and
skips weeks already past, but it does not satisfy the request:

- (a) No weekday input. It derives each week's date from `weekStartDate()`, so the
  announcement inherits whatever weekday the course start date happens to fall on.
  The user cannot choose "every Monday."
- (b) It iterates the `schedule` array rather than calendar dates.
- (c) It REQUIRES generated materials. It is built to run inside Course Build and
  grounds each announcement in that week's generated deck/objectives/assignment. It
  cannot run standalone against a bare course.

Gap (c) is decisive: this feature must run standalone. Implement it as a NEW
sibling step rather than by overloading the existing one, and leave the existing
step's Course Build behavior untouched.

## AC1 - Weekday selection

1. The step accepts a weekday input (Sunday through Saturday) with a stable value,
   independent of locale and of the course start date's own weekday.
2. Week N's announcement date is computed with the existing `dateForWeekday`, in the
   same manner as `src/lib/course-calendar-events.ts:189`. No new date arithmetic.
3. The input is bound in EVERY preset that includes this step. An unbound input is
   silently skipped by the run form, so an unbound weekday would fall back and
   produce wrong dates with no error.
4. WITHDRAWN 2026-08-07, my error. This originally required the weekday to persist
   across reloads per the repo's control-state rule. That rule governs tab UI
   controls (the `ta-` localStorage keys), NOT workflow run-form step inputs. No step
   input value persists anywhere in the run-form stack, by design: `RunFormFields.tsx`
   persists only the deferred-section disclosure state, and `useWorkflowOptions.ts` /
   `run-form-options-cache.ts` cache dropdown CONTENTS, never chosen values. Silently
   reusing a stale course or weekday across runs would be worse than re-picking. The
   weekday behaves like every other step input.

## AC2 - Term coverage

5. The run schedules exactly one announcement per in-session week, weeks 1..N,
   derived from the course's configured start date and week count.
6. A week whose computed date-time is already in the past is skipped, not created,
   and is reported as skipped with its reason.
7. Breaks are not consulted. The run report states explicitly that break weeks were
   included, so the limitation is visible rather than silent.

## AC3 - Idempotency (the core of this feature)

Canvas supports no client-supplied idempotency key, no external id, and no SIS id
for discussion topics. Verified against the official discussion_topics API docs and
the object-ids doc. Idempotency is therefore entirely ours.

8. A mapping table records one row per scheduled announcement, with a UNIQUE
   constraint on `(course_id, week_number)`.
9. The natural key is `course_id + week_number`. The scheduled DATE is NOT part of
   the key. If the date were in the key, editing the course start date would produce
   a new key for the same logical slot, miss the existing row, create a duplicate,
   and orphan the original.
10. WRITE-AHEAD INTENT ORDERING. For each week, in this order: (i) insert a
    `pending` row and COMMIT it, (ii) call Canvas, (iii) update the row to
    `confirmed` with the returned topic id. The atomic boundary sits BEFORE the
    external call because it cannot span the network boundary.
11. A `pending` row found on a later run is AMBIGUOUS, not failed - the crash may
    have landed either side of Canvas's create. It is resolved by a targeted
    read-back, never by a blind re-create.
12. Re-running the feature against a course that is already fully scheduled creates
    ZERO new announcements and reports every week as already present. This is the
    single most important check in this document: today, re-running would duplicate
    the entire term.
12a. PRECEDENCE, since items 6 and 12 both apply to a mid-term re-run - the ordinary
    case. An existing row WINS over "past". A week that is both behind us and already
    scheduled is reported as already present, never as skipped-past: telling the user
    a week was skipped when an announcement is in fact sitting in Canvas states the
    opposite of the truth.
12b. `postedAt` IS CANVAS-SOURCED. The write-ahead ordering in item 10 commits the
    local row BEFORE Canvas is called, so the local table's own `postedAt` is always
    null and can never tell you whether Canvas has posted. The reconciler populates
    it from the read-back before planning. The planning function is pure and must not
    fetch.
12c. A confirmed row whose recorded schedule date is MISSING resolves toward
    reschedule, never toward create. Rewriting the date on a known topic id is safe
    and idempotent; creating is not.

## AC4 - Read-back and pagination

13. Pagination is OPT-IN, not a change to existing behavior. `listAnnouncements`
    (`src/lib/canvas/announcements.ts:159`) is reached by three surfaces: the Canvas
    tab announcements panel
    (`src/app/components/canvas-tab/announcements-panel.tsx:64`) and the
    `list-announcements` step
    (`src/lib/workflows/registry/steps.announcements.ts:183`), both via
    `listAnnouncementsAction` (`src/app/actions/canvas-inbox.ts:186`, calling the
    library function at :194 - the only direct call site). Making it paginate
    unconditionally would turn the UI panel from one page of 50 into every
    announcement the course has ever posted. Add an explicit opt-in parameter or a
    separate all-pages function; all three surfaces keep today's behavior byte for
    byte, and a test asserts exactly one request is issued when the opt-in is absent.
13a. The Link-header parser is its own pure module, `src/lib/canvas/pagination.ts`,
    exporting `parseNextLink(header)`. Naming it here rather than leaving the
    decomposition open, because the TDD suite imports it by that path.
14. The paginated path follows Link-header pagination, continuing while a
    `rel="next"` link is present and stopping when it is absent. Terminating on
    `rel="last"` is incorrect - Canvas may omit it when the total is expensive to
    compute. Link URLs are treated as opaque and followed verbatim, with the header
    name matched case-insensitively.
15. KEEP THE CURRENT ENDPOINT. The existing call is
    `/courses/:id/discussion_topics?only_announcements=true&per_page=50`, which has
    NO default date window. `GET /api/v1/announcements` is a different endpoint that
    defaults to 14 days ago through 28 days later and would silently hide most of a
    term, causing the reconciler to duplicate it. Do not switch endpoints. If one is
    ever switched to `/api/v1/announcements`, an explicit term-spanning date range
    becomes mandatory.
16. Page size stays explicit. Canvas's documented default is 10.
17. The existing sort contract is preserved: scheduled items (no `postedAt`, a
    `delayedPostAt` set) first by soonest `delayedPostAt`, then posted items by
    newest `postedAt`. See `src/lib/canvas/announcements.ts:179-193`.

## AC5 - Partial failure and resumability

18. A failure on week K does not abort the run. Remaining weeks are attempted, and
    the run reports per-week status (created / skipped / already present / failed
    with reason).
19. Nothing is rolled back. Canvas has no transactional multi-object delete, so a
    rollback would mean issuing DELETEs against already-correct announcements.
20. The run is resumable. If it is truncated by the 60-second execution cap, the
    next run resumes from the mapping table without duplicating confirmed weeks. No
    separate continuation token - the mapping table IS the checkpoint.
21. Elapsed time is checked before starting each week, and the run stops cleanly
    between weeks rather than mid-week.

## AC6 - Rescheduling after a start-date edit

22. A start-date edit is a RESCHEDULE of existing rows, not a new set. The key is
    unchanged; only the target date changes.
23. An announcement that has ALREADY POSTED is never modified. Canvas's behavior
    when updating `delayed_post_at` on an already-posted topic is undocumented and
    reported as buggy in production, so this feature does not depend on it.
24. Not-yet-posted announcements may be rescheduled by updating the existing topic
    id on file. Already-posted ones are left alone and reported as such, so the user
    can see what did not move.

## AC7 - Rate limiting

25. Creates are issued SEQUENTIALLY. Canvas penalizes parallel requests on one token
    and states sequential single-connection use is unlikely to be throttled.
26. Both 429 and 403 are treated as throttle signals. Canvas's own throttling
    documentation writes the status as `429 Forbidden (Rate Limit Exceeded)` - a
    quirk of their docs, since 429's standard reason phrase is "Too Many Requests"
    and "Forbidden" belongs to 403 - and third-party sources report 403 for the same
    condition. The mismatch is exactly why both are handled rather than picking one.
27. Throttling gets bounded exponential-backoff retry. Canvas documents no
    `Retry-After` header and publishes no numeric quota, so backoff is defensive by
    default rather than tuned.

## AC8 - Workflow plumbing

28. Adding the step forces a decision in all three classification sets in
    `src/lib/workflows/headless.ts`. Note `post-announcement` currently sits in
    `ALWAYS_INTERACTIVE_STEP_TYPES` (set at :311, entry at :391) and cannot run
    unattended. Whether this new step is headless-safe is a deliberate choice, made
    and recorded - not inherited by accident.
29. If the step IS headless-safe, the exact-count canary in
    `src/lib/workflows/headless.test.ts:186` (currently 153) is bumped in the SAME
    commit.
30. Registry files are client-bundled. This step must not import, even transitively,
    `@/lib/supabase/server`, `@/app/actions/shared`, or `next/headers`. Database and
    env access go through a server action.
31. A SOURCE-READING GUARD TEST covers item 30. A normal run of tsc, eslint and
    vitest stays green on a violation and only `next build` fails - but a test that
    reads the registry file's own source and asserts the forbidden imports are absent
    catches it in the suite. This repo already does exactly that in
    `src/lib/workflows/course-schedule-docx.test.ts:40-48`, whose comment records
    that only `next build` caught the original incident before the guard was written.
    Model the new guard on it. Roughly fifteen other `.test.ts` files use the same
    `readFileSync` structural-assertion technique.

## AC9 - Reporting

31. The run produces a report listing every week with its status and, for failures,
    the underlying error rather than an aggregate message.
32. The report states that break weeks were not excluded (AC2 item 7).

## Tests still owed at the post-verification unit-test pass

The TDD suite (`src/lib/announcement-schedule.test.ts`) covers the pure date and
planning layers only. These AC items are node-testable but NOT yet covered, and are
owed once the implementation fixes the names they need. Recorded here so they are
not lost between stages.

- Item 17, the sort contract, and items 15/16, the endpoint and explicit page size.
  Stub `globalThis.fetch` and assert the request URL and the returned ordering.
  Entry 235 check 9 records that NO existing test exercises `announcements.ts` at
  all, so this is the cheapest high-value gap in the document.
- Item 13, pagination opt-in: assert exactly ONE request is issued when the opt-in
  flag is absent.
- Item 3, the weekday input bound in every preset containing the step, and item 34,
  the index-based `bindOverrides` keys re-derived after the insertion. Presets are
  pure data and the repo already has `presets.test.ts`,
  `preset-shape.oracle.test.ts` and `presets.include-key-targets.test.ts` to model
  on. Entry 157 records these keys breaking TWICE, so this is a known repeat
  offender rather than a hypothetical.
- Items 28/29, the new step type present in exactly one of the three classification
  sets in `headless.ts` (:27, :311, :432), with the canary bumped to match.
- Item 31, the source-reading guard against server-only imports.
- Items 25/27, sequential creates and bounded backoff, and items 20/21,
  resumability and the elapsed-time check, all testable with an injected fetch and
  an injected clock in the same style `now` is already injected.
- Items 6, 7, 18, 31, 32 on per-week status and reasons, testable if the report
  builder is a pure function. Note the plan entries as currently specified carry no
  reason field - add one.

## AC10 - The existing step is not disturbed

33. `generate-weekly-announcements` keeps its current contract exactly. Entry 157
    AC6 pins that it grounds each announcement in that week's generated objectives,
    deck, opener and assignment via `gatherWeekMaterials`, and SKIPS a week with no
    grounding material rather than writing from the topic line. The new sibling step
    does not change that behavior, its inputs, or its preset bindings.
34. Entry 157 AC1/AC2 pin `generate-weekly-announcements` at a specific source index
    inside `COURSE_REFRESH`, with index-based `bindOverrides` keys that have already
    been broken twice by insertions. If the new step is added to any shared preset,
    every later index-based override key is re-derived and verified, not assumed.
