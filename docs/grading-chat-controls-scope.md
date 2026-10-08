# GRADING-CHAT-CONTROLS - scope / recon (four owner requests)

Architecture/scoping seat. Scope only, no production code. A fresh `loop-checker`
reads this before any build. Every quantity below names the command that produced
it; every `file:line` was opened.

Owner, direct chat 2026-10-06 (verbatim), four requests against the grading-chat
surface (the "llm-like grading tool" sixth Grading sub-tab):

1. "give me controls that can quickly clear out one or multiple of the large text
   fields on the chat grading page"
2. "give me a control to allow me to copy the feedback for an assignment"
3. "give me a control to allow me to adjust the harshness or leniency of grading"
4. "that grading chat page needs better visual indicators when loading after a
   submission has been given"

---

## 0. Measured facts this scope rests on

All commands run from repo root, this checkout, 2026-10-06.

| Fact | Command | Value |
|---|---|---|
| GradingChatPanel size | `@(Get-Content src/app/components/grading-chat/GradingChatPanel.tsx).Count` | 244 |
| ChatComposer size | `@(Get-Content src/app/components/grading-chat/ChatComposer.tsx).Count` | 203 |
| LatestResultCard size | `@(Get-Content src/app/components/grading-chat/LatestResultCard.tsx).Count` | 35 |
| useContinuousGradingRun size | `@(Get-Content src/app/components/grading-chat/useContinuousGradingRun.ts).Count` | 378 |
| prompts.ts size | `@(Get-Content src/lib/grade/prompts.ts).Count` | 451 |
| engine.ts size | `@(Get-Content src/lib/grade/engine.ts).Count` | 658 |
| grade/types.ts size | `@(Get-Content src/lib/grade/types.ts).Count` | 470 |
| grade-run-item route size | `@(Get-Content src/app/api/grade-run-item/route.ts).Count` | 210 |
| incrementalRunPlan size | `@(Get-Content src/app/components/grading/incrementalRunPlan.ts).Count` | 301 |
| GradingResults size | `@(Get-Content src/app/components/GradingResults.tsx).Count` | 918 |
| No existing grade-harshness seam | `Select-String -Path src/lib/grade/*.ts,src/app/components/grading-chat/*.ts*,src/app/api/grade-run-item/*.ts -Pattern "GradeHarshness|harshnessDirective|HarshnessLevel|gradingHarshness|ta-grading-chat-harshness"` | 0 hits |

All files are far under the 1000-line ceiling (`src/file-size-ceiling.structure.test.ts`,
`LIMIT = 1000`). The ceiling test is run UNCONDITIONALLY in every wave gate anyway
(`this-repo.md:42-49`); re-measure the two files each wave edits with
`@(Get-Content <f>).Count` at that gate rather than trusting these.

**This environment cannot verify** (stated, not worked around - `this-repo.md:245-264`):
no live DB, no API keys (`GEMINI_API_KEY` is owner-set in Vercel; every LLM path is
mock-only), and **NO COMPONENT IS RENDERED BY ANY TEST**. So every "rendered",
"visible", "clicked", "clipboard", and "the model honours this" claim is an OWNER
WALK; only source-text/structure/wiring and pure-function oracles are machine-checkable
here. No requirement below has a render as its only enforcer.

---

## 1. The surface as it is today (opened, not recalled)

- `GradingChatPanel.tsx` holds two setup `TextField`s - Assignment instructions
  (`id="grading-chat-instructions"`, `:169-178`) and Rubric
  (`id="grading-chat-rubric"`, `:183-192`) - both bound `disabled={sessionReady}`
  where `sessionReady = driver.headerState === "ready"` (`:74`). Once a session is
  established the two fields are REPLACED by a one-line `chatStyles.setupSummary`
  strip (`:195-197`) and can no longer be edited (verify-doc attack-9 lock, `:67-73`).
- The third large field is the composer's Submission text `TextField` in
  `ChatComposer.tsx` (`label="Submission text"`, `:159-167`), local `text` state
  (`:61`), cleared on send inside `handleSendText` (`setText("")` + `.focus()`,
  `:73-79`). It is editable any time the composer is not `disabled`.
- `busy = driver.headerState === "resolving"` (`GradingChatPanel.tsx:160`) is the
  ONLY thing that disables the composer (`<ChatComposer disabled={busy} ... />`,
  `:238`). `busy` is true only while the FIRST `beginSession` resolves the header;
  it is false during per-submission extraction and grading.
- Copy mechanism already exists and is threaded as props: `GradingChatPanel`'s
  `copiedKey`/`onCopy` (`:51-52`, from `page.tsx`), passed down to `GradingResults`
  (`:223-224`). Inside the matrix, `RowFeedbackBoxes.tsx` already renders per-field
  copy IconButtons and a per-row "Copy all feedback for {student}" Button
  (`:104-113`, calling `copyAllFeedbackText(edit)` from
  `gradingResultsHelpers.ts:429`). **The one surface with NO copy control is
  `LatestResultCard.tsx`** - it takes only `result` (`:13-15`) and renders the
  newest result read-only (`:20-30`).
