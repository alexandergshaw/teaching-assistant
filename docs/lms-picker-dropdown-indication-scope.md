# From-LMS picker dropdown indication - scope

> Historical disposition, 2026-10-15: this scope retains its original round-two
> DEFECTIVE record. The already accepted coordinator ruling in
> [LMS-PICKER-DROPDOWN-INDICATION](backlog.yml) supersedes the erroneous
> credential-origin passage in section 3c and Institution-only preservation
> assertion in Test 3 below. Credential-required/401 errors arise through
> errors.courses or errors.assignments, never errors.institutions; the latter
> carries only listConfiguredInstitutionsAction's own throw. Wire and pin ALL
> THREE sources: errors.institutions -> Institution, errors.courses -> Course,
> errors.assignments -> Assignment. The fix shipped in 5986d90f; see
> ChatComposer.tsx's three lmsFieldIndication calls. This is transcription of the
> recorded ruling, not a new design acceptance or a third revision/check round.


BUG/UX fix on a shipped feature (the "From LMS" grading-chat picker, shipped
40887f9d). READ-ONLY scope pass; no production code written here.

Owner report (2026-10-11): "there is currently no indication as to why I can't
select a course from the From LMS grading chat dropdown after selecting an
institution." Added detail (coordinator, same day): "even when I CAN open the
course dropdown, the dropdown is empty / just a sliver" - i.e. the OPEN menu
renders as a thin sliver with zero selectable items.

## Triage: which seats this fix owes

