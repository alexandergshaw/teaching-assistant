# Scope: offer to override non-blank directions + rubric with the Canvas assignment's values

Owner request, 2026-10-11 (verbatim): "make it to where selecting an institution
and assignment with a live connection on the llm chat grading option will offer
to override the directions and rubric text fields."

This is the ARCHITECTURE/SHAPE pass. It is READ-ONLY (no production code). It
decides where the override seam falls, which object carries the decision, what
is one layer versus two, and which reachable path the owner's words bind to. It
does not write acceptance criteria (loop-ac), the oracle (loop-test-author), or
the wave plan's final ordering beyond the dependency shape (loop-plan). Every
fork is surfaced with a recommended reading and the cost of being wrong.

All line counts were produced by `@(Get-Content <file>).Count` in PowerShell on
HEAD (main) 2026-10-11 unless a different command is named. See the Quantities
table at the end; each number there names its command.

---

## 1. What exists today, read from the tree (not from a doc)

Every citation below was opened directly.

### 1a. The fill decision is gated so non-blank fields never see Canvas at all

`src/app/components/grading-chat/GradingChatPanel.tsx:263-308` (`ensureSession`):

- `:266` `const needsFill = !instructions.trim() || !rubric.trim();`
- `:269` `if (canvasUrl && scope && needsFill)` guards the Canvas fetch. The
  `fetchCanvasMetaAction(canvasUrl.trim())` call (`:271`) and its diagnostic
  record (`:272-276`) are INSIDE this block. **When both setup fields are
  non-blank, `needsFill` is false, so Canvas is never fetched and its values
  are silently discarded.** This is the exact behaviour the owner wants changed.
- `:279` `loadChatSetupMemory(scope)` is likewise gated on `needsFill`.
- `:280-284` `resolveSetupFill({ typed, canvasMeta, storedMemory })` computes
  the filled values; `:285-286` push them into state; `:288-291`
  `driver.beginSession({ assignmentInstructions: fill.instructions, rubric:
  fill.rubric, ... })` begins the session from the RESOLVED values, not the
  (stale until next render) state vars.
- `:298` `saveChatSetupMemory(scope, { rubric: fill.rubric, instructions:
  fill.instructions })` persists the resolved values under the Canvas-scoped
  key. This is the ONLY persistence of the setup fields (see 1d).

### 1b. `resolveSetupFill` is a pure leaf: typed wins, else canvas, else memory, else blank

`src/app/components/grading-chat/chatSetupFill.ts:46-55` (`resolveSetupFill`),
per-field via `pick` (`:35-44`): `if (isFilled(typed)) return typed; if
(isFilled(canvas)) return canvas; if (isFilled(memory)) return memory; else "".`
**A typed (non-blank) value is never replaced by a fetched or stored one.** That
precedence is correct for the BLANK-fill case and must stay unchanged; the
override is a SEPARATE, explicit, opt-in path layered beside it, not a change to
this precedence. This file is the model for the new decision leaf (2b).

### 1c. The From-LMS picker resolves to a Canvas URL and reuses the URL submit

`src/app/components/grading-chat/ChatComposer.tsx:204-217` (`handleSendLms`):
`buildLmsAssignmentUrlAction(lms.institution, lms.courseId, lms.assignmentId)`
returns `{ url }` or `{ error }`; on success it calls `onSubmitUrl(built.url,
...)`. `onSubmitUrl` is `handleSubmitUrl` in the panel
(`GradingChatPanel.tsx:370-375`), which calls `ensureSession(url)`. So the
picker and a pasted Canvas URL (url mode, `ChatComposer.tsx:431-456`) reach the
SAME seam: `ensureSession(canvasUrl)`. The picker only lists institutions that
are configured (`useLmsSubmissionPicker.ts:71`,
`listConfiguredInstitutionsAction`), which is the owner's "live connection".

### 1d. The fields start blank; scoped memory is the only reload-survivor

`GradingChatPanel.tsx:48-52` (RG-CLEANUP comment) and
`GradingChatPanel.structure.test.ts:417-437`: the setup fields start blank on
reload; `loadChatSetupMemory(scope)` inside `ensureSession` is the only restore.
Scope is `"canvas:" + trimmed url` (`chatSetupMemory.ts:20-24`,
`deriveChatScope`). So a value saved via `saveChatSetupMemory` for a Canvas URL
is re-offered on the next session for the same URL (fields blank -> `needsFill`
true -> `resolveSetupFill` fills from memory). This is the reload-persistence
path the override must write through (Fork F4).

ADVISORY (M2), affecting the STATED mechanism of 1d/F4 once step 4 makes the
fetch unconditional: on reload both fields are blank, so the fetch now runs and
`resolveSetupFill`'s precedence (canvas before memory) means Canvas - not memory
- supplies the reloaded values whenever the fetch SUCCEEDS; memory is load-
bearing only if the reload fetch FAILS. The OBSERVABLE that F4 promises still
holds for the override feature: an accepted override's saved value IS the Canvas
value, so Canvas-on-reload returns the same text. (A side effect worth flagging
for AC/test-author: a previously-TYPED-and-saved value will now be shadowed by
Canvas on reload when the fetch succeeds, because the fetch is unconditional -
this is inherent to moving the fetch out from under `needsFill`, part of the
accepted shape, not a new decision here.)