- Per-row in-flight state: `useContinuousGradingRun` increments
  `dispatchedCountRef` the moment a submission is admitted (`:291-292`) and exposes
  `inFlight`, `completedCount`, `dispatchedCount` (`:106-108`, `:373-375`), but
  `GradingChatPanel` surfaces NONE of them. A dispatched-but-not-arrived row shows
  as blank cells in the matrix with no "grading..." affordance.
- The grading prompt seam: `buildSystemPrompt` is DEFINED in
  `src/lib/grade/prompts.ts:56`, re-exported through `src/lib/grade/rubric.ts:443`,
  and imported by `engine.ts:27` from `./rubric`. The chat path reaches it via:
  `ChatComposer` submit -> `GradingChatPanel.handleSubmit*` -> `driver.submit`
  (builds a `GradeRunItemRequestBody`, `useContinuousGradingRun.ts:298-306`) ->
  POST `/api/grade-run-item` -> `gradeEntries([entry], ..., { commentSplit })`
  (`route.ts:191`) -> `gradeStudentEntries` -> `buildSystemPrompt` (`engine.ts:355-357`
  and `:364-366`). The per-run header (`beginSession` -> `resolveChatRunHeaderAction`
  -> `resolveRunHeader`) resolves only the RUBRIC; it never calls `buildSystemPrompt`,
  so harshness does NOT thread through the header.

---

## 2. Item #1 - clear the large text fields

### Mechanism
Add explicit "Clear" affordances to the three large fields, plus one "Clear all"
that clears every field currently editable. No new data, no persistence - clearing
is an action, it stores nothing.

- **Instructions** and **Rubric** (`GradingChatPanel.tsx`): a small per-field clear
  control (text `Button` or an `IconButton`, house style, no emoji) that calls
  `setInstructions("")` / `setRubric("")`. It is rendered ONLY inside the
  `!sessionReady` branch (`:165-194`) and only when the field is non-empty, because
  after `sessionReady` the fields are gone/locked (`:195-197`, `:74`). This is the
  session-lock interaction stated explicitly: **clear applies to Instructions/Rubric
  only pre-lock.**
- **Submission text** (`ChatComposer.tsx`): a "Clear" control in the text-mode
  `adaptRow` (`:151-180`, beside Send) that calls `setText("")` (and `setLabel("")`),
  shown when `text` is non-empty and `!disabled`. Composer text clears any time.
- **Clear all** (`GradingChatPanel.tsx`): one control in the setup area that clears
  whatever is editable - pre-lock: Instructions + Rubric (+ the composer text if the
  owner wants it included, see F1b); post-lock: nothing to clear in the setup area
  (the composer keeps its own Clear). Minimise clicks: Clear-all is ONE click for the
  common "wipe the setup to start over" case, versus one-per-field.

### Default behaviour
No clear control was present before; adding them changes nothing until clicked.
No confirm on a single-field clear (low-stakes, the text is not yet committed
anywhere, and a confirm on every clear fights the minimise-clicks rule). Clear-all
is the only candidate for a confirm (F1c).

### Machine-checkable vs owner-walk
- Machine-checkable (source-text / wiring, extend `GradingChatPanel.structure.test.ts`
  and add a composer assertion): a clear control exists and its handler calls
  `setInstructions("")` / `setRubric("")` / `setText("")`; the Instructions/Rubric
  clear sits inside the `!sessionReady` branch (asserted the same way the existing
  lock tests slice the `!sessionReady` region, `GradingChatPanel.structure.test.ts:277-290`).
- Owner walk: that the button is visible, well-placed, and actually empties the field
  on screen (nothing renders under vitest).

### Forks (recommended)
- **F1a - per-field only, clear-all, or both. RECOMMEND BOTH.** The owner said "one
  OR multiple", which asks for both granularities. Cost of wrong: trivial (drop one
  control).
- **F1b - does Clear-all include the composer Submission text? RECOMMEND NO** - keep
  the composer's own Clear separate, because the setup fields and the composer are in
  different regions and different lifecycle states (composer is always live). Cost of
  wrong: one line.
- **F1c - confirm on Clear-all? RECOMMEND NO confirm** (consistent with minimise-clicks;
  the content is uncommitted draft text, unlike "New session" which discards GRADED
  rows and rightly confirms at `GradingChatPanel.tsx:76-86`). Owner walk may overrule.

---

## 3. Item #2 - copy the feedback for an assignment

### What "the feedback for an assignment" is, precisely
One graded result's student-facing feedback: the three boxes
`strengths` / `improvements` / `resubmitNotice` of a `GradeResult`, composed the SAME
way the matrix's existing "Copy all feedback" composes them -
`copyAllFeedbackText(edit)` (`gradingResultsHelpers.ts:429`), three blocks joined by a
blank line, falling back to `overallComment`. This is NOT a new definition of
"feedback"; it is the one already shipped for the matrix rows.

