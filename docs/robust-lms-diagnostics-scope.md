# Scope: robust live-LMS connection diagnostics

Owner request 2026-10-12. The grading-chat "From LMS" picker keeps failing to
list courses for institution RIZE, and the diagnostic export is nearly useless:
it recorded institution="" and error="refused" for what was actually a ~36s
no-response from RIZE's Canvas host. This scope designs the SHAPE of the fix.
READ-ONLY artifact; a later checked build consumes it. Every quantity below
names the command that produced it. ASCII only, no emojis.

Author seat: loop-architect (Opus). This document decides seams and layering;
it does NOT write acceptance criteria (loop-ac owns the leverage claim and the
diagnostics-representation criterion), oracle construction (loop-test-author),
or the wave plan's final line-level write order beyond what is fixed here.

This is a NEW scope with no prior version, so there is no disposition table to
re-derive (the DEV_LOOP restructuring gate does not apply).

---

## 0. ROOT CAUSE - stated plainly, because the owner must not mistake this fix

The RIZE failure is NOT a code defect in this app. RIZE's configured Canvas
host does not answer: the picker dialed it, waited ~36s, and got no response.
That is a RIZE base-URL / token configuration problem (a wrong `RIZE_CANVAS_URL`,
or an outage at the host it names), fixed by correcting RIZE's configured base
URL or token, not by any change in this repo.

What this scope changes is OBSERVABILITY. After it ships, the picker and the
downloadable diagnostic will NAME the host that was dialed and classify the
outcome as a no-response rather than a refusal - so the next time this happens
the owner can read "Canvas did not respond (dialed rize.instructure.com)" and
immediately see a wrong base URL. These diagnostics make the misconfiguration
visible. THEY DO NOT MAKE RIZE RESPOND. A green build here will not list RIZE's
courses until RIZE's own config is corrected; the acceptance criteria and the
verify pass must not claim otherwise.

---

## 1. The measured symptom (from the owner's real diagnostic export)

One entry, verbatim from the owner's session-diagnostic export:

- surface "grading"
- operation "list_lms_courses"
- institution "" (BLANK)
- outcome failure
- error "refused"
- durationMs 36404
- (context) currentInstitution "RIZE"

So the picker dialed RIZE's Canvas host, got no response for ~36s, and the
diagnostic captured NEITHER the institution NOR the host and MISLABELED the
no-response as "refused".

---

## 2. The gaps, each verified in the tree (file:line opened, not recalled)

### GAP 1 - the chat-seam entry has no institution and no host

`recordChatSeamSettled` (`src/app/components/grading-chat/chatSeamDiagnostic.ts:79-94`)
takes only `{ operation, startedAtMs, failureClass }` and records
`{ at, operation, outcome, durationMs, error }`. It passes NO institution and
NO host. Its callee `recordGradingDiagnosticEntry`
(`src/app/components/grading/gradingDiagnosticLog.ts:77-90`) ALREADY accepts
`institution?` (`:67`) and forwards it (`:84`) to the core
`recordSessionDiagnosticEntry` (`src/lib/session-diagnostic-log.ts:232-254`),
whose `SessionDiagnosticEntry` (`:131-155`) HAS an `institution` column (`:142`)
and a `course` column (`:143`) but NO host/detail field. So institution is
blank only because the chat-seam wrapper never threads it; host is absent
because no column exists for it.

### GAP 2 - a ~36s no-response is misclassified "refused"

`classifyChatSeamFailure` (`chatSeamDiagnostic.ts:37-46`) has no branch matching
the no-response literal, so it falls through to the catch-all
`return "refused"` (`:45`). The no-response literal is EXACT and fixed:
`canvasFetchResultToResponse` throws `"Canvas did not respond."` for a
`kind: "unreachable"` result (`src/lib/canvas-fetch-response.ts:135-137`), which
is the network no-response case (including the RIZE ~36s timeout). The existing
timeout branch (`chatSeamDiagnostic.ts:40`,
`/time(d)?[ -]?out|deadline|aborted/i`) does NOT match "did not respond", and no
other branch does, so "Canvas did not respond." currently classifies as
"refused". A genuine refusal would be a 401/403 (`ok: true` with a non-ok
status, whose message the caller composes) or the `host-not-allowed` throw
`"Canvas request refused: ..."` (`canvas-fetch-response.ts:131-132`).
`CHAT_SEAM_FAILURE_CLASSES` (`chatSeamDiagnostic.ts:21-31`) is a frozen
`as const` list.