### 1e. Fields lock once the session is ready; the offer is a pre-lock event

`GradingChatPanel.tsx:233` `sessionReady = driver.headerState === "ready"`;
`:428-470` collapses the setup fields to a summary and disables them once ready.
`ensureSession` runs BEFORE the session is ready (`:264` returns early only if
already ready). **The override offer therefore occurs at the session-begin seam,
before the fields lock - never mid-session.** This is consistent with the
capture-once design (verify attack 9, comment at `:226-232`): the header is
captured once and cannot diverge afterward.

### 1f. The Canvas meta server action needs no change

`fetchCanvasMetaAction` (`src/app/actions/grading.ts:53-63`) returns
`{ description, rubricText, linkedFileIds } | { error }`; the panel maps
`meta.description -> instructions`, `meta.rubricText -> rubric` at `:277`. The
override reuses this action unchanged - no new server action, no signature
change. **This matters: `grading.ts` is 984/1000 lines (Quantities table); the
design must not grow it, and it does not.**

### 1g. Diagnostics: the fetch already has a seam; there is no decision seam

`fetch_canvas_meta` is a `ChatSeamOperation`
(`chatSeamDiagnostic.ts:13-18`) recorded via `recordChatSeamSettled`
(`:78-93`), which routes through `recordGradingDiagnosticEntry`
(`gradingDiagnosticLog.ts:71-84`, NO STUDENT DATA, label "Fetch Canvas
assignment details" at `:47`). Today this records only when the fetch runs -
i.e. only in the `needsFill` case. See Fork F5.

---

## 2. The shape

### 2a. The surface the user reaches IS a layer; name it

The feature is three layers, and the SURFACE between them is itself a layer that
must be stated (this repo has shipped a library + an endpoint with no surface
between them, both gates green - see MEMORY "verify reachability"):

1. DECISION (pure, testable here): given the typed fields and the Canvas meta,
   which fields are OFFERABLE for override, and - given an accept/decline per
   field - what the resulting values are. A plain `.ts` leaf (2b).
2. SURFACE (the layer the user reaches; NOT testable here - no component
   renders): the affordance that presents the offer and collects the choice.
   Fork F2 decides its form; whatever its form, it sits inside `ensureSession`
   between the fetch and `beginSession`, pre-lock (1e).
3. WIRING (source-text testable): `ensureSession` fetches meta whenever there is
   a Canvas URL and scope (not only when `needsFill`), runs the blank-fill path
   unchanged for blank fields, presents the offer for non-blank differing
   fields, applies the chosen values, feeds the resolved values to
   `beginSession`, and persists them via `saveChatSetupMemory`.

The user reaches the feature at layer 2, driven by layer 3, computing on layer
1. If any later wave ships layer 1 + layer 3 without a layer-2 affordance a user
can act on, the feature is dead with every gate green. The verify pass must
exercise the OWNER WALK of layer 2 (confirm the dialog actually appears and a
click actually replaces the on-screen text), because no test here can.

### 2b. The new pure leaf: `chatOverrideOffer.ts`

A sibling of `chatSetupFill.ts`, same directory, pure and client-safe, single
caller (the panel). Proposed surface (the test-author seat finalises names; the
SHAPE is what is pinned):

THE COMPOSITION BASE (round-1 blocker fix, a7e5910e). `applyOverride` composes
over the `resolveSetupFill` RESULT (the blank-fill `fill` object), NOT over the
raw typed values. OFFERABILITY is judged on the RAW typed values (a field the
user left blank is never offerable - it is silently filled); but the per-field
BASE that a declined or non-offerable field falls back to is the FILL value and
FILL source, so a field the blank-fill already filled from Canvas is never
reverted. Only an offerable+accepted field takes `canvasValue`. See 2c for why
basing the apply on raw typed would both silently regress the blank-fill (2c
CRITICAL, test 7a) and HARD-BREAK the grade (beginSession refuses empty
instructions, `useContinuousGradingRun.ts:285-294` via `resolveChatRunHeaderAction`).

```
export interface OverrideOfferField {
  readonly offerable: boolean;   // typed non-blank AND canvas non-blank AND differs
  readonly canvasValue: string;  // the value override would install
}
export interface OverrideOffer {
  readonly instructions: OverrideOfferField;
  readonly rubric: OverrideOfferField;
  readonly anyOfferable: boolean;
}
// PURE. Offerability is judged on the RAW typed values: a field is offerable
// when the user typed a non-blank value AND Canvas returned a non-blank value
// for it that DIFFERS from the typed value. A blank field is NEVER offerable
// (resolveSetupFill fills it silently instead).
export function computeOverrideOffer(args: {
  typed: SetupFields;                 // reuse chatSetupFill.SetupFields - RAW typed
  canvasMeta: SetupFields | null;
}): OverrideOffer;

export interface OverrideDecision { readonly instructions: boolean; readonly rubric: boolean; }
// PURE. Composes over the resolveSetupFill RESULT (the blank-fill base), NOT
// over the raw typed values. Per field: an offerable field whose decision is
// true installs canvasValue and is marked source "canvas"; EVERY other field
// (declined, non-offerable, or blank) keeps the fill VALUE and the fill SOURCE
// verbatim. Returning ResolveSetupFillResult (values + per-field source) is what
// lets the panel's note at GradingChatPanel.tsx:299-306 report an overridden
// field's Canvas origin (M1) by reading the resolved source, not only fill's.
export function applyOverride(args: {
  base: ResolveSetupFillResult;       // reuse chatSetupFill.ResolveSetupFillResult (the fill object)
  offer: OverrideOffer;
  decision: OverrideDecision;
}): ResolveSetupFillResult;           // feeds beginSession AND the Canvas-origin note
```

Why "differs" is in the offerable condition: if Canvas's value equals the user's
typed value, overriding is a no-op and offering it is a pointless click. Pinning
"differs" keeps the click-cost honest and gives the removal/boundary tests a
discriminating axis. ADVISORY (M5, for test-author/UX): "differs" OVER-OFFERS in
practice, because the Canvas description is HTML-ish markup while the typed text
is plain, so a semantically equivalent pair almost always compares unequal and
is offered. This is acceptable because the offer is EXPLICIT (the user declines
with Cancel, no silent change), but the test author/UX seat should know the
offer will fire more often than "the texts truly differ" implies, and may choose
a normalisation before comparison (that is a UX/test refinement, not a shape
change - the leaf's `differs` axis is unchanged).

### 2c. The reshaped `ensureSession` (layer 3)

The straight-line async function, post-reshape (prose, not final code):

1. If already ready, return true (unchanged, `:264`).
2. `scope = canvasUrl ? deriveChatScope(canvasUrl) : ""` (unchanged).
3. `needsFill = !instructions.trim() || !rubric.trim()` (unchanged).
4. Fetch meta when `canvasUrl && scope` (NO LONGER `&& needsFill`), preserving
   the capture -> await -> record ordering
   (`chatSeamDiagnostic.wiring.test.ts:14-23` pins that ordering and is in the
   owns set). This is the one gate that moves. See the collision in section 4.
5. Blank-fill unchanged, and ALWAYS computed (not "only if nothing offerable"):
   `fill = resolveSetupFill({ typed, canvasMeta, storedMemory })` still fills
   only blank fields (its typed-wins precedence guarantees it never touches a
   non-blank field), using `loadChatSetupMemory(scope)` as before. `fill` is the
   COMPOSITION BASE for step 6 in every case - it is not a fallback. The memory
   load may move out from under `needsFill` with the fetch, or stay gated -
   either is correct because `resolveSetupFill` ignores memory for a non-blank
   field; the test seat should pin the observable (blank fields fill, non-blank
   do not), not the gate's spelling.
6. Override offer: `offer = computeOverrideOffer({ typed: { instructions,
   rubric }, canvasMeta })` - note OFFERABILITY reads the RAW typed values, not
   `fill`. If `offer.anyOfferable`, present the layer-2 affordance (F2), collect
   `decision`. In every case `resolved = applyOverride({ base: fill, offer,
   decision })`: the apply COMPOSES OVER `fill`, so a declined or non-offerable
   field keeps `fill`'s value and source (the blank-fill is preserved), and only
   an offerable+accepted field takes `canvasValue`. When nothing is offerable (or
   all declined), `applyOverride` returns `fill` verbatim.
7. Feed `beginSession` the FINAL resolved values: `resolved.instructions` /
   `resolved.rubric` (never the stale state vars, never raw typed). Because
   `resolved` is composed over `fill`, a field the blank-fill filled from Canvas
   reaches `beginSession` non-empty even when its sibling was overridden - which
   is what keeps `resolveChatRunHeaderAction` from refusing empty instructions
   (`useContinuousGradingRun.ts:285-294`).
8. On success, `setInstructions`/`setRubric` to `resolved.instructions` /
   `resolved.rubric` and `saveChatSetupMemory(scope, resolved)` so the chosen
   text survives reload (F4). The note reads `resolved.instructionsSource` /
   `resolved.rubricSource` (NOT only `fill`'s) so an accepted override of a
   non-blank field is reported as "from Canvas" (M1); copy is UX's, the mechanism
   folds into the existing note logic at `:299-306`.

CRITICAL: a blank field (silent fill, step 5) and a non-blank field (override
offer, step 6) are INDEPENDENT. One field may be silently filled from Canvas
while the other is offered for override in the same submit. Because the apply
composes over `fill` (not over raw typed), the silently-filled field is NEVER
reverted by the override path. The leaf and the wiring must handle the mixed
case; the oracle must include it (test 7a blank-fill non-regression).

Worked example - THE MIXED CASE the blocker fix exists for (instructions blank,
rubric non-blank and differing from Canvas, user ACCEPTS the rubric override):

- `fill = resolveSetupFill(...)`: `instructions` was blank, so it fills from
  Canvas -> value = Canvas description, `instructionsSource = "canvas"`;
  `rubric` was typed, so typed wins -> value = typed rubric, `rubricSource =
  "typed"`.
- `offer = computeOverrideOffer({ typed, canvasMeta })`:
  `instructions.offerable = false` (typed was blank); `rubric.offerable = true`
  (typed non-blank, Canvas non-blank, differs), `rubric.canvasValue = Canvas
  rubric`; `anyOfferable = true`.
- `decision = { instructions: false, rubric: true }` (user accepts rubric).
- `resolved = applyOverride({ base: fill, offer, decision })`:
  - `instructions`: not offerable -> keeps `fill` -> Canvas description, source
    "canvas". **PRESERVED - not reverted to "" (the round-1 bug).**
  - `rubric`: offerable AND accepted -> `canvasValue` (Canvas rubric), source
    "canvas".
- `beginSession` receives a non-empty Canvas description + Canvas rubric, so
  `resolveChatRunHeaderAction` does NOT refuse, and the grade proceeds. The note
  reports BOTH fields came from Canvas. Had the apply rebased on raw typed,
  `instructions` would be "" -> beginSession refuses -> the accepted override
  FAILS the grade.

---

## 3. Forks - each a recommended reading with cost-if-wrong

### F0. Leverage disposition (belongs to loop-ac; flagged here because it is a product fork)

This changes a capability a user reaches, so the AC seat owes a LEVERAGE CLAIM
(`docs/loop/leverage.md`). The honest reading: the mechanism is INTEGRATION-
flavoured but thin - the app does a LIVE read of the authoritative Canvas
assignment definition and reconciles it against the instructor's typed text,
which a chat cannot do without the instructor pasting both and diffing by eye.
It is close to the `AskAiModal` negative example (a convenience), so
`leverage.md`'s three explicit calls apply (redesign / accept-cost / reject).

RECOMMENDED READING: ACCEPT THE COST EXPLICITLY - the advantage is that the app
fetches the authoritative Canvas assignment live and offers reconciliation
without a re-paste; state it as click-cost + live-integration, not as a
categorical advantage. COST IF WRONG: if the owner wants a stronger mechanism
(e.g. a persisted per-assignment reconciliation record), that is additive and
does not change the shape here. This is the AC seat's/owner's call; the architect
does not default it.

### F1. Scope of the trigger: From-LMS picker only, or any Canvas URL submit?

Both reach `ensureSession(canvasUrl)` (1c). Gating to picker-only would require
threading a "from picker" flag through `onSubmitUrl` into `ensureSession`.

RECOMMENDED READING: URL-WIDE - the offer fires in `ensureSession` for any
Canvas URL (picker OR pasted), because (a) it is the same code path and a flag
buys nothing, (b) a pasted-URL user benefits identically, and (c) the offer is
EXPLICIT (the user chooses), so a pasted-URL user is asked, never silently
overridden. The owner's "selecting an institution and assignment" names the
picker, but the picker is a thin producer of the same URL the pasted path uses.
COST IF WRONG: if the owner wants picker-only, add a boolean to `ensureSession`
and gate step 6 on it; the shape (offer in `ensureSession`) is unchanged, the
leaf is unchanged, one wiring line and one canary change. Low cost.

### F2. The offer affordance - this fork has a MAJOR shape consequence

Options: (a) native `window.confirm`; (b) a custom MUI dialog; (c) an inline
per-field "Use Canvas directions / rubric" button.

The consequence is CONTROL FLOW, not cosmetics. `window.confirm` is synchronous:
`ensureSession` stays a straight-line async function and can collect the choice
inline, exactly as `handleNewSession` already does
(`GradingChatPanel.tsx:235-245`, and the repo-standard "keep confirm on a
destructive action" canary at `GradingChatPanel.structure.test.ts:112-119`). A
custom dialog or inline buttons (b/c) require SPLITTING the submit flow across a
user-interaction boundary: `ensureSession` would have to pause, surface the offer
in React state, and resume on click - a submit-flow state machine, a much larger
shape change, and still unverifiable here (no component renders).

RECOMMENDED READING: (a) `window.confirm`, per differing field (F3). It matches
the existing repo precedent, keeps `ensureSession` straight-line, respects
minimize-clicks (only differing fields are asked about), and - because overriding
replaces the user's typed text - keeps the "no silent data loss" guarantee by
making the user press OK. COST IF WRONG: if the owner wants a richer diff/preview
dialog, layer 1 (the pure leaf) and its tests are UNCHANGED and reused as-is;
only layer 2's presentation and `ensureSession`'s control flow change. The rework
is confined to the panel's interaction wiring - the decision logic survives. This
is why the leaf is the load-bearing artifact and the affordance is swappable.

NOTE: the final affordance is UX/visual's seat (wave 3). The architect pins only
that the DECISION is a pure leaf and the SURFACE sits at the `ensureSession` seam
pre-lock; it recommends `window.confirm` because that choice alone keeps the
control flow straight-line, which IS a shape question.

### F3. Per-field vs combined offer

RECOMMENDED READING: PER-FIELD, offering only fields that actually differ
(`computeOverrideOffer` marks each field offerable independently). In the common
case only one field conflicts (the other is blank and silently filled, or
matches), so the instructor is asked at most about what truly conflicts. The
leaf supports both: a combined single-confirm is just the same accept applied to
both offerable fields. COST IF WRONG: zero shape cost - combined vs per-field is
how the layer-2 affordance reads the leaf's `anyOfferable`/per-field flags;
pick in UX. If both differ, per-field is two sequential confirms (worst case);
combined is one all-or-nothing confirm. Minimize-clicks mildly favours combined
when both differ; independence favours per-field. Recommend per-field and let UX
decide the combined shortcut.

### F4. Persistence of an accepted override

RECOMMENDED READING: write through the EXISTING scoped memory
(`saveChatSetupMemory(scope, resolved)`, already called at `:298`). The accepted
values become the resolved values fed to `saveChatSetupMemory`, so on reload
(fields blank -> `needsFill` -> `resolveSetupFill` fills from memory, 1d) the
chosen text returns. NO NEW `ta-` KEY - the scoped-memory key
(`ta-grading-chat-rubric-memory`) is reused, so the exact-key-set canary
(`grading-chat-storage-keys.structure.test.ts:13-22`) is UNAFFECTED. COST IF
WRONG: if the owner wants the override recorded distinctly from a typed value,
that needs a new persisted shape and WOULD trip the key canary (bump its frozen
list + N in the same commit). Not recommended; the scoped memory already is the
"last chosen setup for this assignment" record.

### F5. Diagnostics representation (required by the 2026-10-11 owner rule)

Moving the fetch out from under `needsFill` (step 4) means `fetch_canvas_meta`
(1g) now fires in the non-blank case too - the new data path is already
observable in the diagnostics. The override DECISION itself (offered /
accepted / declined) has no existing seam.

RECOMMENDED READING: add ONE diagnostic for the override APPLICATION, recorded
only when fields were actually replaced, via the existing
`recordGradingDiagnosticEntry` path, NO STUDENT DATA (outcome success + a bare
count of fields replaced, never the text). The `fetch_canvas_meta` seam does not
tell the diagnostics reader an override was offered or taken; the owner's rule
wants the feature observable. The cheapest shape is a new
`GradingDiagnosticOperation` member (e.g. `override_setup_fields`) in the enum
at `gradingDiagnosticLog.ts:18-35` plus its label in the
`GRADING_DIAGNOSTIC_OPERATION_LABELS` map at `:37-55` - an append-only enum +
label; the override
choice has no failure mode (accept and decline both succeed), so it records
`outcome: "success"` with `classificationStudentCount`-style count reuse or a
new bare count. COST IF WRONG: if the owner/AC judges the already-firing
`fetch_canvas_meta` sufficient, drop the addition and STATE that justification as
a criterion (DEV_LOOP: an absent diagnostic must be stated and justified, and the
override-decision having no failure mode is a legitimate justification). Either
way the AC seat writes the criterion; the architect pins only that any new
operation routes through `recordGradingDiagnosticEntry` and carries no student
data. NOTE: `gradingDiagnosticLog.ts` is shared with the whole grading surface;
the addition is append-only and low-risk, but it is a shared-file edit (section
4).

---

## 4. The load-bearing collision: the `needsFill`-gated-fetch canary

`GradingChatPanel.structure.test.ts:293-302` (W2 AR1c) asserts that
`fetchCanvasMetaAction` lives INSIDE the `if (canvasUrl && scope && needsFill)`
block and that `const loaded =` is the statement after the guard. **Step 4 of
the reshape moves the fetch OUT from under `needsFill`, so AR1c goes RED by
construction.** This is the precise "a test that greps a string it does not own
goes red when a correct change lands" case: AR1c is in the owns set and MUST be
rewritten in the same wave to pin the NEW shape (fetch gated on `canvasUrl &&
scope`, not `needsFill`), or the wave ships red through build and verify (nothing
runs vitest at push - `this-repo.md` section 1).

Two adjacent canaries in the same file must be PRESERVED, not broken:
- AR1 (`:269-278`): an awaited `fetchCanvasMetaAction(` precedes
  `driver.beginSession(`. `window.confirm` is synchronous, so the fetch still
  precedes `beginSession` - stays green.
- AR1b (`:280-291`): `beginSession` is fed `fill.instructions` / `fill.rubric`,
  not stale state. The reshape feeds `beginSession` `resolved.instructions` /
  `resolved.rubric`, where `resolved = applyOverride({ base: fill, ... })` (and
  `resolved === fill` when nothing offerable or all declined). AR1b's regex must
  be updated in the same wave to assert "the applyOverride result, not stale
  state vars". The INVARIANT (begin from the composed-over-fill result, never
  from raw typed or from state) is preserved; its spelling changes from `fill` to
  `resolved`.

`chatSeamDiagnostic.wiring.test.ts:14-23` pins capture -> await -> record
ordering; preserved by step 4 (the block moves intact). Stays green.

`chatSetupFill.test.ts` tests `resolveSetupFill`, which is UNCHANGED. Stays green
(checked-safe, not owned-edited).

---

## 5. File layout, with per-file estimates

| File | Status | Est. after | Note |
|---|---|---|---|
| `src/app/components/grading-chat/chatOverrideOffer.ts` | NEW | ~55-70 | pure leaf, mirrors `chatSetupFill.ts` (55 lines) |
| `src/app/components/grading-chat/chatOverrideOffer.test.ts` | NEW | ~120-180 | the oracle (test seat owns axes) |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | EDIT | ~600-615 | from 565; reshape `ensureSession`, add offer+apply+confirm+note |
| `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` | EDIT | ~700 | rewrite AR1c, adjust AR1b if renamed, add override-wiring canaries |
| `src/app/components/grading/gradingDiagnosticLog.ts` | EDIT (F5, if adopted) | ~183 | from 181; +1 enum member + 1 label (2 lines); shared file |

No file approaches 1000. `grading.ts` (984) is NOT touched. The panel's growth
(~40-50 lines) is well clear of the ceiling; the test author/implementer
re-measures with `@(Get-Content).Count` before and after (not from this
estimate), and the wave gate carries `src/file-size-ceiling.structure.test.ts`
unconditionally.

The new export `computeOverrideOffer`/`applyOverride` is CALLED by
`GradingChatPanel.tsx` in the same wave - no dead code, no type-only exception
needed.

---

## 6. Waves

ONE wave. Dependency shape:

- `chatOverrideOffer.ts` (leaf, no imports from the panel) ->
- `GradingChatPanel.tsx` (imports and calls the leaf; reshapes `ensureSession`) +
  `GradingChatPanel.structure.test.ts` (rewrites AR1c, adds wiring canaries) +
  `gradingDiagnosticLog.ts` (F5, if adopted).

The leaf and its caller land together (the caller-inclusion rule). The test
author's `chatOverrideOffer.test.ts` is written from the oracle AFTER build and
verify, per the standing loop order; the structure-test edits land WITH the
panel edit because they are source-text canaries the wave gate runs.

### Collision and serialization (not a parallel-disjointness pass; stated for loop-plan)

- ADVISORY (M4), measured against the current working tree (`git status
  --short` 2026-10-11): `GradingChatPanel.tsx` is CLEAN - it is NOT in
  VIDEO-GRADING-CHAT-INTAKE's write set (that wave shows `grading-chat-intake.ts`
  / extraction / grading paths modified, not the panel), so there is NO live
  collision on the panel. The ONLY live shared-file collision is
  `gradingDiagnosticLog.ts` (it IS modified in the working tree), and it exists
  ONLY IF F5 is adopted (F5's enum+label edit is the sole reason this wave would
  touch that file). WITHOUT F5, this wave's write set does not include
  `gradingDiagnosticLog.ts` and the collision vanishes entirely. loop-plan: if
  F5 is adopted, serialize this wave's `gradingDiagnosticLog.ts` edit against the
  video wave's (intersect exact write sets, `sort | uniq -d`); if F5 is dropped,
  no serialization against the video wave is needed for this item.
- Any BUILD serializes on the shared `npx tsc --noEmit` (one caller, races on
  `tsconfig.tsbuildinfo`) and the full test run regardless.
- `grading.ts` at 984/1000 is NOT in this wave's write set; keep it out.

---

## 7. Instruments

vitest is node-env; NO component renders (`this-repo.md` section 6). So:

### 7a. Pure tests over the decision leaf (`chatOverrideOffer.test.ts`)

Pass condition shape - each names the object under comparison, the instrument,
and the direction of failure:

- OFFERABLE computation. Object: `computeOverrideOffer({ typed, canvasMeta })`
  over a product of axes {instructions: blank / non-blank-matching /
  non-blank-differing} x {rubric: same three} x {canvasMeta: null / present}.
  Instrument: direct assertion on `.instructions.offerable`,
  `.rubric.offerable`, `.anyOfferable`, `.canvasValue`. FAILS when a field is
  marked offerable while blank, or while matching Canvas, or while Canvas is
  null; and when a non-blank differing field is NOT marked offerable. The axes
  must come from a DIFFERENT source than the generator (test-seat rule) - do not
  hardcode the same tuples in both the generator and the expected table.
- APPLY. Object: `applyOverride({ base, offer, decision })` where `base` is a
  `resolveSetupFillResult` (NOT raw typed). FAILS when a declined field's value
  or source is changed away from `base`; when a non-offerable field's value or
  source is changed even if its decision is true; when an accepted offerable
  field is NOT replaced with `canvasValue`; or when an accepted offerable field's
  source is not marked "canvas" (the M1 per-field source, which the note reads).
  Pin two mixed cases: (i) instructions accepted + rubric declined, where `base`
  has typed values for both, yields {canvas instructions source "canvas", typed
  rubric source "typed"}; (ii) instructions blank-filled-from-Canvas (base
  instructions = Canvas, source "canvas") + rubric accepted, yields {Canvas
  instructions still present source "canvas", Canvas rubric source "canvas"} -
  i.e. the blank-filled field is NEVER reverted by the apply.
- BLANK-FILL NON-REGRESSION (the round-1 blocker as an executable assertion).
  Object: the exact composition the panel uses - `fill = resolveSetupFill(...)`
  then `resolved = applyOverride({ base: fill, offer, decision })`. FAILS if a
  blank field's silent fill is suppressed OR REVERTED by the override path (e.g.
  `resolved.instructions` comes back "" when `fill.instructions` was a Canvas
  value and the rubric override was accepted), or if a non-blank field is
  silently filled without an accept. This is the no-silent-data-loss guarantee,
  and it is the specific assertion that would have caught the round-1 base-on-raw-
  typed defect. The oracle MUST include the mixed case (instructions blank,
  rubric non-blank-differing, rubric accepted) asserting `resolved.instructions`
  equals the Canvas value, not "".

Removal-test note: the owner's value here (F0) is live-integration/click-cost,
which is partly an attention/clicks advantage - and `leverage.md` records that
such advantages have NO buildable removal test here (no render). The buildable
piece is the GUARANTEED-flavoured half: applyOverride never replaces a field
absent an explicit accept. The test author decides whether that qualifies as the
removal test or records a residual with an owner and a step (see Residual R3).

### 7b. Source-text reachability pins (`GradingChatPanel.structure.test.ts`)

Pins the layer-3 wiring the live walk cannot (reading claims, stated as such):

- The fetch is gated on `canvasUrl && scope` (NOT `needsFill`) - the rewritten
  AR1c. FAILS if a future edit re-adds `needsFill` to the fetch gate (which would
  silently restore the discard-on-non-blank bug).
- `ensureSession` imports and calls `computeOverrideOffer`/`applyOverride` with
  `applyOverride({ base: fill, ... })` (composed over the `resolveSetupFill`
  result, not over raw typed), and the apply result `resolved` (not raw typed,
  not the stale state) feeds `beginSession` (preserve/adjust AR1b).
- The `setupNote` reads `resolved.instructionsSource` / `resolved.rubricSource`
  (M1) so an accepted override is reported "from Canvas"; FAILS if the note is
  wired to `fill`'s sources instead of the resolved sources.
- The override path is reached only inside the `canvasUrl` branch (never from
  text/file/composite submit) - reachability bound to the owner's scope (F1
  URL-wide).
