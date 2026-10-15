# LMS-SUBMISSIONS-ZIP-INTAKE - architecture scope

Owner request (2026-10-11), paraphrased: on the grading CHAT view, add an
intake option - a sibling of text / file / url / record - that lets the owner
pick an INSTITUTION and an ASSIGNMENT (across all colleges with a live LMS
connection), and on submit (a) pulls ALL that assignment's student submissions
from Canvas and feeds them to the chat grader, and (b) auto-populates the chat
grader's assignment-description and rubric fields from the Canvas assignment.

READ-ONLY scope pass. No production code was written. Every quantity below
names the command that produced it. Every `file:line` cited was opened.

Measurement instrument for all line counts in this document:
`@(Get-Content <file>).Count` run in PowerShell on this checkout 2026-10-11.
That is the mandated instrument (`docs/loop/this-repo.md` section 3); the
ten counts in section 7 were produced by one such command and its output is
pasted there.

---

## 0. The finding that reframes the work (act on this, do not re-spec a copy)

The requested capability is ALREADY BUILT and ALREADY REACHABLE on the chat
surface - through a different control. When the owner picks the existing
composer "URL" segment and pastes a Canvas ASSIGNMENT url, the chat grader
today does BOTH halves of this request:

- **Pulls all submissions and grades them.** `ChatComposer`'s url submit calls
  `onSubmitUrl` (`ChatComposer.tsx:184`), which the panel routes through
  `driver.submit({ kind: "url", url, label })`
  (`GradingChatPanel.tsx:373`). The driver hands `{kind:"url"}` to
  `prepareChatSubmissionAction` -> `resolveOnePart` (`grading-chat-intake.ts:221-240`),
  whose Canvas branch calls `extractCanvasEntries(url)`
  (`grading-chat-intake.ts:229`). `extractCanvasEntries`
  (`extraction.ts:284-296`) pulls every student's work via `fetchCanvasWork`
  (`work.ts:15-34` -> `fetchAssignment`, `submissions.ts:65-163`) and returns
  one gradable entry per student plus `pointsPossible`. No zip is built or
  needed on this path.
- **Auto-fills the description and rubric fields from Canvas.** The panel's
  `ensureSession(canvasUrl)` (`GradingChatPanel.tsx:263-308`) calls
  `fetchCanvasMetaAction(canvasUrl)` (`GradingChatPanel.tsx:271`), which returns
  `{ description, rubricText, linkedFileIds }` (`grading.ts:52-62` ->
  `fetchCanvasMeta`, `metadata.ts:117-188`). The resolved values fill the
  blank Instructions and Rubric fields (`GradingChatPanel.tsx:277, 285-286`).

So the owner's "submit a zip of all submissions" is, on the chat surface,
already satisfied without a literal zip: the chat grader ingests Canvas work as
entries directly. The literal zip-assembly helper `canvasWorkToZipBase64`
(`submissions.ts:172-194`) exists, but it serves the BATCH grading surface
(`grading.ts:763`), not the chat grader - do not reuse it here (section 4).

**What is genuinely missing is the GUIDED PICKER.** Today the owner must know,
find, and paste the Canvas assignment url. There is no control on the chat
surface that lists their live-connected institutions, their courses, and that
course's assignments and builds the url for them. THAT is the feature: a new
composer segment with institution / course / assignment dropdowns that resolves
to a Canvas assignment url and submits it through the path above.

Consequence for scope size: this is primarily a UI-composition + one-thin-action
feature, NOT a new Canvas data layer, NOT a new zip transport, NOT new
description/rubric plumbing. The brief's worry about "download + zip assembly as
a large slow memory-heavy server job" does not arise on the chat path, because
the chat path already streams per-student entries through the existing per-item
dispatch (`useContinuousGradingRun`) rather than materialising a class zip. The
per-attachment 15 MB cap already bounds memory (`submissions.ts:37,130,143`).

This reframing is the load-bearing decision of this scope. If a later seat or
checker believes a parallel Canvas-zip pipeline must be built, re-read section 0
first: the only reason to build one is a deliberate product choice to literally
produce a downloadable zip, which the owner did not ask for.

---

## 1. Leverage claim (AC seat owns the final wording; this is the architect's read)

Per `docs/loop/leverage.md`, a claim names a MECHANISM and says what the user
does instead today and what it costs - and the class must be EARNED by this
feature, not inherited.

- The SCALE advantage (one rubric/criteria pair held constant across N students,
  `engine.ts:186` family) and the CORPUS-flavoured description/rubric pull from
  Canvas are REAL but **inherited** from the existing url intake path
  (section 0). This feature does not build them, so it may not claim them.
