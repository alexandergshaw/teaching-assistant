# Live-LMS student success tracking + per-institution templated messaging - architecture / reuse scope

Backlog row: LIVE-LMS-STUDENT-MESSAGING (docs/BACKLOG.md:311), owner request
2026-10-11 with two screenshots, clarified same day (institution SWITCHER; draft
persists across switch and reload; SEND one institution at a time).

Branch main, HEAD c8586eeb. This is a READ-ONLY architecture + reuse pass. No
production code. It decides SHAPE (where the seams fall, what is one layer vs
two, which object each requirement binds to) and hands the AC, test, security,
reliability, data and UX seats a vetted reuse list and a wave cut. It does NOT
author acceptance criteria, oracle construction, the full threat model, or the
timeout arithmetic - those are their seats' and are named as such below.

All line counts in this doc were produced by
`foreach ($f in $files) { @(Get-Content $f).Count }` in PowerShell on
2026-10-11 (the mandated instrument - this-repo.md section 3; never
`Measure-Object -Line`). Every `file:line` cited below was opened directly.

---

## 0. The single most important finding: the surface does NOT exist today

The brief's biggest fork - "does a Success Tracking table already exist to
reuse" - resolves to NO. Measured:

- `grep -rn "Success Tracking"` over the repo: `No files found`.
- `grep -rn "Selected Students|Missing Assignments|Current Status"`: `No matches`.
- `grep -rn "\{\{first_name\}\}|\{\{course\}\}|\{\{grade\}\}"`: `No files found`.
- `grep -rn "missing_assignments"`: only `docs/` and unrelated `src` hits, none
  a table.

The two screenshots are a reference from an EXTERNAL app, not this codebase. So
the SURFACE (the table, the modal) is build-from-scratch. What already exists -
and what makes this an extension rather than greenfield - is the Canvas live-LMS
data layer, the institution switcher, the per-student send path, the column-
filter idiom, the ta- draft idiom, and the diagnostics store. The feature is
"assemble a new surface over existing readers + a new send job", not "swap the
data source of an existing table".

Cost if this finding is wrong (a surface exists and was missed): a duplicated
table/modal. Confidence is high - the exact screenshot strings AND the six
variable tokens are all absent from `src/`.

---

## 1. The layer stack - and THE SURFACE IS A LAYER

This repo has twice shipped a library and an endpoint "with no surface between
them, both verifies passing" (MEMORY: verify-reachability; this-repo recorded
instance). To forbid that here, the layers are named explicitly and every wave's
file list (section 7) must contain the file that CALLS each new export.

```
L1  Live-LMS data-access readers          (per-course roster / grades / missing / sections / term)
L2  Enrollment-row aggregator             (fan-out across the institution's active courses -> table dataset)
L3  Pure table logic                      (filter funnels + sort + search + pager, over L2 rows)
L4  THE TABLE SURFACE                      <- the user reaches this; it mounts L3 and selects students
L5  THE MESSAGING MODAL                    <- the user composes the draft here; variables row + preview
L6  Pure template substitution            (per-student binding; the ATTRIBUTION guarantee lives here)
L7  The send boundary + send job          (one institution, kickoff+poll; L6 resolved at send time)
L8  Client-side diagnostics recording     (per-fetch + per-send-batch, PII-safe)
```

The user reaches L4 (a table) and then L5 (a modal). Every requirement in the
brief binds to one of these objects; section 2 states which.

---

## 2. Which object each requirement binds to (the SHAPE decisions)

