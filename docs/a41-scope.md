# A41 scope + acceptance criteria

Round 1. Author: loop-seat (this document). Checked by a fresh `loop-checker`
before any consumer acts on it. No production code or test code in this
document; nothing outside `docs/` is touched.

## 0. Kind and leverage

`kind: 'bug'` (`docs/backlog.yml:705`). Per `docs/DEV_LOOP.md`'s "The loop /
Criteria" and `docs/loop/seats.md`'s Acceptance-criteria brief, a bug fix
carries no leverage claim. Recorded as the fired trigger; none is made below.

## 1. THE HEADLINE FINDING: A41's own title describes behaviour that no longer reproduces

This is not the finding the row asked me to establish (a fallback design) -
it is a finding that changes what the row needs. Per `docs/loop/traps-spec.md`:
*"A design doc's 'the feature already exists' claim reframes the work and
must be acted on in the same turn."* Here the mirror case applies: the row's
**own filed defect** no longer exists on the code paths it names, and the
scope must say so rather than spec a fix for it.

### 1.1 What A41 claimed (as filed 2026-09-23, `docs/backlog.yml:703-714`)

A flat zip with two non-conforming filenames sharing a leading alphanumeric
run (its own corrected example: `"Homework Final.docx"` / `"Homework
Draft.docx"`, both keying to `"homework"`) would be silently merged into one
graded row by `leafStemFallback` (`utils.ts`) with no error and no visible
signal, at the real production call site `groupSubmissionsByStudent`
(`extraction.ts:138` in the row's own citation).

### 1.2 What is true in the tree today (opened, not recalled)

Since A41 was filed, **A44** (`docs/backlog.yml:739-750`, `state: 'verification'`,
its own note recording wave 1 at `580e505` and wave 2 at `e53979c`) landed a
collision-refusal mechanism that sits in front of exactly the function A41
named. I opened every file below directly; none of this is inherited from
A44's or A45's backlog prose.

- **`src/lib/grade/collisionRefusal.ts`** (new since A41 was filed) exports
  `decideCollisionRefusal` (`:38-90`) and `describeCollisionRefusal`
  (`:141-152`). `decideCollisionRefusal` iterates every submission path,
  keeps only files where `parsed.reachedStemFallback` is true (`:48`, i.e.
  steps 5/6 of `parseSubmissionFileName` - the exact fallback A41 names),
  groups them by `parsed.studentKey` (`:59-64`), and for any group of 2+
  colliding paths (`:73`) returns a refusal **unless** the group's files
  share one non-empty folder AND the run has 2+ other distinct
  container-relative folders elsewhere (`:76-80`, the "amnesty" A44/A45
  argue about). A41's own scenario - a flat zip, no folders anywhere -
  never has a folder to be homogeneous about, so `hasFolder` is `false`
  (`:76`) and the amnesty branch is never reached; the function falls
  straight to a refusal (`:82-86`, status `"no-folder-signal"` when
  `distinctFolders.size === 0`, `:86` vs `:84`).
- **`src/lib/grade/extraction.ts:167-170`** (`extractStudentEntries`, the
  Embedded Deterministic Engine's own ingestion path, called from
  `src/app/actions/grading.ts:860` for a zip upload and from
  `src/app/actions/grading-chat-intake.ts:159` and
  `src/app/actions/grading-incremental.ts:133`): calls
  `describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents)`
  and `throw`s the message before `groupSubmissionsByStudent` (`:174`) ever
  runs, and strictly before the filename-inference model call (comment at
  `:159-166` states the ordering deliberately).
- **`src/lib/grade/engine.ts:384-387`** (`gradeSubmissions`, the default
  Gemini zip branch, called from `src/app/actions/grading.ts:943`): the same
  two-call check, same throw-before-model-call ordering (comment at
  `:380-383`).
- **`src/app/actions/grading.ts:929-936`** (RES-FILL-5, inside `gradeAction`'s
  own Gemini branch, hoisted **ahead of** rubric resolution so a
  collision-refused run never pays for `generateRubric` either - comment at
  `:918-928` names this explicitly as a duplicate of the check
  `gradeSubmissions` itself also runs at `:384-387`, kept because it needs to
  fire earlier in this caller).

**This is proven by execution, not by reading.** I ran the real suite (not
simulated):

```
npm run test:paths -- src/lib/grade/collisionRefusal.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/lib/grade/utils.test.ts
```

Result, this run, exit 0: `Test Files 3 passed (3)`, `Tests 71 passed (71)`.
Two assertions in `collisionRefusal.wiring.test.ts` exercise **A41's own
corrected example verbatim**, through the real production functions with a
real `JSZip` archive (no mocking of extraction):

- `:64-73`, `"refuses a genuine flat collision with no folder signal"` - a
  zip of exactly `Homework Final.txt` / `Homework Draft.txt` (A41's own
  worked example, `.txt` in place of `.docx`, immaterial to the parser) run
  through `extractStudentEntries`, asserting it `rejects.toThrow(/Refused: 2
  files resolve to the same student name "Homework"/)`.
- `:83-94`, the identical fixture run through `gradeSubmissions`, asserting
  the same throw **and** `expect(mockCallLlm).not.toHaveBeenCalled()` - so
  the "no error, no visible signal" half of A41's claim and the "spends a
  model call on it" concern are both measured false on this path today.

**The signal also reaches the instructor, on both surfaces A41 named as
needing both to be fixed** (its own note: *"this defect is shared by path A
(Upload ZIP) and path H (cartridge drop)... a remedy scoped to only one UI
surface leaves the other exposed"*):

- Path A: `gradeAction`'s whole body is one `try`/`catch`
  (`src/app/actions/grading.ts:957-959`); a thrown collision message becomes
  `{ run: null, error: message }`, and `src/app/components/GradingTab.tsx:311,313`
  renders `state.error` in the results panel.
- Path H: `src/lib/workflows/registry/steps.grading-cartridge.ts:108-117`
  calls `gradeAction` directly; when `!gradeResult.run` it pushes
  `` `${drop.name}: ${errorMsg}` `` into the step's own report `lines` and
  calls `finishCartridgeDropAction(drop.id, { status: "error", error: errorMsg })`
  (`:112-115`) - the same disclosure mechanism A40's cartridge-drop work
  already wires the instructor into, not a silent skip.

**Conclusion of 1.2:** the defect A41 was filed to fix - a flat-zip
`leafStemFallback` collision silently blending distinct students with no
error and no visible signal - does not reproduce today on either of the two
in-repo zip-ingestion call sites A41's own instrument named, or on the
cartridge-drop surface its own note added. This is a **finding to act on**,
not a reason to leave the row as filed: section 3 below is what remains.

### 1.3 A41's own citations are stale - corrected, not merely noted

A41's `instrument` field (`docs/backlog.yml:711`) quotes
`GradingTab.tsx:240`, `"Upload a zip archive that contains the student
submissions."` Neither the line nor the string exists today:

- `GradingTab.tsx:240` today is an unrelated `useEffect` (the auto-scroll
  fix for the incremental grading route, matching commit `a914695a` visible
  in this session's own git log - `git log` shows `a914695a
  fix(res-fill-13): auto-scroll the incremental grading route to its
  results`).
- The nearest upload-requirement copy today is `GradingTab.tsx:373`:
  `"Upload a zip archive of student submissions, or a single student's file
  (a document, text file, or image) to grade it on its own."` - added by the
  intervening A39 wave 1 single-file-entry feature. It still names no
  naming convention, so the **substance** of A41's citation survives; the
  **line number and exact string** do not, and any AC that quotes them
  verbatim would fail from day one on a stale citation, not on a real defect.

This is the same class `docs/loop/traps-spec.md` names for numeric drift -
here it is a line-citation drifting under intervening commits - and it is
why every citation in this document was opened fresh rather than copied
from A41's own text.

## 2. Overlap check against A44 and A45 (required by the brief)

| Row | State | What it owns | Overlap with A41 |
|---|---|---|---|
| A44 (`docs/backlog.yml:739-750`) | `verification`, both waves shipped (`580e505`, `e53979c` per its own note) | Per-student **folders** as an identity signal (RULE K/D fold in `utils.ts:189-239`), plus - widened by its own RULING 85/87 - the **collision-refusal mechanism** itself (`collisionRefusal.ts`) | **Already discharged A41's filed remedy.** A44's refusal is not folder-specific in its *no-folder* branch - `decideCollisionRefusal`'s `"no-folder-signal"` status (`collisionRefusal.ts:86`) is exactly the flat-zip case A41 named. A44's own row never states "this also closes A41"; nobody reconciled the two rows against each other, which is why A41 still reads `unscoped` today. |
| A45 (`docs/backlog.yml:751-761`) | `unscoped` | The **amnesty branch's** soundness hole: a mixed per-student-folder-plus-shared-folder shape lets a real cross-student blend through as folder-homogeneous (measured, per A44's carried-forward figures reproduced by my own test run above, `2254 of 19936` and `287 of 19990` "unsound-and-allowed", `collisionRefusal.test.ts` frozen pins) | **Disjoint from A41 by construction.** A45's hole requires `hasFolder === true` (`collisionRefusal.ts:76`) - a colliding group that *does* share a folder, in a run that *also* has 2+ distinct folders elsewhere. A41's own scenario has no folder at all (`hasFolder === false`), so it never enters the amnesty branch A45 is about. Fixing A45 cannot regress or duplicate A41's remaining scope (section 3), and A41's remaining scope cannot pre-empt A45's. |

**The boundary, stated affirmatively so a later reader does not have to
re-derive it:** A41 owns the *no-folder* refusal path (`"no-folder-signal"`
and `"flat-collision-in-foldered-run"` statuses); A45 owns the *amnesty*
branch's soundness. Both already exist as code; A44 built both; A41's
remaining scope (section 3) is neither of these two branches - it is the one
call site that reaches neither.

## 3. What A41 actually still owns

### 3.1 The one zip-consuming path with no collision check at all

`src/app/actions/grading.ts:672-707`, `gradeZipViaEngine` - the
**Deterministic Grading API** path, selected when `provider === "other"`
(`grading.ts:852-855` for a direct zip upload; the same `gradeAction`
function, so also reachable from the cartridge-drop workflow step, see
below). It builds `zipBase64` from the raw upload
(`grading.ts:853`) and hands it directly to `gradeViaGradingEngine`
(`:695-699`) - an **external HTTP service**. It never calls
`extractSubmissions`, `groupSubmissionsByStudent`, or
`decideCollisionRefusal`. Confirmed by reading `gradeZipViaEngine`'s full
body (`:672-707`): no import, no call, to any of the three.

**Both surfaces A41 was told to cover can reach this branch:**
- Path A: `GradingTab.tsx` offers `"other"` as a selectable provider
  (`selectedProvider === "other"` branches at `:138`, `:174`, `:465`), which
  `gradeAction` routes to `gradeZipViaEngine` at `grading.ts:852-855`.
- Path H: `steps.grading-cartridge.ts:99` forwards
  `formData.append("provider", helpers.provider)` where `helpers.provider`
  is typed `LlmProvider` (`src/lib/workflows/registry-helpers.ts:38`), and
  `LlmProvider = "gemini" | "other" | "embedded"` (`src/lib/llm.ts:22`) - so
  a workflow whose configured provider is `"other"` reaches the same
  uncovered branch through the identical `gradeAction` entry point
  (`steps.grading-cartridge.ts:108`).

**Whether this branch actually has A41's defect cannot be determined from
this repo.** The identity parsing, if any, happens inside the external
Deterministic Grading API - a service this checkout cannot reach
(`vitest.setup.ts` throws on any real fetch; `docs/loop/this-repo.md`
section 6: no live network, no external service). This is not a gap this
scope can close by writing more code here; it is a fact only the owner (or a
live run against that service) can establish. Recorded as RESIDUAL R1 below.

### 3.2 The row's own record is now misleading and should be corrected

A41's `title` and `note` (`docs/backlog.yml:707,713`) both assert the defect
is live today, unqualified. Left as-is, the next reader (agent or human) will
re-derive everything in section 1 from scratch, or worse, re-implement a
refusal that already exists and ships a second, competing mechanism next to
`collisionRefusal.ts`. This is not mine to decide how to word - closing or
rewriting a backlog row is the orchestrator's reconciliation step
(`docs/DEV_LOOP.md`'s "Record disposals as they happen") - but the fact that
it needs correcting is established here, with the evidence, rather than left
for someone else to re-discover.

## 4. Acceptance criteria

Objects, instruments and directions are stated per
`docs/loop/iteration-caps.md`'s Entry gate 2 and `docs/loop/traps-spec.md`'s
"every pass condition names three things."

**AC-1 (regression-protective, not new-build).** Object: the refusal
behaviour on the two in-repo call sites (`extraction.ts:167-170`,
`engine.ts:384-387`) and the `gradeAction` hoisted check
(`grading.ts:929-936`), for a flat, folderless collision. Instrument: the
already-landed `src/lib/grade/collisionRefusal.wiring.test.ts:64-73,83-94`
and `src/lib/grade/collisionRefusal.test.ts`, run via
`npm run test:paths -- src/lib/grade/collisionRefusal.test.ts src/lib/grade/collisionRefusal.wiring.test.ts src/lib/grade/utils.test.ts`.
Direction of failure: RED if any of these 71 tests (measured this session,
exit 0) stops passing, or if a future change to `utils.ts`/`extraction.ts`/
`engine.ts`/`grading.ts` narrows the refusal so A41's own worked example
(`Homework Final` / `Homework Draft`, no folder) no longer throws. No new
test is proposed here - the instrument already exists and already executes;
an implementer chunk closing this row owes only a fresh execution of it
against whatever it changes, not a rewrite.

**AC-2 (the residual's own instrument, not this row's to satisfy now).**
Object: whether `gradeZipViaEngine`'s external Deterministic Grading API
(`grading.ts:672-707`) exhibits the same silent-blend defect on a
`provider === "other"` run. Instrument: **owner-only** - a live upload of a
flat, folderless, colliding-filename zip through the running app with
`provider = "other"` selected, reading the external service's actual
response. This environment cannot execute it (no network, no live key,
docs/loop/this-repo.md section 6). Direction of failure: if the returned
run shows a graded-student count lower than the uploaded file count with no
accompanying error, the external service reproduces A41's original defect
under its own logic; if it errors or returns one row per distinct file, it
does not. Recorded as RESIDUAL R1, not gated here.

**AC-3 (UI surfacing - reading claim, not executed).** Object: whether the
refusal's `error` string is legible and visually distinct from an ordinary
run's success state, on both `GradingTab.tsx` (path A) and wherever the
cartridge-drop's persisted `status: "error"` is displayed to the instructor
(path H). Instrument: **none in this repo** - no component is rendered by
any test here (`docs/loop/this-repo.md` section 6; `docs/loop/seats.md`'s
Accessibility brief states the same ceiling for any markup claim). This is a
reading claim at best: I traced that `state.error` is rendered
(`GradingTab.tsx:311,313`) and that `finishCartridgeDropAction`'s `error`
field is written (`steps.grading-cartridge.ts:112-115`), but not that either
renders legibly, is discoverable, or is styled as an error rather than
ordinary text. Recorded as RESIDUAL R2, owner-only.

**AC-4 (row hygiene - orchestrator's, not this seat's).** Object: A41's own
`title`/`note` fields in `docs/backlog.yml`. Instrument: a reconciliation
pass comparing the row's text against sections 1-3 of this document.
Direction: the row must not continue to assert the defect is live and
unaddressed once a checker confirms section 1's findings. This AC belongs to
the orchestrator's backlog-reconciliation step, not to an implementer chunk;
listed here so it is not lost the way A12/A13's promised residuals were once
lost (`docs/backlog.yml:329`, the "grep... returned 0 before this note was
written" instance the seats brief already warns against).

## 5. Disposition table (A41's prior stated scope, restructured here)

Per `docs/loop/iteration-caps.md` Entry gate 3 and the `loop-seat` brief's
"restructured a prior version" requirement - A41's filed `note` amounted to
a design-space memo (three unchosen remedies) plus an instrument. Every
piece of it is accounted for below; nothing is silently dropped.

| Prior element (A41 as filed, `docs/backlog.yml:713`) | Disposition |
|---|---|
| Remedy (1) "REFUSE the zip outright when a meaningful fraction of entries fail the naming convention" | **KEPT, and already built** - `collisionRefusal.ts`'s `"no-folder-signal"`/`"flat-collision-in-foldered-run"` statuses are exactly this remedy, shipped under A44. Not a per-row-fraction refusal as originally floated; it refuses per **colliding group**, which is stricter and cheaper to reason about. See section 1.2. |
| Remedy (2) "DISCLOSE the parse result before grading" | **WITHDRAWN as A41's own mechanism** - superseded by (1) actually shipping; a disclose-then-proceed UI was never built and is no longer the live gap. No enforcer existed for it, so nothing is lost by not building it now. |
| Remedy (3) "SUPPORT the simple convention outright" | **WITHDRAWN, same reasoning** - the refusal makes this unnecessary for the common shape; a bare-filename zip with one file per student never collides (`collisionRefusal.wiring.test.ts:75-79`, "does not refuse a run with no risk of collision at all"). |
| "This defect is shared by path A and path H... a remedy scoped to only one UI surface leaves the other exposed" | **KEPT AND VERIFIED** - both are covered for the two in-repo call sites (section 1.2); both share the ONE remaining gap (section 3.1, `provider === "other"`) via the same `gradeAction` entry point. |
| The row's own instrument (a unit test over `groupSubmissionsByStudent`/`parseSubmissionFileName` for 3 colliding files) | **HANDED OVER, already discharged by a stronger instrument** - `collisionRefusal.wiring.test.ts` tests the real production call sites end-to-end (real `JSZip`, real throw), which is strictly more than the row's own proposed unit test over the bare parsing functions. Receiver: none needed; this is not a residual, it is closed. |
| "NOT IN SCOPE: the A14 rulings' own known-open item (sanitized-name collision inside the CONVENTION-MATCHING path, `utils.ts:76-85`)" | **KEPT unchanged** - still out of scope for A41, still open under A14's own name; this document does not re-litigate it. |
| "STEP: the first A39-family implementation chunk that touches ingestion" | **OVERTAKEN BY EVENTS** - A44's implementation chunks (`580e505`, `e53979c`) touched ingestion first and carried the fix with them, ahead of any A39-family chunk. No action needed; noted so a reader does not go looking for an A39 chunk that was never the one that actually shipped this. |

## 6. Residual register

| ID | What is not proven now | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | Whether the external Deterministic Grading API (`gradeZipViaEngine`, `grading.ts:672-707`, `provider === "other"`) reproduces A41's silent-blend defect under its own server-side parsing | Repo owner | One live upload through the running app with `provider` set to `"other"` and a flat, folderless, colliding-filename zip (A41's own worked example), reading the returned run's student count and any error field | Before this row is treated as closed; if the owner confirms the external service also silently blends, a new row is filed against `gradeZipViaEngine` specifically, since no fix inside `utils.ts`/`extraction.ts`/`engine.ts` can reach code that runs on another service |
| R2 | Whether the refusal's `error` string actually renders legibly and is visually distinguishable from a success state, on `GradingTab.tsx` (path A) and on whatever surface displays a cartridge drop's persisted `status: "error"` (path H) | Repo owner, in a real browser | Trigger a refusal on each surface (upload a colliding flat zip on path A; run a cartridge-drop workflow configured with a colliding flat zip on path H) and read the rendered result | The owner verification pass; no component renders under this repo's vitest (`docs/loop/this-repo.md` section 6), so no agent-run instrument can close this |
| R3 | Whether A41's `title`/`note` in `docs/backlog.yml` get corrected to reflect section 1's findings, or the row is closed outright | Orchestrator (backlog reconciliation is explicitly its step, not a seat's, per `docs/DEV_LOOP.md`) | A reconciliation pass comparing the current row text against this document | At this row's next disposition/push, so the row does not continue asserting a live defect that a checker has now confirmed does not reproduce |

## 7. What I could not determine

- Whether `gradeViaGradingEngine`'s external service has any collision
  handling of its own - out of reach entirely (no network in this
  environment; see R1).
- Whether the refusal copy is legible/styled correctly on either surface -
  no component renders under this repo's tests (see R2).
- Why A44's own row never cross-referenced A41 when its wave 2 shipped a
  mechanism that discharges A41's filed remedy - I did not find a citation
  either way in `docs/backlog.yml:739-750`'s text, and I am not asserting a
  cause, only that the cross-reference is missing.