- `saveChatSetupMemory(scope, <resolved>)` persists the resolved values (F4).
- `window.confirm(` precedes the state write when an override is applied (F2),
  mirroring the `handleNewSession` confirm canary - the no-silent-data-loss
  source pin.
- If F5 adopted: the override diagnostic routes through
  `recordGradingDiagnosticEntry` and passes no student text.

THE LIVE WALK IS OWNER-ONLY: that the confirm dialog actually appears on a
From-LMS submit with non-blank fields, that OK replaces the on-screen text and
Cancel does not, and that the replaced text survives reload. No test here renders
the dialog or the fields (Residual R1).

---

## 8. Owns file list

Derived command (Git Bash), then its output pasted:

```
grep -rln "fetchCanvasMetaAction\|resolveSetupFill\|chatOverrideOffer\|needsFill" \
  src/app/components/grading-chat --include=*.ts --include=*.tsx
```

Current matches under the feature directory (chatOverrideOffer.* will be new):

```
src/app/components/grading-chat/GradingChatPanel.tsx
src/app/components/grading-chat/chatSetupFill.ts
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/chatSetupFill.test.ts
```

Classified:

| File | Class | Why |
|---|---|---|
| `GradingChatPanel.tsx` | OWNED (edit) | the reshape |
| `chatOverrideOffer.ts` | OWNED (new) | the leaf |
| `chatOverrideOffer.test.ts` | OWNED (new) | the oracle |
| `GradingChatPanel.structure.test.ts` | OWNED (edit) | AR1c goes red; rewrite + add canaries |
| `chatSeamDiagnostic.wiring.test.ts` | ADOPTED (reads panel source) | ordering pin preserved by step 4; verify stays green |
| `gradingDiagnosticLog.ts` + `gradingDiagnosticLog` tests | OWNED (edit) IF F5 adopted | shared file; append-only |
| `chatSetupFill.ts` / `chatSetupFill.test.ts` | CHECKED-SAFE | `resolveSetupFill` unchanged; stays green |
| `grading-chat-storage-keys.structure.test.ts` | CHECKED-SAFE | no new `ta-` key (F4); unaffected |
| `lmsPicker.*.test.ts`, `useLmsSubmissionPicker.ts`, `ChatComposer.tsx` | CHECKED-SAFE | the picker already resolves to a URL and calls `onSubmitUrl` unchanged (1c); no edit needed |