### Reconciliation with the existing onCopy/copiedKey mechanism
The matrix already lets the owner copy per-assignment feedback (`RowFeedbackBoxes.tsx:104-113`).
The GAP is that `LatestResultCard` - the sticky card showing the newest arrived
result, read while the owner is still feeding submissions - has NO copy control.
**So #2 is SURFACING the existing mechanism on the one surface that lacks it, not a
new mechanism.**

### Mechanism
- Add `copiedKey: string | null` and `onCopy: (key, value) => Promise<void>` to
  `LatestResultCardProps` (`LatestResultCard.tsx:13-15`); thread them from
  `GradingChatPanel`, which already holds both props (`:51-52`), at the card mount
  (`:232`).
- Render ONE copy control in the card header (`:21-24`, beside student/score) that
  calls `onCopy(key, copyAllFeedbackText({ overall: result.overallComment, strengths:
  result.strengths, improvements: result.improvements, resubmitNotice:
  result.resubmitNotice }))`. `LatestResultCard` already imports from
  `gradingResultsHelpers`; `copyAllFeedbackText` and `FeedbackBoxesEdit`
  (`gradingResultsHelpers.ts:228,429`) are the exact reuse.
- Copy key: a DISTINCT literal, e.g. `` `latest-${result.student}-all-feedback` ``,
  NOT the matrix's `` `${student}-all-feedback` `` (so clicking the card does not
  light up the matrix row's "Copied" and vice versa). This is a `copiedKey` literal,
  not a `ta-` key, so it does NOT touch the storage-keys canary.

### Default behaviour
A new affordance; nothing else changes. The composed text is byte-identical to the
matrix's "Copy all feedback" for the same result.

### Machine-checkable vs owner-walk
- Machine-checkable (extend `GradingChatPanel.structure.test.ts`): the panel threads
  `copiedKey`/`onCopy` into `<LatestResultCard>`; the card renders a control wired to
  `onCopy` with `copyAllFeedbackText(...)`.
- Owner walk: the clipboard actually receives the text (clipboard API; nothing renders).