- What this feature EARNS is **click-cost + discovery**: it removes the step of
  leaving the app to locate and copy a Canvas assignment url, and it surfaces
  assignments across every configured institution the owner has a credential
  for - something a chat window cannot enumerate at all. Per `leverage.md`,
  click-cost is real leverage only when named explicitly as click-cost and never
  dressed up as integration or persistence it did not build.

This is exactly the `AskAiModal` shape `leverage.md` describes: a thin,
real-but-not-categorical advantage that owes one of three explicit owner calls -
Redesign, Accept-the-cost-explicitly, or Reject. **Recommended: Accept the cost
explicitly** - state in the criteria that the advantage is click-cost +
discovery and that SCALE / meta-fill are inherited from the url intake, so a
later reader does not credit this feature with mechanisms it reused. See
FORK F6 (section 6). The removal-test honesty note is in section 10.

---

## 2. Diagnostics representation (DEV_LOOP 2026-10-11 rule)

A new user-reached capability must surface in the diagnostics. The chat surface
already has a seam-timing diagnostic, `recordChatSeamSettled`
(`chatSeamDiagnostic.ts:73-88`), whose operation union
`ChatSeamOperation = "resolve_header" | "prepare_submission" | "grade_item" |
"fetch_canvas_meta"` (`chatSeamDiagnostic.ts:13`) already records the
`fetch_canvas_meta` call this feature triggers. The picker adds new network
failure surfaces (institution list load, course list load, assignment list
load, url build) that are NOT yet represented.

Requirement for the AC + test seats: the picker's assignment-list/url-resolve
seam gets ONE new `ChatSeamOperation` member (recommended name
`"list_lms_assignments"`), recorded through the existing
`recordChatSeamSettled` with a failure mapped to a fixed
`CHAT_SEAM_FAILURE_CLASSES` string (`chatSeamDiagnostic.ts:15-25`) so no student
or institution text leaks (the file's NO STUDENT DATA rule,
`chatSeamDiagnostic.ts:7-10`). Adding a union member is a one-line edit; it is
NOT frozen by an exact-set test - `chatSeamDiagnostic.wiring.test.ts:14-18` only
asserts the panel wires `operation: "fetch_canvas_meta"`, so a new member does
not redden it. The dropdown list loads themselves surface errors in the picker
UI (section 5); the diagnostic member is for the submit-time resolve seam, which
is the one that can fail after the user commits.

A pure presentational addition would be allowed to carry none, but this feature
adds real network paths, so a diagnostic IS owed and this names it.

---

## 3. Reuse survey (symbol, file:line, what it gives us - every entry opened)