The wave gate must run, by `npm run test:paths` (two or more paths, never a raw
multi-path vitest):

```
npm run test:paths src/app/components/grading-chat/chatOverrideOffer.test.ts \
  src/app/components/grading-chat/GradingChatPanel.structure.test.ts \
  src/app/components/grading-chat/chatSeamDiagnostic.wiring.test.ts \
  src/app/components/grading-chat/chatSetupFill.test.ts \
  src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts \
  src/file-size-ceiling.structure.test.ts
```

plus `gradingDiagnosticLog`'s own test path if F5 is adopted.

---

## 9. Residual register

Each names an owner, an instrument, and the measuring step. Any residual that
survives must be recorded in `docs/BACKLOG.md` or it does not exist.

- R1. LIVE WALK of layer 2. Owner: repo owner. Instrument: manual - submit a
  From-LMS assignment (and a pasted Canvas URL) with non-blank, differing
  directions + rubric; confirm the offer appears, OK replaces the on-screen
  text, Cancel keeps it, and the chosen text survives reload. Step: post-build
  owner walk. No test here renders it (`this-repo.md` section 6).
- R2. The affordance form (F2) and per-field vs combined (F3) are UX/visual's
  seat (wave 3), against the as-built diff. Owner: loop-architect follow-up / UX
  seat. Instrument: UX review. Step: follow-up design pass.