| Requirement | Binds to | SHAPE decision |
|---|---|---|
| "table like this, filter on those columns" | L3 over L2 | Each ROW is a (student, course, section) ENROLLMENT, not a student - the screenshot carries Course + Section + Term columns per row, so one student in two courses is two rows. L2 therefore aggregates ENROLLMENTS across the selected institution's active courses. |
| "without Institution as a column" | L4 columns | Institution is the SWITCHER (L4 chrome), confirmed by owner clarification; it is never a column and never a row field shown to the user. |
| institution switcher | reuse `useInstitutionSelection()` | The switcher already exists as a shared hook (section 3). The view filters it to institutions with a LIVE connection (section 4, L1). |
| draft persists across switch + reload | L5 state, a `ta-` key | The draft (subject/body) is VIEW-LEVEL state independent of the selected institution; the selected-students set is PER-institution and is NOT carried across a switch. |
| every column value + every variable "pulled directly from the live LMS" | L1 readers | Each column and each token maps to a named Canvas field (section 5). Two have no native source and are forks (Current Status, Section) and one is derived (first/last name). |
| templated messages, values per student | L6 | Substitution resolves each student's OWN live values; the per-student binding is the ATTRIBUTION guarantee and its removal test (section 9). |
| SEND to real students | L7 | Irreversible outward side effect: Preview + explicit confirm MANDATORY; send structurally scoped to ONE institution id (section 6). |
| 57 students = 57 sends, Canvas rate limits, 60s cap | L7 job | kickoff+poll job, bounded concurrency, per-student outcome partition (section 6 + reliability seat). |
| 200+ rows live | L1/L2 fetch | per-course fan-out, per-course error partition, progressive/bounded load (section 6 + data/reliability seats). |
| diagnostics | L8 | new `messaging` (+ a fetch) surface in the session diagnostic log, PII-safe, recorded CLIENT-side (section 8). |

---

## 3. Reuse list (symbol, file:line, what it gives us) - all opened directly

### Institution switcher (L4 chrome) - REUSE, do not rebuild
- `useInstitutionSelection()` - `src/lib/institutions.ts:111` - returns
  `{ institutions: string[], active: string, setActive(code) }`, where
  `institutions` is the registered-acronym list and `active` is persisted and
  storage-synced across tabs. This IS the owner's "institution switcher". The
  view reuses it and filters to the live-connected subset (section 4).
- `InstitutionSwitcher` component is already mounted elsewhere
  (`ContentTab.tsx:10`, WorkflowsTab.tsx:51, account/diagnostics/page.tsx:137);
  a visual-seat read, not a rebuild.

### Live-LMS connection model (L1 gating) - REUSE
- `CANVAS_INSTITUTIONS` - `src/lib/canvas-core.ts:55` - the registry that maps a
  code to a host. MEASURED: it has exactly ONE entry today (MCC,
  `canvas-core.ts:56-57`). See FORK C.
- `resolveCanvasCredential(code)` - `src/lib/canvas-credentials.ts:189` - the
  per-user credential resolver (own stored row, owner env fallback only for an
  owner identity). "Institutions I have a live connection for" = registered
  codes for which this resolves. Server-only.
- `lmsConnectionStatusFor(c, liveCheck?, liveError?)` /
  `LmsConnectionStatus` (`not-linked|needs-institution|unknown|connected|failed`)
  - `src/lib/courses-table-helpers.ts:731` / `:716` - the pure connection-status
  classifier. The connected-subset semantics for the switcher derive from this
  vocabulary (data/ops seat decides whether to reuse it verbatim or probe fresh).

### Column + variable data readers (L1) - REUSE (all in `src/lib/canvas/`)
- `listActiveTeacherCourses(ctx)` - `listings.ts:133` - the instructor's active
  courses in a code. `listCoursesByTerm(code, term)` - `listings.ts:162` - adds
  `include[]=term` so Term is available; `CanvasCourse.term?.name` at
  `listings.ts:89`. (Course + Term columns.)
- `listCourseRoster(code, courseId)` - `listings.ts:286` - `{id, name,
  sortableName, loginId}` per student. (Student column + name tokens. first/last
  are DERIVED - FORK D.)
- `listStudentGradeSummaries(code, courseId)` - `listings.ts:318` - `{userId,
  name, currentScore, finalScore}`. (grade column + `{{grade}}`.)