| Symbol | file:line | What it gives us |
|---|---|---|
| `extractCanvasEntries(url)` | `src/lib/grade/extraction.ts:284-296` | Pulls every student's submission for a Canvas assignment/discussion url into gradable entries + `pointsPossible`. Reuses the AI path's ingestion AND its "skip already-graded" filter. No LLM call. This is the submission-pull half, already wired to the chat url intake. |
| `fetchCanvasWork(url)` | `src/lib/canvas/work.ts:15-34` | URL -> institution resolve -> `fetchAssignment` / `fetchDiscussion`; one work item per student. |
| `fetchAssignment(...)` | `src/lib/canvas/submissions.ts:65-163` | Pages all submissions (per_page=100, `CANVAS_PAGINATION_PAGE_CAP`), downloads each attachment through the same-origin guard, size-caps each at 15 MB (`:37,130,143`). SKIPS `unsubmitted` (`:99`) and `graded` (`:107`). |
| `fetchCanvasMeta(url)` / `fetchCanvasMetaWith(ctx, parsed)` | `src/lib/canvas/metadata.ts:117-188` | Assignment description (HTML -> text via `htmlToText`) + rubric rendered as plain text via `formatRubric` (`:74-92`), plus linked file ids. The description/rubric-fill half, already wired to `ensureSession`. `fetchCanvasMetaWith` takes an already-resolved ctx, so a code-based caller is cheap. |
| `fetchCanvasMetaAction(url)` | `src/app/actions/grading.ts:52-62` | Owner-reachable server action wrapping `fetchCanvasMeta`; `requireUser()` guard; never synthesizes a rubric. Already called by `ensureSession`. |
| `listConfiguredInstitutionsAction()` | `src/app/actions/course-hub-integrations.ts:208-239` | Returns every institution code the caller actually has Canvas access to (owner: env-configured `<CODE>_CANVAS_*` + hardcoded `CANVAS_INSTITUTIONS` with a token + own stored creds). This is the faithful INSTITUTION-dropdown source for "colleges I have a live LMS connection for". |
| `listCoursesAction(acronym)` | `src/app/actions/canvas-inbox.ts:71-83` | `{ courses: CanvasCourse[] }` ({id,name}) for one institution; `requireUser()`; returns `attemptedHost` only on the error branch. The COURSE-dropdown source. |
| `listCourseAssignmentsAction(institution, courseId)` | `src/app/actions/repo-grades.ts:33-46` | `{ assignments: CanvasAssignmentBrief[] }` ({id,name,pointsPossible}); `requireUser()`; pass-through to `listAssignments` (`listings.ts:217-245`). The ASSIGNMENT-dropdown source. |
| `ChatSubmissionInput` union + `onSubmitUrl` | `src/app/components/grading-chat/chatSubmissionIntake.ts:26-35`; `ChatComposer.tsx:59,178-187` | The existing intake taxonomy and the url submit callback this feature routes through. `{kind:"url"}` is a first-class member of `driver.submit` (`useContinuousGradingRun.ts:114`). |
| `SegmentedToggle` + `InputMode` + `loadInputMode`/`persistInputMode` | `ChatComposer.tsx:33,35-53,253-264` | The submission-type switcher this feature adds a segment to, and the persisted-mode layer (`ta-grading-chat-input-mode`). |
| `useLmsAssignmentPull` | `src/app/components/github-grading/useLmsAssignmentPull.ts:111-371` | The closest precedent for a course+assignment picker driving `fetchCanvasMetaAction`: derived-loading keys, `window.confirm` before overwrite, "no rubric in Canvas" wording (`:276-279`). Reuse its PATTERNS (keyed derived-loading effects, explicit persistence via a single ui-state object), not its code - it keys off saved course-hub tiles, not configured institutions. |
| `recordChatSeamSettled` / `ChatSeamOperation` | `src/app/components/grading-chat/chatSeamDiagnostic.ts:13,73-88` | The chat-surface diagnostic recorder for the new seam (section 2). |
| `useInstitutionSelection()` | `src/lib/institutions.ts:111-133` | `{ institutions, active, setActive }`; the registered acronyms + the shared active institution, to pre-select the active institution and save a repeat-use click. |

---

## 4. Do-not-reuse list (with justification per entry)

- **`canvasWorkToZipBase64` (`submissions.ts:172-194`) and any literal class-zip
  assembly.** The chat grader ingests Canvas work as per-student ENTRIES via
  `extractCanvasEntries`, not as a zip; `canvasWorkToZipBase64` exists only for
  the batch surface (`grading.ts:763`). Building a zip here would add a second,
  slower path to the same result and reintroduce the memory/latency worry
  section 0 shows does not apply.
- **`filterConnectedInstitutions` / `connected-institutions.ts`
  (`src/lib/live-messaging/connected-institutions.ts:32-47`).** The brief
  suggested it, but it answers a DIFFERENT question: it keeps institutions whose
  per-COURSE notifications probe returned `kind:"connected"`
  (`courses-table-helpers.ts:731-745`), which requires a live per-course probe
  the chat surface does not run. "Colleges I have a live LMS connection for" at
  the INSTITUTION level is credential presence, which
  `listConfiguredInstitutionsAction` answers directly and cheaply (no probe).
  Use `listConfiguredInstitutionsAction`.
- **`listCourseSubmissionGrid` (`submissions-grid.ts:209-264`).** Returns grading
  FACTS (score/workflowState/late/missing) per submission, deliberately never
  the attachment bytes or text (`:29-32`). It answers "who is missing work", not
  "give me the gradable content". Wrong reader for grading.
- **`fetchSubmissionDetail` (`submission-detail.ts:94-175`) and
  `listAssignmentTextSubmissions` (`listings.ts:398-439`).** Single-student and
  text-only respectively; neither is the all-submissions gradable-entries pull
  `extractCanvasEntries` already gives.
- **Adding a new `ChatSubmissionInput` kind / a new intake resolver branch /
  a new driver submit path - UNLESS FORK F1 chooses Design B.** The recommended
  Design A-prime (section 5) reuses `{kind:"url"}` end to end and adds no new
  intake kind.

---

## 5. Shape: where the seam falls, and the surface IS a layer

### 5.1 Recommended shape - Design A-prime (emit a url, reuse `onSubmitUrl`)

The new composer segment presents three dropdowns, resolves the selection to a
Canvas assignment url via ONE thin server action, then calls the EXISTING
`onSubmitUrl(url)`. Everything downstream is unchanged: `ensureSession(url)`
fills description + rubric, `driver.submit({kind:"url"})` pulls and grades all
submissions.