### Fork (recommended)
- **F2 - singular (one result) vs bulk (all students at once). RECOMMEND SINGULAR**
  (the card's current result), because the owner said "an assignment" (singular) and
  a bulk export already exists (`GradingResults` Export CSV, `:562-564`). Cost of
  wrong: a later wave adds a "copy all rows" control; cheap.

---

## 4. Item #3 - adjust harshness / leniency of grading

This is the one item with a prompt-seam and the one that owes a leverage reading.
It mirrors, almost exactly, the SHIPPED precedents the brief names:
`docs/ask-ai-voice-toggle-scope.md` and `docs/chatbot-formality-scale-scope.md` (a
pure directive function, composed into the prompt behind an optional field, default =
byte-identical to today, frozen oracle), AND this repo's own grading-prompt precedent:
`buildSystemPrompt`'s `scoringInstructionMode` / `praiseRouting` / `axisScope` params
(`prompts.ts:71,86,91`), each a trailing optional whose default branch is byte-identical
and PROVEN so by a frozen capture (`prompts-praise-routing.test.ts`, below).

### 4.1 The seam (the SHAPE every later wave is built against)

**Scale.** RECOMMEND discrete 3-level `SegmentedToggle` (the house idiom used by the
sibling voice/formality toggles, `src/app/components/ui/SegmentedToggle.tsx:74`),
levels `Lenient / Balanced / Strict`, with **Balanced** the middle and the no-op
default. A numeric slider needs a component this repo lacks and still maps to discrete
directives anyway (F3a).

**Type (NEW):** add to `src/lib/grade/types.ts` (client-safe, type-only import by the
driver; mirrors where `ChatFormality` lives in the formality precedent):
```ts
export type GradeHarshness = "lenient" | "balanced" | "strict";
```

**Pure directive function + two frozen literals (NEW), in `src/lib/grade/prompts.ts`
beside `axisScopeDirective` (`:231`):**
```ts
export function harshnessDirectiveForLevel(level: GradeHarshness | undefined): string {
  if (level === "lenient") return LENIENT_HARSHNESS_DIRECTIVE;
  if (level === "strict") return STRICT_HARSHNESS_DIRECTIVE;
  return "";   // "balanced", undefined, any unknown -> no directive = today
}
```
Mirror of `axisScopeDirective`/`chatStyleBlockForMode`: an absent/unrecognised level
yields `""` (today), never a throw. Proposed directive text (the test seat owns the
final frozen literal; these are concrete oracle defaults, plain-text, no emoji,
instructor voice, REGISTER of strictness only - they must not countermand the JSON
shape or the plain-text rules):
- `STRICT_HARSHNESS_DIRECTIVE` = e.g. "Grade strictly. Hold the submission to the full
  letter of each rubric area, deduct for every genuine shortfall you can evidence, and
  do not round up or give benefit of the doubt on a requirement that is only partially
  met. Stay fair and evidence-based: still cite the specific reason for each deduction,
  and never invent a violation the submission does not actually contain."
- `LENIENT_HARSHNESS_DIRECTIVE` = e.g. "Grade leniently. Give the benefit of the doubt
  wherever a rubric area is substantially met, treat minor or cosmetic issues as not
  worth a deduction, and award full points for an area unless there is a clear,
  evidenced shortfall. Stay honest: do not award points for work that is genuinely
  absent."

Note the base prompt already carries a lenient lean - "be generous/lenient in your
evaluation" and "Grade generously by default" (`prompts.ts:191,193`). The directive is
appended LAST (after any `axisScope` directive) so it has recency precedence over those
lines; whether the model actually shifts is an owner walk (R1).

**`buildSystemPrompt` gets a trailing 7th param** (`prompts.ts:56-92`), default
`"balanced"`, appended at the very end of the return:
```ts
export function buildSystemPrompt(assignmentInstructions, rubric, criteria = [],
  scoringInstructionMode = "some", praiseRouting = "in-overall-comment",
  axisScope: AxisScope = "all",
  harshness: GradeHarshness = "balanced"): string {
  ...
  const withAxis = axisScope === "all" ? basePrompt : `${basePrompt}\n\n${axisScopeDirective(axisScope)}`;
  const h = harshnessDirectiveForLevel(harshness);
  return h ? `${withAxis}\n\n${h}` : withAxis;   // "balanced" -> byte-identical
}
```
Why trailing positional and not a refactor to an options object: it mirrors the three
existing trailing-optional params exactly, keeps blast radius to the append site, and
leaves every other caller byte-identical. This file now has 7 positional params - a
smell, recorded as **observation O1** (not a blocker; the options-object refactor would
touch every `buildSystemPrompt` caller plus `prompts.test.ts` and
`prompts-praise-routing.test.ts`, out of proportion to this item).

**Engine thread.** `GradingRunOptions` (`engine.ts:278-288`) gains an optional
`harshness?: GradeHarshness` beside `commentSplit?` (`:287`), destructured at `:342`,
and passed as the new 7th arg at all three `buildSystemPrompt` sites
(`engine.ts:355-357`, `:364`, `:366`). `gradeEntries` (`:601-610`) already forwards
`options` unchanged, so no signature change there.

**Route thread.** `/api/grade-run-item` adds `harshness?: unknown` to its local
`GradeRunItemRequestBody` (`route.ts:58-66`) and validates it in `parseRequestBody`
(`:88-137`) EXACTLY as `commentSplit` is validated (`:135`): default-safe -
`harshness: body.harshness === "lenient" || body.harshness === "strict" ? body.harshness
: "balanced"` - then passes `{ commentSplit, harshness }` to `gradeEntries` (`:191`).
An absent field => `"balanced"` => byte-identical, so the existing `route.test.ts`
`VALID_BODY` (no harshness) still parses (adopt + re-run).

**Wire type.** `GradeRunItemRequestBody` in `incrementalRunPlan.ts:58-66` gains
`readonly harshness?: GradeHarshness;` beside `commentSplit?` (`:66`). `buildRunItemRequests`
(`:150-157`) does NOT set it (exactly as it already omits `commentSplit`), so
`incrementalRunPlan.test.ts:112`'s full-object `toEqual` on `requests[0]` stays green -
the same shape the already-optional `commentSplit` has (adopt + re-run).

### 4.2 Threading: header-capture + lock (NOT per-submit)

RECOMMEND harshness is captured ONCE at `beginSession` and frozen for the session,
exactly like instructions/rubric, and the control LOCKS after `sessionReady`:
- `driver.beginSession` (`useContinuousGradingRun.ts:212-231`) gains a `harshness`
  param, stored in a new `harshnessRef`.
- `driver.submit` includes it on every body (`:298-306`) conditionally, mirroring the
  `commentSplit` spread (`:305`): `...(harshnessRef.current !== "balanced" ? { harshness:
  harshnessRef.current } : {})`. So the DEFAULT wire is byte-identical, and every
  student in one session is graded at the SAME harshness.
- `GradingChatPanel` holds `harshness` state, passes it into `ensureSession` ->
  `beginSession` (`:112`), and the `SegmentedToggle` is shown editable in the setup
  area pre-lock and reflected in the `setupSummary` strip post-lock (`:196`), e.g.
  "Instructions and rubric are set for this session. Grading: Strict."

Why capture+lock over per-submit: it mirrors the shipped locked-fields model
(`GradingChatPanel.tsx:67-73`) and gives the leverage claim its mechanism (section 4.4:
the SAME strictness held constant across N students is a SCALE property a chat cannot
hold). Cost of wrong (F3b): if the owner wants to change harshness mid-session, they
need a New session - identical to the existing rubric-lock constraint, so it is
consistent, not a new surprise.

### 4.3 Persistence
One NEW `ta-` key: `ta-grading-chat-harshness`, read/written like
`ta-grading-chat-input-mode` in `ChatComposer` (`:28-50`). **This key MUST be added to
`grading-chat-storage-keys.structure.test.ts`'s frozen `EXPECTED` set (`:13-18`,
currently 4 keys) in the SAME commit** - that canary scans RAW source (comments
included) of every non-test file in the directory and reddens repo-wide until the set
matches (`:48-63`). Corollary: no other wave's file (clear/copy/loading) may write the
literal `ta-grading-chat-harshness` in code OR a comment before Wave 3 lands, or it
trips the canary early - refer to it by description only (the canary's own header says
so, `:1-6`).