- `listCourseSubmissionGrid(baseUrl, token, institution, courseId,
  assignmentIds)` - `submissions-grid.ts:209` - rows carrying Canvas's own
  `missing` boolean read verbatim (`submissions-grid.ts:65`). Count rows with
  `missing===true` per `userId`. (# Missing Assignments + `{{#_missing_assignments}}`.)
  Note: this reader takes RESOLVED `baseUrl/token/institution` (not a `code`),
  and `assignmentIds` for its per-assignment fallback (`listAssignments(code,
  courseId)` - `listings.ts:217`).
- `countActiveCourseStudents` - `listings.ts:359` - handy for row-count headers.

### Send path (L7) - REUSE, do not rebuild the transport
- `createConversation(courseUrl, recipientUserId, body, subject?)` -
  `src/lib/canvas/inbox.ts:384` - creates ONE Canvas conversation (direct
  message) to ONE student by numeric Canvas user id in a course, `force_new=1`.
  This is the per-student templated send. It resolves the institution from
  `courseUrl`'s host via `resolveInstitution(url)` (`canvas-core.ts:126`).
- `CourseConversationResult` (`inbox.ts:430`) and `createCourseConversation`
  (`inbox.ts:444`) map an HTTP status to `accepted|refused|unknown` without
  treating a timeout/5xx as proof of non-delivery. REUSE this three-state
  result SHAPE for the per-student outcome; see do-not-reuse for why
  `createCourseConversation` itself is wrong here.
- `canvasRequest`/`canvasGet` (`canvas-fetch-response.ts`) and the SSRF/redirect
  guards (`assertCanvasSuppliedUrlIsSameOrigin`, `canvas-remote-url.ts`) are
  already threaded through every call in inbox.ts - inherited for free.

### Column-filter idiom (L3) - REUSE THE SHAPE, not the types
- `src/lib/course-tasks-view-column-filters.ts` (175 lines) - `normalize* /
  serialize* / parse*` with a versioned `{v, filters}` envelope and a `ta-`
  key (`taskColumnFiltersKey`, `:143`). The PATTERN (coerce untrusted persisted
  state, version it, per-column active check, ta- persistence) is the template.
  The TYPES are `TaskStatus`-specific (`TaskColumnFilters = Record<string,
  TaskStatus[]>`, `:34`) and do NOT fit free-text/numeric columns - see
  do-not-reuse.

### Draft persistence idiom (L5) - REUSE THE PATTERN
- `ta-ppt-ask-draft` (A43-C2) and `ta-one-off-draft` (ONE-OFF-TASKS W3) are the
  in-tree precedent for a composer draft persisted to a `ta-` key (MEMORY:
  persist-ui-control-state). The new draft key persists subject+body+ (NOT the
  selection, NOT the institution).

### Diagnostics (L8) - REUSE, EXTEND the closed union
- `recordSessionDiagnosticEntry(args)` - `src/lib/session-diagnostic-log.ts:228`
  - the single write path. `SessionDiagnosticSurface` is a CLOSED union
  (`:73`) of `"lms-content"|"diagnostics"|"grading"`; adding a surface requires
  a `COVERAGE_BY_SURFACE` row (`:92`) and a label (`:77`) or it fails tsc, and
  `SESSION_DIAGNOSTIC_NOT_COVERED` (`:110`) must be kept honest. Two hard
  contracts (section 8): NO student personal data (`:44-49`), and BROWSER-ONLY
  (`:37-42`, enforced by `session-diagnostic-log.test.ts` scanning
  api/actions/"use server").

### Owner gate (L1/L7) - REUSE
- `requireAppOwner()` - `src/lib/supabase/auth.ts:408` - the REAL owner gate.
  `requireOwner()` is a deprecated alias of `requireUser()` (seats.md
  Operability; MEMORY: allowlist-is-half-the-breakglass) and must NOT be used.
  Every live-LMS read action and the send action call `requireAppOwner()`.

---

## 4. Do-not-reuse list (with justification per entry)

- `createCourseConversation` (`inbox.ts:444`) - sends ONE conversation addressed
  to the course context (`recipients[]=course_<id>`), which Canvas fans out to
  every enrolled student with ONE shared body. That is a broadcast with no
  per-student substitution - it cannot satisfy the templated-per-student
  requirement and would defeat the per-student ATTRIBUTION guarantee. Use
  `createConversation` (per user id) in a fan-out instead.
- `TaskColumnFilters` / `normalizeTaskColumnFilters`
  (`course-tasks-view-column-filters.ts:34,64`) as a TYPE - it is
  `Record<string, TaskStatus[]>`, an enumerated-status model. The success table
  has free-text (Student/Course/Section/Term), categorical (Current Status) and
  numeric (#missing, grade) columns. Reuse the envelope/versioning/ta- PATTERN;
  author a new, column-typed filter model (L3). Do not bend the task type.
- `message-drafts.ts` (Supabase `message_drafts` table) - this is the WORKFLOW
  draft-review store (durable, server-side, `MessageDraftPayload`,
  `message-drafts.ts:21`), for the save-message-draft workflow step. It is NOT
  the client-side composer draft this feature needs. Different lifecycle, do not
  conflate. (It is, however, prior art that a per-student "message" draft kind
  already carries `recipientUserId`+`courseUrl` - useful reading for the send
  payload shape, nothing more.)
- `src/app/actions/canvas-inbox.ts` (908 lines) as the HOME for the new send
  action - it is 92 lines from the 1000 ceiling
  (`file-size-ceiling.structure.test.ts`, LIMIT=1000). The send job is its own
  new action file.
- `session-diagnostic-log.ts` as the home for a SERVER-side send log - it is
  BROWSER-ONLY by contract (`:37-42`); the send action runs server-side and may
  not import it. The diagnostic is recorded client-side from the action's return
  (section 8).

---

## 5. Column + variable -> live Canvas field map (brief item 2)

| Surface element | Live source | Status |
|---|---|---|
| Student (name, selection key) | `listCourseRoster` -> `name` / `id` (`listings.ts:301-306`) | EXISTS |
| `{{first_name}}` / `{{last_name}}` | DERIVED from `sortableName` ("Last, First") or `name` | FORK D - no native field |
| Course | `listActiveTeacherCourses`/`listCoursesByTerm` -> course name | EXISTS |
| Section | enrollment `course_section_id` + `/courses/:id/sections` name | GAP - no reader today (NEW L1 reader) |
| Term | `listCoursesByTerm` -> `CanvasCourse.term.name` (`listings.ts:89`) | EXISTS (needs `include[]=term`) |
| Current Status | no single Canvas field | FORK D - owner must DEFINE |
| # of Missing Assignments | count of `listCourseSubmissionGrid` rows with `missing===true` per user (`submissions-grid.ts:65,131`) | EXISTS |
| `{{grade}}` | `listStudentGradeSummaries` -> `currentScore` (`listings.ts:343`) | EXISTS |
| `{{course}}` / `{{section}}` | same as Course / Section columns | EXISTS / GAP |
| `{{#_missing_assignments}}` | same as # Missing column | EXISTS |

So FOUR of the seven columns and four of six tokens have a direct reader;
Section needs a new reader; first/last are derived; Current Status is undefined.
Flag these three to the owner as forks (section 10, FORK D).

---

## 6. The send boundary + fetch strategy (highest stakes)

### Send transport (FORK B)
Recommended reading: Canvas Conversations via `createConversation` per selected
student. It targets live-LMS user ids, stays in-house (MEMORY: in-house-ai-only;
never send student data to a non-LMS endpoint), and reuses the existing guarded
transport. Email / in-app are different features with different libraries. This
is the one to confirm with the owner because it is the irreversible outward act.
Cost if wrong (owner wants email): the user-id -> email path + an email provider
is a separate build.

### The one-institution structural pin (brief item 3, owner clarification)
"Make it structurally impossible to send to more than the selected institution
in one action." SHAPE: the send ACTION takes a single institution `code` and a
list of `{courseUrl, recipientUserId, renderedBody, subject}`. Because
`createConversation` derives the institution from `courseUrl`'s host
(`resolveInstitution`, `canvas-core.ts:126`), the action must assert every
`courseUrl` resolves to the SAME institution as the passed `code` before any
send (reject the batch otherwise). The pin:
- a TYPE: the action input is `{ institutionCode: string; targets: Target[] }`
  with a single code - there is no shape that carries two codes;
- a SOURCE-TEXT reachability test: the only send primitive the action calls is
  `createConversation`, never `createCourseConversation`, and the action asserts
  institution identity across targets. Mirror the
  `classTrendsDraft.not-postable.test.ts` forbidden-prefix pattern
  (leverage.md:160) adapted to "no cross-institution recipient".
This is the security + test seats' to finalize; the SHAPE is "one code in, assert
identity, one primitive out".

### Preview + confirm (MANDATORY)
The modal already shows a Preview button (screenshot 1). Preview renders the
per-student substitution for the current institution's selected students. An
explicit confirm step follows Preview before any `createConversation` fires.
Build must not send without owner confirmation. (This is an AC, owned by the AC
seat; stated here only as the shape the send flow must have.)

### Fetch + job strategy (FORK E/F - reliability + data seats own the arithmetic)
- TABLE read (L1/L2): per-course fan-out over the institution's active courses;
  each course needs roster + grade summaries + submission grid + sections. For a
  large institution this exceeds the 60s Vercel Hobby `maxDuration` of a single
  synchronous action (this-repo / MEMORY: deployment-vercel-hobby). Recommended
  reading: progressive per-course load with PER-COURSE error partition (one
  failed course does not blank the table), bounded concurrency via
  `mapWithConcurrency` (`canvas-modules/fetch-helpers.ts`, already used by
  `submissions-grid.ts:37`), and the existing `CANVAS_PAGINATION_PAGE_CAP`
  (`canvas-remote-url.ts`) per reader. The "Showing 200 rows" pager is a
  client-side window over the assembled dataset.
- SEND (L7): 57 students = 57 sequential POSTs + Canvas rate limits will blow
  60s. Recommended reading: a kickoff+poll job (MEMORY: atomic-action-library's
  kickoff+poll classifier) with per-student `accepted|refused|unknown` outcome
  partition (reuse the `CourseConversationResult` shape), bounded concurrency,
  and a resumable/reportable status. Whether the long job runs as a GitHub
  Action (MEMORY: deployment-vercel-hobby - unattended long jobs) or an
  attended client-driven kickoff+poll is the reliability seat's call; the SHAPE
  is "not one synchronous action".

The seat that owns the numbers: reliability (timeout arithmetic against the
payload and cap; teardown; rollback blast radius) and data (byte sizes, TTL,
retention of an abandoned draft). This architect pass fixes only that the send
and the large-table read are NOT single synchronous actions.

---

## 7. Wave cut + owns (disjoint write sets)

New feature, so most paths are NEW files. The write-set intersections to watch
are the SHARED files: the tab registry/canary, and `session-diagnostic-log.ts` +
its test. The plan seat finalizes exact registry paths after FORK A' (placement).

Proposed home directory: `src/lib/live-messaging/` (pure logic) +
`src/app/components/live-messaging/` (surface) + `src/app/actions/
live-messaging-send.ts` (send action). Names illustrative; plan seat fixes them.

| Wave | Seat focus | New/edited paths (owns) | Caller included? |
|---|---|---|---|
| W1 | L1 readers + L2 aggregator + L6 substitution (pure/mocked-client) | NEW: section reader (in `canvas/listings.ts`, 455 lines - room, or a new `canvas/sections.ts`); `live-messaging/enrollment-aggregator.ts`; `live-messaging/template-substitution.ts`; `live-messaging/connected-institutions.ts`; + their `*.test.ts` | aggregator is called by L4 in W3; substitution by L5/L7 in W3/W4 - type-only/pure modules, callers land in W3/W4. State this explicitly so the wave gate does not read a pure export as dead code. |
| W2 | constraints: security + reliability + operability | the send-boundary pin design, the job design, the owner-gating plan, the connected-institution resolution - mostly design artifacts that W4 builds; any pure guard test leaves can land here | n/a (design wave) |
| W3 | L3 pure table logic + L4 table surface + L5 modal | NEW: `live-messaging/table-filter-model.ts` (+test), `live-messaging/pager.ts` (+test); `components/live-messaging/SuccessTrackingTable.tsx`, `MessagingModal.tsx`, the view shell; EDIT: tab registry + its `tab-rails` canary (FORK A') | the shell CALLS the aggregator and mounts the table and modal - L4 is the caller for L2/L3. |
| W4 | L7 send action + job + L8 diagnostics | NEW: `src/app/actions/live-messaging-send.ts` (requireAppOwner, one-institution pin); the kickoff+poll job; EDIT: `session-diagnostic-log.ts` (+`.test.ts`) to add the `messaging` surface | the modal's confirm CALLS the send action; the client records the L8 entry from its return. |

Serialization: any BUILD serializes on the shared tsc/full-test resource
(this-repo section 2 - exactly one `tsc` caller) and on
`session-diagnostic-log.ts`/its test (W4 only). W1 and W3 are file-disjoint by
exact path EXCEPT the tab registry (W3 only). 1000-line ceiling per file: no new
file is near it; the only measured risk is appending to `canvas-inbox.ts` (908)
- forbidden by section 4, so the send action is its own file.

`owns` derivation command for the shared source-text scanners (the plan seat
must paste its output and reconcile): source-text tests that would scan new
files are repo-wide canaries, not per-file - `file-size-ceiling.structure.test.ts`
walks all of `src/` (this-repo:48), `no-emojis.test.ts` and
`source-bytes.structure.test.ts` scan all source. Run, at plan time:
`grep -rln "SuccessTracking\|live-messaging\|sendLiveMessages\|MessagingModal" src --include=*.test.ts`
and add every hit to the touching wave's owns (a test that greps a string it
does not own goes red on a correct change - MEMORY: gate-must-include-directory-canary).
The tab-rails/topLevelTabs canary (ONE-OFF-TASKS W1 precedent, BACKLOG.md:310:
"tab-rails/topLevelTabs canaries bumped N->N+1 with the ordered id list, same
commit") MUST be in W3's owns if placement is a new tab/rail.

---

## 8. Diagnostics representation (brief item 7, DEV_LOOP requirement)

A new user-reached capability, so it carries diagnostic representation. Add a
`messaging` surface to `SessionDiagnosticSurface` (`session-diagnostic-log.ts:73`),
with a `COVERAGE_BY_SURFACE` row (`:92`) and a label (`:77`). What it records:
- per live FETCH (table assembly): one entry per course pulled -
  `{surface:"messaging", operation:"fetch_enrollments", institution:<code>,
  course:<name>, outcome, durationMs?}`; a failed course is a `failure` entry
  (so a partition failure is visible, not silent).
- per SEND BATCH: one aggregate entry - `{surface:"messaging",
  operation:"send_batch", institution:<code>, outcome,
  counts}`. The failure it makes visible: how many of N sends were
  `refused`/`unknown`.

Two HARD constraints from the store's own contract:
- NO STUDENT PERSONAL DATA (`:44-49`): no student names, no message bodies, no
  subjects, no login ids. Only counts, outcomes, institution code, course name.
  The `error` field is already scrubbed+capped (`:51-58`,
  `sanitizeSessionDiagnosticError`). This is a SEAM CONTRACT: the send action
  returns per-student `{userId, status}` (no names), and the client folds those
  into counts before recording.
- BROWSER-ONLY (`:37-42`): the send action (server) CANNOT import the log. The
  client records the entry after the action returns. `session-diagnostic-log.
  test.ts` enforces the no-server-import rule and will fail if the send action
  imports the log.

The data-path addition (a new live fetch + a new outward send) means this is NOT
a presentational-only change, so a stated diagnostic is REQUIRED, not optional.

---

## 9. Leverage (mechanism + the buildable removal test)

This is a new capability a user reaches, so the AC seat owns a leverage claim.
The mechanism available to it (I provide the mechanism; the AC seat decides the
claim per leverage.md's three calls):

Primary earned class: ATTRIBUTION (leverage.md:43) compounded with SCALE
(leverage.md:41). The templated message resolves EACH student's OWN live values
by construction - a chat holding one paste cannot guarantee that student A's
grade did not land in student B's message, and cannot hold a batch together as
one personalized send. Secondary: LIVE integration (values pulled at send time,
not a stale paste).

The REMOVAL TEST is BUILDABLE here (unlike a clicks-only advantage), which is
why ATTRIBUTION is the recommended named class: L6 is a pure function over
mocked live rows. The removal test (test seat owns construction):
- Deletion: replace per-student resolution in L6 with substitution from a single
  shared snapshot (resolve the tokens once, reuse for all recipients).
- Assertion that goes red: each rendered message contains THAT student's
  distinct `{{grade}}`/`{{#_missing_assignments}}` - given two students with
  different values, the two rendered bodies must differ in exactly those
  positions. Under the deletion they become identical -> red.
State the deletion, trace the assertion: deleting the per-row bind makes the two
outputs equal, which flips the "bodies differ at the bound tokens" assertion.
That is a real removal test, not "a chat could not do it".

---

## 10. Forks - each a recommended reading with cost-if-wrong

- FORK A (resolved): Success Tracking does NOT exist to reuse. Build fresh,
  maximize reuse of the Canvas readers + switcher + idioms. Cost if wrong:
  duplicate surface. Confidence high (section 0).
- FORK A' (placement, minor): where the surface lives - a new top-level tab vs a
  Tools sub-tab vs a Courses rail item. It is cross-course AND cross-institution,
  so it is NOT course-scoped; it must not require a course selection first (A39
  interaction-cost lesson). RECOMMENDED: a new top-level area or Tools surface
  that opens straight to the switcher + table. Cost if wrong: a registry move
  (ONE-OFF-TASKS shows the owner moved a top-level tab to a rail once - cheap,
  but it is a wave's worth of canary edits). The plan seat fixes exact registry
  paths; owner confirms placement.
- FORK B (send transport): RECOMMENDED Canvas Conversations via
  `createConversation`. Cost if wrong (email): a different build (user-id ->
  email + provider). THE irreversible-side-effect fork - confirm with owner.
- FORK C (one vs all live - RESOLVED by owner): institution SWITCHER, send one
  at a time, draft persists across switch, selection per-institution. A residual
  sub-fork: `CANVAS_INSTITUTIONS` has ONE registered entry today
  (`canvas-core.ts:56`), so the switcher is degenerate (0-1 options) until more
  are registered. RECOMMENDED: build the switcher generically over the connected
  set; do NOT block on multi-institution. Cost if wrong: negligible (a one-option
  switcher is harmless).
- FORK D (variables/columns with no live source):
  - Current Status: no single Canvas field. OWNER MUST DEFINE (enrollment state?
    a grade band? a missing-work threshold?). Cost if wrong: a column that means
    the wrong thing in a message to a student. RECOMMENDED: owner defines; until
    then derive a simple band from `currentScore` OR drop the column.
  - Section: no reader today. RECOMMENDED: build an L1 section reader (W1). Cost
    if wrong: blank Section column/token.
  - first/last name: DERIVED from `sortableName`/`name`. RECOMMENDED: parse
    "Last, First"; the per-student binding test must pin the parse for multi-part
    and single-token names. Cost if wrong: mis-addressed students (a name split
    wrong in an outward message). Owner may prefer to drop `{{first_name}}`
    rather than risk a bad split - a one-line confirmable.

---

## 11. What this environment cannot verify (stated, not worked around)

- No `.env`, no live Canvas: every reader and the send path is exercised only
  through MOCKED clients (mock `canvasFetch`/`canvasGet`, NEVER `fetch` - MEMORY:
  tests-are-network-blocked; a live 401 once made a sabotage pass). Real Canvas
  calls and REAL SENDS are owner-walk only.
- No component renders under vitest (this-repo:134): the table, the modal, the
  switcher, the funnels, the pager, the preview, and the confirm are all READING
  claims and owner-walk. The machine-checkable surface is: L3 filter/sort/pager
  pure logic, L6 substitution (binding + escaping + missing-variable behaviour),
  the L1 column->field mapping over a mocked client, the one-institution send-
  boundary source-text pin, and the L4->L5->L7 reachability source-text pins.
- Sends to real students are irreversible and cannot be rehearsed here - the
  Preview+confirm requirement and the one-institution pin are the only guards
  this checkout can assert; actual delivery is owner-walk.

---

## 12. Residual register (owner / instrument / step)

Each entry names an owner, an instrument, and the measuring step. Missing any of
the three it is a deletion. None of these is in `docs/BACKLOG.md` yet; the
orchestrator files them at disposal (a residual that is not in BACKLOG does not
exist - DEV_LOOP step 0).

- RES-LMS-1 (FORK B): send transport. Owner: the repo owner (product + outward
  side effect). Instrument: owner's answer. Step: the batched owner question
  this scope rides to.
- RES-LMS-2 (FORK D / Current Status): the column's definition. Owner: the repo
  owner. Instrument: owner's answer. Step: same batched question.
- RES-LMS-3 (FORK D / first-last split): the name-parse rule and whether
  `{{first_name}}` ships. Owner: the repo owner. Instrument: owner's answer plus
  the test seat's per-student binding test. Step: owner question + W1 test.
- RES-LMS-4 (Section reader): a new L1 reader over enrollments' section id +
  `/sections`. Owner: the architect/plan seat at W1. Instrument: a mocked-client
  mapping test. Step: W1 build.
- RES-LMS-5 (fetch/job arithmetic): the 60s-cap analysis for the table read and
  the send job (payload x cap, concurrency, rate limits). Owner: the reliability
  seat. Instrument: timeout arithmetic against named payloads. Step: W2 design.
- RES-LMS-6 (real sends / render): delivery, modal paint, funnel/sort/pager feel,
  preview correctness against live data, draft-persists-across-switch-and-reload.
  Owner: the repo owner. Instrument: a real browser + a live Canvas connection.
  Step: owner-walk after the W4 push.
- RES-LMS-7 (switcher degeneracy, FORK C sub): whether more than one institution
  is ever registered for the owner. Owner: the repo owner. Instrument: the
  registered-acronym list + `resolveCanvasCredential` per code. Step: owner
  confirmation; harmless until then.
- RES-LMS-8 (placement, FORK A'): final surface home + registry/canary edits.
  Owner: the plan seat + owner confirm. Instrument: the tab-rails canary diff.
  Step: W3 plan.

---

## 13. One-line disposition

Build-from-scratch SURFACE (table L4 + modal L5) over EXISTING live-LMS readers
(L1), the EXISTING switcher hook, and the EXISTING per-student send primitive;
new pure substitution (L6), a one-institution-scoped kickoff+poll send job (L7),
and a PII-safe `messaging` diagnostic surface (L8). Four waves, the send and the
large-table read are not single synchronous actions, and four owner forks ride
to the owner as one batched question (transport, Current Status, first-last
split, placement) while W1's pure/mocked-client work is startable now.