Why emit a url rather than a new intake kind: the url intake already performs
BOTH halves of the request (section 0). Reusing it means zero new intake
resolver, zero new meta-fill logic, zero new driver path. The only genuinely new
server surface is resolving an institution CODE to its Canvas host so the url
carries a host `resolveInstitution(url)` can match.

The one thin action needed, because the composer holds only an institution CODE
and `extractCanvasEntries`/`fetchCanvasMeta` resolve by URL HOST:

```
// src/app/actions/grading-chat-intake.ts (add; the module is "use server",
// requireAppOwner-gated, 340 lines - headroom to the 1000 ceiling)
export async function buildLmsAssignmentUrlAction(
  institution: string,
  courseId: string,
  assignmentId: string,
): Promise<{ url: string } | { error: string }>
```

It calls `resolveInstitutionByCode(code)` (the code-based resolver the Canvas
layer already uses, e.g. `listings.ts:218`) for `baseUrl`, then returns
`${baseUrl}/courses/${courseId}/assignments/${assignmentId}`. The returned url's
host equals the configured baseUrl host, so `resolveInstitution(url)` on the
submit path resolves back to the same institution by construction.

Privacy/security note this shape must own: this exposes the institution's HOST
to the client. It is the owner's OWN configuration, not a third party's secret,
and the existing url field already accepts a pasted host url on the identical
owner-only surface - so A-prime exposes nothing the surface did not already
round-trip. The Canvas TOKEN never leaves the server (`resolveCanvasCredential`
only reaches the owner env for an owner-role identity - action-guard-coverage
cohort comments, `action-guard-coverage-github-cohort.test.ts:395-408`). The
Security seat (Wave 2) must still rule; see FORK F7.

### 5.2 THE SURFACE IS A LAYER - every reachability hop, named

Adding a composer segment is five coordinated edits in `ChatComposer.tsx`; omit
any one and the control ships dead or reverts silently (the recorded
sub-tab-ladder failure class, `traps-spec.md:59-65`, and
`verify-reachability-not-just-correctness` in MEMORY):

1. **The mode union.** `type InputMode = "text" | "file" | "url" | "record"`
   (`ChatComposer.tsx:33`) gains `| "lms"`.
2. **The persisted-mode validator.** `loadInputMode` admits the new value
   (`ChatComposer.tsx:39`: the `stored === "text" || ...` chain). If this hop is
   omitted the segment renders but a reload silently falls back to "text" -
   invisible breakage. This is the exact persisted-mode layer the Record segment
   already needed (`GradingChatPanel.structure.test.ts:667-670` pins
   `stored === "record"`).
3. **The switcher options array.** `SegmentedToggle`'s `options`
   (`ChatComposer.tsx:255-260`) gains the new `{ value: "lms", label: ... }`.
   `SegmentedToggle` is generic over its options; no count is frozen.
4. **The conditional render block.** A new `mode === "lms" && (...)` block
   (sibling of `:329`, `:376`, `:406`) renders the three dropdowns + submit.
5. **The submit wire.** The new block calls `onSubmitUrl(resolvedUrl)` after the
   url-build action resolves - so no new panel prop is strictly required. If the
   picker needs its own panel handler (FORK F2) a new prop is added and the
   composite-wiring pin (`GradingChatPanel.structure.test.ts:442-451`, which
   asserts the four existing props) must still pass - the four stay; a fifth is
   additive.

The dropdown data layer is best isolated in a hook (the `useLmsAssignmentPull`
precedent): `useLmsSubmissionPicker` owns the three list loads, the
derived-loading keys, and the persisted selections, returning them to the
composer block. Keeping the logic in a `.ts` hook rather than inline in the
`.tsx` is mandatory here because NO COMPONENT IS RENDERED BY ANY TEST
(`this-repo.md` section 6) - logic inline in the composer `.tsx` cannot be
unit-tested at all.

### 5.3 Design B - fallback only (new `{kind:"lms"}` intake kind)

If FORK F7 rules the host must never reach the client: add
`{ kind:"lms"; institution; courseId; assignmentId }` to `ChatSubmissionInput`
(`chatSubmissionIntake.ts:26`), a `resolveOnePart` branch
(`grading-chat-intake.ts:164`) that resolves the url server-side and calls
`extractCanvasEntries`, a code-based meta action (wrapping the existing
`fetchCanvasMetaWith`, `metadata.ts:134`) the panel calls from a new
`ensureSession` branch, and a driver submit path. This is materially more code
(a new union member, a new resolver branch, a new meta action, a new driver
path, a new `ensureSession` branch) for a privacy gain the url field already
forgoes. Recorded as the fallback, not the recommendation.