### 4.4 Leverage (flag for AC/owner; not claimed here)
This item changes a capability a user reaches, so a claim is owed (`DEV_LOOP.md`,
Criteria). Honest reading: a bare directive-injection is the thin `AskAiModal` /
formality-toggle shape (`leverage.md:100-130`) - click/control cost, not categorical.
BUT in the grading-chat it rides the SHIPPED **SCALE** mechanism
(`leverage.md:41`, `engine.ts` session-frozen rubric): captured once and applied to
every student in the batch, holding grading STRICTNESS constant across N submissions -
which a chat cannot do (it re-specifies tone per paste and drifts). The removal test
for THAT claim is driver-level and buildable here: assert every dispatched body in one
session carries the SAME `harshness` (delete the capture/freeze so each submit re-reads
live panel state, and a mid-session toggle makes two bodies disagree -> red). The
byte-identity half is covered by the frozen oracle (AC below). **F3c - leverage
disposal is the owner's:** (a) accept-cost-explicitly stating the advantage is SCALE
consistency of strictness, (b) redesign, (c) reject the claim. RECOMMEND (a). The AC
seat finalises; the architect only records the reading.

### 4.5 Acceptance criteria (object / instrument / direction of failure)
- **AC3-1 directive map is pure with a frozen oracle.** Object: `harshnessDirectiveForLevel`.
  Instrument: unit test (new describe in `prompts.test.ts` or a new
  `prompts-harshness.test.ts`). Fails if `"balanced"`/`undefined`/garbage map to
  anything but `""`, or `"lenient"`/`"strict"` to the wrong frozen literal, or the two
  non-default literals are equal.
- **AC3-2 default/balanced/wire-absent is byte-identical to today.** Object:
  `buildSystemPrompt` output. Instrument: EXTEND `prompts-praise-routing.test.ts`'s
  frozen captures (`DEFAULT_NO_CRITERIA`, `DEFAULT_WITH_CRITERIA_SOME`,
  `DEFAULT_WITH_CRITERIA_EVERY`, asserted via `.toBe(...)` at `:28-50`). Add
  `expect(buildSystemPrompt("Instructions.","Rubric.", [], "some", "in-overall-comment",
  "all", "balanced")).toBe(DEFAULT_NO_CRITERIA)`. Fails on a single byte of drift.
- **AC3-3 a non-default level is actually composed and appended last.** Object:
  `buildSystemPrompt` output with `"strict"`/`"lenient"`. Instrument: unit test. Fails
  if the directive is absent, or not at the end, or if the JSON-shape/plain-text lines
  are disturbed.
- **AC3-4 persistence.** Object: the `ta-grading-chat-harshness` key. Instrument:
  source-text (the storage-keys canary + a read/write literal assertion). Fails if the
  panel does not read/write the key, or the canary set omits it.
- **AC3-5 the seam is instrumented end-to-end so harshness cannot ship dead.** Object:
  route parse + driver body-build + engine thread. Instrument: a `harshness.wiring.test.ts`
  (route reads/validates `harshness`, passes it to `gradeEntries`; the driver puts it on
  the body at non-default) plus the engine arg at the `buildSystemPrompt` call sites.
  Fails if any hop drops it. (Name any comment-stripper helper `withoutLineComments`,
  never `stripComments` - `strip-comments-agreement.structure.test.ts`,
  `this-repo.md:179`.)
- **AC3-6 SCALE removal test (leverage).** Object: the set of bodies dispatched in one
  session. Instrument: `useContinuousGradingRun.lifecycle.test.ts` (adopt) - drive
  `beginSession({harshness:"strict"})` then two `submit`s, assert both bodies carry
  `harshness:"strict"`. Fails if the capture is removed so a per-submit read lets them
  diverge.
- **AC3-7 (owner walk).** Rendered toggle look/placement; whether the live model
  actually grades stricter/more leniently. No instrument here. Residuals R1, R2.

---

## 5. Item #4 - loading indicators after a submission