Is the frozen list length-pinned by a test? NO. The only assertion on it is
`expect(CHAT_SEAM_FAILURE_CLASSES).toContain(out)`
(`chatSeamDiagnostic.test.ts:34`) - a membership check, never a
`.toHaveLength`. Command:
`grep -rn "CHAT_SEAM_FAILURE_CLASSES" src/` returned the const, the type alias,
one doc comment, and that single `.toContain`. So ADDING a class is additive
and breaks no existing assertion; no same-commit length bump is required (but
the new class needs its own red-proving test case - see wave 2).

### GAP 3 - the picker drops the host; one of the two actions does not return it

`listCoursesAction` (`src/app/actions/canvas-inbox.ts:75-87`) ALREADY returns
`attemptedHost?: string` on its error branch (`:77,:84`), host-only by the SEC
rationale documented at `:56-74`, computed by the private
`describeAttemptedCanvasHost` (`:97-105`). BUT the picker captures only
`r.error` (`useLmsSubmissionPicker.ts:97`), never `r.attemptedHost`, so neither
the UI nor the diagnostic sees it.

`listCourseAssignmentsAction` is NOT in canvas-inbox.ts. It is defined at
`src/app/actions/repo-grades.ts:33-46` and does NOT return a host and does NOT
fold one into its message (`grep -rn "export async function
listCourseAssignmentsAction" src/` -> single hit, repo-grades.ts:33).

Reachability note (the barrel resolves correctly - verified, not assumed): the
picker imports both actions from `@/app/actions`
(`useLmsSubmissionPicker.ts:9`). `src/app/actions.ts` re-exports
`./actions/repo-grades` (`:69`) and `./actions/canvas` (`:30`), and
`src/app/actions/canvas.ts:1` is `export * from "./canvas-inbox"`. There is
exactly one `listCoursesAction` definition (`canvas-inbox.ts:75`) and exactly
one `listCourseAssignmentsAction` (`repo-grades.ts:33`); no name collision.

### The display path already exists and is proven (the surface is a layer)

The picker's course/assignment error STRING reaches the user with no further
wiring: `useLmsSubmissionPicker` exposes `errors.courses` /
`errors.assignments` (`:156-160`); `ChatComposer.tsx` feeds each into
`lmsFieldIndication({ error: lms.errors.courses, ... })` (`:469-476`) and
renders `courseInd.helperText` as the `TextField` `helperText`
(`:504-513,:521-530`); and `lmsFieldIndication`
(`src/app/components/grading-chat/lmsPickerState.ts:81-87`) passes the error
string THROUGH VERBATIM: `if (i.error) return { disabled: true, error: true,
helperText: i.error }` (`:85`), pinned by
`lmsPickerIndication.test.ts:51` (error:"boom" -> helperText:"boom"). So if the
action's error STRING already contains the host, the host reaches the picker
helperText with zero changes to the hook, the indication helper, or the UI.

---

## 3. THE SHAPE DECISION - fold the host into the message, not thread a field

There are two established in-tree patterns for surfacing a dialed host, and
choosing between them is the load-bearing shape call of this scope.

- PATTERN A (fold): put the host INSIDE the error string, e.g.
  `` `${base} (dialed ${host})` ``. This is exactly what the owner shipped on
  the sibling Success Tracking surface for the IDENTICAL RIZE symptom - commit
  29624ca2, `src/app/actions/live-messaging-enrollments.ts:52-54`
  (`attemptedCanvasHost` at `:32-38`). Verified by `git show --stat 29624ca2`.
- PATTERN B (thread a field): keep a discrete `attemptedHost` field and carry
  it through the hook's result state and into a new indication copy field and a
  new `TextField` render.