---

## 6. Design forks - each a recommended reading with cost-if-wrong

Per AGENTS.md "Two rounds, then ask": these are shaped so every answer
TERMINATES. The architect recommends; the orchestrator/owner decides. Section 14
restates the ones that are genuinely owner product calls as terminating
questions.

**F1 - Submit transport: Design A-prime (emit url, reuse `onSubmitUrl`) vs
Design B (new `{kind:"lms"}` intake kind).** Recommend **A-prime** (section 5).
Cost if wrong: if the owner later requires the host kept server-side, rework the
composer->panel submit seam into Design B - moderate, localized to the chat
intake files, no data-layer change.

**F2 - Does the LMS segment need its own panel handler, or reuse
`handleSubmitUrl`?** Recommend **reuse `handleSubmitUrl`** (`GradingChatPanel.tsx:370`):
the composer block resolves the url (via the action) and calls `onSubmitUrl`,
so the panel is untouched except that the Canvas-meta auto-fill already keys on
a passed `canvasUrl`. Cost if wrong: if the picker needs bespoke progress copy
("Pulling assignments from <institution>..."), add one panel prop + handler -
additive, the four pinned props stay.

**F3 - What counts as "ALL submissions"?** The reused `fetchAssignment` SKIPS
`unsubmitted` and already-`graded` work (`submissions.ts:99,107`), so the url
path grades only submitted-and-ungraded students, and a re-run skips students
already graded. Recommend **keep that semantics** (it is the established
grading-queue behavior; it avoids re-grading and wasted model calls, and a
resubmission flips state back to `submitted` and re-enters the queue,
`submissions.ts:106`). Cost if wrong: if the owner wants to force-grade every
enrolled or already-graded student, that needs a force-all variant of the pull -
a separate follow-up, NOT this row. This is an owner product call (F3 in
section 14).

**F4 - Institution dropdown source.** Recommend
**`listConfiguredInstitutionsAction`** over `filterConnectedInstitutions`
(section 4). Cost if wrong: if the owner means "institutions with a
currently-passing live probe" rather than "configured", switch the source to a
per-institution probe - heavier (one network call per institution) and slower;
flag as a follow-up rather than blocking this row.

**F5 - Course layer: institution -> course -> assignment, or skip course?**
Canvas assignments are course-scoped; `listAssignments` requires a `courseId`
(`listings.ts:217`). So a COURSE selection is unavoidable between institution
and assignment. Recommend **three dependent dropdowns**
(institution -> course -> assignment), pre-selecting `useInstitutionSelection().active`
to save a repeat-use click (minimize-clicks, MEMORY). Cost if wrong: none
structural; this is the only shape the Canvas API supports. The owner's phrase
"institutions and assignments" omitted the course only because it is implied.