### Current loading states (the gap, measured)
Only the FIRST header resolve disables the composer (`busy = headerState ===
"resolving"`, `:160`). After `sessionReady`:
1. A file/URL submission awaits `prepareChatSubmissionAction` (server extraction)
   BEFORE any row appears (`useContinuousGradingRun.ts:269`); nothing on screen changes
   during that round-trip. This is the literal "after a submission has been given" gap.
2. A dispatched-but-not-arrived row (dispatched at `:291-292`, result merged only on
   arrival via `mergeArrivedResults`) shows blank matrix cells with no "grading..."
   affordance.
3. No aggregate progress, though `driver.inFlight`/`completedCount`/`dispatchedCount`
   already exist (`:106-108`, `:373-375`) and are unused by the panel.

### Mechanism (concrete, reuse existing idioms)
RECOMMEND two chat-LOCAL additions (both in `GradingChatPanel.tsx`, keeping the change
disjoint from the shared matrix):
- **(a) Submit-in-flight indicator.** A local `preparing` boolean set true around the
  `ensureSession`+`submit` awaits in `handleSubmitText`/`handleSubmitFiles`/`handleSubmitUrl`
  (`:131-158`), cleared in a `finally`. While true, show an inline status in the sticky
  composer (e.g. "Reading your submission...") and pass `disabled={busy || preparing}`
  to `ChatComposer` (`:238`). Covers gap #1.
- **(b) Grading-progress indicator.** When `driver.inFlight > 0`, render a line in the
  sticky composer (`:231-239`), e.g. "Grading N submission(s)..." built from
  `driver.inFlight`/`driver.completedCount`/`driver.dispatchedCount`. Reuses the
  existing text-swap loading idiom (`GradingResults.tsx:559` `"Posting..."`; MUI
  `loading` disables with no `aria-busy`, per the MUI-facts memo - use plain text, not
  a role). Covers gaps #2/#3 at the surface level without touching the shared matrix.

### Default behaviour
Purely additive indicators; no behaviour change to grading itself.

### Machine-checkable vs owner-walk
- Machine-checkable (extend `GradingChatPanel.structure.test.ts`): the panel reads
  `driver.inFlight` (or `completedCount`/`dispatchedCount`) and renders a progress
  element; a `preparing` state is set around the submit awaits and feeds the composer's
  `disabled`. The SUBSTANCE is wiring - the indicator is present and reads the in-flight
  signal.
- Owner walk: whether the indicator is noticeable, well-placed, and "reads as better".
  **#4 is the item whose actual value is MOST owner-walk-dependent** - a wired-but-ugly
  or wired-but-invisible spinner passes every source-text check. Residual R4.

### Fork (recommended)
- **F4 - per-row "grading..." cell in the matrix vs chat-local aggregate only.**
  RECOMMEND chat-local (a)+(b) for this item: a per-row cell lives in the SHARED
  `GradingResults.tsx` (918 lines; also drives the batch/incremental path), a wider
  blast radius and a shared-file change the three panel items do not otherwise need.
  Record the per-row indicator as a follow-up the owner can scope separately (it would
  also benefit the batch path). Cost of wrong: if the owner wants per-row, a later wave
  edits the shared matrix.

---

## 6. Which items are owner-walk-only

None is PURELY owner-walk - each has a machine-checkable wiring or pure-function half
(sections 2-5). What is owner-walk per item: #1 the fields actually emptying on screen;
#2 the clipboard actually receiving text; #3 the live model honouring strict/lenient
and the rendered toggle; #4 the felt quality/visibility of the indicator. **#4 is the
most owner-walk-dependent** because its entire value is a rendered, felt loading cue
that no test here can observe; #3's model-honouring (R1) is the next. #1 and #2 are the
most machine-checkable (the clearing handler and the copy wiring are fully source-text
assertable; only the final rendered/clipboard effect is a walk).

---

## 7. Wave plan

The four items share `GradingChatPanel.tsx`, so they largely serialise. The single
genuinely separable piece is the #3 prompt SEAM (`src/lib/grade/*` + the route + the
wire type), which is disjoint from every panel `.tsx`. Cut:

### Wave 1 - HARSHNESS SEAM (independent; byte-identical; may run CONCURRENTLY with Wave 2)
No UI. Default `"balanced"` = byte-identical to today at every layer.
Write set:
- `src/lib/grade/types.ts` - add `GradeHarshness` (type-only module addition)
- `src/lib/grade/prompts.ts` - 7th param + `harshnessDirectiveForLevel` + two directive consts
- `src/lib/grade/engine.ts` - `GradingRunOptions.harshness` + thread to the three `buildSystemPrompt` calls (the CALLER of the new param, same wave)
- `src/app/api/grade-run-item/route.ts` - parse + pass `harshness` to `gradeEntries` (the CALLER on the wire path)
- `src/app/components/grading/incrementalRunPlan.ts` - `harshness?` on `GradeRunItemRequestBody` (type field only; mirrors `commentSplit?`)
- `src/lib/grade/prompts-praise-routing.test.ts` - ADOPT: add AC3-2 byte-identity case to the frozen-oracle block
- `src/lib/grade/prompts.test.ts` (or new `prompts-harshness.test.ts`) - AC3-1, AC3-3
- `src/app/api/grade-run-item/route.test.ts` - ADOPT: re-run; optionally add a harshness parse case
- `src/app/components/grading/incrementalRunPlan.test.ts` - ADOPT: re-run (confirms `:112` `toEqual` still green)
- NEW `harshness.wiring.test.ts` (route+engine half of AC3-5)