RECOMMENDATION: PATTERN A for the user-visible picker copy (wave 1). It reaches
the user through the EXISTING, proven layer (action string -> `errors.courses`
-> `lmsFieldIndication` string passthrough -> `helperText`), so no new seam can
ship dead, and it mirrors 29624ca2 byte-for-byte in approach. PATTERN B would
add a new seam in the hook plus a new copy field in `lmsFieldIndication` plus a
new render, any of which could ship green-but-dead, and it would have to be
re-checked against the frozen `lmsPicker.structure.test.ts` canary. The owner's
own cited precedent ("This mirrors the Success Tracking fold shipped in
29624ca2") is the fold, so Pattern A is also the reading most consistent with
the request.

Where the brief says "thread attemptedHost into the picker error state": the
fold achieves the user-visible outcome the brief describes ("Canvas did not
respond (dialed rize.instructure.com)") through the error STRING the hook
already captures, so no new hook error-state field is needed for the UI. A
discrete `attemptedHost` field IS still needed - but for the DIAGNOSTIC
(wave 2), not the UI - because the diagnostic records a discrete host value, not
the folded message (the message never reaches the entry; the classified class
does). That is why wave 1 both folds the host into the message AND keeps/returns
the discrete field, and wave 2 reads the discrete field.

This is a shape recommendation, recorded as the architect's reading, not an
owner ruling. If the owner prefers Pattern B for the UI, that is a one-message
redirect; the fold is the smaller, safer default and is what this scope builds.

---

## 4. WAVE 1 - surface the dialed host in the picker UI (no schema change)

Cheapest high-value win. Touches only two server-action files; no diagnostic
schema, no hook, no UI-component change.

### What it does

1. `listCoursesAction` (`canvas-inbox.ts:75-87`): on the catch branch, FOLD the
   already-computed host into the returned error message, e.g.
   `error: host ? \`${base} (dialed ${host})\` : base` where `host =
   await describeAttemptedCanvasHost(acronym)` (reuse the existing `:97-105`
   helper and the existing `attemptedHost` field; KEEP returning
   `attemptedHost` discretely for wave 2). Return TYPE is unchanged (message
   content only).
2. `listCourseAssignmentsAction` (`repo-grades.ts:33-46`): bring it to parity
   with `listCoursesAction`:
   - add a private host helper (DUPLICATE the ~7-line `attemptedCanvasHost`
     shape from `live-messaging-enrollments.ts:32-38`, which itself duplicates
     canvas-inbox's helper - duplication is the established precedent; see
     residual R1 for consolidation);
   - import `resolveInstitutionByCode` from `@/lib/canvas-core` (already
     imported by canvas-inbox.ts:5 and server-safe from a "use server" file);
   - change the return type to
     `{ assignments: CanvasAssignmentBrief[] } | { error: string; attemptedHost?: string }`;
   - on the catch branch, return the discrete `attemptedHost` AND fold it into
     the message, same shape as (1).

The host helper MUST never throw (wrap in try/catch returning `undefined`), per
`canvas-inbox.ts:89-105`'s rationale: it runs on an error path whose job is to
explain a failure.

### Why RIZE's message becomes correct

For an unreachable host, `listCourses` propagates the
`canvas-fetch-response.ts:137` literal, so `listCoursesAction`'s catch sets
`err.message === "Canvas did not respond."` (the action already returns
`err.message`, `canvas-inbox.ts:83`). After the fold the picker helperText reads
`"Canvas did not respond. (dialed rize.instructure.com)"`. The fold is
order-independent with wave 2's reclassification: appending " (dialed host)"
does not disturb the "did not respond" substring the wave-2 pattern matches.

### Wave 1 write set (production + every canary that must run same-commit)

- `src/app/actions/canvas-inbox.ts` (currently 912 lines by
  `@(Get-Content).Count`; +~3 lines keeps it under the 1000 ceiling)
- `src/app/actions/repo-grades.ts` (currently 79 lines)
- `src/app/actions/canvas-inbox.message-host.test.ts` OR extend an existing
  canvas-inbox test: a NEW test asserting the folded message names the host and
  does NOT leak path or query (mirror `live-messaging-enrollments.test.ts`'s
  new-test-proves-no-leak from 29624ca2). The test-author seat decides the file.
- `src/app/actions/repo-grades.guard.test.ts` MUST run and still pass: it calls
  `listCourseAssignmentsAction("TEST","123")` and asserts
  `not.toEqual(OWNER_ONLY_ERROR)` (`:128-132`) - it does NOT pin the success/
  error SHAPE, so adding `attemptedHost?` is safe, but it is in the write set
  because it exercises the changed action.

Frozen canaries a `src/app/actions/*` change must run in the wave gate (per the
repo's "gate must include the canary" rule, MEMORY `gate-must-include-directory-canary`):

- `src/app/actions/action-guard-coverage.test.ts`
- `src/app/actions/action-guard-coverage-github-cohort.test.ts` (names
  `listCourseAssignmentsAction`)
- `src/app/actions/wholesale-auth-mock-population.structure.test.ts`
- `src/app/actions/repo-grades.guard.test.ts`
- `src/tools/strip-comments-agreement.structure.test.ts` (if any new test file
  names the comment-strip literal, it reddens this repo-wide; name helpers
  `withoutLineComments`)
- `src/source-bytes.structure.test.ts` (text-only, no BOM/NUL)
- `src/file-size-ceiling.structure.test.ts` (unconditional, every wave)

### Wave 1 pass conditions (object / instrument / direction of failure)

- OBJECT: the string returned by `listCoursesAction` / `listCourseAssignmentsAction`
  on an unreachable failure. INSTRUMENT: the new canvas-inbox host test +
  (for assignments) a repo-grades test. FAILS IF: the message does not contain
  the dialed host when the host resolves, OR contains any path or query
  substring (the `?`, or a `/courses/<id>` fragment) from the base URL.
- OBJECT: `listCourseAssignmentsAction`'s guard. INSTRUMENT:
  `repo-grades.guard.test.ts`. FAILS IF: the action stops admitting an active
  non-owner (i.e. the return equals `OWNER_ONLY_ERROR`).
- OBJECT: whole `src/` tree size. INSTRUMENT:
  `src/file-size-ceiling.structure.test.ts`. FAILS IF: any file exceeds 1000
  lines (canvas-inbox.ts is the one to watch at 912+).
- WAVE-GATE COMMAND (two or more test paths -> `test:paths`, never a raw
  multi-path vitest):
  `npm run test:paths src/app/actions/canvas-inbox.message-host.test.ts src/app/actions/repo-grades.guard.test.ts src/app/actions/action-guard-coverage.test.ts src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/actions/wholesale-auth-mock-population.structure.test.ts src/tools/strip-comments-agreement.structure.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts`
  (substitute the real new-test path the test-author chooses), THEN the full
  `npm test` sweep before the wave is declared done.

---

## 5. WAVE 2 - record institution, host, and reclassify no-response

This wave enriches the diagnostic ENTRY. It touches the entry schema, both
downloadable export formats (CSV and JSON), the round-trip parser, the two
record wrappers, the classifier, and the picker's two record call sites.

### GAP 1 part a - record the INSTITUTION (no schema change)

The entry already has an `institution` column
(`session-diagnostic-log.ts:142`) and `recordGradingDiagnosticEntry` already
forwards `institution` (`gradingDiagnosticLog.ts:67,:84`). The only missing
links:

1. `recordChatSeamSettled` (`chatSeamDiagnostic.ts:79-94`): add `institution?:
   string` to its args and forward it into the `recordGradingDiagnosticEntry`
   call (`:86-92`).
2. `useLmsSubmissionPicker` (`:91-95` and `:112-116`): pass
   `institution: courseKey` at the courses site and `institution: sel.institution`
   at the assignments site (both already in scope).

CONSTRAINT (frozen wiring canary): `lmsPicker.wiring.test.ts:25,:45` asserts the
call shape with a regex requiring `operation` to be the FIRST property after
`recordChatSeamSettled({`:
`/recordChatSeamSettled\(\{\s*operation: "list_lms_courses"/`. New fields
(`institution`, `host`) MUST be added AFTER `operation`, not before, or this
canary goes red. Enumerate `lmsPicker.wiring.test.ts` in the wave gate.

### GAP 1 part b - record the dialed HOST (NEW optional column)

The entry has no host field. Design decision: add a NEW optional field named
`host` to `SessionDiagnosticEntry`, NOT a generic `detail`, and NOT a reuse of
`error`/`course`.

- Why a NAMED `host`, not generic `detail`: a generic free-text field invites
  unscrubbed data to accumulate and erodes the module's NO-STUDENT-DATA
  contract (`session-diagnostic-log.ts:44-49`). A field named `host` signals
  exactly what it carries (owner-configured host, never a person) and is
  self-documenting as a new "Host" column in the download.
- Why not reuse `error`: `error` is "" on success and the classified class on
  failure (`:146,:241`); the host is orthogonal and must coexist with the class
  on a failure entry.
- Why not reuse `course`: the host is not the course; conflating them corrupts
  the `course` column consumers (e.g. `contentDiagnosticLog`'s view).

Threading, end to end (name every object the value passes through):

1. picker reads `r.attemptedHost` (present from wave 1 on both actions' error
   branch) and passes `host` to `recordChatSeamSettled`
   (`useLmsSubmissionPicker.ts:91-95,:112-116`);
2. `recordChatSeamSettled` (`chatSeamDiagnostic.ts:79-94`) adds `host?: string`
   to args and forwards it;
3. `recordGradingDiagnosticEntry` (`gradingDiagnosticLog.ts:61-90`) adds
   `host?: string` to `RecordGradingDiagnosticArgs` and forwards it;
4. `recordSessionDiagnosticEntry` (`session-diagnostic-log.ts:210-254`) adds
   `host?: string` to `RecordSessionDiagnosticArgs` and stores it on the entry,
   OMITTED (never explicit `undefined`) when absent, matching the existing
   `durationMs`/`classificationStudentCount` pattern (`:242-245`);
5. `SessionDiagnosticEntry` (`:131-155`) gains `host?: string`.

SCRUB/CAP the host the same way `error` is handled
(`sanitizeSessionDiagnosticError`, `:169-171`): scrub-then-cap. The host is
owner config and bounded by construction (`new URL(baseUrl).host`,
`canvas-inbox.ts:99-100`, no path/query), so this is defense-in-depth, but it
keeps every free-text failure field under the one contract. Update the module
header's NO-STUDENT-DATA note (`:44-49`) to name the host field.

Export + parse changes (both downloads are owner-visible; the field MUST appear
in both or the download silently omits it):

- CSV `ENTRY_CSV_HEADER` (`:393`) gains a "Host" column; the per-entry row
  (`:435-449`) emits `entry.host ?? ""`. Decide column position; APPENDING at
  the END (after "Students") is simplest but SHIFTS the frozen
  end-of-line assertions in the schema test (see canaries below).
- JSON: `host` is part of the entry object already via the spread in
  `formatSessionDiagnosticLogJson` (`:459-477`) since it spreads the entry;
  confirm `parseOneEntry` (`:509-539`) reconstructs `host` optionally (mirror
  the `durationMs` optional-key pattern at `:532-534`).

### GAP 2 - reclassify the no-response (add a class)

Add a class `"no response"` to `CHAT_SEAM_FAILURE_CLASSES`
(`chatSeamDiagnostic.ts:21-31`) and a branch in `classifyChatSeamFailure`
(`:37-46`) that matches the exact unreachable literal BEFORE the catch-all:
e.g. `if (/did not respond|no response|unreachable|could not reach/i.test(text))
return "no response";` placed before `return "refused"` (`:45`). Keep "refused"
for genuine 401/403. The literal it must catch is `"Canvas did not respond."`
(`canvas-fetch-response.ts:137`); the existing timeout branch does not catch it.

NOTE (observed, kept narrow): `host-not-allowed` throws `"Canvas request
refused: ..."` (`canvas-fetch-response.ts:131-132`) and currently falls through
to "refused" - arguably a config/security block rather than a credential
refusal, but the owner's symptom is a no-response, so distinguishing
host-not-allowed is OUT of this scope. Recorded as residual R2.

The frozen-list bump is NOT required (gap 2 above proved no `.toHaveLength`
pin), but the new class MUST get a red-proving test case: feed
`"Canvas did not respond."` to `classifyChatSeamFailure` and assert
`"no response"` (currently returns "refused"), and assert the existing
"refused" cases for a 401-shaped message still return "refused". The test-author
seat owns this and the removal-style proof that the branch actually fires.

### Wave 2 write set (production + every canary same-commit)

Production:
- `src/app/components/grading-chat/chatSeamDiagnostic.ts` (94 lines)
- `src/app/components/grading/gradingDiagnosticLog.ts` (185 lines)
- `src/lib/session-diagnostic-log.ts` (549 lines)
- `src/app/components/grading-chat/useLmsSubmissionPicker.ts` (167 lines)

Tests / frozen canaries that read these as SOURCE TEXT or assert their
schema/exports (the `owns` closure - section 7):
- `src/app/components/grading-chat/chatSeamDiagnostic.test.ts` (new class case +
  new institution/host assertions on the recorded entry)
- `src/app/components/grading-chat/chatSeamDiagnostic.wiring.test.ts` (reads the
  leaf as source; asserts `error: decision.error` and the no-server-import
  substring)
- `src/app/components/grading-chat/lmsPicker.wiring.test.ts` (reads the hook as
  source; the `operation`-first regex constraint above)
- `src/lib/session-diagnostic-log.test.ts` (763 lines) - the schema/export/
  round-trip canary. THE FROZEN END-OF-LINE ASSERTIONS THAT MOVE WHEN A CSV
  COLUMN IS ADDED: `:611` `endsWith(",2360,")`, `:612` `endsWith(",,")`,
  `:642` `endsWith(",5,23")`. These MUST be updated same-commit to reflect the
  new "Host" column, plus new coverage that `host` round-trips (JSON+CSV) and is
  omitted when absent (mirror the `classificationStudentCount` test at
  `:615-643`).
- `src/app/components/grading/gradingDiagnosticLog.test.ts` (asserts the grading
  wrapper forwards its fields; add host/institution forwarding coverage)
- `src/app/components/content-tab/contentDiagnosticLog.test.ts` - reads a
  filtered VIEW of the core and may assert on CSV/entry shape; MUST run (a new
  optional column must not break its view).
- `src/app/components/live-messaging/messagingDiagnosticLog.test.ts` - records
  through the same core; `host` is OPTIONAL so it must not break, but run it to
  prove the optional-field claim.
- Unconditional: `src/file-size-ceiling.structure.test.ts`,
  `src/source-bytes.structure.test.ts`.

### Wave 2 pass conditions (object / instrument / direction)

- OBJECT: `classifyChatSeamFailure("Canvas did not respond.")`. INSTRUMENT:
  `chatSeamDiagnostic.test.ts` new case. FAILS IF: it returns anything other
  than `"no response"` (today it returns "refused"). AND a 401-shaped message
  still returns "refused" (direction: fails if the new branch over-captures).
- OBJECT: the recorded `SessionDiagnosticEntry` for a picker course-list
  failure. INSTRUMENT: `chatSeamDiagnostic.test.ts` recording case. FAILS IF:
  `entry.institution` is "" when the picker had a selected institution, OR
  `entry.host` is absent when the action returned `attemptedHost`.
- OBJECT: the CSV and JSON downloads. INSTRUMENT:
  `session-diagnostic-log.test.ts`. FAILS IF: the "Host" column/key is missing,
  OR a present host does not round-trip, OR an absent host is written as an
  explicit key rather than omitted.
- OBJECT: the hook's `recordChatSeamSettled` call shape. INSTRUMENT:
  `lmsPicker.wiring.test.ts`. FAILS IF: `operation` is no longer the first
  property (the regex at `:25,:45`).
- OBJECT: no server-side import of the browser-only store. INSTRUMENT:
  `session-diagnostic-log.test.ts:734-763` and
  `chatSeamDiagnostic.wiring.test.ts:28`. FAILS IF: any new import pulls the
  core/wrapper into a `src/app/api` / `src/app/actions` / "use server" file
  (it must not; wave 2 edits are all browser-side leaves + the hook).
- WAVE-GATE COMMAND:
  `npm run test:paths src/app/components/grading-chat/chatSeamDiagnostic.test.ts src/app/components/grading-chat/chatSeamDiagnostic.wiring.test.ts src/app/components/grading-chat/lmsPicker.wiring.test.ts src/lib/session-diagnostic-log.test.ts src/app/components/grading/gradingDiagnosticLog.test.ts src/app/components/content-tab/contentDiagnosticLog.test.ts src/app/components/live-messaging/messagingDiagnosticLog.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts`
  THEN the full `npm test` sweep before the wave is declared done.

---

## 6. GAP E - which chained call failed (resolve vs list vs term-lookup)

The brief asks whether to record which internal call in `listCourses ->
listTeacherCoursesForPicker` failed (credential-resolution vs Canvas-host
no-response).

RECOMMENDATION: OUT of scope for these two waves. The host + the "no response"
class + the institution already separate the dominant cases the owner faces: a
no-response with a named host reads as "wrong base URL or outage" (the RIZE
case), while a credential-resolution failure surfaces as a different message
(e.g. "No stored Canvas credential...", `session-diagnostic-log.test.ts:159`
shows that literal) which classifies as "refused" and carries no host (the
host helper returns `undefined` when `resolveInstitutionByCode` throws,
`canvas-inbox.ts:97-105`). So a blank host on a "refused" entry ALREADY implies
a credential/resolution failure rather than a host no-response - the
distinction the brief wants is largely present as an emergent property once
waves 1-2 land. Adding an explicit per-call stage tag would mean a new seam
inside `@/lib/canvas` with no clear owner-visible payoff for the no-response
symptom. Recorded as residual R3 for the owner to pull in later if the emergent
signal proves insufficient.

---

## 7. The `owns` closure - files the build touches or that read them as source

Command (run from repo root):
`grep -rln "chatSeamDiagnostic\|gradingDiagnosticLog\|session-diagnostic-log\b" src --include=*.test.ts | sort -u`
plus, for the source-text readers of the edited grading-chat files:
`grep -rln "readFileSync" src/app/components/grading-chat/*.test.ts | xargs grep -l "useLmsSubmissionPicker\|chatSeamDiagnostic\|GradingChatPanel\|ChatComposer\|lmsPicker"`

Pasted output (the union; a test that greps a string it does not own is how a
correct change goes red):

```
src/app/components/content-tab/contentDiagnosticLog.test.ts
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/chatSeamDiagnostic.test.ts
src/app/components/grading-chat/chatSeamDiagnostic.wiring.test.ts
src/app/components/grading-chat/chatSnap.test.ts
src/app/components/grading-chat/lmsPicker.structure.test.ts
src/app/components/grading-chat/lmsPicker.wiring.test.ts
src/app/components/grading-chat/video-w4.wiring.test.ts
src/app/components/grading-chat/videoDiagnostic.test.ts
src/app/components/grading/gradingActionSeam.test.ts
src/app/components/grading/gradingActionSeam.wiring.test.ts
src/app/components/grading/gradingDiagnosticLog.test.ts
src/app/components/grading/gradingDiagnosticWiring.wiring.test.ts
src/app/components/grading/oneUploadWiring.wiring.test.ts
src/app/components/grading/useOneUploadRun.lifecycle.test.ts
src/app/components/live-messaging/LiveSend.wiring.test.ts
src/app/components/live-messaging/messagingDiagnosticLog.test.ts
src/lib/accommodations.test.ts
src/lib/action-route-response.test.ts
src/lib/session-diagnostic-log.test.ts
```

Reading note: not all of these ASSERT on the fields these waves change. The
ones that gate wave 2's substance are enumerated in section 5's write set;
`chatSnap.test.ts`, `GradingChatPanel.structure.test.ts`,
`lmsPicker.structure.test.ts` read `ChatComposer.tsx`/`GradingChatPanel.tsx`
which NEITHER wave edits (the fold is in the actions, the threading is in the
hook), so they should be inert - the full `npm test` sweep is the backstop that
proves it. The actions-side `owns` for wave 1 (barrel + guard canaries) is in
section 4. The repo-wide `src/file-size-ceiling.structure.test.ts` walks all of
`src/` and covers any new file.

---

## 8. What CANNOT be verified in this environment (state, do not fill in)

- There is no live Canvas and no `.env`, so the real "Canvas did not respond."
  path and the real host string can be exercised ONLY through mocked
  `canvasFetch` results (`kind: "unreachable"`) and a mocked
  `resolveInstitutionByCode`. The actual RIZE host string appears only on a real
  failure against RIZE's real config - unobservable here.
- No component is rendered by any test (`vitest` is node-env,
  `src/**/*.test.ts` only). The picker helperText surfacing (wave 1) is verified
  by asserting the ACTION'S RETURNED STRING (a `.ts` leaf) and by the existing
  source-text structure tests that the string reaches `helperText` - NOT by
  rendering `ChatComposer`. The scope deliberately proposes no requirement whose
  only enforcer would be a render.
- The fix does not and cannot make RIZE respond (section 0).

---

## 9. Residual register (each: owner, instrument, measuring step)

A residual not in `docs/BACKLOG.md` does not exist; the orchestrator files these
at disposal time. Each names an owner, an instrument, and the step that measures
it - missing any of the three it is a deletion.

- R1 - host-helper triplication. After wave 1 there are THREE near-identical
  `attemptedCanvasHost` helpers (`canvas-inbox.ts:97-105`,
  `live-messaging-enrollments.ts:32-38`, new in `repo-grades.ts`). OWNER: a
  later chunk touching canvas host resolution. INSTRUMENT: a shared helper in
  `@/lib/canvas-core` + a test asserting all three sites import it. STEP:
  extract and re-import; measured by `grep -c "function attemptedCanvasHost\|
  function describeAttemptedCanvasHost" src/` dropping to the extracted site
  only. Deferred, not deleted: duplication matches the 29624ca2 precedent and
  keeps wave 1 minimal.
- R2 - host-not-allowed classification. `"Canvas request refused: ..."`
  (`canvas-fetch-response.ts:131-132`) classifies as "refused" today; it is a
  config/security block, arguably its own class. OWNER: whoever revisits the
  failure taxonomy. INSTRUMENT: a `classifyChatSeamFailure` test case. STEP: add
  a class and branch if the owner wants the distinction. Out of this scope: the
  owner's symptom is a no-response, not host-not-allowed.
- R3 - per-call stage tagging (GAP E). OWNER: owner decision. INSTRUMENT: a new
  stage field + test. STEP: add only if the emergent blank-host-on-refused
  signal (section 6) proves insufficient in practice.

---

## 10. Notes for downstream seats (not architect rulings)

- loop-ac: this is observability over a config failure, part bug-fix
  (reclassification) and part new user-reached capability (host in picker +
  institution/host on the diagnostic). Decide whether a LEVERAGE CLAIM is owed
  (the GUARANTEED/observability shape may apply: the entry now carries a typed
  host+institution a chat transcript cannot) or whether this is a bug-fix with
  the claim triaged out and recorded. The DIAGNOSTICS-REPRESENTATION criterion
  (DEV_LOOP.md) clearly applies: name what the enriched entry reports (host,
  institution, "no response" class) and the failure it now makes visible (a
  wrong base URL vs an outage vs a credential issue).
- loop-test-author: owns the removal/red proof that the new "no response" branch
  fires (feed the exact literal `"Canvas did not respond."`), that institution
  and host actually land on the recorded entry, and that the host round-trips in
  both download formats and is omitted when absent. No render test exists or is
  needed.
- loop-plan: wave 1 and wave 2 are disjoint by write set (wave 1 =
  `src/app/actions/*`; wave 2 = grading-chat leaves + hook + core). They could
  run in either order, but wave 1 FIRST is recommended: it is the cheap UI win
  and establishes the discrete `attemptedHost` field on
  `listCourseAssignmentsAction` that wave 2's host threading reads.