- Leverage claim: NONE owed. This is a bug/UX fix, not a new user capability
  (`DEV_LOOP.md`, "The loop / Criteria": the claim is for a chunk that "builds
  or changes a capability a user reaches - not a bug fix"). Fired trigger:
  bug fix.
- Diagnostics representation (owner, 2026-10-11): OWED and SATISFIED by this
  fix. It adds a `list_lms_courses` seam diagnostic (section 5) so a silent
  course-fetch failure becomes observable, mirroring the existing
  `list_lms_assignments` diagnostic. The new failure it makes visible: a
  course fetch that errors or returns empty for a "configured" institution.
- This is a NEW scope, not a restructure of a prior artifact, so there is no
  disposition table to produce.

---

## 1. Confirmation against the real render and hook

All line citations opened in this checkout at HEAD. Line counts by
`wc -l <file>` (the Bash tool's `wc -l` agrees with the mandated
`@(Get-Content).Count` per `docs/loop/this-repo.md:191`).

The `mode === "lms"` block is `ChatComposer.tsx:458-514` (`wc -l
src/app/components/grading-chat/ChatComposer.tsx` = 519). It renders three
MUI `TextField select` controls:

- Institution (`:460-474`), `disabled={disabled || lms.loading.institutions}`
  (`:467`), options `lms.institutions.map(...)` (`:469-473`). No helper text,
  no empty-state, no loading text.
- Course (`:475-489`), `disabled={disabled || !lms.institution ||
  lms.loading.courses}` (`:482`), options `lms.courses.map(...)` (`:484-488`).
  No helper text, no empty-state, no loading text.
- Assignment (`:490-504`), `disabled={disabled || !lms.courseId ||
  lms.loading.assignments}` (`:497`), options `lms.assignments.map(...)`
  (`:499-503`). No helper text, no empty-state, no loading text.

The only error surface is ONE shared alert line at the bottom of the block,
`{(lmsError ?? lms.error) && <span role="alert" ...>}` (`:508-512`). It is not
tied to any field.

CONFIRMED - the three failure gaps the owner hit:

- (a) While the course fetch is in flight, `lms.loading.courses` is true so the
  field is disabled/greyed, but nothing says "Loading...".
- (b) When `listCoursesAction` returns an EMPTY-but-OK list, the field is
  ENABLED with zero `MenuItem` children. A MUI `TextField select` with zero
  children opens its `Menu` as an empty paper - the reported SLIVER. This is
  the primary bug: `disabled={disabled || !lms.institution ||
  lms.loading.courses}` has NO term for "there are zero options", so an
  enabled-but-empty select is reachable.
- (c) An error surfaces only in the single shared bottom alert, not on the
  Course field, so the field itself gives no reason.

The Assignment field (`:490-504`) has the IDENTICAL defect class: enabled when
`courseId` is set and `loading.assignments` is false, even if `lms.assignments`
is empty -> empty-sliver menu; error only in the shared bottom alert. The fix
must cover it the same way.

The Institution field (`:460-474`) ALSO shares the class: a member with no
stored credential gets an empty institutions list
(`course-hub-integrations.ts:206` comment, `:233-235`), so the field is enabled
with zero options -> empty-sliver. The fix covers it too, for consistency and
because it is the same bug.

The hook already exposes the per-level loading state the fix needs:
`loading.courses` = `courseKey !== null && !courseMatch`
(`useLmsSubmissionPicker.ts:143`), `loading.assignments` similarly (`:144`),
`loading.institutions` = `instResult === null` (`:142`). It exposes `courses`
(`:122`, empty array when the fetch returned `[]`), `assignments` (`:123`), and
`institutions` (`:121`). The one thing it does NOT cleanly expose is a
PER-FIELD error - see the fork in section 3.

### Is the empty sliver a MUI height/CSS bug, or purely zero-options?

The owner flagged the chat @-typeahead's 25px sliver precedent
(`page.module.css:4490,4496`, memory chat-institution-typeahead-shipped). That
precedent was a percentage-height popup resolving against a ~55px anchor - a
CSS sizing bug. This case is DIFFERENT: the composer selects are plain MUI
`TextField select` with no custom `MenuProps`/height override (grep for
`MenuProps` in `ChatComposer.tsx` returns nothing), so their menu height is
MUI's default (auto, sized to content). A sliver here is the zero-children
case, not a CSS min-height miss. The reading claim: there is NO separate
visual/CSS bug; the sliver is entirely "menu opened with zero items", and
disabling the field whenever option count is 0 removes it at the source. The
visual seat should confirm the menu paper is not independently constrained; no
test renders a component here (`this-repo.md:134`), so this stays a reading
claim and the fix does not depend on it being wrong.

---

## 2. Root cause of an empty course list (drives the empty-state copy)

Chain, every hop opened:

`listCoursesAction(acronym)` (`canvas-inbox.ts:71-83`) returns `{ courses }` or
`{ error: string; attemptedHost?: string }`. It calls `listCourses(acronym)`
(`canvas/listings.ts:157-159`) -> `listTeacherCoursesForPicker`
(`:145-154`) -> `fetchCoursesForQuery(ctx, "enrollment_type=teacher&state[]=
unpublished&state[]=available&state[]=completed&per_page=100")` (`:103-127`).

Two terminal outcomes of that fetch:

- It pages successfully and the token user teaches ZERO matching courses at
  that institution -> returns `[]` -> `{ courses: [] }`. This is EMPTY-but-OK.
- Any page returns non-ok -> `throw canvasError(response.status, institution)`
  (`:114`), caught by `listCoursesAction` -> `{ error, attemptedHost? }`.
  `canvasError` messages (`canvas-core.ts:101-115`): 401/403 ->
  "Canvas rejected the request: the API token is missing, invalid, or lacks
  access to this course (<CODE>_CANVAS_API_TOKEN)."; 404 -> "Canvas could not
  find that resource..."; other -> "Canvas request failed (HTTP <status>)."
  `resolveInstitutionByCode` can also throw earlier
  (`canvas-core.ts:174-215`): the credential-required message
  (`CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, `canvas-credentials.ts:78`) or
  `describeInstitutionResolutionFailure()`. All are human-readable and carry
  no secret (the token VALUE never appears; only the env-var NAME does).

### The KEY QUESTION answered: can a "configured" institution error or be empty?

YES, both. `listConfiguredInstitutionsAction`
(`course-hub-integrations.ts:208-240`) lists an institution purely on
CREDENTIAL PRESENCE with NO live probe: for an owner it scans
`<CODE>_CANVAS_URL` + `<CODE>_CANVAS_API_TOKEN` env pairs (`:215-222`) plus
hardcoded `CANVAS_INSTITUTIONS` with a token set (`:227-231`); for everyone it
adds stored `listLmsCredentials` rows (`:233-235`). Presence of a credential
does not mean it is valid or that it grants teacher courses. So:

- A configured institution whose token is stale/invalid -> `listCoursesAction`
  returns `{ error }` (the 401/403 message). ERROR case.
- A configured institution whose token is valid but who teaches no
  unpublished/available/completed courses -> `{ courses: [] }`. EMPTY-OK case.

The four distinct outcomes the indication must distinguish:

| # | Outcome | Hook signal | Copy direction |
|---|---|---|---|
| i | loading | `loading.courses === true` | "Loading courses..." |
| ii | error | this field's error non-null, `courses` empty | the `listCoursesAction` message, tied to the field |
| iii | empty-ok | not loading, no error, `courses.length === 0`, institution selected | "No active courses for this institution" |
| iv | populated | `courses.length > 0` | no helper text; field enabled |

Plus the pre-parent state (no institution selected): "Select an institution
first" for Course, "Select a course first" for Assignment.

The table above is the Course worked example; the SAME four outcomes and the
same `lmsFieldIndication` branches apply to the Institution and Assignment
fields, each with its own copy (section 3c lists all three fields' strings).
Institution differs in one respect only: it has NO parent, so it has no
pre-parent prompt (`parentSelected` is `true` for it, section 3a), and its
outcomes reduce to loading / error / empty-ok / populated. Institution's
loading and empty-ok are both REACHABLE (loading on first mount while
`instResult === null`, `useLmsSubmissionPicker.ts:142`; empty-ok when
`listConfiguredInstitutionsAction` returns `{ acronyms: [] }` for a member with
no stored credential, `course-hub-integrations.ts:205-206,:233-236`), so the
Institution strings are not decorative - without them the Institution field
renders disabled with BLANK helper text, which is the owner's "no indication"
complaint transposed to the first field.

The empty-ok copy must NOT claim a connection problem, and the error copy must
NOT claim "no courses" - conflating them is the whole point of distinguishing
(iii) from (ii).

Note (`attemptedHost` is dropped): the hook reads only `r.error`
(`useLmsSubmissionPicker.ts:88`) and discards `attemptedHost`. Surfacing the
attempted host in the course error - as the announcements picker rationale
argues it is the one safe, usually-decisive thing to add
(`canvas-inbox.ts:51-70`) - would help the owner tell a misconfigured URL from
an outage. It is OUT of this tight fix (the error string is already shown once
bound to the field); recorded as a residual (section 7).

---

## 3. The fix (render-side, minimal) and the ONE fork

### 3a. The pure indication decision (new leaf logic, testable)

Add a pure function to `lmsPickerState.ts` (75 lines by `wc -l`; room to the
1000 ceiling) that maps a field's state to its indication. Suggested shape -
the test seat refines the exact names:

```
interface LmsFieldIndication { disabled: boolean; error: boolean; helperText: string }

lmsFieldIndication({
  globallyDisabled,   // the composer `disabled` prop
  parentSelected,     // institution chosen (Course) / course chosen (Assignment); true for Institution
  loading,            // this field's loading flag
  error,              // this field's OWN error string or null
  optionCount,        // this field's options length
  promptBeforeParent, // "Select an institution first" / "Select a course first" / "" for Institution
  loadingText,        // "Loading courses..." etc
  emptyOkText,        // "No active courses for this institution" etc
}): LmsFieldIndication
```

Precedence (first match wins):
1. `globallyDisabled` -> `{ disabled: true, error: false, helperText: "" }`
2. `!parentSelected` -> `{ disabled: true, error: false, helperText: promptBeforeParent }`
3. `loading` -> `{ disabled: true, error: false, helperText: loadingText }`
4. `error` -> `{ disabled: true, error: true, helperText: error }`
5. `optionCount === 0` -> `{ disabled: true, error: false, helperText: emptyOkText }`
6. else -> `{ disabled: false, error: false, helperText: "" }`

This construction makes the empty-sliver UNREPRESENTABLE: every branch except
(6) returns `disabled: true`, and (6) is reached only when `optionCount !== 0`.
So "the field is enabled" implies "it has at least one option" by construction
(`seats.md`: prefer the construction that makes the bad state unrepresentable
over an assertion that it is absent). No placeholder `MenuItem` is needed,
because a disabled select never opens a menu - recommended over adding a
disabled placeholder item (fewer moving parts, no empty paper possible). Add a
placeholder item only if the build finds MUI mis-renders the floating label for
a disabled empty select; that is a reading claim to check, not an assumption.

### 3b. The fork: how the render gets a PER-FIELD error

The hook today exposes a SINGLE merged `error`
(`useLmsSubmissionPicker.ts:146`): `(instResult?.error ?? null) ||
(courseMatch ? courseResult!.error : null) || (assignmentMatch ?
assignmentResult!.error : null)`. Binding the error to the CORRECT field (the
course error on the Course field, the assignment error on the Assignment field)
needs the field's own error, which the merged string does not cleanly give the
view.

RECOMMENDED READING (A) - expose per-field errors. Add an `errors` object to
the hook return, parallel to `loading`:
`errors: { institutions: instResult?.error ?? null, courses: courseMatch ?
courseResult!.error : null, assignments: assignmentMatch ?
assignmentResult!.error : null }`. The three sub-expressions ALREADY exist at
`:146`; this surfaces them instead of `||`-merging. It is NOT a rework of the
fetch/loading derivation (no effect, no request logic changes) - it is exposing
state the hook already computes. KEEP the existing merged `error` getter so
nothing that reads `lms.error` breaks; the composer stops rendering it at the
bottom (below).

ALTERNATIVE (B) - no hook change; the view re-derives which field an error
belongs to from the cascade (error belongs to Institution iff `!lms.institution`,
else Course iff `!lms.courseId`, else Assignment, because the getters clear
downstream selections). Rejected as the default: it couples the view to cascade
internals and is fragile; A is a few lines, pure, and self-documenting.

I am scoping the FIX against reading A. If the owner prefers zero hook changes,
switch to B; only the hook delta and the field-error source change, not the
rest of the fix. This is the one design fork in the item; flagged for the
check, recommended resolved as A.

### 3c. Wiring in the composer (`ChatComposer.tsx`, lms block `:458-514`)

- Compute one `lmsFieldIndication(...)` per field (Institution, Course,
  Assignment), feeding each its own `loading.*`, `errors.*` (reading A),
  option array length, and `parentSelected` (`true` for Institution;
  `!!lms.institution` for Course; `!!lms.courseId` for Assignment).
- Pass `disabled={ind.disabled}`, `error={ind.error}`,
  `helperText={ind.helperText}` to each `TextField`.
- Bottom alert (`:508-512`): show ONLY `lmsError` (the submit/build error from
  `handleSendLms`), since the per-field data errors now live on the fields.
  `lmsError` is unchanged (`:81,210,213`).
- HISTORICAL PRESERVATION REQUIREMENT - SUPERSEDED by the disposition banner
  above (the merged `lms.error` is no longer rendered at the
  bottom, so every error it carried must now have a field to land on). The
  merged getter today is `(instResult?.error ?? null) || (courseMatch ?
  courseResult!.error : null) || (assignmentMatch ? assignmentResult!.error :
  null)` (`useLmsSubmissionPicker.ts:146`); its FIRST term is the
  institution-level error, which includes `CANVAS_CREDENTIAL_REQUIRED_MESSAGE`
  surfaced from `resolveInstitutionByCode`. Under reading A that term becomes
  `errors.institutions` (`instResult?.error ?? null`, section 3b line ~222), and
  the Institution field's `error` arg MUST be wired to `errors.institutions` (as
  the Course field is to `errors.courses` and Assignment to `errors.assignments`)
  so the credential-required error moves ONTO the Institution field rather than
  vanishing when the bottom alert stops rendering `lms.error`. Test 3 pins this
  (section 6). Under reading B the merged `lms.error` stays rendered at the
  bottom as a fallback, which keeps the same error visible by a different route;
  pick A, wire `errors.institutions`, and let Test 3 be the instrument.

Copy (ASCII, app voice, no emoji - enforced by `src/lib/no-emojis.test.ts`),
ONE loadingText and ONE emptyOkText per field so all three fields (Institution,
Course, Assignment) have their own indication strings:
"Loading institutions...", "No connected institutions" (Institution; it has no
parent, so no "Select X first" prompt - `parentSelected` is `true` for it per
section 3a, so branch 2 never fires); "Select an institution first",
"Loading courses...", "No active courses for this institution" (Course);
"Select a course first", "Loading assignments...", "No assignments for this
course" (Assignment); and the error text verbatim from the action. The
Institution empty-ok string is worded for the no-configured-credential case
(`listConfiguredInstitutionsAction` returns `{ acronyms: [] }` for a member with
no stored credential, `course-hub-integrations.ts:205-206,:233-236`), so it must
NOT claim a connection fault.

---

## 4. Real-bug check: does the course fetch fire after institution selection?

Traced. `selectInstitution` -> `apply(selectLmsInstitution(sel, code))`
(`useLmsSubmissionPicker.ts:147`), which `setSel(next)` (`:126`).
`selectLmsInstitution` returns a new object with the chosen `institution` and
cleared course/assignment when the code changed (`lmsPickerState.ts:17-20`). The
course effect keys on `courseKey = restored && sel.institution ? sel.institution
: null` (`:81`) and re-runs on `[courseKey]` (`:82-94`). So setting a non-empty
`sel.institution` (after `restored` is true) changes `courseKey` from `null`
(or a prior code) to the new code and FIRES `listCoursesAction(courseKey)`.

NO stuck-loading bug found: `loading.courses = courseKey !== null &&
!courseMatch` (`:143`) flips false once `courseResult.key === courseKey`
(`:119`), which the effect always sets on settle (`:88-89`), success or error.
The cascade is sound. Therefore this item is INDICATION ONLY - not a reachability
bug. If the build or check finds a path where `courseResult` is never set for a
live `courseKey` (e.g. an unguarded throw before `setCourseResult`), that WOULD
be a blocker-class finding; none is present in the current code
(the effect's body is fully inside the `try` and both branches call
`setCourseResult`).

---

## 5. Diagnostics: add a `list_lms_courses` seam diagnostic

The assignment effect records a seam diagnostic
(`recordChatSeamSettled({ operation: "list_lms_assignments", ... })`,
`useLmsSubmissionPicker.ts:101-107`). The course effect (`:82-94`) records
NOTHING, so a silent course-fetch failure is invisible in the Session
Diagnostic Log. Add a `list_lms_courses` diagnostic, mirroring the assignment
one exactly (capture `chatSeamNowMs()` start before `await listCoursesAction`,
`recordChatSeamSettled` after with `classifyChatSeamFailure(r.error)` on the
error branch).

THE TWO LINKED UNIONS (memory: the LMS-picker build learned these move
together; tsc enforces the link):

- `chatSeamDiagnostic.ts:13-18` - add `"list_lms_courses"` to
  `ChatSeamOperation`.
- `gradingDiagnosticLog.ts:18-35` - add `"list_lms_courses"` to
  `GradingDiagnosticOperation`, AND add `list_lms_courses: "List LMS courses"`
  to `GRADING_DIAGNOSTIC_OPERATION_LABELS` (`:37-55`). The label record is typed
  `Record<GradingDiagnosticOperation, string>`, so `npx tsc --noEmit` FAILS if
  the label is omitted - that is the compile-time enforcer of the linkage, and
  omitting the `ChatSeamOperation` member would fail tsc because
  `recordChatSeamSettled` passes a `ChatSeamOperation` into
  `recordGradingDiagnosticEntry` whose `operation` is typed
  `GradingDiagnosticOperation` (`gradingDiagnosticLog.ts:57,85`).

No vitest count canary to bump: `chatSeamDiagnostic.test.ts` and
`gradingDiagnosticLog.test.ts` assert specific members/labels, not an exhaustive
set or length (verified by `grep -n "toEqual(\[|length).toBe|new Set"` over
both - no union-enumeration assertion). `SESSION_DIAGNOSTIC_COVERAGE` is
per-SURFACE, not per-operation (`session-diagnostic-log.ts:101`, mapped from
`SURFACES`), and "grading" is already covered, so that file is NOT in the write
set.

---

## 6. Instruments (vitest, no component render)

Run any multi-file set with `npm run test:paths <p1> <p2> ...`
(`this-repo.md:61-66`); a single file may use `npx vitest run <path>`.

1. PURE decision-table test (new `lmsPickerIndication.test.ts`, or extend
   `lmsPicker.structure.test.ts`'s pure block). Object under comparison:
   `lmsFieldIndication(...)` return. Instrument: direct call, frozen expected
   literals. Direction of failure: RED if, for a representative field, any of
   the six cases (globallyDisabled / pre-parent / loading / error / empty-ok /
   populated) does not produce its expected `{ disabled, error, helperText }`.

2. PURE invariant test - "never openable-but-empty". Object: the set of
   `lmsFieldIndication` returns over the cartesian product of
   `globallyDisabled in {t,f} x parentSelected in {t,f} x loading in {t,f} x
   error in {null,"e"} x optionCount in {0,1,3}`. Instrument: the function
   itself, iterated. Direction of failure: RED if ANY member with
   `optionCount === 0` returns `disabled === false`, OR if the populated path
   (`optionCount>0 && !loading && !error && parentSelected &&
   !globallyDisabled`) returns `disabled === true` (so the field is still
   reachable when it has options). This is the executable form of the
   anti-sliver guarantee. It can fail: a mutant that drops branch (5)
   (`optionCount === 0`) lets an enabled empty select through and reddens it.

3. SOURCE-TEXT render pins (extend `lmsPicker.structure.test.ts`, which already
   reads `ChatComposer.tsx` as text, `:20`). Object: the `mode === "lms"`
   block text. Instrument: `readFileSync` + `withoutLineComments` (the file's
   existing helper, `:16-18`). Direction of failure: RED if ALL THREE
   `TextField`s (Institution, Course, Assignment) do not each carry a
   `helperText=` and an `error=` prop, OR if any field's `disabled=` no longer
   flows from `lmsFieldIndication` (pin that `lmsFieldIndication(` appears for
   all three fields and that each select's props read the returned indication).
   HISTORICAL assertion below is SUPERSEDED by the all-three-source ruling
   in the disposition banner. AND, pinning the preservation requirement (section 3c): RED if the
   Institution field's `error` source does not read `errors.institutions` (i.e.
   the per-field `lmsFieldIndication` call for Institution is fed
   `lms.errors.institutions`, or the equivalent name the test seat fixes), so
   the credential-required error that the merged `lms.error` used to show at the
   bottom is now carried by the Institution field and cannot vanish. This pins
   that the indication reaches all three controls, not merely that the function
   exists, and that the three-field coverage promised in sections 1 and 3c is
   the coverage actually wired.

4. DIAGNOSTIC-WIRING pin (extend `lmsPicker.wiring.test.ts`, which already pins
   the assignment diagnostic, `:18-27`). Object: the course effect in the hook
   source. Instrument: `readFileSync` + `withoutLineComments`. Direction of
   failure: RED if, in order, `startedAtMs = chatSeamNowMs()` does not precede
   `await listCoursesAction(`, which does not precede
   `operation: "list_lms_courses"`; and RED if `chatSeamDiagnostic.ts` does not
   contain `"list_lms_courses"` and `gradingDiagnosticLog.ts` does not contain
   a `list_lms_courses:` label. Mirror the assignment assertions at
   `lmsPicker.wiring.test.ts:18-27` exactly.

5. SABOTAGE (build step, not scoped here): for test 2, delete branch (5) and
   confirm it reddens; for test 4, remove the `list_lms_courses` record call and
   confirm the wiring pin reddens.

The real open dropdown render (sliver vs populated, helperText visible, disabled
field cannot open) is OWNER-WALK: no component renders under vitest
(`this-repo.md:134,262`). State it; do not substitute a reading for it.

---

## 7. Residual register

Every entry needs an owner, an instrument, and the step that measures it, and
must be filed in `docs/BACKLOG.md` or it does not exist
(`DEV_LOOP.md:109-114`). The orchestrator files these at disposal.

- RES-LMS-IND-1: surface `attemptedHost` in the Course field error (misconfig
  vs outage), reusing the announcements-picker rationale
  (`canvas-inbox.ts:51-70`). Owner: a follow-up build on the grading-chat
  picker. Instrument: a source-text pin that the course error path reads
  `r.attemptedHost` and the Course `helperText` composes it. Step: a dedicated
  UX pass deciding the exact phrasing. Out of this tight fix because the error
  string already shows once bound to the field.
- RES-LMS-IND-2: the open-menu render (no empty sliver; helperText visible;
  disabled field unopenable; error color in both themes). Owner: the owner
  (owner-walk). Instrument: manual walk in the running app (no component
  renders here). Step: owner confirms after deploy. This is the one check this
  environment cannot perform.

---

## 8. Waves, collision, ceilings

ONE small wave. Write set (production): `ChatComposer.tsx`,
`useLmsSubmissionPicker.ts`, `lmsPickerState.ts`, `chatSeamDiagnostic.ts`,
`gradingDiagnosticLog.ts`. Tests: `lmsPicker.structure.test.ts` (extend),
`lmsPicker.wiring.test.ts` (extend), and a new `lmsPickerIndication.test.ts`
(the pure decision + invariant tests), if not folded into the structure test.
The wave includes every file that CALLS each new export: the composer calls
`lmsFieldIndication`; the hook calls `listCoursesAction` with the new record;
the label record is consumed by `recordGradingDiagnosticEntry` already in the
file. No new export ships without its caller.

`owns` file list - tests that read the five production files as SOURCE TEXT or
import them. Command:
`grep -rln "ChatComposer\|useLmsSubmissionPicker\|lmsPickerState\|chatSeamDiagnostic\|gradingDiagnosticLog" src --include="*.test.ts" | sort -u`
Output:

```
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/chatSeamDiagnostic.test.ts
src/app/components/grading-chat/chatSeamDiagnostic.wiring.test.ts
src/app/components/grading-chat/chatSnap.test.ts
src/app/components/grading-chat/lmsPicker.structure.test.ts
src/app/components/grading-chat/lmsPicker.wiring.test.ts
src/app/components/grading/gradingDiagnosticLog.test.ts
src/lib/session-diagnostic-log.test.ts
```

Plus the repo-wide unconditional ceiling canary
`src/file-size-ceiling.structure.test.ts` (`this-repo.md:42-49`) and the
grading-chat ta- key canary
`src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts`.
The ta- key canary is an EXACT SET of 8 keys
(`grading-chat-storage-keys.structure.test.ts:13-21`); this fix adds NO ta- key
(the indication is derived, never persisted), so the canary must stay green
unchanged - DO NOT touch its expected set. The wave gate runs the owns set plus
these two canaries via `npm run test:paths`.

Checked for exact-set union/label canaries that my additions would redden:
`chatSnap.test.ts` asserts only `GRADING_DIAGNOSTIC_OPERATION_LABELS.
capture_screenshot` (`:24`), `gradingDiagnosticLog.test.ts` asserts specific
labels not a length, `session-diagnostic-log.test.ts` uses `>=` floors on the
coverage lists (`:418,421`). None breaks on adding `list_lms_courses`.
`GradingChatPanel.structure.test.ts:426`'s `toEqual([...])` enumerates the
`localStorage.getItem(...)` calls found in `GradingChatPanel.tsx` (the two
preference reads, `:426-429`), NOT a file-reads list of the five production
files. This fix touches `ChatComposer.tsx`, not any `localStorage.getItem` in
the panel, so it adds/removes no entry and the assertion cannot redden - the
conclusion is unchanged, only the description is corrected. Confirm in the wave
gate.

Ceilings, measured by `wc -l`: `ChatComposer.tsx` 519,
`useLmsSubmissionPicker.ts` 152, `lmsPickerState.ts` 75, `chatSeamDiagnostic.ts`
93, `gradingDiagnosticLog.ts` 179 - all far under the 1000 ceiling; the fix adds
roughly 15-25 lines per file, none approaching the wall. (`grading.ts` is 984 by
`wc -l src/app/actions/grading.ts` and is NOT in this write set.)

COLLISION: `ChatComposer.tsx` is shared with the in-flight VIDEO-GRADING-CHAT-
INTAKE work (which touches `grading-chat-intake.ts` / `extraction` / `grading` /
`video-*`, NOT `ChatComposer.tsx` - confirmed against the git status untracked
set), the shipped LMS picker, and LMS-META-OVERRIDE-OFFER (a22017e0, same
GradingChatPanel/ChatComposer area). These cannot run SIMULTANEOUSLY with this
item because they share `ChatComposer.tsx` and the single `tsc`/full-test
resource (`parallel-disjointness.md` / `this-repo.md:159-160`). BUILD serializes
on the shared tsc and full suite; it does not block scoping or the check.

GATE (direction of failure stated): the wave is RED unless, by
`npm run test:paths <owns + the two canaries>` run from PowerShell, EVERY listed
path prints `COVERED` with at least one passing assertion, `npx tsc --noEmit`
emits no output at exit 0, `npm run lint` adds no NEW warning in the written
files (measured against the same command before the change, never a literal),
and `npm run build` prints `Compiled successfully` (the build exits 1 in the
prerender tail by design, `this-repo.md:69-96`). `git status --short` must match
the write set exactly, and no `.claude/worktrees` copy may be edited
(`this-repo.md:270-273`).