- R3. Removal test for the leverage claim (F0). Owner: loop-test-author.
  Instrument: either the applyOverride "no replace without accept" assertion, or
  a recorded residual if the advantage is judged clicks/attention only
  (unbuildable here per `leverage.md`). Step: test-notes authoring.
- R4. F5 diagnostic decision (add `override_setup_fields` vs justify none). Owner:
  loop-ac + owner. Instrument: the diagnostic-wiring source pin if added, or a
  stated-and-justified absence criterion if not. Step: AC authoring.
- R5. F0 leverage disposition (redesign / accept-cost / reject). Owner: owner via
  loop-ac. Instrument: the leverage criterion + its removal test. Step: AC
  authoring. This is a product fork; the architect does not default it.

---

## 10. What cannot be verified in this environment

- No component renders under vitest, so the dialog, the field replacement, and
  the reload-survival are READING CLAIMS here; R1 is the owner walk.
- No live Canvas: `fetchCanvasMetaAction` is exercised only through mocks
  (mock `canvasFetch`, not `fetch` - `this-repo.md` section 2). Real Canvas
  description/rubric content is unverifiable here.
- No `.env`, no network: the "live connection" gating (configured institution ->
  successful meta fetch -> offer appears) is reading-claim + owner walk.

---

## 11. Quantities