After Wave 1 the wire is absent from every client -> byte-identical. `GradeHarshness`
is type-only; `harshnessDirectiveForLevel`/the new param are called by `engine.ts` and
`route.ts` in THIS wave (caller-in-wave rule satisfied).

### Wave 2 - PANEL UX: clear (#1) + copy (#2) + loading (#4) (independent of Wave 1; may run CONCURRENTLY)
One serialized panel wave (these three cannot be concurrent WITH EACH OTHER - all edit
`GradingChatPanel.tsx` - but together they are disjoint from Wave 1 and from Wave 3's
seam). Write set:
- `src/app/components/grading-chat/GradingChatPanel.tsx` - clear controls + clear-all (#1), thread `copiedKey`/`onCopy` to the card (#2), `preparing` state + progress line (#4)
- `src/app/components/grading-chat/ChatComposer.tsx` - composer-text Clear (#1)
- `src/app/components/grading-chat/LatestResultCard.tsx` - copy control + props (#2)
- `src/app/components/grading-chat/grading-chat.module.css` - any new class (CSS exempt from the ceiling; but see the orphan-class note below)
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` - ADOPT: add #1/#2/#4 wiring assertions
- MUST NOT write the literal `ta-grading-chat-harshness` anywhere (it lands in Wave 3).

### Wave 3 - HARSHNESS CONTROL + driver (serial: after BOTH Wave 1 and Wave 2)
Needs Wave 1's type/wire AND shares `GradingChatPanel.tsx` with Wave 2. Write set:
- `src/app/components/grading-chat/useContinuousGradingRun.ts` - `harshness` param on `beginSession`, `harshnessRef`, conditional spread on the body
- `src/app/components/grading-chat/GradingChatPanel.tsx` - harshness state + persist `ta-grading-chat-harshness` + `SegmentedToggle` + lock-after-session + summary line + pass to `ensureSession`/`beginSession`
- `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts` - ADD `ta-grading-chat-harshness` to `EXPECTED` (`:13-18`) - SAME commit
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` - ADOPT: harshness control + lock assertions
- `src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts` - ADOPT: AC3-5 driver half + AC3-6 SCALE removal test

**Concurrency note:** Wave 1 and Wave 2 are disjoint by exact path (Wave 1 is
`src/lib/grade/*` + the route + `incrementalRunPlan.ts`; Wave 2 is the three panel
`.tsx` + CSS + the panel structure test) and neither establishes a fact the other
designs against - so they may run as concurrent subagents (cap 2-3,
`parallel-disjointness.md`), sharing only the serialized `tsc`/gate resources the
orchestrator already manages. Wave 3 is strictly last. Alternative if tighter
verification is wanted: split Wave 2 into three serial sub-waves (#1, then #2, then
#4); costs more rounds, same write sets.

### Gate (every wave)
```
npm run test:paths <p1> <p2> ...   # one path per arg, never a raw multi-path vitest (this-repo.md:52-66)
```
plus `npx vitest run src/file-size-ceiling.structure.test.ts` UNCONDITIONALLY
(`this-repo.md:42-49`), `npx tsc --noEmit` (single caller), `npm run lint` (exit 0, no
NEW warning in files this wave writes), and `git status --short` vs the assignment
(stale-worktree hazard, `this-repo.md:268-272`).

Per-wave `test:paths` membership:
- **Wave 1:** `src/lib/grade/prompts.test.ts src/lib/grade/prompts-praise-routing.test.ts
  src/app/api/grade-run-item/route.test.ts src/app/components/grading/incrementalRunPlan.test.ts`
  + the new `harshness.wiring.test.ts` (+ `prompts-harshness.test.ts` if split).
- **Wave 2:** `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` (+ any
  new composer/card wiring test).
- **Wave 3:** `src/app/components/grading-chat/GradingChatPanel.structure.test.ts
  src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts
  src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts`.

### The `owns` list (tests that READ an edited file as source text)
Command:
```
Get-ChildItem -Recurse -Include *.test.ts src | Select-String -Pattern
"GradingChatPanel|ChatComposer|LatestResultCard|useContinuousGradingRun|grade/prompts|grade/engine|grade-run-item|incrementalRunPlan|grade/types" -List
```
Output (2026-10-06), classified:
```
src/app/actions/grading-chat-intake.test.ts            checked-safe (reads the intake action, no field-set pin on harshness)
src/app/actions/grading-incremental.test.ts            checked-safe
src/app/actions/grading-submission-grade.test.ts       checked-safe (recording path; buildSystemPrompt default unchanged)
src/app/api/grade-run-item/route.test.ts               ADOPT (Wave 1 - re-run; VALID_BODY has no harshness, parse is default-safe)
src/app/components/grading/incrementalRunPlan.test.ts  ADOPT (Wave 1 - re-run; :112 toEqual stays green, harshness unset like commentSplit)
src/app/components/grading/runProgressCopy.test.ts     checked-safe
src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts  checked-safe (sibling hook; not edited)
src/app/components/grading-chat/GradingChatPanel.structure.test.ts     ADOPT (Waves 2 and 3)
src/app/components/grading-chat/latestGradedResult.test.ts             checked-safe (selector; not edited)
src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts  ADOPT (Wave 3)
src/app/components/grading-recording/*                 checked-safe (recording path; buildSystemPrompt default branch unchanged)
src/app/components/grading-results/*                   checked-safe (#2 edits LatestResultCard, not these; copyAllFeedbackText reused unchanged)
src/lib/grade/prompts-praise-routing.test.ts           ADOPT (Wave 1 - frozen oracle; AC3-2)
src/lib/grade/rubric-provenance-producers.structure.test.ts  checked-safe (engine adds NO new GradingRun producer; AxisScore is not one)
src/lib/module-graph/runtime-import-graph.test.ts      checked-safe (no new cross-boundary import: driver imports GradeHarshness type-only from grade/types)
src/tools/vitest-paths/gate-commands.structure.test.ts checked-safe
```
(Tests matched on `grade/engine`/`grade/types`/etc. that are pure recording/
repo-grades/code-runner coverage are checked-safe because the ONLY grading-prompt
change is a new trailing param whose default branch is byte-identical and pinned by the
frozen oracle; the verifier re-runs the full suite once per wave to confirm.)

### Orphan-class / canary notes
- CSS added in Wave 2/3 to `grading-chat.module.css`: the page-module orphan-class
  ratchet (`page-module-css-orphan-classes.test.ts`) pins an EXACT orphan count for
  `page.module.css`, not this module - but any NEW class must be REFERENCED in the same
  commit (or use inline token styles). State which it is in the build brief.
- `grading-chat-storage-keys.structure.test.ts` EXPECTED set: bumped ONLY in Wave 3, in
  the same commit that adds the key (section 4.3).

---

## 8. Not trivially revertible
Nothing. No migration, no change to an EXISTING persisted-key shape (one NEW `ta-` key
only, Wave 3). `buildSystemPrompt`'s added param and the route/wire/engine fields are
additive behind a byte-identical default, pinned by the frozen oracle. Smallest safe
revert is per-file per-wave.

---

## 9. Residual register (owner + instrument + step; MUST be filed in docs/BACKLOG.md)
A residual not in `docs/BACKLOG.md` does not exist (`DEV_LOOP.md:200-215`); the
orchestrator files these at disposal (a seat cannot edit the backlog).

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | Does the live model actually grade stricter/more leniently under the directives? | Owner | None here (no `GEMINI_API_KEY`; LLM paths mock-only, `this-repo.md:252`) | Owner walk: grade the same submission at each level, compare |
| R2 | Rendered harshness `SegmentedToggle` look/placement/lock in the panel | Owner | None (no component renders, `this-repo.md:134,262`) | Owner/browser walk |
| R3 | #1/#2 rendered effect: fields actually empty; clipboard actually receives the feedback | Owner | Source-text pins the wiring; the render/clipboard effect is a walk | Owner walk |
| R4 | #4 indicator is actually noticeable and reads as a better loading cue (not just wired) | Owner | Source-text proves it is wired/present; adequacy is unobservable here | Owner walk |
| R5 | Leverage disposal for #3 (F3c): accept-cost (SCALE consistency) vs redesign vs reject | Owner | Verify re-judges vs the as-built diff; AC3-6 pins the SCALE removal test | AC seat records the chosen disposal |
| R6 (observation O1) | `buildSystemPrompt` now takes 7 positional params - an options-object refactor is deferred (out of proportion to this item) | Owner/next-toucher | `@(Get-Content src/lib/grade/prompts.ts).Count`; the param list | A later refactor if the count grows again |
| R7 | Per-row "grading..." matrix cell (#4 F4) deferred - lives in shared `GradingResults.tsx`, benefits the batch path too | Owner | Would be source-text + owner walk | Owner scopes separately |

---

## 10. Disposition
First version of `docs/grading-chat-controls-scope.md` (`git status` shows it
untracked). No prior requirements to map; no renumbering.