**F6 - Leverage disposal (owner's, never defaulted).** Recommend
**Accept-the-cost-explicitly**: the earned advantage is click-cost + discovery;
SCALE and meta-fill are inherited (section 1). Cost if wrong: if the owner wants
a categorical advantage, that is a Redesign (e.g. persist the picked
institution/course/assignment as a reusable grading target), a larger surface.

**F7 - Guard strength + host exposure (Security seat, Wave 2, must rule).** The
reused list actions are `requireUser()`-gated
(`canvas-inbox.ts:75`, `repo-grades.ts:38`, `course-hub-integrations.ts:169`),
while the chat GRADE path is `requireAppOwner()`
(`grading-chat-intake.ts:132`). Recommend **the new `buildLmsAssignmentUrlAction`
is `requireAppOwner()`** (it resolves a credential), and the existing
requireUser pickers are LEFT AS-IS (pre-existing precedent used across the app;
changing them is not this row's job). Cost if wrong: a requireUser picker action
is reachable by any signed-in account, but the sensitive pull/grade stays
owner-gated; tightening the pickers later is a one-line guard swap.

---

## 7. File layout with per-file line estimates (ceiling is 1000, measured)

Measured current counts (`@(Get-Content <file>).Count`, PowerShell, 2026-10-11):

```
436     src/app/components/grading-chat/ChatComposer.tsx
565     src/app/components/grading-chat/GradingChatPanel.tsx
593     src/app/components/grading-chat/useContinuousGradingRun.ts
148     src/app/components/grading-chat/chatSubmissionIntake.ts
88      src/app/components/grading-chat/chatSeamDiagnostic.ts
340     src/app/actions/grading-chat-intake.ts
908     src/app/actions/canvas-inbox.ts
79      src/app/actions/repo-grades.ts
269     src/lib/canvas/metadata.ts
881     src/lib/grade/extraction.ts
```

| File | New or edit | Est. after | Caller of each new export (the wiring file) |
|---|---|---|---|
| `src/app/components/grading-chat/useLmsSubmissionPicker.ts` | NEW | ~160 | Called by `ChatComposer.tsx`'s new `mode==="lms"` block (same wave). |
| `src/app/components/grading-chat/ChatComposer.tsx` | EDIT (5 hops, 5.2) | 436 -> ~520 | It is the caller; it calls `useLmsSubmissionPicker` and `buildLmsAssignmentUrlAction` then `onSubmitUrl`. |
| `src/app/actions/grading-chat-intake.ts` | EDIT (add `buildLmsAssignmentUrlAction`, Design A-prime) | 340 -> ~370 | Called by `ChatComposer.tsx`'s new block (same wave). Do NOT add it to `canvas-inbox.ts` (908, too near ceiling). |
| `src/app/components/grading-chat/chatSeamDiagnostic.ts` | EDIT (one union member) | 88 -> ~90 | Recorded by `useLmsSubmissionPicker`/the composer block (same wave). |
| `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts` | EDIT (add each new `ta-` key to `EXPECTED`) | n/a | See section 8 - MANDATORY same-commit gate update. |

No file is pushed past 1000. `useContinuousGradingRun.ts` (593) and
`GradingChatPanel.tsx` (565) are NOT edited under A-prime except the optional
F2 prop. If F2 adds a panel handler, `GradingChatPanel.tsx` gains ~15 lines
(still far below ceiling).

Type-only note: `useLmsSubmissionPicker.ts` is a runtime hook, NOT a type-only
module, so its wave must include its caller (the composer block) - it has one,
same wave.

---

## 8. Mandatory gate updates (persisted state is the trap here)

Per MEMORY "persist UI control state": every new select/checkbox must persist
across reloads under a `ta-` key. The LMS picker's selections (institution,
course, assignment) SHOULD persist (repeat-use convenience). The grading-chat
directory has an EXACT-SET `ta-` key canary:
`grading-chat-storage-keys.structure.test.ts:13-21` freezes `EXPECTED` to seven
keys and `:51-53` asserts the scanned set EQUALS it; `:55-61` prove a newly
added quoted OR template-literal key breaks the set. The canary scans RAW source
(comments included, `:6`). So:

- Every new `ta-` key the picker introduces (recommended: ONE key holding a
  small JSON ui-state object `{ institution, courseId, assignmentId }`, mirroring
  `githubGradingUiState.ts`, to add only one entry) MUST be added to `EXPECTED`
  in the SAME commit, or the wave lands red through build and verify (the
  pre-push gate runs no vitest, `this-repo.md` section 1). Recommended single
  key name: `ta-grading-chat-lms-picker`.
- The wave gate and verify list MUST include this test by path via
  `npm run test:paths` (never a raw multi-path vitest, `test-paths-wrapper`
  MEMORY). Example gate for the UI wave:
  `npm run test:paths src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts src/app/components/grading-chat/GradingChatPanel.structure.test.ts src/file-size-ceiling.structure.test.ts`
- `src/file-size-ceiling.structure.test.ts` runs UNCONDITIONALLY in every wave
  gate (`this-repo.md` section 1).

---

## 9. Type signatures at every seam

```
// Hook (new). Pure-ish: owns loads + persisted selections; no render.
export interface LmsPickerState {
  readonly institutions: string[];           // from listConfiguredInstitutionsAction
  readonly institution: string;               // selected code (default: active)
  readonly courses: { id: string; name: string }[];
  readonly courseId: string;
  readonly assignments: CanvasAssignmentBrief[];  // {id,name,pointsPossible}
  readonly assignmentId: string;
  readonly loading: { institutions: boolean; courses: boolean; assignments: boolean };
  readonly error: string | null;
  readonly selectInstitution: (code: string) => void;
  readonly selectCourse: (id: string) => void;
  readonly selectAssignment: (id: string) => void;
  readonly canSubmit: boolean;                 // institution && courseId && assignmentId
}
export function useLmsSubmissionPicker(): LmsPickerState;

// Server action (new, Design A-prime), in grading-chat-intake.ts ("use server",
// requireAppOwner first statement to match the module's other exports):
export async function buildLmsAssignmentUrlAction(
  institution: string, courseId: string, assignmentId: string,
): Promise<{ url: string } | { error: string }>;

// Composer submit (no new prop under A-prime): the mode==="lms" block calls the
// existing onSubmitUrl(url: string, label?: string) with the resolved url.

// Diagnostic union (edit):
export type ChatSeamOperation =
  "resolve_header" | "prepare_submission" | "grade_item" | "fetch_canvas_meta"
  | "list_lms_assignments";
```

CanvasAssignmentBrief is `{ id: string; name: string; pointsPossible: number | null }`
(`listings.ts:48-52`) and is already re-exported from `@/lib/canvas`
(`useLmsAssignmentPull.ts:41` imports it from there), so the hook imports the
same type - no new type at the seam.

---

## 10. Instruments (vitest node-env, network-blocked, no render)

What CAN be unit-tested here (mock the client, never `fetch` - `tests-are-network-blocked`
MEMORY; and no component renders):

1. **`buildLmsAssignmentUrlAction` url assembly.** Mock `resolveInstitutionByCode`
   to return a fixed `baseUrl`; assert the built url is
   `<baseUrl>/courses/<courseId>/assignments/<assignmentId>`, and that a
   resolve failure returns `{error}` not a throw. Pin that the built host
   round-trips: `parseCanvasUrl(builtUrl)` yields `kind:"assignment"` with the
   same `courseId`/`id` (reuse the real `parseCanvasUrl`, not a mock).
2. **Dropdown dependency logic in `useLmsSubmissionPicker`** - extract the PURE
   reducer/derivation (selecting an institution clears course+assignment;
   selecting a course clears assignment; `canSubmit` is the three-field AND) into
   testable functions and assert the cascade. The keyed derived-loading idiom
   (`useLmsAssignmentPull.ts:214-241`) is the precedent; the KEY-mismatch loading
   flag is the unit under test, not the effect.
3. **Diagnostic mapping** - that a picker failure maps to a fixed
   `CHAT_SEAM_FAILURE_CLASSES` member via `classifyChatSeamFailure`
   (`chatSeamDiagnostic.ts:31-40`), carrying no institution/student text.

Source-text reachability pins (the SURFACE-IS-A-LAYER layer, since nothing
renders): a `*.structure.test.ts` canary that `InputMode` includes `"lms"`,
that `loadInputMode` admits `"lms"` (the stored-value chain), that the
`SegmentedToggle` options array contains the lms value, that a `mode === "lms"`
render block exists, and that the block's submit reaches `onSubmitUrl` (or the
F2 handler). These prove the control is wired, not dead - they do NOT prove it
renders or that a click works (owner walk).