| Quantity | Value | Command |
|---|---|---|
| `grading.ts` lines | 984 | `@(Get-Content src/app/actions/grading.ts).Count` |
| `GradingChatPanel.tsx` lines | 565 | `@(Get-Content src/app/components/grading-chat/GradingChatPanel.tsx).Count` |
| `ChatComposer.tsx` lines | 519 | `@(Get-Content src/app/components/grading-chat/ChatComposer.tsx).Count` |
| `chatSetupFill.ts` lines | 55 | `wc -l < src/app/components/grading-chat/chatSetupFill.ts` |
| `gradingDiagnosticLog.ts` lines | 181 | `@(Get-Content src/app/components/grading/gradingDiagnosticLog.ts).Count` |
| file-size ceiling | 1000 | `src/file-size-ceiling.structure.test.ts:41` (LIMIT = 1000) |
| grading-chat frozen `ta-` key count | 8 | `grading-chat-storage-keys.structure.test.ts:13-22` (EXPECTED array) |
| LMS intake shipped | 40887f9d | `git show --stat --oneline 40887f9d` |

Note: `wc -l` and `@(Get-Content).Count` can disagree on this tree (by 15-138
across files, `this-repo.md` section 3); the mandated measure is
`@(Get-Content).Count`. The `chatSetupFill.ts` figure above used `wc -l` (55) and
is a size reference only, not a ceiling check; re-measure with
`@(Get-Content).Count` if it is used as a gate quantity.