What CANNOT be verified here (state plainly, `this-repo.md` section 6): the real
Canvas pull, the real description/rubric fetch, the real grade, and that the
dropdowns render / the segment appears / a keyboard user can reach it. All are
OWNER WALK residuals (section 13).

**Leverage removal test - honest limit.** This feature's earned advantage is
click-cost + discovery (section 1), which per `leverage.md` ("Honest limit") has
NO buildable removal test in this repo, because no component renders and the
advantage is clicks/navigation, not a code property. So there is no red-on-removal
test to write; record it as a residual with an owner and a step (section 13),
exactly as `leverage.md` and the Test seat brief require. Do NOT fabricate a
removal test that passes trivially (e.g. "a row was written").

---

## 11. Wave plan (dependency-ordered, disjoint write sets)

The feature is small enough for two waves; a third is only the standard
design-seat passes.

- **Wave 1 - data + action seam (server).** Add `buildLmsAssignmentUrlAction`
  (`grading-chat-intake.ts`) and the `ChatSeamOperation` member
  (`chatSeamDiagnostic.ts`). Write set: those two files + their unit tests.
  These have no UI caller yet, so this wave ships exports whose caller arrives
  in Wave 2 - the ONE legal exception is that an action/type reached only by a
  later UI wave is acceptable WHEN the plan names the Wave-2 caller, which it
  does (the composer block). Flag this explicitly in the wave plan so the wave
  gate does not read the missing caller as dead code.
- **Wave 2 - picker UI + wiring.** `useLmsSubmissionPicker.ts` (new),
  `ChatComposer.tsx` (5 hops), the `ta-` key added to `EXPECTED` in
  `grading-chat-storage-keys.structure.test.ts`, and the reachability
  `*.structure.test.ts`. This wave includes the file that CALLS every Wave-1
  export (the composer block) - satisfying the caller rule.
- **Design seats:** Wave 1 architect (this) + reuse (this). Wave 2 Security
  (F7, host exposure + guard strength), Reliability (the three dropdown loads
  under the 60s/attachment caps; the pull itself is the already-shipped url path,
  so its failure modes are inherited not new). Wave 3 UX (the three-dropdown
  click path, counted first-use and repeat-use; empty/loading/error copy for each
  dropdown) + Accessibility (the new segment is a reading claim - no render).

If a build runs: it serializes on the shared `tsc`/full-test with the in-flight
collisions (section 12). Only ONE agent runs `tsc` at a time
(`this-repo.md` section 2).

---

## 12. Collisions and serialization (not disjoint by exact path)

This scope's write set OVERLAPS in-flight work; it is NOT safe to build
concurrently with these:

- **VIDEO-GRADING-CHAT-INTAKE** (untracked `docs/video-grading-chat-intake-scope.md`)
  - same `ChatComposer.tsx`, same `chatSubmissionIntake.ts`, same driver. A
  one-line change to any of these edits one file and can break the other's
  tests. SERIALIZE.
- **GRADER-WORKFLOW-OVERHAUL / grading-chat consolidation** (referenced by
  BACKLOG row GR-NONCANVAS-PERSIST, `docs/BACKLOG.md:89`; untracked
  `docs/grading-chat-consolidation-scope.md`) - same `GradingChatPanel.tsx` /
  `ChatComposer.tsx`. SERIALIZE.
- **GRADING-DIAGNOSTICS-COVERAGE** (untracked
  `docs/grading-diagnostics-coverage-scope.md`) - same `chatSeamDiagnostic.ts`
  union. SERIALIZE the diagnostic edit.
- **LIVE-LMS-STUDENT-MESSAGING** (BACKLOG A29, `:47`; recent commits
  7a668112/dd53eabc) - shares the Canvas layer (`connected-institutions.ts`,
  `listings.ts`) and the connected-institution concept. This scope only READS
  that layer (no edits to it), so the overlap is informational, not a write-set
  intersection - but the institution-source choice (F4) should stay consistent
  with whatever that feature ships.

Intersect write sets mechanically (`sort | uniq -d`) against each of the above
before any concurrent dispatch; the only pass is an empty intersection
(`parallel-disjointness.md`). The expectation here is that this row runs
SERIALLY after or before the chat-composer rows, not beside them.

---

## 13. Residual register (each: owner, instrument, step)

Every entry must land in `docs/BACKLOG.md` or it does not exist
(`iteration-caps.md`).

| Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|
| R1 - Real Canvas pull of all submissions via the picker-built url succeeds against a live instance | Owner | Live Canvas (no key here) | Owner walk: pick institution/course/assignment, submit, confirm the class grades. |
| R2 - Description + rubric fields auto-fill from the picked assignment | Owner | Live Canvas | Owner walk: confirm Instructions + Rubric populate from Canvas on first submit. |
| R3 - The new segment renders, the three dropdowns appear and cascade, the segment is keyboard-reachable | Owner | No component renders in vitest (`this-repo.md` section 6) | Owner walk in the real app. |
| R4 - Leverage claim (click-cost + discovery) holds in the built diff | Verify half | Re-judged against the as-built diff (`DEV_LOOP.md` Verify) | No red-on-removal test is buildable (section 10); Verify re-judges the claim and records a finding if the diff no longer supports it. |
| R5 - Force-all-submissions variant (grade already-graded / unsubmitted too) | Owner (F3) | n/a until scoped | Only if the owner rules F3 toward "literally all"; a separate row. |
| R6 - Host-kept-server-side (Design B) | Owner (F7) | Security seat + a resolver unit test | Only if F7 rules the host must not reach the client. |

---

## 14. Terminating questions for the owner (every answer ends the activity)

Batched per AGENTS.md; each is a product call the architect may not default.
Work that does NOT depend on these (Wave 1 server seam, the reuse/structure
pins) can start under the recommended readings while the answers ride alongside.

1. **F3 - "all submissions":** keep the established grading-queue semantics
   (grade submitted-and-ungraded; a re-run skips already-graded; recommended),
   OR force-grade every enrolled/already-graded student (a separate follow-up
   row, R5)? Recommend the former.
2. **F6 - leverage disposal:** Accept-the-cost-explicitly (the advantage is
   click-cost + discovery; recommended), OR Redesign into a persisted reusable
   grading target (larger surface)?
3. **F7 - host exposure (also a Security-seat input):** accept that the built
   assignment url (host + ids) reaches the client exactly as the existing url
   field already allows on this owner-only surface (Design A-prime; recommended),
   OR require the host kept server-side (Design B, more code, R6)?

Everything else (F1, F2, F4, F5) is an engineering call the architect has made
with a stated cost-if-wrong and does not need an owner answer to proceed.

---

## 15. ASCII check

This file is ASCII-only (no emoji, no smart quotes, no arrow glyphs). Verify:
`LC_ALL=C grep -nc '[^ -~\t]' docs/lms-submissions-zip-intake-scope.md` must
print `0`.
